// backend/routes/ai.js
import express from 'express';
import pool from '../db.js';
import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const conversations = new Map(); // In-memory store for conversation history

// --- Tool Endpoints (for Frontend to pre-load data) ---

router.post('/ai/tool/search-term', async (req, res) => {
    const { asin, startDate, endDate } = req.body;
    if (!asin || !startDate || !endDate) {
        return res.status(400).json({ error: 'ASIN, startDate, and endDate are required.' });
    }
    try {
        const reportStartDateStr = startDate;
        const reportEndDateStr = endDate;
        
        console.log(`[AI Tool/SearchTerm] Using user-provided date range directly: ${reportStartDateStr} to ${reportEndDateStr}`);

        const dateRangeQuery = `
            SELECT MIN(report_date) as "minDate", MAX(report_date) as "maxDate"
            FROM (
                SELECT report_date FROM sponsored_products_search_term_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
                UNION ALL
                SELECT report_date FROM sponsored_brands_search_term_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
                UNION ALL
                SELECT report_date FROM sponsored_display_targeting_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
            ) as combined_dates;
        `;
        const dateRangeResult = await pool.query(dateRangeQuery, [asin, reportStartDateStr, reportEndDateStr]);
        const { minDate, maxDate } = dateRangeResult.rows[0] || {};

        const query = `
            WITH combined_reports AS (
                -- Sponsored Products
                SELECT
                    customer_search_term,
                    impressions,
                    clicks,
                    cost,
                    sales_7d as sales,
                    purchases_7d as orders
                FROM sponsored_products_search_term_report
                WHERE asin = $1 AND report_date BETWEEN $2 AND $3
                
                UNION ALL

                -- Sponsored Brands
                SELECT
                    customer_search_term,
                    impressions,
                    clicks,
                    cost,
                    sales,
                    purchases as orders
                FROM sponsored_brands_search_term_report
                WHERE asin = $1 AND report_date BETWEEN $2 AND $3

                UNION ALL

                -- Sponsored Display
                SELECT
                    targeting_text as customer_search_term,
                    impressions,
                    clicks,
                    cost,
                    sales,
                    purchases as orders
                FROM sponsored_display_targeting_report
                WHERE asin = $1 AND report_date BETWEEN $2 AND $3
            )
            SELECT
                customer_search_term,
                SUM(COALESCE(impressions, 0)) as impressions,
                SUM(COALESCE(clicks, 0)) as clicks,
                SUM(COALESCE(cost, 0)) as spend,
                SUM(COALESCE(sales, 0)) as sales,
                SUM(COALESCE(orders, 0)) as orders
            FROM combined_reports
            WHERE customer_search_term IS NOT NULL
            GROUP BY customer_search_term
            ORDER BY SUM(COALESCE(cost, 0)) DESC;
        `;
        const { rows } = await pool.query(query, [asin, reportStartDateStr, reportEndDateStr]);
        res.json({
            data: rows,
            dateRange: {
                startDate: minDate ? new Date(minDate).toISOString().split('T')[0] : reportStartDateStr,
                endDate: maxDate ? new Date(maxDate).toISOString().split('T')[0] : reportEndDateStr,
            }
        });
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
        // Step 1: Find all campaign IDs associated with the given ASIN from historical reports.
        const lookbackDays = 90;
        const lookbackStartDate = new Date(endDate);
        lookbackStartDate.setDate(lookbackStartDate.getDate() - (lookbackDays - 1));
        const lookbackStartDateStr = lookbackStartDate.toISOString().split('T')[0];

        const campaignIdQuery = `
            SELECT DISTINCT campaign_id::bigint FROM sponsored_products_search_term_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
            UNION
            SELECT DISTINCT campaign_id::bigint FROM sponsored_brands_search_term_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
            UNION
            SELECT DISTINCT campaign_id::bigint FROM sponsored_display_targeting_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3;
        `;
        const campaignIdResult = await pool.query(campaignIdQuery, [asin, lookbackStartDateStr, endDate]);
        const campaignIds = campaignIdResult.rows.map(r => r.campaign_id);

        if (campaignIds.length === 0) {
            console.log(`[AI Tool/Stream] No campaigns found for ASIN ${asin} in the last ${lookbackDays} days.`);
            return res.json({ data: [], dateRange: { startDate, endDate } });
        }
        console.log(`[AI Tool/Stream] Found ${campaignIds.length} campaigns for ASIN ${asin}. Fetching detailed stream data...`);
        
        const dateRangeQuery = `
            SELECT
                MIN(((COALESCE(event_data ->> 'time_window_start', event_data ->> 'timeWindowStart'))::timestamptz AT TIME ZONE 'America/Los_Angeles')::date) AS "minDate",
                MAX(((COALESCE(event_data ->> 'time_window_start', event_data ->> 'timeWindowStart'))::timestamptz AT TIME ZONE 'America/Los_Angeles')::date) AS "maxDate"
            FROM raw_stream_events
            WHERE 
                (COALESCE(event_data->>'campaignId', event_data->>'campaign_id'))::bigint = ANY($1::bigint[])
                AND ((COALESCE(event_data ->> 'time_window_start', event_data ->> 'timeWindowStart'))::timestamptz AT TIME ZONE 'America/Los_Angeles')::date BETWEEN $2::date AND $3::date;
        `;
        const dateRangeResult = await pool.query(dateRangeQuery, [campaignIds, startDate, endDate]);
        const { minDate, maxDate } = dateRangeResult.rows[0] || {};


        // Step 2: Fetch and aggregate stream events by campaign, ad group, and entity.
        const streamQuery = `
            WITH all_events AS (
                SELECT
                    event_type,
                    (COALESCE(event_data->>'campaignId', event_data->>'campaign_id'))::bigint AS campaign_id,
                    (COALESCE(event_data->>'adGroupId', event_data->>'ad_group_id'))::bigint AS ad_group_id,
                    (COALESCE(event_data->>'keywordId', event_data->>'keyword_id', event_data->>'targetId', event_data->>'target_id'))::bigint AS entity_id,
                    COALESCE(event_data->>'keywordText', event_data->>'keyword_text', event_data->>'targeting_text', event_data->>'targetingExpression') AS entity_text,
                    event_data
                FROM raw_stream_events
                WHERE 
                    (COALESCE(event_data->>'campaignId', event_data->>'campaign_id'))::bigint = ANY($1::bigint[])
                    AND ((COALESCE(event_data ->> 'time_window_start', event_data ->> 'timeWindowStart'))::timestamptz AT TIME ZONE 'America/Los_Angeles')::date BETWEEN $2::date AND $3::date
            ),
            aggregated AS (
                SELECT
                    campaign_id,
                    ad_group_id,
                    entity_id,
                    MAX(entity_text) as entity_text,

                    -- Traffic Metrics using CASE for backwards compatibility
                    SUM(CASE WHEN event_type LIKE '%-traffic' THEN COALESCE((event_data->>'impressions')::bigint, 0) ELSE 0 END) as impressions,
                    SUM(CASE WHEN event_type LIKE '%-traffic' THEN COALESCE((event_data->>'clicks')::bigint, 0) ELSE 0 END) as clicks,
                    SUM(CASE WHEN event_type LIKE '%-traffic' THEN COALESCE((event_data->>'cost')::numeric, 0) ELSE 0 END) as spend,

                    -- 1-Day Conversions (SP Only)
                    SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'purchases_1d')::bigint, 0) ELSE 0 END) as orders_1d,
                    SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'sales_1d')::numeric, 0) ELSE 0 END) as sales_1d,
                    
                    -- 7-Day Conversions (SP Only)
                    SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'purchases_7d')::bigint, 0) ELSE 0 END) as orders_7d,
                    SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'sales_7d')::numeric, 0) ELSE 0 END) as sales_7d,
                    
                    -- 14-Day Conversions (SP + SB/SD)
                    SUM(
                        CASE 
                            WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'purchases_14d')::bigint, 0)
                            WHEN event_type IN ('sb-conversion', 'sd-conversion') THEN COALESCE((event_data->>'purchases')::bigint, 0)
                            ELSE 0 
                        END
                    ) as orders_14d,
                    SUM(
                        CASE 
                            WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'sales_14d')::numeric, 0)
                            WHEN event_type IN ('sb-conversion', 'sd-conversion') THEN COALESCE((event_data->>'sales')::numeric, 0)
                            ELSE 0 
                        END
                    ) as sales_14d,

                    -- 30-Day Conversions (SP Only)
                    SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'purchases_30d')::bigint, 0) ELSE 0 END) as orders_30d,
                    SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'sales_30d')::numeric, 0) ELSE 0 END) as sales_30d,
                    
                    -- Same SKU Sales (SP Only)
                    SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'attributed_sales_1d_same_sku')::numeric, 0) ELSE 0 END) as attributed_sales_1d_same_sku,
                    SUM(CASE WHEN event_type = 'sp-conversion' THEN COALESCE((event_data->>'attributed_sales_7d_same_sku')::numeric, 0) ELSE 0 END) as attributed_sales_7d_same_sku

                FROM all_events
                WHERE entity_id IS NOT NULL AND campaign_id IS NOT NULL AND ad_group_id IS NOT NULL
                GROUP BY campaign_id, ad_group_id, entity_id
            )
            SELECT 
                * 
            FROM aggregated
            WHERE
                impressions > 0 OR clicks > 0 OR spend > 0 OR sales_7d > 0 OR sales_14d > 0
            ORDER BY spend DESC NULLS LAST;
        `;

        const { rows } = await pool.query(streamQuery, [campaignIds, startDate, endDate]);
        res.json({
            data: rows,
            dateRange: {
                startDate: minDate ? new Date(minDate).toISOString().split('T')[0] : startDate,
                endDate: maxDate ? new Date(maxDate).toISOString().split('T')[0] : endDate
            }
        });
    } catch (e) {
        console.error('[AI Tool/Stream] Error fetching detailed stream data:', e);
        res.status(500).json({ error: e.message });
    }
});


