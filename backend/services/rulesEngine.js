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
 * Fetches performance data for BID_ADJUSTMENT rules.
 * Uses a hybrid model: historical data (>2 days old) and stream data (<2 days old).
 */
const getBidAdjustmentPerformanceData = async (rule, campaignIds, maxLookbackDays, today) => {
    const streamCutoffDate = new Date(today);
    streamCutoffDate.setDate(today.getDate() - 2);

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (maxLookbackDays - 1));
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const streamCutoffDateStr = streamCutoffDate.toISOString().split('T')[0];

    const params = [startDateStr, streamCutoffDateStr];
    let campaignFilterClauseHistorical = '';
    let campaignFilterClauseStream = '';

    if (campaignIds && campaignIds.length > 0) {
        params.push(campaignIds);
        const campaignParamIndex = `$${params.length}`;
        campaignFilterClauseHistorical = `AND campaign_id = ANY(${campaignParamIndex})`;
        campaignFilterClauseStream = `AND (event_data->>'campaignId')::bigint = ANY(${campaignParamIndex})`;
    }
    
    const query = `
        SELECT
            performance_date, entity_id, entity_type, entity_text, match_type,
            campaign_id, ad_group_id, spend, sales, clicks, orders
        FROM (
            -- Historical data from Search Term Report
            SELECT
                report_date AS performance_date, keyword_id AS entity_id,
                CASE WHEN match_type IN ('BROAD', 'PHRASE', 'EXACT') THEN 'keyword' ELSE 'target' END AS entity_type,
                targeting AS entity_text, match_type, campaign_id, ad_group_id,
                SUM(COALESCE(spend, cost, 0))::numeric AS spend, SUM(COALESCE(sales_7d, 0))::numeric AS sales,
                SUM(COALESCE(clicks, 0))::bigint AS clicks, SUM(COALESCE(purchases_7d, 0))::bigint AS orders
            FROM sponsored_products_search_term_report
            WHERE report_date >= $1 AND report_date < $2 AND keyword_id IS NOT NULL ${campaignFilterClauseHistorical}
            GROUP BY 1, 2, 3, 4, 5, 6, 7
            UNION ALL
            -- Stream data
            SELECT
                ((event_data->>'timeWindowStart')::timestamptz AT TIME ZONE '${REPORTING_TIMEZONE}')::date AS performance_date,
                COALESCE((event_data->>'keywordId')::bigint, (event_data->>'targetId')::bigint) AS entity_id,
                CASE WHEN event_data->>'keywordId' IS NOT NULL THEN 'keyword' ELSE 'target' END AS entity_type,
                COALESCE(event_data->>'keywordText', event_data->>'targetingExpression', event_data->>'targetingText') AS entity_text,
                event_data->>'matchType' AS match_type, (event_data->>'campaignId')::bigint AS campaign_id,
                (event_data->>'adGroupId')::bigint AS ad_group_id,
                SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'cost')::numeric ELSE 0 END) AS spend,
                SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'attributedSales1d')::numeric ELSE 0 END) AS sales,
                SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'clicks')::bigint ELSE 0 END) AS clicks,
                SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'conversions')::bigint ELSE 0 END) AS orders
            FROM raw_stream_events
            WHERE (event_data->>'timeWindowStart')::timestamptz >= (($2)::timestamp AT TIME ZONE '${REPORTING_TIMEZONE}')
                AND (event_data->>'keywordId' IS NOT NULL OR event_data->>'targetId' IS NOT NULL) ${campaignFilterClauseStream}
            GROUP BY 1, 2, 3, 4, 5, 6, 7
        ) AS daily_data;
    `;

    const { rows } = await pool.query(query, params);
    
    const performanceMap = new Map();
    for (const row of rows) {
        const key = row.entity_id?.toString();
        if (!key) continue;

        if (!performanceMap.has(key)) {
             performanceMap.set(key, {
                campaignId: row.campaign_id, adGroupId: row.ad_group_id,
                entityId: row.entity_id, entityType: row.entity_type,
                entityText: row.entity_text, matchType: row.match_type,
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
            COALESCE(SUM(COALESCE(sales_7d, 0)), 0)::numeric AS sales,
            COALESCE(SUM(clicks), 0)::bigint AS clicks,
            COALESCE(SUM(purchases_7d, 0))::bigint AS orders
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

    // --- Step 1: Classify all actionable entities ---
    const keywordsToProcess = new Map();
    const targetsToProcess = new Map();