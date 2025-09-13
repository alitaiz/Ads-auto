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
  const { ruleId, campaignId } = req.query;
  try {
    let queryText = `
        SELECT r.name as rule_name, l.* FROM automation_logs l
        LEFT JOIN automation_rules r ON l.rule_id = r.id
    `;
    const conditions = [];
    const params = [];

    if (ruleId) {
        params.push(Number(ruleId));
        conditions.push(`l.rule_id = $${params.length}`);
    }
    
    if (campaignId) {
        params.push(campaignId);
        // FIX: This is the critical change. Instead of checking the rule's current scope,
        // we check if the campaignId exists as a key within the 'actions_by_campaign' object
        // in the historical log's `details` column. This decouples the log history from
        // the current rule configuration.
        conditions.push(`l.details->'actions_by_campaign' ? $${params.length}`);
    }
    
    if (conditions.length > 0) {
        queryText += ' WHERE ' + conditions.join(' AND ');
    }
    
    queryText += ' ORDER BY l.run_at DESC LIMIT 200';

    const { rows } = await pool.query(queryText, params);
    
    // This post-processing is still necessary to extract only the relevant parts for the specific campaign.
    if (campaignId) {
        const campaignSpecificLogs = rows.map(log => {
            // Check if the log details and the specific campaign actions exist
            if (!log.details || !log.details.actions_by_campaign || !log.details.actions_by_campaign[campaignId]) {
                return null;
            }
            
            const campaignActions = log.details.actions_by_campaign[campaignId];
            
            if (campaignActions && (campaignActions.changes?.length > 0 || campaignActions.newNegatives?.length > 0)) {
                const changeCount = campaignActions.changes?.length || 0;
                const negativeCount = campaignActions.newNegatives?.length || 0;
                
                return {
                    ...log,
                    // Create a more specific summary for the frontend
                    summary: `Performed ${changeCount} bid adjustment(s) and created ${negativeCount} negative keyword(s).`,
                    // The details should now ONLY contain the actions for this campaign
                    details: campaignActions 
                };
            }
            return null;
        }).filter(Boolean); // Filter out the nulls

        return res.json(campaignSpecificLogs);
    }

    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch automation logs', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

export default router;