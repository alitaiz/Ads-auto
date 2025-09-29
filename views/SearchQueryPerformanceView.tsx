// views/SearchQueryPerformanceView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    QueryPerformanceData,
    PerformanceFilterOptions,
    ProductDetails,
    AppChartConfig
} from '../types';
import { QueryPerformanceData, PerformanceFilterOptions, ProductDetails, PerformanceChartConfig } from '../types';
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
        flexWrap: 'wrap',
    },
    controlGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontSize: '0.9rem', fontWeight: 500 },
    select: { padding: '10px', borderRadius: '4px', border: '1px solid var(--border-color)', minWidth: '250px' },
    input: { padding: '10px', borderRadius: '4px', border: '1px solid var(--border-color)', minWidth: '250px' },
    primaryButton: { padding: '10px 20px', border: 'none', borderRadius: '4px', backgroundColor: 'var(--primary-color)', color: 'white', cursor: 'pointer' },
    productDetailsContainer: {
        display: 'flex', gap: '20px', alignItems: 'center',
        padding: '20px', backgroundColor: '#f8f9fa', borderRadius: 'var(--border-radius)',
        border: '1px solid var(--border-color)', marginBottom: '20px'
    },
    productImage: { width: '80px', height: '80px', objectFit: 'contain', borderRadius: '4px' },
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
    customizeButton: { marginLeft: 'auto', padding: '10px 15px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'white', cursor: 'pointer' },
    modalBackdrop: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1050 },
    modalContent: { backgroundColor: 'white', padding: '20px', borderRadius: '8px', width: '90%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' },
    modalHeader: { fontSize: '1.5rem', margin: '0 0 15px 0' },
    modalBody: { overflowY: 'auto', flex: 1, padding: '10px' },
    modalFooter: { paddingTop: '15px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '10px' },
    columnGroup: { marginBottom: '15px' },
    columnGroupTitle: { fontWeight: 'bold', borderBottom: '1px solid #eee', paddingBottom: '5px', marginBottom: '10px' },
    columnCheckbox: { display: 'block', marginBottom: '8px' },
};

