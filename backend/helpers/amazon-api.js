// backend/helpers/amazon-api.js
import axios from 'axios';
import { URLSearchParams } from 'url';

// Configuration from environment variables
const {
    ADS_API_CLIENT_ID,
    ADS_API_CLIENT_SECRET,
    ADS_API_REFRESH_TOKEN,
} = process.env;

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const ADS_API_ENDPOINT = 'https://advertising-api.amazon.com';

/**
 * Retrieves a new, valid LWA (Login with Amazon) access token for every request.
 * This function intentionally avoids caching to prevent token reuse issues.
 * @returns {Promise<string>} A fresh, valid access token.
 */
export async function getAdsApiAccessToken() {
    if (!ADS_API_CLIENT_ID || !ADS_API_CLIENT_SECRET || !ADS_API_REFRESH_TOKEN) {
        throw new Error('Missing Amazon Ads API credentials in .env file.');
    }
    
    console.log("Requesting new Amazon Ads API access token for every request...");
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', ADS_API_REFRESH_TOKEN);
        params.append('client_id', ADS_API_CLIENT_ID);
        params.append('client_secret', ADS_API_CLIENT_SECRET);
        
        const response = await axios.post(LWA_TOKEN_URL, params);

        const data = response.data;
        console.log("Successfully obtained new Amazon Ads API access token.");
        // Return the new token directly without caching.
        return data.access_token.trim();

    } catch (error) {
        console.error("Error refreshing Amazon Ads API access token:", error.response?.data || error.message);
        throw new Error('Could not refresh Amazon Ads API access token. Please check your credentials.');
    }
}

/**
 * A wrapper function for making authenticated requests to the Amazon Ads API.
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
            'Amazon-Advertising-API-ClientId': ADS_API_CLIENT_ID,
            'Authorization': `Bearer ${accessToken}`,
            ...headers
        };

        // Add the profile scope header ONLY if a profileId is provided.
        if (profileId) {
            defaultHeaders['Amazon-Advertising-API-Scope'] = profileId;
        }

        const response = await axios({
            method,
            url: `${ADS_API_ENDPOINT}${url}`,
            headers: defaultHeaders,
            data,
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