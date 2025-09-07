import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

// --- Cấu hình ---
// Load environment variables from backend/.env
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
const REPORT_TYPE = 'GET_SALES_AND_TRAFFIC_REPORT';

// --- SP-API Client ---

const getAccessToken = async () => {
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: SP_API_REFRESH_TOKEN,
        client_id: SP_API_CLIENT_ID,
        client_secret: SP_API_CLIENT_SECRET,
    });
    
    const response = await fetch('https://api.amazon.com/auth/o2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(`Failed to get access token: ${data.error_description || JSON.stringify(data)}`);
    }
    return data.access_token;
};

const createReport = async (accessToken, date) => {
    const reportDate = date.toISOString().split('T')[0];
    const response = await fetch(`${SP_API_ENDPOINT}/reports/2021-06-30/reports`, {
        method: 'POST',
        headers: {
            'x-amz-access-token': accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            reportType: REPORT_TYPE,
            reportOptions: {
                dateGranularity: 'DAY',
                asinGranularity: 'CHILD'
            },
            dataStartTime: reportDate,
            dataEndTime: reportDate,
            marketplaceIds: [SP_API_MARKETPLACE_ID],
        }),
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(`Failed to create report: ${JSON.stringify(data.errors)}`);
    }
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
            throw new Error(`Polling failed with status ${response.status}. Details: ${JSON.stringify(data.errors)}`);
        }

        status = data.processingStatus;
        reportDocumentId = data.reportDocumentId;

        if (status === 'CANCELLED' || status === 'FATAL') {
            throw new Error(`Report processing failed with status: ${status}.`);
        }

        if (status !== 'DONE') {
            await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
        }
    }

    if (status !== 'DONE') {
        throw new Error(`Report did not complete processing after ${maxAttempts} attempts.`);
    }

    return reportDocumentId;
};

const downloadAndParseReport = async (accessToken, reportDocumentId) => {
    const docResponse = await fetch(`${SP_API_ENDPOINT}/reports/2021-06-30/documents/${reportDocumentId}`, {
        headers: { 'x-amz-access-token': accessToken }
    });
    const docData = await docResponse.json();

    if (!docResponse.ok) throw new Error(`Failed to get report document: ${JSON.stringify(docData.errors)}`);
    
    const downloadUrl = docData.url;
    const compression = docData.compressionAlgorithm;

    const fileResponse = await fetch(downloadUrl);
    const buffer = await fileResponse.arrayBuffer();

    let decompressedData;
    if (compression === 'GZIP') {
        decompressedData = await new Promise((resolve, reject) => {
            zlib.gunzip(Buffer.from(buffer), (err, result) => {
                if (err) reject(err);
                else resolve(result.toString('utf-8'));
            });
        });
    } else {
        decompressedData = Buffer.from(buffer).toString('utf-8');
    }

    const report = JSON.parse(decompressedData);
    // The report contains two main arrays, return them both
    return {
        salesAndTrafficByDate: report.salesAndTrafficByDate || [],
        salesAndTrafficByAsin: report.salesAndTrafficByAsin || []
    };
};

const fetchAndProcessReport = async (date) => {
    console.log(`[Fetcher] 📞 Starting SP-API process for ${date.toISOString().split('T')[0]}...`);
    const accessToken = await getAccessToken();
    console.log('[Fetcher] 🔑 Access Token obtained.');
    const reportId = await createReport(accessToken, date);
    console.log(`[Fetcher] 📝 Report created with ID: ${reportId}`);
    const reportDocumentId = await pollForReport(accessToken, reportId);
    console.log(`[Fetcher] ✅ Report is ready. Document ID: ${reportDocumentId}`);
    const data = await downloadAndParseReport(accessToken, reportDocumentId);
    console.log(`[Fetcher] 📊 Downloaded and parsed ${data.salesAndTrafficByDate.length} daily records and ${data.salesAndTrafficByAsin.length} ASIN records.`);
    return data;
};

