// views/automation/action-forms/AISearchTermNegationConfig.tsx
import React from 'react';
import { AutomationRule } from '../../../types';

const styles: { [key: string]: React.CSSProperties } = {
  formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
  label: { fontWeight: 500, fontSize: '0.9rem', color: '#555' },
  conditionInput: { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem' },
};

interface AISearchTermNegationConfigProps {
    config: AutomationRule['config'];
    onConfigChange: (field: string, value: any) => void;
}

export const AISearchTermNegationConfig = ({ config, onConfigChange }: AISearchTermNegationConfigProps) => (
    <div style={{...styles.formGroup, padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px'}}>
        <label style={styles.label}>Negative Application Scope</label>
        <select
            style={styles.conditionInput}
            value={config.negationScope || 'AD_GROUP'}
            onChange={e => onConfigChange('negationScope', e.target.value)}
        >
            <option value="AD_GROUP">This Ad Group Only (Safest)</option>
            <option value="CAMPAIGN">Entire Campaign</option>
            <option value="ACCOUNT_BY_ASIN">Entire Account (for this ASIN)</option>
        </select>
        <p style={{fontSize: '0.8rem', color: '#666', margin: '5px 0 0 0'}}>Determines where the negative keyword is created if a term is found to be irrelevant.</p>
    </div>
);
