// backend/helpers/keyManager.js
import pool from '../db.js';

const KEY_USAGE_LIMIT = 10;

/**
 * Retrieves the next available and active API key for a given service,
 * handling rotation and usage count resets atomically.
 * @param {string} service - The name of the service (e.g., 'gemini').
 * @returns {Promise<string>} A valid API key.
 * @throws {Error} If no active keys are available for the service.
 */
export const getApiKey = async (service) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Find an active key that hasn't reached its usage limit.
        // Lock the row for update to prevent race conditions from concurrent requests.
        let keyResult = await client.query(
            `SELECT id, api_key FROM api_keys 
             WHERE service = $1 AND is_active = TRUE AND usage_count < $2 
             ORDER BY last_used_at ASC, id ASC 
             LIMIT 1 FOR UPDATE;`,
            [service, KEY_USAGE_LIMIT]
        );

        if (keyResult.rows.length === 0) {
            // All keys have reached their limit, so reset them all.
            console.log(`[KeyManager] All keys for '${service}' reached usage limit. Resetting counts.`);
            await client.query(
                'UPDATE api_keys SET usage_count = 0 WHERE service = $1 AND is_active = TRUE;',
                [service]
            );

            // After resetting, fetch the first available key again.
            keyResult = await client.query(
                `SELECT id, api_key FROM api_keys 
                 WHERE service = $1 AND is_active = TRUE AND usage_count < $2 
                 ORDER BY last_used_at ASC, id ASC 
                 LIMIT 1 FOR UPDATE;`,
                [service, KEY_USAGE_LIMIT]
            );

            if (keyResult.rows.length === 0) {
                throw new Error(`No active API keys found for service '${service}' after reset.`);
            }
        }

        const { id, api_key } = keyResult.rows[0];

        // Increment the usage count and update the last used timestamp for the selected key.
        await client.query(
            'UPDATE api_keys SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id = $1;',
            [id]
        );

        await client.query('COMMIT');
        
        console.log(`[KeyManager] Providing key ID ${id} for service '${service}'.`);
        return api_key;

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[KeyManager] Error during API key retrieval and rotation:', error);
        throw new Error(`Could not retrieve API key for service '${service}'. Please check database and key configuration.`);
    } finally {
        client.release();
    }
};
