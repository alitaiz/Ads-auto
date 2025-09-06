import React, { useState, useEffect, useCallback } from 'react';
import { Profile, Campaign } from '../types';
import { formatPrice, formatNumber } from '../utils';

// Component-specific styles. For a larger app, consider CSS-in-JS or CSS Modules.
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
    },
    title: {
        fontSize: '2rem',
        margin: 0,
    },
    filters: {
        display: 'flex',
        gap: '15px',
        alignItems: 'center',
        padding: '15px',
        backgroundColor: 'var(--card-background-color)',
        borderRadius: 'var(--border-radius)',
        boxShadow: 'var(--box-shadow)',
        marginBottom: '20px',
    },
    tableContainer: {
        backgroundColor: 'var(--card-background-color)',
        borderRadius: 'var(--border-radius)',
        boxShadow: 'var(--box-shadow)',
        overflow: 'auto',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        minWidth: '1000px',
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
        marginBottom: '20px',
    },
    button: {
        padding: '8px 15px',
        border: 'none',
        borderRadius: '4px',
        backgroundColor: 'var(--primary-color)',
        color: 'white',
        cursor: 'pointer',
    },
    select: {
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        minWidth: '200px',
    },
    input: {
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
    }
};

interface SearchTerm {
    campaignName: string;
    customerSearchTerm: string;
    impressions: number;
    clicks: number;
    costPerClick: number;
    spend: number;
    sevenDayTotalSales: number;
    sevenDayAcos: number;
    asin: string;
    targeting: string;
    matchType: string;
    sevenDayRoas: number;
    sevenDayTotalOrders: number;
    sevenDayTotalUnits: number;
}

