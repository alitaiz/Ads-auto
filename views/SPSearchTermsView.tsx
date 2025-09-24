import React, { useState, useMemo, useEffect, useCallback, useContext, useRef } from 'react';
import { SPSearchTermReportData } from '../types';
import { formatNumber, formatPercent, formatPrice, getNested } from '../utils';
import { DataCacheContext } from '../contexts/DataCacheContext';
import { DateRangePicker } from './components/DateRangePicker';
import { Pagination } from './components/Pagination';

type ReportType = 'SP' | 'SB' | 'SD';

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
    viewContainer: { padding: '20px', maxWidth: '100%', margin: '0 auto' },
    header: { marginBottom: '20px' },
    headerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' },
    dateDisplay: { fontSize: '1.5rem', fontWeight: '600' },
    tableContainer: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' },
    th: {
        padding: '12px 15px', textAlign: 'left', borderBottom: '2px solid var(--border-color)',
        backgroundColor: '#f8f9fa', fontWeight: 600, position: 'relative', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis', userSelect: 'none'
    },
    td: { padding: '12px 15px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    error: { color: 'var(--danger-color)', padding: '20px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)', marginTop: '20px' },
    message: { textAlign: 'center', padding: '50px', fontSize: '1.2rem', color: '#666' },
    dateButton: { padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '1rem', background: 'white', cursor: 'pointer' },
    integrityCheckContainer: { marginTop: '20px', padding: '15px', backgroundColor: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 'var(--border-radius)', marginBottom: '20px' },
    integrityTitle: { margin: '0 0 10px 0', fontWeight: 600, color: '#d46b08' },
    missingDateItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', borderBottom: '1px solid #ffe58f' },
    fetchButton: { padding: '6px 12px', border: '1px solid #d46b08', borderRadius: '4px', backgroundColor: 'white', color: '#d46b08', cursor: 'pointer' },
    reportTypeSelector: { display: 'flex', gap: '10px', marginBottom: '15px', backgroundColor: '#f8f9fa', padding: '8px', borderRadius: '8px' },
    reportTypeButton: { padding: '8px 16px', border: '1px solid transparent', borderRadius: '6px', background: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' },
    reportTypeButtonActive: { backgroundColor: 'white', borderColor: 'var(--border-color)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', color: 'var(--primary-color)' },
    filterBar: { display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '20px', padding: '15px', backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)' },
    searchInput: { padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '1rem', minWidth: '250px' },
    thFilter: { padding: '4px 8px', borderBottom: '2px solid var(--border-color)', backgroundColor: '#f8f9fa' },
    filterContainer: { display: 'flex', gap: '4px' },
    filterInput: { width: 'calc(50% - 4px)', padding: '4px', fontSize: '0.8rem', border: '1px solid #ccc', borderRadius: '3px', backgroundColor: 'white' },
    link: { textDecoration: 'none', color: 'var(--primary-color)', fontWeight: 500 },
};

const resizerStyles: { [key: string]: React.CSSProperties } = {
  resizer: { position: 'absolute', right: 0, top: 0, height: '100%', width: '5px', cursor: 'col-resize', userSelect: 'none', touchAction: 'none' },
  resizing: { background: 'var(--primary-color)' }
};

