// views/automation/LogsTab.tsx
import React from 'react';

const styles: { [key: string]: React.CSSProperties } = {
  contentTitle: { fontSize: '1.5rem', margin: 0, marginBottom: '20px' },
  tableContainer: {
    backgroundColor: 'var(--card-background-color)',
    borderRadius: 'var(--border-radius)',
    boxShadow: 'var(--box-shadow)',
    overflowX: 'auto',
  },
  logTable: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: { textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border-color)' },
  td: { padding: '8px', borderBottom: '1px solid var(--border-color)'},
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
                                            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', backgroundColor: '#e9ecef', padding: '15px', borderRadius: '4px', maxHeight: '300px', overflowY: 'auto', fontSize: '0.8rem' }}>
                                                {JSON.stringify(log.details, null, 2)}
                                            </pre>
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
