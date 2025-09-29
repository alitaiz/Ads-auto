// backend/routes/salesAndTraffic.js
import express from 'express';
import pool from '../db.js';

const router = express.Router();

/**
 * Safely retrieves a nested property from an object.
 * @param {any} obj The object to query.
 * @param {string} path The dot-separated path to the property.
 * @returns {any} The value of the property, or undefined if not found.
 */
const getNested = (obj, path) => path.split('.').reduce((p, c) => (p && typeof p === 'object' && c in p) ? p[c] : undefined, obj);

/**
 * Normalizes a percentage value (e.g., 95.5 for 95.5%) into a decimal ratio (e.g., 0.955).
 * Safely handles non-numeric values by passing them through.
 * @param {any} value - The value to normalize.
 * @returns {number | any} The normalized decimal, or the original value.
 */
const normalizePercent = (value) => (typeof value === 'number' ? value / 100 : undefined);

const transformSalesData = (row) => {
    if (!row) return null;
    const sales = row.sales_data || {};
    const traffic = row.traffic_data || {};

    return {
        parentAsin: row.parent_asin,
        childAsin: row.child_asin,
        sku: row.sku,
        // Sales Metrics
        unitsOrdered: sales.unitsOrdered,
        orderedProductSales: sales.orderedProductSales?.amount,
        totalOrderItems: sales.totalOrderItems,
        averageSalesPerOrderItem: sales.averageSalesPerOrderItem?.amount,
        // B2B Sales Metrics
        unitsOrderedB2B: sales.unitsOrderedB2B,
        orderedProductSalesB2B: sales.orderedProductSalesB2B?.amount,
        totalOrderItemsB2B: sales.totalOrderItemsB2B,
        averageSalesPerOrderItemB2B: sales.averageSalesPerOrderItemB2B?.amount,
        // Traffic Metrics
        sessions: traffic.sessions,
        pageViews: traffic.pageViews,
        buyBoxPercentage: normalizePercent(traffic.buyBoxPercentage),
        unitSessionPercentage: normalizePercent(traffic.unitSessionPercentage),
        sessionPercentage: normalizePercent(traffic.sessionPercentage),
        pageViewsPercentage: normalizePercent(traffic.pageViewsPercentage),
        // B2B Traffic Metrics
        sessionsB2B: traffic.sessionsB2B,
        pageViewsB2B: traffic.pageViewsB2B,
        buyBoxPercentageB2B: normalizePercent(traffic.buyBoxPercentageB2B),
        unitSessionPercentageB2B: normalizePercent(traffic.unitSessionPercentageB2B),
        sessionPercentageB2B: normalizePercent(traffic.sessionPercentageB2B),
        pageViewsPercentageB2B: normalizePercent(traffic.pageViewsPercentageB2B),
        // Detailed Traffic Breakdowns
        browserSessions: traffic.browserSessions,
        mobileAppSessions: traffic.mobileAppSessions,
        browserPageViews: traffic.browserPageViews,
        mobileAppPageViews: traffic.mobileAppPageViews,
        browserSessionPercentage: normalizePercent(traffic.browserSessionPercentage),
        mobileAppSessionPercentage: normalizePercent(traffic.mobileAppSessionPercentage),
        browserPageViewsPercentage: normalizePercent(traffic.browserPageViewsPercentage),
        mobileAppPageViewsPercentage: normalizePercent(traffic.mobileAppPageViewsPercentage),
        // B2B Detailed Traffic Breakdowns
        browserSessionsB2B: traffic.browserSessionsB2B,
        mobileAppSessionsB2B: traffic.mobileAppSessionsB2B,
        browserPageViewsB2B: traffic.browserPageViewsB2B,
        mobileAppPageViewsB2B: traffic.mobileAppPageViewsB2B,
        browserSessionPercentageB2B: normalizePercent(traffic.browserSessionPercentageB2B),
        mobileAppSessionPercentageB2B: normalizePercent(traffic.mobileAppSessionPercentageB2B),
        browserPageViewsPercentageB2B: normalizePercent(traffic.browserPageViewsPercentageB2B),
        mobileAppPageViewsPercentageB2B: normalizePercent(traffic.mobileAppPageViewsPercentageB2B),
    };
};

