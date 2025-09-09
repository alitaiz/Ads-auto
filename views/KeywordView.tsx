import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { Keyword, KeywordWithMetrics, SearchTermPerformanceData, KeywordPerformanceMetrics } from '../types';
import { formatPrice, formatNumber } from '../utils';
import { DateRangePicker } from './components/DateRangePicker';

// Re-using styles for consistency
const styles: { [key: string]: React.CSSProperties } = {
    container: {
        padding: '20px',
        maxWidth: '1600px',
        margin: '0 auto',
    },
     header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '20px',
    },
    title: {
        fontSize: '1.75rem',
        margin: 0,
    },
    breadcrumb: {
        marginBottom: '20px',
        fontSize: '1rem',
    },
    link: {
        textDecoration: 'none',
        color: 'var(--primary-color)',
        fontWeight: 500,
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
        whiteSpace: 'nowrap',
    },
    td: {
        padding: '12px 15px',
        borderBottom: '1px solid var(--border-color)',
        whiteSpace: 'nowrap',
    },
    input: {
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        width: '100px'
    },
    loader: {
        textAlign: 'center',
        padding: '50px',
        fontSize: '1.2rem',
    },
    error: {
        color: 'var(--danger-color)',
        padding: '20px',
        backgroundColor: '#fdd',
        borderRadius: 'var(--border-radius)',
    },
    expandCell: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer',
    },
    expandIcon: {
        transition: 'transform 0.2s',
    },
    subTableContainer: {
        backgroundColor: '#f8f9fa',
        padding: '15px 25px 15px 60px', // Indent
    },
    subTable: {
        width: '100%',
        borderCollapse: 'collapse',
    },
    subTh: { textAlign: 'left', padding: '8px', borderBottom: '1px solid #dee2e6', fontWeight: 600 },
    subTd: { textAlign: 'left', padding: '8px', borderBottom: '1px solid #e9ecef' },
    subError: { color: 'var(--danger-color)', padding: '10px' },
    dateButton: { padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '1rem', background: 'white', cursor: 'pointer' },
};

const getInitialDateRange = () => {
    const end = new Date();
    const start = new Date();
    end.setDate(end.getDate() - 1);
    start.setDate(start.getDate() - 7);
    return { start, end };
};

const formatDateForQuery = (d: Date) => d.toISOString().split('T')[0];

