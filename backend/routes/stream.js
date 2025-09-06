// backend/routes/stream.js
import express from 'express';
import pool from '../db.js';

const router = express.Router();

// =================================================================
// == ENDPOINT ĐỂ NHẬN DỮ LIỆU STREAM (DATA INGESTION)            ==
// =================================================================

// Middleware để kiểm tra API key bí mật. Đây là một lớp bảo mật quan trọng.
const checkApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.STREAM_INGEST_SECRET_KEY) {
        console.warn('[Stream Ingest] Thất bại: Sai hoặc thiếu API key.');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Endpoint POST /api/stream-ingest: Nhận dữ liệu từ AWS Lambda và ghi vào PostgreSQL.
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
            // dataset_id là trường đáng tin cậy nhất để xác định loại dữ liệu từ Marketing Stream
            const eventType = event.dataset_id || event.type || 'unknown';

            // Dữ liệu stream (như sp-traffic, sp-conversion) thường được gói trong một object
            // chứa một mảng 'records'. Chúng ta sẽ "bóc tách" và lưu từng record con.
            if (Array.isArray(event.records) && event.records.length > 0) {
                 for (const innerRecord of event.records) {
                    await client.query(query, [eventType, innerRecord]);
                    successfulIngests++;
                 }
            } else {
                // Nếu không có mảng 'records', đây là một sự kiện đơn lẻ.
                await client.query(query, [eventType, event]);
                successfulIngests++;
            }
        }

        await client.query('COMMIT');
        console.log(`[Stream Ingest] Thành công: Đã ghi ${successfulIngests} events vào PostgreSQL.`);
        res.status(200).json({ message: `Successfully ingested ${successfulIngests} events.` });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('[Stream Ingest] Lỗi khi ghi vào PostgreSQL:', error);
        res.status(500).json({ error: 'Failed to write data to database.' });
    } finally {
        if (client) client.release();
    }
});

// =================================================================
// == ENDPOINT ĐỂ CUNG CẤP DỮ LIỆU (DATA RETRIEVAL)             ==
// =================================================================

// Endpoint GET /api/stream/metrics: Cung cấp các chỉ số tổng hợp cho "hôm nay".
router.get('/stream/metrics', async (req, res) => {
    try {
        // Truy vấn này tổng hợp cả dữ liệu traffic và conversion cho ngày hiện tại (UTC).
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
            // Trường hợp này hiếm khi xảy ra với COALESCE, nhưng là một biện pháp an toàn.
            return res.json({
                click_count: 0,
                total_spend: 0,
                total_orders: 0,
                total_sales: 0,
                last_event_timestamp: null
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
        console.error("[Server] Lỗi khi lấy stream metrics:", error);
        res.status(500).json({ error: "Không thể lấy dữ liệu real-time." });
    }
});

export default router;
