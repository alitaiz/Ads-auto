// views/SearchQueryPerformanceView.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { QueryPerformanceData, PerformanceFilterOptions, ProductDetails, PerformanceChartConfig } from '../types';
import { formatNumber, formatPercent, getNested } from '../utils';
import { ChartModal } from './components/ChartModal';

const styles: { [key: string]: React.CSSProperties } = {
    viewContainer: { padding: '20px', maxWidth: '100%', margin: '0 auto', },
    header: { marginBottom: '20px', },
    title: { fontSize: '2rem', margin: '0 0 5px 0', },
    subtitle: { fontSize: '1rem', color: '#666', margin: 0, },
    filterCard: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '15px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', },
    filterGroup: { display: 'flex', flexDirection: 'column', gap: '5px', },
    label: { fontSize: '0.8rem', fontWeight: 500, color: '#333', },
    input: { padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '1rem', minWidth: '200px', },
    select: { padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '1rem', minWidth: '300px', },
    primaryButton: { padding: '10px 20px', border: 'none', borderRadius: '4px', backgroundColor: 'var(--primary-color)', color: 'white', fontSize: '1rem', cursor: 'pointer', alignSelf: 'flex-end', },
    tableContainer: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', overflowX: 'auto', marginTop: '20px', },
    table: { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' },
    th: { position: 'relative', padding: '10px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', backgroundColor: '#f8f9fa', userSelect: 'none' },
    thContent: { display: 'flex', flexDirection: 'column', fontWeight: 600 },
    thTitle: { fontSize: '0.9rem', whiteSpace: 'nowrap' },
    thSub: { fontSize: '0.8rem', color: '#666', fontWeight: 500 },
    td: { padding: '10px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.9rem' },
    metricCell: { cursor: 'pointer', textDecoration: 'underline', color: 'var(--primary-color)' },
    message: { textAlign: 'center', padding: '50px', fontSize: '1.2rem', color: '#666', },
    error: { color: 'var(--danger-color)', padding: '20px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)', marginTop: '20px', },
    productCard: { display: 'flex', gap: '20px', alignItems: 'center', backgroundColor: 'var(--card-background-color)', padding: '20px', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', marginTop: '20px' },
    productImage: { width: '80px', height: '80px', objectFit: 'contain', borderRadius: '4px', border: '1px solid var(--border-color)' },
    productInfo: { display: 'flex', flexDirection: 'column', gap: '5px' },
    productTitle: { fontSize: '1.2rem', fontWeight: 600, margin: 0 },
    infoIcon: { cursor: 'help', marginLeft: '5px', color: '#999', fontSize: '0.8em' },
    resizer: { position: 'absolute', right: 0, top: 0, height: '100%', width: '5px', cursor: 'col-resize', zIndex: 1, },
    customizeButton: {
        marginLeft: 'auto',
        padding: '8px 12px',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        background: 'white',
        cursor: 'pointer'
    },
    customizeMenu: {
        position: 'absolute',
        right: 0,
        top: '100%',
        backgroundColor: 'white',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        boxShadow: 'var(--box-shadow)',
        padding: '10px',
        zIndex: 100,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '8px',
        width: '400px',
    },
    customizeItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    groupedHeader: {
        textAlign: 'center',
        padding: '8px',
        borderBottom: '2px solid var(--border-color)',
        borderLeft: '1px solid #e0e0e0',
        borderRight: '1px solid #e0e0e0',
        backgroundColor: '#f8f9fa',
        fontWeight: 600
    }
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
            </div>
        </div>
    );
};

