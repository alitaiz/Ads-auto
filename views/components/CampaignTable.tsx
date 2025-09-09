import React, { useState } from 'react';
import { CampaignWithMetrics, CampaignState, AdGroupWithMetrics, KeywordWithMetrics, SearchTermPerformanceData } from '../../types';
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
        whiteSpace: 'nowrap',
    },
    td: {
        padding: '12px 15px',
        borderBottom: '1px solid var(--border-color)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
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
    capitalize: { textTransform: 'capitalize' },
    expandCell: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' },
    expandIcon: { transition: 'transform 0.2s', width: '12px' },
    subTableContainer: { backgroundColor: '#f8f9fa', padding: '15px 25px 15px 50px' },
    subTable: { width: '100%', borderCollapse: 'collapse' },
    subTh: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #dee2e6', fontWeight: 600, fontSize: '0.9em', whiteSpace: 'nowrap' },
    subTd: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e9ecef', fontSize: '0.9em', whiteSpace: 'nowrap' },
    subError: { color: 'var(--danger-color)', padding: '10px' },
    subLoader: { padding: '20px', textAlign: 'center' },
    indentedCell: { paddingLeft: '30px' },
    doubleIndentedCell: { paddingLeft: '60px' },
};

type SortableKeys = keyof CampaignWithMetrics;

interface CampaignTableProps {
    campaigns: CampaignWithMetrics[];
    onUpdateCampaign: (campaignId: number, update: { state?: CampaignState; budget?: { amount: number } }) => void;
    sortConfig: { key: SortableKeys; direction: 'ascending' | 'descending' } | null;
    onRequestSort: (key: SortableKeys) => void;
    expandedIds: { campaign: number | null, adGroup: number | null, keyword: number | null };
    onToggleExpand: (level: 'campaign' | 'adGroup' | 'keyword', id: number) => void;
    adGroups: Record<number, AdGroupWithMetrics[]>;
    keywords: Record<number, KeywordWithMetrics[]>;
    searchTerms: Record<number, SearchTermPerformanceData[]>;
    loadingState: { adGroups: number | null, keywords: number | null, searchTerms: number | null };
    errorState: { adGroups: string | null, keywords: string | null, searchTerms: string | null };
}

const formatPercent = (value?: number) => (value && isFinite(value)) ? `${(value * 100).toFixed(2)}%` : '0.00%';
const formatRoAS = (value?: number) => (value && isFinite(value)) ? `${value.toFixed(2)}` : '0.00';
const calcCPO = (spend?: number, orders?: number) => (orders && spend) ? formatPrice(spend / orders) : formatPrice(0);
const calcConvRate = (orders?: number, clicks?: number) => (clicks && orders) ? formatPercent(orders / clicks) : '0.00%';

const SearchTermTable = ({ keywordId, searchTerms, loadingState, errorState }: any) => {
    if (loadingState.searchTerms === keywordId) return <div style={styles.subLoader}>Loading search terms...</div>;
    if (errorState.searchTerms && loadingState.searchTerms === null) return <div style={styles.subError}>{errorState.searchTerms}</div>;
    const terms = searchTerms[keywordId];
    if (!terms) return null;
    if (terms.length === 0) return <div style={{...styles.subLoader, color: '#666'}}>No search term data found.</div>;
    return (
        <table style={styles.subTable}>
            <thead><tr>
                <th style={{...styles.subTh, ...styles.doubleIndentedCell}}>Search Term</th><th style={styles.subTh}>Spend</th><th style={styles.subTh}>Clicks</th>
                <th style={styles.subTh}>Orders</th><th style={styles.subTh}>Sales</th><th style={styles.subTh}>ACoS</th>
            </tr></thead>
            <tbody>{terms.map(st => (
                <tr key={st.customerSearchTerm}>
                    <td style={{...styles.subTd, ...styles.doubleIndentedCell}}>{st.customerSearchTerm}</td><td style={styles.subTd}>{formatPrice(st.spend)}</td>
                    <td style={styles.subTd}>{formatNumber(st.clicks)}</td><td style={styles.subTd}>{formatNumber(st.sevenDayTotalOrders)}</td>
                    <td style={styles.subTd}>{formatPrice(st.sevenDayTotalSales)}</td><td style={styles.subTd}>{formatPercent(st.sevenDayAcos)}</td>
                </tr>
            ))}</tbody>
        </table>
    );
};

