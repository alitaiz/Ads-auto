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

    } catch (error) => {
        console.error("[Server] Error fetching PPC campaign names:", error);
        res.status(500).json({ error: "Failed to fetch PPC campaign names." });
    }
});

// POST /api/ppc/keyword-performance
// Fetches aggregated performance metrics for all keywords in a given ad group.
router.post('/keyword-performance', async (req, res) => {
    const { adGroupId, startDate, endDate } = req.body;
    if (!adGroupId || !startDate || !endDate) {
        return res.status(400).json({ error: 'adGroupId, startDate, and endDate are required.' });
    }

    try {
        const query = `
            SELECT
                keyword_id,
                SUM(impressions) as impressions,
                SUM(clicks) as clicks,
                SUM(cost) as spend,
                SUM(purchases_7d) as orders,
                SUM(sales_7d) as sales
            FROM sponsored_products_search_term_report
            WHERE
                ad_group_id = $1 AND
                report_date BETWEEN $2 AND $3
            GROUP BY
                keyword_id;
        `;
        const result = await pool.query(query, [adGroupId, startDate, endDate]);
        
        // Transform keys to camelCase and calculate derived metrics
        const performanceMap = result.rows.reduce((acc, row) => {
            const spend = parseFloat(row.spend || 0);
            const sales = parseFloat(row.sales || 0);
            const clicks = parseInt(row.clicks || 0);
            const impressions = parseInt(row.impressions || 0);

            acc[row.keyword_id] = {
                impressions,
                clicks,
                spend,
                orders: parseInt(row.orders || 0),
                sales,
                acos: sales > 0 ? spend / sales : 0,
                cpc: clicks > 0 ? spend / clicks : 0,
                ctr: impressions > 0 ? clicks / impressions : 0,
            };
            return acc;
        }, {});
        
        res.json(performanceMap);

    } catch (error) {
        console.error("[Server] Error fetching keyword performance:", error);
        res.status(500).json({ error: "Failed to fetch keyword performance data." });
    }
});


export default router;