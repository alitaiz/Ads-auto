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
    actionButton: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' },
    
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
    },
    modalBackdrop: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1050 },
    modalContent: { backgroundColor: 'white', padding: '30px', borderRadius: 'var(--border-radius)', width: '90%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '80vh' },
    modalHeader: { fontSize: '1.5rem', margin: 0, paddingBottom: '10px', borderBottom: '1px solid var(--border-color)' },
    modalBody: { overflowY: 'auto' },
    modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' },
     // Manual Campaign Specific Styles
    manualTextarea: { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem', fontFamily: 'monospace', minHeight: '200px', resize: 'vertical' },
    checkboxGroup: { display: 'flex', gap: '20px', alignItems: 'center' },
    checkboxLabel: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' },
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
    associated_rule_ids: (number | string)[];
}

const initialAutoFormState: Partial<CampaignCreationRule> & { name: string; is_active: boolean } = {
    id: undefined,
    name: '',
    is_active: true,
    frequency: { value: 7, unit: 'days', startTime: '01:00' },
    creation_parameters: {
        asin: '',
        budget: 10,
        defaultBid: 0.75,
        placementBids: { top: 50, rest: 0, product: 0 },
    },
    associated_rule_ids: []
};

// New state for the manual campaign form
const initialManualFormState = {
    asin: '',
    budget: 10,
    defaultBid: 0.75,
    searchTerms: '',
    maxKeywords: 5,
    matchTypes: { broad: true, phrase: false, exact: false },
    negativeSearchTerms: '',
    negativeMatchTypes: { exact: true, phrase: false },
    placementBids: { top: 50, rest: 0, product: 0 },
    associatedRuleIds: [] as (number | string)[]
};

type ActiveTab = 'manual' | 'autoSet' | 'manage';

export function CreateAdsView() {
    const [activeTab, setActiveTab] = useState<ActiveTab>('manual');
    const [loading, setLoading] = useState({ form: false, schedules: true });
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [openRuleSections, setOpenRuleSections] = useState<Set<string>>(new Set(['BID_ADJUSTMENT']));
    
    // Unified form state
    const [autoFormData, setAutoFormData] = useState(initialAutoFormState);
    const [manualFormData, setManualFormData] = useState(initialManualFormState);
    const [isScheduled, setIsScheduled] = useState(false);
    
    // Data state
    const [allRules, setAllRules] = useState<AutomationRule[]>([]);
    const [schedules, setSchedules] = useState<CampaignCreationRule[]>([]);
    
    // History Modal State
    const [historyModal, setHistoryModal] = useState<{ isOpen: boolean; schedule: CampaignCreationRule | null; logs: any[]; loading: boolean }>({ isOpen: false, schedule: null, logs: [], loading: false });

    const profileId = useMemo(() => localStorage.getItem('selectedProfileId'), []);

    // Effect to inject CSS for the toggle switch
    useEffect(() => {
        const styleId = 'create-ads-view-toggle-styles';
        if (document.getElementById(styleId)) return; // Don't add styles if they already exist

        const styleSheet = document.createElement("style");
        styleSheet.id = styleId;
        styleSheet.innerText = `
          .switch {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 28px;
          }
          .switch input {
            opacity: 0;
            width: 0;
            height: 0;
          }
          .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
          }
          .slider:before {
            position: absolute;
            content: "";
            height: 20px;
            width: 20px;
            left: 4px;
            bottom: 4px;
            background-color: white;
            transition: .4s;
          }
          input:checked + .slider {
            background-color: var(--success-color, #28a745);
          }
          input:focus + .slider {
            box-shadow: 0 0 1px var(--primary-color, #007185);
          }
          input:checked + .slider:before {
            transform: translateX(22px);
          }
          .slider.round {
            border-radius: 28px;
          }
          .slider.round:before {
            border-radius: 50%;
          }
        `;
        document.head.appendChild(styleSheet);

        return () => {
            const styleElement = document.getElementById(styleId);
            if (styleElement) {
                document.head.removeChild(styleElement);
            }
        };
    }, []);
    
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
    const handleRuleSelection = (ruleId: number) => {
        if (activeTab === 'autoSet') {
            setAutoFormData(prev => ({ ...prev, associated_rule_ids: (prev.associated_rule_ids || []).includes(ruleId) ? (prev.associated_rule_ids || []).filter(id => id !== ruleId) : [...(prev.associated_rule_ids || []), ruleId] }));
        } else if (activeTab === 'manual') {
            setManualFormData(prev => ({ ...prev, associatedRuleIds: prev.associatedRuleIds.includes(ruleId) ? prev.associatedRuleIds.filter(id => id !== ruleId) : [...prev.associatedRuleIds, ruleId] }));
        }
    };
    
    const handleEditSchedule = (schedule: CampaignCreationRule) => {
        setAutoFormData({ ...schedule });
        setIsScheduled(true);
        setActiveTab('autoSet');
    };

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
    
    const handleViewHistory = async (schedule: CampaignCreationRule) => {
        setHistoryModal({ isOpen: true, schedule, logs: [], loading: true });
        try {
            const res = await fetch(`/api/automation/campaign-creation-rules/${schedule.id}/history`);
            if (!res.ok) throw new Error('Failed to load history.');
            const logs = await res.json();
            setHistoryModal(prev => ({ ...prev, logs, loading: false }));
        } catch (err) {
            console.error("History fetch error", err);
            setHistoryModal(prev => ({...prev, loading: false, logs: [{ status: 'ERROR', summary: 'Could not load history.' }] }));
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
            let response;
            if (activeTab === 'manual') {
                 const selectedMatchTypes = Object.entries(manualFormData.matchTypes)
                    .filter(([, isSelected]) => isSelected)
                    .map(([type]) => type);
                if (selectedMatchTypes.length === 0) throw new Error("Please select at least one positive match type.");
                
                const selectedNegativeMatchTypes = Object.entries(manualFormData.negativeMatchTypes)
                    .filter(([, isSelected]) => isSelected)
                    .map(([type]) => type);

                const immediatePayload = {
                    profileId,
                    ...manualFormData,
                    matchTypes: selectedMatchTypes,
                    negativeMatchTypes: selectedNegativeMatchTypes,
                    ruleIds: manualFormData.associatedRuleIds
                };
                response = await fetch('/api/amazon/create-manual-campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(immediatePayload) });
            } else if (isScheduled) {
                const { id, ...payload } = autoFormData;
                const url = id ? `/api/automation/campaign-creation-rules/${id}` : '/api/automation/campaign-creation-rules';
                const method = id ? 'PUT' : 'POST';
                const finalPayload = id ? payload : { ...payload, profile_id: profileId };
                response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(finalPayload) });
            } else { // Immediate auto campaign set creation
                const immediatePayload = {
                    profileId,
                    asin: autoFormData.creation_parameters.asin,
                    budget: autoFormData.creation_parameters.budget,
                    defaultBid: autoFormData.creation_parameters.defaultBid,
                    placementBids: autoFormData.creation_parameters.placementBids,
                    ruleIds: autoFormData.associated_rule_ids || []
                };
                response = await fetch('/api/amazon/create-auto-campaign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(immediatePayload) });
            }

            const result = await response.json();
            if (!response.ok) throw new Error(result.message || result.error || 'An unknown error occurred.');
            
            let successText = '';
            if (activeTab === 'manual') {
                successText = `Successfully created ${result.createdCampaigns.length} manual campaigns.`;
            } else if (isScheduled) {
                successText = autoFormData.id ? `Successfully updated schedule "${result.name}".` : `Successfully created schedule "${result.name}".`;
            } else {
                successText = `Successfully created ${result.createdCampaigns.length} campaigns.`;
            }

            setStatusMessage({ type: 'success', text: successText });
            
            if (isScheduled) {
                 fetchSchedulesAndRules();
                 setActiveTab('manage');
            }

            setAutoFormData(initialAutoFormState);
            setManualFormData(initialManualFormState);
            setIsScheduled(false);
        } catch (err) {
            setStatusMessage({ type: 'error', text: err instanceof Error ? err.message : 'Operation failed.' });
        } finally {
            setLoading(prev => ({ ...prev, form: false }));
        }
    };
    
    const formatFrequency = (rule: CampaignCreationRule) => `Every ${rule.frequency.value} ${rule.frequency.unit} at ${rule.frequency.startTime} (UTC-7)`;

    const handleAutoFormValueChange = (path: string, value: any) => {
        setAutoFormData(prev => {
            const keys = path.split('.');
            let current = { ...prev };
            let temp = current as any;
            for (let i = 0; i < keys.length - 1; i++) {
                temp = temp[keys[i]];
            }
            temp[keys[keys.length - 1]] = value;
            return current;
        });
    };
    
    const handleManualFormValueChange = (field: string, value: any) => {
        setManualFormData(prev => ({ ...prev, [field]: value }));
    };

    const renderRuleAssociation = () => (
         <div style={styles.card}>
            <h2 style={styles.cardTitle}>Step {activeTab === 'manual' ? 5 : 4}: Associate Automation Rules (Optional)</h2>
            {Object.entries(categorizedRules).map(([type, rules]) => {
                const ruleIds = activeTab === 'manual' ? manualFormData.associatedRuleIds : (autoFormData.associated_rule_ids || []);
                const selectedCount = rules.filter(r => ruleIds.includes(r.id)).length;
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
                                    <input type="checkbox" id={`rule-${rule.id}`} checked={ruleIds.includes(rule.id)} onChange={() => handleRuleSelection(rule.id)} />
                                    <label htmlFor={`rule-${rule.id}`} style={styles.ruleCheckboxLabel} title={rule.name}>{rule.name}</label>
                                </div>
                            ))}
                        </div></div>
                    )}
                </div>);
            })}
        </div>
    );
    
    const renderCreateAutoSetForm = () => (
        <form style={styles.form} onSubmit={handleSubmit}>
            <div style={styles.card}>
                <h2 style={styles.cardTitle}>Step 1: Campaign Details</h2>
                <div style={styles.formGrid}>
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="asin">Product ASIN</label><input id="asin" style={styles.input} value={autoFormData.creation_parameters.asin} onChange={e => handleAutoFormValueChange('creation_parameters.asin', e.target.value.toUpperCase())} placeholder="B0..." required /></div><div />
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="budget">Daily Budget (per campaign)</label><input id="budget" type="number" step="0.01" min="1" style={styles.input} value={autoFormData.creation_parameters.budget} onChange={e => handleAutoFormValueChange('creation_parameters.budget', Number(e.target.value))} required /></div>
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="defaultBid">Default Ad Group Bid ($)</label><input id="defaultBid" type="number" step="0.01" min="0.02" style={styles.input} value={autoFormData.creation_parameters.defaultBid} onChange={e => handleAutoFormValueChange('creation_parameters.defaultBid', Number(e.target.value))} required /></div>
                </div>
            </div>
            <div style={styles.card}>
                <h2 style={styles.cardTitle}>Step 2: Bidding Strategy by Placement</h2>
                <p style={styles.explanationText}>
                    This setting controls the bid boost for each of the 12 campaigns. For example, the four campaigns targeting 'Top of search' will use the value you enter here for their 'Top of search' bid adjustment, while their other placement bids will be set to 0%. This isolates performance by placement.
                </p>
                <div style={styles.biddingGrid}>
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="placementTop">Top of search (%)</label><input id="placementTop" type="number" min="0" max="900" style={styles.input} value={autoFormData.creation_parameters.placementBids.top} onChange={e => handleAutoFormValueChange('creation_parameters.placementBids.top', parseInt(e.target.value, 10) || 0)} /></div>
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="placementRest">Rest of search (%)</label><input id="placementRest" type="number" min="0" max="900" style={styles.input} value={autoFormData.creation_parameters.placementBids.rest} onChange={e => handleAutoFormValueChange('creation_parameters.placementBids.rest', parseInt(e.target.value, 10) || 0)} /></div>
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="placementProduct">Product pages (%)</label><input id="placementProduct" type="number" min="0" max="900" style={styles.input} value={autoFormData.creation_parameters.placementBids.product} onChange={e => handleAutoFormValueChange('creation_parameters.placementBids.product', parseInt(e.target.value, 10) || 0)} /></div>
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
                            <input id="scheduleName" style={styles.input} value={autoFormData.name} onChange={e => handleAutoFormValueChange('name', e.target.value)} placeholder="e.g., Weekly New Auto Set for..." required={isScheduled} />
                        </div>
                        <div style={styles.scheduleGrid}>
                            <div style={styles.formGroup}><label style={styles.label}>Frequency</label><div style={styles.frequencyControls}><span>Every</span><input type="number" min="1" style={{ ...styles.input, width: '70px' }} value={autoFormData.frequency.value} onChange={e => handleAutoFormValueChange('frequency.value', parseInt(e.target.value, 10) || 1)} /><select style={styles.input} value={autoFormData.frequency.unit} onChange={e => handleAutoFormValueChange('frequency.unit', e.target.value as any)}><option value="days">Days</option><option value="weeks">Weeks</option></select></div></div>
                            <div style={styles.formGroup}><label style={styles.label}>Time (UTC-7)</label><input type="time" style={styles.input} value={autoFormData.frequency.startTime} onChange={e => handleAutoFormValueChange('frequency.startTime', e.target.value)} required={isScheduled} /></div>
                        </div>
                    </div>
                )}
            </div>
            <div style={styles.buttonContainer}>
                <button type="submit" style={loading.form ? { ...styles.button, ...styles.buttonDisabled } : styles.button} disabled={loading.form}>
                    {loading.form ? 'Submitting...' : isScheduled ? (autoFormData.id ? 'Update Schedule' : 'Create & Schedule') : 'Create Campaign Set'}
                </button>
            </div>
        </form>
    );

    const renderCreateManualForm = () => (
        <form style={styles.form} onSubmit={handleSubmit}>
            <div style={styles.card}>
                <h2 style={styles.cardTitle}>Step 1: Campaign Details</h2>
                <div style={styles.formGrid}>
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="manual-asin">Product ASIN</label><input id="manual-asin" style={styles.input} value={manualFormData.asin} onChange={e => handleManualFormValueChange('asin', e.target.value.toUpperCase())} placeholder="B0..." required /></div><div />
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="manual-budget">Daily Budget (per campaign)</label><input id="manual-budget" type="number" step="0.01" min="1" style={styles.input} value={manualFormData.budget} onChange={e => handleManualFormValueChange('budget', Number(e.target.value))} required /></div>
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="manual-defaultBid">Default Ad Group Bid ($)</label><input id="manual-defaultBid" type="number" step="0.01" min="0.02" style={styles.input} value={manualFormData.defaultBid} onChange={e => handleManualFormValueChange('defaultBid', Number(e.target.value))} required /></div>
                </div>
            </div>
            <div style={styles.card}>
                <h2 style={styles.cardTitle}>Step 2: Positive Targeting</h2>
                 <div style={styles.formGroup}>
                    <label style={styles.label} htmlFor="search-terms">Keywords / Product ASINs (one per line)</label>
                    <textarea id="search-terms" style={styles.manualTextarea} value={manualFormData.searchTerms} onChange={e => handleManualFormValueChange('searchTerms', e.target.value)} placeholder="blue widget&#10;B0ABC12345&#10;large red gadget..." required />
                </div>
                 <div style={styles.formGrid}>
                     <div style={styles.formGroup}>
                        <label style={styles.label} htmlFor="max-keywords">Max Keywords/Targets per Campaign</label>
                        <input id="max-keywords" type="number" min="1" style={styles.input} value={manualFormData.maxKeywords} onChange={e => handleManualFormValueChange('maxKeywords', Number(e.target.value))} required />
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Keyword Match Types</label>
                        <div style={styles.checkboxGroup}>
                            <label style={styles.checkboxLabel}><input type="checkbox" checked={manualFormData.matchTypes.broad} onChange={e => handleManualFormValueChange('matchTypes', {...manualFormData.matchTypes, broad: e.target.checked})} /> Broad</label>
                            <label style={styles.checkboxLabel}><input type="checkbox" checked={manualFormData.matchTypes.phrase} onChange={e => handleManualFormValueChange('matchTypes', {...manualFormData.matchTypes, phrase: e.target.checked})} /> Phrase</label>
                            <label style={styles.checkboxLabel}><input type="checkbox" checked={manualFormData.matchTypes.exact} onChange={e => handleManualFormValueChange('matchTypes', {...manualFormData.matchTypes, exact: e.target.checked})} /> Exact</label>
                        </div>
                    </div>
                </div>
            </div>
             <div style={styles.card}>
                <h2 style={styles.cardTitle}>Step 3: Negative Targeting (Optional)</h2>
                 <div style={styles.formGroup}>
                    <label style={styles.label} htmlFor="negative-search-terms">Negative Keywords / Product ASINs (one per line)</label>
                    <textarea id="negative-search-terms" style={styles.manualTextarea} value={manualFormData.negativeSearchTerms} onChange={e => handleManualFormValueChange('negativeSearchTerms', e.target.value)} placeholder="cheap widget&#10;B0XYZ78901&#10;used gadget..." />
                </div>
                 <div style={styles.formGroup}>
                    <label style={styles.label}>Negative Match Types</label>
                    <div style={styles.checkboxGroup}>
                        <label style={styles.checkboxLabel}><input type="checkbox" checked={manualFormData.negativeMatchTypes.exact} onChange={e => handleManualFormValueChange('negativeMatchTypes', {...manualFormData.negativeMatchTypes, exact: e.target.checked})} /> Negative Exact</label>
                        <label style={styles.checkboxLabel}><input type="checkbox" checked={manualFormData.negativeMatchTypes.phrase} onChange={e => handleManualFormValueChange('negativeMatchTypes', {...manualFormData.negativeMatchTypes, phrase: e.target.checked})} /> Negative Phrase</label>
                    </div>
                </div>
            </div>
            <div style={styles.card}>
                <h2 style={styles.cardTitle}>Step 4: Bidding Strategy by Placement</h2>
                <div style={styles.biddingGrid}>
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="manual-placementTop">Top of search (%)</label><input id="manual-placementTop" type="number" min="0" max="900" style={styles.input} value={manualFormData.placementBids.top} onChange={e => handleManualFormValueChange('placementBids', {...manualFormData.placementBids, top: parseInt(e.target.value, 10) || 0})} /></div>
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="manual-placementRest">Rest of search (%)</label><input id="manual-placementRest" type="number" min="0" max="900" style={styles.input} value={manualFormData.placementBids.rest} onChange={e => handleManualFormValueChange('placementBids', {...manualFormData.placementBids, rest: parseInt(e.target.value, 10) || 0})} /></div>
                    <div style={styles.formGroup}><label style={styles.label} htmlFor="manual-placementProduct">Product pages (%)</label><input id="manual-placementProduct" type="number" min="0" max="900" style={styles.input} value={manualFormData.placementBids.product} onChange={e => handleManualFormValueChange('placementBids', {...manualFormData.placementBids, product: parseInt(e.target.value, 10) || 0})} /></div>
                </div>
            </div>
            {renderRuleAssociation()}
            <div style={styles.buttonContainer}>
                <button type="submit" style={loading.form ? { ...styles.button, ...styles.buttonDisabled } : styles.button} disabled={loading.form}>
                    {loading.form ? 'Creating...' : 'Create Manual Campaigns'}
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
                                <td style={styles.scheduleTd}><a href="#" onClick={(e) => { e.preventDefault(); handleViewHistory(schedule); }} style={{color: 'var(--primary-color)'}} title={`View history for ${schedule.name}`}>{schedule.name}</a></td>
                                <td style={styles.scheduleTd}>{schedule.creation_parameters.asin}</td>
                                <td style={styles.scheduleTd}>{formatFrequency(schedule)}</td>
                                <td style={{...styles.scheduleTd, ...styles.actionCell}}>
                                    <button style={styles.actionButton} title="Edit Schedule" onClick={() => handleEditSchedule(schedule)}>✏️</button>
                                    <button style={{...styles.actionButton, color: 'var(--danger-color)'}} title="Delete Schedule" onClick={() => handleScheduleDelete(schedule.id)}>🗑️</button>
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            ) : <p style={{color: '#666'}}>You have no scheduled campaign creations.</p>}
        </div>
    );
    
    const renderHistoryModal = () => {
        if (!historyModal.isOpen) return null;
        return (
            <div style={styles.modalBackdrop} onClick={() => setHistoryModal(prev => ({...prev, isOpen: false}))}>
                <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                    <h2 style={styles.modalHeader}>History for "{historyModal.schedule?.name}"</h2>
                    <div style={styles.modalBody}>
                        {historyModal.loading ? <p>Loading history...</p> : historyModal.logs.length === 0 ? <p>No history found for this schedule.</p> : (
                            <table style={{...styles.scheduleTable, fontSize: '0.85rem'}}>
                                <thead><tr>
                                    <th style={styles.scheduleTh}>Run At</th>
                                    <th style={styles.scheduleTh}>Status</th>
                                    <th style={styles.scheduleTh}>Details</th>
                                </tr></thead>
                                <tbody>{historyModal.logs.map(log => (
                                    <tr key={log.run_at}>
                                        <td style={styles.scheduleTd}>{new Date(log.run_at).toLocaleString()}</td>
                                        <td style={styles.scheduleTd}>{log.status}</td>
                                        <td style={styles.scheduleTd}>
                                            {log.status === 'SUCCESS' && log.details?.createdCampaigns ? (
                                                <ul>{log.details.createdCampaigns.map((c: any) => <li key={c.campaignId}>{c.name}</li>)}</ul>
                                            ) : (log.details?.error || log.summary)}
                                        </td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        )}
                    </div>
                    <div style={styles.modalFooter}>
                         <button style={styles.button} onClick={() => setHistoryModal(prev => ({...prev, isOpen: false}))}>Close</button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div style={styles.container}>
            <h1 style={styles.title}>Create & Schedule PPC Campaigns</h1>
            <div style={styles.tabsContainer}>
                 <button style={activeTab === 'manual' ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton} onClick={() => setActiveTab('manual')}>Create Manual Campaign</button>
                <button style={activeTab === 'autoSet' ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton} onClick={() => setActiveTab('autoSet')}>{autoFormData.id ? 'Edit Schedule' : 'Create Campaign Set'}</button>
                <button style={activeTab === 'manage' ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton} onClick={() => setActiveTab('manage')}>Manage Schedules</button>
            </div>
            
            {statusMessage && <div style={{...styles.message, ...(statusMessage.type === 'success' ? styles.successMessage : styles.errorMessage)}}>{statusMessage.text}</div>}

            {activeTab === 'manual' && renderCreateManualForm()}
            {activeTab === 'autoSet' && renderCreateAutoSetForm()}
            {activeTab === 'manage' && renderManageSchedules()}
            
            {renderHistoryModal()}
        </div>
    );
}