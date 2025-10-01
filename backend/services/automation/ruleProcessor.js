// backend/services/automation/ruleProcessor.js
import pool from '../../db.js';
import { getPerformanceData } from './dataFetcher.js';
import { 
    evaluateBidAdjustmentRule, 
    evaluateSearchTermAutomationRule, 
    evaluateBudgetAccelerationRule, 
    evaluateSbSdBidAdjustmentRule, 
    evaluatePriceAdjustmentRule, 
    evaluateSearchTermHarvestingRule 
} from './evaluators/index.js';
import { isRuleDue, logAction, getLocalDateString } from './utils.js';
import { amazonAdsApiRequest } from '../../helpers/amazon-api.js';

// Define a constant for Amazon's reporting timezone to ensure consistency.
const REPORTING_TIMEZONE = 'America/Los_Angeles';

let isProcessing = false; // Global lock to prevent overlapping cron jobs

const processRule = async (rule) => {
    console.log(`[RulesEngine] ⚙️  Processing rule "${rule.name}" (ID: ${rule.id}).`);
    
    try {
        let finalResult;
        let dataDateRange = null;

        if (rule.rule_type === 'PRICE_ADJUSTMENT') {
            finalResult = await evaluatePriceAdjustmentRule(rule);
        } else {
            const campaignIds = rule.scope?.campaignIds || [];
            if (campaignIds.length === 0) {
                console.log(`[RulesEngine] Skipping rule "${rule.name}" as it has an empty campaign scope.`);
                await pool.query('UPDATE automation_rules SET last_run_at = NOW() WHERE id = $1', [rule.id]);
                return;
            }

            const performanceDataResult = await getPerformanceData(rule, campaignIds);
            const performanceMap = performanceDataResult.performanceMap;
            dataDateRange = performanceDataResult.dataDateRange;
            
            // The cooldown/throttle mechanism is now handled within each evaluator where applicable.
            
            if (performanceMap.size === 0) {
                finalResult = { summary: 'No performance data found for the specified scope.', details: { actions_by_campaign: {} }, actedOnEntities: [] };
            } else if (rule.rule_type === 'BID_ADJUSTMENT') {
                if (rule.ad_type === 'SB' || rule.ad_type === 'SD') {
                    finalResult = await evaluateSbSdBidAdjustmentRule(rule, performanceMap);
                } else {
                    finalResult = await evaluateBidAdjustmentRule(rule, performanceMap);
                }
            } else if (rule.rule_type === 'SEARCH_TERM_AUTOMATION') {
                finalResult = await evaluateSearchTermAutomationRule(rule, performanceMap);
            } else if (rule.rule_type === 'BUDGET_ACCELERATION') {
                finalResult = await evaluateBudgetAccelerationRule(rule, performanceMap);
            } else if (rule.rule_type === 'SEARCH_TERM_HARVESTING') {
                finalResult = await evaluateSearchTermHarvestingRule(rule, performanceMap);
            } else {
                finalResult = { summary: 'Rule type not recognized.', details: { actions_by_campaign: {} }, actedOnEntities: [] };
            }
        }
        
        // --- Final Logging ---
        if (dataDateRange) {
            finalResult.details.data_date_range = dataDateRange;
        }

        const totalChanges = Object.values(finalResult.details.actions_by_campaign || finalResult.details.changes || {}).length;

        if (totalChanges > 0 || (finalResult.details.changes && finalResult.details.changes.length > 0)) {
            await logAction(rule, 'SUCCESS', finalResult.summary, finalResult.details);
        } else {
            await logAction(rule, 'NO_ACTION', finalResult.summary || 'No entities met the rule criteria.', finalResult.details);
        }

    } catch (error) {
        console.error(`[RulesEngine] ❌ Error processing rule ${rule.id}:`, error);
        await logAction(rule, 'FAILURE', 'Rule processing failed due to an error.', { error: error.message, details: error.details });
    } finally {
        await pool.query('UPDATE automation_rules SET last_run_at = NOW() WHERE id = $1', [rule.id]);
    }
};


