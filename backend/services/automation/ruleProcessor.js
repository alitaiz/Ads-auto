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
import { createAutoCampaign } from '../../routes/ppcManagementApi.js'; // Import the new action

// Define a constant for Amazon's reporting timezone to ensure consistency.
const REPORTING_TIMEZONE = 'America/Los_Angeles';

let isProcessing = false; // Global lock to prevent overlapping cron jobs

const processCampaignCreationRule = async (rule) => {
    console.log(`[RulesEngine] ⚙️  Processing CAMPAIGN CREATION rule "${rule.name}" (ID: ${rule.id}).`);
    const { asin, budget, defaultBid } = rule.creation_parameters;
    const associatedRuleIds = rule.associated_rule_ids || [];

    try {
        const result = await createAutoCampaign(rule.profile_id, asin, budget, defaultBid, associatedRuleIds);
        
        const summary = `Successfully created campaign "${result.campaignName}" from schedule.`;
        await logAction(rule, 'SUCCESS', summary, {
            campaignId: result.campaignId,
            campaignName: result.campaignName,
            rulesAssociated: result.rulesAssociated,
        });

    } catch (error) {
        console.error(`[RulesEngine] ❌ Error processing campaign creation rule ${rule.id}:`, error);
        await logAction(rule, 'FAILURE', `Campaign creation failed for ASIN ${asin}.`, { error: error.message });
    } finally {
        await pool.query('UPDATE campaign_creation_rules SET last_run_at = NOW() WHERE id = $1', [rule.id]);
    }
};


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

            const cooldownConfig = rule.config.cooldown || { value: 0 };
            let throttledEntities = new Set();
            if (cooldownConfig.value > 0) {
                const throttleCheckResult = await pool.query(
                    'SELECT entity_id FROM automation_action_throttle WHERE rule_id = $1 AND throttle_until > NOW()',
                    [rule.id]
                );
                throttledEntities = new Set(throttleCheckResult.rows.map(r => r.entity_id));
            }

            if (performanceMap.size === 0) {
                finalResult = { summary: 'No performance data found for the specified scope.', details: { actions_by_campaign: {} }, actedOnEntities: [] };
            } else if (rule.rule_type === 'BID_ADJUSTMENT') {
                if (rule.ad_type === 'SB' || rule.ad_type === 'SD') {
                    finalResult = await evaluateSbSdBidAdjustmentRule(rule, performanceMap, throttledEntities);
                } else {
                    finalResult = await evaluateBidAdjustmentRule(rule, performanceMap, throttledEntities);
                }
            } else if (rule.rule_type === 'SEARCH_TERM_AUTOMATION') {
                finalResult = await evaluateSearchTermAutomationRule(rule, performanceMap, throttledEntities);
            } else if (rule.rule_type === 'BUDGET_ACCELERATION') {
                finalResult = await evaluateBudgetAccelerationRule(rule, performanceMap);
            } else if (rule.rule_type === 'SEARCH_TERM_HARVESTING') {
                finalResult = await evaluateSearchTermHarvestingRule(rule, performanceMap, throttledEntities);
            } else {
                finalResult = { summary: 'Rule type not recognized.', details: { actions_by_campaign: {} }, actedOnEntities: [] };
            }

            if (finalResult.actedOnEntities.length > 0 && cooldownConfig.value > 0) {
                const { value, unit } = cooldownConfig;
                const interval = `${value} ${unit}`;
                const upsertQuery = `
                    INSERT INTO automation_action_throttle (rule_id, entity_id, throttle_until)
                    SELECT $1, unnest($2::text[]), NOW() + $3::interval
                    ON CONFLICT (rule_id, entity_id) DO UPDATE
                    SET throttle_until = EXCLUDED.throttle_until;
                `;
                await pool.query(upsertQuery, [rule.id, finalResult.actedOnEntities, interval]);
            }
        }
        
        // --- Final Logging ---
        if (dataDateRange) {
            finalResult.details.data_date_range = dataDateRange;
        }

        const totalCampaignActions = Object.values(finalResult.details.actions_by_campaign || {}).length > 0;
        const hasPriceChanges = finalResult.details.changes && finalResult.details.changes.length > 0;
        const hasHarvestActions = (finalResult.details.created || 0) > 0 || (finalResult.details.negated || 0) > 0;
        
        const actionWasTaken = totalCampaignActions || hasPriceChanges || hasHarvestActions;

        if (actionWasTaken) {
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
        // --- Process Standard Automation Rules ---
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
            console.log('[RulesEngine] No standard automation rules are due to run.');
        } else {
            console.log(`[RulesEngine] Found ${dueRules.length} standard rule(s) to run: ${dueRules.map(r => r.name).join(', ')}`);
            for (const rule of dueRules) {
                await processRule(rule);
            }
        }
        
        // --- Process Campaign Creation Rules ---
        const { rows: activeCreationRules } = await pool.query('SELECT * FROM campaign_creation_rules WHERE is_active = TRUE');
        const dueCreationRules = activeCreationRules.filter(isRuleDue);

        if (dueCreationRules.length === 0) {
            console.log('[RulesEngine] No campaign creation schedules are due to run.');
        } else {
            console.log(`[RulesEngine] Found ${dueCreationRules.length} campaign creation schedule(s) to run: ${dueCreationRules.map(r => r.name).join(', ')}`);
            for (const rule of dueCreationRules) {
                await processCampaignCreationRule(rule);
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
        
        // Find campaigns that had their budget overridden today and haven't been reverted yet.
        // Join with automation_rules to get the profile_id needed for the API call.
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

        // Group by profile ID since API calls are profile-specific
        const updatesByProfile = overrides.reduce((acc, override) => {
            if (!acc[override.profile_id]) {
                acc[override.profile_id] = [];
            }
            acc[override.profile_id].push({
                campaignId: String(override.campaign_id), // API expects string IDs
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

                // Check response for successful updates
                if (response.campaigns && Array.isArray(response.campaigns.success)) {
                    response.campaigns.success.forEach(result => {
                        successfulResets.push(result.campaignId);
                    });
                }
                if (response.campaigns && Array.isArray(response.campaigns.error)) {
                     response.campaigns.error.forEach(result => {
                        console.error(`[Budget Reset] Failed to reset budget for campaign ${result.campaignId}. Reason: ${result.errors?.[0]?.errorValue?.message || 'Unknown API error'}`);
                    });
                }
            } catch (error) {
                console.error(`[Budget Reset] API call failed for profile ${profileId}.`, error.details || error);
            }
        }

        // Update the database for successfully reset campaigns
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
