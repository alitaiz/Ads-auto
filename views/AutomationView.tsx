// views/AutomationView.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { AutomationRule, AutomationRuleCondition, AutomationConditionGroup, AutomationRuleAction } from '../types';
import { RuleGuideContent } from './components/RuleGuideContent';

const styles: { [key: string]: React.CSSProperties } = {
  container: { maxWidth: '1200px', margin: '0 auto', padding: '20px' },
  header: { marginBottom: '20px' },
  title: { fontSize: '2rem', margin: 0 },
  tabs: { display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '20px', flexWrap: 'wrap' },
  tabButton: { padding: '10px 15px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 500, color: '#555', borderBottom: '3px solid transparent' },
  tabButtonActive: { color: 'var(--primary-color)', borderBottom: '3px solid var(--primary-color)' },
  contentHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  contentTitle: { fontSize: '1.5rem', margin: 0 },
  primaryButton: { padding: '10px 20px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' },
  rulesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' },
  ruleCard: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' },
  ruleCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  ruleName: { fontSize: '1.2rem', fontWeight: 600, margin: 0 },
  ruleDetails: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px', fontSize: '0.9rem' },
  ruleLabel: { color: '#666' },
  ruleValue: { fontWeight: 500 },
  ruleActions: { display: 'flex', gap: '10px', marginTop: 'auto', paddingTop: '15px', borderTop: '1px solid var(--border-color)' },
  button: { padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', background: 'none' },
  dangerButton: { borderColor: 'var(--danger-color)', color: 'var(--danger-color)' },
  modalBackdrop: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#f0f2f2', padding: '30px', borderRadius: 'var(--border-radius)', width: '90%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '25px' },
  modalHeader: { fontSize: '1.75rem', margin: 0, paddingBottom: '10px', color: '#333' },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  card: { border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: 'white', padding: '20px' },
  cardTitle: { fontSize: '1.1rem', fontWeight: 600, margin: '0 0 15px 0', color: '#333' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontWeight: 500, fontSize: '0.9rem', color: '#555' },
  input: { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem', width: '100%' },
  textarea: { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem', width: '100%', minHeight: '120px', resize: 'vertical' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 'auto', paddingTop: '20px', gap: '10px' },
  activeCheckboxContainer: { display: 'flex', alignItems: 'center', gap: '10px', marginRight: 'auto' },
  logTable: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: { textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border-color)' },
  td: { padding: '8px', borderBottom: '1px solid var(--border-color)'},
  ifThenBlock: { border: '1px dashed #ccc', borderRadius: 'var(--border-radius)', padding: '20px', backgroundColor: '#fafafa' },
  ifBlockHeader: { fontWeight: 'bold', fontSize: '1rem', marginBottom: '15px', color: '#333' },
  conditionRow: { display: 'grid', gridTemplateColumns: '2fr auto auto auto 1.5fr auto', alignItems: 'center', gap: '10px', marginBottom: '10px' },
  conditionInput: { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem' },
  conditionText: { fontSize: '0.9rem', color: '#333' },
  deleteButton: { background: 'none', border: '1px solid var(--danger-color)', color: 'var(--danger-color)', borderRadius: '4px', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', lineHeight: '1' },
  thenBlock: { marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #eee' },
  thenHeader: { fontWeight: 'bold', fontSize: '1rem', marginBottom: '15px', color: '#333' },
  thenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' },
  infoBox: { backgroundColor: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 'var(--border-radius)', padding: '10px 15px', fontSize: '0.9rem', color: '#0050b3' }
};

const getDefaultCondition = (): AutomationRuleCondition => ({
    metric: 'spend',
    timeWindow: 5,
    operator: '>',
    value: 0
});

const getDefaultBidAdjustmentAction = (): AutomationRuleAction => ({ 
    type: 'adjustBidPercent', 
    value: -1,
    minBid: undefined,
    maxBid: undefined,
});

const getDefaultSearchTermAction = (): AutomationRuleAction => ({ 
    type: 'negateSearchTerm', 
    matchType: 'NEGATIVE_EXACT' 
});

const getDefaultBudgetAccelerationAction = (): AutomationRuleAction => ({
    type: 'increaseBudgetPercent',
    value: 50
});

const getDefaultBidAdjustmentGroup = (): AutomationConditionGroup => ({
    conditions: [getDefaultCondition()],
    action: getDefaultBidAdjustmentAction()
});

const getDefaultSearchTermGroup = (): AutomationConditionGroup => ({
    conditions: [
        { metric: 'spend', timeWindow: 60, operator: '>', value: 15 },
        { metric: 'sales', timeWindow: 60, operator: '=', value: 0 },
    ],
    action: getDefaultSearchTermAction()
});

const getDefaultBudgetAccelerationGroup = (): AutomationConditionGroup => ({
    conditions: [
        { metric: 'roas', timeWindow: 'TODAY', operator: '>', value: 2.5 },
        { metric: 'budgetUtilization', timeWindow: 'TODAY', operator: '>', value: 75 },
    ],
    action: getDefaultBudgetAccelerationAction()
});

const getDefaultRuleConfig = () => ({
    conditionGroups: [],
    frequency: { unit: 'hours' as 'minutes' | 'hours' | 'days', value: 1 },
    cooldown: { unit: 'hours' as 'minutes' | 'hours' | 'days', value: 24 }
});


const getDefaultRule = (ruleType: AutomationRule['rule_type'], adType: 'SP' | 'SB' | 'SD' | undefined): Partial<AutomationRule> => {
    switch (ruleType) {
        case 'SEARCH_TERM_AUTOMATION':
            return {
                name: '', rule_type: ruleType, ad_type: 'SP',
                config: { ...getDefaultRuleConfig(), conditionGroups: [getDefaultSearchTermGroup()] },
                scope: { campaignIds: [] }, is_active: true,
            };
        case 'BUDGET_ACCELERATION':
             return {
                name: '', rule_type: ruleType, ad_type: 'SP',
                config: {
                    conditionGroups: [getDefaultBudgetAccelerationGroup()],
                    frequency: { unit: 'minutes', value: 30 },
                    cooldown: { unit: 'hours', value: 0 }
                },
                scope: { campaignIds: [] }, is_active: true,
            };
        case 'PRICE_ADJUSTMENT':
             return {
                name: '', rule_type: ruleType,
                config: {
                    skus: [],
                    priceStep: 0.50,
                    priceLimit: 99.99,
                    runAtTime: '02:00',
                    frequency: { unit: 'days', value: 1 }, // Implicitly daily
                    cooldown: { unit: 'hours', value: 0 }
                },
                scope: {}, // Scope is SKU based, not campaign based
                is_active: true,
            };
        case 'BID_ADJUSTMENT':
        default:
             return {
                name: '', rule_type: 'BID_ADJUSTMENT', ad_type: adType || 'SP',
                config: { ...getDefaultRuleConfig(), conditionGroups: [getDefaultBidAdjustmentGroup()] },
                scope: { campaignIds: [] }, is_active: true,
            };
    }
};

const TABS = [
    { id: 'SP_BID_ADJUSTMENT', label: 'SP Bid Adjustment', type: 'BID_ADJUSTMENT', adType: 'SP' },
    { id: 'SB_BID_ADJUSTMENT', label: 'SB Bid Adjustment', type: 'BID_ADJUSTMENT', adType: 'SB' },
    { id: 'SD_BID_ADJUSTMENT', label: 'SD Bid Adjustment', type: 'BID_ADJUSTMENT', adType: 'SD' },
    { id: 'SEARCH_TERM_AUTOMATION', label: 'SP Search Term', type: 'SEARCH_TERM_AUTOMATION', adType: 'SP' },
    { id: 'BUDGET_ACCELERATION', label: 'SP Budget', type: 'BUDGET_ACCELERATION', adType: 'SP' },
    { id: 'PRICE_ADJUSTMENT', label: 'Change Price', type: 'PRICE_ADJUSTMENT' },
    { id: 'HISTORY', label: 'History' },
    { id: 'GUIDE', label: 'Guide' },
];


export function AutomationView() {
  const [activeTabId, setActiveTabId] = useState('SP_BID_ADJUSTMENT');
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState({ rules: true, logs: true });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(prev => ({ ...prev, rules: true }));
    try {
      const res = await fetch('/api/automation/rules');
      const data = await res.json();
      setRules(data);
    } catch (err) { console.error("Failed to fetch rules", err); }
    finally { setLoading(prev => ({ ...prev, rules: false })); }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(prev => ({ ...prev, logs: true }));
    try {
      const res = await fetch('/api/automation/logs');
      const data = await res.json();
      setLogs(data);
    } catch (err) { console.error("Failed to fetch logs", err); }
    finally { setLoading(prev => ({ ...prev, logs: false })); }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchLogs();
  }, [fetchRules, fetchLogs]);
  
  const handleOpenModal = (rule: AutomationRule | null = null) => {
    const activeTabInfo = TABS.find(t => t.id === activeTabId);
    if (!activeTabInfo || !activeTabInfo.type) return;

    if (rule) {
        setEditingRule(rule);
    } else {
        const defaultRule = getDefaultRule(activeTabInfo.type as AutomationRule['rule_type'], (activeTabInfo as any).adType);
        setEditingRule(defaultRule as AutomationRule);
    }
    setIsModalOpen(true);
  };

  const handleDuplicateRule = (ruleToDuplicate: AutomationRule) => {
    const newRule = JSON.parse(JSON.stringify(ruleToDuplicate));
    delete newRule.id;
    delete newRule.last_run_at;
    newRule.name = `${newRule.name} - Copy`;
    newRule.scope = { campaignIds: [] };
    if (newRule.rule_type === 'PRICE_ADJUSTMENT') {
        newRule.scope = {};
    }
    setEditingRule(newRule);
    setIsModalOpen(true);
  };

  const handleSaveRule = async (formData: AutomationRule) => {
    const { id, ...data } = formData;
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/automation/rules/${id}` : '/api/automation/rules';
    
    const profileId = localStorage.getItem('selectedProfileId');
    if (!profileId) {
        alert("Please select a profile on the PPC Management page first.");
        return;
    }

    let payload;
    if (method === 'POST') {
        payload = { ...data, ad_type: data.ad_type || 'SP', profile_id: profileId };
    } else {
        payload = {
            name: data.name,
            config: data.config,
            is_active: data.is_active,
            scope: data.scope, // Ensure scope is also updatable
        };
    }

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setIsModalOpen(false);
    setEditingRule(null);
    fetchRules();
  };

  const handleDeleteRule = async (id: number) => {
      if (window.confirm('Are you sure you want to delete this rule?')) {
          await fetch(`/api/automation/rules/${id}`, { method: 'DELETE' });
          fetchRules();
      }
  };

  const activeTab = TABS.find(t => t.id === activeTabId);
  
  const filteredRules = rules.filter(r => {
    if (!activeTab || r.rule_type !== activeTab.type) return false;
    // For BID_ADJUSTMENT, we also filter by adType
    if (activeTab.type === 'BID_ADJUSTMENT') {
        // Old rules might not have ad_type, so we default them to 'SP' for filtering
        return (r.ad_type || 'SP') === (activeTab as any).adType;
    }
    return true;
  });

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Automation Center</h1>
      </header>

      <div style={styles.tabs}>
        {TABS.map(tab => (
            <button 
                key={tab.id}
                style={activeTabId === tab.id ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton} 
                onClick={() => setActiveTabId(tab.id)}
            >
                {tab.label}
            </button>
        ))}
      </div>
      
      {activeTab && activeTab.type && (
          <div style={styles.contentHeader}>
              <h2 style={styles.contentTitle}>{activeTab.label} Rules</h2>
              <button style={styles.primaryButton} onClick={() => handleOpenModal()}>+ Create New Rule</button>
          </div>
      )}

      {activeTabId === 'HISTORY' && <LogsTab logs={logs} loading={loading.logs} />}
      {activeTabId === 'GUIDE' && <RuleGuideContent />}
      {activeTab?.type && <RulesList rules={filteredRules} onEdit={handleOpenModal} onDelete={handleDeleteRule} onDuplicate={handleDuplicateRule} />}
      
      {isModalOpen && activeTab?.type && (
          <RuleBuilderModal 
              rule={editingRule} 
              modalTitle={editingRule ? `Edit ${activeTab.label} Rule` : `Create New ${activeTab.label} Rule`}
              onClose={() => setIsModalOpen(false)}
              onSave={handleSaveRule}
          />
      )}
    </div>
  );
}

const RulesList = ({ rules, onEdit, onDelete, onDuplicate }: { rules: AutomationRule[], onEdit: (rule: AutomationRule) => void, onDelete: (id: number) => void, onDuplicate: (rule: AutomationRule) => void }) => (
    <div style={styles.rulesGrid}>
        {rules.map(rule => (
            <div key={rule.id} style={styles.ruleCard}>
                <div style={styles.ruleCardHeader}>
                    <h3 style={styles.ruleName}>{rule.name}</h3>
                    <label style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                        <input type="checkbox" checked={rule.is_active} readOnly />
                        {rule.is_active ? 'Active' : 'Paused'}
                    </label>
                </div>
                <div style={styles.ruleDetails}>
                    {rule.rule_type === 'PRICE_ADJUSTMENT' ? (
                        <>
                            <span style={styles.ruleLabel}>Run Time (UTC-7)</span>
                            <span style={styles.ruleValue}>{rule.config.runAtTime || 'Not set'}</span>
                            <span style={styles.ruleLabel}>SKUs</span>
                            <span style={styles.ruleValue}>{(rule.config.skus || []).length} configured</span>
                            <span style={styles.ruleLabel}>Last Run</span>
                            <span style={styles.ruleValue}>{rule.last_run_at ? new Date(rule.last_run_at).toLocaleString() : 'Never'}</span>
                        </>
                    ) : (
                        <>
                            <span style={styles.ruleLabel}>Frequency</span>
                            <span style={styles.ruleValue}>Every {rule.config.frequency?.value || 1} {rule.config.frequency?.unit || 'hour'}(s)</span>
                            <span style={styles.ruleLabel}>Cooldown</span>
                            <span style={styles.ruleValue}>{rule.config.cooldown?.value ?? 24} {rule.config.cooldown?.unit || 'hour'}(s)</span>
                            <span style={styles.ruleLabel}>Last Run</span>
                            <span style={styles.ruleValue}>{rule.last_run_at ? new Date(rule.last_run_at).toLocaleString() : 'Never'}</span>
                        </>
                    )}
                </div>
                <div style={styles.ruleActions}>
                    <button style={styles.button} onClick={() => onEdit(rule)}>Edit</button>
                    <button style={styles.button} onClick={() => onDuplicate(rule)}>Duplicate</button>
                    <button style={{...styles.button, ...styles.dangerButton}} onClick={() => onDelete(rule.id)}>Delete</button>
                </div>
            </div>
        ))}
    </div>
);

const LogsTab = ({ logs, loading }: { logs: any[], loading: boolean}) => {
    const formatDataWindow = (log: any) => {
        const range = log.details?.data_date_range;
        if (!range) return 'N/A';

        const formatDate = (dateStr: string) => {
            try {
                return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
            } catch (e) { return 'Invalid Date'; }
        };

        const formatRange = (rangeObj: { start: string, end: string }) => {
            if (!rangeObj || !rangeObj.start || !rangeObj.end) return null;
            const start = formatDate(rangeObj.start);
            const end = formatDate(rangeObj.end);
            return start === end ? start : `${start} - ${end}`;
        };

        const parts = [];
        const reportRange = formatRange(range.report);
        const streamRange = formatRange(range.stream);

        if (reportRange) parts.push(`Search Term Report: ${reportRange}`);
        if (streamRange) parts.push(`Stream: ${streamRange}`);

        return parts.length > 0 ? parts.join(', ') : 'N/A';
    };
    
    return (
    <div>
        <h2 style={styles.contentTitle}>Automation History</h2>
        {loading ? <p>Loading logs...</p> : (
            <div style={{...styles.tableContainer, maxHeight: '600px', overflowY: 'auto'}}>
                <table style={styles.logTable}>
                    <thead><tr>
                        <th style={styles.th}>Time</th>
                        <th style={styles.th}>Rule</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Data Window</th>
                        <th style={styles.th}>Summary</th>
                    </tr></thead>
                    <tbody>
                        {logs.map(log => (
                            <tr key={log.id}>
                                <td style={styles.td}>{new Date(log.run_at).toLocaleString()}</td>
                                <td style={styles.td}>{log.rule_name}</td>
                                <td style={styles.td}>{log.status}</td>
                                <td style={styles.td}>{formatDataWindow(log)}</td>
                                <td style={styles.td} title={log.details ? JSON.stringify(log.details, null, 2) : ''}>{log.summary}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </div>
    );
};

const RuleBuilderModal = ({ rule, modalTitle, onClose, onSave }: { rule: AutomationRule | null, modalTitle: string, onClose: () => void, onSave: (data: any) => void }) => {
    const [formData, setFormData] = useState<Partial<AutomationRule>>(() => {
        if (rule) return JSON.parse(JSON.stringify(rule));
        return {};
    });

    if (!formData || !formData.config) {
        return null;
    }

    const { rule_type } = formData;

    const handleConfigChange = (field: string, value: any) => {
        setFormData(prev => ({
            ...prev,
            config: { ...prev.config!, [field]: value }
        }));
    };

    const handleConditionChange = (groupIndex: number, condIndex: number, field: keyof AutomationRuleCondition, value: any) => {
        setFormData(prev => {
            const newGroups = JSON.parse(JSON.stringify(prev.config!.conditionGroups));
            newGroups[groupIndex].conditions[condIndex][field] = value;
            return { ...prev, config: { ...prev.config!, conditionGroups: newGroups } };
        });
    };

    const addConditionToGroup = (groupIndex: number) => {
        setFormData(prev => {
            const newGroups = JSON.parse(JSON.stringify(prev.config!.conditionGroups));
            newGroups[groupIndex].conditions.push(getDefaultCondition());
            return { ...prev, config: { ...prev.config!, conditionGroups: newGroups } };
        });
    };
    
    const removeCondition = (groupIndex: number, condIndex: number) => {
         setFormData(prev => {
            const newGroups = JSON.parse(JSON.stringify(prev.config!.conditionGroups));
            if (newGroups[groupIndex].conditions.length > 1) {
                newGroups[groupIndex].conditions.splice(condIndex, 1);
            } else if (newGroups.length > 1) {
                newGroups.splice(groupIndex, 1);
            }
            return { ...prev, config: { ...prev.config!, conditionGroups: newGroups } };
        });
    };
    
    const addConditionGroup = () => {
        setFormData(prev => {
            let newGroup;
            if (rule_type === 'BID_ADJUSTMENT') newGroup = getDefaultBidAdjustmentGroup();
            else if (rule_type === 'SEARCH_TERM_AUTOMATION') newGroup = getDefaultSearchTermGroup();
            else if (rule_type === 'BUDGET_ACCELERATION') newGroup = getDefaultBudgetAccelerationGroup();
            else newGroup = getDefaultBidAdjustmentGroup();
            
            const newGroups = [...(prev.config!.conditionGroups || []), newGroup];
            return { ...prev, config: { ...prev.config!, conditionGroups: newGroups } };
        });
    };
    
    const handleActionChange = (groupIndex: number, field: string, value: any) => {
        setFormData(prev => {
            const newGroups = JSON.parse(JSON.stringify(prev.config!.conditionGroups));
            newGroups[groupIndex].action[field] = value;
            return { ...prev, config: { ...prev.config!, conditionGroups: newGroups }};
        });
    };
    
    return (
        <div style={styles.modalBackdrop} onClick={onClose}>
            <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                <form style={styles.form} onSubmit={e => { e.preventDefault(); onSave(formData); }}>
                    <h2 style={styles.modalHeader}>{modalTitle}</h2>
                    
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Rule Name</label>
                        <input style={styles.input} value={formData.name} onChange={e => setFormData(p => ({...p, name: e.target.value}))} required />
                    </div>

                    {rule_type === 'PRICE_ADJUSTMENT' ? (
                        <>
                            <div style={styles.card}>
                                <h3 style={styles.cardTitle}>SKU & Scheduling</h3>
                                 <div style={styles.formGroup}>
                                    <label style={styles.label}>SKUs (one per line)</label>
                                    <textarea 
                                        style={styles.textarea} 
                                        value={(formData.config.skus || []).join('\n')}
                                        onChange={e => {
                                            const skus = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
                                            handleConfigChange('skus', skus);
                                        }}
                                        placeholder="Paste your list of SKUs here..."
                                        required
                                    />
                                </div>
                                <div style={{...styles.formGroup, marginTop: '15px'}}>
                                    <label style={styles.label}>Run At Time (UTC-7)</label>
                                    <input
                                        type="time"
                                        style={{...styles.input, width: '150px'}}
                                        value={formData.config.runAtTime || '02:00'}
                                        onChange={e => handleConfigChange('runAtTime', e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div style={styles.card}>
                                <h3 style={styles.cardTitle}>Price Adjustment Logic</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Price Step (+/-)</label>
                                        <input type="number" step="0.01" style={styles.input} placeholder="e.g., -0.50" value={formData.config.priceStep ?? ''} onChange={e => handleConfigChange('priceStep', Number(e.target.value))} required />
                                    </div>
                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Max Price Limit</label>
                                        <input type="number" step="0.01" style={styles.input} placeholder="e.g., 29.99" value={formData.config.priceLimit ?? ''} onChange={e => handleConfigChange('priceLimit', Number(e.target.value))} required />
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={styles.card}>
                                <h3 style={styles.cardTitle}>Scheduling &amp; Cooldown</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                        <div style={styles.formGroup}>
                                            <label style={styles.label}>Frequency</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span>Run every</span>
                                                <input type="number" min="1" style={{...styles.input, width: '80px'}} value={formData.config.frequency?.value || 1} onChange={e => handleConfigChange('frequency', { ...formData.config.frequency, value: Math.max(1, Number(e.target.value)) })} />
                                                <select style={{...styles.input, flex: 1}} value={formData.config.frequency?.unit || 'hours'} onChange={e => {
                                                    const unit = e.target.value as 'minutes' | 'hours' | 'days';
                                                    const newFreq = { ...formData.config.frequency, unit };
                                                    if (unit === 'days' && !formData.config.frequency?.startTime) {
                                                        newFreq.startTime = '01:00'; // Default
                                                    }
                                                    handleConfigChange('frequency', newFreq);
                                                }}>
                                                    <option value="minutes">Minute(s)</option>
                                                    <option value="hours">Hour(s)</option>
                                                    <option value="days">Day(s)</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div style={styles.formGroup}>
                                            <label style={styles.label}>Action Cooldown</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span>Wait for</span>
                                                <input type="number" min="0" style={{...styles.input, width: '80px'}} value={formData.config.cooldown?.value ?? 24} onChange={e => handleConfigChange('cooldown', { ...formData.config.cooldown, value: Number(e.target.value) })}/>
                                                <select style={{...styles.input, flex: 1}} value={formData.config.cooldown?.unit || 'hours'} onChange={e => handleConfigChange('cooldown', { ...formData.config.cooldown, unit: e.target.value as any })}>
                                                    <option value="minutes">Minute(s)</option>
                                                    <option value="hours">Hour(s)</option>
                                                    <option value="days">Day(s)</option>
                                                </select>
                                            </div>
                                             <p style={{fontSize: '0.8rem', color: '#666', margin: '5px 0 0 0'}}>After acting on an item, wait this long before acting on it again. Set to 0 to disable.</p>
                                        </div>
                                    </div>
                                    {formData.config.frequency?.unit === 'days' && (
                                        <div style={{...styles.formGroup}}>
                                            <label style={styles.label}>Scheduled Start Time (UTC-7)</label>
                                            <input type="time" style={{...styles.input, width: '150px'}} value={formData.config.frequency?.startTime || '01:00'} onChange={e => handleConfigChange('frequency', { ...formData.config.frequency, startTime: e.target.value })} required />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div style={styles.card}>
                                <h3 style={styles.cardTitle}>Rule Logic (First Match Wins)</h3>
                                <p style={{fontSize: '0.8rem', color: '#666', marginTop: '-10px', marginBottom: '15px'}}>Rules are checked from top to bottom. The first group whose conditions are met will trigger its action, and the engine will stop.</p>
                                {(formData.config?.conditionGroups || []).map((group, groupIndex) => (
                                   <React.Fragment key={groupIndex}>
                                        <div style={styles.ifThenBlock}>
                                            <h4 style={styles.ifBlockHeader}>IF</h4>
                                            {group.conditions.map((cond, condIndex) => (
                                                <div key={condIndex} style={styles.conditionRow}>
                                                   <select style={styles.conditionInput} value={cond.metric} onChange={e => handleConditionChange(groupIndex, condIndex, 'metric', e.target.value)}>
                                                        {rule_type === 'BUDGET_ACCELERATION' ? (
                                                            <>
                                                                <option value="roas">ROAS</option> <option value="acos">ACoS</option> <option value="sales">Sales</option> <option value="orders">Orders</option> <option value="budgetUtilization">Budget Utilization %</option>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <option value="spend">Spend</option> <option value="sales">Sales</option> <option value="acos">ACOS</option> <option value="orders">Orders</option> <option value="clicks">Clicks</option> <option value="impressions">Impressions</option>
                                                            </>
                                                        )}
                                                    </select>
                                                    <span style={styles.conditionText}>in last</span>
                                                    {rule_type === 'BUDGET_ACCELERATION' ? <input style={{...styles.conditionInput, width: '60px', textAlign: 'center'}} value="Today" disabled /> : <input type="number" min="1" max="90" style={{...styles.conditionInput, width: '60px'}} value={cond.timeWindow} onChange={e => handleConditionChange(groupIndex, condIndex, 'timeWindow', Number(e.target.value))} required />}
                                                    <span style={styles.conditionText}>{rule_type !== 'BUDGET_ACCELERATION' && 'days'}</span>
                                                    <select style={{...styles.conditionInput, width: '60px'}} value={cond.operator} onChange={e => handleConditionChange(groupIndex, condIndex, 'operator', e.target.value)}>
                                                        <option value=">">&gt;</option> <option value="<">&lt;</option> <option value="=">=</option>
                                                    </select>
                                                    <input type="number" step="0.01" style={styles.conditionInput} value={cond.value} onChange={e => handleConditionChange(groupIndex, condIndex, 'value', Number(e.target.value))} required />
                                                    <button type="button" onClick={() => removeCondition(groupIndex, condIndex)} style={styles.deleteButton}>&times;</button>
                                                </div>
                                            ))}
                                             <button type="button" onClick={() => addConditionToGroup(groupIndex)} style={{...styles.button, marginTop: '10px'}}>+ Add Condition (AND)</button>
                                             <div style={styles.thenBlock}>
                                                <h4 style={styles.thenHeader}>THEN</h4>
                                                {rule_type === 'BID_ADJUSTMENT' && (
                                                    <div style={styles.thenGrid}>
                                                        <div style={styles.formGroup}>
                                                            <label style={styles.label}>Action</label>
                                                            <select style={styles.conditionInput} value={group.action.type} onChange={e => handleActionChange(groupIndex, 'type', e.target.value)}>
                                                                <option value="adjustBidPercent">Adjust Bid By %</option>
                                                            </select>
                                                        </div>
                                                        <div style={styles.formGroup}>
                                                            <label style={styles.label}>Value (%)</label>
                                                            <input type="number" style={styles.conditionInput} placeholder="e.g., -10" value={group.action.value ?? ''} onChange={e => handleActionChange(groupIndex, 'value', Number(e.target.value))} />
                                                        </div>
                                                        <div style={styles.formGroup}>
                                                            <label style={styles.label}>Min Bid (Optional)</label>
                                                            <input type="number" step="0.01" style={styles.conditionInput} placeholder="e.g., 0.15" value={group.action.minBid ?? ''} onChange={e => handleActionChange(groupIndex, 'minBid', e.target.value ? Number(e.target.value) : undefined)} />
                                                        </div>
                                                        <div style={styles.formGroup}>
                                                            <label style={styles.label}>Max Bid (Optional)</label>
                                                            <input type="number" step="0.01" style={styles.conditionInput} placeholder="e.g., 2.50" value={group.action.maxBid ?? ''} onChange={e => handleActionChange(groupIndex, 'maxBid', e.target.value ? Number(e.target.value) : undefined)} />
                                                        </div>
                                                    </div>
                                                )}
                                                {rule_type === 'SEARCH_TERM_AUTOMATION' && (
                                                    <div style={styles.thenGrid}>
                                                        <div style={styles.formGroup}>
                                                            <label style={styles.label}>Action</label>
                                                            <select style={styles.conditionInput} value={group.action.type} onChange={e => handleActionChange(groupIndex, 'type', e.target.value)}>
                                                                <option value="negateSearchTerm">Negate Search Term</option>
                                                            </select>
                                                        </div>
                                                        <div style={styles.formGroup}>
                                                            <label style={styles.label}>Match Type</label>
                                                            <select style={styles.conditionInput} value={group.action.matchType} onChange={e => handleActionChange(groupIndex, 'matchType', e.target.value)}>
                                                                <option value="NEGATIVE_EXACT">Negative Exact</option>
                                                                <option value="NEGATIVE_PHRASE">Negative Phrase</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                )}
                                                {rule_type === 'BUDGET_ACCELERATION' && (
                                                    <div style={styles.thenGrid}>
                                                        <div style={styles.formGroup}>
                                                            <label style={styles.label}>Action</label>
                                                            <select style={styles.conditionInput} value={group.action.type} onChange={e => handleActionChange(groupIndex, 'type', e.target.value)}>
                                                                <option value="increaseBudgetPercent">Increase Budget By %</option>
                                                            </select>
                                                        </div>
                                                        <div style={styles.formGroup}>
                                                            <label style={styles.label}>Value (%)</label>
                                                            <input type="number" style={styles.conditionInput} placeholder="e.g., 50" value={group.action.value ?? ''} onChange={e => handleActionChange(groupIndex, 'value', Number(e.target.value))} />
                                                        </div>
                                                    </div>
                                                )}
                                             </div>
                                        </div>
                                       {groupIndex < formData.config!.conditionGroups!.length - 1 && <div style={{textAlign: 'center', margin: '15px 0', fontWeight: 'bold', color: '#555'}}>OR</div>}
                                   </React.Fragment>
                                ))}
                                <button type="button" onClick={addConditionGroup} style={{...styles.button, marginTop: '15px'}}>+ Add Condition Group (OR)</button>
                            </div>
                        </>
                    )}
                    
                    <div style={styles.modalFooter}>
                        <div style={styles.activeCheckboxContainer}>
                           <input type="checkbox" id="rule-is-active" style={{ transform: 'scale(1.2)' }} checked={formData.is_active} onChange={e => setFormData(p => ({...p, is_active: e.target.checked!}))} />
                           <label htmlFor="rule-is-active" style={{...styles.label, cursor: 'pointer'}}>Rule is Active</label>
                        </div>
                        <button type="button" style={{...styles.button, ...styles.dangerButton}} onClick={onClose}>Cancel</button>
                        <button type="submit" style={styles.primaryButton}>Save Rule</button>
                    </div>
                </form>
            </div>
        </div>
    );
};