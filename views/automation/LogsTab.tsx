// views/automation/LogsTab.tsx
import React from 'react';
import { formatPrice, formatNumber, formatPercent } from '../../utils';

const styles: { [key: string]: React.CSSProperties } = {
  contentTitle: { fontSize: '1.5rem', margin: 0, marginBottom: '20px' },
  tableContainer: {
    backgroundColor: 'var(--card-background-color)',
    borderRadius: 'var(--border-radius)',
    boxShadow: 'var(--box-shadow)',
    overflowX: 'auto',
  },
  logTable: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: { textAlign: 'left', padding: '12px 15px', borderBottom: '2px solid var(--border-color)', backgroundColor: '#f8f9fa', fontWeight: 600 },
  td: { padding: '12px 15px', borderBottom: '1px solid var(--border-color)', verticalAlign: 'top' },
};

const getStatusStyle = (status: string): React.CSSProperties => {
    let backgroundColor = '#e9ecef'; // default grey
    let color = '#495057';
    if (status === 'SUCCESS') {
        backgroundColor = '#d4edda';
        color = '#155724';
    } else if (status === 'FAILURE') {
        backgroundColor = '#f8d7da';
        color = '#721c24';
    } else if (status === 'NO_ACTION') {
        backgroundColor = '#fff3cd';
        color = '#856404';
    }
    return {
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '0.8rem',
        fontWeight: 500,
        backgroundColor,
        color,
        border: `1px solid ${color}`
    };
};

