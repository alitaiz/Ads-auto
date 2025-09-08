import React, { useState } from 'react';

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        padding: '20px',
        maxWidth: '1600px',
        margin: '0 auto',
    },
    header: {
        marginBottom: '20px',
    },
    title: {
        fontSize: '2rem',
        margin: '0 0 5px 0',
    },
    subtitle: {
        fontSize: '1rem',
        color: '#666',
        margin: 0,
    },
    filterContainer: {
        backgroundColor: 'var(--card-background-color)',
        borderRadius: 'var(--border-radius)',
        boxShadow: 'var(--box-shadow)',
        padding: '20px',
    },
    viewSelector: {
        display: 'flex',
        gap: '10px',
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '20px',
    },
    viewButton: {
        padding: '10px 15px',
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        fontSize: '1rem',
        fontWeight: 500,
        color: '#555',
        borderBottom: '3px solid transparent',
        transition: 'color 0.2s, border-bottom-color 0.2s',
    },
    viewButtonActive: {
        color: 'var(--primary-color)',
        borderBottom: '3px solid var(--primary-color)',
    },
    filterGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px',
        alignItems: 'flex-end',
    },
    filterGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
    },
    label: {
        fontSize: '0.8rem',
        fontWeight: 500,
        color: '#333',
    },
    input: {
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
        width: '100%',
    },
    button: {
        padding: '10px 20px',
        border: 'none',
        borderRadius: '4px',
        backgroundColor: 'var(--primary-color)',
        color: 'white',
        fontSize: '1rem',
        cursor: 'pointer',
        height: '40px', 
    },
    resultsContainer: {
        marginTop: '20px',
    },
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
    },
    td: {
        padding: '12px 15px',
        borderBottom: '1px solid var(--border-color)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: 'monospace',
        fontSize: '0.9rem',
    },
    message: {
        textAlign: 'center',
        padding: '50px',
        fontSize: '1.2rem',
        color: '#666',
    },
    error: {
        color: 'var(--danger-color)',
        padding: '20px',
        backgroundColor: '#fdd',
        borderRadius: 'var(--border-radius)',
        marginTop: '20px',
        whiteSpace: 'pre-wrap',
    },
    integrityCheckContainer: {
        marginTop: '20px',
        padding: '15px',
        backgroundColor: '#fffbe6',
        border: '1px solid #ffe58f',
        borderRadius: 'var(--border-radius)',
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
};

type ViewType = 'streamEvents' | 'searchTermReport' | 'salesTrafficReport';

interface StreamFilters {
    eventType: string;
    startDate: string;
    endDate: string;
    campaignId: string;
    adGroupId: string;
    keywordId: string;
    limit: number;
    sortBy: 'received_at' | 'time_window_start';
    sortOrder: 'DESC' | 'ASC';
}

interface SearchTermFilters {
    startDate: string;
    endDate: string;
    limit: number;
}

interface SalesTrafficFilters {
    startDate: string;
    endDate: string;
    limit: number;
}

const getYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 2); // Default to 2 days ago for data availability
    return d.toISOString().split('T')[0];
};

