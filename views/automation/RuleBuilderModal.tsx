// views/automation/RuleBuilderModal.tsx
import React, { useState, useEffect } from 'react';
import { AutomationRule, AutomationConditionGroup, AutomationRuleCondition, AutomationRuleAction } from '../../types';
import {
    AISearchTermNegationConfig,
    BidAdjustmentActionForm,
    BudgetAccelerationActionForm,
    SearchTermHarvestingActionForm,
    SearchTermNegationActionForm
} from './action-forms';

const styles: { [key: string]: React.CSSProperties } = {
    modalBackdrop: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
    modalContent: { backgroundColor: '#f0f2f2', padding: '30px', borderRadius: 'var(--border-radius)', width: '90%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '25px' },
    modalHeader: { fontSize: '1.75rem', margin: 0, paddingBottom: '10px', color: '#333' },
    modalFooter: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 'auto', paddingTop: '20px', gap: '10px' },
    primaryButton: { padding: '10px 20px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' },
    form: { display: 'flex', flexDirection: 'column', gap: '20px' },
    card: { border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', backgroundColor: 'white', padding: '20px' },
    cardTitle: { fontSize: '1.1rem', fontWeight: 600, margin: '0 0 15px 0', color: '#333' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontWeight: 500, fontSize: '0.9rem', color: '#555' },
    input: { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem', width: '100%' },
    textarea: { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem', width: '100%', minHeight: '120px', resize: 'vertical' },
    activeCheckboxContainer: { display: 'flex', alignItems: 'center', gap: '10px', marginRight: 'auto' },
    ifThenBlock: { border: '1px dashed #ccc', borderRadius: 'var(--border-radius)', padding: '20px', backgroundColor: '#fafafa' },
    ifBlockHeader: { fontWeight: 'bold', fontSize: '1rem', marginBottom: '15px', color: '#333' },
    conditionRow: { display: 'grid', gridTemplateColumns: '2fr auto auto auto 1.5fr auto', alignItems: 'center', gap: '10px', marginBottom: '10px' },
    conditionInput: { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem' },
    conditionText: { fontSize: '0.9rem', color: '#333' },
    deleteButton: { background: 'none', border: '1px solid var(--danger-color)', color: 'var(--danger-color)', borderRadius: '4px', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', lineHeight: '1' },
    thenBlock: { marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #eee' },
    thenHeader: { fontWeight: 'bold', fontSize: '1rem', marginBottom: '15px', color: '#333' },
};

interface RuleBuilderModalProps {
    rule: AutomationRule | Partial<AutomationRule> | null;
    modalTitle: string;
    onClose: () => void;
    onSave: (rule: AutomationRule) => void;
    bidAdjustmentRules?: AutomationRule[];
    budgetAccelerationRules?: AutomationRule[];
    searchTermRules?: AutomationRule[];
    aiSearchTermRules?: AutomationRule[];
}

export function RuleBuilderModal({ 
    rule, 
    modalTitle, 
    onClose, 
    onSave, 
    bidAdjustmentRules = [], 
    budgetAccelerationRules = [],
    searchTermRules = [],
    aiSearchTermRules = []
}: RuleBuilderModalProps) {
    const [formData, setFormData] = useState<Partial<AutomationRule>>(JSON.parse(JSON.stringify(rule)));
    
     useEffect(() => {
        if (formData.config?.conditionGroups) {
            let needsUpdate = false;
            const newGroups = formData.config.conditionGroups.map((group: any) => {
                if (group?.action?.type === 'adjustBidPercent') {
                    needsUpdate = true;
                    const value = group.action.value || 0;
                    const newAction: AutomationRuleAction = { ...group.action, type: value >= 0 ? 'increaseBidPercent' : 'decreaseBidPercent', value: Math.abs(value) };
                    return { ...group, action: newAction };
                }
                return group;
            });

            if (needsUpdate) {
                setFormData(prev => {
                    if (!prev || !prev.config) return prev;
                    return { ...prev, config: { ...prev.config, conditionGroups: newGroups } };
                });
            }
        }
    }, [formData.config]);

    if (!formData || !formData.rule_type) return null;

    const { rule_type } = formData;

    const handleConfigChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, config: { ...(prev?.config || {}), [field]: value } as any }));
    };

    const handleConditionChange = (groupIndex: number, condIndex: number, field: keyof AutomationRuleCondition, value: any) => {
        setFormData(prev => {
            if (!prev?.config?.conditionGroups) return prev;
            const newGroups = prev.config.conditionGroups.map((group, gIndex) => {
                if (gIndex !== groupIndex) return group;
                return {
                    ...group,
                    conditions: group.conditions.map((cond, cIndex) => {
                        if (cIndex !== condIndex) return cond;
                        let finalValue = value;
                        // For ACOS, convert the percentage from the input to a decimal ratio for storage
                        if (field === 'value' && cond.metric === 'acos') {
                            finalValue = value / 100;
                        }
                        return { ...cond, [field]: finalValue };
                    })
                };
            });
            return { ...prev, config: { ...prev.config, conditionGroups: newGroups } };
        });
    };
    
    const handleActionChange = (groupIndex: number, field: string, value: any) => {
        setFormData(prev => {
            if (!prev?.config?.conditionGroups) return prev;
            const newGroups = prev.config.conditionGroups.map((group, gIndex) => {
                if (gIndex !== groupIndex) return group;
                
                const newAction = { ...group.action };
                if (field.startsWith('bidOption.')) {
                    const subField = field.split('.')[1];
                    if (!newAction.bidOption) newAction.bidOption = { type: 'CPC_MULTIPLIER', value: 1.15 };
                    (newAction.bidOption as any)[subField] = value;
                } else {
                    (newAction as any)[field] = value;
                }
                return { ...group, action: newAction };
            });
            return { ...prev, config: { ...prev.config, conditionGroups: newGroups } };
        });
    };

    const addConditionToGroup = (groupIndex: number) => {
        setFormData(prev => {
            if (!prev?.config?.conditionGroups) return prev;
            const newGroups = prev.config.conditionGroups.map((group, gIndex) => {
                if (gIndex !== groupIndex) return group;
                const newCondition: AutomationRuleCondition = { metric: 'spend', timeWindow: 30, operator: '>', value: 10 };
                return { ...group, conditions: [...group.conditions, newCondition] };
            });
            return { ...prev, config: { ...prev.config, conditionGroups: newGroups } };
        });
    };

    const removeCondition = (groupIndex: number, condIndex: number) => {
         setFormData(prev => {
            if (!prev?.config?.conditionGroups) return prev;
            let newGroups = prev.config.conditionGroups.map((group, gIndex) => {
                if (gIndex !== groupIndex) return group;
                if (group.conditions.length <= 1) return group; // Don't remove the last condition in a group
                return { ...group, conditions: group.conditions.filter((_, cIndex) => cIndex !== condIndex) };
            });
            // If we're removing the last condition and there are other groups, remove the whole group
            if (prev.config.conditionGroups[groupIndex].conditions.length === 1 && prev.config.conditionGroups.length > 1) {
                newGroups = newGroups.filter((_, gIndex) => gIndex !== groupIndex);
            }
            return { ...prev, config: { ...prev.config, conditionGroups: newGroups } };
        });
    };
    
    const addConditionGroup = () => {
        setFormData(prev => {
            if (!prev?.config?.conditionGroups?.[0]?.action) return prev;
            const firstGroupAction = prev.config.conditionGroups[0].action;
            const newGroup: AutomationConditionGroup = {
                conditions: [{ metric: 'spend', timeWindow: 30, operator: '>', value: 10 }],
                action: JSON.parse(JSON.stringify(firstGroupAction)) // Deep copy the action from the first group
            };
            return { ...prev, config: { ...prev.config, conditionGroups: [...(prev.config.conditionGroups || []), newGroup] } };
        });
    };

    const renderActionForm = (group: AutomationConditionGroup, index: number) => {
        switch (rule_type) {
            case 'BID_ADJUSTMENT': return <BidAdjustmentActionForm action={group.action} onActionChange={(f,v) => handleActionChange(index, f, v)} />;
            case 'SEARCH_TERM_AUTOMATION': return <SearchTermNegationActionForm action={group.action} onActionChange={(f,v) => handleActionChange(index, f, v)} />;
            case 'AI_SEARCH_TERM_NEGATION': return <AISearchTermNegationConfig config={formData.config!} onConfigChange={(f, v) => handleConfigChange(f, v)} />;
            case 'BUDGET_ACCELERATION': return <BudgetAccelerationActionForm action={group.action} onActionChange={(f,v) => handleActionChange(index, f, v)} />;
            case 'SEARCH_TERM_HARVESTING': return <SearchTermHarvestingActionForm 
                action={group.action} 
                onActionChange={(f,v) => handleActionChange(index, f, v)} 
                bidAdjustmentRules={bidAdjustmentRules} 
                budgetAccelerationRules={budgetAccelerationRules} 
                searchTermRules={searchTermRules}
                aiSearchTermRules={aiSearchTermRules}
            />;
            default: return <div>Action form for this rule type is not implemented.</div>;
        }
    };
    
    const renderConditionInput = (groupIndex: number, cond: AutomationRuleCondition, condIndex: number) => {
        const isAcos = cond.metric === 'acos';
        const isPercent = isAcos || cond.metric === 'budgetUtilization';
        
        return (
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <input type="number" step="0.01" style={styles.conditionInput} value={isAcos ? (cond.value || 0) * 100 : cond.value} onChange={e => handleConditionChange(groupIndex, condIndex, 'value', Number(e.target.value))} required />
                {isPercent && <span style={{ marginLeft: '5px' }}>%</span>}
            </div>
        );
    };

    return (
        <div style={styles.modalBackdrop} onClick={onClose}>
            <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                <form style={styles.form} onSubmit={e => { e.preventDefault(); onSave(formData as AutomationRule); }}>
                    <h2 style={styles.modalHeader}>{modalTitle}</h2>
                    <div style={styles.formGroup}>
                        <label style={styles.label}>Rule Name</label>
                        <input style={styles.input} value={formData.name || ''} onChange={e => setFormData(p => ({...p, name: e.target.value}))} required />
                    </div>
                    {rule_type === 'PRICE_ADJUSTMENT' ? (
                       <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={styles.card}>
                                <h3 style={styles.cardTitle}>Scheduling</h3>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Run Time (UTC-7)</label>
                                    <input type="time" style={{...styles.input, width: '150px'}} value={formData.config?.runAtTime || '02:00'} onChange={e => handleConfigChange('runAtTime', e.target.value)} required />
                                    <p style={{fontSize: '0.8rem', color: '#666', margin: '5px 0 0 0'}}>The rule will run once daily at this time.</p>
                                </div>
                            </div>
                            <div style={styles.card}>
                                <h3 style={styles.cardTitle}>Price Adjustment Logic</h3>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>SKUs to Adjust (comma-separated)</label>
                                    <textarea style={styles.textarea} value={(formData.config?.skus || []).join(', ')} onChange={e => handleConfigChange('skus', e.target.value.split(',').map(s => s.trim()))} placeholder="SKU-001, SKU-002, SKU-003" required />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
                                    <div style={styles.formGroup}><label style={styles.label}>Price Step ($)</label><input type="number" step="0.01" style={styles.input} value={formData.config?.priceStep ?? ''} onChange={e => handleConfigChange('priceStep', Number(e.target.value))} placeholder="e.g., 0.50 or -0.25" required /><p style={{fontSize: '0.8rem', color: '#666', margin: '5px 0 0 0'}}>The amount to add/subtract from the price each time the rule runs.</p></div>
                                    <div style={styles.formGroup}><label style={styles.label}>Price Limit ($)</label><input type="number" step="0.01" style={styles.input} value={formData.config?.priceLimit ?? ''} onChange={e => handleConfigChange('priceLimit', Number(e.target.value))} placeholder="e.g., 99.99" required /><p style={{fontSize: '0.8rem', color: '#666', margin: '5px 0 0 0'}}>When the price hits this limit, it will reset based on the defined logic.</p></div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div style={styles.card}>
                                <h3 style={styles.cardTitle}>Scheduling &amp; Cooldown</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                        <div style={styles.formGroup}>
                                            <label style={styles.label}>Frequency</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span>Run every</span>
                                                <input type="number" min="1" style={{...styles.input, width: '80px'}} value={formData.config?.frequency?.value || 1} onChange={e => handleConfigChange('frequency', { ...formData.config?.frequency, value: Math.max(1, Number(e.target.value)) })} />
                                                <select style={{...styles.input, flex: 1}} value={formData.config?.frequency?.unit || 'hours'} onChange={e => { const unit = e.target.value as any; const newFreq = { ...formData.config?.frequency, unit }; if (unit === 'days' && !formData.config?.frequency?.startTime) { newFreq.startTime = '01:00'; } handleConfigChange('frequency', newFreq); }}>
                                                    <option value="minutes">Minute(s)</option><option value="hours">Hour(s)</option><option value="days">Day(s)</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div style={styles.formGroup}>
                                            <label style={styles.label}>Action Cooldown</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span>Wait for</span>
                                                <input type="number" min="0" style={{...styles.input, width: '80px'}} value={formData.config?.cooldown?.value ?? 24} onChange={e => handleConfigChange('cooldown', { ...formData.config?.cooldown, value: Number(e.target.value) })}/>
                                                <select style={{...styles.input, flex: 1}} value={formData.config?.cooldown?.unit || 'hours'} onChange={e => handleConfigChange('cooldown', { ...formData.config?.cooldown, unit: e.target.value as any })}>
                                                    <option value="minutes">Minute(s)</option><option value="hours">Hour(s)</option><option value="days">Day(s)</option>
                                                </select>
                                            </div>
                                             <p style={{fontSize: '0.8rem', color: '#666', margin: '5px 0 0 0'}}>After acting on an item, wait this long before acting on it again. Set to 0 to disable.</p>
                                        </div>
                                    </div>
                                    {formData.config?.frequency?.unit === 'days' && (<div style={{...styles.formGroup}}><label style={styles.label}>Scheduled Start Time (UTC-7)</label><input type="time" style={{...styles.input, width: '150px'}} value={formData.config?.frequency?.startTime || '01:00'} onChange={e => handleConfigChange('frequency', { ...formData.config!.frequency, startTime: e.target.value })} required /></div>)}
                                </div>
                            </div>
                            <div style={styles.card}>
                                <h3 style={styles.cardTitle}>Rule Logic (First Match Wins)</h3>
                                <p style={{fontSize: '0.8rem', color: '#666', marginTop: '-10px', marginBottom: '15px'}}>Rules are checked from top to bottom. The first group whose conditions are met will trigger its action, and the engine will stop.</p>
                                {(formData.config?.conditionGroups || []).map((group, groupIndex) => (
                                   <React.Fragment key={groupIndex}>
                                        <div style={styles.ifThenBlock}>
                                            <h4 style={styles.ifBlockHeader}>IF</h4>
                                            {group.conditions.map((cond, condIndex) => (
                                                <div key={condIndex} style={styles.conditionRow}>
                                                   <select style={styles.conditionInput} value={cond.metric} onChange={e => handleConditionChange(groupIndex, condIndex, 'metric', e.target.value)}>
                                                        {rule_type === 'BUDGET_ACCELERATION' ? (<> <option value="roas">ROAS</option> <option value="acos">ACoS</option> <option value="sales">Sales</option> <option value="orders">Orders</option> <option value="budgetUtilization">Budget Utilization %</option> </>) : (<> <option value="spend">Spend</option> <option value="sales">Sales</option> <option value="acos">ACOS</option> <option value="orders">Orders</option> <option value="clicks">Clicks</option> <option value="impressions">Impressions</option> </>)}
                                                    </select>
                                                    <span style={styles.conditionText}>in last</span>
                                                    {rule_type === 'BUDGET_ACCELERATION' ? (
                                                        <input style={{...styles.conditionInput, width: '60px', textAlign: 'center'}} value="Today" disabled />
                                                    ) : rule_type === 'AI_SEARCH_TERM_NEGATION' ? (
                                                        <input type="number" style={{...styles.conditionInput, width: '60px', backgroundColor: '#e9ecef', cursor: 'not-allowed'}} value={cond.timeWindow} disabled title="The lookback period for AI Negation is fixed to D-2 (data from 2 days ago)." />
                                                    ) : (
                                                        <input type="number" min="1" max="90" style={{...styles.conditionInput, width: '60px'}} value={cond.timeWindow} onChange={e => handleConditionChange(groupIndex, condIndex, 'timeWindow', Number(e.target.value))} required />
                                                    )}
                                                    <span style={styles.conditionText}>
                                                        {rule_type !== 'BUDGET_ACCELERATION' && 'days'}
                                                        {rule_type === 'AI_SEARCH_TERM_NEGATION' && ' (fixed at D-2)'}
                                                    </span>
                                                    <select style={{...styles.conditionInput, width: '60px'}} value={cond.operator} onChange={e => handleConditionChange(groupIndex, condIndex, 'operator', e.target.value)}><option value=">">&gt;</option> <option value="<">&lt;</option> <option value="=">=</option></select>
                                                    {renderConditionInput(groupIndex, cond, condIndex)}
                                                    <button type="button" onClick={() => removeCondition(groupIndex, condIndex)} style={styles.deleteButton}>&times;</button>
                                                </div>
                                            ))}
                                             <button type="button" onClick={() => addConditionToGroup(groupIndex)} style={{...styles.primaryButton, padding: '8px 12px', fontSize: '0.9rem', marginTop: '10px'}}>+ Add Condition (AND)</button>
                                             {rule_type !== 'AI_SEARCH_TERM_NEGATION' && (
                                                <div style={styles.thenBlock}>
                                                    <h4 style={styles.thenHeader}>THEN</h4>
                                                    {renderActionForm(group, groupIndex)}
                                                </div>
                                            )}
                                        </div>
                                       {groupIndex < (formData.config!.conditionGroups || []).length - 1 && <div style={{textAlign: 'center', margin: '15px 0', fontWeight: 'bold', color: '#555'}}>OR</div>}
                                   </React.Fragment>
                                ))}
                                {rule_type !== 'AI_SEARCH_TERM_NEGATION' && (<button type="button" onClick={addConditionGroup} style={{...styles.primaryButton, padding: '10px 15px', marginTop: '15px'}}>+ Add Condition Group (OR)</button>)}
                                {rule_type === 'AI_SEARCH_TERM_NEGATION' && renderActionForm({} as any, 0)}
                            </div>
                        </>
                    )}
                    
                    <div style={styles.modalFooter}>
                        <div style={styles.activeCheckboxContainer}>
                           <input type="checkbox" id="rule-is-active" style={{ transform: 'scale(1.2)' }} checked={formData.is_active} onChange={e => setFormData(p => ({...p!, is_active: e.target.checked}))} />
                           <label htmlFor="rule-is-active" style={{...styles.label, cursor: 'pointer'}}>Rule is Active</label>
                        </div>
                        <button type="button" style={{...styles.primaryButton, backgroundColor: '#6c757d'}} onClick={onClose}>Cancel</button>
                        <button type="submit" style={styles.primaryButton}>Save Rule</button>
                    </div>
                </form>
            </div>
        </div>
    );
}