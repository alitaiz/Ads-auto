// backend/helpers/amazon-api.js
import axios from 'axios';
import { URLSearchParams } from 'url';

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const ADS_API_ENDPOINT = 'https://advertising-api.amazon.com';

// Simple in-memory cache for the access token to avoid excessive refreshes.
let adsApiTokenCache = {
    token: null,
    expiresAt: 0,
};

/**
 * Retrieves a valid LWA access token, using a cache to avoid unnecessary refreshes.
 * Now includes a `forceRefresh` option to bypass the cache.
 * @param {boolean} forceRefresh - If true, bypasses the cache and fetches a new token.
 * @returns {Promise<string>} A valid access token.
 */
export async function getAdsApiAccessToken(forceRefresh = false) {
    if (!forceRefresh && adsApiTokenCache.token && Date.now() < adsApiTokenCache.expiresAt) {
        console.log("[Auth] Using cached Amazon Ads API access token.");
        return adsApiTokenCache.token;
    }

    if (forceRefresh) {
        console.log("[Auth] Forcing token refresh due to previous API error.");
        adsApiTokenCache = { token: null, expiresAt: 0 }; // Invalidate cache
    } else {
        console.log("[Auth] Cached token is invalid or expired. Requesting a new one...");
    }
    
    const {
        ADS_API_CLIENT_ID,
        ADS_API_CLIENT_SECRET,
        ADS_API_REFRESH_TOKEN,
    } = process.env;

    if (!ADS_API_CLIENT_ID || !ADS_API_CLIENT_SECRET || !ADS_API_REFRESH_TOKEN) {
        throw new Error('Missing Amazon Ads API credentials in .env file.');
    }
    
    try {
        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: ADS_API_REFRESH_TOKEN,
            client_id: ADS_API_CLIENT_ID,
            client_secret: ADS_API_CLIENT_SECRET,
        });

        const response = await axios.post(LWA_TOKEN_URL, body.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        });

        const responseData = response.data;
        if (!responseData || typeof responseData.access_token !== 'string' || responseData.access_token.trim() === '') {
            console.error('[Auth] Invalid token response from Amazon LWA:', responseData);
            throw new Error('Failed to retrieve a valid access_token from Amazon LWA. The response was malformed.');
        }
        
        const accessToken = responseData.access_token.trim();
        
        adsApiTokenCache = {
            token: accessToken,
            expiresAt: Date.now() + 55 * 60 * 1000,
        };

        console.log("[Auth] Successfully obtained and cached new Amazon Ads API access token.");
        return adsApiTokenCache.token;

    } catch (error) {
        adsApiTokenCache = { token: null, expiresAt: 0 };
        const errorMessage = error.response?.data?.error_description || error.response?.data?.message || error.message;
        console.error("[Auth] Error refreshing Amazon Ads API access token:", errorMessage);
        throw new Error(`Could not refresh Amazon Ads API access token: ${errorMessage}. Please check your credentials.`);
    }
}

/**
 * Internal function that builds and sends a single request to the Amazon Ads API.
 * This version exclusively uses OAuth 2.0 Bearer Token authentication.
 * @param {boolean} forceTokenRefresh - Whether to force a refresh of the access token.
 * @returns {Promise<object>} The axios response object.
 */
async function _buildAndSendRequest(method, url, profileId, data, params, headers, forceTokenRefresh = false) {
    const finalHeaders = {
        'Amazon-Advertising-API-ClientId': process.env.ADS_API_CLIENT_ID,
        ...headers
    };
    
    if (profileId) {
        finalHeaders['Amazon-Advertising-API-Scope'] = profileId;
    }

    // Per current Amazon Ads API documentation (v3/v4), all campaign management endpoints
    // use standard OAuth 2.0 Bearer token authentication. Legacy HMAC signature
    // logic has been removed to enforce the correct authentication method for all requests.
    const accessToken = await getAdsApiAccessToken(forceTokenRefresh);
    if (!accessToken) {
        throw new Error("Cannot make API request: failed to obtain a valid access token.");
    }
    finalHeaders['Authorization'] = `Bearer ${accessToken}`;
    
    return axios({
        method,
        url: `${ADS_API_ENDPOINT}${url}`,
        headers: finalHeaders,
        data,
        params,
    });
}

/**
 * A robust wrapper for making authenticated requests to the Amazon Ads API.
 * It now exclusively uses Bearer token authentication and includes a retry 
 * mechanism for authorization failures.
 */
export async function amazonAdsApiRequest({ method, url, profileId, data, params, headers = {} }) {
    try {
        const response = await _buildAndSendRequest(method, url, profileId, data, params, headers, false);
        return response.data;
    } catch (error) {
        const errorDetails = error.response?.data || { message: error.message };
        const status = error.response?.status;
        const errorMessage = (errorDetails.message || '').toLowerCase();

        // Check for specific authorization error conditions that warrant a retry
        if (status === 401 || status === 403 || errorMessage.includes('unauthorized') || errorMessage.includes('invalid token')) {
            console.warn(`[Auth] API request to ${url} failed with authorization error. Forcing token refresh and retrying once.`);
            try {
                // This is the retry attempt with a forced token refresh.
                const retryResponse = await _buildAndSendRequest(method, url, profileId, data, params, headers, true);
                return retryResponse.data;
            } catch (retryError) {
                // If the retry also fails, throw the error from the retry attempt.
                console.error(`Amazon Ads API retry request failed for ${method.toUpperCase()} ${url}:`, retryError.response?.data || { message: retryError.message });
                const retryErrorDetails = retryError.response?.data || { message: retryError.message };
                const retryStatus = retryError.response?.status || 500;
                throw { status: retryStatus, details: retryErrorDetails };
            }
        } else {
            // For all other errors, log and re-throw them immediately.
            console.error(`Amazon Ads API request failed for ${method.toUpperCase()} ${url}:`, errorDetails);
            throw { status: status || 500, details: errorDetails };
        }
    }
}