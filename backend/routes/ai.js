// backend/routes/ai.js
import express from 'express';
import pool from '../db.js';
import { GoogleGenAI } from '@google/genai';
import { OpenAI } from 'openai';

const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });


// --- Helper Functions for Server-Side Data Fetching ---

async function fetchSearchTermDataForAI(asin, dateRange) {
    if (!asin || !dateRange?.startDate || !dateRange?.endDate) {
        console.log('[AI Server Fetch] Skipping Search Term: Missing params.');
        return { data: [], dateRange: null };
    }
    const { startDate, endDate } = dateRange;
    try {
        const dateRangeResult = await pool.query(`
            SELECT MIN(report_date) as "minDate", MAX(report_date) as "maxDate"
            FROM (
                SELECT report_date FROM sponsored_products_search_term_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
                UNION ALL
                SELECT report_date FROM sponsored_brands_search_term_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
                UNION ALL
                SELECT report_date FROM sponsored_display_targeting_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
            ) as combined_dates;
        `, [asin, startDate, endDate]);
        const { minDate, maxDate } = dateRangeResult.rows[0] || {};
        
        const { rows } = await pool.query(`
            WITH combined_reports AS (
                SELECT customer_search_term, impressions, clicks, cost, sales_7d as sales, purchases_7d as orders FROM sponsored_products_search_term_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
                UNION ALL
                SELECT customer_search_term, impressions, clicks, cost, sales, purchases as orders FROM sponsored_brands_search_term_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
                UNION ALL
                SELECT targeting_text as customer_search_term, impressions, clicks, cost, sales, purchases as orders FROM sponsored_display_targeting_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
            )
            SELECT customer_search_term, SUM(COALESCE(impressions, 0)) as impressions, SUM(COALESCE(clicks, 0)) as clicks, SUM(COALESCE(cost, 0)) as spend, SUM(COALESCE(sales, 0)) as sales, SUM(COALESCE(orders, 0)) as orders
            FROM combined_reports WHERE customer_search_term IS NOT NULL GROUP BY customer_search_term ORDER BY SUM(COALESCE(cost, 0)) DESC;
        `, [asin, startDate, endDate]);

        return {
            data: rows,
            dateRange: {
                startDate: minDate ? new Date(minDate).toISOString().split('T')[0] : startDate,
                endDate: maxDate ? new Date(maxDate).toISOString().split('T')[0] : endDate,
            }
        };
    } catch (e) {
        console.error('[AI Server Fetch] Error fetching Search Term data:', e.message);
        return { data: [], dateRange, error: e.message };
    }
}

