import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { getAdsApiAccessToken } from '../backend/helpers/amazon-api.js';

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendEnvPath = path.resolve(__dirname, '..', 'backend', '.env');
dotenv.config({ path: backendEnvPath });

const { 
    DB_USER, DB_HOST, DB_DATABASE, DB_PASSWORD, DB_PORT,
    ADS_API_CLIENT_ID, ADS_API_PROFILE_ID
} = process.env;

const pool = new Pool({
  user: DB_USER,
  host: DB_HOST,
  database: DB_DATABASE,
  password: DB_PASSWORD,
  port: parseInt(DB_PORT, 10),
});

const ADS_API_ENDPOINT = 'https://advertising-api.amazon.com';

// --- Comprehensive Metric and Column Lists ---

// All available "base metrics" from the Amazon Ads API documentation for this report.
const API_METRICS = [
    "date", "portfolioId", "campaignName", "campaignId", "campaignBudgetType", "campaignBudgetAmount",
    "campaignStatus", "adGroupName", "adGroupId", "keywordType", "keywordText", "keywordId",
    "keywordBid", "adKeywordStatus", "matchType", "targeting", "searchTerm",
    "impressions", "clicks", "cost", "costPerClick", "clickThroughRate",
    "purchases1d", "purchases7d", "purchases14d", "purchases30d",
    "purchasesSameSku1d", "purchasesSameSku7d", "purchasesSameSku14d", "purchasesSameSku30d",
    "unitsSoldClicks1d", "unitsSoldClicks7d", "unitsSoldClicks14d", "unitsSoldClicks30d",
    "sales1d", "sales7d", "sales14d", "sales30d",
    "attributedSalesSameSku1d", "attributedSalesSameSku7d", "attributedSalesSameSku14d", "attributedSalesSameSku30d",
    "unitsSoldSameSku1d", "unitsSoldSameSku7d", "unitsSoldSameSku14d", "unitsSoldSameSku30d",
    "salesOtherSku7d", "unitsSoldOtherSku7d",
    "acosClicks7d", "acosClicks14d", "roasClicks7d", "roasClicks14d",
    "addToList", "qualifiedBorrows", "royaltyQualifiedBorrows",
    "kindleEditionNormalizedPagesRead14d", "kindleEditionNormalizedPagesRoyalties14d",
    "campaignBudgetCurrencyCode" // Added for completeness
];

// Helper to convert camelCase to snake_case for database columns
const toSnakeCase = str => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

// --- Report Fetching Logic ---

