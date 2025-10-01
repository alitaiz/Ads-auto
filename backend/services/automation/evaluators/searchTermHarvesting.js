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
    let failureCount = 0;
    const failures = [];
    const asinRegex = /^b0[a-z0-9]{8}$/i;

    for (const entity of performanceData.values()) {
        let isWinner = false;
        let matchedGroup = null;

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
                isWinner = true;
                matchedGroup = group;
                break;
            }
        }

        if (isWinner) {
            const throttleKey = `${entity.entityText}::${entity.sourceAsin}`;
            console.log(`[Harvesting] Term "${entity.entityText}" for ASIN ${entity.sourceAsin} from Campaign ${entity.sourceCampaignId} is a winner.`);
            const { action } = matchedGroup;
            const isAsin = asinRegex.test(entity.entityText);

            try {
                if (!throttledEntities.has(throttleKey)) {
                    const retrievedSku = await getSkuByAsin(entity.sourceAsin);
                    if (!retrievedSku) {
                        console.warn(`[Harvesting] Could not find a SKU for ASIN ${entity.sourceAsin}. Skipping harvest action for this term/ASIN combination.`);
                    } else {
                        const totalClicks = entity.dailyData.reduce((s, d) => s + d.clicks, 0);
                        const totalSpend = entity.dailyData.reduce((s, d) => s + d.spend, 0);
                        const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0.50;
                        
                        let calculatedBid;
                        if (action.bidOption.type === 'CUSTOM_BID') {
                            calculatedBid = action.bidOption.value;
                        } else { // CPC_MULTIPLIER
                            calculatedBid = avgCpc * (action.bidOption.value ?? 1.0);
                            const maxBid = action.bidOption.maxBid;
                            if (typeof maxBid === 'number' && maxBid > 0) {
                                calculatedBid = Math.min(calculatedBid, maxBid);
                            }
                        }
                        const newBid = parseFloat(Math.max(0.02, calculatedBid).toFixed(2));

                        let newCampaignId, newAdGroupId;
                        const sanitizedSearchTerm = sanitizeForCampaignName(entity.entityText);

                        if (action.type === 'CREATE_NEW_CAMPAIGN') {
                            const maxNameLength = 128;
                            const prefix = `[H] - ${entity.sourceAsin} - `;
                            const suffix = ` - ${action.matchType}`;
                            const maxSearchTermLength = maxNameLength - prefix.length - suffix.length;
                            const truncatedSearchTerm = sanitizedSearchTerm.length > maxSearchTermLength ? sanitizedSearchTerm.substring(0, maxSearchTermLength - 3) + '...' : sanitizedSearchTerm;
                            const campaignName = `${prefix}${truncatedSearchTerm}${suffix}`;

                            const campaignPayload = {
                                name: campaignName, targetingType: 'MANUAL', state: 'ENABLED',
                                budget: { budget: Number(action.newCampaignBudget ?? 10.00), budgetType: 'DAILY' },
                                startDate: getLocalDateString('America/Los_Angeles'),
                            };

                            const campResponse = await amazonAdsApiRequest({
                                method: 'post', url: '/sp/campaigns', profileId: rule.profile_id, data: { campaigns: [campaignPayload] },
                                headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' },
                            });

                            const campSuccessResult = campResponse?.campaigns?.success?.[0];
                            if (!campSuccessResult?.campaignId) throw { details: campResponse };
                            newCampaignId = campSuccessResult.campaignId;
                            console.log(`[Harvesting] Created Campaign ID: ${newCampaignId}`);

                            const adGroupPayload = { name: sanitizedSearchTerm.substring(0, 255), campaignId: newCampaignId, state: 'ENABLED', defaultBid: newBid };
                            const agResponse = await amazonAdsApiRequest({
                                method: 'post', url: '/sp/adGroups', profileId: rule.profile_id, data: { adGroups: [adGroupPayload] },
                                headers: { 'Content-Type': 'application/vnd.spAdGroup.v3+json', 'Accept': 'application/vnd.spAdGroup.v3+json' },
                            });
                            const agSuccessResult = agResponse?.adGroups?.success?.[0];
                            if (!agSuccessResult?.adGroupId) throw { details: agResponse };
                            newAdGroupId = agSuccessResult.adGroupId;
                            console.log(`[Harvesting] Created Ad Group ID: ${newAdGroupId}`);

                            const productAdPayload = { campaignId: newCampaignId, adGroupId: newAdGroupId, state: 'ENABLED', sku: retrievedSku };
                            await amazonAdsApiRequest({
                                method: 'post', url: '/sp/productAds', profileId: rule.profile_id, data: { productAds: [productAdPayload] },
                                headers: { 'Content-Type': 'application/vnd.spProductAd.v3+json', 'Accept': 'application/vnd.spProductAd.v3+json' },
                            });
                            console.log(`[Harvesting] Created Product Ad for SKU ${retrievedSku}`);
                        } else {
                            newCampaignId = action.targetCampaignId;
                            newAdGroupId = action.targetAdGroupId;
                        }

                        if (isAsin) {
                            const targetPayload = { campaignId: newCampaignId, adGroupId: newAdGroupId, state: 'ENABLED', expression: [{ type: 'ASIN_SAME_AS', value: entity.entityText }], bid: newBid, expressionType: 'MANUAL' };
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

                        const harvestDetails = {
                            searchTerm: entity.entityText, sourceAsin: entity.sourceAsin, sourceCampaignId: entity.sourceCampaignId,
                            actionType: action.type, newBid: newBid,
                            ...(action.type === 'CREATE_NEW_CAMPAIGN' ? { newCampaignId, newAdGroupId } : { targetCampaignId: newCampaignId, targetAdGroupId: newAdGroupId })
                        };
                        const logCampaignId = action.type === 'CREATE_NEW_CAMPAIGN' ? newCampaignId : action.targetCampaignId;
                        if (logCampaignId) {
                            if (!actionsByCampaign[logCampaignId]) actionsByCampaign[logCampaignId] = { changes: [], newNegatives: [], newHarvests: [] };
                            actionsByCampaign[logCampaignId].newHarvests.push(harvestDetails);
                        }
                        createdCount++;
                        actedOnEntities.add(throttleKey);
                    }
                } else {
                    console.log(`[Harvesting] Term "${entity.entityText}" for ASIN ${entity.sourceAsin} is on cooldown. Skipping harvest.`);
                }

                if (action.autoNegate !== false) {
                    const negPayloadBase = { campaignId: entity.sourceCampaignId, adGroupId: entity.sourceAdGroupId };
                    if (isAsin) {
                        const negTargetPayload = { ...negPayloadBase, expression: [{ type: 'ASIN_SAME_AS', value: entity.entityText }] };
                        await amazonAdsApiRequest({
                            method: 'post', url: '/sp/negativeTargets', profileId: rule.profile_id, data: { negativeTargetingClauses: [negTargetPayload] },
                            headers: { 'Content-Type': 'application/vnd.spNegativeTargetingClause.v3+json', 'Accept': 'application/vnd.spNegativeTargetingClause.v3+json' },
                        });
                    } else {
                        const negKwPayload = { ...negPayloadBase, keywordText: entity.entityText, matchType: 'NEGATIVE_EXACT' };
                        await amazonAdsApiRequest({
                            method: 'post', url: '/sp/negativeKeywords', profileId: rule.profile_id, data: { negativeKeywords: [negKwPayload] },
                            headers: { 'Content-Type': 'application/vnd.spNegativeKeyword.v3+json', 'Accept': 'application/vnd.spNegativeKeyword.v3+json' },
                        });
                    }
                    const sourceCampaignId = entity.sourceCampaignId.toString();
                    if (!actionsByCampaign[sourceCampaignId]) actionsByCampaign[sourceCampaignId] = { changes: [], newNegatives: [], newHarvests: [] };
                    actionsByCampaign[sourceCampaignId].newNegatives.push({ searchTerm: entity.entityText, matchType: isAsin ? 'NEGATIVE_PRODUCT_TARGET' : 'NEGATIVE_EXACT' });
                    console.log(`[Harvesting] Negated "${entity.entityText}" in source Ad Group ${entity.sourceAdGroupId}`);
                    negatedCount++;
                }

            } catch (e) {
                failureCount++;
                let errorMessage = 'Unknown error during harvesting flow';
                const details = e.details || e;

                const findFirstErrorMessage = (responsePart) => {
                    if (!responsePart || !responsePart.error || !Array.isArray(responsePart.error)) return null;
                    for (const errItem of responsePart.error) {
                        if (errItem.errors && Array.isArray(errItem.errors)) {
                            for (const subErr of errItem.errors) {
                                if (subErr.errorValue?.message) return subErr.errorValue.message;
                            }
                        }
                    }
                    return null;
                };

                const errorTypeMap = {
                    campaigns: 'Campaign', adGroups: 'Ad Group', productAds: 'Product Ad',
                    keywords: 'Keyword', targets: 'Target', negativeKeywords: 'Negative Keyword',
                    negativeTargets: 'Negative Target'
                };

                let found = false;
                for(const key in errorTypeMap) {
                    const msg = findFirstErrorMessage(details[key]);
                    if(msg) {
                        errorMessage = `${errorTypeMap[key]} creation failed: ${msg}`;
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    if (details.message) errorMessage = details.message;
                    else if (e.message) errorMessage = e.message;
                }

                console.error(`[Harvesting] Failed to process winner "${entity.entityText}". Reason: ${errorMessage}`);
                failures.push({ searchTerm: entity.entityText, sourceAsin: entity.sourceAsin, error: errorMessage, rawError: details });
            }
            break; 
        }
    }
    
    const summaryParts = [];
    if (createdCount > 0) summaryParts.push(`Harvested ${createdCount} term(s)`);
    if (negatedCount > 0) summaryParts.push(`negated ${negatedCount} source term(s)`);
    if (failureCount > 0) summaryParts.push(`failed on ${failureCount} term(s)`);
    
    let summary = summaryParts.join(', ') + '.';
    if (summaryParts.length === 0) {
        summary = 'No new search terms met the criteria for harvesting.';
    }

    const details = {
        actions_by_campaign: actionsByCampaign,
        failures: failures,
    };

    return {
        summary,
        details,
        actedOnEntities: Array.from(actedOnEntities)
    };
};