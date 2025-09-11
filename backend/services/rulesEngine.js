// backend/services/rulesEngine.js
import pool from '../db.js';
import { amazonAdsApiRequest } from '../helpers/amazon-api.js';

async function evaluateBidAdjustmentRule(rule) {
  const { config, scope, profile_id } = rule;
  const campaignIds = scope.campaignIds || [];

  if (campaignIds.length === 0) {
    return { status: 'NO_ACTION', summary: 'Rule has no campaigns in scope.' };
  }
  
  if (config.strategyId && config.strategyId !== 'custom') {
      return evaluatePredefinedBidRule(rule);
  }

  // --- Logic for Custom Rules ---
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
    if (metrics.total_clicks < config.minClicks || !metrics.current_bid) continue;

    const acos = metrics.total_sales > 0 ? Number(metrics.total_spend) / Number(metrics.total_sales) : Infinity;
    let newBid = Number(metrics.current_bid);
    let action = null;

    if (acos > config.targetAcos) {
      action = 'DECREASE_BID';
      const bidChange = newBid * (config.bidDownPct / 100);
      const cappedChange = Math.min(bidChange, config.maxStep);
      if(cappedChange >= config.minStep) newBid -= cappedChange;
    } else if (acos > 0 && acos < config.targetAcos * (1 - (config.increaseThresholdPct || 50) / 100)) {
       action = 'INCREASE_BID';
       const bidChange = newBid * (config.bidUpPct / 100);
       const cappedChange = Math.min(bidChange, config.maxStep);
       if(cappedChange >= config.minStep) newBid += cappedChange;
    }
    
    newBid = Math.max(0.02, Number(newBid.toFixed(2)));
    if (action && newBid !== Number(metrics.current_bid)) {
      updates.push({ keywordId: metrics.keyword_id, bid: newBid });
    }
  }

  if (updates.length > 0) {
    await amazonAdsApiRequest({
      method: 'put', url: '/sp/keywords', profileId: profile_id,
      data: { keywords: updates },
    });
    return { status: 'SUCCESS', summary: `Adjusted ${updates.length} keyword bids.` };
  } else {
    return { status: 'NO_ACTION', summary: 'No keywords met the custom conditions.' };
  }
}

async function evaluatePredefinedBidRule(rule) {
    const { config, scope, profile_id } = rule;
    const campaignIds = scope.campaignIds || [];

    const metricsQuery = `
        WITH metrics_60d AS (
            SELECT
                keyword_id,
                SUM(COALESCE(spend, cost, 0)) AS spend_60d,
                SUM(COALESCE(sales_7d, seven_day_total_sales, 0)) AS sales_60d
            FROM sponsored_products_search_term_report
            WHERE campaign_id = ANY($1::bigint[]) AND report_date >= (CURRENT_DATE - '60 days'::interval)
            GROUP BY keyword_id
        ),
        metrics_14d AS (
            SELECT
                keyword_id,
                SUM(COALESCE(spend, cost, 0)) AS spend_14d,
                SUM(COALESCE(sales_7d, seven_day_total_sales, 0)) AS sales_14d
            FROM sponsored_products_search_term_report
            WHERE campaign_id = ANY($1::bigint[]) AND report_date >= (CURRENT_DATE - '14 days'::interval)
            GROUP BY keyword_id
        )
        SELECT
            k.keyword_id, k.current_bid,
            COALESCE(m60.spend_60d, 0)::float AS spend_60d,
            COALESCE(m60.sales_60d, 0)::float AS sales_60d,
            COALESCE(m14.spend_14d, 0)::float AS spend_14d,
            COALESCE(m14.sales_14d, 0)::float AS sales_14d
        FROM (
            SELECT keyword_id, MAX(keyword_bid) AS current_bid
            FROM sponsored_products_search_term_report
            WHERE campaign_id = ANY($1::bigint[]) AND keyword_bid IS NOT NULL
            GROUP BY keyword_id
        ) k
        LEFT JOIN metrics_60d m60 ON k.keyword_id = m60.keyword_id
        LEFT JOIN metrics_14d m14 ON k.keyword_id = m14.keyword_id;
    `;
    const { rows: keywordMetrics } = await pool.query(metricsQuery, [campaignIds]);
    
    const updates = [];
    for (const kw of keywordMetrics) {
        const acos60 = kw.sales_60d > 0 ? kw.spend_60d / kw.sales_60d : Infinity;
        const acos14 = kw.sales_14d > 0 ? kw.spend_14d / kw.sales_14d : Infinity;
        let adjustmentPct = 0;

        switch (config.strategyId) {
            case 'BID_RULE_1': if (kw.spend_60d > 20 && kw.sales_60d === 0) adjustmentPct = -25; break;
            case 'BID_RULE_2': if (kw.spend_60d > 20 && acos60 > 0.35 && acos14 > 0.35) adjustmentPct = -5; break;
            case 'BID_RULE_3': if (kw.sales_60d > 0 && kw.sales_14d === 0 && kw.spend_14d > 10) adjustmentPct = -3; break;
            case 'BID_RULE_4': if (acos60 < 0.20 && acos14 < 0.20) adjustmentPct = 3; break;
            case 'BID_RULE_5': if (acos60 < 0.15 && acos14 < 0.15) adjustmentPct = 3; break;
            case 'BID_RULE_6': if (acos60 > 0.20 && acos14 < 0.15) adjustmentPct = 3; break;
        }
        
        if (adjustmentPct !== 0) {
            let newBid = Number(kw.current_bid) * (1 + adjustmentPct / 100);
            newBid = Math.max(0.02, Number(newBid.toFixed(2)));
            if (newBid !== Number(kw.current_bid)) {
                 updates.push({ keywordId: kw.keyword_id, bid: newBid });
            }
        }
    }
    
    if (updates.length > 0) {
        await amazonAdsApiRequest({
            method: 'put', url: '/sp/keywords', profileId: profile_id,
            data: { keywords: updates }
        });
        return { status: 'SUCCESS', summary: `Strategy "${config.strategyId}": Adjusted ${updates.length} keyword bids.` };
    }
    return { status: 'NO_ACTION', summary: `Strategy "${config.strategyId}": No keywords met conditions.` };
}


