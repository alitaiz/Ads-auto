// backend/routes/database.js
import express from 'express';
import pool from '../db.js';

const router = express.Router();

// POST /api/events/query: Executes a safe, parameterized query for raw stream events.
router.post('/events/query', async (req, res) => {
    const {
        eventType,
        startDate,
        endDate,
        campaignId,
        adGroupId,
        keywordId,
        limit = 100,
        sortBy = 'received_at',
        sortOrder = 'DESC',
    } = req.body;

    // Validate sort parameters to prevent injection
    const validSortBy = ['received_at', 'time_window_start'];
    const validSortOrder = ['ASC', 'DESC'];
    if (!validSortBy.includes(sortBy) || !validSortOrder.includes(sortOrder)) {
        return res.status(400).json({ error: 'Invalid sort parameters.' });
    }

    try {
        let query = 'SELECT * FROM raw_stream_events WHERE 1=1';
        const params = [];
        
        const addCondition = (clause, value) => {
            if (value) {
                params.push(value);
                query += ` ${clause.replace('?', `$${params.length}`)}`;
            }
        };

        addCondition('AND event_type = ?', eventType);
        
        if (startDate && endDate) {
            params.push(startDate, endDate);
            // Ensure end date includes the full day
            query += ` AND (event_data->>'time_window_start')::timestamptz BETWEEN $${params.length - 1} AND ($${params.length}::date + interval '1 day')`;
        }
        
        addCondition("AND event_data->>'campaign_id' = ?", campaignId);
        addCondition("AND event_data->>'ad_group_id' = ?", adGroupId);
        addCondition("AND event_data->>'keyword_id' = ?", keywordId);
        
        const sortColumn = sortBy === 'time_window_start' ? "(event_data->>'time_window_start')::timestamptz" : 'received_at';
        query += ` ORDER BY ${sortColumn} ${sortOrder}`;

        params.push(parseInt(limit, 10) || 100);
        query += ` LIMIT $${params.length}`;
        
        console.log(`[Event Explorer] Executing safe query for filters:`, req.body);
        const result = await pool.query(query, params);
        res.json(result.rows);

    } catch (error) {
        console.error('[Event Explorer] Query execution error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/database/sp-search-terms: Queries the SP Search Term report table.
router.post('/database/sp-search-terms', async (req, res) => {
    const { startDate, endDate, limit = 100 } = req.body;

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required.' });
    }

    try {
        const query = `
            SELECT * 
            FROM sponsored_products_search_term_report 
            WHERE report_date BETWEEN $1 AND $2 
            ORDER BY report_date DESC, impressions DESC NULLS LAST 
            LIMIT $3`;
        const params = [startDate, endDate, parseInt(limit, 10)];
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('[DB Viewer - Search Terms] Query execution error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/database/sales-traffic: Queries the Sales & Traffic by ASIN table.
router.post('/database/sales-traffic', async (req, res) => {
    const { date, limit = 100 } = req.body;

    if (!date) {
        return res.status(400).json({ error: 'A date is required.' });
    }

    try {
        const query = `
            SELECT * 
            FROM sales_and_traffic_by_asin 
            WHERE report_date = $1 
            ORDER BY (traffic_data->>'sessions')::int DESC NULLS LAST 
            LIMIT $2`;
        const params = [date, parseInt(limit, 10)];
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('[DB Viewer - Sales & Traffic] Query execution error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

export default router;
