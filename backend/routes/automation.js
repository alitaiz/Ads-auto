import express from 'express';
import pool from '../db.js';

const router = express.Router();

// GET all rules
router.get('/automation/rules', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM automation_rules ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch automation rules', err);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

// POST a new rule
router.post('/automation/rules', async (req, res) => {
  const { name, rule_type, config, scope, profile_id, is_active } = req.body;

  if (!name || !rule_type || !config || !scope || !profile_id) {
    return res.status(400).json({ error: 'Missing required fields for automation rule.' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO automation_rules (name, rule_type, config, scope, profile_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, rule_type, config, scope, profile_id, is_active ?? true]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Failed to create automation rule', err);
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

// PUT (update) an existing rule
router.put('/automation/rules/:id', async (req, res) => {
  const { id } = req.params;
  const { name, config, scope, is_active } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE automation_rules
       SET name = $1, config = $2, scope = $3, is_active = $4
       WHERE id = $5
       RETURNING *`,
      [name, config, scope, is_active, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(`Failed to update automation rule ${id}`, err);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});


// DELETE a rule
router.delete('/automation/rules/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM automation_rules WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Rule not found' });
        }
        res.status(204).send(); // No Content
    } catch (err) {
        console.error(`Failed to delete rule ${id}`, err);
        res.status(500).json({ error: 'Failed to delete rule' });
    }
});


// GET logs
router.get('/automation/logs', async (req, res) => {
  const { ruleId } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT r.name as rule_name, l.* FROM automation_logs l
       LEFT JOIN automation_rules r ON l.rule_id = r.id
       WHERE ($1::int IS NULL OR rule_id = $1)
       ORDER BY run_at DESC
       LIMIT 200`,
      [ruleId ? Number(ruleId) : null]
    );
    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch automation logs', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

export default router;