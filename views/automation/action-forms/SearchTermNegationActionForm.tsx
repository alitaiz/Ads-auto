// views/automation/action-forms/SearchTermNegationActionForm.tsx
import React from 'react';
import { AutomationRuleAction } from '../../../types';

const styles: { [key: string]: React.CSSProperties } = {
  thenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontWeight: 500, fontSize: '0.9rem', color: '#555' },
  conditionInput: { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem' },
};

interface SearchTermNegationActionFormProps {
    action: AutomationRuleAction;
    onActionChange: (field: string, value: any) => void;
}

export const SearchTermNegationActionForm = ({ action, onActionChange }: SearchTermNegationActionFormProps) => (
    <div style={styles.thenGrid}>
        <div style={styles.formGroup}>
            <label style={styles.label}>Action</label>
            <select style={styles.conditionInput} value={action.type} onChange={e => onActionChange('type', e.target.value)}>
                <option value="negateSearchTerm">Negate Search Term</option>
            </select>
        </div>
        <div style={styles.formGroup}>
            <label style={styles.label}>Match Type</label>
            <select style={styles.conditionInput} value={action.matchType} onChange={e => onActionChange('matchType', e.target.value)}>
                <option value="NEGATIVE_EXACT">Negative Exact</option>
                <option value="NEGATIVE_PHRASE">Negative Phrase</option>
            </select>
        </div>
    </div>
);
