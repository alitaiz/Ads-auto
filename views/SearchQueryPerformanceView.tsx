// views/SearchQueryPerformanceView.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
    th: { padding: '12px 15px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', backgroundColor: '#f8f9fa', fontWeight: 600, userSelect: 'none', position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    td: { padding: '12px 15px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    clickableCell: { cursor: 'pointer', textDecoration: 'underline', color: 'var(--primary-color)' },
    message: { textAlign: 'center', padding: '50px', fontSize: '1.2rem', color: '#666' },
    error: { color: 'var(--danger-color)', padding: '20px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)', marginTop: '20px' },
    spBadge: { backgroundColor: '#28a745', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', marginLeft: '8px' },
    customizeButton: { marginLeft: 'auto', padding: '10px 15px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'white', cursor: 'pointer' },
    modalBackdrop: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1050 },
    modalContent: { backgroundColor: 'white', padding: '20px', borderRadius: '8px', width: '90%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' },
    modalHeader: { fontSize: '1.5rem', margin: '0 0 15px 0' },
    modalBody: { overflowY: 'auto', flex: 1, padding: '10px' },
    modalFooter: { paddingTop: '15px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: '10px' },
    columnGroup: { marginBottom: '15px' },
    columnGroupTitle: { fontWeight: 'bold', borderBottom: '1px solid #eee', paddingBottom: '5px', marginBottom: '10px' },
    columnCheckbox: { display: 'block', marginBottom: '8px' },
};

type SortableKeys = keyof QueryPerformanceData | string;

interface ColumnConfig {
    id: string;
    label: string;
    defaultVisible: boolean;
    formatter: (val: any) => string;
    metricFormat?: 'number' | 'percent' | 'price';
    defaultWidth: number;
}

const allColumns: ColumnConfig[] = [
    // --- Default Visible Columns (as per user request) ---
    { id: 'searchQuery', label: 'Search Query', defaultVisible: true, formatter: (val) => String(val), defaultWidth: 300 },
    { id: 'searchQueryScore', label: 'Search Query Score', defaultVisible: true, formatter: formatNumber, metricFormat: 'number', defaultWidth: 160 },
    { id: 'searchQueryVolume', label: 'Search Query Volume', defaultVisible: true, formatter: formatNumber, metricFormat: 'number', defaultWidth: 140 },
    
    // Search Funnel - Impressions
    { id: 'impressions.totalCount', label: 'Total Impressions', defaultVisible: true, formatter: formatNumber, metricFormat: 'number', defaultWidth: 150 },
    { id: 'impressions.asinCount', label: 'ASIN Impressions', defaultVisible: true, formatter: formatNumber, metricFormat: 'number', defaultWidth: 150 },
    { id: 'impressions.asinShare', label: 'Impression Share', defaultVisible: true, formatter: formatPercent, metricFormat: 'percent', defaultWidth: 150 },
    
    // Search Funnel - Clicks
    { id: 'clicks.totalCount', label: 'Total Clicks', defaultVisible: true, formatter: formatNumber, metricFormat: 'number', defaultWidth: 120 },
    { id: 'clicks.clickRate', label: 'Click Rate', defaultVisible: true, formatter: formatPercent, metricFormat: 'percent', defaultWidth: 120 },
    { id: 'clicks.asinCount', label: 'ASIN Clicks', defaultVisible: true, formatter: formatNumber, metricFormat: 'number', defaultWidth: 120 },
    { id: 'clicks.asinShare', label: 'Click Share', defaultVisible: true, formatter: formatPercent, metricFormat: 'percent', defaultWidth: 120 },
    
    // Search Funnel - Cart Adds
    { id: 'cartAdds.totalCount', label: 'Total Cart Adds', defaultVisible: true, formatter: formatNumber, metricFormat: 'number', defaultWidth: 140 },
    { id: 'cartAdds.cartAddRate', label: 'Add to Cart Rate', defaultVisible: true, formatter: formatPercent, metricFormat: 'percent', defaultWidth: 150 },
    { id: 'cartAdds.asinCount', label: 'ASIN Cart Adds', defaultVisible: true, formatter: formatNumber, metricFormat: 'number', defaultWidth: 140 },
    { id: 'cartAdds.asinShare', label: 'Add to Cart Share', defaultVisible: true, formatter: formatPercent, metricFormat: 'percent', defaultWidth: 150 },
    
    // Search Funnel - Purchases
    { id: 'purchases.totalCount', label: 'Total Purchases', defaultVisible: true, formatter: formatNumber, metricFormat: 'number', defaultWidth: 140 },
    { id: 'purchases.purchaseRate', label: 'Purchase Rate', defaultVisible: true, formatter: formatPercent, metricFormat: 'percent', defaultWidth: 140 },
    { id: 'purchases.asinCount', label: 'ASIN Purchases', defaultVisible: true, formatter: formatNumber, metricFormat: 'number', defaultWidth: 140 },
    { id: 'purchases.asinShare', label: 'Purchase Share', defaultVisible: true, formatter: formatPercent, metricFormat: 'percent', defaultWidth: 140 },

    // --- Other Hidden Columns ---
    { id: 'clicks.totalMedianPrice', label: 'Total Median Click Price', defaultVisible: false, formatter: (val) => String(val ?? 'N/A'), metricFormat: 'price', defaultWidth: 200 },
    { id: 'clicks.asinMedianPrice', label: 'ASIN Median Click Price', defaultVisible: false, formatter: (val) => String(val ?? 'N/A'), metricFormat: 'price', defaultWidth: 200 },
    { id: 'cartAdds.totalMedianPrice', label: 'Total Median Cart Add Price', defaultVisible: false, formatter: (val) => String(val ?? 'N/A'), metricFormat: 'price', defaultWidth: 220 },
    { id: 'cartAdds.asinMedianPrice', label: 'ASIN Median Cart Add Price', defaultVisible: false, formatter: (val) => String(val ?? 'N/A'), metricFormat: 'price', defaultWidth: 220 },
    { id: 'purchases.totalMedianPrice', label: 'Total Median Purchase Price', defaultVisible: false, formatter: (val) => String(val ?? 'N/A'), metricFormat: 'price', defaultWidth: 220 },
    { id: 'purchases.asinMedianPrice', label: 'ASIN Median Purchase Price', defaultVisible: false, formatter: (val) => String(val ?? 'N/A'), metricFormat: 'price', defaultWidth: 220 },
    { id: 'clicks.sameDayShippingCount', label: 'Same-Day Shipping Clicks', defaultVisible: false, formatter: formatNumber, metricFormat: 'number', defaultWidth: 200 },
    { id: 'clicks.oneDayShippingCount', label: '1-Day Shipping Clicks', defaultVisible: false, formatter: formatNumber, metricFormat: 'number', defaultWidth: 200 },
    { id: 'clicks.twoDayShippingCount', label: '2-Day Shipping Clicks', defaultVisible: false, formatter: formatNumber, metricFormat: 'number', defaultWidth: 200 },
    { id: 'cartAdds.sameDayShippingCount', label: 'Same-Day Shipping Cart Adds', defaultVisible: false, formatter: formatNumber, metricFormat: 'number', defaultWidth: 220 },
    { id: 'cartAdds.oneDayShippingCount', label: '1-Day Shipping Cart Adds', defaultVisible: false, formatter: formatNumber, metricFormat: 'number', defaultWidth: 220 },
    { id: 'cartAdds.twoDayShippingCount', label: '2-Day Shipping Cart Adds', defaultVisible: false, formatter: formatNumber, metricFormat: 'number', defaultWidth: 220 },
    { id: 'purchases.sameDayShippingCount', label: 'Same-Day Shipping Purchases', defaultVisible: false, formatter: formatNumber, metricFormat: 'number', defaultWidth: 220 },
    { id: 'purchases.oneDayShippingCount', label: '1-Day Shipping Purchases', defaultVisible: false, formatter: formatNumber, metricFormat: 'number', defaultWidth: 220 },
    { id: 'purchases.twoDayShippingCount', label: '2-Day Shipping Purchases', defaultVisible: false, formatter: formatNumber, metricFormat: 'number', defaultWidth: 220 },
];

const getNestedValue = (obj: any, path: string) => {
    return path.split('.').reduce((p, c) => (p && p[c] !== undefined) ? p[c] : 0, obj);
};

const resizerStyles: { [key: string]: React.CSSProperties } = {
  resizer: {
    position: 'absolute',
    right: 0,
    top: 0,
    height: '100%',
    width: '5px',
    cursor: 'col-resize',
    userSelect: 'none',
    touchAction: 'none',
  },
  resizing: {
    background: 'var(--primary-color)',
    opacity: 0.5,
  }
};

function useResizableColumns(initialWidths: number[]) {
    const [widths, setWidths] = useState(initialWidths);
    const [resizingColumnIndex, setResizingColumnIndex] = useState<number | null>(null);
    const currentColumnIndex = useRef<number | null>(null);
    const startX = useRef(0);
    const startWidth = useRef(0);

    useEffect(() => {
        setWidths(initialWidths);
    }, [initialWidths]);

    const handleMouseDown = useCallback((index: number, e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        currentColumnIndex.current = index;
        setResizingColumnIndex(index);
        startX.current = e.clientX;
        startWidth.current = widths[index];
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [widths]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (currentColumnIndex.current === null) return;
        
        const deltaX = e.clientX - startX.current;
        const newWidth = Math.max(startWidth.current + deltaX, 80); // Minimum width 80px

        setWidths(prevWidths => {
            const newWidths = [...prevWidths];
            newWidths[currentColumnIndex.current!] = newWidth;
            return newWidths;
        });
    }, []);

    const handleMouseUp = useCallback(() => {
        currentColumnIndex.current = null;
        setResizingColumnIndex(null);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    return { widths, getHeaderProps: handleMouseDown, resizingColumnIndex };
}

const ResizableTh = ({ children, index, getHeaderProps, resizingColumnIndex }: { children: React.ReactNode, index: number, getHeaderProps: (index: number, e: React.MouseEvent<HTMLDivElement>) => void, resizingColumnIndex: number | null }) => (
    <th style={styles.th}>
        {children}
        <div
            style={{...resizerStyles.resizer, ...(resizingColumnIndex === index ? resizerStyles.resizing : {})}}
            onMouseDown={(e) => getHeaderProps(index, e)}
        />
    </th>
);


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
    const [isCustomizeModalOpen, setCustomizeModalOpen] = useState(false);
    
    const [visibleColumns, setVisibleColumns] = useState<ColumnConfig[]>(
        allColumns.filter(c => c.defaultVisible)
    );

    const initialWidths = useMemo(() => {
        return visibleColumns.map(col => col.defaultWidth);
    }, [visibleColumns]);

    const { widths, getHeaderProps, resizingColumnIndex } = useResizableColumns(initialWidths);


    useEffect(() => {
        const fetchFilters = async () => {
            try {
                const response = await fetch('/api/query-performance-filters');
                if (!response.ok) throw new Error('Failed to fetch filter options');
                const data: PerformanceFilterOptions = await response.json();
                setFilterOptions(data);
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

    const renderClickableCell = (item: QueryPerformanceData, col: ColumnConfig) => {
        const value = getNestedValue(item, col.id);
        const canBeClicked = !!col.metricFormat;
        return (
            <td
                style={{ ...styles.td, ...(canBeClicked && styles.clickableCell) }}
                onClick={() => canBeClicked && handleCellClick(item.searchQuery, col)}
                title={String(value)}
            >
                {col.formatter(value)}
            </td>
        );
    };

    const handleSaveCustomization = (newVisibleIds: Set<string>) => {
        const newVisibleColumns = allColumns.filter(c => newVisibleIds.has(c.id));
        setVisibleColumns(newVisibleColumns);
        setCustomizeModalOpen(false);
    };

    const getChartDateRange = () => {
        if (!selectedWeek) return { start: '', end: '' };
        // Parse the date as UTC to avoid timezone issues.
        const endDate = new Date(selectedWeek + 'T00:00:00Z');
        const startDate = new Date(endDate);
        // Go back 51 weeks (for a total of 52 data points, i.e., one year) to provide a longer historical view.
        startDate.setUTCDate(endDate.getUTCDate() - (51 * 7));
        
        const formatDate = (d: Date) => d.toISOString().split('T')[0];

        return {
            start: formatDate(startDate),
            end: formatDate(endDate)
        };
    };

    return (
        <div style={styles.viewContainer}>
            {chartConfig && <ChartModal config={chartConfig} dateRange={getChartDateRange()} onClose={() => setChartConfig(null)} />}
            {isCustomizeModalOpen && <CustomizeColumnsModal allColumns={allColumns} visibleColumnIds={new Set(visibleColumns.map(c => c.id))} onSave={handleSaveCustomization} onClose={() => setCustomizeModalOpen(false)} />}
            
            <header style={styles.header}>
                <h1 style={styles.title}>Search Query Performance</h1>
                <p style={styles.subtitle}>Analyze customer search behavior and its impact on your products.</p>
            </header>

            <div style={styles.controlsContainer}>
                <div style={styles.controlGroup}>
                    <label style={styles.label} htmlFor="asin-select">ASIN</label>
                    <input list="asin-options" id="asin-select" style={styles.input} value={selectedAsin} onChange={e => setSelectedAsin(e.target.value)} disabled={loading.filters} placeholder="Select or type an ASIN" />
                    <datalist id="asin-options">
                        {filterOptions.asins.map(asin => <option key={asin} value={asin} />)}
                    </datalist>
                </div>
                <div style={styles.controlGroup}>
                    <label style={styles.label} htmlFor="week-select">Week</label>
                    <select id="week-select" style={styles.select} value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)} disabled={loading.filters}>
                        {loading.filters ? <option>Loading weeks...</option> : filterOptions.weeks.map(week => <option key={week.value} value={week.value}>{week.label}</option>)}
                    </select>
                </div>
                <button style={styles.primaryButton} onClick={handleApplyFilters} disabled={loading.filters || loading.data}>
                    {loading.data ? 'Loading...' : 'Apply'}
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
            
            <div style={styles.tableContainer}>
                {loading.data ? <div style={styles.message}>Loading performance data...</div> :
                 !hasApplied ? <div style={styles.message}>Select filters and click "Apply" to view data.</div> :
                 sortedData.length === 0 ? <div style={styles.message}>No data found for the selected ASIN and week.</div> : (
                    <table style={{...styles.table, tableLayout: 'fixed'}}>
                        <colgroup>
                            {widths.map((width, index) => (
                                <col key={index} style={{ width: `${width}px` }} />
                            ))}
                        </colgroup>
                        <thead>
                            <tr>
                                {visibleColumns.map((col, index) => {
                                    const isSorted = sortConfig?.key === col.id;
                                    const directionIcon = sortConfig?.direction === 'descending' ? '▼' : '▲';
                                    return (
                                        <ResizableTh key={col.id} index={index} getHeaderProps={getHeaderProps} resizingColumnIndex={resizingColumnIndex}>
                                            <div
                                                onClick={() => requestSort(col.id)}
                                                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                                            >
                                                {col.label}
                                                {isSorted && <span style={{ marginLeft: '5px' }}>{directionIcon}</span>}
                                            </div>
                                        </ResizableTh>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedData.map(item => (
                                <tr key={item.searchQuery}>
                                    {visibleColumns.map(col => {
                                        if (col.id === 'searchQuery') {
                                            return (
                                                <td key={col.id} style={styles.td} title={item.searchQuery}>
                                                    {item.searchQuery}
                                                    {item.hasSPData && <span style={styles.spBadge}>SP</span>}
                                                </td>
                                            );
                                        }
                                        return renderClickableCell(item, col);
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
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