async function fetchStreamDataForAI(asin, dateRange) {
    if (!asin || !dateRange?.startDate || !dateRange?.endDate) {
        console.log('[AI Server Fetch] Skipping Stream: Missing params.');
        return { data: [], dateRange: null };
    }
    const { startDate, endDate } = dateRange;
    try {
        const campaignIdResult = await pool.query(`
            SELECT DISTINCT campaign_id::bigint FROM sponsored_products_search_term_report WHERE asin = $1 AND report_date >= $2
            UNION
            SELECT DISTINCT campaign_id::bigint FROM sponsored_brands_search_term_report WHERE asin = $1 AND report_date >= $2
            UNION
            SELECT DISTINCT campaign_id::bigint FROM sponsored_display_targeting_report WHERE asin = $1 AND report_date >= $2;
        `, [asin, new Date(new Date(endDate).setDate(new Date(endDate).getDate() - 89)).toISOString().split('T')[0]]);
        const campaignIds = campaignIdResult.rows.map(r => r.campaign_id);
        if (campaignIds.length === 0) return { data: [], dateRange };
        
        // FIX: The placeholder query was causing a syntax error.
        // This new query correctly finds the actual date range of available stream data.
        const dateRangeResult = await pool.query(`
            SELECT
                MIN(((COALESCE(event_data ->> 'time_window_start', event_data ->> 'timeWindowStart'))::timestamptz AT TIME ZONE 'America/Los_Angeles')::date) as "minDate",
                MAX(((COALESCE(event_data ->> 'time_window_start', event_data ->> 'timeWindowStart'))::timestamptz AT TIME ZONE 'America/Los_Angeles')::date) as "maxDate"
            FROM raw_stream_events
            WHERE (COALESCE(event_data->>'campaignId', event_data->>'campaign_id'))::bigint = ANY($1::bigint[])
              AND ((COALESCE(event_data ->> 'time_window_start', event_data ->> 'timeWindowStart'))::timestamptz AT TIME ZONE 'America/Los_Angeles')::date BETWEEN $2::date AND $3::date
        `, [campaignIds, startDate, endDate]);
        const { minDate, maxDate } = dateRangeResult.rows[0] || {};

        const { rows } = await pool.query(`
             WITH all_events AS (
                SELECT event_type, (COALESCE(event_data->>'campaignId', event_data->>'campaign_id'))::bigint AS campaign_id, (COALESCE(event_data->>'adGroupId', event_data->>'ad_group_id'))::bigint AS ad_group_id, (COALESCE(event_data->>'keywordId', event_data->>'keyword_id', event_data->>'targetId', event_data->>'target_id'))::bigint AS entity_id, COALESCE(event_data->>'keywordText', event_data->>'keyword_text', event_data->>'targeting_text', event_data->>'targetingExpression') AS entity_text, event_data
                FROM raw_stream_events
                WHERE (COALESCE(event_data->>'campaignId', event_data->>'campaign_id'))::bigint = ANY($1::bigint[]) AND ((COALESCE(event_data ->> 'time_window_start', event_data ->> 'timeWindowStart'))::timestamptz AT TIME ZONE 'America/Los_Angeles')::date BETWEEN $2::date AND $3::date
            ), aggregated AS (
                SELECT campaign_id, ad_group_id, entity_id, MAX(entity_text) as entity_text, SUM(CASE WHEN event_type LIKE '%-traffic' THEN COALESCE((event_data->>'impressions')::bigint, 0) ELSE 0 END) as impressions, SUM(CASE WHEN event_type LIKE '%-traffic' THEN COALESCE((event_data->>'clicks')::bigint, 0) ELSE 0 END) as clicks, SUM(CASE WHEN event_type LIKE '%-traffic' THEN COALESCE((event_data->>'cost')::numeric, 0) ELSE 0 END) as spend, SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'purchases_1d')::bigint, 0) ELSE 0 END) as orders_1d, SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'sales_1d')::numeric, 0) ELSE 0 END) as sales_1d, SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'purchases_7d')::bigint, 0) ELSE 0 END) as orders_7d, SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'sales_7d')::numeric, 0) ELSE 0 END) as sales_7d, SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'purchases_14d')::bigint, 0) WHEN event_type IN ('sb-conversion', 'sd-conversion') THEN COALESCE((event_data->>'purchases')::bigint, 0) ELSE 0 END) as orders_14d, SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'sales_14d')::numeric, 0) WHEN event_type IN ('sb-conversion', 'sd-conversion') THEN COALESCE((event_data->>'sales')::numeric, 0) ELSE 0 END) as sales_14d, SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'purchases_30d')::bigint, 0) ELSE 0 END) as orders_30d, SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'sales_30d')::numeric, 0) ELSE 0 END) as sales_30d, SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'attributed_sales_1d_same_sku')::numeric, 0) ELSE 0 END) as attributed_sales_1d_same_sku, SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'attributed_sales_7d_same_sku')::numeric, 0) ELSE 0 END) as attributed_sales_7d_same_sku
                FROM all_events WHERE entity_id IS NOT NULL AND campaign_id IS NOT NULL AND ad_group_id IS NOT NULL GROUP BY campaign_id, ad_group_id, entity_id
            ) SELECT * FROM aggregated WHERE impressions > 0 OR clicks > 0 OR spend > 0 OR sales_7d > 0 OR sales_14d > 0 ORDER BY spend DESC NULLS LAST;
        `, [campaignIds, startDate, endDate]);
        
        return {
            data: rows,
            dateRange: {
                startDate: minDate ? new Date(minDate).toISOString().split('T')[0] : startDate,
                endDate: maxDate ? new Date(maxDate).toISOString().split('T')[0] : endDate
            }
        };
    } catch (e) {
        console.error('[AI Server Fetch] Error fetching Stream data:', e.message);
        return { data: [], dateRange, error: e.message };
    }
}