export const checkAndRunDueRules = async () => {
    if (isProcessing) {
        console.log('[RulesEngine] ⚠️  Previous check is still running. Skipping this tick to prevent overlap.');
        return;
    }
    
    console.log(`[RulesEngine] ⏰ Cron tick: Checking for due rules at ${new Date().toISOString()}`);
    isProcessing = true; // Set the lock

    try {
        const { rows: activeRules } = await pool.query('SELECT * FROM automation_rules WHERE is_active = TRUE');
        
        const normalizedRules = activeRules.map(rule => {
            if (rule.rule_type === 'PRICE_ADJUSTMENT' && rule.config.runAtTime) {
                const newRule = JSON.parse(JSON.stringify(rule));
                if (!newRule.config.frequency) newRule.config.frequency = {};
                newRule.config.frequency.startTime = newRule.config.runAtTime;
                newRule.config.frequency.unit = 'days';
                newRule.config.frequency.value = 1;
                return newRule;
            }
            return rule;
        });

        const dueRules = normalizedRules.filter(isRuleDue);

        if (dueRules.length === 0) {
            console.log('[RulesEngine] No rules are due to run at this time.');
        } else {
            console.log(`[RulesEngine] Found ${dueRules.length} rule(s) to run: ${dueRules.map(r => r.name).join(', ')}`);
            for (const rule of dueRules) {
                await processRule(rule);
            }
        }
    } catch (e) {
        console.error('[RulesEngine] CRITICAL: Failed to fetch or process rules.', e);
    } finally {
        isProcessing = false; // Release the lock
        console.log(`[RulesEngine] ✅ Cron tick finished processing.`);
    }
};

export const resetBudgets = async () => {
    const todayStr = getLocalDateString(REPORTING_TIMEZONE);
    console.log(`[Budget Reset] 🌙 Running daily budget reset for ${todayStr}.`);

    let client;
    try {
        client = await pool.connect();
        
        const { rows: overrides } = await client.query(
            `SELECT d.id, d.campaign_id, d.original_budget, r.profile_id 
             FROM daily_budget_overrides d
             JOIN automation_rules r ON d.rule_id = r.id
             WHERE d.override_date = $1 AND d.reverted_at IS NULL AND r.profile_id IS NOT NULL`,
            [todayStr]
        );

        if (overrides.length === 0) {
            console.log('[Budget Reset] No budgets to reset today.');
            return;
        }

        console.log(`[Budget Reset] Found ${overrides.length} campaign(s) to reset.`);

        const updatesByProfile = overrides.reduce((acc, override) => {
            if (!acc[override.profile_id]) {
                acc[override.profile_id] = [];
            }
            acc[override.profile_id].push({
                campaignId: String(override.campaign_id),
                budget: { budget: parseFloat(override.original_budget), budgetType: 'DAILY' }
            });
            return acc;
        }, {});

        const successfulResets = [];

        for (const profileId in updatesByProfile) {
            const updates = updatesByProfile[profileId];
            try {
                const response = await amazonAdsApiRequest({
                    method: 'put',
                    url: '/sp/campaigns',
                    profileId: profileId,
                    data: { campaigns: updates },
                    headers: {
                        'Content-Type': 'application/vnd.spCampaign.v3+json',
                        'Accept': 'application/vnd.spCampaign.v3+json'
                    },
                });

                if (response.campaigns && Array.isArray(response.campaigns)) {
                    response.campaigns.forEach(result => {
                        if (result.code === 'SUCCESS') {
                            successfulResets.push(result.campaignId);
                        } else {
                            console.error(`[Budget Reset] Failed to reset budget for campaign ${result.campaignId}. Reason: ${result.description}`);
                        }
                    });
                }
            } catch (error) {
                console.error(`[Budget Reset] API call failed for profile ${profileId}.`, error.details || error);
            }
        }

        if (successfulResets.length > 0) {
            await client.query(
                `UPDATE daily_budget_overrides SET reverted_at = NOW() WHERE campaign_id = ANY($1::bigint[]) AND override_date = $2`,
                [successfulResets, todayStr]
            );
            console.log(`[Budget Reset] Successfully reset budgets for ${successfulResets.length} campaign(s).`);
        }

    } catch (error) {
        console.error('[Budget Reset] A critical error occurred during the budget reset process:', error);
    } finally {
        if (client) client.release();
    }
};