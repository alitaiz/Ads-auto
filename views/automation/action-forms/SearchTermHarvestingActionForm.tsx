// views/automation/action-forms/SearchTermHarvestingActionForm.tsx
import React from 'react';
import { AutomationRule, AutomationRuleAction } from '../../../types';

const styles: { [key: string]: React.CSSProperties } = {
    formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontWeight: 500, fontSize: '0.9rem', color: '#555' },
    conditionInput: { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem' },
    thenGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' },
    radioGroup: { display: 'flex', gap: '15px', alignItems: 'center' },
    infoBox: { backgroundColor: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 'var(--border-radius)', padding: '10px 15px', fontSize: '0.9rem', color: '#0050b3' },
    ruleCheckboxList: {
        maxHeight: '120px',
        overflowY: 'auto',
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        padding: '10px',
        backgroundColor: 'white'
    },
    ruleCheckboxItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0' },
    ruleCheckboxLabel: { fontWeight: 'normal', cursor: 'pointer', whiteSpace: 'normal', wordBreak: 'break-word' },
};

interface SearchTermHarvestingActionFormProps {
    action: AutomationRuleAction;
    onActionChange: (field: string, value: any) => void;
    bidAdjustmentRules: AutomationRule[];
    budgetAccelerationRules: AutomationRule[];
    searchTermRules: AutomationRule[];
    aiSearchTermRules: AutomationRule[];
}