async function evaluateSearchTermRule(rule) {
    const { config, scope, profile_id } = rule;
    const campaignIds = scope.campaignIds || [];
    if (campaignIds.length === 0) return { status: 'NO_ACTION', summary: 'Rule has no campaigns in scope.' };

    const metricsQuery = `
        WITH metrics_60d AS (
            SELECT customer_search_term, campaign_id, ad_group_id,
                   SUM(COALESCE(spend, cost, 0)) AS spend_60d,
                   SUM(COALESCE(sales_7d, seven_day_total_sales, 0)) AS sales_60d
            FROM sponsored_products_search_term_report
            WHERE campaign_id = ANY($1::bigint[]) AND report_date >= (CURRENT_DATE - '60 days'::interval)
            GROUP BY customer_search_term, campaign_id, ad_group_id
        ),
        metrics_14d AS (
            SELECT customer_search_term, campaign_id, ad_group_id,
                   SUM(COALESCE(spend, cost, 0)) AS spend_14d,
                   SUM(COALESCE(sales_7d, seven_day_total_sales, 0)) AS sales_14d
            FROM sponsored_products_search_term_report
            WHERE campaign_id = ANY($1::bigint[]) AND report_date >= (CURRENT_DATE - '14 days'::interval)
            GROUP BY customer_search_term, campaign_id, ad_group_id
        )
        SELECT m60.customer_search_term, m60.campaign_id, m60.ad_group_id,
               COALESCE(m60.spend_60d, 0)::float as spend_60d,
               COALESCE(m60.sales_60d, 0)::float as sales_60d,
               COALESCE(m14.spend_14d, 0)::float as spend_14d,
               COALESCE(m14.sales_14d, 0)::float as sales_14d
        FROM metrics_60d m60
        LEFT JOIN metrics_14d m14 ON m60.customer_search_term = m14.customer_search_term AND m60.campaign_id = m14.campaign_id AND m60.ad_group_id = m14.ad_group_id;
    `;
    const { rows: termMetrics } = await pool.query(metricsQuery, [campaignIds]);

    const negativesToAdd = [];
    for (const term of termMetrics) {
        const acos60 = term.sales_60d > 0 ? term.spend_60d / term.sales_60d : Infinity;
        let shouldNegate = false;
        
        switch (config.strategyId) {
            case 'ST_RULE_1': if (term.spend_60d > 15 && term.sales_60d === 0) shouldNegate = true; break;
            case 'ST_RULE_2': if (acos60 > 0.30 && term.spend_14d > 15 && term.sales_14d === 0) shouldNegate = true; break;
        }
        
        if (shouldNegate) {
            negativesToAdd.push({
                campaignId: term.campaign_id,
                adGroupId: term.ad_group_id,
                keywordText: term.customer_search_term,
                matchType: 'NEGATIVE_EXACT'
            });
        }
    }
    
    if (negativesToAdd.length > 0) {
        await amazonAdsApiRequest({
            method: 'post', url: '/api/amazon/negativeKeywords', profileId: profile_id,
            data: { negativeKeywords: negativesToAdd }
        });
        return { status: 'SUCCESS', summary: `Strategy "${config.strategyId}": Added ${negativesToAdd.length} negative keywords.` };
    }
    return { status: 'NO_ACTION', summary: `Strategy "${config.strategyId}": No search terms met conditions for negation.` };
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
      AND (last_run_at IS NULL OR last_run_at <= NOW() - (COALESCE(config->>'cooldownHours', '24') || ' hours')::INTERVAL)`;
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