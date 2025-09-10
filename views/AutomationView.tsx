import React, { useEffect, useState } from 'react';

const styles: { [key: string]: React.CSSProperties } = {
  container: { maxWidth: '900px', margin: '0 auto' },
  header: { marginBottom: '20px' },
  title: { fontSize: '2rem', margin: 0 },
  form: { display: 'grid', gap: '10px', marginBottom: '30px' },
  input: { padding: '8px', border: '1px solid var(--border-color)', borderRadius: '4px' },
  button: { padding: '10px 15px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', borderBottom: '1px solid var(--border-color)', padding: '8px' },
  td: { borderBottom: '1px solid var(--border-color)', padding: '8px', fontSize: '0.9rem' },
};

interface Rule {
  id: number;
  name: string;
  campaign_id: string;
  target_acos: number;
  min_clicks: number;
  bid_up_pct: number;
  bid_down_pct: number;
  lookback_days: number;
  cooldown_hours: number;
}

export function AutomationView() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedRule, setSelectedRule] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '',
    campaign_id: '',
    profile_id: '',
    target_acos: 0.4,
    min_clicks: 5,
    bid_up_pct: 10,
    bid_down_pct: 10,
    lookback_days: 14,
    cooldown_hours: 24,
  });

  const fetchRules = async () => {
    const res = await fetch('/api/automation/rules');
    setRules(await res.json());
  };

  const fetchLogs = async (ruleId: number) => {
    const res = await fetch(`/api/automation/logs?ruleId=${ruleId}`);
    setLogs(await res.json());
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/automation/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setForm({ ...form, name: '', campaign_id: '' });
    fetchRules();
  };

  const handleSelectRule = (id: number) => {
    setSelectedRule(id);
    fetchLogs(id);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Automation Rules</h1>
      </header>

      <form style={styles.form} onSubmit={handleSubmit}>
        <input style={styles.input} placeholder="Rule name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        <input style={styles.input} placeholder="Campaign ID" value={form.campaign_id} onChange={e => setForm({ ...form, campaign_id: e.target.value })} required />
        <input style={styles.input} placeholder="Profile ID" value={form.profile_id} onChange={e => setForm({ ...form, profile_id: e.target.value })} required />
        <input style={styles.input} type="number" step="0.01" placeholder="Target ACOS" value={form.target_acos} onChange={e => setForm({ ...form, target_acos: Number(e.target.value) })} />
        <input style={styles.input} type="number" placeholder="Min Clicks" value={form.min_clicks} onChange={e => setForm({ ...form, min_clicks: Number(e.target.value) })} />
        <input style={styles.input} type="number" placeholder="Bid Up %" value={form.bid_up_pct} onChange={e => setForm({ ...form, bid_up_pct: Number(e.target.value) })} />
        <input style={styles.input} type="number" placeholder="Bid Down %" value={form.bid_down_pct} onChange={e => setForm({ ...form, bid_down_pct: Number(e.target.value) })} />
        <input style={styles.input} type="number" placeholder="Lookback Days" value={form.lookback_days} onChange={e => setForm({ ...form, lookback_days: Number(e.target.value) })} />
        <input style={styles.input} type="number" placeholder="Cooldown Hours" value={form.cooldown_hours} onChange={e => setForm({ ...form, cooldown_hours: Number(e.target.value) })} />
        <button style={styles.button} type="submit">Create Rule</button>
      </form>

      {rules.length > 0 && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Name</th>
              <th style={styles.th}>Campaign</th>
              <th style={styles.th}>ACOS</th>
              <th style={styles.th}>Clicks</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.id}>
                <td style={styles.td}>{r.name}</td>
                <td style={styles.td}>{r.campaign_id}</td>
                <td style={styles.td}>{r.target_acos}</td>
                <td style={styles.td}>{r.min_clicks}</td>
                <td style={styles.td}><button style={styles.button} onClick={() => handleSelectRule(r.id)}>Logs</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedRule && logs.length > 0 && (
        <div style={{ marginTop: '30px' }}>
          <h2>Logs for Rule #{selectedRule}</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Time</th>
                <th style={styles.th}>Keyword</th>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>Prev Bid</th>
                <th style={styles.th}>New Bid</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, idx) => (
                <tr key={idx}>
                  <td style={styles.td}>{new Date(l.run_at).toLocaleString()}</td>
                  <td style={styles.td}>{l.keyword_id}</td>
                  <td style={styles.td}>{l.action}</td>
                  <td style={styles.td}>{l.previous_bid}</td>
                  <td style={styles.td}>{l.new_bid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
