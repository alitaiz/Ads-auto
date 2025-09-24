// views/components/AIRuleSuggester.tsx
import React, { useState, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { DateRangePicker } from './DateRangePicker';
import { AutomationRuleCondition } from '../../types';

const spinnerKeyframes = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;

const styles: { [key: string]: React.CSSProperties } = {
  contentGrid: { display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '30px', alignItems: 'flex-start' },
  formCard: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontWeight: 500 },
  input: { padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '1rem', width: '100%' },
  button: { padding: '12px 20px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' },
  buttonDisabled: { backgroundColor: 'var(--primary-hover-color)', cursor: 'not-allowed' },
  resultsContainer: { display: 'flex', flexDirection: 'column', gap: '20px' },
  resultCard: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '20px' },
  resultTitle: { fontSize: '1.2rem', fontWeight: 600, margin: '0 0 15px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' },
  error: { color: 'var(--danger-color)', padding: '15px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)', border: '1px solid var(--danger-color)' },
  loaderContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' },
  loader: { border: '4px solid #f3f3f3', borderTop: '4px solid var(--primary-color)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' },
  dateButton: { padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '1rem', background: 'white', cursor: 'pointer', textAlign: 'left' },
  reasoningBlock: { backgroundColor: '#e6f7ff', borderLeft: '4px solid #1890ff', padding: '15px', marginTop: '15px', borderRadius: '4px' },
  ifThenBlock: { border: '1px dashed #ccc', borderRadius: 'var(--border-radius)', padding: '15px', backgroundColor: '#fafafa', marginTop: '10px' },
};

const getInitialDateRange = () => {
    const end = new Date();
    const start = new Date();
    end.setDate(end.getDate() - 2); // Data is available after 2 days
    start.setDate(end.getDate() - 29); // Default to last 30 days
    return { start, end };
};

export function AIRuleSuggester() {
    const [inputs, setInputs] = useState({
        asin: '', salePrice: '', cost: '', fbaFee: '', referralFee: ''
    });
    const [dateRange, setDateRange] = useState(getInitialDateRange());
    const [isDatePickerOpen, setDatePickerOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [suggestion, setSuggestion] = useState<{ rule: any, reasoning: string } | null>(null);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setInputs(prev => ({ ...prev, [name]: value }));
    };

    const handleApplyDateRange = (newRange: { start: Date; end: Date }) => {
        setDateRange(newRange);
        setDatePickerOpen(false);
    };

    const formatDateRangeDisplay = (start: Date, end: Date) => {
        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
        return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
    };

    const handleGetSuggestion = useCallback(async () => {
        setLoading(true);
        setError(null);
        setSuggestion(null);

        try {
            const response = await fetch('/api/ai/suggest-rule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...inputs,
                    startDate: dateRange.start.toISOString().split('T')[0],
                    endDate: dateRange.end.toISOString().split('T')[0],
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to get suggestion.');
            }
            setSuggestion(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setLoading(false);
        }
    }, [inputs, dateRange]);

    const renderCondition = (cond: AutomationRuleCondition, index: number) => (
        <div key={index}>
            <span style={{fontWeight: 'bold'}}>{cond.metric}</span> in last <span style={{fontWeight: 'bold'}}>{cond.timeWindow} days</span> is <span style={{fontWeight: 'bold'}}>{cond.operator} {cond.value}</span>
        </div>
    );

    return (
        <div>
            <style>{spinnerKeyframes}</style>
            <div style={styles.contentGrid}>
                <div style={styles.formCard}>
                    <h3>Product & Performance Metrics</h3>
                    <div style={styles.formGroup}>
                        <label htmlFor="asin" style={styles.label}>Product ASIN</label>
                        <input id="asin" name="asin" style={styles.input} value={inputs.asin} onChange={handleInputChange} placeholder="e.g., B08L8VJS4F" />
                    </div>
                     <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px'}}>
                        <div style={styles.formGroup}>
                            <label htmlFor="salePrice" style={styles.label}>Sale Price ($)</label>
                            <input id="salePrice" name="salePrice" type="number" style={styles.input} value={inputs.salePrice} onChange={handleInputChange} placeholder="e.g., 29.99" />
                        </div>
                        <div style={styles.formGroup}>
                            <label htmlFor="cost" style={styles.label}>Product Cost (COGS) ($)</label>
                            <input id="cost" name="cost" type="number" style={styles.input} value={inputs.cost} onChange={handleInputChange} placeholder="e.g., 5.50" />
                        </div>
                        <div style={styles.formGroup}>
                            <label htmlFor="fbaFee" style={styles.label}>FBA Fee ($)</label>
                            <input id="fbaFee" name="fbaFee" type="number" style={styles.input} value={inputs.fbaFee} onChange={handleInputChange} placeholder="e.g., 3.50" />
                        </div>
                        <div style={styles.formGroup}>
                            <label htmlFor="referralFee" style={styles.label}>Referral Fee (%)</label>
                            <input id="referralFee" name="referralFee" type="number" style={styles.input} value={inputs.referralFee} onChange={handleInputChange} placeholder="e.g., 15" />
                        </div>
                    </div>
                     <div style={styles.formGroup}>
                        <label style={styles.label}>Analysis Date Range</label>
                        <div style={{ position: 'relative' }}>
                            <button style={styles.dateButton} onClick={() => setDatePickerOpen(o => !o)}>{formatDateRangeDisplay(dateRange.start, dateRange.end)}</button>
                            {isDatePickerOpen && <DateRangePicker initialRange={dateRange} onApply={handleApplyDateRange} onClose={() => setDatePickerOpen(false)} />}
                        </div>
                    </div>
                    <button onClick={handleGetSuggestion} style={loading ? { ...styles.button, ...styles.buttonDisabled } : styles.button} disabled={loading}>
                        {loading ? 'Analyzing...' : 'Get AI Suggestion'}
                    </button>
                </div>
                <div style={styles.resultsContainer}>
                    {loading && <div style={styles.loaderContainer}><div style={styles.loader}></div></div>}
                    {error && <div style={styles.error}>{error}</div>}
                    {suggestion && (
                        <div style={styles.resultCard}>
                            <h2 style={styles.resultTitle}>AI Rule Suggestion</h2>
                             <p>Based on your data, here is a suggested rule to improve performance. You can create this rule in the tabs to the left.</p>
                            
                            {suggestion.rule.conditionGroups.map((group: any, index: number) => (
                                <div key={index} style={styles.ifThenBlock}>
                                    <p><strong>IF:</strong></p>
                                    <ul>{group.conditions.map((c: any, i: number) => <li key={i}>{renderCondition(c, i)}</li>)}</ul>
                                    <p><strong>THEN:</strong></p>
                                    <p>Adjust Bid by <strong>{group.action.value}%</strong> (Min Bid: ${group.action.minBid}, Max Bid: ${group.action.maxBid})</p>
                                </div>
                            ))}

                            <div style={styles.reasoningBlock}>
                                <p style={{margin: 0}}><strong>Reasoning:</strong> {suggestion.reasoning}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}