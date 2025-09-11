// backend/services/rulesEngine.js
import cron from 'node-cron';
import pool from '../db.js';
import { amazonAdsApiRequest } from '../helpers/amazon-api.js';

// Define a constant for Amazon's reporting timezone to ensure consistency.
const REPORTING_TIMEZONE = 'America/Los_Angeles';
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


/**
 * A robust way to get "today's date string" in a specific timezone.
 * Using 'en-CA' gives the desired YYYY-MM-DD format.
 * @param {string} timeZone - The IANA timezone string (e.g., 'America/Los_Angeles').
 * @returns {string} The local date string in YYYY-MM-DD format.
 */
const getLocalDateString = (timeZone) => {
    const today = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone,
    });
    return formatter.format(today);
};


/**
 * Calculates aggregated metrics from a list of daily data points for a specific lookback period.
 * This function is now timezone-aware and robust.
 * @param {Array<object>} dailyData - Array of { date, spend, sales, clicks, orders }.
 * @param {number} lookbackDays - The number of days to look back (e.g., 7 for "last 7 days").
 * @returns {object} An object with aggregated metrics { spend, sales, clicks, orders, acos }.
 */
const calculateMetricsForWindow = (dailyData, lookbackDays) => {
    const todayStr = getLocalDateString(REPORTING_TIMEZONE);
    // Creates a date at UTC midnight, which is consistent with how `d.date` is created.
    const today = new Date(todayStr);

    const startDate = new Date(today);
    // "in last 7 days" includes today, so go back (N-1) days.
    startDate.setDate(today.getDate() - (lookbackDays - 1));

    const filteredData = dailyData.filter(d => {
        // d.date is already a Date object at UTC midnight. No need to modify it.
        return d.date >= startDate && d.date <= today;
    });

    const totals = filteredData.reduce((acc, day) => {
        acc.spend += day.spend;
        acc.sales += day.sales;
        acc.clicks += day.clicks;
        acc.orders += day.orders;
        return acc;
    }, { spend: 0, sales: 0, clicks: 0, orders: 0 });

    totals.acos = totals.sales > 0 ? totals.spend / totals.sales : 0;
    return totals;
};


