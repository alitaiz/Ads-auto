// views/AutomationView.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { AutomationRule, AutomationRuleCondition, AutomationConditionGroup, AutomationRuleAction, Campaign, AdGroup } from '../types';
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
  radioGroup: { display: 'flex', gap: '15px', alignItems: 'center' },
  infoBox: { backgroundColor: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 'var(--border-radius)', padding: '10px 15px', fontSize: '0.9rem', color: '#0050b3' }
};

const getDefaultCondition = (): AutomationRuleCondition => ({
    metric: 'spend',
    timeWindow: 5,
    operator: '>',
    value: 0
});

const getDefaultBidAdjustmentAction = (): AutomationRuleAction => ({ 
    type: 'decreaseBidPercent', 
    value: 10,
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

const getDefaultHarvestingAction = (): AutomationRuleAction => ({
    type: 'CREATE_NEW_CAMPAIGN',
    matchType: 'EXACT',
    newCampaignBudget: 10,
    bidOption: { type: 'CPC_MULTIPLIER', value: 1.15 }
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

const getDefaultHarvestingGroup = (): AutomationConditionGroup => ({
    conditions: [
        { metric: 'orders', timeWindow: 30, operator: '>', value: 2 },
        { metric: 'acos', timeWindow: 30, operator: '<', value: 30 }
    ],
    action: getDefaultHarvestingAction()
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
                config: { ...getDefaultRuleConfig(), frequency: { unit: 'days', value: 1 }, conditionGroups: [getDefaultSearchTermGroup()] },
                scope: { campaignIds: [] }, is_active: true,
            };
        case 'SEARCH_TERM_HARVESTING':
            return {
                name: '', rule_type: ruleType, ad_type: 'SP',
                config: { ...getDefaultRuleConfig(), frequency: { unit: 'days', value: 1 }, conditionGroups: [getDefaultHarvestingGroup()] },
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
    { id: 'SEARCH_TERM_NEGATION', label: 'SP Search Term Negation', type: 'SEARCH_TERM_AUTOMATION', adType: 'SP' },
    { id: 'SEARCH_TERM_HARVESTING', label: 'SP Search Term Harvesting', type: 'SEARCH_TERM_HARVESTING', adType: 'SP' },
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
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

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
    if (!activeTabInfo || !('type' in activeTabInfo) || !activeTabInfo.type) return;

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
    if (!activeTab || !('type' in activeTab) || r.rule_type !== activeTab.type) return false;
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
      
      {activeTab && 'type' in activeTab && activeTab.type && (
          <div style={styles.contentHeader}>
              <h2 style={styles.contentTitle}>{activeTab.label} Rules</h2>
              <button style={styles.primaryButton} onClick={() => handleOpenModal()}>+ Create New Rule</button>
          </div>
      )}

      {activeTabId === 'HISTORY' && <LogsTab logs={logs} loading={loading.logs} expandedLogId={expandedLogId} setExpandedLogId={setExpandedLogId} />}
      {activeTabId === 'GUIDE' && <RuleGuideContent />}
      {activeTab && 'type' in activeTab && activeTab.type && <RulesList rules={filteredRules} onEdit={handleOpenModal} onDelete={handleDeleteRule} onDuplicate={handleDuplicateRule} />}
      
      {isModalOpen && activeTab && 'type' in activeTab && activeTab.type && (
          <RuleBuilderModal 
              rule={editingRule} 
              modalTitle={editingRule && editingRule.id ? `Edit ${activeTab.label} Rule` : `Create New ${activeTab.label} Rule`}
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

const LogsTab = ({ logs, loading, expandedLogId, setExpandedLogId }: { logs: any[], loading: boolean, expandedLogId: number | null, setExpandedLogId: (id: number | null) => void }) => {
    const getStatusStyle = (status: string): React.CSSProperties => {
        let backgroundColor = '#e9ecef'; // default grey
        let color = '#495057';
        if (status === 'SUCCESS') {
            backgroundColor = '#d4edda';
            color = '#155724';
        } else if (status === 'FAILURE') {
            backgroundColor = '#f8d7da';
            color = '#721c24';
        } else if (status === 'NO_ACTION') {
            backgroundColor = '#fff3cd';
            color = '#856404';
        }
        return {
            display: 'inline-block',
            padding: '3px 8px',
            borderRadius: '12px',
            fontSize: '0.8rem',
            fontWeight: 500,
            backgroundColor,
            color,
            border: `1px solid ${color}`
        };
    };

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
                           <React.Fragment key={log.id}>
                                <tr onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                    <td style={styles.td}>{new Date(log.run_at).toLocaleString()}</td>
                                    <td style={styles.td}>{log.rule_name}</td>
                                    <td style={styles.td}><span style={getStatusStyle(log.status)}>{log.status}</span></td>
                                    <td style={styles.td}>{formatDataWindow(log)}</td>
                                    <td style={styles.td}>{log.summary}</td>
                                </tr>
                                {expandedLogId === log.id && (
                                    <tr>
                                        <td colSpan={5} style={{ padding: '15px 25px', backgroundColor: '#f8f9fa' }}>
                                            <h4 style={{ margin: '0 0 10px 0' }}>Execution Details</h4>
                                            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', backgroundColor: '#e9ecef', padding: '15px', borderRadius: '4px', maxHeight: '300px', overflowY: 'auto', fontSize: '0.8rem' }}>
                                                {JSON.stringify(log.details, null, 2)}
                                            </pre>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
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

    const [spCampaigns, setSpCampaigns] = useState<Campaign[]>([]);
    const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
    const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
    const [isLoadingAdGroups, setIsLoadingAdGroups] = useState(false);

    useEffect(() => {
        if (formData.rule_type === 'SEARCH_TERM_HARVESTING') {
            const fetchCampaigns = async () => {
                setIsLoadingCampaigns(true);
                const profileId = localStorage.getItem('selectedProfileId');
                if (!profileId) { setIsLoadingCampaigns(false); return; }

                try {
                    const response = await fetch('/api/amazon/campaigns/list', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ profileId, stateFilter: ["ENABLED"] }),
                    });
                    const data = await response.json();
                    const spCamps = data.campaigns.filter((c: Campaign) => c.campaignType === 'sponsoredProducts');
                    setSpCampaigns(spCamps);
                } catch (e) { console.error("Failed to fetch campaigns", e); } 
                finally { setIsLoadingCampaigns(false); }
            };
            fetchCampaigns();
        }
    }, [formData.rule_type]);

    useEffect(() => {
        const targetCampaignId = formData.config?.conditionGroups?.[0]?.action?.targetCampaignId;
        if (formData.rule_type === 'SEARCH_TERM_HARVESTING' && targetCampaignId) {
            const fetchAdGroups = async () => {
                setIsLoadingAdGroups(true);
                setAdGroups([]);
                const profileId = localStorage.getItem('selectedProfileId');
                if (!profileId) { setIsLoadingAdGroups(false); return; }

                try {
                    const response = await fetch(`/api/amazon/campaigns/${targetCampaignId}/adgroups`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ profileId }),
                    });
                    const data = await response.json();
                    setAdGroups(data.adGroups || []);
                } catch (e) { console.error("Failed to fetch ad groups", e); }
                finally { setIsLoadingAdGroups(false); }
            };
            fetchAdGroups();
        }
    }, [formData.rule_type, formData.config?.conditionGroups?.[0]?.action?.targetCampaignId]);


    useEffect(() => {
        if (formData.config?.conditionGroups) {
            let needsUpdate = false;
            const newGroups = formData.config.conditionGroups.map(group => {
                if (group.action.type === 'adjustBidPercent') {
                    needsUpdate = true;
                    const value = group.action.value || 0;
                    const newAction: AutomationRuleAction = { ...group.action, type: value >= 0 ? 'increaseBidPercent' : 'decreaseBidPercent', value: Math.abs(value) };
                    return { ...group, action: newAction };
                }
                return group;
            });
            if (needsUpdate) {
                setFormData(prev => ({ ...prev, config: { ...prev.config!, conditionGroups: newGroups } }));
            }
        }
    }, []); 


    if (!formData || !formData.config) {
        return null;
    }

    const { rule_type } = formData;

    const handleConfigChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, config: { ...prev.config!, [field]: value } }));
    };

    const handleConditionChange = (groupIndex: number, condIndex: number, field: keyof AutomationRuleCondition, value: any) => {
        setFormData(prev => {
            const newGroups = JSON.parse(JSON.stringify(prev.config!.conditionGroups));
            if (field === 'metric' && value === 'acos') {
                 newGroups[groupIndex].conditions[condIndex].value = (newGroups[groupIndex].conditions[condIndex].value || 0) * 100;
            } else if (field === 'value' && newGroups[groupIndex].conditions[condIndex].metric === 'acos') {
                value = value / 100;
            }
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
            else if (rule_type === 'SEARCH_TERM_HARVESTING') newGroup = getDefaultHarvestingGroup();
            else newGroup = getDefaultBidAdjustmentGroup();
            
            const newGroups = [...(prev.config!.conditionGroups || []), newGroup];
            return { ...prev, config: { ...prev.config!, conditionGroups: newGroups } };
        });
    };
    
    const handleActionChange = (groupIndex: number, field: string, value: any) => {
        setFormData(prev => {
            const newGroups = JSON.parse(JSON.stringify(prev.config!.conditionGroups));
            const action = newGroups[groupIndex].action;

            if (field.startsWith('bidOption.')) {
                const subField = field.split('.')[1];
                if (!action.bidOption) action.bidOption = {};
                action.bidOption[subField] = value;
            } else {
                 action[field] = value;
            }
            
            // Logic to reset ad group if campaign changes
            if (field === 'targetCampaignId') {
                action.targetAdGroupId = '';
            }
            
            return { ...prev, config: { ...prev.config!, conditionGroups: newGroups }};
        });
    };
    
    const renderConditionInput = (groupIndex: number, cond: AutomationRuleCondition, condIndex: number) => {
        if (cond.metric === 'acos') {
            return (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <input type="number" step="0.01" style={styles.conditionInput} value={(cond.value || 0) * 100} onChange={e => handleConditionChange(groupIndex, condIndex, 'value', Number(e.target.value))} required />
                    <span style={{ marginLeft: '5px' }}>%</span>
                </div>
            );
        }
        return <input type="number" step="0.01" style={styles.conditionInput} value={cond.value} onChange={e => handleConditionChange(groupIndex, condIndex, 'value', Number(e.target.value))} required />;
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
                       <></> // Price adjustment UI from previous step
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
                                                    {renderConditionInput(groupIndex, cond, condIndex)}
                                                    <button type="button" onClick={() => removeCondition(groupIndex, condIndex)} style={styles.deleteButton}>&times;</button>
                                                </div>
                                            ))}
                                             <button type="button" onClick={() => addConditionToGroup(groupIndex)} style={{...styles.button, marginTop: '10px'}}>+ Add Condition (AND)</button>
                                             <div style={styles.thenBlock}>
                                                <h4 style={styles.thenHeader}>THEN</h4>
                                                {rule_type === 'BID_ADJUSTMENT' && <BidAdjustmentActionForm action={group.action} onActionChange={(f,v) => handleActionChange(groupIndex, f, v)} />}
                                                {rule_type === 'SEARCH_TERM_AUTOMATION' && <SearchTermNegationActionForm action={group.action} onActionChange={(f,v) => handleActionChange(groupIndex, f, v)} />}
                                                {rule_type === 'BUDGET_ACCELERATION' && <BudgetAccelerationActionForm action={group.action} onActionChange={(f,v) => handleActionChange(groupIndex, f, v)} />}
                                                {rule_type === 'SEARCH_TERM_HARVESTING' && <SearchTermHarvestingActionForm action={group.action} onActionChange={(f,v) => handleActionChange(groupIndex, f, v)} spCampaigns={spCampaigns} adGroups={adGroups} isLoadingCampaigns={isLoadingCampaigns} isLoadingAdGroups={isLoadingAdGroups} />}
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


