// backend/services/automation/evaluators.js
import pool from '../../db.js';
import { amazonAdsApiRequest } from '../../helpers/amazon-api.js';
import { getListingInfoBySku, updatePrice } from '../../helpers/spApiHelper.js';
import { getLocalDateString, calculateMetricsForWindow, checkCondition } from './utils.js';

export const evaluatePriceAdjustmentRule = async (rule) => {
    const { skus, priceStep, priceLimit } = rule.config;
    if (!Array.isArray(skus) || skus.length === 0) {
        return { summary: "No SKUs configured for this rule.", details: {}, actedOnEntities: [] };
    }

    const changes = [];
    const errors = [];
    
    console.log(`[Price Evaluator] Starting price check for ${skus.length} SKU(s).`);

    for (const sku of skus) {
        try {
            const { price, sellerId } = await getListingInfoBySku(sku);

            if (price === null) {
                console.warn(`[Price Evaluator] Could not retrieve current price for SKU: ${sku}. Skipping.`);
                errors.push({ sku, reason: "Could not retrieve current price." });
                continue;
            }

            const step = Number(priceStep);
            const limit = Number(priceLimit);

            if (isNaN(step)) {
                 errors.push({ sku, reason: `Invalid priceStep: "${priceStep}".` });
                 continue;
            }
             if (isNaN(limit)) {
                 errors.push({ sku, reason: `Invalid priceLimit: "${priceLimit}".` });
                 continue;
            }

            let newPrice;
            const potentialPrice = price + step;

            // NEW LOGIC: If the potential price hits or exceeds the limit,
            // reset it to the current price minus 0.5. Otherwise, use the potential price.
            if (potentialPrice >= limit) {
                newPrice = price - 0.5;
                console.log(`[Price Evaluator] SKU ${sku} potential price ${potentialPrice.toFixed(2)} hit limit of ${limit}. Resetting price from ${price} to ${newPrice.toFixed(2)}.`);
            } else {
                newPrice = potentialPrice;
            }
            
            // Round to 2 decimal places to handle floating point inaccuracies.
            newPrice = parseFloat(newPrice.toFixed(2));

            // Update only if the price has actually changed and is a valid positive number.
            if (newPrice > 0 && newPrice !== price) {
                console.log(`[Price Evaluator] Updating SKU ${sku}: ${price} -> ${newPrice}`);
                await updatePrice(sku, newPrice, sellerId);
                changes.push({ sku, oldPrice: price, newPrice });
            } else {
                 console.log(`[Price Evaluator] No price change needed for SKU ${sku}. Current: ${price}, Calculated New: ${newPrice}`);
            }
             // Add a small delay between API calls to avoid throttling
            await new Promise(resolve => setTimeout(resolve, 1500));

        } catch (error) {
            console.error(`[Price Evaluator] Error processing SKU ${sku}:`, error.message);
            errors.push({ sku, reason: error.message });
        }
    }

    let summary = '';
    if (changes.length > 0) summary += `Successfully updated price for ${changes.length} SKU(s). `;
    if (errors.length > 0) summary += `Failed to process ${errors.length} SKU(s).`;
    if (summary === '') summary = 'No price changes were necessary.';
    
    return {
        summary,
        details: { changes, errors },
        actedOnEntities: [] // Cooldown not applicable for price rules at this time
    };
};


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
                let conditionValue = condition.value;

                if (condition.metric === 'acos') {
                    conditionValue = condition.value / 100;
                }
                
                evaluatedMetrics.push({
                    metric: condition.metric,
                    timeWindow: condition.timeWindow,
                    value: metricValue,
                    condition: `${condition.operator} ${condition.value}`
                });

                if (!checkCondition(metricValue, condition.operator, conditionValue)) {
                    allConditionsMet = false;
                    break;
                }
            }

            if (allConditionsMet) {
                const { type, value, minBid, maxBid } = group.action;
                let newBid; // This will hold the calculated new bid

                // Use Math.abs(value) because the UI now enforces positive values and direction is in the type
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
                    // Backward compatibility for old rules still in the DB
                    case 'adjustBidPercent':
                        newBid = entity.currentBid * (1 + (value / 100)); // Here we use the original signed value
                        break;
                    default:
                        // If the action type is not for bid adjustment, skip to the next group.
                        continue;
                }

                // Check if newBid was successfully calculated before proceeding
                if (typeof newBid === 'number') {
                    // Apply rounding based on the intended direction of change
                    if (type.startsWith('decrease') || (type === 'adjustBidPercent' && value < 0)) {
                        newBid = Math.floor(newBid * 100) / 100; // Round down for decreases
                    } else {
                        newBid = Math.ceil(newBid * 100) / 100; // Round up for increases
                    }
                    
                    // Enforce Amazon's minimum bid of $0.02
                    newBid = Math.max(0.02, newBid);

                    // Apply user-defined min/max bid constraints
                    if (typeof minBid === 'number') {
                        newBid = Math.max(minBid, newBid);
                    }
                    if (typeof maxBid === 'number') {
                        newBid = Math.min(maxBid, newBid);
                    }
                    
                    newBid = parseFloat(newBid.toFixed(2));
                    
                    if (newBid !== entity.currentBid) {
                        const campaignId = entity.campaignId;
                        if (!actionsByCampaign[campaignId]) {
                            actionsByCampaign[campaignId] = { changes: [], newNegatives: [] };
                        }
                        
                        actionsByCampaign[campaignId].changes.push({
                           entityType: entity.entityType, entityId: entity.entityId, entityText: entity.entityText,
                           oldBid: entity.currentBid, newBid: newBid, triggeringMetrics: evaluatedMetrics
                        });

                         const updatePayload = {
                             [entity.entityType === 'keyword' ? 'keywordId' : 'targetId']: entity.entityId,
                             bid: newBid
                         };
                         if (entity.entityType === 'keyword') {
                             keywordsToUpdate.push(updatePayload);
                         } else {
                             targetsToUpdate.push(updatePayload);
                         }
                    }
                }
                // "First Match Wins" - break from the conditionGroups loop for this entity
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