async function fetchSalesTrafficDataForAI(asin, dateRange) {
    if (!asin || !dateRange?.startDate || !dateRange?.endDate) {
        console.log('[AI Server Fetch] Skipping Sales & Traffic: Missing params.');
        return { data: [], dateRange: null };
    }
    const { startDate, endDate } = dateRange;
    try {
        const dateRangeResult = await pool.query(`
            SELECT MIN(report_date) as "minDate", MAX(report_date) as "maxDate"
            FROM sales_and_traffic_by_asin
            WHERE child_asin = $1 AND report_date BETWEEN $2 AND $3;
        `, [asin, startDate, endDate]);
        const { minDate, maxDate } = dateRangeResult.rows[0] || {};

        const { rows } = await pool.query(`
            SELECT
                -- ### SUMMABLE METRICS ###
                SUM(COALESCE((sales_data->>'unitsOrdered')::int, 0)) AS "unitsOrdered",
                SUM(COALESCE((sales_data->'orderedProductSales'->>'amount')::numeric, 0)) AS "orderedProductSales",
                SUM(COALESCE((sales_data->>'totalOrderItems')::int, 0)) AS "totalOrderItems",
                SUM(COALESCE((sales_data->>'unitsOrderedB2B')::int, 0)) AS "unitsOrderedB2B",
                SUM(COALESCE((sales_data->'orderedProductSalesB2B'->>'amount')::numeric, 0)) AS "orderedProductSalesB2B",
                SUM(COALESCE((sales_data->>'totalOrderItemsB2B')::int, 0)) AS "totalOrderItemsB2B",

                SUM(COALESCE((traffic_data->>'sessions')::int, 0)) AS "sessions",
                SUM(COALESCE((traffic_data->>'pageViews')::int, 0)) AS "pageViews",
                SUM(COALESCE((traffic_data->>'sessionsB2B')::int, 0)) AS "sessionsB2B",
                SUM(COALESCE((traffic_data->>'pageViewsB2B')::int, 0)) AS "pageViewsB2B",
                SUM(COALESCE((traffic_data->>'browserSessions')::int, 0)) AS "browserSessions",
                SUM(COALESCE((traffic_data->>'mobileAppSessions')::int, 0)) AS "mobileAppSessions",
                SUM(COALESCE((traffic_data->>'browserPageViews')::int, 0)) AS "browserPageViews",
                SUM(COALESCE((traffic_data->>'mobileAppPageViews')::int, 0)) AS "mobileAppPageViews",
                SUM(COALESCE((traffic_data->>'browserSessionsB2B')::int, 0)) AS "browserSessionsB2B",
                SUM(COALESCE((traffic_data->>'mobileAppSessionsB2B')::int, 0)) AS "mobileAppSessionsB2B",
                SUM(COALESCE((traffic_data->>'browserPageViewsB2B')::int, 0)) AS "browserPageViewsB2B",
                SUM(COALESCE((traffic_data->>'mobileAppPageViewsB2B')::int, 0)) AS "mobileAppPageViewsB2B",

                -- ### WEIGHTED AVERAGES FOR PRICES & PERCENTAGES ###
                SUM(COALESCE((sales_data->'averageSalesPerOrderItem'->>'amount')::numeric, 0) * COALESCE((sales_data->>'totalOrderItems')::int, 0)) as "weighted_averageSalesPerOrderItem",
                SUM(COALESCE((sales_data->'averageSalesPerOrderItemB2B'->>'amount')::numeric, 0) * COALESCE((sales_data->>'totalOrderItemsB2B')::int, 0)) as "weighted_averageSalesPerOrderItemB2B",
                
                SUM(COALESCE((traffic_data->>'buyBoxPercentage')::numeric, 0) * COALESCE((traffic_data->>'sessions')::int, 0)) as "weighted_buyBoxPercentage",
                SUM(COALESCE((traffic_data->>'unitSessionPercentage')::numeric, 0) * COALESCE((traffic_data->>'sessions')::int, 0)) as "weighted_unitSessionPercentage",
                SUM(COALESCE((traffic_data->>'sessionPercentage')::numeric, 0) * COALESCE((traffic_data->>'sessions')::int, 0)) as "weighted_sessionPercentage",
                SUM(COALESCE((traffic_data->>'browserSessionPercentage')::numeric, 0) * COALESCE((traffic_data->>'browserSessions')::int, 0)) as "weighted_browserSessionPercentage",
                SUM(COALESCE((traffic_data->>'mobileAppSessionPercentage')::numeric, 0) * COALESCE((traffic_data->>'mobileAppSessions')::int, 0)) as "weighted_mobileAppSessionPercentage",
                
                SUM(COALESCE((traffic_data->>'buyBoxPercentageB2B')::numeric, 0) * COALESCE((traffic_data->>'sessionsB2B')::int, 0)) as "weighted_buyBoxPercentageB2B",
                SUM(COALESCE((traffic_data->>'unitSessionPercentageB2B')::numeric, 0) * COALESCE((traffic_data->>'sessionsB2B')::int, 0)) as "weighted_unitSessionPercentageB2B",
                SUM(COALESCE((traffic_data->>'sessionPercentageB2B')::numeric, 0) * COALESCE((traffic_data->>'sessionsB2B')::int, 0)) as "weighted_sessionPercentageB2B",
                SUM(COALESCE((traffic_data->>'browserSessionPercentageB2B')::numeric, 0) * COALESCE((traffic_data->>'browserSessionsB2B')::int, 0)) as "weighted_browserSessionPercentageB2B",
                SUM(COALESCE((traffic_data->>'mobileAppSessionPercentageB2B')::numeric, 0) * COALESCE((traffic_data->>'mobileAppSessionsB2B')::int, 0)) as "weighted_mobileAppSessionPercentageB2B",
                
                SUM(COALESCE((traffic_data->>'pageViewsPercentage')::numeric, 0) * COALESCE((traffic_data->>'pageViews')::int, 0)) as "weighted_pageViewsPercentage",
                SUM(COALESCE((traffic_data->>'browserPageViewsPercentage')::numeric, 0) * COALESCE((traffic_data->>'browserPageViews')::int, 0)) as "weighted_browserPageViewsPercentage",
                SUM(COALESCE((traffic_data->>'mobileAppPageViewsPercentage')::numeric, 0) * COALESCE((traffic_data->>'mobileAppPageViews')::int, 0)) as "weighted_mobileAppPageViewsPercentage",
                
                SUM(COALESCE((traffic_data->>'pageViewsPercentageB2B')::numeric, 0) * COALESCE((traffic_data->>'pageViewsB2B')::int, 0)) as "weighted_pageViewsPercentageB2B",
                SUM(COALESCE((traffic_data->>'browserPageViewsPercentageB2B')::numeric, 0) * COALESCE((traffic_data->>'browserPageViewsB2B')::int, 0)) as "weighted_browserPageViewsPercentageB2B",
                SUM(COALESCE((traffic_data->>'mobileAppPageViewsPercentageB2B')::numeric, 0) * COALESCE((traffic_data->>'mobileAppPageViewsB2B')::int, 0)) as "weighted_mobileAppPageViewsPercentageB2B"

            FROM sales_and_traffic_by_asin
            WHERE child_asin = $1 AND report_date BETWEEN $2 AND $3;
        `, [asin, startDate, endDate]);
        
        const agg = rows[0];

        if (!agg || !agg.sessions) {
            return { data: [], dateRange };
        }

        const safeDivide = (numerator, denominator) => {
            const num = parseFloat(numerator || 0);
            const den = parseFloat(denominator || 0);
            return den > 0 ? num / den : 0;
        };
        
        // Amazon stores percentages as numbers (e.g., 37.83 for 37.83%), so we divide by 100 to get a ratio for the AI.
        const finalData = {
            // Sales
            unitsOrdered: parseInt(agg.unitsOrdered, 10),
            orderedProductSales: parseFloat(agg.orderedProductSales),
            totalOrderItems: parseInt(agg.totalOrderItems, 10),
            averageSalesPerOrderItem: safeDivide(agg.weighted_averageSalesPerOrderItem, agg.totalOrderItems),
            unitsOrderedB2B: parseInt(agg.unitsOrderedB2B, 10),
            orderedProductSalesB2B: parseFloat(agg.orderedProductSalesB2B),
            totalOrderItemsB2B: parseInt(agg.totalOrderItemsB2B, 10),
            averageSalesPerOrderItemB2B: safeDivide(agg.weighted_averageSalesPerOrderItemB2B, agg.totalOrderItemsB2B),
            // Traffic
            sessions: parseInt(agg.sessions, 10),
            pageViews: parseInt(agg.pageViews, 10),
            sessionsB2B: parseInt(agg.sessionsB2B, 10),
            pageViewsB2B: parseInt(agg.pageViewsB2B, 10),
            browserSessions: parseInt(agg.browserSessions, 10),
            mobileAppSessions: parseInt(agg.mobileAppSessions, 10),
            browserPageViews: parseInt(agg.browserPageViews, 10),
            mobileAppPageViews: parseInt(agg.mobileAppPageViews, 10),
            browserSessionsB2B: parseInt(agg.browserSessionsB2B, 10),
            mobileAppSessionsB2B: parseInt(agg.mobileAppSessionsB2B, 10),
            browserPageViewsB2B: parseInt(agg.browserPageViewsB2B, 10),
            mobileAppPageViewsB2B: parseInt(agg.mobileAppPageViewsB2B, 10),
            // Percentages (returned as ratio, e.g., 0.3783)
            buyBoxPercentage: safeDivide(agg.weighted_buyBoxPercentage, agg.sessions) / 100,
            unitSessionPercentage: safeDivide(agg.weighted_unitSessionPercentage, agg.sessions) / 100,
            sessionPercentage: safeDivide(agg.weighted_sessionPercentage, agg.sessions) / 100,
            pageViewsPercentage: safeDivide(agg.weighted_pageViewsPercentage, agg.pageViews) / 100,
            buyBoxPercentageB2B: safeDivide(agg.weighted_buyBoxPercentageB2B, agg.sessionsB2B) / 100,
            unitSessionPercentageB2B: safeDivide(agg.weighted_unitSessionPercentageB2B, agg.sessionsB2B) / 100,
            sessionPercentageB2B: safeDivide(agg.weighted_sessionPercentageB2B, agg.sessionsB2B) / 100,
            pageViewsPercentageB2B: safeDivide(agg.weighted_pageViewsPercentageB2B, agg.pageViewsB2B) / 100,
            browserSessionPercentage: safeDivide(agg.weighted_browserSessionPercentage, agg.browserSessions) / 100,
            mobileAppSessionPercentage: safeDivide(agg.weighted_mobileAppSessionPercentage, agg.mobileAppSessions) / 100,
            browserPageViewsPercentage: safeDivide(agg.weighted_browserPageViewsPercentage, agg.browserPageViews) / 100,
            mobileAppPageViewsPercentage: safeDivide(agg.weighted_mobileAppPageViewsPercentage, agg.mobileAppPageViews) / 100,
            browserSessionPercentageB2B: safeDivide(agg.weighted_browserSessionPercentageB2B, agg.browserSessionsB2B) / 100,
            mobileAppSessionPercentageB2B: safeDivide(agg.weighted_mobileAppSessionPercentageB2B, agg.mobileAppSessionsB2B) / 100,
            browserPageViewsPercentageB2B: safeDivide(agg.weighted_browserPageViewsPercentageB2B, agg.browserPageViewsB2B) / 100,
            mobileAppPageViewsPercentageB2B: safeDivide(agg.weighted_mobileAppPageViewsPercentageB2B, agg.mobileAppPageViewsB2B) / 100,
        };

        return {
            data: [finalData], // Return as an array with a single aggregated object
            dateRange: {
                startDate: minDate ? new Date(minDate).toISOString().split('T')[0] : startDate,
                endDate: maxDate ? new Date(maxDate).toISOString().split('T')[0] : endDate
            }
        };
    } catch (e) {
        console.error('[AI Server Fetch] Error fetching Sales & Traffic data:', e.message);
        return { data: [], dateRange, error: e.message };
    }
}

