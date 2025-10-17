// backend/routes/aiAnalysis.js
import express from 'express';
import pool from '../db.js';

const router = express.Router();

// --- Constants and Configuration ---
const RELEVANT_KEYWORDS = ['memorial', 'sympathy', 'loss', 'lost', 'passed', 'passing', 'remembrance', 'condolence', 'bereavement', 'death', 'keepsake', 'goodbye', 'died', 'rainbow'];
const RELEVANT_REGEX = new RegExp(RELEVANT_KEYWORDS.join('|'), 'i');

// --- Helper Functions ---
const getAsinStatus = (daysOfData) => {
    if (!daysOfData || daysOfData < 30) return 'New';
    if (daysOfData <= 60) return 'Launching';
    return 'Established';
};

const calculateKpis = (spend = 0, sales = 0, orders = 0, units = 0, sessions = 0, clicks = 0, impressions = 0) => {
    const safeSpend = Number(spend) || 0;
    const safeSales = Number(sales) || 0;
    const safeOrders = Number(orders) || 0;
    const safeUnits = Number(units) || 0;
    const safeSessions = Number(sessions) || 0;
    const safeClicks = Number(clicks) || 0;
    const safeImpressions = Number(impressions) || 0;

    return {
        acos: safeSales > 0 ? (safeSpend / safeSales) * 100 : (safeSpend > 0 ? Infinity : 0),
        cpa: safeOrders > 0 ? safeSpend / safeOrders : (safeSpend > 0 ? Infinity : 0),
        cvr: safeSessions > 0 ? safeUnits / safeSessions * 100 : 0,
        ctr: safeImpressions > 0 ? safeClicks / safeImpressions * 100 : 0,
    };
};

const safeDivide = (numerator, denominator) => {
    const num = Number(numerator) || 0;
    const den = Number(denominator) || 0;
    return den > 0 ? (num / den) * 100 : 0;
};

const formatValue = (value, type = 'number', decimals = 2) => {
    if (value === Infinity) return 'N/A';
    const num = parseFloat(value);
    if (isNaN(num) || !isFinite(num)) return type === 'price' ? '0.00' : (type === 'percent' ? '0.00' : '0');

    if (type === 'price') return num.toFixed(decimals);
    if (type === 'percent') return num.toFixed(decimals);
    
    return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
};

