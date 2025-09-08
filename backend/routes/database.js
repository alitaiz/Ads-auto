// backend/routes/database.js
import express from 'express';
import pool from '../db.js';
import zlib from 'zlib';
import { getAdsApiAccessToken } from '../helpers/amazon-api.js'; // Assuming you refactor this out
import { URLSearchParams } from 'url';

const router = express.Router();


// Helper function to get SP-API access token (logic from fetch_sales_and_traffic.js)
const getSpApiAccessToken = async () => {
    const { SP_API_REFRESH_TOKEN, SP_API_CLIENT_ID, SP_API_CLIENT_SECRET } = process.env;
    const response = await fetch('https://api.amazon.com/auth/o2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: SP_API_REFRESH_TOKEN,
            client_id: SP_API_CLIENT_ID,
            client_secret: SP_API_CLIENT_SECRET,
        }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`SP-API Token Error: ${data.error_description || JSON.stringify(data)}`);
    return data.access_token;
};


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
    const { startDate, endDate, limit = 100 } = req.body;

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'A startDate and endDate are required.' });
    }

    try {
        const query = `
            SELECT * 
            FROM sales_and_traffic_by_asin 
            WHERE report_date BETWEEN $1 AND $2
            ORDER BY (traffic_data->>'sessions')::int DESC NULLS LAST 
            LIMIT $3`;
        const params = [startDate, endDate, parseInt(limit, 10)];
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('[DB Viewer - Sales & Traffic] Query execution error:', error.message);
        res.status(500).json({ error: error.message });
    }
});


// NEW ENDPOINT: Check for missing dates in a range for a specific report type
router.post('/database/check-missing-dates', async (req, res) => {
    const { source, startDate, endDate } = req.body;
    if (!source || !startDate || !endDate) {
        return res.status(400).json({ error: 'source, startDate, and endDate are required.' });
    }

    let tableName;
    switch (source) {
        case 'searchTermReport':
            tableName = 'sponsored_products_search_term_report';
            break;
        case 'salesTrafficReport':
            tableName = 'sales_and_traffic_by_date'; // Use the smaller daily table for checking
            break;
        default:
            return res.status(400).json({ error: 'Invalid source specified.' });
    }

    try {
        const query = `
            SELECT calendar.day::date
            FROM generate_series($1::date, $2::date, '1 day'::interval) AS calendar(day)
            LEFT JOIN (SELECT DISTINCT report_date FROM ${tableName}) AS report
                ON calendar.day = report.report_date
            WHERE report.report_date IS NULL
            ORDER BY calendar.day;
        `;
        const result = await pool.query(query, [startDate, endDate]);
        const missingDates = result.rows.map(row => row.day.toISOString().split('T')[0]);
        res.json({ missingDates });
    } catch (error) {
        console.error(`[Data Integrity] Error checking missing dates for ${source}:`, error.message);
        res.status(500).json({ error: 'Failed to check for missing dates.' });
    }
});

// NEW ENDPOINT: Trigger a fetch for a single missing day
router.post('/database/fetch-missing-day', async (req, res) => {
    const { source, date } = req.body;
    if (!source || !date) {
        return res.status(400).json({ error: 'source and date are required.' });
    }

    try {
        console.log(`[On-Demand Fetch] Received request to fetch ${source} for ${date}`);
        let resultMessage = '';
        if (source === 'searchTermReport') {
            await fetchSpSearchTermForDay(date);
            resultMessage = `Successfully fetched SP Search Term report for ${date}.`;
        } else if (source === 'salesTrafficReport') {
            await fetchSalesTrafficForDay(date);
            resultMessage = `Successfully fetched Sales & Traffic report for ${date}.`;
        } else {
            return res.status(400).json({ error: 'Invalid source specified.' });
        }
        res.status(200).json({ message: resultMessage });

    } catch (error) {
        console.error(`[On-Demand Fetch] Failed to fetch ${source} for ${date}:`, error.message);
        res.status(500).json({ error: `Failed to fetch data. Reason: ${error.message}` });
    }
});


