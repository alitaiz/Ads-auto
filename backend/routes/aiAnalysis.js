// backend/routes/aiAnalysis.js
import express from 'express';
import pool from '../db.js';

const router = express.Router();

const RELEVANT_KEYWORDS = [
    'memorial', 'sympathy', 'loss', 'lost', 'passed', 'passing', 'remembrance', 
    'condolence', 'bereavement', 'death', 'keepsake', 'goodbye', 'died', 'rainbow'
];

/**
 * Sanitizes and formats the final report object.
 * Converts numbers to fixed decimal strings, handles Infinity, etc.
 * @param {object} report - The raw report object.
 * @returns {object} The formatted report object.
 */
const sanitizeAndFormatReport = (report) => {
    const format = (value, type = 'number') => {
        if (value === null || typeof value === 'undefined' || !isFinite(value)) return type === 'price' ? '0.00' : '0';
        const num = Number(value);
        if (isNaN(num)) return type === 'price' ? '0.00' : '0';

        switch (type) {
            case 'price': return num.toFixed(2);
            case 'percent': return num.toFixed(2);
            default: return num.toFixed(0);
        }
    };

    if (report.costAnalysis) {
        report.costAnalysis = {
            ...report.costAnalysis,
            price: format(report.costAnalysis.price, 'price'),
            profitMarginBeforeAd: format(report.costAnalysis.profitMarginBeforeAd, 'price'),
            breakEvenAcos: format(report.costAnalysis.breakEvenAcos, 'percent'),
            avgCpa: format(report.costAnalysis.avgCpa, 'price'),
            profitMarginAfterAd: format(report.costAnalysis.profitMarginAfterAd, 'price'),
            blendedCpa: format(report.costAnalysis.blendedCpa, 'price'),
            blendedProfitMargin: format(report.costAnalysis.blendedProfitMargin, 'price'),
        };
    }

    if (report.weeklyOverview?.spendEfficiency) {
        report.weeklyOverview.spendEfficiency = {
            ...report.weeklyOverview.spendEfficiency,
            totalAdSpend: format(report.weeklyOverview.spendEfficiency.totalAdSpend, 'price'),
            adSales: format(report.weeklyOverview.spendEfficiency.adSales, 'price'),
            acos: format(report.weeklyOverview.spendEfficiency.acos, 'percent'),
            totalSales: format(report.weeklyOverview.spendEfficiency.totalSales, 'price'),
            tacos: format(report.weeklyOverview.spendEfficiency.tacos, 'percent'),
        };
    }
    
     if (report.detailedSearchTermAnalysis) {
        report.detailedSearchTermAnalysis.forEach(item => {
            item.adsPerformance = {
                spend: format(item.adsPerformance.spend, 'price'),
                orders: format(item.adsPerformance.orders),
                acos: format(item.adsPerformance.acos, 'percent'),
                cpa: format(item.adsPerformance.cpa, 'price'),
            };
            item.marketPerformance.marketVolume = format(item.marketPerformance.marketVolume);
        });
    }

    return report;
};


