// backend/routes/aiAnalysis.js
import express from 'express';
import pool from '../db.js';
import { GoogleGenAI, Type } from '@google/genai';
import { getApiKey } from '../helpers/keyManager.js';

const router = express.Router();

// --- Constants and Helpers ---
const RELEVANT_KEYWORDS = /\b(memorial|sympathy|loss|lost|passed|passing|remembrance|condolence|bereavement|death|keepsake|goodbye|died|rainbow)\b/i;
const IRRELEVANT_KEYWORDS = /\b(figurine|statue|calico|siamese|tuxedo|kitty suncatcher|black cat gifts|angel with black cat|cat chime for window|personalized)\b/i;

const callGeminiWithSchema = async (prompt, systemInstruction, schema) => {
    const maxRetries = 3;
    let delay = 2000; // Start with a 2-second delay

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
            return JSON.parse(jsonText); // Success, return the parsed JSON
        } catch (e) {
            const isRetryable = e.status === 503 || e.status === 429 || (e.message && (e.message.includes('UNAVAILABLE') || e.message.includes('overloaded')));

            if (isRetryable) {
                if (i === maxRetries - 1) {
                    console.error(`[AI Report] Gemini API call failed after ${maxRetries} retries.`, e);
                    // Fall through to return the error object after the last retry fails.
                } else {
                    console.warn(`[AI Report] Gemini API is overloaded or rate-limited (Attempt ${i + 1}/${maxRetries}). Retrying in ${delay / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Exponential backoff
                    continue; // Go to the next iteration of the loop to retry
                }
            } else {
                // Not a retryable error, log it and fall through to return the error object immediately.
                console.error("Gemini call with schema failed with a non-retryable error:", e);
            }

            // This part is reached if a non-retryable error occurs or all retries fail.
            // Return a structured error object that the frontend can handle gracefully.
            return {
                error: `Error from AI: ${e.message}`,
                costAnalysisInsights: "Could not generate insights due to an API error.",
                weeklyOverviewInsights: "Could not generate insights due to an API error.",
                spendEfficiencyInsights: "Could not generate insights due to an API error.",
                trendsInsights: "Could not generate insights due to an API error.",
                conversionAndDevicesInsights: "Could not generate insights due to an API error.",
                detailedTermAnalysis: [],
                weeklyActionPlan: {
                    bidManagement: ["AI analysis failed, no recommendations available."],
                    negativeKeywords: [],
                    campaignStructure: [],
                    listingOptimization: []
                }
            };
        }
    }
};


const formatDateSafe = (d) => {
    if (!d) return '';
    const date = new Date(d);
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

    const client = await pool.connect();
    try {
        console.log(`[AI Report] Starting data gathering for ASIN ${asin}`);
        
        // --- 1. Data Gathering (Parallel) ---
        const queries = {
            product: client.query('SELECT sale_price, product_cost, amazon_fee FROM product_listings WHERE asin = $1 LIMIT 1', [asin]),
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

        // --- 2. Algorithmic Analysis & Data Structuring ---
        console.log('[AI Report] Starting algorithmic analysis.');
        const productData = productRes.rows[0];
        if (!productData || productData.sale_price == null) throw new Error(`Product data (price, cost, fee) not found for ASIN ${asin}. Please add it in the Listings tab.`);
        
        const price = parseFloat(productData.sale_price);
        const profitMarginBeforeAd = price - parseFloat(productData.product_cost) - parseFloat(productData.amazon_fee);
        const breakEvenAcos = price > 0 ? (profitMarginBeforeAd / price) * 100 : 0;

        const adPerformance = adsRes.rows;
        const totalAdSpend = adPerformance.reduce((sum, r) => sum + parseFloat(r.total_spend), 0);
        const totalAdSales = adPerformance.reduce((sum, r) => sum + parseFloat(r.total_sales), 0);
        const totalAdOrders = adPerformance.reduce((sum, r) => sum + parseFloat(r.total_orders), 0);
        const avgCpa = totalAdOrders > 0 ? totalAdSpend / totalAdOrders : 0;
        const profitMarginAfterAd = profitMarginBeforeAd - avgCpa;
        
        const totalSales = parseFloat(totalSalesRes.rows[0]?.total_sales || 0);
        const totalUnits = parseInt(totalSalesRes.rows[0]?.total_units || 0);
        const tacos = totalSales > 0 ? (totalAdSpend / totalSales) * 100 : 0;
        
        const blendedCpa = totalUnits > 0 ? totalAdSpend / totalUnits : 0;

        const searchTerms = adPerformance.map(r => r.customer_search_term);
        const relevantTerms = searchTerms.filter(t => RELEVANT_KEYWORDS.test(t) && !IRRELEVANT_KEYWORDS.test(t));
        const irrelevantTerms = searchTerms.filter(t => !RELEVANT_KEYWORDS.test(t) || IRRELEVANT_KEYWORDS.test(t));
        
        const topPerformers = adPerformance.filter(r => r.total_orders > 0).sort((a,b) => (parseFloat(a.total_spend)/parseFloat(a.total_orders)) - (parseFloat(b.total_spend)/parseFloat(b.total_orders))).slice(0, 5);
        const inefficientSpenders = adPerformance.filter(r => r.total_orders == 0).sort((a,b) => parseFloat(b.total_spend) - parseFloat(a.total_spend)).slice(0, 5);
        
        const dailyData = dailyTrendsRes.rows.map(r => ({
            date: formatDateSafe(r.report_date),
            adSpend: parseFloat(r.ad_spend),
            adSales: parseFloat(r.ad_sales),
            adOrders: parseInt(r.ad_orders, 10),
            totalUnits: parseInt(r.total_units, 10),
            totalSessions: parseInt(r.total_sessions, 10),
            mobileSessions: parseInt(r.mobile_sessions, 10)
        }));
        const totalSessions = dailyData.reduce((sum, d) => sum + d.totalSessions, 0);
        const mobileSessions = dailyData.reduce((sum, d) => sum + d.mobileSessions, 0);
        const mobileSessionShare = totalSessions > 0 ? (mobileSessions / totalSessions) * 100 : 0;

        const daysOfData = asinStatusRes.rows[0]?.days_of_data || 0;
        let asinStatusStr = daysOfData > 60 ? 'Established' : (daysOfData >= 30 ? 'Launching' : 'New');
        const lastDate = asinStatusRes.rows[0]?.last_date;
        const delayDays = lastDate ? Math.floor((new Date() - new Date(lastDate)) / (1000 * 60 * 60 * 24)) - 1 : 99;
        
        const topSearchTermsForAI = adPerformance.sort((a,b) => parseFloat(b.total_spend) - parseFloat(a.total_spend)).slice(0, 5);
        const sqpData = sqpRes.rows.map(r => ({ searchQuery: r.search_query, ...r.performance_data }));

        // --- 3. AI Prompt Construction & Schema Definition ---
        const prompt = `
            Analyze the following Amazon PPC data for ASIN ${asin} from ${startDate} to ${endDate}.
            Product Info: Price $${price.toFixed(2)}, Cost $${productData.product_cost}, Amazon Fee $${productData.amazon_fee}.
            
            Key Metrics:
            - Ad Spend: $${totalAdSpend.toFixed(2)}, Ad Sales: $${totalAdSales.toFixed(2)}, Ad Orders: ${totalAdOrders}, ACOS: ${((totalAdSales > 0 ? totalAdSpend / totalAdSales : 0)*100).toFixed(1)}%
            - Total Sales: $${totalSales.toFixed(2)}, Total Units: ${totalUnits}, TACoS: ${tacos.toFixed(1)}%
            - Total Sessions: ${totalSessions}, Mobile Session Share: ${mobileSessionShare.toFixed(1)}%
            - Search Terms: ${searchTerms.length} total, ${relevantTerms.length} relevant, ${irrelevantTerms.length} irrelevant.
            
            Top Performing Terms (by CPA): ${JSON.stringify(topPerformers)}
            Top Inefficient Terms (by spend, 0 orders): ${JSON.stringify(inefficientSpenders)}
            
            Daily Trend Data: ${JSON.stringify(dailyData)}

            Top 5 Search Terms by Spend for Detailed Analysis: ${JSON.stringify(topSearchTermsForAI.map(t => ({term: t.customer_search_term, spend: t.total_spend})))}
            
            Search Query Performance Data (Market Context): ${JSON.stringify(sqpData)}

            Based on ALL the data provided, perform the analysis and fill out the JSON object according to the schema.
        `;

        const aiSchema = {
            type: Type.OBJECT,
            properties: {
                costAnalysisInsights: { type: Type.STRING, description: "One-sentence insight on profitability after ad costs." },
                weeklyOverviewInsights: { type: Type.STRING, description: "One-sentence strategic summary of the search term relevance ratio." },
                spendEfficiencyInsights: { type: Type.STRING, description: "One-sentence insight on spend efficiency and TACoS." },
                trendsInsights: { type: Type.STRING, description: "One-sentence insight on daily trends, noting any anomalies." },
                conversionAndDevicesInsights: { type: Type.STRING, description: "One-sentence insight on overall conversion rate and device performance." },
                detailedTermAnalysis: {
                    type: Type.ARRAY,
                    description: "Provide a detailed analysis for each of the top 5 search terms. For each term, compare its ad performance (spend, orders) with the broader market context from the Search Query Performance Data. Analyze the conversion funnel (impressions, clicks, add to carts, purchases) comparing the ASIN's share versus the total market.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            searchTerm: { type: Type.STRING },
                            aiAnalysis: { type: Type.STRING, description: "Detailed analysis of why this term is performing well or poorly, incorporating market comparison." },
                            aiRecommendation: { type: Type.STRING, description: "A specific, actionable recommendation for this term based on the analysis." }
                        }
                    }
                },
                weeklyActionPlan: {
                    type: Type.OBJECT,
                    description: "A final, prioritized action plan for the upcoming week.",
                    properties: {
                        bidManagement: { type: Type.ARRAY, items: { type: Type.STRING } },
                        negativeKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                        campaignStructure: { type: Type.ARRAY, items: { type: Type.STRING } },
                        listingOptimization: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                }
            }
        };
        
        console.log('[AI Report] Sending structured request to AI...');
        const aiResult = await callGeminiWithSchema(prompt, "You are an expert Amazon PPC Analyst. Your response must be a valid JSON object matching the provided schema.", aiSchema);
        console.log('[AI Report] AI analysis complete.');
        
        // --- 4. Final Composition ---
        const finalReport = {
            asinStatus: { status: asinStatusStr, daysOfData },
            dataFreshness: { isDelayed: delayDays > 3, delayDays, lastDate: lastDate ? formatDateSafe(lastDate) : 'N/A' },
            costAnalysis: {
                price: price.toFixed(2),
                profitMarginBeforeAd: profitMarginBeforeAd.toFixed(2),
                breakEvenAcos: breakEvenAcos.toFixed(1),
                avgCpa: avgCpa.toFixed(2),
                profitMarginAfterAd: profitMarginAfterAd.toFixed(2),
                blendedCpa: blendedCpa.toFixed(2),
                blendedProfitMargin: (profitMarginBeforeAd - blendedCpa).toFixed(2),
                aiInsights: aiResult.costAnalysisInsights
            },
            weeklyOverview: {
                searchTermSummary: {
                    total: searchTerms.length, relevant: relevantTerms.length, irrelevant: irrelevantTerms.length,
                    topRelevantVolume: [],
                    topRelevantExamples: relevantTerms.slice(0, 5),
                    topIrrelevantExamples: irrelevantTerms.slice(0, 5),
                    aiInsights: aiResult.weeklyOverviewInsights
                },
                spendEfficiency: {
                    totalAdSpend: totalAdSpend.toFixed(2), adSales: totalAdSales.toFixed(2),
                    acos: ((totalAdSales > 0 ? totalAdSpend / totalAdSales : 0) * 100).toFixed(1),
                    totalSales: totalSales.toFixed(2), tacos: tacos.toFixed(1),
                    topPerformingTerms: topPerformers.map(t => ({ term: t.customer_search_term, cpa: (parseFloat(t.total_spend) / parseFloat(t.total_orders)).toFixed(2) })),
                    inefficientTerms: inefficientSpenders.map(t => ({ term: t.customer_search_term, spend: parseFloat(t.total_spend).toFixed(2) })),
                    aiInsights: aiResult.spendEfficiencyInsights
                },
                trends: { daily: dailyData, aiInsights: aiResult.trendsInsights },
                conversionAndDevices: {
                    overallCR: (totalSessions > 0 ? (totalUnits / totalSessions) * 100 : 0).toFixed(1),
                    mobileSessionShare: mobileSessionShare.toFixed(1),
                    aiInsights: aiResult.conversionAndDevicesInsights
                }
            },
            detailedSearchTermAnalysis: aiResult.detailedTermAnalysis.map((analysis) => {
                const termData = adPerformance.find(p => p.customer_search_term === analysis.searchTerm);
                return {
                    ...analysis,
                    adsPerformance: {
                        spend: parseFloat(termData?.total_spend || 0).toFixed(2),
                        orders: parseInt(termData?.total_orders || 0, 10),
                        sales: parseFloat(termData?.total_sales || 0).toFixed(2),
                        cpa: (termData?.total_orders > 0 ? parseFloat(termData.total_spend) / parseFloat(termData.total_orders) : 0).toFixed(2),
                        acos: (termData?.total_sales > 0 ? (parseFloat(termData.total_spend) / parseFloat(termData.total_sales)) * 100 : 0).toFixed(1) + '%'
                    }
                }
            }),
            weeklyActionPlan: aiResult.weeklyActionPlan
        };
        
        res.json(finalReport);

    } catch (error) {
        console.error('[AI Report] Error generating report:', error);
        res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    } finally {
        client.release();
    }
});

export default router;