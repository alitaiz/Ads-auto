// scripts/2.process_pending_reports.js
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

// --- API & DB Logic ---

const getPendingReports = async (client) => {
    const query = "SELECT * FROM report_requests WHERE status = 'PENDING' ORDER BY report_date ASC";
    const res = await client.query(query);
    return res.rows;
};

const checkReportStatus = async (accessToken, reportId) => {
    const response = await fetch(`${ADS_API_ENDPOINT}/reporting/reports/${reportId}`, {
        headers: {
            'Amazon-Advertising-API-ClientId': ADS_API_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`,
            'Amazon-Advertising-API-Scope': ADS_API_PROFILE_ID,
        }
    });
    const data = await response.json();
    if (!response.ok) {
        // If the report is too new, the API might 404. We'll treat this as still pending.
        if (response.status === 404) {
            return { status: 'PENDING', url: null, failureReason: 'Not found, likely still processing.' };
        }
        throw new Error(`Status check failed for report ${reportId}: ${JSON.stringify(data)}`);
    }
    return { status: data.status, url: data.url, failureReason: data.failureReason };
};

const downloadAndParseReport = async (reportUrl) => {
    const fileResponse = await fetch(reportUrl);
    if (!fileResponse.ok) throw new Error(`Failed to download report from ${reportUrl}. Status: ${fileResponse.status}`);
    const compressedBuffer = await fileResponse.arrayBuffer();
    const decompressedData = zlib.gunzipSync(Buffer.from(compressedBuffer)).toString('utf-8');
    return JSON.parse(decompressedData);
};

const saveDataToDB = async (client, reportData) => {
    if (!reportData || reportData.length === 0) {
        console.log("[DB] No records to save.");
        return;
    }
    
    const extractAsinFromName = (name) => name?.match(/(B0[A-Z0-9]{8})/)?.[0] || null;

    const query = `
        INSERT INTO sponsored_products_search_term_report (
            report_date, campaign_name, campaign_id, ad_group_name, ad_group_id, 
            targeting, match_type, customer_search_term, keyword_text, impressions, 
            clicks, cost, sales_7d, purchases_7d, asin
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
        )
        ON CONFLICT (report_date, campaign_id, ad_group_id, customer_search_term, targeting) DO NOTHING;
    `;
    
    let insertedCount = 0;
    for (const item of reportData) {
        const values = [
            item.date, item.campaignName, item.campaignId, item.adGroupName, item.adGroupId,
            item.targeting, item.matchType, item.searchTerm, item.keyword, item.impressions,
            item.clicks, item.cost, item.sales7d, item.purchases7d, extractAsinFromName(item.campaignName)
        ];
        const res = await client.query(query, values);
        if (res.rowCount > 0) {
            insertedCount++;
        }
    }
    console.log(`[DB] 💾 Inserted ${insertedCount} new records out of ${reportData.length} total from the report.`);
};

const updateReportRequestStatus = async (client, reportId, status, url = null, reason = null) => {
    const query = `
        UPDATE report_requests 
        SET status = $1, download_url = $2, failure_reason = $3
        WHERE report_id = $4;
    `;
    await client.query(query, [status, url, reason, reportId]);
};

// --- Main Orchestrator ---

const main = async () => {
    let client;
    try {
        console.log('\n🚀 Starting Phase 2: Pending Report Processor...');
        
        client = await pool.connect();
        const pendingReports = await getPendingReports(client);

        if (pendingReports.length === 0) {
            console.log("✅ No pending reports found in the queue. All done for now!");
            return;
        }

        console.log(`[Queue] Found ${pendingReports.length} pending report(s).`);
        const accessToken = await getAdsApiAccessToken();
        
        for (const report of pendingReports) {
            console.log(`\n[Processor] Checking report ${report.report_id} for date ${report.report_date.toISOString().split('T')[0]}...`);
            try {
                const { status, url, failureReason } = await checkReportStatus(accessToken, report.report_id);
                console.log(`[API] STATUS: ${status}`);

                if (status === 'COMPLETED') {
                    console.log("[Processor] ✅ Report is COMPLETED. Downloading and saving...");
                    const reportData = await downloadAndParseReport(url);
                    await saveDataToDB(client, reportData);
                    await updateReportRequestStatus(client, report.report_id, 'DOWNLOADED', url);
                    console.log("[Processor] ✔️  Successfully downloaded and saved data.");
                } else if (status === 'FAILURE') {
                    console.error(`[Processor] ❌ Report FAILED. Reason: ${failureReason}`);
                    await updateReportRequestStatus(client, report.report_id, 'FAILED', null, failureReason);
                } else {
                    // Still PENDING or PROCESSING, do nothing and check again next time.
                    console.log(`[Processor] ⏱️  Report is still ${status}. Will check again on the next run.`);
                }
            } catch (error) {
                console.error(`💥 An error occurred while processing report ${report.report_id}: ${error.message}`);
                // Optionally, update the status to FAILED here to avoid retrying a consistently failing report
                await updateReportRequestStatus(client, report.report_id, 'FAILED', null, error.message);
            }
        }

    } catch (error) {
        console.error('\n💥 A critical error occurred in the processor:', error);
        process.exit(1);
    } finally {
        if (client) client.release();
        await pool.end();
        console.log('\n👋 Processor script finished.');
    }
};

main();
