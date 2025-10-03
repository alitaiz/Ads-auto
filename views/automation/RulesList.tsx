// views/automation/RulesList.tsx
import React from 'react';
import { AutomationRule } from '../../types';

const styles: { [key: string]: React.CSSProperties } = {
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
};

interface RulesListProps {
    rules: AutomationRule[];
    onEdit: (rule: AutomationRule) => void;
    onDelete: (id: number) => void;
    onDuplicate: (rule: AutomationRule) => void;
}

export const RulesList = ({ rules, onEdit, onDelete, onDuplicate }: RulesListProps) => (
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