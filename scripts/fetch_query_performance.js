// scripts/fetch_query_performance.js
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
const REPORT_TYPE = 'GET_BRAND_ANALYTICS_SEARCH_QUERY_PERFORMANCE_REPORT';

// --- SP-API Client ---

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
    if (!response.ok) {
        throw new Error(`Failed to get access token: ${data.error_description || JSON.stringify(data)}`);
    }
    return data.access_token;
};

const createReport = async (accessToken, startDate, endDate, asins) => {
    const response = await fetch(`${SP_API_ENDPOINT}/reports/2021-06-30/reports`, {
        method: 'POST',
        headers: {
            'x-amz-access-token': accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            reportType: REPORT_TYPE,
            reportOptions: {
                reportPeriod: 'WEEK',
                // API expects a space-separated string, not an array
                asins: asins
            },
            dataStartTime: startDate.toISOString().split('T')[0],
            dataEndTime: endDate.toISOString().split('T')[0],
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
    const maxAttempts = 100; // Increased to 100 attempts (~50 minutes)

    while (status !== 'DONE' && attempts < maxAttempts) {
        attempts++;
        console.log(`[Fetcher] ⏱️  Polling for report ${reportId}... Attempt ${attempts}/${maxAttempts}`);
        
        const response = await fetch(`${SP_API_ENDPOINT}/reports/2021-06-30/reports/${reportId}`, {
            headers: { 'x-amz-access-token': accessToken }
        });
        const data = await response.json();
        
        if (!response.ok) {
            const errorDetails = data.errors ? JSON.stringify(data.errors) : 'No details provided.';
            throw new Error(`Polling failed with status ${response.status}. Details: ${errorDetails}`);
        }

        status = data.processingStatus;
        reportDocumentId = data.reportDocumentId;

        if (status === 'CANCELLED' || status === 'FATAL') {
            throw new Error(`Report processing failed with status: ${status}. Please check your request parameters.`);
        }

        if (status !== 'DONE' && attempts < maxAttempts) { // Don't wait on the last attempt
            await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds before next poll
        }
    }

    if (status !== 'DONE') {
        const errorMessage = `Report did not complete processing after ${maxAttempts} attempts (${(maxAttempts * 30) / 60} minutes).
Possible reasons:
1. The requested date range is very large or in the distant past.
2. The report is for a future date which Amazon cannot generate yet.
3. Amazon's systems are experiencing high load.
Please try again later or with a smaller date range.`;
        throw new Error(errorMessage);
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
    return report.dataByAsin || [];
};

const fetchAndProcessReport = async (startDate, endDate, asins) => {
    console.log(`[Fetcher] 📞 Starting SP-API process for ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    const accessToken = await getAccessToken();
    console.log('[Fetcher] 🔑 Access Token obtained.');
    const reportId = await createReport(accessToken, startDate, endDate, asins);
    console.log(`[Fetcher] 📝 Report created with ID: ${reportId}`);
    const reportDocumentId = await pollForReport(accessToken, reportId);
    console.log(`[Fetcher] ✅ Report is ready. Document ID: ${reportDocumentId}`);
    const data = await downloadAndParseReport(accessToken, reportDocumentId);
    console.log(`[Fetcher] 📊 Downloaded and parsed ${data.length} ASIN-query records.`);
    return data;
};

const saveDataToDB = async (client, data) => {
    if (!data || data.length === 0) {
        console.log('[DB] No data to save.');
        return 0;
    }

    let insertedCount = 0;
    for (const item of data) {
        const query = `
            INSERT INTO query_performance_data (start_date, end_date, asin, search_query, performance_data)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (asin, start_date, search_query) DO NOTHING;
        `;
        const values = [
            item.startDate,
            item.endDate,
            item.asin,
            item.searchQueryData.searchQuery, // Extract search query for the constraint
            JSON.stringify(item) // Store the whole object as JSONB
        ];
        const result = await client.query(query, values);
        if (result.rowCount > 0) {
            insertedCount++;
        }
    }
    console.log(`[DB] Finished inserting/skipping records. Inserted ${insertedCount} new performance records.`);
    return insertedCount;
};

/**
 * Calculates the start (Sunday) and end (Saturday) dates for a given US week number and year using UTC.
 * This function is timezone-safe.
 * @param {number} year - The year.
 * @param {number} weekNumber - The week number (1-53).
 * @returns {{startDate: Date, endDate: Date}}
 */
function getWeekDateRangeUTC(year, weekNumber) {
    // Start with the first day of the year in UTC
    const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
    
    // Get the day of the week for Jan 1st (0=Sun, 1=Mon, ..., 6=Sat) in UTC
    const firstDayOfWeek = firstDayOfYear.getUTCDay();

    // Calculate the date of the first Sunday of the year.
    // If Jan 1st is a Wednesday (3), we subtract 3 days to get to the previous Sunday.
    const firstSunday = new Date(firstDayOfYear);
    firstSunday.setUTCDate(firstDayOfYear.getUTCDate() - firstDayOfWeek);

    // Calculate the start date of the target week (which is always a Sunday)
    const startDate = new Date(firstSunday);
    startDate.setUTCDate(firstSunday.getUTCDate() + (weekNumber - 1) * 7);

    // The end date is 6 days after the start date (always a Saturday)
    const endDate = new Date(startDate);
    endDate.setUTCDate(startDate.getUTCDate() + 6);

    return { startDate, endDate };
}


/**
 * Splits a long, space-separated string of ASINs into chunks that are each
 * under a specified character limit.
 * @param {string[]} asinsArray - An array of ASIN strings.
 * @param {number} limit - The character limit for each chunk (defaults to 200).
 * @returns {string[]} An array of space-separated ASIN string chunks.
 */
function chunkAsins(asinsArray, limit = 200) {
    if (asinsArray.length === 0) return [];

    const chunks = [];
    let currentChunk = "";

    for (const asin of asinsArray) {
        if (currentChunk.length === 0) {
            currentChunk = asin;
        } else if (currentChunk.length + 1 + asin.length <= limit) {
            currentChunk += ` ${asin}`;
        } else {
            chunks.push(currentChunk);
            currentChunk = asin;
        }
    }
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }
    return chunks;
}


const main = async () => {
    let client;
    try {
        console.log('🚀 Starting Search Query Performance data fetcher...');
        
        const args = process.argv.slice(2);
        if (args.length !== 3) {
            console.error('❌ Error: Invalid number of arguments.');
            console.error('Usage: node scripts/fetch_query_performance.js <YEAR> <START_WEEK> <END_WEEK>');
            console.error('Example: node scripts/fetch_query_performance.js 2024 30 32');
            process.exit(1);
        }

        const [year, startWeek, endWeek] = args.map(Number);
        if ([year, startWeek, endWeek].some(isNaN)) {
             console.error('❌ Error: All arguments must be numbers.');
             process.exit(1);
        }
        if (startWeek > endWeek) {
            console.error('❌ Error: START_WEEK cannot be after END_WEEK.');
            process.exit(1);
        }

        client = await pool.connect();
        
        // --- Dynamic ASIN fetching ---
        let dbAsins = [];
        try {
            const dbResult = await client.query("SELECT DISTINCT child_asin FROM sales_and_traffic_by_asin WHERE child_asin IS NOT NULL;");
            dbAsins = dbResult.rows.map(r => r.child_asin);
        } catch (dbError) {
             console.error(`[Orchestrator] ❌ Error fetching ASINs from the database. The Sales & Traffic report data might be missing. Error: ${dbError.message}`);
             // Continue, but it will likely exit below.
        }
        
        const allAsinsToProcess = [...new Set(dbAsins)];

        if (allAsinsToProcess.length === 0) {
            console.warn('⚠️ Warning: No ASINs found in the sales_and_traffic_by_asin table.');
            console.warn('   Please ensure you have fetched the Sales & Traffic report data first before running this script.');
            console.warn('   Exiting script.');
            return;
        }
        
        console.log(`[Orchestrator] Found and will process a total of ${allAsinsToProcess.length} unique ASIN(s) from the database.`);
        console.log(`[Orchestrator] Fetching data for year ${year}, from week ${startWeek} to ${endWeek}.`);

        for (let week = endWeek; week >= startWeek; week--) {
            const { startDate, endDate } = getWeekDateRangeUTC(year, week);
            const startDateStr = startDate.toISOString().split('T')[0];

            console.log(`\n[Orchestrator] ▶️  Processing week ${week} (${startDateStr} to ${endDate.toISOString().split('T')[0]})`);
            
            const checkQuery = `
                SELECT DISTINCT asin 
                FROM query_performance_data 
                WHERE start_date = $1 AND asin = ANY($2::text[]);
            `;
            const dbResult = await client.query(checkQuery, [startDateStr, allAsinsToProcess]);
            const fetchedAsinsForWeek = new Set(dbResult.rows.map(r => r.asin));
            
            const missingAsins = allAsinsToProcess.filter(asin => !fetchedAsinsForWeek.has(asin));

            if (missingAsins.length === 0) {
                console.log(`[Orchestrator]   - ✅ All ${allAsinsToProcess.length} target ASIN(s) already have data for this week. Skipping.`);
                continue;
            }

            console.log(`[Orchestrator]   - 🎯 Found ${fetchedAsinsForWeek.size} existing ASINs. Fetching data for ${missingAsins.length} new/missing ASIN(s).`);
            
            const asinChunks = chunkAsins(missingAsins);
            
            for (const [index, asinChunk] of asinChunks.entries()) {
                 console.log(`\n[Orchestrator]   - Processing chunk ${index + 1}/${asinChunks.length} for week ${week}...`);
                 console.log(`[Orchestrator]     ASINs: ${asinChunk}`);

                 const reportData = await fetchAndProcessReport(startDate, endDate, asinChunk);
                 await saveDataToDB(client, reportData);
                 
                 const delaySeconds = 20;
                 console.log(`[Orchestrator]     Waiting for ${delaySeconds} seconds before the next request...`);
                 await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
            }

            console.log(`[Orchestrator] ✅ Successfully processed all chunks for week ${week}.`);
        }

        console.log('\n🎉 Query Performance data fetch finished.');
    } catch (error) {
        console.error('\n[Orchestrator] 💥 An error occurred:', error);
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