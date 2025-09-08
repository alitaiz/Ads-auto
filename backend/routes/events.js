// backend/routes/events.js
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

        // Build query conditions based on provided filters
        addCondition('AND event_type = ?', eventType);
        
        // Date range filtering on the 'time_window_start' field within the JSONB data
        if (startDate && endDate) {
            params.push(startDate, endDate);
            query += ` AND (event_data->>'time_window_start')::timestamptz BETWEEN $${params.length - 1} AND $${params.length}`;
        }
        
        // Filtering by IDs within the JSONB data
        addCondition("AND event_data->>'campaign_id' = ?", campaignId);
        addCondition("AND event_data->>'ad_group_id' = ?", adGroupId);
        addCondition("AND event_data->>'keyword_id' = ?", keywordId);
        
        // Add sorting. We directly interpolate validated values here as they cannot be parameterized.
        const sortColumn = sortBy === 'time_window_start' ? "(event_data->>'time_window_start')::timestamptz" : 'received_at';
        query += ` ORDER BY ${sortColumn} ${sortOrder}`;

        // Add limit
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

export default router;