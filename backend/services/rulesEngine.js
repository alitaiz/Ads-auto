// backend/services/rulesEngine.js
import cron from 'node-cron';
import pool from '../db.js';
import { amazonAdsApiRequest } from '../helpers/amazon-api.js';

// Global variable to hold our scheduled tasks
let scheduledTasks = {};

// --- Logging Helper ---
const logAction = async (rule, status, summary, details = {}) => {
  try {
    await pool.query(
      `INSERT INTO automation_logs (rule_id, status, summary, details) VALUES ($1, $2, $3, $4)`,
      [rule.id, status, summary, details]
    );
  } catch (e) {
    console.error(`[RulesEngine] FATAL: Could not write to automation_logs table for rule ${rule.id}.`, e);
  }
};

// --- Data Fetching ---
const getPerformanceData = async (rule) => {
    // This function fetches data based on the maximum lookback period required by any condition in the rule.
    const allTimeWindows = rule.config.conditionGroups.flatMap(g => g.conditions.map(c => c.timeWindow));
    const maxLookbackDays = Math.max(...allTimeWindows, 1);
    
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - maxLookbackDays);
    const splitDate = new Date();
    splitDate.setDate(today.getDate() - 3);

    const startDateStr = startDate.toISOString().split('T')[0];
    const splitDateStr = splitDate.toISOString().split('T')[0];

    const entityIdColumn = 'keyword_id'; 
    const groupByColumns = 'keyword_id, keyword_text, customer_search_term, match_type';

    const query = `
        WITH combined_data AS (
            SELECT
                campaign_id, ad_group_id, keyword_id, keyword_text, customer_search_term, match_type,
                COALESCE(SUM(spend), SUM(cost), 0)::numeric AS spend,
                COALESCE(SUM(sales_7d), 0)::numeric AS sales,
                COALESCE(SUM(clicks), 0)::bigint AS clicks,
                COALESCE(SUM(purchases_7d), 0)::bigint AS orders
            FROM sponsored_products_search_term_report
            WHERE report_date >= $1 AND report_date < $2 AND keyword_id IS NOT NULL
            GROUP BY 1, 2, 3, 4, 5, 6

            UNION ALL

            SELECT
                (event_data->>'campaignId')::bigint, (event_data->>'adGroupId')::bigint,
                (event_data->>'keywordId')::bigint, (event_data->>'keywordText'),
                (event_data->>'searchTerm'), (event_data->>'matchType'),
                SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'cost')::numeric ELSE 0 END),
                SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'attributedSales1d')::numeric ELSE 0 END),
                SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'clicks')::bigint ELSE 0 END),
                SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'conversions')::bigint ELSE 0 END)
            FROM raw_stream_events
            WHERE (event_data->>'timeWindowStart')::timestamptz >= $2 AND (event_data->>'keywordId') IS NOT NULL
            GROUP BY 1, 2, 3, 4, 5, 6
        )
        SELECT
            campaign_id, ad_group_id, ${groupByColumns},
            SUM(spend) AS total_spend, SUM(sales) AS total_sales,
            SUM(clicks) AS total_clicks, SUM(orders) AS total_orders
        FROM combined_data
        GROUP BY campaign_id, ad_group_id, ${groupByColumns};
    `;
    
    const { rows } = await pool.query(query, [startDateStr, splitDateStr]);
    
    const performanceMap = new Map();
    const entityKey = rule.rule_type === 'SEARCH_TERM_AUTOMATION' ? 'customer_search_term' : 'keyword_id';

    for (const row of rows) {
        const key = row[entityKey]?.toString();
        if (!key) continue;

        if (!performanceMap.has(key)) {
            performanceMap.set(key, {
                campaignId: row.campaign_id,
                adGroupId: row.ad_group_id,
                keywordId: row.keyword_id,
                keywordText: row.keyword_text,
                matchType: row.match_type,
                metrics: { spend: 0, sales: 0, clicks: 0, orders: 0 }
            });
        }
        const entry = performanceMap.get(key);
        entry.metrics.spend += parseFloat(row.total_spend || 0);
        entry.metrics.sales += parseFloat(row.total_sales || 0);
        entry.metrics.clicks += parseInt(row.total_clicks || 0, 10);
        entry.metrics.orders += parseInt(row.total_orders || 0, 10);
        entry.metrics.acos = entry.metrics.sales > 0 ? entry.metrics.spend / entry.metrics.sales : 0;
    }
    return performanceMap;
};


