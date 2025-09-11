import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CampaignWithMetrics, CampaignState, AdGroup, AutomationRule } from '../../types';
import { formatPrice, formatNumber } from '../../utils';

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
    },
    th: {
        padding: '12px 15px',
        textAlign: 'left',
        borderBottom: '2px solid var(--border-color)',
        backgroundColor: '#f8f9fa',
        fontWeight: 600,
        cursor: 'pointer',
        position: 'relative',
        whiteSpace: 'nowrap',
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
    adGroupSubTableContainer: {
        backgroundColor: '#f8f9fa',
        padding: '15px 25px 15px 50px', // Indent the sub-table
    },
    adGroupSubTable: {
        width: '100%',
        borderCollapse: 'collapse',
    },
    adGroupTh: {
        textAlign: 'left',
        padding: '8px',
        borderBottom: '1px solid #dee2e6',
        fontWeight: 600,
    },
    adGroupTd: {
        textAlign: 'left',
        padding: '8px',
        borderBottom: '1px solid #e9ecef',
    },
    subError: {
        color: 'var(--danger-color)',
        padding: '10px'
    }
};

type SortableKeys = keyof CampaignWithMetrics;

interface CampaignTableProps {
    campaigns: CampaignWithMetrics[];
    onUpdateCampaign: (campaignId: number, update: { state?: CampaignState; budget?: { amount: number } }) => void;
    sortConfig: { key: SortableKeys; direction: 'ascending' | 'descending' } | null;
    onRequestSort: (key: SortableKeys) => void;
    expandedCampaignId: number | null;
    onToggleExpand: (campaignId: number) => void;
    adGroups: Record<number, AdGroup[]>;
    loadingAdGroups: number | null;
    adGroupError: string | null;
    campaignName: string;
    automationRules: AutomationRule[];
    onUpdateRuleAssignment: (campaignId: number, ruleType: 'BID_ADJUSTMENT' | 'SEARCH_TERM_AUTOMATION', newRuleId: string) => void;
}

const SortableHeader = ({
    label, sortKey, sortConfig, onRequestSort,
}: {
    label: string; sortKey: SortableKeys; sortConfig: CampaignTableProps['sortConfig']; onRequestSort: CampaignTableProps['onRequestSort'];
}) => {
    const isSorted = sortConfig?.key === sortKey;
    const directionIcon = sortConfig?.direction === 'ascending' ? '▲' : '▼';

    return (
        <th style={styles.th} onClick={() => onRequestSort(sortKey)}>
            {label}
            {isSorted && <span style={styles.sortIcon}>{directionIcon}</span>}
        </th>
    );
};

