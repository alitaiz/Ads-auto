// backend/services/rulesEngine.js
import pool from '../db.js';
import { amazonAdsApiRequest } from '../helpers/amazon-api.js';

async function evaluateRule(rule) {
  const metricsQuery = `
    SELECT keyword_id,
           MAX(keyword_bid) AS current_bid,
           SUM(cost) AS spend,
           SUM(clicks) AS clicks,
           SUM(attributed_sales_14d) AS sales
    FROM sponsored_products_search_term_report
    WHERE campaign_id = $1
      AND report_date >= (CURRENT_DATE - $2::INT)
    GROUP BY keyword_id`;

  const { rows } = await pool.query(metricsQuery, [rule.campaign_id, rule.lookback_days]);
  const updates = [];

  for (const row of rows) {
    if (row.clicks < rule.min_clicks) continue;
    const acos = row.sales > 0 ? Number(row.spend) / Number(row.sales) : Infinity;
    let newBid = Number(row.current_bid);
    let action = null;

    if (acos > rule.target_acos) {
      newBid = newBid * (1 - rule.bid_down_pct / 100);
      action = 'decrease';
    } else if (acos < rule.target_acos * 0.5) {
      newBid = newBid * (1 + rule.bid_up_pct / 100);
      action = 'increase';
    }

    newBid = Math.max(0.02, Number(newBid.toFixed(2)));
    if (action && newBid !== row.current_bid) {
      updates.push({
        keywordId: row.keyword_id,
        bid: newBid,
        previous_bid: row.current_bid,
        action,
        acos,
      });
    }
  }

  if (updates.length) {
    await amazonAdsApiRequest({
      method: 'put',
      url: '/sp/keywords',
      profileId: rule.profile_id,
      data: { keywords: updates.map(u => ({ keywordId: u.keywordId, bid: u.bid })) },
    });

    for (const u of updates) {
      await pool.query(
        `INSERT INTO automation_logs(rule_id, keyword_id, previous_bid, new_bid, action, details)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [rule.id, u.keywordId, u.previous_bid, u.bid, u.action, JSON.stringify({ acos: u.acos })]
      );
    }
  }

  await pool.query('UPDATE automation_rules SET last_run_at = NOW() WHERE id = $1', [rule.id]);
}

export async function runRulesEngine() {
  const query = `
    SELECT * FROM automation_rules
    WHERE is_active = TRUE
      AND (last_run_at IS NULL OR last_run_at <= NOW() - (cooldown_hours || ' hours')::INTERVAL)`;
  const { rows } = await pool.query(query);
  for (const rule of rows) {
    try {
      await evaluateRule(rule);
    } catch (err) {
      console.error('Automation rule failed', rule.id, err);
    }
  }
}

export function startRulesEngine() {
  runRulesEngine();
  setInterval(runRulesEngine, 60 * 60 * 1000); // hourly
}