type SortableKeys = keyof QueryPerformanceData | string;
const ProductDetailsCard = ({ details, loading }: { details: ProductDetails | null, loading: boolean }) => {
    if (loading) return <div style={styles.message}>Loading product details...</div>;
    if (!details) return null;
    if (details.error) return <div style={styles.error}>Could not load product details: {details.error}</div>;

interface ColumnConfig {
    id: string;
    label: string;
    defaultVisible: boolean;
    formatter: (val: any) => string;
    metricFormat?: 'number' | 'percent' | 'price';
}

const allColumns: ColumnConfig[] = [
    // --- Primary Columns (Default Visible) ---
    { id: 'searchQuery', label: 'Search Query', defaultVisible: true, formatter: (val) => String(val) },
    { id: 'searchQueryVolume', label: 'Search Volume', defaultVisible: true, formatter: formatNumber, metricFormat: 'number' },
    { id: 'impressions.asinShare', label: 'Impression Share', defaultVisible: true, formatter: formatPercent, metricFormat: 'percent' },
    { id: 'clicks.clickRate', label: 'Click Rate', defaultVisible: true, formatter: formatPercent, metricFormat: 'percent' },
    { id: 'clicks.asinShare', label: 'Click Share', defaultVisible: true, formatter: formatPercent, metricFormat: 'percent' },
    { id: 'cartAdds.cartAddRate', label: 'Add to Cart Rate', defaultVisible: true, formatter: formatPercent, metricFormat: 'percent' },
    { id: 'cartAdds.asinShare', label: 'Add to Cart Share', defaultVisible: true, formatter: formatPercent, metricFormat: 'percent' },
    { id: 'purchases.purchaseRate', label: 'Purchase Rate', defaultVisible: true, formatter: formatPercent, metricFormat: 'percent' },
    { id: 'purchases.asinShare', label: 'Purchase Share', defaultVisible: true, formatter: formatPercent, metricFormat: 'percent' },
    
    // --- General ---
    { id: 'searchQueryScore', label: 'Search Query Score', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },
    
    // --- Impressions ---
    { id: 'impressions.totalCount', label: 'Total Impressions', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },
    { id: 'impressions.asinCount', label: 'ASIN Impressions', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },

    // --- Clicks ---
    { id: 'clicks.totalCount', label: 'Total Clicks', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },
    { id: 'clicks.asinCount', label: 'ASIN Clicks', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },
    { id: 'clicks.totalMedianPrice', label: 'Total Median Click Price', defaultVisible: false, formatter: (val) => String(val ?? 'N/A'), metricFormat: 'price' },
    { id: 'clicks.asinMedianPrice', label: 'ASIN Median Click Price', defaultVisible: false, formatter: (val) => String(val ?? 'N/A'), metricFormat: 'price' },

    // --- Cart Adds ---
    { id: 'cartAdds.totalCount', label: 'Total Cart Adds', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },
    { id: 'cartAdds.asinCount', label: 'ASIN Cart Adds', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },
    { id: 'cartAdds.totalMedianPrice', label: 'Total Median Cart Add Price', defaultVisible: false, formatter: (val) => String(val ?? 'N/A'), metricFormat: 'price' },
    { id: 'cartAdds.asinMedianPrice', label: 'ASIN Median Cart Add Price', defaultVisible: false, formatter: (val) => String(val ?? 'N/A'), metricFormat: 'price' },

    // --- Purchases ---
    { id: 'purchases.totalCount', label: 'Total Purchases', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },
    { id: 'purchases.asinCount', label: 'ASIN Purchases', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },
    { id: 'purchases.totalMedianPrice', label: 'Total Median Purchase Price', defaultVisible: false, formatter: (val) => String(val ?? 'N/A'), metricFormat: 'price' },
    { id: 'purchases.asinMedianPrice', label: 'ASIN Median Purchase Price', defaultVisible: false, formatter: (val) => String(val ?? 'N/A'), metricFormat: 'price' },

    // --- Shipping Speed (Clicks) ---
    { id: 'clicks.sameDayShippingCount', label: 'Same-Day Shipping Clicks', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },
    { id: 'clicks.oneDayShippingCount', label: '1-Day Shipping Clicks', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },
    { id: 'clicks.twoDayShippingCount', label: '2-Day Shipping Clicks', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },

    // --- Shipping Speed (Cart Adds) ---
    { id: 'cartAdds.sameDayShippingCount', label: 'Same-Day Shipping Cart Adds', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },
    { id: 'cartAdds.oneDayShippingCount', label: '1-Day Shipping Cart Adds', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },
    { id: 'cartAdds.twoDayShippingCount', label: '2-Day Shipping Cart Adds', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },
    
    // --- Shipping Speed (Purchases) ---
    { id: 'purchases.sameDayShippingCount', label: 'Same-Day Shipping Purchases', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },
    { id: 'purchases.oneDayShippingCount', label: '1-Day Shipping Purchases', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },
    { id: 'purchases.twoDayShippingCount', label: '2-Day Shipping Purchases', defaultVisible: false, formatter: formatNumber, metricFormat: 'number' },
];

const getNestedValue = (obj: any, path: string) => {
    return path.split('.').reduce((p, c) => (p && p[c] !== undefined) ? p[c] : 0, obj);
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
    const [filterOptions, setFilterOptions] = useState<PerformanceFilterOptions>({ asins: [], weeks: [] });
    const [selectedAsin, setSelectedAsin] = useState('');
    const [selectedWeek, setSelectedWeek] = useState('');
    const [performanceData, setPerformanceData] = useState<QueryPerformanceData[]>([]);
    const [filters, setFilters] = useState<PerformanceFilterOptions>({ asins: [], weeks: [] });
    const [selectedAsin, setSelectedAsin] = useState<string>('');
    const [selectedWeek, setSelectedWeek] = useState<string>('');

    const [data, setData] = useState<QueryPerformanceData[]>([]);
const [productDetails, setProductDetails] = useState<ProductDetails | null>(null);
    const [loading, setLoading] = useState({ filters: true, data: false });
    const [loading, setLoading] = useState({ filters: true, data: false, product: false });
const [error, setError] = useState<string | null>(null);
const [hasApplied, setHasApplied] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>({ key: 'searchQueryVolume', direction: 'descending' });
    const [chartConfig, setChartConfig] = useState<AppChartConfig | null>(null);
    const [isCustomizeModalOpen, setCustomizeModalOpen] = useState(false);
    
    const [visibleColumns, setVisibleColumns] = useState<ColumnConfig[]>(
        allColumns.filter(c => c.defaultVisible)
    );

    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>({ key: 'searchQueryVolume', direction: 'descending' });
    const [chartConfig, setChartConfig] = useState<PerformanceChartConfig | null>(null);

useEffect(() => {
const fetchFilters = async () => {
            setLoading(prev => ({ ...prev, filters: true }));
try {
const response = await fetch('/api/query-performance-filters');
if (!response.ok) throw new Error('Failed to fetch filter options');
const data: PerformanceFilterOptions = await response.json();
                setFilterOptions(data);
                setFilters(data);
if (data.asins.length > 0) setSelectedAsin(data.asins[0]);
if (data.weeks.length > 0) setSelectedWeek(data.weeks[0].value);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            } catch (e) {
                setError(e instanceof Error ? e.message : 'An unknown error occurred.');
} finally {
setLoading(prev => ({ ...prev, filters: false }));
}
};
fetchFilters();
}, []);

    const handleApplyFilters = useCallback(async () => {
    const fetchData = useCallback(async () => {
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
            const performancePromise = fetch(`/api/query-performance?asin=${selectedAsin}&startDate=${selectedWeek}&endDate=${endDateStr}`);
            const productPromise = fetch(`/api/product-details?asins=${selectedAsin}`);

            const [performanceResponse, productResponse] = await Promise.all([performancePromise, productPromise]);
            const [dataResponse, productResponse] = await Promise.all([dataPromise, productPromise]);

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
    }, [selectedAsin, selectedWeek, filterOptions.weeks]);
    }, [selectedAsin, selectedWeek, filters.weeks]);

    const requestSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'descending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'descending') {
            direction = 'ascending';
        }
        setSortConfig({ key, direction });
    };

