// backend/routes/database.js
import express from 'express';
import pool from '../db.js';

const router = express.Router();

// POST /api/db-query: Executes a read-only SQL query.
router.post('/db-query', async (req, res) => {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'A SQL query string is required.' });
    }

    const trimmedQuery = query.trim().toUpperCase();

    // ======================== SECURITY CHECK ========================
    // This is a critical security measure to prevent SQL injection and
    // unauthorized modifications. Only allow SELECT statements.
    if (!trimmedQuery.startsWith('SELECT')) {
        console.warn(`[DB Viewer] Blocked non-SELECT query: "${query}"`);
        return res.status(403).json({ error: 'Forbidden: Only SELECT queries are allowed for security reasons.' });
    }
    // ================================================================

    console.log(`[DB Viewer] Executing query: "${query}"`);
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('[DB Viewer] Query execution error:', error.message);
        res.status(500).json({ error: error.message });
    } finally {
        if (client) {
            client.release();
        }
    }
});

export default router;
