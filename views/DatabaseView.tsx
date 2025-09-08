import React, { useState } from 'react';

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        padding: '20px',
        maxWidth: '1400px',
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
    queryContainer: {
        backgroundColor: 'var(--card-background-color)',
        borderRadius: 'var(--border-radius)',
        boxShadow: 'var(--box-shadow)',
        padding: '20px',
    },
    warningBox: {
        backgroundColor: '#fffbe6',
        border: '1px solid #ffe58f',
        borderRadius: '4px',
        padding: '15px',
        marginBottom: '20px',
        color: '#614700',
    },
    textarea: {
        width: '100%',
        minHeight: '150px',
        padding: '10px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
        fontFamily: 'monospace',
        resize: 'vertical',
    },
    button: {
        padding: '10px 20px',
        border: 'none',
        borderRadius: '4px',
        backgroundColor: 'var(--primary-color)',
        color: 'white',
        fontSize: '1rem',
        cursor: 'pointer',
        marginTop: '10px',
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

const DEFAULT_QUERY = `SELECT id, event_type, received_at 
FROM raw_stream_events 
ORDER BY received_at DESC 
LIMIT 10;`;

export function DatabaseView() {
    const [query, setQuery] = useState(DEFAULT_QUERY);
    const [results, setResults] = useState<any[]>([]);
    const [columns, setColumns] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasRun, setHasRun] = useState(false);

    const handleRunQuery = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setResults([]);
        setColumns([]);
        setHasRun(true);

        try {
            const response = await fetch('/api/db-query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'An unknown error occurred.');
            }

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
                <h1 style={styles.title}>Database Viewer</h1>
                <p style={styles.subtitle}>Directly query the PostgreSQL database. Use this for debugging and data exploration.</p>
            </header>

            <div style={styles.queryContainer}>
                <div style={styles.warningBox}>
                    <strong>⚠️ Security Warning:</strong> For your protection, only read-only `SELECT` statements are permitted. Any other type of query (e.g., UPDATE, DELETE, INSERT) will be rejected by the server.
                </div>
                <form onSubmit={handleRunQuery}>
                    <label htmlFor="sql-query" style={{ fontWeight: 'bold', marginBottom: '10px', display: 'block' }}>
                        SQL Query:
                    </label>
                    <textarea
                        id="sql-query"
                        style={styles.textarea}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Enter your SELECT query here..."
                    />
                    <button type="submit" style={styles.button} disabled={loading}>
                        {loading ? 'Running...' : 'Run Query'}
                    </button>
                </form>
            </div>

            <div style={styles.resultsContainer}>
                {loading && <div style={styles.message}>Loading results...</div>}
                {error && <div style={styles.error} role="alert">{error}</div>}
                
                {!loading && !error && hasRun && results.length === 0 && (
                    <div style={styles.message}>Query executed successfully. No rows returned.</div>
                )}

                {!loading && !error && results.length > 0 && (
                    <div style={styles.tableContainer}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    {columns.map(col => <th key={col} style={styles.th}>{col}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                        {columns.map(col => (
                                            <td key={`${rowIndex}-${col}`} style={styles.td}>
                                                {renderCell(row[col])}
                                            </td>
                                        ))}
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
