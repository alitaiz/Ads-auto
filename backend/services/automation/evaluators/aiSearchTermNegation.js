// backend/services/automation/evaluators/aiSearchTermNegation.js
import pool from '../../../db.js';
import { getLocalDateString, calculateMetricsForWindow, checkCondition } from '../utils.js';
import { getProductTextAttributes } from '../../../helpers/spApiHelper.js';
import { GoogleGenAI } from '@google/genai';
import { amazonAdsApiRequest } from '../../../helpers/amazon-api.js';

const asinRegex = /^b0[a-z0-9]{8}$/i;
const CHUNK_SIZE = 8; // Process 8 search terms per batch
const DELAY_BETWEEN_CHUNKS = 2000; // Wait 2 seconds between batches

const generateRelevancePrompt = (product, searchTerm) => {
    const bullets = (product.bulletPoints || []).map(bp => `- ${bp}`).join('\n');
    return `You are an Amazon PPC expert. Your task is to determine if a customer's search term is relevant for selling a specific product. A search term is relevant if a customer searching for it would likely be satisfied to see this product. Answer ONLY with 'YES' or 'NO'.

Product Title: "${product.title}"
Product Bullets:
${bullets}

Customer Search Term: "${searchTerm}"

Is this search term relevant?`;
};

// Simple in-memory cache for product details to reduce API calls within a single run
const productDetailsCache = new Map();


/**
 * Fetches all active, available API keys for a specific service.
 * @param {string} service - The name of the service (e.g., 'gemini').
 * @returns {Promise<string[]>} An array of API keys.
 */
async function getAllActiveKeys(service) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT api_key FROM api_keys WHERE service = $1 AND is_active = TRUE ORDER BY id',
            [service]
        );
        return result.rows.map(r => r.api_key);
    } finally {
        client.release();
    }
}


/**
 * Calls the Gemini API with a specific key and includes retry logic for transient errors.
 * @param {string} apiKey The API key to use for this specific call.
 * @param {string} prompt The prompt to send to the model.
 * @param {number} maxRetries Maximum number of retry attempts.
 * @param {number} initialDelay Delay in ms for the first retry.
 * @returns {Promise<any>} The API response object.
 */