const InfoTooltip = ({ text }: { text: string }) => <span title={text} style={styles.infoIcon}>ⓘ</span>;

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

    const [isCustomizeOpen, setCustomizeOpen] = useState(false);
    const customizeRef = useRef<HTMLDivElement>(null);
    
    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
        'searchQuery': true,
        'searchQueryVolume': true,
        'impressions.asinShare': true,
        'clicks.clickRate': true,
        'clicks.asinShare': true,
        'cartAdds.asinShare': true,
        'purchases.asinShare': true,
    });

    const ALL_COLUMNS = useMemo(() => ([
        { id: 'searchQuery', title: 'Search Query' },
        { id: 'searchQueryVolume', title: 'SQ Volume' },
        // Impressions
        { id: 'impressions.totalCount', title: 'Total Impressions' },
        { id: 'impressions.asinCount', title: 'ASIN Impressions' },
        { id: 'impressions.asinShare', title: 'Impression Share' },
        // Clicks
        { id: 'clicks.totalCount', title: 'Total Clicks' },
        { id: 'clicks.clickRate', title: 'Click Rate' },
        { id: 'clicks.asinCount', title: 'ASIN Clicks' },
        { id: 'clicks.asinShare', title: 'Click Share' },
        { id: 'clicks.totalMedianPrice', title: 'Median Click Price' },
        { id: 'clicks.asinMedianPrice', title: 'ASIN Median Click Price' },
        { id: 'clicks.sameDayShippingCount', title: 'Clicks (Same-Day)' },
        { id: 'clicks.oneDayShippingCount', title: 'Clicks (1-Day)' },
        { id: 'clicks.twoDayShippingCount', title: 'Clicks (2-Day)' },
        // Cart Adds
        { id: 'cartAdds.totalCount', title: 'Total Cart Adds' },
        { id: 'cartAdds.cartAddRate', title: 'Cart Add Rate' },
        { id: 'cartAdds.asinCount', title: 'ASIN Cart Adds' },
        { id: 'cartAdds.asinShare', title: 'Cart Add Share' },
        { id: 'cartAdds.totalMedianPrice', title: 'Median Cart Add Price' },
        { id: 'cartAdds.asinMedianPrice', title: 'ASIN Median Cart Add Price' },
        { id: 'cartAdds.sameDayShippingCount', title: 'Cart Adds (Same-Day)' },
        { id: 'cartAdds.oneDayShippingCount', title: 'Cart Adds (1-Day)' },
        { id: 'cartAdds.twoDayShippingCount', title: 'Cart Adds (2-Day)' },
        // Purchases
        { id: 'purchases.totalCount', title: 'Total Purchases' },
        { id: 'purchases.purchaseRate', title: 'Purchase Rate' },
        { id: 'purchases.asinCount', title: 'ASIN Purchases' },
        { id: 'purchases.asinShare', title: 'Purchase Share' },
        { id: 'purchases.totalMedianPrice', title: 'Median Purchase Price' },
        { id: 'purchases.asinMedianPrice', title: 'ASIN Median Purchase Price' },
        { id: 'purchases.sameDayShippingCount', title: 'Purchases (Same-Day)' },
        { id: 'purchases.oneDayShippingCount', title: 'Purchases (1-Day)' },
        { id: 'purchases.twoDayShippingCount', title: 'Purchases (2-Day)' },
        { id: 'hasSPData', title: 'Has SP Data' },
    ]), []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (customizeRef.current && !customizeRef.current.contains(event.target as Node)) {
                setCustomizeOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const fetchData = useCallback(async () => {
        if (!selectedAsin || !selectedWeek) return;

        setHasApplied(true);
        setLoading({ ...loading, data: true, product: true });
        setError(null);

        const weekInfo = filters.weeks.find(w => w.value === selectedWeek);
        if (!weekInfo) return;
        
        const endDate = new Date(selectedWeek + 'T00:00:00Z');
        endDate.setUTCDate(endDate.getUTCDate() + 6);
        const endDateStr = endDate.toISOString().split('T')[0];
        
        const dataPromise = fetch(`/api/query-performance?asin=${selectedAsin}&startDate=${selectedWeek}&endDate=${endDateStr}`);
        const productPromise = fetch(`/api/product-details?asins=${selectedAsin}`);

        try {
            const [dataResponse, productResponse] = await Promise.all([dataPromise, productPromise]);

            if (!dataResponse.ok) throw new Error((await dataResponse.json()).error || 'Failed to fetch performance data');
            const performanceData: QueryPerformanceData[] = await dataResponse.json();
            setData(performanceData);

            if (!productResponse.ok) throw new Error((await productResponse.json()).error || 'Failed to fetch product details');
            const productData: ProductDetails[] = await productResponse.json();
            setProductDetails(productData[0] || null);

        } catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred.');
        } finally {
            setLoading({ filters: false, data: false, product: false });
        }
    }, [selectedAsin, selectedWeek, filters.weeks]);
    
    useEffect(() => {
        // Auto-fetch data when initial filters are set
        if (selectedAsin && selectedWeek && !hasApplied) {
            fetchData();
        }
    }, [selectedAsin, selectedWeek, hasApplied, fetchData]);

    useEffect(() => {
        const fetchFilters = async () => {
            setLoading(prev => ({ ...prev, filters: true }));
            try {
                const response = await fetch('/api/query-performance-filters');
                if (!response.ok) throw new Error('Failed to fetch filter options');
                const data: PerformanceFilterOptions = await response.json();
                setFilters(data);
                if (data.asins.length > 0 && !selectedAsin) setSelectedAsin(data.asins[0]);
                if (data.weeks.length > 0 && !selectedWeek) setSelectedWeek(data.weeks[0].value);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'An unknown error occurred.');
            } finally {
                setLoading(prev => ({ ...prev, filters: false }));
            }
        };
        fetchFilters();
    }, []);

    const requestSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'descending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'descending') {
            direction = 'ascending';
        }
        setSortConfig({ key, direction });
    };

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
        end.setUTCDate(start.getUTCDate() + 6);
        return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
    }, [selectedWeek]);
    
    const tableRef = useRef<HTMLTableElement>(null);
    const resizingColumnIndex = useRef<number | null>(null);
    const startX = useRef(0);
    const startWidth = useRef(0);
    const columns = useMemo(() => {
        const initialColumns = [
            { id: 'searchQuery', title: 'Search Query', width: 250, info: "The search query a customer entered on Amazon.", group: null },
            { id: 'searchQueryVolume', title: 'Volume', subTitle: "Search Query", width: 120, info: "Total number of times this query was searched for during the reporting period.", group: null },
            // Impressions
            { id: 'impressions.totalCount', title: 'Total', subTitle: "Impressions", width: 120, info: "Total impressions for all products for this query.", group: "Impressions" },
            { id: 'impressions.asinCount', title: 'ASIN', subTitle: "Impressions", width: 120, info: "Your ASIN's impressions.", group: "Impressions" },
            { id: 'impressions.asinShare', title: 'Share', subTitle: "Impressions", width: 120, format: 'percent', info: "Your ASIN's share of total impressions.", group: "Impressions" },
            // Clicks
            { id: 'clicks.totalCount', title: 'Total', subTitle: "Clicks", width: 100, group: "Clicks" },
            { id: 'clicks.clickRate', title: 'Rate', subTitle: "Clicks", width: 100, format: 'percent', group: "Clicks" },
            { id: 'clicks.asinCount', title: 'ASIN', subTitle: "Clicks", width: 100, group: "Clicks" },
            { id: 'clicks.asinShare', title: 'Share', subTitle: "Clicks", width: 100, format: 'percent', group: "Clicks" },
            // Cart Adds
            { id: 'cartAdds.totalCount', title: 'Total', subTitle: "Cart Adds", width: 100, group: "Cart Adds" },
            { id: 'cartAdds.cartAddRate', title: 'Rate', subTitle: "Cart Adds", width: 100, format: 'percent', group: "Cart Adds" },
            { id: 'cartAdds.asinCount', title: 'ASIN', subTitle: "Cart Adds", width: 100, group: "Cart Adds" },
            { id: 'cartAdds.asinShare', title: 'Share', subTitle: "Cart Adds", width: 100, format: 'percent', group: "Cart Adds" },
            // Purchases
            { id: 'purchases.totalCount', title: 'Total', subTitle: "Purchases", width: 100, group: "Purchases" },
            { id: 'purchases.purchaseRate', title: 'Rate', subTitle: "Purchases", width: 100, format: 'percent', group: "Purchases" },
            { id: 'purchases.asinCount', title: 'ASIN', subTitle: "Purchases", width: 100, group: "Purchases" },
            { id: 'purchases.asinShare', title: 'Share', subTitle: "Purchases", width: 100, format: 'percent', group: "Purchases" },
        ];
        return initialColumns.filter(c => visibleColumns[c.id]);
    }, [visibleColumns]);

    const [columnWidths, setColumnWidths] = useState(columns.map(c => c.width));

    useEffect(() => { setColumnWidths(columns.map(c => c.width))}, [columns]);
    
    const handleMouseDown = useCallback((index: number, e: React.MouseEvent<HTMLDivElement>) => {
        resizingColumnIndex.current = index;
        startX.current = e.clientX;
        startWidth.current = columnWidths[index];
    }, [columnWidths]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (resizingColumnIndex.current === null) return;
        const deltaX = e.clientX - startX.current;
        const newWidth = Math.max(startWidth.current + deltaX, 80); // Min width
        setColumnWidths(prev => {
            const newWidths = [...prev];
            newWidths[resizingColumnIndex.current!] = newWidth;
            return newWidths;
        });
    }, []);

    const handleMouseUp = useCallback(() => { resizingColumnIndex.current = null; }, []);

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);
    
    const groupedHeaders = useMemo(() => {
        const groups: { [key: string]: { colspan: number, ids: string[] } } = {};
        columns.forEach(col => {
            if (col.group) {
                if (!groups[col.group]) {
                    groups[col.group] = { colspan: 0, ids: [] };
                }
                groups[col.group].colspan++;
                groups[col.group].ids.push(col.id);
            }
        });
        return groups;
    }, [columns]);

    const HeaderCell = ({ title, subTitle, info, sortKey }: { title: string, subTitle?: string, info?: string, sortKey: string }) => (
        <div style={styles.thContent} onClick={() => requestSort(sortKey)}>
            <span style={styles.thTitle}>{title} {info && <InfoTooltip text={info} />}</span>
            {subTitle && <span style={styles.thSub}>{subTitle}</span>}
        </div>
    );

    return (
        <div style={styles.viewContainer}>
            {chartConfig && <ChartModal config={chartConfig} dateRange={chartDateRange} onClose={() => setChartConfig(null)} />}
            <header style={styles.header}>
                <div>
                    <h1 style={styles.title}>Search Query Performance</h1>
                    <p style={styles.subtitle}>Analyze customer search query behavior and its impact on your ASINs.</p>
                </div>
            </header>
            <div style={styles.filterCard}>
                <div style={styles.filterGroup}>
                    <label style={styles.label} htmlFor="asin-input">ASIN</label>
                    <input
                        id="asin-input"
                        list="asin-datalist"
                        style={styles.input}
                        value={selectedAsin}
                        onChange={e => setSelectedAsin(e.target.value)}
                        disabled={loading.filters}
                        placeholder="Type or select an ASIN"
                    />
                    <datalist id="asin-datalist">
                        {filters.asins.map(asin => <option key={asin} value={asin} />)}
                    </datalist>
                </div>
                <div style={styles.filterGroup}>
                    <label style={styles.label} htmlFor="week-select">Reporting Week</label>
                    <select id="week-select" style={styles.select} value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)} disabled={loading.filters}>
                        {filters.weeks.map(week => <option key={week.value} value={week.value}>{week.label}</option>)}
                    </select>
                </div>
                <button onClick={fetchData} style={styles.primaryButton} disabled={loading.data || loading.product}>
                    {loading.data || loading.product ? 'Loading...' : 'Apply Filters'}
                </button>
                 <div ref={customizeRef} style={{ position: 'relative', marginLeft: 'auto' }}>
                    <button onClick={() => setCustomizeOpen(o => !o)} style={styles.customizeButton}>Customize Columns</button>
                    {isCustomizeOpen && (
                        <div style={styles.customizeMenu}>
                            {ALL_COLUMNS.map(col => (
                                <label key={col.id} style={styles.customizeItem}>
                                    <input
                                        type="checkbox"
                                        checked={!!visibleColumns[col.id]}
                                        onChange={() => {
                                            setVisibleColumns(prev => ({ ...prev, [col.id]: !prev[col.id] }));
                                        }}
                                    />
                                    {col.title}
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {error && <div style={styles.error}>{error}</div>}

            <ProductDetailsCard details={productDetails} loading={loading.product} />

            <div style={styles.tableContainer}>
                {loading.data ? <div style={styles.message}>Loading data...</div> :
                 !hasApplied ? <div style={styles.message}>Select filters and click "Apply" to see data.</div> :
                 sortedData.length === 0 ? <div style={styles.message}>No data found for the selected criteria.</div> :
                 (
                    <table style={styles.table} ref={tableRef}>
                        <colgroup>
                            {columnWidths.map((width, i) => <col key={i} style={{width: `${width}px`}} />)}
                        </colgroup>
                         <thead>
                            <tr>
                                {Object.keys(groupedHeaders).map(groupName => {
                                    const { colspan, ids } = groupedHeaders[groupName];
                                    const firstColIndex = columns.findIndex(c => c.id === ids[0]);
                                    if (firstColIndex === -1) return null;
                                    const firstCol = columns[firstColIndex];
                                    if (firstCol.group) {
                                         return <th key={groupName} colSpan={colspan} style={styles.groupedHeader}>{groupName}</th>;
                                    }
                                    return null;
                                })}
                            </tr>
                            <tr>
                                {columns.map((col, i) => (
                                    <th key={col.id} style={styles.th}>
                                        <HeaderCell title={col.title} subTitle={col.subTitle} info={col.info} sortKey={col.id} />
                                        <div style={styles.resizer} onMouseDown={(e) => handleMouseDown(i, e)} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedData.map(row => (
                                <tr key={row.searchQuery}>
                                    {columns.map(col => {
                                        const value = getNested(row, col.id);
                                        const formatFunc = col.format === 'percent' ? formatPercent : formatNumber;
                                        const isMetric = col.format === 'percent' || col.id.endsWith('Count') || col.id.endsWith('Volume');

                                        return (
                                            <td key={col.id} style={styles.td} title={String(value)}>
                                                {col.id === 'searchQuery' ? <a href={`https://www.amazon.com/s?k=${encodeURIComponent(row.searchQuery)}`} target="_blank" rel="noopener noreferrer">{row.searchQuery}</a> :
                                                 col.id === 'hasSPData' ? (value ? '✔️' : '❌') :
                                                 isMetric ? <span style={styles.metricCell} onClick={() => handleMetricClick(row, col.id, `${col.title} (${col.subTitle})`, col.format === 'percent' ? 'percent' : 'number')}>{formatFunc(value)}</span> :
                                                 <span>{value}</span>}
                                            </td>
                                        );
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