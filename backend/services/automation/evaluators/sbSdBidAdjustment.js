// backend/services/automation/evaluators/sbSdBidAdjustment.js
import { amazonAdsApiRequest } from '../../helpers/amazon-api.js';
import { getLocalDateString, calculateMetricsForWindow, checkCondition } from '../utils.js';

export const evaluateSbSdBidAdjustmentRule = async (rule, performanceData, throttledEntities) => {
    const actionsByCampaign = {};
    const sbKeywordsToUpdate = [];
    const sbTargetsToUpdate = [];
    const sdTargetsToUpdate = [];
    const referenceDate = new Date(getLocalDateString('America/Los_Angeles'));
    const allEntities = Array.from(performanceData.values());

    const allKeywordIds = allEntities.filter(e => e.entityType === 'keyword').map(e => e.entityId);
    const allTargetIds = allEntities.filter(e => e.entityType === 'target').map(e => e.entityId);
    
    const entitiesWithoutBids = [];

    // --- Phase 1: Fetch explicit bids ---
    try {
        if (rule.ad_type === 'SB' && allKeywordIds.length > 0) {
            const response = await amazonAdsApiRequest({
                method: 'get', url: '/sb/keywords', profileId: rule.profile_id,
                params: { keywordIdFilter: allKeywordIds.join(',') },
            });
            if (Array.isArray(response)) {
                response.forEach(kw => {
                    const entity = performanceData.get(kw.keywordId.toString());
                    if (entity && typeof kw.bid === 'number') entity.currentBid = kw.bid;
                });
            }
        }
        if (rule.ad_type === 'SB' && allTargetIds.length > 0) {
            const response = await amazonAdsApiRequest({
                method: 'get', url: '/sb/targets', profileId: rule.profile_id,
                params: { targetIdFilter: allTargetIds.join(',') },
            });
            if (Array.isArray(response)) {
                response.forEach(t => {
                    const entity = performanceData.get(t.targetId.toString());
                    if (entity && typeof t.bid === 'number') entity.currentBid = t.bid;
                });
            }
        }
        if (rule.ad_type === 'SD' && allTargetIds.length > 0) {
             const response = await amazonAdsApiRequest({
                method: 'get', url: '/sd/targets', profileId: rule.profile_id,
                params: { targetIdFilter: allTargetIds.join(',') },
            });
            if (Array.isArray(response)) {
                response.forEach(t => {
                    const entity = performanceData.get(t.targetId.toString());
                    if (entity && typeof t.bid === 'number') {
                        entity.currentBid = t.bid;
                    }
                });
            } else {
                console.warn(`[RulesEngine] Unexpected response structure from GET /sd/targets:`, response);
            }
        }
    } catch (e) {
        console.error(`[RulesEngine] Failed to fetch current bids for ${rule.ad_type} rule.`, e.details || e);
    }
    
    allEntities.forEach(entity => {
        if (typeof entity.currentBid !== 'number') {
            entitiesWithoutBids.push(entity);
        }
    });

    // --- Phase 2: Fallback to Ad Group default bids ---
    if (entitiesWithoutBids.length > 0) {
        if (rule.ad_type === 'SB') {
            console.log(`[RulesEngine] Found ${entitiesWithoutBids.length} SB entities inheriting bids. Fetching ad group default bids...`);
            const adGroupIds = [...new Set(entitiesWithoutBids.map(e => e.adGroupId).filter(Boolean))];
            
            if (adGroupIds.length > 0) {
                try {
                    const response = await amazonAdsApiRequest({ method: 'get', url: '/sb/adGroups', profileId: rule.profile_id, params: { adGroupIdFilter: adGroupIds.join(',') } });
                    const adGroupData = response || [];
                    
                    const adGroupBidMap = new Map();
                    adGroupData.forEach(ag => adGroupBidMap.set(ag.adGroupId.toString(), ag.defaultBid));
                    
                    entitiesWithoutBids.forEach(entity => {
                        const defaultBid = adGroupBidMap.get(entity.adGroupId.toString());
                        if (typeof defaultBid === 'number') {
                            entity.currentBid = defaultBid;
                        } else {
                            console.warn(`[RulesEngine] Could not find default bid for SB ad group ${entity.adGroupId} for entity ${entity.entityId}`);
                        }
                    });
                } catch(e) {
                    console.error(`[RulesEngine] Failed to fetch SB ad group default bids.`, e.details || e);
                }
            }
        } else if (rule.ad_type === 'SD') {
            console.log(`[RulesEngine] Found ${entitiesWithoutBids.length} SD entities without a readable bid. They will be skipped. This can happen if they use a dynamic bidding strategy instead of a fixed bid.`);
        }
    }
    
    
    // --- Phase 3: Evaluate and prepare actions ---
    for (const entity of allEntities) {
        if (throttledEntities.has(entity.entityId) || typeof entity.currentBid !== 'number') continue;
        
        for (const group of rule.config.conditionGroups) {
            let allConditionsMet = true;
            const evaluatedMetrics = [];
            for (const condition of group.conditions) {
                const metrics = calculateMetricsForWindow(entity.dailyData, condition.timeWindow, referenceDate);
                const metricValue = metrics[condition.metric];
                let conditionValue = condition.value;
                if (condition.metric === 'acos') conditionValue /= 100;
                
                evaluatedMetrics.push({ metric: condition.metric, timeWindow: condition.timeWindow, value: metricValue, condition: `${condition.operator} ${condition.value}` });

                if (!checkCondition(metricValue, condition.operator, conditionValue)) {
                    allConditionsMet = false;
                    break;
                }
            }

            if (allConditionsMet) {
                const { type, value, minBid, maxBid } = group.action;
                if (type === 'adjustBidPercent') {
                    let newBid = entity.currentBid * (1 + (value / 100));
                    newBid = Math.max(0.02, parseFloat(newBid.toFixed(2)));
                    if (typeof minBid === 'number') newBid = Math.max(minBid, newBid);
                    if (typeof maxBid === 'number') newBid = Math.min(maxBid, newBid);
                    
                    if (newBid !== entity.currentBid) {
                        const campaignId = entity.campaignId;
                        if (!actionsByCampaign[campaignId]) actionsByCampaign[campaignId] = { changes: [], newNegatives: [] };
                        
                        actionsByCampaign[campaignId].changes.push({
                           entityType: entity.entityType, entityId: entity.entityId, entityText: entity.entityText,
                           oldBid: entity.currentBid, newBid, triggeringMetrics: evaluatedMetrics, campaignId: campaignId
                        });

                        if (rule.ad_type === 'SB') {
                            if (entity.entityType === 'keyword') {
                                sbKeywordsToUpdate.push({ keywordId: entity.entityId, adGroupId: entity.adGroupId, campaignId: entity.campaignId, bid: newBid });
                            } else {
                                sbTargetsToUpdate.push({ targetId: entity.entityId, adGroupId: entity.adGroupId, campaignId: entity.campaignId, bid: newBid });
                            }
                        } else if (rule.ad_type === 'SD') {
                            sdTargetsToUpdate.push({ targetId: entity.entityId, bid: newBid });
                        }
                    }
                }
                break; 
            }
        }
    }

    const successfulEntityIds = new Set();
    const failedUpdates = [];

    // --- Phase 4: Process API calls and collect results ---
    if (sbKeywordsToUpdate.length > 0) {
        try {
            const response = await amazonAdsApiRequest({ method: 'put', url: '/sb/keywords', profileId: rule.profile_id, data: sbKeywordsToUpdate });
            if (response && Array.isArray(response)) {
                response.forEach(result => {
                    if (result.code === 'SUCCESS') {
                        successfulEntityIds.add(result.keywordId.toString());
                    } else {
                        const failure = { entityId: result.keywordId, entityType: 'SB Keyword', code: result.code, details: result.details };
                        failedUpdates.push(failure);
                        console.warn(`[RulesEngine] Failed to update SB keyword ${result.keywordId} for rule "${rule.name}". Reason: ${result.details} (Code: ${result.code})`);
                    }
                });
            }
        } catch (e) { console.error('[RulesEngine] API call failed for PUT /sb/keywords.', e); }
    }
    if (sbTargetsToUpdate.length > 0) {
        try {
            const response = await amazonAdsApiRequest({ method: 'put', url: '/sb/targets', profileId: rule.profile_id, data: sbTargetsToUpdate });
            if (response && Array.isArray(response)) {
                response.forEach(result => {
                    if (result.code === 'SUCCESS') {
                        successfulEntityIds.add(result.targetId.toString());
                    } else {
                        const failure = { entityId: result.targetId, entityType: 'SB Target', code: result.code, details: result.details };
                        failedUpdates.push(failure);
                        console.warn(`[RulesEngine] Failed to update SB target ${result.targetId} for rule "${rule.name}". Reason: ${result.details} (Code: ${result.code})`);
                    }
                });
            }
        } catch (e) { console.error('[RulesEngine] API call failed for PUT /sb/targets.', e); }
    }
    if (sdTargetsToUpdate.length > 0) {
        try {
            const response = await amazonAdsApiRequest({ method: 'put', url: '/sd/targets', profileId: rule.profile_id, data: { targets: sdTargetsToUpdate } });
            if (response && Array.isArray(response.targets)) {
                response.targets.forEach(result => {
                    if (result.code === 'SUCCESS') {
                        successfulEntityIds.add(result.targetId.toString());
                    } else {
                        const failure = { entityId: result.targetId, entityType: 'SD Target', code: result.code, details: result.details };
                        failedUpdates.push(failure);
                        console.warn(`[RulesEngine] Failed to update SD target ${result.targetId} for rule "${rule.name}". Reason: ${result.details} (Code: ${result.code})`);
                    }
                });
            }
        } catch (e) { console.error('[RulesEngine] API call failed for PUT /sd/targets.', e); }
    }

    // --- Filter original actions to only include successful changes ---
    const finalActionsByCampaign = {};
    for (const campaignId in actionsByCampaign) {
        const campaignActions = actionsByCampaign[campaignId];
        const successfulChanges = campaignActions.changes.filter(change => successfulEntityIds.has(change.entityId.toString()));
        
        if (successfulChanges.length > 0) {
            finalActionsByCampaign[campaignId] = {
                ...campaignActions,
                changes: successfulChanges,
                failures: failedUpdates.filter(f => {
                    const originalChange = campaignActions.changes.find(c => c.entityId.toString() === f.entityId.toString());
                    return !!originalChange; // Check if the failure belongs to this campaign
                })
            };
        }
    }
    
    const totalChanges = successfulEntityIds.size;
    const actedOnEntities = Array.from(successfulEntityIds);

    return {
        summary: `Successfully adjusted bids for ${totalChanges} ${rule.ad_type} target(s)/keyword(s). ${failedUpdates.length > 0 ? `${failedUpdates.length} failed.` : ''}`.trim(),
        details: { actions_by_campaign: finalActionsByCampaign },
        actedOnEntities
    };
};
