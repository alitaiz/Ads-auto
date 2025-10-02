// views/CreateAdsView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { AutomationRule } from '../types';

const styles: { [key: string]: React.CSSProperties } = {
    container: { maxWidth: '800px', margin: '40px auto', padding: '0 20px' },
    title: { fontSize: '2rem', marginBottom: '20px', textAlign: 'center' },
    form: { display: 'flex', flexDirection: 'column', gap: '30px' },
    card: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '25px' },
    cardTitle: { fontSize: '1.2rem', fontWeight: 600, margin: '0 0 20px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' },
    formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
    label: { fontWeight: 500 },
    input: { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem' },
    ruleSection: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
    ruleListContainer: { display: 'flex', flexDirection: 'column', gap: '5px' },
    ruleList: { maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '10px' },
    ruleCheckboxItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0' },
    ruleCheckboxLabel: { fontWeight: 'normal', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    buttonContainer: { display: 'flex', justifyContent: 'flex-end', marginTop: '10px' },
    button: { padding: '12px 25px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' },
    buttonDisabled: { backgroundColor: 'var(--primary-hover-color)', cursor: 'not-allowed' },
    message: { padding: '15px', borderRadius: '4px', marginTop: '20px', textAlign: 'center' },
    successMessage: { backgroundColor: '#d4edda', color: '#155724', border: '1px solid #c3e6cb' },
    errorMessage: { backgroundColor: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb' },
};

export function CreateAdsView() {
    const [asin, setAsin] = useState('');
    const [budget, setBudget] = useState('10');
    const [defaultBid, setDefaultBid] = useState('0.75');
    const [allRules, setAllRules] = useState<AutomationRule[]>([]);
    const [selectedRuleIds, setSelectedRuleIds] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        const fetchRules = async () => {
            try {
                const profileId = localStorage.getItem('selectedProfileId');
                if (!profileId) return;
                const res = await fetch(`/api/automation/rules?profileId=${profileId}`);
                const data = await res.json();
                setAllRules(data);
            } catch (err) {
                console.error("Failed to fetch automation rules", err);
            }
        };
        fetchRules();
    }, []);

    const categorizedRules = useMemo(() => {
        return allRules.reduce((acc, rule) => {
            const type = rule.rule_type;
            if (!acc[type]) {
                acc[type] = [];
            }
            acc[type].push(rule);
            return acc;
        }, {} as Record<string, AutomationRule[]>);
    }, [allRules]);

    const handleRuleSelection = (ruleId: number) => {
        setSelectedRuleIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(ruleId)) {
                newSet.delete(ruleId);
            } else {
                newSet.add(ruleId);
            }
            return newSet;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setStatusMessage(null);
        
        const profileId = localStorage.getItem('selectedProfileId');
        if (!profileId) {
            setStatusMessage({ type: 'error', text: 'No profile selected. Please select a profile from the PPC Management page.' });
            setLoading(false);
            return;
        }

        try {
            const response = await fetch('/api/amazon/create-auto-campaign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profileId,
                    asin,
                    budget: parseFloat(budget),
                    defaultBid: parseFloat(defaultBid),
                    ruleIds: Array.from(selectedRuleIds),
                }),
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || 'An unknown error occurred.');
            }
            
            setStatusMessage({ type: 'success', text: `Successfully created campaign "${result.campaignName}" (ID: ${result.campaignId}) and associated ${result.rulesAssociated} rules.` });
            setAsin(''); // Reset form
            setSelectedRuleIds(new Set());
        } catch (err) {
            setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create campaign.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.container}>
            <h1 style={styles.title}>Create Auto Campaign</h1>
            <form style={styles.form} onSubmit={handleSubmit}>
                <div style={styles.card}>
                    <h2 style={styles.cardTitle}>Campaign Details</h2>
                    <div style={styles.formGrid}>
                        <div style={styles.formGroup}>
                            <label style={styles.label} htmlFor="asin">Product ASIN</label>
                            <input id="asin" style={styles.input} value={asin} onChange={e => setAsin(e.target.value.toUpperCase())} placeholder="B0..." required />
                        </div>
                        <div style={styles.formGroup}>
                            {/* Empty div for grid alignment */}
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label} htmlFor="budget">Daily Budget ($)</label>
                            <input id="budget" type="number" step="0.01" min="1" style={styles.input} value={budget} onChange={e => setBudget(e.target.value)} required />
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label} htmlFor="defaultBid">Default Ad Group Bid ($)</label>
                            <input id="defaultBid" type="number" step="0.01" min="0.02" style={styles.input} value={defaultBid} onChange={e => setDefaultBid(e.target.value)} required />
                        </div>
                    </div>
                </div>

                <div style={styles.card}>
                    <h2 style={styles.cardTitle}>Associate Automation Rules (Optional)</h2>
                    <div style={styles.ruleSection}>
                        {(['BID_ADJUSTMENT', 'SEARCH_TERM_AUTOMATION', 'SEARCH_TERM_HARVESTING', 'BUDGET_ACCELERATION'] as const).map(type => (
                            <div key={type} style={styles.ruleListContainer}>
                                <label style={styles.label}>{type.replace(/_/g, ' ')} Rules</label>
                                <div style={styles.ruleList}>
                                    {(categorizedRules[type] || []).map(rule => (
                                        <div key={rule.id} style={styles.ruleCheckboxItem}>
                                            <input type="checkbox" id={`rule-${rule.id}`} checked={selectedRuleIds.has(rule.id)} onChange={() => handleRuleSelection(rule.id)} />
                                            <label htmlFor={`rule-${rule.id}`} style={styles.ruleCheckboxLabel} title={rule.name}>{rule.name}</label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={styles.buttonContainer}>
                    <button type="submit" style={loading ? { ...styles.button, ...styles.buttonDisabled } : styles.button} disabled={loading}>
                        {loading ? 'Creating...' : 'Create Campaign'}
                    </button>
                </div>
            </form>

            {statusMessage && (
                <div style={{...styles.message, ...(statusMessage.type === 'success' ? styles.successMessage : styles.errorMessage)}}>
                    {statusMessage.text}
                </div>
            )}
        </div>
    );
}
