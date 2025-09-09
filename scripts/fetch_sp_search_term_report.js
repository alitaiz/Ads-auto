import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendEnvPath = path.resolve(__dirname, '..', 'backend', '.env');
dotenv.config({ path: backendEnvPath });

const { 
    DB_USER, DB_HOST, DB_DATABASE, DB_PASSWORD, DB_PORT,
    ADS_API_CLIENT_ID, ADS_API_CLIENT_SECRET, ADS_API_REFRESH_TOKEN, ADS_API_PROFILE_ID
} = process.env;

// Validate essential Ads API credentials
if (!ADS_API_CLIENT_ID || !ADS_API_CLIENT_SECRET || !ADS_API_REFRESH_TOKEN || !ADS_API_PROFILE_ID) {
    console.error("❌ Error: Missing required Amazon Ads API credentials in backend/.env file.");
    console.error("Please set ADS_API_CLIENT_ID, ADS_API_CLIENT_SECRET, ADS_API_REFRESH_TOKEN, and ADS_API_PROFILE_ID.");
    process.exit(1);
}

const pool = new Pool({
  user: DB_USER,
  host: DB_HOST,
  database: DB_DATABASE,
  password: DB_PASSWORD,
  port: parseInt(DB_PORT, 10),
});

const ADS_API_ENDPOINT = 'https://advertising-api.amazon.com'; // North America endpoint
const REPORT_TYPE_ID = 'spSearchTerm';

// --- Amazon Ads API V3 Client ---

const getAccessToken = async () => {
    const response = await fetch('https://api.amazon.com/auth/o2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: ADS_API_REFRESH_TOKEN,
            client_id: ADS_API_CLIENT_ID,
            client_secret: ADS_API_CLIENT_SECRET,
        }),
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(`Failed to get access token: ${data.error_description || JSON.stringify(data)}`);
    }
    return data.access_token;
};

