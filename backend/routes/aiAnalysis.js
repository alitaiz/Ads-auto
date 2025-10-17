// backend/routes/aiAnalysis.js
import express from 'express';
import pool from '../db.js';
import { GoogleGenAI, Type } from '@google/genai';
import { getApiKey } from '../helpers/keyManager.js';

const router = express.Router();
const CHUNK_SIZE_AI_CLASSIFY = 20; // Process 20 terms per AI batch call
const DELAY_BETWEEN_CHUNKS = 3000; // 3 seconds delay

// --- Helper Functions ---

/**
 * Calls the Gemini API with a specific prompt, schema, and retry logic.
 * @param {string} prompt The full prompt text.
 * @param {string} systemInstruction The system instruction for the model.
 * @param {object} schema The expected JSON output schema.
 * @returns {Promise<any>} The parsed JSON response.
 */
const callGeminiStep = async (prompt, systemInstruction, schema) => {
    const maxRetries = 3;
    let delay = 2000;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const apiKey = await getApiKey('gemini');
            const ai = new GoogleGenAI({ apiKey });
            
            const response = await ai.models.generateContent({
                model: 'gemini-flash-latest',
                contents: prompt,
                config: {
                    systemInstruction,
                    responseMimeType: "application/json",
                    responseSchema: schema,
                }
            });
            
            const jsonText = response.text.trim();
            return JSON.parse(jsonText);
        } catch (e) {
            const isRetryable = e.status === 503 || e.status === 429 || (e.message && (e.message.includes('UNAVAILABLE') || e.message.includes('overloaded')));
            if (isRetryable && i < maxRetries - 1) {
                console.warn(`[AI Report Step] Gemini API is overloaded (Attempt ${i + 1}/${maxRetries}). Retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
            } else {
                console.error(`[AI Report Step] Gemini API call failed after ${i + 1} attempt(s).`, e);
                throw e; // Rethrow the final error
            }
        }
    }
};

/**
 * Gets all active API keys for rotation.
 * @param {string} service The service name (e.g., 'gemini').
 * @returns {Promise<string[]>} An array of API keys.
 */
async function getAllActiveKeys(service) {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT api_key FROM api_keys WHERE service = $1 AND is_active = TRUE ORDER BY id', [service]);
        return result.rows.map(r => r.api_key);
    } finally {
        client.release();
    }
}

/**
 * Classifies a batch of search terms using Gemini, with structured JSON output, key rotation, and delays.
 * Includes robust retry logic for API calls.
 * @param {string[]} searchTerms - An array of search term strings.
 * @param {object} productDetails - Object containing product title and bullet points.
 * @returns {Promise<{relevant: string[], irrelevant: string[]}>}
 */
const classifySearchTermsWithAI = async (searchTerms, productDetails) => {
    const relevantTerms = new Set();
    const irrelevantTerms = new Set();
    const allKeys = await getAllActiveKeys('gemini');
    if (allKeys.length === 0) throw new Error("No active Gemini keys found.");
    let keyIndex = 0;

    const systemInstruction = `You are an Amazon PPC expert. Your task is to determine if a customer's search term is relevant for selling a specific product. A search term is relevant if a customer searching for it would likely be satisfied to see this product. It is irrelevant if it's for a different product type, feature, or intent.`;
    const schema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                searchTerm: { type: Type.STRING },
                isRelevant: { type: Type.BOOLEAN, description: "True if relevant, false if not." },
            },
            required: ['searchTerm', 'isRelevant']
        }
    };
    
    for (let i = 0; i < searchTerms.length; i += CHUNK_SIZE_AI_CLASSIFY) {
        const chunk = searchTerms.slice(i, i + CHUNK_SIZE_AI_CLASSIFY);
        const currentApiKey = allKeys[keyIndex];
        keyIndex = (keyIndex + 1) % allKeys.length;
        console.log(`[AI Report] Classifying search term chunk ${Math.floor(i / CHUNK_SIZE_AI_CLASSIFY) + 1} with key ...${currentApiKey.slice(-4)}`);

        const prompt = `Product Title: "${productDetails.title}"\nProduct Bullets:\n- ${(productDetails.bullet_points || []).join('\n- ')}\n\nClassify the relevance of the following search terms for this product:\n${JSON.stringify(chunk)}`;
        
        // --- Retry logic added here ---
        let attempt = 0;
        const maxRetries = 3;
        let delay = 1000;
        let success = false;

        while (attempt < maxRetries && !success) {
            try {
                const ai = new GoogleGenAI({ apiKey: currentApiKey });
                const response = await ai.models.generateContent({
                    model: 'gemini-flash-latest',
                    contents: prompt,
                    config: {
                        systemInstruction,
                        responseMimeType: "application/json",
                        responseSchema: schema,
                    }
                });
                const result = JSON.parse(response.text.trim());

                if (Array.isArray(result)) {
                    result.forEach(item => {
                        if (item.isRelevant) {
                            relevantTerms.add(item.searchTerm);
                        } else {
                            irrelevantTerms.add(item.searchTerm);
                        }
                    });
                }
                success = true; // Mark as successful to exit the while loop
            } catch (error) {
                const isRetryable = error.status === 503 || error.status === 429 || (error.message && (error.message.includes('UNAVAILABLE') || error.message.includes('overloaded')));
                attempt++;
                if (isRetryable && attempt < maxRetries) {
                    console.warn(`[AI Report] Failed to classify chunk (Attempt ${attempt}/${maxRetries}). Retrying in ${delay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Exponential backoff
                } else {
                    console.error(`[AI Report] Failed to classify chunk after ${attempt} attempts:`, error);
                    break; // Exit the loop on non-retryable error or max retries
                }
            }
        }
        
        if (i + CHUNK_SIZE_AI_CLASSIFY < searchTerms.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS));
        }
    }

    return {
        relevant: Array.from(relevantTerms),
        irrelevant: Array.from(irrelevantTerms),
    };
};


