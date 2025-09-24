import React, { useState, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";

const spinnerKeyframes = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;

const styles: { [key: string]: React.CSSProperties } = {
    container: { display: 'flex', flexDirection: 'column', gap: '15px', backgroundColor: 'var(--card-background-color)', padding: '20px', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)' },
    textarea: { width: '100%', minHeight: '120px', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '1rem', resize: 'vertical' },
    button: { padding: '10px 15px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem', alignSelf: 'flex-start' },
    buttonDisabled: { backgroundColor: 'var(--primary-hover-color)', cursor: 'not-allowed' },
    resultContainer: { marginTop: '15px', backgroundColor: '#f8f9fa', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '15px' },
    resultHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
    pre: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, maxHeight: '300px', overflowY: 'auto' },
    error: { color: 'var(--danger-color)', padding: '15px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)' },
    loader: { border: '3px solid #f3f3f3', borderTop: '3px solid var(--primary-color)', borderRadius: '50%', width: '24px', height: '24px', animation: 'spin 1s linear infinite' },
};

interface AIRuleSuggesterProps {
    onApplySuggestion: (suggestion: any) => void;
    provider: 'gemini' | 'openai';
}

export const AIRuleSuggester = React.memo(({ onApplySuggestion, provider }: AIRuleSuggesterProps) => {
    const [goal, setGoal] = useState('');
    const [suggestion, setSuggestion] = useState<any | null>(null);
    const [reasoning, setReasoning] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const generateSuggestion = useCallback(async () => {
        if (!goal.trim()) return;
        setLoading(true);
        setError(null);
        setSuggestion(null);
        setReasoning(null);

        try {
            const response = await fetch('/api/ai/suggest-rule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    provider, 
                    ruleType: 'BID_ADJUSTMENT', // This can be made dynamic later
                    isNewProduct: false, // This can be made dynamic later
                    goal, // Sending the goal for context
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to get suggestion from backend.');
            }

            setSuggestion(data.suggestion);
            setReasoning(data.reasoning);

        } catch (err) {
            console.error("Error generating AI suggestion:", err);
            setError(err instanceof Error ? err.message : "An unknown error occurred.");
        } finally {
            setLoading(false);
        }
    }, [goal, provider]);

    const handleApply = () => {
        if (!suggestion) return;
        try {
            onApplySuggestion(suggestion);
        } catch (e) {
            setError("Cannot apply suggestion: Invalid format.");
        }
    };

    return (
        <div style={styles.container}>
            <style>{spinnerKeyframes}</style>
            <textarea
                style={styles.textarea}
                value={goal}
                onChange={e => setGoal(e.target.value)}
                placeholder="e.g., Lower my ACOS by reducing bids on keywords with high spend and no sales in the last 14 days."
                disabled={loading}
            />
            <button
                onClick={generateSuggestion}
                style={loading ? { ...styles.button, ...styles.buttonDisabled } : styles.button}
                disabled={loading || !goal.trim()}
            >
                {loading ? <div style={{...styles.loader, width: '18px', height: '18px'}}></div> : 'Get AI Suggestion'}
            </button>
            {error && <div style={styles.error}>{error}</div>}
            {suggestion && (
                <div style={styles.resultContainer}>
                    <div style={styles.resultHeader}>
                        <strong>Suggested Configuration:</strong>
                        <button onClick={handleApply} style={{...styles.button, padding: '6px 12px', fontSize: '0.9rem'}}>Apply to Editor</button>
                    </div>
                    {reasoning && <p style={{fontStyle: 'italic', borderLeft: '3px solid var(--primary-color)', paddingLeft: '10px'}}>{reasoning}</p>}
                    <pre style={styles.pre}><code>{JSON.stringify(suggestion, null, 2)}</code></pre>
                </div>
            )}
        </div>
    );
});