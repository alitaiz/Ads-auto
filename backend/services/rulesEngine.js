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
                    NULL::bigint AS entity_id, -- No stable target_id in this report, cast to match other UNION parts
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
                GROUP BY 1, 3, 4, 5, 6, 7 -- Group by all non-aggregated, non-constant columns

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
    const changeLog = [];
    const keywordsToUpdate = [];
    const targetsToUpdate = [];

    // --- Step 1: Initial Classification ---
    const keywordsWithId = new Map();
    const targetsWithId = new Map();
    const unactionableTargets = []; 

    performanceData.forEach((data) => {
        if (data.entityType === 'keyword' && data.entityId) {
            keywordsWithId.set(data.entityId.toString(), data);
        } else if (data.entityType === 'target' && data.entityId) {
            targetsWithId.set(data.entityId.toString(), data);
        } else if (data.entityType === 'target' && !data.entityId && data.adGroupId && data.entityText) {
            unactionableTargets.push(data);
        }
    });

    console.log(`[RulesEngine DBG] Initial Entity Breakdown: ${keywordsWithId.size} keywords, ${targetsWithId.size} targets with IDs, ${unactionableTargets.length} potentially actionable targets.`);

    // --- Step 2: Enrich Unactionable Targets ---
    if (unactionableTargets.length > 0) {
        console.log(`[RulesEngine DBG] Attempting to enrich ${unactionableTargets.length} targets by fetching live Target IDs...`);
        const adGroupIdsToFetch = [...new Set(unactionableTargets.map(t => t.adGroupId))];
        
        const adGroupExpressionToTargetId = new Map();
        for (const adGroupId of adGroupIdsToFetch) {
            try {
                const { targetingClauses } = await amazonAdsApiRequest({
                    method: 'post',
                    url: '/sp/targets/list',
                    profileId: rule.profile_id,
                    data: { adGroupIdFilter: { include: [adGroupId] } }
                });

                if (targetingClauses && targetingClauses.length > 0) {
                    const expressionMap = new Map();
                    for (const target of targetingClauses) {
                        if (target.expression && Array.isArray(target.expression) && target.expression[0]?.type) {
                            const reportFriendlyExpression = target.expression[0].type.toLowerCase().replace('_', '-');
                            expressionMap.set(reportFriendlyExpression, target.targetId);
                        }
                    }
                    adGroupExpressionToTargetId.set(adGroupId, expressionMap);
                }
            } catch (e) {
                console.warn(`[RulesEngine DBG] Could not fetch targets for ad group ${adGroupId}.`, e);
            }
        }
        
        let enrichedCount = 0;
        for (const target of unactionableTargets) {
            const expressionMap = adGroupExpressionToTargetId.get(target.adGroupId);
            const targetId = expressionMap?.get(target.entityText);
            
            if (targetId) {
                target.entityId = targetId;
                targetsWithId.set(targetId.toString(), target);
                enrichedCount++;
            }
        }
        console.log(`[RulesEngine DBG] Successfully enriched ${enrichedCount} of ${unactionableTargets.length} targets.`);
    }

    const finalUnactionableCount = unactionableTargets.filter(t => !t.entityId).length;
    console.log(`[RulesEngine DBG] Final Entity Breakdown: ${keywordsWithId.size} keywords with IDs, ${targetsWithId.size} targets with IDs, ${finalUnactionableCount} unactionable targets (no ID).`);

    // --- Process Keywords with IDs ---
    if (keywordsWithId.size > 0) {
        console.log(`[RulesEngine DBG] Fetching current bids for ${keywordsWithId.size} keywords...`);
        const { keywords: amazonKeywords } = await amazonAdsApiRequest({ method: 'post', url: '/sp/keywords/list', profileId: rule.profile_id, data: { keywordIdFilter: { include: Array.from(keywordsWithId.keys()) } } });
        console.log(`[RulesEngine DBG] API returned ${amazonKeywords.length} keyword records.`);
        const currentBids = new Map(amazonKeywords.map(kw => [kw.keywordId.toString(), kw.bid]));

        for (const [id, data] of keywordsWithId.entries()) {
            const currentBid = currentBids.get(id);
            if (typeof currentBid !== 'number') continue;
            
            for (const group of rule.config.conditionGroups) {
                const conditionsMet = group.conditions.every(c => {
                    const metrics = calculateMetricsForWindow(data.dailyData, c.timeWindow);
                    const isMet = checkCondition(metrics[c.metric], c.operator, c.value);
                    console.log(`[RulesEngine DBG] Evaluating entity ${data.entityText} for condition [${c.metric} ${c.operator} ${c.value} in ${c.timeWindow}d]. Calculated metrics: ${JSON.stringify(metrics)}. Result: ${isMet}`);
                    return isMet;
                });
                if (conditionsMet) {
                    const { value, minBid, maxBid } = group.action;
                    let newBid = parseFloat((currentBid * (1 + (value / 100))).toFixed(2));
                    if (minBid !== undefined) newBid = Math.max(minBid, newBid);
                    if (maxBid !== undefined) newBid = Math.min(maxBid, newBid);
                    if (newBid !== currentBid && newBid > 0.01) {
                        keywordsToUpdate.push({ keywordId: parseInt(id, 10), bid: newBid });
                        changeLog.push({ type: 'Keyword', text: data.entityText, oldBid: currentBid, newBid });
                    }
                    break;
                }
            }
        }
    }

    // --- Process Targets with IDs ---
    if (targetsWithId.size > 0) {
        console.log(`[RulesEngine DBG] Fetching current bids for ${targetsWithId.size} targets...`);
        const { targetingClauses: amazonTargets } = await amazonAdsApiRequest({ method: 'post', url: '/sp/targets/list', profileId: rule.profile_id, data: { targetIdFilter: { include: Array.from(targetsWithId.keys()) } } });
        console.log(`[RulesEngine DBG] API returned ${amazonTargets.length} target records.`);
        const currentBids = new Map(amazonTargets.map(t => [t.targetId.toString(), t.bid]));

        for (const [id, data] of targetsWithId.entries()) {
            const currentBid = currentBids.get(id);
            if (typeof currentBid !== 'number') continue;

             for (const group of rule.config.conditionGroups) {
                const conditionsMet = group.conditions.every(c => {
                    const metrics = calculateMetricsForWindow(data.dailyData, c.timeWindow);
                    const isMet = checkCondition(metrics[c.metric], c.operator, c.value);
                    console.log(`[RulesEngine DBG] Evaluating entity ${data.entityText} for condition [${c.metric} ${c.operator} ${c.value} in ${c.timeWindow}d]. Calculated metrics: ${JSON.stringify(metrics)}. Result: ${isMet}`);
                    return isMet;
                });
                if (conditionsMet) {
                    const { value, minBid, maxBid } = group.action;
                    let newBid = parseFloat((currentBid * (1 + (value / 100))).toFixed(2));
                    if (minBid !== undefined) newBid = Math.max(minBid, newBid);
                    if (maxBid !== undefined) newBid = Math.min(maxBid, newBid);
                    if (newBid !== currentBid && newBid > 0.01) {
                        targetsToUpdate.push({ targetId: parseInt(id, 10), bid: newBid });
                        changeLog.push({ type: 'Target', text: `Target ID ${id}`, oldBid: currentBid, newBid });
                    }
                    break;
                }
            }
        }
    }
    
    // --- API Calls ---
    if (keywordsToUpdate.length > 0) await amazonAdsApiRequest({ method: 'put', url: '/sp/keywords', profileId: rule.profile_id, data: { keywords: keywordsToUpdate } });
    if (targetsToUpdate.length > 0) await amazonAdsApiRequest({ method: 'put', url: '/sp/targets', profileId: rule.profile_id, data: { targets: targetsToUpdate } });
    
    // --- Determine Final Summary ---
    if (changeLog.length > 0) {
        return { changes: changeLog, summary: `Rule executed successfully with ${changeLog.length} change(s).` };
    }
    if (finalUnactionableCount > 0 && keywordsWithId.size === 0 && targetsWithId.size === 0) {
         return { changes: [], summary: `Found ${finalUnactionableCount} entities, but none could be acted upon for bid adjustments. This is common for historical auto-campaign targets which lack a specific ID in reports.` };
    }
    return { changes: [], summary: 'Conditions were not met for any actionable entity.' };
};