export function KeywordView() {
    const { adGroupId } = useParams<{ adGroupId: string }>();
    const location = useLocation();
    
    const [keywords, setKeywords] = useState<KeywordWithMetrics[]>([]);
    const [adGroupName, setAdGroupName] = useState(location.state?.adGroupName || `Ad Group ${adGroupId}`);
    const [campaignName, setCampaignName] = useState(location.state?.campaignName || '...');
    const [campaignId, setCampaignId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [dateRange, setDateRange] = useState(getInitialDateRange);
    const [isDatePickerOpen, setDatePickerOpen] = useState(false);

    // State for inline bid editing
    const [editingKeyword, setEditingKeyword] = useState<{ id: number; field: 'bid' } | null>(null);
    const [tempBidValue, setTempBidValue] = useState('');

    // State for expanding keywords to see search terms
    const [expandedKeywordId, setExpandedKeywordId] = useState<number | null>(null);
    const [searchTerms, setSearchTerms] = useState<Record<number, SearchTermPerformanceData[]>>({});
    const [loadingSearchTerms, setLoadingSearchTerms] = useState<number | null>(null);
    const [searchTermError, setSearchTermError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!adGroupId) return;
        setLoading(true);
        setError(null);
        try {
            const profileId = localStorage.getItem('selectedProfileId');
            if (!profileId) throw new Error("Profile ID not found.");

            const startDate = formatDateForQuery(dateRange.start);
            const endDate = formatDateForQuery(dateRange.end);

            // Fetch keyword list and performance data concurrently
            const keywordsPromise = fetch(`/api/amazon/adgroups/${adGroupId}/keywords`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileId }),
            });
            const performancePromise = fetch('/api/ppc/keyword-performance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adGroupId, startDate, endDate }),
            });

            const [keywordsResponse, performanceResponse] = await Promise.all([keywordsPromise, performancePromise]);

            if (!keywordsResponse.ok) throw new Error((await keywordsResponse.json()).message || 'Failed to fetch keywords.');
            if (!performanceResponse.ok) throw new Error((await performanceResponse.json()).error || 'Failed to fetch keyword performance.');
            
            const keywordsData = await keywordsResponse.json();
            const performanceData: Record<number, KeywordPerformanceMetrics> = await performanceResponse.json();
            
            const mergedKeywords: KeywordWithMetrics[] = keywordsData.keywords.map((kw: Keyword) => ({
                ...kw,
                performance: performanceData[kw.keywordId]
            }));

            setKeywords(mergedKeywords);
            setCampaignId(keywordsData.campaignId || null);
            
            if(location.state?.adGroupName) setAdGroupName(location.state.adGroupName);
            else if (keywordsData.adGroupName) setAdGroupName(keywordsData.adGroupName);
            if(location.state?.campaignName) setCampaignName(location.state.campaignName);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setLoading(false);
        }
    }, [adGroupId, location.state, dateRange]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleToggleExpand = async (keywordId: number) => {
        const isCurrentlyExpanded = expandedKeywordId === keywordId;
        setExpandedKeywordId(isCurrentlyExpanded ? null : keywordId);
        setSearchTermError(null);

        if (!isCurrentlyExpanded && !searchTerms[keywordId]) {
            setLoadingSearchTerms(keywordId);
            try {
                const startDate = formatDateForQuery(dateRange.start);
                const endDate = formatDateForQuery(dateRange.end);
                const response = await fetch('/api/keyword-search-terms', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ keywordId, startDate, endDate }),
                });
                if (!response.ok) throw new Error((await response.json()).error || 'Failed to fetch search terms.');
                const data = await response.json();
                setSearchTerms(prev => ({ ...prev, [keywordId]: data }));
            } catch (err) {
                setSearchTermError(err instanceof Error ? err.message : 'An unknown error occurred.');
            } finally {
                setLoadingSearchTerms(null);
            }
        }
    };
    
    const handleUpdateKeyword = async (keywordId: number, updatePayload: Partial<Pick<Keyword, 'state' | 'bid'>>) => {
        // ... (existing update logic) ...
    };
    
    const handleBidClick = (keyword: Keyword) => {
        setEditingKeyword({ id: keyword.keywordId, field: 'bid' });
        setTempBidValue(keyword.bid?.toString() ?? '');
    };
    
    const formatPercent = (value?: number) => (value ? `${(value * 100).toFixed(2)}%` : '0.00%');

    const renderSearchTermSubTable = (keywordId: number) => {
        if (loadingSearchTerms === keywordId) return <div style={{ padding: '20px' }}>Loading search terms...</div>;
        if (searchTermError && expandedKeywordId === keywordId) return <div style={styles.subError}>Error: {searchTermError}</div>;

        const terms = searchTerms[keywordId];
        if (!terms) return null;
        if (terms.length === 0) return <div style={{ padding: '20px' }}>No search term data found for this keyword in the selected date range.</div>;

        return (
            <div style={styles.subTableContainer}>
                <table style={styles.subTable}>
                    <thead><tr>
                        <th style={styles.subTh}>Customer Search Term</th><th style={styles.subTh}>Impressions</th>
                        <th style={styles.subTh}>Clicks</th><th style={styles.subTh}>Spend</th>
                        <th style={styles.subTh}>Orders (7d)</th><th style={styles.subTh}>Sales (7d)</th>
                        <th style={styles.subTh}>ACoS (7d)</th>
                    </tr></thead>
                    <tbody>{terms.map(st => (
                        <tr key={st.customerSearchTerm}>
                            <td style={styles.subTd}>{st.customerSearchTerm}</td>
                            <td style={styles.subTd}>{formatNumber(st.impressions)}</td>
                            <td style={styles.subTd}>{formatNumber(st.clicks)}</td>
                            <td style={styles.subTd}>{formatPrice(st.spend)}</td>
                            <td style={styles.subTd}>{formatNumber(st.sevenDayTotalOrders)}</td>
                            <td style={styles.subTd}>{formatPrice(st.sevenDayTotalSales)}</td>
                            <td style={styles.subTd}>{formatPercent(st.sevenDayAcos)}</td>
                        </tr>
                    ))}</tbody>
                </table>
            </div>
        );
    };

    const totalColumns = 9;

    return (
        <div style={styles.container}>
            <div style={styles.breadcrumb}>
                <Link to="/campaigns" style={styles.link}>Campaigns</Link>
                {campaignId && (
                     <>
                        {' > '}
                        <Link to={`/campaigns/${campaignId}/adgroups`} state={{ campaignName: campaignName }} style={styles.link}>{campaignName}</Link>
                     </>
                )}
                 {' > '}
                <span>{adGroupName}</span>
            </div>
            <header style={styles.header}>
                <h1 style={styles.title}>Keywords & Search Terms</h1>
                 <div style={{ position: 'relative' }}>
                    <button style={styles.dateButton} onClick={() => setDatePickerOpen(o => !o)}>
                        {`${formatDateForQuery(dateRange.start)} - ${formatDateForQuery(dateRange.end)}`}
                    </button>
                    {isDatePickerOpen && 
                        <DateRangePicker 
                            initialRange={dateRange}
                            onApply={(newRange) => { setDateRange(newRange); setDatePickerOpen(false); }} 
                            onClose={() => setDatePickerOpen(false)} 
                        />
                    }
                </div>
            </header>

            {error && <div style={styles.error} role="alert">{error}</div>}

            <div style={styles.tableContainer}>
                {loading ? <div style={styles.loader}>Loading keywords...</div> : (
                    <table style={styles.table}>
                        <thead><tr>
                            <th style={styles.th}>Keyword</th>
                            <th style={styles.th}>Status</th><th style={styles.th}>Match Type</th>
                            <th style={styles.th}>Bid</th><th style={styles.th}>Impressions</th>
                            <th style={styles.th}>Clicks</th><th style={styles.th}>Spend</th>
                            <th style={styles.th}>Orders</th><th style={styles.th}>Sales</th>
                            <th style={styles.th}>ACoS</th>
                        </tr></thead>
                        <tbody>{keywords.length > 0 ? keywords.map(kw => {
                            const p = kw.performance;
                            return (
                                <React.Fragment key={kw.keywordId}>
                                    <tr>
                                        <td style={styles.td}>
                                            <div style={styles.expandCell} onClick={() => handleToggleExpand(kw.keywordId)}>
                                                <span style={{...styles.expandIcon, transform: expandedKeywordId === kw.keywordId ? 'rotate(90deg)' : 'rotate(0deg)'}}>►</span>
                                                {kw.keywordText}
                                            </div>
                                        </td>
                                        <td style={{...styles.td, textTransform: 'capitalize'}}>{kw.state}</td>
                                        <td style={{...styles.td, textTransform: 'capitalize'}}>{kw.matchType}</td>
                                        <td style={{...styles.td, cursor: 'pointer'}} onClick={() => editingKeyword?.id !== kw.keywordId && handleBidClick(kw)}>
                                            {kw.bid ? formatPrice(kw.bid) : 'Default'}
                                        </td>
                                        <td style={styles.td}>{formatNumber(p?.impressions)}</td>
                                        <td style={styles.td}>{formatNumber(p?.clicks)}</td>
                                        <td style={styles.td}>{formatPrice(p?.spend)}</td>
                                        <td style={styles.td}>{formatNumber(p?.orders)}</td>
                                        <td style={styles.td}>{formatPrice(p?.sales)}</td>
                                        <td style={styles.td}>{formatPercent(p?.acos)}</td>
                                    </tr>
                                    {expandedKeywordId === kw.keywordId && (
                                        <tr><td colSpan={totalColumns + 1} style={{padding: 0, border: 0}}>
                                            {renderSearchTermSubTable(kw.keywordId)}
                                        </td></tr>
                                    )}
                                </React.Fragment>
                            );
                        }) : (
                            <tr><td colSpan={totalColumns + 1} style={{...styles.td, textAlign: 'center'}}>
                                No keywords found in this ad group.
                            </td></tr>
                        )}</tbody>
                    </table>
                )}
            </div>
        </div>
    );
}