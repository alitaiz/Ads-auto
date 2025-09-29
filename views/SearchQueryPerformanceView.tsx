// views/SearchQueryPerformanceView.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    QueryPerformanceData,
    PerformanceFilterOptions,
    ProductDetails,
    AppChartConfig
} from '../types';
import { formatNumber, formatPercent } from '../utils';
import { ChartModal } from './components/ChartModal';

const styles: { [key: string]: React.CSSProperties } = {
    viewContainer: { padding: '20px', maxWidth: '100%', margin: '0 auto' },
    header: { marginBottom: '20px' },
    title: { fontSize: '2rem', margin: '0 0 5px 0' },
    subtitle: { fontSize: '1rem', color: '#666', margin: 0 },
    controlsContainer: {
        display: 'flex',
        gap: '20px',
        alignItems: 'flex-end',
        padding: '20px',
        backgroundColor: 'var(--card-background-color)',
        borderRadius: 'var(--border-radius)',
        boxShadow: 'var(--box-shadow)',
        marginBottom: '20px',
    },
    controlGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontSize: '0.9rem', fontWeight: 500 },
    select: { padding: '10px', borderRadius: '4px', border: '1px solid var(--border-color)', minWidth: '250px' },
    primaryButton: { padding: '10px 20px', border: 'none', borderRadius: '4px', backgroundColor: 'var(--primary-color)', color: 'white', cursor: 'pointer' },
    productDetailsContainer: {
        display: 'flex', gap: '20px', alignItems: 'center',
        padding: '20px', backgroundColor: '#f8f9fa', borderRadius: 'var(--border-radius)',
        border: '1px solid var(--border-color)', marginBottom: '20px'
    },
    productImage: { width: '80px', height: '80px', objectFit: 'contain', borderRadius: '4px' },
    productInfo: { display: 'flex', flexDirection: 'column', gap: '5px' },
    productTitle: { fontSize: '1.2rem', fontWeight: 600, margin: 0 },
    productPrice: { fontSize: '1.1rem', color: 'var(--primary-color)', margin: 0 },
    tableContainer: {
        backgroundColor: 'var(--card-background-color)',
        borderRadius: 'var(--border-radius)',
        boxShadow: 'var(--box-shadow)',
        overflowX: 'auto',
    },
    table: { width: '100%', minWidth: '1800px', borderCollapse: 'collapse' },
    th: { padding: '12px 15px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', backgroundColor: '#f8f9fa', fontWeight: 600, cursor: 'pointer', userSelect: 'none' },
    td: { padding: '12px 15px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' },
    clickableCell: { cursor: 'pointer', textDecoration: 'underline', color: 'var(--primary-color)' },
    message: { textAlign: 'center', padding: '50px', fontSize: '1.2rem', color: '#666' },
    error: { color: 'var(--danger-color)', padding: '20px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)', marginTop: '20px' },
    spBadge: { backgroundColor: '#28a745', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', marginLeft: '8px' },
};

type SortableKeys = keyof QueryPerformanceData | 'impressions.asinShare' | 'clicks.clickRate' | 'clicks.asinShare' | 'cartAdds.cartAddRate' | 'cartAdds.asinShare' | 'purchases.purchaseRate' | 'purchases.asinShare';

const getNestedValue = (obj: any, path: string) => {
    return path.split('.').reduce((p, c) => (p && p[c] !== undefined) ? p[c] : 0, obj);
};

