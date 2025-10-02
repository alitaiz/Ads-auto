// views/CreateAdsView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AutomationRule } from '../types';

interface CampaignCreationRule {
    id: number;
    name: string;
    is_active: boolean;
    frequency: {
        unit: 'days' | 'weeks' | 'months';
        value: number;
    };
    creation_parameters: {
        asin: string;
        budget: number;
        defaultBid: number;
    };
    associated_rule_ids: number[];
}

const styles: { [key: string]: React.CSSProperties } = {
    container: { maxWidth: '900px', margin: '40px auto', padding: '0 20px' },
    title: { fontSize: '2rem', marginBottom: '30px', textAlign: 'center' },
    form: { display: 'flex', flexDirection: 'column', gap: '30px' },
    card: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '25px' },
    cardTitle: { fontSize: '1.2rem', fontWeight: 600, margin: '0 0 20px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' },
    formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
    label: { fontWeight: 500 },
    input: { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem' },
    
    // Accordion Styles
    accordionSection: { border: '1px solid var(--border-color)', borderRadius: '4px', marginBottom: '10px', overflow: 'hidden' },
    accordionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 15px', cursor: 'pointer', backgroundColor: '#f8f9fa' },
    accordionTitle: { fontWeight: 600, margin: 0 },
    accordionSummary: { color: '#666', fontSize: '0.9rem' },
    accordionContent: { padding: '15px' },
    ruleList: { maxHeight: '150px', overflowY: 'auto', padding: '5px' },
    ruleCheckboxItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0' },
    ruleCheckboxLabel: { fontWeight: 'normal', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },

    buttonContainer: { display: 'flex', justifyContent: 'flex-end', marginTop: '10px' },
    button: { padding: '12px 25px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' },
    buttonDisabled: { backgroundColor: 'var(--primary-hover-color)', cursor: 'not-allowed' },
    message: { padding: '15px', borderRadius: '4px', marginTop: '20px', textAlign: 'center' },
    successMessage: { backgroundColor: '#d4edda', color: '#155724', border: '1px solid #c3e6cb' },
    errorMessage: { backgroundColor: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb' },

    // Schedule Styles
    scheduleToggle: { display: 'flex', alignItems: 'center', gap: '10px' },
    scheduleGrid: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '20px', alignItems: 'center' },
    frequencyControls: { display: 'flex', alignItems: 'center', gap: '10px' },
    
    // Scheduled Rules List Styles
    listTable: { width: '100%', borderCollapse: 'collapse', marginTop: '10px' },
    th: { textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border-color)' },
    td: { padding: '8px', borderBottom: '1px solid var(--border-color)', verticalAlign: 'middle' },
    actionCell: { display: 'flex', gap: '10px' },
    deleteButton: { color: 'var(--danger-color)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }
};

export function CreateAdsView() {
    // Form state
    const [asin, setAsin] = useState('');
    const [budget, setBudget] = useState('10');
    const [defaultBid, setDefaultBid] = useState('0.75');
    const [allRules, setAllRules] = useState<AutomationRule[]>([]);
    const [selectedRuleIds, setSelectedRuleIds] = useState<Set<number>>(new Set());
    
    // Schedule state
    const [isScheduling, setIsScheduling] = useState(false);
    const [scheduleName, setScheduleName] = useState('');
    const [frequency, setFrequency] = useState({ value: 7, unit: 'days' as 'days' | 'weeks' });
    const [scheduledCreations, setScheduledCreations] = useState<CampaignCreationRule[]>([]);

    // UI State
    const [loading, setLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [openRuleSections, setOpenRuleSections] = useState<Set<string>>(new Set(['BID_ADJUSTMENT']));

    const profileId = useMemo(() => localStorage.getItem('selectedProfileId'), []);
    
    const fetchAllData = useCallback(async () => {
        if (!profileId) return;
        try {
            // Fetch optimization rules from the correct endpoint, which is just /api/automation/rules
            const rulesRes = await fetch('/api/automation/rules');
            if (rulesRes.ok) {
                const allRules: AutomationRule[] = await rulesRes.json();
                // Filter rules by the current profileId on the client-side
                setAllRules(allRules.filter(rule => rule.profile_id === profileId));
            }

            // Fetch scheduled creation rules
            const schedulesRes = await fetch(`/api/automation/campaign-creation-rules?profileId=${profileId}`);
            if (schedulesRes.ok) setScheduledCreations(await schedulesRes.json());

        } catch (err) {
            console.error("Failed to fetch data:", err);
            setStatusMessage({ type: 'error', text: 'Failed to load initial data. Please refresh the page.' });
        }
    }, [profileId]);


    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    const categorizedRules = useMemo(() => {
        return allRules.reduce((acc, rule) => {
            const type = rule.rule_type;
            if (!acc[type]) acc[type] = [];
            acc[type].push(rule);
            return acc;
        }, {} as Record<string, AutomationRule[]>);
    }, [allRules]);

    const toggleRuleSection = (section: string) => {
        setOpenRuleSections(prev => {
            const newSet = new Set(prev);
            if (newSet.has(section)) newSet.delete(section);
            else newSet.add(section);
            return newSet;
        });
    };

    const handleRuleSelection = (ruleId: number) => {
        setSelectedRuleIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(ruleId)) newSet.delete(ruleId);
            else newSet.add(ruleId);
            return newSet;
        });
    };
    
    const handleDeleteSchedule = async (id: number) => {
        if (!window.confirm("Are you sure you want to delete this scheduled creation?")) return;
        try {
             const response = await fetch(`/api/automation/campaign-creation-rules/${id}`, { method: 'DELETE' });
             if (!response.ok) throw new Error('Failed to delete.');
             fetchAllData(); // Refresh list
        } catch (err) {
             setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to delete schedule.' });
        }
    };
    
    const handleToggleScheduleActive = async (schedule: CampaignCreationRule) => {
        try {
            const response = await fetch(`/api/automation/campaign-creation-rules/${schedule.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !schedule.is_active })
            });
            if (!response.ok) throw new Error('Failed to update status.');
            fetchAllData();
        } catch(err) {
            setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update schedule status.' });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setStatusMessage(null);
        
        if (!profileId) {
            setStatusMessage({ type: 'error', text: 'No profile selected. Please select a profile from the PPC Management page.' });
            setLoading(false);
            return;
        }

        try {
            let response;
            if (isScheduling) {
                // Save as a new scheduled rule
                const schedulePayload = {
                    name: scheduleName,
                    profile_id: profileId,
                    is_active: true,
                    frequency: frequency,
                    creation_parameters: { asin, budget: parseFloat(budget), defaultBid: parseFloat(defaultBid) },
                    associated_rule_ids: Array.from(selectedRuleIds)
                };
                response = await fetch('/api/automation/campaign-creation-rules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(schedulePayload),
                });
            } else {
                // Create a one-time campaign
                response = await fetch('/api/amazon/create-auto-campaign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        profileId, asin, budget: parseFloat(budget),
                        defaultBid: parseFloat(defaultBid), ruleIds: Array.from(selectedRuleIds),
                    }),
                });
            }

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || 'An unknown error occurred.');
            }
            
            if (isScheduling) {
                setStatusMessage({ type: 'success', text: `Successfully created schedule "${result.name}".` });
                fetchAllData(); // Refresh the list of schedules
            } else {
                 setStatusMessage({ type: 'success', text: `Successfully created campaign "${result.campaignName}" and associated ${result.rulesAssociated} rules.` });
            }

            // Reset form
            setAsin('');
            setSelectedRuleIds(new Set());
            setScheduleName('');
            setIsScheduling(false);
        } catch (err) {
            setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Operation failed.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.container}>
            <h1 style={styles.title}>Create & Schedule Auto Campaigns</h1>
            
            {/* Scheduled Creations List */}
            <div style={{...styles.card, marginBottom: '30px'}}>
                 <h2 style={styles.cardTitle}>Scheduled Creations</h2>
                 {scheduledCreations.length > 0 ? (
                    <table style={styles.listTable}>
                        <thead><tr>
                            <th style={styles.th}>Status</th><th style={styles.th}>Name</th><th style={styles.th}>ASIN</th>
                            <th style={styles.th}>Frequency</th><th style={styles.th}>Actions</th>
                        </tr></thead>
                        <tbody>
                            {scheduledCreations.map(s => (
                                <tr key={s.id}>
                                    <td style={styles.td}>
                                        <label style={styles.scheduleToggle}>
                                            <input type="checkbox" checked={s.is_active} onChange={() => handleToggleScheduleActive(s)} />
                                            {s.is_active ? 'Active' : 'Paused'}
                                        </label>
                                    </td>
                                    <td style={styles.td}>{s.name}</td>
                                    <td style={styles.td}>{s.creation_parameters.asin}</td>
                                    <td style={styles.td}>Every {s.frequency.value} {s.frequency.unit}</td>
                                    <td style={{...styles.td, ...styles.actionCell}}>
                                        <button style={styles.deleteButton} onClick={() => handleDeleteSchedule(s.id)} title="Delete Schedule">&times;</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 ) : (
                    <p style={{color: '#666'}}>No scheduled creations found. Create one below.</p>
                 )}
            </div>

            <form style={styles.form} onSubmit={handleSubmit}>
                <div style={styles.card}>
                    <h2 style={styles.cardTitle}>Step 1: Campaign Details</h2>
                    <div style={styles.formGrid}>
                        <div style={styles.formGroup}><label style={styles.label} htmlFor="asin">Product ASIN</label><input id="asin" style={styles.input} value={asin} onChange={e => setAsin(e.target.value.toUpperCase())} placeholder="B0..." required /></div><div />
                        <div style={styles.formGroup}><label style={styles.label} htmlFor="budget">Daily Budget ($)</label><input id="budget" type="number" step="0.01" min="1" style={styles.input} value={budget} onChange={e => setBudget(e.target.value)} required /></div>
                        <div style={styles.formGroup}><label style={styles.label} htmlFor="defaultBid">Default Ad Group Bid ($)</label><input id="defaultBid" type="number" step="0.01" min="0.02" style={styles.input} value={defaultBid} onChange={e => setDefaultBid(e.target.value)} required /></div>
                    </div>
                </div>

                <div style={styles.card}>
                    <h2 style={styles.cardTitle}>Step 2: Associate Automation Rules (Optional)</h2>
                    {Object.entries(categorizedRules).map(([type, rules]) => {
                         const selectedCount = rules.filter(r => selectedRuleIds.has(r.id)).length;
                         return (
                            <div key={type} style={styles.accordionSection}>
                                <div style={styles.accordionHeader} onClick={() => toggleRuleSection(type)}>
                                    <h3 style={styles.accordionTitle}>{type.replace(/_/g, ' ')}</h3>
                                    <span style={styles.accordionSummary}>{selectedCount} / {rules.length} selected</span>
                                </div>
                                {openRuleSections.has(type) && (
                                    <div style={styles.accordionContent}>
                                        <div style={styles.ruleList}>
                                            {rules.map(rule => (
                                                <div key={rule.id} style={styles.ruleCheckboxItem}>
                                                    <input type="checkbox" id={`rule-${rule.id}`} checked={selectedRuleIds.has(rule.id)} onChange={() => handleRuleSelection(rule.id)} />
                                                    <label htmlFor={`rule-${rule.id}`} style={styles.ruleCheckboxLabel} title={rule.name}>{rule.name}</label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div style={styles.card}>
                    <h2 style={styles.cardTitle}>Step 3: Schedule Creation (Optional)</h2>
                    <div style={styles.scheduleToggle}>
                        <label className="switch">
                            <input type="checkbox" checked={isScheduling} onChange={e => setIsScheduling(e.target.checked)} />
                            <span className="slider round"></span>
                        </label>
                        <label>Turn this into a recurring scheduled creation</label>
                    </div>
                    {isScheduling && (
                        <div style={{ ...styles.scheduleGrid, marginTop: '20px' }}>
                            <div style={styles.formGroup}>
                                <label style={styles.label} htmlFor="scheduleName">Schedule Name</label>
                                <input id="scheduleName" style={styles.input} value={scheduleName} onChange={e => setScheduleName(e.target.value)} placeholder="e.g., Weekly New Auto for ASIN..." required={isScheduling} />
                            </div>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Frequency</label>
                                <div style={styles.frequencyControls}>
                                    <span>Every</span>
                                    <input type="number" min="1" style={{ ...styles.input, width: '70px' }} value={frequency.value} onChange={e => setFrequency(p => ({ ...p, value: parseInt(e.target.value, 10) || 1 }))} />
                                    <select style={styles.input} value={frequency.unit} onChange={e => setFrequency(p => ({ ...p, unit: e.target.value as any }))}>
                                        <option value="days">Days</option>
                                        <option value="weeks">Weeks</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div style={styles.buttonContainer}>
                    <button type="submit" style={loading ? { ...styles.button, ...styles.buttonDisabled } : styles.button} disabled={loading}>
                        {loading ? 'Submitting...' : isScheduling ? 'Save Schedule' : 'Create Campaign Now'}
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
