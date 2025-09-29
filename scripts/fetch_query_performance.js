// scripts/fetch_query_performance.js
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

// --- Configuration ---
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
const REPORT_TYPE = 'GET_BRAND_ANALYTICS_SEARCH_TERMS_REPORT';
const ASIN_CHUNK_SIZE = 10; // Critical: SP-API limit is 10 ASINs per request

// --- Utility Functions ---

const getDatesForWeek = (year, week) => {
    // January 1st of the given year
    const firstDayOfYear = new Date(year, 0, 1);
    // Day of the week for Jan 1st (0=Sunday, 1=Monday, ..., 6=Saturday)
    const firstDayOfWeek = firstDayOfYear.getDay();
    // Calculate the date of the first Sunday of the year
    const firstSunday = new Date(year, 0, 1 - firstDayOfWeek);

    // Calculate the start date of the target week (weeks start on Sunday)
    const startDate = new Date(firstSunday);
    startDate.setDate(firstSunday.getDate() + (week - 1) * 7);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    const formatDate = (dt) => dt.toISOString().split('T')[0];
    return { startDate: formatDate(startDate), endDate: formatDate(endDate) };
};

const chunkArray = (array, size) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
};


// --- SP-API Client Logic ---

const getSpApiAccessToken = async () => {
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

const createReport = async (accessToken, startDate, asins) => {
    const response = await fetch(`${SP_API_ENDPOINT}/reports/2021-06-30/reports`, {
        method: 'POST',
        headers: { 'x-amz-access-token': accessToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            reportType: REPORT_TYPE,
            reportOptions: {
                reportPeriod: "WEEKLY",
            },
            dataStartTime: startDate,
            marketplaceIds: [SP_API_MARKETPLACE_ID],
            brandAnalyticsDetails: {
                asins,
            }
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
        if (!response.ok) {
             if (response.status === 404) {
                console.warn(`[Fetcher] ⚠️ Report ${reportId} not found (404), likely still processing. Continuing to poll.`);
                await new Promise(resolve => setTimeout(resolve, 30000));
                continue;
             }
            throw new Error(`Polling failed with status ${response.status}. Details: ${JSON.stringify(data.errors)}`);
        }
        status = data.processingStatus;
        reportDocumentId = data.reportDocumentId;
        if (status === 'CANCELLED' || status === 'FATAL') {
            throw new Error(`Report processing failed with status: ${status}. Please check your request parameters.`);
        }
        if (status !== 'DONE') await new Promise(resolve => setTimeout(resolve, 30000));
    }

    if (status !== 'DONE') throw new Error(`Report did not complete processing after ${maxAttempts} attempts.`);
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
    const decompressedData = await gunzip(Buffer.from(buffer));
    const report = JSON.parse(decompressedData.toString('utf-8'));
    return report.dataByAsin;
};

const fetchAndProcessReport = async (startDate, asins) => {
    console.log(`[Fetcher] 📞 Starting SP-API process for ${startDate} to ${new Date(new Date(startDate).setDate(new Date(startDate).getDate() + 6)).toISOString().split('T')[0]}`);
    const accessToken = await getSpApiAccessToken();
    console.log('[Fetcher] 🔑 Access Token obtained.');
    const reportId = await createReport(accessToken, startDate, asins);
    console.log(`[Fetcher] 📝 Report created with ID: ${reportId}`);
    const reportDocumentId = await pollForReport(accessToken, reportId);
    console.log(`[Fetcher] ✅ Report is ready. Document ID: ${reportDocumentId}`);
    const data = await downloadAndParseReport(accessToken, reportDocumentId);
    console.log(`[Fetcher] 📊 Downloaded and parsed ${data.length} ASIN-level records.`);
    return data;
};


// --- Database Logic ---

const saveDataToDB = async (client, reportData, startDate, endDate) => {
    if (!reportData || reportData.length === 0) {
        console.log("[DB] No records to save.");
        return 0;
    }
    const query = `
        INSERT INTO query_performance_data (start_date, end_date, asin, search_query, performance_data)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (asin, start_date, search_query) DO UPDATE SET
            end_date = EXCLUDED.end_date,
            performance_data = EXCLUDED.performance_data;
    `;
    let insertedCount = 0;
    for (const asinData of reportData) {
        for (const performance of asinData.searchQueryPerformance) {
            const values = [
                startDate,
                endDate,
                asinData.asin,
                performance.searchQueryData.searchQuery,
                JSON.stringify(performance)
            ];
            const res = await client.query(query, values);
            if(res.rowCount > 0) insertedCount++;
        }
    }
    console.log(`[DB] 💾 Inserted/Updated ${insertedCount} new records.`);
    return insertedCount;
};

const getExistingAsinsForWeek = async (client, startDate) => {
    const res = await client.query('SELECT DISTINCT asin FROM query_performance_data WHERE start_date = $1', [startDate]);
    return new Set(res.rows.map(r => r.asin));
};

const getUniqueAsinsFromSales = async (client) => {
    const query = `SELECT DISTINCT child_asin FROM sales_and_traffic_by_asin WHERE child_asin IS NOT NULL;`;
    const res = await client.query(query);
    return res.rows.map(r => r.child_asin);
};


// --- Main Orchestrator ---

const main = async () => {
    let client;
    try {
        console.log('🚀 Starting Search Query Performance data fetcher...');
        const args = process.argv.slice(2);
        if (args.length !== 3) {
            console.error('❌ Usage: node scripts/fetch_query_performance.js <YEAR> <START_WEEK> <END_WEEK>');
            process.exit(1);
        }
        const [year, startWeek, endWeek] = args.map(Number);
        if (isNaN(year) || isNaN(startWeek) || isNaN(endWeek) || startWeek > endWeek) {
            console.error('❌ Invalid arguments. Please provide a valid year and week range.');
            process.exit(1);
        }

        client = await pool.connect();

        const allAsins = await getUniqueAsinsFromSales(client);
        if (allAsins.length === 0) {
            console.warn('⚠️ No ASINs found in the sales_and_traffic_by_asin table. Cannot fetch performance data. Please run the sales & traffic fetcher first.');
            return;
        }
        console.log(`[Orchestrator] Found and will process a total of ${allAsins.length} unique ASIN(s) from the database.`);

        console.log(`[Orchestrator] Fetching data for year ${year}, from week ${startWeek} to ${endWeek}.`);

        for (let week = startWeek; week <= endWeek; week++) {
            const { startDate, endDate } = getDatesForWeek(year, week);
            
            const today = new Date();
            const weekEndDate = new Date(endDate);
            if (weekEndDate >= today) {
                console.log(`[Orchestrator] ⏭️  Skipping week ${week} (${startDate} to ${endDate}) as it is in the future.`);
                continue;
            }
            
            console.log(`\n[Orchestrator] ▶️  Processing week ${week} (${startDate} to ${endDate})`);

            const existingAsins = await getExistingAsinsForWeek(client, startDate);
            const asinsToFetch = allAsins.filter(asin => !existingAsins.has(asin));
            
            console.log(`[Orchestrator]   - 🎯 Found ${existingAsins.size} existing ASINs. Fetching data for ${asinsToFetch.length} new/missing ASIN(s).`);

            if (asinsToFetch.length === 0) {
                continue;
            }

            const asinChunks = chunkArray(asinsToFetch, ASIN_CHUNK_SIZE);
            for (let i = 0; i < asinChunks.length; i++) {
                const chunk = asinChunks[i];
                console.log(`[Orchestrator]   - Processing chunk ${i + 1}/${asinChunks.length} for week ${week}...`);
                console.log(`[Orchestrator]     ASINs: ${chunk.join(' ')}`);
                try {
                    await client.query('BEGIN');
                    const reportData = await fetchAndProcessReport(startDate, chunk);
                    await saveDataToDB(client, reportData, startDate, endDate);
                    await client.query('COMMIT');
                    console.log(`[Orchestrator]   - ✅ Successfully processed and saved data for chunk ${i + 1}.`);
                } catch (error) {
                    await client.query('ROLLBACK');
                    console.error(`[Orchestrator] 💥 An error occurred during chunk ${i + 1} processing:`, error.message);
                }
                 // Add a delay between chunks to be safe with rate limits
                if (i < asinChunks.length - 1) {
                    console.log('[Orchestrator]     Waiting 5 seconds before next chunk...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
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
