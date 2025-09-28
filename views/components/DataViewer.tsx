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

export function DataViewer() {
    const { dataKey } = useParams<{ dataKey: string }>();
    const [data, setData] = useState<any[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [title, setTitle] = useState('Loaded Data');

    useEffect(() => {
        if (dataKey) {
            const jsonData = sessionStorage.getItem(dataKey);
            if (jsonData) {
                try {
                    setData(JSON.parse(jsonData));
                    sessionStorage.removeItem(dataKey); // Clean up immediately after reading

                    if (dataKey.includes('st')) setTitle('Search Term Report Data');
                    else if (dataKey.includes('stream')) setTitle('Stream Data');
                    else if (dataKey.includes('sat')) setTitle('Sales & Traffic Data');

                } catch (e) {
                    setError('Failed to parse data from storage.');
                }
            } else {
                setError('No data found for this view. This can happen if the page is refreshed or accessed directly.');
            }
        }
    }, [dataKey]);

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
                            {headers.map(header => <th key={header} style={styles.th}>{header.replace(/([A-Z])/g, ' $1')}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, index) => (
                            <tr key={index}>
                                {headers.map(header => (
                                    <td key={`${header}-${index}`} style={styles.td}>
                                        {JSON.stringify(row[header])}
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
            <h1 style={styles.header}>{title}</h1>
            {renderContent()}
        </div>
    );
}