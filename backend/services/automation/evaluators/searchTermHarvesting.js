// backend/services/automation/evaluators/searchTermHarvesting.js
import { amazonAdsApiRequest } from '../../../helpers/amazon-api.js';
import { getSkuByAsin } from '../../../helpers/spApiHelper.js';
import { getLocalDateString, calculateMetricsForWindow, checkCondition } from '../utils.js';
import pool from '../../../db.js';

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
    const actedOnEntities = new Set();
    const referenceDate = new Date(getLocalDateString('America/Los_Angeles'));
    referenceDate.setDate(referenceDate.getDate() - 2);

    const detailedActions = [];
    let createdCount = 0;
    let negatedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    
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
                let shouldNegate = false;

                if (!throttledEntities.has(throttleKey)) {
                    try {
                        const retrievedSku = await getSkuByAsin(entity.sourceAsin);
                        if (!retrievedSku) throw new Error(`Could not find a SKU for ASIN ${entity.sourceAsin}.`);
                        
                        const totalClicks = entity.dailyData.reduce((s, d) => s + d.clicks, 0);
                        const totalSpend = entity.dailyData.reduce((s, d) => s + d.spend, 0);
                        const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0.50;
                        
                        let calculatedBid;
                        if (action.bidOption.type === 'CUSTOM_BID') {
                            calculatedBid = action.bidOption.value;
                        } else { // CPC_MULTIPLIER
                            calculatedBid = avgCpc * (action.bidOption.value || 1.15);
                            if (typeof action.bidOption.maxBid === 'number') {
                                calculatedBid = Math.min(calculatedBid, action.bidOption.maxBid);
                            }
                        }
                        const newBid = parseFloat(Math.max(0.02, calculatedBid).toFixed(2));
                        
                        let newCampaignId, newAdGroupId;
                        const sanitizedSearchTerm = sanitizeForCampaignName(entity.entityText);

                        if (action.type === 'CREATE_NEW_CAMPAIGN') {
                            const maxNameLength = 128;
                            const prefix = `[H] - ${entity.sourceAsin} - `;
                            const suffix = isAsin ? '' : ` - ${action.matchType}`;
                            const maxSearchTermLength = maxNameLength - prefix.length - suffix.length;
                            const truncatedSearchTerm = sanitizedSearchTerm.length > maxSearchTermLength ? sanitizedSearchTerm.substring(0, maxSearchTermLength - 3) + '...' : sanitizedSearchTerm;
                            const campaignName = `${prefix}${truncatedSearchTerm}${suffix}`;
                            
                            const campaignPayload = { name: campaignName, targetingType: 'MANUAL', state: 'ENABLED', budget: { budget: Number(action.newCampaignBudget ?? 10.00), budgetType: 'DAILY' }, startDate: getLocalDateString('America/Los_Angeles') };

                            const campResponse = await amazonAdsApiRequest({ method: 'post', url: '/sp/campaigns', profileId: rule.profile_id, data: { campaigns: [campaignPayload] }, headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' } });
                            const campSuccessResult = campResponse?.campaigns?.success?.[0];
                            
                            if (!campSuccessResult?.campaignId) {
                                const campError = campResponse?.campaigns?.error?.[0];
                                const isDuplicate = campError?.errors?.[0]?.errorValue?.duplicateValueError?.reason === 'DUPLICATE_VALUE';
                                if (isDuplicate) {
                                    console.warn(`[Harvesting] Campaign for term "${entity.entityText}" already exists. Skipping creation.`);
                                    detailedActions.push({ type: 'HARVEST_SKIPPED', reason: 'DUPLICATE_CAMPAIGN', searchTerm: entity.entityText, sourceCampaignName: entity.sourceCampaignName, sourceCampaignId: entity.sourceCampaignId });
                                    skippedCount++;
                                    shouldNegate = true;
                                } else {
                                    throw new Error(`Campaign creation failed: ${campError?.errors?.[0]?.errorValue?.message || JSON.stringify(campResponse)}`);
                                }
                            } else {
                                newCampaignId = campSuccessResult.campaignId;
                                console.log(`[Harvesting] Created Campaign ID: ${newCampaignId}`);
                                detailedActions.push({ type: 'HARVEST_SUCCESS', searchTerm: entity.entityText, sourceCampaignName: entity.sourceCampaignName, sourceCampaignId: entity.sourceCampaignId, newCampaignName: campaignName, newCampaignId });

                                const adGroupPayload = { name: sanitizedSearchTerm.substring(0, 255), campaignId: newCampaignId, state: 'ENABLED', defaultBid: newBid };
                                const agResponse = await amazonAdsApiRequest({ method: 'post', url: '/sp/adGroups', profileId: rule.profile_id, data: { adGroups: [adGroupPayload] }, headers: { 'Content-Type': 'application/vnd.spAdGroup.v3+json', 'Accept': 'application/vnd.spAdGroup.v3+json' } });
                                const agSuccessResult = agResponse?.adGroups?.success?.[0];
                                if (!agSuccessResult?.adGroupId) throw new Error(`Ad Group creation failed: ${JSON.stringify(agResponse)}`);
                                newAdGroupId = agSuccessResult.adGroupId;
                                console.log(`[Harvesting] Created Ad Group ID: ${newAdGroupId}`);

                                const productAdPayload = { campaignId: newCampaignId, adGroupId: newAdGroupId, state: 'ENABLED', sku: retrievedSku };
                                await amazonAdsApiRequest({ method: 'post', url: '/sp/productAds', profileId: rule.profile_id, data: { productAds: [productAdPayload] }, headers: { 'Content-Type': 'application/vnd.spProductAd.v3+json', 'Accept': 'application/vnd.spProductAd.v3+json' } });
                                console.log(`[Harvesting] Created Product Ad for SKU ${retrievedSku}`);

                                if (isAsin) {
                                    const targetPayload = { campaignId: newCampaignId, adGroupId: newAdGroupId, state: 'ENABLED', expressionType: 'MANUAL', expression: [{ type: 'ASIN_SAME_AS', value: entity.entityText }], bid: newBid };
                                    await amazonAdsApiRequest({ method: 'post', url: '/sp/targets', profileId: rule.profile_id, data: { targetingClauses: [targetPayload] }, headers: { 'Content-Type': 'application/vnd.spTargetingClause.v3+json', 'Accept': 'application/vnd.spTargetingClause.v3+json' } });
                                } else {
                                    const kwPayload = { campaignId: newCampaignId, adGroupId: newAdGroupId, state: 'ENABLED', keywordText: entity.entityText, matchType: action.matchType, bid: newBid };
                                    await amazonAdsApiRequest({ method: 'post', url: '/sp/keywords', profileId: rule.profile_id, data: { keywords: [kwPayload] }, headers: { 'Content-Type': 'application/vnd.spKeyword.v3+json', 'Accept': 'application/vnd.spKeyword.v3+json' } });
                                }

                                const newCampaignIdStr = newCampaignId.toString();

                                const applyRules = async (ruleIds, newCampaignIdStr) => {
                                    if (!ruleIds || ruleIds.length === 0) return;
                                    console.log(`[Harvesting] Associating new campaign ${newCampaignIdStr} with rules: ${ruleIds.join(', ')}`);
                                    for (const ruleId of ruleIds) {
                                        try {
                                            const { rows: rulesToUpdate } = await pool.query('SELECT id, scope FROM automation_rules WHERE id = $1', [ruleId]);
                                            if (rulesToUpdate.length > 0) {
                                                const ruleToUpdate = rulesToUpdate[0];
                                                const currentCampaignIds = new Set((ruleToUpdate.scope?.campaignIds || []).map(String));
                                                if (!currentCampaignIds.has(newCampaignIdStr)) {
                                                    currentCampaignIds.add(newCampaignIdStr);
                                                    const newScope = { ...ruleToUpdate.scope, campaignIds: Array.from(currentCampaignIds) };
                                                    await pool.query('UPDATE automation_rules SET scope = $1 WHERE id = $2', [newScope, ruleToUpdate.id]);
                                                    console.log(`[Harvesting] Associated campaign ${newCampaignIdStr} with rule ID ${ruleToUpdate.id}`);
                                                }
                                            }
                                        } catch (e) {
                                            console.error(`[Harvesting] Failed to associate rule ID ${ruleId} with new campaign ${newCampaignIdStr}:`, e);
                                        }
                                    }
                                };
                                await applyRules(action.applyBidRuleIds, newCampaignIdStr);
                                await applyRules(action.applyBudgetRuleIds, newCampaignIdStr);
                                
                                createdCount++;
                                actedOnEntities.add(throttleKey);
                                shouldNegate = true;
                            }
                        } else {
                           shouldNegate = true;
                        }
                    } catch (e) {
                        const errorMessage = e.details?.message || e.message || 'Unknown error during harvesting flow';
                        console.error(`[Harvesting] Failed to harvest term "${entity.entityText}": ${errorMessage}`);
                        detailedActions.push({ type: 'HARVEST_FAILURE', searchTerm: entity.entityText, sourceCampaignName: entity.sourceCampaignName, sourceCampaignId: entity.sourceCampaignId, reason: errorMessage });
                        failedCount++;
                        shouldNegate = false;
                    }
                } else {
                    console.log(`[Harvesting] Term "${entity.entityText}" for ASIN ${entity.sourceAsin} is on cooldown. Skipping harvest.`);
                    detailedActions.push({ type: 'HARVEST_SKIPPED', reason: 'COOLDOWN', searchTerm: entity.entityText, sourceCampaignName: entity.sourceCampaignName, sourceCampaignId: entity.sourceCampaignId });
                    skippedCount++;
                    shouldNegate = true;
                }
                
                if (action.autoNegate !== false && shouldNegate) {
                    try {
                        if (isAsin) {
                            const negTargetPayload = { 
                                campaignId: entity.sourceCampaignId, 
                                adGroupId: entity.sourceAdGroupId, 
                                expression: [{ type: 'ASIN_SAME_AS', value: entity.entityText }],
                                state: 'ENABLED'
                            };
                            await amazonAdsApiRequest({ method: 'post', url: '/sp/negativeTargets', profileId: rule.profile_id, data: { negativeTargetingClauses: [negTargetPayload] }, headers: { 'Content-Type': 'application/vnd.spNegativeTargetingClause.v3+json', 'Accept': 'application/vnd.spNegativeTargetingClause.v3+json' } });
                        } else {
                            const negKwPayload = { 
                                campaignId: entity.sourceCampaignId, 
                                adGroupId: entity.sourceAdGroupId, 
                                keywordText: entity.entityText, 
                                matchType: 'NEGATIVE_EXACT',
                                state: 'ENABLED'
                            };
                            await amazonAdsApiRequest({ method: 'post', url: '/sp/negativeKeywords', profileId: rule.profile_id, data: { negativeKeywords: [negKwPayload] }, headers: { 'Content-Type': 'application/vnd.spNegativeKeyword.v3+json', 'Accept': 'application/vnd.spNegativeKeyword.v3+json' } });
                        }
                        console.log(`[Harvesting] Negated "${entity.entityText}" in source Ad Group ${entity.sourceAdGroupId}`);
                        detailedActions.push({ type: 'NEGATE_SUCCESS', searchTerm: entity.entityText, sourceCampaignName: entity.sourceCampaignName, sourceCampaignId: entity.sourceCampaignId, matchType: isAsin ? 'NEGATIVE_PRODUCT_TARGET' : 'NEGATIVE_EXACT' });
                        negatedCount++;
                    } catch (e) {
                         const errorMessage = e.details?.message || e.message || 'Unknown error during negation';
                         console.error(`[Harvesting] Error negating source term "${entity.entityText}":`, e.details || e);
                         detailedActions.push({ type: 'NEGATE_FAILURE', searchTerm: entity.entityText, sourceCampaignName: entity.sourceCampaignName, sourceCampaignId: entity.sourceCampaignId, reason: errorMessage });
                    }
                }
                break;
            }
        }
    }
    
    const summaryParts = [];
    if (createdCount > 0) summaryParts.push(`Harvested ${createdCount} new term(s)`);
    if (skippedCount > 0) summaryParts.push(`skipped ${skippedCount} duplicate/cooldown term(s)`);
    if (negatedCount > 0) summaryParts.push(`negated ${negatedCount} source term(s)`);
    if (failedCount > 0) summaryParts.push(`${failedCount} failed`);

    const summary = summaryParts.length > 0 ? summaryParts.join(', ') + '.' : 'No new search terms met the criteria for harvesting.';

    return {
        summary,
        details: {
            created: createdCount,
            negated: negatedCount,
            skipped: skippedCount,
            failed: failedCount,
            actions: detailedActions,
        },
        actedOnEntities: Array.from(actedOnEntities)
    };
};
