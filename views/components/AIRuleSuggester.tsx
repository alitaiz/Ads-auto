// views/components/AIRuleSuggester.tsx
import React, { useState, useCallback } from 'react';

// This is a minimal definition for the component.
// The actual types are in types.ts but we can't import it here.
interface SuggestedRule {
    name: string;
    rule_type: string;
    ad_type?: string;
    config: any;
    reasoning?: string;
}

interface Playbook {
    suggestedKeywords: { core: string[], long_tail: string[] };
    suggestedCampaigns: { name: string, type: string, purpose: string }[];
    suggestedRules: { name: string, logic: string, reasoning: string }[];
    reasoning: string;
}

const spinnerKeyframes = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;

const styles: { [key: string]: React.CSSProperties } = {
    container: { fontFamily: 'sans-serif' },
    toggleContainer: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', padding: '10px', backgroundColor: '#f0f2f2', borderRadius: '8px' },
    toggleLabel: { fontWeight: 600, color: '#333' },
    toggleSwitch: { position: 'relative', display: 'inline-block', width: '60px', height: '34px' },
    toggleInput: { opacity: 0, width: 0, height: 0 },
    toggleSlider: { position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#ccc', transition: '.4s', borderRadius: '34px' },
    toggleSliderBefore: { position: 'absolute', content: '""', height: '26px', width: '26px', left: '4px', bottom: '4px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%' },
    contentGrid: { display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '30px', alignItems: 'start' },
    formCard: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
    label: { fontWeight: 500, fontSize: '0.9rem' },
    input: { padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '1rem', width: '100%' },
    textarea: { padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '1rem', width: '100%', minHeight: '100px', resize: 'vertical' },
    button: { padding: '12px 20px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' },
    buttonDisabled: { backgroundColor: 'var(--primary-hover-color)', cursor: 'not-allowed' },
    resultsContainer: { display: 'flex', flexDirection: 'column', gap: '20px' },
    resultCard: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '20px' },
    resultTitle: { fontSize: '1.2rem', fontWeight: 600, margin: '0 0 15px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' },
    error: { color: 'var(--danger-color)', padding: '15px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)', border: '1px solid var(--danger-color)' },
    loaderContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' },
    loader: { border: '4px solid #f3f3f3', borderTop: '4px solid var(--primary-color)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' },
    placeholder: { textAlign: 'center', color: '#666', padding: '50px', backgroundColor: '#f8f9fa', borderRadius: 'var(--border-radius)', border: '2px dashed var(--border-color)' },
    radioGroup: { display: 'flex', gap: '15px', flexWrap: 'wrap' },
    summaryCard: { backgroundColor: '#eef2f3', border: '1px solid #d1d9e6', borderRadius: '8px', padding: '15px' },
    summaryTitle: { margin: '0 0 10px 0', fontSize: '1rem', fontWeight: 'bold' },
    summaryGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 15px', fontSize: '0.9rem' },
    playbookList: { listStyleType: 'disc', paddingLeft: '20px', margin: 0 },
};

