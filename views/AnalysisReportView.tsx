// views/AnalysisReportView.tsx
import React, { useState, useEffect } from 'react';

// Define a placeholder for the complex report data structure
type AnalysisReport = any;

const styles: { [key: string]: React.CSSProperties } = {
    container: { maxWidth: '1200px', margin: '0 auto', padding: '20px' },
    header: { marginBottom: '20px' },
    title: { fontSize: '2rem', margin: 0 },
    controls: { display: 'flex', gap: '20px', alignItems: 'flex-end', padding: '20px', backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', marginBottom: '30px' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontWeight: 500 },
    input: { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem' },
    button: { padding: '10px 20px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' },
    buttonDisabled: { backgroundColor: 'var(--primary-hover-color)', cursor: 'not-allowed' },
    message: { textAlign: 'center', padding: '50px', fontSize: '1.2rem', color: '#666', backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)' },
    error: { color: 'var(--danger-color)', padding: '20px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)' },
    reportContainer: { display: 'flex', flexDirection: 'column', gap: '20px' },
    reportCard: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '20px' },
    cardTitle: { fontSize: '1.5rem', fontWeight: 600, margin: '0 0 15px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' },
    kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' },
    kpiCard: { textAlign: 'center', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' },
    kpiValue: { fontSize: '1.75rem', fontWeight: 'bold', margin: 0, color: 'var(--primary-color)' },
    kpiLabel: { fontSize: '0.9rem', color: '#666', margin: '5px 0 0 0' },
    insights: { fontStyle: 'italic', color: '#333', backgroundColor: '#eef2f3', padding: '15px', borderRadius: '8px', borderLeft: '4px solid var(--primary-color)' },
    pre: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', backgroundColor: '#f0f2f2', padding: '15px', borderRadius: '4px', fontSize: '0.9rem', maxHeight: '500px', overflowY: 'auto' }
};

export function AnalysisReportView() {
    const [asins, setAsins] = useState<string[]>([]);
    const [selectedAsin, setSelectedAsin] = useState('');
    const [reportData, setReportData] = useState<AnalysisReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const [dateRange, setDateRange] = useState({ start: sevenDaysAgo.toISOString().split('T')[0], end: today });
    
    useEffect(() => {
        const fetchAsins = async () => {
            try {
                const response = await fetch('/api/listings');
                if (!response.ok) throw new Error('Failed to fetch ASINs.');
                const data = await response.json();
                const asinList = data.map((item: any) => item.asin);
                setAsins(asinList);
                if (asinList.length > 0) {
                    setSelectedAsin(asinList[0]);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not load ASINs.');
            }
        };
        fetchAsins();
    }, []);

    const handleGenerateReport = async () => {
        if (!selectedAsin) {
            setError('Please select an ASIN.');
            return;
        }
        setLoading(true);
        setError(null);
        setReportData(null);

        try {
            const response = await fetch('/api/ai/generate-analysis-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    asin: selectedAsin,
                    startDate: dateRange.start,
                    endDate: dateRange.end,
                    profileId: localStorage.getItem('selectedProfileId'),
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to generate report.');
            setReportData(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setLoading(false);
        }
    };
    
    const KpiCard = ({ value, label }: { value: string | number, label: string }) => (
        <div style={styles.kpiCard}>
            <p style={styles.kpiValue}>{value}</p>
            <p style={styles.kpiLabel}>{label}</p>
        </div>
    );

    return (
        <div style={styles.container}>
            <header style={styles.header}>
                <h1 style={styles.title}>AI Analysis Report</h1>
            </header>

            <div style={styles.controls}>
                <div style={styles.formGroup}>
                    <label style={styles.label} htmlFor="asin-select">Select ASIN</label>
                    <select id="asin-select" style={styles.input} value={selectedAsin} onChange={e => setSelectedAsin(e.target.value)} disabled={asins.length === 0}>
                        {asins.length > 0 ? asins.map(a => <option key={a} value={a}>{a}</option>) : <option>Loading ASINs...</option>}
                    </select>
                </div>
                 <div style={styles.formGroup}>
                    <label style={styles.label} htmlFor="start-date">Start Date</label>
                    <input type="date" id="start-date" style={styles.input} value={dateRange.start} onChange={e => setDateRange(prev => ({...prev, start: e.target.value}))} />
                </div>
                <div style={styles.formGroup}>
                    <label style={styles.label} htmlFor="end-date">End Date</label>
                    <input type="date" id="end-date" style={styles.input} value={dateRange.end} onChange={e => setDateRange(prev => ({...prev, end: e.target.value}))} />
                </div>
                <button onClick={handleGenerateReport} style={loading ? {...styles.button, ...styles.buttonDisabled} : styles.button} disabled={loading}>
                    {loading ? 'Generating...' : 'Generate Report'}
                </button>
            </div>

            {error && <div style={styles.error}>{error}</div>}

            {loading && <div style={styles.message}>AI is analyzing your data. This may take a few minutes...</div>}
            
            {!loading && !error && !reportData && (
                <div style={styles.message}>
                    Select an ASIN and date range to generate a comprehensive performance analysis.
                </div>
            )}

            {reportData && (
                <div style={styles.reportContainer}>
                     <div style={{...styles.reportCard, display: 'flex', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#eef2f3' }}>
                        <div><strong>ASIN Status:</strong> {reportData.asinStatus.status} ({reportData.asinStatus.daysOfData} days of data)</div>
                        {reportData.dataFreshness.isDelayed && <div style={{color: 'var(--danger-color)'}}><strong>Data Freshness Warning:</strong> Data is delayed by {reportData.dataFreshness.delayDays} days. Last data is from {reportData.dataFreshness.lastDate}.</div>}
                    </div>

                    <div style={styles.reportCard}>
                        <h2 style={styles.cardTitle}>Cost & Profitability Analysis</h2>
                        <div style={styles.kpiGrid}>
                            <KpiCard value={`$${reportData.costAnalysis.price}`} label="Price" />
                            <KpiCard value={`$${reportData.costAnalysis.profitMarginBeforeAd}`} label="Profit / Unit (Before Ads)" />
                            <KpiCard value={`${reportData.costAnalysis.breakEvenAcos}%`} label="Break-Even ACOS" />
                            <KpiCard value={`$${reportData.costAnalysis.avgCpa}`} label="Avg. Ad CPA (Cost per Order)" />
                            <KpiCard value={`$${reportData.costAnalysis.profitMarginAfterAd}`} label="Profit / Ad Order" />
                            <KpiCard value={`${reportData.costAnalysis.tacos}%`} label="TACoS" />
                        </div>
                        <p style={styles.insights}><strong>AI Insights:</strong> {reportData.costAnalysis.aiInsights}</p>
                    </div>
                    
                    <div style={styles.reportCard}>
                        <h2 style={styles.cardTitle}>Weekly Overview</h2>
                        <h3>Search Term Summary</h3>
                        <p>{`Total Search Terms: ${reportData.weeklyOverview.searchTermSummary.total} | Relevant: ${reportData.weeklyOverview.searchTermSummary.relevant} | Irrelevant: ${reportData.weeklyOverview.searchTermSummary.irrelevant}`}</p>
                        <p style={styles.insights}><strong>AI Insights:</strong> {reportData.weeklyOverview.searchTermSummary.aiInsights}</p>
                        
                        <h3>Spend Efficiency</h3>
                         <div style={styles.kpiGrid}>
                            <KpiCard value={`$${reportData.weeklyOverview.spendEfficiency.totalAdSpend}`} label="Total Ad Spend" />
                            <KpiCard value={`$${reportData.weeklyOverview.spendEfficiency.adSales}`} label="Total Ad Sales" />
                            <KpiCard value={`${reportData.weeklyOverview.spendEfficiency.acos}%`} label="Overall ACOS" />
                        </div>
                        <p style={styles.insights}><strong>AI Insights:</strong> {reportData.weeklyOverview.spendEfficiency.aiInsights}</p>
                    </div>

                    <div style={styles.reportCard}>
                        <h2 style={styles.cardTitle}>Full AI Analysis (JSON Output)</h2>
                        <pre style={styles.pre}>{JSON.stringify(reportData, null, 2)}</pre>
                    </div>

                </div>
            )}
        </div>
    );
}