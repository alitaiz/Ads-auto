import express from 'express';
import pool from '../db.js';

const router = express.Router();

router.get('/automation/rules', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM automation_rules ORDER BY id');
    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch automation rules', err);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

router.post('/automation/rules', async (req, res) => {
  const {
    name,
    campaign_id,
    profile_id,
    target_acos,
    min_clicks,
    bid_up_pct,
    bid_down_pct,
    lookback_days,
    cooldown_hours,
  } = req.body;

  try {
    const { rows } = await pool.query(
      `INSERT INTO automation_rules
       (name, campaign_id, profile_id, target_acos, min_clicks, bid_up_pct, bid_down_pct, lookback_days, cooldown_hours)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [name, campaign_id, profile_id, target_acos, min_clicks, bid_up_pct, bid_down_pct, lookback_days, cooldown_hours]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Failed to create automation rule', err);
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

router.get('/automation/logs', async (req, res) => {
  const { ruleId } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM automation_logs
       WHERE ($1::int IS NULL OR rule_id = $1)
       ORDER BY run_at DESC
       LIMIT 100`,
      [ruleId ? Number(ruleId) : null]
    );
    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch automation logs', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

export default router;
