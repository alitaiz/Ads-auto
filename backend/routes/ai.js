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
        const dateRangeQuery = `...`; // Re-use existing logic
        const query = `...`; // Re-use existing logic
        
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
        const campaignIdQuery = `...`; // Re-use existing logic
        const campaignIdResult = await pool.query(`
            SELECT DISTINCT campaign_id::bigint FROM sponsored_products_search_term_report WHERE asin = $1 AND report_date >= $2
            UNION
            SELECT DISTINCT campaign_id::bigint FROM sponsored_brands_search_term_report WHERE asin = $1 AND report_date >= $2
            UNION
            SELECT DISTINCT campaign_id::bigint FROM sponsored_display_targeting_report WHERE asin = $1 AND report_date >= $2;
        `, [asin, new Date(new Date(endDate).setDate(new Date(endDate).getDate() - 89)).toISOString().split('T')[0]]);
        const campaignIds = campaignIdResult.rows.map(r => r.campaign_id);
        if (campaignIds.length === 0) return { data: [], dateRange };
        
        const dateRangeQuery = `...`;
        const dateRangeResult = await pool.query(`...`, [campaignIds, startDate, endDate]);
        const { minDate, maxDate } = dateRangeResult.rows[0] || {};

        const streamQuery = `...`; // Re-use existing logic
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
        const dateRangeQuery = `...`; // Re-use existing logic
        const dateRangeResult = await pool.query(`
            SELECT MIN(report_date) as "minDate", MAX(report_date) as "maxDate"
            FROM sales_and_traffic_by_asin
            WHERE child_asin = $1 AND report_date BETWEEN $2 AND $3;
        `, [asin, startDate, endDate]);
        const { minDate, maxDate } = dateRangeResult.rows[0] || {};

        const query = `...`; // Re-use existing logic
        const { rows } = await pool.query(`
             WITH daily_data AS (...) SELECT ... FROM daily_data;
        `, [asin, startDate, endDate]);
        
        return {
            data: rows,
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
        const query = `...`; // Re-use existing logic
        const { rows } = await pool.query(`
             SELECT search_query, performance_data
             FROM query_performance_data
             WHERE asin = $1 AND start_date = ANY($2::date[]);
        `, [asin, weeks]);
        
        // ... aggregation logic from tool endpoint ...
        const aggregationMap = new Map();
        // ... (loop and aggregate)
        const transformedData = [];
        // ... (transform aggregated data)

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