const formatDateSafe = (d) => {
    if (!d) return '';
    const date = new Date(d);
    // Adjust for timezone offset to get the correct YYYY-MM-DD
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const adjustedDate = new Date(date.getTime() + userTimezoneOffset);
    return adjustedDate.toISOString().split('T')[0];
};

// --- Main Report Generation Endpoint ---
router.post('/ai/generate-analysis-report', async (req, res) => {
    const { asin, startDate, endDate, profileId } = req.body;
    if (!asin || !startDate || !endDate || !profileId) {
        return res.status(400).json({ error: 'asin, startDate, endDate, and profileId are required.' });
    }

    let client;
    try {
        client = await pool.connect();
        console.log(`[AI Report] Starting data gathering for ASIN ${asin}`);
        
        // --- 1. Data Gathering ---
        const queries = {
            product: client.query('SELECT title, sale_price, product_cost, amazon_fee FROM product_listings WHERE asin = $1 LIMIT 1', [asin]),
            asinStatus: client.query(`SELECT (CURRENT_DATE - MIN(report_date)) as days_of_data, MAX(report_date) as last_date FROM sales_and_traffic_by_asin WHERE child_asin = $1`, [asin]),
            adsData: client.query(`
                WITH combined_reports AS (
                    SELECT customer_search_term, cost, sales_7d as sales, purchases_7d as orders FROM sponsored_products_search_term_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
                    UNION ALL
                    SELECT customer_search_term, cost, sales, purchases as orders FROM sponsored_brands_search_term_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
                    UNION ALL
                    SELECT targeting_text as customer_search_term, cost, sales, purchases as orders FROM sponsored_display_targeting_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
                )
                SELECT customer_search_term, SUM(COALESCE(cost, 0)) as total_spend, SUM(COALESCE(sales, 0)) as total_sales, SUM(COALESCE(orders, 0)) as total_orders
                FROM combined_reports WHERE customer_search_term IS NOT NULL AND customer_search_term != '' GROUP BY customer_search_term;
            `, [asin, startDate, endDate]),
            totalSalesData: client.query(`SELECT SUM((sales_data->'orderedProductSales'->>'amount')::numeric) as total_sales, SUM((sales_data->>'unitsOrdered')::int) as total_units FROM sales_and_traffic_by_asin WHERE child_asin = $1 AND report_date BETWEEN $2 AND $3`, [asin, startDate, endDate]),
            dailyTrends: client.query(`
                SELECT 
                    d.report_date,
                    COALESCE(ads.total_ad_spend, 0) as ad_spend,
                    COALESCE(ads.total_ad_sales, 0) as ad_sales,
                    COALESCE(ads.total_ad_orders, 0) as ad_orders,
                    COALESCE(st.total_units, 0) as total_units,
                    COALESCE(st.total_sessions, 0) as total_sessions,
                    COALESCE(st.mobile_sessions, 0) as mobile_sessions
                FROM 
                    (SELECT generate_series($2::date, $3::date, '1 day'::interval)::date as report_date) d
                LEFT JOIN 
                    (SELECT report_date, SUM(cost) as total_ad_spend, SUM(sales_7d) as total_ad_sales, SUM(purchases_7d) as total_ad_orders FROM sponsored_products_search_term_report WHERE asin = $1 GROUP BY report_date) ads 
                    ON d.report_date = ads.report_date
                LEFT JOIN
                    (SELECT report_date, SUM((sales_data->>'unitsOrdered')::int) as total_units, SUM((traffic_data->>'sessions')::int) as total_sessions, SUM((traffic_data->>'mobileAppSessions')::int) as mobile_sessions FROM sales_and_traffic_by_asin WHERE child_asin = $1 GROUP BY report_date) st
                    ON d.report_date = st.report_date
                WHERE d.report_date BETWEEN $2 AND $3
                ORDER BY d.report_date ASC;
            `, [asin, startDate, endDate]),
            sqpData: client.query(`
                SELECT search_query, performance_data
                FROM query_performance_data
                WHERE asin = $1 AND start_date >= ($2::date - interval '6 days') AND start_date <= $3::date
            `, [asin, startDate, endDate])
        };

        const [productRes, asinStatusRes, adsRes, totalSalesRes, dailyTrendsRes, sqpRes] = await Promise.all(Object.values(queries));
        console.log('[AI Report] Data gathering complete.');

        // --- 2. Algorithmic & AI-Powered Analysis ---
        console.log('[AI Report] Starting algorithmic and AI analysis.');
        const productData = productRes.rows[0];
        if (!productData || productData.sale_price == null) throw new Error(`Product data (price, cost, fee) not found for ASIN ${asin}. Please add it in the Listings tab.`);
        
        const productDetailsForAI = {
            title: productData.title,
            bullet_points: productData.bullet_points || []
        };

        const adPerformance = adsRes.rows;
        const allSearchTerms = [...new Set(adPerformance.map(r => r.customer_search_term))];
        const { relevant: relevantTerms, irrelevant: irrelevantTerms } = await classifySearchTermsWithAI(allSearchTerms, productDetailsForAI);

        const price = parseFloat(productData.sale_price);
        const profitMarginBeforeAd = price - parseFloat(productData.product_cost) - parseFloat(productData.amazon_fee);
        const breakEvenAcos = price > 0 ? (profitMarginBeforeAd / price) * 100 : 0;

        const totalAdSpend = adPerformance.reduce((sum, r) => sum + parseFloat(r.total_spend), 0);
        const totalAdSales = adPerformance.reduce((sum, r) => sum + parseFloat(r.total_sales), 0);
        const totalAdOrders = adPerformance.reduce((sum, r) => sum + parseFloat(r.total_orders), 0);
        const avgCpa = totalAdOrders > 0 ? totalAdSpend / totalAdOrders : 0;
        const profitMarginAfterAd = profitMarginBeforeAd - avgCpa;
        
        const totalSales = parseFloat(totalSalesRes.rows[0]?.total_sales || 0);
        const totalUnits = parseInt(totalSalesRes.rows[0]?.total_units || 0);
        const tacos = totalSales > 0 ? (totalAdSpend / totalSales) * 100 : 0;
        const blendedCpa = totalUnits > 0 ? totalAdSpend / totalUnits : 0;
        
        const dailyData = dailyTrendsRes.rows.map(r => ({
            date: formatDateSafe(r.report_date), adSpend: parseFloat(r.ad_spend), adSales: parseFloat(r.ad_sales), adOrders: parseInt(r.ad_orders, 10),
            totalUnits: parseInt(r.total_units, 10), totalSessions: parseInt(r.total_sessions, 10), mobileSessions: parseInt(r.mobile_sessions, 10)
        }));
        const totalSessions = dailyData.reduce((sum, d) => sum + d.totalSessions, 0);
        const mobileSessionShare = totalSessions > 0 ? (dailyData.reduce((sum, d) => sum + d.mobileSessions, 0) / totalSessions) * 100 : 0;

        const daysOfData = asinStatusRes.rows[0]?.days_of_data || 0;
        let asinStatusStr = daysOfData > 60 ? 'Established' : (daysOfData >= 30 ? 'Launching' : 'New');
        const lastDate = asinStatusRes.rows[0]?.last_date;
        const delayDays = lastDate ? Math.floor((new Date() - new Date(lastDate)) / (1000 * 60 * 60 * 24)) - 1 : 99;

        // --- 3. AI Analysis (Chunked Mode) ---
        console.log('[AI Report] Starting chunked AI analysis steps...');
        
        const costAnalysisPrompt = `Analyze profitability for ASIN ${asin}. Price: $${price.toFixed(2)}, Cost: $${productData.product_cost}, Amazon Fee: $${productData.amazon_fee}. Ad Spend: $${totalAdSpend.toFixed(2)}, Ad Orders: ${totalAdOrders}. Give a one-sentence insight on profitability after ad costs.`;
        const costAnalysisResult = await callGeminiStep(costAnalysisPrompt, "You are a financial analyst.", { type: Type.OBJECT, properties: { costAnalysisInsights: { type: Type.STRING } } });

        const overviewPrompt = `Data for ASIN ${asin}: Total search terms: ${allSearchTerms.length}, Relevant (AI-classified): ${relevantTerms.length}, Irrelevant (AI-classified): ${irrelevantTerms.length}. Ad Spend: $${totalAdSpend.toFixed(2)}, Ad Sales: $${totalAdSales.toFixed(2)}. Total Sales: $${totalSales.toFixed(2)}. Mobile Session Share: ${mobileSessionShare.toFixed(1)}%. Daily Trends: ${JSON.stringify(dailyData)}. Give separate, one-sentence insights for spend efficiency/TACoS, search term relevance, daily trends, and device performance.`;
        const overviewResult = await callGeminiStep(overviewPrompt, "You are a strategic PPC analyst.", { type: Type.OBJECT, properties: { spendEfficiencyInsights: { type: Type.STRING }, weeklyOverviewInsights: { type: Type.STRING }, trendsInsights: { type: Type.STRING }, conversionAndDevicesInsights: { type: Type.STRING } } });

        const topSearchTermsForAI = adPerformance.sort((a,b) => parseFloat(b.total_spend) - parseFloat(a.total_spend)).slice(0, 10);
        const sqpData = sqpRes.rows.map(r => ({ searchQuery: r.search_query, ...r.performance_data }));
        const detailedAnalysisPrompt = `For each of these top 10 search terms for ASIN ${asin}, provide a detailed analysis comparing its ad performance to the broader market context from the Search Query Performance Data. Then give a specific, actionable recommendation. Terms: ${JSON.stringify(topSearchTermsForAI.map(t => ({term: t.customer_search_term, spend: t.total_spend, orders: t.total_orders})))}. Market Data: ${JSON.stringify(sqpData)}.`;
        const detailedAnalysisResult = await callGeminiStep(detailedAnalysisPrompt, "You are a search term optimization expert.", { type: Type.OBJECT, properties: { detailedTermAnalysis: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { searchTerm: { type: Type.STRING }, aiAnalysis: { type: Type.STRING }, aiRecommendation: { type: Type.STRING } } } } } });

        const composerPrompt = `Based on these separate analyses, create a final, prioritized weekly action plan.
        - Cost/Profitability Insight: ${costAnalysisResult.costAnalysisInsights}
        - Spend Efficiency Insight: ${overviewResult.spendEfficiencyInsights}
        - Trends & Devices Insight: ${overviewResult.trendsInsights} ${overviewResult.conversionAndDevicesInsights}
        - Detailed Term Recommendations: ${JSON.stringify(detailedAnalysisResult.detailedTermAnalysis)}
        `;
        const actionPlanResult = await callGeminiStep(composerPrompt, "You are a senior PPC strategist creating a weekly plan.", { type: Type.OBJECT, properties: { weeklyActionPlan: { type: Type.OBJECT, properties: { bidManagement: { type: Type.ARRAY, items: { type: Type.STRING } }, negativeKeywords: { type: Type.ARRAY, items: { type: Type.STRING } }, campaignStructure: { type: Type.ARRAY, items: { type: Type.STRING } }, listingOptimization: { type: Type.ARRAY, items: { type: Type.STRING } } } } } });
        
        console.log('[AI Report] AI analysis complete.');
        
        const finalReport = {
            asinStatus: { status: asinStatusStr, daysOfData },
            dataFreshness: { isDelayed: delayDays > 3, delayDays, lastDate: lastDate ? formatDateSafe(lastDate) : 'N/A' },
            costAnalysis: {
                price: price.toFixed(2), profitMarginBeforeAd: profitMarginBeforeAd.toFixed(2), breakEvenAcos: breakEvenAcos.toFixed(1),
                avgCpa: avgCpa.toFixed(2), profitMarginAfterAd: profitMarginAfterAd.toFixed(2), blendedCpa: blendedCpa.toFixed(2),
                blendedProfitMargin: (profitMarginBeforeAd - blendedCpa).toFixed(2), aiInsights: costAnalysisResult.costAnalysisInsights
            },
            weeklyOverview: {
                searchTermSummary: { aiInsights: overviewResult.weeklyOverviewInsights },
                spendEfficiency: {
                    totalAdSpend: totalAdSpend.toFixed(2), adSales: totalAdSales.toFixed(2),
                    acos: ((totalAdSales > 0 ? totalAdSpend / totalAdSales : 0) * 100).toFixed(1),
                    totalSales: totalSales.toFixed(2), tacos: tacos.toFixed(1),
                    aiInsights: overviewResult.spendEfficiencyInsights
                },
                trends: { daily: dailyData, aiInsights: overviewResult.trendsInsights },
                conversionAndDevices: {
                    overallCR: (totalSessions > 0 ? (totalUnits / totalSessions) * 100 : 0).toFixed(1),
                    mobileSessionShare: mobileSessionShare.toFixed(1),
                    aiInsights: overviewResult.conversionAndDevicesInsights
                }
            },
            detailedSearchTermAnalysis: detailedAnalysisResult.detailedTermAnalysis.map((analysis) => {
                const termData = adPerformance.find(p => p.customer_search_term === analysis.searchTerm);
                return {
                    ...analysis,
                    adsPerformance: {
                        spend: parseFloat(termData?.total_spend || 0).toFixed(2), orders: parseInt(termData?.total_orders || 0, 10),
                        sales: parseFloat(termData?.total_sales || 0).toFixed(2),
                        cpa: (termData?.total_orders > 0 ? parseFloat(termData.total_spend) / parseFloat(termData.total_orders) : 0).toFixed(2),
                        acos: (termData?.total_sales > 0 ? (parseFloat(termData.total_spend) / parseFloat(termData.total_sales)) * 100 : 0).toFixed(1) + '%'
                    }
                }
            }),
            weeklyActionPlan: actionPlanResult.weeklyActionPlan
        };
        
        res.json(finalReport);

    } catch (error) {
        console.error('[AI Report] Error generating report:', error);
        res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    } finally {
        if (client) client.release();
    }
});

export default router;