export function CampaignTable({
    campaigns, onUpdateCampaign, sortConfig, onRequestSort,
    expandedCampaignId, onToggleExpand, adGroups, loadingAdGroups, adGroupError, campaignName,
    automationRules, onUpdateRuleAssignment
}: CampaignTableProps) {
    const [editingCell, setEditingCell] = useState<{ id: number; field: 'state' | 'budget' } | null>(null);
    const [tempValue, setTempValue] = useState<string | number>('');

    const bidAdjustmentRules = useMemo(() => automationRules.filter(r => r.rule_type === 'BID_ADJUSTMENT'), [automationRules]);
    const searchTermRules = useMemo(() => automationRules.filter(r => r.rule_type === 'SEARCH_TERM_AUTOMATION'), [automationRules]);

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
    
    const formatPercent = (value?: number) => (value ? `${(value * 100).toFixed(2)}%` : '0.00%');
    const formatRoAS = (value?: number) => (value ? `${value.toFixed(2)}` : '0.00');

    const renderAdGroupSubTable = (campaignId: number) => {
        if (loadingAdGroups === campaignId) return <div style={{ padding: '20px' }}>Loading ad groups...</div>;
        if (adGroupError && expandedCampaignId === campaignId) return <div style={styles.subError}>Error: {adGroupError}</div>;

        const currentAdGroups = adGroups[campaignId];
        if (!currentAdGroups) return null;

        return (
            <div style={styles.adGroupSubTableContainer}>
                {currentAdGroups.length > 0 ? (
                     <table style={styles.adGroupSubTable}>
                        <thead>
                            <tr>
                                <th style={{...styles.adGroupTh, width: '60%'}}>Ad Group Name</th>
                                <th style={{...styles.adGroupTh, width: '20%'}}>Status</th>
                                <th style={{...styles.adGroupTh, width: '20%'}}>Default Bid</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentAdGroups.map(ag => (
                                <tr key={ag.adGroupId}>
                                    <td style={styles.adGroupTd}>
                                        <Link 
                                            to={`/adgroups/${ag.adGroupId}/keywords`} 
                                            state={{ adGroupName: ag.name, campaignName: campaignName }}
                                            style={styles.link}
                                        >
                                            {ag.name}
                                        </Link>
                                    </td>
                                    <td style={{...styles.adGroupTd, textTransform: 'capitalize'}}>{ag.state}</td>
                                    <td style={styles.adGroupTd}>{formatPrice(ag.defaultBid)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div>No ad groups found in this campaign.</div>
                )}
            </div>
        );
    };
    
    const totalColumns = 12;
    
    return (
        <div style={styles.tableContainer}>
            <table style={styles.table}>
                 <colgroup>
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '8%' }} />
                </colgroup>
                <thead>
                    <tr>
                        <SortableHeader label="Campaign Name" sortKey="name" sortConfig={sortConfig} onRequestSort={onRequestSort} />
                        <SortableHeader label="Status" sortKey="state" sortConfig={sortConfig} onRequestSort={onRequestSort} />
                        <SortableHeader label="Daily Budget" sortKey="dailyBudget" sortConfig={sortConfig} onRequestSort={onRequestSort} />
                        <SortableHeader label="Spend" sortKey="spend" sortConfig={sortConfig} onRequestSort={onRequestSort} />
                        <SortableHeader label="Sales" sortKey="sales" sortConfig={sortConfig} onRequestSort={onRequestSort} />
                        <SortableHeader label="Orders" sortKey="orders" sortConfig={sortConfig} onRequestSort={onRequestSort} />
                        <SortableHeader label="Impressions" sortKey="impressions" sortConfig={sortConfig} onRequestSort={onRequestSort} />
                        <SortableHeader label="Clicks" sortKey="clicks" sortConfig={sortConfig} onRequestSort={onRequestSort} />
                        <SortableHeader label="ACoS" sortKey="acos" sortConfig={sortConfig} onRequestSort={onRequestSort} />
                        <SortableHeader label="RoAS" sortKey="roas" sortConfig={sortConfig} onRequestSort={onRequestSort} />
                        <th style={styles.th}>Bid Adjustment Rule</th>
                        <th style={styles.th}>Search Term Rule</th>
                    </tr>
                </thead>
                <tbody>
                    {campaigns.map(campaign => {
                        const currentBidRule = bidAdjustmentRules.find(r => r.scope.campaignIds?.includes(campaign.campaignId));
                        const currentSearchTermRule = searchTermRules.find(r => r.scope.campaignIds?.includes(campaign.campaignId));

                        return (
                        <React.Fragment key={campaign.campaignId}>
                            <tr>
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
                                <td style={styles.td}>{formatPrice(campaign.spend)}</td>
                                <td style={styles.td}>{formatPrice(campaign.sales)}</td>
                                <td style={styles.td}>{formatNumber(campaign.orders)}</td>
                                <td style={styles.td}>{formatNumber(campaign.impressions)}</td>
                                <td style={styles.td}>{formatNumber(campaign.clicks)}</td>
                                <td style={styles.td}>{formatPercent(campaign.acos)}</td>
                                <td style={styles.td}>{formatRoAS(campaign.roas)}</td>
                                <td style={styles.td}>
                                    <select
                                        value={currentBidRule?.id || 'none'}
                                        onChange={(e) => onUpdateRuleAssignment(campaign.campaignId, 'BID_ADJUSTMENT', e.target.value)}
                                        style={{...styles.select, width: '100%'}}
                                        title={currentBidRule?.name}
                                    >
                                        <option value="none">-- No Rule --</option>
                                        {bidAdjustmentRules.map(rule => (
                                            <option key={rule.id} value={rule.id}>{rule.name}</option>
                                        ))}
                                    </select>
                                </td>
                                 <td style={styles.td}>
                                     <select
                                        value={currentSearchTermRule?.id || 'none'}
                                        onChange={(e) => onUpdateRuleAssignment(campaign.campaignId, 'SEARCH_TERM_AUTOMATION', e.target.value)}
                                        style={{...styles.select, width: '100%'}}
                                        title={currentSearchTermRule?.name}
                                    >
                                        <option value="none">-- No Rule --</option>
                                        {searchTermRules.map(rule => (
                                            <option key={rule.id} value={rule.id}>{rule.name}</option>
                                        ))}
                                    </select>
                                </td>
                            </tr>
                            {expandedCampaignId === campaign.campaignId && (
                                <tr>
                                    <td colSpan={totalColumns} style={{padding: 0, borderTop: 0}}>
                                        {renderAdGroupSubTable(campaign.campaignId)}
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    )})}
                </tbody>
            </table>
        </div>
    );
}