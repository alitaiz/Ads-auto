// backend/services/automation/evaluators/aiSearchTermNegation.js
import pool from '../../../db.js';
import { getLocalDateString, calculateMetricsForWindow, checkCondition } from '../utils.js';
import { getProductTextAttributes } from '../../../helpers/spApiHelper.js';
import { GoogleGenAI } from '@google/genai';
import { amazonAdsApiRequest } from '../../../helpers/amazon-api.js';

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const asinRegex = /^b0[a-z0-9]{8}$/i;

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
 * Calls the Gemini API with retry logic for transient errors.
 * @param {string} prompt The prompt to send to the model.
 * @param {number} maxRetries Maximum number of retry attempts.
 * @param {number} initialDelay Delay in ms for the first retry.
 * @returns {Promise<any>} The API response object.
 */
async function generateContentWithRetry(prompt, maxRetries = 3, initialDelay = 1000) {
    let retries = 0;
    let delay = initialDelay;
    while (retries < maxRetries) {
        try {
            const response = await ai.models.generateContent({model: 'gemini-2.5-flash', contents: prompt});
            return response;
        } catch (error) {
            // Check for specific transient errors like 503 Service Unavailable
            if (error.status === 503 || (error.message && (error.message.includes('UNAVAILABLE') || error.message.includes('overloaded')))) {
                retries++;
                if (retries >= maxRetries) {
                    console.error(`[AI Negation] Gemini API call failed after ${maxRetries} retries.`);
                    throw error; // Max retries reached, re-throw the last error
                }
                console.warn(`[AI Negation] Gemini API overloaded. Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else {
                throw error; // Not a retryable error, throw immediately
            }
        }
    }
}


export const evaluateAiSearchTermNegationRule = async (rule, _, throttledEntities) => {
    if (!ai) {
        console.error('[AI Negation] Gemini API key is not configured. Skipping rule.');
        return { summary: 'Rule skipped: Gemini API key not configured.', details: {}, actedOnEntities: [] };
    }

    const campaignIds = rule.scope?.campaignIds || [];
    if (campaignIds.length === 0) {
        return { summary: 'Rule skipped: No campaigns in scope.', details: {}, actedOnEntities: [] };
    }

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

    // 3. Evaluate each search term
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
                try {
                    const prompt = generateRelevancePrompt(product, entity.customer_search_term);
                    const response = await generateContentWithRetry(prompt);
                    const aiDecision = response.text.trim().toUpperCase();

                    if (aiDecision.includes('NO')) {
                        console.log(`[AI Negation] AI deemed "${entity.customer_search_term}" as NOT RELEVANT for ASIN ${entity.asin}.`);
                        
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
                    } else {
                         console.log(`[AI Negation] AI deemed "${entity.customer_search_term}" as RELEVANT for ASIN ${entity.asin}. No action taken.`);
                    }

                } catch (aiError) {
                    console.error(`[AI Negation] Gemini API call failed for term "${entity.customer_search_term}":`, aiError);
                }
                
                break; // First match wins
            }
        }
    }

    // 4. Create negative keywords in bulk
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