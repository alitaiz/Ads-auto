// backend/helpers/spApiHelper.js
import axios from 'axios';
import { URLSearchParams } from 'url';

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const SP_API_ENDPOINT = 'https://sellingpartnerapi-na.amazon.com';

let spApiTokenCache = {
    token: null,
    expiresAt: 0,
};

/**
 * Retrieves a valid LWA access token for the SP-API.
 */
export async function getSpApiAccessToken() {
    if (spApiTokenCache.token && Date.now() < spApiTokenCache.expiresAt) {
        return spApiTokenCache.token;
    }

    const { SP_API_CLIENT_ID, SP_API_CLIENT_SECRET, SP_API_REFRESH_TOKEN } = process.env;
    if (!SP_API_CLIENT_ID || !SP_API_CLIENT_SECRET || !SP_API_REFRESH_TOKEN) {
        throw new Error('Missing Selling Partner API credentials in .env file.');
    }

    try {
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: SP_API_REFRESH_TOKEN,
            client_id: SP_API_CLIENT_ID,
            client_secret: SP_API_CLIENT_SECRET,
        });

        const response = await axios.post(LWA_TOKEN_URL, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const data = response.data;
        spApiTokenCache = {
            token: data.access_token.trim(),
            expiresAt: Date.now() + 55 * 60 * 1000,
        };
        console.log("[SP-API Auth] Successfully obtained and cached new SP-API access token.");
        return spApiTokenCache.token;
    } catch (error) {
        spApiTokenCache = { token: null, expiresAt: 0 };
        console.error("[SP-API Auth] Error refreshing SP-API access token:", error.response?.data || error.message);
        throw new Error('Could not refresh SP-API access token.');
    }
}

/**
 * A wrapper for making authenticated requests to the SP-API.
 */
async function spApiRequest({ method, url, data, params }) {
    const accessToken = await getSpApiAccessToken();
    try {
        const response = await axios({
            method,
            url: `${SP_API_ENDPOINT}${url}`,
            headers: {
                'x-amz-access-token': accessToken,
                'Content-Type': 'application/json',
            },
            data,
            params,
        });
        return response.data;
    } catch (error) {
        console.error(`SP-API request failed for ${method.toUpperCase()} ${url}:`, error.response?.data || error.message);
        throw new Error(JSON.stringify(error.response?.data?.errors || { message: 'SP-API request failed.' }));
    }
}

/**
 * Fetches listing information for a given ASIN, including SKU and current price.
 * @param {string} asin The ASIN of the product.
 * @returns {Promise<{sku: string, price: number | null}>}
 */
export async function getListingInfo(asin) {
    const { SP_API_MARKETPLACE_ID } = process.env;
    
    // 1. Get SKU from Catalog Items API
    const catalogData = await spApiRequest({
        method: 'get',
        url: `/catalog/2022-04-01/items/${asin}`,
        params: {
            marketplaceIds: SP_API_MARKETPLACE_ID,
            includedData: 'summaries,attributes',
        },
    });

    const sku = catalogData.summaries?.[0]?.sku;
    if (!sku) {
        throw new Error(`Could not find SKU for ASIN ${asin}. Product might not be in the catalog.`);
    }

    // 2. Get Price from Pricing API
    const pricingData = await spApiRequest({
        method: 'get',
        url: `/products/pricing/v0/items/${asin}/offers`,
        params: {
            MarketplaceId: SP_API_MARKETPLACE_ID,
            ItemCondition: 'New',
        }
    });

    const offer = pricingData?.payload?.Offers?.find(o => o.SellerId === catalogData.summaries?.[0]?.sellerId);
    const price = offer?.ListingPrice?.Amount;
    
    return { sku, price: typeof price === 'number' ? price : null };
}


/**
 * Updates the price for a given SKU using the Listings Items API.
 * @param {string} sku The seller SKU.
 * @param {string} newPrice The new price as a string (e.g., "24.99").
 * @param {string} profileId The Ads API profile ID (used to find the sellerId).
 */
export async function updatePrice(sku, newPrice, profileId) {
    const { SP_API_MARKETPLACE_ID } = process.env;

    // This is a placeholder. In a real application, you would need to fetch
    // the sellerId associated with the profileId, likely from a database mapping
    // or by calling a profile-related API that returns it.
    const sellerId = "A2TESTSELLERID123"; // Replace with actual seller ID logic.

    const patchPayload = {
        productType: "PRODUCT", // This may need to be more specific depending on the category
        patches: [{
            op: "replace",
            path: "/attributes/purchasable_offer",
            value: [{
                marketplace_id: SP_API_MARKETPLACE_ID,
                our_price: [{
                    schedule: [{ value_with_tax: parseFloat(newPrice) }]
                }],
                currency: "USD"
            }]
        }]
    };
    
    console.log(`[SP-API] Submitting price update for SKU ${sku} to ${newPrice}`);
    await spApiRequest({
        method: 'patch',
        url: `/listings/2021-08-01/items/${sellerId}/${sku}`,
        params: { marketplaceIds: SP_API_MARKETPLACE_ID },
        data: patchPayload,
    });
    console.log(`[SP-API] Successfully submitted price update for SKU ${sku}.`);
}