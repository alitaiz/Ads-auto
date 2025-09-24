import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { Profile, Campaign, CampaignWithMetrics, CampaignStreamMetrics, SummaryMetricsData, CampaignState, AdGroup, AutomationRule } from '../types';
import { DateRangePicker } from './components/DateRangePicker';
import { SummaryMetrics } from './components/SummaryMetrics';
import { CampaignTable } from './components/CampaignTable';
import { Pagination } from './components/Pagination';
import { DataCacheContext } from '../contexts/DataCacheContext';
import { areDateRangesEqual } from '../utils';

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
    bulkActionContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
        paddingLeft: '20px',
        marginLeft: 'auto',
        borderLeft: '2px solid var(--border-color)',
    },
    bulkActionButton: {
        padding: '8px 16px',
        backgroundColor: 'var(--primary-color)',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: '500'
    },
};

const ITEMS_PER_PAGE = 20;
type SortableKeys = keyof CampaignWithMetrics;

interface AutomationLog {
    id: number;
    rule_name: string;
    run_at: string;
    status: string;
    summary: string;
    details: any;
}

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
    const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
    const [loading, setLoading] = useState({ profiles: true, data: true, rules: true });
    const [error, setError] = useState<string | null>(null);
    
    const [dateRange, setDateRange] = useState(cache.ppcManagement.dateRange || getInitialDateRange);
    const [isDatePickerOpen, setDatePickerOpen] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    // FIX: Changed initial sort key from 'spend' to 'adjustedSpend' to match CampaignWithMetrics type.
    const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' } | null>({ key: 'adjustedSpend', direction: 'descending' });
    const [statusFilter, setStatusFilter] = useState<CampaignState | 'all'>('enabled');
    
    // State for expanded automation logs
    const [expandedCampaignId, setExpandedCampaignId] = useState<number | null>(null);
    const [automationLogs, setAutomationLogs] = useState<Record<number, AutomationLog[]>>({});
    const [loadingLogs, setLoadingLogs] = useState<number | null>(null);
    const [logsError, setLogsError] = useState<string | null>(null);

    // State for bulk actions
    const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<number>>(new Set());
    const [selectedBulkBidRule, setSelectedBulkBidRule] = useState<string>('none');
    const [selectedBulkSearchTermRule, setSelectedBulkSearchTermRule] = useState<string>('none');


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
    
    const fetchRules = useCallback(async () => {
        setLoading(prev => ({ ...prev, rules: true }));
        try {
            const res = await fetch('/api/automation/rules');
            if (!res.ok) throw new Error('Failed to fetch automation rules.');
            const data = await res.json();
            setAutomationRules(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred while fetching rules.');
        } finally {
            setLoading(prev => ({ ...prev, rules: false }));
        }
    }, []);

    useEffect(() => {
        fetchRules();
    }, [fetchRules]);

    const fetchData = useCallback(async () => {
        if (!selectedProfileId) return;

        setLoading(prev => ({ ...prev, data: true }));
        setError(null);
        setCurrentPage(1);
        setSelectedCampaignIds(new Set()); // Clear selection on data reload

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
            
            const uniqueCampaignsMap = new Map<number, Campaign>();
            for (const campaign of allCampaigns) {
                if (campaign?.campaignId) {
                    uniqueCampaignsMap.set(campaign.campaignId, campaign);
                }
            }
            const uniqueCampaigns = Array.from(uniqueCampaignsMap.values());

            const metricsMap = metricsData.reduce((acc, metric) => {
                acc[metric.campaignId] = metric;
                return acc;
            }, {} as Record<number, CampaignStreamMetrics>);

            setCampaigns(uniqueCampaigns);
            setPerformanceMetrics(metricsMap);
            setCache(prev => ({
                ...prev,
                ppcManagement: {
                    campaigns: uniqueCampaigns,
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

        if (
            cache.ppcManagement.profileId === selectedProfileId &&
            areDateRangesEqual(cache.ppcManagement.dateRange, dateRange) &&
            cache.ppcManagement.campaigns.length > 0
        ) {
            setCampaigns(cache.ppcManagement.campaigns);
            setPerformanceMetrics(cache.ppcManagement.performanceMetrics);
            setLoading(prev => ({ ...prev, data: false }));
            return;
        }

        fetchData();
    }, [selectedProfileId, dateRange, fetchData, cache]);

    useEffect(() => {
        if (selectedProfileId) {
            localStorage.setItem('selectedProfileId', selectedProfileId);
        }
    }, [selectedProfileId]);
    
    const handleToggleExpand = async (campaignId: number) => {
        const currentlyExpanded = expandedCampaignId === campaignId;
        setExpandedCampaignId(currentlyExpanded ? null : campaignId);
        setLogsError(null);

        if (!currentlyExpanded && !automationLogs[campaignId]) {
            setLoadingLogs(campaignId);
            try {
                const response = await fetch(`/api/automation/logs?campaignId=${campaignId}`);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to fetch automation logs.');
                }
                const data = await response.json();
                setAutomationLogs(prev => ({ ...prev, [campaignId]: data }));
            } catch (err) {
                setLogsError(err instanceof Error ? err.message : 'An unknown error occurred.');
            } finally {
                setLoadingLogs(null);
            }
        }
    };


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
            setCache(prev => ({...prev, ppcManagement: { ...prev.ppcManagement, campaigns: [] }}));
        } catch (err)
        {
            setError(err instanceof Error ? err.message : 'Update failed.');
            setCampaigns(originalCampaigns);
        }
    };

    const handleRuleAssignmentChange = useCallback(async (campaignId: number, ruleType: 'BID_ADJUSTMENT' | 'SEARCH_TERM_AUTOMATION', newRuleIdStr: string) => {
        const newRuleId = newRuleIdStr === 'none' ? null : parseInt(newRuleIdStr, 10);
        
        const rulesOfType = automationRules.filter(r => r.rule_type === ruleType);
        const oldRule = rulesOfType.find(r => r.scope.campaignIds?.includes(campaignId));
        const newRule = newRuleId ? rulesOfType.find(r => r.id === newRuleId) : null;
        
        if (oldRule?.id === newRule?.id) return;

        const updates: Promise<any>[] = [];

        if (oldRule) {
            const updatedScope = { campaignIds: (oldRule.scope.campaignIds || []).filter(id => id !== campaignId) };
            updates.push(fetch(`/api/automation/rules/${oldRule.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...oldRule, scope: updatedScope }),
            }));
        }

        if (newRule) {
            const updatedScope = { campaignIds: [...(newRule.scope.campaignIds || []), campaignId] };
            updates.push(fetch(`/api/automation/rules/${newRule.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...newRule, scope: updatedScope }),
            }));
        }

        try {
            await Promise.all(updates);
            await fetchRules(); // Refresh rules state from the source of truth
        } catch (err) {
            setError('Failed to update rule assignment.');
            fetchRules(); // Re-fetch to revert optimistic UI
        }
    }, [automationRules, fetchRules]);

    const combinedCampaignData: CampaignWithMetrics[] = useMemo(() => {
        const enrichedCampaigns = campaigns.map(campaign => {
            // FIX: Use 'adjustedSpend' in the fallback object to match CampaignStreamMetrics.
            const metrics = performanceMetrics[campaign.campaignId] || {
                campaignId: campaign.campaignId,
                impressions: 0,
                clicks: 0,
                adjustedSpend: 0,
                orders: 0,
                sales: 0,
            };

            // FIX: Destructure 'adjustedSpend' instead of 'spend'.
            const { impressions, clicks, adjustedSpend, sales, orders } = metrics;
            
            return {
                ...campaign,
                impressions,
                clicks,
                // FIX: Use 'adjustedSpend' in the returned object and subsequent calculations.
                adjustedSpend,
                orders,
                sales,
                acos: sales > 0 ? adjustedSpend / sales : 0,
                roas: adjustedSpend > 0 ? sales / adjustedSpend : 0,
                cpc: clicks > 0 ? adjustedSpend / clicks : 0,
                ctr: impressions > 0 ? clicks / impressions : 0,
            };
        });

        return enrichedCampaigns.filter(c => c.impressions > 0 || c.clicks > 0 || c.adjustedSpend > 0 || c.orders > 0 || c.sales > 0);
    }, [campaigns, performanceMetrics]);
    
    const dataForSummary = useMemo(() => {
         if (!searchTerm) return combinedCampaignData;
         return combinedCampaignData.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [combinedCampaignData, searchTerm]);

    const summaryMetrics: SummaryMetricsData | null = useMemo(() => {
        if (loading.data) return null;
        
        // FIX: Accumulate 'adjustedSpend' instead of 'spend' to match CampaignWithMetrics and SummaryMetricsData types.
        const total = dataForSummary.reduce((acc, campaign) => {
            acc.adjustedSpend += campaign.adjustedSpend || 0;
            acc.sales += campaign.sales || 0;
            acc.orders += campaign.orders || 0;
            acc.clicks += campaign.clicks || 0;
            acc.impressions += campaign.impressions || 0;
            return acc;
        }, { adjustedSpend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 });

        return {
            ...total,
            // FIX: Use 'adjustedSpend' in calculations.
            acos: total.sales > 0 ? total.adjustedSpend / total.sales : 0,
            roas: total.adjustedSpend > 0 ? total.sales / total.adjustedSpend : 0,
            cpc: total.clicks > 0 ? total.adjustedSpend / total.clicks : 0,
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
    
    const handleSelectCampaign = (campaignId: number, isSelected: boolean) => {
        setSelectedCampaignIds(prev => {
            const newSet = new Set(prev);
            if (isSelected) newSet.add(campaignId);
            else newSet.delete(campaignId);
            return newSet;
        });
    };

    const handleSelectAllCampaigns = (isSelected: boolean) => {
        if (isSelected) {
            setSelectedCampaignIds(new Set(finalDisplayData.map(c => c.campaignId)));
        } else {
            setSelectedCampaignIds(new Set());
        }
    };

    const isAllSelected = finalDisplayData.length > 0 && selectedCampaignIds.size === finalDisplayData.length;
    
    const profileFilteredRules = useMemo(() => {
        return automationRules.filter(r => r.profile_id === selectedProfileId);
    }, [automationRules, selectedProfileId]);
    
    const bidAdjustmentRules = useMemo(() => profileFilteredRules.filter(r => r.rule_type === 'BID_ADJUSTMENT'), [profileFilteredRules]);
    const searchTermRules = useMemo(() => profileFilteredRules.filter(r => r.rule_type === 'SEARCH_TERM_AUTOMATION'), [profileFilteredRules]);

    const handleBulkApplyRules = async () => {
        if (selectedCampaignIds.size === 0) return;
        if (selectedBulkBidRule === 'none' && selectedBulkSearchTermRule === 'none') {
            alert('Please select a rule to apply.');
            return;
        }

        setLoading(prev => ({...prev, rules: true}));
        const campaignsToUpdate = Array.from(selectedCampaignIds);
        const updates: Promise<Response>[] = [];

        const applyRule = (ruleType: 'BID_ADJUSTMENT' | 'SEARCH_TERM_AUTOMATION', newRuleIdStr: string) => {
            const newRuleId = newRuleIdStr === 'none' ? null : parseInt(newRuleIdStr, 10);
            if (newRuleId === null) return;
            
            const rulesOfType = ruleType === 'BID_ADJUSTMENT' ? bidAdjustmentRules : searchTermRules;
            
            const oldRules = rulesOfType.filter(r => 
                campaignsToUpdate.some(campaignId => (r.scope.campaignIds || []).includes(campaignId))
            );
            
            for (const oldRule of oldRules) {
                const updatedScope = { 
                    campaignIds: (oldRule.scope.campaignIds || []).filter(id => !campaignsToUpdate.includes(id as number)) 
                };
                updates.push(fetch(`/api/automation/rules/${oldRule.id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...oldRule, scope: updatedScope }),
                }));
            }

            const newRule = rulesOfType.find(r => r.id === newRuleId);
            if (newRule) {
                 const updatedScope = { 
                    campaignIds: [...new Set([...(newRule.scope.campaignIds || []).map(Number), ...campaignsToUpdate])] 
                };
                 updates.push(fetch(`/api/automation/rules/${newRule.id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...newRule, scope: updatedScope }),
                }));
            }
        };

        if (selectedBulkBidRule !== 'none') applyRule('BID_ADJUSTMENT', selectedBulkBidRule);
        if (selectedBulkSearchTermRule !== 'none') applyRule('SEARCH_TERM_AUTOMATION', selectedBulkSearchTermRule);

        try {
            const responses = await Promise.all(updates);
            const failed = responses.find(res => !res.ok);
            if (failed) throw new Error('One or more API calls failed during bulk update.');
            
            await fetchRules();
            setSelectedCampaignIds(new Set());
            setSelectedBulkBidRule('none');
            setSelectedBulkSearchTermRule('none');
        } catch (err) {
            setError('Failed to apply rules in bulk.');
            fetchRules(); // Re-fetch to revert UI
        } finally {
            setLoading(prev => ({...prev, rules: false}));
        }
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
                            setSelectedCampaignIds(new Set());
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
                        onChange={e => { 
                            setSearchTerm(e.target.value); 
                            setCurrentPage(1);
                            setSelectedCampaignIds(new Set());
                        }}
                        disabled={loading.data}
                    />
                </div>
                {selectedCampaignIds.size > 0 && (
                    <div style={styles.bulkActionContainer}>
                        <span style={{fontWeight: 600}}>{selectedCampaignIds.size} selected</span>
                        <select
                            value={selectedBulkBidRule}
                            onChange={e => setSelectedBulkBidRule(e.target.value)}
                            style={styles.profileSelector}
                            disabled={loading.rules}
                        >
                            <option value="none">-- Assign Bid Rule --</option>
                            {bidAdjustmentRules.map(rule => (
                                <option key={rule.id} value={rule.id}>{rule.name}</option>
                            ))}
                        </select>
                         <select
                            value={selectedBulkSearchTermRule}
                            onChange={e => setSelectedBulkSearchTermRule(e.target.value)}
                            style={styles.profileSelector}
                            disabled={loading.rules}
                        >
                            <option value="none">-- Assign Search Term Rule --</option>
                            {searchTermRules.map(rule => (
                                <option key={rule.id} value={rule.id}>{rule.name}</option>
                            ))}
                        </select>
                        <button onClick={handleBulkApplyRules} style={styles.bulkActionButton} disabled={loading.rules}>
                            {loading.rules ? 'Applying...' : 'Apply'}
                        </button>
                    </div>
                )}
                <div style={{...styles.controlGroup, marginLeft: selectedCampaignIds.size > 0 ? '0' : 'auto'}}>
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
            
            {(loading.data || loading.rules) ? (
                <div style={styles.loader}>Loading campaign data...</div>
            ) : finalDisplayData.length > 0 || searchTerm ? (
                <>
                    <CampaignTable 
                        campaigns={paginatedCampaigns} 
                        onUpdateCampaign={handleUpdateCampaign}
                        sortConfig={sortConfig}
                        onRequestSort={requestSort}
                        expandedCampaignId={expandedCampaignId}
                        onToggleExpand={handleToggleExpand}
                        automationLogs={automationLogs}
                        loadingLogs={loadingLogs}
                        logsError={logsError}
                        automationRules={profileFilteredRules}
                        onUpdateRuleAssignment={handleRuleAssignmentChange}
                        selectedCampaignIds={selectedCampaignIds}
                        onSelectCampaign={handleSelectCampaign}
                        onSelectAll={handleSelectAllCampaigns}
                        isAllSelected={isAllSelected}
                    />
                    <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
                </>
            ) : (
                <div style={{...styles.loader, color: '#666'}}>No campaign data found for the selected profile and date range.</div>
            )}
        </div>
    );
}