const saveDataToDB = async (client, reportData, reportDate) => {
    const dateStr = reportDate.toISOString().split('T')[0];

    // --- Save Daily Aggregated Data ---
    const dailyData = reportData.salesAndTrafficByDate;
    if (dailyData && dailyData.length > 0) {
        console.log(`[DB] Inserting ${dailyData.length} daily aggregated records for ${dateStr}...`);
        for (const item of dailyData) {
            const query = `
                INSERT INTO sales_and_traffic_by_date (report_date, sales_data, traffic_data)
                VALUES ($1, $2, $3)
                ON CONFLICT (report_date) DO UPDATE SET
                    sales_data = EXCLUDED.sales_data,
                    traffic_data = EXCLUDED.traffic_data;
            `;
            await client.query(query, [item.date, JSON.stringify(item.salesByDate), JSON.stringify(item.trafficByDate)]);
        }
    } else {
        console.log(`[DB] No daily aggregated data to save for ${dateStr}.`);
    }

    // --- Save Per-ASIN Data ---
    const asinData = reportData.salesAndTrafficByAsin;
    if (asinData && asinData.length > 0) {
        console.log(`[DB] Inserting ${asinData.length} per-ASIN records for ${dateStr}...`);
        for (const item of asinData) {
            const query = `
                INSERT INTO sales_and_traffic_by_asin (report_date, parent_asin, child_asin, sku, sales_data, traffic_data)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (report_date, child_asin, sku) DO UPDATE SET
                    parent_asin = EXCLUDED.parent_asin,
                    sales_data = EXCLUDED.sales_data,
                    traffic_data = EXCLUDED.traffic_data;
            `;
            const values = [
                dateStr,
                item.parentAsin,
                item.childAsin,
                item.sku,
                JSON.stringify(item.salesByAsin),
                JSON.stringify(item.trafficByAsin)
            ];
            await client.query(query, values);
        }
    } else {
        console.log(`[DB] No per-ASIN data to save for ${dateStr}.`);
    }
};

const wasDateProcessed = async (client, date) => {
    const dateStr = date.toISOString().split('T')[0];
    const result = await client.query('SELECT 1 FROM sales_and_traffic_by_date WHERE report_date = $1 LIMIT 1', [dateStr]);
    return result.rowCount > 0;
};

// --- Main Orchestrator ---

const main = async () => {
    let client;
    try {
        console.log('🚀 Starting Sales & Traffic data fetcher...');
        
        const args = process.argv.slice(2);
        if (args.length !== 2) {
            console.error('❌ Error: Invalid number of arguments.');
            console.error('Usage: node scripts/fetch_sales_and_traffic.js YYYY-MM-DD YYYY-MM-DD');
            process.exit(1);
        }
        
        const [startArg, endArg] = args;
        const startDate = new Date(`${startArg}T00:00:00.000Z`);
        const endDate = new Date(`${endArg}T00:00:00.000Z`);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            console.error('❌ Error: Invalid date format. Please use YYYY-MM-DD.');
            process.exit(1);
        }
        if (startDate > endDate) {
            console.error('❌ Error: Start date cannot be after end date.');
            process.exit(1);
        }

        console.log(`[Orchestrator] Fetching data from ${startArg} to ${endArg}.`);

        client = await pool.connect();
        
        for (let d = new Date(endDate); d >= startDate; d.setUTCDate(d.getUTCDate() - 1)) {
            const currentDateStr = d.toISOString().split('T')[0];
            
            if (await wasDateProcessed(client, d)) {
                console.log(`[Orchestrator] ⏭️  Skipping ${currentDateStr}, already processed.`);
                continue;
            }

            console.log(`[Orchestrator] ▶️  Processing date: ${currentDateStr}`);
            
            await client.query('BEGIN');
            const reportData = await fetchAndProcessReport(new Date(d));
            await saveDataToDB(client, reportData, new Date(d));
            await client.query('COMMIT');

            console.log(`[Orchestrator] ✅ Successfully processed and saved data for ${currentDateStr}.`);
            
            // Add a delay to avoid rate limiting
            const delaySeconds = 5;
            console.log(`[Orchestrator] Waiting for ${delaySeconds} seconds before next request...`);
            await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        }

        console.log('🎉 Sales & Traffic data fetch finished.');
    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
            console.error('[Orchestrator] ❌ Transaction rolled back due to an error.');
        }
        console.error('[Orchestrator] 💥 An error occurred:', error);
        process.exit(1);
    } finally {
        if (client) {
            client.release();
        }
        await pool.end();
        console.log('👋 Fetcher shut down.');
    }
};

main();