export const SearchTermHarvestingActionForm = ({ 
    action, 
    onActionChange, 
    bidAdjustmentRules, 
    budgetAccelerationRules,
    searchTermRules,
    aiSearchTermRules
}: SearchTermHarvestingActionFormProps) => {
    
    const handleCheckboxChange = (ruleId: number | string, field: 'applyBidRuleIds' | 'applyBudgetRuleIds' | 'applySearchTermRuleIds' | 'applyAiRuleIds') => {
        const currentIds = (action[field] || []).map(String);
        const ruleIdStr = String(ruleId);
        const newIds = new Set(currentIds);

        if (newIds.has(ruleIdStr)) {
            newIds.delete(ruleIdStr);
        } else {
            newIds.add(ruleIdStr);
        }
        onActionChange(field, Array.from(newIds));
    };

    return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={styles.formGroup}><label style={styles.label}>Action</label><div style={styles.radioGroup}>
            <label><input type="radio" value="CREATE_NEW_CAMPAIGN" checked={action.type === 'CREATE_NEW_CAMPAIGN'} onChange={e => onActionChange('type', e.target.value)} /> Create a new campaign</label>
            <label><input type="radio" value="ADD_TO_EXISTING_CAMPAIGN" checked={action.type === 'ADD_TO_EXISTING_CAMPAIGN'} onChange={e => onActionChange('type', e.target.value)} /> Add to an existing campaign</label>
        </div></div>
        
        {action.type === 'CREATE_NEW_CAMPAIGN' && <div style={styles.thenGrid}>
            <div style={styles.formGroup}><label style={styles.label}>Daily Budget</label><input type="number" step="0.01" min="1" style={styles.conditionInput} placeholder="e.g., 10.00" value={action.newCampaignBudget ?? ''} onChange={e => onActionChange('newCampaignBudget', Number(e.target.value))} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Match Type</label><select style={styles.conditionInput} value={action.matchType} onChange={e => onActionChange('matchType', e.target.value)}><option value="EXACT">Exact</option><option value="PHRASE">Phrase</option></select></div>
        </div>}
        
        {action.type === 'ADD_TO_EXISTING_CAMPAIGN' && <div style={{...styles.thenGrid, gridTemplateColumns: '1fr 1fr'}}>
            <div style={styles.formGroup}>
                <label style={styles.label}>Target Campaign ID</label>
                <input type="text" style={styles.conditionInput} value={action.targetCampaignId ?? ''} onChange={e => onActionChange('targetCampaignId', e.target.value)} placeholder="Enter Campaign ID" />
            </div>
            <div style={styles.formGroup}>
                <label style={styles.label}>Target Ad Group ID</label>
                <input type="text" style={styles.conditionInput} value={action.targetAdGroupId ?? ''} onChange={e => onActionChange('targetAdGroupId', e.target.value)} placeholder="Enter Ad Group ID" />
            </div>
        </div>}

        <div style={{ paddingTop: '20px', borderTop: '1px dashed #ccc' }}>
            <div style={styles.formGroup}><label style={styles.label}>Bid Option</label><div style={styles.radioGroup}>
                <label><input type="radio" name="bidOptionType" value="CPC_MULTIPLIER" checked={action.bidOption?.type === 'CPC_MULTIPLIER'} onChange={e => onActionChange('bidOption.type', e.target.value)} /> Based on Search Term CPC</label>
                <label><input type="radio" name="bidOptionType" value="CUSTOM_BID" checked={action.bidOption?.type === 'CUSTOM_BID'} onChange={e => onActionChange('bidOption.type', e.target.value)} /> Set custom bid</label>
            </div></div>
             <div style={{...styles.formGroup, marginTop: '10px'}}>
                {action.bidOption?.type === 'CPC_MULTIPLIER' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', alignItems: 'flex-start' }}>
                        <div>
                            <label style={{...styles.label, fontSize: '0.85rem'}}>Multiplier</label>
                            <input type="number" step="0.01" min="0" style={{...styles.conditionInput, width: '100%'}} placeholder="e.g., 1.15 for +15%" value={action.bidOption?.value ?? ''} onChange={e => onActionChange('bidOption.value', Number(e.target.value))} />
                            <p style={{fontSize: '0.8rem', color: '#666', margin: '5px 0 0 0'}}>e.g., <code style={{backgroundColor: '#e9ecef', padding: '2px 4px', borderRadius: '3px'}}>1.15</code> means new bid will be 115% of original CPC.</p>
                        </div>
                        <div>
                            <label style={{...styles.label, fontSize: '0.85rem'}}>Max Bid (Optional)</label>
                            <input type="number" step="0.01" min="0.02" style={{...styles.conditionInput, width: '100%'}} placeholder="e.g., 2.00" value={action.bidOption?.maxBid ?? ''} onChange={e => onActionChange('bidOption.maxBid', e.target.value ? Number(e.target.value) : undefined)} />
                        </div>
                    </div>
                ) : (
                    <div>
                        <label style={{...styles.label, fontSize: '0.85rem'}}>Custom Bid Amount</label>
                        <input type="number" step="0.01" min="0.02" style={{...styles.conditionInput, width: '200px'}} placeholder="e.g., 0.75" value={action.bidOption?.value ?? ''} onChange={e => onActionChange('bidOption.value', Number(e.target.value))} />
                    </div>
                )}
            </div>
        </div>
        
        {action.type === 'CREATE_NEW_CAMPAIGN' && (
            <div style={{ paddingTop: '20px', borderTop: '1px dashed #ccc' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#333' }}>Apply Existing Rules to New Campaign</h4>
                <div style={{...styles.thenGrid, gridTemplateColumns: '1fr 1fr'}}>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>SP Bid Adjustment Rules</label>
                        <div style={styles.ruleCheckboxList}>
                            {bidAdjustmentRules.length > 0 ? ( bidAdjustmentRules.map(rule => (
                                <div key={rule.id} style={styles.ruleCheckboxItem}>
                                    <input type="checkbox" id={`bid-rule-${rule.id}`} checked={(action.applyBidRuleIds || []).map(String).includes(String(rule.id))} onChange={() => handleCheckboxChange(rule.id, 'applyBidRuleIds')} />
                                    <label htmlFor={`bid-rule-${rule.id}`} style={styles.ruleCheckboxLabel}>{rule.name}</label>
                                </div>))
                            ) : (<span style={{ color: '#888', fontSize: '0.9rem' }}>No bid adjustment rules available.</span>)}
                        </div>
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>SP Budget Acceleration Rules</label>
                         <div style={styles.ruleCheckboxList}>
                            {budgetAccelerationRules.length > 0 ? ( budgetAccelerationRules.map(rule => (
                                <div key={rule.id} style={styles.ruleCheckboxItem}>
                                    <input type="checkbox" id={`budget-rule-${rule.id}`} checked={(action.applyBudgetRuleIds || []).map(String).includes(String(rule.id))} onChange={() => handleCheckboxChange(rule.id, 'applyBudgetRuleIds')} />
                                    <label htmlFor={`budget-rule-${rule.id}`} style={styles.ruleCheckboxLabel}>{rule.name}</label>
                                </div>))
                            ) : (<span style={{ color: '#888', fontSize: '0.9rem' }}>No budget acceleration rules available.</span>)}
                        </div>
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>SP Search Term Negation Rules</label>
                        <div style={styles.ruleCheckboxList}>
                            {searchTermRules.length > 0 ? ( searchTermRules.map(rule => (
                                <div key={rule.id} style={styles.ruleCheckboxItem}>
                                    <input type="checkbox" id={`st-rule-${rule.id}`} checked={(action.applySearchTermRuleIds || []).map(String).includes(String(rule.id))} onChange={() => handleCheckboxChange(rule.id, 'applySearchTermRuleIds')} />
                                    <label htmlFor={`st-rule-${rule.id}`} style={styles.ruleCheckboxLabel}>{rule.name}</label>
                                </div>))
                            ) : (<span style={{ color: '#888', fontSize: '0.9rem' }}>No search term negation rules available.</span>)}
                        </div>
                    </div>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>SP AI Search Term Negation Rules</label>
                         <div style={styles.ruleCheckboxList}>
                            {aiSearchTermRules.length > 0 ? ( aiSearchTermRules.map(rule => (
                                <div key={rule.id} style={styles.ruleCheckboxItem}>
                                    <input type="checkbox" id={`ai-rule-${rule.id}`} checked={(action.applyAiRuleIds || []).map(String).includes(String(rule.id))} onChange={() => handleCheckboxChange(rule.id, 'applyAiRuleIds')} />
                                    <label htmlFor={`ai-rule-${rule.id}`} style={styles.ruleCheckboxLabel}>{rule.name}</label>
                                </div>))
                            ) : (<span style={{ color: '#888', fontSize: '0.9rem' }}>No AI negation rules available.</span>)}
                        </div>
                    </div>
                </div>
            </div>
        )}

        <div style={{ paddingTop: '20px', borderTop: '1px dashed #ccc' }}>
            <div style={styles.formGroup}>
                <label style={{...styles.label, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer'}}>
                    <input type="checkbox" style={{ transform: 'scale(1.2)' }} checked={action.autoNegate !== false} onChange={e => onActionChange('autoNegate', e.target.checked)} />
                    Automatic Negation
                </label>
            </div>
        </div>

        <div style={{...styles.infoBox, gridColumn: '1 / -1'}}>
            ℹ️ When 'Automatic Negation' is enabled, the harvested term is added as a Negative Exact in its original Ad Group to prevent spend overlap. This is highly recommended.
        </div>
    </div>
  );
};