import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { CampaignWithMetrics, CampaignState, AutomationRule, MetricFilters } from '../../types';
import { formatPrice, formatNumber, formatPercent } from '../../utils';

const styles: { [key: string]: React.CSSProperties } = {
    tableContainer: {
        backgroundColor: 'var(--card-background-color)',
        borderRadius: 'var(--border-radius)',
        boxShadow: 'var(--box-shadow)',
        overflowX: 'auto',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed', // Important for resizable columns
    },
    th: {
        padding: '12px 15px',
        textAlign: 'left',
        borderBottom: '2px solid var(--border-color)',
        backgroundColor: '#f8f9fa',
        fontWeight: 600,
        position: 'relative',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    sortIcon: {
        marginLeft: '5px',
    },
    td: {
        padding: '12px 15px',
        borderBottom: '1px solid var(--border-color)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    link: {
        textDecoration: 'none',
        color: 'var(--primary-color)',
        fontWeight: 500,
    },
    input: {
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        width: '100px',
    },
    select: {
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
    },
    capitalize: {
        textTransform: 'capitalize',
    },
    expandCell: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer',
    },
    expandIcon: {
        transition: 'transform 0.2s',
    },
    logSubTableContainer: {
        backgroundColor: '#f8f9fa',
        padding: '15px 25px 15px 50px', // Indent the sub-table
    },
    logSubTable: {
        width: '100%',
        borderCollapse: 'collapse',
    },
    logTh: {
        textAlign: 'left',
        padding: '8px',
        borderBottom: '1px solid #dee2e6',
        fontWeight: 600,
    },
    logTd: {
        textAlign: 'left',
        padding: '8px',
        borderBottom: '1px solid #e9ecef',
        verticalAlign: 'top',
    },
    subError: {
        color: 'var(--danger-color)',
        padding: '20px'
    },
    detailsList: {
        margin: 0,
        paddingLeft: '20px',
        fontSize: '0.85rem',
        listStyleType: 'none',
    },
    metricList: {
        margin: '5px 0 10px 0',
        paddingLeft: '20px',
        fontSize: '0.8rem',
        color: '#555',
        borderLeft: '2px solid #ddd',
        listStyleType: 'circle',
    },
    metricListItem: {
        marginBottom: '3px',
    },
    ruleTagContainer: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        maxWidth: '250px'
    },
    ruleTag: {
        backgroundColor: '#e9ecef',
        color: '#495057',
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '0.8rem',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%',
    },
    noRuleText: {
        color: '#6c757d',
        fontStyle: 'italic',
    },
    ruleCellContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    editRuleButton: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        fontSize: '1rem',
        flexShrink: 0,
    },
    thFilter: {
        padding: '4px 8px',
        borderBottom: '2px solid var(--border-color)',
        backgroundColor: '#f8f9fa',
    },
    filterContainer: {
        display: 'flex',
        gap: '4px',
    },
    filterInput: {
        width: 'calc(50% - 4px)',
        padding: '4px',
        fontSize: '0.8rem',
        border: '1px solid #ccc',
        borderRadius: '3px',
        backgroundColor: 'white',
    },
};

type SortableKeys = keyof CampaignWithMetrics;

// --- Resizable Column Logic ---

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
  }
};

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


// Interfaces for the new, structured log details
interface TriggeringMetric {
  metric: 'spend' | 'sales' | 'acos' | 'orders' | 'clicks' | 'impressions' | 'roas' | 'budgetUtilization';
  timeWindow: number | 'TODAY';
  value: number;
  condition: string;
}
interface LogChange {
  entityText: string;
  oldBid?: number;
  newBid?: number;
  oldBudget?: number;
  newBudget?: number;
  triggeringMetrics: TriggeringMetric[];
}
interface LogNegative {
    searchTerm: string;
    matchType: string;
    triggeringMetrics: TriggeringMetric[];
}
interface DataDateRange {
    report?: { start: string; end: string };
    stream?: { start: string; end: string };
}
interface CampaignLogDetails {
  changes?: LogChange[];
  newNegatives?: LogNegative[];
  data_date_range?: DataDateRange;
}
interface AutomationLog {
    id: number;
    rule_name: string;
    run_at: string;
    status: string;
    summary: string;
    details: CampaignLogDetails;
}