// --- Action Form Components for RuleBuilderModal ---

const BidAdjustmentActionForm = ({ action, onActionChange }: { action: AutomationRuleAction, onActionChange: (field: string, value: any) => void }) => (
    <div style={styles.thenGrid}>
        <div style={styles.formGroup}><label style={styles.label}>Action</label><select style={styles.conditionInput} value={action.type} onChange={e => onActionChange('type', e.target.value)}><option value="decreaseBidPercent">Decrease Bid By %</option><option value="increaseBidPercent">Increase Bid By %</option><option value="decreaseBidAmount">Decrease Bid By $</option><option value="increaseBidAmount">Increase Bid By $</option></select></div>
        <div style={styles.formGroup}><label style={styles.label}>{`Value ${action.type?.includes('Percent') ? '(%)' : '($)'}`}</label><input type="number" step="0.01" min="0" style={styles.conditionInput} placeholder={action.type?.includes('Percent') ? "e.g., 10" : "e.g., 0.25"} value={action.value ?? ''} onChange={e => onActionChange('value', Number(e.target.value))} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Min Bid (Optional)</label><input type="number" step="0.01" style={styles.conditionInput} placeholder="e.g., 0.15" value={action.minBid ?? ''} onChange={e => onActionChange('minBid', e.target.value ? Number(e.target.value) : undefined)} /></div>
        <div style={styles.formGroup}><label style={styles.label}>Max Bid (Optional)</label><input type="number" step="0.01" style={styles.conditionInput} placeholder="e.g., 2.50" value={action.maxBid ?? ''} onChange={e => onActionChange('maxBid', e.target.value ? Number(e.target.value) : undefined)} /></div>
    </div>
);

