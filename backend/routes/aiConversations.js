// backend/routes/aiConversations.js
import express from 'express';
import pool from '../db.js';

const router = express.Router();

// GET /api/ai/conversations - List all conversations for a profile
router.get('/', async (req, res) => {
    const { profileId } = req.query;
    if (!profileId) {
        return res.status(400).json({ error: 'Profile ID is required.' });
    }
    try {
        const { rows } = await pool.query(
            'SELECT id, title, provider, updated_at FROM ai_copilot_conversations WHERE profile_id = $1 ORDER BY updated_at DESC',
            [profileId]
        );
        res.json(rows);
    } catch (error) {
        console.error('Failed to fetch conversation list:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/ai/conversations/:id - Get a single conversation's history
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await pool.query(
            'SELECT history, provider FROM ai_copilot_conversations WHERE id = $1',
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Conversation not found.' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error(`Failed to fetch conversation ${id}:`, error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/ai/conversations/:id - Delete a conversation
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM ai_copilot_conversations WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Conversation not found.' });
        }
        res.status(204).send(); // Success, no content
    } catch (error) {
        console.error(`Failed to delete conversation ${id}:`, error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
