// views/AICopilotView.tsx
import React, { useState, useRef, useEffect, useContext, useCallback, useMemo } from 'react';
import { marked } from 'marked';
import { DataCacheContext } from '../contexts/DataCacheContext';
import { ChatMessage, AICopilotCache, LoadedDataInfo, PerformanceFilterOptions } from '../types';

const styles: { [key: string]: React.CSSProperties } = {
    container: { display: 'grid', gridTemplateColumns: '280px 1fr 1.5fr', gap: '20px', height: 'calc(100vh - 100px)', padding: '20px' },
    historyPanel: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '15px', backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', overflowY: 'auto', transition: 'width 0.3s ease, padding 0.3s ease' },
    leftPanel: { display: 'flex', flexDirection: 'column', gap: '15px', padding: '20px', backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)', overflowY: 'auto', transition: 'width 0.3s ease, padding 0.3s ease' },
    rightPanel: { display: 'flex', flexDirection: 'column', backgroundColor: 'var(--card-background-color)', borderRadius: 'var(--border-radius)', boxShadow: 'var(--box-shadow)' },
    formGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },
    label: { fontWeight: 500, fontSize: '0.9rem' },
    input: { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem' },
    textarea: { padding: '8px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.9rem', minHeight: '150px', resize: 'vertical', fontFamily: 'monospace' },
    dateInputContainer: { display: 'flex', gap: '10px' },
    toolCard: { border: '1px solid var(--border-color)', borderRadius: '8px', padding: '15px', backgroundColor: '#f8f9fa' },
    toolHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
    toolTitle: { margin: 0, fontSize: '1.1rem' },
    toolButton: { padding: '8px 12px', border: '1px solid var(--primary-color)', color: 'var(--primary-color)', background: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 500 },
    toolStatus: { fontSize: '0.8rem', color: '#666', fontStyle: 'italic' },
    chatWindow: { flex: 1, padding: '20px', overflowY: 'auto', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' },
    chatInputForm: { display: 'flex', padding: '10px', gap: '10px', alignItems: 'center' },
    chatInput: { flex: 1, padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1rem' },
    sendButton: { padding: '10px 20px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', height: '44px', minWidth: '80px', fontWeight: 600 },
    secondaryButton: { padding: '10px 20px', backgroundColor: 'var(--primary-hover-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', height: '44px', fontWeight: 600 },
    message: { marginBottom: '15px', padding: '10px 15px', borderRadius: '10px', maxWidth: '85%' },
    userMessage: { backgroundColor: '#e6f7ff', alignSelf: 'flex-end', borderBottomRightRadius: '0px' },
    aiMessage: { backgroundColor: '#f0f2f2', alignSelf: 'flex-start', borderBottomLeftRadius: '0px' },
    thinking: { fontStyle: 'italic', color: '#666', padding: '5px 0' },
    error: { color: 'var(--danger-color)', fontSize: '0.9rem', marginTop: '5px' },
    aiProviderName: { fontWeight: 'bold', margin: '0 0 8px 0', textTransform: 'capitalize', color: 'var(--primary-color)' },
    // History Panel Styles
    historyHeader: { paddingBottom: '10px', borderBottom: '1px solid var(--border-color)', marginBottom: '10px'},
    newChatButton: { width: '100%', padding: '10px', fontSize: '1rem' },
    historyList: { listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', flex: 1 },
    historyItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderRadius: '4px', cursor: 'pointer', marginBottom: '5px' },
    historyItemActive: { backgroundColor: 'var(--primary-hover-color)', color: 'white' },
    historyItemText: { flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '8px' },
    deleteButton: { background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.2rem', padding: '0 5px', flexShrink: 0 },
    // SQP Table Styles
    tableContainer: { overflowX: 'auto', marginTop: '10px', border: '1px solid var(--border-color)', borderRadius: '4px' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { padding: '10px', textAlign: 'left', borderBottom: '2px solid var(--border-color)', backgroundColor: '#f8f9fa', fontWeight: 600, cursor: 'pointer', userSelect: 'none' },
    td: { padding: '10px', borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap' },
    // Custom Dropdown for SQP
    sqpDropdown: { position: 'relative', userSelect: 'none' },
    sqpDropdownButton: { 
        width: '100%', 
        padding: '8px 12px', 
        border: '1px solid #ccc', 
        borderRadius: '4px', 
        backgroundColor: 'white', 
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '1rem',
        fontFamily: 'inherit',
        color: 'inherit'
    },
    sqpDropdownPanel: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        backgroundColor: 'white',
        border: '1px solid #ccc',
        borderRadius: '4px',
        marginTop: '4px',
        maxHeight: '200px',
        overflowY: 'auto',
        zIndex: 10,
        boxShadow: '0 2px 5px rgba(0,0,0,0.15)'
    },
    sqpDropdownItem: {
        padding: '8px 12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    },
    sqpDropdownItemHover: {
        backgroundColor: '#f0f2f2'
    },
    checkbox: {
        width: '16px',
        height: '16px',
        margin: 0,
        pointerEvents: 'none' // Prevent double-clicking
    },
    // New Styles for Collapsible Panels
    collapseButton: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.5rem', padding: '0 5px', lineHeight: 1 },
    expandButton: {
        padding: '10px',
        border: '1px solid var(--primary-color)',
        color: 'var(--primary-color)',
        background: 'white',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 500,
        width: '48px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px'
    },
    expandButtonIcon: { fontSize: '1.5rem' },
    expandButtonText: { writingMode: 'vertical-rl', textOrientation: 'mixed', fontWeight: 600 },
};

// ... (systemPromptTemplates remains the same)
const systemPromptTemplates = [
    {
        name: "Default PPC Expert Analyst",
        prompt: `You are an expert Amazon PPC Analyst named "Co-Pilot". Your goal is to help users analyze performance data and provide strategic advice.

You will be provided with several pieces of data:
1.  **Product Info:** ASIN, sale price, product cost, and a single **Total Amazon Fee**. This is for profitability calculations. Note: This total fee is passed in the 'FBA Fee' field, and 'Referral Fee' is set to 0.
2.  **Performance Data:** This is a JSON object containing up to four data sets. Understand their differences:

    *   **Search Term Report Data:** This is HISTORICAL, AGGREGATED data from official reports. It has a **2-day reporting delay**. Use this for long-term trend analysis, identifying high-performing customer search terms, and finding irrelevant terms to negate. It reflects ADVERTISING performance for specific search terms.

    *   **Stream Data:** This is NEAR REAL-TIME, AGGREGATED data. It is very recent and good for understanding performance for **"yesterday" or "today"**. This also reflects ADVERTISING performance.

    *   **Sales & Traffic Data:** This includes ORGANIC metrics. Use this to understand the overall health of the product, like total sessions and unit session percentage (conversion rate).

    *   **Search Query Performance Data:** This is from **Brand Analytics**. It is **WEEKLY** data and shows the **ENTIRE SEARCH FUNNEL** (impressions, clicks, add to carts, purchases) for a given search query across ALL products on Amazon, not just yours. It provides your ASIN's share of each of these metrics. This is extremely powerful for understanding market share and customer behavior but is NOT direct ad performance.

**CRITICAL INSTRUCTION:** Do NOT simply add the metrics from different data sources together. They represent different timeframes and data types. Use them contextually.
- Use Search Term/Stream for ad performance.
- Use Sales & Traffic for organic health.
- Use Search Query Performance for market share and search funnel analysis.

Your Task:
1.  **Acknowledge the data provided.** Note the date ranges for each dataset. If some data is missing, mention it.
2.  Answer the user's question based on the distinct data sources.
3.  Present your analysis clearly, using formatting like lists and bold text.
4.  If you suggest an automation rule, provide the JSON for it in a markdown code block.
5.  Remember the context of the data for follow-up questions.`
    },
    {
        name: "Profitability Guardian",
        prompt: `You are a meticulous Amazon PPC Analyst laser-focused on profitability. Your primary directive is to maximize profit from ad spend.
1.  **Product Info:** ASIN, sale price, product cost, and a single **Total Amazon Fee**. This is for profitability calculations. Note: This total fee is passed in the 'FBA Fee' field, and 'Referral Fee' is set to 0.
2. Always calculate the break-even ACOS first using the provided product info (Sale Price - Product Cost - Total Amazon Fee). The Total Amazon Fee is provided in the 'FBA Fee' field.
3. Analyze performance data strictly through the lens of profitability. Identify keywords and campaigns that are unprofitable (ACOS > break-even ACOS).
4. Your recommendations should prioritize cutting wasteful spend and improving the ACOS of profitable campaigns.
5. When suggesting bid adjustments, explain *why* based on the profitability calculation. Suggest aggressive bid reductions for unprofitable terms.
6. Be conservative about increasing spend unless ROAS is very high and there's clear evidence of profitability.`
    },
    {
        name: "Aggressive Growth Hacker",
        prompt: `You are a bold Amazon PPC Strategist focused on aggressive growth and market share domination. Your main goal is to increase visibility and sales velocity, even if it means a temporarily higher ACOS.
1.  **Product Info:** ASIN, sale price, product cost, and a single **Total Amazon Fee**. This is for profitability calculations. Note: This total fee is passed in the 'FBA Fee' field, and 'Referral Fee' is set to 0.
2. Identify the highest-traffic search terms from the reports, regardless of their current ACOS.
3. Suggest strategies to increase impression share and top-of-search rank for key terms.
4. Look for opportunities to expand into new keywords and targeting methods based on customer search patterns.
5. Your recommendations should be biased towards increasing bids, expanding budgets, and launching new campaigns.
6. Frame your advice in terms of capturing market share and driving sales volume to improve organic ranking (the flywheel effect).`
    },
    {
        name: "Just the Data Summarizer",
        prompt: `You are a data-only assistant. Your task is to be a clear and concise data summarizer.
1. When given data, present the key performance indicators (KPIs) in a simple, easy-to-read format (like a table or bullet points).
2. Calculate basic metrics like ACOS, CPC, CVR if possible, but do not interpret them.
3. DO NOT provide any strategic advice, opinions, or recommendations unless the user explicitly asks for them in a follow-up question.
4. Your tone should be neutral and purely informational.`
    },
    {
        name: "Automation Rule Architect",
        prompt: `You are an AI assistant specializing in writing PPC automation rules. Your sole purpose is to analyze the provided performance data and translate your findings into a valid JSON structure for an automation rule.
1. Analyze the data to find clear patterns of over-spending, under-performance, or high-profitability.
2. Based on your analysis, formulate a logical IF/THEN condition.
3. Your primary output should be a markdown code block containing the JSON for an automation rule that implements your logic.
4. Briefly explain the logic of the rule you created above the code block.`
    }
];

const CollapsibleDataContext = ({ contextData }: { contextData: string }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const toggleStyle: React.CSSProperties = {
        cursor: 'pointer',
        color: 'var(--primary-color)',
        fontWeight: 500,
        marginBottom: '10px',
        display: 'inline-block',
        border: '1px solid var(--border-color)',
        padding: '5px 10px',
        borderRadius: '4px',
        backgroundColor: '#f8f9fa'
    };
    
    const dataContainerStyle: React.CSSProperties = {
        border: '1px dashed #ccc', 
        padding: '10px', 
        borderRadius: '4px', 
        marginBottom: '10px',
        backgroundColor: '#fafafa',
        maxHeight: '400px',
        overflowY: 'auto'
    };

    return (
        <div>
            <button type="button" onClick={() => setIsExpanded(!isExpanded)} style={toggleStyle}>
                {isExpanded ? '▼ Hide' : '► Show'} Data Context
            </button>
            {isExpanded && (
                <div style={dataContainerStyle}>
                     <div dangerouslySetInnerHTML={{ __html: marked.parse(contextData) }} />
                </div>
            )}
        </div>
    );
};


export function AICopilotView() {
    const { cache, setCache } = useContext(DataCacheContext);
    const aiCache = cache.aiCopilot;
    
    const [selectedTemplateName, setSelectedTemplateName] = useState('Default PPC Expert Analyst');
    const [aiProvider, setAiProvider] = useState<'gemini' | 'openai'>('gemini');
    const [sqpFilterOptions, setSqpFilterOptions] = useState<PerformanceFilterOptions['weeks']>([]);
    const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);
    
    const [isSqpDropdownOpen, setIsSqpDropdownOpen] = useState(false);
    const [hoveredWeek, setHoveredWeek] = useState<string | null>(null);
    const sqpDropdownRef = useRef<HTMLDivElement>(null);

    const [conversationHistory, setConversationHistory] = useState<any[]>([]);
    const [profileId, setProfileId] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const [isHistoryVisible, setIsHistoryVisible] = useState(true);
    const [isControlsVisible, setIsControlsVisible] = useState(true);

    const containerStyle = useMemo(() => ({
        ...styles.container,
        gridTemplateColumns: `${isHistoryVisible ? '280px' : 'auto'} ${isControlsVisible ? '1fr' : 'auto'} 1.5fr`,
    }), [isHistoryVisible, isControlsVisible]);

    useEffect(() => {
        const storedProfileId = localStorage.getItem('selectedProfileId');
        setProfileId(storedProfileId);
    }, []);

    const updateAiCache = (updater: (prev: AICopilotCache) => AICopilotCache) => {
        setCache(prevCache => ({
            ...prevCache,
            aiCopilot: updater(prevCache.aiCopilot),
        }));
    };
    
    const fetchHistory = useCallback(async () => {
        if (!profileId) return;
        try {
            const response = await fetch(`/api/ai/conversations?profileId=${profileId}`);
            if (response.ok) {
                const data = await response.json();
                setConversationHistory(data);
            }
        } catch (e) { console.error("Failed to fetch history", e); }
    }, [profileId]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    useEffect(() => {
        const matchingTemplate = systemPromptTemplates.find(t => t.prompt === aiCache.chat.systemInstruction);
        setSelectedTemplateName(matchingTemplate ? matchingTemplate.name : "Custom");
    }, [aiCache.chat.systemInstruction]);

    useEffect(() => {
        const fetchSqpFilters = async () => {
            try {
                const response = await fetch('/api/query-performance-filters');
                if (!response.ok) return;
                const data: PerformanceFilterOptions = await response.json();
                setSqpFilterOptions(data.weeks || []);
                if (data.weeks.length > 0 && selectedWeeks.length === 0) {
                    setSelectedWeeks([data.weeks[0].value]);
                }
            } catch (e) {
                console.error("Failed to fetch SQP filter options", e);
            }
        };
        fetchSqpFilters();
    }, [selectedWeeks.length]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (sqpDropdownRef.current && !sqpDropdownRef.current.contains(event.target as Node)) {
                setIsSqpDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const setProductInfo = (key: keyof AICopilotCache['productInfo'], value: string) => {
        updateAiCache(prev => ({ ...prev, productInfo: { ...prev.productInfo, [key]: value } }));
    };

    useEffect(() => {
        // This ensures the referral fee is always zero for the new single-field logic,
        // even on the initial load before the user interacts with the fee input.
        if (aiCache.productInfo.referralFeePercent !== '0') {
            setProductInfo('referralFeePercent', '0');
        }
    }, [aiCache.productInfo.referralFeePercent]);
    
    const setSystemInstruction = (instruction: string) => {
        updateAiCache(prev => ({ ...prev, chat: { ...prev.chat, systemInstruction: instruction } }));
    };

    const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const templateName = e.target.value;
        setSelectedTemplateName(templateName);
        if (templateName !== "Custom") {
            const selectedTemplate = systemPromptTemplates.find(t => t.name === templateName);
            if (selectedTemplate) {
                setSystemInstruction(selectedTemplate.prompt);
            }
        }
    };

    const setDateRange = (key: keyof AICopilotCache['dateRange'], value: string) => {
        updateAiCache(prev => ({ ...prev, dateRange: { ...prev.dateRange, [key]: value } }));
    };

    const [loading, setLoading] = useState({ st: false, stream: false, sat: false, chat: false, sqp: false });
    const [error, setError] = useState({ st: '', stream: '', sat: '', chat: '', sqp: '' });
    const [currentQuestion, setCurrentQuestion] = useState('');
    
    const chatEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [aiCache.chat.messages, loading.chat]);

    const handleLoadData = async (tool: 'st' | 'stream' | 'sat' | 'sqp') => {
        setLoading(prev => ({ ...prev, [tool]: true }));
        setError(prev => ({ ...prev, [tool]: '' }));
        
        let endpoint = '';
        let dataKey: keyof AICopilotCache['loadedData'];
        let body: any = {};

        switch (tool) {
            case 'st': 
                endpoint = '/api/ai/tool/search-term';
                dataKey = 'searchTermData';
                body = { 
                    asin: aiCache.productInfo.asin, 
                    startDate: aiCache.dateRange.startDate, 
                    endDate: aiCache.dateRange.endDate 
                };
                break;
            case 'stream':
                endpoint = '/api/ai/tool/stream';
                dataKey = 'streamData';
                body = { 
                    asin: aiCache.productInfo.asin, 
                    startDate: aiCache.dateRange.startDate, 
                    endDate: aiCache.dateRange.endDate 
                };
                break;
            case 'sat':
                endpoint = '/api/ai/tool/sales-traffic';
                dataKey = 'salesTrafficData';
                body = { 
                    asin: aiCache.productInfo.asin, 
                    startDate: aiCache.dateRange.startDate, 
                    endDate: aiCache.dateRange.endDate 
                };
                break;
            case 'sqp':
                endpoint = '/api/ai/tool/search-query-performance';
                dataKey = 'searchQueryPerformanceData';
                body = {
                    asin: aiCache.productInfo.asin,
                    weeks: selectedWeeks
                };
                break;
        }

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const responseData = await response.json();
            if (!response.ok) throw new Error(responseData.error || 'Failed to load data.');
            
            updateAiCache(prev => ({
                ...prev,
                loadedData: {
                    ...prev.loadedData,
                    [dataKey]: {
                        data: responseData.data,
                        dateRange: responseData.dateRange,
                    }
                }
            }));

        } catch (err) {
            setError(prev => ({ ...prev, [tool]: err instanceof Error ? err.message : 'An unknown error occurred' }));
        } finally {
            setLoading(prev => ({ ...prev, [tool]: false }));
        }
    };

    const handleViewData = (tool: 'st' | 'stream' | 'sat' | 'sqp') => {
        let dataInfo: LoadedDataInfo | null = null;
        switch(tool) {
            case 'st': dataInfo = aiCache.loadedData.searchTermData; break;
            case 'stream': dataInfo = aiCache.loadedData.streamData; break;
            case 'sat': dataInfo = aiCache.loadedData.salesTrafficData; break;
            case 'sqp': dataInfo = aiCache.loadedData.searchQueryPerformanceData; break;
        }
    
        if (dataInfo && dataInfo.data && dataInfo.data.length > 0) {
            const key = `ai-data-viewer-${tool}-${Date.now()}`;
            sessionStorage.setItem(key, JSON.stringify(dataInfo));
            window.open(`#/data-viewer/${key}`, '_blank');
        }
    };
    
    const handleStopConversation = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            updateAiCache(prev => {
                const lastMessage = prev.chat.messages[prev.chat.messages.length - 1];
                if (lastMessage?.sender === 'ai') {
                    const updatedMessages = [...prev.chat.messages];
                    updatedMessages[updatedMessages.length - 1] = {
                        ...lastMessage,
                        text: lastMessage.text + "\n\n*Generation stopped by user.*"
                    };
                    return { ...prev, chat: { ...prev.chat, messages: updatedMessages } };
                } else if (lastMessage?.sender === 'user') {
                     const stopMessage: ChatMessage = {
                        id: Date.now(), sender: 'ai', text: '*Generation stopped by user.*'
                    };
                    return { ...prev, chat: { ...prev.chat, messages: [...prev.chat.messages, stopMessage] }};
                }
                return prev;
            });
        }
    };

    const buildContextString = useCallback(() => {
        const { productInfo, loadedData } = aiCache;
        const { searchTermData, streamData, salesTrafficData, searchQueryPerformanceData } = loadedData;
        const formatData = (name: string, info: LoadedDataInfo) => {
            if (!info || !info.data || info.data.length === 0) return `- ${name}: Not provided`;
            const dateRange = info.dateRange ? `(Date Range: ${info.dateRange.startDate} to ${info.dateRange.endDate})` : '';
            return `- ${name} ${dateRange}: \`\`\`json\n${JSON.stringify(info.data, null, 2)}\n\`\`\``;
        };

        return `
Here is the data context for my question. Please analyze it before answering, paying close attention to the different date ranges for each data source.

**Product Information:**
- ASIN: ${productInfo.asin || 'Not provided'}
- Sale Price: $${productInfo.salePrice || 'Not provided'}
- Product Cost: $${productInfo.cost || 'Not provided'}
- Total Amazon Fee: $${productInfo.fbaFee || 'Not provided'}

**Performance Data:**
${formatData('Search Term Report Data', searchTermData)}
${formatData('Stream Data', streamData)}
${formatData('Sales & Traffic Data', salesTrafficData)}
${formatData('Search Query Performance Data', searchQueryPerformanceData)}
`;
    }, [aiCache]);

    const sendMessageToServer = async (messageText: string) => {
        if (!messageText.trim() || !profileId) {
            if (!profileId) alert("Please select a Profile in the PPC Management view first.");
            return;
        }

        const newUserMessage: ChatMessage = { id: Date.now(), sender: 'user', text: messageText };
        
        updateAiCache(prev => ({
            ...prev,
            chat: { ...prev.chat, messages: [...prev.chat.messages, newUserMessage] },
        }));

        setLoading(prev => ({...prev, chat: true}));
        setError(prev => ({...prev, chat: ''}));
        setCurrentQuestion('');

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const payload = {
                question: messageText, // The full message text is now the question
                conversationId: aiCache.chat.conversationId,
                context: {
                    // Context is now built into the question, but we still send system prompt
                    systemInstruction: aiCache.chat.systemInstruction,
                },
                profileId,
                provider: aiProvider,
            };

            const endpoint = aiProvider === 'gemini' ? '/api/ai/chat' : '/api/ai/chat-gpt';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });

            if (!response.body) throw new Error("Streaming response not available.");
            if (!response.ok) throw new Error((await response.json()).error);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let aiResponseText = '';
            let isFirstChunk = true;
            let currentAiMessageId = Date.now() + 1;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.error) throw new Error(parsed.error);

                        if (isFirstChunk) {
                            isFirstChunk = false;
                            const newConversationId = parsed.conversationId || aiCache.chat.conversationId;

                            updateAiCache(prev => {
                                const newAiMessagePlaceholder: ChatMessage = { id: currentAiMessageId, sender: 'ai', text: '' };
                                return {
                                    ...prev,
                                    chat: {
                                        ...prev.chat,
                                        messages: [...prev.chat.messages, newAiMessagePlaceholder],
                                        conversationId: newConversationId,
                                    },
                                };
                            });

                            if(parsed.conversationId) {
                                fetchHistory();
                            }
                        }

                        if (parsed.content) {
                            aiResponseText += parsed.content;
                             updateAiCache(prev => {
                                const updatedMessages = prev.chat.messages.map(msg =>
                                    msg.id === currentAiMessageId ? { ...msg, text: aiResponseText } : msg
                                );
                                return {
                                    ...prev,
                                    chat: { ...prev.chat, messages: updatedMessages },
                                };
                            });
                        }
                    } catch (e) {
                         console.error("Error parsing stream chunk:", line, e);
                         setError(prev => ({...prev, chat: `Stream parsing error: ${line}`}));
                    }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('Fetch was aborted by user.');
            } else {
                setError(prev => ({...prev, chat: err instanceof Error ? err.message : 'An unknown error occurred'}));
            }
        } finally {
             abortControllerRef.current = null;
             setLoading(prev => ({...prev, chat: false}));
        }
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentQuestion.trim() || loading.chat) return;

        const isFirstUserMessage = !aiCache.chat.messages.some(m => m.sender === 'user');

        if (isFirstUserMessage) {
            const contextString = buildContextString();
            const fullMessage = `${contextString}\n**My Initial Question:**\n${currentQuestion}`;
            sendMessageToServer(fullMessage);
        } else {
            sendMessageToServer(currentQuestion);
        }
    };

    const handleUpdateAndAsk = (e: React.MouseEvent) => {
        e.preventDefault();
        if (!currentQuestion.trim() || loading.chat) return;
        
        const contextString = buildContextString();
        const fullMessage = `${contextString}\n**Updated Context & Question:**\n${currentQuestion}`;
        sendMessageToServer(fullMessage);
    };

    const handleNewChat = () => {
        updateAiCache(prev => ({
            ...prev,
            chat: { ...prev.chat, conversationId: null, messages: [] }
        }));
    };

    const handleSelectConversation = async (id: string) => {
        try {
            const res = await fetch(`/api/ai/conversations/${id}`);
            if (!res.ok) throw new Error("Failed to load conversation.");
            const data = await res.json();
            const provider = data.provider || 'gemini';
            
            updateAiCache(prev => ({
                ...prev,
                chat: { ...prev.chat, conversationId: id, messages: data.history }
            }));
            setAiProvider(provider);

        } catch (e) { console.error(e); }
    };
    
    const handleDeleteConversation = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this conversation?")) return;
        try {
            const res = await fetch(`/api/ai/conversations/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error("Failed to delete conversation.");
            fetchHistory();
            if (aiCache.chat.conversationId === id) {
                handleNewChat();
            }
        } catch (e) { console.error(e); }
    };
    
    const handleSqpWeekToggle = (weekValue: string) => {
        setSelectedWeeks(prev => {
            const newSelection = new Set(prev);
            if (newSelection.has(weekValue)) {
                newSelection.delete(weekValue);
            } else {
                newSelection.add(weekValue);
            }
            return Array.from(newSelection);
        });
    };
    
    const getSqpButtonText = () => {
        if (selectedWeeks.length === 0) return "Select weeks...";
        if (selectedWeeks.length === 1) {
            return sqpFilterOptions.find(w => w.value === selectedWeeks[0])?.label || selectedWeeks[0];
        }
        return `${selectedWeeks.length} weeks selected`;
    };

    return (
        <div style={containerStyle}>
            <div style={isHistoryVisible ? styles.historyPanel : {...styles.historyPanel, padding: '10px', width: 'auto', overflow: 'hidden' }}>
                {isHistoryVisible ? (
                    <>
                        <div style={{...styles.historyHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                            <button style={{...styles.toolButton, ...styles.newChatButton}} onClick={handleNewChat}>+ New Chat</button>
                            <button 
                                onClick={() => setIsHistoryVisible(false)} 
                                title="Hide History" 
                                style={styles.collapseButton}
                                onMouseOver={(e) => (e.currentTarget.style.color = 'var(--primary-color)')}
                                onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
                            >«</button>
                        </div>
                        <ul style={styles.historyList}>
                            {conversationHistory.map(conv => (
                                <li key={conv.id}
                                    style={conv.id === aiCache.chat.conversationId ? {...styles.historyItem, ...styles.historyItemActive} : styles.historyItem}
                                    onClick={() => handleSelectConversation(conv.id)}
                                    title={conv.title}
                                >
                                    <span style={styles.historyItemText}>{conv.title}</span>
                                    <button
                                        style={styles.deleteButton}
                                        onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                                        title="Delete conversation"
                                    >
                                        &times;
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </>
                ) : (
                    <button onClick={() => setIsHistoryVisible(true)} title="Show History" style={styles.expandButton}>
                        <span style={styles.expandButtonIcon}>»</span>
                        <span style={styles.expandButtonText}>History</span>
                    </button>
                )}
            </div>
            <div style={isControlsVisible ? styles.leftPanel : {...styles.leftPanel, padding: '10px', width: 'auto', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                {isControlsVisible ? (
                    <>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                            <h2 style={{margin: 0}}>AI Co-Pilot Control Panel</h2>
                            <button 
                                onClick={() => setIsControlsVisible(false)} 
                                title="Hide Controls" 
                                style={styles.collapseButton}
                                onMouseOver={(e) => (e.currentTarget.style.color = 'var(--primary-color)')}
                                onMouseOut={(e) => (e.currentTarget.style.color = '#888')}
                            >«</button>
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>ASIN</label>
                            <input style={styles.input} value={aiCache.productInfo.asin} onChange={e => setProductInfo('asin', e.target.value)} placeholder="e.g., B0DD45VPSL" />
                        </div>
                        
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px'}}>
                             <div style={styles.formGroup}>
                                <label style={styles.label}>Sale Price</label>
                                <input type="number" style={styles.input} value={aiCache.productInfo.salePrice} onChange={e => setProductInfo('salePrice', e.target.value)} placeholder="e.g., 29.99" />
                            </div>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Product Cost</label>
                                <input type="number" style={styles.input} value={aiCache.productInfo.cost} onChange={e => setProductInfo('cost', e.target.value)} placeholder="e.g., 7.50" />
                            </div>
                        </div>

                        <div style={styles.formGroup}>
                           <label style={styles.label}>Amazon Fee</label>
                            <input 
                                type="number" 
                                step="0.01" 
                                style={styles.input} 
                                value={aiCache.productInfo.fbaFee} // Repurposing fbaFee state to hold the total fee
                                onChange={e => {
                                    setProductInfo('fbaFee', e.target.value);
                                    setProductInfo('referralFeePercent', '0'); // Ensure referral is always 0
                                }} 
                                placeholder="e.g., 11.00" 
                                title="Total Amazon Fee (FBA + Referral)"
                            />
                        </div>


                        <hr style={{border: 'none', borderTop: '1px solid var(--border-color)', margin: '10px 0'}}/>
                        
                        <div style={styles.toolCard}>
                            <h3 style={styles.toolTitle}>AI Configuration</h3>
                             <div style={{...styles.formGroup, marginTop: '10px'}}>
                                <label style={styles.label}>System Prompt Template</label>
                                <select
                                    style={styles.input}
                                    value={selectedTemplateName}
                                    onChange={handleTemplateChange}
                                >
                                    {systemPromptTemplates.map(template => (
                                        <option key={template.name} value={template.name}>
                                            {template.name}
                                        </option>
                                    ))}
                                    <option value="Custom">Custom</option>
                                </select>
                            </div>
                            <div style={{...styles.formGroup, marginTop: '10px'}}>
                                <label style={styles.label}>System Message (Prompt)</label>
                                <textarea
                                    style={styles.textarea}
                                    value={aiCache.chat.systemInstruction}
                                    onChange={e => setSystemInstruction(e.target.value)}
                                    placeholder="Define the AI's role, context, and instructions here..."
                                />
                            </div>
                        </div>


                        <div style={styles.toolCard}>
                            <div style={styles.toolHeader}>
                                <h3 style={styles.toolTitle}>Load Performance Data</h3>
                            </div>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Date Range (for ST, Stream, S&T)</label>
                                <div style={styles.dateInputContainer}>
                                    <input type="date" style={styles.input} value={aiCache.dateRange.startDate} onChange={e => setDateRange('startDate', e.target.value)} />
                                    <input type="date" style={styles.input} value={aiCache.dateRange.endDate} onChange={e => setDateRange('endDate', e.target.value)} />
                                </div>
                            </div>
                            <div style={{marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '15px'}}>
                                <ToolButton tool="st" onRun={handleLoadData} onView={handleViewData} loading={loading.st} dataInfo={aiCache.loadedData.searchTermData} error={error.st} name="Search Term Report" />
                                <ToolButton tool="stream" onRun={handleLoadData} onView={handleViewData} loading={loading.stream} dataInfo={aiCache.loadedData.streamData} error={error.stream} name="Stream Data" />
                                <ToolButton tool="sat" onRun={handleLoadData} onView={handleViewData} loading={loading.sat} dataInfo={aiCache.loadedData.salesTrafficData} error={error.sat} name="Sales & Traffic" />
                                 <div style={{borderTop: '1px dashed var(--border-color)', paddingTop: '15px'}}>
                                    <div style={{...styles.formGroup, marginBottom: '15px'}}>
                                        <label style={styles.label}>Search Query Performance Week</label>
                                        <div style={styles.sqpDropdown} ref={sqpDropdownRef}>
                                            <button
                                                type="button"
                                                style={styles.sqpDropdownButton}
                                                onClick={() => setIsSqpDropdownOpen(prev => !prev)}
                                                disabled={sqpFilterOptions.length === 0}
                                                aria-haspopup="listbox"
                                                aria-expanded={isSqpDropdownOpen}
                                            >
                                                <span>{getSqpButtonText()}</span>
                                                <span style={{transform: isSqpDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s'}}>▼</span>
                                            </button>
                                            {isSqpDropdownOpen && (
                                                <div style={styles.sqpDropdownPanel} role="listbox">
                                                    {sqpFilterOptions.length === 0 ? (
                                                        <div style={styles.sqpDropdownItem}>Loading weeks...</div>
                                                    ) : (
                                                        sqpFilterOptions.map(week => (
                                                            <div
                                                                key={week.value}
                                                                style={hoveredWeek === week.value ? {...styles.sqpDropdownItem, ...styles.sqpDropdownItemHover} : styles.sqpDropdownItem}
                                                                onMouseEnter={() => setHoveredWeek(week.value)}
                                                                onMouseLeave={() => setHoveredWeek(null)}
                                                                onClick={() => handleSqpWeekToggle(week.value)}
                                                                role="option"
                                                                aria-selected={selectedWeeks.includes(week.value)}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    style={styles.checkbox}
                                                                    checked={selectedWeeks.includes(week.value)}
                                                                    readOnly
                                                                    tabIndex={-1}
                                                                />
                                                                <span style={{cursor: 'pointer'}}>{week.label}</span>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <ToolButton tool="sqp" onRun={handleLoadData} onView={handleViewData} loading={loading.sqp} dataInfo={aiCache.loadedData.searchQueryPerformanceData} error={error.sqp} name="Search Query Performance" />
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <button onClick={() => setIsControlsVisible(true)} title="Show Controls" style={styles.expandButton}>
                        <span style={styles.expandButtonIcon}>»</span>
                        <span style={styles.expandButtonText}>Controls</span>
                    </button>
                )}
            </div>
            <div style={styles.rightPanel}>
                <div style={styles.chatWindow}>
                    {aiCache.chat.messages.length === 0 && <p style={{textAlign: 'center', color: '#888'}}>Load data and ask a question to start your conversation.</p>}
                    {aiCache.chat.messages.map((msg) => {
                        const contextMarkerRegex = /\n\*\*(My Initial Question|Updated Context & Question):\*\*\n/;
                        const textParts = msg.text.split(contextMarkerRegex);
                        const hasContext = textParts.length === 3;

                        return (
                            <div key={msg.id} style={{...styles.message, ...(msg.sender === 'user' ? styles.userMessage : styles.aiMessage)}}>
                                {msg.sender === 'ai' && <p style={styles.aiProviderName}>{aiProvider}</p>}
                                {hasContext ? (
                                    <>
                                        <CollapsibleDataContext contextData={textParts[0]} />
                                        <div dangerouslySetInnerHTML={{ __html: marked.parse(`**${textParts[1]}:**\n${textParts[2]}`) }} />
                                    </>
                                ) : (
                                     <div dangerouslySetInnerHTML={{ __html: marked.parse(msg.text) }} />
                                )}
                            </div>
                        );
                    })}
                    {loading.chat && aiCache.chat.messages.length > 0 && aiCache.chat.messages[aiCache.chat.messages.length - 1].sender === 'user' && (
                        <div style={{...styles.message, ...styles.aiMessage}}><em style={{color: '#666'}}>AI is thinking...</em></div>
                    )}
                    {error.chat && <div style={{...styles.message, ...styles.aiMessage, backgroundColor: '#fdd', color: 'var(--danger-color)'}}>{error.chat}</div>}
                    <div ref={chatEndRef} />
                </div>
                <form style={styles.chatInputForm} onSubmit={handleFormSubmit}>
                    <input style={styles.chatInput} value={currentQuestion} onChange={e => setCurrentQuestion(e.target.value)} placeholder="Ask a question about the loaded data..." disabled={loading.chat} />
                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <select
                            style={{ ...styles.input, height: '44px', padding: '0 10px' }}
                            value={aiProvider}
                            onChange={(e) => setAiProvider(e.target.value as any)}
                            aria-label="Select AI Provider"
                            disabled={loading.chat}
                        >
                           <option value="gemini">Gemini</option>
                           <option value="openai">ChatGPT</option>
                        </select>
                        <button type="button" onClick={handleUpdateAndAsk} style={styles.secondaryButton} title="Send a new question with a fresh snapshot of all loaded data" disabled={loading.chat || !currentQuestion.trim()}>
                            Update & Ask
                        </button>
                        {loading.chat ? (
                            <button type="button" onClick={handleStopConversation} style={{...styles.sendButton, backgroundColor: 'var(--danger-color)'}}>
                                Stop
                            </button>
                        ) : (
                            <button type="submit" style={styles.sendButton} disabled={!currentQuestion.trim()}>
                                Send
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}

const ToolButton = ({ tool, onRun, onView, loading, dataInfo, error, name }: { tool: 'st' | 'stream' | 'sat' | 'sqp', onRun: (tool: 'st' | 'stream' | 'sat' | 'sqp') => void, onView: (tool: 'st' | 'stream' | 'sat' | 'sqp') => void, loading: boolean, dataInfo: LoadedDataInfo, error: string, name: string }) => {
    
    const formatDate = (dateStr: string) => {
        return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    };

    const dateRangeText = dataInfo?.dateRange 
        ? ` (${formatDate(dataInfo.dateRange.startDate)} - ${formatDate(dataInfo.dateRange.endDate)})`
        : '';
    
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 500 }}>{name}</span>
                <button type="button" onClick={() => onRun(tool)} style={styles.toolButton} disabled={loading}>
                    {loading ? 'Loading...' : (dataInfo?.data ? 'Reload' : 'Load')}
                </button>
            </div>
            {error && <p style={styles.error}>{error}</p>}
            {dataInfo?.data && (
                <button
                    type="button"
                    onClick={() => onView(tool)}
                    style={{...styles.toolStatus, cursor: 'pointer', border: 'none', background: 'none', padding: 0, textAlign: 'left', color: 'var(--primary-color)'}}
                    title="Click to view loaded data in a new tab"
                >
                    ✅ Loaded {Array.isArray(dataInfo.data) ? `${dataInfo.data.length} records` : 'data'}{dateRangeText}.
                </button>
            )}
        </div>
    );
};