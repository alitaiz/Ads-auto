// backend/helpers/amazon-api.js
import axios from 'axios';
import { URLSearchParams } from 'url';
import https from 'https'; // Import the native https module

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const ADS_API_ENDPOINT = 'https://advertising-api.amazon.com';

/**
 * Retrieves a new LWA access token.
 * This function now explicitly disables HTTP Keep-Alive to ensure a fresh,
 * uncorrupted connection to the authentication server for every request.
 * @returns {Promise<string>} A fresh, valid access token.
 */
export async function getAdsApiAccessToken() {
    // Moved destructuring from module scope to function scope to ensure .env is loaded first.
    const {
        ADS_API_CLIENT_ID,
        ADS_API_CLIENT_SECRET,
        ADS_API_REFRESH_TOKEN,
    } = process.env;

    if (!ADS_API_CLIENT_ID || !ADS_API_CLIENT_SECRET || !ADS_API_REFRESH_TOKEN) {
        throw new Error('Missing Amazon Ads API credentials in .env file.');
    }
    
    console.log("Requesting new Amazon Ads API access token with a fresh connection...");
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', ADS_API_REFRESH_TOKEN);
        params.append('client_id', ADS_API_CLIENT_ID);
        params.append('client_secret', ADS_API_CLIENT_SECRET);
        
        // Create a new agent that disables keep-alive. This is the core of the fix.
        const agent = new https.Agent({ keepAlive: false });

        const response = await axios.post(LWA_TOKEN_URL, params, { httpsAgent: agent });

        const data = response.data;
        console.log("Successfully obtained new Amazon Ads API access token.");
        return data.access_token.trim();

    } catch (error) {
        console.error("Error refreshing Amazon Ads API access token:", error.response?.data || error.message);
        throw new Error('Could not refresh Amazon Ads API access token. Please check your credentials.');
    }
}

/**
 * A wrapper for making authenticated requests to the Amazon Ads API.
 * This now forces a new, non-keep-alive connection for every request to
 * prevent any potential connection reuse issues that could corrupt headers.
 * @param {object} config - The configuration for the API request.
 * @param {string} config.method - The HTTP method (get, post, put, etc.).
 * @param {string} config.url - The API endpoint path (e.g., '/v2/profiles').
 * @param {string} [config.profileId] - The profile ID to be used in the scope header.
 * @param {object} [config.data] - The request body for POST/PUT requests.
 * @param {object} [config.headers] - Additional headers for the request.
 * @returns {Promise<any>} The data from the API response.
 */
export async function amazonAdsApiRequest({ method, url, profileId, data, headers = {} }) {
    try {
        const accessToken = await getAdsApiAccessToken();

        const defaultHeaders = {
            'Amazon-Advertising-API-ClientId': process.env.ADS_API_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`,
            ...headers
        };

        if (profileId) {
            defaultHeaders['Amazon-Advertising-API-Scope'] = profileId;
        }

        // Create a new agent for this specific request, disabling keep-alive.
        const agent = new https.Agent({ keepAlive: false });

        const response = await axios({
            method,
            url: `${ADS_API_ENDPOINT}${url}`,
            headers: defaultHeaders,
            data,
            httpsAgent: agent, // Use the new, non-keep-alive agent
        });

        return response.data;
    } catch (error) {
        console.error(`Amazon Ads API request failed for ${method.toUpperCase()} ${url}:`, error.response?.data || { message: error.message });
        // Re-throw a structured error for the caller to handle
        const errorDetails = error.response?.data || { message: error.message };
        const status = error.response?.status || 500;
        throw { status, details: errorDetails };
    }
}