const KeywordTable = ({ adGroupId, keywords, expandedIds, onToggleExpand, searchTerms, loadingState, errorState }: any) => {
    if (loadingState.keywords === adGroupId) return <div style={styles.subLoader}>Loading keywords...</div>;
    if (errorState.keywords && loadingState.keywords === null) return <div style={styles.subError}>{errorState.keywords}</div>;
    const kws = keywords[adGroupId];
    if (!kws) return null;
    if (kws.length === 0) return <div style={{...styles.subLoader, color: '#666'}}>No keywords found.</div>;

    return (
        <table style={styles.subTable}>
            <thead><tr>
                <th style={{...styles.subTh, ...styles.indentedCell}}>Keyword</th><th style={styles.subTh}>Status</th><th style={styles.subTh}>Bid</th><th style={styles.subTh}>Spend</th><th style={styles.subTh}>Clicks</th>
                <th style={styles.subTh}>Orders</th><th style={styles.subTh}>Sales</th><th style={styles.subTh}>ACoS</th>
            </tr></thead>
            <tbody>{kws.map((kw: KeywordWithMetrics) => (
                <React.Fragment key={kw.keywordId}>
                    <tr>
                        <td style={{...styles.subTd, ...styles.indentedCell}}>
                            <div style={styles.expandCell} onClick={() => onToggleExpand('keyword', kw.keywordId)}>
                                <span style={{...styles.expandIcon, transform: expandedIds.keyword === kw.keywordId ? 'rotate(90deg)' : 'rotate(0deg)'}}>►</span>
                                <span>{kw.keywordText} ({kw.matchType})</span>
                            </div>
                        </td>
                        <td style={{...styles.subTd, ...styles.capitalize}}>{kw.state}</td><td style={styles.subTd}>{kw.bid ? formatPrice(kw.bid) : 'Default'}</td>
                        <td style={styles.subTd}>{formatPrice(kw.performance?.spend)}</td><td style={styles.subTd}>{formatNumber(kw.performance?.clicks)}</td>
                        <td style={styles.subTd}>{formatNumber(kw.performance?.orders)}</td><td style={styles.subTd}>{formatPrice(kw.performance?.sales)}</td>
                        <td style={styles.subTd}>{formatPercent(kw.performance?.acos)}</td>
                    </tr>
                    {expandedIds.keyword === kw.keywordId && <tr><td colSpan={8} style={{padding: 0, border:0}}><SearchTermTable keywordId={kw.keywordId} searchTerms={searchTerms} loadingState={loadingState} errorState={errorState} /></td></tr>}
                </React.Fragment>
            ))}</tbody>
        </table>
    );
};

const AdGroupTable = ({ campaignId, adGroups, expandedIds, onToggleExpand, keywords, searchTerms, loadingState, errorState }: any) => {
    if (loadingState.adGroups === campaignId) return <div style={styles.subLoader}>Loading ad groups...</div>;
    if (errorState.adGroups && loadingState.adGroups === null) return <div style={styles.subError}>{errorState.adGroups}</div>;
    const ags = adGroups[campaignId];
    if (!ags) return null;
    if (ags.length === 0) return <div style={{...styles.subLoader, color: '#666'}}>No ad groups found.</div>;

    return (
        <table style={styles.subTable}>
            <thead><tr>
                <th style={styles.subTh}>Ad Group</th><th style={styles.subTh}>Status</th><th style={styles.subTh}>Spend</th>
                <th style={styles.subTh}>Clicks</th><th style={styles.subTh}>Orders</th><th style={styles.subTh}>Sales</th>
                <th style={styles.subTh}>ACoS</th>
            </tr></thead>
            <tbody>{ags.map((ag: AdGroupWithMetrics) => (
                <React.Fragment key={ag.adGroupId}>
                    <tr>
                        <td style={styles.subTd}>
                            <div style={styles.expandCell} onClick={() => onToggleExpand('adGroup', ag.adGroupId)}>
                                <span style={{...styles.expandIcon, transform: expandedIds.adGroup === ag.adGroupId ? 'rotate(90deg)' : 'rotate(0deg)'}}>►</span>
                                <span>{ag.name}</span>
                            </div>
                        </td>
                        <td style={{...styles.subTd, ...styles.capitalize}}>{ag.state}</td>
                        <td style={styles.subTd}>{formatPrice(ag.performance?.spend)}</td>
                        <td style={styles.subTd}>{formatNumber(ag.performance?.clicks)}</td>
                        <td style={styles.subTd}>{formatNumber(ag.performance?.orders)}</td>
                        <td style={styles.subTd}>{formatPrice(ag.performance?.sales)}</td>
                        <td style={styles.subTd}>{formatPercent(ag.performance?.acos)}</td>
                    </tr>
                    {expandedIds.adGroup === ag.adGroupId && <tr><td colSpan={7} style={{padding:0, border:0}}><KeywordTable adGroupId={ag.adGroupId} keywords={keywords} expandedIds={expandedIds} onToggleExpand={onToggleExpand} searchTerms={searchTerms} loadingState={loadingState} errorState={errorState} /></td></tr>}
                </React.Fragment>
            ))}</tbody>
        </table>
    );
};


