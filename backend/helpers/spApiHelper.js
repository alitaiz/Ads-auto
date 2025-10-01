// backend/helpers/spApiHelper.js
import axios from 'axios';
import { URLSearchParams } from 'url';
import pool from '../db.js';

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
export async function spApiRequest({ method, url, data, params }) {
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
 * Retrieves the Seller SKU for a given ASIN by first checking the local database,
 * then falling back to the Listings Items API.
 * @param {string} asin The ASIN of the product.
 * @returns {Promise<string|null>} The SKU, or null if not found.
 */
export async function getSkuByAsin(asin) {
    // 1. Try fetching from the local database first.
    try {
        const { rows } = await pool.query(
            'SELECT sku FROM product_listings WHERE asin = $1',
            [asin]
        );
        if (rows.length > 0 && rows[0].sku) {
            console.log(`[Local DB] Found SKU '${rows[0].sku}' for ASIN ${asin} in product_listings table.`);
            return rows[0].sku;
        }
    } catch (dbError) {
        console.error(`[Local DB] Error querying for SKU for ASIN ${asin}:`, dbError);
        // Don't throw, just log and fall through to the API call.
    }

    console.log(`[Local DB] No SKU found for ASIN ${asin}. Falling back to SP-API.`);
    
    // 2. If not found in DB, fall back to SP-API.
    const { SP_API_MARKETPLACE_ID, SP_API_SELLER_ID } = process.env;

    if (!SP_API_SELLER_ID || !SP_API_SELLER_ID.startsWith('A')) {
        throw new Error('Invalid or missing SP_API_SELLER_ID in .env file. It is required to fetch SKU from ASIN via API.');
    }

    console.log(`[SP-API] Fetching SKU for ASIN: ${asin} using Listings API for Seller: ${SP_API_SELLER_ID}`);

    try {
        const response = await spApiRequest({
            method: 'get',
            url: `/listings/2021-08-01/items/${SP_API_SELLER_ID}`,
            params: {
                marketplaceIds: SP_API_MARKETPLACE_ID,
                identifiers: asin,
                identifiersType: 'ASIN',
                includedData: 'summaries' // We only need summaries which includes the SKU.
            }
        });

        if (response.listings && Array.isArray(response.listings) && response.listings.length > 0) {
            const sku = response.listings[0].sku;
            if (sku) {
                console.log(`[SP-API] Found SKU '${sku}' for ASIN ${asin} via Listings API.`);
                return sku;
            }
        }

        console.warn(`[SP-API] No listing with a SKU found for ASIN ${asin} in seller account ${SP_API_SELLER_ID} via Listings API.`);
        return null;

    } catch (error) {
        console.error(`[SP-API] Error fetching SKU via Listings API for ASIN ${asin}:`, error);
        let errorMessage = 'Failed to fetch listing item.';
        try {
            const parsedError = JSON.parse(error.message);
            errorMessage = parsedError.errors?.[0]?.message || parsedError.message || errorMessage;
        } catch (e) {
            errorMessage = error.message || errorMessage;
        }
        throw new Error(`Failed to retrieve SKU for ASIN ${asin} from Listings API. Reason: ${errorMessage}`);
    }
}


/**
 * Fetches listing information for a given SKU, including sellerId and current price.
 * This function has been made more robust by checking multiple locations for the price.
 * @param {string} sku The Seller SKU of the product.
 * @returns {Promise<{price: number | null, sellerId: string | null}>}
 */
export async function getListingInfoBySku(sku) {
    const { SP_API_MARKETPLACE_ID, SP_API_SELLER_ID } = process.env;
    const sellerId = SP_API_SELLER_ID;
    
    if (!sellerId || !sellerId.startsWith('A')) {
        throw new Error("Invalid or missing SP_API_SELLER_ID in .env file. It should be the alphanumeric ID from Seller Central (often called Merchant Token).");
    }

    const listingData = await spApiRequest({
        method: 'get',
        url: `/listings/2021-08-01/items/${sellerId}/${sku}`,
        params: {
            marketplaceIds: SP_API_MARKETPLACE_ID,
            includedData: 'summaries,attributes', // Fetch both to get price
        }
    });
    
    // Attempt 1: Price from 'summaries' (camelCase) - most reliable for active offers
    let price = listingData?.summaries?.[0]?.purchasableOffer?.ourPrice?.[0]?.schedule?.[0]?.valueWithTax;

    // Attempt 2: If summary price is not found, try 'attributes' (snake_case) as a fallback
    if (typeof price !== 'number') {
        const purchasableOffer = listingData?.attributes?.purchasable_offer;
        if (purchasableOffer && Array.isArray(purchasableOffer) && purchasableOffer.length > 0) {
            price = purchasableOffer[0]?.our_price?.[0]?.schedule?.[0]?.value_with_tax;
        }
    }

    return { 
        price: typeof price === 'number' ? price : null, 
        sellerId
    };
}


/**
 * Updates the price for a given SKU using the Listings Items API.
 * @param {string} sku The seller SKU.
 * @param {number} newPrice The new price as a number (e.g., 24.99).
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
                                        value_with_tax: newPrice
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
    const result = await spApiRequest({
        method: 'patch',
        url: `/listings/2021-08-01/items/${sellerId}/${sku}`,
        params: { marketplaceIds: SP_API_MARKETPLACE_ID },
        data: patchPayload,
    });
    console.log(`[SP-API] Successfully submitted price update for SKU ${sku}. Status: ${result.status}`);
    return result;
}
