// backend/routes/productDetails.js
import express from 'express';
import { spApiRequest } from '../helpers/spApiHelper.js';

const router = express.Router();

const processAndMerge = (asinList, catalogResponse, pricingResponse) => {
    const detailsMap = new Map();
    asinList.forEach(asin => detailsMap.set(asin, { asin }));

    // Process Catalog Data
    if (catalogResponse?.items) {
        for (const item of catalogResponse.items) {
            const detail = detailsMap.get(item.asin);
            if (!detail) continue;

            detail.title = item.summaries?.[0]?.itemName || item.attributes?.item_name?.[0]?.value || 'Title Not Found';
            const mainImage = item.images?.[0]?.images?.find(img => img.variant === 'MAIN');
            detail.imageUrl = mainImage?.link || `https://via.placeholder.com/80x80.png?text=${item.asin}`;
            detail.bulletPoints = item.attributes?.bullet_point?.map(bp => bp.value) || [];
            const mainRank = item.salesRanks?.[0]?.ranks?.[0];
            if (mainRank) {
                detail.rank = `#${mainRank.rank} in ${mainRank.title}`;
            }
        }
    }

    // Process Pricing Data
    if (pricingResponse?.payload) {
        for (const item of pricingResponse.payload) {
            if (item.status !== 'Success') continue;
            const detail = detailsMap.get(item.ASIN);
            if (!detail) continue;

            const competitivePrice = item.product?.CompetitivePricing?.CompetitivePrices?.find(p => p.CompetitivePriceId === '1');
            const price = competitivePrice?.Price?.LandedPrice;
            if (price?.Amount && price?.CurrencyCode) {
                // The frontend expects a simple string like "$35.27"
                detail.price = `$${price.Amount.toFixed(2)}`;
            }
        }
    }

    return Array.from(detailsMap.values());
};


router.get('/product-details', async (req, res) => {
    const { asins } = req.query;
    if (!asins) {
        return res.status(400).json({ error: 'ASINs parameter is required.' });
    }

    const asinList = [...new Set(asins.split(','))]; // Remove duplicates
    const marketplaceId = process.env.SP_API_MARKETPLACE_ID;

    if (!marketplaceId) {
         return res.status(500).json([{
            asin: asinList[0],
            title: `Error: SP_API_MARKETPLACE_ID is not configured in .env`,
            price: '$--.--',
            imageUrl: `https://via.placeholder.com/80x80.png?text=Error`,
        }]);
    }

    try {
        // Fetch data from both APIs in parallel
        const catalogDataPromise = spApiRequest({
            method: 'get',
            url: `/catalog/2022-04-01/items`,
            params: {
                marketplaceIds: marketplaceId,
                identifiers: asinList.join(','),
                identifiersType: 'ASIN',
                includedData: 'summaries,images,attributes,salesRanks'
            }
        });

        const pricingDataPromise = spApiRequest({
            method: 'get',
            url: `/products/pricing/v0/competitivePrice`,
            params: {
                MarketplaceId: marketplaceId,
                Asins: asinList.join(','),
                ItemType: 'Asin'
            }
        });

        const [catalogResponse, pricingResponse] = await Promise.all([
            catalogDataPromise,
            pricingDataPromise
        ]);
        
        const mergedDetails = processAndMerge(asinList, catalogResponse, pricingResponse);
        res.json(mergedDetails);

    } catch (error) {
        const errorMessage = error.response?.data?.errors?.[0]?.message || error.message || 'An unknown error occurred.';
        console.error("[Server] Error fetching product details from SP-API:", errorMessage);

        // Fallback to error data to keep the UI functional but show the problem
        const errorDetails = asinList.map(asin => ({
            asin,
            title: `Error: Could not fetch details for ${asin}`,
            price: '$--.--',
            imageUrl: `https://via.placeholder.com/80x80.png?text=Error`,
            error: errorMessage
        }));
        res.status(500).json(errorDetails);
    }
});

export default router;