import React, { useState, useEffect, useCallback, useMemo } from 'react';
// Fix: Import EntityState to resolve typing error.
import { Profile, Campaign, EntityState } from '../types';
import { formatPrice, formatNumber } from '../utils';

// Component-specific styles. For a larger app, consider CSS-in-JS or CSS Modules.
const styles: { [key: string]: React.CSSProperties } = {
    container: {
        padding: '20px',
        maxWidth: '100%',
        margin: '0 auto',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '15px'
    },
    title: {
        fontSize: '1.75rem',
        margin: 0,
    },
    controlsContainer: {
        display: 'flex',
        gap: '15px',
        alignItems: 'center',
        padding: '15px',
        backgroundColor: 'var(--card-background-color)',
        borderRadius: 'var(--border-radius)',
        boxShadow: 'var(--box-shadow)',
        marginBottom: '20px',
        flexWrap: 'wrap',
    },
    controlGroup: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
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
        minWidth: '1400px',
    },
    th: {
        padding: '12px 15px',
        textAlign: 'left',
        borderBottom: '2px solid var(--border-color)',
        backgroundColor: '#f8f9fa',
        fontWeight: 600,
        whiteSpace: 'nowrap',
    },
    thSortable: {
        padding: '12px 15px',
        textAlign: 'left',
        borderBottom: '2px solid var(--border-color)',
        backgroundColor: '#f8f9fa',
        fontWeight: 600,
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
    },
    td: {
        padding: '12px 15px',
        borderBottom: '1px solid var(--border-color)',
        whiteSpace: 'nowrap',
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
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        backgroundColor: 'white',
        color: 'var(--text-color)',
        cursor: 'pointer',
        transition: 'background-color 0.2s, opacity 0.2s',
        display: 'flex',
        alignItems: 'center',
        gap: '5px'
    },
    primaryButton: {
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
        minWidth: '150px',
    },
    input: {
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
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

// Fix: Define a specific type for performance metrics data from the API to resolve property access errors.
interface CampaignPerformanceMetrics {
  campaignId: number;
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  sales: number;
}

interface CampaignWithMetrics extends Campaign {
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  sales: number;
  ctr: number;
  cpc: number;
  acos: number;
  roas: number;
}

const CAMPAIGNS_PER_PAGE = 50;

const InfoIcon = ({ title }: { title: string }) => (
    <span title={title} style={{ cursor: 'help', marginLeft: '4px', color: '#6c757d' }}>
        &#9432;
    </span>
);

export function PPCManagementView() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string>('');
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    // Fix: Use the correct type for performance metrics.
    const [performanceMetrics, setPerformanceMetrics] = useState<Record<string, CampaignPerformanceMetrics>>({});
    const [campaignNameMap, setCampaignNameMap] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState({ profiles: true, data: false });
    const [error, setError] = useState<string | null>(null);

    // State for campaign search and pagination
    const [campaignSearch, setCampaignSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    
    // State for inline editing
    const [editingCampaign, setEditingCampaign] = useState<{ id: number; field: 'budget' } | null>(null);
    const [tempBudgetValue, setTempBudgetValue] = useState('');

    // State for table sorting
    const [sortConfig, setSortConfig] = useState<{ key: keyof CampaignWithMetrics; direction: 'ascending' | 'descending' }>({
        key: 'spend',
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

    const fetchData = useCallback(async () => {
        if (!selectedProfileId) return;

        setLoading(prev => ({ ...prev, data: true }));
        setError(null);
        setCampaigns([]);
        setPerformanceMetrics({});
        setCampaignNameMap({});
        setCampaignSearch('');
        setCurrentPage(1);

        try {
            // Step 1: Fetch metrics, initial campaigns, and historical names in parallel.
            const metricsPromise = fetch('/api/stream/campaign-metrics');
            const initialCampaignsPromise = fetch('/api/amazon/campaigns/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileId: selectedProfileId }),
            });
            const namesPromise = fetch('/api/ppc/campaign-names');

            const [metricsResponse, initialCampaignsResponse, namesResponse] = await Promise.all([
                metricsPromise,
                initialCampaignsPromise,
                namesPromise,
            ]);

            // Error handling for primary fetches
            if (!metricsResponse.ok) throw new Error((await metricsResponse.json()).error || 'Failed to fetch performance metrics.');
            if (!initialCampaignsResponse.ok) throw new Error((await initialCampaignsResponse.json()).message || 'Failed to fetch campaigns.');
            
            const metricsData: CampaignPerformanceMetrics[] = await metricsResponse.json();
            const initialCampaignsData = await initialCampaignsResponse.json();
            let allCampaigns = initialCampaignsData.campaigns || [];
            
            if (namesResponse.ok) {
                setCampaignNameMap(await namesResponse.json());
            } else {
                console.warn('Could not fetch historical campaign names.');
            }
            
            // Step 2: Identify and fetch any campaigns that have metrics but are missing from the initial list.
            const campaignIdsFromApi = new Set(allCampaigns.map(c => c.campaignId));
            const missingCampaignIds = metricsData
                .map(m => m.campaignId)
                .filter(id => !campaignIdsFromApi.has(id));

            if (missingCampaignIds.length > 0) {
                console.log(`Found ${missingCampaignIds.length} campaigns with metrics but missing metadata. Fetching them...`);
                
                const missingCampaignsResponse = await fetch('/api/amazon/campaigns/list', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        profileId: selectedProfileId,
                        stateFilter: ["ENABLED", "PAUSED", "ARCHIVED"], 
                        campaignIdFilter: missingCampaignIds 
                    }),
                });

                if (missingCampaignsResponse.ok) {
                    const missingCampaignsData = await missingCampaignsResponse.json();
                    const fetchedMissingCampaigns = missingCampaignsData.campaigns || [];
                    allCampaigns = [...allCampaigns, ...fetchedMissingCampaigns];
                    console.log(`Successfully fetched and merged metadata for ${fetchedMissingCampaigns.length} campaigns.`);
                } else {
                    console.warn('Failed to fetch metadata for missing campaigns.');
                }
            }
            
            // Step 3: Set the final state once all data is collected.
            const metricsMap = metricsData.reduce((acc, metric) => {
                acc[metric.campaignId] = metric;
                return acc;
            }, {} as Record<string, CampaignPerformanceMetrics>);

            setPerformanceMetrics(metricsMap);
            setCampaigns(allCampaigns);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred while fetching data.');
        } finally {
            setLoading(prev => ({ ...prev, data: false }));
        }
    }, [selectedProfileId]);

    // Fetch data when profile changes or on manual refresh
    useEffect(() => {
        fetchData();
    }, [fetchData]);

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
            if (editingCampaign?.id === campaignId) {
                setEditingCampaign(null);
            }
        }
    }, [campaigns, selectedProfileId, editingCampaign]);

    const campaignsWithMetrics: CampaignWithMetrics[] = useMemo(() => {
        // Create a Map of all campaigns fetched from the API for O(1) metadata lookup.
        const campaignsFromApi = new Map(campaigns.map(c => [c.campaignId, c]));
    
        // The list of campaigns to display is now driven ONLY by campaigns that have performance metrics in our database.
        const campaignsWithDataInDB = Object.values(performanceMetrics);
    
        const combinedCampaigns: CampaignWithMetrics[] = campaignsWithDataInDB.map(metrics => {
            const campaignId = metrics.campaignId;
            const campaignInfo = campaignsFromApi.get(campaignId);
    
            // Use live campaign info from the API if available.
            // If not found (e.g., campaign is now archived and wasn't fetched), create a placeholder using historical data.
            const baseCampaign: Campaign = campaignInfo
                ? campaignInfo
                : {
                    campaignId: campaignId,
                    name: campaignNameMap[String(campaignId)] || `Campaign ${campaignId}`,
                    campaignType: 'sponsoredProducts',
                    targetingType: 'unknown',
                    state: 'archived', // A safe, non-interactive default
                    dailyBudget: 0,
                    startDate: 'N/A',
                    endDate: null,
                    bidding: {},
                };
            
            const spend = metrics.spend ?? 0;
            const clicks = metrics.clicks ?? 0;
            const impressions = metrics.impressions ?? 0;
            const sales = metrics.sales ?? 0;
            const orders = metrics.orders ?? 0;
            
            return {
                ...baseCampaign,
                impressions,
                clicks,
                spend,
                orders,
                sales,
                ctr: impressions > 0 ? (clicks / impressions) : 0,
                cpc: clicks > 0 ? (spend / clicks) : 0,
                acos: sales > 0 ? (spend / sales) : 0,
                roas: spend > 0 ? (sales / spend) : 0,
            };
        });
        
        return combinedCampaigns;
    }, [campaigns, performanceMetrics, campaignNameMap]);


    // Sorting logic
    const requestSort = useCallback((key: keyof CampaignWithMetrics) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    }, [sortConfig]);

    const getSortIndicator = useCallback((key: keyof CampaignWithMetrics) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'descending' ? ' ↓' : ' ↑';
    }, [sortConfig]);

    const sortedCampaigns = useMemo(() => {
        const sortableCampaigns = [...campaignsWithMetrics];
        if (sortConfig.key) {
            sortableCampaigns.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];

                if (aValue === null || aValue === undefined) return 1;
                if (bValue === null || bValue === undefined) return -1;
                
                let comparison = 0;
                if (typeof aValue === 'number' && typeof bValue === 'number') {
                    comparison = aValue - bValue;
                } else {
                     comparison = String(aValue).localeCompare(String(bValue));
                }
                
                return sortConfig.direction === 'ascending' ? comparison : -comparison;
            });
        }
        return sortableCampaigns;
    }, [campaignsWithMetrics, sortConfig]);

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
    const handleBudgetClick = (campaign: CampaignWithMetrics) => {
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
                <h1 style={styles.title}>Campaign Management</h1>
                <div style={styles.controlGroup}>
                   <button style={styles.primaryButton} onClick={() => alert('Feature coming soon!')}>Create campaign</button>
                    <input
                        type="text"
                        placeholder="Find a campaign..."
                        value={campaignSearch}
                        onChange={handleSearchChange}
                        style={styles.input}
                        disabled={loading.data}
                        aria-label="Search campaigns"
                    />
                </div>
            </header>

            {error && <div style={styles.error} role="alert">{error}</div>}

            <section style={styles.controlsContainer}>
                <div style={styles.controlGroup}>
                    <label htmlFor="profile-select" style={{fontWeight: 500}}>Profile:</label>
                    <select
                        id="profile-select"
                        style={styles.select}
                        value={selectedProfileId}
                        onChange={(e) => setSelectedProfileId(e.target.value)}
                        disabled={loading.profiles || profiles.length === 0}
                    >
                        {loading.profiles ? (
                            <option>Loading...</option>
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
                 <div style={{flexGrow: 1}}></div>
                 <div style={styles.controlGroup}>
                    <select style={styles.select} disabled>
                        <option>Today</option>
                    </select>
                    <button style={styles.button} onClick={fetchData} disabled={loading.data}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z"/>
                            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466"/>
                        </svg>
                        Refresh
                    </button>
                </div>
            </section>
            
            <div style={styles.tableContainer}>
                {loading.data ? (
                    <div style={styles.loader}>Loading campaign data...</div>
                ) : (
                    <table style={styles.table} aria-live="polite">
                        <thead>
                            <tr>
                                <th style={styles.thSortable} onClick={() => requestSort('name')}>
                                    Campaign{getSortIndicator('name')}
                                </th>
                                <th style={styles.thSortable} onClick={() => requestSort('state')}>
                                    Status{getSortIndicator('state')}
                                </th>
                                <th style={styles.thSortable} onClick={() => requestSort('dailyBudget')}>
                                    Budget{getSortIndicator('dailyBudget')}
                                </th>
                                <th style={styles.thSortable} onClick={() => requestSort('impressions')}>
                                    Impressions<InfoIcon title="Impressions from stream data for today"/>{getSortIndicator('impressions')}
                                </th>
                                <th style={styles.thSortable} onClick={() => requestSort('clicks')}>
                                    Clicks<InfoIcon title="Clicks from stream data for today"/>{getSortIndicator('clicks')}
                                </th>
                                <th style={styles.thSortable} onClick={() => requestSort('ctr')}>
                                    CTR<InfoIcon title="Click-Through Rate (Clicks / Impressions)"/>{getSortIndicator('ctr')}
                                </th>
                                <th style={styles.thSortable} onClick={() => requestSort('spend')}>
                                    Spend<InfoIcon title="Spend from stream data for today"/>{getSortIndicator('spend')}
                                </th>
                                <th style={styles.thSortable} onClick={() => requestSort('cpc')}>
                                    CPC<InfoIcon title="Cost Per Click (Spend / Clicks)"/>{getSortIndicator('cpc')}
                                </th>
                                <th style={styles.thSortable} onClick={() => requestSort('orders')}>
                                    Orders<InfoIcon title="Orders from stream data for today"/>{getSortIndicator('orders')}
                                </th>
                                <th style={styles.thSortable} onClick={() => requestSort('sales')}>
                                    Sales<InfoIcon title="Sales from stream data for today"/>{getSortIndicator('sales')}
                                </th>
                                <th style={styles.thSortable} onClick={() => requestSort('acos')}>
                                    ACOS<InfoIcon title="Advertising Cost of Sales (Spend / Sales)"/>{getSortIndicator('acos')}
                                </th>
                                <th style={styles.thSortable} onClick={() => requestSort('roas')}>
                                    ROAS<InfoIcon title="Return on Ad Spend (Sales / Spend)"/>{getSortIndicator('roas')}
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
                                    <td style={{...styles.td, borderBottom: i === paginatedCampaigns.length - 1 ? 'none' : undefined}}>{formatNumber(c.impressions)}</td>
                                    <td style={{...styles.td, borderBottom: i === paginatedCampaigns.length - 1 ? 'none' : undefined}}>{formatNumber(c.clicks)}</td>
                                    <td style={{...styles.td, borderBottom: i === paginatedCampaigns.length - 1 ? 'none' : undefined}}>{(c.ctr * 100).toFixed(2)}%</td>
                                    <td style={{...styles.td, borderBottom: i === paginatedCampaigns.length - 1 ? 'none' : undefined}}>{formatPrice(c.spend)}</td>
                                    <td style={{...styles.td, borderBottom: i === paginatedCampaigns.length - 1 ? 'none' : undefined}}>{formatPrice(c.cpc)}</td>
                                    <td style={{...styles.td, borderBottom: i === paginatedCampaigns.length - 1 ? 'none' : undefined}}>{formatNumber(c.orders)}</td>
                                    <td style={{...styles.td, borderBottom: i === paginatedCampaigns.length - 1 ? 'none' : undefined}}>{formatPrice(c.sales)}</td>
                                    <td style={{...styles.td, borderBottom: i === paginatedCampaigns.length - 1 ? 'none' : undefined}}>{(c.acos * 100).toFixed(2)}%</td>
                                    <td style={{...styles.td, borderBottom: i === paginatedCampaigns.length - 1 ? 'none' : undefined}}>{c.roas.toFixed(2)}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={12} style={{...styles.td, textAlign: 'center', borderBottom: 'none'}}>
                                        {campaignSearch ? 'No campaigns match your search.' : 'No campaigns with performance data found for this profile.'}
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
        </div>
    );
}