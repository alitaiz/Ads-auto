// backend/helpers/amazon-api.js
import axios from 'axios';
import { URLSearchParams } from 'url';
import https from 'https';

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const ADS_API_ENDPOINT = 'https://advertising-api.amazon.com';

// Simple in-memory cache for the access token to avoid excessive refreshes.
let adsApiTokenCache = {
    token: null,
    expiresAt: 0,
};

/**
 * Retrieves a valid LWA access token, using a cache to avoid unnecessary refreshes.
 * @returns {Promise<string>} A valid access token.
 */
export async function getAdsApiAccessToken() {
    // Check cache first
    if (adsApiTokenCache.token && Date.now() < adsApiTokenCache.expiresAt) {
        console.log("[Auth] Using cached Amazon Ads API access token.");
        return adsApiTokenCache.token;
    }

    console.log("[Auth] Cached token is invalid or expired. Requesting a new one...");
    
    const {
        ADS_API_CLIENT_ID,
        ADS_API_CLIENT_SECRET,
        ADS_API_REFRESH_TOKEN,
    } = process.env;

    if (!ADS_API_CLIENT_ID || !ADS_API_CLIENT_SECRET || !ADS_API_REFRESH_TOKEN) {
        throw new Error('Missing Amazon Ads API credentials in .env file.');
    }
    
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', ADS_API_REFRESH_TOKEN);
        params.append('client_id', ADS_API_CLIENT_ID);
        params.append('client_secret', ADS_API_CLIENT_SECRET);
        
        // Disabling keep-alive on the token endpoint can help prevent some intermittent connection errors.
        const agent = new https.Agent({ keepAlive: false });

        const response = await axios.post(LWA_TOKEN_URL, params, { httpsAgent: agent });

        const data = response.data;
        
        adsApiTokenCache = {
            token: data.access_token.trim(),
            // Cache for 55 minutes (token is valid for 60 minutes)
            expiresAt: Date.now() + 55 * 60 * 1000,
        };

        console.log("[Auth] Successfully obtained and cached new Amazon Ads API access token.");
        return adsApiTokenCache.token;

    } catch (error) {
        // Clear the cache on a failed refresh attempt.
        adsApiTokenCache = { token: null, expiresAt: 0 };
        console.error("[Auth] Error refreshing Amazon Ads API access token:", error.response?.data || error.message);
        throw new Error('Could not refresh Amazon Ads API access token. Please check your credentials.');
    }
}

/**
 * A wrapper for making authenticated requests to the Amazon Ads API.
 * This is more efficient as it relies on the cached access token.
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

        const response = await axios({
            method,
            url: `${ADS_API_ENDPOINT}${url}`,
            headers: defaultHeaders,
            data,
        });

        return response.data;
    } catch (error) {
        console.error(`Amazon Ads API request failed for ${method.toUpperCase()} ${url}:`, error.response?.data || { message: error.message });
        const errorDetails = error.response?.data || { message: error.message };
        const status = error.response?.status || 500;
        throw { status, details: errorDetails };
    }
}