router.post('/ai/tool/sales-traffic', async (req, res) => {
    const { asin, startDate, endDate } = req.body;
    if (!asin || !startDate || !endDate) {
        return res.status(400).json({ error: 'ASIN, startDate, and endDate are required.' });
    }
    try {
        const dateRangeQuery = `
            SELECT MIN(report_date) as "minDate", MAX(report_date) as "maxDate"
            FROM sales_and_traffic_by_asin
            WHERE child_asin = $1 AND report_date BETWEEN $2 AND $3;
        `;
        const dateRangeResult = await pool.query(dateRangeQuery, [asin, startDate, endDate]);
        const { minDate, maxDate } = dateRangeResult.rows[0] || {};

        const query = `
            SELECT
                SUM(COALESCE((traffic_data->>'sessions')::integer, 0)) AS total_sessions,
                SUM(COALESCE((traffic_data->>'pageViews')::integer, 0)) AS total_page_views,
                SUM(COALESCE((sales_data->>'unitsOrdered')::integer, 0)) AS total_units_ordered,
                SUM(COALESCE((sales_data->'orderedProductSales'->>'amount')::numeric, 0.0)) AS total_ordered_product_sales,
                SUM(COALESCE((sales_data->>'totalOrderItems')::integer, 0)) AS total_order_items,
                ROUND(COALESCE(SUM(COALESCE((sales_data->>'unitsOrdered')::numeric, 0)) / NULLIF(SUM(COALESCE((traffic_data->>'sessions')::numeric, 0)), 0), 0.0) * 100, 2) AS overall_unit_session_percentage
            FROM sales_and_traffic_by_asin
            WHERE child_asin = $1 AND report_date BETWEEN $2 AND $3;
        `;
        const { rows } = await pool.query(query, [asin, startDate, endDate]);
        res.json({
            data: rows,
            dateRange: {
                startDate: minDate ? new Date(minDate).toISOString().split('T')[0] : startDate,
                endDate: maxDate ? new Date(maxDate).toISOString().split('T')[0] : endDate
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Main Chat Endpoint ---

router.post('/ai/chat', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
        let { question, conversationId, context } = req.body;
        
        if (!question) {
            throw new Error('Question is required.');
        }

        const systemInstruction = context.systemInstruction || 'You are an expert Amazon PPC Analyst.';

        let history = [];
        if (conversationId && conversations.has(conversationId)) {
            history = conversations.get(conversationId);
        } else {
            conversationId = uuidv4();
        }
        
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            history: history,
            config: {
                systemInstruction: systemInstruction
            }
        });
        
        let currentMessage;
        if (history.length === 0) {
            currentMessage = `
Here is the data context for my question. Please analyze it before answering, paying close attention to the different date ranges for each data source.

**Product Information:**
- ASIN: ${context.productInfo.asin || 'Not provided'}
- Sale Price: $${context.productInfo.salePrice || 'Not provided'}
- Product Cost: $${context.productInfo.cost || 'Not provided'}
- FBA Fee: $${context.productInfo.fbaFee || 'Not provided'}
- Referral Fee: ${context.productInfo.referralFeePercent || '15'}%

**Performance Data:**
- Search Term Data (Date Range: ${context.performanceData.searchTermData.dateRange?.startDate} to ${context.performanceData.searchTermData.dateRange?.endDate}): ${JSON.stringify(context.performanceData.searchTermData.data, null, 2) || 'Not provided'}
- Stream Data (Date Range: ${context.performanceData.streamData.dateRange?.startDate} to ${context.performanceData.streamData.dateRange?.endDate}): ${JSON.stringify(context.performanceData.streamData.data, null, 2) || 'Not provided'}
- Sales & Traffic Data (Date Range: ${context.performanceData.salesTrafficData.dateRange?.startDate} to ${context.performanceData.salesTrafficData.dateRange?.endDate}): ${JSON.stringify(context.performanceData.salesTrafficData.data, null, 2) || 'Not provided'}

**My Initial Question:**
${question}
`;
        } else {
            currentMessage = question;
        }

        const resultStream = await chat.sendMessageStream({ message: currentMessage });

        let fullResponseText = '';
        let firstChunk = true;
        for await (const chunk of resultStream) {
            const chunkText = chunk.text;
            if (chunkText) {
                fullResponseText += chunkText;
                if (firstChunk) {
                    res.write(JSON.stringify({ conversationId, content: chunkText }) + '\n');
                    firstChunk = false;
                } else {
                    res.write(JSON.stringify({ content: chunkText }) + '\n');
                }
            }
        }
        
        const newHistory = [
            ...history,
            { role: 'user', parts: [{ text: currentMessage }] },
            { role: 'model', parts: [{ text: fullResponseText }] }
        ];
        conversations.set(conversationId, newHistory);
        
        res.end();

    } catch (error) {
        console.error("AI chat error:", error);
        res.status(500).end(JSON.stringify({ error: error.message }));
    }
});

export default router;