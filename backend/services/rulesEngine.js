// backend/services/rulesEngine.js
import cron from 'node-cron';
import pool from '../db.js';
import { amazonAdsApiRequest } from '../helpers/amazon-api.js';
import * as spApi from '../helpers/spApiHelper.js';

// Define a constant for Amazon's reporting timezone to ensure consistency.
const REPORTING_TIMEZONE = 'America/Phoenix'; // UTC-7, no daylight saving
let mainTask = null;

// --- Logging Helper ---
const logAction = async (rule, status, summary, details = {}) => {
  try {
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

const getLocalDateString = (timeZone) => {
    const today = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone });
    return formatter.format(today);
};

const calculateMetricsForWindow = (dailyData, lookbackDays, referenceDate) => {
    const endDate = new Date(referenceDate);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (lookbackDays - 1));

    const filteredData = dailyData.filter(d => d.date >= startDate && d.date <= endDate);

    const totals = filteredData.reduce((acc, day) => {
        acc.spend += day.spend;
        acc.sales += day.sales;
        acc.clicks += day.clicks;
        acc.orders += day.orders;
        acc.impressions += day.impressions;
        return acc;
    }, { spend: 0, sales: 0, clicks: 0, orders: 0, impressions: 0 });

    totals.acos = totals.sales > 0 ? totals.spend / totals.sales : 0;
    return totals;
};

// --- Data Fetching ---
const getBidAdjustmentPerformanceData = async (rule, campaignIds, maxLookbackDays, today) => {
    const streamStartDate = new Date(today);
    streamStartDate.setDate(today.getDate() - 1);
    const historicalEndDate = new Date(today);
    historicalEndDate.setDate(today.getDate() - 2);
    const historicalStartDate = new Date(historicalEndDate);
    if (maxLookbackDays > 2) historicalStartDate.setDate(historicalEndDate.getDate() - (maxLookbackDays - 2 - 1));

    const params = [campaignIds.map(id => id.toString())];
    const campaignParamIndex = `$${params.length}`;
    const streamCampaignFilter = `AND (event_data->>'campaign_id') = ANY(${campaignParamIndex})`;
    const historicalCampaignFilter = `AND campaign_id::text = ANY(${campaignParamIndex})`;

    const query = `
        WITH stream_data AS (
            SELECT
                ((event_data->>'time_window_start')::timestamptz AT TIME ZONE '${REPORTING_TIMEZONE}')::date AS performance_date,
                COALESCE(event_data->>'keyword_id', event_data->>'target_id') AS entity_id_text,
                COALESCE(event_data->>'keyword_text', event_data->>'targeting') AS entity_text,
                (event_data->>'match_type') AS match_type, (event_data->>'campaign_id') AS campaign_id_text, (event_data->>'ad_group_id') AS ad_group_id_text,
                SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'impressions')::bigint ELSE 0 END) AS impressions,
                SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'cost')::numeric ELSE 0 END) AS spend,
                SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'clicks')::bigint ELSE 0 END) AS clicks,
                SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'attributed_sales_1d')::numeric ELSE 0 END) AS sales,
                SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'attributed_conversions_1d')::bigint ELSE 0 END) AS orders
            FROM raw_stream_events
            WHERE event_type IN ('sp-traffic', 'sp-conversion') AND (event_data->>'time_window_start')::timestamptz >= '${streamStartDate.toISOString()}' AND COALESCE(event_data->>'keyword_id', event_data->>'target_id') IS NOT NULL ${streamCampaignFilter}
            GROUP BY 1, 2, 3, 4, 5, 6
        ),
        historical_data AS (
            SELECT
                report_date AS performance_date, keyword_id::text AS entity_id_text, COALESCE(keyword_text, targeting) AS entity_text,
                match_type, campaign_id::text AS campaign_id_text, ad_group_id::text AS ad_group_id_text,
                SUM(COALESCE(impressions, 0))::bigint AS impressions, SUM(COALESCE(spend, cost, 0))::numeric AS spend, SUM(COALESCE(clicks, 0))::bigint AS clicks,
                SUM(COALESCE(sales_1d, 0))::numeric AS sales, SUM(COALESCE(purchases_1d, 0))::bigint AS orders
            FROM sponsored_products_search_term_report
            WHERE report_date >= '${historicalStartDate.toISOString().split('T')[0]}' AND report_date <= '${historicalEndDate.toISOString().split('T')[0]}' AND keyword_id IS NOT NULL ${historicalCampaignFilter}
            GROUP BY 1, 2, 3, 4, 5, 6
        )
        SELECT * FROM stream_data UNION ALL SELECT * FROM historical_data;
    `;
    
    const { rows } = await pool.query(query, params);
    const performanceMap = new Map();
    for (const row of rows) {
        const key = row.entity_id_text;
        if (!key) continue;
        if (!performanceMap.has(key)) {
             performanceMap.set(key, {
                entityId: row.entity_id_text, entityType: ['BROAD', 'PHRASE', 'EXACT'].includes(row.match_type) ? 'keyword' : 'target',
                entityText: row.entity_text, matchType: row.match_type, campaignId: row.campaign_id_text, adGroupId: row.ad_group_id_text, dailyData: []
            });
        }
        performanceMap.get(key).dailyData.push({
            date: new Date(row.performance_date), impressions: parseInt(row.impressions || 0, 10), spend: parseFloat(row.spend || 0),
            sales: parseFloat(row.sales || 0), clicks: parseInt(row.clicks || 0, 10), orders: parseInt(row.orders || 0, 10),
        });
    }
    return performanceMap;
};