export function PPCManagementView() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string>('');
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [searchTerms, setSearchTerms] = useState<SearchTerm[]>([]);
    const [asins, setAsins] = useState<string[]>([]);
    const [selectedAsin, setSelectedAsin] = useState<string>('');
    const [startDate, setStartDate] = useState<string>('2024-07-01');
    const [endDate, setEndDate] = useState<string>('2024-07-28');
    const [loading, setLoading] = useState({ profiles: true, campaigns: false, searchTerms: false });
    const [error, setError] = useState<string | null>(null);
    
    // Fetch profiles on component mount
    useEffect(() => {
        const fetchProfiles = async () => {
            try {
                setLoading(prev => ({ ...prev, profiles: true }));
                const response = await fetch('/api/amazon/profiles');
                if (!response.ok) {
                    throw new Error('Failed to fetch profiles.');
                }
                const data = await response.json();
                setProfiles(data);
                if (data.length > 0) {
                    setSelectedProfileId(data[0].profileId.toString());
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred.');
            } finally {
                setLoading(prev => ({ ...prev, profiles: false }));
            }
        };

        fetchProfiles();
    }, []);

    // Fetch campaigns when profile changes
    useEffect(() => {
        if (!selectedProfileId) return;

        const fetchCampaigns = async () => {
            try {
                setLoading(prev => ({ ...prev, campaigns: true }));
                setError(null);
                setCampaigns([]);
                const response = await fetch('/api/amazon/campaigns/list', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profileId: selectedProfileId }),
                });
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Failed to fetch campaigns.');
                }
                const data = await response.json();
                setCampaigns(data.campaigns || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred while fetching campaigns.');
            } finally {
                setLoading(prev => ({ ...prev, campaigns: false }));
            }
        };

        fetchCampaigns();
    }, [selectedProfileId]);
    
    // Fetch search term filters (ASINs)
    useEffect(() => {
        const fetchSearchTermFilters = async () => {
            try {
                const response = await fetch('/api/sp-search-terms-filters');
                if (!response.ok) throw new Error('Failed to fetch search term filters.');
                const data = await response.json();
                setAsins(data.asins || []);
            } catch (err) {
                console.error(err);
                // Non-critical, so we just log the error.
            }
        };
        fetchSearchTermFilters();
    }, []);

    // Callback to fetch search terms
    const fetchSearchTerms = useCallback(async () => {
        try {
            setLoading(prev => ({ ...prev, searchTerms: true }));
            setError(null);
            setSearchTerms([]);
            
            const params = new URLSearchParams({
                startDate,
                endDate,
            });
            if (selectedAsin) {
                params.append('asin', selectedAsin);
            }

            const response = await fetch(`/api/sp-search-terms?${params.toString()}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch search terms.');
            }
            const data = await response.json();
            setSearchTerms(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred while fetching search terms.');
        } finally {
            setLoading(prev => ({ ...prev, searchTerms: false }));
        }
    }, [startDate, endDate, selectedAsin]);
    
    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h1 style={styles.title}>PPC Management Dashboard</h1>
            </header>

            {error && <div style={styles.error}>{error}</div>}

            <section style={styles.filters}>
                <div>
                    <label htmlFor="profile-select">Profile: </label>
                    <select
                        id="profile-select"
                        style={styles.select}
                        value={selectedProfileId}
                        onChange={(e) => setSelectedProfileId(e.target.value)}
                        disabled={loading.profiles || profiles.length === 0}
                    >
                        {loading.profiles ? (
                            <option>Loading profiles...</option>
                        ) : (
                            profiles.map(p => (
                                <option key={p.profileId} value={p.profileId}>
                                    {p.accountInfo.name} ({p.accountInfo.marketplaceStringId})
                                </option>
                            ))
                        )}
                    </select>
                </div>
            </section>
            
            <section style={{ marginTop: '30px' }}>
                <h2>Campaign Overview</h2>
                <div style={styles.tableContainer}>
                    {loading.campaigns ? (
                        <div style={styles.loader}>Loading campaigns...</div>
                    ) : (
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>Campaign Name</th>
                                    <th style={styles.th}>State</th>
                                    <th style={styles.th}>Type</th>
                                    <th style={styles.th}>Targeting</th>
                                    <th style={styles.th}>Daily Budget</th>
                                    <th style={styles.th}>Start Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {campaigns.length > 0 ? campaigns.map((c, i) => (
                                    <tr key={c.campaignId}>
                                        <td style={{...styles.td, borderBottom: i === campaigns.length - 1 ? 'none' : undefined}}>{c.name}</td>
                                        <td style={{...styles.td, borderBottom: i === campaigns.length - 1 ? 'none' : undefined}}>{c.state}</td>
                                        <td style={{...styles.td, borderBottom: i === campaigns.length - 1 ? 'none' : undefined}}>{c.campaignType}</td>
                                        <td style={{...styles.td, borderBottom: i === campaigns.length - 1 ? 'none' : undefined}}>{c.targetingType}</td>
                                        <td style={{...styles.td, borderBottom: i === campaigns.length - 1 ? 'none' : undefined}}>{formatPrice(c.dailyBudget)}</td>
                                        <td style={{...styles.td, borderBottom: i === campaigns.length - 1 ? 'none' : undefined}}>{c.startDate}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={6} style={{...styles.td, textAlign: 'center', borderBottom: 'none'}}>
                                            No campaigns found for this profile.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>
            
            <section style={{ marginTop: '30px' }}>
                <h2>Search Term Performance</h2>
                <div style={{...styles.filters, flexWrap: 'wrap'}}>
                     <div>
                        <label htmlFor="start-date">Start Date: </label>
                        <input
                            type="date"
                            id="start-date"
                            style={styles.input}
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                        />
                     </div>
                     <div>
                        <label htmlFor="end-date">End Date: </label>
                        <input
                            type="date"
                            id="end-date"
                            style={styles.input}
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                        />
                     </div>
                      <div>
                        <label htmlFor="asin-select">ASIN: </label>
                        <select
                            id="asin-select"
                            style={styles.select}
                            value={selectedAsin}
                            onChange={e => setSelectedAsin(e.target.value)}
                        >
                            <option value="">All ASINs</option>
                            {asins.map(asin => <option key={asin} value={asin}>{asin}</option>)}
                        </select>
                      </div>
                      <button style={styles.button} onClick={fetchSearchTerms} disabled={loading.searchTerms}>
                        {loading.searchTerms ? 'Loading...' : 'Apply Filters'}
                      </button>
                </div>
                
                 <div style={styles.tableContainer}>
                    {loading.searchTerms ? (
                        <div style={styles.loader}>Loading search terms...</div>
                    ) : (
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>Search Term</th>
                                    <th style={styles.th}>Campaign</th>
                                    <th style={styles.th}>Match Type</th>
                                    <th style={styles.th}>Impressions</th>
                                    <th style={styles.th}>Clicks</th>
                                    <th style={styles.th}>Spend</th>
                                    <th style={styles.th}>Sales</th>
                                    <th style={styles.th}>Orders</th>
                                    <th style={styles.th}>ACOS</th>
                                    <th style={styles.th}>ROAS</th>
                                </tr>
                            </thead>
                            <tbody>
                               {searchTerms.length > 0 ? searchTerms.map((st, index) => (
                                    <tr key={`${st.customerSearchTerm}-${index}`}>
                                        <td style={{...styles.td, borderBottom: index === searchTerms.length - 1 ? 'none' : undefined}}>{st.customerSearchTerm}</td>
                                        <td style={{...styles.td, borderBottom: index === searchTerms.length - 1 ? 'none' : undefined}}>{st.campaignName}</td>
                                        <td style={{...styles.td, borderBottom: index === searchTerms.length - 1 ? 'none' : undefined}}>{st.matchType}</td>
                                        <td style={{...styles.td, borderBottom: index === searchTerms.length - 1 ? 'none' : undefined}}>{formatNumber(st.impressions)}</td>
                                        <td style={{...styles.td, borderBottom: index === searchTerms.length - 1 ? 'none' : undefined}}>{formatNumber(st.clicks)}</td>
                                        <td style={{...styles.td, borderBottom: index === searchTerms.length - 1 ? 'none' : undefined}}>{formatPrice(st.spend)}</td>
                                        <td style={{...styles.td, borderBottom: index === searchTerms.length - 1 ? 'none' : undefined}}>{formatPrice(st.sevenDayTotalSales)}</td>
                                        <td style={{...styles.td, borderBottom: index === searchTerms.length - 1 ? 'none' : undefined}}>{formatNumber(st.sevenDayTotalOrders)}</td>
                                        <td style={{...styles.td, borderBottom: index === searchTerms.length - 1 ? 'none' : undefined}}>{`${(st.sevenDayAcos * 100).toFixed(2)}%`}</td>
                                        <td style={{...styles.td, borderBottom: index === searchTerms.length - 1 ? 'none' : undefined}}>{st.sevenDayRoas.toFixed(2)}</td>
                                    </tr>
                               )) : (
                                   <tr>
                                       <td colSpan={10} style={{...styles.td, textAlign: 'center', borderBottom: 'none'}}>
                                           No search term data for the selected criteria. Click 'Apply Filters' to load data.
                                       </td>
                                   </tr>
                               )}
                            </tbody>
                        </table>
                    )}
                 </div>
            </section>
        </div>
    );
}
