// views/AnalysisReportView.tsx
import React, { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Chart, Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement);

type AnalysisReport = any;

const styles: { [key: string]: React.CSSProperties } = {
    container: { maxWidth: '1200px', margin: '0 auto', padding: '20px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
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
    reportContainer: { display: 'flex', flexDirection: 'column', gap: '25px' },
    reportCard: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '25px' },
    cardTitle: { fontSize: '1.5rem', fontWeight: 600, margin: '0 0 20px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' },
    kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '20px' },
    kpiCard: { textAlign: 'center', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #e9ecef' },
    kpiValue: { fontSize: '1.75rem', fontWeight: 'bold', margin: 0, color: 'var(--primary-color)' },
    kpiLabel: { fontSize: '0.9rem', color: '#666', margin: '5px 0 0 0' },
    termListContainer: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
    termList: { listStyle: 'none', padding: 0, margin: 0 },
    termChip: { backgroundColor: '#e9ecef', padding: '4px 8px', borderRadius: '12px', fontSize: '0.85rem', marginBottom: '5px', display: 'inline-block' },
    detailTable: { width: '100%', borderCollapse: 'collapse', marginTop: '20px' },
    detailTh: { padding: '10px', textAlign: 'left', borderBottom: '2px solid #ccc', background: '#f8f9fa' },
    detailTd: { padding: '10px', borderBottom: '1px solid #eee' },
    actionList: { listStyleType: 'decimal', paddingLeft: '20px' },
    chartContainer: { height: '250px', marginTop: '20px' },
};

