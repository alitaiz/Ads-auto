import React, { useState, useMemo, useEffect, useCallback, useContext } from 'react';
import { SPSearchTermReportData, SPFilterOptions } from '../types';
import { formatNumber, formatPercent, formatPrice, getNested } from '../utils';
import { DataCacheContext } from '../contexts/DataCacheContext';

// --- Type Definitions for Hierarchical Data ---
interface Metrics {
    impressions: number;
    clicks: number;
    spend: number;
    sales: number;
    orders: number;
    units: number;
    asin?: string | null;
}

interface TreeNode {
    id: string;
    name: string;
    type: 'campaign' | 'adGroup' | 'keyword' | 'searchTerm';
    metrics: Metrics;
    children?: TreeNode[];
}

// --- Styles ---
const styles: { [key: string]: React.CSSProperties } = {
    viewContainer: { padding: '20px', maxWidth: '100%', margin: '0 auto' },
    header: { marginBottom: '20px' },
    headerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' },
    dateDisplay: { fontSize: '1.5rem', fontWeight: '600' },
    headerTabs: { display: 'flex', gap: '5px', borderBottom: '1px solid var(--border-color)' },
    tabButton: { padding: '10px 15px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem', borderBottom: '3px solid transparent' },
    tabButtonActive: { color: 'var(--primary-color)', borderBottom: '3px solid var(--primary-color)', fontWeight: 600 },
    actionsBar: { display: 'flex', alignItems: 'center', gap: '15px', padding: '15px 0' },
    actionButton: { padding: '8px 15px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' },
    tableContainer: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', overflowX: 'auto' },
    table: { width: '100%', minWidth: '2200px', borderCollapse: 'collapse', tableLayout: 'fixed' },
    th: { padding: '12px 10px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', backgroundColor: '#f8f9fa', fontWeight: 600, whiteSpace: 'nowrap' },
    td: { padding: '10px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    nameCell: { display: 'flex', alignItems: 'center', gap: '8px' },
    expandIcon: { cursor: 'pointer', width: '15px', textAlign: 'center', transition: 'transform 0.2s' },
    statusCell: { display: 'flex', alignItems: 'center', gap: '5px' },
    statusDropdownIcon: { fontSize: '0.6em' },
    error: { color: 'var(--danger-color)', padding: '20px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)', marginTop: '20px' },
    message: { textAlign: 'center', padding: '50px', fontSize: '1.2rem', color: '#666' },
};

// --- Column Definitions ---
const columns = [
    { id: 'name', label: 'Name', width: '350px' },
    { id: 'products', label: 'Products', width: '200px' },
    { id: 'status', label: 'Status', width: '120px' },
    { id: 'costPerOrder', label: 'Cost per order', width: '120px' },
    { id: 'spend', label: 'Ad spend', width: '100px' },
    { id: 'clicks', label: 'Clicks', width: '100px' },
    { id: 'conversion', label: 'Conversion', width: '110px' },
    { id: 'orders', label: 'Orders', width: '100px' },
    { id: 'units', label: 'Units', width: '100px' },
    { id: 'cpc', label: 'CPC', width: '100px' },
    { id: 'sales', label: 'PPC sales', width: '110px' },
    { id: 'impressions', label: 'Impressions', width: '110px' },
    { id: 'sku', label: 'Same SKU/All SKU\'s', width: '150px' },
    { id: 'acos', label: 'ACOS', width: '100px' },
    { id: 'profit', label: 'Profit', width: '100px' },
    { id: 'tos', label: 'Top-of-search impression share', width: '200px' },
    { id: 'breakEvenAcos', label: 'Break even ACOS', width: '140px' },
    { id: 'breakEvenBid', label: 'Break Even Bid', width: '130px' },
    { id: 'dailyBudget', label: 'Daily budget', width: '120px' },
    { id: 'budgetUtil', label: 'Budget utilization', width: '140px' },
    { id: 'currentBid', label: 'Current bid', width: '120px' },
];


// --- Helper Functions ---
const addMetrics = (target: Metrics, source: Metrics) => {
    target.impressions += source.impressions;
    target.clicks += source.clicks;
    target.spend += source.spend;
    target.sales += source.sales;
    target.orders += source.orders;
    target.units += source.units;
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

const buildHierarchy = (flatData: SPSearchTermReportData[]): TreeNode[] => {
    const campaignMap = new Map<number, TreeNode>();
    flatData.forEach(row => {
        const rowMetrics = createMetrics(row);

        // Campaign Level
        if (!campaignMap.has(row.campaignId)) {
            campaignMap.set(row.campaignId, {
                id: `c-${row.campaignId}`,
                name: row.campaignName,
                type: 'campaign',
                metrics: { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, units: 0 },
                children: [],
            });
        }
        const campaignNode = campaignMap.get(row.campaignId)!;
        addMetrics(campaignNode.metrics, rowMetrics);

        // Ad Group Level
        let adGroupNode = campaignNode.children!.find(c => c.id === `ag-${row.adGroupId}`);
        if (!adGroupNode) {
            adGroupNode = {
                id: `ag-${row.adGroupId}`,
                name: row.adGroupName,
                type: 'adGroup',
                metrics: { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, units: 0 },
                children: [],
            };
            campaignNode.children!.push(adGroupNode);
        }
        addMetrics(adGroupNode.metrics, rowMetrics);

        // Keyword Level
        let keywordNode = adGroupNode.children!.find(c => c.id === `k-${row.targeting}`);
        if (!keywordNode) {
            keywordNode = {
                id: `k-${row.targeting}`,
                name: `${row.targeting} (${row.matchType.toLowerCase()})`,
                type: 'keyword',
                metrics: { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, units: 0 },
                children: [],
            };
            adGroupNode.children!.push(keywordNode);
        }
        addMetrics(keywordNode.metrics, rowMetrics);

        // Search Term Level
        keywordNode.children!.push({
            id: `st-${row.customerSearchTerm}`,
            name: row.customerSearchTerm,
            type: 'searchTerm',
            metrics: rowMetrics,
        });
    });
    return Array.from(campaignMap.values());
};


// --- Recursive Row Component ---
const TreeNodeRow: React.FC<{
    node: TreeNode;
    level: number;
    expandedIds: Set<string>;
    onToggle: (id: string) => void;
    selectedIds: Set<string>;
    onSelect: (id: string, checked: boolean) => void;
}> = ({ node, level, expandedIds, onToggle, selectedIds, onSelect }) => {
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    
    const { impressions, clicks, spend, sales, orders, units, asin } = node.metrics;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const acos = sales > 0 ? spend / sales : 0;
    const conversion = clicks > 0 ? orders / clicks : 0;
    const costPerOrder = orders > 0 ? spend / orders : 0;
    const profit = sales - spend;

    const renderCell = (columnId: string) => {
        switch (columnId) {
            case 'name': return (
                <div style={{ ...styles.nameCell, paddingLeft: `${level * 25}px` }}>
                    <input type="checkbox" checked={selectedIds.has(node.id)} onChange={e => onSelect(node.id, e.target.checked)} />
                    <span style={{ ...styles.expandIcon, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', opacity: hasChildren ? 1 : 0 }} onClick={hasChildren ? () => onToggle(node.id) : undefined}>{hasChildren ? '►' : ''}</span>
                    <span>🇺🇸</span><span>SP</span><span>-</span><span>{node.name}</span>
                </div>
            );
            case 'products': return node.type === 'adGroup' ? asin || '—' : '—';
            case 'status': return <div style={styles.statusCell}>Active <span style={styles.statusDropdownIcon}>▼</span></div>;
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
            <tr style={node.type !== 'searchTerm' ? { backgroundColor: '#fdfdfd' } : {}}>
                {columns.map(col => <td key={col.id} style={{ ...styles.td, ...(col.id === 'name' && { fontWeight: 500 }) }} title={node.name}>{renderCell(col.id)}</td>)}
            </tr>
            {isExpanded && hasChildren && node.children!.map(child => (
                <TreeNodeRow key={child.id} node={child} level={level + 1} expandedIds={expandedIds} onToggle={onToggle} selectedIds={selectedIds} onSelect={onSelect} />
            ))}
        </>
    );
};

// --- Main View Component ---
export function SPSearchTermsView() {
    const { cache, setCache } = useContext(DataCacheContext);
    const [flatData, setFlatData] = useState<SPSearchTermReportData[]>(cache.spSearchTerms.data || []);
    const [treeData, setTreeData] = useState<TreeNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    
    const [filterOptions, setFilterOptions] = useState<SPFilterOptions>({ asins: [], dates: [] });
    const [selectedAsin, setSelectedAsin] = useState<string>(cache.spSearchTerms.filters?.asin || '');
    const [startDate, setStartDate] = useState<string>(cache.spSearchTerms.filters?.startDate || (() => {
        const d = new Date(); d.setDate(d.getDate() - 8); return d.toISOString().split('T')[0];
    })());
    const [endDate, setEndDate] = useState<string>(cache.spSearchTerms.filters?.endDate || (() => {
        const d = new Date(); d.setDate(d.getDate() - 2); return d.toISOString().split('T')[0];
    })());
    

    useEffect(() => {
        if (flatData.length > 0) {
            setTreeData(buildHierarchy(flatData));
        } else {
            setTreeData([]);
        }
    }, [flatData]);
    
    const handleToggle = (id: string) => {
        setExpandedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };
    
    const handleSelect = (id: string, checked: boolean) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (checked) newSet.add(id);
            else newSet.delete(id);
            return newSet;
        });
    };
    
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const allIds = new Set<string>();
            const collectIds = (nodes: TreeNode[]) => {
                nodes.forEach(node => {
                    allIds.add(node.id);
                    if (node.children) collectIds(node.children);
                });
            };
            collectIds(treeData);
            setSelectedIds(allIds);
        } else {
            setSelectedIds(new Set());
        }
    };
    
    const handleApply = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let url = `/api/sp-search-terms?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
            if (selectedAsin) url += `&asin=${encodeURIComponent(selectedAsin)}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error((await response.json()).error);
            const data: SPSearchTermReportData[] = await response.json();
            setFlatData(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred.');
            setFlatData([]);
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate, selectedAsin]);
    
     useEffect(() => {
        handleApply();
    }, []);

    return (
        <div style={styles.viewContainer}>
            <header style={styles.header}>
                 <div style={styles.headerTop}>
                     <h1 style={styles.dateDisplay}>2 September 2025</h1>
                 </div>
                 <div style={styles.headerTabs}>
                     <button style={styles.tabButton}>Portfolios</button>
                     <button style={styles.tabButton}>Campaigns</button>
                     <button style={styles.tabButton}>Ad groups</button>
                     <button style={styles.tabButton}>Keywords</button>
                     <button style={{...styles.tabButton, ...styles.tabButtonActive}}>Search terms</button>
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
                            {columns.map(c => <col key={c.id} style={{width: c.width}} />)}
                        </colgroup>
                        <thead>
                            <tr>
                                <th style={styles.th}><input type="checkbox" onChange={e => handleSelectAll(e.target.checked)} /></th>
                                {columns.slice(1).map(c => <th key={c.id} style={styles.th}>{c.label}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {treeData.map(node => (
                                <TreeNodeRow key={node.id} node={node} level={0} expandedIds={expandedIds} onToggle={handleToggle} selectedIds={selectedIds} onSelect={handleSelect} />
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}