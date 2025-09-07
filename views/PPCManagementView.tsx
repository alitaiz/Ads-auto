import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
        tableLayout: 'fixed',
    },
    th: {
        padding: '12px 15px',
        textAlign: 'left',
        borderBottom: '2px solid var(--border-color)',
        backgroundColor: '#f8f9fa',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        position: 'relative',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
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
        position: 'relative',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    td: {
        padding: '12px 15px',
        borderBottom: '1px solid var(--border-color)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
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
    resizer: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: '5px',
        height: '100%',
        cursor: 'col-resize',
        userSelect: 'none',
        backgroundColor: 'transparent',
    },
    summaryContainer: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '15px',
        padding: '15px',
        backgroundColor: 'var(--card-background-color)',
        borderRadius: 'var(--border-radius)',
        boxShadow: 'var(--box-shadow)',
        marginBottom: '20px',
    },
    summaryBox: {
        display: 'flex',
        flexDirection: 'column',
    },
    summaryLabel: {
        fontSize: '0.85rem',
        color: '#6c757d',
        marginBottom: '5px',
    },
    summaryValue: {
        fontSize: '1.5rem',
        fontWeight: 600,
        color: 'var(--text-color)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    datePickerContainer: {
        position: 'absolute',
        zIndex: 1000,
        backgroundColor: 'white',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--border-radius)',
        boxShadow: 'var(--box-shadow)',
        marginTop: '5px',
        display: 'flex',
        padding: '10px',
        right: 0,
    },
    datePickerPresets: {
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
        paddingRight: '15px',
        borderRight: '1px solid var(--border-color)',
    },
    datePickerCalendars: {
         display: 'flex',
         gap: '10px',
         paddingLeft: '15px',
    },
    calendarContainer: {
         display: 'flex',
         flexDirection: 'column',
         alignItems: 'center',
    },
    calendarHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '240px',
        marginBottom: '10px',
    },
    calendarGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 34px)',
        gap: '1px'
    },
    calendarDay: {
        width: '34px',
        height: '34px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        cursor: 'pointer',
        borderRadius: '4px',
        fontSize: '0.9rem',
    },
     datePickerActions: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '10px',
        paddingTop: '10px',
        borderTop: '1px solid var(--border-color)',
        marginTop: '10px'
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
type SortableKeys = keyof CampaignWithMetrics;

const InfoIcon = ({ title }: { title: string }) => (
    <span title={title} style={{ cursor: 'help', marginLeft: '4px', color: '#6c757d' }}>
        &#9432;
    </span>
);

const SummaryMetrics = ({ campaigns }: { campaigns: CampaignWithMetrics[] }) => {
    const summary = useMemo(() => {
        const totals = campaigns.reduce(
            (acc, campaign) => {
                acc.spend += campaign.spend;
                acc.sales += campaign.sales;
                acc.orders += campaign.orders;
                acc.clicks += campaign.clicks;
                acc.impressions += campaign.impressions;
                return acc;
            },
            { spend: 0, sales: 0, orders: 0, clicks: 0, impressions: 0 }
        );

        const acos = totals.sales > 0 ? (totals.spend / totals.sales) : 0;
        const roas = totals.spend > 0 ? (totals.sales / totals.spend) : 0;
        const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) : 0;
        const cpc = totals.clicks > 0 ? (totals.spend / totals.clicks) : 0;

        return { ...totals, acos, roas, ctr, cpc };
    }, [campaigns]);

    const metrics = [
        { label: 'Spend', value: formatPrice(summary.spend) },
        { label: 'Sales', value: formatPrice(summary.sales) },
        { label: 'ACOS', value: `${(summary.acos * 100).toFixed(2)}%` },
        { label: 'ROAS', value: summary.roas.toFixed(2) },
        { label: 'Orders', value: formatNumber(summary.orders) },
        { label: 'Clicks', value: formatNumber(summary.clicks) },
        { label: 'Impressions', value: formatNumber(summary.impressions) },
        { label: 'CPC', value: formatPrice(summary.cpc) },
        { label: 'CTR', value: `${(summary.ctr * 100).toFixed(2)}%` },
    ];

    return (
        <div style={styles.summaryContainer}>
            {metrics.map(metric => (
                <div key={metric.label} style={styles.summaryBox}>
                    <span style={styles.summaryLabel}>{metric.label}</span>
                    <span style={styles.summaryValue}>{metric.value}</span>
                </div>
            ))}
        </div>
    );
};