interface CampaignTableProps {
    campaigns: CampaignWithMetrics[];
    onUpdateCampaign: (campaignId: number, update: { state?: CampaignState; budget?: { amount: number } }) => void;
    onEditRules: (campaignId: number, ruleType: 'BID_ADJUSTMENT' | 'SEARCH_TERM_AUTOMATION' | 'BUDGET_ACCELERATION' | 'SEARCH_TERM_HARVESTING' | 'AI_SEARCH_TERM_NEGATION') => void;
    sortConfig: { key: SortableKeys; direction: 'ascending' | 'descending' } | null;
    onRequestSort: (key: SortableKeys) => void;
    expandedCampaignId: number | null;
    onToggleExpand: (campaignId: number) => void;
    automationLogs: Record<number, AutomationLog[]>;
    loadingLogs: number | null;
    logsError: string | null;
    automationRules: AutomationRule[];
    selectedCampaignIds: Set<number>;
    onSelectCampaign: (campaignId: number, isSelected: boolean) => void;
    onSelectAll: (isSelected: boolean) => void;
    isAllSelected: boolean;
    metricFilters: MetricFilters;
    onMetricFilterChange: (key: keyof MetricFilters, type: 'min' | 'max', value: string) => void;
}

export function CampaignTable({
    campaigns, onUpdateCampaign, onEditRules, sortConfig, onRequestSort,
    expandedCampaignId, onToggleExpand, automationLogs, loadingLogs, logsError,
    automationRules,
    selectedCampaignIds, onSelectCampaign, onSelectAll, isAllSelected,
    metricFilters, onMetricFilterChange
}: CampaignTableProps) {
    const [editingCell, setEditingCell] = useState<{ id: number; field: 'state' | 'budget' } | null>(null);
    const [tempValue, setTempValue] = useState<string | number>('');

    const bidAdjustmentRules = useMemo(() => automationRules.filter(r => r.rule_type === 'BID_ADJUSTMENT'), [automationRules]);
    const searchTermRules = useMemo(() => automationRules.filter(r => r.rule_type === 'SEARCH_TERM_AUTOMATION'), [automationRules]);
    const aiSearchTermRules = useMemo(() => automationRules.filter(r => r.rule_type === 'AI_SEARCH_TERM_NEGATION'), [automationRules]);
    const searchTermHarvestingRules = useMemo(() => automationRules.filter(r => r.rule_type === 'SEARCH_TERM_HARVESTING'), [automationRules]);
    const budgetAccelerationRules = useMemo(() => automationRules.filter(r => r.rule_type === 'BUDGET_ACCELERATION'), [automationRules]);

    const resizableColumns = useMemo(() => [
        { id: 'name', label: 'Campaign Name', isSortable: true },
        { id: 'state', label: 'Status', isSortable: true },
        { id: 'dailyBudget', label: 'Daily Budget', isSortable: true },
        { id: 'adjustedSpend', label: 'Spend', isSortable: true },
        { id: 'sales', label: 'Sales', isSortable: true },
        { id: 'orders', label: 'Orders', isSortable: true },
        { id: 'impressions', label: 'Impressions', isSortable: true },
        { id: 'clicks', label: 'Clicks', isSortable: true },
        { id: 'acos', label: 'ACoS', isSortable: true },
        { id: 'roas', label: 'RoAS', isSortable: true },
        { id: 'bidAdjustmentRule', label: 'Bid Adjustment Rule', isSortable: false },
        { id: 'searchTermRule', label: 'Search Term Rule', isSortable: false },
        { id: 'aiSearchTermRule', label: 'AI Search Term Rule', isSortable: false },
        { id: 'searchTermHarvestingRule', label: 'Search Term Harvesting', isSortable: false },
        { id: 'budgetAccelerationRule', label: 'Budget Acceleration Rule', isSortable: false },
    ], []);

    const initialWidths = useMemo(() => [
        300, 100, 120, 120, 100, 100, 110, 100, 100, 100, 220, 220, 220, 220, 220
    ], []);

    const { widths, getHeaderProps, resizingColumnIndex } = useResizableColumns(initialWidths);

    const handleCellClick = (campaign: CampaignWithMetrics, field: 'state' | 'budget') => {
        setEditingCell({ id: campaign.campaignId, field });
        if (field === 'state') setTempValue(campaign.state);
        else if (field === 'budget') setTempValue(campaign.dailyBudget);
    };

    const handleUpdate = (campaignId: number) => {
        if (!editingCell) return;
        if (editingCell.field === 'state') onUpdateCampaign(campaignId, { state: tempValue as CampaignState });
        else if (editingCell.field === 'budget') {
            const newBudget = parseFloat(tempValue as string);
            if (!isNaN(newBudget) && newBudget > 0) onUpdateCampaign(campaignId, { budget: { amount: newBudget } });
        }
        setEditingCell(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent, campaignId: number) => {
        if (e.key === 'Enter') handleUpdate(campaignId);
        else if (e.key === 'Escape') setEditingCell(null);
    };
    
    const formatRoAS = (value?: number) => (value ? `${value.toFixed(2)}` : '0.00');

    const formatMetricValue = (value: number, metric: TriggeringMetric['metric']) => {
        switch (metric) {
            case 'acos':
                return formatPercent(value); // Expects a ratio e.g. 0.35 -> 35.00%
            case 'budgetUtilization':
                return `${Number(value).toFixed(2)}%`; // Expects a number e.g. 80 -> 80.00%
            case 'roas':
                return value.toFixed(2); // Expects a ratio e.g. 2.5 -> 2.50
            case 'spend':
            case 'sales':
                return formatPrice(value);
            default:
                return formatNumber(value);
        }
    };

    const formatDataWindow = (log: AutomationLog) => {
        const range = log.details?.data_date_range;
        if (!range) return 'N/A';
    
        const formatDate = (dateStr: string) => {
            try {
                return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
            } catch (e) { return 'Invalid Date'; }
        };
    
        const formatRange = (rangeObj?: { start: string, end: string }) => {
            if (!rangeObj || !rangeObj.start || !rangeObj.end) return null;
            const start = formatDate(rangeObj.start);
            const end = formatDate(rangeObj.end);
            return start === end ? start : `${start} - ${end}`;
        };
    
        const parts = [];
        const reportRange = formatRange(range.report);
        const streamRange = formatRange(range.stream);
    
        if (reportRange) parts.push(`Search Term Report: ${reportRange}`);
        if (streamRange) parts.push(`Stream: ${streamRange}`);
    
        return parts.length > 0 ? parts.join(', ') : 'N/A';
    };

    const renderLogDetails = (log: AutomationLog) => {
        const details = log.details;
        if (!details) return <span>{log.summary || 'No details available.'}</span>;

        const changes = details.changes || [];
        const newNegatives = details.newNegatives || [];
        
        if (changes.length === 0 && newNegatives.length === 0) {
            return <span>{log.summary}</span>;
        }
        
        return (
            <ul style={styles.detailsList}>
                {changes.map((change, index) => {
                    const timeWindowText = (metric: TriggeringMetric) => 
                        metric.timeWindow === 'TODAY' ? 'Today' : `${metric.timeWindow} days`;

                    // BUDGET ACCELERATION LOG
                    if (typeof change.oldBudget !== 'undefined' && typeof change.newBudget !== 'undefined') {
                        return (
                            <li key={`c-${index}`}>
                                Budget changed from {formatPrice(change.oldBudget)} to {formatPrice(change.newBudget)}
                                {(change.triggeringMetrics && change.triggeringMetrics.length > 0) && (
                                    <ul style={styles.metricList}>
                                        {change.triggeringMetrics.map((metric, mIndex) => (
                                            <li key={mIndex} style={styles.metricListItem}>
                                                {metric.metric} ({timeWindowText(metric)}) was <strong>{formatMetricValue(metric.value, metric.metric)}</strong> (Condition: {metric.condition})
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        );
                    }
                    // BID ADJUSTMENT LOG
                    if (typeof change.oldBid !== 'undefined' && typeof change.newBid !== 'undefined') {
                        return (
                             <li key={`c-${index}`}>
                                Target "{change.entityText}": bid changed from {formatPrice(change.oldBid)} to {formatPrice(change.newBid)}
                                {(change.triggeringMetrics && change.triggeringMetrics.length > 0) && (
                                    <ul style={styles.metricList}>
                                        {change.triggeringMetrics.map((metric, mIndex) => (
                                            <li key={mIndex} style={styles.metricListItem}>
                                                {metric.metric} ({timeWindowText(metric)}) was <strong>{formatMetricValue(metric.value, metric.metric)}</strong> (Condition: {metric.condition})
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        );
                    }
                    return null;
                })}
                {newNegatives.map((neg, index) => (
                    <li key={`n-${index}`}>
                         Negated "{neg.searchTerm}" as {neg.matchType?.replace(/_/g, ' ')}
                         <ul style={styles.metricList}>
                            {neg.triggeringMetrics.map((metric, mIndex) => (
                                <li key={mIndex} style={styles.metricListItem}>
                                    {metric.metric} ({metric.timeWindow} days) was <strong>{formatMetricValue(metric.value, metric.metric)}</strong> (Condition: {metric.condition})
                                </li>
                            ))}
                        </ul>
                    </li>
                ))}
            </ul>
        );
    };
    
    const renderAutomationLogsSubTable = (campaignId: number) => {
        if (loadingLogs === campaignId) return <div style={{ padding: '20px' }}>Loading logs...</div>;
        if (logsError && expandedCampaignId === campaignId) return <div style={styles.subError}>Error: {logsError}</div>;

        const currentLogs = automationLogs[campaignId];
        if (!currentLogs) return null;

        const filteredLogs = currentLogs.filter(log => log.status !== 'NO_ACTION');

        return (
            <div style={styles.logSubTableContainer}>
                {filteredLogs.length > 0 ? (
                     <table style={styles.logSubTable}>
                        <thead>
                            <tr>
                                <th style={{...styles.logTh, width: '18%'}}>Time</th>
                                <th style={{...styles.logTh, width: '18%'}}>Rule Name</th>
                                <th style={{...styles.logTh, width: '12%'}}>Status</th>
                                <th style={{...styles.logTh, width: '22%'}}>Data Window</th>
                                <th style={{...styles.logTh, width: '30%'}}>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLogs.map(log => (
                                <tr key={log.id}>
                                    <td style={styles.logTd}>{new Date(log.run_at).toLocaleString()}</td>
                                    <td style={styles.logTd}>{log.rule_name}</td>
                                    <td style={styles.logTd}>{log.status}</td>
                                    <td style={styles.logTd}>{formatDataWindow(log)}</td>
                                    <td style={styles.logTd}>{renderLogDetails(log)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div>No automation actions were taken for this campaign in the last 200 runs.</div>
                )}
            </div>
        );
    };
    
    const totalColumns = resizableColumns.length + 1;

    const FilterInputs = ({ filterKey, values, onChange, isPercentage = false }: { filterKey: any, values: any, onChange: any, isPercentage?: boolean }) => (
      <div style={styles.filterContainer}>
        <input
          type="number"
          placeholder="Min"
          style={styles.filterInput}
          value={values?.min ?? ''}
          onChange={(e) => onChange(filterKey, 'min', e.target.value)}
          onClick={e => e.stopPropagation()} // Prevent sorting when clicking input
          title={`Filter by minimum ${filterKey}${isPercentage ? ' (%)' : ''}`}
        />
        <input
          type="number"
          placeholder="Max"
          style={styles.filterInput}
          value={values?.max ?? ''}
          onChange={(e) => onChange(filterKey, 'max', e.target.value)}
          onClick={e => e.stopPropagation()}
          title={`Filter by maximum ${filterKey}${isPercentage ? ' (%)' : ''}`}
        />
      </div>
    );
    
    return (
        <div style={styles.tableContainer}>
            <table style={styles.table}>
                <colgroup>
                    <col style={{ width: '40px' }} />
                    {widths.map((width, index) => (
                        <col key={index} style={{ width: `${width}px` }} />
                    ))}
                </colgroup>
                <thead>
                    <tr>
                        <th style={{...styles.th, width: '40px'}}>
                            <input
                                type="checkbox"
                                onChange={(e) => onSelectAll(e.target.checked)}
                                checked={isAllSelected}
                                aria-label="Select all campaigns"
                            />
                        </th>
                        {resizableColumns.map((col, index) => {
                            const isSorted = sortConfig?.key === col.id;
                            const directionIcon = sortConfig?.direction === 'ascending' ? '▲' : '▼';
                            return (
                                <ResizableTh key={col.id} index={index} getHeaderProps={getHeaderProps} resizingColumnIndex={resizingColumnIndex}>
                                    <div
                                        onClick={() => col.isSortable && onRequestSort(col.id as SortableKeys)}
                                        style={{ display: 'flex', alignItems: 'center', cursor: col.isSortable ? 'pointer' : 'default' }}
                                    >
                                        {col.label}
                                        {isSorted && <span style={styles.sortIcon}>{directionIcon}</span>}
                                    </div>
                                </ResizableTh>
                            )
                        })}
                    </tr>
                    <tr>
                        <th style={styles.thFilter}></th>
                        {resizableColumns.map((col) => {
                            const filterableKeys: Array<keyof MetricFilters> = ['adjustedSpend', 'sales', 'orders', 'impressions', 'clicks', 'acos', 'roas'];
                            if (filterableKeys.includes(col.id as any)) {
                                return (
                                    <th key={`${col.id}-filter`} style={styles.thFilter}>
                                    <FilterInputs
                                        filterKey={col.id}
                                        values={metricFilters[col.id as keyof MetricFilters]}
                                        onChange={onMetricFilterChange}
                                        isPercentage={col.id === 'acos'}
                                    />
                                    </th>
                                );
                            }
                            return <th key={`${col.id}-filter`} style={styles.thFilter}></th>;
                        })}
                    </tr>
                </thead>
                <tbody>
                    {campaigns.length > 0 ? (
                        campaigns.map(campaign => {
                            const currentBidRules = bidAdjustmentRules.filter(r => r.scope.campaignIds?.some(id => String(id) === String(campaign.campaignId)));
                            const currentSearchTermRules = searchTermRules.filter(r => r.scope.campaignIds?.some(id => String(id) === String(campaign.campaignId)));
                            const currentAiSearchTermRules = aiSearchTermRules.filter(r => r.scope.campaignIds?.some(id => String(id) === String(campaign.campaignId)));
                            const currentHarvestingRules = searchTermHarvestingRules.filter(r => r.scope.campaignIds?.some(id => String(id) === String(campaign.campaignId)));
                            const currentBudgetRules = budgetAccelerationRules.filter(r => r.scope.campaignIds?.some(id => String(id) === String(campaign.campaignId)));

                            return (
                            <React.Fragment key={campaign.campaignId}>
                                <tr>
                                    <td style={styles.td}>
                                        <input
                                            type="checkbox"
                                            checked={selectedCampaignIds.has(campaign.campaignId)}
                                            onChange={(e) => onSelectCampaign(campaign.campaignId, e.target.checked)}
                                            onClick={e => e.stopPropagation()}
                                            aria-label={`Select campaign ${campaign.name}`}
                                        />
                                    </td>
                                    <td style={styles.td} title={campaign.name}>
                                        <div style={styles.expandCell} onClick={() => onToggleExpand(campaign.campaignId)}>
                                            <span style={{...styles.expandIcon, transform: expandedCampaignId === campaign.campaignId ? 'rotate(90deg)' : 'rotate(0deg)'}}>►</span>
                                            <span>{campaign.name}</span>
                                        </div>
                                    </td>
                                    <td style={{ ...styles.td, cursor: 'pointer' }} onClick={() => handleCellClick(campaign, 'state')}>
                                        {editingCell?.id === campaign.campaignId && editingCell.field === 'state' ? (
                                            <select style={styles.select} value={tempValue} onChange={(e) => setTempValue(e.target.value)} onBlur={() => handleUpdate(campaign.campaignId)} onKeyDown={(e) => handleKeyDown(e, campaign.campaignId)} autoFocus>
                                                <option value="enabled">Enabled</option> <option value="paused">Paused</option> <option value="archived">Archived</option>
                                            </select>
                                        ) : <span style={styles.capitalize}>{campaign.state}</span>}
                                    </td>
                                    <td style={{ ...styles.td, cursor: 'pointer' }} onClick={() => handleCellClick(campaign, 'budget')}>
                                        {editingCell?.id === campaign.campaignId && editingCell.field === 'budget' ? (
                                            <input type="number" style={styles.input} value={tempValue} onChange={(e) => setTempValue(e.target.value)} onBlur={() => handleUpdate(campaign.campaignId)} onKeyDown={(e) => handleKeyDown(e, campaign.campaignId)} autoFocus />
                                        ) : formatPrice(campaign.dailyBudget)}
                                    </td>
                                    <td style={styles.td}>{formatPrice(campaign.adjustedSpend)}</td>
                                    <td style={styles.td}>{formatPrice(campaign.sales)}</td>
                                    <td style={styles.td}>{formatNumber(campaign.orders)}</td>
                                    <td style={styles.td}>{formatNumber(campaign.impressions)}</td>
                                    <td style={styles.td}>{formatNumber(campaign.clicks)}</td>
                                    <td style={styles.td}>{formatPercent(campaign.acos)}</td>
                                    <td style={styles.td}>{formatRoAS(campaign.roas)}</td>
                                    <td style={styles.td}>
                                         <div style={styles.ruleCellContainer}>
                                            <button onClick={() => onEditRules(campaign.campaignId, 'BID_ADJUSTMENT')} title="Edit Rules" style={styles.editRuleButton}>✏️</button>
                                            <div style={styles.ruleTagContainer}>
                                                {currentBidRules.length > 0 ? (
                                                    currentBidRules.map(rule => (
                                                        <span key={rule.id} style={styles.ruleTag} title={rule.name}>{rule.name}</span>
                                                    ))
                                                ) : (
                                                    <span style={styles.noRuleText}>-- No Rule --</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                     <td style={styles.td}>
                                         <div style={styles.ruleCellContainer}>
                                            <button onClick={() => onEditRules(campaign.campaignId, 'SEARCH_TERM_AUTOMATION')} title="Edit Rules" style={styles.editRuleButton}>✏️</button>
                                             <div style={styles.ruleTagContainer}>
                                                {currentSearchTermRules.length > 0 ? (
                                                    currentSearchTermRules.map(rule => (
                                                        <span key={rule.id} style={styles.ruleTag} title={rule.name}>{rule.name}</span>
                                                    ))
                                                ) : (
                                                    <span style={styles.noRuleText}>-- No Rule --</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td style={styles.td}>
                                         <div style={styles.ruleCellContainer}>
                                            <button onClick={() => onEditRules(campaign.campaignId, 'AI_SEARCH_TERM_NEGATION')} title="Edit Rules" style={styles.editRuleButton}>✏️</button>
                                             <div style={styles.ruleTagContainer}>
                                                {currentAiSearchTermRules.length > 0 ? (
                                                    currentAiSearchTermRules.map(rule => (
                                                        <span key={rule.id} style={styles.ruleTag} title={rule.name}>{rule.name}</span>
                                                    ))
                                                ) : (
                                                    <span style={styles.noRuleText}>-- No Rule --</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td style={styles.td}>
                                         <div style={styles.ruleCellContainer}>
                                            <button onClick={() => onEditRules(campaign.campaignId, 'SEARCH_TERM_HARVESTING')} title="Edit Rules" style={styles.editRuleButton}>✏️</button>
                                             <div style={styles.ruleTagContainer}>
                                                {currentHarvestingRules.length > 0 ? (
                                                    currentHarvestingRules.map(rule => (
                                                        <span key={rule.id} style={styles.ruleTag} title={rule.name}>{rule.name}</span>
                                                    ))
                                                ) : (
                                                    <span style={styles.noRuleText}>-- No Rule --</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td style={styles.td}>
                                         <div style={styles.ruleCellContainer}>
                                            <button onClick={() => onEditRules(campaign.campaignId, 'BUDGET_ACCELERATION')} title="Edit Rules" style={styles.editRuleButton}>✏️</button>
                                            <div style={styles.ruleTagContainer}>
                                                {currentBudgetRules.length > 0 ? (
                                                    currentBudgetRules.map(rule => (
                                                        <span key={rule.id} style={styles.ruleTag} title={rule.name}>{rule.name}</span>
                                                    ))
                                                ) : (
                                                    <span style={styles.noRuleText}>-- No Rule --</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                {expandedCampaignId === campaign.campaignId && (
                                    <tr>
                                        <td colSpan={totalColumns} style={{padding: 0, borderTop: 0}}>
                                            {renderAutomationLogsSubTable(campaign.campaignId)}
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        )})
                    ) : (
                        <tr>
                            <td colSpan={totalColumns} style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                                No campaigns match your current filters.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}