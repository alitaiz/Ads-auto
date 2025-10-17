// backend/routes/aiAnalysis.js
import express from 'express';
import pool from '../db.js';

const router = express.Router();

// --- Constants and Configuration ---
const RELEVANT_KEYWORDS = ['memorial', 'sympathy', 'loss', 'lost', 'passed', 'passing', 'remembrance', 'condolence', 'bereavement', 'death', 'keepsake', 'goodbye', 'died', 'rainbow'];
const IRRELEVANT_KEYWORDS = ['figurine', 'statue', 'calico', 'siamese', 'tuxedo', 'kitty suncatcher', 'black cat gifts', 'angel with black cat', 'cat chime for window'];
const RELEVANT_REGEX = new RegExp(RELEVANT_KEYWORDS.join('|'), 'i');

// --- Helper Functions ---
const getAsinStatus = (daysOfData) => {
    if (daysOfData < 30) return 'New';
    if (daysOfData <= 60) return 'Launching';
    return 'Established';
};

const calculateKpis = (spend = 0, sales = 0, orders = 0, units = 0, sessions = 0) => {
    const safeSpend = Number(spend) || 0;
    const safeSales = Number(sales) || 0;
    const safeOrders = Number(orders) || 0;
    const safeUnits = Number(units) || 0;
    const safeSessions = Number(sessions) || 0;

    return {
        acos: safeSales > 0 ? (safeSpend / safeSales) * 100 : 0,
        cpa: safeOrders > 0 ? safeSpend / safeOrders : 0,
        cvr: safeSessions > 0 ? safeUnits / safeSessions * 100 : 0,
    };
};

const sanitizeAndFormatReport = (report) => {
    const formatValue = (value, type = 'number', decimals = 2) => {
        const num = parseFloat(value);
        if (isNaN(num) || !isFinite(num)) return type === 'price' ? '0.00' : '0';
        if (type === 'price') return num.toFixed(decimals);
        if (type === 'percent') return num.toFixed(decimals);
        return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
    };

    if (report.costAnalysis) {
        Object.keys(report.costAnalysis).forEach(key => {
            if (typeof report.costAnalysis[key] === 'number') {
                const type = key.toLowerCase().includes('acos') ? 'percent' : 'price';
                report.costAnalysis[key] = formatValue(report.costAnalysis[key], type);
            }
        });
    }

    if (report.weeklyOverview?.spendEfficiency) {
         Object.keys(report.weeklyOverview.spendEfficiency).forEach(key => {
            if (typeof report.weeklyOverview.spendEfficiency[key] === 'number') {
                const type = (key.toLowerCase().includes('acos') || key.toLowerCase().includes('tacos')) ? 'percent' : 'price';
                report.weeklyOverview.spendEfficiency[key] = formatValue(report.weeklyOverview.spendEfficiency[key], type);
            }
        });
    }
    
     if (report.weeklyOverview?.conversionAndDevices) {
        report.weeklyOverview.conversionAndDevices.totalConversionRate = formatValue(report.weeklyOverview.conversionAndDevices.totalConversionRate, 'percent');
        report.weeklyOverview.conversionAndDevices.mobileSessionShare = formatValue(report.weeklyOverview.conversionAndDevices.mobileSessionShare, 'percent');
    }

    if (report.detailedSearchTermAnalysis) {
        report.detailedSearchTermAnalysis = report.detailedSearchTermAnalysis.map(term => ({
            ...term,
            adsPerformance: {
                ...term.adsPerformance,
                spend: formatValue(term.adsPerformance.spend, 'price'),
                sales: formatValue(term.adsPerformance.sales, 'price'),
                acos: `${formatValue(term.adsPerformance.acos, 'percent')}%`,
                cpa: formatValue(term.adsPerformance.cpa, 'price'),
                orders: formatValue(term.adsPerformance.orders, 'number', 0)
            }
        }));
    }
    
    return report;
};

