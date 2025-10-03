// backend/helpers/keySync.js
import pool from '../db.js';

const SERVICE_NAME = 'gemini';

/**
 * Synchronizes the Gemini API keys from the .env file with the api_keys table in the database.
 * - Adds new keys from .env that are not in the DB.
 * - Removes keys from the DB that are no longer in the .env file.
 */
export const syncGeminiKeys = async () => {
    const envKeyString = process.env.GEMINI_API_KEYS;
    if (!envKeyString) {
        console.log('[KeySync] No GEMINI_API_KEYS found in .env file. Skipping sync.');
        return;
    }

    const envKeys = envKeyString.split(',').map(k => k.trim()).filter(Boolean);
    if (envKeys.length === 0) {
        console.log('[KeySync] GEMINI_API_KEYS variable is empty. Skipping sync.');
        return;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get all current Gemini keys from the database
        const dbResult = await client.query(
            'SELECT api_key FROM api_keys WHERE service = $1',
            [SERVICE_NAME]
        );
        const dbKeys = dbResult.rows.map(r => r.api_key);

        const envKeySet = new Set(envKeys);
        const dbKeySet = new Set(dbKeys);

        // --- Step 1: Add new keys ---
        const keysToAdd = envKeys.filter(k => !dbKeySet.has(k));
        if (keysToAdd.length > 0) {
            const insertQuery = 'INSERT INTO api_keys (service, api_key) VALUES ($1, $2)';
            for (const key of keysToAdd) {
                await client.query(insertQuery, [SERVICE_NAME, key]);
            }
            console.log(`[KeySync] Added ${keysToAdd.length} new Gemini key(s) to the database.`);
        }

        // --- Step 2: Remove stale keys ---
        const keysToRemove = dbKeys.filter(k => !envKeySet.has(k));
        if (keysToRemove.length > 0) {
            const deleteQuery = 'DELETE FROM api_keys WHERE service = $1 AND api_key = ANY($2::text[])';
            await client.query(deleteQuery, [SERVICE_NAME, keysToRemove]);
            console.log(`[KeySync] Removed ${keysToRemove.length} stale Gemini key(s) from the database.`);
        }

        await client.query('COMMIT');
        
        if (keysToAdd.length === 0 && keysToRemove.length === 0) {
            console.log('[KeySync] All Gemini keys in .env are in sync with the database.');
        } else {
            console.log('[KeySync] Finished syncing Gemini API keys.');
        }

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[KeySync] Error syncing API keys from .env to database:', error);
        throw error; // Re-throw to prevent server from starting in a bad state
    } finally {
        client.release();
    }
};
