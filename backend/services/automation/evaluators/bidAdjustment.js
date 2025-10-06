// backend/services/automation/evaluators/bidAdjustment.js
import { amazonAdsApiRequest } from '../../../helpers/amazon-api.js';
import { getLocalDateString, calculateMetricsForWindow, checkCondition } from '../utils.js';

const formatPriceForLog = (val) => `$${Number(val).toFixed(2)}`;

export const evaluateBidAdjustmentRule = async (rule, performanceData, throttledEntities) => {
    const actionsByCampaign = {};
    const keywordsToUpdate = [];
    const targetsToUpdate = [];
    const referenceDate = new Date(getLocalDateString('America/Los_Angeles'));

    const keywordsToProcess = new Map();
    const targetsToProcess = new Map();

    for (const [entityId, data] of performanceData.entries()) {
        if (data.entityType === 'keyword') {
            keywordsToProcess.set(entityId, data);
        } else if (data.entityType === 'target') {
            targetsToProcess.set(entityId, data);
        }
    }
    
    const keywordsWithoutBids = [];
    const targetsWithoutBids = [];

    if (keywordsToProcess.size > 0) {
        try {
            const allKeywordIds = Array.from(keywordsToProcess.keys());
            const chunkSize = 100;
            const allFetchedKeywords = [];

            for (let i = 0; i < allKeywordIds.length; i += chunkSize) {
                const chunk = allKeywordIds.slice(i, i + chunkSize);
                const response = await amazonAdsApiRequest({
                    method: 'post', url: '/sp/keywords/list', profileId: rule.profile_id,
                    data: { keywordIdFilter: { include: chunk } },
                    headers: { 'Content-Type': 'application/vnd.spKeyword.v3+json', 'Accept': 'application/vnd.spKeyword.v3+json' }
                });
                if (response.keywords) {
                    allFetchedKeywords.push(...response.keywords);
                }
            }

            allFetchedKeywords.forEach(kw => {
                const perfData = keywordsToProcess.get(kw.keywordId.toString());
                if (perfData) {
                    if (typeof kw.bid === 'number') {
                        perfData.currentBid = kw.bid;
                    } else {
                        keywordsWithoutBids.push(perfData);
                    }
                }
            });

            const foundKeywordIds = new Set(allFetchedKeywords.map(kw => kw.keywordId.toString()));
            for (const [keywordId, perfData] of keywordsToProcess.entries()) {
                if (!foundKeywordIds.has(keywordId)) {
                    keywordsWithoutBids.push(perfData);
                }
            }
        } catch (e) {
            console.error('[RulesEngine] Failed to fetch current keyword bids. All keywords in this batch will fallback to default bid.', e);
            keywordsToProcess.forEach(perfData => keywordsWithoutBids.push(perfData));
        }
    }

    if (targetsToProcess.size > 0) {
        try {
            const allTargetIds = Array.from(targetsToProcess.keys());
            const chunkSize = 100;
            const allFetchedTargets = [];
            
            for (let i = 0; i < allTargetIds.length; i += chunkSize) {
                const chunk = allTargetIds.slice(i, i + chunkSize);
                 const response = await amazonAdsApiRequest({
                    method: 'post', url: '/sp/targets/list', profileId: rule.profile_id,
                    data: { targetIdFilter: { include: chunk } },
                    headers: { 'Content-Type': 'application/vnd.spTargetingClause.v3+json', 'Accept': 'application/vnd.spTargetingClause.v3+json' }
                });
                
                const targetsInResponse = response.targets || response.targetingClauses;
                if (targetsInResponse && Array.isArray(targetsInResponse)) {
                    allFetchedTargets.push(...targetsInResponse);
                }
            }

            allFetchedTargets.forEach(t => {
                const perfData = targetsToProcess.get(t.targetId.toString());
                if (perfData) {
                    if (typeof t.bid === 'number') {
                        perfData.currentBid = t.bid;
                    } else {
                        targetsWithoutBids.push(perfData);
                    }
                }
            });
            
            const foundTargetIds = new Set(allFetchedTargets.map(t => t.targetId.toString()));
            for (const [targetId, perfData] of targetsToProcess.entries()) {
                if (!foundTargetIds.has(targetId)) {
                    targetsWithoutBids.push(perfData);
                }
            }
        } catch (e) {
            console.error('[RulesEngine] Failed to fetch current target bids. All targets in this batch will fallback to default bid.', e);
            targetsToProcess.forEach(perfData => targetsWithoutBids.push(perfData));
        }
    }
    
    const entitiesWithoutBids = [...keywordsWithoutBids, ...targetsWithoutBids];
    
    if (entitiesWithoutBids.length > 0) {
        console.log(`[RulesEngine] Found ${entitiesWithoutBids.length} entity/entities inheriting bids. Fetching ad group default bids...`);
        const adGroupIdsToFetch = [...new Set(entitiesWithoutBids.map(e => e.adGroupId).filter(id => id))];
        
        if (adGroupIdsToFetch.length > 0) {
            try {
                const adGroupResponse = await amazonAdsApiRequest({
                    method: 'post', url: '/sp/adGroups/list', profileId: rule.profile_id,
                    data: { adGroupIdFilter: { include: adGroupIdsToFetch } },
                    headers: { 'Content-Type': 'application/vnd.spAdGroup.v3+json', 'Accept': 'application/vnd.spAdGroup.v3+json' }
                });
        
                const adGroupBidMap = new Map();
                (adGroupResponse.adGroups || []).forEach(ag => {
                    adGroupBidMap.set(ag.adGroupId.toString(), ag.defaultBid);
                });
        
                entitiesWithoutBids.forEach(entity => {
                    const defaultBid = adGroupBidMap.get(entity.adGroupId.toString());
                    if (typeof defaultBid === 'number') {
                        entity.currentBid = defaultBid;
                    } else {
                         console.warn(`[RulesEngine] Could not find default bid for ad group ${entity.adGroupId} for entity ${entity.entityId}`);
                    }
                });
            } catch (e) {
                console.error('[RulesEngine] Failed to fetch ad group default bids.', e);
            }
        } else {
            console.log('[RulesEngine] No valid AdGroup IDs found for fetching default bids.');
        }
    }

    const allEntities = [...keywordsToProcess.values(), ...targetsToProcess.values()];
    for (const entity of allEntities) {
        if (throttledEntities.has(entity.entityId)) continue;
        if (typeof entity.currentBid !== 'number') continue;
        
        for (const group of rule.config.conditionGroups) {
            let allConditionsMet = true;
            const evaluatedMetrics = [];
            for (const condition of group.conditions) {
                const metrics = calculateMetricsForWindow(entity.dailyData, condition.timeWindow, referenceDate);
                const metricValue = metrics[condition.metric];
                const conditionValue = condition.value;
                
                const metricValueForLog = metricValue === Infinity ? 'Infinity' : metricValue;
                
                evaluatedMetrics.push({
                    metric: condition.metric,
                    timeWindow: condition.timeWindow,
                    value: metricValueForLog,
                    condition: `${condition.operator} ${condition.value}`
                });

                if (!checkCondition(metricValue, condition.operator, conditionValue)) {
                    allConditionsMet = false;
                    break;
                }
            }

            if (allConditionsMet) {
                const { type, value, minBid, maxBid } = group.action;
                let newBid;

                const absValue = Math.abs(value || 0);

                switch (type) {
                    case 'increaseBidPercent':
                        newBid = entity.currentBid * (1 + (absValue / 100));
                        break;
                    case 'decreaseBidPercent':
                        newBid = entity.currentBid * (1 - (absValue / 100));
                        break;
                    case 'increaseBidAmount':
                        newBid = entity.currentBid + absValue;
                        break;
                    case 'decreaseBidAmount':
                        newBid = entity.currentBid - absValue;
                        break;
                    case 'adjustBidPercent':
                        newBid = entity.currentBid * (1 + (value / 100));
                        break;
                    default:
                        continue;
                }

                if (typeof newBid === 'number') {
                    const originalIntent = newBid - entity.currentBid;
                    
                    if (originalIntent < 0) {
                        newBid = Math.floor(newBid * 100) / 100;
                    } else {
                        newBid = Math.ceil(newBid * 100) / 100;
                    }
                    
                    newBid = Math.max(0.02, newBid);

                    let finalBid = newBid;
                    let reason = '';

                    if (typeof minBid === 'number' && finalBid < minBid) {
                        finalBid = minBid;
                        reason = ` (hit Min Bid of ${formatPriceForLog(minBid)})`;
                    }
                    if (typeof maxBid === 'number' && finalBid > maxBid) {
                        finalBid = maxBid;
                        reason = ` (hit Max Bid of ${formatPriceForLog(maxBid)})`;
                    }
                    
                    if (originalIntent < 0 && finalBid > entity.currentBid) {
                        console.log(`[RulesEngine] Bid adjustment for entity ${entity.entityId} skipped. Original bid ${entity.currentBid} is below Min Bid ${minBid}, and the rule intended to decrease it.`);
                        break;
                    }

                    finalBid = parseFloat(finalBid.toFixed(2));
                    
                    if (finalBid !== entity.currentBid) {
                        const campaignId = entity.campaignId;
                        if (!actionsByCampaign[campaignId]) {
                            actionsByCampaign[campaignId] = { 
                                campaignName: entity.campaignName || `Campaign ${campaignId}`,
                                changes: [], 
                                newNegatives: [] 
                            };
                        }
                        
                        actionsByCampaign[campaignId].changes.push({
                           entityType: entity.entityType, entityId: entity.entityId, entityText: entity.entityText,
                           oldBid: entity.currentBid, newBid: finalBid, reason: reason.trim(), triggeringMetrics: evaluatedMetrics
                        });

                         const updatePayload = {
                             [entity.entityType === 'keyword' ? 'keywordId' : 'targetId']: entity.entityId,
                             bid: finalBid
                         };
                         if (entity.entityType === 'keyword') {
                             keywordsToUpdate.push(updatePayload);
                         } else {
                             targetsToUpdate.push(updatePayload);
                         }
                    }
                }
                break;
            }
        }
    }

    if (keywordsToUpdate.length > 0) {
        try {
            await amazonAdsApiRequest({
                method: 'put', url: '/sp/keywords', profileId: rule.profile_id,
                data: { keywords: keywordsToUpdate },
                headers: {
                    'Content-Type': 'application/vnd.spKeyword.v3+json',
                    'Accept': 'application/vnd.spKeyword.v3+json'
                }
            });
        } catch(e) { console.error('[RulesEngine] Failed to apply keyword bid updates.', e); }
    }
     if (targetsToUpdate.length > 0) {
        try {
            await amazonAdsApiRequest({
                method: 'put', url: '/sp/targets', profileId: rule.profile_id,
                data: { targetingClauses: targetsToUpdate },
                headers: {
                    'Content-Type': 'application/vnd.spTargetingClause.v3+json',
                    'Accept': 'application/vnd.spTargetingClause.v3+json'
                }
            });
        } catch (e) { console.error('[RulesEngine] Failed to apply target bid updates.', e); }
    }

    const totalChanges = Object.values(actionsByCampaign).reduce((sum, campaign) => sum + campaign.changes.length, 0);
    return {
        summary: `Adjusted bids for ${totalChanges} target(s)/keyword(s).`,
        details: { actions_by_campaign: actionsByCampaign },
        actedOnEntities: [...keywordsToUpdate.map(k => k.keywordId), ...targetsToUpdate.map(t => t.targetId)]
    };
};