// --- Data Fetching ---
const getPerformanceData = async (rule, campaignIds) => {
    const allTimeWindows = rule.config.conditionGroups.flatMap(g => g.conditions.map(c => c.timeWindow));
    const maxLookbackDays = Math.max(...allTimeWindows, 1);
    
    const todayStr = getLocalDateString(REPORTING_TIMEZONE);
    const today = new Date(todayStr); // UTC midnight

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (maxLookbackDays -1));
    
    const streamCutoffDate = new Date(today);
    streamCutoffDate.setDate(today.getDate() - 3);

    const startDateStr = startDate.toISOString().split('T')[0];
    const streamCutoffDateStr = streamCutoffDate.toISOString().split('T')[0];

    console.log(`[RulesEngine DBG] Preparing to query daily performance data with parameters:`, {
        ruleName: rule.name, maxLookbackDays, startDate: startDateStr, streamCutoffDate: streamCutoffDateStr, campaignIds: campaignIds || 'ALL',
    });

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
            SELECT
                performance_date, entity_id, entity_type, entity_text, match_type,
                campaign_id, ad_group_id, spend, sales, clicks, orders
            FROM (
                -- Historical data: Both Keywords and Targets
                SELECT
                    report_date AS performance_date,
                    keyword_id AS entity_id,
                    'keyword' AS entity_type,
                    keyword_text AS entity_text,
                    match_type,
                    campaign_id,
                    ad_group_id,
                    COALESCE(spend, cost, 0)::numeric AS spend,
                    COALESCE(sales_7d, 0)::numeric AS sales,
                    COALESCE(clicks, 0)::bigint AS clicks,
                    COALESCE(purchases_7d, 0)::bigint AS orders
                FROM sponsored_products_search_term_report
                WHERE report_date >= $1 AND report_date < $2
                  AND keyword_id IS NOT NULL -- For keywords
                  ${campaignFilterClauseHistorical}
                
                UNION ALL

                SELECT
                    report_date AS performance_date,
                    NULL AS entity_id, -- No stable target_id in this report
                    'target' AS entity_type,
                    targeting AS entity_text,
                    match_type,
                    campaign_id,
                    ad_group_id,
                    COALESCE(SUM(COALESCE(spend, cost, 0)))::numeric AS spend,
                    COALESCE(SUM(COALESCE(sales_7d, 0)))::numeric AS sales,
                    COALESCE(SUM(clicks), 0)::bigint AS clicks,
                    COALESCE(SUM(purchases_7d), 0)::bigint AS orders
                FROM sponsored_products_search_term_report
                WHERE report_date >= $1 AND report_date < $2
                  AND keyword_id IS NULL AND targeting IS NOT NULL -- For targets (auto/pat)
                  ${campaignFilterClauseHistorical}
                GROUP BY 1, 2, 3, 4, 5, 6, 7

                UNION ALL

                -- Stream data: KEYWORDS and TARGETS, aggregated daily.
                SELECT
                    ((event_data->>'timeWindowStart')::timestamptz AT TIME ZONE '${REPORTING_TIMEZONE}')::date AS performance_date,
                    COALESCE((event_data->>'keywordId')::bigint, (event_data->>'targetId')::bigint) AS entity_id,
                    CASE WHEN event_data->>'keywordId' IS NOT NULL THEN 'keyword' ELSE 'target' END AS entity_type,
                    COALESCE(event_data->>'keywordText', event_data->>'targetingExpression', event_data->>'targetingText') AS entity_text,
                    event_data->>'matchType' AS match_type,
                    (event_data->>'campaignId')::bigint AS campaign_id,
                    (event_data->>'adGroupId')::bigint AS ad_group_id,
                    SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'cost')::numeric ELSE 0 END) AS spend,
                    SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'attributedSales1d')::numeric ELSE 0 END) AS sales,
                    SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'clicks')::bigint ELSE 0 END) AS clicks,
                    SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'conversions')::bigint ELSE 0 END) AS orders
                FROM raw_stream_events
                WHERE (event_data->>'timeWindowStart')::timestamptz >= (($2)::timestamp AT TIME ZONE '${REPORTING_TIMEZONE}')
                  AND (event_data->>'keywordId' IS NOT NULL OR event_data->>'targetId' IS NOT NULL)
                  ${campaignFilterClauseStream}
                GROUP BY 1, 2, 3, 4, 5, 6, 7
            ) AS daily_data;
        `;
    } else { // SEARCH_TERM_AUTOMATION
         query = `
             SELECT
                performance_date, customer_search_term, campaign_id, ad_group_id,
                spend, sales, clicks, orders
            FROM (
                SELECT report_date AS performance_date, customer_search_term, campaign_id, ad_group_id,
                    COALESCE(SUM(COALESCE(spend, cost)), 0)::numeric AS spend, COALESCE(SUM(COALESCE(sales_7d, 0)), 0)::numeric AS sales,
                    COALESCE(SUM(clicks), 0)::bigint AS clicks, COALESCE(SUM(purchases_7d), 0)::bigint AS orders
                FROM sponsored_products_search_term_report
                WHERE report_date >= $1 AND report_date < $2 AND customer_search_term IS NOT NULL ${campaignFilterClauseHistorical}
                GROUP BY 1, 2, 3, 4

                UNION ALL

                SELECT ((event_data->>'timeWindowStart')::timestamptz AT TIME ZONE '${REPORTING_TIMEZONE}')::date AS performance_date,
                    (event_data->>'searchTerm') as customer_search_term, (event_data->>'campaignId')::bigint as campaign_id,
                    (event_data->>'adGroupId')::bigint as ad_group_id,
                    SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'cost')::numeric ELSE 0 END) as spend,
                    SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'attributedSales1d')::numeric ELSE 0 END) as sales,
                    SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'clicks')::bigint ELSE 0 END) as clicks,
                    SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'conversions')::bigint ELSE 0 END) as orders
                FROM raw_stream_events
                WHERE (event_data->>'timeWindowStart')::timestamptz >= (($2)::timestamp AT TIME ZONE '${REPORTING_TIMEZONE}')
                  AND (event_data->>'searchTerm') IS NOT NULL ${campaignFilterClauseStream}
                GROUP BY 1, 2, 3, 4
            ) AS combined_data
            WHERE customer_search_term IS NOT NULL;
         `;
    }

    const { rows } = await pool.query(query, params);
    console.log(`[RulesEngine DBG] Query returned ${rows.length} daily performance rows.`);

    const performanceMap = new Map();
    for (const row of rows) {
        const key = (rule.rule_type === 'BID_ADJUSTMENT' ? (row.entity_id || `${row.campaign_id}-${row.ad_group_id}-${row.entity_text}`) : row.customer_search_term)?.toString();
        if (!key) continue;

        if (!performanceMap.has(key)) {
             performanceMap.set(key, {
                campaignId: row.campaign_id, adGroupId: row.ad_group_id,
                entityId: row.entity_id, entityType: row.entity_type,
                entityText: row.entity_text || row.customer_search_term, matchType: row.match_type,
                dailyData: []
            });
        }
        
        performanceMap.get(key).dailyData.push({
            date: new Date(row.performance_date),
            spend: parseFloat(row.spend || 0),
            sales: parseFloat(row.sales || 0),
            clicks: parseInt(row.clicks || 0, 10),
            orders: parseInt(row.orders || 0, 10),
        });
    }
    
    console.log(`[RulesEngine DBG] Aggregated daily data for ${performanceMap.size} unique entities.`);
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

    performanceData.forEach((data, key) => {
        if (data.entityType === 'keyword' && data.entityId) {
             keywordData.set(data.entityId.toString(), data);
        } else if (data.entityType === 'target') {
            // Use the map key for targets, as entityId might be null for historical ones
            targetData.set(key, data);
        }
    });

    // --- Process Keywords ---
    if (keywordData.size > 0) {
        const keywordIds = Array.from(keywordData.keys());
        const { keywords: amazonKeywords } = await amazonAdsApiRequest({ method: 'post', url: '/sp/keywords/list', profileId: rule.profile_id, data: { keywordIdFilter: { include: keywordIds } } });
        const currentBids = new Map(amazonKeywords.map(kw => [kw.keywordId.toString(), kw.bid]));
        
        for (const [id, data] of keywordData.entries()) {
            console.log(`\n[RulesEngine DBG] --- Evaluating Keyword: "${data.entityText}" (ID: ${id}) ---`);
            const currentBid = currentBids.get(id);
            if (typeof currentBid !== 'number') {
                console.log(`[RulesEngine DBG]   - Skipping: Could not find current bid via API.`);
                continue;
            }
            console.log(`[RulesEngine DBG]   - Current Bid: $${currentBid}`);
            
            for (const [groupIndex, group] of rule.config.conditionGroups.entries()) {
                console.log(`[RulesEngine DBG]   - Checking Condition Group #${groupIndex + 1}`);
                const conditionsMet = group.conditions.every(c => {
                    console.log(`[RulesEngine DBG]     - Condition: ${c.metric} ${c.operator} ${c.value} in last ${c.timeWindow} days`);
                    const metricsForWindow = calculateMetricsForWindow(data.dailyData, c.timeWindow);
                    console.log(`[RulesEngine DBG]       Calculated metrics: spend=${metricsForWindow.spend.toFixed(2)}, sales=${metricsForWindow.sales.toFixed(2)}, orders=${metricsForWindow.orders}`);
                    const metricValue = metricsForWindow[c.metric];
                    const checkResult = checkCondition(metricValue, c.operator, c.value);
                    console.log(`[RulesEngine DBG]       Check (${metricValue.toFixed(2)} ${c.operator} ${c.value}): ${checkResult ? 'MET' : 'NOT MET'}`);
                    return checkResult;
                });

                if (conditionsMet) {
                    console.log(`[RulesEngine DBG]   - SUCCESS: All conditions in Group #${groupIndex + 1} were met.`);
                    const { value, minBid, maxBid } = group.action;
                    let newBid = parseFloat((currentBid * (1 + (value / 100))).toFixed(2));
                    console.log(`[RulesEngine DBG]     - Action: Change bid by ${value}%. Initial new bid: $${newBid}`);
                    if (minBid !== undefined && minBid !== null) newBid = Math.max(minBid, newBid);
                    if (maxBid !== undefined && maxBid !== null) newBid = Math.min(maxBid, newBid);
                    console.log(`[RulesEngine DBG]     - Final new bid (after min/max): $${newBid}`);
                    
                    if (newBid !== currentBid && newBid > 0.01) {
                        console.log(`[RulesEngine DBG]   - DECISION: Adding keyword to update list.`);
                        keywordsToUpdate.push({ keywordId: parseInt(id, 10), bid: newBid });
                        changeLog.push({ type: 'Keyword', text: data.entityText, oldBid: currentBid, newBid });
                    } else {
                        console.log(`[RulesEngine DBG]   - DECISION: No change needed (new bid is same as old, or too low).`);
                    }
                    break; // "First match wins"
                } else {
                     console.log(`[RulesEngine DBG]   - SKIPPED: Not all conditions in Group #${groupIndex + 1} were met.`);
                }
            }
        }
    }

    // --- Process Targets (from stream data with IDs) ---
    const streamTargetsWithIds = new Map(Array.from(targetData.entries()).filter(([k,v]) => v.entityId));
    if (streamTargetsWithIds.size > 0) {
        const targetIds = Array.from(streamTargetsWithIds.values()).map(t => t.entityId);
        const { targetingClauses: amazonTargets } = await amazonAdsApiRequest({ method: 'post', url: '/sp/targets/list', profileId: rule.profile_id, data: { targetIdFilter: { include: targetIds } } });
        const currentBids = new Map(amazonTargets.map(t => [t.targetId.toString(), t.bid]));

        for (const [key, data] of streamTargetsWithIds.entries()) {
            const id = data.entityId.toString();
            console.log(`\n[RulesEngine DBG] --- Evaluating Target: "${data.entityText}" (ID: ${id}) ---`);
            const currentBid = currentBids.get(id);
             if (typeof currentBid !== 'number') {
                console.log(`[RulesEngine DBG]   - Skipping: Could not find current bid via API.`);
                continue;
            }
            console.log(`[RulesEngine DBG]   - Current Bid: $${currentBid}`);
             for (const [groupIndex, group] of rule.config.conditionGroups.entries()) {
                console.log(`[RulesEngine DBG]   - Checking Condition Group #${groupIndex + 1}`);
                const conditionsMet = group.conditions.every(c => {
                    console.log(`[RulesEngine DBG]     - Condition: ${c.metric} ${c.operator} ${c.value} in last ${c.timeWindow} days`);
                    const metricsForWindow = calculateMetricsForWindow(data.dailyData, c.timeWindow);
                    console.log(`[RulesEngine DBG]       Calculated metrics: spend=${metricsForWindow.spend.toFixed(2)}, sales=${metricsForWindow.sales.toFixed(2)}, orders=${metricsForWindow.orders}`);
                    const metricValue = metricsForWindow[c.metric];
                    const checkResult = checkCondition(metricValue, c.operator, c.value);
                    console.log(`[RulesEngine DBG]       Check (${metricValue.toFixed(2)} ${c.operator} ${c.value}): ${checkResult ? 'MET' : 'NOT MET'}`);
                    return checkResult;
                });
                if (conditionsMet) {
                    console.log(`[RulesEngine DBG]   - SUCCESS: All conditions in Group #${groupIndex + 1} were met.`);
                    const { value, minBid, maxBid } = group.action;
                    let newBid = parseFloat((currentBid * (1 + (value / 100))).toFixed(2));
                    if (minBid !== undefined && minBid !== null) newBid = Math.max(minBid, newBid);
                    if (maxBid !== undefined && maxBid !== null) newBid = Math.min(maxBid, newBid);
                    if (newBid !== currentBid && newBid > 0.01) {
                         console.log(`[RulesEngine DBG]   - DECISION: Adding target to update list.`);
                        targetsToUpdate.push({ targetId: parseInt(id, 10), bid: newBid });
                        changeLog.push({ type: 'Target', text: `Target ID ${id}`, oldBid: currentBid, newBid });
                    }
                    break;
                }
            }
        }
    }
    
    if (keywordsToUpdate.length > 0) {
        console.log(`[RulesEngine API] Sending ${keywordsToUpdate.length} keyword bid updates to Amazon.`);
        await amazonAdsApiRequest({ method: 'put', url: '/sp/keywords', profileId: rule.profile_id, data: { keywords: keywordsToUpdate } });
    }
    if (targetsToUpdate.length > 0) {
        console.log(`[RulesEngine API] Sending ${targetsToUpdate.length} target bid updates to Amazon.`);
        await amazonAdsApiRequest({ method: 'put', url: '/sp/targets', profileId: rule.profile_id, data: { targets: targetsToUpdate } });
    }
    
    return changeLog;
};

