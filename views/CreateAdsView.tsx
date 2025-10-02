// views/CreateAdsView.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AutomationRule } from '../types';

// Enhanced styles to support the new management list and toggle switch
const styles: { [key: string]: React.CSSProperties } = {
    container: { maxWidth: '900px', margin: '40px auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '30px' },
    title: { fontSize: '2rem', marginBottom: '10px', textAlign: 'center' },
    form: { display: 'flex', flexDirection: 'column', gap: '30px' },
    card: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '25px' },
    cardTitle: { fontSize: '1.2rem', fontWeight: 600, margin: '0 0 20px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' },
    formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
    biddingGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
    label: { fontWeight: 500 },
    input: { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem' },
    
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

    scheduleToggleContainer: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' },
    scheduleGrid: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '20px', alignItems: 'center' },
    frequencyControls: { display: 'flex', alignItems: 'center', gap: '10px' },
    
    // Schedule Management List Styles
    scheduleTable: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
    scheduleTh: { padding: '10px 15px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', backgroundColor: '#f8f9fa', fontWeight: 600 },
    scheduleTd: { padding: '10px 15px', borderBottom: '1px solid var(--border-color)', verticalAlign: 'middle' },
    actionCell: { display: 'flex', alignItems: 'center', gap: '15px' },
    deleteButton: { background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', fontSize: '1.2rem' },
    
    // Tab styles
    tabsContainer: { display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '30px' },
    tabButton: { padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 500, color: '#555', borderBottom: '3px solid transparent' },
    tabButtonActive: { color: 'var(--primary-color)', borderBottom: '3px solid var(--primary-color)' },
    
    explanationText: {
        fontSize: '0.9rem',
        color: '#666',
        backgroundColor: '#f8f9fa',
        padding: '10px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        margin: '-10px 0 20px 0'
    }
};

interface CampaignCreationRule {
    id: number;
    name: string;
    is_active: boolean;
    frequency: { value: number; unit: 'days' | 'weeks'; startTime: string; };
    creation_parameters: {
        asin: string;
        budget: number;
        defaultBid: number;
        placementBids: { top: number; rest: number; product: number; };
    };
}

export function CreateAdsView() {
    const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');
    const [loading, setLoading] = useState({ form: false, schedules: true });
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [openRuleSections, setOpenRuleSections] = useState<Set<string>>(new Set(['BID_ADJUSTMENT']));
    
    // Form state (used in Create tab)
    const [asin, setAsin] = useState('');
    const [budget, setBudget] = useState('10');
    const [defaultBid, setDefaultBid] = useState('0.75');
    const [placementBids, setPlacementBids] = useState({ top: 50, rest: 0, product: 0 });
    const [allRules, setAllRules] = useState<AutomationRule[]>([]);
    const [selectedRuleIds, setSelectedRuleIds] = useState<Set<number>>(new Set());
    const [isScheduled, setIsScheduled] = useState(false);
    const [scheduleName, setScheduleName] = useState('');
    const [frequency, setFrequency] = useState({ value: 7, unit: 'days' as 'days' | 'weeks', startTime: '01:00' });
    
    // Management state (used in Manage tab)
    const [schedules, setSchedules] = useState<CampaignCreationRule[]>([]);

    const profileId = useMemo(() => localStorage.getItem('selectedProfileId'), []);
    
    const fetchSchedulesAndRules = useCallback(async () => {
        if (!profileId) {
             setLoading({ form: false, schedules: false });
             return;
        };
        setLoading(prev => ({ ...prev, schedules: true }));
        try {
            const [rulesRes, schedulesRes] = await Promise.all([
                fetch('/api/automation/rules'),
                fetch(`/api/automation/campaign-creation-rules?profileId=${profileId}`)
            ]);
            
            if (rulesRes.ok) setAllRules((await rulesRes.json()).filter((r: AutomationRule) => r.profile_id === profileId));
            if (schedulesRes.ok) setSchedules(await schedulesRes.json()); else throw new Error('Failed to load schedules.');
        } catch (err) {
            console.error("Failed to fetch data:", err);
            setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load data. Please refresh.' });
        } finally {
             setLoading(prev => ({ ...prev, schedules: false }));
        }
    }, [profileId]);

    useEffect(() => {
        fetchSchedulesAndRules();
    }, [fetchSchedulesAndRules]);

    const categorizedRules = useMemo(() => allRules.reduce((acc, rule) => {
        if (rule.rule_type !== 'PRICE_ADJUSTMENT') {
            if (!acc[rule.rule_type]) acc[rule.rule_type] = [];
            acc[rule.rule_type].push(rule);
        }
        return acc;
    }, {} as Record<string, AutomationRule[]>), [allRules]);

    const toggleRuleSection = (section: string) => setOpenRuleSections(prev => { const s = new Set(prev); s.has(section) ? s.delete(section) : s.add(section); return s; });
    const handleRuleSelection = (ruleId: number) => setSelectedRuleIds(prev => { const s = new Set(prev); s.has(ruleId) ? s.delete(ruleId) : s.add(ruleId); return s; });

    const handleScheduleStatusToggle = async (schedule: CampaignCreationRule) => {
        const updatedSchedule = { ...schedule, is_active: !schedule.is_active };
        setSchedules(prev => prev.map(s => s.id === schedule.id ? updatedSchedule : s));
        try {
            const response = await fetch(`/api/automation/campaign-creation-rules/${schedule.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: updatedSchedule.is_active }) });
            if (!response.ok) throw new Error('Failed to update schedule status.');
        } catch (err) {
            setSchedules(prev => prev.map(s => s.id === schedule.id ? schedule : s));
            setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Update failed.' });
        }
    };
    
    const handleScheduleDelete = async (scheduleId: number) => {
        if (!window.confirm('Are you sure you want to delete this schedule permanently?')) return;
        setSchedules(prev => prev.filter(s => s.id !== scheduleId));
        try {
            const response = await fetch(`/api/automation/campaign-creation-rules/${scheduleId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete schedule.');
        } catch (err) {
            setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Delete failed.' });
            fetchSchedulesAndRules();
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(prev => ({ ...prev, form: true }));
        setStatusMessage(null);
        
        if (!profileId) {
            setStatusMessage({ type: 'error', text: 'No profile selected. Please select a profile from the PPC Management page.' });
            setLoading(prev => ({ ...prev, form: false }));
            return;
        }

        try {
            const commonPayload = { asin, budget: parseFloat(budget), defaultBid: parseFloat(defaultBid), placementBids };
            let response;

            if (isScheduled) {
                const schedulePayload = { name: scheduleName, profile_id: profileId, is_active: true, frequency, creation_parameters: commonPayload, associated_rule_ids: Array.from(selectedRuleIds) };
                response = await fetch('/api/automation/campaign-creation-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(schedulePayload) });
            } else {
                const immediatePayload = { profileId, ...commonPayload, ruleIds: Array.from(selectedRuleIds) };
                response = await fetch('/api/amazon/create-auto-campaign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(immediatePayload) });
            }

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'An unknown error occurred.');
            
            setStatusMessage({ type: 'success', text: isScheduled ? `Successfully created schedule "${result.name}". You can manage it in the 'Manage' tab.` : `Successfully created ${result.createdCampaigns.length} campaigns.` });
            if (isScheduled) fetchSchedulesAndRules();

            setAsin(''); setSelectedRuleIds(new Set()); setScheduleName(''); setIsScheduled(false);
        } catch (err) {
            setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Operation failed.' });
        } finally {
            setLoading(prev => ({ ...prev, form: false }));
        }
    };
    
    const formatFrequency = (rule: CampaignCreationRule) => `Every ${rule.frequency.value} ${rule.frequency.unit} at ${rule.frequency.startTime} (UTC-7)`;

    const renderCreateSetForm = () => (
        <form style={styles.form} onSubmit={handleSubmit}>
            <div style={styles.card}>
                <h2 style={styles.cardTitle}>Step 1: Campaign Details</h2>
                <div style={styles.formGrid}>
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="asin">Product ASIN</label><input id="asin" style={styles.input} value={asin} onChange={e => setAsin(e.target.value.toUpperCase())} placeholder="B0..." required /></div><div />
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="budget">Daily Budget (per campaign)</label><input id="budget" type="number" step="0.01" min="1" style={styles.input} value={budget} onChange={e => setBudget(e.target.value)} required /></div>
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="defaultBid">Default Ad Group Bid ($)</label><input id="defaultBid" type="number" step="0.01" min="0.02" style={styles.input} value={defaultBid} onChange={e => setDefaultBid(e.target.value)} required /></div>
                </div>
            </div>
            <div style={styles.card}>
                <h2 style={styles.cardTitle}>Step 2: Bidding Strategy by Placement</h2>
                <p style={styles.explanationText}>
                    This setting controls the bid boost for each of the 12 campaigns. For example, the four campaigns targeting 'Top of search' will use the value you enter here for their 'Top of search' bid adjustment, while their other placement bids will be set to 0%. This isolates performance by placement.
                </p>
                <div style={styles.biddingGrid}>
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="placementTop">Top of search (%)</label><input id="placementTop" type="number" min="0" max="900" style={styles.input} value={placementBids.top} onChange={e => setPlacementBids(p => ({ ...p, top: parseInt(e.target.value, 10) || 0 }))} /></div>
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="placementRest">Rest of search (%)</label><input id="placementRest" type="number" min="0" max="900" style={styles.input} value={placementBids.rest} onChange={e => setPlacementBids(p => ({ ...p, rest: parseInt(e.target.value, 10) || 0 }))} /></div>
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="placementProduct">Product pages (%)</label><input id="placementProduct" type="number" min="0" max="900" style={styles.input} value={placementBids.product} onChange={e => setPlacementBids(p => ({ ...p, product: parseInt(e.target.value, 10) || 0 }))} /></div>
                </div>
            </div>
            {renderRuleAssociation()}
            <div style={styles.card}>
                <h2 style={styles.cardTitle}>Step 4: Schedule Creation (Optional)</h2>
                <div style={styles.scheduleToggleContainer}>
                    <label className="switch"><input type="checkbox" checked={isScheduled} onChange={e => setIsScheduled(e.target.checked)} /><span className="slider round"></span></label>
                    <label style={{ fontWeight: 500, cursor: 'pointer' }} onClick={() => setIsScheduled(!isScheduled)}>Turn this into a recurring schedule</label>
                </div>
                {isScheduled && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '20px'}}>
                        <div style={styles.formGroup}>
                            <label style={styles.label} htmlFor="scheduleName">Schedule Name</label>
                            <input id="scheduleName" style={styles.input} value={scheduleName} onChange={e => setScheduleName(e.target.value)} placeholder="e.g., Weekly New Auto Set for..." required={isScheduled} />
                        </div>
                        <div style={styles.scheduleGrid}>
                            <div style={styles.formGroup}><label style={styles.label}>Frequency</label><div style={styles.frequencyControls}><span>Every</span><input type="number" min="1" style={{ ...styles.input, width: '70px' }} value={frequency.value} onChange={e => setFrequency(p => ({ ...p, value: parseInt(e.target.value, 10) || 1 }))} /><select style={styles.input} value={frequency.unit} onChange={e => setFrequency(p => ({ ...p, unit: e.target.value as any }))}><option value="days">Days</option><option value="weeks">Weeks</option></select></div></div>
                            <div style={styles.formGroup}><label style={styles.label}>Time (UTC-7)</label><input type="time" style={styles.input} value={frequency.startTime} onChange={e => setFrequency(p => ({ ...p, startTime: e.target.value }))} required={isScheduled} /></div>
                        </div>
                    </div>
                )}
            </div>
            <div style={styles.buttonContainer}>
                <button type="submit" style={loading.form ? { ...styles.button, ...styles.buttonDisabled } : styles.button} disabled={loading.form}>
                    {loading.form ? 'Submitting...' : isScheduled ? 'Create & Schedule' : 'Create Campaign Set'}
                </button>
            </div>
        </form>
    );

    const renderManageSchedules = () => (
        <div style={styles.card}>
            <h2 style={styles.cardTitle}>Existing Schedules</h2>
            {loading.schedules ? <p>Loading schedules...</p> : schedules.length > 0 ? (
                <div style={{overflowX: 'auto'}}>
                    <table style={styles.scheduleTable}>
                        <thead><tr>
                            <th style={styles.scheduleTh}>Status</th><th style={styles.scheduleTh}>Schedule Name</th>
                            <th style={styles.scheduleTh}>Target ASIN</th><th style={styles.scheduleTh}>Frequency</th><th style={styles.scheduleTh}>Actions</th>
                        </tr></thead>
                        <tbody>{schedules.map(schedule => (
                            <tr key={schedule.id}>
                                <td style={styles.scheduleTd}><label className="switch"><input type="checkbox" checked={schedule.is_active} onChange={() => handleScheduleStatusToggle(schedule)} /><span className="slider round"></span></label></td>
                                <td style={styles.scheduleTd} title={schedule.name}>{schedule.name}</td>
                                <td style={styles.scheduleTd}>{schedule.creation_parameters.asin}</td>
                                <td style={styles.scheduleTd}>{formatFrequency(schedule)}</td>
                                <td style={{...styles.scheduleTd, ...styles.actionCell}}><button style={styles.deleteButton} title="Delete Schedule" onClick={() => handleScheduleDelete(schedule.id)}>🗑️</button></td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            ) : <p style={{color: '#666'}}>You have no scheduled campaign creations.</p>}
        </div>
    );

    const renderRuleAssociation = () => (
         <div style={styles.card}>
            <h2 style={styles.cardTitle}>Step 3: Associate Automation Rules (Optional)</h2>
            {Object.entries(categorizedRules).map(([type, rules]) => {
                const selectedCount = rules.filter(r => selectedRuleIds.has(r.id)).length;
                return (
                <div key={type} style={styles.accordionSection}>
                    <div style={styles.accordionHeader} onClick={() => toggleRuleSection(type)}>
                        <h3 style={styles.accordionTitle}>{type.replace(/_/g, ' ')}</h3>
                        <span style={styles.accordionSummary}>{selectedCount} / {rules.length} selected</span>
                    </div>
                    {openRuleSections.has(type) && (
                        <div style={styles.accordionContent}><div style={styles.ruleList}>
                            {rules.map(rule => (
                                <div key={rule.id} style={styles.ruleCheckboxItem}>
                                    <input type="checkbox" id={`rule-${rule.id}`} checked={selectedRuleIds.has(rule.id)} onChange={() => handleRuleSelection(rule.id)} />
                                    <label htmlFor={`rule-${rule.id}`} style={styles.ruleCheckboxLabel} title={rule.name}>{rule.name}</label>
                                </div>
                            ))}
                        </div></div>
                    )}
                </div>);
            })}
        </div>
    );

    return (
        <div style={styles.container}>
            <h1 style={styles.title}>Create & Schedule Auto Campaigns</h1>
            <div style={styles.tabsContainer}>
                <button style={activeTab === 'create' ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton} onClick={() => setActiveTab('create')}>Create Campaign Set</button>
                <button style={activeTab === 'manage' ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton} onClick={() => setActiveTab('manage')}>Manage Schedules</button>
            </div>
            
            {statusMessage && <div style={{...styles.message, ...(statusMessage.type === 'success' ? styles.successMessage : styles.errorMessage)}}>{statusMessage.text}</div>}

            {activeTab === 'create' ? renderCreateSetForm() : renderManageSchedules()}
        </div>
    );
}