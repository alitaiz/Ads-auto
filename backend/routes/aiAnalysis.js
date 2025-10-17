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

        // Fetch SQP data where the start of the week falls within our range.
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
        
        // --- NEW: Master Aggregation Logic ---
        const masterAnalysisMap = new Map();
        
        // 1. Populate map with SQP data (the master list of terms)
        sqpResult.rows.forEach(row => {
            const sq = row.performance_data?.searchQueryData?.searchQuery;
            if (!sq) return;

            if (!masterAnalysisMap.has(sq)) {
                masterAnalysisMap.set(sq, {
                    adsPerformance: { spend: 0, orders: 0, clicks: 0 },
                    sqpData: []
                });
            }
            masterAnalysisMap.get(sq).sqpData.push(row.performance_data);
        });
        
        // 2. Enrich map with Advertising data
        adDataResult.rows.forEach(row => {
            const term = row.customer_search_term;
            if (masterAnalysisMap.has(term)) {
                const entry = masterAnalysisMap.get(term);
                entry.adsPerformance.spend += parseFloat(row.cost || '0');
                entry.adsPerformance.orders += parseInt(row.orders || '0', 10);
                entry.adsPerformance.clicks += parseInt(row.clicks || '0', 10);
            }
        });


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
            price: sale_price, product_cost, amazon_fee, profitMarginBeforeAd, breakEvenAcos,
            avgCpa, profitMarginAfterAd, blendedCpa, blendedProfitMargin
        };

        // 3. Weekly Overview
        const allSearchTerms = Array.from(masterAnalysisMap.keys());
        const relevantTerms = allSearchTerms.filter(term => RELEVANT_KEYWORDS.some(kw => term.toLowerCase().includes(kw)));
        const irrelevantTerms = allSearchTerms.filter(term => !relevantTerms.includes(term));
        
        const totalSales = salesTrafficResult.rows.reduce((sum, r) => sum + parseFloat(r.sales_data?.orderedProductSales?.amount || '0'), 0);
        const totalSessions = salesTrafficResult.rows.reduce((sum, r) => sum + parseInt(r.traffic_data?.sessions || '0', 10), 0);
        const mobileSessions = salesTrafficResult.rows.reduce((sum, r) => sum + parseInt(r.traffic_data?.mobileAppSessions || '0', 10), 0);
        const totalAdSales = adDataResult.rows.reduce((sum, r) => sum + parseFloat(r.sales || '0'), 0);

        report.weeklyOverview = {
            spendEfficiency: { totalAdSpend, adSales: totalAdSales, acos: totalAdSales > 0 ? (totalAdSpend / totalAdSales) * 100 : 0, totalSales, tacos: totalSales > 0 ? (totalAdSpend / totalSales) * 100 : 0 },
            searchTermClassification: { totalCount: allSearchTerms.length, relevantCount: relevantTerms.length, irrelevantCount: irrelevantTerms.length, relevantTerms: relevantTerms.slice(0, 10), irrelevantTerms: irrelevantTerms.slice(0, 10) },
            conversionAndDevices: { totalUnits: totalUnitsSold, totalSessions, unitSessionPercentage: totalSessions > 0 ? (totalUnitsSold / totalSessions) * 100 : 0, mobileSessionShare: totalSessions > 0 ? (mobileSessions / totalSessions) * 100 : 0 },
            trends: { daily: Object.values(adDataResult.rows.reduce((acc, row) => {
                    const date = new Date(row.report_date).toISOString().split('T')[0];
                    if (!acc[date]) acc[date] = { date, adSpend: 0, adSales: 0, adOrders: 0 };
                    acc[date].adSpend += parseFloat(row.cost || '0');
                    acc[date].adSales += parseFloat(row.sales || '0');
                    acc[date].adOrders += parseInt(row.orders || '0', 10);
                    return acc;
                }, {})).sort((a, b) => new Date(a.date) - new Date(b.date)) }
        };

        // 4. Detailed Search Term Analysis
        report.detailedSearchTermAnalysis = [];
        for (const [term, data] of masterAnalysisMap.entries()) {
            const aggregatedSqp = data.sqpData.reduce((acc, perf) => {
                acc.marketVolume += parseInt(perf.searchQueryData?.searchQueryVolume || '0', 10);
                acc.marketImpressions += parseInt(perf.impressionData?.totalQueryImpressionCount || '0', 10);
                acc.marketClicks += parseInt(perf.clickData?.totalClickCount || '0', 10);
                acc.marketCarts += parseInt(perf.cartAddData?.totalCartAddCount || '0', 10);
                acc.marketPurchases += parseInt(perf.purchaseData?.totalPurchaseCount || '0', 10);
                acc.asinClicks += parseInt(perf.clickData?.asinClickCount || '0', 10);
                acc.asinPurchases += parseInt(perf.purchaseData?.asinPurchaseCount || '0', 10);
                return acc;
            }, { marketVolume: 0, marketImpressions: 0, marketClicks: 0, marketCarts: 0, marketPurchases: 0, asinClicks: 0, asinPurchases: 0 });

            const safeDivide = (num, den) => den > 0 ? num / den : 0;
            
            report.detailedSearchTermAnalysis.push({
                searchTerm: term,
                adsPerformance: {
                    spend: data.adsPerformance.spend,
                    orders: data.adsPerformance.orders,
                    acos: totalAdSales > 0 ? (data.adsPerformance.spend / totalAdSales) * 100 : 0,
                    cpa: data.adsPerformance.orders > 0 ? data.adsPerformance.spend / data.adsPerformance.orders : 0,
                },
                marketPerformance: { marketVolume: aggregatedSqp.marketVolume },
                asinShare: {
                    clickShare: safeDivide(aggregatedSqp.asinClicks, aggregatedSqp.marketClicks),
                    purchaseShare: safeDivide(aggregatedSqp.asinPurchases, aggregatedSqp.marketPurchases),
                },
                funnelAnalysis: {
                    marketCtr: safeDivide(aggregatedSqp.marketClicks, aggregatedSqp.marketImpressions),
                    asinCtr: safeDivide(aggregatedSqp.asinClicks, aggregatedSqp.marketImpressions), // Simplified, can be refined
                    marketCartRate: safeDivide(aggregatedSqp.marketCarts, aggregatedSqp.marketClicks),
                    asinCartRate: safeDivide(data.sqpData.reduce((s, p) => s + parseInt(p.cartAddData?.asinCartAddCount || '0', 10), 0), aggregatedSqp.asinClicks),
                    marketPurchaseRate: safeDivide(aggregatedSqp.marketPurchases, aggregatedSqp.marketCarts),
                    asinPurchaseRate: safeDivide(aggregatedSqp.asinPurchases, data.sqpData.reduce((s, p) => s + parseInt(p.cartAddData?.asinCartAddCount || '0', 10), 0)),
                }
            });
        }
        report.detailedSearchTermAnalysis.sort((a,b) => b.marketPerformance.marketVolume - a.marketPerformance.marketVolume);


        // 5. Action Plan (simple logic based on analysis)
        const actionPlan = { bidManagement: [], negativeKeywords: [], listingOptimization: [] };
        if (report.weeklyOverview.spendEfficiency.acos > breakEvenAcos) actionPlan.bidManagement.push(`ACOS (${report.weeklyOverview.spendEfficiency.acos.toFixed(2)}%) is higher than break-even ACOS (${breakEvenAcos.toFixed(2)}%). Review high-spend, low-order search terms and consider reducing bids.`);
        if (irrelevantTerms.length > 0) actionPlan.negativeKeywords.push(`Consider adding these ${irrelevantTerms.length} irrelevant terms as negative keywords: ${irrelevantTerms.slice(0, 5).join(', ')}...`);
        if (report.weeklyOverview.conversionAndDevices.unitSessionPercentage < 5) actionPlan.listingOptimization.push(`Overall conversion rate is low (${report.weeklyOverview.conversionAndDevices.unitSessionPercentage.toFixed(2)}%). Review listing images, title, and A+ content for clarity and appeal.`);
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
