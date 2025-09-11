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
            title: "Quy tắc Bảo thủ: Tối ưu Lợi nhuận & Cắt lỗ",
            description: "IF: ACOS trong 14 ngày qua > 40% AND có > 10 clicks. THEN: GIẢM 15% giá thầu. SAFEGUARDS: Hệ thống sẽ không giảm giá thầu quá 0.25$ trong một lần điều chỉnh (Max Step) và sẽ đợi 24 giờ (Cooldown) trước khi đánh giá lại, tránh các thay đổi quá đột ngột.",
            hypothesis: "Từ từ giảm chi tiêu cho các từ khóa không hiệu quả để cải thiện lợi nhuận chung. Các 'giới hạn an toàn' (safeguards) ngăn chặn việc giảm giá thầu quá nhanh có thể làm mất hoàn toàn hiển thị."
        },
        {
            title: "Quy tắc Tấn công: Mở rộng Hiển thị & Tăng trưởng",
            description: "IF: ACOS trong 14 ngày qua < 15% AND có > 2 đơn hàng. THEN: TĂNG 20% giá thầu để chiếm vị trí tốt hơn. SAFEGUARDS: Mức tăng giá thầu cũng được kiểm soát bởi 'Max Step' để không làm ACOS tăng vọt. 'Cooldown' đảm bảo hệ thống có thời gian đánh giá tác động của việc tăng giá thầu.",
            hypothesis: "Đẩy mạnh ngân sách vào những gì đang hoạt động tốt nhất để tối đa hóa doanh thu và chiếm lĩnh thị phần. Phù hợp cho giai đoạn ra mắt sản phẩm hoặc khi muốn tăng trưởng mạnh mẽ."
        },
        {
            title: "Quy tắc 'Mồi câu': Thúc đẩy Từ khóa Tiềm năng",
            description: "IF: CTR (Tỷ lệ nhấp) > 0.5% AND có > 15 clicks BUT chưa có đơn hàng nào. THEN: TĂNG nhẹ 10% giá thầu. SAFEGUARDS: Mức tăng nhỏ và có 'Cooldown' giúp thử nghiệm một cách an toàn mà không lãng phí nhiều ngân sách vào một từ khóa chưa chắc chắn.",
            hypothesis: "Cho các từ khóa 'hứa hẹn' (khách hàng quan tâm, nhấp nhiều) một cơ hội tốt hơn để chuyển đổi. Đây là một chiến lược thử nghiệm có kiểm soát để tìm ra những 'viên ngọc ẩn'."
        }
    ];

    const searchTermSamples = [
        {
            title: "Quy tắc Dọn dẹp: Tự động Phủ định Search Term Lãng phí",
            description: "IF: Một search term đã có > 15 clicks AND đã chi tiêu > $20 BUT không có đơn hàng nào trong 30 ngày qua. THEN: Tự động thêm search term này làm TỪ KHÓA PHỦ ĐỊNH CHÍNH XÁC. SAFEGUARDS: 'Cooldown' 72 giờ đảm bảo một search term không bị phủ định quá sớm, cho nó đủ thời gian để tạo ra chuyển đổi.",
            hypothesis: "Ngừng lãng phí ngân sách vào các cụm từ tìm kiếm không chuyển đổi. Theo thời gian, hành động này sẽ cải thiện đáng kể ACOS của toàn bộ chiến dịch."
        },
        {
            title: "Quy tắc Thu hoạch: Chuyển đổi Search Term Tốt thành Từ khóa",
            description: "IF: Một search term trong chiến dịch Tự động/Rộng có > 2 đơn hàng AND ACOS < 30% trong 30 ngày qua. THEN: Tự động tạo một TỪ KHÓA CHÍNH XÁC mới từ search term này với giá thầu khởi điểm là $0.75. SAFEGUARDS: 'Cooldown' ngăn việc tạo ra các từ khóa trùng lặp.",
            hypothesis: "Tìm ra các từ khóa mới, hiệu quả cao trực tiếp từ hành vi của khách hàng. Chuyển chúng sang đối sánh chính xác cho phép kiểm soát giá thầu và ngân sách tốt hơn."
        },
        {
            title: "Quy tắc Phòng vệ & Mở rộng Thương hiệu",
            description: "IF: Một search term CHỨA TÊN THƯƠNG HIỆU của bạn nhưng lại có ACOS cao > 25%. THEN: Có thể tạo một quy tắc Bid Adjustment riêng để tăng giá thầu cho các từ khóa thương hiệu. IF: Một search term KHÔNG CHỨA TÊN THƯƠNG HIỆU nhưng lại tạo ra > 1 đơn hàng với ACOS tốt < 35%. THEN: Chuyển nó thành một từ khóa mới.",
            hypothesis: "Sử dụng tự động hóa để vừa bảo vệ không gian thương hiệu của bạn, vừa khám phá các cơ hội tăng trưởng mới từ các tìm kiếm không liên quan trực tiếp đến thương hiệu."
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

const SearchTermForm = ({ config, onChange }) => (
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