// --- Main Route ---
router.post('/ai/generate-analysis-report', async (req, res) => {
    const { asin, startDate, endDate } = req.body;
    if (!asin || !startDate || !endDate) {
        return res.status(400).json({ error: 'ASIN, startDate, and endDate are required.' });
    }
    
    let client;
    try {
        client = await pool.connect();
        console.log(`[Report Engine] Starting data gathering for ASIN ${asin}`);

        // --- 1. Data Gathering ---
        const [listingRes, stRes, adDataRes] = await Promise.all([
            client.query('SELECT sale_price, product_cost, amazon_fee FROM product_listings WHERE asin = $1', [asin]),
            client.query("SELECT COUNT(DISTINCT report_date) as days_of_data, MAX(report_date) as max_date FROM sales_and_traffic_by_asin WHERE child_asin = $1", [asin]),
            client.query(`
                SELECT report_date, customer_search_term, SUM(COALESCE(impressions, 0)) AS impressions, SUM(COALESCE(clicks, 0)) AS clicks, SUM(COALESCE(cost, 0)) AS spend, SUM(COALESCE(sales_7d, 0)) AS sales, SUM(COALESCE(purchases_7d, 0)) AS orders
                FROM sponsored_products_search_term_report
                WHERE asin = $1 AND report_date BETWEEN $2 AND $3 AND customer_search_term IS NOT NULL
                GROUP BY report_date, customer_search_term
            `, [asin, startDate, endDate]),
        ]);
        
        console.log('[Report Engine] Data gathering complete.');
        
        // --- 2. Algorithmic Analysis ---
        const listing = listingRes.rows[0];
        if (!listing) throw new Error(`Listing for ASIN ${asin} not found. Please add cost details in the Listings tab.`);
        
        const salePrice = parseFloat(listing.sale_price || '0');
        const productCost = parseFloat(listing.product_cost || '0');
        const amazonFee = parseFloat(listing.amazon_fee || '0');
        const profitMarginBeforeAd = salePrice - productCost - amazonFee;
        const breakEvenAcos = salePrice > 0 ? (profitMarginBeforeAd / salePrice) * 100 : 0;

        const { max_date: maxReportDate, days_of_data } = stRes.rows[0] || {};
        const isDelayed = (new Date(endDate).getTime() - new Date(maxReportDate).getTime()) / (1000 * 3600 * 24) > 3;
        const delayDays = Math.floor((new Date(endDate).getTime() - new Date(maxReportDate).getTime()) / (1000 * 3600 * 24));

        const { totalAdSpend, adSales, adOrders, termMap, dailyTrendSummary } = adDataRes.rows.reduce((acc, row) => {
            const spend = parseFloat(row.spend || 0);
            const sales = parseFloat(row.sales || 0);
            const orders = parseInt(row.orders || 0, 10);
            const date = new Date(row.report_date).toISOString().split('T')[0];

            acc.totalAdSpend += spend;
            acc.adSales += sales;
            acc.adOrders += orders;
            
            if (!acc.termMap.has(row.customer_search_term)) {
                acc.termMap.set(row.customer_search_term, { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 });
            }
            const termData = acc.termMap.get(row.customer_search_term);
            termData.spend += spend;
            termData.sales += sales;
            termData.orders += orders;
            termData.clicks += parseInt(row.clicks || 0, 10);
            termData.impressions += parseInt(row.impressions || 0, 10);
            
            if (!acc.dailyTrendSummary[date]) acc.dailyTrendSummary[date] = { adSpend: 0, adSales: 0, adOrders: 0 };
            acc.dailyTrendSummary[date].adSpend += spend;
            acc.dailyTrendSummary[date].adSales += sales;
            acc.dailyTrendSummary[date].adOrders += orders;

            return acc;
        }, { totalAdSpend: 0, adSales: 0, adOrders: 0, termMap: new Map(), dailyTrendSummary: {} });

        const totalSalesRes = await client.query("SELECT SUM(COALESCE((sales_data->'orderedProductSales'->>'amount')::numeric, 0)) as total_sales, SUM(COALESCE((traffic_data->>'sessions')::int, 0)) as total_sessions, SUM(COALESCE((sales_data->>'unitsOrdered')::int, 0)) as total_units, SUM(COALESCE((traffic_data->>'mobileAppSessions')::int, 0)) as mobile_sessions FROM sales_and_traffic_by_asin WHERE child_asin = $1 AND report_date BETWEEN $2 AND $3", [asin, startDate, endDate]);
        const { total_sales: totalSales, total_sessions: totalSessions, total_units: totalUnits, mobile_sessions: mobileSessions } = totalSalesRes.rows[0] || {};
        
        const tacos = parseFloat(totalSales) > 0 ? (totalAdSpend / parseFloat(totalSales)) * 100 : 0;
        const avgCpa = adOrders > 0 ? totalAdSpend / adOrders : 0;

        const detailedSearchTermAnalysis = Array.from(termMap.entries()).map(([term, data]) => {
            const isRelevant = RELEVANT_REGEX.test(term);
            const { acos, cpa } = calculateKpis(data.spend, data.sales, data.orders);
            return {
                searchTerm: term,
                isRelevant,
                adsPerformance: { ...data, acos, cpa },
            };
        }).sort((a,b) => b.adsPerformance.spend - a.adsPerformance.spend);

        const { relevantTerms, irrelevantTerms } = detailedSearchTermAnalysis.reduce((acc, term) => {
            (term.isRelevant ? acc.relevantTerms : acc.irrelevantTerms).push(term.searchTerm);
            return acc;
        }, { relevantTerms: [], irrelevantTerms: [] });
        
        // --- 3. Generate Action Plan ---
        const actionPlan = { bidManagement: [], negativeKeywords: [], listingOptimization: [] };
        detailedSearchTermAnalysis.forEach(term => {
            if (term.isRelevant && term.adsPerformance.orders > 1 && term.adsPerformance.acos < breakEvenAcos * 0.8) {
                actionPlan.bidManagement.push(`Tăng bid cho "${term.searchTerm}" vì có ACoS tốt và nhiều đơn hàng.`);
            }
            if (term.isRelevant && term.adsPerformance.acos > breakEvenAcos * 1.2) {
                actionPlan.bidManagement.push(`Giảm bid cho "${term.searchTerm}" vì ACoS cao hơn mức hòa vốn.`);
            }
            if (!term.isRelevant && term.adsPerformance.spend > (productCost * 0.5)) { // Tùy chỉnh ngưỡng chi tiêu
                actionPlan.negativeKeywords.push(`Phủ định "${term.searchTerm}" vì không liên quan và đã tốn chi phí.`);
            }
        });
        if (tacos > breakEvenAcos) actionPlan.bidManagement.push("TACoS cao hơn ACoS hòa vốn, cần xem xét lại tổng chi tiêu quảng cáo.");
        
        // --- 4. Assemble Final Report ---
        const report = {
            asinStatus: { status: getAsinStatus(parseInt(days_of_data, 10)), daysOfData: parseInt(days_of_data, 10) },
            dataFreshness: { isDelayed, delayDays },
            costAnalysis: { price: salePrice, profitMarginBeforeAd, breakEvenAcos, avgCpa, profitMarginAfterAd: profitMarginBeforeAd - avgCpa, blendedCpa: totalAdSpend / (parseInt(totalUnits) || 1), blendedProfitMargin: profitMarginBeforeAd - (totalAdSpend / (parseInt(totalUnits) || 1)) },
            weeklyOverview: {
                spendEfficiency: { totalAdSpend, adSales, acos: calculateKpis(totalAdSpend, adSales).acos, totalSales: parseFloat(totalSales), tacos },
                searchTermClassification: { totalCount: termMap.size, relevantCount: relevantTerms.length, irrelevantCount: irrelevantTerms.length, relevantTerms: relevantTerms.slice(0, 5), irrelevantTerms: irrelevantTerms.slice(0,5) },
                trends: { daily: Object.entries(dailyTrendSummary).map(([date, data]) => ({date, ...data})).sort((a,b) => new Date(a.date) - new Date(b.date)) },
                conversionAndDevices: { totalConversionRate: calculateKpis(0,0,0,parseInt(totalUnits), parseInt(totalSessions)).cvr, mobileSessionShare: (parseInt(totalSessions) > 0 ? (parseInt(mobileSessions) / parseInt(totalSessions)) * 100 : 0) },
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
