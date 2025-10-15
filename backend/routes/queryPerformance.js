// backend/routes/queryPerformance.js
import express from 'express';
import pool from '../db.js';

const router = express.Router();

// --- Helper Functions ---

/**
 * Calculates the US week number. A week starts on Sunday. Week 1 is the week containing Jan 1st.
 * @param {Date} d The date.
 * @returns {number} The week number.
 */
function getWeekNumber(d) {
    const date = new Date(d.getTime());
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    // Day of year, 0-indexed
    const dayOfYear = Math.floor((date - firstDayOfYear) / (24 * 60 * 60 * 1000));
    // Day of the week for Jan 1st (0 = Sunday)
    const janFirstDayOfWeek = firstDayOfYear.getDay();
    // Calculate week number
    return Math.ceil((dayOfYear + 1 + janFirstDayOfWeek) / 7);
}

// A safer formatDate that avoids timezone shifts from toISOString()
const formatDateSafe = (d) => {
    if (!d) return '';
    const date = new Date(d);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};


/**
 * Safely retrieves a nested property from an object.
 * @param {any} obj The object to query.
 * @param {string} path The dot-separated path to the property.
 * @returns {any} The value of the property, or undefined if not found.
 */
const getNested = (obj, path) => path.split('.').reduce((p, c) => (p && typeof p === 'object' && c in p) ? p[c] : undefined, obj);


// --- Search Query Performance Endpoints ---

router.get('/query-performance-filters', async (req, res) => {
    try {
        console.log(`[Server] Querying filters for Performance view.`);
        const asinsQuery = 'SELECT DISTINCT asin FROM query_performance_data ORDER BY asin ASC;';
        // Note: The pg driver returns DATE columns as JS Date objects in the server's local timezone.
        const weeksQuery = 'SELECT DISTINCT start_date FROM query_performance_data ORDER BY start_date DESC;';
        
        const [asinsResult, weeksResult] = await Promise.all([
            pool.query(asinsQuery),
            pool.query(weeksQuery)
        ]);

        const asins = asinsResult.rows.map(r => r.asin);
        const weeks = weeksResult.rows.map(r => {
             // r.start_date is a JS Date object at midnight in the server's local timezone.
             const startDate = r.start_date;
             const endDate = new Date(startDate);
             // Use getDate/setDate which operate in local time, preventing timezone-related day shifts.
             endDate.setDate(startDate.getDate() + 6);
             return {
                 value: formatDateSafe(startDate),
                 label: `Week ${getWeekNumber(startDate)} | ${formatDateSafe(startDate)} - ${formatDateSafe(endDate)}`
             };
        });
        
        res.json({ asins, weeks });
    } catch (error) {
        console.error("[Server] Error fetching query performance filters:", error);
        res.status(500).json({ error: "Failed to fetch filters." });
    }
});

