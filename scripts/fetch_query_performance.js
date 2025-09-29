// scripts/fetch_query_performance.js
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

// --- Cấu hình ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendEnvPath = path.resolve(__dirname, '..', 'backend', '.env');
dotenv.config({ path: backendEnvPath });

const {
    DB_USER, DB_HOST, DB_DATABASE, DB_PASSWORD, DB_PORT,
    SP_API_CLIENT_ID, SP_API_CLIENT_SECRET, SP_API_REFRESH_TOKEN, SP_API_MARKETPLACE_ID
} = process.env;

const pool = new Pool({
  user: DB_USER,
  host: DB_HOST,
  database: DB_DATABASE,
  password: DB_PASSWORD,
  port: parseInt(DB_PORT, 10),
});

const SP_API_ENDPOINT = 'https://sellingpartnerapi-na.amazon.com';
// CORRECTED: This is the official report type for Brand Analytics Search Query Performance.
const REPORT_TYPE = 'GET_BRAND_ANALYTICS_SEARCH_QUERY_PERFORMANCE_REPORT';
const ASIN_CHUNK_SIZE = 10;

// --- SP-API Client Logic ---

const getAccessToken = async () => {
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
    if (!response.ok) throw new Error(`Failed to get access token: ${data.error_description || JSON.stringify(data)}`);
    return data.access_token;
};

