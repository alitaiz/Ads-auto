// backend/services/rulesEngine.js
import cron from 'node-cron';
import pool from '../db.js';
import { amazonAdsApiRequest } from '../helpers/amazon-api.js';

// Global variable to hold the main ticker task
let mainTask = null;

// --- Logging Helper ---
const logAction = async (rule, status, summary, details = {}) => {
  try {
    await pool.query(
      `INSERT INTO automation_logs (rule_id, status, summary, details) VALUES ($1, $2, $3, $4)`,
      [rule.id, status, summary, details]
    );
    console.log(`[RulesEngine] Logged action for rule "${rule.name}": ${summary}`);
  } catch (e) {
    console.error(`[RulesEngine] FATAL: Could not write to automation_logs table for rule ${rule.id}.`, e);
  }
};

// --- Data Fetching ---
const getPerformanceData = async (rule, campaignIds) => {
    const allTimeWindows = rule.config.conditionGroups.flatMap(g => g.conditions.map(c => c.timeWindow));
    const maxLookbackDays = Math.max(...allTimeWindows, 1);
    
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - maxLookbackDays);
    
    const streamCutoffDate = new Date();
    streamCutoffDate.setDate(today.getDate() - 3);

    const startDateStr = startDate.toISOString().split('T')[0];
    const streamCutoffDateStr = streamCutoffDate.toISOString().split('T')[0];

    let query;
    const params = [startDateStr, streamCutoffDateStr];
    let campaignFilterClauseHistorical = '';
    let campaignFilterClauseStream = '';

    if (campaignIds && campaignIds.length > 0) {
        params.push(campaignIds);
        const campaignParamIndex = `$${params.length}`;
        campaignFilterClauseHistorical = `AND campaign_id = ANY(${campaignParamIndex})`;
        campaignFilterClauseStream = `AND (event_data->>'campaignId')::bigint = ANY(${campaignParamIndex})`;
    }

    if (rule.rule_type === 'BID_ADJUSTMENT') {
        query = `
            WITH combined_performance AS (
                -- Section 1: Fetch historical data for KEYWORDS ONLY
                -- (The report table does not contain target_id)
                SELECT
                    keyword_id AS entity_id,
                    'keyword' AS entity_type,
                    keyword_text AS entity_text,
                    match_type,
                    campaign_id,
                    ad_group_id,
                    SUM(COALESCE(spend, cost, 0))::numeric AS spend,
                    SUM(COALESCE(sales_7d, 0))::numeric AS sales,
                    SUM(COALESCE(clicks, 0))::bigint AS clicks,
                    SUM(COALESCE(purchases_7d, 0))::bigint AS orders
                FROM sponsored_products_search_term_report
                WHERE report_date >= $1 AND report_date < $2
                  AND keyword_id IS NOT NULL
                  ${campaignFilterClauseHistorical}
                GROUP BY keyword_id, keyword_text, match_type, campaign_id, ad_group_id

                UNION ALL

                -- Section 2: Fetch recent data for BOTH KEYWORDS AND TARGETS from the stream
                SELECT
                    COALESCE((event_data->>'keywordId')::bigint, (event_data->>'targetId')::bigint) AS entity_id,
                    CASE WHEN event_data->>'keywordId' IS NOT NULL THEN 'keyword' ELSE 'target' END AS entity_type,
                    event_data->>'keywordText' AS entity_text, -- Note: targetText is not in stream, will be null for targets
                    event_data->>'matchType' AS match_type,
                    (event_data->>'campaignId')::bigint AS campaign_id,
                    (event_data->>'adGroupId')::bigint AS ad_group_id,
                    SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'cost')::numeric ELSE 0 END) AS spend,
                    SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'attributedSales1d')::numeric ELSE 0 END) AS sales,
                    SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'clicks')::bigint ELSE 0 END) AS clicks,
                    SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'conversions')::bigint ELSE 0 END) AS orders
                FROM raw_stream_events
                WHERE (event_data->>'timeWindowStart')::timestamptz >= $2
                  AND (event_data->>'keywordId' IS NOT NULL OR event_data->>'targetId' IS NOT NULL)
                  ${campaignFilterClauseStream}
                GROUP BY entity_id, entity_type, entity_text, match_type, campaign_id, ad_group_id
            )
            -- Final Aggregation: Combine historical and stream data for each unique entity
            SELECT
                entity_id,
                entity_type,
                MAX(entity_text) as entity_text, -- Take the most recent non-null text
                MAX(match_type) as match_type,
                MAX(campaign_id) as campaign_id,
                MAX(ad_group_id) as ad_group_id,
                SUM(spend) AS total_spend,
                SUM(sales) AS total_sales,
                SUM(clicks) AS total_clicks,
                SUM(orders) AS total_orders
            FROM combined_performance
            WHERE entity_id IS NOT NULL
            GROUP BY entity_id, entity_type;
        `;
    } else { // SEARCH_TERM_AUTOMATION
         query = `
            SELECT
                customer_search_term,
                campaign_id,
                ad_group_id,
                SUM(spend) AS total_spend,
                SUM(sales) AS total_sales,
                SUM(clicks) AS total_clicks,
                SUM(orders) AS total_orders
            FROM (
                SELECT
                    customer_search_term, campaign_id, ad_group_id,
                    COALESCE(SUM(COALESCE(spend, cost)), 0)::numeric AS spend,
                    COALESCE(SUM(COALESCE(sales_7d, 0)), 0)::numeric AS sales,
                    COALESCE(SUM(clicks), 0)::bigint AS clicks,
                    COALESCE(SUM(purchases_7d), 0)::bigint AS orders
                FROM sponsored_products_search_term_report
                WHERE report_date >= $1 AND report_date < $2 AND customer_search_term IS NOT NULL ${campaignFilterClauseHistorical}
                GROUP BY 1, 2, 3

                UNION ALL

                SELECT
                    (event_data->>'searchTerm') as customer_search_term,
                    (event_data->>'campaignId')::bigint as campaign_id,
                    (event_data->>'adGroupId')::bigint as ad_group_id,
                    SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'cost')::numeric ELSE 0 END),
                    SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'attributedSales1d')::numeric ELSE 0 END),
                    SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'clicks')::bigint ELSE 0 END),
                    SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'conversions')::bigint ELSE 0 END)
                FROM raw_stream_events
                WHERE (event_data->>'timeWindowStart')::timestamptz >= $2
                AND (event_data->>'searchTerm') IS NOT NULL ${campaignFilterClauseStream}
                GROUP BY 1, 2, 3
            ) AS combined_data
            WHERE customer_search_term IS NOT NULL
            GROUP BY 1, 2, 3;
         `;
    }

    const { rows } = await pool.query(query, params);
    
    const performanceMap = new Map();
    for (const row of rows) {
        const key = (rule.rule_type === 'BID_ADJUSTMENT' ? row.entity_id : row.customer_search_term)?.toString();
        if (!key) continue;

        if (!performanceMap.has(key)) {
             performanceMap.set(key, {
                campaignId: row.campaign_id,
                adGroupId: row.ad_group_id,
                entityId: row.entity_id,
                entityType: row.entity_type,
                entityText: row.entity_text || row.customer_search_term,
                matchType: row.match_type,
                metrics: { spend: 0, sales: 0, clicks: 0, orders: 0, acos: 0 }
            });
        }
        
        const entry = performanceMap.get(key);
        entry.metrics.spend += parseFloat(row.total_spend || 0);
        entry.metrics.sales += parseFloat(row.total_sales || 0);
        entry.metrics.clicks += parseInt(row.total_clicks || 0, 10);
        entry.metrics.orders += parseInt(row.total_orders || 0, 10);
    }
    
    performanceMap.forEach(entry => {
        entry.metrics.acos = entry.metrics.sales > 0 ? entry.metrics.spend / entry.metrics.sales : 0;
    });

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
    const keywordsToUpdate = [];
    const targetsToUpdate = [];
    const changeLog = [];

    const keywordData = new Map();
    const targetData = new Map();

    performanceData.forEach((data) => {
        if (data.entityType === 'keyword') {
            keywordData.set(data.entityId.toString(), data);
        } else {
            targetData.set(data.entityId.toString(), data);
        }
    });

    if (keywordData.size > 0) {
        const keywordIds = Array.from(keywordData.keys());
        const { keywords: amazonKeywords } = await amazonAdsApiRequest({ method: 'post', url: '/sp/keywords/list', profileId: rule.profile_id, data: { keywordIdFilter: { include: keywordIds } } });
        const currentBids = new Map(amazonKeywords.map(kw => [kw.keywordId.toString(), kw.bid]));
        
        for (const [id, data] of keywordData.entries()) {
            const currentBid = currentBids.get(id);
            if (typeof currentBid !== 'number') continue;
            for (const group of rule.config.conditionGroups) {
                if (group.conditions.every(c => checkCondition(data.metrics[c.metric], c.operator, c.value))) {
                    const { value, minBid, maxBid } = group.action;
                    let newBid = parseFloat((currentBid * (1 + (value / 100))).toFixed(2));
                    if (minBid !== undefined && minBid !== null) newBid = Math.max(minBid, newBid);
                    if (maxBid !== undefined && maxBid !== null) newBid = Math.min(maxBid, newBid);
                    if (newBid !== currentBid && newBid > 0.01) {
                        keywordsToUpdate.push({ keywordId: parseInt(id, 10), bid: newBid });
                        changeLog.push({ type: 'Keyword', text: data.entityText, oldBid: currentBid, newBid });
                    }
                    break;
                }
            }
        }
    }

    if (targetData.size > 0) {
        const targetIds = Array.from(targetData.keys());
        const { targetingClauses: amazonTargets } = await amazonAdsApiRequest({ method: 'post', url: '/sp/targets/list', profileId: rule.profile_id, data: { targetIdFilter: { include: targetIds } } });
        const currentBids = new Map(amazonTargets.map(t => [t.targetId.toString(), t.bid]));
        for (const [id, data] of targetData.entries()) {
            const currentBid = currentBids.get(id);
            if (typeof currentBid !== 'number') continue;
            for (const group of rule.config.conditionGroups) {
                if (group.conditions.every(c => checkCondition(data.metrics[c.metric], c.operator, c.value))) {
                    const { value, minBid, maxBid } = group.action;
                    let newBid = parseFloat((currentBid * (1 + (value / 100))).toFixed(2));
                    if (minBid !== undefined && minBid !== null) newBid = Math.max(minBid, newBid);
                    if (maxBid !== undefined && maxBid !== null) newBid = Math.min(maxBid, newBid);
                    if (newBid !== currentBid && newBid > 0.01) {
                        targetsToUpdate.push({ targetId: parseInt(id, 10), bid: newBid });
                        changeLog.push({ type: 'Target', text: `Target ID ${id}`, oldBid: currentBid, newBid });
                    }
                    break;
                }
            }
        }
    }
    
    if (keywordsToUpdate.length > 0) await amazonAdsApiRequest({ method: 'put', url: '/sp/keywords', profileId: rule.profile_id, data: { keywords: keywordsToUpdate } });
    if (targetsToUpdate.length > 0) await amazonAdsApiRequest({ method: 'put', url: '/sp/targets', profileId: rule.profile_id, data: { targets: targetsToUpdate } });
    
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

