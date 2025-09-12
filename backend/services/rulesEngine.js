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
    // Custom replacer to handle BigInts safely during JSON serialization for logging.
    const replacer = (key, value) => (typeof value === 'bigint' ? value.toString() : value);
    const detailsJson = JSON.stringify(details, replacer);

    await pool.query(
      `INSERT INTO automation_logs (rule_id, status, summary, details) VALUES ($1, $2, $3, $4)`,
      [rule.id, status, summary, detailsJson]
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
 * @param {Date} referenceDate - The end date for the lookback window (inclusive).
 * @returns {object} An object with aggregated metrics { spend, sales, clicks, orders, acos }.
 */
const calculateMetricsForWindow = (dailyData, lookbackDays, referenceDate) => {
    const endDate = new Date(referenceDate);

    const startDate = new Date(endDate);
    // "in last N days" includes the reference day, so go back (N-1) days.
    startDate.setDate(endDate.getDate() - (lookbackDays - 1));

    const filteredData = dailyData.filter(d => {
        // d.date is already a Date object at UTC midnight. No need to modify it.
        return d.date >= startDate && d.date <= endDate;
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

/**
 * Fetches performance data for BID_ADJUSTMENT rules using a HYBRID model.
 * - Near real-time data (last 2 days) from `raw_stream_events`.
 * - Settled historical data (>2 days ago) from `sponsored_products_search_term_report`.
 */
const getBidAdjustmentPerformanceData = async (rule, campaignIds, maxLookbackDays, today) => {
    const streamStartDate = new Date(today);
    streamStartDate.setDate(today.getDate() - 1); // Covers today and yesterday.

    const historicalEndDate = new Date(today);
    historicalEndDate.setDate(today.getDate() - 2);

    const historicalStartDate = new Date(historicalEndDate);
    // Adjust lookback to account for the days covered by the stream
    const historicalLookback = maxLookbackDays > 2 ? maxLookbackDays - 2 : 0;
    if (historicalLookback > 0) {
        historicalStartDate.setDate(historicalEndDate.getDate() - (historicalLookback - 1));
    }

    const params = [];
    let campaignFilterClauseStream = '';
    let campaignFilterClauseHistorical = '';

    const campaignIdArray = Array.isArray(campaignIds) ? campaignIds : (campaignIds ? [String(campaignIds)] : []);

    if (campaignIdArray.length > 0 && campaignIdArray[0]) {
        const campaignIdStrings = campaignIdArray.map(id => String(id));
        params.push(campaignIdStrings);
        campaignFilterClauseStream = `AND (event_data->>'campaign_id') = ANY($${params.length})`;
        
        const campaignIdNumbers = campaignIdArray.map(id => BigInt(id));
        params.push(campaignIdNumbers);
        campaignFilterClauseHistorical = `AND campaign_id = ANY($${params.length})`;
    }


    const query = `
        WITH stream_data AS (
            SELECT
                ((event_data->>'time_window_start')::timestamptz AT TIME ZONE '${REPORTING_TIMEZONE}')::date AS performance_date,
                (event_data->>'keyword_id') AS entity_id_text,
                (event_data->>'keyword_text') AS entity_text,
                (event_data->>'match_type') AS match_type,
                (event_data->>'campaign_id') AS campaign_id_text,
                (event_data->>'ad_group_id') AS ad_group_id_text,
                SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'cost')::numeric ELSE 0 END) AS spend,
                SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'clicks')::bigint ELSE 0 END) AS clicks,
                SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'attributed_sales_1d')::numeric ELSE 0 END) AS sales,
                SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'attributed_conversions_1d')::bigint ELSE 0 END) AS orders
            FROM raw_stream_events
            WHERE event_type IN ('sp-traffic', 'sp-conversion')
              AND (event_data->>'time_window_start')::timestamptz >= '${streamStartDate.toISOString()}'
              AND (event_data->>'keyword_id') IS NOT NULL
              ${campaignFilterClauseStream}
            GROUP BY 1, 2, 3, 4, 5, 6
        ),
        historical_data AS (
            SELECT
                report_date AS performance_date,
                keyword_id::text AS entity_id_text,
                targeting AS entity_text,
                match_type,
                campaign_id::text AS campaign_id_text,
                ad_group_id::text AS ad_group_id_text,
                SUM(COALESCE(spend, cost, 0))::numeric AS spend,
                SUM(COALESCE(sales_1d, 0))::numeric AS sales,
                SUM(COALESCE(clicks, 0))::bigint AS clicks,
                SUM(COALESCE(purchases_1d, 0))::bigint AS orders
            FROM sponsored_products_search_term_report
            WHERE report_date >= '${historicalStartDate.toISOString().split('T')[0]}' AND report_date <= '${historicalEndDate.toISOString().split('T')[0]}'
              AND keyword_id IS NOT NULL
              ${campaignFilterClauseHistorical}
            GROUP BY 1, 2, 3, 4, 5, 6
        )
        SELECT * FROM stream_data
        UNION ALL
        SELECT * FROM historical_data;
    `;

    const { rows } = await pool.query(query, params);
    
    const performanceMap = new Map();
    for (const row of rows) {
        const key = row.entity_id_text;
        if (!key) continue;

        if (!performanceMap.has(key)) {
             performanceMap.set(key, {
                entityId: row.entity_id_text,
                entityType: ['BROAD', 'PHRASE', 'EXACT'].includes(row.match_type) ? 'keyword' : 'target',
                entityText: row.entity_text,
                matchType: row.match_type,
                campaignId: row.campaign_id_text,
                adGroupId: row.ad_group_id_text,
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

    return performanceMap;
};

/**
 * Fetches performance data for SEARCH_TERM_AUTOMATION rules.
 * Exclusively uses historical Search Term Report data with a 2-day delay.
 */
const getSearchTermAutomationPerformanceData = async (rule, campaignIds, maxLookbackDays, today) => {
    const endDate = new Date(today);
    endDate.setDate(today.getDate() - 2);

    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (maxLookbackDays - 1));

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const params = [startDateStr, endDateStr];
    let campaignFilterClauseHistorical = '';

    if (campaignIds && campaignIds.length > 0) {
        params.push(campaignIds);
        const campaignParamIndex = `$${params.length}`;
        campaignFilterClauseHistorical = `AND campaign_id = ANY(${campaignParamIndex})`;
    }

    const query = `
            SELECT
            report_date AS performance_date, customer_search_term, campaign_id, ad_group_id,
            COALESCE(SUM(COALESCE(spend, cost)), 0)::numeric AS spend,
            COALESCE(SUM(COALESCE(sales_1d, 0)), 0)::numeric AS sales,
            COALESCE(SUM(clicks), 0)::bigint AS clicks,
            COALESCE(SUM(purchases_1d, 0))::bigint AS orders
        FROM sponsored_products_search_term_report
        WHERE report_date >= $1 AND report_date <= $2
            AND customer_search_term IS NOT NULL
            ${campaignFilterClauseHistorical}
        GROUP BY 1, 2, 3, 4;
    `;
    
    const { rows } = await pool.query(query, params);
    
    const performanceMap = new Map();
    for (const row of rows) {
        const key = row.customer_search_term?.toString();
        if (!key) continue;

        if (!performanceMap.has(key)) {
             performanceMap.set(key, {
                campaignId: row.campaign_id, adGroupId: row.ad_group_id,
                entityText: row.customer_search_term,
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

    return performanceMap;
};

/**
 * Main data fetching dispatcher. Determines which specialized function to call based on rule type.
 */
const getPerformanceData = async (rule, campaignIds) => {
    const allTimeWindows = rule.config.conditionGroups.flatMap(g => g.conditions.map(c => c.timeWindow));
    const maxLookbackDays = Math.max(...allTimeWindows, 1);
    const todayStr = getLocalDateString(REPORTING_TIMEZONE);
    const today = new Date(todayStr);

    let performanceMap;
    if (rule.rule_type === 'BID_ADJUSTMENT') {
        performanceMap = await getBidAdjustmentPerformanceData(rule, campaignIds, maxLookbackDays, today);
    } else { // SEARCH_TERM_AUTOMATION
        performanceMap = await getSearchTermAutomationPerformanceData(rule, campaignIds, maxLookbackDays, today);
    }
    
    console.log(`[RulesEngine DBG] Aggregated daily data for ${performanceMap.size} unique entities for rule "${rule.name}".`);
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
    const referenceDate = new Date(getLocalDateString(REPORTING_TIMEZONE));

    const keywordsToProcess = new Map();
    const targetsToProcess = new Map();

    for (const [entityId, data] of performanceData.entries()) {
        if (data.entityType === 'keyword') {
            keywordsToProcess.set(entityId, data);
        } else if (data.entityType === 'target') {
            targetsToProcess.set(entityId, data);
        }
    }
    
    const keywordsWithoutBids = [];
    const targetsWithoutBids = [];

    if (keywordsToProcess.size > 0) {
        try {
            const keywordIds = Array.from(keywordsToProcess.keys());
            const response = await amazonAdsApiRequest({
                method: 'post', url: '/sp/keywords/list', profileId: rule.profile_id,
                data: { keywordIdFilter: { include: keywordIds } },
                headers: { 'Content-Type': 'application/vnd.spKeyword.v3+json', 'Accept': 'application/vnd.spKeyword.v3+json' }
            });
            (response.keywords || []).forEach(kw => {
                const perfData = keywordsToProcess.get(kw.keywordId.toString());
                if (perfData) {
                    if (typeof kw.bid === 'number') {
                        perfData.currentBid = kw.bid;
                    } else {
                        keywordsWithoutBids.push(perfData);
                    }
                }
            });
        } catch (e) { console.error('[RulesEngine] Failed to fetch current keyword bids.', e); }
    }

    if (targetsToProcess.size > 0) {
        try {
            const targetIds = Array.from(targetsToProcess.keys());
            const response = await amazonAdsApiRequest({
                method: 'post', url: '/sp/targets/list', profileId: rule.profile_id,
                data: { targetIdFilter: { include: targetIds } },
                headers: { 'Content-Type': 'application/vnd.spTargetingClause.v3+json', 'Accept': 'application/vnd.spTargetingClause.v3+json' }
            });
            (response.targets || []).forEach(t => {
                const perfData = targetsToProcess.get(t.targetId.toString());
                if (perfData) {
                    if (typeof t.bid === 'number') {
                        perfData.currentBid = t.bid;
                    } else {
                        targetsWithoutBids.push(perfData);
                    }
                }
            });
        } catch (e) { console.error('[RulesEngine] Failed to fetch current target bids.', e); }
    }
    
    const entitiesWithoutBids = [...keywordsWithoutBids, ...targetsWithoutBids];
    if (entitiesWithoutBids.length > 0) {
        console.log(`[RulesEngine] Found ${entitiesWithoutBids.length} entity/entities inheriting bids. Fetching ad group default bids...`);
        // Robustness fix: Filter out any null/undefined ad group IDs before making the API call.
        const adGroupIdsToFetch = [...new Set(entitiesWithoutBids.map(e => e.adGroupId).filter(id => id))];
        
        if (adGroupIdsToFetch.length > 0) {
            try {
                const adGroupResponse = await amazonAdsApiRequest({
                    method: 'post', url: '/sp/adGroups/list', profileId: rule.profile_id,
                    data: { adGroupIdFilter: { include: adGroupIdsToFetch } },
                    headers: { 'Content-Type': 'application/vnd.spAdGroup.v3+json', 'Accept': 'application/vnd.spAdGroup.v3+json' }
                });
        
                const adGroupBidMap = new Map();
                (adGroupResponse.adGroups || []).forEach(ag => {
                    adGroupBidMap.set(ag.adGroupId.toString(), ag.defaultBid);
                });
        
                entitiesWithoutBids.forEach(entity => {
                    const defaultBid = adGroupBidMap.get(entity.adGroupId.toString());
                    if (typeof defaultBid === 'number') {
                        entity.currentBid = defaultBid;
                    } else {
                         console.warn(`[RulesEngine] Could not find default bid for ad group ${entity.adGroupId} for entity ${entity.entityId}`);
                    }
                });
            } catch (e) {
                console.error('[RulesEngine] Failed to fetch ad group default bids.', e);
            }
        } else {
            console.log('[RulesEngine] No valid AdGroup IDs found for fetching default bids.');
        }
    }


    const allEntities = [...keywordsToProcess.values(), ...targetsToProcess.values()];
    for (const entity of allEntities) {
        if (typeof entity.currentBid !== 'number') {
            continue;
        }
        
        for (const group of rule.config.conditionGroups) {
            let allConditionsMet = true;
            for (const condition of group.conditions) {
                const metrics = calculateMetricsForWindow(entity.dailyData, condition.timeWindow, referenceDate);
                if (!checkCondition(metrics[condition.metric], condition.operator, condition.value)) {
                    allConditionsMet = false;
                    break;
                }
            }

            if (allConditionsMet) {
                const { type, value, minBid, maxBid } = group.action;
                if (type === 'adjustBidPercent') {
                    let newBid = entity.currentBid * (1 + (value / 100));

                    if (value < 0) {
                        newBid = Math.floor(newBid * 100) / 100;
                    } else {
                        newBid = Math.ceil(newBid * 100) / 100;
                    }

                    newBid = Math.max(0.02, newBid);

                    if (typeof minBid === 'number') newBid = Math.max(minBid, newBid);
                    if (typeof maxBid === 'number') newBid = Math.min(maxBid, newBid);
                    
                    newBid = parseFloat(newBid.toFixed(2));
                    
                    if (newBid !== entity.currentBid) {
                         const updatePayload = {
                             [entity.entityType === 'keyword' ? 'keywordId' : 'targetId']: entity.entityId,
                             bid: newBid
                         };
                         if (entity.entityType === 'keyword') keywordsToUpdate.push(updatePayload);
                         else targetsToUpdate.push(updatePayload);
                         changeLog.push({ entityId: entity.entityId, entityText: entity.entityText, oldBid: entity.currentBid, newBid });
                    }
                }
                break;
            }
        }
    }

    if (keywordsToUpdate.length > 0) {
        try {
            await amazonAdsApiRequest({
                method: 'put', url: '/sp/keywords', profileId: rule.profile_id,
                data: { keywords: keywordsToUpdate },
                headers: {
                    'Content-Type': 'application/vnd.spKeyword.v3+json',
                    'Accept': 'application/vnd.spKeyword.v3+json'
                }
            });
        } catch(e) { console.error('[RulesEngine] Failed to apply keyword bid updates.', e); }
    }
     if (targetsToUpdate.length > 0) {
        try {
            await amazonAdsApiRequest({
                method: 'put', url: '/sp/targets', profileId: rule.profile_id,
                data: { targets: targetsToUpdate },
                headers: {
                    'Content-Type': 'application/vnd.spTargetingClause.v3+json',
                    'Accept': 'application/vnd.spTargetingClause.v3+json'
                }
            });
        } catch (e) { console.error('[RulesEngine] Failed to apply target bid updates.', e); }
    }

    return {
        summary: `Adjusted bids for ${changeLog.length} target(s)/keyword(s).`,
        details: { changes: changeLog }
    };
};

const evaluateSearchTermAutomationRule = async (rule, performanceData) => {
    const negativesToCreate = [];
    const changeLog = [];
    const referenceDate = new Date(getLocalDateString(REPORTING_TIMEZONE));
    referenceDate.setDate(referenceDate.getDate() - 2); 

    for (const entity of performanceData.values()) {
        for (const group of rule.config.conditionGroups) {
            let allConditionsMet = true;
            for (const condition of group.conditions) {
                const metrics = calculateMetricsForWindow(entity.dailyData, condition.timeWindow, referenceDate);
                 if (!checkCondition(metrics[condition.metric], condition.operator, condition.value)) {
                    allConditionsMet = false;
                    break;
                }
            }

            if (allConditionsMet) {
                const { type, matchType } = group.action;
                if (type === 'negateSearchTerm') {
                    negativesToCreate.push({
                        campaignId: entity.campaignId,
                        adGroupId: entity.adGroupId,
                        keywordText: entity.entityText,
                        matchType: matchType
                    });
                     changeLog.push({
                        searchTerm: entity.entityText,
                        campaignId: entity.campaignId,
                        adGroupId: entity.adGroupId,
                        matchType
                    });
                }
                break;
            }
        }
    }

    if (negativesToCreate.length > 0) {
        try {
            await amazonAdsApiRequest({
                method: 'post', url: '/sp/negativeKeywords', profileId: rule.profile_id,
                data: { negativeKeywords: negativesToCreate },
                headers: {
                    'Content-Type': 'application/vnd.spNegativeKeyword.v3+json',
                    'Accept': 'application/vnd.spNegativeKeyword.v3+json'
                }
            });
        } catch (e) {
            console.error('[RulesEngine] Failed to create negative keywords.', e);
        }
    }

    return {
        summary: `Created ${changeLog.length} new negative keyword(s).`,
        details: { newNegatives: changeLog }
    };
};
// --- Main Orchestration ---

const isRuleDue = (rule) => {
    if (!rule.last_run_at) return true;
    const lastRun = new Date(rule.last_run_at);
    const now = new Date();
    const frequency = rule.config.frequency;
    if (!frequency || !frequency.unit || !frequency.value) return false;
    
    const diffMs = now.getTime() - lastRun.getTime();
    let requiredMs = 0;
    switch (frequency.unit) {
        case 'minutes': requiredMs = frequency.value * 60 * 1000; break;
        case 'hours': requiredMs = frequency.value * 60 * 60 * 1000; break;
        case 'days': requiredMs = frequency.value * 24 * 60 * 60 * 1000; break;
    }
    return diffMs >= requiredMs;
};

const processRule = async (rule) => {
    console.log(`[RulesEngine] ⚙️  Processing rule "${rule.name}" (ID: ${rule.id}).`);
    
    try {
        const campaignIds = rule.scope?.campaignIds || [];
        const performanceData = await getPerformanceData(rule, campaignIds);
        
        let result;
        if (rule.rule_type === 'BID_ADJUSTMENT') {
            result = await evaluateBidAdjustmentRule(rule, performanceData);
        } else if (rule.rule_type === 'SEARCH_TERM_AUTOMATION') {
            result = await evaluateSearchTermAutomationRule(rule, performanceData);
        } else {
             throw new Error(`Unknown rule type: ${rule.rule_type}`);
        }

        if (result && (result.details?.changes?.length > 0 || result.details?.newNegatives?.length > 0)) {
            await logAction(rule, 'SUCCESS', result.summary, result.details);
        } else {
            await logAction(rule, 'NO_ACTION', 'No entities met the rule criteria.');
        }

    } catch (error) {
        console.error(`[RulesEngine] ❌ Error processing rule ${rule.id}:`, error);
        await logAction(rule, 'FAILURE', 'Rule processing failed due to an error.', { error: error.message });
    } finally {
        await pool.query('UPDATE automation_rules SET last_run_at = NOW() WHERE id = $1', [rule.id]);
    }
};

const checkAndRunDueRules = async () => {
    console.log(`[RulesEngine] ⏰ Cron tick: Checking for due rules at ${new Date().toISOString()}`);
    try {
        const { rows: activeRules } = await pool.query('SELECT * FROM automation_rules WHERE is_active = TRUE');
        const dueRules = activeRules.filter(isRuleDue);

        if (dueRules.length === 0) {
            console.log('[RulesEngine] No rules are due to run.');
            return;
        }

        console.log(`[RulesEngine] Found ${dueRules.length} rule(s) to run.`);
        for (const rule of dueRules) {
            await processRule(rule);
        }
    } catch (e) {
        console.error('[RulesEngine] CRITICAL: Failed to fetch or process rules.', e);
    }
};

export const startRulesEngine = () => {
    if (mainTask) {
        console.warn('[RulesEngine] Engine is already running. Skipping new start.');
        return;
    }
    console.log('[RulesEngine] 🚀 Starting the automation rules engine...');
    // Run every minute to check for due rules
    mainTask = cron.schedule('* * * * *', checkAndRunDueRules, {
        scheduled: true,
        timezone: "UTC"
    });
};

export const stopRulesEngine = () => {
    if (mainTask) {
        console.log('[RulesEngine] 🛑 Stopping the automation rules engine.');
        mainTask.stop();
        mainTask = null;
    }
};

// Graceful shutdown
process.on('SIGINT', () => {
  stopRulesEngine();
  pool.end(() => {
    console.log('[RulesEngine] PostgreSQL pool has been closed.');
    process.exit(0);
  });
});