const createReport = async (accessToken, date) => {
    const reportDate = date.toISOString().split('T')[0];
    const reportRequestBody = {
        name: `SP Search Term Report for ${reportDate}`,
        startDate: reportDate,
        endDate: reportDate,
        configuration: {
            adProduct: "SPONSORED_PRODUCTS",
            groupBy: ["searchTerm"],
            columns: [
                "date", "campaignName", "campaignId", "adGroupName", "adGroupId",
                "keywordId", "keywordBid", "targeting", "matchType", "searchTerm",
                "impressions", "clicks", "costPerClick", "cost", // API uses 'cost', we map it to 'spend'
                "sales7d", "acosClicks7d", "roasClicks7d", "purchases7d", "unitsSoldClicks7d",
                "attributedSalesSameSku7d", "unitsSoldSameSku7d", "salesOtherSku7d", "unitsSoldOtherSku7d"
            ],
            reportTypeId: REPORT_TYPE_ID,
            timeUnit: "DAILY",
            format: "GZIP_JSON"
        }
    };

    const response = await fetch(`${ADS_API_ENDPOINT}/reporting/reports`, {
        method: 'POST',
        headers: {
            'Amazon-Advertising-API-ClientId': ADS_API_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`,
            'Amazon-Advertising-API-Scope': ADS_API_PROFILE_ID,
            'Content-Type': 'application/vnd.createasyncreportrequest.v3+json',
        },
        body: JSON.stringify(reportRequestBody),
    });

    const data = await response.json();
    
    if (!response.ok) {
        // Handle the specific "duplicate request" error from the Ads API
        if (response.status === 425 && data.code === '425' && data.detail?.includes('The Request is a duplicate of :')) {
            const duplicateReportId = data.detail.split(': ').pop()?.trim();
            if (duplicateReportId) {
                console.log(`[Fetcher] ⚠️  Received duplicate request error. Resuming previous report with ID: ${duplicateReportId}`);
                return duplicateReportId;
            }
        }
        // For all other errors, throw as before
        throw new Error(`Failed to create report: ${JSON.stringify(data.errors || data)}`);
    }
    
    return data.reportId;
};

const pollForReport = async (accessToken, reportId) => {
    let status = '';
    let reportUrl = null;
    let attempts = 0;
    const maxAttempts = 100; // Poll for up to 100 minutes

    while (status !== 'COMPLETED' && attempts < maxAttempts) {
        attempts++;
        console.log(`[Fetcher] ⏱️  Polling for report ${reportId}... Attempt ${attempts}/${maxAttempts}`);
        
        const response = await fetch(`${ADS_API_ENDPOINT}/reporting/reports/${reportId}`, {
            headers: { 
                'Amazon-Advertising-API-ClientId': ADS_API_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`,
                'Amazon-Advertising-API-Scope': ADS_API_PROFILE_ID
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Polling failed with status ${response.status}. Details: ${errorText}`);
        }
        
        const data = await response.json();
        status = data.status;
        reportUrl = data.url;

        if (status === 'FAILURE') {
            throw new Error(`Report processing failed. Reason: ${data.failureReason || 'Unknown'}`);
        }

        if (status !== 'COMPLETED') {
            await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60 seconds
        }
    }

    if (status !== 'COMPLETED') {
        throw new Error(`Report did not complete processing after ${maxAttempts} attempts.`);
    }

    return reportUrl;
};

const downloadAndParseReport = async (reportUrl) => {
    const fileResponse = await fetch(reportUrl);
    if (!fileResponse.ok) {
        throw new Error(`Failed to download report file from ${reportUrl}. Status: ${fileResponse.status}`);
    }
    
    const compressedBuffer = await fileResponse.arrayBuffer();
    const decompressedData = await new Promise((resolve, reject) => {
        zlib.gunzip(Buffer.from(compressedBuffer), (err, result) => {
            if (err) reject(err);
            else resolve(result.toString('utf-8'));
        });
    });

    return JSON.parse(decompressedData);
};

/**
 * Extracts a standard Amazon ASIN (e.g., B0XXXXXXXX) from a string.
 * @param {string} campaignName The string to search within.
 * @returns {string | null} The found ASIN or null.
 */
const extractAsinFromName = (campaignName) => {
    if (typeof campaignName !== 'string') return null;
    const match = campaignName.match(/(B0[A-Z0-9]{8})/);
    return match ? match[0] : null;
};

const saveDataToDB = async (client, reportData) => {
    if (!reportData || reportData.length === 0) {
        console.log('[DB] No data to save.');
        return 0;
    }

    let insertedCount = 0;
    for (const item of reportData) {
        const asin = extractAsinFromName(item.campaignName); // Extract ASIN

        const query = `
            INSERT INTO sponsored_products_search_term_report (
                report_date, campaign_id, campaign_name, ad_group_id, ad_group_name,
                keyword_id, keyword_bid, targeting,
                match_type, customer_search_term, impressions, clicks, cost_per_click, spend,
                seven_day_total_sales, seven_day_acos, seven_day_roas, seven_day_total_orders,
                seven_day_total_units, seven_day_advertised_sku_sales, seven_day_advertised_sku_units,
                seven_day_other_sku_sales, seven_day_other_sku_units, asin
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
            ) ON CONFLICT (report_date, campaign_id, ad_group_id, keyword_id, customer_search_term, targeting) DO NOTHING;
        `;
        const values = [
            item.date, item.campaignId, item.campaignName, item.adGroupId, item.adGroupName,
            item.keywordId, item.keywordBid, item.targeting,
            item.matchType, item.searchTerm, item.impressions, item.clicks,
            item.costPerClick, item.cost, // Map API 'cost' to DB 'spend'
            item.sales7d, item.acosClicks7d, item.roasClicks7d, item.purchases7d, item.unitsSoldClicks7d,
            item.attributedSalesSameSku7d, item.unitsSoldSameSku7d, item.salesOtherSku7d, item.unitsSoldOtherSku7d,
            asin // Add the extracted ASIN
        ];

        const result = await client.query(query, values);
        if (result.rowCount > 0) {
            insertedCount++;
        }
    }
    console.log(`[DB] Finished processing ${reportData.length} records. Inserted ${insertedCount} new records.`);
    return insertedCount;
};

const wasDateProcessed = async (client, date) => {
    const dateStr = date.toISOString().split('T')[0];
    const result = await client.query('SELECT 1 FROM sponsored_products_search_term_report WHERE report_date = $1 LIMIT 1', [dateStr]);
    return result.rowCount > 0;
};

// --- Main Orchestrator ---

const main = async () => {
    let client;
    try {
        console.log('🚀 Starting Sponsored Products Search Term Report fetcher...');
        
        const args = process.argv.slice(2);
        if (args.length !== 2) {
            console.error('❌ Error: Invalid number of arguments.');
            console.error('Usage: node scripts/fetch_sp_search_term_report.js YYYY-MM-DD YYYY-MM-DD');
            process.exit(1);
        }
        
        const [startArg, endArg] = args;
        const startDate = new Date(`${startArg}T00:00:00.000Z`);
        const endDate = new Date(`${endArg}T00:00:00.000Z`);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new Error('Invalid date format. Please use YYYY-MM-DD.');
        }

        client = await pool.connect();
        
        for (let d = new Date(endDate); d >= startDate; d.setUTCDate(d.getUTCDate() - 1)) {
            const currentDateStr = d.toISOString().split('T')[0];
            
            if (await wasDateProcessed(client, d)) {
                console.log(`[Orchestrator] ⏭️  Skipping ${currentDateStr}, data already exists.`);
                continue;
            }

            console.log(`[Orchestrator] ▶️  Processing date: ${currentDateStr}`);
            
            const accessToken = await getAccessToken();
            const reportId = await createReport(accessToken, new Date(d));
            console.log(`[Orchestrator] 📝 Report creation requested with ID: ${reportId}`);

            const reportUrl = await pollForReport(accessToken, reportId);
            console.log(`[Orchestrator] ✅ Report is ready. Downloading from URL.`);
            
            const reportData = await downloadAndParseReport(reportUrl);
            
            await saveDataToDB(client, reportData);
            
            console.log(`[Orchestrator] ✅ Successfully processed and saved data for ${currentDateStr}.`);
        }

        console.log('🎉 Sponsored Products Search Term Report fetch finished.');
    } catch (error)
    {
        console.error('[Orchestrator] 💥 An error occurred:', error);
        process.exit(1);
    } finally {
        if (client) client.release();
        await pool.end();
        console.log('👋 Fetcher shut down.');
    }
};

main();