router.get('/query-performance', async (req, res) => {
    const { asin, startDate, endDate } = req.query;
    if (!asin || !startDate || !endDate) {
        return res.status(400).json({ error: 'ASIN, startDate, and endDate are required' });
    }
    console.log(`[Server] Querying performance data for ASIN: ${asin}, from ${startDate} to ${endDate}`);

    try {
        // Fetch SP clicks aggregated for the whole period for each search query, now filtered by ASIN
        const spClicksQuery = `
            SELECT 
                customer_search_term, 
                SUM(clicks)::int as "spClicks"
            FROM sponsored_products_search_term_report
            WHERE report_date BETWEEN $1 AND $2 AND asin = $3
            GROUP BY customer_search_term;
        `;
        const spClicksResult = await pool.query(spClicksQuery, [startDate, endDate, asin]);
        const spClicksMap = new Map();
        spClicksResult.rows.forEach(row => {
            spClicksMap.set(row.customer_search_term, row.spClicks);
        });

        const query = `
            SELECT 
                qp.search_query,
                qp.performance_data
            FROM query_performance_data qp
            WHERE qp.asin = $1 AND qp.start_date >= $2 AND qp.start_date <= $3;
        `;
        const result = await pool.query(query, [asin, startDate, endDate]);

        if (result.rows.length === 0) {
            console.log(`[Server] No performance data found for ASIN ${asin} in the date range.`);
            return res.json([]);
        }

        const aggregationMap = new Map();
        const getMedian = (arr) => {
            if (!arr || arr.length === 0) return null;
            const sorted = [...arr].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        };

        for (const row of result.rows) {
            const raw = row.performance_data;
            if (!raw || !raw.searchQueryData) continue;
            
            const sq = raw.searchQueryData.searchQuery;
            if (!aggregationMap.has(sq)) {
                aggregationMap.set(sq, {
                    searchQueryScore: raw.searchQueryData.searchQueryScore,
                    searchQueryVolume: 0,
                    impressionData: { totalQueryImpressionCount: 0, asinImpressionCount: 0 },
                    clickData: { totalClickCount: 0, asinClickCount: 0, totalSameDayShippingClickCount: 0, totalOneDayShippingClickCount: 0, totalTwoDayShippingClickCount: 0, totalMedianClickPrices: [], asinMedianClickPrices: [] },
                    cartAddData: { totalCartAddCount: 0, asinCartAddCount: 0, totalSameDayShippingCartAddCount: 0, totalOneDayShippingCartAddCount: 0, totalTwoDayShippingCartAddCount: 0, totalMedianCartAddPrices: [], asinMedianCartAddPrices: [] },
                    purchaseData: { totalPurchaseCount: 0, asinCount: 0, totalSameDayShippingPurchaseCount: 0, totalOneDayShippingPurchaseCount: 0, totalTwoDayShippingPurchaseCount: 0, totalMedianPurchasePrices: [], asinMedianPurchasePrices: [] },
                });
            }

            const agg = aggregationMap.get(sq);
            
            agg.searchQueryVolume += raw.searchQueryData.searchQueryVolume || 0;
            agg.impressionData.totalQueryImpressionCount += raw.impressionData?.totalQueryImpressionCount || 0;
            agg.impressionData.asinImpressionCount += raw.impressionData?.asinImpressionCount || 0;
            
            agg.clickData.totalClickCount += raw.clickData?.totalClickCount || 0;
            agg.clickData.asinClickCount += raw.clickData?.asinClickCount || 0;
            if(raw.clickData?.totalMedianClickPrice?.amount) agg.clickData.totalMedianClickPrices.push(raw.clickData.totalMedianClickPrice.amount);
            if(raw.clickData?.asinMedianClickPrice?.amount) agg.clickData.asinMedianClickPrices.push(raw.clickData.asinMedianClickPrice.amount);
            agg.clickData.totalSameDayShippingClickCount += raw.clickData?.totalSameDayShippingClickCount || 0;
            agg.clickData.totalOneDayShippingClickCount += raw.clickData?.totalOneDayShippingClickCount || 0;
            agg.clickData.totalTwoDayShippingClickCount += raw.clickData?.totalTwoDayShippingClickCount || 0;

            agg.cartAddData.totalCartAddCount += raw.cartAddData?.totalCartAddCount || 0;
            agg.cartAddData.asinCartAddCount += raw.cartAddData?.asinCartAddCount || 0;
            if(raw.cartAddData?.totalMedianCartAddPrice?.amount) agg.cartAddData.totalMedianCartAddPrices.push(raw.cartAddData.totalMedianCartAddPrice.amount);
            if(raw.cartAddData?.asinMedianCartAddPrice?.amount) agg.cartAddData.asinMedianCartAddPrices.push(raw.cartAddData.asinMedianCartAddPrice.amount);
            agg.cartAddData.totalSameDayShippingCartAddCount += raw.cartAddData?.totalSameDayShippingCartAddCount || 0;
            agg.cartAddData.totalOneDayShippingCartAddCount += raw.cartAddData?.totalOneDayShippingCartAddCount || 0;
            agg.cartAddData.totalTwoDayShippingCartAddCount += raw.cartAddData?.totalTwoDayShippingCartAddCount || 0;
            
            agg.purchaseData.totalPurchaseCount += raw.purchaseData?.totalPurchaseCount || 0;
            agg.purchaseData.asinCount += raw.purchaseData?.asinCount || 0;
            if(raw.purchaseData?.totalMedianPurchasePrice?.amount) agg.purchaseData.totalMedianPurchasePrices.push(raw.purchaseData.totalMedianPurchasePrice.amount);
            if(raw.purchaseData?.asinMedianPurchasePrice?.amount) agg.purchaseData.asinMedianPurchasePrices.push(raw.purchaseData.asinMedianPurchasePrice.amount);
            agg.purchaseData.totalSameDayShippingPurchaseCount += raw.purchaseData?.totalSameDayShippingPurchaseCount || 0;
            agg.purchaseData.totalOneDayShippingPurchaseCount += raw.purchaseData?.totalOneDayShippingPurchaseCount || 0;
            agg.purchaseData.totalTwoDayShippingPurchaseCount += raw.purchaseData?.totalTwoDayShippingPurchaseCount || 0;
        }

        const transformedData = [];
        const formatPrice = (priceObj) => priceObj ? `${priceObj.currencyCode} ${priceObj.amount.toFixed(2)}` : null;

        for (const [searchQuery, agg] of aggregationMap.entries()) {
             const currencyCode = 'USD'; // Assume USD for aggregated median price
             const safeDivide = (num, den) => (den > 0 ? num / den : 0);
             const spClicks = spClicksMap.get(searchQuery) || 0;

            transformedData.push({
                searchQuery,
                searchQueryScore: agg.searchQueryScore,
                searchQueryVolume: agg.searchQueryVolume,
                hasSPData: spClicks > 0,
                spClicks: spClicks,
                impressions: {
                    totalCount: agg.impressionData.totalQueryImpressionCount,
                    asinCount: agg.impressionData.asinImpressionCount,
                    asinShare: safeDivide(agg.impressionData.asinImpressionCount, agg.impressionData.totalQueryImpressionCount),
                },
                clicks: {
                    totalCount: agg.clickData.totalClickCount,
                    clickRate: safeDivide(agg.clickData.totalClickCount, agg.impressionData.totalQueryImpressionCount),
                    asinCount: agg.clickData.asinClickCount,
                    asinShare: safeDivide(agg.clickData.asinClickCount, agg.clickData.totalClickCount),
                    totalMedianPrice: formatPrice(getMedian(agg.clickData.totalMedianClickPrices) != null ? { amount: getMedian(agg.clickData.totalMedianClickPrices), currencyCode } : null),
                    asinMedianPrice: formatPrice(getMedian(agg.clickData.asinMedianClickPrices) != null ? { amount: getMedian(agg.clickData.asinMedianClickPrices), currencyCode } : null),
                    sameDayShippingCount: agg.clickData.totalSameDayShippingClickCount,
                    oneDayShippingCount: agg.clickData.totalOneDayShippingClickCount,
                    twoDayShippingCount: agg.clickData.totalTwoDayShippingClickCount,
                },
                cartAdds: {
                    totalCount: agg.cartAddData.totalCartAddCount,
                    cartAddRate: safeDivide(agg.cartAddData.totalCartAddCount, agg.impressionData.totalQueryImpressionCount),
                    asinCount: agg.cartAddData.asinCartAddCount,
                    asinShare: safeDivide(agg.cartAddData.asinCartAddCount, agg.cartAddData.totalCartAddCount),
                    totalMedianPrice: formatPrice(getMedian(agg.cartAddData.totalMedianCartAddPrices) != null ? { amount: getMedian(agg.cartAddData.totalMedianCartAddPrices), currencyCode } : null),
                    asinMedianPrice: formatPrice(getMedian(agg.cartAddData.asinMedianCartAddPrices) != null ? { amount: getMedian(agg.cartAddData.asinMedianCartAddPrices), currencyCode } : null),
                    sameDayShippingCount: agg.cartAddData.totalSameDayShippingCartAddCount,
                    oneDayShippingCount: agg.cartAddData.totalOneDayShippingCartAddCount,
                    twoDayShippingCount: agg.cartAddData.totalTwoDayShippingCartAddCount,
                },
                purchases: {
                    totalCount: agg.purchaseData.totalPurchaseCount,
                    purchaseRate: safeDivide(agg.purchaseData.totalPurchaseCount, agg.impressionData.totalQueryImpressionCount),
                    asinCount: agg.purchaseData.asinCount,
                    asinShare: safeDivide(agg.purchaseData.asinCount, agg.purchaseData.totalPurchaseCount),
                    totalMedianPrice: formatPrice(getMedian(agg.purchaseData.totalMedianPurchasePrices) != null ? { amount: getMedian(agg.purchaseData.totalMedianPurchasePrices), currencyCode } : null),
                    asinMedianPrice: formatPrice(getMedian(agg.purchaseData.asinMedianPurchasePrices) != null ? { amount: getMedian(agg.purchaseData.asinMedianPurchasePrices), currencyCode } : null),
                    sameDayShippingCount: agg.purchaseData.totalSameDayShippingPurchaseCount,
                    oneDayShippingCount: agg.purchaseData.totalOneDayShippingPurchaseCount,
                    twoDayShippingCount: agg.purchaseData.totalTwoDayShippingPurchaseCount,
                }
            });
        }
        
        console.log(`[Server] Found and transformed ${transformedData.length} query performance records.`);
        res.json(transformedData);

    } catch (error) {
        console.error("[Server] Error fetching query performance data:", error);
        res.status(500).json({ error: "Failed to fetch query performance data." });
    }
});

