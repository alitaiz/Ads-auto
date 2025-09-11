// backend/services/rulesEngine.js

import cron from 'node-cron';
import pool from '../db.js';
import { amazonAdsApiRequest } from '../helpers/amazon-api.js';

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

/**
 * Fetches performance data for keywords or search terms using a hybrid strategy.
 * This is the core data gathering function for the entire engine.
 * @param {string} entityType - 'keyword' or 'searchTerm'
 * @param {object} rule - The automation rule object to determine lookback periods.
 * @returns {Promise<Map<string, object>>} - A map of entities with their aggregated performance metrics.
 */
const getPerformanceData = async (entityType, rule) => {
    // Determine the maximum lookback period needed by analyzing all timeWindow values in the rule's conditions.
    const allTimeWindows = rule.config.conditionGroups.flatMap(g => g.conditions.map(c => c.timeWindow));
    const maxLookbackDays = Math.max(...allTimeWindows, 1);

    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - maxLookbackDays);
    
    // Data older than 3 days is considered stable and comes from reports.
    const splitDate = new Date();
    splitDate.setDate(today.getDate() - 3);

    const startDateStr = startDate.toISOString().split('T')[0];
    const splitDateStr = splitDate.toISOString().split('T')[0];

    // Determine which columns to group by based on whether we're analyzing keywords or search terms.
    const entityColumns = {
        keyword: { id: 'keyword_id', text: 'keyword_text', groupBy: 'keyword_id, keyword_text' },
        searchTerm: { id: 'customer_search_term', text: 'customer_search_term', groupBy: 'customer_search_term' }
    };
    const entityConfig = entityColumns[entityType];

    const query = `
        WITH combined_data AS (
            -- 1. Data from historical, aggregated reports (older than 3 days)
            SELECT
                campaign_id, ad_group_id, keyword_id, keyword_text, customer_search_term,
                SUM(COALESCE(spend, cost, 0))::numeric AS spend,
                SUM(COALESCE(sales_7d, 0))::numeric AS sales,
                SUM(COALESCE(clicks, 0))::bigint AS clicks,
                SUM(COALESCE(purchases_7d, 0))::bigint AS orders
            FROM sponsored_products_search_term_report
            WHERE report_date >= $1 AND report_date < $2
            GROUP BY 1, 2, 3, 4, 5

            UNION ALL

            -- 2. Data from real-time stream events (last 3 days)
            SELECT
                (event_data->>'campaignId')::bigint AS campaign_id,
                (event_data->>'adGroupId')::bigint AS ad_group_id,
                (event_data->>'keywordId')::bigint AS keyword_id,
                (event_data->>'keywordText') AS keyword_text,
                (event_data->>'searchTerm') AS customer_search_term,
                SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'cost')::numeric ELSE 0 END) AS spend,
                SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'attributedSales1d')::numeric ELSE 0 END) AS sales,
                SUM(CASE WHEN event_type = 'sp-traffic' THEN (event_data->>'clicks')::bigint ELSE 0 END) AS clicks,
                SUM(CASE WHEN event_type = 'sp-conversion' THEN (event_data->>'conversions')::bigint ELSE 0 END) AS orders
            FROM raw_stream_events
            WHERE (event_data->>'timeWindowStart')::timestamptz >= $2
            GROUP BY 1, 2, 3, 4, 5
        ),
        final_aggregation AS (
            SELECT
                campaign_id, ad_group_id, keyword_id, keyword_text, customer_search_term,
                SUM(spend) AS spend, SUM(sales) AS sales, SUM(clicks) AS clicks, SUM(orders) AS orders
            FROM combined_data
            WHERE ${entityConfig.id} IS NOT NULL
            GROUP BY 1, 2, 3, 4, 5
        )
        SELECT
            campaign_id, ad_group_id, ${entityConfig.groupBy},
            SUM(spend) AS total_spend, SUM(sales) AS total_sales,
            SUM(clicks) AS total_clicks, SUM(orders) AS total_orders
        FROM final_aggregation
        WHERE ${entityConfig.id} IS NOT NULL
        GROUP BY campaign_id, ad_group_id, ${entityConfig.groupBy};
    `;

    const { rows } = await pool.query(query, [startDateStr, splitDateStr]);

    const performanceMap = new Map();
    for (const row of rows) {
        const key = (entityType === 'keyword' ? row.keyword_id : row.customer_search_term)?.toString();
        if (!key) continue;

        performanceMap.set(key, {
            campaignId: row.campaign_id,
            adGroupId: row.ad_group_id,
            keywordId: row.keyword_id,
            keywordText: row.keyword_text,
            searchTerm: row.customer_search_term,
            metrics: {
                spend: parseFloat(row.total_spend || 0),
                sales: parseFloat(row.total_sales || 0),
                clicks: parseInt(row.total_clicks || 0, 10),
                orders: parseInt(row.total_orders || 0, 10),
                acos: parseFloat(row.total_sales) > 0 ? parseFloat(row.total_spend) / parseFloat(row.total_sales) : 0,
            }
        });
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

const evaluateBidAdjustmentRule = async (rule) => {
    console.log(`[RulesEngine] Evaluating Bid Adjustment Rule: "${rule.name}"`);
    const performanceData = await getPerformanceData('keyword', rule);
    if (performanceData.size === 0) {
        return logAction(rule, 'NO_ACTION', 'No keyword performance data found for the lookback period.');
    }
    
    const bidUpdates = [];
    const changeLog = [];
    
    const keywordIds = Array.from(performanceData.keys());
    const keywordsResponse = await amazonAdsApiRequest({
        method: 'post', url: '/sp/keywords/list', profileId: rule.profile_id,
        data: { keywordIdFilter: { include: keywordIds } }
    });
    const currentBids = new Map(keywordsResponse.keywords.map(kw => [kw.keywordId.toString(), kw.bid]));

    for (const [keywordId, data] of performanceData.entries()) {
        const currentBid = currentBids.get(keywordId);
        if (typeof currentBid !== 'number') continue;

        for (const group of rule.config.conditionGroups) {
            const conditionsMet = group.conditions.every(cond => 
                checkCondition(data.metrics[cond.metric], cond.operator, cond.value)
            );
            
            if (conditionsMet) {
                const { value, minBid, maxBid } = group.action;
                let newBid = currentBid * (1 + (value / 100));
                
                if (minBid !== undefined && minBid !== null) newBid = Math.max(minBid, newBid);
                if (maxBid !== undefined && maxBid !== null) newBid = Math.min(maxBid, newBid);
                
                newBid = parseFloat(newBid.toFixed(2));
                
                if (newBid !== currentBid) {
                    bidUpdates.push({ keywordId: parseInt(keywordId, 10), bid: newBid });
                    changeLog.push({ keyword: data.keywordText, oldBid: currentBid, newBid });
                }
                break; 
            }
        }
    }

    if (bidUpdates.length > 0) {
        console.log(`[RulesEngine] Rule "${rule.name}" triggered ${bidUpdates.length} bid updates.`);
        await amazonAdsApiRequest({
            method: 'put', url: '/sp/keywords', profileId: rule.profile_id,
            data: { keywords: bidUpdates }
        });
        await logAction(rule, 'SUCCESS', `Adjusted bids for ${bidUpdates.length} keywords.`, { changes: changeLog });
    } else {
        await logAction(rule, 'NO_ACTION', 'No keywords met conditions in any group.');
    }
};

const evaluateSearchTermAutomationRule = async (rule) => {
    console.log(`[RulesEngine] Evaluating Search Term Rule: "${rule.name}"`);
    const performanceData = await getPerformanceData('searchTerm', rule);
    if (performanceData.size === 0) {
        return logAction(rule, 'NO_ACTION', 'No search term performance data found for the lookback period.');
    }

    const negativeKeywordsToAdd = [];
    const changeLog = [];

    for (const [searchTerm, data] of performanceData.entries()) {
        for (const group of rule.config.conditionGroups) {
            const conditionsMet = group.conditions.every(cond => 
                checkCondition(data.metrics[cond.metric], cond.operator, cond.value)
            );

            if (conditionsMet) {
                if (group.action.type === 'negateSearchTerm') {
                    negativeKeywordsToAdd.push({
                        campaignId: data.campaignId,
                        adGroupId: data.adGroupId,
                        keywordText: searchTerm,
                        matchType: group.action.matchType
                    });
                    changeLog.push({ searchTerm, campaignId: data.campaignId, matchType: group.action.matchType });
                }
                break;
            }
        }
    }

    if (negativeKeywordsToAdd.length > 0) {
        console.log(`[RulesEngine] Rule "${rule.name}" triggered ${negativeKeywordsToAdd.length} negative keyword additions.`);
        await amazonAdsApiRequest({
            method: 'post', url: '/negativeKeywords', profileId: rule.profile_id,
            data: { negativeKeywords: negativeKeywordsToAdd }
        });
        await logAction(rule, 'SUCCESS', `Created ${negativeKeywordsToAdd.length} negative keywords.`, { changes: changeLog });
    } else {
        await logAction(rule, 'NO_ACTION', 'No search terms met conditions in any group.');
    }
};

// --- Main Engine Orchestrator ---

const runAllRules = async () => {
    console.log(`[RulesEngine] Starting evaluation cycle at ${new Date().toISOString()}`);
    let client;
    try {
        client = await pool.connect();
        const { rows: activeRules } = await client.query('SELECT * FROM automation_rules WHERE is_active = true');
        
        console.log(`[RulesEngine] Found ${activeRules.length} active rules to evaluate.`);
        for (const rule of activeRules) {
            try {
                await client.query('BEGIN');
                
                if (rule.rule_type === 'BID_ADJUSTMENT') {
                    await evaluateBidAdjustmentRule(rule);
                } else if (rule.rule_type === 'SEARCH_TERM_AUTOMATION') {
                    await evaluateSearchTermAutomationRule(rule);
                }
                
                await client.query('UPDATE automation_rules SET last_run_at = NOW() WHERE id = $1', [rule.id]);
                await client.query('COMMIT');
            } catch (ruleError) {
                await client.query('ROLLBACK');
                console.error(`[RulesEngine] FAILED evaluation for rule "${rule.name}" (ID: ${rule.id}). Error:`, ruleError.message);
                await logAction(rule, 'FAILURE', 'Rule evaluation failed due to an internal error.', { error: ruleError.message });
            }
        }
    } catch (e) {
        console.error('[RulesEngine] A critical error occurred during the main evaluation cycle:', e);
    } finally {
        if (client) client.release();
        console.log(`[RulesEngine] Evaluation cycle finished at ${new Date().toISOString()}`);
    }
};

// Cron job to run the engine every hour at the 5-minute mark
export const startRulesEngine = () => {
  console.log('[RulesEngine] Scheduled to run every hour at the 5-minute mark.');
  cron.schedule('5 * * * *', runAllRules, {
    scheduled: true,
    timezone: "America/Phoenix" // Use a timezone that doesn't observe DST to be consistent
  });
};
