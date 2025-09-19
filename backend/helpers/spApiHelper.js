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
 * Fetches listing information for a given SKU, including sellerId and current price.
 * This is the correct, reliable way to get offer-specific data.
 * @param {string} sku The Seller SKU of the product.
 * @returns {Promise<{price: number | null, sellerId: string | null}>}
 */
export async function getListingInfoBySku(sku) {
    const { SP_API_MARKETPLACE_ID, ADS_API_PROFILE_ID } = process.env;

    // The profileId from ads API often starts with 'amzn1.ads.hz.'. The sellerId for SP-API does not.
    // We extract the numerical part, which is usually what's needed, but this is a heuristic.
    // A more robust solution would be to store a mapping or fetch the sellerId via the Profiles API if needed.
    const sellerId = ADS_API_PROFILE_ID;
    
    if (!sellerId) {
        throw new Error("Could not determine a valid sellerId from the configured ADS_API_PROFILE_ID.");
    }

    // 1. Get Price from Pricing API using the SKU
    const pricingData = await spApiRequest({
        method: 'get',
        url: `/products/pricing/v0/items/${sku}/offers`,
        params: {
            MarketplaceId: SP_API_MARKETPLACE_ID,
            ItemCondition: 'New',
        }
    });

    const offer = pricingData?.payload?.Offers?.find(o => o.SellerId === sellerId);
    const price = offer?.ListingPrice?.Amount;
    
    return { price: typeof price === 'number' ? price : null, sellerId };
}


/**
 * Updates the price for a given SKU using the Listings Items API.
 * @param {string} sku The seller SKU.
 * @param {string} newPrice The new price as a string (e.g., "24.99").
 * @param {string} sellerId The seller ID for the listing.
 */
export async function updatePrice(sku, newPrice, sellerId) {
    const { SP_API_MARKETPLACE_ID } = process.env;
    
    if (!sellerId) {
        throw new Error("sellerId is required to update a price.");
    }

    const patchPayload = {
        productType: "PRODUCT",
        patches: [
            {
                op: "replace",
                path: "/attributes/purchasable_offer",
                value: [
                    {
                        marketplace_id: SP_API_MARKETPLACE_ID,
                        currency: "USD",
                        our_price: [
                            {
                                schedule: [
                                    {
                                        value_with_tax: parseFloat(newPrice)
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
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