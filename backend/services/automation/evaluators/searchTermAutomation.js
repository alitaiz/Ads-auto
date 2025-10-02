// backend/services/automation/evaluators/searchTermAutomation.js
import { amazonAdsApiRequest } from '../../../helpers/amazon-api.js';
import { getLocalDateString, calculateMetricsForWindow, checkCondition } from '../utils.js';

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
                const conditionValue = condition.value;

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
