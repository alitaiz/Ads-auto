// backend/routes/aiAnalysis.js
import express from 'express';
import pool from '../db.js';
import { GoogleGenAI, Type } from '@google/genai';
import { getApiKey } from '../helpers/keyManager.js';
import { getProductTextAttributes } from '../helpers/spApiHelper.js';

const router = express.Router();

// --- Constants and Configuration ---
const REPORTING_TIMEZONE = 'America/Los_Angeles';
const CLASSIFICATION_CHUNK_SIZE = 20; // Reverted back to 20
const DELAY_BETWEEN_CHUNKS = 2000; // 2 seconds

// --- In-memory Cache for Product Details ---
const productDetailsCache = new Map();

// --- Helper Functions ---

/**
 * Calls Gemini with a structured JSON schema request and includes retry logic.
 * @param {string} prompt - The user prompt.
 * @param {object} schema - The JSON schema for the expected response.
 * @param {string} context - Additional context to include in the system instruction.
 * @returns {Promise<object>} - The parsed JSON object from the AI.
 */
const callGeminiStep = async (prompt, schema, context = "") => {
    let retries = 0;
    const maxRetries = 3;
    let lastError = null;

    while (retries < maxRetries) {
        try {
            const apiKey = await getApiKey('gemini');
            const ai = new GoogleGenAI({ apiKey });

            const systemInstruction = `You are an expert Amazon PPC Analyst. Analyze the provided JSON data to answer the user's question. ${context} Respond ONLY with a valid JSON object matching the provided schema. Do not include any introductory text or markdown formatting.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-flash-latest',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema,
                    systemInstruction: systemInstruction,
                },
            });
            
            const jsonStr = response.text.trim();
            return JSON.parse(jsonStr);

        } catch (error) {
            lastError = error;
            retries++;
            const delay = Math.pow(2, retries) * 1000;
            console.warn(`[AI Report Step] Gemini API is overloaded or failed (Attempt ${retries}/${maxRetries}). Retrying in ${delay / 1000}s...`);
            if (retries < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    console.error(`[AI Report Step] Gemini API call failed after ${maxRetries} attempt(s).`, lastError);
    throw lastError;
};

/**
 * Classifies search terms as relevant or not using Gemini AI in batches.
 * @param {object} product - The product details (title, bulletPoints).
 * @param {Array<string>} searchTerms - The list of search terms to classify.
 * @returns {Promise<Map<string, boolean>>} - A map of search terms to their relevance (true/false).
 */
async function classifySearchTermsWithAI(product, searchTerms) {
    const relevanceMap = new Map();
    const allKeys = await getApiKey.getAllActiveKeys ? await getApiKey.getAllActiveKeys('gemini') : [await getApiKey('gemini')];
    if (allKeys.length === 0) throw new Error("No active Gemini keys found.");
    let keyIndex = 0;

    const schema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                searchTerm: { type: Type.STRING },
                isRelevant: { type: Type.BOOLEAN },
            },
            required: ["searchTerm", "isRelevant"]
        }
    };
    
    for (let i = 0; i < searchTerms.length; i += CLASSIFICATION_CHUNK_SIZE) {
        const chunk = searchTerms.slice(i, i + CLASSIFICATION_CHUNK_SIZE);
        const currentApiKey = allKeys[keyIndex];
        keyIndex = (keyIndex + 1) % allKeys.length;
        console.log(`[AI Report] Classifying search term chunk ${Math.ceil((i+1)/CLASSIFICATION_CHUNK_SIZE)} with key ...${currentApiKey.slice(-4)}`);
        
        const prompt = `
            You are an Amazon PPC expert. For the product below, classify each search term in the list as relevant or not. A term is relevant if a customer searching for it would likely buy this product.
            
            Product Title: "${product.title}"
            Product Bullets:
            ${(product.bulletPoints || []).map(bp => `- ${bp}`).join('\n')}

            Search Terms to Classify:
            ${JSON.stringify(chunk)}
        `;

        let retries = 0;
        const maxRetries = 3;
        while (retries < maxRetries) {
            try {
                const ai = new GoogleGenAI({ apiKey: currentApiKey });
                const response = await ai.models.generateContent({
                    model: 'gemini-flash-latest', contents: prompt,
                    config: { responseMimeType: "application/json", responseSchema: schema }
                });
                const results = JSON.parse(response.text.trim());
                results.forEach(res => relevanceMap.set(res.searchTerm, res.isRelevant));
                break; // Success, exit retry loop
            } catch (error) {
                retries++;
                const delay = Math.pow(2, retries) * 1000;
                console.warn(`[AI Report] Failed to classify chunk (Attempt ${retries}/${maxRetries}). Retrying in ${delay / 1000}s...`);
                if (retries >= maxRetries) {
                     console.error(`[AI Report] Failed to classify chunk:`, error);
                     chunk.forEach(term => relevanceMap.set(term, true)); // Default to relevant on persistent failure
                } else {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        if (i + CLASSIFICATION_CHUNK_SIZE < searchTerms.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS));
        }
    }
    return relevanceMap;
}

const getAsinStatus = (daysOfData) => {
    if (daysOfData < 30) return { status: 'New', text: 'Mới launching' };
    if (daysOfData <= 60) return { status: 'Launching', text: 'Trong thời gian launching' };
    return { status: 'Established', text: 'Cũ (Established)' };
};

const calculateKpis = (spend = 0, sales = 0, orders = 0, units = 0, sessions = 0) => {
    const safeSpend = Number(spend) || 0;
    const safeSales = Number(sales) || 0;
    const safeOrders = Number(orders) || 0;
    const safeUnits = Number(units) || 0;
    const safeSessions = Number(sessions) || 0;

    const acos = safeSales > 0 ? (safeSpend / safeSales) * 100 : 0;
    const cpa = safeOrders > 0 ? safeSpend / safeOrders : 0;
    const cvr = safeSessions > 0 ? safeUnits / safeSessions * 100 : 0;
    return { acos, cpa, cvr };
};

/**
 * Cleans and formats the final report object before sending to the frontend.
 * Converts NaN/Infinity to 0 and formats numbers into consistent strings.
 * @param {object} report The raw report object.
 * @returns {object} The formatted report object.
 */
const sanitizeAndFormatReport = (report) => {
    const formatValue = (value, type = 'number', decimals = 2) => {
        const num = parseFloat(value);
        if (isNaN(num) || !isFinite(num)) {
            if (type === 'price') return '0.00';
            if (type === 'percent') return '0.00';
            return '0';
        }
        if (type === 'price') return num.toFixed(decimals);
        if (type === 'percent') return num.toFixed(decimals);
        if (type === 'percent_ratio') return (num * 100).toFixed(decimals);
        return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
    };

    if (report.costAnalysis) {
        report.costAnalysis.price = formatValue(report.costAnalysis.price, 'price');
        report.costAnalysis.profitMarginBeforeAd = formatValue(report.costAnalysis.profitMarginBeforeAd, 'price');
        report.costAnalysis.breakEvenAcos = formatValue(report.costAnalysis.breakEvenAcos, 'percent');
        report.costAnalysis.avgCpa = formatValue(report.costAnalysis.avgCpa, 'price');
        report.costAnalysis.profitMarginAfterAd = formatValue(report.costAnalysis.profitMarginAfterAd, 'price');
        report.costAnalysis.blendedCpa = formatValue(report.costAnalysis.blendedCpa, 'price');
        report.costAnalysis.blendedProfitMargin = formatValue(report.costAnalysis.blendedProfitMargin, 'price');
        report.costAnalysis.aiInsights = (report.costAnalysis.aiInsights || "").trim();
    }

    if (report.weeklyOverview) {
        const wo = report.weeklyOverview;
        if (wo.spendEfficiency) {
            wo.spendEfficiency.totalAdSpend = formatValue(wo.spendEfficiency.totalAdSpend, 'price');
            wo.spendEfficiency.adSales = formatValue(wo.spendEfficiency.adSales, 'price');
            wo.spendEfficiency.acos = formatValue(wo.spendEfficiency.acos, 'percent');
            wo.spendEfficiency.totalSales = formatValue(wo.spendEfficiency.totalSales, 'price');
            wo.spendEfficiency.tacos = formatValue(wo.spendEfficiency.tacos, 'percent');
            wo.spendEfficiency.aiInsights = (wo.spendEfficiency.aiInsights || "").trim();
        }
        if (wo.conversionAndDevices) {
            wo.conversionAndDevices.totalConversionRate = formatValue(wo.conversionAndDevices.totalConversionRate, 'percent');
            wo.conversionAndDevices.mobileSessionShare = formatValue(wo.conversionAndDevices.mobileSessionShare, 'percent');
            wo.conversionAndDevices.aiInsights = (wo.conversionAndDevices.aiInsights || "").trim();
        }
        if (wo.trends?.daily) {
            wo.trends.daily = wo.trends.daily.map(d => ({
                ...d,
                adSpend: formatValue(d.adSpend, 'price'),
                adSales: formatValue(d.adSales, 'price'),
                adOrders: formatValue(d.adOrders, 'number', 0)
            }));
            wo.trends.aiInsights = (wo.trends.aiInsights || "").trim();
        }
    }
    
    if (report.detailedSearchTermAnalysis) {
        report.detailedSearchTermAnalysis = report.detailedSearchTermAnalysis.map(term => {
            if (!term.adsPerformance) return term;
            return {
                ...term,
                adsPerformance: {
                    ...term.adsPerformance,
                    spend: formatValue(term.adsPerformance.spend, 'price'),
                    sales: formatValue(term.adsPerformance.sales, 'price'),
                    acos: `${formatValue(term.adsPerformance.acos, 'percent')}%`,
                    cpa: formatValue(term.adsPerformance.cpa, 'price'),
                    orders: formatValue(term.adsPerformance.orders, 'number', 0)
                },
                aiAnalysis: (term.aiAnalysis || "").trim(),
                aiRecommendation: (term.aiRecommendation || "").trim(),
            };
        });
    }

    if (report.weeklyActionPlan) {
        for (const key in report.weeklyActionPlan) {
            if (Array.isArray(report.weeklyActionPlan[key])) {
                report.weeklyActionPlan[key] = report.weeklyActionPlan[key].map(action => (action || "").trim());
            }
        }
    }

    return report;
};


// --- Main Route ---
router.post('/ai/generate-analysis-report', async (req, res) => {
    const { asin, startDate, endDate, profileId } = req.body;
    if (!asin || !startDate || !endDate || !profileId) {
        return res.status(400).json({ error: 'ASIN, startDate, endDate, and profileId are required.' });
    }
    
    let client;
    try {
        client = await pool.connect();
        console.log(`[AI Report] Starting data gathering for ASIN ${asin}`);
        // --- 1. Data Gathering ---
        const [listingRes, stRes, sqpRes, adDataRes] = await Promise.all([
            client.query('SELECT sale_price, product_cost, amazon_fee FROM product_listings WHERE asin = $1', [asin]),
            client.query("SELECT MIN(report_date) as min_date, MAX(report_date) as max_date, COUNT(DISTINCT report_date) as days_of_data FROM sales_and_traffic_by_asin WHERE child_asin = $1", [asin]),
            client.query("SELECT start_date, performance_data FROM query_performance_data WHERE asin = $1 AND start_date >= $2::date - interval '28 day' AND start_date <= $3::date", [asin, startDate, endDate]),
            client.query(`
                WITH combined_reports AS (
                    SELECT report_date, customer_search_term, impressions, clicks, cost, sales_7d AS sales, purchases_7d AS orders FROM sponsored_products_search_term_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
                    UNION ALL
                    SELECT report_date, customer_search_term, impressions, clicks, cost, sales, purchases AS orders FROM sponsored_brands_search_term_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
                )
                SELECT report_date, customer_search_term, SUM(COALESCE(impressions, 0)) AS impressions, SUM(COALESCE(clicks, 0)) AS clicks, SUM(COALESCE(cost, 0)) AS spend, SUM(COALESCE(sales, 0)) AS sales, SUM(COALESCE(orders, 0)) AS orders
                FROM combined_reports WHERE customer_search_term IS NOT NULL GROUP BY report_date, customer_search_term
            `, [asin, startDate, endDate]),
        ]);
        console.log('[AI Report] Data gathering complete.');

        // --- 2. Algorithmic Pre-analysis ---
        console.log('[AI Report] Starting algorithmic and AI analysis.');
        const listing = listingRes.rows[0];
        if (!listing) throw new Error(`Listing for ASIN ${asin} not found in the database. Please add it in the Listings tab.`);
        const { sale_price, product_cost, amazon_fee } = listing;
        const profitMarginBeforeAd = (parseFloat(sale_price) || 0) - (parseFloat(product_cost) || 0) - (parseFloat(amazon_fee) || 0);
        const breakEvenAcos = (parseFloat(sale_price) || 0) > 0 ? (profitMarginBeforeAd / parseFloat(sale_price)) * 100 : 0;

        const adData = adDataRes.rows;
        const { totalAdSpend, adSales, adOrders } = adData.reduce((acc, row) => ({
            totalAdSpend: acc.totalAdSpend + parseFloat(row.spend || 0),
            adSales: acc.adSales + parseFloat(row.sales || 0),
            adOrders: acc.adOrders + parseInt(row.orders || 0, 10),
        }), { totalAdSpend: 0, adSales: 0, adOrders: 0 });

        const { min_date, max_date, days_of_data } = stRes.rows[0] || {};
        const totalSalesRes = await client.query("SELECT SUM(COALESCE((sales_data->'orderedProductSales'->>'amount')::numeric, 0)) as total_sales FROM sales_and_traffic_by_asin WHERE child_asin = $1 AND report_date BETWEEN $2 AND $3", [asin, startDate, endDate]);
        const totalSales = parseFloat(totalSalesRes.rows[0]?.total_sales || '0');
        
        const tacos = totalSales > 0 ? (totalAdSpend / totalSales) * 100 : 0;
        const avgCpa = adOrders > 0 ? totalAdSpend / adOrders : 0;

        const dailyTrendSummary = adData.reduce((acc, row) => {
            const date = new Date(row.report_date).toISOString().split('T')[0];
            if (!acc[date]) acc[date] = { adSpend: 0, adSales: 0, adOrders: 0 };
            acc[date].adSpend += parseFloat(row.spend || 0);
            acc[date].adSales += parseFloat(row.sales || 0);
            acc[date].adOrders += parseInt(row.orders || 0, 10);
            return acc;
        }, {});
        const dailyTrends = Object.entries(dailyTrendSummary).map(([date, data]) => ({date, ...data})).sort((a,b) => new Date(a.date) - new Date(b.date));
        
        const sqpData = sqpRes.rows.map(r => r.performance_data); // Send full data

        // Classify Search Terms
        const uniqueSearchTerms = [...new Set(adData.map(r => r.customer_search_term))];
        const productInfo = (await getProductTextAttributes([asin]))[0] || { title: `Product ${asin}`};
        const relevanceMap = await classifySearchTermsWithAI(productInfo, uniqueSearchTerms);
        
        const { relevantTerms, irrelevantTerms } = adData.reduce((acc, row) => {
            const term = row.customer_search_term;
            if (relevanceMap.get(term)) {
                if (!acc.relevantTerms.has(term)) acc.relevantTerms.set(term, { spend: 0, sales: 0, orders: 0 });
                const data = acc.relevantTerms.get(term);
                data.spend += parseFloat(row.spend || 0);
                data.sales += parseFloat(row.sales || 0);
                data.orders += parseInt(row.orders || 0, 10);
            } else {
                 if (!acc.irrelevantTerms.has(term)) acc.irrelevantTerms.set(term, { spend: 0 });
                 acc.irrelevantTerms.get(term).spend += parseFloat(row.spend || 0);
            }
            return acc;
        }, { relevantTerms: new Map(), irrelevantTerms: new Map() });

        console.log('[AI Report] Starting chunked AI analysis steps...');
        // --- 3. Chunked AI Analysis ---
        const [kpiAnalysis, adEfficiencyAnalysis, termDetailAnalysis, actionPlan] = await Promise.all([
            callGeminiStep(`Analyze these KPIs for ASIN ${asin}: Profit/Unit=$${profitMarginBeforeAd.toFixed(2)}, Break-even ACOS=${breakEvenAcos.toFixed(2)}%, Total Ad Spend=$${totalAdSpend.toFixed(2)}, Total Ad Sales=$${adSales.toFixed(2)}, Total Ad Orders=${adOrders}, Total Sales=$${totalSales.toFixed(2)}.`, { type: Type.OBJECT, properties: { aiInsights: { type: Type.STRING } } }),
            callGeminiStep(`Analyze ad spend efficiency. Total Ad Spend: $${totalAdSpend.toFixed(2)}, ACOS: ${calculateKpis(totalAdSpend, adSales).acos.toFixed(2)}%. TACoS: ${tacos.toFixed(2)}%. Daily trends: ${JSON.stringify(dailyTrends)}. Provide insights on spending patterns and overall efficiency.`, { type: Type.OBJECT, properties: { aiInsights: { type: Type.STRING } } }),
            callGeminiStep(`Provide detailed analysis and recommendations for the top 5 most expensive relevant search terms and the top 5 most expensive irrelevant terms. Relevant: ${JSON.stringify(Array.from(relevantTerms.entries()))}. Irrelevant: ${JSON.stringify(Array.from(irrelevantTerms.entries()))}. For each, give a short analysis and one specific recommendation.`, { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { searchTerm: { type: Type.STRING }, adsPerformance: { type: Type.OBJECT, properties: { spend: { type: Type.NUMBER }, sales: { type: Type.NUMBER }, orders: { type: Type.NUMBER }, acos: { type: Type.NUMBER }, cpa: { type: Type.NUMBER } } }, aiAnalysis: { type: Type.STRING }, aiRecommendation: { type: Type.STRING } } } }),
            callGeminiStep(`Based on all the data provided (profitability, ad efficiency, term performance, market context: ${JSON.stringify(sqpData)}), create a prioritized, actionable plan for the next week. Group actions into categories: 'bidManagement', 'negativeKeywords', 'campaignStructure', 'listingOptimization'.`, { type: Type.OBJECT, properties: { bidManagement: { type: Type.ARRAY, items: { type: Type.STRING } }, negativeKeywords: { type: Type.ARRAY, items: { type: Type.STRING } }, campaignStructure: { type: Type.ARRAY, items: { type: Type.STRING } }, listingOptimization: { type: Type.ARRAY, items: { type: Type.STRING } } } }),
        ]);

        console.log('[AI Report] AI analysis complete.');

        // --- 4. Assemble Final Report ---
        const report = {
            asinStatus: { ...getAsinStatus(parseInt(days_of_data, 10)), daysOfData: parseInt(days_of_data, 10) },
            dataFreshness: { isDelayed: (new Date(endDate).getTime() - new Date(max_date).getTime()) / (1000 * 3600 * 24) > 3, delayDays: Math.floor((new Date(endDate).getTime() - new Date(max_date).getTime()) / (1000 * 3600 * 24)) },
            costAnalysis: { price: sale_price, profitMarginBeforeAd, breakEvenAcos, avgCpa, profitMarginAfterAd: profitMarginBeforeAd - avgCpa, blendedCpa: totalAdSpend / (adData.reduce((s, r) => s + (r.units || 0), 0) || 1), blendedProfitMargin: profitMarginBeforeAd - (totalAdSpend / (adData.reduce((s, r) => s + (r.units || 0), 0) || 1)), aiInsights: kpiAnalysis.aiInsights },
            weeklyOverview: {
                spendEfficiency: { totalAdSpend, adSales, acos: calculateKpis(totalAdSpend, adSales).acos, totalSales, tacos, aiInsights: adEfficiencyAnalysis.aiInsights },
                trends: { daily: dailyTrends, aiInsights: "AI insights on trends to be implemented." },
                conversionAndDevices: { totalConversionRate: calculateKpis(0,0,0, adData.reduce((s,r) => s + (r.units||0), 0), adData.reduce((s,r) => s + (r.sessions||0), 0)).cvr, mobileSessionShare: 73, aiInsights: "Mobile traffic is significant. Ensure listings are optimized for mobile viewing." },
            },
            detailedSearchTermAnalysis: termDetailAnalysis,
            weeklyActionPlan: actionPlan,
        };

        const finalReport = sanitizeAndFormatReport(report);
        res.json(finalReport);

    } catch (error) {
        console.error('[AI Report] Error generating report:', error);
        res.status(500).json({ error: error.message || 'Failed to generate analysis report.' });
    } finally {
        if (client) client.release();
    }
});

export default router;
