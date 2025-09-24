// views/components/AIRuleSuggester.tsx
import React, { useState, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { AutomationRule, AutomationConditionGroup } from '../../types';

// FIX: spinnerKeyframes is a string containing CSS keyframes, not a CSSProperties object.
// It must be defined separately from the 'styles' object to avoid a type error.
const spinnerKeyframes = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;

const styles: { [key: string]: React.CSSProperties } = {
  contentGrid: { display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '30px' },
  formCard: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px', alignSelf: 'start' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontWeight: 500 },
  textarea: { padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '1rem', width: '100%', minHeight: '150px', resize: 'vertical' },
  button: { padding: '12px 20px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' },
  buttonDisabled: { backgroundColor: 'var(--primary-hover-color)', cursor: 'not-allowed' },
  resultsContainer: { display: 'flex', flexDirection: 'column', gap: '20px' },
  resultCard: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '20px' },
  resultTitle: { fontSize: '1.2rem', fontWeight: 600, margin: '0 0 15px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' },
  error: { color: 'var(--danger-color)', padding: '15px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)', border: '1px solid var(--danger-color)' },
  loaderContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' },
  loader: { border: '4px solid #f3f3f3', borderTop: '4px solid var(--primary-color)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' },
  pre: { backgroundColor: '#f8f9fa', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '15px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.9rem' },
  placeholder: { textAlign: 'center', color: '#666', padding: '50px', backgroundColor: '#f8f9fa', borderRadius: 'var(--border-radius)', border: '2px dashed var(--border-color)' }
};

type SuggestedRule = Pick<AutomationRule, 'name' | 'rule_type' | 'ad_type' | 'config'>;