async function fetchSqpDataForAI(asin, weeks) {
    if (!asin || !weeks || weeks.length === 0) {
        console.log('[AI Server Fetch] Skipping SQP: Missing params.');
        return { data: [], dateRange: null };
    }
    try {
        const { rows } = await pool.query(`
             SELECT search_query, performance_data
             FROM query_performance_data
             WHERE asin = $1 AND start_date = ANY($2::date[]);
        `, [asin, weeks]);
        
        const aggregationMap = new Map();
        const getMedian = (arr) => {
            if (!arr || arr.length === 0) return null;
            const sorted = [...arr].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        };

        for (const row of rows) {
            const raw = row.performance_data;
            if (!raw || !raw.searchQueryData) continue;
            
            const sq = raw.searchQueryData.searchQuery;
            if (!aggregationMap.has(sq)) {
                aggregationMap.set(sq, {
                    searchQueryScore: raw.searchQueryData.searchQueryScore,
                    searchQueryVolume: 0,
                    impressionData: { totalQueryImpressionCount: 0, asinImpressionCount: 0 },
                    clickData: { totalClickCount: 0, asinClickCount: 0, totalMedianClickPrices: [], asinMedianClickPrices: [] },
                    cartAddData: { totalCartAddCount: 0, asinCartAddCount: 0, totalMedianCartAddPrices: [], asinMedianCartAddPrices: [] },
                    purchaseData: { totalPurchaseCount: 0, asinPurchaseCount: 0, totalMedianPurchasePrices: [], asinMedianPurchasePrices: [] },
                });
            }

            const agg = aggregationMap.get(sq);
            
            agg.searchQueryVolume += raw.searchQueryData.searchQueryVolume || 0;
            agg.impressionData.totalQueryImpressionCount += raw.impressionData?.totalQueryImpressionCount || 0;
            agg.impressionData.asinImpressionCount += raw.impressionData?.asinImpressionCount || 0;
            
            agg.clickData.totalClickCount += raw.clickData?.totalClickCount || 0;
            agg.clickData.asinClickCount += raw.clickData?.asinClickCount || 0;
            if(raw.clickData?.totalMedianClickPrice?.amount) agg.clickData.totalMedianClickPrices.push(raw.clickData.totalMedianClickPrice.amount);
            if(raw.clickData?.asinMedianClickPrice?.amount) agg.clickData.asinMedianClickPrices.push(raw.clickData.asinMedianClickPrice.amount);

            agg.cartAddData.totalCartAddCount += raw.cartAddData?.totalCartAddCount || 0;
            agg.cartAddData.asinCartAddCount += raw.cartAddData?.asinCartAddCount || 0;
            if(raw.cartAddData?.totalMedianCartAddPrice?.amount) agg.cartAddData.totalMedianCartAddPrices.push(raw.cartAddData.totalMedianCartAddPrice.amount);
            if(raw.cartAddData?.asinMedianCartAddPrice?.amount) agg.cartAddData.asinMedianCartAddPrices.push(raw.cartAddData.asinMedianCartAddPrice.amount);
            
            agg.purchaseData.totalPurchaseCount += raw.purchaseData?.totalPurchaseCount || 0;
            agg.purchaseData.asinPurchaseCount += raw.purchaseData?.asinPurchaseCount || 0;
            if(raw.purchaseData?.totalMedianPurchasePrice?.amount) agg.purchaseData.totalMedianPurchasePrices.push(raw.purchaseData.totalMedianPurchasePrice.amount);
            if(raw.purchaseData?.asinMedianPurchasePrice?.amount) agg.purchaseData.asinMedianPurchasePrices.push(raw.purchaseData.asinMedianPurchasePrice.amount);
        }

        const transformedData = [];
        const formatPrice = (priceObj) => priceObj ? `${priceObj.currencyCode} ${priceObj.amount.toFixed(2)}` : null;

        for (const [searchQuery, agg] of aggregationMap.entries()) {
            const currencyCode = 'USD';
            const totalImpressions = agg.impressionData.totalQueryImpressionCount;

            transformedData.push({
                searchQuery,
                searchQueryScore: agg.searchQueryScore,
                searchQueryVolume: agg.searchQueryVolume,
                impressions: {
                    totalCount: totalImpressions,
                    asinCount: agg.impressionData.asinImpressionCount,
                    asinShare: totalImpressions > 0 ? agg.impressionData.asinImpressionCount / totalImpressions : 0,
                },
                clicks: {
                    totalCount: agg.clickData.totalClickCount,
                    clickRate: totalImpressions > 0 ? agg.clickData.totalClickCount / totalImpressions : 0,
                    asinCount: agg.clickData.asinClickCount,
                    asinShare: agg.clickData.totalClickCount > 0 ? agg.clickData.asinClickCount / agg.clickData.totalClickCount : 0,
                    totalMedianPrice: formatPrice(getMedian(agg.clickData.totalMedianClickPrices) != null ? { amount: getMedian(agg.clickData.totalMedianClickPrices), currencyCode } : null),
                    asinMedianPrice: formatPrice(getMedian(agg.clickData.asinMedianClickPrices) != null ? { amount: getMedian(agg.clickData.asinMedianClickPrices), currencyCode } : null),
                },
                cartAdds: {
                    totalCount: agg.cartAddData.totalCartAddCount,
                    cartAddRate: totalImpressions > 0 ? agg.cartAddData.totalCartAddCount / totalImpressions : 0,
                    asinCount: agg.cartAddData.asinCartAddCount,
                    asinShare: agg.cartAddData.totalCartAddCount > 0 ? agg.cartAddData.asinCartAddCount / agg.cartAddData.totalCartAddCount : 0,
                    totalMedianPrice: formatPrice(getMedian(agg.cartAddData.totalMedianCartAddPrices) != null ? { amount: getMedian(agg.cartAddData.totalMedianCartAddPrices), currencyCode } : null),
                    asinMedianPrice: formatPrice(getMedian(agg.cartAddData.asinMedianCartAddPrices) != null ? { amount: getMedian(agg.cartAddData.asinMedianCartAddPrices), currencyCode } : null),
                },
                purchases: {
                    totalCount: agg.purchaseData.totalPurchaseCount,
                    purchaseRate: totalImpressions > 0 ? agg.purchaseData.totalPurchaseCount / totalImpressions : 0,
                    asinCount: agg.purchaseData.asinPurchaseCount,
                    asinShare: agg.purchaseData.totalPurchaseCount > 0 ? agg.purchaseData.asinPurchaseCount / agg.purchaseData.totalPurchaseCount : 0,
                    totalMedianPrice: formatPrice(getMedian(agg.purchaseData.totalMedianPurchasePrices) != null ? { amount: getMedian(agg.purchaseData.totalMedianPurchasePrices), currencyCode } : null),
                    asinMedianPrice: formatPrice(getMedian(agg.purchaseData.asinMedianPurchasePrices) != null ? { amount: getMedian(agg.purchaseData.asinMedianPurchasePrices), currencyCode } : null),
                },
            });
        }
        
        const sortedWeeks = weeks.sort();
        const startDate = sortedWeeks[0];
        const lastWeekStartDate = new Date(sortedWeeks[sortedWeeks.length - 1]);
        lastWeekStartDate.setDate(lastWeekStartDate.getDate() + 6);
        const endDate = lastWeekStartDate.toISOString().split('T')[0];

        return {
            data: transformedData,
            dateRange: { startDate, endDate }
        };
    } catch (e) {
        console.error('[AI Server Fetch] Error fetching SQP data:', e.message);
        return { data: [], dateRange: { startDate: weeks[0], endDate: weeks[0] }, error: e.message };
    }
}


