// backend/services/automation/evaluators/budgetAcceleration.js
import pool from '../../../db.js';
import { amazonAdsApiRequest } from '../../../helpers/amazon-api.js';
import { getLocalDateString, calculateMetricsForWindow, checkCondition } from '../utils.js';

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

                const conditionValue = condition.value;
                
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
                        actionsByCampaign[campaignPerf.campaignId] = { changes: [], newNegatives: [] };
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
