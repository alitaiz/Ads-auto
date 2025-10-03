// views/automation/RuleBuilderModal.tsx
import React, { useState, useEffect } from 'react';
import { AutomationRule, AutomationConditionGroup } from '../../types';
import {
    AISearchTermNegationConfig,
    BidAdjustmentActionForm,
    BudgetAccelerationActionForm,
    SearchTermHarvestingActionForm,
    SearchTermNegationActionForm
} from './action-forms';

const styles: { [key: string]: React.CSSProperties } = {
    modalBackdrop: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modalContent: { backgroundColor: 'var(--card-background-color)', padding: '25px', borderRadius: 'var(--border-radius)', width: '90%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: '20px' },
    modalHeader: { fontSize: '1.5rem', margin: 0, paddingBottom: '10px', borderBottom: '1px solid var(--border-color)' },
    modalBody: { overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', paddingRight: '10px' },
    modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '15px' },
    primaryButton: { padding: '10px 20px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' },
    secondaryButton: { padding: '10px 20px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontWeight: 500 },
    input: { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem' },
    conditionGroup: { border: '1px solid #ddd', borderRadius: '4px', padding: '15px', marginBottom: '15px', position: 'relative' },
    conditionHeader: { fontWeight: 'bold', marginBottom: '10px' },
    conditionRow: { display: 'grid', gridTemplateColumns: '1fr 100px 1fr 30px', gap: '10px', alignItems: 'center', marginBottom: '10px' },
    conditionInput: { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem' },
    removeButton: { background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', fontSize: '1.2rem', padding: '0 5px' },
    addButton: { padding: '8px 12px', border: '1px dashed #ccc', background: 'none', cursor: 'pointer', borderRadius: '4px' },
    thenBlock: { borderTop: '1px solid #ddd', paddingTop: '15px', marginTop: '15px' },
    removeGroupButton: { position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', fontSize: '1.5rem', fontWeight: 'bold' },
    multiSelect: {
        border: '1px solid var(--border-color)',
        borderRadius: '4px',
        padding: '5px',
        height: '150px',
        width: '100%'
    },
};

const getDefaultCondition = () => ({ metric: 'acos' as const, timeWindow: 30, operator: '>' as const, value: 0.40 });
const getDefaultAction = (ruleType: AutomationRule['rule_type']): any => {
    switch (ruleType) {
        case 'BID_ADJUSTMENT': return { type: 'decreaseBidPercent', value: 10 };
        case 'SEARCH_TERM_AUTOMATION': return { type: 'negateSearchTerm', matchType: 'NEGATIVE_EXACT' };
        case 'BUDGET_ACCELERATION': return { type: 'increaseBudgetPercent', value: 50 };
        case 'SEARCH_TERM_HARVESTING': return { type: 'CREATE_NEW_CAMPAIGN', matchType: 'EXACT', newCampaignBudget: 10.00, bidOption: { type: 'CPC_MULTIPLIER', value: 1.15 }, autoNegate: true };
        case 'AI_SEARCH_TERM_NEGATION': return { type: 'negateSearchTerm', matchType: 'NEGATIVE_EXACT'};
        default: return {};
    }
};
const getDefaultConditionGroup = (ruleType: AutomationRule['rule_type']) => ({
    conditions: [getDefaultCondition()],
    action: getDefaultAction(ruleType)
});

interface RuleBuilderModalProps {
    rule: AutomationRule | Partial<AutomationRule> | null;
    modalTitle: string;
    onClose: () => void;
    onSave: (rule: AutomationRule) => void;
    bidAdjustmentRules?: AutomationRule[];
    budgetAccelerationRules?: AutomationRule[];
}

export function RuleBuilderModal({ rule, modalTitle, onClose, onSave, bidAdjustmentRules = [], budgetAccelerationRules = [] }: RuleBuilderModalProps) {
    const [formData, setFormData] = useState<AutomationRule | Partial<AutomationRule> | null>(rule);

    useEffect(() => {
        setFormData(rule);
    }, [rule]);

    if (!formData || !formData.rule_type) return null;

    const handleInputChange = (field: keyof AutomationRule | `config.${string}` | `scope.${string}`, value: any) => {
        setFormData(prev => {
            if (!prev) return null;
            const newFormData = { ...prev };
            const keys = field.split('.');
            if (keys.length > 1) {
                let current: any = newFormData;
                for (let i = 0; i < keys.length - 1; i++) {
                    current = current[keys[i]];
                }
                current[keys[keys.length - 1]] = value;
            } else {
                (newFormData as any)[field] = value;
            }
            return newFormData;
        });
    };
    
    const handleConditionChange = (groupIndex: number, condIndex: number, field: string, value: any) => {
        const newGroups = [...(formData.config?.conditionGroups || [])];
        (newGroups[groupIndex].conditions[condIndex] as any)[field] = value;
        handleInputChange('config.conditionGroups', newGroups);
    };

    const handleActionChange = (groupIndex: number, field: string, value: any) => {
        const newGroups = [...(formData.config?.conditionGroups || [])];
        const keys = field.split('.');
        if (keys.length > 1) {
             if (!newGroups[groupIndex].action[keys[0]]) {
                newGroups[groupIndex].action[keys[0]] = {};
            }
            newGroups[groupIndex].action[keys[0]][keys[1]] = value;
        } else {
            (newGroups[groupIndex].action as any)[field] = value;
        }
        handleInputChange('config.conditionGroups', newGroups);
    };

    const addCondition = (groupIndex: number) => {
        const newGroups = [...(formData.config?.conditionGroups || [])];
        newGroups[groupIndex].conditions.push(getDefaultCondition());
        handleInputChange('config.conditionGroups', newGroups);
    };
    
    const removeCondition = (groupIndex: number, condIndex: number) => {
        const newGroups = [...(formData.config?.conditionGroups || [])];
        newGroups[groupIndex].conditions.splice(condIndex, 1);
        handleInputChange('config.conditionGroups', newGroups);
    };

    const addConditionGroup = () => {
        const newGroups = [...(formData.config?.conditionGroups || []), getDefaultConditionGroup(formData.rule_type!)];
        handleInputChange('config.conditionGroups', newGroups);
    };
    
    const removeConditionGroup = (groupIndex: number) => {
        const newGroups = [...(formData.config?.conditionGroups || [])];
        newGroups.splice(groupIndex, 1);
        handleInputChange('config.conditionGroups', newGroups);
    };

    const renderActionForm = (group: AutomationConditionGroup, index: number) => {
        if (!formData.rule_type) return null;
        
        switch (formData.rule_type) {
            case 'BID_ADJUSTMENT':
                return <BidAdjustmentActionForm action={group.action} onActionChange={(field, value) => handleActionChange(index, field, value)} />;
            case 'SEARCH_TERM_AUTOMATION':
                 return <SearchTermNegationActionForm action={group.action} onActionChange={(field, value) => handleActionChange(index, field, value)} />;
            case 'AI_SEARCH_TERM_NEGATION':
                return <AISearchTermNegationConfig config={formData.config || {}} onConfigChange={(field, value) => handleInputChange(`config.${field}`, value)} />;
            case 'BUDGET_ACCELERATION':
                return <BudgetAccelerationActionForm action={group.action} onActionChange={(field, value) => handleActionChange(index, field, value)} />;
            case 'SEARCH_TERM_HARVESTING':
                return <SearchTermHarvestingActionForm action={group.action} onActionChange={(field, value) => handleActionChange(index, field, value)} bidAdjustmentRules={bidAdjustmentRules} budgetAccelerationRules={budgetAccelerationRules} />;
            default:
                return <div>Action form for this rule type is not implemented.</div>;
        }
    };
    
    return (
        <div style={styles.modalBackdrop}>
            <div style={styles.modalContent}>
                <h2 style={styles.modalHeader}>{modalTitle}</h2>
                <div style={styles.modalBody}>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Rule Name</label>
                        <input style={styles.input} value={formData.name || ''} onChange={e => handleInputChange('name', e.target.value)} />
                    </div>
                     <div style={styles.formGroup}>
                        <label style={styles.label}>Frequency</label>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <span>Every</span>
                            <input type="number" min="1" style={{...styles.input, width: '80px'}} value={formData.config?.frequency?.value || ''} onChange={e => handleInputChange('config.frequency.value', Number(e.target.value))} />
                            <select style={styles.input} value={formData.config?.frequency?.unit || 'hours'} onChange={e => handleInputChange('config.frequency.unit', e.target.value)}>
                                <option value="minutes">Minute(s)</option>
                                <option value="hours">Hour(s)</option>
                                <option value="days">Day(s)</option>
                            </select>
                            {formData.config?.frequency?.unit === 'days' && (
                                <>
                                <span>at</span>
                                 <input type="time" style={{...styles.input, width: '120px'}} value={formData.config?.frequency?.startTime || '01:00'} onChange={e => handleInputChange('config.frequency.startTime', e.target.value)} />
                                </>
                            )}
                        </div>
                    </div>
                    {formData.rule_type !== 'PRICE_ADJUSTMENT' && (
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Scope: Apply to which campaigns?</label>
                            <p style={{fontSize: '0.8rem', margin: 0, color: '#666'}}>Enter one Campaign ID per line. Leave empty to apply to all campaigns for this ad type.</p>
                            <textarea
                                style={{ ...styles.input, minHeight: '100px', fontFamily: 'monospace' }}
                                value={(formData.scope?.campaignIds || []).join('\n')}
                                onChange={e => handleInputChange('scope.campaignIds', e.target.value.split('\n').map(id => id.trim()).filter(Boolean))}
                                placeholder="e.g., 3458..."
                            />
                        </div>
                    )}

                    {(formData.config?.conditionGroups || []).map((group, groupIndex) => (
                        <div key={groupIndex} style={styles.conditionGroup}>
                             <button onClick={() => removeConditionGroup(groupIndex)} style={styles.removeGroupButton} title="Remove this IF/THEN block">&times;</button>
                            <p style={styles.conditionHeader}>IF all of these are true:</p>
                            {group.conditions.map((cond, condIndex) => (
                                <div key={condIndex} style={styles.conditionRow}>
                                    <select style={styles.conditionInput} value={cond.metric} onChange={e => handleConditionChange(groupIndex, condIndex, 'metric', e.target.value)}>
                                        <option value="spend">Spend</option><option value="sales">Sales</option><option value="acos">ACoS</option><option value="orders">Orders</option>
                                        <option value="clicks">Clicks</option><option value="impressions">Impressions</option><option value="roas">RoAS</option>
                                        {formData.rule_type === 'BUDGET_ACCELERATION' && <option value="budgetUtilization">Budget Utilization %</option>}
                                    </select>
                                    <select style={styles.conditionInput} value={cond.operator} onChange={e => handleConditionChange(groupIndex, condIndex, 'operator', e.target.value)}>
                                        <option value=">">&gt;</option><option value="<">&lt;</option><option value="=">=</option>
                                    </select>
                                    <input type="number" step="0.01" style={styles.conditionInput} value={cond.value} onChange={e => handleConditionChange(groupIndex, condIndex, 'value', Number(e.target.value))} />
                                    <button onClick={() => removeCondition(groupIndex, condIndex)} style={styles.removeButton}>-</button>
                                </div>
                            ))}
                            <button onClick={() => addCondition(groupIndex)} style={styles.addButton}>+ Add AND condition</button>
                             {formData.rule_type !== 'AI_SEARCH_TERM_NEGATION' && (
                                <div style={styles.thenBlock}>
                                    <p style={styles.conditionHeader}>THEN do this:</p>
                                    {renderActionForm(group, groupIndex)}
                                </div>
                            )}
                        </div>
                    ))}
                    {formData.rule_type !== 'AI_SEARCH_TERM_NEGATION' && (
                        <button onClick={addConditionGroup} style={styles.addButton}>+ Add OR IF block</button>
                    )}
                     {formData.rule_type === 'AI_SEARCH_TERM_NEGATION' && renderActionForm({} as any, 0)}

                </div>
                <div style={styles.modalFooter}>
                    <button onClick={onClose} style={styles.secondaryButton}>Cancel</button>
                    <button onClick={() => onSave(formData as AutomationRule)} style={styles.primaryButton}>Save Rule</button>
                </div>
            </div>
        </div>
    );
}
