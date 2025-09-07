import React, { useState, useEffect, useCallback, useMemo, useRef, useContext } from 'react';
import { Link } from 'react-router-dom';
import { Profile, Campaign, CampaignWithMetrics, CampaignStreamMetrics, SummaryMetricsData, CampaignState } from '../types';
import { DateRangePicker } from './components/DateRangePicker';
import { SummaryMetrics } from './components/SummaryMetrics';
import { CampaignTable } from './components/CampaignTable';
import { Pagination } from './components/Pagination';
import { DataCacheContext } from '../contexts/DataCacheContext';
import { areDateRangesEqual } from '../utils';

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

const getInitialDateRange = () => {
    const end = new Date();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

const formatDateForQuery = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};


export function PPCManagementView() {
    const { cache, setCache } = useContext(DataCacheContext);

    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
        localStorage.getItem('selectedProfileId') || null
    );
    const [campaigns, setCampaigns] = useState<Campaign[]>(cache.ppcManagement.campaigns || []);
    const [performanceMetrics, setPerformanceMetrics] = useState<Record<number, CampaignStreamMetrics>>(cache.ppcManagement.performanceMetrics || {});
    const [loading, setLoading] = useState({ profiles: true, data: true });
    const [error, setError] = useState<string | null>(null);
    
    const [dateRange, setDateRange] = useState(cache.ppcManagement.dateRange || getInitialDateRange);
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
                    const profileIdToSet = storedProfileId && usProfiles.find((p: Profile) => p.profileId.toString() === storedProfileId) 
                        ? storedProfileId 
                        : usProfiles[0].profileId.toString();
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

        setLoading(prev => ({ ...prev, data: true }));
        setError(null);
        setCurrentPage(1);

        const formattedStartDate = formatDateForQuery(dateRange.start);
        const formattedEndDate = formatDateForQuery(dateRange.end);

        try {
            const metricsPromise = fetch(`/api/stream/campaign-metrics?startDate=${formattedStartDate}&endDate=${formattedEndDate}`);
            const initialCampaignsPromise = fetch('/api/amazon/campaigns/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profileId: selectedProfileId,
                    stateFilter: ["ENABLED", "PAUSED", "ARCHIVED"],
                }),
            });
            
            const [metricsResponse, initialCampaignsResponse] = await Promise.all([metricsPromise, initialCampaignsPromise]);

            if (!metricsResponse.ok) throw new Error((await metricsResponse.json()).error || 'Failed to fetch performance metrics.');
            if (!initialCampaignsResponse.ok) throw new Error((await initialCampaignsResponse.json()).message || 'Failed to fetch initial campaigns.');

            const metricsData: CampaignStreamMetrics[] = await metricsResponse.json() || [];
            const initialCampaignsResult = await initialCampaignsResponse.json();
            let allCampaigns: Campaign[] = initialCampaignsResult.campaigns || [];
            
            const existingCampaignIds = new Set(allCampaigns.map(c => c.campaignId));
            const missingCampaignIds = metricsData
                .map(m => m.campaignId)
                .filter(id => !existingCampaignIds.has(id));

            if (missingCampaignIds.length > 0) {
                const missingCampaignsResponse = await fetch('/api/amazon/campaigns/list', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        profileId: selectedProfileId,
                        stateFilter: ["ENABLED", "PAUSED", "ARCHIVED"], 
                        campaignIdFilter: missingCampaignIds,
                    }),
                });

                if (missingCampaignsResponse.ok) {
                    const missingCampaignsData = await missingCampaignsResponse.json();
                    allCampaigns = [...allCampaigns, ...(missingCampaignsData.campaigns || [])];
                }
            }
            
            const metricsMap = metricsData.reduce((acc, metric) => {
                acc[metric.campaignId] = metric;
                return acc;
            }, {} as Record<number, CampaignStreamMetrics>);

            setCampaigns(allCampaigns);
            setPerformanceMetrics(metricsMap);
            // Update the global cache
            setCache(prev => ({
                ...prev,
                ppcManagement: {
                    campaigns: allCampaigns,
                    performanceMetrics: metricsMap,
                    profileId: selectedProfileId,
                    dateRange: dateRange,
                }
            }));

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch data.');
            setCampaigns([]);
            setPerformanceMetrics({});
        } finally {
            setLoading(prev => ({ ...prev, data: false }));
        }
    }, [selectedProfileId, dateRange, setCache]);


    useEffect(() => {
        if (!selectedProfileId) {
             setLoading(prev => ({ ...prev, data: false }));
             return;
        }

        // Check if data for the current filters is already in the cache
        if (
            cache.ppcManagement.profileId === selectedProfileId &&
            areDateRangesEqual(cache.ppcManagement.dateRange, dateRange) &&
            cache.ppcManagement.campaigns.length > 0
        ) {
            setCampaigns(cache.ppcManagement.campaigns);
            setPerformanceMetrics(cache.ppcManagement.performanceMetrics);
            setLoading(prev => ({ ...prev, data: false }));
            return; // Skip fetch
        }

        fetchData();
    }, [selectedProfileId, dateRange, fetchData, cache]);

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
             // On success, invalidate the cache so fresh data is pulled next time
            setCache(prev => ({...prev, ppcManagement: { ...prev.ppcManagement, campaigns: [] }}));
        } catch (err)
        {
            setError(err instanceof Error ? err.message : 'Update failed.');
            setCampaigns(originalCampaigns); // Revert on failure
        }
    };

    const combinedCampaignData: CampaignWithMetrics[] = useMemo(() => {
        const enrichedCampaigns = campaigns.map(campaign => {
            const metrics = performanceMetrics[campaign.campaignId] || {
                campaignId: campaign.campaignId,
                impressions: 0,
                clicks: 0,
                spend: 0,
                orders: 0,
                sales: 0,
            };

            const { impressions, clicks, spend, sales, orders } = metrics;
            
            return {
                ...campaign,
                impressions,
                clicks,
                spend,
                orders,
                sales,
                acos: sales > 0 ? spend / sales : 0,
                roas: spend > 0 ? sales / spend : 0,
                cpc: clicks > 0 ? spend / clicks : 0,
                ctr: impressions > 0 ? clicks / impressions : 0,
            };
        });

        return enrichedCampaigns.filter(c => c.impressions > 0 || c.clicks > 0 || c.spend > 0 || c.orders > 0 || c.sales > 0);
    }, [campaigns, performanceMetrics]);
    
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
                        onChange={e => {
                            setStatusFilter(e.target.value as any);
                            setCurrentPage(1);
                        }}
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
