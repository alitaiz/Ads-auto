// backend/routes/ai.js
import express from 'express';
import { GoogleGenAI, Type } from "@google/genai";
import pool from '../db.js';

const router = express.Router();

router.post('/ai/suggest-rule', async (req, res) => {
    const { asin, salePrice, cost, fbaFee, referralFee, startDate, endDate } = req.body;

    if (!asin || !salePrice || !cost || !fbaFee || !referralFee || !startDate || !endDate) {
        return res.status(400).json({ error: 'Missing one or more required fields.' });
    }

    try {
        // --- 1. Calculate Financial Metrics ---
        const sp = parseFloat(salePrice);
        const cogs = parseFloat(cost);
        const fba = parseFloat(fbaFee);
        const refFeePercent = parseFloat(referralFee) / 100;
        const refFeeValue = sp * refFeePercent;
        
        const profitPerUnit = sp - cogs - fba - refFeeValue;
        if (profitPerUnit <= 0) {
            return res.status(400).json({ error: 'Product is not profitable based on inputs. Cannot calculate break-even ACoS.' });
        }
        const breakEvenAcos = profitPerUnit / sp;
        const targetAcos = breakEvenAcos * 0.8; // Aim for 80% of break-even for a healthy margin

        // --- 2. Fetch Performance Data from DB ---
        const performanceQuery = `
            SELECT 
                customer_search_term, 
                SUM(spend) as total_spend, 
                SUM(sales_7d) as total_sales, 
                SUM(clicks) as total_clicks, 
                SUM(purchases_7d) as total_orders
            FROM sponsored_products_search_term_report
            WHERE asin = $1 AND report_date BETWEEN $2 AND $3
            GROUP BY customer_search_term;
        `;
        const performanceResult = await pool.query(performanceQuery, [asin, startDate, endDate]);
        
        const organicQuery = `
            SELECT AVG((traffic_data->>'unitSessionPercentage')::numeric) as avg_cvr
            FROM sales_and_traffic_by_asin
            WHERE child_asin = $1 AND report_date BETWEEN $2 AND $3;
        `;
        const organicResult = await pool.query(organicQuery, [asin, startDate, endDate]);
        
        if (performanceResult.rows.length === 0) {
            return res.status(404).json({ error: `No PPC performance data found for ASIN ${asin} in the selected date range.` });
        }

        // --- 3. Summarize Data ---
        let totalSpend = 0, totalSales = 0, totalClicks = 0, totalOrders = 0;
        performanceResult.rows.forEach(row => {
            totalSpend += parseFloat(row.total_spend);
            totalSales += parseFloat(row.total_sales);
            totalClicks += parseInt(row.total_clicks);
            totalOrders += parseInt(row.total_orders);
        });
        
        const overallAcos = totalSales > 0 ? totalSpend / totalSales : 0;
        const overallCvr = totalClicks > 0 ? totalOrders / totalClicks : 0;
        const organicCvr = organicResult.rows[0]?.avg_cvr ? parseFloat(organicResult.rows[0].avg_cvr) : null;
        
        const underperformingTerms = performanceResult.rows
            .filter(r => parseFloat(r.total_sales) === 0 && parseFloat(r.total_spend) > 0)
            .sort((a, b) => parseFloat(b.total_spend) - parseFloat(a.total_spend))
            .slice(0, 5);

        const profitableTerms = performanceResult.rows
            .filter(r => parseFloat(r.total_sales) > 0)
            .map(r => ({ ...r, acos: parseFloat(r.total_spend) / parseFloat(r.total_sales) }))
            .filter(r => r.acos < targetAcos)
            .sort((a, b) => parseFloat(b.total_sales) - parseFloat(a.total_sales))
            .slice(0, 5);

        // --- 4. Construct Gemini Prompt ---
        const prompt = `
            You are a world-class Amazon PPC expert AI assistant. Your task is to analyze the provided product financial data and performance metrics to suggest a single, effective BID_ADJUSTMENT automation rule.

            Product Financials:
            - Sale Price: $${sp.toFixed(2)}
            - Cost of Goods: $${cogs.toFixed(2)}
            - FBA Fee: $${fba.toFixed(2)}
            - Referral Fee: ${referralFee}%
            - Profit Per Unit: $${profitPerUnit.toFixed(2)}
            - Break-Even ACoS: ${(breakEvenAcos * 100).toFixed(2)}%
            - Target ACoS: ${(targetAcos * 100).toFixed(2)}%

            Performance Data (${startDate} to ${endDate}):
            - Overall PPC ACoS: ${(overallAcos * 100).toFixed(2)}%
            - Overall PPC Conversion Rate: ${(overallCvr * 100).toFixed(2)}%
            - Organic Conversion Rate: ${organicCvr ? (organicCvr * 100).toFixed(2) + '%' : 'N/A'}
            - Total Spend: $${totalSpend.toFixed(2)}
            - Total Sales: $${totalSales.toFixed(2)}

            Underperforming Search Terms (High Spend, 0 Sales):
            ${underperformingTerms.map(t => `- "${t.customer_search_term}": $${parseFloat(t.total_spend).toFixed(2)} spend`).join('\n') || 'None'}

            Profitable Search Terms (High Sales, ACoS < Target):
            ${profitableTerms.map(t => `- "${t.customer_search_term}": $${parseFloat(t.total_sales).toFixed(2)} sales at ${(t.acos * 100).toFixed(2)}% ACoS`).join('\n') || 'None'}

            Based on this data, provide a JSON object for a single automation rule that would be most impactful. The rule should contain one or two condition groups targeting either waste reduction or scaling profitable terms. Provide a brief 'reasoning' for your choice.
        `;
        
        const schema = {
            type: Type.OBJECT,
            properties: {
                reasoning: { type: Type.STRING },
                rule: {
                    type: Type.OBJECT,
                    properties: {
                        conditionGroups: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    conditions: {
                                        type: Type.ARRAY,
                                        items: {
                                            type: Type.OBJECT,
                                            properties: {
                                                metric: { type: Type.STRING },
                                                timeWindow: { type: Type.INTEGER },
                                                operator: { type: Type.STRING },
                                                value: { type: Type.NUMBER }
                                            }
                                        }
                                    },
                                    action: {
                                        type: Type.OBJECT,
                                        properties: {
                                            type: { type: Type.STRING },
                                            value: { type: Type.INTEGER },
                                            minBid: { type: Type.NUMBER },
                                            maxBid: { type: Type.NUMBER },
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };

        // --- 5. Call Gemini API ---
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });
        
        const resultText = response.text.trim();
        const parsedResult = JSON.parse(resultText);

        res.json(parsedResult);

    } catch (error) {
        console.error("Error in AI suggestion endpoint:", error);
        res.status(500).json({ error: "An internal error occurred while generating the AI suggestion." });
    }
});

export default router;