import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { Profile, Campaign, CampaignWithMetrics, CampaignStreamMetrics, SummaryMetricsData, CampaignState, AdGroup, AutomationRule, MetricFilters } from '../types';
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
        minWidth: '220px',
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
        gap: '10px',
        paddingLeft: '15px',
        marginLeft: 'auto',
        borderLeft: '2px solid var(--border-color)',
        flexWrap: 'wrap'
    },
    bulkActionButton: {
        padding: '8px 16px',
        backgroundColor: 'var(--primary-color)',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: '500',
        height: '40px',
    },
    multiSelect: {
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        padding: '5px',
        height: '80px',
    },
    modalBackdrop: {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex',
        justifyContent: 'center', alignItems: 'center', zIndex: 1000
    },
    modalContent: {
        backgroundColor: 'var(--card-background-color)', padding: '25px',
        borderRadius: 'var(--border-radius)', width: '90%', maxWidth: '500px',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: '20px'
    },
    modalHeader: { fontSize: '1.5rem', margin: 0, paddingBottom: '10px', borderBottom: '1px solid var(--border-color)' },
    modalBody: { overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' },
    modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '15px' },
    checkboxLabel: { display: 'block', padding: '8px', borderRadius: '4px', cursor: 'pointer', userSelect: 'none' },
};

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

type EditableRuleType = 'BID_ADJUSTMENT' | 'SEARCH_TERM_AUTOMATION' | 'BUDGET_ACCELERATION' | 'SEARCH_TERM_HARVESTING';

const RuleEditModal = ({ isOpen, onClose, campaign, allRules, onSave }: { isOpen: boolean, onClose: () => void, campaign: {id: number; name: string; type: EditableRuleType} | null, allRules: AutomationRule[], onSave: (campaignId: number, initialIds: Set<number>, newIds: Set<number>) => void }) => {
    if (!isOpen || !campaign) return null;

    const relevantRules = allRules.filter(r => r.rule_type === campaign.type);
    
    const initialSelectedIds = useMemo(() => new Set(
        relevantRules.filter(r => r.scope.campaignIds?.some(id => String(id) === String(campaign.id))).map(r => r.id)
    ), [relevantRules, campaign.id]);

    const [selectedIds, setSelectedIds] = useState<Set<number>>(initialSelectedIds);

    const handleToggle = (ruleId: number) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(ruleId)) newSet.delete(ruleId);
            else newSet.add(ruleId);
            return newSet;
        });
    };

    const handleSave = () => {
        onSave(campaign.id, initialSelectedIds, selectedIds);
    };
    
    const ruleTypeName = {
        'BID_ADJUSTMENT': 'Bid Adjustment',
        'SEARCH_TERM_AUTOMATION': 'Search Term',
        'BUDGET_ACCELERATION': 'Budget Acceleration',
        'SEARCH_TERM_HARVESTING': 'Search Term Harvesting'
    }[campaign.type];

    return (
        <div style={styles.modalBackdrop} onClick={onClose}>
            <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                <h2 style={styles.modalHeader}>Edit Rules for "{campaign.name}"</h2>
                <div style={styles.modalBody}>
                    {relevantRules.length > 0 ? relevantRules.map(rule => (
                        <label key={rule.id} style={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={selectedIds.has(rule.id)}
                                onChange={() => handleToggle(rule.id)}
                                style={{ marginRight: '10px' }}
                            />
                            {rule.name}
                        </label>
                    )) : <p>No {ruleTypeName} rules found for this profile.</p>}
                </div>
                <div style={styles.modalFooter}>
                    <button onClick={onClose} style={{...styles.bulkActionButton, backgroundColor: '#6c757d'}}>Cancel</button>
                    <button onClick={handleSave} style={styles.bulkActionButton}>Save Changes</button>
                </div>
            </div>
        </div>
    );
};