router.get('/query-performance-history', async (req, res) => {
    const { asin, searchQuery, metricId, startDate, endDate } = req.query;

    if (!asin || !searchQuery || !metricId || !startDate || !endDate) {
        return res.status(400).json({ error: 'asin, searchQuery, metricId, startDate, and endDate are required' });
    }

    try {
        let performanceQuery;
        let performanceQueryParams;

        if (metricId === 'searchQueryVolume') {
            console.log(`[Server] Querying GLOBAL history for Query: "${searchQuery}", Metric: ${metricId} from ${startDate} to ${endDate}`);
            performanceQuery = `
                WITH DateSeries AS (
                    SELECT generate_series($2::date, $3::date, '7 days'::interval)::date AS report_date
                ),
                WeeklyVolume AS (
                    SELECT 
                        start_date, 
                        MAX((performance_data->'searchQueryData'->>'searchQueryVolume')::numeric) as value
                    FROM query_performance_data
                    WHERE search_query = $1
                      AND (performance_data->'searchQueryData'->>'searchQueryVolume') IS NOT NULL
                      AND start_date BETWEEN $2 AND $3
                    GROUP BY start_date
                )
                SELECT 
                    ds.report_date, 
                    wv.value
                FROM DateSeries ds
                LEFT JOIN WeeklyVolume wv ON ds.report_date = wv.start_date
                ORDER BY ds.report_date ASC;
            `;
            performanceQueryParams = [searchQuery, startDate, endDate];
        } else {
            console.log(`[Server] Querying ASIN-specific history for ASIN: ${asin}, Query: "${searchQuery}", Metric: ${metricId} from ${startDate} to ${endDate}`);
            performanceQuery = `
                WITH DateSeries AS (
                    SELECT generate_series($3::date, $4::date, '7 days'::interval)::date AS report_date
                ),
                ActualData AS (
                    SELECT start_date, performance_data
                    FROM query_performance_data
                    WHERE asin = $1 AND search_query = $2
                      AND start_date BETWEEN $3 AND $4
                )
                SELECT ws.report_date, ad.performance_data
                FROM DateSeries ws
                LEFT JOIN ActualData ad ON ws.report_date = ad.start_date
                ORDER BY ws.report_date ASC;
            `;
            performanceQueryParams = [asin, searchQuery, startDate, endDate];
        }
        
        const performanceResult = await pool.query(performanceQuery, performanceQueryParams);

        if (performanceResult.rows.length === 0) {
            return res.json([]);
        }
        
        const spMaxDate = new Date(`${endDate}T00:00:00.000Z`);
        spMaxDate.setDate(spMaxDate.getDate() + 6);

        // CORRECTED QUERY: Added the missing "AND asin = $4" clause to ensure data is specific to the selected ASIN.
        const spDataQuery = `
            SELECT
                date_trunc('week', report_date + interval '1 day')::date - interval '1 day' as week_start_date,
                SUM(impressions)::int as sp_impressions,
                SUM(clicks)::int as sp_clicks,
                SUM(purchases_7d)::int as sp_orders
            FROM sponsored_products_search_term_report
            WHERE customer_search_term = $1
              AND report_date BETWEEN $2 AND $3
              AND asin = $4
            GROUP BY week_start_date
            ORDER BY week_start_date ASC;
        `;
        const spResult = await pool.query(spDataQuery, [
            searchQuery, 
            startDate, 
            formatDateSafe(spMaxDate),
            asin // Pass the ASIN as the fourth parameter
        ]);

        const spDataMap = new Map();
        spResult.rows.forEach(row => {
            spDataMap.set(formatDateSafe(new Date(row.week_start_date)), {
                sp_impressions: row.sp_impressions,
                sp_clicks: row.sp_clicks,
                sp_orders: row.sp_orders,
            });
        });

        let historyData;
        if (metricId === 'searchQueryVolume') {
            historyData = performanceResult.rows.map(row => ({
                report_date: row.report_date,
                value: row.value !== null && row.value !== undefined ? Number(row.value) : null,
            }));
        } else {
            historyData = performanceResult.rows.map(row => {
                if (!row.performance_data) return { report_date: row.report_date, value: null };
                const raw = row.performance_data;
                
                const safeDivide = (numerator, denominator) => {
                    const num = numerator || 0;
                    const den = denominator || 0;
                    return den > 0 ? num / den : 0;
                };

                const transformed = {
                    searchQuery: raw.searchQueryData?.searchQuery,
                    searchQueryScore: raw.searchQueryData?.searchQueryScore,
                    searchQueryVolume: raw.searchQueryData?.searchQueryVolume,
                    impressions: {
                        totalCount: raw.impressionData?.totalQueryImpressionCount,
                        asinCount: raw.impressionData?.asinImpressionCount,
                        asinShare: safeDivide(raw.impressionData?.asinImpressionCount, raw.impressionData?.totalQueryImpressionCount),
                    },
                    clicks: {
                        totalCount: raw.clickData?.totalClickCount,
                        clickRate: safeDivide(raw.clickData?.totalClickCount, raw.impressionData?.totalQueryImpressionCount),
                        asinCount: raw.clickData?.asinClickCount,
                        asinShare: safeDivide(raw.clickData?.asinClickCount, raw.clickData?.totalClickCount),
                        totalMedianPrice: raw.clickData?.totalMedianClickPrice?.amount,
                        asinMedianPrice: raw.clickData?.asinMedianClickPrice?.amount,
                    },
                    cartAdds: {
                        totalCount: raw.cartAddData?.totalCartAddCount,
                        cartAddRate: safeDivide(raw.cartAddData?.totalCartAddCount, raw.impressionData?.totalQueryImpressionCount),
                        asinCount: raw.cartAddData?.asinCartAddCount,
                        asinShare: safeDivide(raw.cartAddData?.asinCartAddCount, raw.cartAddData?.totalCartAddCount),
                    },
                    purchases: {
                        totalCount: raw.purchaseData?.totalPurchaseCount,
                        purchaseRate: safeDivide(raw.purchaseData?.totalPurchaseCount, raw.impressionData?.totalQueryImpressionCount),
                        asinCount: raw.purchaseData?.asinCount,
                        asinShare: safeDivide(raw.purchaseData?.asinCount, raw.purchaseData?.totalPurchaseCount),
                    },
                };
                const value = getNested(transformed, metricId);
                return {
                    report_date: row.report_date,
                    value: (value !== null && value !== undefined) ? Number(value) : null,
                };
            });
        }
        
        // Enrich with SP data
        const enrichedHistoryData = historyData.map(row => {
            const spData = spDataMap.get(formatDateSafe(new Date(row.report_date)));
            return {
                ...row,
                ...(spData && { sp_impressions: spData.sp_impressions, sp_clicks: spData.sp_clicks, sp_orders: spData.sp_orders }),
            };
        });

        res.json(enrichedHistoryData);

    } catch (error) {
        console.error("[Server] Error fetching query performance history:", error);
        res.status(500).json({ error: "Failed to fetch performance history." });
    }
});

export default router;