// views/components/ChartModal.tsx
import React, { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
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
  Legend
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
             const d = new Date(dateStr);
             // Use UTC methods to avoid timezone shifts
             return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        };

        const labels = historyData.map(d => formatDate(d.report_date));
        
        // Use any[] to allow mixed chart types (line and bar)
        const datasets: any[] = [{
            type: 'line',
            label: config.metricLabel,
            data: historyData.map(d => d.value),
            borderColor: 'var(--primary-color)',
            backgroundColor: 'rgba(0, 113, 133, 0.2)',
            fill: false,
            yAxisID: 'y',
        }];

        const hasSpData = historyData.some(d => d.sp_clicks !== null || d.sp_impressions !== null || d.sp_orders !== null);

        if (hasSpData) {
            datasets.push({
                label: 'SP Clicks',
                data: historyData.map(d => d.sp_clicks),
                borderColor: '#28a745',
                backgroundColor: 'rgba(40, 167, 69, 0.2)',
                yAxisID: 'y1',
                type: 'bar',
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
                ticks: {
                    callback: (value: any) => {
                        if (config.metricFormat === 'percent') return `${(value * 100).toFixed(1)}%`;
                        if (config.metricFormat === 'price') return `$${Number(value).toFixed(2)}`;
                        return value;
                    }
                }
            },
            y1: {
                type: 'linear' as const,
                display: historyData.some(d => d.sp_clicks !== null), // Only display if there's data
                position: 'right' as const,
                title: { display: true, text: 'SP Clicks' },
                grid: { drawOnChartArea: false },
            },
        },
    };

    return (
        <div style={styles.modalBackdrop} onClick={onClose}>
            <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                <h2 style={styles.modalHeader}>History: {config.metricLabel} for "{config.searchQuery}"</h2>
                <div style={styles.modalBody}>
                    {loading && <div style={styles.message}>Loading history...</div>}
                    {error && <div style={styles.message}>{error}</div>}
                    {!loading && !error && chartData && <Line options={chartOptions} data={chartData} />}
                    {!loading && !error && !chartData && <div style={styles.message}>No historical data available.</div>}
                </div>
                <div style={styles.modalFooter}>
                    <button onClick={onClose} style={styles.primaryButton}>Close</button>
                </div>
            </div>
        </div>
    );
}