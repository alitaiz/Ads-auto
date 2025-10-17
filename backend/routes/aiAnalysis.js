// backend/routes/aiAnalysis.js
import express from 'express';
import pool from '../db.js';
import { GoogleGenAI } from '@google/genai';
import { getApiKey } from '../helpers/keyManager.js';

const router = express.Router();

const RELEVANT_KEYWORDS = /\b(memorial|sympathy|loss|lost|passed|passing|remembrance|condolence|bereavement|death|keepsake|goodbye|died|rainbow)\b/i;
const IRRELEVANT_KEYWORDS = /\b(figurine|statue|calico|siamese|tuxedo|kitty suncatcher|black cat gifts|angel with black cat|cat chime for window|personalized)\b/i;


const callGemini = async (prompt, systemInstruction) => {
    try {
        const apiKey = await getApiKey('gemini');
        const ai = new GoogleGenAI({ apiKey });
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { systemInstruction }
        });

        return response.text;
    } catch (e) {
        console.error("Gemini call failed:", e);
        return `Error from AI: ${e.message}`;
    }
};

router.post('/ai/generate-analysis-report', async (req, res) => {
    const { asin, startDate, endDate, profileId } = req.body;
    if (!asin || !startDate || !endDate || !profileId) {
        return res.status(400).json({ error: 'asin, startDate, endDate, and profileId are required.' });
    }

    const client = await pool.connect();
    try {
        // --- 1. Data Gathering (Parallel) ---
        console.log(`[AI Report] Starting data gathering for ASIN ${asin}`);
        
        const productQuery = client.query('SELECT sale_price, product_cost, amazon_fee FROM product_listings WHERE asin = $1 LIMIT 1', [asin]);
        
        const asinStatusQuery = client.query(`
            SELECT 
                (CURRENT_DATE - MIN(report_date)) as days_of_data,
                MAX(report_date) as last_date
            FROM sales_and_traffic_by_asin 
            WHERE child_asin = $1
        `, [asin]);

        const adsQuery = client.query(`
            WITH combined_reports AS (
                SELECT customer_search_term, cost, sales_7d as sales, purchases_7d as orders FROM sponsored_products_search_term_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
                UNION ALL
                SELECT customer_search_term, cost, sales, purchases as orders FROM sponsored_brands_search_term_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
                UNION ALL
                SELECT targeting_text as customer_search_term, cost, sales, purchases as orders FROM sponsored_display_targeting_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
            )
            SELECT 
                customer_search_term, 
                SUM(COALESCE(cost, 0)) as total_spend, 
                SUM(COALESCE(sales, 0)) as total_sales, 
                SUM(COALESCE(orders, 0)) as total_orders
            FROM combined_reports 
            WHERE customer_search_term IS NOT NULL AND customer_search_term != ''
            GROUP BY customer_search_term;
        `, [asin, startDate, endDate]);

        const totalSalesQuery = client.query(`
            SELECT SUM((sales_data->'orderedProductSales'->>'amount')::numeric) as total_sales
            FROM sales_and_traffic_by_asin
            WHERE child_asin = $1 AND report_date BETWEEN $2 AND $3
        `, [asin, startDate, endDate]);

        const [productResult, asinStatusResult, adsResult, totalSalesResult] = await Promise.all([productQuery, asinStatusQuery, adsQuery, totalSalesQuery]);
        console.log('[AI Report] Data gathering complete.');

        // --- 2. Algorithmic Analysis ---
        console.log('[AI Report] Starting algorithmic analysis.');
        const productData = productResult.rows[0];
        if (!productData || productData.sale_price == null) {
            throw new Error(`Product data (especially price) not found for ASIN ${asin}. Please add it in the Listings tab.`);
        }
        
        const price = parseFloat(productData.sale_price || 0);
        const cost = parseFloat(productData.product_cost || 0);
        const totalAmazonFee = parseFloat(productData.amazon_fee || 0);
        
        const profitMarginBeforeAd = price - cost - totalAmazonFee;
        const breakEvenAcos = price > 0 ? (profitMarginBeforeAd / price) * 100 : 0;
        
        const adPerformance = adsResult.rows;
        const totalAdSpend = adPerformance.reduce((sum, row) => sum + parseFloat(row.total_spend), 0);
        const totalAdSales = adPerformance.reduce((sum, row) => sum + parseFloat(row.total_sales), 0);
        const totalAdOrders = adPerformance.reduce((sum, row) => sum + parseFloat(row.total_orders), 0);
        
        const avgCpa = totalAdOrders > 0 ? totalAdSpend / totalAdOrders : 0;
        const profitMarginAfterAd = profitMarginBeforeAd - avgCpa;
        
        const totalSales = parseFloat(totalSalesResult.rows[0]?.total_sales || 0);
        const tacos = totalSales > 0 ? (totalAdSpend / totalSales) * 100 : 0;
        
        const searchTerms = adPerformance.map(row => row.customer_search_term);
        const relevantTerms = searchTerms.filter(term => RELEVANT_KEYWORDS.test(term) && !IRRELEVANT_KEYWORDS.test(term));
        const irrelevantTerms = searchTerms.filter(term => IRRELEVANT_KEYWORDS.test(term) || !RELEVANT_KEYWORDS.test(term));

        const daysOfData = asinStatusResult.rows[0]?.days_of_data || 0;
        let asinStatusStr = 'Old';
        if (daysOfData < 30) asinStatusStr = 'New Launching';
        else if (daysOfData <= 60) asinStatusStr = 'Launching';
        
        const lastDate = asinStatusResult.rows[0]?.last_date;
        const delayDays = lastDate ? Math.floor((new Date() - new Date(lastDate)) / (1000 * 60 * 60 * 24)) -1 : 99;
        const isDelayed = delayDays > 3;
        console.log('[AI Report] Algorithmic analysis complete.');

        // --- 3. AI Analysis (Parallel) ---
        console.log('[AI Report] Starting parallel AI analysis.');
        const systemInstruction = "You are an expert Amazon PPC Analyst. Be concise and provide a single, actionable sentence of insight based only on the data provided.";
        
        const costAnalysisPrompt = `Given these product finances: Price $${price.toFixed(2)}, Profit Before Ads $${profitMarginBeforeAd.toFixed(2)}, Break-Even ACOS ${breakEvenAcos.toFixed(1)}%. The average cost per ad order (CPA) was $${avgCpa.toFixed(2)}. Provide a brief, one-sentence insight into the product's profitability after advertising costs.`;
        
        const searchTermPrompt = `This week, we had ${searchTerms.length} total ad-driven search terms. Of these, ${relevantTerms.length} were highly relevant (e.g., "${relevantTerms.slice(0, 2).join('", "')}") and ${irrelevantTerms.length} were irrelevant or generic (e.g., "${irrelevantTerms.slice(0, 2).join('", "')}"). Give a one-sentence strategic summary based on this relevance ratio.`;
        
        const spendEfficiencyPrompt = `This week's ad performance: Ad Spend $${totalAdSpend.toFixed(2)}, Ad Sales $${totalAdSales.toFixed(2)}, resulting in an overall ACOS of ${((totalAdSales > 0 ? totalAdSpend / totalAdSales : 0) * 100).toFixed(1)}%. The overall TACoS was ${tacos.toFixed(1)}%. Provide a one-sentence insight on the spend efficiency and its impact on total sales.`;

        const [costInsights, termInsights, spendInsights] = await Promise.all([
            callGemini(costAnalysisPrompt, systemInstruction),
            callGemini(searchTermPrompt, systemInstruction),
            callGemini(spendEfficiencyPrompt, systemInstruction)
        ]);
        console.log('[AI Report] AI analysis complete.');

        // --- 4. Compose Response ---
        const finalReport = {
            asinStatus: { status: asinStatusStr, daysOfData },
            dataFreshness: { isDelayed, delayDays, lastDate: lastDate ? new Date(lastDate).toISOString().split('T')[0] : 'N/A' },
            costAnalysis: {
                price: price.toFixed(2),
                profitMarginBeforeAd: profitMarginBeforeAd.toFixed(2),
                breakEvenAcos: breakEvenAcos.toFixed(1),
                avgCpa: avgCpa.toFixed(2),
                profitMarginAfterAd: profitMarginAfterAd.toFixed(2),
                tacos: tacos.toFixed(1),
                aiInsights: costInsights
            },
            weeklyOverview: {
                searchTermSummary: {
                    total: searchTerms.length,
                    relevant: relevantTerms.length,
                    irrelevant: irrelevantTerms.length,
                    aiInsights: termInsights
                },
                spendEfficiency: {
                    totalAdSpend: totalAdSpend.toFixed(2),
                    adSales: totalAdSales.toFixed(2),
                    acos: ((totalAdSales > 0 ? totalAdSpend / totalAdSales : 0) * 100).toFixed(1),
                    aiInsights: spendInsights
                }
            }
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