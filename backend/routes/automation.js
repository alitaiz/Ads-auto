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
  const { name, rule_type, ad_type, config, scope, profile_id, is_active } = req.body;

  if (!name || !rule_type || !config || !scope || !profile_id) {
    return res.status(400).json({ error: 'Missing required fields for automation rule.' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO automation_rules (name, rule_type, ad_type, config, scope, profile_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, rule_type, ad_type || 'SP', config, scope, profile_id, is_active ?? true]
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
    const { rows: existingRows } = await pool.query('SELECT * FROM automation_rules WHERE id = $1', [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    const existingRule = existingRows[0];

    // 2. Merge the provided updates onto the existing rule data safely.
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
        LEFT JOIN automation_rules r ON l.rule_id = r.id AND l.rule_source = 'automation_rules'
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
    
    // --- Enrich logs with campaign names ---
    const allCampaignIds = new Set();
    rows.forEach(log => {
        if (log.details && log.details.actions_by_campaign) {
            Object.keys(log.details.actions_by_campaign).forEach(id => allCampaignIds.add(id));
        }
    });

    if (allCampaignIds.size > 0) {
        const campaignIdArray = Array.from(allCampaignIds);
        try {
            const namesResult = await pool.query(`
                SELECT DISTINCT ON (campaign_id)
                    campaign_id::text,
                    campaign_name
                FROM sponsored_products_search_term_report
                WHERE campaign_id::text = ANY($1::text[]) AND campaign_name IS NOT NULL
                ORDER BY campaign_id, report_date DESC;
            `, [campaignIdArray]);
            
            const campaignNameMap = new Map();
            namesResult.rows.forEach(row => {
                campaignNameMap.set(row.campaign_id, row.campaign_name);
            });

            rows.forEach(log => {
                if (log.details && log.details.actions_by_campaign) {
                    for (const id in log.details.actions_by_campaign) {
                        if (campaignNameMap.has(id)) {
                            log.details.actions_by_campaign[id].campaignName = campaignNameMap.get(id);
                        }
                    }
                }
            });
        } catch (nameError) {
            console.error("Could not enrich logs with campaign names:", nameError);
        }
    }
    // --- End Enrichment ---

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
                    summary = log.summary;
                } else {
                    const summaryParts = [];
                    if (changeCount > 0) summaryParts.push(`Performed ${changeCount} bid adjustment(s)`);
                    if (negativeCount > 0) summaryParts.push(`Created ${negativeCount} new negative keyword(s)`);
                    summary = summaryParts.length > 0 ? summaryParts.join(' and ') + '.' : 'No changes were made for this campaign.';
                }

                const newDetails = {
                    ...campaignActions,
                    data_date_range: log.details.data_date_range
                };

                return {
                    ...log,
                    summary,
                    details: newDetails
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

// --- Campaign Creation Rules CRUD ---

// GET all campaign creation rules for a profile
router.get('/automation/campaign-creation-rules', async (req, res) => {
    const { profileId } = req.query;
    if (!profileId) return res.status(400).json({ error: 'Profile ID is required.' });
    try {
        const { rows } = await pool.query('SELECT * FROM campaign_creation_rules WHERE profile_id = $1 ORDER BY created_at DESC', [profileId]);
        res.json(rows);
    } catch (err) {
        console.error('Failed to fetch campaign creation rules', err);
        res.status(500).json({ error: 'Failed to fetch schedules' });
    }
});

// GET history for a specific campaign creation rule
router.get('/automation/campaign-creation-rules/:id/history', async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query(
            `SELECT run_at, status, details 
             FROM automation_logs 
             WHERE rule_id = $1 AND rule_source = 'campaign_creation_rules' 
             ORDER BY run_at DESC`,
            [id]
        );
        res.json(rows);
    } catch (err) {
        console.error(`Failed to fetch history for campaign creation rule ${id}`, err);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});


// POST a new campaign creation rule
router.post('/automation/campaign-creation-rules', async (req, res) => {
    const { name, profile_id, is_active, frequency, creation_parameters, associated_rule_ids } = req.body;
    if (!name || !profile_id || !frequency || !creation_parameters) {
        return res.status(400).json({ error: 'Missing required fields for schedule.' });
    }
    try {
        const { rows } = await pool.query(
            `INSERT INTO campaign_creation_rules (name, profile_id, is_active, frequency, creation_parameters, associated_rule_ids)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [name, profile_id, is_active ?? true, frequency, creation_parameters, JSON.stringify(associated_rule_ids || [])]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Failed to create campaign creation rule', err);
        res.status(500).json({ error: 'Failed to create schedule' });
    }
});

// PUT (update) an existing campaign creation rule
router.put('/automation/campaign-creation-rules/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    try {
        const { rows: existing } = await pool.query('SELECT * FROM campaign_creation_rules WHERE id = $1', [id]);
        if (existing.length === 0) return res.status(404).json({ error: 'Schedule not found' });
        
        const merged = { ...existing[0], ...updates };
        const { name, is_active, frequency, creation_parameters, associated_rule_ids } = merged;

        const { rows } = await pool.query(
            `UPDATE campaign_creation_rules SET name = $1, is_active = $2, frequency = $3, creation_parameters = $4, associated_rule_ids = $5
             WHERE id = $6 RETURNING *`,
            [name, is_active, frequency, creation_parameters, JSON.stringify(associated_rule_ids || []), id]
        );
        res.json(rows[0]);
    } catch (err) {
        console.error(`Failed to update schedule ${id}`, err);
        res.status(500).json({ error: 'Failed to update schedule' });
    }
});

// DELETE a campaign creation rule
router.delete('/automation/campaign-creation-rules/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM campaign_creation_rules WHERE id = $1', [id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Schedule not found' });
        res.status(204).send();
    } catch (err) {
        console.error(`Failed to delete schedule ${id}`, err);
        res.status(500).json({ error: 'Failed to delete schedule' });
    }
});

export default router;