const SearchTermNegationActionForm = ({ action, onActionChange }: { action: AutomationRuleAction, onActionChange: (field: string, value: any) => void }) => (
    <div style={styles.thenGrid}>
        <div style={styles.formGroup}><label style={styles.label}>Action</label><select style={styles.conditionInput} value={action.type} onChange={e => onActionChange('type', e.target.value)}><option value="negateSearchTerm">Negate Search Term</option></select></div>
        <div style={styles.formGroup}><label style={styles.label}>Match Type</label><select style={styles.conditionInput} value={action.matchType} onChange={e => onActionChange('matchType', e.target.value)}><option value="NEGATIVE_EXACT">Negative Exact</option><option value="NEGATIVE_PHRASE">Negative Phrase</option></select></div>
    </div>
);

const BudgetAccelerationActionForm = ({ action, onActionChange }: { action: AutomationRuleAction, onActionChange: (field: string, value: any) => void }) => (
    <div style={styles.thenGrid}>
        <div style={styles.formGroup}><label style={styles.label}>Action</label><select style={styles.conditionInput} value={action.type} onChange={e => onActionChange('type', e.target.value)}><option value="increaseBudgetPercent">Increase Budget By %</option></select></div>
        <div style={styles.formGroup}><label style={styles.label}>Value (%)</label><input type="number" style={styles.conditionInput} placeholder="e.g., 50" value={action.value ?? ''} onChange={e => onActionChange('value', Number(e.target.value))} /></div>
        <div style={{...styles.infoBox, gridColumn: '1 / -1'}}>ℹ️ The budget will be automatically reset to its original value at the end of the day.</div>
    </div>
);

