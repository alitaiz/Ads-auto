// backend/routes/ppcManagementApi.js
import express from 'express';
import { amazonAdsApiRequest } from '../helpers/amazon-api.js';

const router = express.Router();

/**
 * GET /api/amazon/profiles
 * Fetches all available advertising profiles. This call does not require a scope.
 */
router.get('/profiles', async (req, res) => {
    try {
        // The /v2/profiles endpoint does not use the 'Amazon-Advertising-API-Scope' header.
        // We call the helper without a profileId to prevent it from being added.
        const response = await amazonAdsApiRequest({
            method: 'get',
            url: '/v2/profiles',
        });
        res.json(response);
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: 'An unknown error occurred' });
    }
});

/**
 * POST /api/amazon/campaigns/list
 * Fetches a list of Sponsored Products campaigns for a given profile, handling pagination to retrieve all campaigns.
 */
router.post('/campaigns/list', async (req, res) => {
    const { profileId, stateFilter, campaignIdFilter } = req.body;
    if (!profileId) {
        return res.status(400).json({ message: 'profileId is required in the request body.' });
    }

    try {
        let allCampaigns = [];
        let nextToken = null;

        console.log(`Fetching all campaigns for profile ${profileId}...`);

        do {
            const amazonRequestBody = {
                maxResults: 1000, // Request the maximum allowed per page
                nextToken: nextToken,
                stateFilter: {
                    include: stateFilter || ["ENABLED", "PAUSED", "ARCHIVED"],
                },
            };
            
            if (campaignIdFilter && campaignIdFilter.length > 0) {
               amazonRequestBody.campaignIdFilter = { include: campaignIdFilter };
            }

            const data = await amazonAdsApiRequest({
                method: 'post',
                url: '/sp/campaigns/list',
                profileId,
                data: amazonRequestBody,
                headers: {
                    'Content-Type': 'application/vnd.spCampaign.v3+json',
                    'Accept': 'application/vnd.spCampaign.v3+json',
                },
            });
            
            if (data.campaigns && data.campaigns.length > 0) {
                allCampaigns = allCampaigns.concat(data.campaigns);
            }
            
            nextToken = data.nextToken;
            if(nextToken) {
                console.log(`...found another page of campaigns, fetching... (current total: ${allCampaigns.length})`);
            }

        } while (nextToken);

        console.log(`Successfully fetched a total of ${allCampaigns.length} campaigns.`);
        
        // Transform data to match frontend's expected format
        const transformedCampaigns = allCampaigns.map(c => ({
            campaignId: c.campaignId,
            name: c.name,
            campaignType: 'sponsoredProducts',
            targetingType: c.targetingType,
            state: c.state.toLowerCase(),
            // Correctly extract the budget amount. The campaign list response uses a `budget`
            // object which contains a numeric `budget` property, which differs from the
            // `budget.amount` structure used in update requests. Provide a fallback for safety.
            dailyBudget: c.budget?.budget ?? c.budget?.amount ?? 0,
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
    const { profileId, updates } = req.body; // Expects an array of update objects
    if (!profileId || !Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ message: 'profileId and a non-empty updates array are required.' });
    }

    try {
        // Transform the update payload from our internal format to the format Amazon's API expects.
        const transformedUpdates = updates.map(update => {
            const newUpdate = { campaignId: update.campaignId };

            // Transform state if it exists
            if (update.state) {
                newUpdate.state = update.state.toUpperCase();
            }

            // Transform budget if it exists. The API requires both `budget` (the amount) and `budgetType`.
            // The frontend sends `{ budget: { amount: X } }`.
            if (update.budget && typeof update.budget.amount === 'number') {
                newUpdate.budget = {
                    budget: update.budget.amount,
                    budgetType: 'DAILY'
                };
            }
            
            return newUpdate;
        });

        // Amazon API expects the updates to be wrapped in a 'campaigns' property
        const amazonRequestBody = { campaigns: transformedUpdates };

        const data = await amazonAdsApiRequest({
            method: 'put',
            url: '/sp/campaigns',
            profileId,
            data: amazonRequestBody,
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