const ITEMS_PER_PAGE = 50;

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
    const [excludeTerm, setExcludeTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof CampaignWithMetrics; direction: 'ascending' | 'descending' } | null>({ key: 'adjustedSpend', direction: 'descending' });
    const [statusFilter, setStatusFilter] = useState<CampaignState | 'all'>('enabled');
    const [typeFilter, setTypeFilter] = useState<'all' | 'sponsoredProducts' | 'sponsoredBrands' | 'sponsoredDisplay'>('all');
    const [metricFilters, setMetricFilters] = useState<MetricFilters>({
        adjustedSpend: {}, sales: {}, orders: {}, impressions: {}, clicks: {}, acos: {}, roas: {},
    });
    
    const [expandedCampaignId, setExpandedCampaignId] = useState<number | null>(null);
    const [automationLogs, setAutomationLogs] = useState<Record<number, any[]>>({});
    const [loadingLogs, setLoadingLogs] = useState<number | null>(null);
    const [logsError, setLogsError] = useState<string | null>(null);

    const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<number>>(new Set());
    const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
    const [editingCampaign, setEditingCampaign] = useState<{id: number; name: string; type: EditableRuleType} | null>(null);

    const [bulkAction, setBulkAction] = useState<'none' | 'add' | 'remove'>('none');
    const [bulkSelectedBidRules, setBulkSelectedBidRules] = useState<string[]>([]);
    const [bulkSelectedSearchTermRules, setBulkSelectedSearchTermRules] = useState<string[]>([]);
    const [bulkSelectedHarvestingRules, setBulkSelectedHarvestingRules] = useState<string[]>([]);
    const [bulkSelectedBudgetRules, setBulkSelectedBudgetRules] = useState<string[]>([]);


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

        const doFetchData = async () => {
            setLoading(prev => ({ ...prev, data: true }));
            setError(null);
            setCurrentPage(1);
            setSelectedCampaignIds(new Set());

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
        };
        
        doFetchData();
    }, [selectedProfileId, dateRange, cache.ppcManagement, setCache]);


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

    const combinedCampaignData: CampaignWithMetrics[] = useMemo(() => {
        return campaigns.map(campaign => {
            const metrics = performanceMetrics[campaign.campaignId] || {
                campaignId: campaign.campaignId,
                impressions: 0,
                clicks: 0,
                adjustedSpend: 0,
                orders: 0,
                sales: 0,
            };

            const { impressions, clicks, adjustedSpend, sales, orders } = metrics;
            
            return {
                ...campaign,
                impressions,
                clicks,
                adjustedSpend,
                orders,
                sales,
                acos: sales > 0 ? adjustedSpend / sales : 0,
                roas: adjustedSpend > 0 ? sales / adjustedSpend : 0,
                cpc: clicks > 0 ? adjustedSpend / clicks : 0,
                ctr: impressions > 0 ? clicks / impressions : 0,
            };
        });
    }, [campaigns, performanceMetrics]);

    const handleMetricFilterChange = useCallback((
        key: keyof MetricFilters,
        type: 'min' | 'max',
        value: string
    ) => {
        const numValue = value === '' ? undefined : parseFloat(value);
        if (value !== '' && isNaN(numValue)) return; // Ignore invalid input

        setMetricFilters(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                [type]: numValue,
            }
        }));
        setCurrentPage(1); // Reset to first page on filter change
    }, []);
    
    const filteredData = useMemo(() => {
        let data = combinedCampaignData;

        if (statusFilter !== 'all') {
            data = data.filter(c => c.state === statusFilter);
        }
        if (typeFilter !== 'all') {
            data = data.filter(c => c.campaignType === typeFilter);
        }
        if (searchTerm) {
            data = data.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        if (excludeTerm.trim()) {
            const excludeKeywords = excludeTerm.toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
            if (excludeKeywords.length > 0) {
                data = data.filter(c => {
                    const campaignNameLower = c.name.toLowerCase();
                    return !excludeKeywords.some(keyword => campaignNameLower.includes(keyword));
                });
            }
        }
        
        data = data.filter(c => {
            const check = (value: number | undefined, min?: number, max?: number) => {
                const val = value ?? 0;
                const minOk = min === undefined || isNaN(min) || val >= min;
                const maxOk = max === undefined || isNaN(max) || val <= max;
                return minOk && maxOk;
            };
            
            // For ACoS, convert percentage input to a ratio for comparison
            const acosMin = metricFilters.acos.min !== undefined ? metricFilters.acos.min / 100 : undefined;
            const acosMax = metricFilters.acos.max !== undefined ? metricFilters.acos.max / 100 : undefined;

            return (
                check(c.adjustedSpend, metricFilters.adjustedSpend.min, metricFilters.adjustedSpend.max) &&
                check(c.sales, metricFilters.sales.min, metricFilters.sales.max) &&
                check(c.orders, metricFilters.orders.min, metricFilters.orders.max) &&
                check(c.impressions, metricFilters.impressions.min, metricFilters.impressions.max) &&
                check(c.clicks, metricFilters.clicks.min, metricFilters.clicks.max) &&
                check(c.acos, acosMin, acosMax) &&
                check(c.roas, metricFilters.roas.min, metricFilters.roas.max)
            );
        });

        return data;
    }, [combinedCampaignData, statusFilter, typeFilter, searchTerm, excludeTerm, metricFilters]);

    const summaryMetrics: SummaryMetricsData | null = useMemo(() => {
        if (loading.data) return null;
        
        const total = filteredData.reduce((acc, campaign) => {
            acc.adjustedSpend += campaign.adjustedSpend || 0;
            acc.sales += campaign.sales || 0;
            acc.orders += campaign.orders || 0;
            acc.clicks += campaign.clicks || 0;
            acc.impressions += campaign.impressions || 0;
            return acc;
        }, { adjustedSpend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 });

        return {
            ...total,
            acos: total.sales > 0 ? total.adjustedSpend / total.sales : 0,
            roas: total.adjustedSpend > 0 ? total.sales / total.adjustedSpend : 0,
            cpc: total.clicks > 0 ? total.adjustedSpend / total.clicks : 0,
            ctr: total.impressions > 0 ? total.clicks / total.impressions : 0,
        };
    }, [filteredData, loading.data]);

    const finalDisplayData: CampaignWithMetrics[] = useMemo(() => {
        let data = [...filteredData];

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
    }, [filteredData, sortConfig]);

    const paginatedCampaigns = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return finalDisplayData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [finalDisplayData, currentPage]);
    
    const totalPages = Math.ceil(finalDisplayData.length / ITEMS_PER_PAGE);

    const requestSort = (key: keyof CampaignWithMetrics) => {
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
            setSelectedCampaignIds(new Set<number>());
        }
    };

    const isAllSelected = finalDisplayData.length > 0 && selectedCampaignIds.size === finalDisplayData.length;
    
    const profileFilteredRules = useMemo(() => {
        return automationRules.filter(r => r.profile_id === selectedProfileId);
    }, [automationRules, selectedProfileId]);
    
    const bidAdjustmentRules = useMemo(() => profileFilteredRules.filter(r => r.rule_type === 'BID_ADJUSTMENT'), [profileFilteredRules]);
    const searchTermRules = useMemo(() => profileFilteredRules.filter(r => r.rule_type === 'SEARCH_TERM_AUTOMATION'), [profileFilteredRules]);
    const searchTermHarvestingRules = useMemo(() => profileFilteredRules.filter(r => r.rule_type === 'SEARCH_TERM_HARVESTING'), [profileFilteredRules]);
    const budgetAccelerationRules = useMemo(() => profileFilteredRules.filter(r => r.rule_type === 'BUDGET_ACCELERATION'), [profileFilteredRules]);

    const handleEditCampaignRules = (campaignId: number, ruleType: EditableRuleType) => {
        const campaign = combinedCampaignData.find(c => c.campaignId === campaignId);
        if (campaign) {
            setEditingCampaign({ id: campaignId, name: campaign.name, type: ruleType });
            setIsRuleModalOpen(true);
        }
    };
    
    const handleSaveIndividualRules = async (campaignId: number, initialRuleIds: Set<number>, newRuleIds: Set<number>) => {
        setLoading(prev => ({ ...prev, rules: true }));
        const updates: Promise<any>[] = [];
        const allRelevantRules = editingCampaign?.type === 'BID_ADJUSTMENT' ? bidAdjustmentRules : 
                                 editingCampaign?.type === 'SEARCH_TERM_AUTOMATION' ? searchTermRules :
                                 editingCampaign?.type === 'BUDGET_ACCELERATION' ? budgetAccelerationRules :
                                 searchTermHarvestingRules;

        for (const rule of allRelevantRules) {
            const wasSelected = initialRuleIds.has(rule.id);
            const isSelected = newRuleIds.has(rule.id);
            if (wasSelected === isSelected) continue;

            const currentCampaignIds = new Set((rule.scope.campaignIds || []).map(id => String(id)));
            if (isSelected) {
                currentCampaignIds.add(String(campaignId));
            } else {
                currentCampaignIds.delete(String(campaignId));
            }
            const updatedScope = { campaignIds: Array.from(currentCampaignIds) };
            updates.push(fetch(`/api/automation/rules/${rule.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...rule, scope: updatedScope }),
            }));
        }

        try {
            await Promise.all(updates);
            await fetchRules();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update rules.');
            fetchRules();
        } finally {
            setLoading(prev => ({...prev, rules: false}));
            setIsRuleModalOpen(false);
            setEditingCampaign(null);
        }
    };
    
    const handleBulkApplyRules = async () => {
        if (selectedCampaignIds.size === 0) return alert('Please select at least one campaign.');
        if (bulkAction === 'none') return alert('Please select a bulk action.');
        const allSelectedRules = [...bulkSelectedBidRules, ...bulkSelectedSearchTermRules, ...bulkSelectedHarvestingRules, ...bulkSelectedBudgetRules];
        if (allSelectedRules.length === 0) return alert('Please select at least one rule to apply.');

        setLoading(prev => ({ ...prev, rules: true }));
        const updates: Promise<any>[] = [];

        for (const ruleIdStr of allSelectedRules) {
            const ruleId = parseInt(ruleIdStr, 10);
            const ruleToUpdate = automationRules.find(r => r.id === ruleId);
            if (!ruleToUpdate) continue;
            
            const currentCampaignIds = new Set((ruleToUpdate.scope.campaignIds || []).map(id => String(id)));
            if (bulkAction === 'add') {
                selectedCampaignIds.forEach(id => currentCampaignIds.add(String(id)));
            } else if (bulkAction === 'remove') {
                selectedCampaignIds.forEach(id => currentCampaignIds.delete(String(id)));
            }

            const updatedScope = { campaignIds: Array.from(currentCampaignIds) };
            updates.push(fetch(`/api/automation/rules/${ruleId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...ruleToUpdate, scope: updatedScope }),
            }));
        }

        try {
            await Promise.all(updates);
            await fetchRules();
            setSelectedCampaignIds(new Set());
            setBulkAction('none');
            setBulkSelectedBidRules([]);
            setBulkSelectedSearchTermRules([]);
            setBulkSelectedHarvestingRules([]);
            setBulkSelectedBudgetRules([]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to apply rules in bulk.');
            fetchRules();
        } finally {
            setLoading(prev => ({ ...prev, rules: false }));
        }
    };

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h1 style={styles.title}>PPC Management Dashboard</h1>
            </header>
            
            <RuleEditModal isOpen={isRuleModalOpen} onClose={() => setIsRuleModalOpen(false)} campaign={editingCampaign} allRules={profileFilteredRules} onSave={handleSaveIndividualRules} />

            {error && <div style={styles.error} role="alert">{error}</div>}

            <section style={styles.controlsContainer}>
                 <div style={styles.controlGroup}>
                    <label htmlFor="profile-select" style={{ fontWeight: 500 }}>Profile:</label>
                    <select id="profile-select" style={styles.profileSelector} value={selectedProfileId || ''} onChange={(e) => setSelectedProfileId(e.target.value)} disabled={loading.profiles || profiles.length === 0}>
                        {loading.profiles ? <option>Loading...</option> : profiles.length > 0 ? profiles.map(p => <option key={p.profileId} value={p.profileId}>{p.profileId} ({p.countryCode})</option>) : <option>No US profiles</option>}
                    </select>
                </div>
                 <div style={styles.controlGroup}>
                    <label htmlFor="status-filter" style={{ fontWeight: 500 }}>Status:</label>
                    <select id="status-filter" style={styles.profileSelector} value={statusFilter} onChange={e => { setStatusFilter(e.target.value as any); setCurrentPage(1); setSelectedCampaignIds(new Set()); }} disabled={loading.data}>
                        <option value="enabled">Enabled</option> <option value="paused">Paused</option> <option value="archived">Archived</option> <option value="all">All States</option>
                    </select>
                </div>
                 <div style={styles.controlGroup}>
                    <label htmlFor="type-filter" style={{ fontWeight: 500 }}>Type:</label>
                    <select
                        id="type-filter"
                        style={styles.profileSelector}
                        value={typeFilter}
                        onChange={e => {
                            setTypeFilter(e.target.value as any);
                            setCurrentPage(1);
                            setSelectedCampaignIds(new Set());
                        }}
                        disabled={loading.data}
                    >
                        <option value="all">All Types</option>
                        <option value="sponsoredProducts">SP</option>
                        <option value="sponsoredBrands">SB</option>
                        <option value="sponsoredDisplay">SD</option>
                    </select>
                </div>
                 <div style={styles.controlGroup}>
                     <input type="text" placeholder="Search by campaign name..." style={styles.searchInput} value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); setSelectedCampaignIds(new Set()); }} disabled={loading.data} />
                     <input type="text" placeholder="Exclude names (e.g., Auto, Test)" style={styles.searchInput} value={excludeTerm} onChange={e => { setExcludeTerm(e.target.value); setCurrentPage(1); setSelectedCampaignIds(new Set()); }} disabled={loading.data} />
                </div>
                {selectedCampaignIds.size > 0 && (
                    <div style={styles.bulkActionContainer}>
                        <span style={{fontWeight: 600}}>{selectedCampaignIds.size} selected</span>
                        <select style={styles.profileSelector} value={bulkAction} onChange={e => setBulkAction(e.target.value as any)}>
                            <option value="none">-- Select Action --</option>
                            <option value="add">ADD rules to campaigns</option>
                            <option value="remove">REMOVE rules from campaigns</option>
                        </select>
                        {bulkAction !== 'none' && (
                            <>
                                <div style={styles.controlGroup}>
                                    <label style={{fontWeight:500}}>Bid Rules:</label>
                                    <select multiple value={bulkSelectedBidRules} onChange={e => setBulkSelectedBidRules(Array.from(e.target.selectedOptions, option => option.value))} style={styles.multiSelect} disabled={loading.rules}>
                                        {bidAdjustmentRules.map(rule => (<option key={rule.id} value={rule.id}>{rule.name}</option>))}
                                    </select>
                                </div>
                                <div style={styles.controlGroup}>
                                    <label style={{fontWeight:500}}>Search Term Rules:</label>
                                    <select multiple value={bulkSelectedSearchTermRules} onChange={e => setBulkSelectedSearchTermRules(Array.from(e.target.selectedOptions, option => option.value))} style={styles.multiSelect} disabled={loading.rules}>
                                        {searchTermRules.map(rule => (<option key={rule.id} value={rule.id}>{rule.name}</option>))}
                                    </select>
                                </div>
                                 <div style={styles.controlGroup}>
                                    <label style={{fontWeight:500}}>Harvesting Rules:</label>
                                    <select multiple value={bulkSelectedHarvestingRules} onChange={e => setBulkSelectedHarvestingRules(Array.from(e.target.selectedOptions, option => option.value))} style={styles.multiSelect} disabled={loading.rules}>
                                        {searchTermHarvestingRules.map(rule => (<option key={rule.id} value={rule.id}>{rule.name}</option>))}
                                    </select>
                                </div>
                                <div style={styles.controlGroup}>
                                    <label style={{fontWeight:500}}>Budget Rules:</label>
                                    <select multiple value={bulkSelectedBudgetRules} onChange={e => setBulkSelectedBudgetRules(Array.from(e.target.selectedOptions, option => option.value))} style={styles.multiSelect} disabled={loading.rules}>
                                        {budgetAccelerationRules.map(rule => (<option key={rule.id} value={rule.id}>{rule.name}</option>))}
                                    </select>
                                </div>
                                <button onClick={handleBulkApplyRules} style={styles.bulkActionButton} disabled={loading.rules}>{loading.rules ? 'Applying...' : 'Apply'}</button>
                            </>
                        )}
                    </div>
                )}
                <div style={{...styles.controlGroup, marginLeft: selectedCampaignIds.size > 0 ? '0' : 'auto'}}>
                     <div style={{ position: 'relative' }}>
                         <button style={styles.dateButton} onClick={() => setDatePickerOpen(o => !o)}>{formatDateRangeDisplay(dateRange.start, dateRange.end)}</button>
                        {isDatePickerOpen && <DateRangePicker initialRange={dateRange} onApply={handleApplyDateRange} onClose={() => setDatePickerOpen(false)} />}
                    </div>
                </div>
            </section>

            <SummaryMetrics metrics={summaryMetrics} loading={loading.data} />
            
            {(loading.data || loading.rules) ? (
                <div style={styles.loader}>Loading campaign data...</div>
            ) : combinedCampaignData.length > 0 ? (
                <>
                    <CampaignTable 
                        campaigns={paginatedCampaigns} 
                        onUpdateCampaign={handleUpdateCampaign}
                        onEditRules={handleEditCampaignRules}
                        sortConfig={sortConfig}
                        onRequestSort={requestSort}
                        expandedCampaignId={expandedCampaignId}
                        onToggleExpand={handleToggleExpand}
                        automationLogs={automationLogs}
                        loadingLogs={loadingLogs}
                        logsError={logsError}
                        automationRules={profileFilteredRules}
                        selectedCampaignIds={selectedCampaignIds}
                        onSelectCampaign={handleSelectCampaign}
                        onSelectAll={handleSelectAllCampaigns}
                        isAllSelected={isAllSelected}
                        metricFilters={metricFilters}
                        onMetricFilterChange={handleMetricFilterChange}
                    />
                    {paginatedCampaigns.length > 0 && <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />}
                </>
            ) : (
                <div style={{...styles.loader, color: '#666'}}>No campaign data found for the selected profile and date range.</div>
            )}
        </div>
    );
}