import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Profile, Campaign, EntityState } from '../types';
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
    thSortable: {
        padding: '12px 15px',
        textAlign: 'left',
        borderBottom: '2px solid var(--border-color)',
        backgroundColor: '#f8f9fa',
        fontWeight: 600,
        cursor: 'pointer',
        userSelect: 'none',
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
        transition: 'background-color 0.2s, opacity 0.2s',
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
    },
    campaignControls: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '15px',
    },
    paginationContainer: {
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: '15px',
        marginTop: '15px',
        padding: '10px 0',
    },
    stateButton: {
        padding: '6px 12px',
        border: 'none',
        borderRadius: '4px',
        color: 'white',
        cursor: 'pointer',
        transition: 'background-color 0.2s',
        minWidth: '80px',
        textTransform: 'capitalize',
        fontWeight: 600,
    },
    campaignLink: {
        textDecoration: 'none',
        color: 'var(--primary-color)',
        fontWeight: 500,
        cursor: 'pointer',
    },
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

const CAMPAIGNS_PER_PAGE = 50;

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

    // State for campaign search and pagination
    const [campaignSearch, setCampaignSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    
    // State for inline editing
    const [editingCampaign, setEditingCampaign] = useState<{ id: number; field: 'budget' } | null>(null);
    const [tempBudgetValue, setTempBudgetValue] = useState('');

    // State for table sorting
    const [sortConfig, setSortConfig] = useState<{ key: keyof Campaign; direction: 'ascending' | 'descending' }>({
        key: 'startDate',
        direction: 'descending',
    });

    // Fetch profiles on component mount
    useEffect(() => {
        const fetchProfiles = async () => {
            try {
                setLoading(prev => ({ ...prev, profiles: true }));
                setError(null);
                const response = await fetch('/api/amazon/profiles');
                if (!response.ok) {
                     const errorData = await response.json().catch(() => ({ message: 'Failed to fetch profiles from server.' }));
                    throw new Error(errorData.message || 'Failed to fetch profiles.');
                }
                const data = await response.json();
                
                const usProfiles = data.filter((p: Profile) => p.countryCode === 'US');
                if (data.length > 0 && usProfiles.length === 0) {
                    console.info("Profiles were found, but none were for the US marketplace.");
                }

                setProfiles(usProfiles);
                if (usProfiles.length > 0) {
                    setSelectedProfileId(usProfiles[0].profileId.toString());
                } else {
                     setCampaigns([]);
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
                setCampaignSearch(''); // Reset search on profile change
                setCurrentPage(1);     // Reset page on profile change
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

    // Handler for updating campaigns with optimistic UI
    const handleUpdateCampaign = useCallback(async (
        campaignId: number,
        updatePayload: Partial<Pick<Campaign, 'state' | 'dailyBudget'>>
    ) => {
        const originalCampaigns = [...campaigns];
        
        // Optimistic UI update
        setCampaigns(prevCampaigns =>
            prevCampaigns.map(c =>
                c.campaignId === campaignId ? { ...c, ...updatePayload } : c
            )
        );

        try {
            const apiUpdate: { campaignId: number; state?: EntityState; budget?: { amount: number } } = { campaignId };
            if ('state' in updatePayload) {
                apiUpdate.state = updatePayload.state;
            }
            if ('dailyBudget' in updatePayload && updatePayload.dailyBudget) {
                apiUpdate.budget = { amount: updatePayload.dailyBudget };
            }

            const response = await fetch('/api/amazon/campaigns', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profileId: selectedProfileId,
                    updates: [apiUpdate],
                }),
            });
            
            const result = await response.json();

            if (!response.ok || result.responses?.[0]?.code !== 'SUCCESS') {
                throw new Error(result.responses?.[0]?.description || 'Failed to update campaign.');
            }
            setError(null); // Clear previous errors on success
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred during update.');
            setCampaigns(originalCampaigns); // Revert UI on failure
        } finally {
            // Exit editing mode regardless of outcome
            if (editingCampaign?.id === campaignId) {
                setEditingCampaign(null);
            }
        }
    }, [campaigns, selectedProfileId, editingCampaign]);

    // Sorting logic
    const requestSort = useCallback((key: keyof Campaign) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    }, [sortConfig]);

    const getSortIndicator = useCallback((key: keyof Campaign) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'descending' ? ' ↓' : ' ↑';
    }, [sortConfig]);

    const sortedCampaigns = useMemo(() => {
        const sortableCampaigns = [...campaigns];
        if (sortConfig.key) {
            sortableCampaigns.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];

                if (aValue === null || aValue === undefined) return 1;
                if (bValue === null || bValue === undefined) return -1;
                
                let comparison = 0;
                if (sortConfig.key === 'startDate' || sortConfig.key === 'endDate') {
                    comparison = new Date(aValue as string).getTime() - new Date(bValue as string).getTime();
                } else if (typeof aValue === 'number' && typeof bValue === 'number') {
                    comparison = aValue - bValue;
                } else {
                     comparison = String(aValue).localeCompare(String(bValue));
                }
                
                return sortConfig.direction === 'ascending' ? comparison : -comparison;
            });
        }
        return sortableCampaigns;
    }, [campaigns, sortConfig]);

    const filteredCampaigns = useMemo(() => {
        return sortedCampaigns.filter(c =>
            c.name.toLowerCase().includes(campaignSearch.toLowerCase())
        );
    }, [sortedCampaigns, campaignSearch]);

    const paginatedCampaigns = useMemo(() => {
        const startIndex = (currentPage - 1) * CAMPAIGNS_PER_PAGE;
        return filteredCampaigns.slice(startIndex, startIndex + CAMPAIGNS_PER_PAGE);
    }, [filteredCampaigns, currentPage]);

    const totalPages = Math.ceil(filteredCampaigns.length / CAMPAIGNS_PER_PAGE);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCampaignSearch(e.target.value);
        setCurrentPage(1); // Reset to first page on new search
    };

    // Handlers for budget inline editing
    const handleBudgetClick = (campaign: Campaign) => {
        setEditingCampaign({ id: campaign.campaignId, field: 'budget' });
        setTempBudgetValue(campaign.dailyBudget.toString());
    };

    const handleBudgetUpdate = (campaignId: number) => {
        const newBudget = parseFloat(tempBudgetValue);
        const originalCampaign = campaigns.find(c => c.campaignId === campaignId);
        if (originalCampaign && !isNaN(newBudget) && newBudget > 0 && newBudget !== originalCampaign.dailyBudget) {
            handleUpdateCampaign(campaignId, { dailyBudget: newBudget });
        } else {
            setEditingCampaign(null); // Cancel editing if value is invalid or unchanged
        }
    };
    
    const handleBudgetKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, campaignId: number) => {
        if (e.key === 'Enter') {
            handleBudgetUpdate(campaignId);
        } else if (e.key === 'Escape') {
            setEditingCampaign(null);
        }
    };
    
    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h1 style={styles.title}>PPC Management Dashboard</h1>
            </header>

            {error && <div style={styles.error} role="alert">{error}</div>}

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
                        ) : profiles.length > 0 ? (
                            profiles.map(p => (
                                <option key={p.profileId} value={p.profileId}>
                                    {p.accountInfo.name} ({p.countryCode})
                                </option>
                            ))
                        ) : (
                            <option>No US profiles found</option>
                        )}
                    </select>
                </div>
            </section>
            
            <section style={{ marginTop: '30px' }}>
                <div style={styles.campaignControls}>
                    <h2>Campaign Overview</h2>
                    <input
                        type="text"
                        placeholder="Search campaigns..."
                        value={campaignSearch}
                        onChange={handleSearchChange}
                        style={styles.input}
                        disabled={loading.campaigns}
                        aria-label="Search campaigns"
                    />
                </div>
                <div style={styles.tableContainer}>
                    {loading.campaigns ? (
                        <div style={styles.loader}>Loading campaigns...</div>
                    ) : (
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.thSortable} onClick={() => requestSort('name')}>
                                        Campaign Name{getSortIndicator('name')}
                                    </th>
                                    <th style={styles.thSortable} onClick={() => requestSort('state')}>
                                        State{getSortIndicator('state')}
                                    </th>
                                    <th style={styles.thSortable} onClick={() => requestSort('campaignType')}>
                                        Type{getSortIndicator('campaignType')}
                                    </th>
                                    <th style={styles.thSortable} onClick={() => requestSort('targetingType')}>
                                        Targeting{getSortIndicator('targetingType')}
                                    </th>
                                    <th style={styles.thSortable} onClick={() => requestSort('dailyBudget')}>
                                        Daily Budget{getSortIndicator('dailyBudget')}
                                    </th>
                                    <th style={styles.thSortable} onClick={() => requestSort('startDate')}>
                                        Start Date{getSortIndicator('startDate')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedCampaigns.length > 0 ? paginatedCampaigns.map((c, i) => (
                                    <tr key={c.campaignId}>
                                        <td style={{...styles.td, borderBottom: i === paginatedCampaigns.length - 1 ? 'none' : undefined}}>
                                            <a href="#" onClick={(e) => e.preventDefault()} style={{...styles.campaignLink, cursor: 'not-allowed'}} title="Drill-down coming soon">
                                                {c.name}
                                            </a>
                                        </td>
                                        <td style={{...styles.td, borderBottom: i === paginatedCampaigns.length - 1 ? 'none' : undefined}}>
                                            <button
                                                onClick={() => handleUpdateCampaign(c.campaignId, { state: c.state === 'enabled' ? 'paused' : 'enabled' })}
                                                style={{...styles.stateButton, backgroundColor: c.state === 'enabled' ? 'var(--success-color)' : '#6c757d'}}
                                                aria-label={`Change status for ${c.name}, current is ${c.state}`}
                                            >
                                                {c.state}
                                            </button>
                                        </td>
                                        <td style={{...styles.td, borderBottom: i === paginatedCampaigns.length - 1 ? 'none' : undefined}}>{c.campaignType}</td>
                                        <td style={{...styles.td, borderBottom: i === paginatedCampaigns.length - 1 ? 'none' : undefined}}>{c.targetingType}</td>
                                        <td 
                                            style={{...styles.td, cursor: 'pointer', borderBottom: i === paginatedCampaigns.length - 1 ? 'none' : undefined}} 
                                            onClick={() => editingCampaign?.id !== c.campaignId && handleBudgetClick(c)}
                                        >
                                            {editingCampaign?.id === c.campaignId ? (
                                                <input
                                                    type="number"
                                                    value={tempBudgetValue}
                                                    onChange={(e) => setTempBudgetValue(e.target.value)}
                                                    onBlur={() => handleBudgetUpdate(c.campaignId)}
                                                    onKeyDown={(e) => handleBudgetKeyDown(e, c.campaignId)}
                                                    autoFocus
                                                    style={{ ...styles.input, width: '100px', padding: '6px' }}
                                                    aria-label={`Edit budget for ${c.name}`}
                                                />
                                            ) : (
                                                formatPrice(c.dailyBudget)
                                            )}
                                        </td>
                                        <td style={{...styles.td, borderBottom: i === paginatedCampaigns.length - 1 ? 'none' : undefined}}>{c.startDate}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={6} style={{...styles.td, textAlign: 'center', borderBottom: 'none'}}>
                                            {campaignSearch ? 'No campaigns match your search.' : 'No campaigns found for this profile.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
                {totalPages > 1 && (
                     <div style={styles.paginationContainer}>
                        <button
                            style={{...styles.button, opacity: currentPage === 1 ? 0.6 : 1}}
                            onClick={() => setCurrentPage(p => p - 1)}
                            disabled={currentPage === 1}
                        >
                            Previous
                        </button>
                        <span>
                            Page {currentPage} of {totalPages}
                        </span>
                        <button
                            style={{...styles.button, opacity: currentPage === totalPages ? 0.6 : 1}}
                            onClick={() => setCurrentPage(p => p + 1)}
                            disabled={currentPage === totalPages}
                        >
                            Next
                        </button>
                    </div>
                )}
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
                      <button style={{...styles.button, opacity: loading.searchTerms ? 0.6 : 1}} onClick={fetchSearchTerms} disabled={loading.searchTerms}>
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