// --- Sales & Traffic Endpoints ---

router.get('/sales-and-traffic-filters', async (req, res) => {
    try {
        console.log(`[Server] Querying filters for Sales & Traffic view.`);
        const asinsQuery = 'SELECT DISTINCT child_asin FROM sales_and_traffic_by_asin WHERE child_asin IS NOT NULL ORDER BY child_asin ASC;';
        
        const [asinsResult] = await Promise.all([
            pool.query(asinsQuery),
        ]);

        const asins = asinsResult.rows.map(r => r.child_asin);
        
        res.json({ asins, dates: [] });
    } catch (error) {
        console.error("[Server] Error fetching sales & traffic filters:", error);
        if (error.code === '42P01') { // PostgreSQL 'undefined_table' error
            return res.status(500).json({ error: "Database tables for Sales & Traffic not found. Please run the migration script (004_add_sales_and_traffic_tables.sql.txt) to create them." });
        }
        res.status(500).json({ error: "Failed to fetch filters. Please check the backend server logs for details." });
    }
});


router.get('/sales-and-traffic', async (req, res) => {
    const { asin, date } = req.query;
    if (!date) {
        return res.status(400).json({ error: 'A date is required' });
    }
    console.log(`[Server] Querying sales & traffic for ASIN: ${asin || 'ALL'}, Date: ${date}`);

    try {
        let query;
        const params = [date];
        
        if (asin) {
            query = `
                SELECT parent_asin, child_asin, sku, sales_data, traffic_data 
                FROM sales_and_traffic_by_asin 
                WHERE report_date = $1 AND child_asin = $2
                ORDER BY (traffic_data->>'sessions')::int DESC NULLS LAST;
            `;
            params.push(asin);
        } else {
            query = `
                SELECT parent_asin, child_asin, sku, sales_data, traffic_data 
                FROM sales_and_traffic_by_asin 
                WHERE report_date = $1
                ORDER BY (traffic_data->>'sessions')::int DESC NULLS LAST;
            `;
        }

        const result = await pool.query(query, params);
        const transformedData = result.rows.map(transformSalesData).filter(Boolean);
        
        console.log(`[Server] Found and transformed ${transformedData.length} sales & traffic records.`);
        res.json(transformedData);

    } catch (error) {
        console.error("[Server] Error fetching sales & traffic data:", error);
        res.status(500).json({ error: "Failed to fetch sales & traffic data." });
    }
});


router.get('/sales-and-traffic-history', async (req, res) => {
    const { childAsin, sku: skuFromQuery, metricId } = req.query;

    if (!childAsin || typeof skuFromQuery === 'undefined' || !metricId) {
        return res.status(400).json({ error: 'childAsin, sku, and metricId are required' });
    }

    const isSkuNull = skuFromQuery === 'null' || skuFromQuery === 'undefined';
    const sku = isSkuNull ? null : skuFromQuery;

    console.log(`[Server] Querying history for ASIN: ${childAsin}, SKU: "${sku}", Metric: ${metricId}`);
    
    try {
        const query = `
            SELECT report_date, sales_data, traffic_data
            FROM sales_and_traffic_by_asin
            WHERE child_asin = $1 AND ${!isSkuNull ? 'sku = $2' : 'sku IS NULL'}
            ORDER BY report_date ASC;
        `;
        const params = !isSkuNull ? [childAsin, sku] : [childAsin];
        
        const result = await pool.query(query, params);
        
        const historyData = result.rows.map(row => {
            const transformed = transformSalesData(row);
            const value = getNested(transformed, metricId);
            return {
                report_date: row.report_date,
                value: (value !== null && value !== undefined) ? Number(value) : null,
            };
        });

        res.json(historyData);
    } catch (error) {
        console.error("[Server] Error fetching sales & traffic history:", error);
        res.status(500).json({ error: "Failed to fetch sales & traffic history." });
    }
});

export default router;