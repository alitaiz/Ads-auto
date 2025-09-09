// backend/routes/stream.js
import express from 'express';
import pool from '../db.js';

const router = express.Router();

// =================================================================
// == ENDPOINT ĐỂ NHẬN DỮ LIỆU STREAM (DATA INGESTION)            ==
// =================================================================

// Middleware to check for a secret API key. This is a critical security layer.
const checkApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.STREAM_INGEST_SECRET_KEY) {
        console.warn('[Stream Ingest] Failure: Incorrect or missing API key.');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// POST /api/stream-ingest: Receives data from AWS Lambda and writes to PostgreSQL.
router.post('/stream-ingest', checkApiKey, async (req, res) => {
    const events = req.body;

    if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ error: 'Request body must be a non-empty array of events.' });
    }

    let client;
    let successfulIngests = 0;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const query = 'INSERT INTO raw_stream_events(event_type, event_data) VALUES($1, $2)';
        
        for (const event of events) {
            const eventType = event.dataset_id || event.type || 'unknown';

            if (Array.isArray(event.records) && event.records.length > 0) {
                 for (const innerRecord of event.records) {
                    await client.query(query, [eventType, innerRecord]);
                    successfulIngests++;
                 }
            } else {
                await client.query(query, [eventType, event]);
                successfulIngests++;
            }
        }

        await client.query('COMMIT');
        console.log(`[Stream Ingest] Success: Ingested ${successfulIngests} events into PostgreSQL.`);
        res.status(200).json({ message: `Successfully ingested ${successfulIngests} events.` });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('[Stream Ingest] Error writing to PostgreSQL:', error);
        res.status(500).json({ error: 'Failed to write data to database.' });
    } finally {
        if (client) client.release();
    }
});

// =================================================================
// == ENDPOINTS FOR DATA RETRIEVAL                              ==
// =================================================================

// GET /api/stream/metrics: Provides aggregated metrics for "today".
router.get('/stream/metrics', async (req, res) => {
    try {
        const query = `
            SELECT
                COALESCE(SUM((event_data->>'clicks')::bigint) FILTER (WHERE event_type = 'sp-traffic'), 0) as click_count,
                COALESCE(SUM((event_data->>'cost')::numeric) FILTER (WHERE event_type = 'sp-traffic'), 0.00) as total_spend,
                COALESCE(SUM((event_data->>'attributed_conversions_1d')::bigint) FILTER (WHERE event_type = 'sp-conversion'), 0) as total_orders,
                COALESCE(SUM((event_data->>'attributed_sales_1d')::numeric) FILTER (WHERE event_type = 'sp-conversion'), 0.00) as total_sales,
                MAX(received_at) as last_event_timestamp
            FROM raw_stream_events
            WHERE received_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC');
        `;
        
        const result = await pool.query(query);

        if (result.rows.length === 0) {
            return res.json({
                click_count: 0, total_spend: 0, total_orders: 0,
                total_sales: 0, last_event_timestamp: null
            });
        }
        
        const metrics = result.rows[0];
        res.json({
            click_count: parseInt(metrics.click_count || '0', 10),
            total_spend: parseFloat(metrics.total_spend || '0'),
            total_orders: parseInt(metrics.total_orders || '0', 10),
            total_sales: parseFloat(metrics.total_sales || '0'),
            last_event_timestamp: metrics.last_event_timestamp
        });

    } catch (error) {
        console.error("[Server] Error fetching stream metrics:", error);
        res.status(500).json({ error: "Could not fetch real-time data." });
    }
});


// GET /api/stream/campaign-metrics: Provides aggregated metrics per campaign for a date range.
router.get('/stream/campaign-metrics', async (req, res) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate query parameters are required.' });
    }

    // This ensures that the date range selected by the user is interpreted in a
    // consistent timezone (e.g., US Pacific Time), rather than the server's UTC default.
    // This resolves discrepancies where late-night events on day X would appear as day X+1.
    const reportingTimezone = 'America/Los_Angeles';

    try {
        const query = `
            WITH traffic_data AS (
                SELECT
                    (event_data->>'campaign_id') as campaign_id_text,
                    COALESCE(SUM((event_data->>'impressions')::bigint), 0) as impressions,
                    COALESCE(SUM((event_data->>'clicks')::bigint), 0) as clicks,
                    COALESCE(SUM((event_data->>'cost')::numeric), 0.00) as spend
                FROM raw_stream_events
                WHERE event_type = 'sp-traffic' 
                  AND (event_data->>'time_window_start')::timestamptz >= (($1)::timestamp AT TIME ZONE '${reportingTimezone}') 
                  AND (event_data->>'time_window_start')::timestamptz < ((($2)::date + interval '1 day')::timestamp AT TIME ZONE '${reportingTimezone}')
                GROUP BY 1
            ),
            conversion_data AS (
                SELECT
                    (event_data->>'campaign_id') as campaign_id_text,
                    COALESCE(SUM((event_data->>'attributed_conversions_1d')::bigint), 0) as orders,
                    COALESCE(SUM((event_data->>'attributed_sales_1d')::numeric), 0.00) as sales
                FROM raw_stream_events
                WHERE event_type = 'sp-conversion'
                  AND (event_data->>'time_window_start')::timestamptz >= (($1)::timestamp AT TIME ZONE '${reportingTimezone}') 
                  AND (event_data->>'time_window_start')::timestamptz < ((($2)::date + interval '1 day')::timestamp AT TIME ZONE '${reportingTimezone}')
                GROUP BY 1
            )
            SELECT
                COALESCE(t.campaign_id_text, c.campaign_id_text) as "campaignId",
                COALESCE(t.impressions, 0) as impressions,
                COALESCE(t.clicks, 0) as clicks,
                COALESCE(t.spend, 0.00)::float as spend,
                COALESCE(c.orders, 0) as orders,
                COALESCE(c.sales, 0.00)::float as sales
            FROM traffic_data t
            FULL OUTER JOIN conversion_data c ON t.campaign_id_text = c.campaign_id_text
            WHERE COALESCE(t.campaign_id_text, c.campaign_id_text) IS NOT NULL;
        `;
        
        const result = await pool.query(query, [startDate, endDate]);
        
        const metrics = result.rows
            .map(row => {
                if (!row.campaignId) {
                    return null;
                }
                const campaignIdNumber = Number(row.campaignId);

                if (!campaignIdNumber || isNaN(campaignIdNumber)) {
                    console.warn(`[Stream Metrics] Filtering out invalid campaign ID from DB: ${row.campaignId}`);
                    return null;
                }
                
                // Explicitly parse bigint/numeric fields to prevent issues with JS type coercion.
                return {
                    campaignId: campaignIdNumber,
                    impressions: parseInt(row.impressions || '0', 10),
                    clicks: parseInt(row.clicks || '0', 10),
                    spend: parseFloat(row.spend || '0'),
                    orders: parseInt(row.orders || '0', 10),
                    sales: parseFloat(row.sales || '0'),
                };
            })
            .filter(Boolean); // This effectively removes all the null entries.

        res.json(metrics);

    } catch (error) {
        console.error("[Server] Error fetching campaign stream metrics:", error);
        res.status(500).json({ error: "Could not fetch real-time campaign data." });
    }
});

