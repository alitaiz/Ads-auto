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
  const updates = req.body;

  try {
    // 1. Fetch the current rule from the database to prevent accidental data loss from partial updates.
    const existingResult = await pool.query('SELECT * FROM automation_rules WHERE id = $1', [id]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    const existingRule = existingResult.rows[0];

    // 2. Merge the provided updates onto the existing rule data.
    //    This ensures that any fields not sent in the request body are not overwritten.
    const mergedRule = {
      name: updates.name ?? existingRule.name,
      config: updates.config ?? existingRule.config,
      scope: updates.scope ?? existingRule.scope,
      is_active: typeof updates.is_active === 'boolean' ? updates.is_active : existingRule.is_active,
    };

    // 3. Perform the update using the complete, merged data.
    const { rows } = await pool.query(
      `UPDATE automation_rules
       SET name = $1, config = $2, scope = $3, is_active = $4
       WHERE id = $5
       RETURNING *`,
      [mergedRule.name, mergedRule.config, mergedRule.scope, mergedRule.is_active, id]
    );
    
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
        conditions.push(`l.details->'actions_by_campaign' ? $${params.length}`);
    }
    
    if (conditions.length > 0) {
        queryText += ' WHERE ' + conditions.join(' AND ');
    }
    
    queryText += ' ORDER BY l.run_at DESC LIMIT 200';

    const { rows } = await pool.query(queryText, params);
    
    if (campaignId) {
        const campaignSpecificLogs = rows.map(log => {
            if (!log.details || !log.details.actions_by_campaign || !log.details.actions_by_campaign[campaignId]) {
                return null;
            }
            
            const campaignActions = log.details.actions_by_campaign[campaignId];
            
            if (campaignActions) {
                const changeCount = campaignActions.changes?.length || 0;
                const negativeCount = campaignActions.newNegatives?.length || 0;
                
                let summary;
                if (log.status === 'NO_ACTION') {
                    summary = log.summary; // Use the summary from the log entry itself
                } else {
                    const summaryParts = [];
                    if (changeCount > 0) summaryParts.push(`Performed ${changeCount} bid adjustment(s)`);
                    if (negativeCount > 0) summaryParts.push(`Created ${negativeCount} new negative keyword(s)`);
                    summary = summaryParts.length > 0 ? summaryParts.join(' and ') + '.' : 'No changes were made for this campaign.';
                }

                return {
                    ...log,
                    summary,
                    details: campaignActions 
                };
            }
            return null;
        }).filter(Boolean);

        return res.json(campaignSpecificLogs);
    }

    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch automation logs', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

export default router;