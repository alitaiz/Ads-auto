// backend/helpers/amazon-api.js
import axios from 'axios';

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const ADS_API_ENDPOINT = 'https://advertising-api.amazon.com';

// In-memory cache for the access token to avoid unnecessary refreshes
let accessTokenCache = {
    token: null,
    expiresAt: 0,
};

/**
 * Retrieves a valid LWA (Login with Amazon) access token, refreshing if necessary.
 * This function is now backward-compatible, supporting both 'ADS_API_' and legacy 'AMAZON_' prefixes for .env variables.
 * @returns {Promise<string>} A valid access token.
 */
export async function getAdsApiAccessToken() {
    // Support both new (ADS_API_) and legacy (AMAZON_) naming conventions for credentials.
    const clientId = process.env.ADS_API_CLIENT_ID || process.env.AMAZON_CLIENT_ID;
    const clientSecret = process.env.ADS_API_CLIENT_SECRET || process.env.AMAZON_CLIENT_SECRET;
    const refreshToken = process.env.ADS_API_REFRESH_TOKEN || process.env.AMAZON_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        // The error message guides the user to the current standard variable names.
        throw new Error('Missing Amazon Ads API credentials in .env file. Please ensure ADS_API_CLIENT_ID, ADS_API_CLIENT_SECRET, and ADS_API_REFRESH_TOKEN are set.');
    }

    // If we have a valid token in cache, return it
    if (accessTokenCache.token && Date.now() < accessTokenCache.expiresAt) {
        console.log("Using cached Amazon Ads API access token.");
        return accessTokenCache.token;
    }

    console.log("Requesting new Amazon Ads API access token...");
    try {
        const response = await axios.post(LWA_TOKEN_URL, new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const data = response.data;
        accessTokenCache = {
            token: data.access_token,
            // Cache token for 55 minutes (it expires in 60)
            expiresAt: Date.now() + 55 * 60 * 1000,
        };
        console.log("Successfully obtained and cached new Amazon Ads API access token.");
        return accessTokenCache.token;
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
        // Ensure we use the same logic to get the client ID for the header.
        const clientId = process.env.ADS_API_CLIENT_ID || process.env.AMAZON_CLIENT_ID;

        if (!clientId) {
             throw new Error('Missing Amazon Ads API Client ID in .env file.');
        }
        
        const defaultHeaders = {
            'Amazon-Advertising-API-ClientId': clientId,
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
        console.error(`Amazon Ads API request failed for ${method.toUpperCase()} ${url}:`, error.response?.data || error.message);
        // Re-throw a structured error for the caller to handle
        const errorDetails = error.response?.data || { message: error.message };
        const status = error.response?.status || 500;
        throw { status, details: errorDetails };
    }
}