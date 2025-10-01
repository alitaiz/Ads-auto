// backend/services/automation/evaluators/searchTermHarvesting.js
import pool from '../../../db.js';
import { amazonAdsApiRequest } from '../../../helpers/amazon-api.js';
import { getSkuByAsin } from '../../../helpers/spApiHelper.js';
import { getLocalDateString, calculateMetricsForWindow, checkCondition } from '../utils.js';

const sanitizeForCampaignName = (name) => {
    if (!name) return '';
    return name.replace(/[<>\\/|?*:"^]/g, '').trim();
};

const checkCampaignExists = async (campaignId, profileId) => {
    if (!campaignId) return false;
    try {
        await amazonAdsApiRequest({
            method: 'get',
            url: `/sp/campaigns/${campaignId}`,
            profileId,
        });
        return true; // If it doesn't throw, it exists
    } catch (error) {
        if (error.status === 404) {
            return false; // Not found, so it doesn't exist
        }
        console.error(`[Harvesting] Error checking for campaign ${campaignId}:`, error.details || error);
        return true; // Assume it exists to be safe on non-404 errors
    }
};

export const evaluateSearchTermHarvestingRule = async (rule, performanceData) => {
    const actionsByCampaign = {};
    const referenceDate = new Date(getLocalDateString('America/Los_Angeles'));
    referenceDate.setDate(referenceDate.getDate() - 2);

    const asinRegex = /^b0[a-z0-9]{8}$/i;

    let createdCount = 0, negatedCount = 0, failureCount = 0, skippedCount = 0;
    const failures = [];
    
    // 1. Pre-fetch all throttled entities for this rule
    const throttleResult = await pool.query(
        'SELECT entity_id, details FROM automation_action_throttle WHERE rule_id = $1 AND throttle_until > NOW()',
        [rule.id]
    );
    const throttledMap = new Map(throttleResult.rows.map(r => [r.entity_id, r.details]));

    for (const entity of performanceData.values()) {
        const uniqueKey = `${entity.entityText}::${entity.sourceAsin}`;
        
        let isWinner = false;
        let matchedGroup = null;

        for (const group of rule.config.conditionGroups) {
            let allConditionsMet = true;
            for (const condition of group.conditions) {
                const metrics = calculateMetricsForWindow(entity.dailyData, condition.timeWindow, referenceDate);
                if (!checkCondition(metrics[condition.metric], condition.operator, condition.value)) {
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
            console.log(`[Harvesting] Term "${entity.entityText}" for ASIN ${entity.sourceAsin} is a winner.`);
            
            // 2. Self-Healing Cooldown Check
            if (throttledMap.has(uniqueKey)) {
                const createdCampaignId = throttledMap.get(uniqueKey)?.createdCampaignId;
                console.log(`[Harvesting] Found throttled entry. Checking if campaign ${createdCampaignId} still exists...`);
                const campaignStillExists = await checkCampaignExists(createdCampaignId, rule.profile_id);

                if (campaignStillExists) {
                    console.log(`[Harvesting] Campaign ${createdCampaignId} still exists. Skipping harvest.`);
                    skippedCount++;
                    continue; // Skip this entity entirely
                } else {
                    console.log(`[Harvesting] Campaign ${createdCampaignId} was deleted. Healing throttle and proceeding with harvest.`);
                    await pool.query('DELETE FROM automation_action_throttle WHERE rule_id = $1 AND entity_id = $2', [rule.id, uniqueKey]);
                }
            }
            
            const { action } = matchedGroup;
            const isAsin = asinRegex.test(entity.entityText);
            let harvestSuccessful = false;

            try {
                // --- Start Harvest Action ---
                const retrievedSku = await getSkuByAsin(entity.sourceAsin);
                if (!retrievedSku) throw new Error(`Could not find a SKU for ASIN ${entity.sourceAsin}.`);

                const totalClicks = entity.dailyData.reduce((s, d) => s + d.clicks, 0);
                const totalSpend = entity.dailyData.reduce((s, d) => s + d.spend, 0);
                const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0.50;
                
                let calculatedBid;
                if (action.bidOption.type === 'CUSTOM_BID') {
                    calculatedBid = action.bidOption.value;
                } else {
                    calculatedBid = avgCpc * (action.bidOption.value ?? 1.0);
                    if (typeof action.bidOption.maxBid === 'number') {
                        calculatedBid = Math.min(calculatedBid, action.bidOption.maxBid);
                    }
                }
                const newBid = parseFloat(Math.max(0.02, calculatedBid).toFixed(2));

                let newCampaignId, newAdGroupId;
                
                if (action.type === 'CREATE_NEW_CAMPAIGN') {
                    const sanitizedSearchTerm = sanitizeForCampaignName(entity.entityText);
                    const campaignName = `[H] - ${entity.sourceAsin} - ${sanitizedSearchTerm.substring(0, 80)} - ${action.matchType}`;

                    const campResponse = await amazonAdsApiRequest({ /* create campaign */
                        method: 'post', url: '/sp/campaigns', profileId: rule.profile_id, data: { campaigns: [{
                            name: campaignName, targetingType: 'MANUAL', state: 'ENABLED',
                            budget: { budget: Number(action.newCampaignBudget ?? 10.00), budgetType: 'DAILY' },
                            startDate: getLocalDateString('America/Los_Angeles'),
                        }] },
                        headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' },
                    });
                    newCampaignId = campResponse?.campaigns?.success?.[0]?.campaignId;
                    if (!newCampaignId) throw { message: 'Campaign creation failed.', details: campResponse };

                    const agResponse = await amazonAdsApiRequest({ /* create ad group */
                        method: 'post', url: '/sp/adGroups', profileId: rule.profile_id, data: { adGroups: [{
                            name: sanitizedSearchTerm.substring(0, 255), campaignId: newCampaignId, state: 'ENABLED', defaultBid: newBid
                        }] },
                        headers: { 'Content-Type': 'application/vnd.spAdGroup.v3+json', 'Accept': 'application/vnd.spAdGroup.v3+json' },
                    });
                    newAdGroupId = agResponse?.adGroups?.success?.[0]?.adGroupId;
                    if (!newAdGroupId) throw { message: 'Ad group creation failed.', details: agResponse };
                    
                    await amazonAdsApiRequest({ /* create product ad */
                         method: 'post', url: '/sp/productAds', profileId: rule.profile_id, data: { productAds: [{
                            campaignId: newCampaignId, adGroupId: newAdGroupId, state: 'ENABLED', sku: retrievedSku
                        }] },
                        headers: { 'Content-Type': 'application/vnd.spProductAd.v3+json', 'Accept': 'application/vnd.spProductAd.v3+json' },
                    });
                } else { // ADD_TO_EXISTING_CAMPAIGN
                    newCampaignId = action.targetCampaignId;
                    newAdGroupId = action.targetAdGroupId;
                }

                if (isAsin) { /* create target */
                    await amazonAdsApiRequest({
                        method: 'post', url: '/sp/targets', profileId: rule.profile_id, data: { targetingClauses: [{
                            campaignId: newCampaignId, adGroupId: newAdGroupId, state: 'ENABLED', expression: [{ type: 'ASIN_SAME_AS', value: entity.entityText }], bid: newBid, expressionType: 'MANUAL'
                        }] },
                        headers: { 'Content-Type': 'application/vnd.spTargetingClause.v3+json', 'Accept': 'application/vnd.spTargetingClause.v3+json' },
                    });
                } else { /* create keyword */
                    await amazonAdsApiRequest({
                        method: 'post', url: '/sp/keywords', profileId: rule.profile_id, data: { keywords: [{
                             campaignId: newCampaignId, adGroupId: newAdGroupId, state: 'ENABLED', keywordText: entity.entityText, matchType: action.matchType, bid: newBid
                        }] },
                        headers: { 'Content-Type': 'application/vnd.spKeyword.v3+json', 'Accept': 'application/vnd.spKeyword.v3+json' },
                    });
                }
                
                // 3. Add to throttle table on successful creation
                const interval = `${rule.config.cooldown?.value || 90} ${rule.config.cooldown?.unit || 'days'}`;
                await pool.query(
                    `INSERT INTO automation_action_throttle (rule_id, entity_id, throttle_until, details)
                     VALUES ($1, $2, NOW() + $3::interval, $4)
                     ON CONFLICT (rule_id, entity_id) DO UPDATE SET throttle_until = EXCLUDED.throttle_until, details = EXCLUDED.details;`,
                    [rule.id, uniqueKey, interval, { createdCampaignId: newCampaignId }]
                );

                harvestSuccessful = true;
                createdCount++;
                
                // --- Conditional Negation ---
                if (action.autoNegate !== false) {
                    const negPayloadBase = { campaignId: entity.sourceCampaignId, adGroupId: entity.sourceAdGroupId };
                    if (isAsin) {
                         await amazonAdsApiRequest({
                            method: 'post', url: '/sp/negativeTargets', profileId: rule.profile_id, data: { negativeTargetingClauses: [{ ...negPayloadBase, expression: [{ type: 'ASIN_SAME_AS', value: entity.entityText }] }] },
                            headers: { 'Content-Type': 'application/vnd.spNegativeTargetingClause.v3+json', 'Accept': 'application/vnd.spNegativeTargetingClause.v3+json' },
                        });
                    } else {
                        await amazonAdsApiRequest({
                            method: 'post', url: '/sp/negativeKeywords', profileId: rule.profile_id, data: { negativeKeywords: [{ ...negPayloadBase, keywordText: entity.entityText, matchType: 'NEGATIVE_EXACT' }] },
                            headers: { 'Content-Type': 'application/vnd.spNegativeKeyword.v3+json', 'Accept': 'application/vnd.spNegativeKeyword.v3+json' },
                        });
                    }
                    negatedCount++;
                }
                
            } catch (e) {
                failureCount++;
                console.error(`[Harvesting] Failed to process winner "${entity.entityText}". Reason:`, e.details || e.message);
                failures.push({ searchTerm: entity.entityText, sourceAsin: entity.sourceAsin, error: e.message, rawError: e.details });
            }
        }
    }
    
    const summaryParts = [];
    if (createdCount > 0) summaryParts.push(`Harvested ${createdCount} new term(s)`);
    if (skippedCount > 0) summaryParts.push(`skipped ${skippedCount} already-harvested term(s)`);
    if (negatedCount > 0) summaryParts.push(`negated ${negatedCount} source term(s)`);
    if (failureCount > 0) summaryParts.push(`failed on ${failureCount} term(s)`);
    
    return {
        summary: summaryParts.length > 0 ? summaryParts.join(', ') + '.' : 'No new search terms met the criteria for harvesting.',
        details: { actions_by_campaign: actionsByCampaign, failures },
        actedOnEntities: [] // Cooldown is handled internally now
    };
};