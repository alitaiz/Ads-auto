// backend/helpers/amazon-api.js
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const {
    ADS_API_CLIENT_ID,
    ADS_API_CLIENT_SECRET,
    ADS_API_REFRESH_TOKEN,
} = process.env;

const TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const ADS_API_ENDPOINT = 'https://advertising-api.amazon.com';

// A simple in-memory cache for the access token
let accessTokenCache = {
    token: null,
    expiresAt: 0,
};

/**
 * Gets a valid Amazon Ads API Access Token, refreshing it if necessary.
 * @returns {Promise<string>} A valid access token.
 */
export async function getAdsApiAccessToken() {
    if (!ADS_API_CLIENT_ID || !ADS_API_REFRESH_TOKEN || !ADS_API_CLIENT_SECRET) {
        throw new Error('Missing Amazon Ads API credentials in .env file.');
    }

    if (accessTokenCache.token && Date.now() < accessTokenCache.expiresAt) {
        console.log("Using cached Amazon Ads API access token.");
        return accessTokenCache.token;
    }

    console.log("Requesting new Amazon Ads API access token...");
    try {
        const response = await axios.post(TOKEN_URL, new URLSearchParams({
            'grant_type': 'refresh_token',
            'refresh_token': ADS_API_REFRESH_TOKEN,
            'client_id': ADS_API_CLIENT_ID,
            'client_secret': ADS_API_CLIENT_SECRET,
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
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
 * Makes an authenticated request to the Amazon Ads API.
 * @param {object} config - The axios request config.
 * @param {string} config.method - The HTTP method (get, post, put).
 * @param {string} config.url - The API endpoint path (e.g., '/v2/profiles').
 * @param {string} config.profileId - The Amazon Ads Profile ID for the scope.
 * @param {object} [config.data] - The request body for POST/PUT requests.
 * @param {object} [config.headers] - Additional headers to merge.
 * @returns {Promise<any>} The data from the API response.
 */
export async function amazonAdsApiRequest({ method, url, profileId, data = null, headers = {} }) {
    const accessToken = await getAdsApiAccessToken();
    
    const finalHeaders = {
        'Amazon-Advertising-API-ClientId': ADS_API_CLIENT_ID,
        'Authorization': `Bearer ${accessToken}`,
        'Amazon-Advertising-API-Scope': profileId,
        'Content-Type': 'application/json',
        ...headers,
    };

    try {
        const response = await axios({
            method,
            url: `${ADS_API_ENDPOINT}${url}`,
            headers: finalHeaders,
            data,
        });
        return response.data;
    } catch (error) {
        const errorDetails = error.response?.data || { message: error.message };
        console.error(`Amazon Ads API Error on ${method.toUpperCase()} ${url}:`, JSON.stringify(errorDetails, null, 2));
        // Re-throw a structured error
        throw {
            status: error.response?.status || 500,
            details: errorDetails,
        };
    }
}
