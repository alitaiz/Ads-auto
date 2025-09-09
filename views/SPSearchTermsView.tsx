import React, { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { SearchTermData, SearchTermFilterOptions } from '../types';
import { formatNumber, formatPrice } from '../utils';
import { DataCacheContext } from '../contexts/DataCacheContext';

// Using styles similar to SalesAndTrafficView for consistency
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
};

const getInitialDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 2); // Default to 2 days ago
    return d.toISOString().split('T')[0];
};

export function SPSearchTermsView() {
    const { cache, setCache } = useContext(DataCacheContext);

    const [filterOptions, setFilterOptions] = useState<SearchTermFilterOptions>({ asins: [], campaignNames: [] });
    const [selectedAsin, setSelectedAsin] = useState<string>(cache.spSearchTerms.filters?.asin || '');
    const [selectedCampaign, setSelectedCampaign] = useState<string>(cache.spSearchTerms.filters?.campaignName || '');
    const [selectedDate, setSelectedDate] = useState<string>(cache.spSearchTerms.filters?.date || getInitialDate());
    
    const [data, setData] = useState<SearchTermData[]>(cache.spSearchTerms.data || []);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasAppliedFilters, setHasAppliedFilters] = useState(!!cache.spSearchTerms.filters);

    useEffect(() => {
        const fetchFilters = async () => {
            if (filterOptions.asins.length > 0) return;
            try {
                setLoading(true);
                // NOTE: This endpoint is assumed to exist based on app structure.
                const response = await fetch('/api/sp-search-terms-filters');
                if (!response.ok) throw new Error('Failed to fetch filter options.');
                const filters: SearchTermFilterOptions = await response.json();
                setFilterOptions(filters);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'An unknown error occurred while fetching filters.');
            } finally {
                setLoading(false);
            }
        };
        fetchFilters();
    }, [filterOptions.asins.length]);

    const handleApply = useCallback(async () => {
        if (!selectedDate) return;

        const currentFilters = { asin: selectedAsin, campaignName: selectedCampaign, date: selectedDate };
        if (JSON.stringify(cache.spSearchTerms.filters) === JSON.stringify(currentFilters) && cache.spSearchTerms.data.length > 0) {
            setData(cache.spSearchTerms.data);
            setHasAppliedFilters(true);
            return;
        }

        setHasAppliedFilters(true);
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ date: selectedDate });
            if (selectedAsin) params.append('asin', selectedAsin);
            if (selectedCampaign) params.append('campaignName', selectedCampaign);

            // NOTE: This endpoint is assumed to exist based on app structure.
            const response = await fetch(`/api/sp-search-terms?${params.toString()}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch search terms data.');
            }
            const fetchedData: SearchTermData[] = await response.json();
            setData(fetchedData);
            setCache(prev => ({ ...prev, spSearchTerms: { data: fetchedData, filters: currentFilters } }));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An unknown error occurred while fetching data.');
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [selectedDate, selectedAsin, selectedCampaign, cache.spSearchTerms, setCache]);

    const sortedData = useMemo(() => {
        return [...data].sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0));
    }, [data]);
    
    const formatPercent = (value: number | null | undefined): string => {
        if (value === null || typeof value === 'undefined' || isNaN(value)) {
            return '0.00%';
        }
        return `${(value * 100).toFixed(2)}%`;
    };

    const renderContent = () => {
        if (loading && !data.length) return <div style={styles.message}>Loading data...</div>;
        if (error) return null; // Error message is displayed separately
        if (!hasAppliedFilters) return <div style={styles.message}>Please select filters and click "Apply" to view data.</div>;
        if (sortedData.length === 0) return <div style={styles.message}>No data available for the selected filters.</div>;
        
        return (
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>Search Term</th>
                        <th style={styles.th}>Campaign</th>
                        <th style={styles.th}>Ad Group</th>
                        <th style={styles.th}>Impressions</th>
                        <th style={styles.th}>Clicks</th>
                        <th style={styles.th}>Spend</th>
                        <th style={styles.th}>Sales (7d)</th>
                        <th style={styles.th}>Orders (7d)</th>
                        <th style={styles.th}>ACoS (7d)</th>
                        <th style={styles.th}>RoAS (7d)</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedData.map((item, index) => (
                        <tr key={`${item.customer_search_term}-${index}`}>
                            <td style={styles.td}>{item.customer_search_term}</td>
                            <td style={styles.td}>{item.campaign_name}</td>
                            <td style={styles.td}>{item.ad_group_name}</td>
                            <td style={styles.td}>{formatNumber(item.impressions)}</td>
                            <td style={styles.td}>{formatNumber(item.clicks)}</td>
                            <td style={styles.td}>{formatPrice(item.spend)}</td>
                            <td style={styles.td}>{formatPrice(item.seven_day_total_sales)}</td>
                            <td style={styles.td}>{formatNumber(item.seven_day_total_orders)}</td>
                            <td style={styles.td}>{formatPercent(item.seven_day_acos)}</td>
                            <td style={styles.td}>{item.seven_day_roas?.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };

    return (
        <div style={styles.viewContainer}>
            <header style={styles.header}>
                <h1 style={styles.title}>Sponsored Products Search Terms</h1>
                <p style={styles.subtitle}>Analyze customer search terms to optimize your campaigns.</p>
            </header>
            <div style={styles.card}>
                <div style={styles.filterGroup}>
                    <label style={styles.label} htmlFor="date-select">Date</label>
                    <input type="date" id="date-select" style={styles.input} value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
                </div>
                 <div style={styles.filterGroup}>
                    <label style={styles.label} htmlFor="asin-select">ASIN</label>
                    <select id="asin-select" style={styles.select} value={selectedAsin} onChange={e => setSelectedAsin(e.target.value)} disabled={filterOptions.asins.length === 0}>
                        <option value="">All ASINs</option>
                        {filterOptions.asins.map(asin => <option key={asin} value={asin}>{asin}</option>)}
                    </select>
                </div>
                 <div style={styles.filterGroup}>
                    <label style={styles.label} htmlFor="campaign-select">Campaign</label>
                    <select id="campaign-select" style={styles.select} value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} disabled={filterOptions.campaignNames.length === 0}>
                        <option value="">All Campaigns</option>
                        {filterOptions.campaignNames.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                </div>
                <button onClick={handleApply} style={styles.primaryButton} disabled={loading}>
                    {loading ? 'Applying...' : 'Apply'}
                </button>
            </div>
            {error && <div style={styles.error}>{error}</div>}
            <div style={styles.tableContainer}>
                {renderContent()}
            </div>
        </div>
    );
}
