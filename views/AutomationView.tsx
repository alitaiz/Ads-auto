import React, { useEffect, useState, useCallback } from 'react';

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

const RuleSamplesTab = () => {
    const [activeSampleTab, setActiveSampleTab] = useState('bid');

    const sampleStyles: { [key: string]: React.CSSProperties } = {
        container: { padding: '20px 0' },
        tabs: { display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' },
        tabButton: { padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--border-color)', background: 'none', cursor: 'pointer', fontSize: '0.9rem' },
        tabButtonActive: { background: 'var(--primary-color)', color: 'white', borderColor: 'var(--primary-color)' },
        grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' },
        card: { backgroundColor: 'var(--card-background-color)', borderRadius: '8px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '15px' },
        cardTitle: { margin: '0 0 5px 0', fontSize: '1.2rem', color: 'var(--primary-color)', fontWeight: 600 },
        cardSection: { margin: 0 },
        cardSectionTitle: { fontWeight: 'bold', marginBottom: '5px', color: 'var(--text-color)', fontSize: '0.95rem' },
        cardText: { margin: 0, lineHeight: 1.6, color: '#333', fontSize: '0.9rem' }
    };

    const bidSamples = [
        {
            title: "Quy tắc Bảo thủ: Cắt lỗ từ khóa ACOS cao",
            description: "NẾU một từ khóa có ACOS > 40% VÀ có hơn 10 lượt nhấp trong 14 ngày qua, THÌ hệ thống sẽ GIẢM 15% giá thầu.",
            hypothesis: "Từ từ giảm chi tiêu lãng phí cho các từ khóa không sinh lời mà không gây rủi ro sụt giảm doanh số đột ngột. Phù hợp cho các chiến dịch đã ổn định cần tối ưu lợi nhuận."
        },
        {
            title: "Quy tắc Tấn công: Tăng tốc từ khóa hiệu quả",
            description: "NẾU một từ khóa có ACOS < 15% VÀ có ít nhất 2 đơn hàng trong 14 ngày qua, THÌ hệ thống sẽ TĂNG 20% giá thầu để chiếm vị trí tốt hơn.",
            hypothesis: "Nhanh chóng mở rộng phạm vi tiếp cận của các từ khóa đang hoạt động tốt để chiếm lĩnh thị phần và tối đa hóa doanh thu. Phù hợp cho giai đoạn ra mắt sản phẩm hoặc tăng trưởng mạnh."
        },
        {
            title: "Quy tắc 'Mồi câu': Thúc đẩy từ khóa tiềm năng",
            description: "NẾU một từ khóa có CTR (Tỷ lệ nhấp) > 0.5% VÀ có hơn 15 lượt nhấp nhưng CHƯA có đơn hàng, THÌ hệ thống sẽ TĂNG nhẹ giá thầu 10%.",
            hypothesis: "Cho các từ khóa hứa hẹn (khách hàng quan tâm, nhấp nhiều) một cơ hội tốt hơn để chuyển đổi bằng cách cải thiện vị trí quảng cáo. Có thể giúp phát hiện những 'viên ngọc ẩn'."
        }
    ];

    const searchTermSamples = [
        {
            title: "Quy tắc Dọn dẹp: Phủ định search term rác",
            description: "NẾU một cụm từ tìm kiếm (search term) đã chi tiêu > $20 VÀ có > 15 lượt nhấp MÀ KHÔNG có đơn hàng nào trong 30 ngày qua, THÌ hệ thống sẽ tự động thêm nó làm từ khóa PHỦ ĐỊNH (chính xác).",
            hypothesis: "Ngừng lãng phí ngân sách vào các cụm từ tìm kiếm rõ ràng không liên quan hoặc không có khả năng chuyển đổi, giúp ACOS chung của chiến dịch giảm xuống."
        },
        {
            title: "Quy tắc Thu hoạch: Chuyển đổi search term thành từ khóa",
            description: "NẾU một search term trong chiến dịch Tự động hoặc Rộng có > 2 đơn hàng VÀ ACOS < 30% trong 30 ngày qua, THÌ hệ thống sẽ tự động tạo một TỪ KHÓA mới (chính xác) từ search term đó.",
            hypothesis: "Tìm ra các từ khóa mới, lợi nhuận cao trực tiếp từ hành vi tìm kiếm của khách hàng. Việc chuyển chúng thành từ khóa chính xác giúp kiểm soát giá thầu và ngân sách tốt hơn."
        },
        {
            title: "Quy tắc Phòng vệ & Mở rộng",
            description: "Giám sát các search term chứa tên thương hiệu. NẾU có một search term KHÔNG chứa tên thương hiệu nhưng lại tạo ra đơn hàng cho sản phẩm thương hiệu với ACOS tốt, THÌ chuyển nó thành từ khóa mới.",
            hypothesis: "Đảm bảo khả năng hiển thị tối đa cho các tìm kiếm liên quan đến thương hiệu và nắm bắt các cơ hội từ khóa mới có liên quan gián tiếp, mở rộng tệp khách hàng."
        }
    ];

    return (
        <div style={sampleStyles.container}>
            <h2 style={styles.contentTitle}>Ví dụ về các Quy tắc Tự động hóa</h2>
            <p style={{color: '#555', marginTop: 0, marginBottom: '20px'}}>Sử dụng các mẫu này làm nguồn cảm hứng để xây dựng chiến lược tự động hóa của riêng bạn.</p>
            <div style={sampleStyles.tabs}>
                <button
                    style={activeSampleTab === 'bid' ? {...sampleStyles.tabButton, ...sampleStyles.tabButtonActive} : sampleStyles.tabButton}
                    onClick={() => setActiveSampleTab('bid')}>
                    Mẫu Điều Chỉnh Giá Thầu
                </button>
                <button
                    style={activeSampleTab === 'searchTerm' ? {...sampleStyles.tabButton, ...sampleStyles.tabButtonActive} : sampleStyles.tabButton}
                    onClick={() => setActiveSampleTab('searchTerm')}>
                    Mẫu Tự Động Hóa Search Term
                </button>
            </div>
            <div style={sampleStyles.grid}>
                {(activeSampleTab === 'bid' ? bidSamples : searchTermSamples).map(sample => (
                    <div key={sample.title} style={sampleStyles.card}>
                        <h3 style={sampleStyles.cardTitle}>{sample.title}</h3>
                        <div style={sampleStyles.cardSection}>
                            <p style={sampleStyles.cardSectionTitle}>Mô tả:</p>
                            <p style={sampleStyles.cardText}>{sample.description}</p>
                        </div>
                        <div style={sampleStyles.cardSection}>
                            <p style={sampleStyles.cardSectionTitle}>Giả thuyết:</p>
                            <p style={sampleStyles.cardText}>{sample.hypothesis}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};


export function AutomationView() {
  const [activeTab, setActiveTab] = useState('bidAdjustment');
  const [rules, setRules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState({ rules: true, logs: true });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

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
  
  const handleOpenModal = (rule = null) => {
    setEditingRule(rule);
    setIsModalOpen(true);
  };

  const handleSaveRule = async (formData) => {
    const { id, ...data } = formData;
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/automation/rules/${id}` : '/api/automation/rules';
    
    // For now, hardcode profileId. A profile selector should be added later.
    const payload = { ...data, profile_id: localStorage.getItem('selectedProfileId') || 'UNKNOWN' };

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setIsModalOpen(false);
    setEditingRule(null);
    fetchRules();
  };

  const handleDeleteRule = async (id) => {
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
        <button style={activeTab === 'samples' ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton} onClick={() => setActiveTab('samples')}>Rule Samples</button>
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
      {activeTab === 'samples' && <RuleSamplesTab />}
      
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

const RulesList = ({ rules, onEdit, onDelete }) => (
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

const LogsTab = ({ logs, loading }) => (
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

const RuleBuilderModal = ({ rule, ruleType, onClose, onSave }) => {
    const [formData, setFormData] = useState(() => {
        if (rule) return { ...rule };
        return {
            name: '',
            rule_type: ruleType === 'bidAdjustment' ? 'BID_ADJUSTMENT' : 'SEARCH_TERM_AUTOMATION',
            config: ruleType === 'bidAdjustment' ? DEFAULT_BID_RULE_CONFIG : DEFAULT_SEARCH_TERM_RULE_CONFIG,
            scope: { campaignIds: [] },
            is_active: true,
        };
    });

    const handleConfigChange = (path, value) => {
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

    return (
        <div style={styles.modalBackdrop}>
            <div style={styles.modalContent}>
                <h2 style={styles.modalHeader}>{rule ? 'Edit' : 'Create'} {ruleType === 'bidAdjustment' ? 'Bid Adjustment' : 'Search Term'} Rule</h2>
                <form style={styles.form} onSubmit={e => { e.preventDefault(); onSave(formData); }}>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Rule Name</label>
                        <input style={styles.input} value={formData.name} onChange={e => setFormData(p => ({...p, name: e.target.value}))} required />
                    </div>
                    
                    {ruleType === 'bidAdjustment' && <BidAdjustmentForm config={formData.config} onChange={handleConfigChange} />}
                    {ruleType === 'searchTerm' && <SearchTermForm config={formData.config} onChange={handleConfigChange} />}
                    
                     <div style={{...styles.formGroup, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                        <label style={styles.label}>Rule is Active</label>
                        <input type="checkbox" style={{ transform: 'scale(1.5)' }} checked={formData.is_active} onChange={e => setFormData(p => ({...p, is_active: e.target.checked}))} />
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

const BidAdjustmentForm = ({ config, onChange }) => (
    <>
        <div style={styles.formSection}>
            <h4 style={styles.formSectionTitle}>Conditions (IF)</h4>
            <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                    <label style={styles.label} title="The desired Advertising Cost of Sales. If a keyword's ACOS is above this target, its bid will be lowered. If it's significantly below, the bid may be raised.">Target ACOS (%)</label>
                    <input type="number" style={styles.input} value={config.targetAcos * 100} onChange={e => onChange('targetAcos', Number(e.target.value) / 100)} step="1" />
                </div>
                <div style={styles.formGroup}>
                    <label style={styles.label} title="The number of past days of performance data (e.g., 7, 14, 30) the engine will analyze to make a decision.">Lookback Period (Days)</label>
                    <input type="number" style={styles.input} value={config.lookbackDays} onChange={e => onChange('lookbackDays', Number(e.target.value))} />
                </div>
                <div style={styles.formGroup}>
                    <label style={styles.label} title="The keyword must have at least this many clicks in the lookback period to be considered for a bid adjustment. This prevents changes based on insufficient data.">Minimum Clicks</label>
                    <input type="number" style={styles.input} value={config.minClicks} onChange={e => onChange('minClicks', Number(e.target.value))} />
                </div>
            </div>
        </div>
        <div style={styles.formSection}>
            <h4 style={styles.formSectionTitle}>Actions (THEN)</h4>
             <div style={styles.formGrid}>
                 <div style={styles.formGroup}>
                    <label style={styles.label} title="The percentage to increase the bid if the keyword is performing well below the Target ACOS.">Increase Bid By (%)</label>
                    <input type="number" style={styles.input} value={config.bidUpPct} onChange={e => onChange('bidUpPct', Number(e.target.value))} />
                </div>
                 <div style={styles.formGroup}>
                    <label style={styles.label} title="The percentage to decrease the bid if the keyword's ACOS is too high.">Decrease Bid By (%)</label>
                    <input type="number" style={styles.input} value={config.bidDownPct} onChange={e => onChange('bidDownPct', Number(e.target.value))} />
                </div>
            </div>
        </div>
         <div style={styles.formSection}>
            <h4 style={styles.formSectionTitle}>Safeguards</h4>
             <div style={styles.formGrid}>
                 <div style={styles.formGroup}>
                    <label style={styles.label} title="The smallest monetary amount a bid can be changed by in a single adjustment. Prevents tiny, insignificant changes (e.g., $0.01).">Min Bid Step ($)</label>
                    <input type="number" style={styles.input} value={config.minStep} onChange={e => onChange('minStep', Number(e.target.value))} step="0.01" />
                </div>
                 <div style={styles.formGroup}>
                    <label style={styles.label} title="The largest monetary amount a bid can be changed by in a single adjustment. This prevents drastic, risky changes.">Max Bid Step ($)</label>
                    <input type="number" style={styles.input} value={config.maxStep} onChange={e => onChange('maxStep', Number(e.target.value))} step="0.01" />
                </div>
                 <div style={styles.formGroup}>
                    <label style={styles.label} title="The number of hours the engine must wait before re-evaluating the same keyword after an adjustment has been made. This allows time to gather new performance data.">Cooldown (Hours)</label>
                    <input type="number" style={styles.input} value={config.cooldownHours} onChange={e => onChange('cooldownHours', Number(e.target.value))} />
                </div>
            </div>
        </div>
    </>
);

const SearchTermForm = ({ config, onChange }) => (
    <>
       <div style={styles.formSection}>
            <h4 style={styles.formSectionTitle}>General</h4>
            <div style={styles.formGrid}>
                 <div style={styles.formGroup}>
                    <label style={styles.label} title="The number of past days of performance data the engine will analyze to evaluate search terms.">Lookback Period (Days)</label>
                    <input type="number" style={styles.input} value={config.lookbackDays} onChange={e => onChange('lookbackDays', Number(e.target.value))} />
                </div>
                <div style={styles.formGroup}>
                    <label style={styles.label} title="The number of hours the engine must wait before re-evaluating the same search term after an action has been taken.">Cooldown (Hours)</label>
                    <input type="number" style={styles.input} value={config.cooldownHours} onChange={e => onChange('cooldownHours', Number(e.target.value))} />
                </div>
            </div>
       </div>
       <div style={styles.formSection}>
            <h4 style={styles.formSectionTitle}>Negative Keyword Action</h4>
            <div style={styles.formGrid}>
                <div style={styles.formGroup}><label style={styles.label} title="The search term must have at least this many clicks with zero orders to be considered for negation.">Min Clicks</label><input type="number" style={styles.input} value={config.negative.minClicks} onChange={e => onChange('negative.minClicks', Number(e.target.value))} /></div>
                <div style={styles.formGroup}><label style={styles.label} title="The search term must have spent more than this amount with zero orders to be considered for negation.">Max Spend ($)</label><input type="number" step="0.01" style={styles.input} value={config.negative.maxSpend} onChange={e => onChange('negative.maxSpend', Number(e.target.value))} /></div>
                <div style={styles.formGroup}><label style={styles.label} title="This must be 0. The rule only negates terms that have produced no orders.">Min Orders (must be 0)</label><input type="number" style={styles.input} value={0} disabled /></div>
                <div style={styles.formGroup}><label style={styles.label} title="The match type (Negative Exact or Negative Phrase) to use when creating the negative keyword.">Match Type</label><select style={styles.input} value={config.negative.matchType} onChange={e => onChange('negative.matchType', e.target.value)}><option value="NEGATIVE_EXACT">Negative Exact</option><option value="NEGATIVE_PHRASE">Negative Phrase</option></select></div>
            </div>
       </div>
        <div style={styles.formSection}>
            <h4 style={styles.formSectionTitle}>Promote to Keyword Action</h4>
            <div style={styles.formGrid}>
                <div style={styles.formGroup}><label style={styles.label} title="The search term must have at least this many orders to be considered for promotion to a new keyword.">Min Orders</label><input type="number" style={styles.input} value={config.promote.minOrders} onChange={e => onChange('promote.minOrders', Number(e.target.value))} /></div>
                <div style={styles.formGroup}><label style={styles.label} title="The search term's ACOS must be below this threshold to be considered for promotion. This ensures only profitable terms are promoted.">Max ACOS (%)</label><input type="number" style={styles.input} value={config.promote.maxAcos * 100} onChange={e => onChange('promote.maxAcos', Number(e.target.value) / 100)} /></div>
                <div style={styles.formGroup}><label style={styles.label} title="The bid that will be set for the newly created keyword.">Initial Bid ($)</label><input type="number" step="0.01" style={styles.input} value={config.promote.initialBid} onChange={e => onChange('promote.initialBid', Number(e.target.value))} /></div>
            </div>
       </div>
    </>
);