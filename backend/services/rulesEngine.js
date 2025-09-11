// backend/services/rulesEngine.js
import pool from '../db.js';
import { amazonAdsApiRequest } from '../helpers/amazon-api.js';

async function evaluateBidAdjustmentRule(rule) {
  const { config, scope, profile_id } = rule;
  const campaignIds = scope.campaignIds || [];

  if (campaignIds.length === 0) {
    console.log(`[Rules Engine] Skipping rule "${rule.name}" as it has no campaigns in its scope.`);
    return { status: 'NO_ACTION', summary: 'Rule has no campaigns in scope.' };
  }

  // Use COALESCE to handle both old and new column names for sales and purchases
  const metricsQuery = `
    SELECT
        keyword_id,
        MAX(keyword_bid) AS current_bid,
        SUM(COALESCE(spend, cost, 0)) AS total_spend,
        SUM(clicks) AS total_clicks,
        SUM(COALESCE(sales_7d, seven_day_total_sales, 0)) AS total_sales
    FROM sponsored_products_search_term_report
    WHERE campaign_id = ANY($1::bigint[])
      AND report_date >= (CURRENT_DATE - ($2 || ' days')::interval)
    GROUP BY keyword_id;
  `;

  const { rows: keywordMetrics } = await pool.query(metricsQuery, [campaignIds, config.lookbackDays]);
  
  const updates = [];
  
  for (const metrics of keywordMetrics) {
    if (metrics.total_clicks < config.minClicks) continue;
    if (!metrics.current_bid) continue; // Cannot adjust if there's no current bid

    const acos = metrics.total_sales > 0 ? Number(metrics.total_spend) / Number(metrics.total_sales) : Infinity;
    let newBid = Number(metrics.current_bid);
    let action = null;
    let adjustmentPct = 0;

    // Logic for decreasing bid
    if (acos > config.targetAcos) {
      adjustmentPct = -Math.abs(config.bidDownPct);
      action = 'DECREASE_BID';
    } 
    // Logic for increasing bid (only if ACOS is well below target)
    else if (acos > 0 && acos < config.targetAcos * (1 - (config.increaseThresholdPct || 50) / 100)) {
       adjustmentPct = Math.abs(config.bidUpPct);
       action = 'INCREASE_BID';
    }

    if (action) {
        const bidChange = newBid * (adjustmentPct / 100);
        let cappedBidChange = Math.max(-Math.abs(config.maxStep), Math.min(Math.abs(config.maxStep), bidChange));
        
        // Ensure change meets min step
        if (Math.abs(cappedBidChange) < config.minStep) {
            action = null;
        } else {
            newBid += cappedBidChange;
            newBid = Math.max(0.02, Number(newBid.toFixed(2))); // Ensure bid is at least $0.02
        }
    }
    
    if (action && newBid !== Number(metrics.current_bid)) {
      updates.push({
        keywordId: metrics.keyword_id,
        bid: newBid,
        _details: {
            previousBid: metrics.current_bid,
            action,
            calculatedAcos: acos,
            spend: metrics.total_spend,
            sales: metrics.total_sales,
            clicks: metrics.total_clicks
        }
      });
    }
  }

  if (updates.length > 0) {
    console.log(`[Rules Engine] Rule "${rule.name}" identified ${updates.length} bid adjustments to make.`);
    await amazonAdsApiRequest({
      method: 'put',
      url: '/sp/keywords',
      profileId: profile_id,
      data: { keywords: updates.map(u => ({ keywordId: u.keywordId, bid: u.bid })) },
    });
    return { status: 'SUCCESS', summary: `Adjusted ${updates.length} keyword bids.`, details: { changes: updates.map(u => ({ keywordId: u.keywordId, ...u._details })) } };
  } else {
    console.log(`[Rules Engine] Rule "${rule.name}" evaluated but no actions were needed.`);
    return { status: 'NO_ACTION', summary: 'No keywords met the conditions for bid adjustment.' };
  }
}

async function evaluateSearchTermRule(rule) {
    // This is a placeholder for the complex logic required for search term automation.
    console.log(`[Rules Engine] Placeholder for Search Term Automation rule "${rule.name}". Logic not yet implemented.`);
    return { status: 'NO_ACTION', summary: 'Search term automation logic is not implemented.' };
}


async function processRule(rule) {
    let result = { status: 'FAILURE', summary: 'Unknown rule type.' };
    try {
        if (rule.rule_type === 'BID_ADJUSTMENT') {
            result = await evaluateBidAdjustmentRule(rule);
        } else if (rule.rule_type === 'SEARCH_TERM_AUTOMATION') {
            result = await evaluateSearchTermRule(rule);
        }
        await pool.query('INSERT INTO automation_logs (rule_id, status, summary, details) VALUES ($1, $2, $3, $4)', [rule.id, result.status, result.summary, result.details || null]);
    } catch(err) {
        console.error(`[Rules Engine] FAILED to process rule "${rule.name}" (ID: ${rule.id}):`, err);
        const errorMessage = err.details ? JSON.stringify(err.details) : err.message;
        await pool.query('INSERT INTO automation_logs (rule_id, status, summary) VALUES ($1, $2, $3)', [rule.id, 'FAILURE', `Error: ${errorMessage}`]);
    } finally {
         await pool.query('UPDATE automation_rules SET last_run_at = NOW() WHERE id = $1', [rule.id]);
    }
}


export async function runRulesEngine() {
  console.log('[Rules Engine] Starting run...');
  const query = `
    SELECT * FROM automation_rules
    WHERE is_active = TRUE
      AND (last_run_at IS NULL OR last_run_at <= NOW() - (config->>'cooldownHours' || ' hours')::INTERVAL)`;
  const { rows: activeRules } = await pool.query(query);
  
  if (activeRules.length === 0) {
    console.log('[Rules Engine] No active rules ready to run.');
    return;
  }
  
  console.log(`[Rules Engine] Found ${activeRules.length} rule(s) to process.`);
  for (const rule of activeRules) {
    await processRule(rule);
  }
  console.log('[Rules Engine] Run finished.');
}

export function startRulesEngine() {
  console.log('⚙️  Automation Rules Engine has been initialized. Will run every hour.');
  // Run once on start, then set interval
  setTimeout(runRulesEngine, 5000); // Wait 5s on start before first run
  setInterval(runRulesEngine, 60 * 60 * 1000); // Run every hour
}
