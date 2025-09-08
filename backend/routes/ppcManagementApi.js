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
 * Fetches a list of Sponsored Products campaigns.
 * Now supports filtering by a list of campaign IDs.
 */
router.post('/campaigns/list', async (req, res) => {
    const { profileId, stateFilter, campaignIdFilter } = req.body;
    if (!profileId) {
        return res.status(400).json({ message: 'profileId is required in the request body.' });
    }

    try {
        const requestBody = {
            maxResults: 1000,
            stateFilter: { include: stateFilter || ["ENABLED", "PAUSED", "ARCHIVED"] },
        };
        // If a list of specific campaign IDs is provided, add it to the request.
        // This is crucial for fetching metadata for campaigns that have metrics but might be outside the main state filter.
        if (campaignIdFilter && Array.isArray(campaignIdFilter) && campaignIdFilter.length > 0) {
            requestBody.campaignIdFilter = { include: campaignIdFilter };
        }

        let allCampaigns = [];
        let nextToken = null;
        
        do {
            if (nextToken) {
                requestBody.nextToken = nextToken;
            }
            
            const data = await amazonAdsApiRequest({
                method: 'post',
                url: '/sp/campaigns/list',
                profileId,
                data: requestBody,
                headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' },
            });

            if (data.campaigns) {
                allCampaigns = allCampaigns.concat(data.campaigns);
            }
            nextToken = data.nextToken;
        } while (nextToken);
        
        const transformedCampaigns = allCampaigns.map(c => ({
            campaignId: c.campaignId, name: c.name, campaignType: 'sponsoredProducts',
            targetingType: c.targetingType, state: c.state.toLowerCase(),
            dailyBudget: c.budget?.budget ?? c.budget?.amount ?? 0,
            startDate: c.startDate, endDate: c.endDate, bidding: c.bidding,
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
            if (update.state) newUpdate.state = update.state.toUpperCase();
            if (update.budget && typeof update.budget.amount === 'number') {
                newUpdate.budget = { budget: update.budget.amount, budgetType: 'DAILY' };
            }
            return newUpdate;
        });
        const data = await amazonAdsApiRequest({
            method: 'put', url: '/sp/campaigns', profileId,
            data: { campaigns: transformedUpdates },
            headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' },
        });
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: 'An unknown error occurred' });
    }
});

/**
 * POST /api/amazon/campaigns/:campaignId/adgroups
 * Fetches ad groups for a specific campaign.
 */
router.post('/campaigns/:campaignId/adgroups', async (req, res) => {
    const { campaignId } = req.params;
    const { profileId } = req.body;
    if (!profileId) return res.status(400).json({ message: 'profileId is required.' });
    
    const campaignIdNum = Number(campaignId);
    if (Number.isNaN(campaignIdNum)) {
        return res.status(400).json({ message: 'Invalid campaignId.' });
    }

    try {
        const requestBody = {
            campaignIdFilter: { include: [campaignIdNum] },
            stateFilter: { include: ["ENABLED", "PAUSED", "ARCHIVED"] },
            maxResults: 500,
        };

        let allAdGroups = [];
        let nextToken = null;

        do {
            if (nextToken) {
                requestBody.nextToken = nextToken;
            }
            const data = await amazonAdsApiRequest({
                method: 'post', url: '/sp/adGroups/list', profileId,
                data: requestBody,
                headers: { 'Content-Type': 'application/vnd.spAdGroup.v3+json', 'Accept': 'application/vnd.spAdGroup.v3+json' },
            });
            
            if (data.adGroups && Array.isArray(data.adGroups)) {
                allAdGroups = allAdGroups.concat(data.adGroups);
            }
            nextToken = data.nextToken;
        } while (nextToken);
        
        const adGroups = allAdGroups.map(ag => ({
            adGroupId: ag.adGroupId, name: ag.name, campaignId: ag.campaignId,
            defaultBid: ag.defaultBid, state: (ag.state || 'archived').toLowerCase(),
        }));
        res.json({ adGroups });
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: `Failed to fetch ad groups for campaign ${campaignId}` });
    }
});

/**
 * POST /api/amazon/adgroups/:adGroupId/keywords
 * Fetches keywords for a specific ad group.
 */
router.post('/adgroups/:adGroupId/keywords', async (req, res) => {
    const { adGroupId } = req.params;
    const { profileId } = req.body;
    if (!profileId) return res.status(400).json({ message: 'profileId is required.' });

    try {
        const requestBody = {
            adGroupIdFilter: { include: [parseInt(adGroupId)] },
            stateFilter: { include: ["ENABLED", "PAUSED", "ARCHIVED"] },
            maxResults: 1000,
        };

        let allKeywords = [];
        let nextToken = null;

        do {
            if (nextToken) {
                requestBody.nextToken = nextToken;
            }
            const data = await amazonAdsApiRequest({
                method: 'post', url: '/sp/keywords/list', profileId,
                data: requestBody,
                headers: { 'Content-Type': 'application/vnd.spKeyword.v3+json', 'Accept': 'application/vnd.spKeyword.v3+json' },
            });
            
            if (data.keywords && Array.isArray(data.keywords)) {
                allKeywords = allKeywords.concat(data.keywords);
            }
            nextToken = data.nextToken;
        } while (nextToken);
        
        const keywords = allKeywords.map(kw => ({
            keywordId: kw.keywordId, adGroupId: kw.adGroupId, campaignId: kw.campaignId,
            keywordText: kw.keywordText, matchType: (kw.matchType || 'unknown').toLowerCase(),
            state: (kw.state || 'archived').toLowerCase(), bid: kw.bid,
        }));
        
        res.json({ keywords, adGroupName: `Ad Group ${adGroupId}`, campaignId: keywords[0]?.campaignId });
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: `Failed to fetch keywords for ad group ${adGroupId}` });
    }
});

/**
 * PUT /api/amazon/keywords
 * Updates one or more Sponsored Products keywords.
 */
router.put('/keywords', async (req, res) => {
    const { profileId, updates } = req.body;
    if (!profileId || !Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ message: 'profileId and a non-empty updates array are required.' });
    }
    try {
         const transformedUpdates = updates.map(update => {
            const newUpdate = { keywordId: update.keywordId };
            if (update.state) newUpdate.state = update.state.toUpperCase();
            if (update.bid) newUpdate.bid = update.bid;
            return newUpdate;
        });
        
        const data = await amazonAdsApiRequest({
            method: 'put', url: '/sp/keywords', profileId,
            data: { keywords: transformedUpdates },
            headers: { 'Content-Type': 'application/vnd.spKeyword.v3+json', 'Accept': 'application/vnd.spKeyword.v3+json' },
        });
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: 'An unknown error occurred' });
    }
});

export default router;