export function SearchQueryPerformanceView() {
    const [filterOptions, setFilterOptions] = useState<PerformanceFilterOptions>({ asins: [], weeks: [] });
    const [selectedAsin, setSelectedAsin] = useState('');
    const [selectedWeek, setSelectedWeek] = useState('');
    const [performanceData, setPerformanceData] = useState<QueryPerformanceData[]>([]);
    const [productDetails, setProductDetails] = useState<ProductDetails | null>(null);
    const [loading, setLoading] = useState({ filters: true, data: false });
    const [error, setError] = useState<string | null>(null);
    const [hasApplied, setHasApplied] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>({ key: 'searchQueryVolume', direction: 'descending' });
    const [chartConfig, setChartConfig] = useState<AppChartConfig | null>(null);

    useEffect(() => {
        const fetchFilters = async () => {
            try {
                const response = await fetch('/api/query-performance-filters');
                if (!response.ok) throw new Error('Failed to fetch filter options');
                const data: PerformanceFilterOptions = await response.json();
                setFilterOptions(data);
                if (data.asins.length > 0) setSelectedAsin(data.asins[0]);
                if (data.weeks.length > 0) setSelectedWeek(data.weeks[0].value);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            } finally {
                setLoading(prev => ({ ...prev, filters: false }));
            }
        };
        fetchFilters();
    }, []);

    const handleApplyFilters = useCallback(async () => {
        if (!selectedAsin || !selectedWeek) return;
        setLoading(prev => ({ ...prev, data: true }));
        setError(null);
        setHasApplied(true);
        setPerformanceData([]);
        setProductDetails(null);

        const weekOption = filterOptions.weeks.find(w => w.value === selectedWeek);
        if (!weekOption) {
            setError("Invalid week selected.");
            setLoading(prev => ({ ...prev, data: false }));
            return;
        }

        const endDate = new Date(selectedWeek);
        endDate.setDate(endDate.getDate() + 6);
        const endDateStr = endDate.toISOString().split('T')[0];

        try {
            const performancePromise = fetch(`/api/query-performance?asin=${selectedAsin}&startDate=${selectedWeek}&endDate=${endDateStr}`);
            const productPromise = fetch(`/api/product-details?asins=${selectedAsin}`);

            const [performanceResponse, productResponse] = await Promise.all([performancePromise, productPromise]);

            if (!performanceResponse.ok) throw new Error('Failed to fetch performance data.');
            const performanceDataResult: QueryPerformanceData[] = await performanceResponse.json();
            setPerformanceData(performanceDataResult);

            if (productResponse.ok) {
                const productDataResult: ProductDetails[] = await productResponse.json();
                if (productDataResult.length > 0) setProductDetails(productDataResult[0]);
            } else {
                console.warn('Could not fetch product details.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred while fetching data.');
        } finally {
            setLoading(prev => ({ ...prev, data: false }));
        }
    }, [selectedAsin, selectedWeek, filterOptions.weeks]);
    
    const sortedData = useMemo(() => {
        let sortableItems = [...performanceData];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = getNestedValue(a, sortConfig.key);
                const bValue = getNestedValue(b, sortConfig.key);
                if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [performanceData, sortConfig]);

    const requestSort = (key: SortableKeys) => {
        let direction: 'ascending' | 'descending' = 'descending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'descending') {
            direction = 'ascending';
        }
        setSortConfig({ key, direction });
    };

    const handleCellClick = (searchQuery: string, metricId: string, metricLabel: string, metricFormat: 'number' | 'percent' | 'price') => {
        setChartConfig({
            type: 'performance',
            asin: selectedAsin,
            searchQuery,
            metricId,
            metricLabel,
            metricFormat,
        });
    };

    const renderHeader = (id: SortableKeys, label: string) => {
        const isSorted = sortConfig?.key === id;
        const directionIcon = sortConfig?.direction === 'descending' ? '▼' : '▲';
        return (
            <th style={styles.th} onClick={() => requestSort(id)}>
                {label} {isSorted && directionIcon}
            </th>
        );
    };

    const renderClickableCell = (
        value: number | undefined | null,
        searchQuery: string,
        metricId: string,
        metricLabel: string,
        metricFormat: 'number' | 'percent' | 'price',
        formatter: (val: number) => string
    ) => (
        <td
            style={{ ...styles.td, ...styles.clickableCell }}
            onClick={() => handleCellClick(searchQuery, metricId, metricLabel, metricFormat)}
        >
            {formatter(value ?? 0)}
        </td>
    );

    return (
        <div style={styles.viewContainer}>
            {chartConfig && <ChartModal config={chartConfig} dateRange={{start: selectedWeek, end: selectedWeek}} onClose={() => setChartConfig(null)} />}
            
            <header style={styles.header}>
                <h1 style={styles.title}>Search Query Performance</h1>
                <p style={styles.subtitle}>Analyze customer search behavior and its impact on your products.</p>
            </header>

            <div style={styles.controlsContainer}>
                <div style={styles.controlGroup}>
                    <label style={styles.label} htmlFor="asin-select">ASIN</label>
                    <select id="asin-select" style={styles.select} value={selectedAsin} onChange={e => setSelectedAsin(e.target.value)} disabled={loading.filters}>
                        {loading.filters ? <option>Loading ASINs...</option> : filterOptions.asins.map(asin => <option key={asin} value={asin}>{asin}</option>)}
                    </select>
                </div>
                <div style={styles.controlGroup}>
                    <label style={styles.label} htmlFor="week-select">Week</label>
                    <select id="week-select" style={styles.select} value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)} disabled={loading.filters}>
                        {loading.filters ? <option>Loading weeks...</option> : filterOptions.weeks.map(week => <option key={week.value} value={week.value}>{week.label}</option>)}
                    </select>
                </div>
                <button style={styles.primaryButton} onClick={handleApplyFilters} disabled={loading.filters || loading.data}>
                    {loading.data ? 'Loading...' : 'Apply Filters'}
                </button>
            </div>
            
            {error && <div style={styles.error}>{error}</div>}

            {productDetails && !loading.data && (
                 <div style={styles.productDetailsContainer}>
                    <img src={productDetails.imageUrl} alt={productDetails.title} style={styles.productImage} />
                    <div style={styles.productInfo}>
                        <h2 style={styles.productTitle}>{productDetails.title}</h2>
                        <p style={styles.productPrice}>{productDetails.price}</p>
                    </div>
                </div>
            )}
            
            <div style={styles.tableContainer}>
                {loading.data ? <div style={styles.message}>Loading performance data...</div> :
                 !hasApplied ? <div style={styles.message}>Select filters and click "Apply" to view data.</div> :
                 sortedData.length === 0 ? <div style={styles.message}>No data found for the selected ASIN and week.</div> : (
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                {renderHeader('searchQuery', 'Search Query')}
                                {renderHeader('searchQueryVolume', 'Search Volume')}
                                {renderHeader('impressions.asinShare', 'Impression Share')}
                                {renderHeader('clicks.clickRate', 'Click Rate')}
                                {renderHeader('clicks.asinShare', 'Click Share')}
                                {renderHeader('cartAdds.cartAddRate', 'Add to Cart Rate')}
                                {renderHeader('cartAdds.asinShare', 'Add to Cart Share')}
                                {renderHeader('purchases.purchaseRate', 'Purchase Rate')}
                                {renderHeader('purchases.asinShare', 'Purchase Share')}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedData.map(item => (
                                <tr key={item.searchQuery}>
                                    <td style={styles.td}>
                                        {item.searchQuery}
                                        {item.hasSPData && <span style={styles.spBadge}>SP</span>}
                                    </td>
                                    {renderClickableCell(item.searchQueryVolume, item.searchQuery, 'searchQueryVolume', 'Search Volume', 'number', formatNumber)}
                                    {renderClickableCell(item.impressions.asinShare, item.searchQuery, 'impressions.asinShare', 'Impression Share', 'percent', formatPercent)}
                                    {renderClickableCell(item.clicks.clickRate, item.searchQuery, 'clicks.clickRate', 'Click Rate', 'percent', formatPercent)}
                                    {renderClickableCell(item.clicks.asinShare, item.searchQuery, 'clicks.asinShare', 'Click Share', 'percent', formatPercent)}
                                    {renderClickableCell(item.cartAdds.cartAddRate, item.searchQuery, 'cartAdds.cartAddRate', 'Add to Cart Rate', 'percent', formatPercent)}
                                    {renderClickableCell(item.cartAdds.asinShare, item.searchQuery, 'cartAdds.asinShare', 'Add to Cart Share', 'percent', formatPercent)}
                                    {renderClickableCell(item.purchases.purchaseRate, item.searchQuery, 'purchases.purchaseRate', 'Purchase Rate', 'percent', formatPercent)}
                                    {renderClickableCell(item.purchases.asinShare, item.searchQuery, 'purchases.asinShare', 'Purchase Share', 'percent', formatPercent)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
