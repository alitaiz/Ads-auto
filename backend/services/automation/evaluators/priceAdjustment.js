// backend/services/automation/evaluators/priceAdjustment.js
import { getListingInfoBySku, updatePrice } from '../../../helpers/spApiHelper.js';

export const evaluatePriceAdjustmentRule = async (rule) => {
    const { skus, priceStep, priceLimit } = rule.config;
    if (!Array.isArray(skus) || skus.length === 0) {
        return { summary: "No SKUs configured for this rule.", details: {}, actedOnEntities: [] };
    }

    const changes = [];
    const errors = [];
    
    console.log(`[Price Evaluator] Starting price check for ${skus.length} SKU(s).`);

    for (const sku of skus) {
        try {
            const { price, sellerId } = await getListingInfoBySku(sku);

            if (price === null) {
                console.warn(`[Price Evaluator] Could not retrieve current price for SKU: ${sku}. Skipping.`);
                errors.push({ sku, reason: "Could not retrieve current price." });
                continue;
            }

            const step = Number(priceStep);
            const limit = Number(priceLimit);

            if (isNaN(step)) {
                 errors.push({ sku, reason: `Invalid priceStep: "${priceStep}".` });
                 continue;
            }
             if (isNaN(limit)) {
                 errors.push({ sku, reason: `Invalid priceLimit: "${priceLimit}".` });
                 continue;
            }

            let newPrice;
            const potentialPrice = price + step;

            // NEW LOGIC: If the potential price hits or exceeds the limit,
            // reset it to the current price minus 0.5. Otherwise, use the potential price.
            if (potentialPrice >= limit) {
                newPrice = price - 0.5;
                console.log(`[Price Evaluator] SKU ${sku} potential price ${potentialPrice.toFixed(2)} hit limit of ${limit}. Resetting price from ${price} to ${newPrice.toFixed(2)}.`);
            } else {
                newPrice = potentialPrice;
            }
            
            // Round to 2 decimal places to handle floating point inaccuracies.
            newPrice = parseFloat(newPrice.toFixed(2));

            // Update only if the price has actually changed and is a valid positive number.
            if (newPrice > 0 && newPrice !== price) {
                console.log(`[Price Evaluator] Updating SKU ${sku}: ${price} -> ${newPrice}`);
                await updatePrice(sku, newPrice, sellerId);
                changes.push({ sku, oldPrice: price, newPrice });
            } else {
                 console.log(`[Price Evaluator] No price change needed for SKU ${sku}. Current: ${price}, Calculated New: ${newPrice}`);
            }
             // Add a small delay between API calls to avoid throttling
            await new Promise(resolve => setTimeout(resolve, 1500));

        } catch (error) {
            console.error(`[Price Evaluator] Error processing SKU ${sku}:`, error.message);
            errors.push({ sku, reason: error.message });
        }
    }

    let summary = '';
    if (changes.length > 0) summary += `Successfully updated price for ${changes.length} SKU(s). `;
    if (errors.length > 0) summary += `Failed to process ${errors.length} SKU(s).`;
    if (summary === '') summary = 'No price changes were necessary.';
    
    return {
        summary,
        details: { changes, errors },
        actedOnEntities: [] // Cooldown not applicable for price rules at this time
    };
};