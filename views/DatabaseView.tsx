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
        height: '40px', // Align with inputs
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
};

interface Filters {
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

const getYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
};

export function DatabaseView() {
    const [filters, setFilters] = useState<Filters>({
        eventType: '',
        startDate: getYesterday(),
        endDate: getYesterday(),
        campaignId: '',
        adGroupId: '',
        keywordId: '',
        limit: 100,
        sortBy: 'received_at',
        sortOrder: 'DESC',
    });
    const [results, setResults] = useState<any[]>([]);
    const [columns, setColumns] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasRun, setHasRun] = useState(false);
    
    const handleFilterChange = (field: keyof Filters, value: string | number) => {
        setFilters(prev => ({ ...prev, [field]: value }));
    };

    const handleApplyFilters = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setResults([]);
        setColumns([]);
        setHasRun(true);

        try {
            const response = await fetch('/api/events/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(filters),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'An unknown error occurred.');

            if (Array.isArray(data) && data.length > 0) {
                setColumns(Object.keys(data[0]));
                setResults(data);
            } else {
                setResults([]);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to execute query.');
        } finally {
            setLoading(false);
        }
    };

    const renderCell = (value: any) => {
        if (value === null) return <i>NULL</i>;
        if (typeof value === 'object') return JSON.stringify(value, null, 2);
        return String(value);
    };

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h1 style={styles.title}>Event Explorer</h1>
                <p style={styles.subtitle}>Query raw stream events from the database using powerful filters without writing SQL.</p>
            </header>

            <form onSubmit={handleApplyFilters} style={styles.filterContainer}>
                <div style={styles.filterGrid}>
                    <div style={styles.filterGroup}>
                        <label style={styles.label} htmlFor="eventType">Event Type</label>
                        <select id="eventType" style={styles.input} value={filters.eventType} onChange={e => handleFilterChange('eventType', e.target.value)}>
                            <option value="">All Types</option>
                            <option value="sp-traffic">SP Traffic</option>
                            <option value="sp-conversion">SP Conversion</option>
                        </select>
                    </div>
                     <div style={styles.filterGroup}>
                        <label style={styles.label} htmlFor="startDate">Start Date (time_window_start)</label>
                        <input type="date" id="startDate" style={styles.input} value={filters.startDate} onChange={e => handleFilterChange('startDate', e.target.value)} />
                    </div>
                     <div style={styles.filterGroup}>
                        <label style={styles.label} htmlFor="endDate">End Date (time_window_start)</label>
                        <input type="date" id="endDate" style={styles.input} value={filters.endDate} onChange={e => handleFilterChange('endDate', e.target.value)} />
                    </div>
                    <div style={styles.filterGroup}>
                        <label style={styles.label} htmlFor="campaignId">Campaign ID</label>
                        <input type="text" id="campaignId" style={styles.input} placeholder="e.g., 3179..." value={filters.campaignId} onChange={e => handleFilterChange('campaignId', e.target.value)} />
                    </div>
                    <div style={styles.filterGroup}>
                        <label style={styles.label} htmlFor="adGroupId">Ad Group ID</label>
                        <input type="text" id="adGroupId" style={styles.input} placeholder="e.g., 4969..." value={filters.adGroupId} onChange={e => handleFilterChange('adGroupId', e.target.value)} />
                    </div>
                    <div style={styles.filterGroup}>
                        <label style={styles.label} htmlFor="keywordId">Keyword ID</label>
                        <input type="text" id="keywordId" style={styles.input} placeholder="e.g., 4841..." value={filters.keywordId} onChange={e => handleFilterChange('keywordId', e.target.value)} />
                    </div>
                    <div style={styles.filterGroup}>
                        <label style={styles.label} htmlFor="limit">Result Limit</label>
                         <select id="limit" style={styles.input} value={filters.limit} onChange={e => handleFilterChange('limit', Number(e.target.value))}>
                            <option value="100">100 rows</option>
                            <option value="500">500 rows</option>
                            <option value="1000">1000 rows</option>
                        </select>
                    </div>
                    <div style={styles.filterGroup}>
                        <label style={styles.label} htmlFor="sortOrder">Sort Order</label>
                         <select id="sortOrder" style={styles.input} value={filters.sortOrder} onChange={e => handleFilterChange('sortOrder', e.target.value)}>
                            <option value="DESC">Newest First</option>
                            <option value="ASC">Oldest First</option>
                        </select>
                    </div>
                </div>
                <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                     <button type="submit" style={styles.button} disabled={loading}>
                        {loading ? 'Applying...' : 'Apply Filters'}
                    </button>
                </div>
            </form>

            <div style={styles.resultsContainer}>
                {loading && <div style={styles.message}>Loading results...</div>}
                {error && <div style={styles.error} role="alert">{error}</div>}
                {!loading && !error && hasRun && results.length === 0 && <div style={styles.message}>No events found matching your criteria.</div>}
                {!loading && !error && results.length > 0 && (
                    <div style={styles.tableContainer}>
                        <table style={styles.table}>
                            <thead>
                                <tr>{columns.map(col => <th key={col} style={styles.th}>{col}</th>)}</tr>
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