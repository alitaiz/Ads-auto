import React, { useState, useEffect, useCallback } from 'react';
import { AutomationRule } from '../types';
import { RuleGuideContent } from './components/RuleGuideContent';
import { AIRuleSuggester } from './components/AIRuleSuggester';

// A placeholder for a rule editor component, to keep this file manageable.
// In a real app, this would be a large component in its own file.
const RuleEditor = ({ rule, onSave, onCancel }: { rule: Partial<AutomationRule> | null, onSave: (rule: Partial<AutomationRule>) => void, onCancel: () => void }) => {
    const [editedRule, setEditedRule] = useState<Partial<AutomationRule> | null>(rule);

    useEffect(() => {
        setEditedRule(rule);
    }, [rule]);

    if (!editedRule) return null;

    const handleConfigChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        try {
            const newConfig = JSON.parse(e.target.value);
            setEditedRule(prev => prev ? { ...prev, config: newConfig } : null);
        } catch (error) {
            console.error("Invalid JSON in config");
        }
    };
    
    const handleScopeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        try {
            const newScope = JSON.parse(e.target.value);
            setEditedRule(prev => prev ? { ...prev, scope: newScope } : null);
        } catch (error) {
            console.error("Invalid JSON in scope");
        }
    };

    return (
        <div style={styles.modalBackdrop}>
            <div style={styles.modalContent}>
                <h2 style={{margin: 0}}>{editedRule.id ? 'Edit Rule' : 'Create New Rule'}</h2>
                <div style={styles.formGrid}>
                    <label>Name:</label>
                    <input style={styles.input} value={editedRule.name || ''} onChange={e => setEditedRule(p => p ? {...p, name: e.target.value} : null)} />
                    
                    <label>Rule Type:</label>
                    <select style={styles.input} value={editedRule.rule_type || ''} onChange={e => setEditedRule(p => p ? {...p, rule_type: e.target.value as any} : null)}>
                        <option value="">-- Select --</option>
                        <option value="BID_ADJUSTMENT">Bid Adjustment</option>
                        <option value="SEARCH_TERM_AUTOMATION">Search Term Automation</option>
                        <option value="BUDGET_ACCELERATION">Budget Acceleration</option>
                        <option value="PRICE_ADJUSTMENT">Price Adjustment</option>
                    </select>

                    <label>Profile ID:</label>
                     <input style={styles.input} value={editedRule.profile_id || ''} onChange={e => setEditedRule(p => p ? {...p, profile_id: e.target.value} : null)} placeholder="Enter Profile ID from main dashboard" />

                    <label>Config (JSON):</label>
                    <textarea style={{...styles.input, minHeight: '150px'}} value={JSON.stringify(editedRule.config || {}, null, 2)} onChange={handleConfigChange}></textarea>
                    
                    <label>Scope (JSON):</label>
                    <textarea style={{...styles.input, minHeight: '80px'}} value={JSON.stringify(editedRule.scope || {}, null, 2)} onChange={handleScopeChange}></textarea>
                </div>
                <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px'}}>
                    <button style={{...styles.button, backgroundColor: '#6c757d'}} onClick={onCancel}>Cancel</button>
                    <button style={styles.button} onClick={() => onSave(editedRule)}>Save Rule</button>
                </div>
            </div>
        </div>
    );
};