const KpiCard = ({ value, label, tooltip }: { value: string | number, label: string, tooltip?: string }) => (
    <div style={styles.kpiCard} title={tooltip}>
        <p style={styles.kpiValue}>{value}</p>
        <p style={styles.kpiLabel}>{label}</p>
    </div>
);

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
                if (asinList.length > 0) setSelectedAsin(asinList[0]);
            } catch (err) { setError(err instanceof Error ? err.message : 'Could not load ASINs.'); }
        };
        fetchAsins();
    }, []);

    const handleGenerateReport = async () => {
        if (!selectedAsin) { setError('Vui lòng chọn một ASIN.'); return; }
        setLoading(true); setError(null); setReportData(null);

        try {
            const response = await fetch('/api/ai/generate-analysis-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ asin: selectedAsin, startDate: dateRange.start, endDate: dateRange.end, profileId: localStorage.getItem('selectedProfileId') }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Tạo báo cáo thất bại.');
            setReportData(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi không xác định.');
        } finally {
            setLoading(false);
        }
    };

    const dailyChartData = reportData?.weeklyOverview?.trends?.daily ? {
        labels: reportData.weeklyOverview.trends.daily.map((d: any) => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })),
        datasets: [
            { type: 'bar' as const, label: 'Chi tiêu QC', data: reportData.weeklyOverview.trends.daily.map((d: any) => d.adSpend), backgroundColor: 'rgba(255, 99, 132, 0.5)', yAxisID: 'y' },
            { type: 'line' as const, label: 'Đơn hàng QC', data: reportData.weeklyOverview.trends.daily.map((d: any) => d.adOrders), borderColor: 'rgb(54, 162, 235)', yAxisID: 'y1' },
            { type: 'line' as const, label: 'Doanh thu QC', data: reportData.weeklyOverview.trends.daily.map((d: any) => d.adSales), borderColor: 'rgb(75, 192, 192)', yAxisID: 'y' },
        ]
    } : null;
    
    const deviceChartData = reportData?.weeklyOverview?.conversionAndDevices ? {
        labels: ['Di động (Mobile)', 'Máy tính (Browser)'],
        datasets: [{
            data: [reportData.weeklyOverview.conversionAndDevices.mobileSessionShare, 100 - reportData.weeklyOverview.conversionAndDevices.mobileSessionShare],
            backgroundColor: ['#007185', '#adb5bd'],
        }]
    } : null;

    const getAsinStatusText = (status: string) => {
        switch (status) {
            case 'New': return 'Mới launching';
            case 'Launching': return 'Trong thời gian launching';
            case 'Established': return 'Cũ (Established)';
            default: return status;
        }
    };

    return (
        <div style={styles.container}>
            <header style={styles.header}><h1 style={styles.title}>Báo cáo Phân tích</h1></header>
            <div style={styles.controls}>
                <div style={styles.formGroup}><label style={styles.label} htmlFor="asin-select">Chọn ASIN</label><select id="asin-select" style={styles.input} value={selectedAsin} onChange={e => setSelectedAsin(e.target.value)} disabled={asins.length === 0}>{asins.length > 0 ? asins.map(a => <option key={a} value={a}>{a}</option>) : <option>Đang tải...</option>}</select></div>
                <div style={styles.formGroup}><label style={styles.label} htmlFor="start-date">Ngày bắt đầu</label><input type="date" id="start-date" style={styles.input} value={dateRange.start} onChange={e => setDateRange(prev => ({...prev, start: e.target.value}))} /></div>
                <div style={styles.formGroup}><label style={styles.label} htmlFor="end-date">Ngày kết thúc</label><input type="date" id="end-date" style={styles.input} value={dateRange.end} onChange={e => setDateRange(prev => ({...prev, end: e.target.value}))} /></div>
                <button onClick={handleGenerateReport} style={loading ? {...styles.button, ...styles.buttonDisabled} : styles.button} disabled={loading}>{loading ? 'Đang tạo...' : 'Tạo Báo cáo'}</button>
            </div>
            {error && <div style={styles.error}>{error}</div>}
            {loading && <div style={styles.message}>Đang phân tích dữ liệu của bạn...</div>}
            {!loading && !error && !reportData && <div style={styles.message}>Chọn ASIN và khoảng thời gian để tạo báo cáo phân tích.</div>}
            {reportData && (
                <div style={styles.reportContainer}>
                    <div style={{...styles.reportCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8f9fa' }}>
                        <div><strong>Trạng thái ASIN:</strong> {getAsinStatusText(reportData.asinStatus.status)} ({reportData.asinStatus.daysOfData} ngày dữ liệu)</div>
                        {reportData.dataFreshness.isDelayed && <div style={{color: 'var(--danger-color)'}}><strong>Cảnh báo Dữ liệu:</strong> Dữ liệu bị trễ {reportData.dataFreshness.delayDays} ngày.</div>}
                    </div>
                    <div style={styles.reportCard}>
                        <h2 style={styles.cardTitle}>Phân tích Chi phí & Lợi nhuận</h2>
                        <div style={{...styles.kpiGrid, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))'}}>
                            <KpiCard value={`$${reportData.costAnalysis.price}`} label="Giá bán" />
                            <KpiCard value={`$${reportData.costAnalysis.profitMarginBeforeAd}`} label="Lợi nhuận/Đơn vị (Trước QC)" />
                            <KpiCard value={`${reportData.costAnalysis.breakEvenAcos}%`} label="ACoS Hòa vốn" />
                            <KpiCard value={`$${reportData.costAnalysis.avgCpa}`} label="CPA Quảng cáo (TB)" tooltip="Chi phí quảng cáo trung bình cho mỗi đơn hàng từ quảng cáo" />
                             <KpiCard value={`$${reportData.costAnalysis.profitMarginAfterAd}`} label="Lợi nhuận / Đơn hàng QC" />
                             <KpiCard value={`$${reportData.costAnalysis.blendedCpa}`} label="CPA Tổng hợp" tooltip="Tổng chi tiêu QC / Tổng số đơn vị đã bán" />
                            <KpiCard value={`$${reportData.costAnalysis.blendedProfitMargin}`} label="Lợi nhuận Tổng hợp / Đơn vị" />
                        </div>
                    </div>
                    <div style={styles.reportCard}>
                        <h2 style={styles.cardTitle}>Tổng quan Tuần</h2>
                        <h3 style={{fontSize: '1.2rem'}}>Hiệu quả Chi tiêu</h3>
                        <div style={styles.kpiGrid}>
                            <KpiCard value={`$${reportData.weeklyOverview.spendEfficiency.totalAdSpend}`} label="Tổng chi tiêu QC" />
                            <KpiCard value={`$${reportData.weeklyOverview.spendEfficiency.adSales}`} label="Doanh thu từ QC" />
                            <KpiCard value={`${reportData.weeklyOverview.spendEfficiency.acos}%`} label="ACOS" />
                             <KpiCard value={`$${reportData.weeklyOverview.spendEfficiency.totalSales}`} label="Tổng Doanh thu (Ads + Organic)" />
                             <KpiCard value={`${reportData.weeklyOverview.spendEfficiency.tacos}%`} label="TACoS" />
                        </div>
                         <h3 style={{fontSize: '1.2rem', marginTop: '30px'}}>Phân loại Search Term</h3>
                        <div style={styles.termListContainer}>
                            <div>
                                <h4>Liên quan ({reportData.weeklyOverview.searchTermClassification.relevantCount})</h4>
                                <ul style={styles.termList}>{reportData.weeklyOverview.searchTermClassification.relevantTerms.map((t: string) => <li key={t}><span style={styles.termChip}>{t}</span></li>)}</ul>
                            </div>
                            <div>
                                <h4>Không liên quan ({reportData.weeklyOverview.searchTermClassification.irrelevantCount})</h4>
                                <ul style={styles.termList}>{reportData.weeklyOverview.searchTermClassification.irrelevantTerms.map((t: string) => <li key={t}><span style={styles.termChip}>{t}</span></li>)}</ul>
                            </div>
                        </div>
                        <hr style={{margin: '30px 0', border: 'none', borderTop: '1px solid #eee'}} />

                        <h3 style={{fontSize: '1.2rem'}}>Xu hướng & Thiết bị</h3>
                        <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', alignItems: 'center'}}>
                            {dailyChartData && <div style={styles.chartContainer}><Chart type='bar' data={dailyChartData} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { position: 'left' }, y1: { position: 'right', grid: { drawOnChartArea: false } } } }} /></div>}
                            {deviceChartData && <div style={styles.chartContainer}><Doughnut data={deviceChartData} options={{ responsive: true, maintainAspectRatio: false }} /></div>}
                        </div>
                    </div>
                    <div style={styles.reportCard}>
                        <h2 style={styles.cardTitle}>Phân tích chi tiết Search Term</h2>
                        <table style={styles.detailTable}>
                            <thead><tr>
                                <th style={styles.detailTh}>Search Term</th>
                                <th style={styles.detailTh}>Chi tiêu</th>
                                <th style={styles.detailTh}>Đơn hàng</th>
                                <th style={styles.detailTh}>Doanh thu</th>
                                <th style={styles.detailTh}>ACOS</th>
                                <th style={styles.detailTh}>CPA</th>
                            </tr></thead>
                            <tbody>
                                {reportData.detailedSearchTermAnalysis.map((analysis: any) => (
                                    <tr key={analysis.searchTerm}>
                                        <td style={styles.detailTd}>{analysis.searchTerm}</td>
                                        <td style={styles.detailTd}>{`$${analysis.adsPerformance.spend}`}</td>
                                        <td style={styles.detailTd}>{analysis.adsPerformance.orders}</td>
                                        <td style={styles.detailTd}>{`$${analysis.adsPerformance.sales}`}</td>
                                        <td style={styles.detailTd}>{analysis.adsPerformance.acos}</td>
                                        <td style={styles.detailTd}>{`$${analysis.adsPerformance.cpa}`}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div style={styles.reportCard}>
                        <h2 style={styles.cardTitle}>Kế hoạch Hành động Tuần tới</h2>
                        {Object.entries(reportData.weeklyActionPlan).map(([category, actions]) => (
                            (actions as string[]).length > 0 && (
                                <div key={category} style={{marginBottom: '15px'}}>
                                    <h3 style={{fontSize: '1.2rem', textTransform: 'capitalize'}}>{
                                        {
                                            bidManagement: 'Quản lý Giá thầu (Bid)',
                                            negativeKeywords: 'Từ khóa Phủ định',
                                            listingOptimization: 'Tối ưu Listing'
                                        }[category] || category
                                    }</h3>
                                    <ul style={styles.actionList}>{(actions as string[]).map((action, i) => <li key={i}>{action}</li>)}</ul>
                                </div>
                            )
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}