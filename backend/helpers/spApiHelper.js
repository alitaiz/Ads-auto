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
 * This version uses the Listings API and the correct SP_API_SELLER_ID.
 * It also includes a smart retry mechanism for transient 'NOT_FOUND' errors.
 * @param {string} sku The Seller SKU of the product.
 * @returns {Promise<{price: number | null, sellerId: string | null}>}
 */
export async function getListingInfoBySku(sku) {
    const { SP_API_MARKETPLACE_ID, SP_API_SELLER_ID } = process.env;
    const sellerId = SP_API_SELLER_ID;
    
    if (!sellerId || !sellerId.startsWith('A')) {
        throw new Error("Invalid or missing SP_API_SELLER_ID in .env file. It should be the alphanumeric ID from Seller Central (often called Merchant Token).");
    }

    const makeRequest = () => spApiRequest({
        method: 'get',
        url: `/listings/2021-08-01/items/${sellerId}/${sku}`,
        params: {
            marketplaceIds: SP_API_MARKETPLACE_ID,
            includedData: 'attributes',
        }
    });

    let listingData;
    try {
        listingData = await makeRequest();
    } catch (e) {
        const errorMessage = e.message || '{}';
        try {
            const errorDetails = JSON.parse(errorMessage);
            if (errorDetails?.[0]?.code === 'NOT_FOUND') {
                console.warn(`[SP-API Helper] Initial call failed for SKU ${sku} (NOT_FOUND). Retrying in 60 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 60000));
                listingData = await makeRequest(); // Second attempt
            } else {
                throw e; // Re-throw other errors
            }
        } catch (parseError) {
             throw e; // If parsing fails, it's not the error we're looking for. Re-throw original.
        }
    }
    
    const attributes = listingData?.attributes;
    const offer = attributes?.purchasable_offer?.[0];
    const price = offer?.our_price?.[0]?.schedule?.[0]?.value_with_tax;

    return { 
        price: typeof price === 'number' ? price : null, 
        sellerId
    };
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