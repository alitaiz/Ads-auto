// backend/services/automation/evaluators/searchTermHarvesting.js
import { amazonAdsApiRequest } from '../../../helpers/amazon-api.js';
import { getSkuByAsin } from '../../../helpers/spApiHelper.js';
import { getLocalDateString, calculateMetricsForWindow, checkCondition } from '../utils.js';

/**
 * Sanitizes a string to be safe for use in an Amazon campaign or ad group name.
 * Removes characters that are commonly disallowed by the API.
 * @param {string} name The input string.
 * @returns {string} The sanitized string.
 */
const sanitizeForCampaignName = (name) => {
    if (!name) return '';
    // Removes characters like < > \ / | ? * : " ^ and trims whitespace
    return name.replace(/[<>\\/|?*:"^]/g, '').trim();
};

export const evaluateSearchTermHarvestingRule = async (rule, performanceData, throttledEntities) => {
    const actionsByCampaign = {};
    const actedOnEntities = new Set();
    const referenceDate = new Date(getLocalDateString('America/Los_Angeles'));
    referenceDate.setDate(referenceDate.getDate() - 2);

    let createdCount = 0;
    let negatedCount = 0;
    const asinRegex = /^b0[a-z0-9]{8}$/i;

    for (const entity of performanceData.values()) {
        const throttleKey = `${entity.entityText}::${entity.sourceAsin}`;
        
        for (const group of rule.config.conditionGroups) {
            let allConditionsMet = true;
            for (const condition of group.conditions) {
                const metrics = calculateMetricsForWindow(entity.dailyData, condition.timeWindow, referenceDate);
                const metricValue = metrics[condition.metric];
                let conditionValue = condition.value;
                if (condition.metric === 'acos') conditionValue /= 100;

                if (!checkCondition(metricValue, condition.operator, conditionValue)) {
                    allConditionsMet = false;
                    break;
                }
            }

            if (allConditionsMet) {
                console.log(`[Harvesting] Term "${entity.entityText}" for ASIN ${entity.sourceAsin} from Campaign ${entity.sourceCampaignId} is a winner.`);
                const { action } = group;
                const isAsin = asinRegex.test(entity.entityText);

                if (!throttledEntities.has(throttleKey)) {
                    try {
                        const retrievedSku = await getSkuByAsin(entity.sourceAsin);

                        if (!retrievedSku) {
                            console.warn(`[Harvesting] Could not find a SKU for ASIN ${entity.sourceAsin}. Skipping harvest action for this term/ASIN combination.`);
                        } else {
                            const totalClicks = entity.dailyData.reduce((s, d) => s + d.clicks, 0);
                            const totalSpend = entity.dailyData.reduce((s, d) => s + d.spend, 0);
                            const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0.50;
                            const newBid = parseFloat(Math.max(0.02, action.bidOption.type === 'CUSTOM_BID' ? action.bidOption.value : avgCpc * (action.bidOption.value || 1.15)).toFixed(2));
                            
                            let newCampaignId, newAdGroupId;
                            const sanitizedSearchTerm = sanitizeForCampaignName(entity.entityText);

                            if (action.type === 'CREATE_NEW_CAMPAIGN') {
                                const maxNameLength = 128;
                                const prefix = `[H] - ${entity.sourceAsin} - `;
                                const suffix = ` - ${action.matchType}`;
                                const maxSearchTermLength = maxNameLength - prefix.length - suffix.length;
                                const truncatedSearchTerm = sanitizedSearchTerm.length > maxSearchTermLength 
                                    ? sanitizedSearchTerm.substring(0, maxSearchTermLength - 3) + '...' 
                                    : sanitizedSearchTerm;
                                const campaignName = `${prefix}${truncatedSearchTerm}${suffix}`;
                                
                                const campaignPayload = {
                                    name: campaignName,
                                    targetingType: 'MANUAL',
                                    state: 'ENABLED',
                                    budget: {
                                        budget: Number(action.newCampaignBudget ?? 10.00),
                                        budgetType: 'DAILY',
                                    },
                                    startDate: getLocalDateString('America/Los_Angeles'),
                                };

                                const campResponse = await amazonAdsApiRequest({
                                    method: 'post', url: '/sp/campaigns', profileId: rule.profile_id, data: { campaigns: [campaignPayload] },
                                    headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' },
                                });

                                const campSuccessResult = campResponse?.campaigns?.success?.[0];
                                if (!campSuccessResult?.campaignId) {
                                    const campErrorDetails = campResponse?.campaigns?.error?.[0]?.details || JSON.stringify(campResponse);
                                    throw new Error(`Campaign creation failed: ${campErrorDetails}`);
                                }
                                newCampaignId = campSuccessResult.campaignId;
                                console.log(`[Harvesting] Created Campaign ID: ${newCampaignId}`);

                                const adGroupPayload = { name: sanitizedSearchTerm.substring(0, 255), campaignId: newCampaignId, state: 'ENABLED', defaultBid: newBid };
                                const agResponse = await amazonAdsApiRequest({
                                    method: 'post', url: '/sp/adGroups', profileId: rule.profile_id, data: { adGroups: [adGroupPayload] },
                                    headers: { 'Content-Type': 'application/vnd.spAdGroup.v3+json', 'Accept': 'application/vnd.spAdGroup.v3+json' },
                                });

                                const agSuccessResult = agResponse?.adGroups?.success?.[0];
                                if (!agSuccessResult?.adGroupId) {
                                    const agErrorDetails = agResponse?.adGroups?.error?.[0]?.details || JSON.stringify(agResponse);
                                    throw new Error(`Ad Group creation failed: ${agErrorDetails}`);
                                }
                                newAdGroupId = agSuccessResult.adGroupId;
                                console.log(`[Harvesting] Created Ad Group ID: ${newAdGroupId}`);

                                const productAdPayload = { campaignId: newCampaignId, adGroupId: newAdGroupId, state: 'ENABLED', sku: retrievedSku };
                                await amazonAdsApiRequest({
                                    method: 'post', url: '/sp/productAds', profileId: rule.profile_id, data: { productAds: [productAdPayload] },
                                    headers: { 'Content-Type': 'application/vnd.spProductAd.v3+json', 'Accept': 'application/vnd.spProductAd.v3+json' },
                                });
                                console.log(`[Harvesting] Created Product Ad for SKU ${retrievedSku}`);

                            } else { // ADD_TO_EXISTING_CAMPAIGN
                                newCampaignId = action.targetCampaignId;
                                newAdGroupId = action.targetAdGroupId;
                            }
                            
                            if (isAsin) {
                                const targetPayload = { campaignId: newCampaignId, adGroupId: newAdGroupId, state: 'ENABLED', expression: [{ type: 'ASIN_SAME_AS', value: entity.entityText }], bid: newBid };
                                await amazonAdsApiRequest({
                                    method: 'post', url: '/sp/targets', profileId: rule.profile_id, data: { targetingClauses: [targetPayload] },
                                    headers: { 'Content-Type': 'application/vnd.spTargetingClause.v3+json', 'Accept': 'application/vnd.spTargetingClause.v3+json' },
                                });
                            } else {
                                const kwPayload = { campaignId: newCampaignId, adGroupId: newAdGroupId, state: 'ENABLED', keywordText: entity.entityText, matchType: action.matchType, bid: newBid };
                                await amazonAdsApiRequest({
                                    method: 'post', url: '/sp/keywords', profileId: rule.profile_id, data: { keywords: [kwPayload] },
                                    headers: { 'Content-Type': 'application/vnd.spKeyword.v3+json', 'Accept': 'application/vnd.spKeyword.v3+json' },
                                });
                            }
                            createdCount++;
                            actedOnEntities.add(throttleKey);
                        }
                    } catch (e) {
                         console.error(`[Harvesting] Raw error object in CREATE_NEW_CAMPAIGN flow:`, e);
                         const errorMessage = e.details?.message || e.message || 'Unknown error during harvesting flow';
                         console.error(`[Harvesting] Extracted error message in flow:`, errorMessage);
                         throw new Error(`Harvesting flow failed: ${errorMessage}`);
                    }
                } else {
                    console.log(`[Harvesting] Term "${entity.entityText}" for ASIN ${entity.sourceAsin} is on cooldown. Skipping harvest.`);
                }
                
                if (action.autoNegate !== false) {
                    try {
                        if (isAsin) {
                            const negTargetPayload = { campaignId: entity.sourceCampaignId, adGroupId: entity.sourceAdGroupId, expression: [{ type: 'ASIN_SAME_AS', value: entity.entityText }] };
                            await amazonAdsApiRequest({
                                method: 'post', url: '/sp/negativeTargets', profileId: rule.profile_id, data: { negativeTargetingClauses: [negTargetPayload] },
                                headers: { 'Content-Type': 'application/vnd.spNegativeTargetingClause.v3+json', 'Accept': 'application/vnd.spNegativeTargetingClause.v3+json' },
                            });
                        } else {
                            const negKwPayload = { campaignId: entity.sourceCampaignId, adGroupId: entity.sourceAdGroupId, keywordText: entity.entityText, matchType: 'NEGATIVE_EXACT' };
                            await amazonAdsApiRequest({
                                method: 'post', url: '/sp/negativeKeywords', profileId: rule.profile_id, data: { negativeKeywords: [negKwPayload] },
                                headers: { 'Content-Type': 'application/vnd.spNegativeKeyword.v3+json', 'Accept': 'application/vnd.spNegativeKeyword.v3+json' },
                            });
                        }
                        console.log(`[Harvesting] Negated "${entity.entityText}" in source Ad Group ${entity.sourceAdGroupId}`);
                        negatedCount++;
                    } catch (e) { console.error(`[Harvesting] Error negating source term:`, e.details || e); }
                }
                break; 
            }
        }
    }
    
    const summaryParts = [];
    if (createdCount > 0) summaryParts.push(`Harvested ${createdCount} new term(s)`);
    if (negatedCount > 0) summaryParts.push(`negated ${negatedCount} source term(s)`);
    const summary = summaryParts.length > 0 ? summaryParts.join(' and ') + '.' : 'No new search terms met the criteria for harvesting.';

    return {
        summary,
        details: { actions_by_campaign: actionsByCampaign, created: createdCount, negated: negatedCount },
        actedOnEntities: Array.from(actedOnEntities)
    };
};