export function AutomationView() {
    const [rules, setRules] = useState<AutomationRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('rules');
    const [editingRule, setEditingRule] = useState<Partial<AutomationRule> | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [aiProvider, setAiProvider] = useState<'gemini' | 'openai'>('gemini');

    const fetchRules = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/automation/rules');
            if (!res.ok) throw new Error('Failed to fetch automation rules');
            const data = await res.json();
            setRules(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRules();
    }, [fetchRules]);

    const handleSaveRule = async (ruleToSave: Partial<AutomationRule>) => {
        const url = ruleToSave.id ? `/api/automation/rules/${ruleToSave.id}` : '/api/automation/rules';
        const method = ruleToSave.id ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ruleToSave),
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to save rule');
            }
            await fetchRules(); // Refresh list
            setIsEditorOpen(false);
            setEditingRule(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Save operation failed');
        }
    };
    
    const handleDeleteRule = async (ruleId: number) => {
        if (!window.confirm("Are you sure you want to delete this rule?")) return;
        try {
             const response = await fetch(`/api/automation/rules/${ruleId}`, { method: 'DELETE' });
             if (!response.ok) throw new Error('Failed to delete rule');
             await fetchRules();
        } catch(err) {
            setError(err instanceof Error ? err.message : 'Delete operation failed');
        }
    };
    
    const handleToggleActive = (rule: AutomationRule) => {
        handleSaveRule({ ...rule, is_active: !rule.is_active });
    };

    const handleOpenEditor = (rule?: AutomationRule) => {
        setEditingRule(rule || { is_active: true, config: { frequency: { unit: 'hours', value: 1 } }, scope: {} });
        setIsEditorOpen(true);
    };
    
    const handleApplySuggestion = (suggestion: any) => {
        if (isEditorOpen && editingRule) {
            setEditingRule(prev => prev ? { ...prev, config: suggestion } : null);
             alert("AI suggestion has been applied to the editor. Please review and save.");
        } else {
            setEditingRule({ is_active: true, config: suggestion, scope: {} });
            setIsEditorOpen(true);
            alert("AI suggestion has been applied. A new rule form is opened for you to complete and save.");
        }
    };

    const renderRulesList = () => (
        <div style={styles.tableContainer}>
             <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Name</th>
                        <th style={styles.th}>Type</th>
                        <th style={styles.th}>Frequency</th>
                        <th style={styles.th}>Last Run</th>
                        <th style={styles.th}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {rules.length > 0 ? rules.map(rule => (
                        <tr key={rule.id}>
                            <td style={styles.td}>
                                <button onClick={() => handleToggleActive(rule)} style={rule.is_active ? styles.toggleActive : styles.toggleInactive}>
                                    {rule.is_active ? 'Active' : 'Inactive'}
                                </button>
                            </td>
                            <td style={styles.td}>{rule.name}</td>
                            <td style={styles.td}>{rule.rule_type?.replace(/_/g, ' ')}</td>
                            <td style={styles.td}>{rule.config.frequency?.value} {rule.config.frequency?.unit}</td>
                            <td style={styles.td}>{rule.last_run_at ? new Date(rule.last_run_at).toLocaleString() : 'Never'}</td>
                            <td style={styles.td}>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button style={styles.actionButton} onClick={() => handleOpenEditor(rule)}>Edit</button>
                                    <button style={{...styles.actionButton, backgroundColor: 'var(--danger-color)'}} onClick={() => handleDeleteRule(rule.id)}>Delete</button>
                                </div>
                            </td>
                        </tr>
                    )) : (
                        <tr><td colSpan={6} style={{textAlign: 'center', padding: '20px'}}>No rules created yet.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );

    const renderAIStudio = () => (
        <div>
            <div style={styles.aiProviderSelector}>
                <button 
                    style={aiProvider === 'gemini' ? {...styles.aiProviderButton, ...styles.aiProviderButtonActive} : styles.aiProviderButton}
                    onClick={() => setAiProvider('gemini')}>
                    Google Gemini
                </button>
                <button 
                    style={aiProvider === 'openai' ? {...styles.aiProviderButton, ...styles.aiProviderButtonActive} : styles.aiProviderButton}
                    onClick={() => setAiProvider('openai')}>
                    OpenAI ChatGPT
                </button>
            </div>
            <div>
                <h2 style={{marginTop: 0}}>AI Rule Suggester</h2>
                <p>Mô tả mục tiêu của bạn và AI sẽ tạo ra một cấu hình rule cho bạn.</p>
                <AIRuleSuggester onApplySuggestion={handleApplySuggestion} provider={aiProvider} />
            </div>
        </div>
    );
    
    return (
        <div style={styles.container}>
            {isEditorOpen && <RuleEditor rule={editingRule} onSave={handleSaveRule} onCancel={() => setIsEditorOpen(false)} />}
            
            <header style={styles.header}>
                <h1 style={styles.title}>Automation Center</h1>
                {activeTab === 'rules' && <button style={styles.button} onClick={() => handleOpenEditor()}>Create New Rule</button>}
            </header>
            
            {error && <div style={{...styles.error, marginBottom: '20px'}}>{error}</div>}

            <div style={styles.tabs}>
                <button style={activeTab === 'rules' ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton} onClick={() => setActiveTab('rules')}>My Rules</button>
                <button style={activeTab === 'ai-studio' ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton} onClick={() => setActiveTab('ai-studio')}>AI Studio</button>
                <button style={activeTab === 'guide' ? {...styles.tabButton, ...styles.tabButtonActive} : styles.tabButton} onClick={() => setActiveTab('guide')}>Guide</button>
            </div>
            
            {loading && <p>Loading rules...</p>}
            {!loading && activeTab === 'rules' && renderRulesList()}
            {!loading && activeTab === 'ai-studio' && renderAIStudio()}
            {!loading && activeTab === 'guide' && <RuleGuideContent />}
        </div>
    );
}

const styles: { [key: string]: React.CSSProperties } = {
    container: { maxWidth: '1400px', margin: '0 auto', padding: '20px' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
    title: { fontSize: '2rem', margin: 0 },
    tabs: { display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '20px' },
    tabButton: { padding: '10px 15px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 500, color: '#555', borderBottom: '3px solid transparent' },
    tabButtonActive: { color: 'var(--primary-color)', borderBottom: '3px solid var(--primary-color)' },
    button: { padding: '10px 20px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' },
    tableContainer: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '12px 15px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', backgroundColor: '#f8f9fa', fontWeight: 600, textTransform: 'capitalize' },
    td: { padding: '12px 15px', borderBottom: '1px solid var(--border-color)', textTransform: 'capitalize' },
    actionButton: { padding: '6px 12px', fontSize: '0.9rem', backgroundColor: '#e9ecef', color: '#495057', border: '1px solid #dee2e6', borderRadius: '4px', cursor: 'pointer' },
    toggleActive: { padding: '5px 10px', backgroundColor: '#d4edda', color: '#155724', border: '1px solid #c3e6cb', borderRadius: '12px', cursor: 'pointer', width: '80px' },
    toggleInactive: { padding: '5px 10px', backgroundColor: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb', borderRadius: '12px', cursor: 'pointer', width: '80px' },
    error: { color: 'var(--danger-color)', padding: '15px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)' },
    aiProviderSelector: { display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px', backgroundColor: '#f8f9fa', padding: '8px', borderRadius: '8px' },
    aiProviderButton: { padding: '8px 16px', border: '1px solid transparent', borderRadius: '6px', background: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500' },
    aiProviderButtonActive: { backgroundColor: 'white', borderColor: 'var(--border-color)', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', color: 'var(--primary-color)' },
    modalBackdrop: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1001 },
    modalContent: { backgroundColor: '#fff', padding: '25px', borderRadius: '8px', width: '90%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' },
    formGrid: { display: 'grid', gridTemplateColumns: '120px 1fr', gap: '15px', alignItems: 'center', marginTop: '20px' },
    input: { width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' },
};