// A simple Date Range Picker component
const DateRangePicker = ({
    onApply,
    onClose,
}: {
    onApply: (range: { start: Date; end: Date }) => void;
    onClose: () => void;
}) => {
    const today = new Date();
    const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
    const [startDate, setStartDate] = useState<Date | null>(today);
    const [endDate, setEndDate] = useState<Date | null>(today);
    const [hoverDate, setHoverDate] = useState<Date | null>(null);

    const handleDateClick = (day: Date) => {
        if (!startDate || (startDate && endDate)) {
            setStartDate(day);
            setEndDate(null);
        } else {
            if (day < startDate) {
                setEndDate(startDate);
                setStartDate(day);
            } else {
                setEndDate(day);
            }
        }
    };
    
    const setPresetRange = (preset: string) => {
        const end = new Date();
        const start = new Date();
        switch(preset) {
            case 'today':
                break;
            case 'yesterday':
                start.setDate(start.getDate() - 1);
                end.setDate(end.getDate() - 1);
                break;
            case 'last7':
                start.setDate(start.getDate() - 6);
                break;
             case 'last30':
                start.setDate(start.getDate() - 29);
                break;
            case 'thisMonth':
                start.setDate(1);
                break;
        }
        setStartDate(start);
        setEndDate(end);
        setViewDate(new Date(start.getFullYear(), start.getMonth(), 1));
    };

    const generateCalendar = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = [];
        for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
        return days;
    };
    
    const prevMonthDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    const calendar1 = generateCalendar(prevMonthDate);
    const calendar2 = generateCalendar(viewDate);

    const renderDay = (day: Date | null) => {
        if (!day) return <div />;
        const dayTime = day.getTime();
        const startTime = startDate?.getTime();
        const endTime = endDate?.getTime();
        const hoverTime = hoverDate?.getTime();

        let inRange = false;
        let isStart = false;
        let isEnd = false;

        if (startDate && endDate) {
            inRange = dayTime > startTime! && dayTime < endTime!;
            isStart = dayTime === startTime!;
            isEnd = dayTime === endTime!;
        } else if (startDate && hoverDate) {
            const start = Math.min(startTime!, hoverTime!);
            const end = Math.max(startTime!, hoverTime!);
            inRange = dayTime > start && dayTime < end;
            isStart = dayTime === start;
            isEnd = dayTime === end;
        } else if (startDate) {
            isStart = dayTime === startTime;
        }

        const dayStyle: React.CSSProperties = {
            ...styles.calendarDay,
            backgroundColor: isStart || isEnd ? 'var(--primary-color)' : inRange ? '#e6f7ff' : 'transparent',
            color: isStart || isEnd ? 'white' : 'var(--text-color)',
            borderRadius: isStart && isEnd ? '4px' : isStart ? '4px 0 0 4px' : isEnd ? '0 4px 4px 0' : '0',
        };

        return (
            <div style={dayStyle} onClick={() => handleDateClick(day)} onMouseEnter={() => setHoverDate(day)} onMouseLeave={() => setHoverDate(null)}>
                {day.getDate()}
            </div>
        );
    };
    
    const presets = [
        { label: 'Today', key: 'today' },
        { label: 'Yesterday', key: 'yesterday' },
        { label: 'Last 7 days', key: 'last7' },
        { label: 'Last 30 days', key: 'last30' },
        { label: 'This month', key: 'thisMonth' },
    ];

    return (
        <div style={styles.datePickerContainer}>
             <div style={styles.datePickerPresets}>
                {presets.map(p => <button key={p.key} style={{...styles.button, justifyContent: 'flex-start', width: '100%'}} onClick={() => setPresetRange(p.key)}>{p.label}</button>)}
            </div>
            <div style={{display: 'flex', flexDirection: 'column'}}>
                <div style={styles.datePickerCalendars}>
                    <div style={styles.calendarContainer}>
                         <div style={styles.calendarHeader}>
                             <button style={styles.button} onClick={() => setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>&lt;</button>
                            <strong>{prevMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</strong>
                            <span></span>
                        </div>
                        <div style={styles.calendarGrid}>
                            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d} style={{...styles.calendarDay, fontWeight: 'bold'}}>{d}</div>)}
                            {calendar1.map((d, i) => <div key={i}>{renderDay(d)}</div>)}
                        </div>
                    </div>
                     <div style={styles.calendarContainer}>
                         <div style={styles.calendarHeader}>
                             <span></span>
                            <strong>{viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</strong>
                            <button style={styles.button} onClick={() => setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>&gt;</button>
                        </div>
                        <div style={styles.calendarGrid}>
                           {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d} style={{...styles.calendarDay, fontWeight: 'bold'}}>{d}</div>)}
                           {calendar2.map((d, i) => <div key={i}>{renderDay(d)}</div>)}
                        </div>
                    </div>
                </div>
                 <div style={styles.datePickerActions}>
                    <button style={styles.button} onClick={onClose}>Cancel</button>
                    <button style={styles.primaryButton} onClick={() => onApply({ start: startDate!, end: endDate || startDate!})}>Apply</button>
                </div>
            </div>
        </div>
    );
};


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
    const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'ascending' | 'descending' }>({
        key: 'spend',
        direction: 'descending',
    });
    
     // State for resizable columns
    const initialWidths = { name: 350, status: 120, dailyBudget: 120, impressions: 120, clicks: 110, ctr: 110, spend: 110, cpc: 110, orders: 110, sales: 110, acos: 110, roas: 110 };
    const [columnWidths, setColumnWidths] = useState(initialWidths);
    const resizingColumnRef = useRef<{key: string, startX: number, startWidth: number} | null>(null);

    // State for date range picker
    const [dateRange, setDateRange] = useState({start: new Date(), end: new Date()});
    const [isDatePickerOpen, setDatePickerOpen] = useState(false);
    const datePickerButtonRef = useRef<HTMLButtonElement>(null);
    const datePickerRef = useRef<HTMLDivElement>(null);


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
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isDatePickerOpen && 
                datePickerRef.current && 
                !datePickerRef.current.contains(event.target as Node) &&
                !datePickerButtonRef.current?.contains(event.target as Node)) {
                setDatePickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isDatePickerOpen]);

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

            // Fix: Corrected typo `namesResponse` to `namesPromise` to use the promise variable.
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

    const handleApplyDateRange = (newRange: { start: Date; end: Date }) => {
        setDateRange(newRange);
        setDatePickerOpen(false);
        const today = new Date();
        const isToday = newRange.start.toDateString() === today.toDateString() && newRange.end.toDateString() === today.toDateString();
        
        if (!isToday) {
            alert("Date range selection UI is implemented, but the backend currently only supports fetching live data for 'Today'.");
        }
        fetchData();
    };

    const formatDateRange = (start: Date, end: Date) => {
        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
        const startDate = start.toLocaleDateString('en-US', options);
        const endDate = end.toLocaleDateString('en-US', options);
        return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
    };

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
            
            // If the HTTP status code indicates an error, parse the body for details.
            if (!response.ok) {
                const errorResult = await response.json().catch(() => ({ message: 'HTTP error with no details.' }));
                throw new Error(errorResult.responses?.[0]?.description || errorResult.message || 'Failed to update campaign.');
            }
    
            // If the response is OK, we can optionally check the body for more specific success/failure codes.
            // A response may be successful (e.g., 204 No Content) and have no body.
            const responseText = await response.text();
            if (responseText) {
                const result = JSON.parse(responseText);
                // If the response body explicitly contains a failure code, treat it as an error.
                if (result.responses && result.responses.length > 0 && result.responses[0].code !== 'SUCCESS') {
                     throw new Error(result.responses[0].description || 'Update was not successful.');
                }
            }
            
            // If we reach here, the update is considered successful.
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
        const metricsMap = performanceMetrics;
        const enrichedCampaigns = campaigns.map(campaign => {
            const metrics = metricsMap[campaign.campaignId] || {
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
                ctr: impressions > 0 ? (clicks / impressions) : 0,
                cpc: clicks > 0 ? (spend / clicks) : 0,
                acos: sales > 0 ? (spend / sales) : 0,
                roas: spend > 0 ? (sales / spend) : 0,
            };
        });
        return enrichedCampaigns.filter(c => c.impressions > 0 || c.clicks > 0 || c.spend > 0 || c.orders > 0 || c.sales > 0);
    }, [campaigns, performanceMetrics]);


    // Sorting logic
    const requestSort = useCallback((key: SortableKeys) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    }, [sortConfig]);

    const getSortIndicator = useCallback((key: SortableKeys) => {
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
        setCurrentPage(1);
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
            setEditingCampaign(null);
        }
    };
    
    const handleBudgetKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, campaignId: number) => {
        if (e.key === 'Enter') handleBudgetUpdate(campaignId);
        else if (e.key === 'Escape') setEditingCampaign(null);
    };

    // Handlers for column resizing
    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, key: string) => {
        resizingColumnRef.current = {
            key,
            startX: e.clientX,
            startWidth: columnWidths[key as keyof typeof columnWidths],
        };
        document.body.style.cursor = 'col-resize';
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!resizingColumnRef.current) return;
        const { key, startX, startWidth } = resizingColumnRef.current;
        const newWidth = startWidth + (e.clientX - startX);
        if (newWidth > 50) { // Minimum width
            setColumnWidths(prev => ({ ...prev, [key]: newWidth }));
        }
    }, []);

    const handleMouseUp = useCallback(() => {
        resizingColumnRef.current = null;
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    }, [handleMouseMove]);

    const tableHeaders: { key: SortableKeys; label: string; info?: string }[] = [
        { key: 'name', label: 'Campaign' },
        { key: 'state', label: 'Status' },
        { key: 'dailyBudget', label: 'Budget' },
        { key: 'impressions', label: 'Impressions', info: 'Impressions from stream data for today' },
        { key: 'clicks', label: 'Clicks', info: 'Clicks from stream data for today' },
        { key: 'ctr', label: 'CTR', info: 'Click-Through Rate (Clicks / Impressions)' },
        { key: 'spend', label: 'Spend', info: 'Spend from stream data for today' },
        { key: 'cpc', label: 'CPC', info: 'Cost Per Click (Spend / Clicks)' },
        { key: 'orders', label: 'Orders', info: 'Orders from stream data for today' },
        { key: 'sales', label: 'Sales', info: 'Sales from stream data for today' },
        { key: 'acos', label: 'ACOS', info: 'Advertising Cost of Sales (Spend / Sales)' },
        { key: 'roas', label: 'ROAS', info: 'Return on Ad Spend (Sales / Spend)' },
    ];
    
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
                    <div style={{ position: 'relative' }}>
                        <button ref={datePickerButtonRef} style={styles.button} onClick={() => setDatePickerOpen(o => !o)}>
                           {formatDateRange(dateRange.start, dateRange.end)}
                        </button>
                        {isDatePickerOpen && <div ref={datePickerRef}><DateRangePicker onApply={handleApplyDateRange} onClose={() => setDatePickerOpen(false)} /></div>}
                    </div>
                    <button style={styles.button} onClick={fetchData} disabled={loading.data}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z"/>
                            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466"/>
                        </svg>
                        Refresh
                    </button>
                </div>
            </section>
            
            <SummaryMetrics campaigns={filteredCampaigns} />
            
            <div style={styles.tableContainer}>
                {loading.data ? (
                    <div style={styles.loader}>Loading campaign data...</div>
                ) : (
                    <table style={styles.table} aria-live="polite">
                        <thead>
                            <tr>
                               {tableHeaders.map(({ key, label, info }) => (
                                    <th key={key} style={{ ...styles.thSortable, width: `${columnWidths[key as keyof typeof columnWidths]}px`}} onClick={() => requestSort(key)}>
                                        {label}
                                        {info && <InfoIcon title={info} />}
                                        {getSortIndicator(key)}
                                        <div style={styles.resizer} onMouseDown={(e) => handleMouseDown(e, key)} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedCampaigns.length > 0 ? paginatedCampaigns.map((c) => (
                                <tr key={c.campaignId}>
                                    <td style={{...styles.td, width: `${columnWidths.name}px`}}>
                                        <a href="#" onClick={(e) => e.preventDefault()} style={{...styles.campaignLink, cursor: 'not-allowed'}} title="Drill-down coming soon">
                                            {c.name}
                                        </a>
                                    </td>
                                    <td style={{...styles.td, width: `${columnWidths.status}px`}}>
                                        <button
                                            onClick={() => handleUpdateCampaign(c.campaignId, { state: c.state === 'enabled' ? 'paused' : 'enabled' })}
                                            style={{...styles.stateButton, backgroundColor: c.state === 'enabled' ? 'var(--success-color)' : '#6c757d'}}
                                            aria-label={`Change status for ${c.name}, current is ${c.state}`}
                                        >
                                            {c.state}
                                        </button>
                                    </td>
                                    <td 
                                        style={{...styles.td, width: `${columnWidths.dailyBudget}px`, cursor: 'pointer'}} 
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
                                    <td style={{...styles.td, width: `${columnWidths.impressions}px`}}>{formatNumber(c.impressions)}</td>
                                    <td style={{...styles.td, width: `${columnWidths.clicks}px`}}>{formatNumber(c.clicks)}</td>
                                    <td style={{...styles.td, width: `${columnWidths.ctr}px`}}>{(c.ctr * 100).toFixed(2)}%</td>
                                    <td style={{...styles.td, width: `${columnWidths.spend}px`}}>{formatPrice(c.spend)}</td>
                                    <td style={{...styles.td, width: `${columnWidths.cpc}px`}}>{formatPrice(c.cpc)}</td>
                                    <td style={{...styles.td, width: `${columnWidths.orders}px`}}>{formatNumber(c.orders)}</td>
                                    <td style={{...styles.td, width: `${columnWidths.sales}px`}}>{formatPrice(c.sales)}</td>
                                    <td style={{...styles.td, width: `${columnWidths.acos}px`}}>{(c.acos * 100).toFixed(2)}%</td>
                                    <td style={{...styles.td, width: `${columnWidths.roas}px`}}>{c.roas.toFixed(2)}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={12} style={{...styles.td, textAlign: 'center'}}>
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