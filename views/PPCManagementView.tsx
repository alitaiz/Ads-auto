import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Profile, Campaign, CampaignWithMetrics, CampaignStreamMetrics, SummaryMetricsData } from '../types';
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
    controls: {
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
    },
    profileSelector: {
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
        minWidth: '200px',
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
};

const ITEMS_PER_PAGE = 20;

export function PPCManagementView() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [metrics, setMetrics] = useState<CampaignStreamMetrics[]>([]);
    const [loading, setLoading] = useState({ profiles: true, campaigns: false, metrics: false });
    const [error, setError] = useState<string | null>(null);
    
    // Default to last 7 days
    const today = new Date();
    const lastWeek = new Date(today);
    lastWeek.setDate(today.getDate() - 7);
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    
    const [startDate, setStartDate] = useState(formatDate(lastWeek));
    const [endDate, setEndDate] = useState(formatDate(today));

    const [currentPage, setCurrentPage] = useState(1);

    // Fetch profiles on mount
    useEffect(() => {
        const fetchProfiles = async () => {
            try {
                setLoading(prev => ({ ...prev, profiles: true }));
                setError(null);
                const response = await fetch('/api/amazon/profiles');
                if (!response.ok) throw new Error('Failed to fetch profiles.');
                const data = await response.json();
                setProfiles(data);
                if (data.length > 0) {
                    const storedProfileId = sessionStorage.getItem('selectedProfileId');
                    const profileIdToSet = storedProfileId && data.find((p: Profile) => p.profileId === storedProfileId) ? storedProfileId : data[0].profileId;
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

    // Fetch campaigns and metrics when profile or date range changes
    const fetchData = useCallback(async () => {
        if (!selectedProfileId) return;

        setLoading(prev => ({ ...prev, campaigns: true, metrics: true }));
        setError(null);
        setCurrentPage(1);

        try {
            // Fetch campaigns
            const campaignsResponse = await fetch('/api/amazon/campaigns/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileId: selectedProfileId }),
            });
            if (!campaignsResponse.ok) throw new Error('Failed to fetch campaigns.');
            const campaignsData = await campaignsResponse.json();
            setCampaigns(campaignsData.campaigns || []);
            setLoading(prev => ({ ...prev, campaigns: false }));
            
            // Fetch metrics
            const metricsResponse = await fetch(`/api/stream/campaign-metrics?startDate=${startDate}&endDate=${endDate}`);
            if (!metricsResponse.ok) throw new Error('Failed to fetch metrics.');
            const metricsData = await metricsResponse.json();
            setMetrics(metricsData || []);
            setLoading(prev => ({ ...prev, metrics: false }));

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch data.');
            setLoading({ profiles: false, campaigns: false, metrics: false });
        }
    }, [selectedProfileId, startDate, endDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        if (selectedProfileId) {
            sessionStorage.setItem('selectedProfileId', selectedProfileId);
        }
    }, [selectedProfileId]);
    
    const handleUpdateCampaign = async (campaignId: number, update: any) => {
        const originalCampaigns = [...campaigns];
        // Optimistic UI update
        setCampaigns(prev => prev.map(c => c.campaignId === campaignId ? { ...c, ...(update.budget ? {dailyBudget: update.budget.amount} : update) } : c));

        try {
            const response = await fetch('/api/amazon/campaigns', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileId: selectedProfileId, updates: [{ campaignId, ...update }] }),
            });
            if (!response.ok) throw new Error('Failed to update campaign.');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Update failed.');
            setCampaigns(originalCampaigns); // Revert on failure
        }
    };

    const combinedCampaignData: CampaignWithMetrics[] = useMemo(() => {
        return campaigns.map(campaign => {
            const campaignMetrics = metrics.find(m => m.campaignId === campaign.campaignId);
            const spend = campaignMetrics?.spend ?? 0;
            const sales = campaignMetrics?.sales ?? 0;
            const clicks = campaignMetrics?.clicks ?? 0;
            
            return {
                ...campaign,
                impressions: campaignMetrics?.impressions ?? 0,
                clicks: clicks,
                spend: spend,
                sales: sales,
                orders: campaignMetrics?.orders ?? 0,
                acos: sales > 0 ? spend / sales : 0,
                roas: spend > 0 ? sales / spend : 0,
                cpc: clicks > 0 ? spend / clicks : 0,
            };
        });
    }, [campaigns, metrics]);
    
    const summaryMetrics: SummaryMetricsData | null = useMemo(() => {
        if (loading.metrics) return null;
        const total = combinedCampaignData.reduce((acc, campaign) => {
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
    }, [combinedCampaignData, loading.metrics]);


    const paginatedCampaigns = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return combinedCampaignData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [combinedCampaignData, currentPage]);
    
    const totalPages = Math.ceil(combinedCampaignData.length / ITEMS_PER_PAGE);

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h1 style={styles.title}>PPC Management Dashboard</h1>
                <div style={styles.controls}>
                    <DateRangePicker
                        startDate={startDate}
                        endDate={endDate}
                        onStartDateChange={setStartDate}
                        onEndDateChange={setEndDate}
                    />
                    <select
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
                            <option>No profiles found</option>
                        )}
                    </select>
                </div>
            </header>

            {error && <div style={styles.error} role="alert">{error}</div>}

            <SummaryMetrics metrics={summaryMetrics} loading={loading.metrics || loading.campaigns} />
            
            {loading.campaigns || loading.metrics ? (
                <div style={styles.loader}>Loading campaign data...</div>
            ) : combinedCampaignData.length > 0 ? (
                <>
                    <CampaignTable campaigns={paginatedCampaigns} onUpdateCampaign={handleUpdateCampaign} />
                    <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                </>
            ) : (
                <div style={{...styles.loader, color: '#666'}}>No campaign data found for the selected profile and date range.</div>
            )}
        </div>
    );
}