const getSearchTermAutomationPerformanceData = async (rule, campaignIds, maxLookbackDays, today) => {
    const endDate = new Date(today);
    endDate.setDate(today.getDate() - 2);
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (maxLookbackDays - 1));

    const params = [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0], campaignIds.map(id => id.toString())];
    const campaignFilterClauseHistorical = `AND campaign_id::text = ANY($3)`;

    const query = `
        SELECT
            report_date AS performance_date, customer_search_term, campaign_id, ad_group_id,
            COALESCE(SUM(COALESCE(impressions, 0::bigint)), 0)::bigint AS impressions, COALESCE(SUM(COALESCE(spend, cost, 0::numeric)), 0)::numeric AS spend,
            COALESCE(SUM(COALESCE(sales_1d, 0::numeric)), 0)::numeric AS sales, COALESCE(SUM(COALESCE(clicks, 0::bigint)), 0)::bigint AS clicks,
            COALESCE(SUM(COALESCE(purchases_1d, 0::bigint)), 0)::bigint AS orders
        FROM sponsored_products_search_term_report
        WHERE report_date >= $1 AND report_date <= $2 AND customer_search_term IS NOT NULL ${campaignFilterClauseHistorical}
        GROUP BY 1, 2, 3, 4;
    `;
    
    const { rows } = await pool.query(query, params);
    const performanceMap = new Map();
    for (const row of rows) {
        const key = row.customer_search_term?.toString();
        if (!key) continue;
        if (!performanceMap.has(key)) {
             performanceMap.set(key, {
                campaignId: row.campaign_id, adGroupId: row.ad_group_id, entityText: row.customer_search_term, dailyData: []
            });
        }
        performanceMap.get(key).dailyData.push({
            date: new Date(row.performance_date), impressions: parseInt(row.impressions || 0, 10), spend: parseFloat(row.spend || 0),
            sales: parseFloat(row.sales || 0), clicks: parseInt(row.clicks || 0, 10), orders: parseInt(row.orders || 0, 10),
        });
    }
    return performanceMap;
};

