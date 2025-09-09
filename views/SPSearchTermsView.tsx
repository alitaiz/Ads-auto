import React, { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { SearchTermData, SearchTermFilterOptions, SummaryMetricsData } from '../types';
import { formatNumber, formatPrice } from '../utils';
import { DataCacheContext } from '../contexts/DataCacheContext';
import { DateRangePicker } from './components/DateRangePicker';
import { SummaryMetrics } from './components/SummaryMetrics';

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
        marginLeft: 'auto',
    },
    dateButton: {
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
        background: 'white',
        cursor: 'pointer',
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
        cursor: 'pointer',
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

const getInitialDateRange = () => {
    const end = new Date();
    const start = new Date();
    end.setDate(end.getDate() - 1); // Default to yesterday
    start.setDate(start.getDate() - 7); // Default to 7 days ago
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

const formatDateForQuery = (d: Date) => d.toISOString().split('T')[0];
type SortableKeys = keyof SearchTermData;

export function SPSearchTermsView() {
    const { cache, setCache } = useContext(DataCacheContext);

    const [filterOptions, setFilterOptions] = useState<SearchTermFilterOptions>({ asins: [], campaignNames: [] });
    const [selectedAsin, setSelectedAsin] = useState<string>(cache.spSearchTerms.filters?.asin || '');
    const [selectedCampaign, setSelectedCampaign] = useState<string>(cache.spSearchTerms.filters?.campaignName || '');
    const [dateRange, setDateRange] = useState(() => {
        const f = cache.spSearchTerms.filters;
        return f ? { start: new Date(f.startDate), end: new Date(f.endDate) } : getInitialDateRange();
    });
    const [isDatePickerOpen, setDatePickerOpen] = useState(false);
    
    const [data, setData] = useState<SearchTermData[]>(cache.spSearchTerms.data || []);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasAppliedFilters, setHasAppliedFilters] = useState(!!cache.spSearchTerms.filters);
    const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>({ key: 'impressions', direction: 'descending' });


    useEffect(() => {
        const fetchFilters = async () => {
            if (filterOptions.asins.length > 0) return;
            try {
                setLoading(true);
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
        const startDate = formatDateForQuery(dateRange.start);
        const endDate = formatDateForQuery(dateRange.end);
        const currentFilters = { asin: selectedAsin, campaignName: selectedCampaign, startDate, endDate };
        
        const cached = cache.spSearchTerms;
        if (JSON.stringify(cached.filters) === JSON.stringify(currentFilters) && cached.data.length > 0) {
            setData(cached.data);
            setHasAppliedFilters(true);
            return;
        }

        setHasAppliedFilters(true);
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ startDate, endDate });
            if (selectedAsin) params.append('asin', selectedAsin);
            if (selectedCampaign) params.append('campaignName', selectedCampaign);

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
    }, [dateRange, selectedAsin, selectedCampaign, cache.spSearchTerms, setCache]);

    const summaryMetrics: SummaryMetricsData | null = useMemo(() => {
        if (loading || data.length === 0) return null;
        
        const total = data.reduce((acc, item) => {
            acc.spend += item.spend || 0;
            acc.sales += item.sevenDayTotalSales || 0;
            acc.orders += item.sevenDayTotalOrders || 0;
            acc.clicks += item.clicks || 0;
            acc.impressions += item.impressions || 0;
            return acc;
        }, { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 });

        return {
            ...total,
            acos: total.sales > 0 ? total.spend / total.sales : 0,
            roas: total.spend > 0 ? total.sales / total.spend : 0,
            cpc: total.clicks > 0 ? total.spend / total.clicks : 0,
            ctr: total.impressions > 0 ? total.clicks / total.impressions : 0,
        };
    }, [data, loading]);

    const requestSort = (key: SortableKeys) => {
        let direction: 'ascending' | 'descending' = 'descending';
        if (sortConfig?.key === key && sortConfig.direction === 'descending') {
            direction = 'ascending';
        }
        setSortConfig({ key, direction });
    };

    const sortedData = useMemo(() => {
        if (!sortConfig) return data;
        return [...data].sort((a, b) => {
            const aVal = a[sortConfig.key] ?? 0;
            const bVal = b[sortConfig.key] ?? 0;
            if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
        });
    }, [data, sortConfig]);
    
    const handleApplyDateRange = (newRange: { start: Date; end: Date }) => {
        setDateRange(newRange);
        setDatePickerOpen(false);
    };

    const formatDateRangeDisplay = (start: Date, end: Date) => {
        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
        return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
    };

    const formatPercent = (value: number | null | undefined): string => {
        if (value === null || typeof value === 'undefined' || isNaN(value)) return '0.00%';
        return `${(value * 100).toFixed(2)}%`;
    };

    const renderContent = () => {
        if (loading && !data.length) return <div style={styles.message}>Loading data...</div>;
        if (error) return null;
        if (!hasAppliedFilters) return <div style={styles.message}>Please select filters and click "Apply" to view data.</div>;
        if (sortedData.length === 0) return <div style={styles.message}>No data available for the selected filters.</div>;
        
        return (
            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th} onClick={() => requestSort('customerSearchTerm')}>Search Term</th>
                        <th style={styles.th} onClick={() => requestSort('campaignName')}>Campaign</th>
                        <th style={styles.th} onClick={() => requestSort('adGroupName')}>Ad Group</th>
                        <th style={styles.th} onClick={() => requestSort('impressions')}>Impressions</th>
                        <th style={styles.th} onClick={() => requestSort('clicks')}>Clicks</th>
                        <th style={styles.th} onClick={() => requestSort('spend')}>Spend</th>
                        <th style={styles.th} onClick={() => requestSort('sevenDayTotalSales')}>Sales (7d)</th>
                        <th style={styles.th} onClick={() => requestSort('sevenDayTotalOrders')}>Orders (7d)</th>
                        <th style={styles.th} onClick={() => requestSort('sevenDayAcos')}>ACoS (7d)</th>
                        <th style={styles.th} onClick={() => requestSort('sevenDayRoas')}>RoAS (7d)</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedData.map((item, index) => (
                        <tr key={`${item.customerSearchTerm}-${index}`}>
                            <td style={styles.td}>{item.customerSearchTerm}</td>
                            <td style={styles.td}>{item.campaignName}</td>
                            <td style={styles.td}>{item.adGroupName}</td>
                            <td style={styles.td}>{formatNumber(item.impressions)}</td>
                            <td style={styles.td}>{formatNumber(item.clicks)}</td>
                            <td style={styles.td}>{formatPrice(item.spend)}</td>
                            <td style={styles.td}>{formatPrice(item.sevenDayTotalSales)}</td>
                            <td style={styles.td}>{formatNumber(item.sevenDayTotalOrders)}</td>
                            <td style={styles.td}>{formatPercent(item.sevenDayAcos)}</td>
                            <td style={styles.td}>{item.sevenDayRoas?.toFixed(2)}</td>
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
                    <label style={styles.label} htmlFor="date-range">Date Range</label>
                     <div style={{ position: 'relative' }}>
                         <button style={styles.dateButton} onClick={() => setDatePickerOpen(o => !o)}>
                           {formatDateRangeDisplay(dateRange.start, dateRange.end)}
                        </button>
                        {isDatePickerOpen && 
                            <DateRangePicker 
                                initialRange={dateRange}
                                onApply={handleApplyDateRange} 
                                onClose={() => setDatePickerOpen(false)} 
                            />
                        }
                    </div>
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
            
            <SummaryMetrics metrics={summaryMetrics} loading={loading} />

            <div style={styles.tableContainer}>
                {renderContent()}
            </div>
        </div>
    );
}