const evaluateSearchTermAutomationRule = async (rule, performanceData) => {
    const negativeKeywordsToAdd = [];
    const changeLog = [];

    for (const [searchTerm, data] of performanceData.entries()) {
        console.log(`\n[RulesEngine DBG] --- Evaluating Search Term: "${searchTerm}" ---`);
        for (const [groupIndex, group] of rule.config.conditionGroups.entries()) {
            console.log(`[RulesEngine DBG]   - Checking Condition Group #${groupIndex + 1}`);
            const conditionsMet = group.conditions.every(cond => {
                console.log(`[RulesEngine DBG]     - Condition: ${cond.metric} ${cond.operator} ${cond.value} in last ${cond.timeWindow} days`);
                const metricsForWindow = calculateMetricsForWindow(data.dailyData, cond.timeWindow);
                console.log(`[RulesEngine DBG]       Calculated metrics: spend=${metricsForWindow.spend.toFixed(2)}, sales=${metricsForWindow.sales.toFixed(2)}, orders=${metricsForWindow.orders}`);
                const metricValue = metricsForWindow[cond.metric];
                const checkResult = checkCondition(metricValue, cond.operator, cond.value);
                console.log(`[RulesEngine DBG]       Check (${metricValue.toFixed(2)} ${cond.operator} ${cond.value}): ${checkResult ? 'MET' : 'NOT MET'}`);
                return checkResult;
            });
            if (conditionsMet) {
                console.log(`[RulesEngine DBG]   - SUCCESS: All conditions met.`);
                if (group.action.type === 'negateSearchTerm') {
                    console.log(`[RulesEngine DBG]   - DECISION: Adding negative keyword to list.`);
                    negativeKeywordsToAdd.push({
                        campaignId: data.campaignId, adGroupId: data.adGroupId,
                        keywordText: searchTerm, matchType: group.action.matchType
                    });
                    changeLog.push({ searchTerm, campaignId: data.campaignId, matchType: group.action.matchType });
                }
                break; // First match wins
            } else {
                 console.log(`[RulesEngine DBG]   - SKIPPED: Conditions not met.`);
            }
        }
    }
    if (negativeKeywordsToAdd.length > 0) {
        console.log(`[RulesEngine API] Sending ${negativeKeywordsToAdd.length} negative keywords to Amazon.`);
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
            await logAction(rule, 'NO_ACTION', 'Conditions were not met for any actionable entity.');
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