import React, { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { Link } from 'react-router-dom';
import { Profile, Portfolio, Campaign, CampaignWithMetrics, CampaignStreamMetrics, PortfolioWithMetrics } from '../types';
import { DataCacheContext } from '../contexts/DataCacheContext';
import { areDateRangesEqual, formatPrice, formatNumber } from '../utils';
import { DateRangePicker } from './components/DateRangePicker';
import { SummaryMetrics } from './components/SummaryMetrics';

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
    },
    title: {
        fontSize: '2rem',
        margin: 0,
    },
    controlsContainer: {
        display: 'flex',
        alignItems: 'center',
        gap: '20px',
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
    dateButton: {
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        fontSize: '1rem',
        background: 'white',
        cursor: 'pointer',
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
    },
    th: {
        padding: '12px 15px',
        textAlign: 'left',
        borderBottom: '2px solid var(--border-color)',
        backgroundColor: '#f8f9fa',
        fontWeight: 600,
        cursor: 'pointer',
    },
    td: {
        padding: '12px 15px',
        borderBottom: '1px solid var(--border-color)',
    },
    link: {
        textDecoration: 'none',
        color: 'var(--primary-color)',
        fontWeight: 500,
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

const getInitialDateRange = () => {
    const end = new Date();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

export function PortfoliosView() {
    const { cache, setCache } = useContext(DataCacheContext);
    
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(localStorage.getItem('selectedProfileId') || null);
    const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>(cache.ppcManagement.campaigns || []);
    const [performanceMetrics, setPerformanceMetrics] = useState<Record<number, CampaignStreamMetrics>>(cache.ppcManagement.performanceMetrics || {});
    
    const [loading, setLoading] = useState({ profiles: true, data: true });
    const [error, setError] = useState<string | null>(null);
    
    const [dateRange, setDateRange] = useState(cache.ppcManagement.dateRange || getInitialDateRange);
    const [isDatePickerOpen, setDatePickerOpen] = useState(false);

    useEffect(() => {
        const fetchProfiles = async () => {
            try {
                setLoading(prev => ({ ...prev, profiles: true }));
                const response = await fetch('/api/amazon/profiles');
                if (!response.ok) throw new Error('Failed to fetch profiles.');
                const data = await response.json();
                const usProfiles = data.filter((p: Profile) => p.countryCode === 'US');
                setProfiles(usProfiles);
                if (usProfiles.length > 0) {
                    const storedProfileId = localStorage.getItem('selectedProfileId');
                    setSelectedProfileId(storedProfileId && usProfiles.some((p: Profile) => p.profileId.toString() === storedProfileId) ? storedProfileId : usProfiles[0].profileId.toString());
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

        const formattedStartDate = dateRange.start.toISOString().split('T')[0];
        const formattedEndDate = dateRange.end.toISOString().split('T')[0];

        try {
            const portfoliosPromise = fetch('/api/amazon/portfolios', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileId: selectedProfileId }),
            });

            const campaignsPromise = fetch('/api/amazon/campaigns/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileId: selectedProfileId, stateFilter: ["ENABLED", "PAUSED", "ARCHIVED"] }),
            });

            const metricsPromise = fetch(`/api/stream/campaign-metrics?startDate=${formattedStartDate}&endDate=${formattedEndDate}`);

            const [portfoliosResponse, campaignsResponse, metricsResponse] = await Promise.all([portfoliosPromise, campaignsPromise, metricsPromise]);

            if (!portfoliosResponse.ok) throw new Error('Failed to fetch portfolios.');
            if (!campaignsResponse.ok) throw new Error('Failed to fetch campaigns.');
            if (!metricsResponse.ok) throw new Error('Failed to fetch metrics.');
            
            const portfoliosData = await portfoliosResponse.json();
            const campaignsData = await campaignsResponse.json();
            const metricsData: CampaignStreamMetrics[] = await metricsResponse.json();

            const metricsMap = metricsData.reduce((acc, metric) => {
                acc[metric.campaignId] = metric;
                return acc;
            }, {} as Record<number, CampaignStreamMetrics>);

            setPortfolios(portfoliosData);
            setCampaigns(campaignsData.campaigns || []);
            setPerformanceMetrics(metricsMap);

            setCache(prev => ({
                ...prev,
                ppcManagement: {
                    campaigns: campaignsData.campaigns || [],
                    performanceMetrics: metricsMap,
                    profileId: selectedProfileId,
                    dateRange: dateRange,
                }
            }));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch data.');
        } finally {
            setLoading(prev => ({ ...prev, data: false }));
        }
    }, [selectedProfileId, dateRange, setCache]);

    useEffect(() => {
        if (selectedProfileId) {
            localStorage.setItem('selectedProfileId', selectedProfileId);
            if (cache.ppcManagement.profileId !== selectedProfileId || !areDateRangesEqual(cache.ppcManagement.dateRange, dateRange)) {
                fetchData();
            } else {
                 setLoading(prev => ({ ...prev, data: false }));
            }
        }
    }, [selectedProfileId, dateRange, fetchData, cache]);

    const portfoliosWithMetrics = useMemo((): PortfolioWithMetrics[] => {
        const metricsByPortfolio: Record<number, Omit<PortfolioWithMetrics, keyof Portfolio>> = {};

        campaigns.forEach(campaign => {
            const campaignMetrics = performanceMetrics[campaign.campaignId];
            const portfolioId = campaign.portfolioId;

            if (portfolioId && campaignMetrics) {
                if (!metricsByPortfolio[portfolioId]) {
                    metricsByPortfolio[portfolioId] = { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, acos: 0, roas: 0, cpc: 0, ctr: 0, campaignCount: 0 };
                }
                const portfolio = metricsByPortfolio[portfolioId];
                portfolio.impressions += campaignMetrics.impressions;
                portfolio.clicks += campaignMetrics.clicks;
                portfolio.spend += campaignMetrics.spend;
                portfolio.sales += campaignMetrics.sales;
                portfolio.orders += campaignMetrics.orders;
                portfolio.campaignCount += 1;
            }
        });

        return portfolios
            .map(p => {
                const metrics = metricsByPortfolio[p.portfolioId] || { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, campaignCount: 0 };
                const { spend, sales, clicks, impressions } = metrics;
                return {
                    ...p,
                    ...metrics,
                    acos: sales > 0 ? spend / sales : 0,
                    roas: spend > 0 ? sales / spend : 0,
                    cpc: clicks > 0 ? spend / clicks : 0,
                    ctr: impressions > 0 ? clicks / impressions : 0,
                };
            })
            .sort((a, b) => b.spend - a.spend);
    }, [portfolios, campaigns, performanceMetrics]);

    const handleApplyDateRange = (newRange: { start: Date; end: Date }) => {
        setDateRange(newRange);
        setDatePickerOpen(false);
    };

    const formatDateRangeDisplay = (start: Date, end: Date) => {
        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
        return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
    };

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h1 style={styles.title}>Portfolios</h1>
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
                        disabled={loading.profiles}
                    >
                        {loading.profiles ? <option>Loading...</option> : profiles.map(p => <option key={p.profileId} value={p.profileId}>{p.profileId} ({p.countryCode})</option>)}
                    </select>
                </div>
                <div style={{ ...styles.controlGroup, marginLeft: 'auto' }}>
                    <div style={{ position: 'relative' }}>
                        <button style={styles.dateButton} onClick={() => setDatePickerOpen(o => !o)}>
                            {formatDateRangeDisplay(dateRange.start, dateRange.end)}
                        </button>
                        {isDatePickerOpen && <DateRangePicker initialRange={dateRange} onApply={handleApplyDateRange} onClose={() => setDatePickerOpen(false)} />}
                    </div>
                </div>
            </section>
            
            {loading.data ? (
                <div style={styles.loader}>Loading portfolio data...</div>
            ) : (
                <div style={styles.tableContainer}>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>Portfolio Name</th>
                                <th style={styles.th}>Status</th>
                                <th style={styles.th}>Campaigns</th>
                                <th style={styles.th}>Spend</th>
                                <th style={styles.th}>Sales</th>
                                <th style={styles.th}>ACoS</th>
                                <th style={styles.th}>RoAS</th>
                                <th style={styles.th}>Orders</th>
                                <th style={styles.th}>Clicks</th>
                                <th style={styles.th}>Impressions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {portfoliosWithMetrics.map(p => (
                                <tr key={p.portfolioId}>
                                    <td style={styles.td}>
                                        <Link to="/campaigns" state={{ portfolio: p }} style={styles.link}>
                                            {p.name}
                                        </Link>
                                    </td>
                                    <td style={{...styles.td, textTransform: 'capitalize'}}>{p.state}</td>
                                    <td style={styles.td}>{p.campaignCount}</td>
                                    <td style={styles.td}>{formatPrice(p.spend)}</td>
                                    <td style={styles.td}>{formatPrice(p.sales)}</td>
                                    <td style={styles.td}>{`${(p.acos * 100).toFixed(2)}%`}</td>
                                    <td style={styles.td}>{p.roas.toFixed(2)}</td>
                                    <td style={styles.td}>{formatNumber(p.orders)}</td>
                                    <td style={styles.td}>{formatNumber(p.clicks)}</td>
                                    <td style={styles.td}>{formatNumber(p.impressions)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}