// Main Route
router.post('/ai/generate-analysis-report', async (req, res) => {
    const { asin, startDate, endDate } = req.body;
    if (!asin || !startDate || !endDate) return res.status(400).json({ error: 'ASIN, startDate, and endDate are required.' });

    let client;
    try {
        client = await pool.connect();
        console.log(`[Report Engine] Starting data gathering for ASIN ${asin}`);

        // --- 1. Data Gathering ---
        const [listingRes, stRes, adDataRes, sqpDataRes] = await Promise.all([
            client.query('SELECT sale_price, product_cost, amazon_fee FROM product_listings WHERE asin = $1', [asin]),
            client.query("SELECT COUNT(DISTINCT report_date) as days_of_data, MAX(report_date) as max_date FROM sales_and_traffic_by_asin WHERE child_asin = $1 AND report_date <= $2", [asin, endDate]),
            client.query(`
                SELECT report_date, customer_search_term, SUM(COALESCE(impressions, 0)) AS impressions, SUM(COALESCE(clicks, 0)) AS clicks, SUM(COALESCE(cost, 0)) AS spend, SUM(COALESCE(sales_7d, 0)) AS sales, SUM(COALESCE(purchases_7d, 0)) AS orders
                FROM sponsored_products_search_term_report
                WHERE asin = $1 AND report_date BETWEEN $2 AND $3 AND customer_search_term IS NOT NULL
                GROUP BY report_date, customer_search_term
            `, [asin, startDate, endDate]),
            client.query(`
                SELECT search_query, performance_data
                FROM query_performance_data
                WHERE asin = $1 AND start_date >= $2 AND start_date <= $3
            `, [asin, startDate, endDate]),
        ]);
        console.log('[Report Engine] Data gathering complete.');

        // --- 2. Algorithmic Analysis ---
        console.log('[Report Engine] Starting algorithmic analysis.');
        const listing = listingRes.rows[0];
        if (!listing) throw new Error(`Listing for ASIN ${asin} not found. Please add cost details in the Listings tab.`);

        const salePrice = parseFloat(listing.sale_price || '0');
        const productCost = parseFloat(listing.product_cost || '0');
        const amazonFee = parseFloat(listing.amazon_fee || '0');
        const profitMarginBeforeAd = salePrice - productCost - amazonFee;
        const breakEvenAcos = salePrice > 0 ? (profitMarginBeforeAd / salePrice) * 100 : 0;

        const { max_date: maxReportDate, days_of_data } = stRes.rows[0] || {};
        const isDelayed = maxReportDate && (new Date(endDate).getTime() - new Date(maxReportDate).getTime()) / (1000 * 3600 * 24) > 3;
        const delayDays = maxReportDate ? Math.floor((new Date(endDate).getTime() - new Date(maxReportDate).getTime()) / (1000 * 3600 * 24)) : null;

        // Process Ad Data
        const { totalAdSpend, adSales, adOrders, termMap, dailyTrendSummary } = adDataRes.rows.reduce((acc, row) => {
            const spend = parseFloat(row.spend || 0); const sales = parseFloat(row.sales || 0); const orders = parseInt(row.orders || 0, 10);
            const date = new Date(row.report_date).toISOString().split('T')[0];
            acc.totalAdSpend += spend; acc.adSales += sales; acc.adOrders += orders;
            if (!acc.termMap.has(row.customer_search_term)) acc.termMap.set(row.customer_search_term, { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 });
            const termData = acc.termMap.get(row.customer_search_term);
            termData.spend += spend; termData.sales += sales; termData.orders += orders;
            termData.clicks += parseInt(row.clicks || 0, 10); termData.impressions += parseInt(row.impressions || 0, 10);
            if (!acc.dailyTrendSummary[date]) acc.dailyTrendSummary[date] = { adSpend: 0, adSales: 0, adOrders: 0 };
            acc.dailyTrendSummary[date].adSpend += spend; acc.dailyTrendSummary[date].adSales += sales; acc.dailyTrendSummary[date].adOrders += orders;
            return acc;
        }, { totalAdSpend: 0, adSales: 0, adOrders: 0, termMap: new Map(), dailyTrendSummary: {} });

        // Process Sales & Traffic Data
        const totalSalesRes = await client.query("SELECT SUM(COALESCE((sales_data->'orderedProductSales'->>'amount')::numeric, 0)) as total_sales, SUM(COALESCE((traffic_data->>'sessions')::int, 0)) as total_sessions, SUM(COALESCE((sales_data->>'unitsOrdered')::int, 0)) as total_units, SUM(COALESCE((traffic_data->>'mobileAppSessions')::int, 0)) as mobile_sessions FROM sales_and_traffic_by_asin WHERE child_asin = $1 AND report_date BETWEEN $2 AND $3", [asin, startDate, endDate]);
        const { total_sales, total_sessions, total_units, mobile_sessions } = totalSalesRes.rows[0] || {};
        const totalSales = parseFloat(total_sales || '0');
        const totalSessions = parseInt(total_sessions || '0', 10);
        const totalUnits = parseInt(total_units || '0', 10);
        const mobileSessions = parseInt(mobile_sessions || '0', 10);
        const tacos = totalSales > 0 ? (totalAdSpend / totalSales) * 100 : 0;
        const avgCpa = adOrders > 0 ? totalAdSpend / adOrders : 0;
        
        // Process SQP Data
        const sqpMap = new Map();
        sqpDataRes.rows.forEach(row => {
            const raw = row.performance_data;
            if (!raw || !raw.searchQueryData) return;
            const marketImpr = raw.impressionData?.totalQueryImpressionCount || 0;
            sqpMap.set(row.search_query, {
                marketVolume: raw.searchQueryData.searchQueryVolume,
                marketImpressions: marketImpr,
                marketClicks: raw.clickData?.totalClickCount || 0,
                marketCarts: raw.cartAddData?.totalCartAddCount || 0,
                marketPurchases: raw.purchaseData?.totalPurchaseCount || 0,
                asinClickShare: safeDivide(raw.clickData?.asinClickCount, raw.clickData?.totalClickCount),
                asinCartShare: safeDivide(raw.cartAddData?.asinCartAddCount, raw.cartAddData?.totalCartAddCount),
                asinPurchaseShare: safeDivide(raw.purchaseData?.asinPurchaseCount, raw.purchaseData?.totalPurchaseCount),
                marketCtr: safeDivide(raw.clickData?.totalClickCount, marketImpr),
                marketCartRate: safeDivide(raw.cartAddData?.totalCartAddCount, raw.clickData?.totalClickCount),
                marketPurchaseRate: safeDivide(raw.purchaseData?.totalPurchaseCount, raw.cartAddData?.totalCartAddCount)
            });
        });

        // Combine and enrich data
        const detailedSearchTermAnalysis = Array.from(termMap.entries()).map(([term, data]) => {
            const isRelevant = RELEVANT_REGEX.test(term);
            const { acos, cpa, ctr } = calculateKpis(data.spend, data.sales, data.orders, 0, 0, data.clicks, data.impressions);
            const sqpData = sqpMap.get(term) || {};
            const adCartRate = 0; // Not available in ad reports
            const adPurchaseRate = 0; // Not available in ad reports

            return {
                searchTerm: term, isRelevant,
                adsPerformance: { ...data, acos, cpa },
                marketPerformance: { marketVolume: sqpData.marketVolume || 0, totalMarketClicks: sqpData.marketClicks || 0, totalMarketPurchases: sqpData.marketPurchases || 0 },
                asinShare: { clickShare: sqpData.asinClickShare || 0, purchaseShare: sqpData.asinPurchaseShare || 0 },
                funnelAnalysis: { marketCtr: sqpData.marketCtr || 0, asinCtr: ctr, marketCartRate: sqpData.marketCartRate || 0, asinCartRate: adCartRate, marketPurchaseRate: sqpData.marketPurchaseRate || 0, asinPurchaseRate: adPurchaseRate }
            };
        }).sort((a,b) => b.adsPerformance.spend - a.adsPerformance.spend);

        const { relevantTerms, irrelevantTerms } = detailedSearchTermAnalysis.reduce((acc, term) => { (term.isRelevant ? acc.relevantTerms : acc.irrelevantTerms).push(term.searchTerm); return acc; }, { relevantTerms: [], irrelevantTerms: [] });

        // --- 3. Generate Action Plan ---
        const actionPlan = { bidManagement: [], negativeKeywords: [], listingOptimization: [] };
        detailedSearchTermAnalysis.forEach(term => {
            if (term.isRelevant && term.adsPerformance.orders > 1 && term.adsPerformance.acos < breakEvenAcos * 0.8) actionPlan.bidManagement.push(`Tăng bid cho "${term.searchTerm}" vì có ACoS tốt (${formatValue(term.adsPerformance.acos, 'percent')}%) và nhiều đơn hàng.`);
            if (term.isRelevant && term.adsPerformance.acos > breakEvenAcos * 1.2) actionPlan.bidManagement.push(`Giảm bid cho "${term.searchTerm}" vì ACoS (${formatValue(term.adsPerformance.acos, 'percent')}%) cao hơn mức hòa vốn.`);
            if (!term.isRelevant && term.adsPerformance.spend > (productCost * 0.5)) actionPlan.negativeKeywords.push(`Phủ định "${term.searchTerm}" vì không liên quan và đã tốn chi phí.`);
            if (term.funnelAnalysis.asinCtr > 0 && term.funnelAnalysis.marketCartRate > 0 && term.funnelAnalysis.asinCartRate < term.funnelAnalysis.marketCartRate * 0.5) actionPlan.listingOptimization.push(`Xem xét tối ưu listing cho "${term.searchTerm}" vì tỷ lệ thêm vào giỏ hàng thấp hơn nhiều so với thị trường.`);
        });
        if (tacos > breakEvenAcos) actionPlan.bidManagement.push("TACoS cao hơn ACoS hòa vốn, cần xem xét lại tổng chi tiêu quảng cáo.");
        
        // --- 4. Assemble Final Report ---
        const report = {
            asinStatus: { status: getAsinStatus(parseInt(days_of_data || '0', 10)), daysOfData: parseInt(days_of_data || '0', 10) },
            dataFreshness: { isDelayed, delayDays },
            costAnalysis: { price: salePrice, profitMarginBeforeAd, breakEvenAcos, avgCpa, profitMarginAfterAd: profitMarginBeforeAd - avgCpa, blendedCpa: totalAdSpend / (totalUnits || 1), blendedProfitMargin: profitMarginBeforeAd - (totalAdSpend / (totalUnits || 1)) },
            weeklyOverview: {
                spendEfficiency: { totalAdSpend, adSales, acos: calculateKpis(totalAdSpend, adSales).acos, totalSales, tacos },
                searchTermClassification: { totalCount: termMap.size, relevantCount: relevantTerms.length, irrelevantCount: irrelevantTerms.length, relevantTerms: relevantTerms.slice(0, 10), irrelevantTerms: irrelevantTerms.slice(0,10) },
                trends: { daily: Object.entries(dailyTrendSummary).map(([date, data]) => ({date, ...data})).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()) },
                conversionAndDevices: { totalConversionRate: calculateKpis(0,0,0,totalUnits, totalSessions).cvr, mobileSessionShare: (totalSessions > 0 ? (mobileSessions / totalSessions) * 100 : 0) },
            },
            detailedSearchTermAnalysis,
            weeklyActionPlan: actionPlan,
        };
        
        res.json(sanitizeAndFormatReport(report));

    } catch (error) {
        console.error('[Report Engine] Error generating report:', error);
        res.status(500).json({ error: error.message || 'Failed to generate analysis report.' });
    } finally {
        if (client) client.release();
    }
});

export default router;