const formatDataWindow = (log: any) => {
    const range = log.details?.data_date_range;
    if (!range) return 'N/A';

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        } catch (e) { return 'Invalid Date'; }
    };

    const formatRange = (rangeObj: { start: string, end: string }) => {
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

const detailStyles: { [key: string]: React.CSSProperties } = {
    container: { whiteSpace: 'normal', wordBreak: 'break-word', backgroundColor: '#fff', padding: '15px', borderRadius: '4px', maxHeight: '400px', overflowY: 'auto', fontSize: '0.9rem', border: '1px solid #e9ecef' },
    detailsTable: { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' },
    detailsTh: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #dee2e6', fontWeight: 600, backgroundColor: '#f8f9fa' },
    detailsTd: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e9ecef', verticalAlign: 'top' },
    metricList: { margin: 0, padding: 0, listStyleType: 'none' },
    metricListItem: { marginBottom: '3px' },
    code: { fontFamily: 'monospace', backgroundColor: '#e9ecef', padding: '2px 4px', borderRadius: '3px' },
    pre: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', backgroundColor: '#e9ecef', padding: '15px', borderRadius: '4px', fontSize: '0.8rem' }
};

const ExecutionDetails = ({ details }: { details: any }) => {
    const { actions_by_campaign, ...otherDetails } = details || {};

    const formatMetricValue = (value: number, metric: string) => {
        switch (metric) {
            case 'acos': return formatPercent(value);
            case 'budgetUtilization': return `${Number(value).toFixed(2)}%`;
            case 'roas': return value.toFixed(2);
            case 'spend': case 'sales': return formatPrice(value);
            default: return formatNumber(value);
        }
    };
    const timeWindowText = (metric: any) => metric.timeWindow === 'TODAY' ? 'Today' : `${metric.timeWindow} days`;

    const allActions: any[] = [];
    if (actions_by_campaign) {
        for (const campaignId in actions_by_campaign) {
            const campaignData = actions_by_campaign[campaignId];
            (campaignData.changes || []).forEach((change: any) => {
                allActions.push({
                    type: change.oldBid !== undefined ? 'Bid Adjustment' : 'Budget Change',
                    campaignName: campaignData.campaignName || campaignId,
                    details: change.oldBid !== undefined
                        ? <>Target "<strong style={detailStyles.code}>{change.entityText}</strong>": {formatPrice(change.oldBid)} → {formatPrice(change.newBid)}</>
                        : <>Budget: {formatPrice(change.oldBudget)} → {formatPrice(change.newBudget)}</>,
                    reason: change.triggeringMetrics
                });
            });
            (campaignData.newNegatives || []).forEach((neg: any) => {
                allActions.push({
                    type: 'Negate Term',
                    campaignName: campaignData.campaignName || campaignId,
                    details: <>"<strong style={detailStyles.code}>{neg.searchTerm}</strong>" as <strong style={detailStyles.code}>{neg.matchType?.replace(/_/g, ' ')}</strong></>,
                    reason: neg.triggeringMetrics
                });
            });
        }
    }

    const hasOtherDetails = Object.keys(otherDetails).length > 0 && !(Object.keys(otherDetails).length === 1 && otherDetails.data_date_range);

    if (allActions.length === 0 && !hasOtherDetails) {
        return <div style={detailStyles.container}><p>No specific actions were recorded for this run.</p></div>;
    }

    return (
        <div style={detailStyles.container}>
            {allActions.length > 0 && (
                <table style={detailStyles.detailsTable}>
                    <thead>
                        <tr>
                            <th style={{...detailStyles.detailsTh, width: '25%'}}>Campaign</th>
                            <th style={{...detailStyles.detailsTh, width: '15%'}}>Action</th>
                            <th style={{...detailStyles.detailsTh, width: '30%'}}>Details</th>
                            <th style={{...detailStyles.detailsTh, width: '30%'}}>Triggering Metrics</th>
                        </tr>
                    </thead>
                    <tbody>
                        {allActions.map((action, index) => (
                            <tr key={index}>
                                <td style={detailStyles.detailsTd}>{action.campaignName}</td>
                                <td style={detailStyles.detailsTd}>{action.type}</td>
                                <td style={detailStyles.detailsTd}>{action.details}</td>
                                <td style={detailStyles.detailsTd}>
                                    {action.reason?.length > 0 && (
                                        <ul style={detailStyles.metricList}>
                                            {action.reason.map((metric: any, mIndex: number) => (
                                                <li key={mIndex} style={detailStyles.metricListItem}>
                                                    {metric.metric} ({timeWindowText(metric)}) was <strong>{formatMetricValue(metric.value, metric.metric)}</strong> ({metric.condition})
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {hasOtherDetails && (
                <div style={{marginTop: '15px'}}>
                    <h4 style={{margin: '0 0 10px 0'}}>Additional Details</h4>
                    <pre style={detailStyles.pre}>{JSON.stringify(otherDetails, null, 2)}</pre>
                </div>
            )}
        </div>
    );
};

interface LogsTabProps {
    logs: any[];
    loading: boolean;
    expandedLogId: number | null;
    setExpandedLogId: (id: number | null) => void;
}

export const LogsTab = ({ logs, loading, expandedLogId, setExpandedLogId }: LogsTabProps) => (
    <div>
        <h2 style={styles.contentTitle}>Automation History</h2>
        {loading ? <p>Loading logs...</p> : (
            <div style={{...styles.tableContainer, maxHeight: '600px', overflowY: 'auto'}}>
                <table style={styles.logTable}>
                    <thead><tr>
                        <th style={styles.th}>Time</th>
                        <th style={styles.th}>Rule</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Data Window</th>
                        <th style={styles.th}>Summary</th>
                    </tr></thead>
                    <tbody>
                        {logs.map(log => (
                           <React.Fragment key={log.id}>
                                <tr onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                    <td style={styles.td}>{new Date(log.run_at).toLocaleString()}</td>
                                    <td style={styles.td}>{log.rule_name}</td>
                                    <td style={styles.td}><span style={getStatusStyle(log.status)}>{log.status}</span></td>
                                    <td style={styles.td}>{formatDataWindow(log)}</td>
                                    <td style={styles.td}>{log.summary}</td>
                                </tr>
                                {expandedLogId === log.id && (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '15px 25px', backgroundColor: '#f8f9fa' }}>
                                            <h4 style={{ margin: '0 0 10px 0' }}>Execution Details</h4>
                                            <ExecutionDetails details={log.details} />
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </div>
);