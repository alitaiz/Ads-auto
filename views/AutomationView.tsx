import React, { useEffect, useState, useCallback } from 'react';
import { AutomationRule } from '../types';

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
  modalContent: { backgroundColor: 'white', padding: '30px', borderRadius: 'var(--border-radius)', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: { fontSize: '1.5rem', marginBottom: '20px' },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  formSection: { border: '1px solid var(--border-color)', borderRadius: '4px', padding: '15px' },
  formSectionTitle: { fontWeight: 600, margin: '-15px 0 15px', padding: '0 5px', background: 'white', width: 'fit-content' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' },
  label: { fontWeight: 500, fontSize: '0.9rem', cursor: 'help' },
  input: { padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '1rem' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '30px' },
  logTable: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: { textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--border-color)' },
  td: { padding: '8px', borderBottom: '1px solid var(--border-color)'},
  strategyDescription: { backgroundColor: '#f0f2f2', padding: '15px', borderRadius: '4px', margin: '10px 0', fontStyle: 'italic', color: '#333' }
};

const DEFAULT_BID_RULE_CONFIG = {
    targetAcos: 0.40,
    lookbackDays: 14,
    minClicks: 10,
    bidUpPct: 15,
    increaseThresholdPct: 50,
    bidDownPct: 15,
    minStep: 0.05,
    maxStep: 0.25,
    cooldownHours: 24,
};

const DEFAULT_SEARCH_TERM_RULE_CONFIG = {
    lookbackDays: 30,
    cooldownHours: 72,
    negative: {
        enabled: true,
        minClicks: 10,
        maxSpend: 20.00,
        minOrders: 0,
        matchType: 'NEGATIVE_EXACT'
    },
    promote: {
        enabled: true,
        minOrders: 2,
        maxAcos: 0.35,
        initialBid: 0.75
    }
};

const BID_STRATEGIES = [
    { id: 'custom', name: 'Custom Bid Rule' },
    { id: 'BID_RULE_1', name: 'Strategy: High Spend, Zero Sales', description: 'If a keyword spends more than $20 in 60 days with no sales, reduce its bid by 25%.' },
    { id: 'BID_RULE_2', name: 'Strategy: Consistently High ACOS', description: 'If a keyword spends > $20 in 60 days with an ACOS > 35%, AND its ACOS in the last 14 days is also > 35%, reduce its bid by 5%.' },
    { id: 'BID_RULE_3', name: 'Strategy: Recent Underperformance', description: 'If a keyword had sales in the last 60 days but none in the last 14, AND has spent > $10 in the last 14 days, reduce its bid by 3%.' },
    { id: 'BID_RULE_4', name: 'Strategy: Consistently Strong Performance', description: 'If ACOS over 60 days and 14 days is less than 20%, increase bid by 3%.' },
    { id: 'BID_RULE_5', name: 'Strategy: Elite Performance', description: 'If ACOS over 60 days and 14 days is less than 15%, increase bid by 3%.' },
    { id: 'BID_RULE_6', name: 'Strategy: Recent Improvement', description: 'If ACOS over 60 days was > 20% but has improved to < 15% in the last 14 days, increase bid by 3%.' },
];

const SEARCH_TERM_STRATEGIES = [
    { id: 'custom', name: 'Custom Search Term Rule' },
    { id: 'ST_RULE_1', name: 'Negative: High Spend, Zero Sales', description: 'If a search term spends more than $15 in 60 days with zero sales, add it as a negative exact match keyword.' },
    { id: 'ST_RULE_2', name: 'Negative: High ACOS & Recent Bleeder', description: 'If a search term has ACOS > 30% over 60 days, AND has spent > $15 in the last 14 days with zero sales, add it as a negative exact match keyword.' },
];

const RuleSamplesTab = () => {
    // ... (unchanged)
};


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
        {/* <button style={activeTab === 'samples' ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton} onClick={() => setActiveTab('samples')}>Rule Samples</button> */}
      </div>
      
      {activeTab !== 'history' && activeTab !== 'samples' && (
          <div style={styles.contentHeader}>
              <h2 style={styles.contentTitle}>{activeTab === 'bidAdjustment' ? 'Bid Adjustment Rules' : 'Search Term Automation Rules'}</h2>
              <button style={styles.primaryButton} onClick={() => handleOpenModal()}>+ Create New Rule</button>
          </div>
      )}

      {activeTab === 'bidAdjustment' && <RulesList rules={filteredRules} onEdit={handleOpenModal} onDelete={handleDeleteRule} />}
      {activeTab === 'searchTerm' && <RulesList rules={filteredRules} onEdit={handleOpenModal} onDelete={handleDeleteRule} />}
      {activeTab === 'history' && <LogsTab logs={logs} loading={loading.logs} />}
      {/* {activeTab === 'samples' && <RuleSamplesTab />} */}
      
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
        if (rule) return { ...rule };
        const isBid = ruleType === 'bidAdjustment';
        return {
            name: '',
            rule_type: isBid ? 'BID_ADJUSTMENT' : 'SEARCH_TERM_AUTOMATION',
            config: {
                strategyId: 'custom',
                ...(isBid ? DEFAULT_BID_RULE_CONFIG : DEFAULT_SEARCH_TERM_RULE_CONFIG)
            },
            scope: { campaignIds: [] },
            is_active: true,
        };
    });
    
    const strategyId = formData.config?.strategyId || 'custom';
    const strategies = ruleType === 'bidAdjustment' ? BID_STRATEGIES : SEARCH_TERM_STRATEGIES;
    const currentStrategy = strategies.find(s => s.id === strategyId);

    const handleConfigChange = (path: string, value: any) => {
        setFormData(prev => {
            const keys = path.split('.');
            const newConfig = JSON.parse(JSON.stringify(prev.config)); // Deep copy
            let current = newConfig;
            for (let i = 0; i < keys.length - 1; i++) {
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
            return { ...prev, config: newConfig };
        });
    };

    const handleStrategyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newStrategyId = e.target.value;
        const newConfig = {
            strategyId: newStrategyId,
            ...(newStrategyId === 'custom' ? 
                (ruleType === 'bidAdjustment' ? DEFAULT_BID_RULE_CONFIG : DEFAULT_SEARCH_TERM_RULE_CONFIG) 
                : {})
        };
        setFormData(prev => ({ ...prev, config: newConfig }));
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

                    <div style={styles.formGroup}>
                        <label style={styles.label}>Strategy</label>
                        <select style={styles.input} value={strategyId} onChange={handleStrategyChange}>
                            {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>

                    {currentStrategy && currentStrategy.id !== 'custom' && (
                        <div style={styles.strategyDescription}>
                            {currentStrategy.description}
                        </div>
                    )}
                    
                    {strategyId === 'custom' && ruleType === 'bidAdjustment' && <BidAdjustmentForm config={formData.config!} onChange={handleConfigChange} />}
                    {strategyId === 'custom' && ruleType === 'searchTerm' && <SearchTermForm config={formData.config!} onChange={handleConfigChange} />}
                    
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

const BidAdjustmentForm = ({ config, onChange }: {config: any, onChange: (path: string, value: any) => void}) => (
    <>
        <div style={styles.formSection}>
            <h4 style={styles.formSectionTitle}>Điều kiện (IF)</h4>
            <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                    <label style={styles.label} title="Chi phí quảng cáo trên doanh thu (ACOS) mục tiêu. Nếu ACOS của một từ khóa vượt quá mục tiêu này, giá thầu sẽ được giảm. Nếu thấp hơn đáng kể, giá thầu có thể được tăng lên.">ACOS Mục tiêu (%)</label>
                    <input type="number" style={styles.input} value={config.targetAcos * 100} onChange={e => onChange('targetAcos', Number(e.target.value) / 100)} step="1" />
                </div>
                <div style={styles.formGroup}>
                    <label style={styles.label} title="Số ngày dữ liệu hiệu suất trong quá khứ (ví dụ: 7, 14, 30) mà hệ thống sẽ phân tích để đưa ra quyết định.">Khoảng thời gian (Ngày)</label>
                    <input type="number" style={styles.input} value={config.lookbackDays} onChange={e => onChange('lookbackDays', Number(e.target.value))} />
                </div>
                <div style={styles.formGroup}>
                    <label style={styles.label} title="Từ khóa phải có ít nhất số lượt nhấp này trong khoảng thời gian nhìn lại để được xem xét điều chỉnh giá thầu. Điều này ngăn chặn các thay đổi dựa trên dữ liệu không đủ.">Lượt nhấp Tối thiểu</label>
                    <input type="number" style={styles.input} value={config.minClicks} onChange={e => onChange('minClicks', Number(e.target.value))} />
                </div>
            </div>
        </div>
        <div style={styles.formSection}>
            <h4 style={styles.formSectionTitle}>Hành động (THEN)</h4>
             <div style={styles.formGrid}>
                 <div style={styles.formGroup}>
                    <label style={styles.label} title="Phần trăm tăng giá thầu nếu từ khóa đang hoạt động tốt với ACOS thấp hơn nhiều so với ACOS Mục tiêu.">Tăng giá thầu (%)</label>
                    <input type="number" style={styles.input} value={config.bidUpPct} onChange={e => onChange('bidUpPct', Number(e.target.value))} />
                </div>
                 <div style={styles.formGroup}>
                    <label style={styles.label} title="Phần trăm giảm giá thầu nếu ACOS của từ khóa quá cao.">Giảm giá thầu (%)</label>
                    <input type="number" style={styles.input} value={config.bidDownPct} onChange={e => onChange('bidDownPct', Number(e.target.value))} />
                </div>
            </div>
        </div>
         <div style={styles.formSection}>
            <h4 style={styles.formSectionTitle}>Giới hạn An toàn</h4>
             <div style={styles.formGrid}>
                 <div style={styles.formGroup}>
                    <label style={styles.label} title="Mức thay đổi giá thầu tối thiểu (bằng tiền) trong một lần điều chỉnh. Ngăn chặn các thay đổi nhỏ, không đáng kể (ví dụ: $0.01).">Bước nhảy Tối thiểu ($)</label>
                    <input type="number" style={styles.input} value={config.minStep} onChange={e => onChange('minStep', Number(e.target.value))} step="0.01" />
                </div>
                 <div style={styles.formGroup}>
                    <label style={styles.label} title="Mức thay đổi giá thầu tối đa (bằng tiền) trong một lần điều chỉnh. Điều này ngăn chặn các thay đổi đột ngột, rủi ro.">Bước nhảy Tối đa ($)</label>
                    <input type="number" style={styles.input} value={config.maxStep} onChange={e => onChange('maxStep', Number(e.target.value))} step="0.01" />
                </div>
                 <div style={styles.formGroup}>
                    <label style={styles.label} title="Số giờ mà hệ thống phải chờ trước khi đánh giá lại cùng một từ khóa sau khi đã điều chỉnh. Điều này cho phép có thời gian thu thập dữ liệu hiệu suất mới.">Thời gian chờ (Giờ)</label>
                    <input type="number" style={styles.input} value={config.cooldownHours} onChange={e => onChange('cooldownHours', Number(e.target.value))} />
                </div>
            </div>
        </div>
    </>
);

const SearchTermForm = ({ config, onChange }: {config: any, onChange: (path: string, value: any) => void}) => (
    <>
       <div style={styles.formSection}>
            <h4 style={styles.formSectionTitle}>Chung</h4>
            <div style={styles.formGrid}>
                 <div style={styles.formGroup}>
                    <label style={styles.label} title="Số ngày dữ liệu hiệu suất trong quá khứ mà hệ thống sẽ phân tích để đánh giá các cụm từ tìm kiếm (search term).">Khoảng thời gian (Ngày)</label>
                    <input type="number" style={styles.input} value={config.lookbackDays} onChange={e => onChange('lookbackDays', Number(e.target.value))} />
                </div>
                <div style={styles.formGroup}>
                    <label style={styles.label} title="Số giờ mà hệ thống phải chờ trước khi đánh giá lại cùng một cụm từ tìm kiếm sau khi đã thực hiện một hành động.">Thời gian chờ (Giờ)</label>
                    <input type="number" style={styles.input} value={config.cooldownHours} onChange={e => onChange('cooldownHours', Number(e.target.value))} />
                </div>
            </div>
       </div>
       <div style={styles.formSection}>
            <h4 style={styles.formSectionTitle}>Hành động Phủ định</h4>
            <div style={styles.formGrid}>
                <div style={styles.formGroup}><label style={styles.label} title="Cụm từ tìm kiếm phải có ít nhất số lượt nhấp này và không có đơn hàng nào để được xem xét phủ định.">Lượt nhấp Tối thiểu</label><input type="number" style={styles.input} value={config.negative.minClicks} onChange={e => onChange('negative.minClicks', Number(e.target.value))} /></div>
                <div style={styles.formGroup}><label style={styles.label} title="Cụm từ tìm kiếm phải chi tiêu nhiều hơn số tiền này và không có đơn hàng nào để được xem xét phủ định.">Chi tiêu Tối đa ($)</label><input type="number" step="0.01" style={styles.input} value={config.negative.maxSpend} onChange={e => onChange('negative.maxSpend', Number(e.target.value))} /></div>
                <div style={styles.formGroup}><label style={styles.label} title="Giá trị này phải là 0. Quy tắc chỉ phủ định các cụm từ không tạo ra đơn hàng nào.">Đơn hàng Tối thiểu (phải là 0)</label><input type="number" style={styles.input} value={0} disabled /></div>
                <div style={styles.formGroup}><label style={styles.label} title="Loại đối sánh (Phủ định chính xác hoặc Phủ định cụm từ) sẽ được sử dụng khi tạo từ khóa phủ định.">Loại Đối sánh</label><select style={styles.input} value={config.negative.matchType} onChange={e => onChange('negative.matchType', e.target.value)}><option value="NEGATIVE_EXACT">Phủ định Chính xác</option><option value="NEGATIVE_PHRASE">Phủ định Cụm từ</option></select></div>
            </div>
       </div>
        <div style={styles.formSection}>
            <h4 style={styles.formSectionTitle}>Hành động Chuyển đổi thành Từ khóa</h4>
            <div style={styles.formGrid}>
                <div style={styles.formGroup}><label style={styles.label} title="Cụm từ tìm kiếm phải có ít nhất số đơn hàng này để được xem xét chuyển thành một từ khóa mới.">Đơn hàng Tối thiểu</label><input type="number" style={styles.input} value={config.promote.minOrders} onChange={e => onChange('promote.minOrders', Number(e.target.value))} /></div>
                <div style={styles.formGroup}><label style={styles.label} title="ACOS của cụm từ tìm kiếm phải thấp hơn ngưỡng này để được xem xét chuyển đổi. Điều này đảm bảo chỉ những cụm từ có lợi nhuận mới được chuyển đổi.">ACOS Tối đa (%)</label><input type="number" style={styles.input} value={config.promote.maxAcos * 100} onChange={e => onChange('promote.maxAcos', Number(e.target.value) / 100)} /></div>
                <div style={styles.formGroup}><label style={styles.label} title="Giá thầu sẽ được đặt cho từ khóa mới được tạo ra.">Giá thầu Ban đầu ($)</label><input type="number" step="0.01" style={styles.input} value={config.promote.initialBid} onChange={e => onChange('promote.initialBid', Number(e.target.value))} /></div>
            </div>
       </div>
    </>
);