// --- On-Demand Fetch Logic (adapted from scripts) ---

// Logic for SP Search Term Report
async function fetchSpSearchTermForDay(dateStr) {
    const { ADS_API_CLIENT_ID, ADS_API_PROFILE_ID } = process.env;
    const accessToken = await getAdsApiAccessToken();

    // 1. Create Report
    const reportRequestBody = { /* ... body from script ... */ 
        name: `SP Search Term Report for ${dateStr} (On-Demand)`,
        startDate: dateStr,
        endDate: dateStr,
        configuration: {
            adProduct: "SPONSORED_PRODUCTS", groupBy: ["searchTerm"],
            columns: ["date", "campaignName", "campaignId", "adGroupName", "adGroupId", "targeting", "matchType", "searchTerm", "impressions", "clicks", "costPerClick", "cost", "sales7d", "acosClicks7d", "roasClicks7d", "purchases7d", "unitsSoldClicks7d", "attributedSalesSameSku7d", "unitsSoldSameSku7d", "salesOtherSku7d", "unitsSoldOtherSku7d"],
            reportTypeId: "spSearchTerm", timeUnit: "DAILY", format: "GZIP_JSON"
        }
    };
    const createResponse = await fetch(`https://advertising-api.amazon.com/reporting/reports`, {
        method: 'POST',
        headers: { 'Amazon-Advertising-API-ClientId': ADS_API_CLIENT_ID, 'Authorization': `Bearer ${accessToken}`, 'Amazon-Advertising-API-Scope': ADS_API_PROFILE_ID, 'Content-Type': 'application/vnd.createasyncreportrequest.v3+json' },
        body: JSON.stringify(reportRequestBody),
    });
    const createData = await createResponse.json();
    if (!createResponse.ok) throw new Error(`Ads API Error (Create): ${JSON.stringify(createData)}`);
    const { reportId } = createData;

    // 2. Poll for Report
    let reportUrl = null;
    for (let i = 0; i < 60; i++) { // Poll for up to 30 mins
        await new Promise(resolve => setTimeout(resolve, 30000));
        const pollResponse = await fetch(`https://advertising-api.amazon.com/reporting/reports/${reportId}`, { headers: { 'Amazon-Advertising-API-ClientId': ADS_API_CLIENT_ID, 'Authorization': `Bearer ${accessToken}`, 'Amazon-Advertising-API-Scope': ADS_API_PROFILE_ID } });
        const pollData = await pollResponse.json();
        if (pollData.status === 'COMPLETED') { reportUrl = pollData.url; break; }
        if (pollData.status === 'FAILURE') throw new Error(`Ads API Report Failed: ${pollData.failureReason}`);
    }
    if (!reportUrl) throw new Error('Report polling timed out.');

    // 3. Download, Parse, and Save
    const fileResponse = await fetch(reportUrl);
    const compressedBuffer = await fileResponse.arrayBuffer();
    const decompressedData = zlib.gunzipSync(Buffer.from(compressedBuffer)).toString('utf-8');
    const reportData = JSON.parse(decompressedData);

    const extractAsinFromName = (name) => name?.match(/(B0[A-Z0-9]{8})/)?.[0] || null;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const item of reportData) {
            const query = `INSERT INTO sponsored_products_search_term_report (report_date, campaign_id, campaign_name, ad_group_id, ad_group_name, targeting, match_type, customer_search_term, impressions, clicks, cost_per_click, spend, seven_day_total_sales, seven_day_acos, seven_day_roas, seven_day_total_orders, seven_day_total_units, seven_day_advertised_sku_sales, seven_day_advertised_sku_units, seven_day_other_sku_sales, seven_day_other_sku_units, asin) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22) ON CONFLICT (report_date, campaign_id, ad_group_id, customer_search_term, targeting) DO NOTHING;`;
            const values = [item.date, item.campaignId, item.campaignName, item.adGroupId, item.adGroupName, item.targeting, item.matchType, item.searchTerm, item.impressions, item.clicks, item.costPerClick, item.cost, item.sales7d, item.acosClicks7d, item.roasClicks7d, item.purchases7d, item.unitsSoldClicks7d, item.attributedSalesSameSku7d, item.unitsSoldSameSku7d, item.salesOtherSku7d, item.unitsSoldOtherSku7d, extractAsinFromName(item.campaignName)];
            await client.query(query, values);
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK'); throw e;
    } finally {
        client.release();
    }
}


