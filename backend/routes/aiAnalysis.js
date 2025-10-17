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
    try {
        const apiKey = await getApiKey('gemini');
        const ai = new GoogleGenAI({ apiKey });
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: schema,
            }
        });
        
        // The response.text is a string, so we need to parse it into a JSON object.
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Gemini call with schema failed:", e);
        // Create a structured error response that matches the expected schema format
        return {
            error: `Error from AI: ${e.message}`,
            costAnalysisInsights: "Could not generate insights due to an API error.",
            weeklyOverviewInsights: "Could not generate insights due to an API error.",
            detailedTermAnalysis: [],
            weeklyActionPlan: {
                bidManagement: ["AI analysis failed, no recommendations available."],
                negativeKeywords: [],
                campaignStructure: [],
                listingOptimization: []
            }
        };
    }
};

const formatDateSafe = (d) => {
    if (!d) return '';
    const date = new Date(d);
    // Adjust for timezone to ensure the date is correct before converting to string
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
        
        // Cost Analysis
        const price = parseFloat(productData.sale_price);
        const profitMarginBeforeAd = price - parseFloat(productData.product_cost) - parseFloat(productData.amazon_fee);
        const breakEvenAcos = price > 0 ? (profitMarginBeforeAd / price) * 100 : 0;

        const adPerformance = adsRes.rows;
        const totalAdSpend = adPerformance.reduce((sum, r) => sum + parseFloat(r.total_spend), 0);
        const totalAdSales = adPerformance.reduce((sum, r) => sum + parseFloat(r.total_sales), 0);
        const totalAdOrders = adPerformance.reduce((sum, r) => sum + parseFloat(r.total_orders), 0);
        const avgCpa = totalAdOrders > 0 ? totalAdSpend / totalAdOrders : 0;
        
        const totalSales = parseFloat(totalSalesRes.rows[0]?.total_sales || 0);
        const totalUnits = parseInt(totalSalesRes.rows[0]?.total_units || 0);
        const tacos = totalSales > 0 ? (totalAdSpend / totalSales) * 100 : 0;
        
        const blendedCpa = totalUnits > 0 ? totalAdSpend / totalUnits : 0;

        // Search Term Summary
        const searchTerms = adPerformance.map(r => r.customer_search_term);
        const relevantTerms = searchTerms.filter(t => RELEVANT_KEYWORDS.test(t) && !IRRELEVANT_KEYWORDS.test(t));
        const irrelevantTerms = searchTerms.filter(t => !RELEVANT_KEYWORDS.test(t) || IRRELEVANT_KEYWORDS.test(t));
        
        // Spend Efficiency
        const topPerformers = adPerformance.filter(r => r.total_orders > 0).sort((a,b) => (parseFloat(a.total_spend)/parseFloat(a.total_orders)) - (parseFloat(b.total_spend)/parseFloat(b.total_orders))).slice(0, 5);
        const inefficientSpenders = adPerformance.filter(r => r.total_orders == 0).sort((a,b) => parseFloat(b.total_spend) - parseFloat(a.total_spend)).slice(0, 5);
        
        // Trends & Devices
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

        // Data Freshness
        const daysOfData = asinStatusRes.rows[0]?.days_of_data || 0;
        let asinStatusStr = daysOfData > 60 ? 'Established' : (daysOfData >= 30 ? 'Launching' : 'New');
        const lastDate = asinStatusRes.rows[0]?.last_date;
        const delayDays = lastDate ? Math.floor((new Date() - new Date(lastDate)) / (1000 * 60 * 60 * 24)) - 1 : 99;
        
        // Top Search Terms for Detailed Analysis
        const topSearchTermsForAI = adPerformance.sort((a,b) => parseFloat(b.total_spend) - parseFloat(a.total_spend)).slice(0, 5);
        
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
                    description: "Provide a detailed analysis for each of the top 5 search terms provided.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            searchTerm: { type: Type.STRING },
                            aiAnalysis: { type: Type.STRING, description: "Detailed analysis of why this term is performing well or poorly." },
                            aiRecommendation: { type: Type.STRING, description: "A specific, actionable recommendation for this term." }
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
                    topRelevantVolume: [], // This would require SQP data join which is complex and slow for this context
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
            detailedSearchTermAnalysis: aiResult.detailedTermAnalysis.map((analysis: any) => {
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
```

</content>
  </change>
  <change>
    <file>views/AnalysisReportView.tsx</file>
    <description>Overhauled the Analysis Report frontend to display a multi-faceted report. The new UI uses distinct cards for different analysis sections (Profitability, Weekly Overview), includes interactive charts for trends, a detailed expandable table for search term analysis, and a final actionable checklist, all populated by the new comprehensive backend response.</description>
    <content><![CDATA[// views/AnalysisReportView.tsx
import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement);

type AnalysisReport = any;

const styles: { [key: string]: React.CSSProperties } = {
    container: { maxWidth: '1200px', margin: '0 auto', padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
    header: { marginBottom: '20px' },
    title: { fontSize: '2rem', margin: 0 },
    controls: { display: 'flex', gap: '20px', alignItems: 'flex-end', padding: '20px', backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', marginBottom: '30px' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontWeight: 500 },
    input: { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem' },
    button: { padding: '10px 20px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' },
    buttonDisabled: { backgroundColor: 'var(--primary-hover-color)', cursor: 'not-allowed' },
    message: { textAlign: 'center', padding: '50px', fontSize: '1.2rem', color: '#666', backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)' },
    error: { color: 'var(--danger-color)', padding: '20px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)' },
    reportContainer: { display: 'flex', flexDirection: 'column', gap: '25px' },
    reportCard: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '25px' },
    cardTitle: { fontSize: '1.5rem', fontWeight: 600, margin: '0 0 20px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' },
    kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '20px' },
    kpiCard: { textAlign: 'center', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' },
    kpiValue: { fontSize: '1.75rem', fontWeight: 'bold', margin: 0, color: 'var(--primary-color)' },
    kpiLabel: { fontSize: '0.9rem', color: '#666', margin: '5px 0 0 0' },
    insights: { fontStyle: 'italic', color: '#333', backgroundColor: '#eef2f3', padding: '15px', borderRadius: '8px', borderLeft: '4px solid var(--primary-color)', marginTop: '20px' },
    termList: { listStyle: 'none', padding: 0, margin: 0, columns: 2, columnGap: '20px' },
    termChip: { backgroundColor: '#e9ecef', padding: '4px 8px', borderRadius: '12px', fontSize: '0.85rem', marginBottom: '5px', display: 'inline-block' },
    detailTable: { width: '100%', borderCollapse: 'collapse', marginTop: '20px' },
    detailTh: { padding: '10px', textAlign: 'left', borderBottom: '2px solid #ccc', background: '#f8f9fa' },
    detailTd: { padding: '10px', borderBottom: '1px solid #eee' },
    actionList: { listStyleType: 'decimal', paddingLeft: '20px' },
    chartContainer: { height: '250px', marginTop: '20px' },
    expandableRow: { cursor: 'pointer' },
    expandedContent: { backgroundColor: '#f8f9fa', padding: '15px' },
};

const KpiCard = ({ value, label, tooltip }: { value: string | number, label: string, tooltip?: string }) => (
    <div style={styles.kpiCard} title={tooltip}>
        <p style={styles.kpiValue}>{value}</p>
        <p style={styles.kpiLabel}>{label}</p>
    </div>
);

const DetailRow = ({ term, analysis, onToggle, isExpanded }: { term: any, analysis: any, onToggle: () => void, isExpanded: boolean }) => (
    <>
        <tr onClick={onToggle} style={styles.expandableRow} title="Click to expand/collapse details">
            <td style={styles.detailTd}>{term.customer_search_term}</td>
            <td style={styles.detailTd}>{`$${parseFloat(term.total_spend).toFixed(2)}`}</td>
            <td style={styles.detailTd}>{term.total_orders}</td>
            <td style={styles.detailTd}>{`$${parseFloat(term.total_sales).toFixed(2)}`}</td>
            <td style={styles.detailTd}>{term.total_sales > 0 ? `${((parseFloat(term.total_spend) / parseFloat(term.total_sales)) * 100).toFixed(1)}%` : 'N/A'}</td>
            <td style={styles.detailTd}>{term.total_orders > 0 ? `$${(parseFloat(term.total_spend) / parseFloat(term.total_orders)).toFixed(2)}` : 'N/A'}</td>
            <td style={styles.detailTd}>{isExpanded ? '▼' : '►'}</td>
        </tr>
        {isExpanded && (
            <tr>
                <td colSpan={7} style={styles.expandedContent}>
                    <p><strong>AI Analysis:</strong> {analysis?.aiAnalysis || 'Not available.'}</p>
                    <p><strong>AI Recommendation:</strong> {analysis?.aiRecommendation || 'Not available.'}</p>
                </td>
            </tr>
        )}
    </>
);

export function AnalysisReportView() {
    const [asins, setAsins] = useState<string[]>([]);
    const [selectedAsin, setSelectedAsin] = useState('');
    const [reportData, setReportData] = useState<AnalysisReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedTerm, setExpandedTerm] = useState<string | null>(null);
    
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const [dateRange, setDateRange] = useState({ start: sevenDaysAgo.toISOString().split('T')[0], end: today });
    
    useEffect(() => {
        const fetchAsins = async () => {
            try {
                const response = await fetch('/api/listings');
                if (!response.ok) throw new Error('Failed to fetch ASINs.');
                const data = await response.json();
                const asinList = data.map((item: any) => item.asin);
                setAsins(asinList);
                if (asinList.length > 0) setSelectedAsin(asinList[0]);
            } catch (err) { setError(err instanceof Error ? err.message : 'Could not load ASINs.'); }
        };
        fetchAsins();
    }, []);

    const handleGenerateReport = async () => {
        if (!selectedAsin) { setError('Please select an ASIN.'); return; }
        setLoading(true); setError(null); setReportData(null);

        try {
            const response = await fetch('/api/ai/generate-analysis-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ asin: selectedAsin, startDate: dateRange.start, endDate: dateRange.end, profileId: localStorage.getItem('selectedProfileId') }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to generate report.');
            setReportData(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setLoading(false);
        }
    };

    const dailyChartData = reportData?.weeklyOverview?.trends?.daily ? {
        labels: reportData.weeklyOverview.trends.daily.map((d: any) => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })),
        datasets: [
            { type: 'bar' as const, label: 'Ad Spend', data: reportData.weeklyOverview.trends.daily.map((d: any) => d.adSpend), backgroundColor: 'rgba(255, 99, 132, 0.5)', yAxisID: 'y' },
            { type: 'line' as const, label: 'Ad Orders', data: reportData.weeklyOverview.trends.daily.map((d: any) => d.adOrders), borderColor: 'rgb(54, 162, 235)', yAxisID: 'y1' },
            { type: 'line' as const, label: 'Ad Sales', data: reportData.weeklyOverview.trends.daily.map((d: any) => d.adSales), borderColor: 'rgb(75, 192, 192)', yAxisID: 'y' },
        ]
    } : null;
    
    const deviceChartData = reportData?.weeklyOverview?.trends?.daily ? {
        labels: ['Mobile', 'Browser'],
        datasets: [{
            data: [reportData.weeklyOverview.conversionAndDevices.mobileSessionShare, 100 - reportData.weeklyOverview.conversionAndDevices.mobileSessionShare],
            backgroundColor: ['#007185', '#adb5bd'],
        }]
    } : null;

    return (
        <div style={styles.container}>
            <header style={styles.header}><h1 style={styles.title}>AI Analysis Report</h1></header>
            <div style={styles.controls}>
                {/* Controls... */}
                <div style={styles.formGroup}><label style={styles.label} htmlFor="asin-select">Select ASIN</label><select id="asin-select" style={styles.input} value={selectedAsin} onChange={e => setSelectedAsin(e.target.value)} disabled={asins.length === 0}>{asins.length > 0 ? asins.map(a => <option key={a} value={a}>{a}</option>) : <option>Loading...</option>}</select></div>
                <div style={styles.formGroup}><label style={styles.label} htmlFor="start-date">Start Date</label><input type="date" id="start-date" style={styles.input} value={dateRange.start} onChange={e => setDateRange(prev => ({...prev, start: e.target.value}))} /></div>
                <div style={styles.formGroup}><label style={styles.label} htmlFor="end-date">End Date</label><input type="date" id="end-date" style={styles.input} value={dateRange.end} onChange={e => setDateRange(prev => ({...prev, end: e.target.value}))} /></div>
                <button onClick={handleGenerateReport} style={loading ? {...styles.button, ...styles.buttonDisabled} : styles.button} disabled={loading}>{loading ? 'Generating...' : 'Generate Report'}</button>
            </div>
            {error && <div style={styles.error}>{error}</div>}
            {loading && <div style={styles.message}>AI is analyzing your data. This may take a few minutes...</div>}
            {!loading && !error && !reportData && <div style={styles.message}>Select an ASIN and date range to generate an analysis.</div>}
            {reportData && (
                <div style={styles.reportContainer}>
                    {/* ASIN Status and Data Freshness */}
                    <div style={{...styles.reportCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8f9fa' }}>
                        <div><strong>ASIN Status:</strong> {reportData.asinStatus.status} ({reportData.asinStatus.daysOfData} days of data)</div>
                        {reportData.dataFreshness.isDelayed && <div style={{color: 'var(--danger-color)'}}><strong>Data Freshness Warning:</strong> Data is delayed by {reportData.dataFreshness.delayDays} days.</div>}
                    </div>
                    {/* Cost Analysis */}
                    <div style={styles.reportCard}>
                        <h2 style={styles.cardTitle}>Cost & Profitability Analysis</h2>
                        <div style={styles.kpiGrid}>
                            <KpiCard value={`$${reportData.costAnalysis.price}`} label="Price" />
                            <KpiCard value={`$${reportData.costAnalysis.profitMarginBeforeAd}`} label="Profit / Unit (Pre-Ad)" />
                            <KpiCard value={`${reportData.costAnalysis.breakEvenAcos}%`} label="Break-Even ACOS" />
                            <KpiCard value={`$${reportData.costAnalysis.avgCpa}`} label="Avg. Ad CPA" tooltip="Average Ad Spend per Ad Order" />
                             <KpiCard value={`$${reportData.costAnalysis.profitMarginAfterAd}`} label="Profit / Ad Order" />
                             <KpiCard value={`$${reportData.costAnalysis.blendedCpa}`} label="Blended CPA" tooltip="Total Ad Spend / Total Units Sold" />
                            <KpiCard value={`$${reportData.costAnalysis.blendedProfitMargin}`} label="Blended Profit / Unit" />
                        </div>
                        <p style={styles.insights}><strong>AI Insight:</strong> {reportData.costAnalysis.aiInsights}</p>
                    </div>
                    {/* Weekly Overview */}
                    <div style={styles.reportCard}>
                        <h2 style={styles.cardTitle}>Weekly Overview</h2>
                        <div style={{...styles.kpiGrid, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '20px' }}>
                            <KpiCard value={`$${reportData.weeklyOverview.spendEfficiency.totalAdSpend}`} label="Total Ad Spend" />
                            <KpiCard value={`$${reportData.weeklyOverview.spendEfficiency.adSales}`} label="Total Ad Sales" />
                            <KpiCard value={`${reportData.weeklyOverview.spendEfficiency.acos}%`} label="ACOS" />
                             <KpiCard value={`$${reportData.weeklyOverview.spendEfficiency.totalSales}`} label="Total Sales (Ads + Organic)" />
                             <KpiCard value={`${reportData.weeklyOverview.spendEfficiency.tacos}%`} label="TACoS" />
                        </div>
                        <p style={styles.insights}><strong>AI Insight (Spend Efficiency):</strong> {reportData.weeklyOverview.spendEfficiency.aiInsights}</p>
                        <hr style={{margin: '20px 0', border: 'none', borderTop: '1px solid #eee'}} />
                        <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px'}}>
                            {dailyChartData && <div style={styles.chartContainer}><Line data={dailyChartData} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { position: 'left' }, y1: { position: 'right', grid: { drawOnChartArea: false } } } }} /></div>}
                            {deviceChartData && <div style={styles.chartContainer}><Doughnut data={deviceChartData} options={{ responsive: true, maintainAspectRatio: false }} /></div>}
                        </div>
                         <p style={styles.insights}><strong>AI Insight (Trends & Devices):</strong> {reportData.weeklyOverview.trends.aiInsights} {reportData.weeklyOverview.conversionAndDevices.aiInsights}</p>
                    </div>
                    {/* Detailed Search Term Analysis */}
                    <div style={styles.reportCard}>
                        <h2 style={styles.cardTitle}>Detailed Search Term Analysis</h2>
                        <table style={{...styles.detailTable, tableLayout: 'auto'}}>
                            <thead><tr>
                                <th style={styles.detailTh}>Search Term</th><th style={styles.detailTh}>Spend</th><th style={styles.detailTh}>Orders</th><th style={styles.detailTh}>Sales</th><th style={styles.detailTh}>ACOS</th><th style={styles.detailTh}>CPA</th><th style={styles.detailTh}></th>
                            </tr></thead>
                            <tbody>
                                {reportData.weeklyOverview.spendEfficiency.topPerformingTerms.map((term: any) => {
                                    const analysis = reportData.detailedSearchTermAnalysis.find((a: any) => a.searchTerm === term.term);
                                    return <DetailRow key={term.term + '-good'} term={adPerformance.find(p=>p.customer_search_term === term.term)} analysis={analysis} onToggle={() => setExpandedTerm(prev => prev === term.term ? null : term.term)} isExpanded={expandedTerm === term.term} />;
                                })}
                                {reportData.weeklyOverview.spendEfficiency.inefficientTerms.map((term: any) => {
                                    const analysis = reportData.detailedSearchTermAnalysis.find((a: any) => a.searchTerm === term.term);
                                    return <DetailRow key={term.term + '-bad'} term={adPerformance.find(p=>p.customer_search_term === term.term)} analysis={analysis} onToggle={() => setExpandedTerm(prev => prev === term.term ? null : term.term)} isExpanded={expandedTerm === term.term} />;
                                })}
                            </tbody>
                        </table>
                    </div>
                    {/* Weekly Action Plan */}
                    <div style={styles.reportCard}>
                        <h2 style={styles.cardTitle}>Weekly Action Plan</h2>
                        {Object.entries(reportData.weeklyActionPlan).map(([category, actions]) => (
                            (actions as string[]).length > 0 && (
                                <div key={category} style={{marginBottom: '15px'}}>
                                    <h3 style={{fontSize: '1.2rem', textTransform: 'capitalize'}}>{category.replace(/([A-Z])/g, ' $1').trim()}</h3>
                                    <ul style={styles.actionList}>{(actions as string[]).map((action, i) => <li key={i}>{action}</li>)}</ul>
                                </div>
                            )
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
```

</content>
  </change>
</changes>
```