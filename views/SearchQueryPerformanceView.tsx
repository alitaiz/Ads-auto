// views/SearchQueryPerformanceView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { QueryPerformanceData, PerformanceFilterOptions, ProductDetails, PerformanceChartConfig } from '../types';
import { formatNumber, formatPercent } from '../utils';
import { ChartModal } from './components/ChartModal';

const styles: { [key: string]: React.CSSProperties } = {
    viewContainer: { padding: '20px', maxWidth: '100%', margin: '0 auto', },
    header: { marginBottom: '20px', },
    title: { fontSize: '2rem', margin: '0 0 5px 0', },
    subtitle: { fontSize: '1rem', color: '#666', margin: 0, },
    card: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '15px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', },
    filterGroup: { display: 'flex', flexDirection: 'column', gap: '5px', },
    label: { fontSize: '0.8rem', fontWeight: 500, color: '#333', },
    select: { padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '1rem', minWidth: '200px', },
    primaryButton: { padding: '10px 20px', border: 'none', borderRadius: '4px', backgroundColor: 'var(--primary-color)', color: 'white', fontSize: '1rem', cursor: 'pointer', alignSelf: 'flex-end', },
    tableContainer: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', overflowX: 'auto', marginTop: '20px', },
    table: { width: '100%', borderCollapse: 'collapse', },
    th: { padding: '12px 15px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', backgroundColor: '#f8f9fa', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
    td: { padding: '12px 15px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', },
    metricCell: { cursor: 'pointer', textDecoration: 'underline', color: 'var(--primary-color)' },
    message: { textAlign: 'center', padding: '50px', fontSize: '1.2rem', color: '#666', },
    error: { color: 'var(--danger-color)', padding: '20px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)', marginTop: '20px', },
    productCard: { display: 'flex', gap: '20px', alignItems: 'center', backgroundColor: 'var(--card-background-color)', padding: '20px', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', marginTop: '20px' },
    productImage: { width: '100px', height: '100px', objectFit: 'contain', borderRadius: '4px', border: '1px solid var(--border-color)' },
    productInfo: { display: 'flex', flexDirection: 'column', gap: '5px' },
    productTitle: { fontSize: '1.2rem', fontWeight: 600, margin: 0 },
};

const ProductDetailsCard = ({ details, loading }: { details: ProductDetails | null, loading: boolean }) => {
    if (loading) return <div style={styles.message}>Loading product details...</div>;
    if (!details) return null;
    if (details.error) return <div style={styles.error}>Could not load product details: {details.error}</div>;

    return (
        <div style={styles.productCard}>
            <img src={details.imageUrl} alt={details.title} style={styles.productImage} />
            <div style={styles.productInfo}>
                <h3 style={styles.productTitle}>{details.title}</h3>
                <p style={{ margin: 0 }}><strong>ASIN:</strong> {details.asin}</p>
                <p style={{ margin: 0 }}><strong>Price:</strong> {details.price || 'N/A'}</p>
                <p style={{ margin: 0 }}><strong>Rank:</strong> {details.rank || 'N/A'}</p>
            </div>
        </div>
    );
};

export function SearchQueryPerformanceView() {
    const [filters, setFilters] = useState<PerformanceFilterOptions>({ asins: [], weeks: [] });
    const [selectedAsin, setSelectedAsin] = useState<string>('');
    const [selectedWeek, setSelectedWeek] = useState<string>('');

    const [data, setData] = useState<QueryPerformanceData[]>([]);
    const [productDetails, setProductDetails] = useState<ProductDetails | null>(null);
    const [loading, setLoading] = useState({ filters: true, data: false, product: false });
    const [error, setError] = useState<string | null>(null);
    const [hasApplied, setHasApplied] = useState(false);

    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>({ key: 'searchQueryVolume', direction: 'descending' });
    const [chartConfig, setChartConfig] = useState<PerformanceChartConfig | null>(null);

    useEffect(() => {
        const fetchFilters = async () => {
            setLoading(prev => ({ ...prev, filters: true }));
            try {
                const response = await fetch('/api/query-performance-filters');
                if (!response.ok) throw new Error('Failed to fetch filter options');
                const data: PerformanceFilterOptions = await response.json();
                setFilters(data);
                if (data.asins.length > 0) setSelectedAsin(data.asins[0]);
                if (data.weeks.length > 0) setSelectedWeek(data.weeks[0].value);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'An unknown error occurred.');
            } finally {
                setLoading(prev => ({ ...prev, filters: false }));
            }
        };
        fetchFilters();
    }, []);

    const fetchData = useCallback(async () => {
        if (!selectedAsin || !selectedWeek) return;

        setHasApplied(true);
        setLoading({ ...loading, data: true, product: true });
        setError(null);

        const weekInfo = filters.weeks.find(w => w.value === selectedWeek);
        if (!weekInfo) return;
        
        const endDate = new Date(selectedWeek);
        endDate.setDate(endDate.getDate() + 6);
        const endDateStr = endDate.toISOString().split('T')[0];
        
        const dataPromise = fetch(`/api/query-performance?asin=${selectedAsin}&startDate=${selectedWeek}&endDate=${endDateStr}`);
        const productPromise = fetch(`/api/product-details?asins=${selectedAsin}`);

        try {
            const [dataResponse, productResponse] = await Promise.all([dataPromise, productPromise]);

            if (!dataResponse.ok) throw new Error((await dataResponse.json()).error || 'Failed to fetch performance data');
            const performanceData: QueryPerformanceData[] = await dataResponse.json();
            setData(performanceData);
            setLoading(prev => ({ ...prev, data: false }));

            if (!productResponse.ok) throw new Error((await productResponse.json()).error || 'Failed to fetch product details');
            const productData: ProductDetails[] = await productResponse.json();
            setProductDetails(productData[0] || null);
            setLoading(prev => ({ ...prev, product: false }));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred.');
            setLoading({ filters: false, data: false, product: false });
        }
    }, [selectedAsin, selectedWeek, filters.weeks]);
    
    const requestSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'descending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'descending') {
            direction = 'ascending';
        }
        setSortConfig({ key, direction });
    };

    const getNested = (obj: any, path: string) => path.split('.').reduce((p, c) => (p && typeof p === 'object' && c in p) ? p[c] : null, obj);

    const sortedData = useMemo(() => {
        let sortableItems = [...data];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = getNested(a, sortConfig.key) ?? 0;
                const bValue = getNested(b, sortConfig.key) ?? 0;

                if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [data, sortConfig]);

    const handleMetricClick = (rowData: QueryPerformanceData, metricId: string, metricLabel: string, metricFormat: 'number' | 'percent' | 'price') => {
        setChartConfig({ type: 'performance', asin: selectedAsin, searchQuery: rowData.searchQuery, metricId, metricLabel, metricFormat });
    };
    
    const chartDateRange = useMemo(() => {
        if (!selectedWeek) return { start: '', end: '' };
        const start = new Date(selectedWeek + 'T00:00:00Z');
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
    }, [selectedWeek]);

    return (
        <div style={styles.viewContainer}>
            {chartConfig && <ChartModal config={chartConfig} dateRange={chartDateRange} onClose={() => setChartConfig(null)} />}
            <header style={styles.header}>
                <h1 style={styles.title}>Search Query Performance</h1>
                <p style={styles.subtitle}>Analyze customer search query behavior and its impact on your ASINs.</p>
            </header>
            <div style={styles.card}>
                <div style={styles.filterGroup}>
                    <label style={styles.label} htmlFor="asin-select">ASIN</label>
                    <select id="asin-select" style={styles.select} value={selectedAsin} onChange={e => setSelectedAsin(e.target.value)} disabled={loading.filters}>
                        {filters.asins.map(asin => <option key={asin} value={asin}>{asin}</option>)}
                    </select>
                </div>
                <div style={styles.filterGroup}>
                    <label style={styles.label} htmlFor="week-select">Week</label>
                    <select id="week-select" style={styles.select} value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)} disabled={loading.filters}>
                        {filters.weeks.map(week => <option key={week.value} value={week.value}>{week.label}</option>)}
                    </select>
                </div>
                <button onClick={fetchData} style={styles.primaryButton} disabled={loading.data || loading.product}>
                    {loading.data || loading.product ? 'Loading...' : 'Apply'}
                </button>
            </div>
            {error && <div style={styles.error}>{error}</div>}

            <ProductDetailsCard details={productDetails} loading={loading.product} />

            <div style={styles.tableContainer}>
                {loading.data ? <div style={styles.message}>Loading data...</div> :
                 !hasApplied ? <div style={styles.message}>Select filters and click "Apply" to see data.</div> :
                 sortedData.length === 0 ? <div style={styles.message}>No data found for the selected criteria.</div> :
                 (
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th} onClick={() => requestSort('searchQuery')}>Search Query</th>
                                <th style={styles.th} onClick={() => requestSort('searchQueryVolume')}>SQ Volume</th>
                                <th style={styles.th} onClick={() => requestSort('impressions.asinShare')}>Impression Share</th>
                                <th style={styles.th} onClick={() => requestSort('clicks.clickRate')}>Click Rate</th>
                                <th style={styles.th} onClick={() => requestSort('clicks.asinShare')}>Click Share</th>
                                <th style={styles.th} onClick={() => requestSort('cartAdds.cartAddRate')}>Cart Add Rate</th>
                                <th style={styles.th} onClick={() => requestSort('cartAdds.asinShare')}>Cart Add Share</th>
                                <th style={styles.th} onClick={() => requestSort('purchases.purchaseRate')}>Purchase Rate</th>
                                <th style={styles.th} onClick={() => requestSort('purchases.asinShare')}>Purchase Share</th>
                                <th style={styles.th}>Has SP Data</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedData.map(row => (
                                <tr key={row.searchQuery}>
                                    <td style={styles.td}>{row.searchQuery}</td>
                                    <td style={{...styles.td, ...styles.metricCell}} onClick={() => handleMetricClick(row, 'searchQueryVolume', 'Search Query Volume', 'number')}>{formatNumber(row.searchQueryVolume)}</td>
                                    <td style={{...styles.td, ...styles.metricCell}} onClick={() => handleMetricClick(row, 'impressions.asinShare', 'Impression Share', 'percent')}>{formatPercent(row.impressions.asinShare)}</td>
                                    <td style={{...styles.td, ...styles.metricCell}} onClick={() => handleMetricClick(row, 'clicks.clickRate', 'Click Rate', 'percent')}>{formatPercent(row.clicks.clickRate)}</td>
                                    <td style={{...styles.td, ...styles.metricCell}} onClick={() => handleMetricClick(row, 'clicks.asinShare', 'Click Share', 'percent')}>{formatPercent(row.clicks.asinShare)}</td>
                                    <td style={{...styles.td, ...styles.metricCell}} onClick={() => handleMetricClick(row, 'cartAdds.cartAddRate', 'Cart Add Rate', 'percent')}>{formatPercent(row.cartAdds.cartAddRate)}</td>
                                    <td style={{...styles.td, ...styles.metricCell}} onClick={() => handleMetricClick(row, 'cartAdds.asinShare', 'Cart Add Share', 'percent')}>{formatPercent(row.cartAdds.asinShare)}</td>
                                    <td style={{...styles.td, ...styles.metricCell}} onClick={() => handleMetricClick(row, 'purchases.purchaseRate', 'Purchase Rate', 'percent')}>{formatPercent(row.purchases.purchaseRate)}</td>
                                    <td style={{...styles.td, ...styles.metricCell}} onClick={() => handleMetricClick(row, 'purchases.asinShare', 'Purchase Share', 'percent')}>{formatPercent(row.purchases.asinShare)}</td>
                                    <td style={{...styles.td, textAlign: 'center'}}>{row.hasSPData ? '✔️' : '❌'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 )}
            </div>
        </div>
    );
}