const sortedData = useMemo(() => {
        let sortableItems = [...performanceData];
        let sortableItems = [...data];
if (sortConfig !== null) {
sortableItems.sort((a, b) => {
                const aValue = getNestedValue(a, sortConfig.key);
                const bValue = getNestedValue(b, sortConfig.key);
                const aValue = getNested(a, sortConfig.key) ?? 0;
                const bValue = getNested(b, sortConfig.key) ?? 0;

if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
return 0;
});
}
return sortableItems;
    }, [performanceData, sortConfig]);
    }, [data, sortConfig]);

    const requestSort = (key: SortableKeys) => {
        let direction: 'ascending' | 'descending' = 'descending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'descending') {
            direction = 'ascending';
        }
        setSortConfig({ key, direction });
    };

    const handleCellClick = (searchQuery: string, col: ColumnConfig) => {
        if (!col.metricFormat) return; // Don't open chart for non-metric columns
        setChartConfig({
            type: 'performance',
            asin: selectedAsin,
            searchQuery,
            metricId: col.id,
            metricLabel: col.label,
            metricFormat: col.metricFormat,
        });
    };

    const renderHeader = (col: ColumnConfig) => {
        const isSorted = sortConfig?.key === col.id;
        const directionIcon = sortConfig?.direction === 'descending' ? '▼' : '▲';
        return (
            <th style={styles.th} onClick={() => requestSort(col.id)}>
                {col.label} {isSorted && directionIcon}
            </th>
        );
    };

    const renderClickableCell = (item: QueryPerformanceData, col: ColumnConfig) => {
        const value = getNestedValue(item, col.id);
        const canBeClicked = !!col.metricFormat;
        return (
            <td
                style={{ ...styles.td, ...(canBeClicked && styles.clickableCell) }}
                onClick={() => canBeClicked && handleCellClick(item.searchQuery, col)}
            >
                {col.formatter(value)}
            </td>
        );
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

    const handleSaveCustomization = (newVisibleIds: Set<string>) => {
        const newVisibleColumns = allColumns.filter(c => newVisibleIds.has(c.id));
        setVisibleColumns(newVisibleColumns);
        setCustomizeModalOpen(false);
    };
    const getNested = (obj: any, path: string) => path.split('.').reduce((p, c) => (p && p[c] !== undefined) ? p[c] : null, obj);

return (
<div style={styles.viewContainer}>
            {chartConfig && <ChartModal config={chartConfig} dateRange={{start: selectedWeek, end: selectedWeek}} onClose={() => setChartConfig(null)} />}
            {isCustomizeModalOpen && <CustomizeColumnsModal allColumns={allColumns} visibleColumnIds={new Set(visibleColumns.map(c => c.id))} onSave={handleSaveCustomization} onClose={() => setCustomizeModalOpen(false)} />}
            
            {chartConfig && <ChartModal config={chartConfig} dateRange={chartDateRange} onClose={() => setChartConfig(null)} />}
<header style={styles.header}>
<h1 style={styles.title}>Search Query Performance</h1>
                <p style={styles.subtitle}>Analyze customer search behavior and its impact on your products.</p>
                <p style={styles.subtitle}>Analyze customer search query behavior and its impact on your ASINs.</p>
</header>

            <div style={styles.controlsContainer}>
                <div style={styles.controlGroup}>
            <div style={styles.card}>
                <div style={styles.filterGroup}>
<label style={styles.label} htmlFor="asin-select">ASIN</label>
                    <input list="asin-options" id="asin-select" style={styles.input} value={selectedAsin} onChange={e => setSelectedAsin(e.target.value)} disabled={loading.filters} placeholder="Select or type an ASIN" />
                    <datalist id="asin-options">
                        {filterOptions.asins.map(asin => <option key={asin} value={asin} />)}
                    </datalist>
                    <select id="asin-select" style={styles.select} value={selectedAsin} onChange={e => setSelectedAsin(e.target.value)} disabled={loading.filters}>
                        {filters.asins.map(asin => <option key={asin} value={asin}>{asin}</option>)}
                    </select>
</div>
                <div style={styles.controlGroup}>
                <div style={styles.filterGroup}>
<label style={styles.label} htmlFor="week-select">Week</label>
<select id="week-select" style={styles.select} value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)} disabled={loading.filters}>
                        {loading.filters ? <option>Loading weeks...</option> : filterOptions.weeks.map(week => <option key={week.value} value={week.value}>{week.label}</option>)}
                        {filters.weeks.map(week => <option key={week.value} value={week.value}>{week.label}</option>)}
