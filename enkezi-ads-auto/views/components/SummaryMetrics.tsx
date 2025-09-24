import React from 'react';
import { SummaryMetricsData } from '../../types';
import { formatPrice, formatNumber } from '../../utils';

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '20px',
    marginBottom: '20px',
  },
  metricCard: {
    backgroundColor: 'var(--card-background-color)',
    padding: '20px',
    borderRadius: 'var(--border-radius)',
    boxShadow: 'var(--box-shadow)',
    textAlign: 'center',
  },
  metricValue: {
    fontSize: '1.75rem',
    fontWeight: '600',
    margin: '0 0 5px 0',
    color: 'var(--primary-color)',
  },
  metricLabel: {
    fontSize: '0.9rem',
    color: '#666',
    margin: 0,
  },
  secondaryMetricValue: {
      fontSize: '0.9rem',
      color: '#666',
      margin: '5px 0 0 0',
  }
};

interface SummaryMetricsProps {
  metrics: SummaryMetricsData | null;
  loading: boolean;
}

export function SummaryMetrics({ metrics, loading }: SummaryMetricsProps) {
  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px' }}>Loading metrics...</div>;
  }
  if (!metrics) {
    return null;
  }

  const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;
  const formatRoAS = (value: number) => `${value.toFixed(2)}x`;

  return (
    <div style={styles.container}>
      <div style={styles.metricCard}>
        <p style={styles.metricValue}>{formatPrice(metrics.adjustedSpend)}</p>
        <p style={styles.metricLabel}>Spend</p>
      </div>
      <div style={styles.metricCard}>
        <p style={styles.metricValue}>{formatPrice(metrics.sales)}</p>
        <p style={styles.metricLabel}>Sales</p>
      </div>
      <div style={styles.metricCard}>
        <p style={styles.metricValue}>{formatPercent(metrics.acos)}</p>
        <p style={styles.metricLabel}>ACoS</p>
      </div>
      <div style={styles.metricCard}>
        <p style={styles.metricValue}>{formatRoAS(metrics.roas)}</p>
        <p style={styles.metricLabel}>RoAS</p>
      </div>
       <div style={styles.metricCard}>
        <p style={styles.metricValue}>{formatNumber(metrics.orders)}</p>
        <p style={styles.metricLabel}>Orders</p>
      </div>
      <div style={styles.metricCard}>
        <p style={styles.metricValue}>{formatNumber(metrics.clicks)}</p>
        <p style={styles.metricLabel}>Clicks</p>
      </div>
      <div style={styles.metricCard}>
        <p style={styles.metricValue}>{formatPrice(metrics.cpc)}</p>
        <p style={styles.metricLabel}>CPC</p>
      </div>
    </div>
  );
}