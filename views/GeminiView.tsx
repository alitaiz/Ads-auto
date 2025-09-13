import React, { useState, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";

// FIX: spinnerKeyframes is a string containing CSS keyframes, not a CSSProperties object.
// It must be defined separately from the 'styles' object to avoid a type error.
const spinnerKeyframes = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;

const styles: { [key: string]: React.CSSProperties } = {
  container: { maxWidth: '1200px', margin: '0 auto', padding: '20px' },
  header: { marginBottom: '20px' },
  title: { fontSize: '2rem', margin: 0 },
  tabs: { display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '20px' },
  tabButton: { padding: '10px 15px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 500, color: '#555', borderBottom: '3px solid transparent' },
  tabButtonActive: { color: 'var(--primary-color)', borderBottom: '3px solid var(--primary-color)' },
  contentGrid: { display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '30px' },
  formCard: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontWeight: 500 },
  input: { padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '1rem', width: '100%' },
  textarea: { padding: '10px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '1rem', width: '100%', minHeight: '100px', resize: 'vertical' },
  button: { padding: '12px 20px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' },
  buttonDisabled: { backgroundColor: 'var(--primary-hover-color)', cursor: 'not-allowed' },
  resultsContainer: { display: 'flex', flexDirection: 'column', gap: '20px' },
  resultCard: { backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', padding: '20px' },
  resultTitle: { fontSize: '1.2rem', fontWeight: 600, margin: '0 0 15px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' },
  resultList: { margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px' },
  error: { color: 'var(--danger-color)', padding: '15px', backgroundColor: '#fdd', borderRadius: 'var(--border-radius)', border: '1px solid var(--danger-color)' },
  loaderContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' },
  loader: { border: '4px solid #f3f3f3', borderTop: '4px solid var(--primary-color)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' },
  imageResult: { maxWidth: '100%', height: 'auto', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', marginTop: '10px' },
};

interface AdCopyResult {
    headlines: string[];
    descriptions: string[];
}

export function GeminiView() {
    const [activeTab, setActiveTab] = useState('copy');

    const [adCopyInputs, setAdCopyInputs] = useState({ productName: '', features: '', audience: '', tone: 'Professional' });
    const [adCopyResult, setAdCopyResult] = useState<AdCopyResult | null>(null);
    const [adCopyLoading, setAdCopyLoading] = useState(false);
    const [adCopyError, setAdCopyError] = useState<string | null>(null);

    const [imagePrompt, setImagePrompt] = useState('');
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [imageLoading, setImageLoading] = useState(false);
    const [imageError, setImageError] = useState<string | null>(null);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const handleGenerateAdCopy = useCallback(async () => {
        setAdCopyLoading(true);
        setAdCopyError(null);
        setAdCopyResult(null);

        const prompt = `
            You are an expert Amazon PPC and e-commerce copywriter. Your task is to generate compelling ad copy based on the provided product information. The output must be in the specified JSON format.

            Product Information:
            - Product Name: ${adCopyInputs.productName}
            - Key Features (one per line):
              ${adCopyInputs.features}
            - Target Audience: ${adCopyInputs.audience}
            - Tone of Voice: ${adCopyInputs.tone}

            Generate 3 unique headlines (maximum 30 characters each) and 2 unique descriptions (maximum 90 characters each). Ensure the copy is engaging and highlights the key benefits for the target audience.
        `;
        
        const schema = {
            type: Type.OBJECT,
            properties: {
                headlines: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Array of 3 ad headlines, each under 30 characters."
                },
                descriptions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Array of 2 ad descriptions, each under 90 characters."
                }
            },
            required: ["headlines", "descriptions"],
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
            setAdCopyResult(parsedResult);
        } catch (error) {
            console.error("Error generating ad copy:", error);
            setAdCopyError(error instanceof Error ? error.message : "An unknown error occurred.");
        } finally {
            setAdCopyLoading(false);
        }
    }, [ai.models, adCopyInputs]);

    const handleGenerateImage = useCallback(async () => {
        if (!imagePrompt.trim()) return;
        setImageLoading(true);
        setImageError(null);
        setImageUrl(null);
        try {
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: imagePrompt,
                config: {
                  numberOfImages: 1,
                  outputMimeType: 'image/jpeg',
                  aspectRatio: '1:1',
                },
            });

            if (response.generatedImages && response.generatedImages.length > 0) {
                const base64ImageBytes = response.generatedImages[0].image.imageBytes;
                const url = `data:image/jpeg;base64,${base64ImageBytes}`;
                setImageUrl(url);
            } else {
                throw new Error("No image was generated. Please try a different prompt.");
            }
        } catch (error) {
            console.error("Error generating image:", error);
            setImageError(error instanceof Error ? error.message : "An unknown error occurred.");
        } finally {
            setImageLoading(false);
        }
    }, [ai.models, imagePrompt]);

    return (
        <div style={styles.container}>
            <style>{spinnerKeyframes}</style>
            <header style={styles.header}>
                <h1 style={styles.title}>Gemini Creative Studio</h1>
            </header>

            <div style={styles.tabs}>
                <button style={activeTab === 'copy' ? { ...styles.tabButton, ...styles.tabButtonActive } : styles.tabButton} onClick={() => setActiveTab('copy')}>AI Ad Copy Generation</button>
                <button style={activeTab === 'image' ? { ...styles.tabButton, ...styles.tabButtonActive } : styles.tabButton} onClick={() => setActiveTab('image')}>AI Image Generation</button>
            </div>

            {activeTab === 'copy' && (
                <div style={styles.contentGrid}>
                    <div style={styles.formCard}>
                        <div style={styles.formGroup}>
                            <label htmlFor="productName" style={styles.label}>Product Name / Title</label>
                            <input id="productName" style={styles.input} value={adCopyInputs.productName} onChange={e => setAdCopyInputs(p => ({ ...p, productName: e.target.value }))} placeholder="e.g., Ergonomic Office Chair" />
                        </div>
                        <div style={styles.formGroup}>
                            <label htmlFor="features" style={styles.label}>Key Features & Benefits (one per line)</label>
                            <textarea id="features" style={styles.textarea} value={adCopyInputs.features} onChange={e => setAdCopyInputs(p => ({ ...p, features: e.target.value }))} placeholder="e.g., Adjustable lumbar support for all-day comfort&#10;Breathable mesh back to keep you cool" />
                        </div>
                        <div style={styles.formGroup}>
                            <label htmlFor="audience" style={styles.label}>Target Audience</label>
                            <input id="audience" style={styles.input} value={adCopyInputs.audience} onChange={e => setAdCopyInputs(p => ({ ...p, audience: e.target.value }))} placeholder="e.g., Remote workers and students" />
                        </div>
                        <div style={styles.formGroup}>
                            <label htmlFor="tone" style={styles.label}>Tone of Voice</label>
                            <select id="tone" style={styles.input} value={adCopyInputs.tone} onChange={e => setAdCopyInputs(p => ({ ...p, tone: e.target.value }))}>
                                <option>Professional</option><option>Casual</option><option>Witty</option><option>Persuasive</option><option>Luxury</option>
                            </select>
                        </div>
                        <button onClick={handleGenerateAdCopy} style={adCopyLoading ? { ...styles.button, ...styles.buttonDisabled } : styles.button} disabled={adCopyLoading}>
                            {adCopyLoading ? 'Generating...' : 'Generate Ad Copy'}
                        </button>
                    </div>
                    <div style={styles.resultsContainer}>
                        {adCopyLoading && <div style={styles.loaderContainer}><div style={styles.loader}></div></div>}
                        {adCopyError && <div style={styles.error}>{adCopyError}</div>}
                        {adCopyResult && (
                            <>
                                <div style={styles.resultCard}>
                                    <h2 style={styles.resultTitle}>Generated Headlines</h2>
                                    <ul style={styles.resultList}>
                                        {adCopyResult.headlines.map((h, i) => <li key={i}>{h}</li>)}
                                    </ul>
                                </div>
                                <div style={styles.resultCard}>
                                    <h2 style={styles.resultTitle}>Generated Descriptions</h2>
                                    <ul style={styles.resultList}>
                                        {adCopyResult.descriptions.map((d, i) => <li key={i}>{d}</li>)}
                                    </ul>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'image' && (
                <div style={styles.contentGrid}>
                    <div style={styles.formCard}>
                        <div style={styles.formGroup}>
                            <label htmlFor="imagePrompt" style={styles.label}>Image Prompt</label>
                            <textarea id="imagePrompt" style={styles.textarea} value={imagePrompt} onChange={e => setImagePrompt(e.target.value)} placeholder="Describe the image you want to create. Be as specific as possible for the best results.&#10;e.g., A photorealistic image of a sleek black ergonomic office chair in a modern, sunlit home office." />
                        </div>
                        <button onClick={handleGenerateImage} style={imageLoading ? { ...styles.button, ...styles.buttonDisabled } : styles.button} disabled={imageLoading}>
                            {imageLoading ? 'Generating...' : 'Generate Image'}
                        </button>
                    </div>
                    <div style={styles.resultsContainer}>
                        {imageLoading && <div style={styles.loaderContainer}><div style={styles.loader}></div></div>}
                        {imageError && <div style={styles.error}>{imageError}</div>}
                        {imageUrl && (
                            <div style={styles.resultCard}>
                                <h2 style={styles.resultTitle}>Generated Image</h2>
                                <img src={imageUrl} alt={imagePrompt} style={styles.imageResult} />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}