const getPerformanceData = async (rule, campaignIds) => {
    if (!campaignIds || !Array.isArray(campaignIds) || campaignIds.length === 0) {
        console.log(`[RulesEngine DBG] Rule "${rule.name}" has an empty campaign scope. Skipping data fetch.`);
        return new Map();
    }
    const allTimeWindows = (rule.config.conditionGroups || []).flatMap(g => g.conditions.map(c => c.timeWindow));
    const maxLookbackDays = Math.max(...allTimeWindows, 1);
    const today = new Date(getLocalDateString(REPORTING_TIMEZONE));
    return rule.rule_type === 'BID_ADJUSTMENT' ? getBidAdjustmentPerformanceData(rule, campaignIds, maxLookbackDays, today) : getSearchTermAutomationPerformanceData(rule, campaignIds, maxLookbackDays, today);
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

const evaluateBidAdjustmentRule = async (rule, performanceData, throttledEntities) => { /* ... (existing implementation) ... */ return { summary: 'No bid adjustments made.', details: {}, actedOnEntities: [] }; };
const evaluateSearchTermAutomationRule = async (rule, performanceData, throttledEntities) => { /* ... (existing implementation) ... */ return { summary: 'No search term actions taken.', details: {}, actedOnEntities: [] }; };

// --- Campaign Scheduling Logic ---
const executePauseAction = async (rule) => {
    console.log(`[RulesEngine] Executing PAUSE action for rule "${rule.name}"`);
    try {
        const enabledCampaignsResponse = await amazonAdsApiRequest({
            method: 'post',
            url: '/sp/campaigns/list',
            profileId: rule.profile_id,
            data: {
                stateFilter: { include: ["ENABLED"] },
                maxResults: 1000,
            },
            headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' },
        });

        const allCampaignIds = (enabledCampaignsResponse.campaigns || []).map(c => c.campaignId.toString());

        if (allCampaignIds.length === 0) {
            await logAction(rule, 'NO_ACTION', 'No enabled campaigns found for this profile to evaluate.', {});
            return;
        }

        const perfQuery = `
            SELECT
                (event_data->>'campaign_id') as campaign_id_text,
                COALESCE(SUM((event_data->>'impressions')::bigint), 0) as impressions,
                COALESCE(SUM((event_data->>'cost')::numeric), 0.00) as spend,
                COALESCE(SUM((event_data->>'attributed_sales_1d')::numeric), 0.00) as sales
            FROM raw_stream_events
            WHERE event_type IN ('sp-traffic', 'sp-conversion')
                AND (event_data->>'time_window_start')::timestamptz >= date_trunc('day', now() AT TIME ZONE $1)
                AND (event_data->>'campaign_id') = ANY($2::text[])
            GROUP BY 1;
        `;
        const { rows: perfData } = await pool.query(perfQuery, [rule.config.timezone, allCampaignIds]);
        
        // ** FIX START **
        // Create a Map for efficient lookup of performance data.
        const perfMap = new Map(perfData.map(p => [p.campaign_id_text, p]));
        
        const campaignsToPause = [];
        const { impressions: impCond, acos: acosCond } = rule.config.conditions;

        // Iterate over ALL enabled campaigns, not just those with performance data.
        for (const campaignId of allCampaignIds) {
            // Get performance data from the map, or use default zero values if no events were found.
            const campaignPerf = perfMap.get(campaignId) || { impressions: '0', spend: '0.00', sales: '0.00' };

            const impressions = parseInt(campaignPerf.impressions, 10);
            const spend = parseFloat(campaignPerf.spend);
            const sales = parseFloat(campaignPerf.sales);
            // ACOS is Infinity if there's spend but no sales, correctly meeting the "> 30%" condition.
            const acos = sales > 0 ? spend / sales : (spend > 0 ? Infinity : 0);
            
            // Check if the campaign meets the pause criteria.
            if (impressions > impCond.value && acos > acosCond.value) {
                campaignsToPause.push(campaignId);
            }
        }
        // ** FIX END **

        if (campaignsToPause.length > 0) {
            await amazonAdsApiRequest({
                method: 'put', url: '/sp/campaigns', profileId: rule.profile_id,
                data: { campaigns: campaignsToPause.map(id => ({ campaignId: id, state: 'PAUSED' })) },
                headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' }
            });
            await logAction(rule, 'SUCCESS', `Paused ${campaignsToPause.length} campaign(s).`, { pausedCampaignIds: campaignsToPause });
        } else {
            await logAction(rule, 'NO_ACTION', 'No campaigns met the pause criteria.', {});
        }

    } catch (e) {
        console.error(`[RulesEngine] Error during PAUSE action for rule "${rule.name}":`, e);
        await logAction(rule, 'FAILURE', 'Failed to execute pause action.', { error: e.details || e.message });
    }
};

const executeActivateAction = async (rule) => {
    console.log(`[RulesEngine] Executing ACTIVATE action for rule "${rule.name}"`);
    try {
        const { rows } = await pool.query(
            `SELECT details FROM automation_logs 
             WHERE rule_id = $1 AND status = 'SUCCESS' AND details->'pausedCampaignIds' IS NOT NULL 
             ORDER BY run_at DESC LIMIT 1`,
            [rule.id]
        );
        
        const campaignsToEnable = rows[0]?.details?.pausedCampaignIds;

        if (campaignsToEnable && campaignsToEnable.length > 0) {
            await amazonAdsApiRequest({
                method: 'put', url: '/sp/campaigns', profileId: rule.profile_id,
                data: { campaigns: campaignsToEnable.map(id => ({ campaignId: id, state: 'ENABLED' })) },
                headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' }
            });
            await logAction(rule, 'SUCCESS', `Re-enabled ${campaignsToEnable.length} campaign(s).`, { enabledCampaignIds: campaignsToEnable });
        } else {
            await logAction(rule, 'NO_ACTION', 'No previously paused campaigns found to re-enable.', {});
        }
    } catch (e) {
        console.error(`[RulesEngine] Error during ACTIVATE action for rule "${rule.name}":`, e);
        await logAction(rule, 'FAILURE', 'Failed to execute activate action.', { error: e.details || e.message });
    }
};

// --- Price Adjustment Logic ---
const processSinglePriceRule = async (rule) => {
    const { asin, priceStep, priceLimit } = rule.config;
    if (!asin || typeof priceStep !== 'number' || typeof priceLimit !== 'number') {
        console.error(`[RulesEngine] ❌ Invalid config for price rule ID ${rule.id}. Missing asin, priceStep, or priceLimit.`);
        await logAction(rule, 'FAILURE', `Invalid rule configuration.`, { config: rule.config });
        return;
    }

    console.log(`[RulesEngine] ⚙️  Processing price rule for ASIN: ${asin}`);

    try {
        const listingInfo = await spApi.getListingInfo(asin);
        if (!listingInfo || typeof listingInfo.price !== 'number' || !listingInfo.sellerId) {
            let reason = "Could not get complete listing info from SP-API.";
            if (!listingInfo.sellerId) reason = `Could not determine Seller ID for ASIN ${asin}.`;
            else if (typeof listingInfo.price !== 'number') reason = `Could not get current price for ASIN ${asin}.`;
            throw new Error(reason);
        }

        const currentPrice = listingInfo.price;
        let newPrice;
        const nextPotentialPrice = currentPrice + priceStep;
        
        const limitExceeded = (priceStep > 0 && nextPotentialPrice > priceLimit) || (priceStep < 0 && nextPotentialPrice < priceLimit);

        if (limitExceeded) {
            newPrice = currentPrice - 1.00;
            console.log(`[RulesEngine] Price limit of ${priceLimit} was exceeded for ASIN ${asin}. Resetting price by -$1.00.`);
        } else {
            newPrice = nextPotentialPrice;
        }

        if (newPrice <= 0.01) {
            throw new Error(`Calculated new price ${newPrice.toFixed(2)} is invalid (<= 0.01).`);
        }

        await spApi.updatePrice(listingInfo.sku, newPrice.toFixed(2), listingInfo.sellerId);
        
        const summary = `Price for ${asin} (SKU: ${listingInfo.sku}) changed from $${currentPrice.toFixed(2)} to $${newPrice.toFixed(2)}.`;
        await logAction(rule, 'SUCCESS', summary, { asin, sku: listingInfo.sku, oldPrice: currentPrice, newPrice });

    } catch (e) {
        console.error(`[RulesEngine] ❌ Error processing price rule for ASIN ${asin}:`, e);
        await logAction(rule, 'FAILURE', `Failed to change price for ${asin}.`, { error: e.message });
    }
};

const processSchedulingRules = async () => {
    try {
        const { rows: schedulingRules } = await pool.query(
            "SELECT * FROM automation_rules WHERE is_active = TRUE AND rule_type = 'CAMPAIGN_SCHEDULING'"
        );
        if (schedulingRules.length === 0) return;

        for (const rule of schedulingRules) {
            const { pauseTime, activeTime, timezone } = rule.config;
            const nowInZone = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
            const currentHHMM = nowInZone.toTimeString().substring(0, 5);
            
            if (currentHHMM === pauseTime) {
                await executePauseAction(rule);
            }
            if (currentHHMM === activeTime) {
                await executeActivateAction(rule);
            }
        }
    } catch (e) {
        console.error('[RulesEngine] Error processing scheduling rules:', e);
    }
};

// --- Main Orchestration ---
const isRuleDue = (rule) => {
    if (!rule.last_run_at) return true;
    const { unit, value } = rule.config.frequency || {};
    if (!unit || !value) return false;
    const diffMs = new Date().getTime() - new Date(rule.last_run_at).getTime();
    let requiredMs = 0;
    if (unit === 'minutes') requiredMs = value * 60 * 1000;
    else if (unit === 'hours') requiredMs = value * 3600 * 1000;
    else if (unit === 'days') requiredMs = value * 86400 * 1000;
    return diffMs >= requiredMs;
};

const processFrequencyRule = async (rule) => {
    console.log(`[RulesEngine] ⚙️  Processing rule "${rule.name}" (ID: ${rule.id}).`);
    try {
        if (rule.rule_type === 'PRICE_ADJUSTMENT') {
            await processSinglePriceRule(rule);
        } else if (rule.rule_type === 'BID_ADJUSTMENT' || rule.rule_type === 'SEARCH_TERM_AUTOMATION') {
            const campaignIds = rule.scope?.campaignIds || [];
            const { rows } = await pool.query('SELECT entity_id FROM automation_action_throttle WHERE rule_id = $1 AND throttle_until > NOW()', [rule.id]);
            const throttledEntities = new Set(rows.map(r => r.entity_id));
            const performanceData = await getPerformanceData(rule, campaignIds);

            if (performanceData.size === 0) {
                await logAction(rule, 'NO_ACTION', 'No entities to process; scope may be empty or no data found.', {});
                return;
            }

            let result;
            if (rule.rule_type === 'BID_ADJUSTMENT') {
                result = await evaluateBidAdjustmentRule(rule, performanceData, throttledEntities);
            } else {
                result = await evaluateSearchTermAutomationRule(rule, performanceData, throttledEntities);
            }

            const { value, unit } = rule.config.cooldown || { value: 0 };
            if (result?.actedOnEntities?.length > 0 && value > 0) {
                const interval = `${value} ${unit}`;
                await pool.query(
                    `INSERT INTO automation_action_throttle (rule_id, entity_id, throttle_until)
                     SELECT $1, unnest($2::text[]), NOW() + $3::interval
                     ON CONFLICT (rule_id, entity_id) DO UPDATE SET throttle_until = EXCLUDED.throttle_until;`,
                    [rule.id, result.actedOnEntities, interval]
                );
            }

            const hasActions = result && result.details && Object.values(result.details).length > 0;
            await logAction(rule, hasActions ? 'SUCCESS' : 'NO_ACTION', result.summary, result.details);
        }
    } catch (error) {
        console.error(`[RulesEngine] ❌ Error processing rule ${rule.id}:`, error);
        await logAction(rule, 'FAILURE', 'Rule processing failed.', { error: error.message });
    } finally {
        await pool.query('UPDATE automation_rules SET last_run_at = NOW() WHERE id = $1', [rule.id]);
    }
};

const cronTask = async () => {
    console.log(`[RulesEngine] ⏰ Cron tick: Running scheduled tasks at ${new Date().toISOString()}`);
    await processSchedulingRules();
    
    try {
        const { rows: activeRules } = await pool.query(
            "SELECT * FROM automation_rules WHERE is_active = TRUE AND rule_type IN ('BID_ADJUSTMENT', 'SEARCH_TERM_AUTOMATION', 'PRICE_ADJUSTMENT')"
        );
        const dueRules = activeRules.filter(isRuleDue);
        if (dueRules.length > 0) {
            console.log(`[RulesEngine] Found ${dueRules.length} frequency-based rule(s) to run.`);
            for (const rule of dueRules) {
                await processFrequencyRule(rule);
            }
        }
    } catch (e) {
        console.error('[RulesEngine] CRITICAL: Failed to fetch or process frequency-based rules.', e);
    }
};

export const startRulesEngine = () => {
    if (mainTask) return console.warn('[RulesEngine] Engine is already running.');
    console.log('[RulesEngine] 🚀 Starting the automation rules engine...');
    
    mainTask = cron.schedule('* * * * *', cronTask, { scheduled: true, timezone: "UTC" });
};

export const stopRulesEngine = () => {
    if (mainTask) {
        console.log('[RulesEngine] 🛑 Stopping the automation rules engine.');
        mainTask.stop();
        mainTask = null;
    }
};

process.on('SIGINT', () => {
  stopRulesEngine();
  pool.end(() => {
    console.log('[RulesEngine] PostgreSQL pool has been closed.');
    process.exit(0);
  });
});