// views/AutomationView.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { AutomationRule, AutomationRuleCondition, AutomationConditionGroup, AutomationRuleAction, Campaign, AdGroup, AutomationLog, TriggeringMetric, LogHarvest } from '../types';
import { RuleGuideContent } from './components/RuleGuideContent';
import { formatPrice, formatNumber, formatPercent } from '../../utils';

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
  infoBox: { backgroundColor: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 'var(--border-radius)', padding: '10px 15px', fontSize: '0.9rem', color: '#0050b3' },
  // Styles for the new log details rendering
  detailsList: {
      margin: 0,
      padding: 0,
      listStyleType: 'none',
      fontSize: '0.9rem',
  },
  metricList: {
      margin: '5px 0 10px 20px',
      paddingLeft: '15px',
      fontSize: '0.85rem',
      color: '#555',
      borderLeft: '2px solid #ddd',
      listStyleType: 'circle',
  },
  metricListItem: {
      marginBottom: '4px',
  },
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
    bidOption: { type: 'CPC_MULTIPLIER', value: 1.0, maxBid: undefined },
    autoNegate: true,
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
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState({ rules: true, logs: true, campaigns: true });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const [campaignScopeList, setCampaignScopeList] = useState<Campaign[]>([]);

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

  const fetchCampaigns = useCallback(async () => {
      const profileId = localStorage.getItem('selectedProfileId');
      if (!profileId) return;

      setLoading(prev => ({ ...prev, campaigns: true }));
      try {
        const res = await fetch('/api/amazon/campaigns/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId, stateFilter: ["ENABLED", "PAUSED"] }),
        });
        const data = await res.json();
        setCampaignScopeList(data.campaigns || []);
      } catch(err) {
        console.error("Failed to fetch campaigns for scope", err);
      } finally {
        setLoading(prev => ({ ...prev, campaigns: false }));
      }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchLogs();
    fetchCampaigns();
  }, [fetchRules, fetchLogs, fetchCampaigns]);
  
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
              campaigns={campaignScopeList}
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

