// views/components/DataViewer.tsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: '20px',
        backgroundColor: '#f0f2f2',
        minHeight: '100vh',
    },
    header: {
        fontSize: '1.5rem',
        color: '#0f1111',
        marginBottom: '15px',
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
        flexWrap: 'wrap'
    },
    dateRange: {
        fontSize: '1rem',
        fontWeight: 'normal',
        color: '#555',
        backgroundColor: '#e9ecef',
        padding: '5px 10px',
        borderRadius: '6px',
    },
    tableContainer: {
        overflowX: 'auto',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '0.85rem',
    },
    th: {
        padding: '10px 12px',
        textAlign: 'left',
        borderBottom: '2px solid #ddd',
        backgroundColor: '#f8f9fa',
        fontWeight: 600,
        textTransform: 'capitalize',
    },
    td: {
        padding: '10px 12px',
        borderBottom: '1px solid #ddd',
        whiteSpace: 'nowrap',
    },
    message: {
        padding: '20px',
        fontSize: '1rem',
        color: '#666',
    },
};


// Helper to format headers for readability (e.g., snake_case or camelCase to Title Case)
const formatHeader = (header: string) => {
    return header
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase());
};

// Helper to render cell content more intelligently
const renderCellContent = (value: any) => {
    if (value === null || typeof value === 'undefined') {
        return <i style={{ color: '#999' }}>null</i>;
    }
    if (typeof value === 'object') {
        return <pre style={{ margin: 0, fontSize: '0.8rem' }}>{JSON.stringify(value, null, 2)}</pre>;
    }
    if (typeof value === 'number') {
        if (value % 1 !== 0) { // Check if it's a float
            return value.toFixed(2);
        }
        return value.toLocaleString();
    }
    // For strings, just display them. This avoids formatting IDs with commas.
    return String(value);
};


export function DataViewer() {
    const { dataKey } = useParams<{ dataKey: string }>();
    const [data, setData] = useState<any[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [title, setTitle] = useState('Loaded Data');
    const [dateRange, setDateRange] = useState<{ startDate: string, endDate: string } | null>(null);

    useEffect(() => {
        if (dataKey) {
            const jsonData = sessionStorage.getItem(dataKey);
            if (jsonData) {
                try {
                    const storedPayload = JSON.parse(jsonData);
                    
                    if (Array.isArray(storedPayload)) {
                        setData(storedPayload); // Handle old format
                    } else {
                        setData(storedPayload.data); // Handle new format
                        setDateRange(storedPayload.dateRange);
                    }
                    
                    sessionStorage.removeItem(dataKey); // Clean up immediately after reading

                    // FIX: Check for 'stream' before 'st' to avoid incorrect substring matching.
                    if (dataKey.includes('stream')) {
                        setTitle('Stream Data');
                    } else if (dataKey.includes('st')) {
                        setTitle('Search Term Report Data');
                    } else if (dataKey.includes('sat')) {
                        setTitle('Sales & Traffic Data');
                    }

                } catch (e) {
                    setError('Failed to parse data from storage.');
                }
            } else {
                setError('No data found for this view. This can happen if the page is refreshed or accessed directly.');
            }
        }
    }, [dataKey]);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'
        });
    };
    
    const formattedDateRange = dateRange
        ? `${formatDate(dateRange.startDate)} - ${formatDate(dateRange.endDate)}`
        : '';


    const renderContent = () => {
        if (error) {
            return <p style={styles.message}>{error}</p>;
        }
        if (!data) {
            return <p style={styles.message}>Loading data...</p>;
        }
        if (data.length === 0) {
            return <p style={styles.message}>No records to display.</p>;
        }

        const headers = Object.keys(data[0]);

        return (
            <div style={styles.tableContainer}>
                <table style={styles.table}>
                    <thead>
                        <tr>
                            {headers.map(header => <th key={header} style={styles.th}>{formatHeader(header)}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, index) => (
                            <tr key={index}>
                                {headers.map(header => (
                                    <td key={`${header}-${index}`} style={styles.td}>
                                        {renderCellContent(row[header])}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h1>{title}</h1>
                {formattedDateRange && <span style={styles.dateRange}>{formattedDateRange}</span>}
            </div>
            {renderContent()}
        </div>
    );
}