// --- Rule Evaluation Logic ---
const checkCondition = (metricValue, operator, conditionValue) => {
    switch (operator) {
        case '>': return metricValue > conditionValue;
        case '<': return metricValue < conditionValue;
        case '=': return metricValue === conditionValue;
        default: return false;
    }
};

const evaluateBidAdjustmentRule = async (rule, performanceData) => {
    const keywordsToEvaluate = [];
    const targetsToEvaluate = [];
    performanceData.forEach((data, id) => {
        if (['BROAD', 'PHRASE', 'EXACT'].includes(data.matchType)) keywordsToEvaluate.push({ id, data });
        else if (['TARGETING_EXPRESSION', 'TARGETING_EXPRESSION_PREDEFINED'].includes(data.matchType)) targetsToEvaluate.push({ id, data });
    });

    const bidUpdates = { keywords: [], targets: [] };
    const changeLog = [];

    if (keywordsToEvaluate.length > 0) {
        const keywordIds = keywordsToEvaluate.map(k => k.id);
        const { keywords: amazonKeywords } = await amazonAdsApiRequest({ method: 'post', url: '/sp/keywords/list', profileId: rule.profile_id, data: { keywordIdFilter: { include: keywordIds } } });
        const currentBids = new Map(amazonKeywords.map(kw => [kw.keywordId.toString(), kw.bid]));
        
        for (const { id, data } of keywordsToEvaluate) {
            const currentBid = currentBids.get(id);
            if (typeof currentBid !== 'number') continue;
            for (const group of rule.config.conditionGroups) {
                if (group.conditions.every(c => checkCondition(data.metrics[c.metric], c.operator, c.value))) {
                    const { value, minBid, maxBid } = group.action;
                    let newBid = parseFloat((currentBid * (1 + (value / 100))).toFixed(2));
                    if (minBid !== undefined) newBid = Math.max(minBid, newBid);
                    if (maxBid !== undefined) newBid = Math.min(maxBid, newBid);
                    if (newBid !== currentBid) {
                        bidUpdates.keywords.push({ keywordId: parseInt(id, 10), bid: newBid });
                        changeLog.push({ type: 'Keyword', text: data.keywordText, oldBid: currentBid, newBid });
                    }
                    break;
                }
            }
        }
    }

    if (targetsToEvaluate.length > 0) {
        const targetIds = targetsToEvaluate.map(t => t.id);
        const { targets: amazonTargets } = await amazonAdsApiRequest({ method: 'post', url: '/sp/targets/list', profileId: rule.profile_id, data: { targetIdFilter: { include: targetIds } } });
        const currentBids = new Map(amazonTargets.map(t => [t.targetId.toString(), t.bid]));
        for (const { id, data } of targetsToEvaluate) {
            const currentBid = currentBids.get(id);
            if (typeof currentBid !== 'number') continue;
            for (const group of rule.config.conditionGroups) {
                if (group.conditions.every(c => checkCondition(data.metrics[c.metric], c.operator, c.value))) {
                    const { value, minBid, maxBid } = group.action;
                    let newBid = parseFloat((currentBid * (1 + (value / 100))).toFixed(2));
                    if (minBid !== undefined) newBid = Math.max(minBid, newBid);
                    if (maxBid !== undefined) newBid = Math.min(maxBid, newBid);
                    if (newBid !== currentBid) {
                        bidUpdates.targets.push({ targetId: parseInt(id, 10), bid: newBid });
                        changeLog.push({ type: 'Target', text: data.keywordText, oldBid: currentBid, newBid });
                    }
                    break;
                }
            }
        }
    }
    
    if (bidUpdates.keywords.length > 0) await amazonAdsApiRequest({ method: 'put', url: '/sp/keywords', profileId: rule.profile_id, data: { keywords: bidUpdates.keywords } });
    if (bidUpdates.targets.length > 0) await amazonAdsApiRequest({ method: 'put', url: '/sp/targets', profileId: rule.profile_id, data: { targets: bidUpdates.targets } });
    
    return changeLog;
};

