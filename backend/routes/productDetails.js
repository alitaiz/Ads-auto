// backend/routes/productDetails.js
import express from 'express';

// In a real implementation, this would use the SP-API Listings Items API.
// For now, this mock allows the UI to function as designed.

const router = express.Router();

router.get('/product-details', async (req, res) => {
    const { asins } = req.query;
    if (!asins) {
        return res.status(400).json({ error: 'ASIN parameter is required.' });
    }

    try {
        const asinList = asins.split(',');
        const mockDetails = asinList.map(asin => ({
            asin,
            title: `Mock Product Title for ${asin}`,
            price: `$${(Math.random() * 50 + 10).toFixed(2)}`,
            imageUrl: `https://via.placeholder.com/50x50.png?text=${asin}`,
            bulletPoints: [
                "This is a mock bullet point.",
                "Feature details would appear here.",
                "Powered by the SP-API Listings API."
            ],
            rank: `>#${Math.floor(Math.random() * 1000)} in Mock Category`
        }));

        res.json(mockDetails);
    } catch (error) {
        console.error("[Server] Error in mock product details:", error);
        res.status(500).json({ error: "Failed to fetch mock product details." });
    }
});

export default router;