export const evaluateSearchTermAutomationRule = async (rule, performanceData, throttledEntities) => {
    const negativeKeywordsToCreate = [];
    const negativeTargetsToCreate = [];
    const actionsByCampaign = {};
    const referenceDate = new Date(getLocalDateString('America/Los_Angeles'));
    referenceDate.setDate(referenceDate.getDate() - 2);

    const asinRegex = /^b0[a-z0-9]{8}$/i;

    for (const entity of performanceData.values()) {
        if (throttledEntities.has(entity.entityText)) continue;

        for (const group of rule.config.conditionGroups) {
            let allConditionsMet = true;
            const evaluatedMetrics = [];
            for (const condition of group.conditions) {
                const metrics = calculateMetricsForWindow(entity.dailyData, condition.timeWindow, referenceDate);
                const metricValue = metrics[condition.metric];
                let conditionValue = condition.value;

                if (condition.metric === 'acos') {
                    conditionValue = condition.value / 100;
                }
                
                 evaluatedMetrics.push({
                    metric: condition.metric,
                    timeWindow: condition.timeWindow,
                    value: metricValue,
                    condition: `${condition.operator} ${condition.value}`
                });

                if (!checkCondition(metricValue, condition.operator, conditionValue)) {
                    allConditionsMet = false;
                    break;
                }
            }

            if (allConditionsMet) {
                const { type, matchType } = group.action;
                if (type === 'negateSearchTerm') {
                    const searchTerm = entity.entityText;
                    const isAsin = asinRegex.test(searchTerm);

                    const campaignId = entity.campaignId;
                    if (!actionsByCampaign[campaignId]) {
                        actionsByCampaign[campaignId] = { changes: [], newNegatives: [] };
                    }

                    actionsByCampaign[campaignId].newNegatives.push({
                        searchTerm: searchTerm,
                        campaignId,
                        adGroupId: entity.adGroupId,
                        matchType: isAsin ? 'NEGATIVE_PRODUCT_TARGET' : matchType,
                        triggeringMetrics: evaluatedMetrics
                    });

                    if (isAsin) {
                        negativeTargetsToCreate.push({
                            campaignId: entity.campaignId,
                            adGroupId: entity.adGroupId,
                            expression: [{ type: 'ASIN_SAME_AS', value: searchTerm }]
                        });
                    } else {
                        negativeKeywordsToCreate.push({
                            campaignId: entity.campaignId,
                            adGroupId: entity.adGroupId,
                            keywordText: entity.entityText,
                            matchType: matchType
                        });
                    }
                }
                break;
            }
        }
    }

    if (negativeKeywordsToCreate.length > 0) {
        const apiPayload = negativeKeywordsToCreate.map(kw => ({
            ...kw,
            state: 'ENABLED'
        }));

        await amazonAdsApiRequest({
            method: 'post', url: '/sp/negativeKeywords', profileId: rule.profile_id,
            data: { negativeKeywords: apiPayload },
            headers: {
                'Content-Type': 'application/vnd.spNegativeKeyword.v3+json',
                'Accept': 'application/vnd.spNegativeKeyword.v3+json'
            }
        });
    }

    if (negativeTargetsToCreate.length > 0) {
        const apiPayload = negativeTargetsToCreate.map(target => ({
            ...target,
            state: 'ENABLED'
        }));
        await amazonAdsApiRequest({
            method: 'post',
            url: '/sp/negativeTargets',
            profileId: rule.profile_id,
            data: { negativeTargetingClauses: apiPayload },
            headers: {
                'Content-Type': 'application/vnd.spNegativeTargetingClause.v3+json',
                'Accept': 'application/vnd.spNegativeTargetingClause.v3+json',
            }
        });
    }

    const totalKeywords = negativeKeywordsToCreate.length;
    const totalTargets = negativeTargetsToCreate.length;
    const summaryParts = [];
    if (totalKeywords > 0) summaryParts.push(`Created ${totalKeywords} new negative keyword(s)`);
    if (totalTargets > 0) summaryParts.push(`Created ${totalTargets} new negative product target(s)`);
    
    return {
        summary: summaryParts.length > 0 ? summaryParts.join(' and ') + '.' : 'No search terms met the criteria for negation.',
        details: { actions_by_campaign: actionsByCampaign },
        actedOnEntities: [...negativeKeywordsToCreate.map(n => n.keywordText), ...negativeTargetsToCreate.map(n => n.expression[0].value)]
    };
};