const SearchTermHarvestingActionForm = ({ action, onActionChange, spCampaigns, adGroups, isLoadingCampaigns, isLoadingAdGroups }: { action: AutomationRuleAction, onActionChange: (field: string, value: any) => void, spCampaigns: Campaign[], adGroups: AdGroup[], isLoadingCampaigns: boolean, isLoadingAdGroups: boolean }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={styles.formGroup}><label style={styles.label}>Action</label><div style={styles.radioGroup}>
            <label><input type="radio" value="CREATE_NEW_CAMPAIGN" checked={action.type === 'CREATE_NEW_CAMPAIGN'} onChange={e => onActionChange('type', e.target.value)} /> Create a new campaign</label>
            <label><input type="radio" value="ADD_TO_EXISTING_CAMPAIGN" checked={action.type === 'ADD_TO_EXISTING_CAMPAIGN'} onChange={e => onActionChange('type', e.target.value)} /> Add to an existing campaign</label>
        </div></div>
        
        {action.type === 'CREATE_NEW_CAMPAIGN' && <div style={styles.thenGrid}>
            <div style={styles.formGroup}><label style={styles.label}>Daily Budget</label><input type="number" step="0.01" min="1" style={styles.conditionInput} placeholder="e.g., 10.00" value={action.newCampaignBudget ?? ''} onChange={e => onActionChange('newCampaignBudget', Number(e.target.value))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Match Type</label><select style={styles.conditionInput} value={action.matchType} onChange={e => onActionChange('matchType', e.target.value)}><option value="EXACT">Exact</option><option value="PHRASE">Phrase</option></select></div>
        </div>}
        
        {action.type === 'ADD_TO_EXISTING_CAMPAIGN' && <div style={{...styles.thenGrid, gridTemplateColumns: '1fr 1fr'}}>
            <div style={styles.formGroup}><label style={styles.label}>Target Campaign</label><select style={styles.conditionInput} value={action.targetCampaignId ?? ''} onChange={e => onActionChange('targetCampaignId', e.target.value)} disabled={isLoadingCampaigns}>{isLoadingCampaigns ? <option>Loading...</option> : <><option value="">Select a campaign...</option>{spCampaigns.map(c => <option key={c.campaignId} value={c.campaignId}>{c.name}</option>)}</>}</select></div>
            <div style={styles.formGroup}><label style={styles.label}>Target Ad Group</label><select style={styles.conditionInput} value={action.targetAdGroupId ?? ''} onChange={e => onActionChange('targetAdGroupId', e.target.value)} disabled={isLoadingAdGroups || !action.targetCampaignId}>{isLoadingAdGroups ? <option>Loading...</option> : <><option value="">Select an ad group...</option>{adGroups.map(ag => <option key={ag.adGroupId} value={ag.adGroupId}>{ag.name}</option>)}</>}</select></div>
        </div>}

        <div style={{ paddingTop: '20px', borderTop: '1px dashed #ccc' }}>
            <div style={styles.formGroup}><label style={styles.label}>Bid Option</label><div style={styles.radioGroup}>
                <label><input type="radio" value="CPC_MULTIPLIER" checked={action.bidOption?.type === 'CPC_MULTIPLIER'} onChange={e => onActionChange('bidOption.type', e.target.value)} /> Based on Search Term CPC</label>
                <label><input type="radio" value="CUSTOM_BID" checked={action.bidOption?.type === 'CUSTOM_BID'} onChange={e => onActionChange('bidOption.type', e.target.value)} /> Set custom bid</label>
            </div></div>
            <div style={{...styles.formGroup, marginTop: '10px'}}>
                <input type="number" step="0.01" min="0" style={{...styles.conditionInput, width: '200px'}} placeholder={action.bidOption?.type === 'CPC_MULTIPLIER' ? "e.g., 1.15 for +15%" : "e.g., 0.75"} value={action.bidOption?.value ?? ''} onChange={e => onActionChange('bidOption.value', Number(e.target.value))} />
            </div>
        </div>
        <div style={{...styles.infoBox, gridColumn: '1 / -1'}}>ℹ️ The harvested search term will be automatically added as a Negative Exact in its original Ad Group to prevent spend overlap.</div>
    </div>
);