// CORRECTED: The request body structure for Brand Analytics reports is different.
const createReport = async (accessToken, asins, startDateStr, endDateStr) => {
    const response = await fetch(`${SP_API_ENDPOINT}/reports/2021-06-30/reports`, {
        method: 'POST',
        headers: { 'x-amz-access-token': accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            reportType: REPORT_TYPE,
            reportOptions: {
                reportPeriod: 'WEEK',
                // The ASINs are passed as a single space-separated string under the 'asin' key
                asin: asins.join(' ') 
            },
            dataStartTime: startDateStr,
            dataEndTime: endDateStr,
            marketplaceIds: [SP_API_MARKETPLACE_ID],
        }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(`Failed to create report: ${JSON.stringify(data.errors)}`);
    return data.reportId;
};


const pollForReport = async (accessToken, reportId) => {
    let status = '';
    let reportDocumentId = null;
    let attempts = 0;
    const maxAttempts = 100;
    while (status !== 'DONE' && attempts < maxAttempts) {
        attempts++;
        console.log(`[Fetcher] ⏱️  Polling for report ${reportId}... Attempt ${attempts}/${maxAttempts}`);
        const response = await fetch(`${SP_API_ENDPOINT}/reports/2021-06-30/reports/${reportId}`, {
            headers: { 'x-amz-access-token': accessToken }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(`Polling failed with status ${response.status}. Details: ${JSON.stringify(data.errors)}`);
        status = data.processingStatus;
        reportDocumentId = data.reportDocumentId;
        if (status === 'CANCELLED' || status === 'FATAL') {
            throw new Error(`Report processing failed with status: ${status}. Please check your request parameters.`);
        }
        if (status !== 'DONE') await new Promise(resolve => setTimeout(resolve, 30000));
    }
    if (status !== 'DONE') throw new Error(`Report did not complete after ${maxAttempts} attempts.`);
    return reportDocumentId;
};

const downloadAndParseReport = async (accessToken, reportDocumentId) => {
    const docResponse = await fetch(`${SP_API_ENDPOINT}/reports/2021-06-30/documents/${reportDocumentId}`, {
        headers: { 'x-amz-access-token': accessToken }
    });
    const docData = await docResponse.json();
    if (!docResponse.ok) throw new Error(`Failed to get report document: ${JSON.stringify(docData.errors)}`);
    const fileResponse = await fetch(docData.url);
    const buffer = await fileResponse.arrayBuffer();
    const decompressedData = zlib.gunzipSync(Buffer.from(buffer)).toString('utf-8');
    // The data is nested under `dataByAsin` for this report type
    return JSON.parse(decompressedData).dataByAsin || [];
};

const fetchAndProcessReport = async (asins, weekStartDateStr, weekEndDateStr) => {
    console.log(`[Fetcher] 📞 Starting SP-API process for ${weekStartDateStr} to ${weekEndDateStr}`);
    const accessToken = await getAccessToken();
    console.log('[Fetcher] 🔑 Access Token obtained.');
    
    const reportId = await createReport(accessToken, asins, weekStartDateStr, weekEndDateStr);
    console.log(`[Fetcher] 📝 Report created with ID: ${reportId}`);
    const reportDocumentId = await pollForReport(accessToken, reportId);
    console.log(`[Fetcher] ✅ Report is ready. Document ID: ${reportDocumentId}`);
    const data = await downloadAndParseReport(accessToken, reportDocumentId);
    console.log(`[Fetcher] 📊 Downloaded and parsed ${data.length} query performance records.`);
    return data;
};

const saveDataToDB = async (client, reportData, weekStartDate, weekEndDate) => {
    if (!reportData || reportData.length === 0) {
        console.log('[DB] No data found in the report to save.');
        return;
    }
    const query = `
        INSERT INTO query_performance_data (start_date, end_date, asin, search_query, performance_data)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (asin, start_date, search_query) DO NOTHING;
    `;
    let insertedCount = 0;
    for (const item of reportData) {
        const res = await client.query(query, [
            weekStartDate.toISOString().split('T')[0],
            weekEndDate.toISOString().split('T')[0],
            item.asin,
            item.searchQueryData.searchQuery,
            JSON.stringify(item),
        ]);
        if (res.rowCount > 0) insertedCount++;
    }
    console.log(`[DB] 💾 Inserted ${insertedCount} new records out of ${reportData.length} total from the report.`);
};

// --- Helper & Orchestration Logic ---

const getEligibleAsins = async (client) => {
    const query = `
        SELECT DISTINCT child_asin 
        FROM sales_and_traffic_by_asin
        WHERE report_date >= NOW() - interval '7 days'
          AND (traffic_data->>'sessions')::int > 0;
    `;
    const result = await client.query(query);
    return result.rows.map(row => row.child_asin);
};

const getExistingAsinsForWeek = async (client, startDate) => {
    const result = await client.query('SELECT DISTINCT asin FROM query_performance_data WHERE start_date = $1', [startDate]);
    return new Set(result.rows.map(row => row.asin));
};

const getWeekDateRange = (year, week) => {
    const d = new Date(Date.UTC(year, 0, 1));
    d.setUTCDate(d.getUTCDate() + (week - 1) * 7 - d.getUTCDay()); // Start of week (Sunday)
    const startDate = new Date(d);
    const endDate = new Date(d);
    endDate.setUTCDate(d.getUTCDate() + 6);
    return { startDate, endDate };
};

// --- Main Orchestrator ---

const main = async () => {
    let client;
    try {
        console.log('🚀 Starting Search Query Performance data fetcher...');
        const args = process.argv.slice(2);
        if (args.length < 3) throw new Error('Usage: npm run fetch:query-performance -- <year> <start_week> <end_week>');
        
        const year = parseInt(args[0], 10);
        const startWeek = parseInt(args[1], 10);
        const endWeek = parseInt(args[2], 10);
        if (isNaN(year) || isNaN(startWeek) || isNaN(endWeek)) throw new Error('Year and weeks must be numbers.');

        client = await pool.connect();
        const allEligibleAsins = await getEligibleAsins(client);
        if (allEligibleAsins.length === 0) {
            console.warn("⚠️ No ASINs with sessions > 0 found in the last 7 days. Nothing to fetch.");
            return;
        }
        console.log(`[Orchestrator] Found and will process a total of ${allEligibleAsins.length} unique ASIN(s) from the database.`);
        console.log(`[Orchestrator] Fetching data for year ${year}, from week ${startWeek} to ${endWeek}.`);

        for (let week = startWeek; week <= endWeek; week++) {
            const { startDate, endDate } = getWeekDateRange(year, week);
            const startDateStr = startDate.toISOString().split('T')[0];
            const endDateStr = endDate.toISOString().split('T')[0];

            if (endDate > new Date()) {
                console.log(`[Orchestrator] ⏭️  Skipping week ${week} (${startDateStr} to ${endDateStr}) as it is in the future.`);
                continue;
            }
            console.log(`\n[Orchestrator] ▶️  Processing week ${week} (${startDateStr} to ${endDateStr})`);

            const existingAsins = await getExistingAsinsForWeek(client, startDateStr);
            const asinsToFetch = allEligibleAsins.filter(asin => !existingAsins.has(asin));
            
            console.log(`[Orchestrator]   - 🎯 Found ${existingAsins.size} existing ASINs. Fetching data for ${asinsToFetch.length} new/missing ASIN(s).`);

            if (asinsToFetch.length === 0) continue;

            for (let i = 0; i < asinsToFetch.length; i += ASIN_CHUNK_SIZE) {
                const chunk = asinsToFetch.slice(i, i + ASIN_CHUNK_SIZE);
                console.log(`[Orchestrator]   - Processing chunk ${i / ASIN_CHUNK_SIZE + 1}/${Math.ceil(asinsToFetch.length / ASIN_CHUNK_SIZE)} for week ${week}...`);
                console.log(`[Orchestrator]     ASINs: ${chunk.join(' ')}`);
                
                try {
                    await client.query('BEGIN');
                    const reportData = await fetchAndProcessReport(chunk, startDateStr, endDateStr);
                    await saveDataToDB(client, reportData, startDate, endDate);
                    await client.query('COMMIT');
                    console.log(`[Orchestrator]   - ✅ Successfully processed and saved data for chunk.`);
                } catch (error) {
                    await client.query('ROLLBACK');
                    console.error(`[Orchestrator] 💥 An error occurred during chunk processing: ${error.message}. Transaction rolled back.`);
                }
                const delaySeconds = 5;
                console.log(`[Orchestrator] Waiting for ${delaySeconds} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
            }
        }
        console.log('\n🎉 Search Query Performance data fetch finished.');
    } catch (error) {
        console.error('\n💥 A critical error occurred:', error);
        process.exit(1);
    } finally {
        if (client) client.release();
        await pool.end();
        console.log('👋 Fetcher shut down.');
    }
};

main();