// --- Helper to check if a rule is due to run ---
const isRuleDue = (rule) => {
    const { last_run_at, config } = rule;
    const { frequency } = config;

    if (!frequency || !frequency.unit || !frequency.value) {
        console.warn(`[RulesEngine] Rule "${rule.name}" has invalid frequency config. Skipping.`);
        return false;
    }

    if (!last_run_at) return true;

    const now = new Date();
    const lastRun = new Date(last_run_at);
    
    let valueInMs;
    const value = parseInt(frequency.value, 10);
    switch (frequency.unit) {
        case 'minutes': valueInMs = value * 60 * 1000; break;
        case 'hours': valueInMs = value * 60 * 60 * 1000; break;
        case 'days': valueInMs = value * 24 * 60 * 60 * 1000; break;
        default: return false;
    }
    
    const nextRunTime = new Date(lastRun.getTime() + valueInMs);
    return now >= nextRunTime;
};

// --- Core Execution Logic for a Single Rule ---
const runSingleRule = async (rule) => {
    console.log(`[RulesEngine] ▶️  Running rule: "${rule.name}" (ID: ${rule.id})`);
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        await client.query('UPDATE automation_rules SET last_run_at = NOW() WHERE id = $1', [rule.id]);

        const performanceData = await getPerformanceData(rule, rule.scope?.campaignIds);

        console.log(`[RulesEngine] Found ${performanceData.size} entities with performance data matching the rule's scope.`);

        if (performanceData.size === 0) {
            await logAction(rule, 'NO_ACTION', `No performance data found for the lookback period matching the rule's campaign scope.`);
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
        
        await client.query('COMMIT');

    } catch (ruleError) {
        if (client) await client.query('ROLLBACK');
        const errorMessage = ruleError.details ? JSON.stringify(ruleError.details) : ruleError.message;
        console.error(`[RulesEngine] ❌ FAILED evaluation for rule "${rule.name}" (ID: ${rule.id}). Error:`, errorMessage);
        await logAction(rule, 'FAILURE', 'Rule evaluation failed due to an internal error.', { error: errorMessage });
    } finally {
        if (client) client.release();
    }
};

// --- Main ticker function that checks all rules ---
const checkAndRunDueRules = async () => {
    console.log(`[RulesEngine Tick] Ticking... checking for due rules.`);
    try {
        const { rows: activeRules } = await pool.query('SELECT * FROM automation_rules WHERE is_active = true');
        const dueRules = activeRules.filter(isRuleDue);

        if (dueRules.length > 0) {
            console.log(`[RulesEngine Tick] Found ${dueRules.length} due rule(s). Running them now.`);
            for (const rule of dueRules) {
                await runSingleRule(rule);
            }
        } else {
            console.log(`[RulesEngine Tick] No rules are due to run at this time.`);
        }
    } catch (error) {
        console.error('[RulesEngine Tick] Error while checking for due rules:', error);
    }
};

// --- Engine Starter ---
export const startRulesEngine = () => {
    if (mainTask) {
        mainTask.stop();
        console.log('[RulesEngine] Stopped previous ticker.');
    }
    
    console.log('[RulesEngine] Starting the main automation engine ticker (runs every minute).');
    
    mainTask = cron.schedule('* * * * *', checkAndRunDueRules, {
        scheduled: true,
        timezone: "America/Phoenix"
    });

    checkAndRunDueRules();
};