export function DatabaseView() {
    const [currentView, setCurrentView] = useState<ViewType>('searchTermReport');
    
    const [streamFilters, setStreamFilters] = useState<StreamFilters>({
        eventType: '', startDate: getYesterday(), endDate: getYesterday(),
        campaignId: '', adGroupId: '', keywordId: '',
        limit: 100, sortBy: 'received_at', sortOrder: 'DESC',
    });

    const [searchTermFilters, setSearchTermFilters] = useState<SearchTermFilters>({
        startDate: getYesterday(), endDate: getYesterday(), limit: 100,
    });

    const [salesTrafficFilters, setSalesTrafficFilters] = useState<SalesTrafficFilters>({
        startDate: getYesterday(), endDate: getYesterday(), limit: 100,
    });

    const [results, setResults] = useState<any[]>([]);
    const [columns, setColumns] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasRun, setHasRun] = useState(false);
    const [missingDates, setMissingDates] = useState<string[]>([]);
    const [fetchStatus, setFetchStatus] = useState<Record<string, 'fetching' | 'success' | 'error' | 'idle'>>({});
    
    const handleFilterChange = (view: ViewType, field: string, value: string | number) => {
        if (view === 'streamEvents') setStreamFilters(prev => ({ ...prev, [field]: value }));
        else if (view === 'searchTermReport') setSearchTermFilters(prev => ({ ...prev, [field]: value }));
        else if (view === 'salesTrafficReport') setSalesTrafficFilters(prev => ({ ...prev, [field]: value }));
    };

    const checkForMissingDates = async () => {
        if (currentView === 'streamEvents') return; // Not applicable for stream events

        const body = {
            source: currentView,
            startDate: currentView === 'searchTermReport' ? searchTermFilters.startDate : salesTrafficFilters.startDate,
            endDate: currentView === 'searchTermReport' ? searchTermFilters.endDate : salesTrafficFilters.endDate,
        };

        try {
            const response = await fetch('/api/database/check-missing-dates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await response.json();
            if (response.ok) {
                setMissingDates(data.missingDates || []);
                setFetchStatus({}); // Reset statuses on new check
            }
        } catch (err) {
            console.error("Failed to check for missing dates:", err);
        }
    };

    const handleApplyFilters = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setResults([]);
        setColumns([]);
        setHasRun(true);
        setMissingDates([]);

        let endpoint = '';
        let body: any = {};

        switch(currentView) {
            case 'streamEvents':
                endpoint = '/api/events/query';
                body = streamFilters;
                break;
            case 'searchTermReport':
                endpoint = '/api/database/sp-search-terms';
                body = searchTermFilters;
                break;
            case 'salesTrafficReport':
                endpoint = '/api/database/sales-traffic';
                body = salesTrafficFilters;
                break;
        }

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'An unknown error occurred.');

            if (Array.isArray(data) && data.length > 0) {
                setColumns(Object.keys(data[0]));
                setResults(data);
            } else {
                setResults([]);
            }
            // After fetching results, check for missing dates in the range
            await checkForMissingDates();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to execute query.');
        } finally {
            setLoading(false);
        }
    };
    
    const handleFetchMissingDay = async (date: string) => {
        setFetchStatus(prev => ({ ...prev, [date]: 'fetching' }));
        try {
            const response = await fetch('/api/database/fetch-missing-day', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: currentView, date }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setFetchStatus(prev => ({ ...prev, [date]: 'success' }));
            // Remove the date from the missing list upon success
            setMissingDates(prev => prev.filter(d => d !== date));
        } catch (err) {
            setFetchStatus(prev => ({ ...prev, [date]: 'error' }));
            alert(`Failed to fetch data for ${date}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const renderCell = (value: any) => {
        if (value === null) return <i>NULL</i>;
        if (typeof value === 'object') return JSON.stringify(value, null, 2);
        return String(value);
    };

    const renderFilters = () => {
        switch(currentView) {
            case 'searchTermReport':
                return (
                    <div style={styles.filterGrid}>
                        <div style={styles.filterGroup}>
                            <label style={styles.label} htmlFor="st-startDate">Start Date</label>
                            <input type="date" id="st-startDate" style={styles.input} value={searchTermFilters.startDate} onChange={e => handleFilterChange('searchTermReport', 'startDate', e.target.value)} />
                        </div>
                        <div style={styles.filterGroup}>
                            <label style={styles.label} htmlFor="st-endDate">End Date</label>
                            <input type="date" id="st-endDate" style={styles.input} value={searchTermFilters.endDate} onChange={e => handleFilterChange('searchTermReport', 'endDate', e.target.value)} />
                        </div>
                        <div style={styles.filterGroup}>
                            <label style={styles.label} htmlFor="st-limit">Result Limit</label>
                            <select id="st-limit" style={styles.input} value={searchTermFilters.limit} onChange={e => handleFilterChange('searchTermReport', 'limit', Number(e.target.value))}>
                                <option value="100">100 rows</option><option value="500">500 rows</option><option value="1000">1000 rows</option>
                            </select>
                        </div>
                    </div>
                );
            case 'salesTrafficReport':
                return (
                     <div style={styles.filterGrid}>
                        <div style={styles.filterGroup}>
                            <label style={styles.label} htmlFor="sat-startDate">Start Date</label>
                            <input type="date" id="sat-startDate" style={styles.input} value={salesTrafficFilters.startDate} onChange={e => handleFilterChange('salesTrafficReport', 'startDate', e.target.value)} />
                        </div>
                        <div style={styles.filterGroup}>
                            <label style={styles.label} htmlFor="sat-endDate">End Date</label>
                            <input type="date" id="sat-endDate" style={styles.input} value={salesTrafficFilters.endDate} onChange={e => handleFilterChange('salesTrafficReport', 'endDate', e.target.value)} />
                        </div>
                        <div style={styles.filterGroup}>
                            <label style={styles.label} htmlFor="sat-limit">Result Limit</label>
                            <select id="sat-limit" style={styles.input} value={salesTrafficFilters.limit} onChange={e => handleFilterChange('salesTrafficReport', 'limit', Number(e.target.value))}>
                                <option value="100">100 rows</option><option value="500">500 rows</option><option value="1000">1000 rows</option>
                            </select>
                        </div>
                    </div>
                );
            case 'streamEvents':
            default:
                return (
                    <div style={styles.filterGrid}>
                        <div style={styles.filterGroup}>
                            <label style={styles.label} htmlFor="eventType">Event Type</label>
                            <select id="eventType" style={styles.input} value={streamFilters.eventType} onChange={e => handleFilterChange('streamEvents', 'eventType', e.target.value)}>
                                <option value="">All Types</option><option value="sp-traffic">SP Traffic</option><option value="sp-conversion">SP Conversion</option>
                            </select>
                        </div>
                        <div style={styles.filterGroup}>
                            <label style={styles.label} htmlFor="startDate">Start Date (Event Time)</label>
                            <input type="date" id="startDate" style={styles.input} value={streamFilters.startDate} onChange={e => handleFilterChange('streamEvents', 'startDate', e.target.value)} />
                        </div>
                        <div style={styles.filterGroup}>
                            <label style={styles.label} htmlFor="endDate">End Date (Event Time)</label>
                            <input type="date" id="endDate" style={styles.input} value={streamFilters.endDate} onChange={e => handleFilterChange('streamEvents', 'endDate', e.target.value)} />
                        </div>
                        <div style={styles.filterGroup}>
                            <label style={styles.label} htmlFor="campaignId">Campaign ID</label>
                            <input type="text" id="campaignId" style={styles.input} placeholder="e.g., 3179..." value={streamFilters.campaignId} onChange={e => handleFilterChange('streamEvents', 'campaignId', e.target.value)} />
                        </div>
                        <div style={styles.filterGroup}>
                            <label style={styles.label} htmlFor="limit">Result Limit</label>
                            <select id="limit" style={styles.input} value={streamFilters.limit} onChange={e => handleFilterChange('streamEvents', 'limit', Number(e.target.value))}>
                                <option value="100">100</option><option value="500">500</option><option value="1000">1000</option>
                            </select>
                        </div>
                        <div style={styles.filterGroup}>
                            <label style={styles.label} htmlFor="sortOrder">Sort Order</label>
                            <select id="sortOrder" style={styles.input} value={streamFilters.sortOrder} onChange={e => handleFilterChange('streamEvents', 'sortOrder', e.target.value)}>
                                <option value="DESC">Newest First</option><option value="ASC">Oldest First</option>
                            </select>
                        </div>
                    </div>
                );
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
            default: text = 'Fetch'; disabled = false; break;
        }

        return <button style={styles.fetchButton} onClick={() => handleFetchMissingDay(date)} disabled={disabled}>{text}</button>;
    };

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h1 style={styles.title}>Database Explorer</h1>
                <p style={styles.subtitle}>Directly query the raw data collected from Amazon APIs without writing SQL.</p>
            </header>

            <form onSubmit={handleApplyFilters} style={styles.filterContainer}>
                <div style={styles.viewSelector}>
                    <button type="button" style={currentView === 'streamEvents' ? {...styles.viewButton, ...styles.viewButtonActive} : styles.viewButton} onClick={() => setCurrentView('streamEvents')}>Stream Events</button>
                    <button type="button" style={currentView === 'searchTermReport' ? {...styles.viewButton, ...styles.viewButtonActive} : styles.viewButton} onClick={() => setCurrentView('searchTermReport')}>SP Search Term Report</button>
                    <button type="button" style={currentView === 'salesTrafficReport' ? {...styles.viewButton, ...styles.viewButtonActive} : styles.viewButton} onClick={() => setCurrentView('salesTrafficReport')}>Sales & Traffic Report</button>
                </div>
                
                {renderFilters()}
                
                <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                     <button type="submit" style={styles.button} disabled={loading}>
                        {loading ? 'Querying...' : 'Run Query'}
                    </button>
                </div>
            </form>

            {missingDates.length > 0 && (
                <div style={styles.integrityCheckContainer}>
                    <h3 style={styles.integrityTitle}>⚠️ Data Integrity Check</h3>
                    <p>The following dates have missing data in the selected range. You can fetch them individually.</p>
                    {missingDates.map(date => (
                        <div key={date} style={styles.missingDateItem}>
                            <span>Missing data for: <strong>{date}</strong></span>
                            {renderFetchButton(date)}
                        </div>
                    ))}
                </div>
            )}

            <div style={styles.resultsContainer}>
                {loading && <div style={styles.message}>Loading results...</div>}
                {error && <div style={styles.error} role="alert">{error}</div>}
                {!loading && !error && hasRun && results.length === 0 && <div style={styles.message}>No records found matching your criteria.</div>}
                {!loading && !error && results.length > 0 && (
                    <div style={styles.tableContainer}>
                        <table style={styles.table}>
                            <thead>
                                <tr>{columns.map(col => <th key={col} style={styles.th}>{col.replace(/_/g, ' ')}</th>)}</tr>
                            </thead>
                            <tbody>
                                {results.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                        {columns.map(col => <td key={`${rowIndex}-${col}`} style={styles.td}>{renderCell(row[col])}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}