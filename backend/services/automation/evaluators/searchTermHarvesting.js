// backend/services/automation/evaluators/searchTermHarvesting.js
import { amazonAdsApiRequest } from '../../../helpers/amazon-api.js';
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

                if (!throttledEntities.has(throttleKey)) {
                    if (action.type === 'CREATE_NEW_CAMPAIGN') {
                        const maxNameLength = 128;
                        const prefix = `[H] - ${entity.sourceAsin} - `;
                        const suffix = ` - ${action.matchType}`;
                        const maxSearchTermLength = maxNameLength - prefix.length - suffix.length;
                        const truncatedSearchTerm = entity.entityText.length > maxSearchTermLength 
                            ? entity.entityText.substring(0, maxSearchTermLength - 3) + '...' 
                            : entity.entityText;
                        const campaignName = `${prefix}${truncatedSearchTerm}${suffix}`;
                        
                        // CORRECTED PAYLOAD STRUCTURE
                        const campaignPayload = {
                            name: campaignName,
                            targetingType: 'MANUAL',
                            state: 'ENABLED',
                            budget: Number(action.newCampaignBudget ?? 10.00),
                            budgetType: 'DAILY',
                            startDate: getLocalDateString('America/Los_Angeles').replace(/-/g, ''), // Format: YYYYMMDD
                        };

                        try {
                            const campResponse = await amazonAdsApiRequest({
                                method: 'post', url: '/sp/campaigns', profileId: rule.profile_id, data: { campaigns: [campaignPayload] },
                                headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' },
                            });
                            const campResult = campResponse.campaigns?.[0];
                            if (campResult?.code === 'SUCCESS') {
                                newCampaignId = campResult.campaignId;
                                console.log(`[Harvesting] Created Campaign ID: ${newCampaignId}`);
                                const adGroupPayload = { name: entity.entityText, campaignId: newCampaignId, state: 'ENABLED' };
                                const agResponse = await amazonAdsApiRequest({
                                    method: 'post', url: '/sp/adGroups', profileId: rule.profile_id, data: { adGroups: [adGroupPayload] },
                                    headers: { 'Content-Type': 'application/vnd.spAdGroup.v3+json', 'Accept': 'application/vnd.spAdGroup.v3+json' },
                                });
                                const agResult = agResponse.adGroups?.[0];
                                if (agResult?.code === 'SUCCESS') {
                                    newAdGroupId = agResult.adGroupId;
                                    console.log(`[Harvesting] Created Ad Group ID: ${newAdGroupId}`);
                                    
                                    const productAdPayload = { campaignId: newCampaignId, adGroupId: newAdGroupId, state: 'ENABLED', asin: entity.sourceAsin };
                                    const adResponse = await amazonAdsApiRequest({
                                        method: 'post', url: '/sp/productAds', profileId: rule.profile_id, data: { productAds: [productAdPayload] },
                                        headers: { 'Content-Type': 'application/vnd.spProductAd.v3+json', 'Accept': 'application/vnd.spProductAd.v3+json' },
                                    });
                                    const adResult = adResponse.productAds?.[0];
                                    if(adResult?.code === 'SUCCESS') {
                                        console.log(`[Harvesting] Created Product Ad for ASIN ${entity.sourceAsin}`);
                                        harvestSuccess = true;
                                    } else {
                                        throw new Error(`Product Ad creation failed: ${adResult?.details || 'Unknown error'}`);
                                    }
                                } else {
                                    throw new Error(`Ad Group creation failed: ${agResult?.details || 'Unknown error'}`);
                                }
                            } else {
                                const details = campResult?.details || (campResponse.code ? `${campResponse.code}: ${campResponse.message}` : campResponse.Message || 'Unknown error');
                                throw new Error(`Campaign creation failed: ${details}`);
                            }
                        } catch (e) {
                            console.error(`[Harvesting] Raw error object in CREATE_NEW_CAMPAIGN flow:`, e);
                            
                            // IMPROVED ERROR LOGGING
                            let errorMessage = 'An unknown error occurred. See server logs for the raw error object.';
                            
                            if (e instanceof Error) {
                                errorMessage = e.message;
                            } else if (e && e.details) {
                                if (typeof e.details === 'object' && e.details !== null) {
                                    errorMessage = e.details.message || e.details.Message || JSON.stringify(e.details);
                                } else if (typeof e.details === 'string') {
                                    errorMessage = e.details;
                                }
                            } else if (e && (e.Message || e.message)) {
                                errorMessage = e.Message || e.message;
                            }
                        
                            console.error(`[Harvesting] Extracted error message in flow:`, errorMessage);
                            throw new Error(`Campaign creation failed: ${errorMessage}`);
                        }
                    } else {
                        harvestSuccess = true; 
                        newCampaignId = action.targetCampaignId;
                        newAdGroupId = action.targetAdGroupId;
                    }
                }

                if (harvestSuccess && newAdGroupId) {
                    const cpc = (entity.dailyData.reduce((s, d) => s + d.clicks, 0) > 0) ? (entity.dailyData.reduce((s, d) => s + d.spend, 0) / entity.dailyData.reduce((s, d) => s + d.clicks, 0)) : 0.50;
                    const newBid = parseFloat(Math.max(0.02, action.bidOption.type === 'CUSTOM_BID' ? action.bidOption.value : cpc * (action.bidOption.value || 1.15)).toFixed(2));
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