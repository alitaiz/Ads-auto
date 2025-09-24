import express from 'express';
import pool from '../db.js';

const router = express.Router();

// --- SP Search Term Report Endpoints ---

router.get('/sp-search-terms-filters', async (req, res) => {
    const { reportType = 'SP' } = req.query; // Default to SP
    const tableName = reportType === 'SB' ? 'sponsored_brands_search_term_report' : 'sponsored_products_search_term_report';
    
    try {
        console.log(`[Server] Querying filters for ${reportType} Search Term Report view.`);
        const asinsQuery = `SELECT DISTINCT asin FROM ${tableName} WHERE asin IS NOT NULL ORDER BY asin ASC;`;
        
        const [asinsResult] = await Promise.all([
            pool.query(asinsQuery),
        ]);

        const asins = asinsResult.rows.map(r => r.asin);
        
        res.json({ asins, dates: [] });
    } catch (error) {
        console.error(`[Server] Error fetching ${reportType} search term filters:`, error);
        if (error.code === '42P01') { // PostgreSQL 'undefined_table' error
            return res.status(500).json({ error: `Database table for ${reportType} Search Term Report not found. Please run the appropriate migration script.` });
        }
        res.status(500).json({ error: "Failed to fetch filters. Please check the backend server logs for details." });
    }
});

router.get('/sp-search-terms', async (req, res) => {
    const { asin, startDate, endDate, reportType = 'SP' } = req.query;
    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'A startDate and endDate are required' });
    }
    console.log(`[Server] Querying ${reportType} search terms/targets for ASIN: ${asin || 'ALL'}, from ${startDate} to ${endDate}`);
    
    const isSB = reportType === 'SB';
    const isSD = reportType === 'SD';

    const tableName = isSB ? 'sponsored_brands_search_term_report' : isSD ? 'sponsored_display_targeting_report' : 'sponsored_products_search_term_report';
    const salesColumn = isSD ? 'sales' : isSB ? 'sales' : 'sales_7d';
    const ordersColumn = isSD ? 'purchases' : isSB ? 'purchases' : 'purchases_7d';
    const unitsColumn = isSD ? 'units_sold' : isSB ? 'units_sold' : 'units_sold_clicks_7d';
    
    // Dynamically select the correct text/expression columns based on report type
    let targetingExpression, matchTypeExpression, searchTermExpression;
    if (isSD) {
        searchTermExpression = 'targeting_text';
        targetingExpression = 'targeting_expression';
        matchTypeExpression = `'N/A'`; // Tactic is not available in this report, so we use a placeholder.
    } else if (isSB) {
        searchTermExpression = 'customer_search_term';
        targetingExpression = 'keyword_text';
        matchTypeExpression = 'match_type';
    } else { // SP
        searchTermExpression = 'customer_search_term';
        targetingExpression = 'COALESCE(keyword_text, targeting)';
        matchTypeExpression = 'match_type';
    }

    try {
        const queryParams = [startDate, endDate];
        let whereClauses = [`report_date BETWEEN $1 AND $2`];

        if (asin) {
            queryParams.push(asin);
            whereClauses.push(`asin = $${queryParams.length}`);
        }
        
        const groupByColumns = [
            'campaign_name',
            'campaign_id',
            'ad_group_name',
            'ad_group_id',
            searchTermExpression,
            'asin',
            targetingExpression,
        ];
        
        // CRITICAL FIX: Only add match_type to GROUP BY if it's an actual column, not a constant literal.
        if (!isSD) {
            groupByColumns.push(matchTypeExpression);
        }

        const query = `
            SELECT 
                campaign_name,
                campaign_id,
                ad_group_name,
                ad_group_id,
                ${searchTermExpression} as customer_search_term, 
                asin,
                ${targetingExpression} as targeting,
                ${matchTypeExpression} as match_type,
                SUM(COALESCE(impressions, 0)) as impressions,
                SUM(COALESCE(clicks, 0)) as clicks,
                SUM(COALESCE(cost, 0)) as spend,
                SUM(COALESCE(${salesColumn}, 0)) as seven_day_total_sales,
                SUM(COALESCE(${ordersColumn}, 0)) as seven_day_total_orders,
                SUM(COALESCE(${unitsColumn}, 0)) as seven_day_total_units
            FROM ${tableName}
            WHERE ${whereClauses.join(' AND ')}
            GROUP BY 
                ${groupByColumns.join(',\n                ')}
            ORDER BY SUM(COALESCE(impressions, 0)) DESC NULLS LAST;
        `;

        const result = await pool.query(query, queryParams);
        
        const transformedData = result.rows.map(row => {
            const spend = parseFloat(row.spend || 0);
            const clicks = parseInt(row.clicks || 0);
            const sales = parseFloat(row.seven_day_total_sales || 0);

            const costPerClick = clicks > 0 ? spend / clicks : 0;
            const sevenDayAcos = sales > 0 ? spend / sales : 0;
            const sevenDayRoas = spend > 0 ? sales / spend : 0;

            return {
                campaignName: row.campaign_name,
                campaignId: row.campaign_id,
                adGroupName: row.ad_group_name,
                adGroupId: row.ad_group_id,
                customerSearchTerm: row.customer_search_term, // Frontend uses this generic key
                impressions: parseInt(row.impressions || 0),
                clicks: clicks,
                costPerClick: costPerClick,
                spend: spend,
                sevenDayTotalSales: sales,
                sevenDayAcos: sevenDayAcos,
                asin: row.asin,
                targeting: row.targeting, // Frontend uses this generic key
                matchType: row.match_type, // Frontend uses this generic key
                sevenDayRoas: sevenDayRoas,
                sevenDayTotalOrders: parseInt(row.seven_day_total_orders || 0),
                sevenDayTotalUnits: parseInt(row.seven_day_total_units || 0)
            };
        });
        
        console.log(`[Server] Found and transformed ${transformedData.length} aggregated ${reportType} records.`);
        res.json(transformedData);

    } catch (error) {
        console.error(`[Server] Error fetching ${reportType} data:`, error);
        res.status(500).json({ error: `Failed to fetch ${reportType} data.` });
    }
});

export default router;