export function CampaignTable(props: CampaignTableProps) {
    const { campaigns, onUpdateCampaign, sortConfig, onRequestSort, expandedIds, onToggleExpand } = props;
    const [editingCell, setEditingCell] = useState<{ id: number; field: 'state' | 'budget' } | null>(null);
    const [tempValue, setTempValue] = useState<string | number>('');

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
    
    return (
        <div style={styles.tableContainer}>
            <table style={styles.table}>
                <thead><tr>
                    <th style={styles.th} onClick={() => onRequestSort('name')}>Campaign Name</th>
                    <th style={styles.th} onClick={() => onRequestSort('state')}>Status</th>
                    <th style={styles.th} onClick={() => onRequestSort('dailyBudget')}>Budget</th>
                    <th style={styles.th} onClick={() => onRequestSort('spend')}>Spend</th>
                    <th style={styles.th} onClick={() => onRequestSort('sales')}>Sales</th>
                    <th style={styles.th} onClick={() => onRequestSort('orders')}>Orders</th>
                    <th style={styles.th}>CPO</th>
                    <th style={styles.th} onClick={() => onRequestSort('clicks')}>Clicks</th>
                    <th style={styles.th}>Conv. Rate</th>
                    <th style={styles.th} onClick={() => onRequestSort('acos')}>ACoS</th>
                    <th style={styles.th} onClick={() => onRequestSort('roas')}>RoAS</th>
                </tr></thead>
                <tbody>
                    {campaigns.map(campaign => (
                        <React.Fragment key={campaign.campaignId}>
                            <tr>
                                <td style={styles.td} title={campaign.name}>
                                    <div style={styles.expandCell} onClick={() => onToggleExpand('campaign', campaign.campaignId)}>
                                        <span style={{...styles.expandIcon, transform: expandedIds.campaign === campaign.campaignId ? 'rotate(90deg)' : 'rotate(0deg)'}}>
                                            {campaigns.length > 0 ? '►' : ''}
                                        </span>
                                        <span>{campaign.name}</span>
                                    </div>
                                </td>
                                <td style={{ ...styles.td, cursor: 'pointer' }} onClick={() => handleCellClick(campaign, 'state')}>
                                    {editingCell?.id === campaign.campaignId && editingCell.field === 'state' ? (
                                        <select style={styles.select} value={tempValue} onChange={(e) => setTempValue(e.target.value)} onBlur={() => handleUpdate(campaign.campaignId)} onKeyDown={(e) => handleKeyDown(e, campaign.campaignId)} autoFocus>
                                            <option value="enabled">Enabled</option><option value="paused">Paused</option><option value="archived">Archived</option>
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
                                <td style={styles.td}>{calcCPO(campaign.spend, campaign.orders)}</td>
                                <td style={styles.td}>{formatNumber(campaign.clicks)}</td>
                                <td style={styles.td}>{calcConvRate(campaign.orders, campaign.clicks)}</td>
                                <td style={styles.td}>{formatPercent(campaign.acos)}</td>
                                <td style={styles.td}>{formatRoAS(campaign.roas)}</td>
                            </tr>
                            {expandedIds.campaign === campaign.campaignId && (
                                <tr><td colSpan={11} style={{padding: 0, borderTop: 0}}>
                                    <div style={styles.subTableContainer}>
                                        <AdGroupTable campaignId={campaign.campaignId} {...props} />
                                    </div>
                                </td></tr>
                            )}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}