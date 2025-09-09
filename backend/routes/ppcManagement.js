import express from 'express';
import pool from '../db.js';

const router = express.Router();

// This endpoint provides a map of campaign IDs to their most recent names.
router.get('/ppc/campaign-names', async (req, res) => {
    try {
        // DISTINCT ON retrieves the first row for each unique campaign_id.
        // ORDER BY ... DESC ensures this first row is the one with the most recent report_date.
        const query = `
            SELECT DISTINCT ON (campaign_id)
                campaign_id,
                campaign_name
            FROM sponsored_products_search_term_report
            WHERE campaign_name IS NOT NULL
            ORDER BY campaign_id, report_date DESC;
        `;
        const result = await pool.query(query);

        const nameMap = result.rows.reduce((acc, row) => {
            acc[row.campaign_id] = row.campaign_name;
            return acc;
        }, {});

        res.json(nameMap);

    } catch (error) {
        console.error("[Server] Error fetching PPC campaign names:", error);
        res.status(500).json({ error: "Failed to fetch PPC campaign names." });
    }
});


export default router;