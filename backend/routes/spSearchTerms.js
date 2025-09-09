import express from 'express';
import pool from '../db.js';

const router = express.Router();

// Helper to convert snake_case from DB to camelCase for JSON response
const toCamelCase = (str) => str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());

// --- API Endpoints for SP Search Term Report ---

/**
 * GET /api/sp-search-terms-filters
 * Provides distinct filter options (ASINs, campaign names) for the frontend UI.
 */
router.get('/sp-search-terms-filters', async (req, res) => {
    try {
        const asinsQuery = 'SELECT DISTINCT asin FROM sponsored_products_search_term_report WHERE asin IS NOT NULL ORDER BY asin ASC;';
        const campaignsQuery = 'SELECT DISTINCT campaign_name FROM sponsored_products_search_term_report WHERE campaign_name IS NOT NULL ORDER BY campaign_name ASC;';
        
        const [asinsResult, campaignsResult] = await Promise.all([
            pool.query(asinsQuery),
            pool.query(campaignsQuery)
        ]);

        const asins = asinsResult.rows.map(r => r.asin);
        const campaignNames = campaignsResult.rows.map(r => r.campaign_name);
        
        res.json({ asins, campaignNames });
    } catch (error) {
        console.error("[Server] Error fetching SP search term filters:", error);
        if (error.code === '42P01') {
            return res.status(500).json({ error: "Database table for SP Search Term Report not found. Please run the migration script (003) to create it." });
        }
        res.status(500).json({ error: "Failed to fetch filters." });
    }
});

/**
 * GET /api/sp-search-terms
 * The main data endpoint. Fetches and aggregates all performance metrics based on provided filters.
 * Now supports a date range.
 */
router.get('/sp-search-terms', async (req, res) => {
    const { startDate, endDate, asin, campaignName } = req.query;
    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'A startDate and endDate are required' });
    }

    try {
        const queryParams = [startDate, endDate];
        let whereClauses = [`report_date BETWEEN $1 AND $2`];

        if (asin) {
            queryParams.push(asin);
            whereClauses.push(`asin = $${queryParams.length}`);
        }
        if (campaignName) {
            queryParams.push(campaignName);
            whereClauses.push(`campaign_name = $${queryParams.length}`);
        }
        
        const query = `
            SELECT 
                campaign_name,
                campaign_id,
                ad_group_name,
                ad_group_id,
                customer_search_term,
                asin,
                keyword_id,
                keyword_bid,
                -- Aggregate all numeric and bigint metrics using SUM()
                SUM(impressions) as impressions,
                SUM(clicks) as clicks,
                SUM(cost) as spend, -- Renaming cost to spend for consistency
                SUM(purchases_7d) as seven_day_total_orders,
                SUM(sales_7d) as seven_day_total_sales,
                SUM(units_sold_clicks_7d) as seven_day_total_units
                -- Add more SUM() for other metrics as needed by the frontend in the future
            FROM sponsored_products_search_term_report 
            WHERE ${whereClauses.join(' AND ')}
            GROUP BY 
                campaign_name,
                campaign_id,
                ad_group_name,
                ad_group_id,
                customer_search_term,
                asin,
                keyword_id,
                keyword_bid
            ORDER BY SUM(impressions) DESC NULLS LAST;
        `;

        const result = await pool.query(query, queryParams);
        
        const transformedData = result.rows.map(row => {
            const spend = parseFloat(row.spend || 0);
            const sales = parseFloat(row.seven_day_total_sales || 0);

            // Calculate derived metrics
            const sevenDayAcos = sales > 0 ? spend / sales : 0;
            const sevenDayRoas = spend > 0 ? sales / spend : 0;
            
            // Transform keys to camelCase and parse numbers
            const camelCaseRow = {};
            for (const key in row) {
                camelCaseRow[toCamelCase(key)] = row[key];
            }
            
            return {
                ...camelCaseRow,
                spend,
                sevenDayTotalSales: sales,
                sevenDayAcos,
                sevenDayRoas,
                impressions: parseInt(row.impressions || 0),
                clicks: parseInt(row.clicks || 0),
                sevenDayTotalOrders: parseInt(row.seven_day_total_orders || 0),
                sevenDayTotalUnits: parseInt(row.seven_day_total_units || 0),
            };
        });
        
        res.json(transformedData);

    } catch (error) {
        console.error("[Server] Error fetching SP search term data:", error);
        res.status(500).json({ error: "Failed to fetch SP search term data." });
    }
});

// POST /api/keyword-search-terms
// Fetches search terms and their performance for a specific keyword within a date range.
router.post('/keyword-search-terms', async (req, res) => {
    const { keywordId, startDate, endDate } = req.body;
    if (!keywordId || !startDate || !endDate) {
        return res.status(400).json({ error: 'keywordId, startDate, and endDate are required.' });
    }

    try {
        const query = `
            SELECT 
                customer_search_term,
                SUM(impressions) as impressions,
                SUM(clicks) as clicks,
                SUM(cost) as spend,
                SUM(purchases_7d) as seven_day_total_orders,
                SUM(sales_7d) as seven_day_total_sales
            FROM sponsored_products_search_term_report 
            WHERE 
                keyword_id = $1 AND
                report_date BETWEEN $2 AND $3
            GROUP BY 
                customer_search_term
            HAVING SUM(impressions) > 0 -- Only show terms with at least one impression
            ORDER BY SUM(impressions) DESC NULLS LAST;
        `;

        const result = await pool.query(query, [keywordId, startDate, endDate]);
        
        const transformedData = result.rows.map(row => {
            const spend = parseFloat(row.spend || 0);
            const sales = parseFloat(row.seven_day_total_sales || 0);
            const acos = sales > 0 ? spend / sales : 0;
            
            return {
                customerSearchTerm: row.customer_search_term,
                impressions: parseInt(row.impressions || 0),
                clicks: parseInt(row.clicks || 0),
                spend,
                sevenDayTotalOrders: parseInt(row.seven_day_total_orders || 0),
                sevenDayTotalSales: sales,
                sevenDayAcos: acos,
            };
        });
        
        res.json(transformedData);

    } catch (error) {
        console.error("[Server] Error fetching keyword search terms:", error);
        res.status(500).json({ error: "Failed to fetch keyword search term data." });
    }
});

export default router;