const evaluateSearchTermAutomationRule = async (rule, performanceData) => {
    const negativeKeywordsToAdd = [];
    const changeLog = [];

    for (const [searchTerm, data] of performanceData.entries()) {
        for (const group of rule.config.conditionGroups) {
            const conditionsMet = group.conditions.every(cond => {
                const metricsForWindow = calculateMetricsForWindow(data.dailyData, cond.timeWindow);
                return checkCondition(metricsForWindow[cond.metric], cond.operator, cond.value);
            });
            if (conditionsMet) {
                if (group.action.type === 'negateSearchTerm') {
                    negativeKeywordsToAdd.push({
                        campaignId: data.campaignId, adGroupId: data.adGroupId,
                        keywordText: searchTerm, matchType: group.action.matchType
                    });
                    changeLog.push({ searchTerm, campaignId: data.campaignId, matchType: group.action.matchType });
                }
                break; // First match wins
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
        console.warn(`[RulesEngine] ⚠️  Rule "${rule.name}" is active but has no valid frequency config. Skipping.`);
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

        if (rule.rule_type === 'BID_ADJUSTMENT') {
            const { changes, summary } = await evaluateBidAdjustmentRule(rule, performanceData);
            if (changes.length > 0) {
                await logAction(rule, 'SUCCESS', summary, { changes });
            } else {
                await logAction(rule, 'NO_ACTION', summary);
            }
        } else if (rule.rule_type === 'SEARCH_TERM_AUTOMATION') {
            const changes = await evaluateSearchTermAutomationRule(rule, performanceData);
            if (changes.length > 0) {
                 await logAction(rule, 'SUCCESS', `Rule executed successfully with ${changes.length} change(s).`, { changes });
            } else {
                await logAction(rule, 'NO_ACTION', 'Conditions were not met for any actionable entity.');
            }
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