const LogsTab = ({ logs, loading, expandedLogId, setExpandedLogId }: { logs: AutomationLog[], loading: boolean, expandedLogId: number | null, setExpandedLogId: (id: number | null) => void }) => {
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

    const formatDataWindow = (log: AutomationLog) => {
        const range = log.details?.data_date_range;
        if (!range) return 'N/A';

        const formatDate = (dateStr: string) => {
            try {
                return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
            } catch (e) { return 'Invalid Date'; }
        };

        const formatRange = (rangeObj: { start: string, end: string } | null | undefined) => {
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
    
    const renderLogDetails = (log: AutomationLog) => {
        const details = log.details?.actions_by_campaign 
            ? Object.values(log.details.actions_by_campaign)[0] // If nested, grab the first one for summary display
            : log.details;

        if (!details) return <span>{log.summary || 'No details available.'}</span>;

        const changes = details.changes || [];
        const newNegatives = details.newNegatives || [];
        const newHarvests = details.newHarvests || [];
        
        if (changes.length === 0 && newNegatives.length === 0 && newHarvests.length === 0) {
            // Handle case for failures or other details without specific actions
            if (details.failures && details.failures.length > 0) {
                 return <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.8rem' }}>{JSON.stringify(details, null, 2)}</pre>
            }
            return <span>{log.summary}</span>;
        }
        
        const timeWindowText = (metric: TriggeringMetric) => 
            metric.timeWindow === 'TODAY' ? 'Today' : `${metric.timeWindow} days`;

        const formatMetricValue = (value: number, metric: TriggeringMetric['metric']) => {
            switch (metric) {
                case 'acos': return formatPercent(value);
                case 'budgetUtilization': return `${Number(value).toFixed(2)}%`;
                case 'roas': return value.toFixed(2);
                case 'spend': case 'sales': return formatPrice(value);
                default: return formatNumber(value);
            }
        };

        return (
            <ul style={styles.detailsList}>
                 {newHarvests.map((harvest: LogHarvest, index) => {
                    let text = `Harvested "${harvest.searchTerm}"`;
                    if (harvest.actionType === 'CREATE_NEW_CAMPAIGN') {
                        text += harvest.newCampaignName ? ` into new campaign "${harvest.newCampaignName}".` : ` into new campaign ${harvest.newCampaignId}.`;
                    } else {
                        text += ` into existing campaign ${harvest.targetCampaignId}.`;
                    }
                    return (
                         <li key={`h-${index}`}>
                            {text}
                            {(harvest.triggeringMetrics && harvest.triggeringMetrics.length > 0) && (
                                <ul style={styles.metricList}>
                                    {harvest.triggeringMetrics.map((metric, mIndex) => (
                                        <li key={mIndex} style={styles.metricListItem}>
                                            {metric.metric} ({timeWindowText(metric)}) was <strong>{formatMetricValue(metric.value, metric.metric)}</strong> (Condition: {metric.condition})
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    )
                })}
                {changes.map((change, index) => {
                    if (typeof change.oldBudget !== 'undefined' && typeof change.newBudget !== 'undefined') {
                        return ( <li key={`c-${index}`}> Budget changed from {formatPrice(change.oldBudget)} to {formatPrice(change.newBudget)} </li> );
                    }
                    if (typeof change.oldBid !== 'undefined' && typeof change.newBid !== 'undefined') {
                        return ( <li key={`c-${index}`}> Target "{change.entityText}": bid changed from {formatPrice(change.oldBid)} to {formatPrice(change.newBid)} </li> );
                    }
                    return null;
                })}
                {newNegatives.map((neg, index) => (
                    <li key={`n-${index}`}>
                         Negated "{neg.searchTerm}" as {neg.matchType?.replace(/_/g, ' ')}
                         {neg.triggeringMetrics && neg.triggeringMetrics.length > 0 && (
                             <ul style={styles.metricList}>
                                {neg.triggeringMetrics.map((metric, mIndex) => (
                                    <li key={mIndex} style={styles.metricListItem}>
                                        {metric.metric} ({metric.timeWindow} days) was <strong>{formatMetricValue(metric.value, metric.metric)}</strong> (Condition: {metric.condition})
                                    </li>
                                ))}
                            </ul>
                         )}
                    </li>
                ))}
            </ul>
        );
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
                                            {renderLogDetails(log)}
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

// --- Full Implementation of RuleBuilderModal ---
const RuleBuilderModal = ({ rule, modalTitle, onClose, onSave, campaigns }: { rule: AutomationRule | null, modalTitle: string, onClose: () => void, onSave: (data: AutomationRule) => void, campaigns: Campaign[] }) => {
    const [formData, setFormData] = useState<AutomationRule>(rule!);

    if (!formData) return null;

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleConfigChange = (path: string, value: any) => {
        setFormData(prev => {
            const keys = path.split('.');
            const newConfig = { ...prev.config };
            let currentLevel: any = newConfig;
            for (let i = 0; i < keys.length - 1; i++) {
                currentLevel = currentLevel[keys[i]];
            }
            currentLevel[keys[keys.length - 1]] = value;
            return { ...prev, config: newConfig };
        });
    };
    
    // ... [Add more specific handlers for conditions, actions, etc.]

    return (
        <div style={styles.modalBackdrop} onClick={onClose}>
            <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                <h2 style={styles.modalHeader}>{modalTitle}</h2>
                <form style={styles.form} onSubmit={e => { e.preventDefault(); onSave(formData); }}>
                    {/* General Info Card */}
                    <div style={styles.card}>
                        <h3 style={styles.cardTitle}>General</h3>
                        <div style={styles.formGroup}>
                            <label style={styles.label} htmlFor="ruleName">Rule Name</label>
                            <input id="ruleName" style={styles.input} name="name" value={formData.name} onChange={handleInputChange} required />
                        </div>
                    </div>
                    
                    {/* Scope Card */}
                    {formData.rule_type !== 'PRICE_ADJUSTMENT' && (
                        <div style={styles.card}>
                            <h3 style={styles.cardTitle}>Scope</h3>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Apply to Campaigns</label>
                                <select 
                                    multiple 
                                    style={{...styles.input, height: '150px'}}
                                    value={(formData.scope.campaignIds || []).map(String)}
                                    onChange={e => {
                                        const selectedIds = Array.from(e.target.selectedOptions, option => option.value);
                                        setFormData(prev => ({...prev, scope: {...prev.scope, campaignIds: selectedIds}}));
                                    }}
                                >
                                    {campaigns.map(c => <option key={c.campaignId} value={c.campaignId}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>
                    )}
                    
                    {/* Configuration & Actions Cards will go here */}
                    {/* This would be a very large component with dynamic fields based on formData.rule_type */}
                    <div style={styles.card}>
                        <h3 style={styles.cardTitle}>Configuration</h3>
                        <p>Full form for conditions and actions would be implemented here.</p>
                    </div>

                    <div style={styles.modalFooter}>
                        <div style={styles.activeCheckboxContainer}>
                            <input id="is_active" type="checkbox" name="is_active" checked={formData.is_active} onChange={handleInputChange} style={{width: '18px', height: '18px'}} />
                            <label htmlFor="is_active" style={styles.label}>Rule is Active</label>
                        </div>
                        <button type="button" style={{...styles.button, color: '#333'}} onClick={onClose}>Cancel</button>
                        <button type="submit" style={styles.primaryButton}>Save Rule</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
