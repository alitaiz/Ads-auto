import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { SPSearchTermReportData, SPFilterOptions } from '../types';
import { formatNumber, formatPercent, formatPrice, getNested } from '../utils';

const styles: { [key: string]: React.CSSProperties } = {
    viewContainer: {
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
    card: {
        backgroundColor: 'var(--card-background-color)',
        borderRadius: 'var(--border-radius)',
        boxShadow: 'var(--box-shadow)',
        padding: '15px',
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        flexWrap: 'wrap',
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
    },
    select: {
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
        minWidth: '200px',
    },
    primaryButton: {
        padding: '10px 20px',
        border: 'none',
        borderRadius: '4px',
        backgroundColor: 'var(--primary-color)',
        color: 'white',
        fontSize: '1rem',
        cursor: 'pointer',
        alignSelf: 'flex-end',
    },
    tableContainer: {
        backgroundColor: 'var(--card-background-color)',
        borderRadius: 'var(--border-radius)',
        boxShadow: 'var(--box-shadow)',
        overflowX: 'auto',
        marginTop: '20px',
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
        whiteSpace: 'nowrap',
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
    },
    link: {
        textDecoration: 'none',
        color: 'var(--primary-color)',
        fontWeight: 500,
    },
};

export function SPSearchTermsView() {
    const [filterOptions, setFilterOptions] = useState<SPFilterOptions>({ asins: [], dates: [] });
    const [selectedAsin, setSelectedAsin] = useState<string>('');
    const [startDate, setStartDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 8);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 2);
        return d.toISOString().split('T')[0];
    });
    const [data, setData] = useState<SPSearchTermReportData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hasAppliedFilters, setHasAppliedFilters] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: 'ascending' | 'descending' }>({ key: 'impressions', direction: 'descending' });

    useEffect(() => {
        const fetchFilters = async () => {
            try {
                setError(null);
                setLoading(true);
                const response = await fetch('/api/sp-search-terms-filters');
                if (!response.ok) {
                     const errorData = await response.json().catch(() => ({ error: 'Failed to fetch filter options.' }));
                     throw new Error(errorData.error);
                }
                const data: SPFilterOptions = await response.json();
                setFilterOptions(data);
            } catch (e) {
                if (e instanceof Error) setError(e.message);
                else setError('An unknown error occurred.');
            } finally {
                setLoading(false);
            }
        };
        fetchFilters();
    }, []);

    const handleApply = useCallback(async () => {
        if (!startDate || !endDate) return;
        if (new Date(startDate) > new Date(endDate)) {
            setError("Start date cannot be after end date.");
            return;
        }
        try {
            setHasAppliedFilters(true);
            setLoading(true);
            setError(null);
            let url = `/api/sp-search-terms?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
            if (selectedAsin) url += `&asin=${encodeURIComponent(selectedAsin)}`;
            const response = await fetch(url);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const data: SPSearchTermReportData[] = await response.json();
            setData(data);
        } catch (e) {
            if (e instanceof Error) setError(`Failed to fetch data: ${e.message}`);
            else setError('An unknown error occurred.');
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [selectedAsin, startDate, endDate]);

    const requestSort = (key: string) => {
        let direction: 'ascending' | 'descending' = 'descending';
        if (sortConfig.key === key && sortConfig.direction === 'descending') {
            direction = 'ascending';
        }
        setSortConfig({ key, direction });
    };

    const sortedData = useMemo(() => {
        let sortableItems = [...data];
        if (sortConfig.key !== null) {
            sortableItems.sort((a, b) => {
                const aValue = getNested(a, sortConfig.key!);
                const bValue = getNested(b, sortConfig.key!);
                if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [data, sortConfig]);

    const columns = [
        { id: 'asin', label: 'ASIN' },
        { id: 'campaignName', label: 'Campaign Name' },
        { id: 'customerSearchTerm', label: 'Customer Search Term' },
        { id: 'impressions', label: 'Impressions', format: formatNumber },
        { id: 'clicks', label: 'Clicks', format: formatNumber },
        { id: 'costPerClick', label: 'CPC', format: formatPrice },
        { id: 'spend', label: 'Spend', format: formatPrice },
        { id: 'sevenDayTotalSales', label: '7d Sales', format: formatPrice },
        { id: 'sevenDayAcos', label: '7d ACOS', format: formatPercent },
    ];

    const renderContent = () => {
        if (loading && !hasAppliedFilters && !error) return <div style={styles.message}>Loading filters...</div>;
        if (loading) return <div style={styles.message}>Loading data...</div>;
        if (error && !loading) return null;
        if (!hasAppliedFilters) return <div style={styles.message}>Please select filters and click "Apply" to view data.</div>;
        if (sortedData.length === 0) return <div style={styles.message}>No data available for the selected filters.</div>;

        return (
            <table style={styles.table}>
                <thead>
                    <tr>
                        {columns.map(col => (
                            <th key={col.id} style={{...styles.th, cursor: 'pointer'}} onClick={() => requestSort(col.id)}>
                                {col.label} {sortConfig.key === col.id ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : ''}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {sortedData.map((item, index) => (
                        <tr key={`${item.campaignName}-${item.customerSearchTerm}-${index}`}>
                            {columns.map(col => (
                                <td key={col.id} style={styles.td}>
                                    {col.id === 'asin' && item.asin ? (
                                        <a href={`https://www.amazon.com/dp/${item.asin}`} target="_blank" rel="noopener noreferrer" style={styles.link}>
                                            {item.asin}
                                        </a>
                                    ) : (
                                        col.format ? col.format(getNested(item, col.id)) : getNested(item, col.id)
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };

    const filtersDisabled = loading || !!error;

    return (
        <div style={styles.viewContainer}>
            <header style={styles.header}>
                <h1 style={styles.title}>Sponsored Products Search Term Report</h1>
                <p style={styles.subtitle}>Analyze the performance of search terms that triggered your ads.</p>
            </header>
            <div style={styles.card}>
                <div style={styles.filterGroup}>
                    <label style={styles.label} htmlFor="asin-select-sp">ASIN</label>
                    <select id="asin-select-sp" style={styles.select} value={selectedAsin} onChange={e => setSelectedAsin(e.target.value)} disabled={filtersDisabled || filterOptions.asins.length === 0}>
                        <option value="">All ASINs</option>
                        {filterOptions.asins.map(asin => <option key={asin} value={asin}>{asin}</option>)}
                    </select>
                </div>
                 <div style={styles.filterGroup}>
                    <label style={styles.label} htmlFor="start-date-sp">Start Date</label>
                    <input type="date" id="start-date-sp" style={styles.input} value={startDate} onChange={e => setStartDate(e.target.value)} disabled={filtersDisabled} />
                </div>
                <div style={styles.filterGroup}>
                    <label style={styles.label} htmlFor="end-date-sp">End Date</label>
                    <input type="date" id="end-date-sp" style={styles.input} value={endDate} onChange={e => setEndDate(e.target.value)} disabled={filtersDisabled} />
                </div>
                <button onClick={handleApply} style={styles.primaryButton} disabled={filtersDisabled || !startDate || !endDate}>
                    {loading ? 'Loading...' : 'Apply'}
                </button>
            </div>

            {error && <div style={styles.error}>{error}</div>}
            
            <div style={styles.tableContainer}>
                {renderContent()}
            </div>
        </div>
    );
}