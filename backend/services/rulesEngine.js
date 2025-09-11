// backend/services/rulesEngine.js
import pool from '../db.js';
import { amazonAdsApiRequest } from '../helpers/amazon-api.js';

async function evaluateBidAdjustmentRule(rule) {
  const { config, scope, profile_id } = rule;
  const campaignIds = scope.campaignIds || [];

  if (campaignIds.length === 0) {
    return { status: 'NO_ACTION', summary: 'Rule has no campaigns in scope.' };
  }
  
  const allConditions = config.conditionGroups.flat();
  const timeWindows = [...new Set(allConditions.map(c => c.timeWindow))];
  let metricsQuery = `
    SELECT
        k.keyword_id,
        k.current_bid
  `;
  const joins = [];

  timeWindows.forEach(tw => {
    metricsQuery += `
      , COALESCE(m${tw}.spend, 0)::float AS spend_${tw}d
      , COALESCE(m${tw}.sales, 0)::float AS sales_${tw}d
      , COALESCE(m${tw}.orders, 0)::bigint AS orders_${tw}d
      , COALESCE(m${tw}.clicks, 0)::bigint AS clicks_${tw}d
    `;
    joins.push(`
      LEFT JOIN (
        SELECT
            keyword_id,
            SUM(COALESCE(spend, cost, 0)) AS spend,
            SUM(COALESCE(sales_7d, seven_day_total_sales, 0)) AS sales,
            SUM(COALESCE(purchases_7d, seven_day_total_orders, 0)) AS orders,
            SUM(clicks) AS clicks
        FROM sponsored_products_search_term_report
        WHERE campaign_id = ANY($1::bigint[]) AND report_date >= (CURRENT_DATE - '${tw} days'::interval)
        GROUP BY keyword_id
      ) m${tw} ON k.keyword_id = m${tw}.keyword_id
    `);
  });

  metricsQuery += `
    FROM (
        SELECT keyword_id, MAX(keyword_bid) AS current_bid
        FROM sponsored_products_search_term_report
        WHERE campaign_id = ANY($1::bigint[]) AND keyword_bid IS NOT NULL
        GROUP BY keyword_id
    ) k
    ${joins.join('\n')}
  `;

  const { rows: keywordMetrics } = await pool.query(metricsQuery, [campaignIds]);
  const updates = [];

  for (const kw of keywordMetrics) {
    let isRuleTriggered = false;
    for (const group of config.conditionGroups) {
      let allConditionsInGroupMet = true;
      for (const condition of group) {
        const spend = kw[`spend_${condition.timeWindow}d`];
        const sales = kw[`sales_${condition.timeWindow}d`];
        const orders = kw[`orders_${condition.timeWindow}d`];
        const clicks = kw[`clicks_${condition.timeWindow}d`];
        // Handle ACOS: if sales are zero, ACOS is effectively infinite for ">" checks, and 0 for "<" checks
        const acos = sales > 0 ? spend / sales : (condition.operator === '>' ? Infinity : 0);

        let metricValue;
        switch (condition.metric) {
            case 'spend': metricValue = spend; break;
            case 'sales': metricValue = sales; break;
            case 'acos': metricValue = acos; break;
            case 'orders': metricValue = orders; break;
            case 'clicks': metricValue = clicks; break;
        }

        let conditionMet = false;
        switch (condition.operator) {
            case '>': conditionMet = metricValue > condition.value; break;
            case '<': conditionMet = metricValue < condition.value; break;
            case '=': conditionMet = metricValue === condition.value; break;
        }

        if (!conditionMet) {
            allConditionsInGroupMet = false;
            break; // This AND group fails
        }
      }
      if (allConditionsInGroupMet) {
        isRuleTriggered = true;
        break; // This OR group is met, no need to check others
      }
    }

    if (isRuleTriggered) {
      const adjustmentPct = config.action.value || 0;
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
      data: { keywords: updates },
    });
    return { status: 'SUCCESS', summary: `Adjusted ${updates.length} keyword bids.` };
  } else {
    return { status: 'NO_ACTION', summary: 'No keywords met all conditions.' };
  }
}