// GET /api/stream/adgroup-metrics: Provides aggregated metrics per ad group for a campaign and date range.
router.get('/stream/adgroup-metrics', async (req, res) => {
    const { campaignId, startDate, endDate } = req.query;

    if (!campaignId || !startDate || !endDate) {
        return res.status(400).json({ error: 'campaignId, startDate, and endDate query parameters are required.' });
    }

    const reportingTimezone = 'America/Los_Angeles';

    try {
        const query = `
            WITH traffic_data AS (
                SELECT
                    (event_data->>'ad_group_id') as ad_group_id_text,
                    COALESCE(SUM((event_data->>'impressions')::bigint), 0) as impressions,
                    COALESCE(SUM((event_data->>'clicks')::bigint), 0) as clicks,
                    COALESCE(SUM((event_data->>'cost')::numeric), 0.00) as spend
                FROM raw_stream_events
                WHERE event_type = 'sp-traffic' 
                  AND (event_data->>'campaign_id') = $1
                  AND (event_data->>'time_window_start')::timestamptz >= (($2)::timestamp AT TIME ZONE '${reportingTimezone}') 
                  AND (event_data->>'time_window_start')::timestamptz < ((($3)::date + interval '1 day')::timestamp AT TIME ZONE '${reportingTimezone}')
                GROUP BY 1
            ),
            conversion_data AS (
                SELECT
                    (event_data->>'ad_group_id') as ad_group_id_text,
                    COALESCE(SUM((event_data->>'attributed_conversions_1d')::bigint), 0) as orders,
                    COALESCE(SUM((event_data->>'attributed_sales_1d')::numeric), 0.00) as sales
                FROM raw_stream_events
                WHERE event_type = 'sp-conversion'
                  AND (event_data->>'campaign_id') = $1
                  AND (event_data->>'time_window_start')::timestamptz >= (($2)::timestamp AT TIME ZONE '${reportingTimezone}') 
                  AND (event_data->>'time_window_start')::timestamptz < ((($3)::date + interval '1 day')::timestamp AT TIME ZONE '${reportingTimezone}')
                GROUP BY 1
            )
            SELECT
                COALESCE(t.ad_group_id_text, c.ad_group_id_text) as "adGroupId",
                COALESCE(t.impressions, 0) as impressions,
                COALESCE(t.clicks, 0) as clicks,
                COALESCE(t.spend, 0.00)::float as spend,
                COALESCE(c.orders, 0) as orders,
                COALESCE(c.sales, 0.00)::float as sales
            FROM traffic_data t
            FULL OUTER JOIN conversion_data c ON t.ad_group_id_text = c.ad_group_id_text
            WHERE COALESCE(t.ad_group_id_text, c.ad_group_id_text) IS NOT NULL;
        `;
        
        const result = await pool.query(query, [campaignId, startDate, endDate]);
        
        const metricsMap = result.rows.reduce((acc, row) => {
            const adGroupIdNumber = Number(row.adGroupId);
            if (!adGroupIdNumber || isNaN(adGroupIdNumber)) return acc;
            
            const spend = parseFloat(row.spend || '0');
            const sales = parseFloat(row.sales || '0');
            const clicks = parseInt(row.clicks || '0', 10);
            const impressions = parseInt(row.impressions || '0', 10);
            const orders = parseInt(row.orders || '0', 10);

            acc[adGroupIdNumber] = {
                impressions,
                clicks,
                spend,
                orders,
                sales,
                acos: sales > 0 ? spend / sales : 0,
                cpc: clicks > 0 ? spend / clicks : 0,
                ctr: impressions > 0 ? clicks / impressions : 0,
            };
            return acc;
        }, {});
        
        res.json(metricsMap);

    } catch (error) {
        console.error("[Server] Error fetching ad group stream metrics:", error);
        res.status(500).json({ error: "Could not fetch real-time ad group data." });
    }
});


export default router;