// Logic for Sales & Traffic Report
async function fetchSalesTrafficForDay(dateStr) {
    const { SP_API_MARKETPLACE_ID } = process.env;
    const accessToken = await getSpApiAccessToken();

    // 1. Create Report
    const createResponse = await fetch(`https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports`, {
        method: 'POST',
        headers: { 'x-amz-access-token': accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType: 'GET_SALES_AND_TRAFFIC_REPORT', reportOptions: { dateGranularity: 'DAY', asinGranularity: 'CHILD' }, dataStartTime: dateStr, dataEndTime: dateStr, marketplaceIds: [SP_API_MARKETPLACE_ID] }),
    });
    const createData = await createResponse.json();
    if (!createResponse.ok) throw new Error(`SP-API Error (Create): ${JSON.stringify(createData)}`);
    const { reportId } = createData;

    // 2. Poll for Report
    let reportDocumentId = null;
    for (let i = 0; i < 60; i++) {
        await new Promise(resolve => setTimeout(resolve, 30000));
        const pollResponse = await fetch(`https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/reports/${reportId}`, { headers: { 'x-amz-access-token': accessToken } });
        const pollData = await pollResponse.json();
        if (pollData.processingStatus === 'DONE') { reportDocumentId = pollData.reportDocumentId; break; }
        if (['CANCELLED', 'FATAL'].includes(pollData.processingStatus)) throw new Error(`SP-API Report Failed: ${pollData.processingStatus}`);
    }
    if (!reportDocumentId) throw new Error('Report polling timed out.');

    // 3. Download, Parse, and Save
    const docResponse = await fetch(`https://sellingpartnerapi-na.amazon.com/reports/2021-06-30/documents/${reportDocumentId}`, { headers: { 'x-amz-access-token': accessToken } });
    const docData = await docResponse.json();
    const fileResponse = await fetch(docData.url);
    const compressedBuffer = await fileResponse.arrayBuffer();
    const decompressedData = zlib.gunzipSync(Buffer.from(compressedBuffer)).toString('utf-8');
    const reportData = JSON.parse(decompressedData);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        if (reportData.salesAndTrafficByDate?.length > 0) {
            for (const item of reportData.salesAndTrafficByDate) {
                const query = `INSERT INTO sales_and_traffic_by_date (report_date, sales_data, traffic_data) VALUES ($1, $2, $3) ON CONFLICT (report_date) DO UPDATE SET sales_data = EXCLUDED.sales_data, traffic_data = EXCLUDED.traffic_data;`;
                await client.query(query, [item.date, JSON.stringify(item.salesByDate), JSON.stringify(item.trafficByDate)]);
            }
        }
        if (reportData.salesAndTrafficByAsin?.length > 0) {
            for (const item of reportData.salesAndTrafficByAsin) {
                const query = `INSERT INTO sales_and_traffic_by_asin (report_date, parent_asin, child_asin, sku, sales_data, traffic_data) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (report_date, child_asin, sku) DO UPDATE SET parent_asin = EXCLUDED.parent_asin, sales_data = EXCLUDED.sales_data, traffic_data = EXCLUDED.traffic_data;`;
                await client.query(query, [dateStr, item.parentAsin, item.childAsin, item.sku, JSON.stringify(item.salesByAsin), JSON.stringify(item.trafficByAsin)]);
            }
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK'); throw e;
    } finally {
        client.release();
    }
}


export default router;