// views/AutomationView.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { AutomationRule } from '../types';
import { RuleGuideContent } from './components/RuleGuideContent';
import { RuleBuilderModal } from './automation/RuleBuilderModal';
import { RulesList } from './automation/RulesList';
import { LogsTab } from './automation/LogsTab';

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
};

const getDefaultRuleConfig = () => ({
    frequency: { unit: 'hours' as 'minutes' | 'hours' | 'days', value: 1 },
    cooldown: { unit: 'hours' as 'minutes' | 'hours' | 'days', value: 24 }
});

const getDefaultRule = (ruleType: AutomationRule['rule_type'], adType: 'SP' | 'SB' | 'SD' | undefined): Partial<AutomationRule> => {
    let conditionGroups: any[] = [];
    let specificConfig: Partial<AutomationRule['config']> = {};

    switch (ruleType) {
        case 'SEARCH_TERM_AUTOMATION':
            conditionGroups = [{
                conditions: [
                    { metric: 'spend', timeWindow: 30, operator: '>', value: 10 },
                    { metric: 'orders', timeWindow: 30, operator: '=', value: 0 }
                ],
                action: { type: 'negateSearchTerm', matchType: 'NEGATIVE_EXACT' }
            }];
            specificConfig = { frequency: { unit: 'days', value: 1 } };
            break;
        case 'AI_SEARCH_TERM_NEGATION':
            conditionGroups = [{
                conditions: [
                    { metric: 'spend', timeWindow: 3, operator: '>', value: 0 },
                    { metric: 'orders', timeWindow: 3, operator: '=', value: 0 }
                ],
                action: {} // No action needed here, it's implicit
            }];
            specificConfig = {
                frequency: { unit: 'days', value: 1, startTime: '02:30' },
                cooldown: { unit: 'days', value: 90 },
                negationScope: 'AD_GROUP',
            };
            break;
        case 'SEARCH_TERM_HARVESTING':
             conditionGroups = [{
                conditions: [
                    { metric: 'orders', timeWindow: 60, operator: '>', value: 2 },
                    { metric: 'acos', timeWindow: 60, operator: '<', value: 0.30 }
                ],
                 action: { type: 'CREATE_NEW_CAMPAIGN', matchType: 'EXACT', newCampaignBudget: 10.00, bidOption: { type: 'CPC_MULTIPLIER', value: 1.15 }, autoNegate: true }
            }];
             specificConfig = { frequency: { unit: 'days', value: 1 } };
             break;
        case 'BUDGET_ACCELERATION':
            conditionGroups = [{
                conditions: [
                    { metric: 'roas', timeWindow: 'TODAY', operator: '>', value: 2.5 },
                    { metric: 'budgetUtilization', timeWindow: 'TODAY', operator: '>', value: 75 }
                ],
                action: { type: 'increaseBudgetPercent', value: 50 }
            }];
            specificConfig = {
                frequency: { unit: 'minutes', value: 30 },
                cooldown: { unit: 'hours', value: 0 }
            };
            break;
        case 'PRICE_ADJUSTMENT':
            return {
                name: '', rule_type: ruleType,
                config: {
                    skus: [], priceStep: 0.50, priceLimit: 99.99, runAtTime: '02:00',
                    frequency: { unit: 'days', value: 1 }, cooldown: { unit: 'hours', value: 0 }
                },
                scope: {}, is_active: true,
            };
        case 'BID_ADJUSTMENT':
        default:
             conditionGroups = [{
                conditions: [{ metric: 'acos', timeWindow: 14, operator: '>', value: 0.40 }],
                action: { type: 'decreaseBidPercent', value: 10 }
            }];
            break;
    }

    return {
        name: '', rule_type: ruleType, ad_type: adType || 'SP',
        config: { ...getDefaultRuleConfig(), ...specificConfig, conditionGroups },
        scope: { campaignIds: [] }, is_active: true,
    };
};


const TABS = [
    { id: 'SP_BID_ADJUSTMENT', label: 'SP Bid Adjustment', type: 'BID_ADJUSTMENT', adType: 'SP' },
    { id: 'SB_BID_ADJUSTMENT', label: 'SB Bid Adjustment', type: 'BID_ADJUSTMENT', adType: 'SB' },
    { id: 'SD_BID_ADJUSTMENT', label: 'SD Bid Adjustment', type: 'BID_ADJUSTMENT', adType: 'SD' },
    { id: 'SEARCH_TERM_NEGATION', label: 'SP Search Term Negation', type: 'SEARCH_TERM_AUTOMATION', adType: 'SP' },
    { id: 'AI_SEARCH_TERM_NEGATION', label: 'AI Search Term Negation', type: 'AI_SEARCH_TERM_NEGATION', adType: 'SP' },
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
  const [editingRule, setEditingRule] = useState<AutomationRule | Partial<AutomationRule> | null>(null);
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
    const formDataCopy = JSON.parse(JSON.stringify(formData));

    if (formDataCopy.rule_type === 'PRICE_ADJUSTMENT' && formDataCopy.config?.skus) {
        formDataCopy.config.skus = formDataCopy.config.skus.filter((sku: string) => sku && sku.trim());
    }
      
    const { id, ...data } = formDataCopy;
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
            scope: data.scope,
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
    if (activeTab.type === 'BID_ADJUSTMENT') {
        return (r.ad_type || 'SP') === (activeTab as any).adType;
    }
    return true;
  });
  
  const profileId = localStorage.getItem('selectedProfileId');
  const bidAdjustmentRules = useMemo(() => rules.filter(r => r.rule_type === 'BID_ADJUSTMENT' && r.ad_type === 'SP' && r.profile_id === profileId), [rules, profileId]);
  const budgetAccelerationRules = useMemo(() => rules.filter(r => r.rule_type === 'BUDGET_ACCELERATION' && r.ad_type === 'SP' && r.profile_id === profileId), [rules, profileId]);

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
              modalTitle={editingRule && 'id' in editingRule ? `Edit ${activeTab.label} Rule` : `Create New ${activeTab.label} Rule`}
              onClose={() => setIsModalOpen(false)}
              onSave={handleSaveRule}
              bidAdjustmentRules={bidAdjustmentRules}
              budgetAccelerationRules={budgetAccelerationRules}
          />
      )}
    </div>
  );
}