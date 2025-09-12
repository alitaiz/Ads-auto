// scripts/1.request_sp_search_term_reports.js
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
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
const REPORT_TYPE_ID = 'spSearchTerm';

// --- API & DB Logic ---

const createReportRequest = async (accessToken, dateStr) => {
    console.log(`[API] ➡️  Requesting report from Amazon for date: ${dateStr}`);
    
    // A comprehensive list of columns to request, covering most available metrics.
    const comprehensiveColumns = [
        "date", "portfolioId", "campaignName", "campaignId", "campaignStatus", "campaignBudgetType", "campaignBudgetAmount",
        "adGroupName", "adGroupId", "targeting", "matchType", "searchTerm",
        "keywordId", "keyword", "keywordBid", "adKeywordStatus", // FIX: Changed "keywordText" to "keyword"
        "impressions", "clicks", "cost", "costPerClick", "clickThroughRate",
        // 7-Day Window
        "purchases7d", "sales7d", "unitsSoldClicks7d", "acosClicks7d", "roasClicks7d",
        "purchasesSameSku7d", "attributedSalesSameSku7d", "unitsSoldSameSku7d",
        "salesOtherSku7d", "unitsSoldOtherSku7d",
        // 1-Day Window
        "purchases1d", "sales1d", "unitsSoldClicks1d",
        "purchasesSameSku1d", "attributedSalesSameSku1d", "unitsSoldSameSku1d",
        // 14-Day Window
        "purchases14d", "sales14d", "unitsSoldClicks14d", "acosClicks14d", "roasClicks14d",
        "purchasesSameSku14d", "attributedSalesSameSku14d", "unitsSoldSameSku14d",
        // 30-Day Window
        "purchases30d", "sales30d", "unitsSoldClicks30d",
        "purchasesSameSku30d", "attributedSalesSameSku30d", "unitsSoldSameSku30d",
    ];

    const reportRequestBody = {
        name: `SP Search Term Full Report for ${dateStr}`,
        startDate: dateStr,
        endDate: dateStr,
        configuration: {
            adProduct: "SPONSORED_PRODUCTS",
            groupBy: ["searchTerm"],
            columns: comprehensiveColumns,
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
        throw new Error(`Failed to create report for ${dateStr}: ${JSON.stringify(data)}`);
    }
    return data.reportId;
};

const saveRequestToDB = async (client, reportId, dateStr) => {
    const query = `
        INSERT INTO report_requests (report_id, report_type, report_date, status)
        VALUES ($1, $2, $3, 'PENDING')
        ON CONFLICT (report_id) DO NOTHING;
    `;
    await client.query(query, [reportId, REPORT_TYPE_ID, dateStr]);
    console.log(`[DB] 💾 Saved request to queue. Report ID: ${reportId} for Date: ${dateStr}`);
};

// --- Main Orchestrator ---

const main = async () => {
    let client;
    try {
        console.log('🚀 Starting Phase 1: Bulk Report Requester...');
        
        const args = process.argv.slice(2);
        if (args.length !== 2) {
            console.error('❌ Usage: node scripts/1.request_sp_search_term_reports.js YYYY-MM-DD YYYY-MM-DD');
            process.exit(1);
        }
        
        const [startArg, endArg] = args;
        const startDate = new Date(startArg);
        const endDate = new Date(endArg);

        console.log(`[Orchestrator] Requesting reports for dates from ${startArg} to ${endArg}.`);

        client = await pool.connect();
        const accessToken = await getAdsApiAccessToken();
        
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const currentDateStr = d.toISOString().split('T')[0];
            try {
                const reportId = await createReportRequest(accessToken, currentDateStr);
                await saveRequestToDB(client, reportId, currentDateStr);
            } catch (error) {
                console.error(`💥 Failed to process date ${currentDateStr}: ${error.message}`);
                // Continue to the next day
            }
        }

        console.log('\n🎉 Phase 1 Complete. All report requests have been sent and queued in the database.');
        console.log('   Run the processing script in about an hour to download the completed reports.');

    } catch (error) {
        console.error('\n💥 A critical error occurred during the request process:', error);
        process.exit(1);
    } finally {
        if (client) client.release();
        await pool.end();
        console.log('👋 Requester script finished.');
    }
};

main();