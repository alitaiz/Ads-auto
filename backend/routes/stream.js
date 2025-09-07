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
                COALESCE(SUM((event_data->>'conversions')::bigint) FILTER (WHERE event_type = 'sp-conversion'), 0) as total_orders,
                COALESCE(SUM((event_data->>'attributedSales1d')::numeric) FILTER (WHERE event_type = 'sp-conversion'), 0.00) as total_sales,
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


// GET /api/stream/campaign-metrics: Provides aggregated metrics per campaign for a date range, now with timezone support.
router.get('/stream/campaign-metrics', async (req, res) => {
    const { startDate, endDate, timezone } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate query parameters are required.' });
    }

    const client = await pool.connect();

    try {
        const query = `
            WITH traffic_data AS (
                SELECT
                    (event_data->>'campaignId') as campaign_id_text,
                    COALESCE(SUM((event_data->>'impressions')::bigint), 0) as impressions,
                    COALESCE(SUM((event_data->>'clicks')::bigint), 0) as clicks,
                    COALESCE(SUM((event_data->>'cost')::numeric), 0.00) as spend
                FROM raw_stream_events
                WHERE event_type = 'sp-traffic' AND received_at >= ($1)::date AND received_at < ($2)::date + interval '1 day'
                GROUP BY 1
            ),
            conversion_data AS (
                SELECT
                    (event_data->>'campaignId') as campaign_id_text,
                    COALESCE(SUM((event_data->>'conversions')::bigint), 0) as orders,
                    COALESCE(SUM((event_data->>'attributedSales1d')::numeric), 0.00) as sales
                FROM raw_stream_events
                WHERE event_type = 'sp-conversion' AND received_at >= ($1)::date AND received_at < ($2)::date + interval '1 day'
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
        
        await client.query('BEGIN');
        
        if (timezone) {
            // Basic validation to prevent SQL injection. A real app should use a whitelist of IANA timezones.
            if (!/^[A-Za-z_\/]+$/.test(timezone)) {
                throw new Error(`Invalid timezone format: ${timezone}`);
            }
            // Set the timezone for the duration of this transaction. This makes the `::date` cast respect the user's selected timezone.
            await client.query(`SET LOCAL TIME ZONE $1`, [timezone]);
        }
        
        const result = await client.query(query, [startDate, endDate]);
        
        await client.query('COMMIT');
        
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
        if (client) await client.query('ROLLBACK');
        console.error("[Server] Error fetching campaign stream metrics:", error);
        res.status(500).json({ error: "Could not fetch real-time campaign data." });
    } finally {
        if (client) client.release();
    }
});


export default router;