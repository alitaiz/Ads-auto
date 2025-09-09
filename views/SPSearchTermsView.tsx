import React, { useState, useMemo, useEffect, useCallback, useContext } from 'react';
import { SPSearchTermReportData } from '../types';
import { formatNumber, formatPercent, formatPrice } from '../utils';
import { DataCacheContext } from '../contexts/DataCacheContext';
import { DateRangePicker } from './components/DateRangePicker';
import { useResizableColumns, ResizableTh } from './components/ResizableTable';

// --- Type Definitions for Hierarchical Data ---
interface Metrics {
    impressions: number;
    clicks: number;
    spend: number;
    sales: number;
    orders: number;
    units: number;
    asins: Set<string>;
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
    keywordId?: number;
    bid?: number;
}

type ViewLevel = 'campaigns' | 'adGroups' | 'keywords' | 'searchTerms';

// --- Styles ---
const styles: { [key: string]: React.CSSProperties } = {
    viewContainer: { padding: '20px', maxWidth: '100%', margin: '0 auto' },
    header: { marginBottom: '20px' },
    headerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' },
    dateDisplay: { fontSize: '1.5rem', fontWeight: '600' },
    headerTabs: { display: 'flex', gap: '5px', borderBottom: '1px solid var(--border-color)' },
    tabButton: { padding: '10px 15px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem', borderBottom: '3px solid transparent', color: '#555', fontWeight: 500 },
    tabButtonActive: { color: 'var(--primary-color)', borderBottom: '3px solid var(--primary-color)', fontWeight: 600 },
    actionsBar: { display: 'flex', alignItems: 'center', gap: '15px', padding: '15px 0' },
    actionButton: { padding: '8px 15px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' },
    tableContainer: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', overflowX: 'auto' },
    table: { width: '100%', minWidth: '1600px', borderCollapse: 'collapse', tableLayout: 'fixed' },
    th: { padding: '12px 10px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', backgroundColor: '#f8f9fa', fontWeight: 600, whiteSpace: 'nowrap', userSelect: 'none' },
    td: { padding: '10px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    nameCell: { display: 'flex', alignItems: 'center', gap: '8px' },
    expandIcon: { cursor: 'pointer', width: '15px', textAlign: 'center', transition: 'transform 0.2s', userSelect: 'none' },
    statusCell: { display: 'flex', alignItems: 'center', gap: '5px' },
    statusDropdownIcon: { fontSize: '0.6em' },
    error: { color: 'var(--danger-color)', padding: '20px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)', marginTop: '20px' },
    message: { textAlign: 'center', padding: '50px', fontSize: '1.2rem', color: '#666' },
    dateButton: { padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '1rem', background: 'white', cursor: 'pointer' },
    thContent: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' },
    link: { textDecoration: 'none', color: 'var(--primary-color)', fontWeight: 500 },
    linkButton: { background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 'inherit', fontFamily: 'inherit' },
    input: { padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', width: '80px' },
    // Popover Styles
    popoverBackdrop: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.1)', zIndex: 998 },
    popover: { position: 'absolute', backgroundColor: 'white', boxShadow: 'var(--box-shadow)', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', zIndex: 999, padding: '15px', minWidth: '200px' },
    popoverHeader: { margin: '0 0 10px 0', fontSize: '1rem', fontWeight: 600 },
    popoverList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' },
};

// --- Column Definitions ---
const columns = [
    { id: 'name', label: 'Name', metricKey: 'name' },
    { id: 'products', label: 'Products', metricKey: null },
    { id: 'status', label: 'Status', metricKey: null },
    { id: 'spend', label: 'Ad spend', metricKey: 'spend' },
    { id: 'impressions', label: 'Impressions', metricKey: 'impressions' },
    { id: 'clicks', label: 'Clicks', metricKey: 'clicks' },
    { id: 'orders', label: 'Orders', metricKey: 'orders' },
    { id: 'units', label: 'Units', metricKey: 'units' },
    { id: 'cpc', label: 'CPC', metricKey: 'cpc' },
    { id: 'sales', label: 'PPC sales', metricKey: 'sales' },
    { id: 'currentBid', label: 'Current bid', metricKey: 'bid' },
    { id: 'sku', label: 'Same SKU/All SKU\'s', metricKey: null },
    { id: 'acos', label: 'ACOS', metricKey: 'acos' },
];

const initialColumnWidths = [350, 200, 120, 100, 110, 100, 100, 100, 100, 110, 110, 150, 100];

// --- Helper Functions ---
const addMetrics = (target: Metrics, source: Metrics) => {
    target.impressions += source.impressions;
    target.clicks += source.clicks;
    target.spend += source.spend;
    target.sales += source.sales;
    target.orders += source.orders;
    target.units += source.units;
    source.asins.forEach(asin => target.asins.add(asin));
};
const createMetrics = (row: SPSearchTermReportData): Metrics => ({
    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend,
    sales: row.sevenDayTotalSales,
    orders: row.sevenDayTotalOrders,
    units: row.sevenDayTotalUnits,
    asins: new Set(row.asin ? [row.asin] : []),
});
const emptyMetrics = (): Metrics => ({ impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, units: 0, asins: new Set() });

const buildHierarchyByLevel = (flatData: SPSearchTermReportData[], level: ViewLevel): TreeNode[] => {
    const campaignMap = new Map<number, TreeNode>();

    flatData.forEach(row => {
        const rowMetrics = createMetrics(row);

        if (!campaignMap.has(row.campaignId)) {
            campaignMap.set(row.campaignId, { id: `c-${row.campaignId}`, name: row.campaignName, type: 'campaign', metrics: emptyMetrics(), children: [] });
        }
        const campaignNode = campaignMap.get(row.campaignId)!;
        addMetrics(campaignNode.metrics, rowMetrics);

        let adGroupNode = campaignNode.children!.find(c => c.id === `ag-${row.adGroupId}`);
        if (!adGroupNode) {
            adGroupNode = { id: `ag-${row.adGroupId}`, name: row.adGroupName, type: 'adGroup', metrics: emptyMetrics(), children: [] };
            campaignNode.children!.push(adGroupNode);
        }
        addMetrics(adGroupNode.metrics, rowMetrics);

        let keywordNode = adGroupNode.children!.find(c => c.id === `k-${row.targeting}`);
        if (!keywordNode) {
            keywordNode = { id: `k-${row.targeting}`, name: row.targeting, type: 'keyword', keywordType: 'keyword', matchType: row.matchType, metrics: emptyMetrics(), children: [], keywordId: row.keywordId, bid: row.keywordBid };
            adGroupNode.children!.push(keywordNode);
        }
        addMetrics(keywordNode.metrics, rowMetrics);

        keywordNode.children!.push({ id: `st-${row.customerSearchTerm}-${row.targeting}`, name: row.customerSearchTerm, type: 'searchTerm', keywordType: 'search term', metrics: rowMetrics });
    });

    switch (level) {
        case 'adGroups':
            return Array.from(campaignMap.values()).flatMap(c => c.children!);
        case 'keywords':
            return Array.from(campaignMap.values()).flatMap(c => c.children!).flatMap(ag => ag.children!);
        case 'searchTerms':
             const terms = new Map<string, Metrics>();
             flatData.forEach(row => {
                 const term = row.customerSearchTerm;
                 if (!terms.has(term)) terms.set(term, emptyMetrics());
                 addMetrics(terms.get(term)!, createMetrics(row));
             });
             return Array.from(terms.entries()).map(([name, metrics]) => ({ id: `st-${name}`, name, type: 'searchTerm', keywordType: 'search term', metrics }));
        case 'campaigns':
        default:
            return Array.from(campaignMap.values());
    }
};

// --- ASIN Popover Component ---
const AsinPopover: React.FC<{
    anchorEl: HTMLElement;
    asins: string[];
    onClose: () => void;
}> = ({ anchorEl, asins, onClose }) => {
    const rect = anchorEl.getBoundingClientRect();
    const style: React.CSSProperties = {
        ...styles.popover,
        top: rect.bottom + window.scrollY + 5,
        left: rect.left + window.scrollX,
    };

    return (
        <>
            <div style={styles.popoverBackdrop} onClick={onClose} />
            <div style={style}>
                <h4 style={styles.popoverHeader}>Associated ASINs</h4>
                <ul style={styles.popoverList}>
                    {asins.map(asin => (
                        <li key={asin}>
                            <a href={`https://www.amazon.com/dp/${asin}`} target="_blank" rel="noopener noreferrer" style={styles.link}>
                                {asin}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </>
    );
};

// --- Recursive Row Component ---
const TreeNodeRow: React.FC<{
    node: TreeNode;
    level: number;
    expandedIds: Set<string>;
    onToggle: (id: string) => void;
    selectedIds: Set<string>;
    onSelect: (id: string, checked: boolean) => void;
    onShowAsins: (el: HTMLElement, asins: string[]) => void;
    editingKeyword: { id: number; tempBid: string } | null;
    setEditingKeyword: React.Dispatch<React.SetStateAction<{ id: number; tempBid: string } | null>>;
    onUpdateKeywordBid: (keywordId: number, newBid: number) => void;

// Fix: The 'arguments' object is not available in arrow functions.
// Changed the component to accept a 'props' object which is then destructured inside.
// This allows for props to be correctly spread in the recursive call.
}> = React.memo((props) => {
    const { node, level, expandedIds, onToggle, selectedIds, onSelect, onShowAsins, editingKeyword, setEditingKeyword, onUpdateKeywordBid } = props;
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    
    const { impressions, clicks, spend, sales, orders, units } = node.metrics;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const acos = sales > 0 ? spend / sales : 0;

    const handleBidUpdate = (keywordId: number) => {
        if (!editingKeyword) return;
        const newBid = parseFloat(editingKeyword.tempBid);
        if (!isNaN(newBid) && newBid > 0) {
            onUpdateKeywordBid(keywordId, newBid);
        }
        setEditingKeyword(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent, keywordId: number) => {
        if (e.key === 'Enter') handleBidUpdate(keywordId);
        else if (e.key === 'Escape') setEditingKeyword(null);
    };


    const renderCell = (columnId: string) => {
        switch (columnId) {
            case 'name': {
                let nameSuffix = '';
                if(node.keywordType === 'keyword') nameSuffix = ` (${node.matchType?.toLowerCase()})`;
                else if(node.keywordType === 'search term') nameSuffix = ' (search term)';
                
                return (
                    <div style={{ ...styles.nameCell, paddingLeft: `${level * 25}px` }}>
                        {hasChildren || node.type !== 'searchTerm' ? <input type="checkbox" checked={selectedIds.has(node.id)} onChange={e => onSelect(node.id, e.target.checked)} /> : <div style={{width: '13px', height: '13px'}}/>}
                         {hasChildren ? (
                            <span style={{ ...styles.expandIcon, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }} onClick={() => onToggle(node.id)}>►</span>
                        ) : (
                            <span style={{...styles.expandIcon, cursor: 'default'}} />
                        )}
                        <span title={node.name}>{node.name}{nameSuffix}</span>
                    </div>
                );
            }
            case 'products': {
                if (node.type === 'campaign' || node.type === 'adGroup') {
                    const asinsArray = Array.from(node.metrics.asins);
                    if (asinsArray.length === 0) return '—';
                    if (asinsArray.length === 1) {
                        const asin = asinsArray[0];
                        return <a href={`https://www.amazon.com/dp/${asin}`} target="_blank" rel="noopener noreferrer" style={styles.link}>{asin}</a>;
                    }
                    return (
                        <button onClick={(e) => onShowAsins(e.currentTarget, asinsArray)} style={styles.linkButton}>
                            {asinsArray.length} ASINs
                        </button>
                    );
                }
                return '—';
            }
            case 'status': return node.type !== 'searchTerm' ? <div style={styles.statusCell}>Active <span style={styles.statusDropdownIcon}>▼</span></div> : '—';
            case 'spend': return spend < 0 ? `-${formatPrice(Math.abs(spend))}` : formatPrice(spend);
            case 'clicks': return formatNumber(clicks);
            case 'orders': return formatNumber(orders);
            case 'units': return formatNumber(units);
            case 'cpc': return formatPrice(cpc);
            case 'sales': return formatPrice(sales);
            case 'impressions': return formatNumber(impressions);
            case 'acos': return formatPercent(acos);
            case 'currentBid': {
                if (node.type !== 'keyword' || node.keywordId === undefined) return '—';
                const isEditing = editingKeyword?.id === node.keywordId;
                return (
                    <div 
                        style={{ cursor: 'pointer', minHeight: '24px' }}
                        onClick={() => !isEditing && setEditingKeyword({ id: node.keywordId!, tempBid: node.bid?.toString() || '' })}
                    >
                        {isEditing ? (
                             <input
                                type="number"
                                style={styles.input}
                                value={editingKeyword.tempBid}
                                onChange={(e) => setEditingKeyword({ ...editingKeyword, tempBid: e.target.value })}
                                onBlur={() => handleBidUpdate(node.keywordId!)}
                                onKeyDown={(e) => handleKeyDown(e, node.keywordId!)}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            node.bid ? formatPrice(node.bid) : '-'
                        )}
                    </div>
                );
            }
            default: return '—';
        }
    };
    
    return (
        <>
            <tr style={{ backgroundColor: level < 2 ? '#fdfdfd' : 'transparent' }}>
                <td style={styles.td}>{renderCell('name')}</td>
                {columns.slice(1).map(col => <td key={col.id} style={styles.td}>{renderCell(col.id)}</td>)}
            </tr>
            {isExpanded && hasChildren && node.children!.map(child => (
                <TreeNodeRow key={child.id} {...props} node={child} level={level + 1} />
            ))}
        </>
    );
});

// --- Main View Component ---
export function SPSearchTermsView() {
    const { cache, setCache } = useContext(DataCacheContext);
    const [flatData, setFlatData] = useState<SPSearchTermReportData[]>(cache.spSearchTerms.data || []);
    const [treeData, setTreeData] = useState<TreeNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [viewLevel, setViewLevel] = useState<ViewLevel>('campaigns');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' }>({ key: 'spend', direction: 'descending' });
    const { widths: columnWidths, getHeaderProps } = useResizableColumns(initialColumnWidths);
    
    const [dateRange, setDateRange] = useState(cache.spSearchTerms.filters ? { start: new Date(cache.spSearchTerms.filters.startDate), end: new Date(cache.spSearchTerms.filters.endDate)} : { start: new Date(), end: new Date() });
    const [isDatePickerOpen, setDatePickerOpen] = useState(false);
    const [asinPopover, setAsinPopover] = useState<{ anchorEl: HTMLElement, asins: string[] } | null>(null);
    const [editingKeyword, setEditingKeyword] = useState<{ id: number; tempBid: string } | null>(null);

    useEffect(() => {
        setTreeData(buildHierarchyByLevel(flatData, viewLevel));
        setExpandedIds(new Set());
        setSelectedIds(new Set());
    }, [flatData, viewLevel]);

    const requestSort = (key: string | null) => {
        if (!key) return; 
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const getMetricValue = (node: TreeNode, key: string): number | string => {
        const { clicks, spend, sales } = node.metrics;
        switch (key) {
            case 'name': return node.name;
            case 'cpc': return clicks > 0 ? spend / clicks : 0;
            case 'acos': return sales > 0 ? spend / sales : 0;
            case 'bid': return node.bid || 0;
            default: return (node.metrics as any)[key] || 0;
        }
    }

    const sortTree = useCallback((nodes: TreeNode[], config: typeof sortConfig): TreeNode[] => {
        if (!nodes || nodes.length === 0) return [];
        const sortedNodes = [...nodes].sort((a, b) => {
            const aValue = getMetricValue(a, config.key);
            const bValue = getMetricValue(b, config.key);
            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return config.direction === 'ascending' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
            }
            if (typeof aValue === 'number' && typeof bValue === 'number') {
                if (aValue < bValue) return config.direction === 'ascending' ? -1 : 1;
                if (aValue > bValue) return config.direction === 'ascending' ? 1 : -1;
            }
            return 0;
        });
        return sortedNodes.map(node => ({
            ...node,
            children: node.children ? sortTree(node.children, config) : undefined
        }));
    }, []);

    const sortedTreeData = useMemo(() => sortTree(treeData, sortConfig), [treeData, sortConfig, sortTree]);
    
    const handleToggle = (id: string) => setExpandedIds(prev => { const s = new Set(prev); if(s.has(id)) s.delete(id); else s.add(id); return s; });
    const handleSelect = (id: string, checked: boolean) => setSelectedIds(prev => { const s = new Set(prev); if(checked) s.add(id); else s.delete(id); return s; });
    
    const handleSelectAll = (checked: boolean) => {
        if (!checked) { setSelectedIds(new Set()); return; }
        const allIds = new Set<string>();
        const collect = (nodes: TreeNode[]) => nodes.forEach(n => { allIds.add(n.id); if (n.children) collect(n.children); });
        collect(treeData);
        setSelectedIds(allIds);
    };
    
    const formatDateForQuery = (d: Date) => d.toISOString().split('T')[0];

    const handleApply = useCallback(async (range: {start: Date, end: Date}) => {
        setLoading(true);
        setError(null);
        const startDate = formatDateForQuery(range.start);
        const endDate = formatDateForQuery(range.end);

        try {
            const url = `/api/sp-search-terms?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
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
    
     useEffect(() => {
        if(cache.spSearchTerms.data.length === 0) {
            const end = new Date();
            const start = new Date();
            start.setDate(end.getDate() - 7);
            handleApply({start, end});
        }
    }, [handleApply, cache.spSearchTerms.data.length]);
    
    const handleApplyDateRange = (newRange: { start: Date; end: Date }) => {
        setDateRange(newRange);
        setDatePickerOpen(false);
        handleApply(newRange);
    };

    const formatDateRangeDisplay = (start: Date, end: Date) => {
        const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
        return `${start.toLocaleDateString('en-US', options)}`;
    };

    const handleUpdateKeywordBid = async (keywordId: number, newBid: number) => {
        const originalFlatData = [...flatData];
        // Optimistic UI update
        setFlatData(prev => prev.map(row => row.keywordId === keywordId ? { ...row, keywordBid: newBid } : row));

        try {
            const profileId = localStorage.getItem('selectedProfileId');
            if (!profileId) throw new Error("No profile selected.");

            const response = await fetch('/api/amazon/keywords', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileId, updates: [{ keywordId, bid: newBid }] }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to update keyword bid.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Update failed.');
            setFlatData(originalFlatData); // Revert on failure
        }
    };


    const tabs: {id: ViewLevel, label: string}[] = [
        {id: 'campaigns', label: 'Campaigns'},
        {id: 'adGroups', label: 'Ad groups'},
        {id: 'keywords', label: 'Keywords'},
        {id: 'searchTerms', label: 'Search terms'},
    ];
    
    return (
        <div style={styles.viewContainer}>
            {asinPopover && (
                <AsinPopover
                    anchorEl={asinPopover.anchorEl}
                    asins={asinPopover.asins}
                    onClose={() => setAsinPopover(null)}
                />
            )}
            <header style={styles.header}>
                 <div style={styles.headerTop}>
                     <h1 style={styles.dateDisplay}>{formatDateRangeDisplay(dateRange.start, dateRange.end)}</h1>
                     <div style={{ position: 'relative' }}>
                         <button style={styles.dateButton} onClick={() => setDatePickerOpen(o => !o)}>Select Date Range</button>
                        {isDatePickerOpen && <DateRangePicker initialRange={dateRange} onApply={handleApplyDateRange} onClose={() => setDatePickerOpen(false)} />}
                    </div>
                 </div>
                 <div style={styles.headerTabs}>
                     <button style={styles.tabButton} disabled>Portfolios</button>
                     {tabs.map(tab => (
                        <button key={tab.id} style={viewLevel === tab.id ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton} onClick={() => setViewLevel(tab.id)}>
                            {tab.label}
                        </button>
                     ))}
                 </div>
            </header>
            
            <div style={styles.actionsBar}>
                <button style={styles.actionButton}><span>✎</span> Edit</button>
                <button style={styles.actionButton}><span>✓</span> Accept recommendations</button>
                <button style={styles.actionButton}><span>⤓</span></button>
                <button style={styles.actionButton}><span>❐</span></button>
            </div>
            
            {error && <div style={styles.error}>{error}</div>}

            <div style={styles.tableContainer}>
                {loading ? <div style={styles.message}>Loading...</div> :
                 treeData.length === 0 ? <div style={styles.message}>No data found for the selected criteria.</div> :
                 (
                    <table style={styles.table}>
                        <colgroup>
                             <col style={{ width: `${columnWidths[0]}px` }} />
                             {columns.slice(1).map((c, i) => <col key={c.id} style={{width: `${columnWidths[i+1]}px`}} />)}
                        </colgroup>
                        <thead>
                            <tr>
                                {columns.map((col, index) => (
                                    <ResizableTh
                                        key={col.id}
                                        index={index}
                                        getHeaderProps={getHeaderProps}
                                        onClick={() => requestSort(col.metricKey)}
                                    >
                                        <div style={styles.thContent}>
                                            <span>{col.label}</span>
                                            {sortConfig.key === col.metricKey && (
                                                <span>{sortConfig.direction === 'ascending' ? '▲' : '▼'}</span>
                                            )}
                                        </div>
                                    </ResizableTh>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sortedTreeData.map(node => (
                                <TreeNodeRow 
                                    key={node.id} 
                                    node={node} 
                                    level={0} 
                                    expandedIds={expandedIds} 
                                    onToggle={handleToggle} 
                                    selectedIds={selectedIds} 
                                    onSelect={handleSelect} 
                                    onShowAsins={(el, asins) => setAsinPopover({ anchorEl: el, asins })}
                                    editingKeyword={editingKeyword}
                                    setEditingKeyword={setEditingKeyword}
                                    onUpdateKeywordBid={handleUpdateKeywordBid}
                                />
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}