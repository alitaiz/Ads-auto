// views/components/ChartModal.tsx
import React, { useEffect, useState } from 'react';
import { Chart } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartTypeRegistry,
  LineController,
  BarController,
} from 'chart.js';
import { AppChartConfig } from '../../types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  LineController,
  BarController
);

const styles: { [key: string]: React.CSSProperties } = {
    modalBackdrop: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1050, },
    modalContent: { backgroundColor: 'var(--card-background-color)', padding: '25px', borderRadius: 'var(--border-radius)', width: '90%', maxWidth: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 5px 15px rgba(0,0,0,0.3)' },
    modalHeader: { fontSize: '1.5rem', margin: 0, paddingBottom: '10px', borderBottom: '1px solid var(--border-color)' },
    modalBody: { overflowY: 'auto', minHeight: '300px' },
    modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '15px' },
    primaryButton: { padding: '10px 20px', border: 'none', borderRadius: '4px', backgroundColor: 'var(--primary-color)', color: 'white', fontSize: '1rem', cursor: 'pointer', },
    message: { textAlign: 'center', padding: '50px', fontSize: '1.2rem', color: '#666', },
};

interface TermHistoryData {
    report_date: string;
    value?: number | null;
    sp_impressions?: number | null;
    sp_clicks?: number | null;
    sp_orders?: number | null;
}

interface ChartModalProps {
    config: AppChartConfig;
    dateRange: { start: string, end: string };
    onClose: () => void;
}

export function ChartModal({ config, dateRange, onClose }: ChartModalProps) {
    const [historyData, setHistoryData] = useState<TermHistoryData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [chartData, setChartData] = useState<any>(null);

    useEffect(() => {
        const fetchHistory = async () => {
            if (!config || !dateRange.start || !dateRange.end) return;
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams({
                    startDate: dateRange.start,
                    endDate: dateRange.end,
                    metricId: config.metricId,
                    searchQuery: config.searchQuery,
                    asin: config.asin,
                });
                const response = await fetch(`/api/query-performance-history?${params.toString()}`);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to fetch history');
                }
                const data: TermHistoryData[] = await response.json();
                setHistoryData(data);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'An unknown error occurred.');
            } finally {
                setLoading(false);
            }
        };

        if (config.type === 'performance') {
            fetchHistory();
        }
    }, [config, dateRange]);

    useEffect(() => {
        if (!historyData || historyData.length === 0) {
            setChartData(null);
            return;
        };

        const formatDate = (dateStr: string) => {
             // Handle potential timezone issues by parsing as UTC
             const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00Z');
             return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
        };

        const labels = historyData.map(d => formatDate(d.report_date));
        
        const datasets: any[] = [{
            type: 'line' as const,
            label: config.metricLabel,
            data: historyData.map(d => d.value),
            borderColor: 'var(--primary-color)',
            backgroundColor: 'rgba(0, 113, 133, 0.2)',
            fill: false,
            yAxisID: 'y',
        }];

        const hasSpClicksData = historyData.some(d => d.sp_clicks !== null && typeof d.sp_clicks === 'number');
        const hasSpImpressionsData = historyData.some(d => d.sp_impressions !== null && typeof d.sp_impressions === 'number');
        const hasSpOrdersData = historyData.some(d => d.sp_orders !== null && typeof d.sp_orders === 'number');

        const shouldShowSpClicksChart = hasSpClicksData && config.metricId === 'clicks.asinCount';
        const shouldShowSpImpressionsChart = hasSpImpressionsData && config.metricId === 'impressions.asinCount';
        const shouldShowSpPurchasesChart = hasSpOrdersData && config.metricId === 'purchases.asinCount';

        if (shouldShowSpClicksChart) {
            datasets.push({
                type: 'bar' as const,
                label: 'SP Clicks',
                data: historyData.map(d => d.sp_clicks),
                backgroundColor: 'rgba(40, 167, 69, 0.6)',
                yAxisID: 'y',
            });
        }
        
        if (shouldShowSpImpressionsChart) {
            datasets.push({
                type: 'bar' as const,
                label: 'SP Impressions',
                data: historyData.map(d => d.sp_impressions),
                backgroundColor: 'rgba(255, 159, 64, 0.6)', // Orange color for impressions
                yAxisID: 'y',
            });
        }
        
        if (shouldShowSpPurchasesChart) {
            datasets.push({
                type: 'bar' as const,
                label: 'SP Purchases',
                data: historyData.map(d => d.sp_orders),
                backgroundColor: 'rgba(75, 192, 192, 0.6)', // Teal color for purchases
                yAxisID: 'y',
            });
        }
        
        setChartData({ labels, datasets });

    }, [historyData, config]);
    
    const chartOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top' as const },
            tooltip: { mode: 'index' as const, intersect: false },
        },
        scales: {
            y: {
                type: 'linear' as const,
                display: true,
                position: 'left' as const,
                title: { display: true, text: config.metricLabel },
                beginAtZero: true,
                grace: '5%',
                ticks: {
                    callback: (value: any) => {
                        if (config.metricFormat === 'percent') return `${(Number(value) * 100).toFixed(1)}%`;
                        if (config.metricFormat === 'price') return `$${Number(value).toFixed(2)}`;
                        return Number(value).toLocaleString();
                    }
                }
            },
            y1: {
                type: 'linear' as const,
                display: false, // Hide the secondary y-axis
                position: 'right' as const,
                grid: {
                    drawOnChartArea: false,
                },
            }
        },
    };

    return (
        <div style={styles.modalBackdrop} onClick={onClose}>
            <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                <h2 style={styles.modalHeader}>History: {config.metricLabel} for "{config.searchQuery}"</h2>
                <div style={styles.modalBody}>
                    {loading && <div style={styles.message}>Loading history...</div>}
                    {error && <div style={styles.message}>{error}</div>}
                    {!loading && !error && chartData && <Chart type={'bar' as keyof ChartTypeRegistry} options={chartOptions} data={chartData} />}
                    {!loading && !error && !chartData && <div style={styles.message}>No historical data available.</div>}
                </div>
                <div style={styles.modalFooter}>
                    <button onClick={onClose} style={styles.primaryButton}>Close</button>
                </div>
            </div>
        </div>
    );
}