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

const timezones = [
    { value: 'America/New_York', label: 'ET (New York)' },
    { value: 'America/Chicago', label: 'CT (Chicago)' },
    { value: 'America/Denver', label: 'MT (Denver)' },
    { value: 'America/Phoenix', label: 'MST (Phoenix)' },
    { value: 'America/Los_Angeles', label: 'PT (Los Angeles)' },
    { value: 'UTC', label: 'UTC' },
    { value: 'Europe/London', label: 'GMT (London)' },
    { value: 'Europe/Paris', label: 'CET (Paris)' },
    { value: 'Asia/Tokyo', label: 'JST (Tokyo)' },
];

// Gets the start and end Date objects for "Today" in a specific timezone.
const getInitialDateRangeInTimezone = (timeZone: string) => {
    const now = new Date();
    // 'en-CA' locale is a reliable way to get YYYY-MM-DD format
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const dateString = formatter.format(now); // e.g., "2024-07-25"
    // Create Date objects representing the start and end of that day.
    // The browser will interpret this in its local time, but the date parts (Y,M,D) will be correct.
    const start = new Date(`${dateString}T00:00:00`);
    const end = new Date(`${dateString}T23:59:59.999`);
    return { start, end };
};


// A timezone-safe function to format a date for API queries.
// This prevents the user's local timezone from shifting the date.
const formatDateForQuery = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};


export function PPCManagementView() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [performanceMetrics, setPerformanceMetrics] = useState<Record<number, CampaignStreamMetrics>>({});
    const [loading, setLoading] = useState({ profiles: true, data: false });
    const [error, setError] = useState<string | null>(null);
    const [timezone, setTimezone] = useState<string>('America/New_York');
    
    // Using a lazy initializer for the dateRange state. This is a React best practice
    // that ensures this calculation runs ONLY ONCE when the component first mounts.
    const [dateRange, setDateRange] = useState(() => getInitialDateRangeInTimezone(timezone));
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
                
                if (!response.ok) {
                    // Read the response body only ONCE as text.
                    const errorText = await response.text();
                    let finalError = errorText; // Default to the raw text from server.

                    // Try to parse it as JSON to get a more structured message if available.
                    try {
                        const errorJson = JSON.parse(errorText);
                        finalError = errorJson.message || JSON.stringify(errorJson.details || errorJson);
                    } catch (e) {
                        // If parsing fails, we just use the raw text, which is already in finalError.
                        // This is expected if the server returns a non-JSON error (e.g., HTML from a gateway).
                        console.warn("Could not parse error response from server as JSON. Using raw text.");
                    }
                    
                    console.error('FRONTEND_LOG: Failed to fetch profiles. Status:', response.status, 'Details:', finalError);
                    // Throw an error with the detailed message from the server.
                    throw new Error(finalError);
                }

                const data = await response.json();
                const usProfiles = data.filter((p: Profile) => p.countryCode === 'US');

                setProfiles(usProfiles);
                if (usProfiles.length > 0) {
                    const storedProfileId = localStorage.getItem('selectedProfileId');
                    const profileIdToSet = storedProfileId && usProfiles.find((p: Profile) => p.profileId.toString() === storedProfileId) ? storedProfileId : usProfiles[0].profileId.toString();
                    setSelectedProfileId(profileIdToSet);
                }
            } catch (err) {
                 console.error('FRONTEND_LOG: An unexpected error occurred during fetchProfiles:', err);
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
            // Step 1: Fetch metrics and the initial list of campaigns in parallel.
            const metricsPromise = fetch(`/api/stream/campaign-metrics?startDate=${formattedStartDate}&endDate=${formattedEndDate}&timezone=${timezone}`);
            const initialCampaignsPromise = fetch('/api/amazon/campaigns/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profileId: selectedProfileId,
                    stateFilter: ["ENABLED", "PAUSED", "ARCHIVED"],
                }),
            });
            
            const [metricsResponse, initialCampaignsResponse] = await Promise.all([metricsPromise, initialCampaignsPromise]);

            if (!metricsResponse.ok) {
                const errorData = await metricsResponse.json();
                throw new Error(errorData.error || 'Failed to fetch performance metrics.');
            }
            if (!initialCampaignsResponse.ok) {
                const errorData = await initialCampaignsResponse.json();
                throw new Error(errorData.message || 'Failed to fetch initial campaigns.');
            }

            const metricsData: CampaignStreamMetrics[] = await metricsResponse.json() || [];
            const initialCampaignsResult = await initialCampaignsResponse.json();
            let allCampaigns: Campaign[] = initialCampaignsResult.campaigns || [];
            
            const existingCampaignIds = new Set(allCampaigns.map(c => c.campaignId));
            const missingCampaignIds = metricsData
                .map(m => m.campaignId)
                .filter(id => !existingCampaignIds.has(id));

            if (missingCampaignIds.length > 0) {
                console.log(`Found ${missingCampaignIds.length} campaigns with metrics but missing metadata. Fetching...`);
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
                    const fetchedMissingCampaigns = missingCampaignsData.campaigns || [];
                    allCampaigns = [...allCampaigns, ...fetchedMissingCampaigns];
                } else {
                    console.warn(`Failed to fetch metadata for ${missingCampaignIds.length} campaigns by ID.`);
                }
            }
            
            const metricsMap = metricsData.reduce((acc, metric) => {
                acc[metric.campaignId] = metric;
                return acc;
            }, {} as Record<number, CampaignStreamMetrics>);

            setCampaigns(allCampaigns);
            setPerformanceMetrics(metricsMap);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch data.');
            setCampaigns([]);
            setPerformanceMetrics({});
        } finally {
            setLoading(prev => ({ ...prev, data: false }));
        }
    }, [selectedProfileId, dateRange, timezone]);


    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (selectedProfileId) {
            localStorage.setItem('selectedProfileId', selectedProfileId);
        }
    }, [selectedProfileId]);
    
    // When the timezone changes, reset the date range to "Today" in the new timezone.
    useEffect(() => {
        setDateRange(getInitialDateRangeInTimezone(timezone));
    }, [timezone]);

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
                    <div style={styles.controlGroup}>
                         <label htmlFor="timezone-select" style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>Timezone:</label>
                         <select
                             id="timezone-select"
                             style={styles.profileSelector}
                             value={timezone}
                             onChange={e => setTimezone(e.target.value)}
                             disabled={loading.data}
                         >
                             {timezones.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                         </select>
                     </div>
                     <div style={{ position: 'relative' }}>
                         <button style={styles.dateButton} onClick={() => setDatePickerOpen(o => !o)}>
                           {formatDateRangeDisplay(dateRange.start, dateRange.end)}
                        </button>
                        {isDatePickerOpen && 
                            <DateRangePicker 
                                initialRange={dateRange}
                                onApply={handleApplyDateRange} 
                                onClose={() => setDatePickerOpen(false)} 
                                timezone={timezone}
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