const createReport = async (accessToken, dateStr) => {
    const reportRequestBody = {
        name: `SP Search Term Full Report for ${dateStr}`,
        startDate: dateStr,
        endDate: dateStr,
        configuration: {
            adProduct: "SPONSORED_PRODUCTS",
            groupBy: ["searchTerm"],
            columns: API_METRICS,
            filters: [
                {
                    field: "keywordType",
                    values: ["BROAD", "PHRASE", "EXACT", "TARGETING_EXPRESSION", "TARGETING_EXPRESSION_PREDEFINED"]
                }
            ],
            reportTypeId: "spSearchTerm",
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
        throw new Error(`Failed to create report: ${JSON.stringify(data)}`);
    }
    return data.reportId;
};

const pollForReport = async (accessToken, reportId) => {
    let status = '';
    let url = null;
    let attempts = 0;
    const maxAttempts = 120; // Poll for up to 60 minutes

    while (status !== 'COMPLETED' && attempts < maxAttempts) {
        attempts++;
        console.log(`[Fetcher] ⏱️  Polling for report ${reportId}... Attempt ${attempts}/${maxAttempts}`);
        
        const response = await fetch(`${ADS_API_ENDPOINT}/reporting/reports/${reportId}`, {
            headers: {
                'Amazon-Advertising-API-ClientId': ADS_API_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`,
                'Amazon-Advertising-API-Scope': ADS_API_PROFILE_ID,
            }
        });

        const data = await response.json();
        if (!response.ok) throw new Error(`Polling failed with status ${response.status}. Details: ${JSON.stringify(data)}`);
        
        status = data.status;
        url = data.url;

        if (status === 'FAILURE') throw new Error(`Report processing failed. Reason: ${data.failureReason}`);
        if (status !== 'COMPLETED') await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
    }
    if (status !== 'COMPLETED') throw new Error(`Report did not complete processing after ${maxAttempts} attempts.`);
    return url;
};

const downloadAndParseReport = async (reportUrl) => {
    const fileResponse = await fetch(reportUrl);
    const compressedBuffer = await fileResponse.arrayBuffer();
    const decompressedData = zlib.gunzipSync(Buffer.from(compressedBuffer)).toString('utf-8');
    return JSON.parse(decompressedData);
};

const saveDataToDB = async (client, reportData) => {
    if (reportData.length === 0) {
        console.log("[DB] No records to save.");
        return;
    }
    console.log(`[DB] Preparing to insert ${reportData.length} records...`);

    const extractAsinFromName = (name) => name?.match(/(B0[A-Z0-9]{8})/)?.[0] || null;

    // Dynamically build the column list and value placeholders for the query
    const dbColumns = API_METRICS.map(toSnakeCase).filter(c => c !== 'keyword').concat(['asin']);
    const valuePlaceholders = dbColumns.map((_, i) => `$${i + 1}`).join(', ');
    const conflictTarget = 'report_date, campaign_id, ad_group_id, keyword_id, customer_search_term, targeting';

    const query = `
        INSERT INTO sponsored_products_search_term_report (${dbColumns.join(', ')})
        VALUES (${valuePlaceholders})
        ON CONFLICT (${conflictTarget}) DO NOTHING;
    `;
    
    for (const item of reportData) {
        // Map API data (camelCase) to the order of dbColumns (snake_case)
        const values = dbColumns.map(col => {
             // Handle special cases and snake_case mapping
            if (col === 'asin') return extractAsinFromName(item.campaignName);
            if (col === 'keyword_text') return item.keywordText;
            if (col === 'customer_search_term') return item.searchTerm;
            if (col === 'report_date') return item.date;

            // General camelCase to snake_case lookup
            const camelCaseKey = col.replace(/_([a-z])/g, g => g[1].toUpperCase());
            return item[camelCaseKey] ?? null;
        });
        await client.query(query, values);
    }
     console.log(`[DB] Finished inserting/updating ${reportData.length} records.`);
};

// --- Main Orchestrator ---

const main = async () => {
    let client;
    try {
        console.log('🚀 Starting Comprehensive SP Search Term data fetcher...');
        
        const args = process.argv.slice(2);
        if (args.length !== 2) {
            console.error('❌ Usage: node scripts/fetch_sp_search_term_report.js YYYY-MM-DD YYYY-MM-DD');
            process.exit(1);
        }
        
        const [startArg, endArg] = args;
        const startDate = new Date(startArg);
        const endDate = new Date(endArg);

        console.log(`[Orchestrator] Fetching data from ${startArg} to ${endArg}.`);

        client = await pool.connect();
        const accessToken = await getAdsApiAccessToken();
        
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const currentDateStr = d.toISOString().split('T')[0];
            console.log(`\n[Orchestrator] ▶️  Processing date: ${currentDateStr}`);
            
            await client.query('BEGIN');
            const reportId = await createReport(accessToken, currentDateStr);
            console.log(`[Fetcher] 📝 Report created with ID: ${reportId}`);
            const reportUrl = await pollForReport(accessToken, reportId);
            console.log(`[Fetcher] ✅ Report is ready. Downloading...`);
            const reportData = await downloadAndParseReport(reportUrl);
            await saveDataToDB(client, reportData);
            await client.query('COMMIT');
            console.log(`[Orchestrator] ✅ Successfully processed and saved data for ${currentDateStr}.`);
        }

        console.log('🎉 SP Search Term data fetch finished.');
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('\n💥 An error occurred:', error);
        process.exit(1);
    } finally {
        if (client) client.release();
        await pool.end();
        console.log('👋 Fetcher shut down.');
    }
};

main();