export const evaluateBudgetAccelerationRule = async (rule, performanceData) => {
    const actionsByCampaign = {};
    const campaignsToUpdate = [];
    const referenceDate = new Date(getLocalDateString('America/Los_Angeles'));
    const todayDateStr = referenceDate.toISOString().split('T')[0];

    for (const campaignPerf of performanceData.values()) {
        const currentBudget = campaignPerf.originalBudget;

        for (const group of rule.config.conditionGroups) {
            let allConditionsMet = true;
            const evaluatedMetrics = [];
            
            const metrics = calculateMetricsForWindow(campaignPerf.dailyData, 'TODAY', referenceDate);

            for (const condition of group.conditions) {
                let metricValue;
                if (condition.metric === 'budgetUtilization') {
                    metricValue = currentBudget > 0 ? (metrics.spend / currentBudget) * 100 : 0;
                } else {
                    metricValue = metrics[condition.metric];
                }

                let conditionValue = condition.value;
                if (condition.metric === 'acos') {
                    conditionValue = condition.value / 100;
                }
                
                evaluatedMetrics.push({
                    metric: condition.metric,
                    timeWindow: 'TODAY',
                    value: metricValue,
                    condition: `${condition.operator} ${condition.value}`
                });
                
                if (!checkCondition(metricValue, condition.operator, conditionValue)) {
                    allConditionsMet = false;
                    break;
                }
            }

            if (allConditionsMet) {
                const { type, value } = group.action;
                let newBudget;
                if (type === 'increaseBudgetPercent') {
                    newBudget = currentBudget * (1 + (value / 100));
                } else if (type === 'setBudgetAmount') {
                    newBudget = value;
                }
                newBudget = parseFloat(newBudget.toFixed(2));

                if (newBudget > currentBudget) {
                    await pool.query(
                        `INSERT INTO daily_budget_overrides (campaign_id, original_budget, override_date, rule_id) 
                         VALUES ($1, $2, $3, $4) 
                         ON CONFLICT (campaign_id, override_date) DO UPDATE SET
                           rule_id = EXCLUDED.rule_id,
                           reverted_at = NULL;`,
                        [campaignPerf.campaignId, currentBudget, todayDateStr, rule.id]
                    );

                    campaignsToUpdate.push({
                        campaignId: String(campaignPerf.campaignId),
                        budget: { budget: newBudget, budgetType: 'DAILY' }
                    });

                    if (!actionsByCampaign[campaignPerf.campaignId]) {
                        actionsByCampaign[campaignId] = { changes: [], newNegatives: [] };
                    }
                    actionsByCampaign[campaignPerf.campaignId].changes.push({
                        entityType: 'campaign', entityId: campaignPerf.campaignId,
                        oldBudget: currentBudget, newBudget,
                        triggeringMetrics: evaluatedMetrics
                    });
                }
                break;
            }
        }
    }

    if (campaignsToUpdate.length > 0) {
        await amazonAdsApiRequest({
            method: 'put',
            url: '/sp/campaigns',
            profileId: rule.profile_id,
            data: { campaigns: campaignsToUpdate },
            headers: {
                'Content-Type': 'application/vnd.spCampaign.v3+json',
                'Accept': 'application/vnd.spCampaign.v3+json'
            },
        });
    }

    return {
        summary: `Accelerated budget for ${campaignsToUpdate.length} campaign(s).`,
        details: { actions_by_campaign: actionsByCampaign },
        actedOnEntities: []
    };
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
                        
                        // FIX: Corrected startDate format to YYYY-MM-DD
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
                            let errorMessage;
                            if (e instanceof Error) {
                                errorMessage = e.message;
                            } else if (e && e.details) {
                                 if (typeof e.details === 'object' && e.details !== null) {
                                    errorMessage = e.details.message || e.details.Message || JSON.stringify(e.details);
                                 } else {
                                     errorMessage = e.details;
                                 }
                            } else if (e && (e.Message || e.message)) {
                                 errorMessage = e.Message || e.message;
                            } else {
                                 errorMessage = 'An unknown error occurred. See server logs for the raw error object.';
                            }
                            console.error(`[Harvesting] Error in CREATE_NEW_CAMPAIGN flow:`, errorMessage);
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