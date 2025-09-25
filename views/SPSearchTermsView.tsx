import React, { useState, useMemo, useEffect, useCallback, useContext, useRef } from 'react';
import { SPSearchTermReportData } from '../types';
import { formatNumber, formatPercent, formatPrice } from '../utils';
import { DataCacheContext } from '../contexts/DataCacheContext';
import { DateRangePicker } from './components/DateRangePicker';

// --- Type Definitions for Hierarchical Data ---
interface Metrics {
    impressions: number;
    clicks: number;
    spend: number;
    sales: number;
    orders: number;
    units: number;
    asin?: string | null;
    asins?: string[];
    productCount?: number;
}

interface TreeNode {
    id: string;
    name: string;
    type: 'campaign' | 'adGroup' | 'keyword' | 'searchTerm';
    metrics: Metrics;
    children?: TreeNode[];
    // Additional metadata for display
    keywordType?: 'keyword' | 'search term';
    matchType?: string;
}

type ViewLevel = 'campaigns' | 'adGroups' | 'keywords' | 'searchTerms';
type ReportType = 'SP' | 'SB' | 'SD';

// --- Styles ---
const styles: { [key: string]: React.CSSProperties } = {
    viewContainer: { padding: '20px', maxWidth: '100%', margin: '0 auto' },
    header: { marginBottom: '20px' },
    headerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' },
    dateDisplay: { fontSize: '1.5rem', fontWeight: '600' },
    headerTabs: { display: 'flex', gap: '5px', borderBottom: '1px solid var(--border-color)', marginBottom: '20px' },
    tabButton: { padding: '10px 15px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem', borderBottom: '3px solid transparent', color: '#555', fontWeight: 500 },
    tabButtonActive: { color: 'var(--primary-color)', borderBottom: '3px solid var(--primary-color)', fontWeight: 600 },
    tableContainer: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', overflowX: 'auto' },
    table: { width: '100%', minWidth: '2200px', borderCollapse: 'collapse', tableLayout: 'fixed' },
    th: { position: 'relative', padding: '12px 10px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', backgroundColor: '#f8f9fa', fontWeight: 600, whiteSpace: 'nowrap', userSelect: 'none' },
    thContent: { display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' },
    sortIcon: { fontSize: '0.8em' },
    td: { padding: '10px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    nameCell: { display: 'flex', alignItems: 'center', gap: '8px' },
    expandIcon: { cursor: 'pointer', width: '15px', textAlign: 'center', transition: 'transform 0.2s', userSelect: 'none' },
    statusCell: { display: 'flex', alignItems: 'center', gap: '5px' },
    statusDropdownIcon: { fontSize: '0.6em' },
    error: { color: 'var(--danger-color)', padding: '20px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)', marginTop: '20px' },
    message: { textAlign: 'center', padding: '50px', fontSize: '1.2rem', color: '#666' },
    dateButton: {
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
        background: 'white',
        cursor: 'pointer',
    },
    integrityCheckContainer: {
        marginTop: '20px',
        padding: '15px',
        backgroundColor: '#fffbe6',
        border: '1px solid #ffe58f',
        borderRadius: 'var(--border-radius)',
        marginBottom: '20px',
    },
    integrityTitle: {
        margin: '0 0 10px 0',
        fontWeight: 600,
        color: '#d46b08',
    },
    missingDateItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px',
        borderBottom: '1px solid #ffe58f',
    },
    fetchButton: {
        padding: '6px 12px',
        border: '1px solid #d46b08',
        borderRadius: '4px',
        backgroundColor: 'white',
        color: '#d46b08',
        cursor: 'pointer',
    },
    reportTypeSelector: {
        display: 'flex',
        gap: '10px',
        marginBottom: '15px',
        backgroundColor: '#f8f9fa',
        padding: '8px',
        borderRadius: '8px'
    },
    reportTypeButton: {
        padding: '8px 16px',
        border: '1px solid transparent',
        borderRadius: '6px',
        background: 'none',
        cursor: 'pointer',
        fontSize: '0.9rem',
        fontWeight: '500'
    },
    reportTypeButtonActive: {
        backgroundColor: 'white',
        borderColor: 'var(--border-color)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        color: 'var(--primary-color)'
    },
    resizer: {
        position: 'absolute',
        right: 0,
        top: 0,
        height: '100%',
        width: '5px',
        cursor: 'col-resize',
        zIndex: 1,
    },
};

// --- Column Definitions ---
const getColumns = () => [
    { id: 'name', label: 'Name', width: 350, sortable: true },
    { id: 'asin', label: 'ASIN', width: 200, sortable: false },
    { id: 'status', label: 'Status', width: 120, sortable: false },
    { id: 'costPerOrder', label: 'Cost per order', width: 120, sortable: true },
    { id: 'spend', label: 'Ad spend', width: 100, sortable: true },
    { id: 'clicks', label: 'Clicks', width: 100, sortable: true },
    { id: 'conversion', label: 'Conversion', width: 110, sortable: true },
    { id: 'orders', label: 'Orders', width: 100, sortable: true },
    { id: 'units', label: 'Units', width: 100, sortable: true },
    { id: 'cpc', label: 'CPC', width: 100, sortable: true },
    { id: 'sales', label: 'PPC sales', width: 110, sortable: true },
    { id: 'impressions', label: 'Impressions', width: 110, sortable: true },
    { id: 'sku', label: 'Same SKU/All SKU\'s', width: 150, sortable: false },
    { id: 'acos', label: 'ACOS', width: 100, sortable: true },
    { id: 'profit', label: 'Profit', width: 100, sortable: true },
    { id: 'tos', label: 'Top-of-search impression share', width: 200, sortable: false },
    { id: 'breakEvenAcos', label: 'Break even ACOS', width: 140, sortable: false },
    { id: 'breakEvenBid', label: 'Break Even Bid', width: 130, sortable: false },
    { id: 'dailyBudget', label: 'Daily budget', width: 120, sortable: false },
    { id: 'budgetUtil', label: 'Budget utilization', width: 140, sortable: false },
    { id: 'currentBid', label: 'Current bid', width: 120, sortable: false },
];


// --- Helper Functions ---
const addMetrics = (target: Metrics, source: Metrics) => {
    target.impressions += source.impressions;
    target.clicks += source.clicks;
    target.spend += source.spend;
    target.sales += source.sales;
    target.orders += source.orders;
    target.units += source.units;
    if (source.asin) {
        target.asins = target.asins || [];
        if (!target.asins.includes(source.asin)) target.asins.push(source.asin);
    }
};
const createMetrics = (row: SPSearchTermReportData): Metrics => ({
    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend,
    sales: row.sevenDayTotalSales,
    orders: row.sevenDayTotalOrders,
    units: row.sevenDayTotalUnits,
    asin: row.asin,
});
const emptyMetrics = (): Metrics => ({ impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, units: 0, productCount: 0, asins: [] });

const aggregateSearchTerms = (flatData: SPSearchTermReportData[]): TreeNode[] => {
    // The key is a composite of search term and ASIN to create a unique row for each pair.
    const termsMap = new Map<string, { name: string; asin: string | null; metrics: Metrics }>();

    flatData.forEach(row => {
        const searchTerm = row.customerSearchTerm;
        const asin = row.asin;
        // Use a separator that's unlikely to appear in a search term
        const key = `${searchTerm}::${asin || 'null'}`;

        if (!termsMap.has(key)) {
            termsMap.set(key, {
                name: searchTerm,
                asin: asin,
                metrics: emptyMetrics(),
            });
        }
        
        const entry = termsMap.get(key)!;
        addMetrics(entry.metrics, createMetrics(row));
    });

    return Array.from(termsMap.values()).map(entry => {
        // We explicitly set the 'asin' on the final metrics object so the renderer can easily pick it up.
        // The 'asins' array from addMetrics will naturally contain just this single ASIN anyway.
        const finalMetrics = { ...entry.metrics, asin: entry.asin };
        
        return {
            id: `st-${entry.name}::${entry.asin || 'null'}`,
            name: entry.name,
            type: 'searchTerm',
            keywordType: 'search term',
            metrics: finalMetrics,
        };
    });
};

const buildHierarchyByLevel = (flatData: SPSearchTermReportData[], level: ViewLevel): TreeNode[] => {
    if (level === 'searchTerms') {
        return aggregateSearchTerms(flatData);
    }

    if (level === 'keywords') {
        interface KeywordEntry {
            node: TreeNode;
            termMap: Map<string, TreeNode>;
        }
        const keywordMap = new Map<string, KeywordEntry>();

        flatData.forEach(row => {
            const key = `${row.campaignId}-${row.adGroupId}-${row.targeting}`;
            if (!keywordMap.has(key)) {
                keywordMap.set(key, {
                    node: {
                        id: `k-${key}`,
                        name: row.targeting,
                        type: 'keyword',
                        keywordType: 'keyword',
                        matchType: row.matchType,
                        metrics: emptyMetrics(),
                        children: [],
                    },
                    termMap: new Map<string, TreeNode>(),
                });
            }

            const keywordEntry = keywordMap.get(key)!;
            addMetrics(keywordEntry.node.metrics, createMetrics(row));

            if (!keywordEntry.termMap.has(row.customerSearchTerm)) {
                keywordEntry.termMap.set(row.customerSearchTerm, {
                    id: `st-${row.customerSearchTerm}-${key}`,
                    name: row.customerSearchTerm,
                    type: 'searchTerm',
                    keywordType: 'search term',
                    metrics: emptyMetrics(),
                });
            }
            addMetrics(keywordEntry.termMap.get(row.customerSearchTerm)!.metrics, createMetrics(row));
        });

        return Array.from(keywordMap.values()).map(({ node, termMap }) => {
            node.children = Array.from(termMap.values());
            return node;
        });
    }

    const campaignMap = new Map<number, TreeNode>();

    flatData.forEach(row => {
        const rowMetrics = createMetrics(row);

        if (!campaignMap.has(row.campaignId)) {
            campaignMap.set(row.campaignId, {
                id: `c-${row.campaignId}`,
                name: row.campaignName,
                type: 'campaign',
                metrics: emptyMetrics(),
                children: [],
            });
        }
        const campaignNode = campaignMap.get(row.campaignId)!;
        addMetrics(campaignNode.metrics, rowMetrics);

        let adGroupNode = campaignNode.children!.find(c => c.id === `ag-${row.adGroupId}`);
        if (!adGroupNode) {
            adGroupNode = {
                id: `ag-${row.adGroupId}`,
                name: row.adGroupName,
                type: 'adGroup',
                metrics: emptyMetrics(),
                children: [],
            };
            campaignNode.children!.push(adGroupNode);
        }
        addMetrics(adGroupNode.metrics, rowMetrics);
        adGroupNode.metrics.productCount = (adGroupNode.metrics.productCount || 0) + 1;

        let keywordNode = adGroupNode.children!.find(c => c.id === `k-${row.targeting}`);
        if (!keywordNode) {
            keywordNode = {
                id: `k-${row.targeting}`,
                name: row.targeting,
                type: 'keyword',
                keywordType: 'keyword',
                matchType: row.matchType,
                metrics: emptyMetrics(),
                children: [],
            };
            adGroupNode.children!.push(keywordNode);
        }
        addMetrics(keywordNode.metrics, rowMetrics);
        
        keywordNode.children!.push({
            id: `st-${row.customerSearchTerm}-${row.targeting}`,
            name: row.customerSearchTerm,
            type: 'searchTerm',
            keywordType: 'search term',
            metrics: rowMetrics,
        });
    });

    switch (level) {
        case 'adGroups':
            return Array.from(campaignMap.values()).flatMap(c => c.children!);
        case 'campaigns':
        default:
            return Array.from(campaignMap.values());
    }
};

const getSortableValue = (node: TreeNode, key: string): string | number => {
    const { metrics } = node;
    const { impressions, clicks, spend, sales, orders, units } = metrics;
    if (key === 'name') return node.name.toLowerCase();
    
    switch (key) {
        case 'spend': return spend;
        case 'clicks': return clicks;
        case 'orders': return orders;
        case 'units': return units;
        case 'sales': return sales;
        case 'impressions': return impressions;
        case 'cpc': return clicks > 0 ? spend / clicks : 0;
        case 'acos': return sales > 0 ? spend / sales : (spend > 0 ? Infinity : 0);
        case 'conversion': return clicks > 0 ? orders / clicks : 0;
        case 'costPerOrder': return orders > 0 ? spend / orders : (spend > 0 ? Infinity : 0);
        case 'profit': return sales - spend;
        default: return 0;
    }
};

// --- Recursive Row Component ---
const TreeNodeRow: React.FC<{
    node: TreeNode;
    level: number;
    expandedIds: Set<string>;
    onToggle: (id: string) => void;
    selectedIds: Set<string>;
    onSelect: (id: string, checked: boolean) => void;
    columns: ReturnType<typeof getColumns>;
}> = ({ node, level, expandedIds, onToggle, selectedIds, onSelect, columns }) => {
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    
    const { impressions, clicks, spend, sales, orders, units } = node.metrics;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const acos = sales > 0 ? spend / sales : 0;
    const conversion = clicks > 0 ? orders / clicks : 0;
    const costPerOrder = orders > 0 ? spend / orders : 0;
    const profit = sales - spend;

    const renderCellContent = (columnId: string) => {
        switch (columnId) {
            case 'name': 
                let nameSuffix = '';
                if(node.keywordType === 'keyword') nameSuffix = ' (keyword)';
                else if(node.keywordType === 'search term') nameSuffix = ' (search term)';
                
                return (
                <div style={{ ...styles.nameCell, paddingLeft: `${level * 25}px` }}>
                    <input type="checkbox" checked={selectedIds.has(node.id)} onChange={e => onSelect(node.id, e.target.checked)} />
                    {hasChildren ? (
                        <span
                            style={{ ...styles.expandIcon, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                            onClick={() => onToggle(node.id)}
                        >
                            ►
                        </span>
                    ) : <span style={{width: '15px'}} />}
                    <span title={node.name}>{node.name}{nameSuffix}</span>
                </div>
            );

            case 'asin': {
                const asinList = node.metrics.asins || [];
                const singleAsinFromMetrics = node.metrics.asin;

                // Priority 1: If there's a specific ASIN (for leaf nodes), show it.
                if (singleAsinFromMetrics) {
                    return singleAsinFromMetrics;
                }

                // Priority 2: If it's an aggregated node, check the list of ASINs.
                if (asinList.length === 1) {
                    return asinList[0];
                }
                if (asinList.length > 1) {
                    return (
                        <span
                            style={{ color: 'var(--primary-color)', cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={(e) => { e.stopPropagation(); alert(`Associated ASINs:\n${asinList.join('\n')}`); }}
                            title={asinList.join(', ')}
                        >
                            {`${asinList.length} ASINs`}
                        </span>
                    );
                }
                
                // Fallback if no ASIN data is found at all.
                return '—';
            }
            case 'status': return node.type !== 'searchTerm' ? <div style={styles.statusCell}>Active <span style={styles.statusDropdownIcon}>▼</span></div> : '—';
            case 'costPerOrder': return formatPrice(costPerOrder);
            case 'spend': return spend < 0 ? `-${formatPrice(Math.abs(spend))}` : formatPrice(spend);
            case 'clicks': return formatNumber(clicks);
            case 'conversion': return formatPercent(conversion);
            case 'orders': return formatNumber(orders);
            case 'units': return formatNumber(units);
            case 'cpc': return formatPrice(cpc);
            case 'sales': return formatPrice(sales);
            case 'impressions': return formatNumber(impressions);
            case 'acos': return formatPercent(acos);
            case 'profit': return profit < 0 ? `-${formatPrice(Math.abs(profit))}` : formatPrice(profit);
            default: return '—';
        }
    };
    
    return (
        <>
            <tr style={{ backgroundColor: level < 2 ? '#fdfdfd' : 'transparent' }}>
                {columns.map(col => (
                    <td key={col.id} style={{ ...styles.td, ...(col.id === 'name' && { fontWeight: 500 }) }} title={node.name}>
                        {renderCellContent(col.id)}
                    </td>
                ))}
            </tr>
            {isExpanded && hasChildren && node.children!.map(child => (
                <TreeNodeRow key={child.id} node={child} level={level + 1} expandedIds={expandedIds} onToggle={onToggle} selectedIds={selectedIds} onSelect={onSelect} columns={columns} />
            ))}
        </>
    );
};

// --- Main View Component ---
export function SPSearchTermsView() {
    const { cache, setCache } = useContext(DataCacheContext);
    const [reportType, setReportType] = useState<ReportType>('SP');
    const [flatData, setFlatData] = useState<SPSearchTermReportData[]>(cache.spSearchTerms.data || []);
    const [viewLevel, setViewLevel] = useState<ViewLevel>('campaigns');
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    
    const [missingDates, setMissingDates] = useState<string[]>([]);
    const [fetchStatus, setFetchStatus] = useState<Record<string, 'fetching' | 'success' | 'error' | 'idle'>>({});

    const [dateRange, setDateRange] = useState(cache.spSearchTerms.filters ? { start: new Date(cache.spSearchTerms.filters.startDate), end: new Date(cache.spSearchTerms.filters.endDate)} : { start: new Date(), end: new Date() });
    const [isDatePickerOpen, setDatePickerOpen] = useState(false);

    // --- Sort & Resize State ---
    const columns = useMemo(() => getColumns(), []);
    const initialWidths = useMemo(() => columns.map(c => c.width), [columns]);
    const [columnWidths, setColumnWidths] = useState(initialWidths);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' }>({ key: 'spend', direction: 'descending' });
    const tableRef = useRef<HTMLTableElement>(null);
    const resizingColumnIndex = useRef<number | null>(null);
    const startX = useRef(0);
    const startWidth = useRef(0);

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


    const treeData = useMemo(() => {
        switch (viewLevel) {
            case 'adGroups': return buildHierarchyByLevel(flatData, 'adGroups');
            case 'keywords': return buildHierarchyByLevel(flatData, 'keywords');
            case 'searchTerms': return buildHierarchyByLevel(flatData, 'searchTerms');
            case 'campaigns': default: return buildHierarchyByLevel(flatData, 'campaigns');
        }
    }, [viewLevel, flatData]);
    
    const sortedTreeData = useMemo(() => {
        if (!sortConfig.key) return treeData;
        return [...treeData].sort((a, b) => {
            const aValue = getSortableValue(a, sortConfig.key);
            const bValue = getSortableValue(b, sortConfig.key);
            if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
        });
    }, [treeData, sortConfig]);

    const requestSort = (key: string) => {
        const column = columns.find(c => c.id === key);
        if (!column || !column.sortable) return;
        let direction: 'ascending' | 'descending' = 'descending';
        if (sortConfig.key === key && sortConfig.direction === 'descending') {
            direction = 'ascending';
        }
        setSortConfig({ key, direction });
    };

    const formatDateForQuery = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
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
            if (response.ok) setMissingDates((await response.json()).missingDates || []);
        } catch (err) { console.error("Failed to run data integrity check:", err); }
    }, []);

    useEffect(() => { checkDataIntegrity(reportType); }, [reportType, checkDataIntegrity]);
    useEffect(() => { setExpandedIds(new Set()); setSelectedIds(new Set()); }, [flatData, viewLevel]);

    const handleToggle = (id: string) => setExpandedIds(prev => { const s = new Set(prev); if(s.has(id)) s.delete(id); else s.add(id); return s; });
    const handleSelect = (id: string, checked: boolean) => setSelectedIds(prev => { const s = new Set(prev); if(checked) s.add(id); else s.delete(id); return s; });
    
    const handleSelectAll = (checked: boolean) => {
        if (!checked) { setSelectedIds(new Set()); return; }
        const allIds = new Set<string>();
        const collect = (nodes: TreeNode[]) => nodes.forEach(n => { allIds.add(n.id); if (n.children) collect(n.children); });
        collect(treeData);
        setSelectedIds(allIds);
    };
    
    const handleApply = useCallback(async (range: {start: Date, end: Date}, type: ReportType) => {
        setLoading(true);
        setError(null);
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

    const handleReportTypeChange = (newType: ReportType) => {
        setReportType(newType);
        setFlatData([]);
        handleApply(dateRange, newType);
        checkDataIntegrity(newType);
    };
    
    useEffect(() => {
        if (cache.spSearchTerms.data.length === 0 && !cache.spSearchTerms.filters) {
            const end = new Date();
            const start = new Date();
            start.setDate(end.getDate() - 7);
            handleApply({ start, end }, reportType);
        }
    }, [handleApply, cache.spSearchTerms, reportType]);
    
    const handleApplyDateRange = (newRange: { start: Date; end: Date }) => {
        setDateRange(newRange);
        setDatePickerOpen(false);
        handleApply(newRange, reportType);
    };
    
    const handleFetchMissingDay = async (date: string) => {
        setFetchStatus(prev => ({ ...prev, [date]: 'fetching' }));
        const source = reportType === 'SP' ? 'searchTermReport' : reportType === 'SB' ? 'sbSearchTermReport' : 'sdTargetingReport';
        try {
            const response = await fetch('/api/database/fetch-missing-day', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, date }),
            });
            if (!response.ok) throw new Error((await response.json()).error);
            setFetchStatus(prev => ({ ...prev, [date]: 'success' }));
            handleApply(dateRange, reportType);
            setMissingDates(prev => prev.filter(d => d !== date));
        } catch (err) {
            setFetchStatus(prev => ({ ...prev, [date]: 'error' }));
            alert(`Failed to fetch data for ${date}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };
    
    const renderFetchButton = (date: string) => {
        const status = fetchStatus[date] || 'idle';
        let text = 'Fetch';
        let disabled = false;
        switch (status) {
            case 'fetching': text = 'Fetching...'; disabled = true; break;
            case 'success': text = 'Success!'; disabled = true; break;
            case 'error': text = 'Error - Retry'; disabled = false; break;
        }
        return <button style={styles.fetchButton} onClick={() => handleFetchMissingDay(date)} disabled={disabled}>{text}</button>;
    };

    const formatDateRangeDisplay = (start: Date, end: Date) => {
        const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
        return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
    };

    const tabs: {id: ViewLevel, label: string}[] = [
        {id: 'campaigns', label: 'Campaigns'}, {id: 'adGroups', label: 'Ad groups'},
        {id: 'keywords', label: 'Keywords'}, {id: 'searchTerms', label: 'Search terms'},
    ];
    
    return (
        <div style={styles.viewContainer}>
            <header style={styles.header}>
                 <div style={styles.headerTop}>
                     <h1 style={styles.dateDisplay}>{formatDateRangeDisplay(dateRange.start, dateRange.end)}</h1>
                     <div style={{ position: 'relative' }}>
                         <button style={styles.dateButton} onClick={() => setDatePickerOpen(o => !o)}>Select Date Range</button>
                        {isDatePickerOpen && <DateRangePicker initialRange={dateRange} onApply={handleApplyDateRange} onClose={() => setDatePickerOpen(false)} />}
                    </div>
                 </div>
            </header>
            
            {missingDates.length > 0 && (
                <div style={styles.integrityCheckContainer}>
                    <h3 style={styles.integrityTitle}>⚠️ Data Integrity Check</h3>
                    <p>The following dates have missing {reportType} report data in the last 7 days (ending 2 days ago).</p>
                    {missingDates.map(date => (
                        <div key={date} style={styles.missingDateItem}>
                            <span>Missing data for: <strong>{date}</strong></span>
                            {renderFetchButton(date)}
                        </div>
                    ))}
                </div>
            )}
            
            <div style={styles.reportTypeSelector}>
                {(['SP', 'SB', 'SD'] as ReportType[]).map(type => (
                    <button 
                        key={type}
                        style={reportType === type ? {...styles.reportTypeButton, ...styles.reportTypeButtonActive} : styles.reportTypeButton}
                        onClick={() => handleReportTypeChange(type)}
                    >
                        {`Sponsored ${type === 'SP' ? 'Products' : type === 'SB' ? 'Brands' : 'Display'}`}
                    </button>
                ))}
            </div>
            <div style={styles.headerTabs}>
                 {tabs.map(tab => (
                    <button key={tab.id} style={viewLevel === tab.id ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton} onClick={() => setViewLevel(tab.id)}>
                        {tab.label}
                    </button>
                 ))}
            </div>
            
            {error && <div style={styles.error}>{error}</div>}

            <div style={styles.tableContainer}>
                {loading ? <div style={styles.message}>Loading...</div> :
                 sortedTreeData.length === 0 ? <div style={styles.message}>No data found for the selected criteria.</div> :
                 (
                    <table style={styles.table} ref={tableRef}>
                        <colgroup>
                            {columnWidths.map((width, i) => <col key={i} style={{width: `${width}px`}} />)}
                        </colgroup>
                        <thead>
                            <tr>
                                {columns.map((col, i) => (
                                    <th key={col.id} style={styles.th}>
                                        <div style={styles.thContent} onClick={() => requestSort(col.id)}>
                                            {col.label}
                                            {sortConfig.key === col.id && (
                                                <span style={styles.sortIcon}>{sortConfig.direction === 'ascending' ? '▲' : '▼'}</span>
                                            )}
                                        </div>
                                        <div style={styles.resizer} onMouseDown={(e) => handleMouseDown(i, e)} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedTreeData.map(node => (
                                <TreeNodeRow key={node.id} node={node} level={0} expandedIds={expandedIds} onToggle={handleToggle} selectedIds={selectedIds} onSelect={handleSelect} columns={columns} />
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}