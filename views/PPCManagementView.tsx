import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Profile, Campaign, CampaignWithMetrics, CampaignStreamMetrics, SummaryMetricsData, CampaignState } from '../types';
import { DateRangePicker } from './components/DateRangePicker';
import { SummaryMetrics } from './components/SummaryMetrics';
import { CampaignTable } from './components/CampaignTable';
import { Pagination } from './components/Pagination';

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        padding: '20px',
        maxWidth: '1400px',
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
        fontSize: '2rem',
        margin: 0,
    },
    controlsContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
        flexWrap: 'wrap',
        padding: '15px',
        backgroundColor: 'var(--card-background-color)',
        borderRadius: 'var(--border-radius)',
        boxShadow: 'var(--box-shadow)',
        marginBottom: '20px',
    },
    controlGroup: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
    },
    profileSelector: {
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
        minWidth: '200px',
    },
    searchInput: {
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
        minWidth: '250px',
    },
    dateButton: {
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
        background: 'white',
        cursor: 'pointer',
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
};

const ITEMS_PER_PAGE = 20;
type SortableKeys = keyof CampaignWithMetrics;

export function PPCManagementView() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [metrics, setMetrics] = useState<CampaignStreamMetrics[]>([]);
    const [loading, setLoading] = useState({ profiles: true, data: false });
    const [error, setError] = useState<string | null>(null);
    
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(today.getDate() - 7);
    
    const [dateRange, setDateRange] = useState({ start: lastWeek, end: today });
    const [isDatePickerOpen, setDatePickerOpen] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>({ key: 'spend', direction: 'descending' });
    const [statusFilter, setStatusFilter] = useState<CampaignState | 'all'>('enabled');


    useEffect(() => {
        const fetchProfiles = async () => {
            try {
                setLoading(prev => ({ ...prev, profiles: true }));
                setError(null);
                const response = await fetch('/api/amazon/profiles');
                if (!response.ok) throw new Error('Failed to fetch profiles.');
                const data = await response.json();
                const usProfiles = data.filter((p: Profile) => p.countryCode === 'US');

                setProfiles(usProfiles);
                if (usProfiles.length > 0) {
                    const storedProfileId = localStorage.getItem('selectedProfileId');
                    const profileIdToSet = storedProfileId && usProfiles.find((p: Profile) => p.profileId === storedProfileId) ? storedProfileId : usProfiles[0].profileId;
                    setSelectedProfileId(profileIdToSet);
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

        setLoading({ ...loading, data: true });
        setError(null);
        setCurrentPage(1);

        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        const formattedStartDate = formatDate(dateRange.start);
        const formattedEndDate = formatDate(dateRange.end);

        try {
            // Step 1: Fetch metrics from the stream first. This is our source of truth.
            const metricsResponse = await fetch(`/api/stream/campaign-metrics?startDate=${formattedStartDate}&endDate=${formattedEndDate}`);
            if (!metricsResponse.ok) throw new Error('Failed to fetch performance metrics.');
            const metricsData: CampaignStreamMetrics[] = (await metricsResponse.json()) || [];
            
            setMetrics(metricsData);

            // If there's no performance data, we don't need to fetch metadata.
            if (metricsData.length === 0) {
                setCampaigns([]);
                return;
            }

            // Step 2: Extract unique campaign IDs from the metrics.
            const campaignIdsFromMetrics = [...new Set(metricsData.map(m => m.campaignId))];

            // Step 3: Fetch metadata (name, status, budget) for only those campaigns.
            const campaignsResponse = await fetch('/api/amazon/campaigns/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profileId: selectedProfileId,
                    stateFilter: ["ENABLED", "PAUSED", "ARCHIVED"], // Get all states to match against metrics
                    campaignIdFilter: campaignIdsFromMetrics
                }),
            });

            if (campaignsResponse.ok) {
                const campaignsResult = await campaignsResponse.json();
                setCampaigns(campaignsResult.campaigns || []);
            } else {
                console.warn('Failed to fetch campaign metadata. Campaigns may be missing names.');
                setCampaigns([]); // Proceed with empty metadata; names will be defaulted.
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch data.');
            setCampaigns([]);
            setMetrics([]);
        } finally {
            setLoading({ ...loading, data: false });
        }
    }, [selectedProfileId, dateRange]);


    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (selectedProfileId) {
            localStorage.setItem('selectedProfileId', selectedProfileId);
        }
    }, [selectedProfileId]);

    const handleApplyDateRange = (newRange: { start: Date; end: Date }) => {
        setDateRange(newRange);
        setDatePickerOpen(false);
    };

    const formatDateRangeDisplay = (start: Date, end: Date) => {
        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
        const startDateStr = start.toLocaleDateString('en-US', options);
        const endDateStr = end.toLocaleDateString('en-US', options);
        return startDateStr === endDateStr ? startDateStr : `${startDateStr} - ${endDateStr}`;
    };
    
    const handleUpdateCampaign = async (campaignId: number, update: any) => {
        const originalCampaigns = [...campaigns];
        setCampaigns(prev => prev.map(c => c.campaignId === campaignId ? { ...c, ...(update.budget ? {dailyBudget: update.budget.amount} : update) } : c));

        try {
            const response = await fetch('/api/amazon/campaigns', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileId: selectedProfileId, updates: [{ campaignId, ...update }] }),
            });
            if (!response.ok) throw new Error('Failed to update campaign.');
        } catch (err)
        {
            setError(err instanceof Error ? err.message : 'Update failed.');
            setCampaigns(originalCampaigns); // Revert on failure
        }
    };

    // 1. Combine data, with METRICS as the source of truth.
    const combinedCampaignData: CampaignWithMetrics[] = useMemo(() => {
        // Create a map for quick metadata lookup from the 'campaigns' state
        const campaignMetadataMap = new Map(campaigns.map(c => [c.campaignId, c]));

        // Iterate over metrics, as they are the definitive list of campaigns to show.
        return metrics.map(metric => {
            const metadata = campaignMetadataMap.get(metric.campaignId);
            const spend = metric.spend ?? 0;
            const sales = metric.sales ?? 0;
            const clicks = metric.clicks ?? 0;
            
            // If metadata wasn't found (e.g., campaign was deleted), provide sensible defaults.
            const campaignBase = metadata || {
                campaignId: metric.campaignId,
                name: `Campaign ${metric.campaignId}`, // Default name
                campaignType: 'sponsoredProducts',
                targetingType: 'auto',
                state: 'archived' as CampaignState, // Assume archived if not found
                dailyBudget: 0,
                startDate: 'N/A',
                endDate: null,
            };
            
            return {
                ...campaignBase,
                impressions: metric.impressions ?? 0,
                clicks: clicks,
                spend: spend,
                sales: sales,
                orders: metric.orders ?? 0,
                acos: sales > 0 ? spend / sales : 0,
                roas: spend > 0 ? sales / spend : 0,
                cpc: clicks > 0 ? spend / clicks : 0,
            };
        });
    }, [campaigns, metrics]);
    
    // 2. Create the dataset for summary calculations (only filter by search term).
    const dataForSummary = useMemo(() => {
         if (!searchTerm) return combinedCampaignData;
         return combinedCampaignData.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [combinedCampaignData, searchTerm]);

    const summaryMetrics: SummaryMetricsData | null = useMemo(() => {
        if (loading.data) return null;
        
        const total = dataForSummary.reduce((acc, campaign) => {
            acc.spend += campaign.spend || 0;
            acc.sales += campaign.sales || 0;
            acc.orders += campaign.orders || 0;
            acc.clicks += campaign.clicks || 0;
            acc.impressions += campaign.impressions || 0;
            return acc;
        }, { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 });

        return {
            ...total,
            acos: total.sales > 0 ? total.spend / total.sales : 0,
            roas: total.spend > 0 ? total.sales / total.spend : 0,
            cpc: total.clicks > 0 ? total.spend / total.clicks : 0,
            ctr: total.impressions > 0 ? total.clicks / total.impressions : 0,
        };
    }, [dataForSummary, loading.data]);

    // 3. Create the final dataset for the table (apply status filter, search term, and sorting).
    const finalDisplayData: CampaignWithMetrics[] = useMemo(() => {
        let data = combinedCampaignData;

        if (statusFilter !== 'all') {
            data = data.filter(c => c.state === statusFilter);
        }
        if (searchTerm) {
            data = data.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }

        if (sortConfig !== null) {
            data.sort((a, b) => {
                const aValue = a[sortConfig.key] ?? 0;
                const bValue = b[sortConfig.key] ?? 0;

                if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            });
        }
        return data;
    }, [combinedCampaignData, statusFilter, searchTerm, sortConfig]);

    const paginatedCampaigns = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return finalDisplayData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [finalDisplayData, currentPage]);
    
    const totalPages = Math.ceil(finalDisplayData.length / ITEMS_PER_PAGE);

    const requestSort = (key: SortableKeys) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h1 style={styles.title}>PPC Management Dashboard</h1>
            </header>

            {error && <div style={styles.error} role="alert">{error}</div>}

            <section style={styles.controlsContainer}>
                 <div style={styles.controlGroup}>
                    <label htmlFor="profile-select" style={{ fontWeight: 500 }}>Profile:</label>
                    <select
                        id="profile-select"
                        style={styles.profileSelector}
                        value={selectedProfileId || ''}
                        onChange={(e) => setSelectedProfileId(e.target.value)}
                        disabled={loading.profiles || profiles.length === 0}
                    >
                        {loading.profiles ? (
                            <option>Loading profiles...</option>
                        ) : profiles.length > 0 ? (
                            profiles.map(p => <option key={p.profileId} value={p.profileId}>{p.profileId} ({p.countryCode})</option>)
                        ) : (
                            <option>No US profiles found</option>
                        )}
                    </select>
                </div>
                 <div style={styles.controlGroup}>
                    <label htmlFor="status-filter" style={{ fontWeight: 500 }}>Status:</label>
                    <select
                        id="status-filter"
                        style={styles.profileSelector}
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as any)}
                        disabled={loading.data}
                    >
                        <option value="enabled">Enabled</option>
                        <option value="paused">Paused</option>
                        <option value="archived">Archived</option>
                        <option value="all">All States</option>
                    </select>
                </div>
                 <div style={styles.controlGroup}>
                     <input
                        type="text"
                        placeholder="Search by campaign name..."
                        style={styles.searchInput}
                        value={searchTerm}
                        onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        disabled={loading.data}
                    />
                </div>
                <div style={{...styles.controlGroup, marginLeft: 'auto'}}>
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
            </section>

            <SummaryMetrics metrics={summaryMetrics} loading={loading.data} />
            
            {loading.data ? (
                <div style={styles.loader}>Loading campaign data...</div>
            ) : finalDisplayData.length > 0 || searchTerm ? (
                <>
                    <CampaignTable 
                        campaigns={paginatedCampaigns} 
                        onUpdateCampaign={handleUpdateCampaign}
                        sortConfig={sortConfig}
                        onRequestSort={requestSort}
                    />
                    <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                </>
            ) : (
                <div style={{...styles.loader, color: '#666'}}>No campaign data found for the selected profile and date range.</div>
            )}
        </div>
    );
}