const evaluateSearchTermAutomationRule = async (rule, performanceData) => {
    const negativeKeywordsToAdd = [];
    const changeLog = [];

    for (const [searchTerm, data] of performanceData.entries()) {
        for (const group of rule.config.conditionGroups) {
            const conditionsMet = group.conditions.every(cond => checkCondition(data.metrics[cond.metric], cond.operator, cond.value));
            if (conditionsMet) {
                if (group.action.type === 'negateSearchTerm') {
                    negativeKeywordsToAdd.push({
                        campaignId: data.campaignId, adGroupId: data.adGroupId,
                        keywordText: searchTerm, matchType: group.action.matchType
                    });
                    changeLog.push({ searchTerm, campaignId: data.campaignId, matchType: group.action.matchType });
                }
                break;
            }
        }
    }
    if (negativeKeywordsToAdd.length > 0) {
        await amazonAdsApiRequest({ method: 'post', url: '/sp/negativeKeywords', profileId: rule.profile_id, data: { negativeKeywords: negativeKeywordsToAdd } });
    }
    return changeLog;
};

// --- Main Engine Orchestrator ---

const runSingleRule = async (rule) => {
    console.log(`[RulesEngine] ▶️  Running rule: "${rule.name}" (ID: ${rule.id})`);
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const performanceData = await getPerformanceData(rule);
        if (performanceData.size === 0) {
            await logAction(rule, 'NO_ACTION', `No performance data found for the lookback period.`);
            await client.query('UPDATE automation_rules SET last_run_at = NOW() WHERE id = $1', [rule.id]);
            await client.query('COMMIT');
            return;
        }

        let changes = [];
        if (rule.rule_type === 'BID_ADJUSTMENT') {
            changes = await evaluateBidAdjustmentRule(rule, performanceData);
        } else if (rule.rule_type === 'SEARCH_TERM_AUTOMATION') {
            changes = await evaluateSearchTermAutomationRule(rule, performanceData);
        }

        if (changes.length > 0) {
            await logAction(rule, 'SUCCESS', `Rule executed successfully with ${changes.length} change(s).`, { changes });
        } else {
            await logAction(rule, 'NO_ACTION', 'Conditions were not met for any entity.');
        }
        
        await client.query('UPDATE automation_rules SET last_run_at = NOW() WHERE id = $1', [rule.id]);
        await client.query('COMMIT');

    } catch (ruleError) {
        if (client) await client.query('ROLLBACK');
        console.error(`[RulesEngine] ❌ FAILED evaluation for rule "${rule.name}" (ID: ${rule.id}). Error:`, ruleError.details || ruleError.message);
        await logAction(rule, 'FAILURE', 'Rule evaluation failed due to an internal error.', { error: ruleError.details || ruleError.message });
    } finally {
        if (client) client.release();
    }
};

const generateCronPattern = ({ unit, value }) => {
    value = Math.max(1, parseInt(value, 10)); // Ensure value is a positive integer
    switch (unit) {
        case 'minutes': return `*/${value} * * * *`;
        case 'hours': return `0 */${value} * * *`;
        case 'days': return `0 0 */${value} * *`;
        default: return `0 * * * *`; // Default to hourly if invalid
    }
};

export const startRulesEngine = async () => {
  console.log('[RulesEngine] Initializing and scheduling all active rules...');
  
  // Stop any previously scheduled tasks
  Object.values(scheduledTasks).forEach(task => task.stop());
  scheduledTasks = {};

  try {
    const { rows: activeRules } = await pool.query('SELECT * FROM automation_rules WHERE is_active = true');
    
    if (activeRules.length === 0) {
      console.log('[RulesEngine] No active rules found to schedule.');
      return;
    }

    activeRules.forEach(rule => {
      const frequency = rule.config?.frequency;
      if (frequency && frequency.unit && frequency.value) {
        const cronPattern = generateCronPattern(frequency);
        if (cron.validate(cronPattern)) {
            const task = cron.schedule(cronPattern, () => runSingleRule(rule), {
                scheduled: true,
                timezone: "America/Phoenix"
            });
            scheduledTasks[rule.id] = task;
            console.log(`[RulesEngine] ✔️  Scheduled rule "${rule.name}" (ID: ${rule.id}) with pattern: ${cronPattern}`);
        } else {
             console.error(`[RulesEngine] ❌ Invalid cron pattern '${cronPattern}' for rule "${rule.name}". Skipping.`);
        }
      } else {
         console.warn(`[RulesEngine] ⚠️  Rule "${rule.name}" is active but has no valid frequency config. Skipping.`);
      }
    });
    console.log(`[RulesEngine] Initialization complete. ${Object.keys(scheduledTasks).length} rules are now running on their own schedules.`);
  } catch (error) {
      console.error('[RulesEngine] FATAL: Could not fetch rules from database to schedule tasks.', error);
  }
};