async function generateContentWithRetry(apiKey, prompt, maxRetries = 3, initialDelay = 1000) {
    let retries = 0;
    let delay = initialDelay;
    
    // Create a new AI instance for each call with the provided key
    const ai = new GoogleGenAI({ apiKey });

    while (retries < maxRetries) {
        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
            return response;
        } catch (error) {
            // Check for specific transient errors like 503 Service Unavailable or 429 Rate Limit
            if (error.status === 503 || error.status === 429 || (error.message && (error.message.includes('UNAVAILABLE') || error.message.includes('overloaded')))) {
                retries++;
                if (retries >= maxRetries) {
                    console.error(`[AI Negation] Gemini API call failed for key ending in ...${apiKey.slice(-4)} after ${maxRetries} retries.`);
                    throw error; // Max retries reached, re-throw the last error
                }
                console.warn(`[AI Negation] Gemini API overloaded for key ...${apiKey.slice(-4)}. Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else {
                throw error; // Not a retryable error, throw immediately
            }
        }
    }
}


export const evaluateAiSearchTermNegationRule = async (rule, _, throttledEntities) => {
    const campaignIds = rule.scope?.campaignIds || [];
    if (campaignIds.length === 0) {
        return { summary: 'Rule skipped: No campaigns in scope.', details: {}, actedOnEntities: [] };
    }
    
    // Fetch all available keys for rotation
    const allKeys = await getAllActiveKeys('gemini');
    if (allKeys.length === 0) {
        return { summary: 'AI Negation rule failed: No active Gemini keys found in the database.', details: {}, actedOnEntities: [] };
    }
    console.log(`[AI Negation] Found ${allKeys.length} Gemini keys for rotation.`);
    let keyIndex = 0;


    const actionsByCampaign = {};
    const negativeKeywordsToCreate = [];
    const actedOnEntities = new Set();
    const referenceDate = new Date(getLocalDateString('America/Los_Angeles'));
    referenceDate.setDate(referenceDate.getDate() - 3); // D-3 Data
    const reportDateStr = referenceDate.toISOString().split('T')[0];

    // 1. Fetch D-3 Performance Data
    const { rows: performanceRows } = await pool.query(
        `SELECT
            report_date, customer_search_term, campaign_id, ad_group_id, asin,
            COALESCE(SUM(impressions), 0)::bigint AS impressions, COALESCE(SUM(cost), 0)::numeric AS spend,
            COALESCE(SUM(sales_1d), 0)::numeric AS sales, COALESCE(SUM(clicks), 0)::bigint AS clicks,
            COALESCE(SUM(purchases_1d), 0)::bigint AS orders
        FROM sponsored_products_search_term_report
        WHERE report_date = $1 AND customer_search_term IS NOT NULL AND campaign_id::text = ANY($2)
        GROUP BY 1, 2, 3, 4, 5;`,
        [reportDateStr, campaignIds.map(String)]
    );

    const performanceData = performanceRows.map(row => ({
        ...row,
        dailyData: [{
            date: new Date(row.report_date),
            impressions: parseInt(row.impressions, 10),
            spend: parseFloat(row.spend),
            sales: parseFloat(row.sales),
            clicks: parseInt(row.clicks, 10),
            orders: parseInt(row.orders, 10),
        }]
    }));

    if (performanceData.length === 0) {
        return { summary: `No search term data found for ${reportDateStr}.`, details: {}, actedOnEntities: [] };
    }
    
    // 2. Fetch unique product details needed for this run
    const uniqueAsins = [...new Set(performanceData.map(p => p.asin).filter(Boolean))];
    if (uniqueAsins.length > 0) {
        const productDetails = await getProductTextAttributes(uniqueAsins);
        productDetails.forEach(p => productDetailsCache.set(p.asin, p));
    }
    
    const termsToEvaluate = [];

    // 3. Filter and prepare terms for evaluation
    for (const entity of performanceData) {
        const throttleKey = `${entity.customer_search_term}::${entity.asin}`;
        if (throttledEntities.has(throttleKey) || !entity.asin || asinRegex.test(entity.customer_search_term)) {
            continue;
        }

        const product = productDetailsCache.get(entity.asin);
        if (!product || !product.title) continue;

        for (const group of rule.config.conditionGroups) {
            let allConditionsMet = true;
            for (const condition of group.conditions) {
                const metrics = calculateMetricsForWindow(entity.dailyData, condition.timeWindow, new Date(reportDateStr));
                if (!checkCondition(metrics[condition.metric], condition.operator, condition.value)) {
                    allConditionsMet = false;
                    break;
                }
            }
            if (allConditionsMet) {
                termsToEvaluate.push({ entity, product });
                break; // First match wins
            }
        }
    }

    // 4. Evaluate in chunks, rotating keys for each chunk
    for (let i = 0; i < termsToEvaluate.length; i += CHUNK_SIZE) {
        const chunk = termsToEvaluate.slice(i, i + CHUNK_SIZE);
        
        // Cycle through keys for each chunk
        const currentApiKey = allKeys[keyIndex];
        keyIndex = (keyIndex + 1) % allKeys.length;

        console.log(`[AI Negation] Processing chunk ${i / CHUNK_SIZE + 1} of ${Math.ceil(termsToEvaluate.length / CHUNK_SIZE)} using key ...${currentApiKey.slice(-4)}`);

        const promises = chunk.map(async ({ entity, product }) => {
            try {
                const prompt = generateRelevancePrompt(product, entity.customer_search_term);
                // Pass the selected key to the retry function
                const response = await generateContentWithRetry(currentApiKey, prompt);
                const aiDecision = response.text.trim().toUpperCase();

                if (aiDecision.includes('NO')) {
                    console.log(`[AI Negation] AI deemed "${entity.customer_search_term}" as NOT RELEVANT for ASIN ${entity.asin}.`);
                    return { status: 'negate', entity };
                } else {
                    console.log(`[AI Negation] AI deemed "${entity.customer_search_term}" as RELEVANT for ASIN ${entity.asin}. No action taken.`);
                    return { status: 'keep', entity };
                }
            } catch (aiError) {
                console.error(`[AI Negation] Gemini API call failed for term "${entity.customer_search_term}":`, aiError);
                return { status: 'error', entity };
            }
        });

        const results = await Promise.all(promises);

        for (const result of results) {
            if (result.status === 'negate') {
                const { entity } = result;
                const throttleKey = `${entity.customer_search_term}::${entity.asin}`;
                negativeKeywordsToCreate.push({
                    campaignId: entity.campaign_id,
                    adGroupId: entity.ad_group_id,
                    keywordText: entity.customer_search_term,
                    matchType: 'NEGATIVE_EXACT',
                    state: 'ENABLED'
                });

                const campaignId = entity.campaign_id;
                if (!actionsByCampaign[campaignId]) {
                    actionsByCampaign[campaignId] = { changes: [], newNegatives: [] };
                }
                actionsByCampaign[campaignId].newNegatives.push({ searchTerm: entity.customer_search_term, matchType: 'NEGATIVE_EXACT' });
                actedOnEntities.add(throttleKey);
            }
        }

        if (i + CHUNK_SIZE < termsToEvaluate.length) {
            console.log(`[AI Negation] Chunk processed. Waiting for ${DELAY_BETWEEN_CHUNKS / 1000}s before next chunk...`);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS));
        }
    }


    // 5. Create negative keywords in bulk
    if (negativeKeywordsToCreate.length > 0) {
        try {
            await amazonAdsApiRequest({
                method: 'post', url: '/sp/negativeKeywords', profileId: rule.profile_id,
                data: { negativeKeywords: negativeKeywordsToCreate },
                headers: { 
                    'Content-Type': 'application/vnd.spNegativeKeyword.v3+json',
                    'Accept': 'application/vnd.spNegativeKeyword.v3+json'
                }
            });
        } catch (apiError) {
            console.error('[AI Negation] Failed to apply negative keywords via API.', apiError);
        }
    }

    productDetailsCache.clear();

    return {
        summary: `AI analysis complete. Negated ${negativeKeywordsToCreate.length} irrelevant search term(s).`,
        details: { actions_by_campaign: actionsByCampaign, dataDateRange: { report: {start: reportDateStr, end: reportDateStr }, stream: null } },
        actedOnEntities: Array.from(actedOnEntities)
    };
};