</select>
</div>
                <button style={styles.primaryButton} onClick={handleApplyFilters} disabled={loading.filters || loading.data}>
                    {loading.data ? 'Loading...' : 'Apply'}
                <button onClick={fetchData} style={styles.primaryButton} disabled={loading.data || loading.product}>
                    {loading.data || loading.product ? 'Loading...' : 'Apply'}
</button>
                <button style={styles.customizeButton} onClick={() => setCustomizeModalOpen(true)}>Customize Columns</button>
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
            
            <ProductDetailsCard details={productDetails} loading={loading.product} />

<div style={styles.tableContainer}>
                {loading.data ? <div style={styles.message}>Loading performance data...</div> :
                 !hasApplied ? <div style={styles.message}>Select filters and click "Apply" to view data.</div> :
                 sortedData.length === 0 ? <div style={styles.message}>No data found for the selected ASIN and week.</div> : (
                {loading.data ? <div style={styles.message}>Loading data...</div> :
                 !hasApplied ? <div style={styles.message}>Select filters and click "Apply" to see data.</div> :
                 sortedData.length === 0 ? <div style={styles.message}>No data found for the selected criteria.</div> :
                 (
<table style={styles.table}>
<thead>
<tr>
                                {visibleColumns.map(col => renderHeader(col))}
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
                            {sortedData.map(item => (
                                <tr key={item.searchQuery}>
                                    {visibleColumns.map(col => {
                                        if (col.id === 'searchQuery') {
                                            return (
                                                <td key={col.id} style={styles.td}>
                                                    {item.searchQuery}
                                                    {item.hasSPData && <span style={styles.spBadge}>SP</span>}
                                                </td>
                                            );
                                        }
                                        return renderClickableCell(item, col);
                                    })}
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
                 )}
</div>
</div>
);
}

const CustomizeColumnsModal = ({ allColumns, visibleColumnIds, onSave, onClose }: { allColumns: ColumnConfig[], visibleColumnIds: Set<string>, onSave: (newVisible: Set<string>) => void, onClose: () => void }) => {
    const [selected, setSelected] = useState(visibleColumnIds);

    const handleToggle = (id: string) => {
        setSelected(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };
    
    const groups = {
        'General': ['searchQuery', 'searchQueryVolume', 'searchQueryScore'],
        'Impressions': ['impressions.asinShare', 'impressions.totalCount', 'impressions.asinCount'],
        'Clicks': ['clicks.clickRate', 'clicks.asinShare', 'clicks.totalCount', 'clicks.asinCount', 'clicks.totalMedianPrice', 'clicks.asinMedianPrice'],
        'Cart Adds': ['cartAdds.cartAddRate', 'cartAdds.asinShare', 'cartAdds.totalCount', 'cartAdds.asinCount', 'cartAdds.totalMedianPrice', 'cartAdds.asinMedianPrice'],
        'Purchases': ['purchases.purchaseRate', 'purchases.asinShare', 'purchases.totalCount', 'purchases.asinCount', 'purchases.totalMedianPrice', 'purchases.asinMedianPrice'],
        'Shipping Speed (Clicks)': ['clicks.sameDayShippingCount', 'clicks.oneDayShippingCount', 'clicks.twoDayShippingCount'],
        'Shipping Speed (Cart Adds)': ['cartAdds.sameDayShippingCount', 'cartAdds.oneDayShippingCount', 'cartAdds.twoDayShippingCount'],
        'Shipping Speed (Purchases)': ['purchases.sameDayShippingCount', 'purchases.oneDayShippingCount', 'purchases.twoDayShippingCount']
    };

    return (
        <div style={styles.modalBackdrop}>
            <div style={styles.modalContent}>
                <h2 style={styles.modalHeader}>Customize Columns</h2>
                <div style={styles.modalBody}>
                    {Object.entries(groups).map(([groupName, ids]) => (
                        <div key={groupName} style={styles.columnGroup}>
                            <h3 style={styles.columnGroupTitle}>{groupName}</h3>
                            {allColumns
                                .filter(c => ids.includes(c.id))
                                .map(col => (
                                    <label key={col.id} style={styles.columnCheckbox}>
                                        <input
                                            type="checkbox"
                                            checked={selected.has(col.id)}
                                            onChange={() => handleToggle(col.id)}
                                            disabled={col.id === 'searchQuery'}
                                        />
                                        <span style={{ marginLeft: '8px' }}>{col.label}</span>
                                    </label>
                            ))}
                        </div>
                    ))}
                </div>
                <div style={styles.modalFooter}>
                    <button onClick={onClose} style={{...styles.primaryButton, backgroundColor: '#6c757d'}}>Cancel</button>
                    <button onClick={() => onSave(selected)} style={styles.primaryButton}>Save</button>
                </div>
            </div>
        </div>
    );
};