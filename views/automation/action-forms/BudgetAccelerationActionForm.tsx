// views/automation/action-forms/BudgetAccelerationActionForm.tsx
import React from 'react';
import { AutomationRuleAction } from '../../../types';

const styles: { [key: string]: React.CSSProperties } = {
  thenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontWeight: 500, fontSize: '0.9rem', color: '#555' },
  conditionInput: { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem' },
  infoBox: { backgroundColor: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 'var(--border-radius)', padding: '10px 15px', fontSize: '0.9rem', color: '#0050b3' },
};

interface BudgetAccelerationActionFormProps {
    action: AutomationRuleAction;
    onActionChange: (field: string, value: any) => void;
}

export const BudgetAccelerationActionForm = ({ action, onActionChange }: BudgetAccelerationActionFormProps) => (
    <div style={styles.thenGrid}>
        <div style={styles.formGroup}>
            <label style={styles.label}>Action</label>
            <select style={styles.conditionInput} value={action.type} onChange={e => onActionChange('type', e.target.value)}>
                <option value="increaseBudgetPercent">Increase Budget By %</option>
            </select>
        </div>
        <div style={styles.formGroup}>
            <label style={styles.label}>Value (%)</label>
            <input type="number" style={styles.conditionInput} placeholder="e.g., 50" value={action.value ?? ''} onChange={e => onActionChange('value', Number(e.target.value))} />
        </div>
        <div style={{...styles.infoBox, gridColumn: '1 / -1'}}>
            ℹ️ The budget will be automatically reset to its original value at the end of the day.
        </div>
    </div>
);
