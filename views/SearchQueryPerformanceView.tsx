// views/SearchQueryPerformanceView.tsx
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Title, Tooltip, Legend
} from 'chart.js';
import { AppChartConfig, PerformanceFilterOptions, QueryPerformanceData, ProductDetails } from '../types';
import { formatNumber, formatPercent, getNested } from '../utils';
import { ChartModal } from './components/ChartModal';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend
);

const styles: { [key: string]: React.CSSProperties } = {
    viewContainer: { padding: '20px', maxWidth: '100%', margin: '0 auto', },
    header: { marginBottom: '20px', },
    title: { fontSize: '2rem', margin: '0 0 5px 0' },
    subtitle: { fontSize: '1rem', color: '#666', margin: 0, maxWidth: '80ch' },
    card: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '15px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap', marginBottom: '20px' },
    filterGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontSize: '0.8rem', fontWeight: 500, color: '#333' },
    input: { padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '1rem' },
    select: { padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '1rem', minWidth: '200px' },
    primaryButton: { padding: '10px 20px', border: 'none', borderRadius: '4px', backgroundColor: 'var(--primary-color)', color: 'white', fontSize: '1rem', cursor: 'pointer', alignSelf: 'flex-end', height: '40px' },
    tableContainer: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', overflowX: 'auto' },
    table: { width: '100%', minWidth: '1800px', borderCollapse: 'collapse', tableLayout: 'fixed' },
    th: { position: 'relative', padding: '12px 10px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', backgroundColor: '#f8f9fa', fontWeight: 600, whiteSpace: 'nowrap', userSelect: 'none', },
    thContent: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '5px', cursor: 'pointer' },
    td: { padding: '12px 10px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' },
    link: { textDecoration: 'none', color: 'var(--primary-color)', fontWeight: 500, },
    message: { textAlign: 'center', padding: '50px', fontSize: '1.2rem', color: '#666' },
    error: { color: 'var(--danger-color)', padding: '20px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)', marginTop: '20px' },
    productInfoContainer: { display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' },
    productInfoImage: { width: '40px', height: '40px', objectFit: 'contain', borderRadius: '4px' },
    productInfoText: { display: 'flex', flexDirection: 'column' },
    productInfoTitle: { margin: 0, fontSize: '0.9rem', fontWeight: 500, maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    productInfoAsin: { margin: 0, fontSize: '0.8rem', color: '#666' },
    tableActions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' },
    linkButton: { background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontWeight: 500, fontSize: '0.9rem' },
    resizer: { position: 'absolute', right: 0, top: 0, height: '100%', width: '5px', cursor: 'col-resize', zIndex: 1, },
};

const QuestionIcon = () => (
    <span title="Data from Brand Analytics, representing the entire search funnel." style={{ cursor: 'help' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginLeft: '4px' }}>
            <circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
    </span>
);

const SortIcon = ({ direction }: { direction: 'ascending' | 'descending' | 'none' }) => {
    if (direction === 'ascending') return <span style={{ color: 'var(--primary-color)' }}>▲</span>;
    if (direction === 'descending') return <span style={{ color: 'var(--primary-color)' }}>▼</span>;
    return <span style={{ color: '#ccc' }}>↕</span>;
};

const ResizableTh = ({ children, width, onMouseDown }: { children: React.ReactNode; width: number; onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void; }) => (
    <th style={{ ...styles.th, width: `${width}px` }}>
        {children}
        <div style={styles.resizer} onMouseDown={onMouseDown} />
    </th>
);

export function SearchQueryPerformanceView() {
    const [filterOptions, setFilterOptions] = useState<PerformanceFilterOptions>({ asins: [], weeks: [] });
    const [selectedAsin, setSelectedAsin] = useState('');
    const [selectedWeek, setSelectedWeek] = useState('');
    const [performanceData, setPerformanceData] = useState<QueryPerformanceData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasAppliedFilters, setHasAppliedFilters] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' }>({ key: 'searchQueryVolume', direction: 'descending' });
    const [productDetails, setProductDetails] = useState<ProductDetails | null>(null);
    const [chartConfig, setChartConfig] = useState<AppChartConfig | null>(null);

    const initialColumns = useMemo(() => [
        { id: 'searchQuery', label: 'Search Query', visible: true, width: 250 },
        { id: 'searchQueryVolume', label: 'Search Volume', visible: true, width: 150 },
        { id: 'impressions.totalCount', label: 'Impressions', visible: true, width: 120 },
        { id: 'impressions.asinShare', label: 'Impr. Share (ASIN)', visible: true, width: 160 },
        { id: 'clicks.clickRate', label: 'Click-Through Rate', visible: true, width: 160 },
        { id: 'clicks.totalCount', label: 'Total Clicks', visible: false, width: 120 },
        { id: 'clicks.asinShare', label: 'Click Share (ASIN)', visible: true, width: 160 },
        { id: 'cartAdds.cartAddRate', label: 'Add to Cart Rate', visible: true, width: 160 },
        { id: 'cartAdds.totalCount', label: 'Total Cart Adds', visible: false, width: 140 },
        { id: 'cartAdds.asinShare', label: 'Cart Add Share (ASIN)', visible: true, width: 180 },
        { id: 'purchases.purchaseRate', label: 'Purchase Rate', visible: true, width: 150 },
        { id: 'purchases.totalCount', label: 'Total Purchases', visible: false, width: 140 },
        { id: 'purchases.asinShare', label: 'Purchase Share (ASIN)', visible: true, width: 180 },
    ], []);

    const [columns, setColumns] = useState(initialColumns);
    const tableRef = useRef<HTMLTableElement>(null);
    const resizingColumnIndex = useRef<number | null>(null);
    const startX = useRef(0);
    const startWidth = useRef(0);

    const handleMouseDown = useCallback((index: number, e: React.MouseEvent<HTMLDivElement>) => {
        resizingColumnIndex.current = index;
        startX.current = e.clientX;
        startWidth.current = columns[index].width;
    }, [columns]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (resizingColumnIndex.current === null) return;
        const deltaX = e.clientX - startX.current;
        const newWidth = Math.max(startWidth.current + deltaX, 80); // Min width
        setColumns(prev => {
            const newCols = [...prev];
            newCols[resizingColumnIndex.current!].width = newWidth;
            return newCols;
        });
    }, []);

    const handleMouseUp = useCallback(() => {
        resizingColumnIndex.current = null;
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    useEffect(() => {
        const fetchFilters = async () => {
            try {
                const response = await fetch('/api/query-performance-filters');
                if (!response.ok) throw new Error('Failed to fetch filters');
                const data = await response.json();
                setFilterOptions(data);
                if (data.weeks.length > 0) setSelectedWeek(data.weeks[0].value);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'An unknown error occurred.');
            }
        };
        fetchFilters();
    }, []);

    const handleApply = useCallback(async () => {
        if (!selectedAsin || !selectedWeek) return;
        setLoading(true);
        setError(null);
        setHasAppliedFilters(true);
        setProductDetails(null);
        try {
            const weekInfo = filterOptions.weeks.find(w => w.value === selectedWeek);
            if (!weekInfo) throw new Error("Invalid week selected.");
            const endDate = new Date(selectedWeek);
            endDate.setDate(endDate.getDate() + 6);
            const endDateStr = endDate.toISOString().split('T')[0];

            const performancePromise = fetch(`/api/query-performance?asin=${selectedAsin}&startDate=${selectedWeek}&endDate=${endDateStr}`);
            const detailsPromise = fetch(`/api/product-details?asins=${selectedAsin}`);
            
            const [performanceResponse, detailsResponse] = await Promise.all([performancePromise, detailsPromise]);
            
            if (!performanceResponse.ok) throw new Error((await performanceResponse.json()).error);
            const perfData = await performanceResponse.json();
            setPerformanceData(perfData);

            if (detailsResponse.ok) {
                const detailsData = await detailsResponse.json();
                setProductDetails(detailsData[0] || null);
            }

        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to fetch data.');
            setPerformanceData([]);
        } finally {
            setLoading(false);
        }
    }, [selectedAsin, selectedWeek, filterOptions.weeks]);

    const handleSort = (key: string) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'descending' ? 'ascending' : 'descending'
        }));
    };

    const handleColumnToggle = (id: string) => {
        setColumns(prev => prev.map(col => col.id === id ? { ...col, visible: !col.visible } : col));
    };

    const handleCellClick = (row: QueryPerformanceData, metricId: string, metricLabel: string, metricFormat: 'number' | 'percent' | 'price' = 'number') => {
        const endDate = new Date(selectedWeek);
        endDate.setDate(endDate.getDate() + 6);
        const startDate = new Date(endDate);
        startDate.setMonth(startDate.getMonth() - 6);
    
        setChartConfig({
            type: 'performance',
            asin: selectedAsin,
            searchQuery: row.searchQuery,
            metricId,
            metricLabel,
            metricFormat,
        });
    };

    const sortedData = useMemo(() => {
        return [...performanceData].sort((a, b) => {
            const aValue = getNested(a, sortConfig.key) ?? 0;
            const bValue = getNested(b, sortConfig.key) ?? 0;
            return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
        });
    }, [performanceData, sortConfig]);

    const visibleColumns = columns.filter(c => c.visible);

    const renderContent = () => {
        if (loading) return <div style={styles.message}>Loading data...</div>;
        if (!hasAppliedFilters) return <div style={styles.message}>Please select filters and click "Apply".</div>;
        if (sortedData.length === 0) return <div style={styles.message}>No data found for the selected criteria.</div>;
        
        return (
             <table style={styles.table} ref={tableRef}>
                <colgroup>
                    {visibleColumns.map(col => <col key={col.id} style={{ width: `${col.width}px` }} />)}
                </colgroup>
                <thead>
                    <tr>
                        {visibleColumns.map((col, index) => (
                            <ResizableTh key={col.id} width={col.width} onMouseDown={(e) => handleMouseDown(index, e)}>
                                <div style={styles.thContent} onClick={() => handleSort(col.id)}>
                                    <span>{col.label}<QuestionIcon /></span>
                                    <SortIcon direction={sortConfig.key === col.id ? sortConfig.direction : 'none'} />
                                </div>
                            </ResizableTh>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {sortedData.map(row => (
                        <tr key={row.searchQuery}>
                            {visibleColumns.map(col => (
                                <td key={col.id} style={styles.td} onClick={() => handleCellClick(row, col.id, col.label, col.id.includes('Rate') || col.id.includes('Share') ? 'percent' : 'number')} title={String(getNested(row, col.id))}>
                                    {col.id.includes('Rate') || col.id.includes('Share') ? formatPercent(getNested(row, col.id)) :
                                     col.id === 'searchQuery' ? row.searchQuery :
                                     formatNumber(getNested(row, col.id))}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };

    return (
        <div style={styles.viewContainer}>
            <header style={styles.header}>
                <h1 style={styles.title}>Search Query Performance</h1>
                <p style={styles.subtitle}>Analyze weekly top search queries that lead customers to your brand's products, including overall query performance and your brand's share.</p>
            </header>
            
            <div style={styles.card}>
                <div style={styles.filterGroup}>
                    <label style={styles.label} htmlFor="asin-select">ASIN</label>
                    <select id="asin-select" style={styles.select} value={selectedAsin} onChange={e => setSelectedAsin(e.target.value)} disabled={filterOptions.asins.length === 0}>
                        <option value="">-- Select an ASIN --</option>
                        {filterOptions.asins.map(asin => <option key={asin} value={asin}>{asin}</option>)}
                    </select>
                </div>
                <div style={styles.filterGroup}>
                    <label style={styles.label} htmlFor="week-select">Reporting Week</label>
                    <select id="week-select" style={styles.select} value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)} disabled={filterOptions.weeks.length === 0}>
                        {filterOptions.weeks.map(week => <option key={week.value} value={week.value}>{week.label}</option>)}
                    </select>
                </div>
                <button onClick={handleApply} style={styles.primaryButton} disabled={loading || !selectedAsin || !selectedWeek}>
                    {loading ? 'Applying...' : 'Apply'}
                </button>
                {productDetails && (
                    <div style={styles.productInfoContainer}>
                        <img src={productDetails.imageUrl} alt={productDetails.title} style={styles.productInfoImage} />
                        <div style={styles.productInfoText}>
                            <span style={styles.productInfoTitle} title={productDetails.title}>{productDetails.title}</span>
                            <span style={styles.productInfoAsin}>{productDetails.asin} | {productDetails.price}</span>
                        </div>
                    </div>
                )}
            </div>
            
            {error && <div style={styles.error}>{error}</div>}
            
             <div style={styles.tableActions}>
                <div>
                    <strong>Customize Columns:</strong>
                    {initialColumns.map(col => (
                        <label key={col.id} style={{ margin: '0 10px', cursor: 'pointer', fontWeight: 'normal' }}>
                            <input type="checkbox" checked={columns.find(c => c.id === col.id)?.visible || false} onChange={() => handleColumnToggle(col.id)} /> {col.label}
                        </label>
                    ))}
                </div>
            </div>

            <div style={styles.tableContainer}>
                {renderContent()}
            </div>
            
            {chartConfig && (
                 <ChartModal
                    config={chartConfig}
                    dateRange={{ start: selectedWeek, end: new Date(new Date(selectedWeek).setDate(new Date(selectedWeek).getDate() + 6)).toISOString().split('T')[0] }}
                    onClose={() => setChartConfig(null)}
                />
            )}
        </div>
    );
}