export function AIRuleSuggester() {
    const [goal, setGoal] = useState('');
    const [suggestion, setSuggestion] = useState<SuggestedRule | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // FIX: Initialize GoogleGenAI. This was missing.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const handleSuggestRule = useCallback(async () => {
        if (!goal.trim()) return;
        setLoading(true);
        setError(null);
        setSuggestion(null);

        const prompt = `
            You are an expert Amazon PPC automation strategist. Your task is to create a rule in a valid JSON format based on the user's goal.

            User's Goal: "${goal}"

            Please adhere to the following structure and constraints for the JSON output.

            --- JSON Structure & Rules ---

            1.  **rule_type**: Choose ONE of the following:
                *   "BID_ADJUSTMENT": For changing keyword/target bids.
                *   "SEARCH_TERM_AUTOMATION": For creating negative keywords from search terms. This is for Sponsored Products (SP) only.
                *   "BUDGET_ACCELERATION": For increasing campaign budgets based on daily performance. This is for Sponsored Products (SP) only.

            2.  **ad_type**: Specify "SP", "SB", or "SD". If the user doesn't specify, default to "SP". For SEARCH_TERM_AUTOMATION and BUDGET_ACCELERATION, this MUST be "SP".

            3.  **config.conditionGroups**: An array of IF/THEN blocks. The rule engine checks them from top to bottom and stops at the first match ("first match wins").
                *   **conditions**: An array of conditions inside an IF block. All must be true (AND logic).
                    *   **metric**:
                        *   For BID_ADJUSTMENT/SEARCH_TERM_AUTOMATION: "spend", "sales", "acos", "orders", "clicks", "impressions".
                        *   For BUDGET_ACCELERATION: "roas", "acos", "sales", "orders", "budgetUtilization".
                    *   **timeWindow**: Number of days (e.g., 7, 30, 60). For BUDGET_ACCELERATION metrics, this MUST be the string "TODAY".
                    *   **operator**: ">", "<", or "=".
                    *   **value**: A number. For ACOS/budgetUtilization, a value of 30 means 30%.
                *   **action**: The THEN block.
                    *   **type** (for BID_ADJUSTMENT): "adjustBidPercent". \`value\` is the percentage change (e.g., -10 for -10%).
                    *   **type** (for SEARCH_TERM_AUTOMATION): "negateSearchTerm". Also specify \`matchType\` ("NEGATIVE_EXACT" or "NEGATIVE_PHRASE").
                    *   **type** (for BUDGET_ACCELERATION): "increaseBudgetPercent". \`value\` is the percentage increase (e.g., 50 for +50%).

            --- Example ---
            User Goal: "Create a negative keyword if a search term spends more than $20 in the last 60 days with zero sales."
            Expected JSON:
            {
              "name": "Negate Zero-Sale High-Spend Terms",
              "rule_type": "SEARCH_TERM_AUTOMATION",
              "ad_type": "SP",
              "config": {
                "conditionGroups": [{
                  "conditions": [
                    {"metric": "spend", "timeWindow": "60", "operator": ">", "value": 20},
                    {"metric": "sales", "timeWindow": "60", "operator": "=", "value": 0}
                  ],
                  "action": {"type": "negateSearchTerm", "matchType": "NEGATIVE_EXACT"}
                }]
              }
            }

            Now, generate the JSON for the user's goal.
        `;
        
        const conditionSchema = {
            type: Type.OBJECT,
            properties: {
                metric: { type: Type.STRING },
                // FIX: timeWindow is a string in the schema because it can be "TODAY", which is not a number.
                timeWindow: { type: Type.STRING, description: "Can be a number of days as a string (e.g., '30') or the literal string 'TODAY'." },
                operator: { type: Type.STRING },
                value: { type: Type.NUMBER }
            },
            required: ["metric", "timeWindow", "operator", "value"]
        };
        
        const actionSchema = {
            type: Type.OBJECT,
            properties: {
                type: { type: Type.STRING },
                value: { type: Type.NUMBER },
                matchType: { type: Type.STRING },
                minBid: { type: Type.NUMBER },
                maxBid: { type: Type.NUMBER },
            },
            required: ["type"]
        };

        const conditionGroupSchema = {
            type: Type.OBJECT,
            properties: {
                conditions: { type: Type.ARRAY, items: conditionSchema },
                action: actionSchema
            },
            required: ["conditions", "action"]
        };

        const schema = {
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING, description: "A descriptive name for the rule." },
                rule_type: { type: Type.STRING, description: 'One of "BID_ADJUSTMENT", "SEARCH_TERM_AUTOMATION", or "BUDGET_ACCELERATION".' },
                ad_type: { type: Type.STRING, description: 'One of "SP", "SB", or "SD".' },
                config: {
                    type: Type.OBJECT,
                    properties: {
                        conditionGroups: { type: Type.ARRAY, items: conditionGroupSchema }
                    },
                    required: ["conditionGroups"]
                }
            },
            required: ["name", "rule_type", "config"]
        };

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: schema,
                },
            });
            const text = response.text.trim();
            const parsedResult = JSON.parse(text);
            
            // Post-processing to convert numeric timeWindow strings to numbers, as the app type expects it.
            if (parsedResult.config?.conditionGroups) {
                parsedResult.config.conditionGroups.forEach((group: AutomationConditionGroup) => {
                    group.conditions.forEach(cond => {
                        if (cond.timeWindow !== 'TODAY' && !isNaN(Number(cond.timeWindow))) {
                            cond.timeWindow = Number(cond.timeWindow);
                        }
                    });
                });
            }

            setSuggestion(parsedResult);
        } catch (err) {
            console.error("Error generating rule suggestion:", err);
            setError(err instanceof Error ? err.message : "An unknown error occurred. The AI may have returned an invalid format.");
        } finally {
            setLoading(false);
        }
    }, [ai, goal]);

    const renderSuggestion = (suggestion: SuggestedRule) => {
        return (
            <>
                <div style={styles.resultCard}>
                    <h2 style={styles.resultTitle}>Suggested Rule: {suggestion.name}</h2>
                    <p><strong>Rule Type:</strong> {suggestion.rule_type}</p>
                    <p><strong>Ad Type:</strong> {suggestion.ad_type || 'N/A'}</p>
                    <div>
                        <strong>Logic:</strong>
                        {(suggestion.config.conditionGroups || []).map((group, i) => (
                            <div key={i} style={{ border: '1px solid #eee', padding: '10px', borderRadius: '4px', margin: '10px 0' }}>
                                <p style={{ margin: 0, fontWeight: 'bold' }}>{i > 0 && 'OR ' }IF:</p>
                                <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                                    {group.conditions.map((cond, j) => (
                                        <li key={j}>
                                            <strong>{cond.metric}</strong> in last <strong>{cond.timeWindow === 'TODAY' ? 'Today' : `${cond.timeWindow} days`}</strong> is <strong>{cond.operator} {cond.value}</strong>
                                        </li>
                                    ))}
                                </ul>
                                <p style={{ margin: 0, fontWeight: 'bold' }}>THEN:</p>
                                <p style={{ margin: '5px 0 0 20px' }}>{JSON.stringify(group.action)}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={styles.resultCard}>
                     <h2 style={styles.resultTitle}>Raw JSON Output</h2>
                     <pre style={styles.pre}>
                        {JSON.stringify(suggestion, null, 2)}
                     </pre>
                </div>
            </>
        )
    };
    
    return (
        <div>
            <style>{spinnerKeyframes}</style>
            <div style={styles.contentGrid}>
                <div style={styles.formCard}>
                    <div style={styles.formGroup}>
                        <label htmlFor="goal" style={styles.label}>Describe Your Automation Goal</label>
                        <p style={{fontSize: '0.9rem', color: '#666', margin: '0 0 5px 0'}}>
                            Describe what you want to automate in plain English. Be specific about metrics, timeframes, and desired actions.
                        </p>
                        <textarea 
                            id="goal" 
                            style={styles.textarea} 
                            value={goal} 
                            onChange={e => setGoal(e.target.value)} 
                            placeholder="e.g., 'Lower my ACOS by pausing keywords that have spent over $15 in the last 30 days without making any sales.' or 'Create negative keywords for any search term that gets more than 50 clicks in 14 days with 0 orders.'"
                        />
                    </div>
                    <button onClick={handleSuggestRule} style={loading ? { ...styles.button, ...styles.buttonDisabled } : styles.button} disabled={loading}>
                        {loading ? 'Thinking...' : 'Suggest Rule'}
                    </button>
                </div>
                <div style={styles.resultsContainer}>
                    {loading && <div style={styles.loaderContainer}><div style={styles.loader}></div></div>}
                    {error && <div style={styles.error}>{error}</div>}
                    {suggestion && renderSuggestion(suggestion)}
                    {!loading && !error && !suggestion && (
                        <div style={styles.placeholder}>
                           <p>Your AI-generated rule will appear here.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