router.post('/ai/generate-analysis-report', async (req, res) => {
    const { asin, startDate, endDate } = req.body;
    if (!asin || !startDate || !endDate) {
        return res.status(400).json({ error: 'ASIN, startDate, and endDate are required.' });
    }

    const client = await pool.connect();
    try {
        console.log(`[Report Engine] Starting data gathering for ASIN ${asin}`);

        // --- Data Fetching in Parallel ---
        const costPromise = client.query('SELECT sale_price, product_cost, amazon_fee FROM product_listings WHERE asin = $1', [asin]);

        const adDataPromise = client.query(`
            -- Combine SP, SB, SD ad data for the period
            -- SP
            SELECT report_date, customer_search_term, impressions, clicks, cost, sales_7d AS sales, purchases_7d AS orders
            FROM sponsored_products_search_term_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
            UNION ALL
            -- SB
            SELECT report_date, customer_search_term, impressions, clicks, cost, sales, purchases AS orders
            FROM sponsored_brands_search_term_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3
            UNION ALL
            -- SD
            SELECT report_date, targeting_text AS customer_search_term, impressions, clicks, cost, sales, purchases AS orders
            FROM sponsored_display_targeting_report WHERE asin = $1 AND report_date BETWEEN $2 AND $3;
        `, [asin, startDate, endDate]);

        const salesTrafficPromise = client.query(`
            SELECT report_date, sales_data, traffic_data
            FROM sales_and_traffic_by_asin
            WHERE child_asin = $1 AND report_date BETWEEN $2 AND $3;
        `, [asin, startDate, endDate]);

        const sqpPromise = client.query(`
            SELECT search_query, performance_data
            FROM query_performance_data
            WHERE asin = $1 AND start_date >= (date_trunc('week', $2::date) - interval '1 day') AND start_date <= $3;
        `, [asin, startDate, endDate]);

        const [costResult, adDataResult, salesTrafficResult, sqpResult] = await Promise.all([
            costPromise, adDataPromise, salesTrafficPromise, sqpPromise
        ]);
        
        console.log('[Report Engine] Data gathering complete.');
        console.log('[Report Engine] Starting algorithmic analysis.');

        // --- Algorithmic Analysis ---
        const report = {};

        // 1. ASIN Status & Data Freshness
        const daysOfDataResult = await client.query('SELECT COUNT(DISTINCT report_date) as count FROM sales_and_traffic_by_asin WHERE child_asin = $1', [asin]);
        const daysOfData = parseInt(daysOfDataResult.rows[0]?.count || '0', 10);
        let status = 'New';
        if (daysOfData > 60) status = 'Established';
        else if (daysOfData > 30) status = 'Launching';
        report.asinStatus = { status, daysOfData };

        const freshnessResult = await client.query('SELECT MAX(report_date) as max_date FROM sponsored_products_search_term_report');
        const lastDataDay = freshnessResult.rows[0]?.max_date;
        const delayDays = lastDataDay ? Math.floor((new Date() - new Date(lastDataDay)) / (1000 * 60 * 60 * 24)) : 99;
        report.dataFreshness = { isDelayed: delayDays > 3, delayDays };

        // 2. Cost Analysis
        const costData = costResult.rows[0];
        // FIX: Ensure all values are parsed to floats
        const sale_price = parseFloat(costData?.sale_price || '0');
        const product_cost = parseFloat(costData?.product_cost || '0');
        const amazon_fee = parseFloat(costData?.amazon_fee || '0');
        
        const profitMarginBeforeAd = sale_price - product_cost - amazon_fee;
        const breakEvenAcos = sale_price > 0 ? (profitMarginBeforeAd / sale_price) * 100 : 0;
        
        const totalAdSpend = adDataResult.rows.reduce((sum, r) => sum + parseFloat(r.cost || '0'), 0);
        const totalAdOrders = adDataResult.rows.reduce((sum, r) => sum + parseInt(r.orders || '0', 10), 0);
        const totalUnitsSold = salesTrafficResult.rows.reduce((sum, r) => sum + parseInt(r.sales_data?.unitsOrdered || '0', 10), 0);
        
        const avgCpa = totalAdOrders > 0 ? totalAdSpend / totalAdOrders : 0;
        const profitMarginAfterAd = profitMarginBeforeAd - avgCpa;
        const blendedCpa = totalUnitsSold > 0 ? totalAdSpend / totalUnitsSold : 0;
        const blendedProfitMargin = profitMarginBeforeAd - blendedCpa;

        report.costAnalysis = {
            price: sale_price,
            product_cost,
            amazon_fee,
            profitMarginBeforeAd,
            breakEvenAcos,
            avgCpa,
            profitMarginAfterAd,
            blendedCpa,
            blendedProfitMargin
        };

        // 3. Weekly Overview
        const totalAdSales = adDataResult.rows.reduce((sum, r) => sum + parseFloat(r.sales || '0'), 0);
        const totalSales = salesTrafficResult.rows.reduce((sum, r) => sum + parseFloat(r.sales_data?.orderedProductSales?.amount || '0'), 0);
        const totalSessions = salesTrafficResult.rows.reduce((sum, r) => sum + parseInt(r.traffic_data?.sessions || '0', 10), 0);
        const mobileSessions = salesTrafficResult.rows.reduce((sum, r) => sum + parseInt(r.traffic_data?.mobileAppSessions || '0', 10), 0);

        const allSearchTerms = [...new Set(adDataResult.rows.map(r => r.customer_search_term).filter(Boolean))];
        const relevantTerms = allSearchTerms.filter(term => RELEVANT_KEYWORDS.some(kw => term.toLowerCase().includes(kw)));
        const irrelevantTerms = allSearchTerms.filter(term => !relevantTerms.includes(term));

        report.weeklyOverview = {
            spendEfficiency: {
                totalAdSpend,
                adSales: totalAdSales,
                acos: totalAdSales > 0 ? (totalAdSpend / totalAdSales) * 100 : 0,
                totalSales,
                tacos: totalSales > 0 ? (totalAdSpend / totalSales) * 100 : 0,
            },
            searchTermClassification: {
                totalCount: allSearchTerms.length,
                relevantCount: relevantTerms.length,
                irrelevantCount: irrelevantTerms.length,
                relevantTerms: relevantTerms.slice(0, 10),
                irrelevantTerms: irrelevantTerms.slice(0, 10),
            },
            conversionAndDevices: {
                totalUnits: totalUnitsSold,
                totalSessions,
                unitSessionPercentage: totalSessions > 0 ? (totalUnitsSold / totalSessions) * 100 : 0,
                mobileSessionShare: totalSessions > 0 ? (mobileSessions / totalSessions) * 100 : 0,
            },
            trends: {
                daily: adDataResult.rows.reduce((acc, row) => {
                    const date = new Date(row.report_date).toISOString().split('T')[0];
                    if (!acc[date]) acc[date] = { date, adSpend: 0, adSales: 0, adOrders: 0 };
                    acc[date].adSpend += parseFloat(row.cost || '0');
                    acc[date].adSales += parseFloat(row.sales || '0');
                    acc[date].adOrders += parseInt(row.orders || '0', 10);
                    return acc;
                }, {}),
            }
        };
        report.weeklyOverview.trends.daily = Object.values(report.weeklyOverview.trends.daily).sort((a,b) => new Date(a.date) - new Date(b.date));


        // 4. Detailed Search Term Analysis
        const detailedAnalysis = [];
        const topAdTerms = [...new Set(adDataResult.rows.map(r => r.customer_search_term))].slice(0, 50);

        for (const term of topAdTerms) {
            const adPerf = adDataResult.rows.filter(r => r.customer_search_term === term).reduce((acc, r) => {
                acc.spend += parseFloat(r.cost || '0');
                acc.orders += parseInt(r.orders || '0', 10);
                return acc;
            }, { spend: 0, orders: 0 });

            const sqpPerf = sqpResult.rows.find(r => r.search_query === term)?.performance_data;
            const marketImpressions = parseInt(sqpPerf?.impressionData?.totalQueryImpressionCount || '0', 10);
            const marketClicks = parseInt(sqpPerf?.clickData?.totalClickCount || '0', 10);
            const marketCarts = parseInt(sqpPerf?.cartAddData?.totalCartAddCount || '0', 10);
            const marketPurchases = parseInt(sqpPerf?.purchaseData?.totalPurchaseCount || '0', 10);

            detailedAnalysis.push({
                searchTerm: term,
                adsPerformance: {
                    spend: adPerf.spend,
                    orders: adPerf.orders,
                    acos: totalAdSales > 0 ? (adPerf.spend / totalAdSales) * 100 : 0, // Simplified ACOS for example
                    cpa: adPerf.orders > 0 ? adPerf.spend / adPerf.orders : 0,
                },
                marketPerformance: { marketVolume: parseInt(sqpPerf?.searchQueryData?.searchQueryVolume || '0', 10) },
                asinShare: {
                    clickShare: parseFloat(sqpPerf?.clickData?.asinClickShare || '0'),
                    purchaseShare: parseFloat(sqpPerf?.purchaseData?.asinPurchaseShare || '0'),
                },
                funnelAnalysis: {
                    marketCtr: marketImpressions > 0 ? marketClicks / marketImpressions : 0,
                    asinCtr: parseFloat(sqpPerf?.clickData?.asinClickRate || '0'), // SQP provides this
                    marketCartRate: marketClicks > 0 ? marketCarts / marketClicks : 0,
                    asinCartRate: parseFloat(sqpPerf?.cartAddData?.asinCartAddRate || '0'),
                    marketPurchaseRate: marketCarts > 0 ? marketPurchases / marketCarts : 0,
                    asinPurchaseRate: parseFloat(sqpPerf?.purchaseData?.asinPurchaseRate || '0'),
                }
            });
        }
        report.detailedSearchTermAnalysis = detailedAnalysis;

        // 5. Action Plan (simple logic based on analysis)
        const actionPlan = { bidManagement: [], negativeKeywords: [], listingOptimization: [] };
        if (report.weeklyOverview.spendEfficiency.acos > breakEvenAcos) {
            actionPlan.bidManagement.push(`ACOS (${report.weeklyOverview.spendEfficiency.acos.toFixed(2)}%) is higher than break-even ACOS (${breakEvenAcos.toFixed(2)}%). Review high-spend, low-order search terms and consider reducing bids.`);
        }
        if (irrelevantTerms.length > 0) {
            actionPlan.negativeKeywords.push(`Consider adding these ${irrelevantTerms.length} irrelevant terms as negative keywords: ${irrelevantTerms.slice(0, 5).join(', ')}...`);
        }
        if (report.weeklyOverview.conversionAndDevices.unitSessionPercentage < 5) { // example threshold
             actionPlan.listingOptimization.push(`Overall conversion rate is low (${report.weeklyOverview.conversionAndDevices.unitSessionPercentage.toFixed(2)}%). Review listing images, title, and A+ content for clarity and appeal.`);
        }
        report.weeklyActionPlan = actionPlan;

        res.json(sanitizeAndFormatReport(report));

    } catch (error) {
        console.error('[Report Engine] Error generating report:', error);
        res.status(500).json({ error: 'Failed to generate analysis report.' });
    } finally {
        client.release();
    }
});

export default router;