// --- Resizable Columns Hook & Component ---
function useResizableColumns(initialWidths: number[]) {
    const [widths, setWidths] = useState(initialWidths);
    const [resizingColumnIndex, setResizingColumnIndex] = useState<number | null>(null);
    const currentColumnIndex = useRef<number | null>(null);
    const startX = useRef(0);
    const startWidth = useRef(0);

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
        const newWidth = Math.max(startWidth.current + deltaX, 80); // Min width 80px
        setWidths(prev => { const newWidths = [...prev]; newWidths[currentColumnIndex.current!] = newWidth; return newWidths; });
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

// --- COLUMN DEFINITIONS ---
const columns: { id: keyof SPSearchTermReportData | 'cpc' | 'sevenDayRoas'; label: string; isMetric?: boolean; isPercentage?: boolean }[] = [
    { id: 'campaignName', label: 'Campaign' },
    { id: 'adGroupName', label: 'Ad Group' },
    { id: 'customerSearchTerm', label: 'Search Term' },
    { id: 'targeting', label: 'Targeting' },
    { id: 'matchType', label: 'Match Type' },
    { id: 'asin', label: 'ASIN' },
    { id: 'impressions', label: 'Impressions', isMetric: true },
    { id: 'clicks', label: 'Clicks', isMetric: true },
    { id: 'spend', label: 'Spend', isMetric: true },
    { id: 'costPerClick', label: 'CPC', isMetric: true },
    { id: 'sevenDayTotalOrders', label: 'Orders', isMetric: true },
    { id: 'sevenDayTotalSales', label: 'Sales', isMetric: true },
    { id: 'sevenDayAcos', label: 'ACOS', isMetric: true, isPercentage: true },
    { id: 'sevenDayRoas', label: 'ROAS', isMetric: true },
];

const initialWidths = [250, 200, 220, 180, 100, 120, 120, 100, 100, 100, 100, 120, 100, 100];

type MetricFilterKeys = 'impressions' | 'clicks' | 'spend' | 'costPerClick' | 'sevenDayTotalOrders' | 'sevenDayTotalSales' | 'sevenDayAcos' | 'sevenDayRoas';
type MetricFilters = Record<MetricFilterKeys, { min?: number; max?: number }>;

const ITEMS_PER_PAGE = 100;

export function SPSearchTermsView() {
    const { cache, setCache } = useContext(DataCacheContext);
    const [reportType, setReportType] = useState<ReportType>('SP');
    const [flatData, setFlatData] = useState<SPSearchTermReportData[]>(cache.spSearchTerms.data || []);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [dateRange, setDateRange] = useState(cache.spSearchTerms.filters ? { start: new Date(cache.spSearchTerms.filters.startDate + 'T00:00:00'), end: new Date(cache.spSearchTerms.filters.endDate + 'T00:00:00')} : { start: new Date(), end: new Date() });
    const [isDatePickerOpen, setDatePickerOpen] = useState(false);
    
    // --- State for new features ---
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' }>({ key: 'impressions', direction: 'descending' });
    const [metricFilters, setMetricFilters] = useState<MetricFilters>({ impressions: {}, clicks: {}, spend: {}, costPerClick: {}, sevenDayTotalOrders: {}, sevenDayTotalSales: {}, sevenDayAcos: {}, sevenDayRoas: {} });
    const [currentPage, setCurrentPage] = useState(1);
    
    const [missingDates, setMissingDates] = useState<string[]>([]);
    const [fetchStatus, setFetchStatus] = useState<Record<string, 'fetching' | 'success' | 'error' | 'idle'>>({});
    
    const { widths, getHeaderProps, resizingColumnIndex } = useResizableColumns(initialWidths);

    const formatDateForQuery = (d: Date) => d.toISOString().split('T')[0];
    
    // --- Data Fetching and Integrity Checks ---
    const handleApply = useCallback(async (range: {start: Date, end: Date}, type: ReportType) => {
        setLoading(true);
        setError(null);
        setCurrentPage(1);
        const startDate = formatDateForQuery(range.start);
        const endDate = formatDateForQuery(range.end);

        try {
            const url = `/api/sp-search-terms?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&reportType=${type}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error((await response.json()).error);
            const data: SPSearchTermReportData[] = await response.json();
            setFlatData(data);
            setCache(prev => ({ ...prev, spSearchTerms: { data, filters: { asin: '', startDate, endDate } } }));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred.');
            setFlatData([]);
        } finally {
            setLoading(false);
        }
    }, [setCache]);
    
    const checkDataIntegrity = useCallback(async (type: ReportType) => {
        const today = new Date();
        const endDate = new Date(today);
        endDate.setDate(today.getDate() - 2);
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 6);
        const source = type === 'SP' ? 'searchTermReport' : type === 'SB' ? 'sbSearchTermReport' : 'sdTargetingReport';

        try {
            const response = await fetch('/api/database/check-missing-dates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source, startDate: formatDateForQuery(startDate), endDate: formatDateForQuery(endDate) }),
            });
            const data = await response.json();
            if (response.ok) setMissingDates(data.missingDates || []);
        } catch (err) { console.error("Failed to run data integrity check:", err); }
    }, []);

    useEffect(() => {
        if (cache.spSearchTerms.data.length === 0 && !cache.spSearchTerms.filters) {
            const end = new Date();
            const start = new Date();
            end.setDate(end.getDate() - 2);
            start.setDate(end.getDate() - 7);
            const initialRange = {start, end};
            setDateRange(initialRange);
            handleApply(initialRange, reportType);
        }
        checkDataIntegrity(reportType);
    }, [handleApply, cache.spSearchTerms, reportType, checkDataIntegrity]);

    const handleReportTypeChange = (newType: ReportType) => {
        setReportType(newType);
        setFlatData([]);
        handleApply(dateRange, newType);
        checkDataIntegrity(newType);
    };

    const handleApplyDateRange = (newRange: { start: Date; end: Date }) => {
        setDateRange(newRange);
        setDatePickerOpen(false);
        handleApply(newRange, reportType);
    };

    // --- Filtering and Sorting Logic ---
    const handleMetricFilterChange = useCallback((key: MetricFilterKeys, type: 'min' | 'max', value: string) => {
        const numValue = value === '' ? undefined : parseFloat(value);
        if (value !== '' && isNaN(numValue)) return;
        setMetricFilters(prev => ({...prev, [key]: {...prev[key], [type]: numValue}}));
        setCurrentPage(1);
    }, []);
    
    const filteredAndSortedData = useMemo(() => {
        let processedData = flatData.map(row => {
            const spend = row.spend || 0;
            const clicks = row.clicks || 0;
            const sales = row.sevenDayTotalSales || 0;
            return {
                ...row,
                costPerClick: clicks > 0 ? spend / clicks : 0,
                sevenDayAcos: sales > 0 ? spend / sales : 0,
                sevenDayRoas: spend > 0 ? sales / spend : 0,
            };
        });

        // Text Search Filter
        if (searchTerm) {
            const lowercasedTerm = searchTerm.toLowerCase();
            processedData = processedData.filter(row => 
                row.campaignName.toLowerCase().includes(lowercasedTerm) ||
                row.adGroupName.toLowerCase().includes(lowercasedTerm) ||
                row.customerSearchTerm.toLowerCase().includes(lowercasedTerm) ||
                row.targeting.toLowerCase().includes(lowercasedTerm)
            );
        }

        // Metric Filters
        processedData = processedData.filter(row => {
            return Object.entries(metricFilters).every(([key, range]) => {
                const value = getNested(row, key);
                if (value === null || value === undefined) return true;
                const minOk = range.min === undefined || isNaN(range.min) || value >= (columns.find(c => c.id === key)?.isPercentage ? range.min / 100 : range.min);
                const maxOk = range.max === undefined || isNaN(range.max) || value <= (columns.find(c => c.id === key)?.isPercentage ? range.max / 100 : range.max);
                return minOk && maxOk;
            });
        });

        // Sorting
        if (sortConfig.key) {
            processedData.sort((a, b) => {
                const aValue = getNested(a, sortConfig.key) ?? -Infinity;
                const bValue = getNested(b, sortConfig.key) ?? -Infinity;
                if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return processedData;
    }, [flatData, searchTerm, metricFilters, sortConfig]);
    
    const paginatedData = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredAndSortedData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredAndSortedData, currentPage]);
    
    const totalPages = Math.ceil(filteredAndSortedData.length / ITEMS_PER_PAGE);

    const requestSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'descending';
        if (sortConfig.key === key && sortConfig.direction === 'descending') {
            direction = 'ascending';
        }
        setSortConfig({ key, direction });
    };

    // FIX: Implemented handleFetchMissingDay and renderFetchButton to resolve rendering error.
    const handleFetchMissingDay = useCallback(async (date: string) => {
        setFetchStatus(prev => ({ ...prev, [date]: 'fetching' }));
        const source = reportType === 'SP' ? 'searchTermReport' : reportType === 'SB' ? 'sbSearchTermReport' : 'sdTargetingReport';
        try {
            const response = await fetch('/api/database/fetch-missing-day', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source, date }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setFetchStatus(prev => ({ ...prev, [date]: 'success' }));
            setMissingDates(prev => prev.filter(d => d !== date));
        } catch (err) {
            setFetchStatus(prev => ({ ...prev, [date]: 'error' }));
            alert(`Failed to fetch data for ${date}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }, [reportType]);

    const renderFetchButton = (date: string) => {
        const status = fetchStatus[date] || 'idle';
        let text = 'Fetch';
        let disabled = false;

        switch (status) {
            case 'fetching': text = 'Fetching...'; disabled = true; break;
            case 'success': text = 'Success!'; disabled = true; break;
            case 'error': text = 'Error - Retry'; disabled = false; break;
            default: text = 'Fetch'; disabled = false; break;
        }

        return <button style={styles.fetchButton} onClick={() => handleFetchMissingDay(date)} disabled={disabled}>{text}</button>;
    };
    
    return (
        <div style={styles.viewContainer}>
            <header style={styles.header}>
                 <div style={styles.headerTop}>
                     <h1 style={styles.dateDisplay}>{dateRange.start && dateRange.end ? `${formatDateForQuery(dateRange.start)} to ${formatDateForQuery(dateRange.end)}` : 'Select Date Range'}</h1>
                     <div style={{ position: 'relative' }}>
                         <button style={styles.dateButton} onClick={() => setDatePickerOpen(o => !o)}>Change Dates</button>
                        {isDatePickerOpen && <DateRangePicker initialRange={dateRange} onApply={handleApplyDateRange} onClose={() => setDatePickerOpen(false)} />}
                    </div>
                 </div>
            </header>
            
            {missingDates.length > 0 && (
                <div style={styles.integrityCheckContainer}>
                    <h3 style={styles.integrityTitle}>⚠️ Data Integrity Check</h3>
                    <p>Missing {reportType} report data found for recent dates. Fetch them individually to ensure complete analysis.</p>
                    {missingDates.map(date => (
                        <div key={date} style={styles.missingDateItem}>
                            <span>Missing data for: <strong>{date}</strong></span>
                            {renderFetchButton(date)}
                        </div>
                    ))}
                </div>
            )}
            
            <div style={styles.filterBar}>
                <div style={styles.reportTypeSelector}>
                    {['SP', 'SB', 'SD'].map((type) => (
                        <button key={type} style={reportType === type ? {...styles.reportTypeButton, ...styles.reportTypeButtonActive} : styles.reportTypeButton} onClick={() => handleReportTypeChange(type as ReportType)}>
                            {type} Report
                        </button>
                    ))}
                </div>
                <input type="text" placeholder="Filter by name or term..." style={styles.searchInput} value={searchTerm} onChange={e => {setSearchTerm(e.target.value); setCurrentPage(1);}} />
            </div>
            
            {error && <div style={styles.error}>{error}</div>}

            <div style={styles.tableContainer}>
                {loading ? <div style={styles.message}>Loading...</div> :
                 paginatedData.length === 0 ? <div style={styles.message}>No data found for the selected criteria.</div> :
                 (
                    <>
                        <table style={styles.table}>
                            <colgroup>
                                {widths.map((width, i) => <col key={i} style={{width: `${width}px`}}/>)}
                            </colgroup>
                            <thead>
                                <tr>
                                    {columns.map((col, i) => (
                                        <ResizableTh key={col.id} index={i} getHeaderProps={getHeaderProps} resizingColumnIndex={resizingColumnIndex}>
                                            <div onClick={() => requestSort(col.id)} style={{cursor: 'pointer', display: 'flex', alignItems: 'center'}}>
                                                {col.label}
                                                {sortConfig.key === col.id && (sortConfig.direction === 'ascending' ? ' ▲' : ' ▼')}
                                            </div>
                                        </ResizableTh>
                                    ))}
                                </tr>
                                <tr>
                                    {columns.map(col => (
                                        <th key={`${col.id}-filter`} style={styles.thFilter}>
                                            {col.isMetric && (
                                                <div style={styles.filterContainer}>
                                                    <input type="number" placeholder="Min" style={styles.filterInput} value={metricFilters[col.id as MetricFilterKeys]?.min ?? ''} onChange={e => handleMetricFilterChange(col.id as MetricFilterKeys, 'min', e.target.value)} onClick={e => e.stopPropagation()} />
                                                    <input type="number" placeholder="Max" style={styles.filterInput} value={metricFilters[col.id as MetricFilterKeys]?.max ?? ''} onChange={e => handleMetricFilterChange(col.id as MetricFilterKeys, 'max', e.target.value)} onClick={e => e.stopPropagation()} />
                                                </div>
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedData.map((row, index) => (
                                    <tr key={index}>
                                        {columns.map(col => {
                                            const value = getNested(row, col.id);
                                            let displayValue: React.ReactNode = '-';
                                            if (value !== null && value !== undefined) {
                                                if (col.id === 'asin') {
                                                    displayValue = <a href={`https://www.amazon.com/dp/${value}`} target="_blank" rel="noopener noreferrer" style={styles.link}>{value}</a>;
                                                } else if (col.isPercentage) {
                                                    displayValue = formatPercent(value);
                                                } else if (typeof value === 'number' && ['spend', 'costPerClick', 'sevenDayTotalSales'].includes(col.id)) {
                                                    displayValue = formatPrice(value);
                                                } else if (typeof value === 'number') {
                                                    displayValue = col.id === 'sevenDayRoas' ? value.toFixed(2) : formatNumber(value);
                                                } else {
                                                    displayValue = value;
                                                }
                                            }
                                            return <td key={col.id} style={styles.td} title={String(value)}>{displayValue}</td>;
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                    </>
                 )}
            </div>
        </div>
    );
}