// --- Tool Endpoints (for Frontend to pre-load data) ---

router.post('/ai/tool/search-term', async (req, res) => {
    const { asin, startDate, endDate } = req.body;
    if (!asin || !startDate || !endDate) {
        return res.status(400).json({ error: 'ASIN, startDate, and endDate are required.' });
    }
    try {
        const result = await fetchSearchTermDataForAI(asin, {startDate, endDate});
        if(result.error) throw new Error(result.error);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/ai/tool/stream', async (req, res) => {
    const { asin, startDate, endDate } = req.body;
    if (!asin || !startDate || !endDate) {
        return res.status(400).json({ error: 'ASIN, startDate, and endDate are required.' });
    }
    try {
        const result = await fetchStreamDataForAI(asin, {startDate, endDate});
        if(result.error) throw new Error(result.error);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/ai/tool/sales-traffic', async (req, res) => {
    const { asin, startDate, endDate } = req.body;
    if (!asin || !startDate || !endDate) {
        return res.status(400).json({ error: 'ASIN, startDate, and endDate are required.' });
    }
    try {
        const result = await fetchSalesTrafficDataForAI(asin, {startDate, endDate});
        if(result.error) throw new Error(result.error);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/ai/tool/search-query-performance', async (req, res) => {
    const { asin, weeks } = req.body;
    if (!asin || !Array.isArray(weeks) || weeks.length === 0) {
        return res.status(400).json({ error: 'ASIN and a non-empty weeks array are required.' });
    }
    try {
        const result = await fetchSqpDataForAI(asin, weeks);
        if(result.error) throw new Error(result.error);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


const buildContextString = (context) => `
Here is the data context for my question. Please analyze it before answering, paying close attention to the different date ranges for each data source.

**Product Information:**
- ASIN: ${context.productInfo.asin || 'Not provided'}
- Sale Price: $${context.productInfo.salePrice || 'Not provided'}
- Product Cost: $${context.productInfo.cost || 'Not provided'}
- FBA Fee: $${context.productInfo.fbaFee || 'Not provided'}
- Referral Fee: ${context.productInfo.referralFeePercent || '15'}%

**Performance Data:**
- Search Term Data (Date Range: ${context.performanceData.searchTermData?.dateRange?.startDate} to ${context.performanceData.searchTermData?.dateRange?.endDate}): ${JSON.stringify(context.performanceData.searchTermData?.data, null, 2) || 'Not provided'}
- Stream Data (Date Range: ${context.performanceData.streamData?.dateRange?.startDate} to ${context.performanceData.streamData?.dateRange?.endDate}): ${JSON.stringify(context.performanceData.streamData?.data, null, 2) || 'Not provided'}
- Sales & Traffic Data (Date Range: ${context.performanceData.salesTrafficData?.dateRange?.startDate} to ${context.performanceData.salesTrafficData?.dateRange?.endDate}): ${JSON.stringify(context.performanceData.salesTrafficData?.data, null, 2) || 'Not provided'}
- Search Query Performance Data (Date Range: ${context.performanceData.searchQueryPerformanceData?.dateRange?.startDate} to ${context.performanceData.searchQueryPerformanceData?.dateRange?.endDate}): ${JSON.stringify(context.performanceData.searchQueryPerformanceData?.data, null, 2) || 'Not provided'}
`;

// --- Main Chat Endpoints ---

router.post('/ai/chat', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    let newConversationId = null;
    let title = null;
    let client;

    try {
        let { question, conversationId, context, dataParameters, profileId, provider } = req.body;
        
        if (!question) throw new Error('Question is required.');
        if (!profileId) throw new Error('Profile ID is required.');

        const systemInstruction = context.systemInstruction || 'You are an expert Amazon PPC Analyst.';
        
        // Fetch performance data on the server side
        if (dataParameters) {
            console.log('[AI Chat] Received data parameters, fetching data on server-side.');
            context.performanceData = {
                searchTermData: await fetchSearchTermDataForAI(dataParameters.asin, dataParameters.searchTermDateRange),
                streamData: await fetchStreamDataForAI(dataParameters.asin, dataParameters.streamDateRange),
                salesTrafficData: await fetchSalesTrafficDataForAI(dataParameters.asin, dataParameters.salesTrafficDateRange),
                searchQueryPerformanceData: await fetchSqpDataForAI(dataParameters.asin, dataParameters.searchQueryPerformanceWeeks),
            };
        } else {
             context.performanceData = {}; // Ensure it exists
        }
        
        client = await pool.connect();
        let history = [];

        if (conversationId) {
            const result = await client.query('SELECT history FROM ai_copilot_conversations WHERE id = $1 AND profile_id = $2', [conversationId, profileId]);
            if (result.rows.length > 0) {
                history = result.rows[0].history;
            } else {
                conversationId = null; 
            }
        }

        if (!conversationId) {
            title = question.substring(0, 80);
            const result = await client.query(
                `INSERT INTO ai_copilot_conversations (profile_id, provider, title, history) 
                 VALUES ($1, $2, $3, '[]'::jsonb) RETURNING id`,
                [profileId, provider, title]
            );
            newConversationId = result.rows[0].id;
        }

        const chat = ai.chats.create({
            model: 'gemini-flash-latest',
            history: history,
            config: { systemInstruction }
        });
        
        let currentMessage = (history.length === 0) 
            ? `${buildContextString(context)}\n**My Initial Question:**\n${question}` 
            : question;

        const resultStream = await chat.sendMessageStream({ message: currentMessage });

        let fullResponseText = '';
        let firstChunk = true;
        for await (const chunk of resultStream) {
            const chunkText = chunk.text;
            if (chunkText) {
                fullResponseText += chunkText;
                const responsePayload = { content: chunkText };
                if (firstChunk && newConversationId) {
                    responsePayload.conversationId = newConversationId;
                    responsePayload.title = title;
                }
                res.write(JSON.stringify(responsePayload) + '\n');
                firstChunk = false;
            }
        }
        
        const finalHistory = [
            ...history,
            { role: 'user', parts: [{ text: currentMessage }] },
            { role: 'model', parts: [{ text: fullResponseText }] }
        ];

        await client.query(
            `UPDATE ai_copilot_conversations SET history = $1, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(finalHistory), conversationId || newConversationId]
        );
        
        res.end();

    } catch (error) {
        console.error("Gemini chat error:", error);
        res.status(500).end(JSON.stringify({ error: error.message }));
    } finally {
        if (client) client.release();
    }
});

router.post('/ai/chat-gpt', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    let newConversationId = null;
    let title = null;
    let client;

    try {
        let { question, conversationId, context, dataParameters, profileId, provider } = req.body;
        if (!question) throw new Error('Question is required.');
        if (!profileId) throw new Error('Profile ID is required.');

        const systemInstruction = context.systemInstruction || 'You are an expert Amazon PPC Analyst.';
        
        if (dataParameters) {
            console.log('[AI Chat] Received data parameters, fetching data on server-side for GPT.');
            context.performanceData = {
                searchTermData: await fetchSearchTermDataForAI(dataParameters.asin, dataParameters.searchTermDateRange),
                streamData: await fetchStreamDataForAI(dataParameters.asin, dataParameters.streamDateRange),
                salesTrafficData: await fetchSalesTrafficDataForAI(dataParameters.asin, dataParameters.salesTrafficDateRange),
                searchQueryPerformanceData: await fetchSqpDataForAI(dataParameters.asin, dataParameters.searchQueryPerformanceWeeks),
            };
        } else {
             context.performanceData = {};
        }

        client = await pool.connect();
        let history = [];

        if (conversationId) {
            const result = await client.query('SELECT history FROM ai_copilot_conversations WHERE id = $1 AND profile_id = $2', [conversationId, profileId]);
            if (result.rows.length > 0) {
                history = result.rows[0].history;
            } else {
                conversationId = null;
            }
        }

        if (!conversationId) {
            title = question.substring(0, 80);
            const result = await client.query(
                `INSERT INTO ai_copilot_conversations (profile_id, provider, title, history) 
                 VALUES ($1, $2, $3, '[]'::jsonb) RETURNING id`,
                [profileId, provider, title]
            );
            newConversationId = result.rows[0].id;
        }

        const messages = [{ role: 'system', content: systemInstruction }];
        if (history.length === 0) {
            const contextMessage = `${buildContextString(context)}\n**My Initial Question:**\n${question}`;
            messages.push({ role: 'user', content: contextMessage });
        } else {
            // OpenAI history format is slightly different from Gemini's
            history.forEach(h => {
                if (h.role === 'user' || h.role === 'assistant') {
                    messages.push({ role: h.role, content: h.content || h.parts?.[0]?.text });
                }
            });
            messages.push({ role: 'user', content: question });
        }
        
        const stream = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: messages,
            stream: true,
        });

        let fullResponseText = '';
        let firstChunk = true;
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                fullResponseText += content;
                 const responsePayload = { content: content };
                if (firstChunk && newConversationId) {
                    responsePayload.conversationId = newConversationId;
                    responsePayload.title = title;
                }
                res.write(JSON.stringify(responsePayload) + '\n');
                firstChunk = false;
            }
        }

        const finalHistory = [
            ...history,
            { role: 'user', content: question },
            { role: 'assistant', content: fullResponseText }
        ];
        
        await client.query(
            `UPDATE ai_copilot_conversations SET history = $1, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(finalHistory), conversationId || newConversationId]
        );
        
        res.end();

    } catch (error) {
        console.error("OpenAI chat error:", error);
        res.status(500).end(JSON.stringify({ error: error.message }));
    } finally {
        if (client) client.release();
    }
});


export default router;