export function AIRuleSuggester() {
    const [isNewProduct, setIsNewProduct] = useState(false);
    const [existingProductInputs, setExistingProductInputs] = useState({
        asin: '', salePrice: '', productCost: '', fbaFee: '', referralFeePercent: '15', ruleType: 'BID_ADJUSTMENT'
    });
    const [newProductInputs, setNewProductInputs] = useState({
        description: '', competitors: '', usp: '', goal: ''
    });
    
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    const [dateRange, setDateRange] = useState({ 
        start: thirtyDaysAgo.toISOString().split('T')[0], 
        end: today.toISOString().split('T')[0] 
    });

    const [result, setResult] = useState<{ type: 'rule' | 'playbook', data: any, dataSummary?: any, reasoning?: string } | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleExistingInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setExistingProductInputs(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };
    const handleNewInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setNewProductInputs(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = useCallback(async () => {
        setLoading(true);
        setError(null);
        setResult(null);

        const body = {
            isNewProduct,
            productData: isNewProduct ? newProductInputs : {
                asin: existingProductInputs.asin,
                salePrice: parseFloat(existingProductInputs.salePrice),
                productCost: parseFloat(existingProductInputs.productCost),
                fbaFee: parseFloat(existingProductInputs.fbaFee),
                referralFeePercent: parseFloat(existingProductInputs.referralFeePercent)
            },
            ruleType: isNewProduct ? null : existingProductInputs.ruleType,
            dateRange: isNewProduct ? null : dateRange
        };

        try {
            const res = await fetch('/api/ai/suggest-rule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'An unknown error occurred.');
            
            setResult({
                type: data.type,
                data: data.rule || data.playbook,
                dataSummary: data.dataSummary,
                reasoning: data.reasoning
            });

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to get suggestion.');
        } finally {
            setLoading(false);
        }
    }, [isNewProduct, newProductInputs, existingProductInputs, dateRange]);

    const renderExistingProductForm = () => (
        <>
            <div style={styles.formGroup}>
                <label style={styles.label}>ASIN</label>
                <input style={styles.input} name="asin" value={existingProductInputs.asin} onChange={handleExistingInputChange} placeholder="B0..." required />
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px'}}>
                <div style={styles.formGroup}><label style={styles.label}>Giá bán</label><input type="number" step="0.01" style={styles.input} name="salePrice" value={existingProductInputs.salePrice} onChange={handleExistingInputChange} required /></div>
                <div style={styles.formGroup}><label style={styles.label}>Giá sản phẩm (Cost)</label><input type="number" step="0.01" style={styles.input} name="productCost" value={existingProductInputs.productCost} onChange={handleExistingInputChange} required /></div>
                <div style={styles.formGroup}><label style={styles.label}>Phí FBA</label><input type="number" step="0.01" style={styles.input} name="fbaFee" value={existingProductInputs.fbaFee} onChange={handleExistingInputChange} required /></div>
                <div style={styles.formGroup}><label style={styles.label}>Phí giới thiệu (%)</label><input type="number" step="0.01" style={styles.input} name="referralFeePercent" value={existingProductInputs.referralFeePercent} onChange={handleExistingInputChange} required /></div>
            </div>
             <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px'}}>
                 <div style={styles.formGroup}><label style={styles.label}>Ngày bắt đầu</label><input type="date" style={styles.input} value={dateRange.start} onChange={e => setDateRange(p => ({...p, start: e.target.value}))} required /></div>
                 <div style={styles.formGroup}><label style={styles.label}>Ngày kết thúc</label><input type="date" style={styles.input} value={dateRange.end} onChange={e => setDateRange(p => ({...p, end: e.target.value}))} required /></div>
            </div>
            <div style={styles.formGroup}>
                <label style={styles.label}>Loại Rule muốn đề xuất</label>
                <div style={styles.radioGroup}>
                    <label><input type="radio" name="ruleType" value="BID_ADJUSTMENT" checked={existingProductInputs.ruleType === 'BID_ADJUSTMENT'} onChange={handleExistingInputChange}/> Điều chỉnh Bid</label>
                    <label><input type="radio" name="ruleType" value="SEARCH_TERM_AUTOMATION" checked={existingProductInputs.ruleType === 'SEARCH_TERM_AUTOMATION'} onChange={handleExistingInputChange}/> Quản lý Search Term</label>
                    <label><input type="radio" name="ruleType" value="BUDGET_ACCELERATION" checked={existingProductInputs.ruleType === 'BUDGET_ACCELERATION'} onChange={handleExistingInputChange}/> Tăng tốc Ngân sách</label>
                </div>
            </div>
            <button onClick={handleSubmit} style={loading ? { ...styles.button, ...styles.buttonDisabled } : styles.button} disabled={loading}>
                {loading ? 'Đang phân tích...' : 'Lấy Đề xuất từ AI'}
            </button>
        </>
    );

    const renderNewProductForm = () => (
        <>
            <div style={styles.formGroup}><label style={styles.label}>Mô tả sản phẩm</label><textarea style={styles.textarea} name="description" value={newProductInputs.description} onChange={handleNewInputChange} placeholder="Ví dụ: ghế tắm bằng gỗ tre, chống trượt..." required /></div>
            <div style={styles.formGroup}><label style={styles.label}>Đối thủ cạnh tranh (ASIN)</label><input style={styles.input} name="competitors" value={newProductInputs.competitors} onChange={handleNewInputChange} placeholder="Ví dụ: B0..., B0..." /></div>
            <div style={styles.formGroup}><label style={styles.label}>Điểm bán hàng độc nhất (USP)</label><textarea style={styles.textarea} name="usp" value={newProductInputs.usp} onChange={handleNewInputChange} placeholder="Ví dụ: làm từ 100% tre tự nhiên, chịu tải trọng cao..." required /></div>
            <div style={styles.formGroup}><label style={styles.label}>Mục tiêu chiến dịch</label><input style={styles.input} name="goal" value={newProductInputs.goal} onChange={handleNewInputChange} placeholder="Ví dụ: Tối đa hóa hiển thị, Đạt lợi nhuận nhanh" required /></div>
             <button onClick={handleSubmit} style={loading ? { ...styles.button, ...styles.buttonDisabled } : styles.button} disabled={loading}>
                {loading ? 'Đang xây dựng...' : 'Lấy Kế hoạch Khởi chạy'}
            </button>
        </>
    );
    
    const renderResult = () => {
        if (!result || !result.data) {
            // Handle cases where AI returns no rule (e.g., no data found)
            return (
                <div style={styles.resultCard}>
                    <p>{result?.reasoning || "Không có dữ liệu để tạo đề xuất. Vui lòng thử lại với một khoảng thời gian khác hoặc kiểm tra lại ASIN."}</p>
                </div>
            );
        }
    
        if (result.type === 'rule') {
            const rule = result.data as SuggestedRule;
            return (
                <>
                    {result.dataSummary && <DataSummary summary={result.dataSummary} />}
                    <div style={styles.resultCard}>
                        <h2 style={styles.resultTitle}>Lý do Đề xuất</h2>
                        <p>{result.reasoning || "AI không cung cấp lý do."}</p>
                    </div>
                    <div style={styles.resultCard}>
                        <h2 style={styles.resultTitle}>Rule Được Đề xuất: {rule.name}</h2>
                        {(rule.config?.conditionGroups || []).map((group: any, i: number) => (
                            <div key={i} style={{ border: '1px solid #eee', padding: '10px', borderRadius: '4px', margin: '10px 0' }}>
                                <p style={{ margin: 0, fontWeight: 'bold' }}>{i > 0 && 'HOẶC '}NẾU:</p>
                                <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                                    {group.conditions.map((cond: any, j: number) => (
                                        <li key={j}>
                                            <strong>{cond.metric}</strong> trong <strong>{cond.timeWindow === 'TODAY' ? 'Hôm nay' : `${cond.timeWindow} ngày`}</strong> qua là <strong>{cond.operator} {cond.value}</strong>
                                        </li>
                                    ))}
                                </ul>
                                <p style={{ margin: 0, fontWeight: 'bold' }}>THÌ:</p>
                                <p style={{ margin: '5px 0 0 20px', fontFamily: 'monospace' }}>{JSON.stringify(group.action)}</p>
                            </div>
                        ))}
                    </div>
                </>
            );
        }
    
        if (result.type === 'playbook') {
            const playbook = result.data as Playbook;
            return (
                <>
                     <div style={styles.resultCard}>
                        <h2 style={styles.resultTitle}>Chiến lược của AI</h2>
                        <p>{playbook.reasoning}</p>
                    </div>
                    <div style={styles.resultCard}>
                        <h2 style={styles.resultTitle}>Từ khóa Đề xuất</h2>
                        <strong>Từ khóa chính:</strong>
                        <ul style={styles.playbookList}>{playbook.suggestedKeywords.core.map((k,i) => <li key={i}>{k}</li>)}</ul>
                        <strong>Từ khóa đuôi dài:</strong>
                        <ul style={styles.playbookList}>{playbook.suggestedKeywords.long_tail.map((k,i) => <li key={i}>{k}</li>)}</ul>
                    </div>
                    <div style={styles.resultCard}>
                        <h2 style={styles.resultTitle}>Cấu trúc Chiến dịch Đề xuất</h2>
                        <ul style={styles.playbookList}>
                            {playbook.suggestedCampaigns.map((c,i) => <li key={i}><strong>{c.name} ({c.type}):</strong> {c.purpose}</li>)}
                        </ul>
                    </div>
                     <div style={styles.resultCard}>
                        <h2 style={styles.resultTitle}>Rule Tự động hóa Ban đầu</h2>
                         <ul style={styles.playbookList}>
                            {playbook.suggestedRules.map((r,i) => <li key={i}><strong>{r.name}:</strong> {r.logic} ({r.reasoning})</li>)}
                        </ul>
                    </div>
                </>
            );
        }
    
        return null;
    };
    
    return (
        <div style={styles.container}>
            <style>{spinnerKeyframes}</style>
            
            <div style={styles.toggleContainer}>
                <span style={styles.toggleLabel}>Sản phẩm có sẵn dữ liệu</span>
                <label style={styles.toggleSwitch}>
                    <input type="checkbox" style={styles.toggleInput} checked={isNewProduct} onChange={() => setIsNewProduct(!isNewProduct)} />
                    <span style={{...styles.toggleSlider, backgroundColor: isNewProduct ? 'var(--primary-color)' : '#ccc'}}>
                        <span style={{...styles.toggleSliderBefore, transform: isNewProduct ? 'translateX(26px)' : 'translateX(0)'}} />
                    </span>
                </label>
                <span style={styles.toggleLabel}>Sản phẩm mới (không có dữ liệu)</span>
            </div>

            <div style={styles.contentGrid}>
                <div style={styles.formCard}>
                    {isNewProduct ? renderNewProductForm() : renderExistingProductForm()}
                </div>
                <div style={styles.resultsContainer}>
                    {loading && <div style={styles.loaderContainer}><div style={styles.loader}></div></div>}
                    {error && <div style={styles.error}>{error}</div>}
                    {result && renderResult()}
                    {!loading && !error && !result && (
                        <div style={styles.placeholder}>
                           <p>Đề xuất của AI sẽ được hiển thị ở đây.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

const DataSummary = ({ summary }: { summary: any }) => {
    if (!summary || !summary.financial) return null;
    const { financial, performance } = summary;
    
    return (
        <div style={styles.summaryCard}>
            <h3 style={styles.summaryTitle}>Dữ liệu được sử dụng để phân tích</h3>
            <div style={styles.summaryGrid}>
                <span>Lợi nhuận/đơn vị:</span> <strong>${financial.profitPerUnit?.toFixed(2)}</strong>
                <span>ACoS Hòa vốn:</span> <strong>{financial.breakEvenAcos?.toFixed(2)}%</strong>
                <span>ACoS Mục tiêu:</span> <strong>{financial.targetAcos?.toFixed(2)}%</strong>
                <span>ACoS Tổng thể:</span> <strong>{performance.overallAcos?.toFixed(2)}%</strong>
                <span>Tổng chi tiêu:</span> <strong>${performance.totalSpend?.toFixed(2)}</strong>
                <span>Tổng doanh số:</span> <strong>${performance.totalSales?.toFixed(2)}</strong>
            </div>
            {performance.campaignIds?.length > 0 && <p style={{fontSize: '0.8rem', marginTop: '10px', color: '#555'}}>Đã phân tích dữ liệu từ {performance.campaignIds.length} chiến dịch liên quan.</p>}
        </div>
    );
};