async function evaluateSearchTermRule(rule) {
    const { config, scope, profile_id } = rule;
    const campaignIds = scope.campaignIds || [];
    if (campaignIds.length === 0) return { status: 'NO_ACTION', summary: 'Rule has no campaigns in scope.' };
    
    const allConditions = config.conditionGroups.flat();
    const timeWindows = [...new Set(allConditions.map(c => c.timeWindow))];
    let metricsQuery = `
        SELECT
            st.customer_search_term,
            st.campaign_id,
            st.ad_group_id
    `;
    const joins = [];
    
    timeWindows.forEach(tw => {
        metricsQuery += `
            , COALESCE(m${tw}.spend, 0)::float AS spend_${tw}d
            , COALESCE(m${tw}.sales, 0)::float AS sales_${tw}d
            , COALESCE(m${tw}.orders, 0)::bigint AS orders_${tw}d
            , COALESCE(m${tw}.clicks, 0)::bigint AS clicks_${tw}d
        `;
        joins.push(`
            LEFT JOIN (
                SELECT customer_search_term, campaign_id, ad_group_id,
                    SUM(COALESCE(spend, cost, 0)) AS spend,
                    SUM(COALESCE(sales_7d, seven_day_total_sales, 0)) AS sales,
                    SUM(COALESCE(purchases_7d, seven_day_total_orders, 0)) AS orders,
                    SUM(clicks) AS clicks
                FROM sponsored_products_search_term_report
                WHERE campaign_id = ANY($1::bigint[]) AND report_date >= (CURRENT_DATE - '${tw} days'::interval)
                GROUP BY customer_search_term, campaign_id, ad_group_id
            ) m${tw} ON st.customer_search_term = m${tw}.customer_search_term AND st.campaign_id = m${tw}.campaign_id AND st.ad_group_id = m${tw}.ad_group_id
        `);
    });

    metricsQuery += `
        FROM (
            SELECT DISTINCT customer_search_term, campaign_id, ad_group_id
            FROM sponsored_products_search_term_report
            WHERE campaign_id = ANY($1::bigint[])
        ) st
        ${joins.join('\n')}
    `;

    const { rows: termMetrics } = await pool.query(metricsQuery, [campaignIds]);
    const negativesToAdd = [];
    
    for (const term of termMetrics) {
        let isRuleTriggered = false;
        for (const group of config.conditionGroups) {
            let allConditionsInGroupMet = true;
            for (const condition of group) {
                const spend = term[`spend_${condition.timeWindow}d`];
                const sales = term[`sales_${condition.timeWindow}d`];
                const orders = term[`orders_${condition.timeWindow}d`];
                const clicks = term[`clicks_${condition.timeWindow}d`];
                const acos = sales > 0 ? spend / sales : (condition.operator === '>' ? Infinity : 0);

                let metricValue;
                switch (condition.metric) {
                    case 'spend': metricValue = spend; break;
                    case 'sales': metricValue = sales; break;
                    case 'acos': metricValue = acos; break;
                    case 'orders': metricValue = orders; break;
                    case 'clicks': metricValue = clicks; break;
                }

                let conditionMet = false;
                switch (condition.operator) {
                    case '>': conditionMet = metricValue > condition.value; break;
                    case '<': conditionMet = metricValue < condition.value; break;
                    case '=': conditionMet = metricValue === condition.value; break;
                }
                if (!conditionMet) {
                    allConditionsInGroupMet = false;
                    break;
                }
            }
             if (allConditionsInGroupMet) {
                isRuleTriggered = true;
                break;
            }
        }

        if (isRuleTriggered) {
            negativesToAdd.push({
                campaignId: term.campaign_id,
                adGroupId: term.ad_group_id,
                keywordText: term.customer_search_term,
                matchType: config.action.matchType || 'NEGATIVE_EXACT',
            });
        }
    }
    
    if (negativesToAdd.length > 0) {
        await amazonAdsApiRequest({
            method: 'post',
            url: '/sp/negativeKeywords',
            profileId: profile_id,
            data: { negativeKeywords: negativesToAdd }
        });
        return { status: 'SUCCESS', summary: `Added ${negativesToAdd.length} negative keywords.` };
    }
    return { status: 'NO_ACTION', summary: `No search terms met conditions for negation.` };
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
      AND (last_run_at IS NULL OR last_run_at <= NOW() - '1 hour'::INTERVAL)`;
      // Simple 1-hour cooldown for all rules to prevent rapid re-evaluation.
      // A per-rule cooldown could be added to the config if needed.
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