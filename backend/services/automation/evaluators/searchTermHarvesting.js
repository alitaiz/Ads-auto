// backend/services/automation/evaluators/searchTermHarvesting.js
import { amazonAdsApiRequest } from '../../../helpers/amazon-api.js';
import { getSkuByAsin } from '../../../helpers/spApiHelper.js';
import { getLocalDateString, calculateMetricsForWindow, checkCondition } from '../utils.js';

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
                let newCampaignId;
                let newAdGroupId;
                let harvestSuccess = false;
                let newBid;

                if (!throttledEntities.has(throttleKey)) {
                    const totalClicks = entity.dailyData.reduce((s, d) => s + d.clicks, 0);
                    const totalSpend = entity.dailyData.reduce((s, d) => s + d.spend, 0);
                    const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0.50;
                    newBid = parseFloat(Math.max(0.02, action.bidOption.type === 'CUSTOM_BID' ? action.bidOption.value : avgCpc * (action.bidOption.value || 1.15)).toFixed(2));
                    
                    if (action.type === 'CREATE_NEW_CAMPAIGN') {
                        const maxNameLength = 128;
                        const prefix = `[H] - ${entity.sourceAsin} - `;
                        const suffix = ` - ${action.matchType}`;
                        const maxSearchTermLength = maxNameLength - prefix.length - suffix.length;
                        const truncatedSearchTerm = entity.entityText.length > maxSearchTermLength 
                            ? entity.entityText.substring(0, maxSearchTermLength - 3) + '...' 
                            : entity.entityText;
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

                        try {
                            const campResponse = await amazonAdsApiRequest({
                                method: 'post', url: '/sp/campaigns', profileId: rule.profile_id, data: { campaigns: [campaignPayload] },
                                headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' },
                            });
                            
                            const campSuccessResult = campResponse?.campaigns?.success?.[0];

                            if (campSuccessResult && campSuccessResult.campaignId) {
                                newCampaignId = campSuccessResult.campaignId;
                                console.log(`[Harvesting] Created Campaign ID: ${newCampaignId}`);
                                
                                const adGroupPayload = { name: entity.entityText, campaignId: newCampaignId, state: 'ENABLED', defaultBid: newBid };
                                const agResponse = await amazonAdsApiRequest({
                                    method: 'post', url: '/sp/adGroups', profileId: rule.profile_id, data: { adGroups: [adGroupPayload] },
                                    headers: { 'Content-Type': 'application/vnd.spAdGroup.v3+json', 'Accept': 'application/vnd.spAdGroup.v3+json' },
                                });

                                const agSuccessResult = agResponse?.adGroups?.success?.[0];

                                if (agSuccessResult && agSuccessResult.adGroupId) {
                                    newAdGroupId = agSuccessResult.adGroupId;
                                    console.log(`[Harvesting] Created Ad Group ID: ${newAdGroupId}`);
                                    
                                    // CRITICAL STEP: Fetch the SKU using the ASIN before creating the product ad.
                                    const retrievedSku = await getSkuByAsin(entity.sourceAsin);
                                    if (!retrievedSku) {
                                        throw new Error(`Could not find a valid SKU for ASIN ${entity.sourceAsin}. Cannot create product ad.`);
                                    }

                                    const productAdPayload = { campaignId: newCampaignId, adGroupId: newAdGroupId, state: 'ENABLED', sku: retrievedSku };
                                    const adResponse = await amazonAdsApiRequest({
                                        method: 'post', url: '/sp/productAds', profileId: rule.profile_id, data: { productAds: [productAdPayload] },
                                        headers: { 'Content-Type': 'application/vnd.spProductAd.v3+json', 'Accept': 'application/vnd.spProductAd.v3+json' },
                                    });
                                    
                                    const adSuccessResult = adResponse?.productAds?.success?.[0];

                                    if(adSuccessResult && adSuccessResult.adId) {
                                        console.log(`[Harvesting] Created Product Ad for SKU ${retrievedSku}`);
                                        harvestSuccess = true;
                                    } else {
                                        const adError = adResponse?.productAds?.error?.[0];
                                        const adErrorDetails = adError?.errors?.[0]?.message || adError?.errors?.[0]?.details || `Unknown product ad error (Code: ${adError?.code})`;
                                        throw new Error(`Product Ad creation failed: ${adErrorDetails}`);
                                    }
                                } else {
                                    const agError = agResponse?.adGroups?.error?.[0];
                                    const agErrorDetails = agError?.errors?.[0]?.message || agError?.errors?.[0]?.details || `Unknown ad group error (Code: ${agError?.code})`;
                                    throw new Error(`Ad Group creation failed: ${agErrorDetails}`);
                                }
                            } else {
                                const campError = campResponse?.campaigns?.error?.[0];
                                const campErrorDetails = campError?.errors?.[0]?.message || campError?.errors?.[0]?.details || campResponse.message || 'Unknown campaign error';
                                throw new Error(`Campaign creation failed: ${campErrorDetails}`);
                            }
                        } catch (e) {
                            console.error(`[Harvesting] Raw error object in CREATE_NEW_CAMPAIGN flow:`, e);
                            let errorMessage = 'An unknown error occurred. See server logs.';
                            if (e instanceof Error) errorMessage = e.message;
                            else if (e?.details) errorMessage = typeof e.details === 'string' ? e.details : JSON.stringify(e.details);
                            else if (e?.message) errorMessage = e.message;
                             console.error(`[Harvesting] Extracted error message in flow:`, errorMessage);
                            throw new Error(`Harvesting flow failed: ${errorMessage}`);
                        }
                    } else {
                        harvestSuccess = true; 
                        newCampaignId = action.targetCampaignId;
                        newAdGroupId = action.targetAdGroupId;
                    }
                } else {
                    console.log(`[Harvesting] Term "${entity.entityText}" for ASIN ${entity.sourceAsin} is a winner, but is currently on cooldown. Skipping harvest action.`);
                    harvestSuccess = false;
                }

                if (harvestSuccess && newAdGroupId) {
                    try {
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
                    } catch (e) { console.error(`[Harvesting] Error creating keyword/target:`, e); harvestSuccess = false; }
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
                    } catch (e) { console.error(`[Harvesting] Error negating source term:`, e); }
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