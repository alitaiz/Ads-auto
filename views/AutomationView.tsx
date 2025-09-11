import React, { useEffect, useState, useCallback } from 'react';
import { AutomationRule, AutomationRuleCondition, AutomationConditionGroup, AutomationRuleAction } from '../types';

const styles: { [key: string]: React.CSSProperties } = {
  container: { maxWidth: '1200px', margin: '0 auto', padding: '20px' },
  header: { marginBottom: '20px' },
  title: { fontSize: '2rem', margin: 0 },
  tabs: { display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '20px' },
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
  modalContent: { backgroundColor: 'white', padding: '30px', borderRadius: 'var(--border-radius)', width: '90%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { fontSize: '1.5rem', marginBottom: '20px' },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  formSection: { border: '1px solid var(--border-color)', borderRadius: '4px', padding: '15px' },
  formSectionTitle: { fontWeight: 600, margin: '-15px 0 15px', padding: '0 5px', background: 'white', width: 'fit-content' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' },
  label: { fontWeight: 500, fontSize: '0.9rem' },
  input: { padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '1rem' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '30px' },
  logTable: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: { textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border-color)' },
  td: { padding: '8px', borderBottom: '1px solid var(--border-color)'},
  conditionRow: { display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.5fr 1fr auto', gap: '10px', alignItems: 'center', marginBottom: '10px' },
  conditionGroup: { border: '1px dashed #ccc', padding: '15px', borderRadius: '4px', marginBottom: '15px', position: 'relative' },
  orDivider: { textAlign: 'center', fontWeight: 'bold', margin: '10px 0' },
  andDivider: { fontSize: '0.8rem', fontWeight: 'bold', margin: '5px 0 5px 20px' },
  thenBlock: { marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #ddd' }
};

const getDefaultCondition = (): AutomationRuleCondition => ({
    metric: 'spend',
    timeWindow: 60,
    operator: '>',
    value: 20
});

const getDefaultBidAdjustmentAction = (): AutomationRuleAction => ({ 
    type: 'adjustBidPercent', 
    value: -25,
    minBid: undefined,
    maxBid: undefined,
});

const getDefaultSearchTermAction = (): AutomationRuleAction => ({ 
    type: 'negateSearchTerm', 
    matchType: 'NEGATIVE_EXACT' 
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

const getDefaultRuleConfig = () => ({
    conditionGroups: [],
    frequency: { unit: 'hours' as 'minutes' | 'hours' | 'days', value: 1 }
});


const getDefaultBidAdjustmentRule = (): Partial<AutomationRule> => ({
    name: '',
    rule_type: 'BID_ADJUSTMENT',
    config: { ...getDefaultRuleConfig(), conditionGroups: [getDefaultBidAdjustmentGroup()] },
    scope: { campaignIds: [] },
    is_active: true,
});

const getDefaultSearchTermRule = (): Partial<AutomationRule> => ({
    name: '',
    rule_type: 'SEARCH_TERM_AUTOMATION',
    config: { ...getDefaultRuleConfig(), conditionGroups: [getDefaultSearchTermGroup()] },
    scope: { campaignIds: [] },
    is_active: true,
});


export function AutomationView() {
  const [activeTab, setActiveTab] = useState('bidAdjustment');
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
    setEditingRule(rule);
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
    const payload = { ...data, profile_id: profileId };

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

  const filteredRules = rules.filter(r => 
      (activeTab === 'bidAdjustment' && r.rule_type === 'BID_ADJUSTMENT') ||
      (activeTab === 'searchTerm' && r.rule_type === 'SEARCH_TERM_AUTOMATION')
  );

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Automation Center</h1>
      </header>

      <div style={styles.tabs}>
        <button style={activeTab === 'bidAdjustment' ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton} onClick={() => setActiveTab('bidAdjustment')}>Bid Adjustment Rules</button>
        <button style={activeTab === 'searchTerm' ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton} onClick={() => setActiveTab('searchTerm')}>Search Term Automation</button>
        <button style={activeTab === 'history' ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton} onClick={() => setActiveTab('history')}>Automation History</button>
      </div>
      
      {activeTab !== 'history' && (
          <div style={styles.contentHeader}>
              <h2 style={styles.contentTitle}>{activeTab === 'bidAdjustment' ? 'Bid Adjustment Rules' : 'Search Term Automation Rules'}</h2>
              <button style={styles.primaryButton} onClick={() => handleOpenModal()}>+ Create New Rule</button>
          </div>
      )}

      {activeTab === 'bidAdjustment' && <RulesList rules={filteredRules} onEdit={handleOpenModal} onDelete={handleDeleteRule} />}
      {activeTab === 'searchTerm' && <RulesList rules={filteredRules} onEdit={handleOpenModal} onDelete={handleDeleteRule} />}
      {activeTab === 'history' && <LogsTab logs={logs} loading={loading.logs} />}
      
      {isModalOpen && (
          <RuleBuilderModal 
              rule={editingRule} 
              ruleType={editingRule ? (editingRule.rule_type === 'BID_ADJUSTMENT' ? 'bidAdjustment' : 'searchTerm') : activeTab}
              onClose={() => setIsModalOpen(false)}
              onSave={handleSaveRule}
          />
      )}
    </div>
  );
}

const RulesList = ({ rules, onEdit, onDelete }: { rules: AutomationRule[], onEdit: (rule: AutomationRule) => void, onDelete: (id: number) => void}) => (
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
                    <span style={styles.ruleLabel}>Frequency</span>
                    <span style={styles.ruleValue}>Every {rule.config.frequency?.value || 1} {rule.config.frequency?.unit || 'hour'}(s)</span>
                    <span style={styles.ruleLabel}>Last Run</span>
                    <span style={styles.ruleValue}>{rule.last_run_at ? new Date(rule.last_run_at).toLocaleString() : 'Never'}</span>
                </div>
                <div style={styles.ruleActions}>
                    <button style={styles.button} onClick={() => onEdit(rule)}>Edit</button>
                    <button style={{...styles.button, ...styles.dangerButton}} onClick={() => onDelete(rule.id)}>Delete</button>
                </div>
            </div>
        ))}
    </div>
);

const LogsTab = ({ logs, loading }: { logs: any[], loading: boolean}) => (
    <div>
        <h2 style={styles.contentTitle}>Automation History</h2>
        {loading ? <p>Loading logs...</p> : (
            <div style={{...styles.tableContainer, maxHeight: '600px', overflowY: 'auto'}}>
                <table style={styles.logTable}>
                    <thead><tr><th style={styles.th}>Time</th><th style={styles.th}>Rule</th><th style={styles.th}>Status</th><th style={styles.th}>Summary</th></tr></thead>
                    <tbody>
                        {logs.map(log => (
                            <tr key={log.id}>
                                <td style={styles.td}>{new Date(log.run_at).toLocaleString()}</td>
                                <td style={styles.td}>{log.rule_name}</td>
                                <td style={styles.td}>{log.status}</td>
                                <td style={styles.td} title={log.details ? JSON.stringify(log.details, null, 2) : ''}>{log.summary}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </div>
);

const RuleBuilderModal = ({ rule, ruleType, onClose, onSave }: { rule: AutomationRule | null, ruleType: string, onClose: () => void, onSave: (data: any) => void }) => {
    const [formData, setFormData] = useState<Partial<AutomationRule>>(() => {
        if (rule) return JSON.parse(JSON.stringify(rule));
        return ruleType === 'bidAdjustment' ? getDefaultBidAdjustmentRule() : getDefaultSearchTermRule();
    });

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
            newGroups[groupIndex].conditions.splice(condIndex, 1);
            if (newGroups[groupIndex].conditions.length === 0) {
                newGroups.splice(groupIndex, 1);
            }
            return { ...prev, config: { ...prev.config!, conditionGroups: newGroups } };
        });
    };
    
    const addConditionGroup = () => {
        setFormData(prev => {
            const newGroup = ruleType === 'bidAdjustment' ? getDefaultBidAdjustmentGroup() : getDefaultSearchTermGroup();
            const newGroups = [...prev.config!.conditionGroups, newGroup];
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
        <div style={styles.modalBackdrop}>
            <div style={styles.modalContent}>
                <h2 style={styles.modalHeader}>{rule ? 'Edit' : 'Create'} {ruleType === 'bidAdjustment' ? 'Bid Adjustment' : 'Search Term'} Rule</h2>
                <form style={styles.form} onSubmit={e => { e.preventDefault(); onSave(formData); }}>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Rule Name</label>
                        <input style={styles.input} value={formData.name} onChange={e => setFormData(p => ({...p, name: e.target.value}))} required />
                    </div>

                     <div style={styles.formSection}>
                        <h4 style={styles.formSectionTitle}>Frequency</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span>Run every</span>
                            <input 
                                type="number" 
                                style={{...styles.input, width: '80px'}} 
                                value={formData.config?.frequency?.value || 1}
                                min="1"
                                onChange={e => handleConfigChange('frequency', { ...formData.config?.frequency, value: Number(e.target.value) })}
                                required
                            />
                            <select 
                                style={styles.input}
                                value={formData.config?.frequency?.unit || 'hours'}
                                onChange={e => handleConfigChange('frequency', { ...formData.config?.frequency, unit: e.target.value as any })}
                            >
                                <option value="minutes">Minute(s)</option>
                                <option value="hours">Hour(s)</option>
                                <option value="days">Day(s)</option>
                            </select>
                        </div>
                    </div>

                    <div style={styles.formSection}>
                         <h4 style={styles.formSectionTitle}>Rule Logic (First Match Wins)</h4>
                         <p style={{fontSize: '0.8rem', color: '#666', marginTop: '-10px', marginBottom: '15px'}}>Rules are checked from top to bottom. The first group whose conditions are met will trigger its action, and the engine will stop.</p>

                        {formData.config?.conditionGroups.map((group, groupIndex) => (
                           <React.Fragment key={groupIndex}>
                                <div style={styles.conditionGroup}>
                                    <h4 style={{margin: '0 0 10px 0', fontSize: '1rem'}}>IF</h4>
                                    {group.conditions.map((cond, condIndex) => (
                                        <React.Fragment key={condIndex}>
                                            <div style={styles.conditionRow}>
                                               <select style={styles.input} value={cond.metric} onChange={e => handleConditionChange(groupIndex, condIndex, 'metric', e.target.value)}>
                                                    <option value="spend">Spend</option> <option value="sales">Sales</option> <option value="acos">ACOS</option>
                                                    <option value="orders">Orders</option> <option value="clicks">Clicks</option>
                                                </select>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <label style={{fontSize: '0.8rem'}}>in last</label>
                                                    <input type="number" min="1" max="90" style={styles.input} value={cond.timeWindow} onChange={e => handleConditionChange(groupIndex, condIndex, 'timeWindow', Number(e.target.value))} required />
                                                    <label style={{fontSize: '0.8rem'}}>days</label>
                                                </div>
                                                <select style={styles.input} value={cond.operator} onChange={e => handleConditionChange(groupIndex, condIndex, 'operator', e.target.value)}>
                                                    <option value=">">&gt;</option> <option value="<">&lt;</option> <option value="=">=</option>
                                                </select>
                                                <input type="number" step="0.01" style={styles.input} value={cond.value} onChange={e => handleConditionChange(groupIndex, condIndex, 'value', Number(e.target.value))} required />
                                                <button type="button" onClick={() => removeCondition(groupIndex, condIndex)} style={{...styles.button, ...styles.dangerButton}}>✕</button>
                                            </div>
                                            {condIndex < group.conditions.length - 1 && <div style={styles.andDivider}>AND</div>}
                                        </React.Fragment>
                                    ))}
                                     <button type="button" onClick={() => addConditionToGroup(groupIndex)} style={{...styles.button, marginTop: '10px'}}>+ Add Condition (AND)</button>
                                
                                     <div style={styles.thenBlock}>
                                        <h4 style={{margin: '0 0 10px 0', fontSize: '1rem'}}>THEN</h4>
                                        {ruleType === 'bidAdjustment' && (
                                            <div style={styles.formGrid}>
                                                <div style={styles.formGroup}>
                                                    <label style={styles.label}>Action</label>
                                                    <select style={styles.input} value={(group.action.value || 0) >= 0 ? 'increase' : 'decrease'} 
                                                        onChange={e => {
                                                            const sign = e.target.value === 'increase' ? 1 : -1;
                                                            handleActionChange(groupIndex, 'value', sign * Math.abs(group.action.value || 0))
                                                        }}
                                                    >
                                                        <option value="decrease">Decrease Bid By</option>
                                                        <option value="increase">Increase Bid By</option>
                                                    </select>
                                                </div>
                                                <div style={styles.formGroup}>
                                                    <label style={styles.label}>Value (%)</label>
                                                    <input type="number" style={styles.input} value={Math.abs(group.action.value || 0)} 
                                                        onChange={e => {
                                                            const sign = (group.action.value || -1) >= 0 ? 1 : -1;
                                                            handleActionChange(groupIndex, 'value', sign * Math.abs(Number(e.target.value)))
                                                        }}
                                                    />
                                                </div>
                                                <div style={styles.formGroup}>
                                                    <label style={styles.label}>Min Bid ($)</label>
                                                    <input type="number" step="0.01" style={styles.input} placeholder="e.g., 0.10"
                                                           value={group.action.minBid ?? ''} 
                                                           onChange={e => handleActionChange(groupIndex, 'minBid', e.target.value ? Number(e.target.value) : undefined)} />
                                                </div>
                                                <div style={styles.formGroup}>
                                                    <label style={styles.label}>Max Bid ($)</label>
                                                    <input type="number" step="0.01" style={styles.input} placeholder="e.g., 2.50"
                                                           value={group.action.maxBid ?? ''} 
                                                           onChange={e => handleActionChange(groupIndex, 'maxBid', e.target.value ? Number(e.target.value) : undefined)} />
                                                </div>
                                            </div>
                                        )}
                                         {ruleType === 'searchTerm' && (
                                            <div style={styles.formGrid}>
                                                 <div style={styles.formGroup}>
                                                    <label style={styles.label}>Action</label>
                                                    <input style={styles.input} value="Create Negative Keyword" disabled />
                                                </div>
                                                <div style={styles.formGroup}>
                                                    <label style={styles.label}>Match Type</label>
                                                    <select style={styles.input} value={group.action.matchType} onChange={e => handleActionChange(groupIndex, 'matchType', e.target.value)}>
                                                        <option value="NEGATIVE_EXACT">Negative Exact</option>
                                                        <option value="NEGATIVE_PHRASE">Negative Phrase</option>
                                                    </select>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                               {groupIndex < formData.config!.conditionGroups.length - 1 && <div style={styles.orDivider}>OR</div>}
                           </React.Fragment>
                        ))}
                        <button type="button" onClick={addConditionGroup} style={{...styles.button, marginTop: '15px'}}>+ Add Condition Group (OR)</button>
                    </div>
                    
                     <div style={{...styles.formGroup, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                        <label style={styles.label}>Rule is Active</label>
                        <input type="checkbox" style={{ transform: 'scale(1.5)' }} checked={formData.is_active} onChange={e => setFormData(p => ({...p, is_active: e.target.checked!}))} />
                    </div>

                    <div style={styles.modalActions}>
                        <button type="button" style={styles.button} onClick={onClose}>Cancel</button>
                        <button type="submit" style={styles.primaryButton}>Save Rule</button>
                    </div>
                </form>
            </div>
        </div>
    );
};