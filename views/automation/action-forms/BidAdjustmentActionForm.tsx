// views/automation/action-forms/BidAdjustmentActionForm.tsx
import React from 'react';
import { AutomationRuleAction } from '../../../types';

const styles: { [key: string]: React.CSSProperties } = {
  thenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontWeight: 500, fontSize: '0.9rem', color: '#555' },
  conditionInput: { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem' },
};

interface BidAdjustmentActionFormProps {
    action: AutomationRuleAction;
    onActionChange: (field: string, value: any) => void;
}

export const BidAdjustmentActionForm = ({ action, onActionChange }: BidAdjustmentActionFormProps) => (
    <div style={styles.thenGrid}>
        <div style={styles.formGroup}>
            <label style={styles.label}>Action</label>
            <select style={styles.conditionInput} value={action.type} onChange={e => onActionChange('type', e.target.value)}>
                <option value="decreaseBidPercent">Decrease Bid By %</option>
                <option value="increaseBidPercent">Increase Bid By %</option>
                <option value="decreaseBidAmount">Decrease Bid By $</option>
                <option value="increaseBidAmount">Increase Bid By $</option>
            </select>
        </div>
        <div style={styles.formGroup}>
            <label style={styles.label}>{`Value ${action.type?.includes('Percent') ? '(%)' : '($)'}`}</label>
            <input type="number" step="0.01" min="0" style={styles.conditionInput} placeholder={action.type?.includes('Percent') ? "e.g., 10" : "e.g., 0.25"} value={action.value ?? ''} onChange={e => onActionChange('value', Number(e.target.value))} />
        </div>
        <div style={styles.formGroup}>
            <label style={styles.label}>Min Bid (Optional)</label>
            <input type="number" step="0.01" style={styles.conditionInput} placeholder="e.g., 0.15" value={action.minBid ?? ''} onChange={e => onActionChange('minBid', e.target.value ? Number(e.target.value) : undefined)} />
        </div>
        <div style={styles.formGroup}>
            <label style={styles.label}>Max Bid (Optional)</label>
            <input type="number" step="0.01" style={styles.conditionInput} placeholder="e.g., 2.50" value={action.maxBid ?? ''} onChange={e => onActionChange('maxBid', e.target.value ? Number(e.target.value) : undefined)} />
        </div>
    </div>
);
