// backend/routes/ppcManagementApi.js
import express from 'express';
import { amazonAdsApiRequest } from '../helpers/amazon-api.js';

const router = express.Router();

/**
 * GET /api/amazon/profiles
 * Fetches all available advertising profiles.
 */
router.get('/profiles', async (req, res) => {
    try {
        console.log("SERVER_LOG: Received request for /api/amazon/profiles.");
        const response = await amazonAdsApiRequest({
            method: 'get',
            url: '/v2/profiles',
        });
        console.log("SERVER_LOG: Successfully fetched profiles from Amazon API.");
        res.json(response);
    } catch (error) {
        console.error('SERVER_LOG: An error occurred in the /profiles endpoint:', JSON.stringify(error, null, 2));
        res.status(error.status || 500).json(error.details || { message: 'An unknown error occurred while fetching profiles.' });
    }
});

/**
 * POST /api/amazon/campaigns/list
 * Fetches a list of Sponsored Products campaigns.
 */
router.post('/campaigns/list', async (req, res) => {
    const { profileId, stateFilter } = req.body;

    if (!profileId) {
        return res.status(400).json({ message: 'profileId is required in the request body.' });
    }

    try {
        const requestBody = {
            maxResults: 1000,
            stateFilter: {
                include: stateFilter || ["ENABLED", "PAUSED", "ARCHIVED"]
            }
        };

        const data = await amazonAdsApiRequest({
            method: 'post',
            url: '/sp/campaigns/list',
            profileId,
            data: requestBody,
            headers: {
                'Content-Type': 'application/vnd.spCampaign.v3+json',
                'Accept': 'application/vnd.spCampaign.v3+json',
            },
        });

        // Transform the raw API data to match the structure the frontend expects.
        const transformedCampaigns = (data.campaigns || []).map(c => ({
            campaignId: c.campaignId,
            name: c.name,
            campaignType: 'sponsoredProducts',
            targetingType: c.targetingType,
            state: c.state.toLowerCase(),
            dailyBudget: c.budget?.amount ?? 0,
            startDate: c.startDate,
            endDate: c.endDate,
            bidding: c.bidding,
        }));

        res.json({ campaigns: transformedCampaigns });

    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: 'An unknown error occurred' });
    }
});


/**
 * PUT /api/amazon/campaigns
 * Updates one or more Sponsored Products campaigns.
 */
router.put('/campaigns', async (req, res) => {
    const { profileId, updates } = req.body;

    if (!profileId || !Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ message: 'profileId and a non-empty updates array are required.' });
    }

    try {
        const transformedUpdates = updates.map(update => {
            const newUpdate = { campaignId: update.campaignId };
            if (update.state) {
                newUpdate.state = update.state.toUpperCase();
            }
            if (update.budget && typeof update.budget.amount === 'number') {
                newUpdate.budget = {
                    amount: update.budget.amount,
                    budgetType: 'DAILY'
                };
            }
            return newUpdate;
        });

        const data = await amazonAdsApiRequest({
            method: 'put',
            url: '/sp/campaigns',
            profileId,
            data: {
                campaigns: transformedUpdates
            },
            headers: {
                'Content-Type': 'application/vnd.spCampaign.v3+json',
                'Accept': 'application/vnd.spCampaign.v3+json',
            },
        });
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: 'An unknown error occurred' });
    }
});


export default router;