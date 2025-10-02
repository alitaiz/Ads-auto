// backend/routes/ppcManagementApi.js
import express from 'express';
import { amazonAdsApiRequest } from '../helpers/amazon-api.js';
import { getSkuByAsin } from '../helpers/spApiHelper.js';
import pool from '../db.js';

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
 * Fetches campaigns for Sponsored Products using POST with pagination.
 */
const fetchCampaignsForTypePost = async (profileId, url, headers, body) => {
    let allCampaigns = [];
    let nextToken = null;
    
    do {
        const requestBody = { ...body };
        if (nextToken) {
            requestBody.nextToken = nextToken;
        }

        const data = await amazonAdsApiRequest({
            method: 'post',
            url,
            profileId,
            data: requestBody,
            headers,
        });

        const campaignsKey = Object.keys(data).find(k => k.toLowerCase().includes('campaigns'));
        if (campaignsKey && data[campaignsKey]) {
            allCampaigns = allCampaigns.concat(data[campaignsKey]);
        }
        nextToken = data.nextToken;

    } while (nextToken);

    return allCampaigns;
};

/**
 * Fetches campaigns for ad products using GET with pagination (for SB, SD).
 */
const fetchCampaignsForTypeGet = async (profileId, url, headers, params) => {
    let allCampaigns = [];
    let nextToken = null;

    do {
        const requestParams = { ...params };
        if (nextToken) {
            requestParams.nextToken = nextToken;
        }

        const data = await amazonAdsApiRequest({
            method: 'get',
            url,
            profileId,
            params: requestParams,
            headers,
        });
        
        // Handle different response structures gracefully
        const campaignsInResponse = data.campaigns || data;
        if (Array.isArray(campaignsInResponse)) {
            allCampaigns = allCampaigns.concat(campaignsInResponse);
        }
        nextToken = data.nextToken;

    } while (nextToken);

    return allCampaigns;
};

/**
 * Helper function to robustly extract the budget amount from various campaign object structures.
 * @param {object} campaign - The campaign object from the Amazon Ads API.
 * @returns {number} The budget amount, or 0 if not found.
 */
const getBudgetAmount = (campaign) => {
    if (!campaign) return 0;

    // Case 1: Sponsored Display (budget is a top-level number)
    // e.g., { "campaignId": ..., "budget": 50.00 }
    if (typeof campaign.budget === 'number') {
        return campaign.budget;
    }

    // Case 2: Sponsored Products / Brands (budget is an object containing a budget property)
    // e.g., { "campaignId": ..., "budget": { "budget": 50.00, "budgetType": "DAILY" } }
    if (campaign.budget && typeof campaign.budget.budget === 'number') {
        return campaign.budget.budget;
    }
    
    // Case 3: Sponsored Products v3 (budget is an object containing an amount property)
    // e.g., { "campaignId": ..., "budget": { "amount": 50.00, "budgetType": "DAILY" } }
    if (campaign.budget && typeof campaign.budget.amount === 'number') {
        return campaign.budget.amount;
    }

    return 0;
};


/**
 * POST /api/amazon/campaigns/list
 * Fetches a list of campaigns across all ad types (SP, SB, SD).
 */
router.post('/campaigns/list', async (req, res) => {
    const { profileId, stateFilter, campaignIdFilter } = req.body;
    if (!profileId) {
        return res.status(400).json({ message: 'profileId is required in the request body.' });
    }

    try {
        const baseStateFilter = stateFilter || ["ENABLED", "PAUSED", "ARCHIVED"];

        // --- Sponsored Products (POST) ---
        const spBody = {
            maxResults: 500,
            stateFilter: { include: baseStateFilter },
        };
        if (campaignIdFilter && Array.isArray(campaignIdFilter) && campaignIdFilter.length > 0) {
            spBody.campaignIdFilter = { include: campaignIdFilter.map(id => id.toString()) };
        }
        const spPromise = fetchCampaignsForTypePost(profileId, '/sp/campaigns/list', 
            { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' }, 
            spBody
        );

        // --- Sponsored Brands (POST v4) ---
        let sbPromise;
        const sbCampaignIdFilter = campaignIdFilter ? campaignIdFilter.map(id => id.toString()) : [];
        const sbHeaders = { 'Content-Type': 'application/vnd.sbcampaigns.v4+json', 'Accept': 'application/vnd.sbcampaigns.v4+json' };
        
        const sbStateFilterObject = { include: baseStateFilter };

        if (sbCampaignIdFilter.length > 100) {
            const chunks = [];
            for (let i = 0; i < sbCampaignIdFilter.length; i += 100) {
                chunks.push(sbCampaignIdFilter.slice(i, i + 100));
            }
            
            const chunkPromises = chunks.map(chunk => {
                const sbChunkBody = { pageSize: 100, stateFilter: sbStateFilterObject, campaignIdFilter: { include: chunk } };
                return fetchCampaignsForTypePost(profileId, '/sb/v4/campaigns/list', sbHeaders, sbChunkBody);
            });
            
            sbPromise = Promise.all(chunkPromises).then(results => results.flat())
                .catch(err => { console.error("SB Campaign chunked fetch failed:", err.details || err); return []; });
        } else {
            const sbBody = { pageSize: 100, stateFilter: sbStateFilterObject };
            if (sbCampaignIdFilter.length > 0) sbBody.campaignIdFilter = { include: sbCampaignIdFilter };
            sbPromise = fetchCampaignsForTypePost(profileId, '/sb/v4/campaigns/list', sbHeaders, sbBody)
                .catch(err => { console.error("SB Campaign fetch failed:", err.details || err); return []; });
        }

        // --- Sponsored Display (GET) ---
        const getStateFilterForGet = baseStateFilter.map(s => s.toLowerCase()).join(',');
        const getCampaignIdFilter = (campaignIdFilter && campaignIdFilter.length > 0) ? campaignIdFilter.join(',') : undefined;
        const sdParams = { stateFilter: getStateFilterForGet, campaignIdFilter: getCampaignIdFilter, count: 100 };
        const sdPromise = fetchCampaignsForTypeGet(profileId, '/sd/campaigns', { 'Accept': 'application/json' }, sdParams)
            .catch(err => { console.error("SD Campaign fetch failed:", err.details || err); return []; });

        const [spCampaigns, sbCampaigns, sdCampaigns] = await Promise.all([spPromise, sbPromise, sdPromise]);

        // --- Transform and Merge Results (Portfolio logic removed) ---
        const transformCampaign = (campaign, type) => {
            return {
                campaignId: campaign.campaignId, name: campaign.name, campaignType: type,
                targetingType: campaign.targetingType || campaign.tactic || 'UNKNOWN',
                state: (campaign.state || 'archived').toLowerCase(),
                dailyBudget: getBudgetAmount(campaign), // Budget is now sourced directly
                startDate: campaign.startDate, endDate: campaign.endDate, bidding: campaign.bidding,
                portfolioId: campaign.portfolioId,
            };
        };

        const allCampaigns = [
            ...spCampaigns.map(c => transformCampaign(c, 'sponsoredProducts')),
            ...sbCampaigns.map(c => transformCampaign(c, 'sponsoredBrands')),
            ...sdCampaigns.map(c => transformCampaign(c, 'sponsoredDisplay')),
        ];
        
        res.json({ campaigns: allCampaigns });
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
            campaignIdFilter: { include: [campaignId] },
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
    
    const adGroupIdNum = Number(adGroupId);
    if (Number.isNaN(adGroupIdNum)) {
        return res.status(400).json({ message: 'Invalid adGroupId.' });
    }

    try {
        const requestBody = {
            adGroupIdFilter: { include: [adGroupId] },
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

/**
 * POST /api/amazon/targets/list
 * Fetches targeting clauses for a given list of target IDs.
 */
router.post('/targets/list', async (req, res) => {
    const { profileId, targetIdFilter } = req.body;
    if (!profileId || !Array.isArray(targetIdFilter) || targetIdFilter.length === 0) {
        return res.status(400).json({ message: 'profileId and targetIdFilter array are required.' });
    }
    try {
        const data = await amazonAdsApiRequest({
            method: 'post',
            url: '/sp/targets/list',
            profileId,
            data: { targetIdFilter: { include: targetIdFilter } },
            headers: { 'Content-Type': 'application/vnd.spTargetingClause.v3+json', 'Accept': 'application/vnd.spTargetingClause.v3+json' }
        });
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: 'Failed to list targets' });
    }
});

/**
 * PUT /api/amazon/targets
 * Updates one or more SP targets.
 */
router.put('/targets', async (req, res) => {
    const { profileId, updates } = req.body;
    if (!profileId || !Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ message: 'profileId and a non-empty updates array are required.' });
    }
    try {
        const transformedUpdates = updates.map(u => ({
            targetId: u.targetId,
            state: u.state?.toUpperCase(),
            bid: u.bid,
        }));

        const data = await amazonAdsApiRequest({
            method: 'put',
            url: '/sp/targets',
            profileId,
            data: { targetingClauses: transformedUpdates },
            headers: { 'Content-Type': 'application/vnd.spTargetingClause.v3+json', 'Accept': 'application/vnd.spTargetingClause.v3+json' },
        });
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: 'Failed to update targets' });
    }
});


/**
 * POST /api/amazon/negativeKeywords
 * Creates one or more negative keywords.
 */
router.post('/negativeKeywords', async (req, res) => {
    const { profileId, negativeKeywords } = req.body;
    if (!profileId || !Array.isArray(negativeKeywords) || negativeKeywords.length === 0) {
        return res.status(400).json({ message: 'profileId and a non-empty negativeKeywords array are required.' });
    }

    try {
        // The Amazon API expects uppercase enum values for matchType, e.g., 'NEGATIVE_EXACT'.
        const transformedKeywords = negativeKeywords.map(kw => ({
            ...kw,
            state: 'ENABLED',
            matchType: kw.matchType
        }));

        const data = await amazonAdsApiRequest({
            method: 'post',
            url: '/sp/negativeKeywords',
            profileId,
            data: { negativeKeywords: transformedKeywords },
            headers: { 'Content-Type': 'application/vnd.spNegativeKeyword.v3+json', 'Accept': 'application/vnd.spNegativeKeyword.v3+json' },
        });
        res.status(207).json(data); // 207 Multi-Status is common for bulk operations
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: 'An unknown error occurred while creating negative keywords' });
    }
});

/**
 * POST /api/amazon/negativeTargets
 * Creates one or more negative product targets.
 */
router.post('/negativeTargets', async (req, res) => {
    const { profileId, negativeTargets } = req.body;
    if (!profileId || !Array.isArray(negativeTargets) || negativeTargets.length === 0) {
        return res.status(400).json({ message: 'profileId and a non-empty negativeTargets array are required.' });
    }

    try {
        const transformedTargets = negativeTargets.map(target => ({
            ...target,
            state: 'ENABLED',
        }));

        const data = await amazonAdsApiRequest({
            method: 'post',
            url: '/sp/negativeTargets',
            profileId,
            data: { negativeTargetingClauses: transformedTargets },
            headers: { 'Content-Type': 'application/vnd.spNegativeTargetingClause.v3+json', 'Accept': 'application/vnd.spNegativeTargetingClause.v3+json' },
        });
        res.status(207).json(data);
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: 'An unknown error occurred while creating negative targets' });
    }
});


// =================================================================
// == NEW: Endpoints for Creating Entities (for Harvesting Rule)  ==
// =================================================================

// CREATE SP Campaigns
router.post('/campaigns', async (req, res) => {
    const { profileId, campaigns } = req.body;
    if (!profileId || !Array.isArray(campaigns) || campaigns.length === 0) {
        return res.status(400).json({ message: 'profileId and a non-empty campaigns array are required.' });
    }
    try {
        const data = await amazonAdsApiRequest({
            method: 'post',
            url: '/sp/campaigns',
            profileId,
            data: { campaigns },
            headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' },
        });
        res.status(207).json(data); // 207 Multi-Status
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: 'An unknown error occurred while creating campaigns' });
    }
});

// CREATE SP Ad Groups
router.post('/adGroups', async (req, res) => {
    const { profileId, adGroups } = req.body;
    if (!profileId || !Array.isArray(adGroups) || adGroups.length === 0) {
        return res.status(400).json({ message: 'profileId and a non-empty adGroups array are required.' });
    }
    try {
        const data = await amazonAdsApiRequest({
            method: 'post',
            url: '/sp/adGroups',
            profileId,
            data: { adGroups },
            headers: { 'Content-Type': 'application/vnd.spAdGroup.v3+json', 'Accept': 'application/vnd.spAdGroup.v3+json' },
        });
        res.status(207).json(data);
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: 'An unknown error occurred while creating ad groups' });
    }
});

// CREATE SP Product Ads
router.post('/productAds', async (req, res) => {
    const { profileId, productAds } = req.body;
    if (!profileId || !Array.isArray(productAds) || productAds.length === 0) {
        return res.status(400).json({ message: 'profileId and a non-empty productAds array are required.' });
    }
    try {
        const data = await amazonAdsApiRequest({
            method: 'post',
            url: '/sp/productAds',
            profileId,
            data: { productAds },
            headers: { 'Content-Type': 'application/vnd.spProductAd.v3+json', 'Accept': 'application/vnd.spProductAd.v3+json' },
        });
        res.status(207).json(data);
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: 'An unknown error occurred while creating product ads' });
    }
});


// CREATE SP Keywords
router.post('/keywords', async (req, res) => {
    const { profileId, keywords } = req.body;
    if (!profileId || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).json({ message: 'profileId and a non-empty keywords array are required.' });
    }
    try {
        const data = await amazonAdsApiRequest({
            method: 'post',
            url: '/sp/keywords',
            profileId,
            data: { keywords },
            headers: { 'Content-Type': 'application/vnd.spKeyword.v3+json', 'Accept': 'application/vnd.spKeyword.v3+json' },
        });
        res.status(207).json(data);
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: 'An unknown error occurred while creating keywords' });
    }
});

// CREATE SP Targets
router.post('/targets', async (req, res) => {
    const { profileId, targets } = req.body;
    if (!profileId || !Array.isArray(targets) || targets.length === 0) {
        return res.status(400).json({ message: 'profileId and a non-empty targets array are required.' });
    }
    try {
        const data = await amazonAdsApiRequest({
            method: 'post',
            url: '/sp/targets',
            profileId,
            data: { targetingClauses: targets },
            headers: { 'Content-Type': 'application/vnd.spTargetingClause.v3+json', 'Accept': 'application/vnd.spTargetingClause.v3+json' },
        });
        res.status(207).json(data);
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: 'An unknown error occurred while creating targets' });
    }
});


router.post('/create-auto-campaign', async (req, res) => {
    const { profileId, asin, budget, defaultBid, ruleIds } = req.body;
    if (!profileId || !asin || !budget || !defaultBid) {
        return res.status(400).json({ message: 'profileId, asin, budget, and defaultBid are required.' });
    }

    let client;
    try {
        // 1. Get SKU from ASIN
        const sku = await getSkuByAsin(asin);
        if (!sku) {
            throw new Error(`Could not find a valid SKU for ASIN ${asin}. Please add it to your Listings or ensure it's in your Seller Central inventory.`);
        }

        // 2. Create Campaign
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const campaignName = `[A] - ${asin} - ${date}`;
        const campaignPayload = { name: campaignName, targetingType: 'AUTO', state: 'ENABLED', budget: { budget: Number(budget), budgetType: 'DAILY' }, startDate: new Date().toISOString().slice(0, 10) };
        const campResponse = await amazonAdsApiRequest({ method: 'post', url: '/sp/campaigns', profileId, data: { campaigns: [campaignPayload] }, headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json' } });
        const campSuccess = campResponse?.campaigns?.success?.[0];
        if (!campSuccess?.campaignId) throw new Error(`Campaign creation failed: ${JSON.stringify(campResponse?.campaigns?.error?.[0])}`);
        const newCampaignId = campSuccess.campaignId;

        // 3. Create Ad Group
        const adGroupPayload = { name: `Ad Group - ${asin}`, campaignId: newCampaignId, state: 'ENABLED', defaultBid: Number(defaultBid) };
        const agResponse = await amazonAdsApiRequest({ method: 'post', url: '/sp/adGroups', profileId, data: { adGroups: [adGroupPayload] }, headers: { 'Content-Type': 'application/vnd.spAdGroup.v3+json' } });
        const agSuccess = agResponse?.adGroups?.success?.[0];
        if (!agSuccess?.adGroupId) throw new Error(`Ad Group creation failed: ${JSON.stringify(agResponse?.adGroups?.error?.[0])}`);
        const newAdGroupId = agSuccess.adGroupId;

        // 4. Create Product Ad
        const adPayload = { campaignId: newCampaignId, adGroupId: newAdGroupId, state: 'ENABLED', sku };
        const adResponse = await amazonAdsApiRequest({ method: 'post', url: '/sp/productAds', profileId, data: { productAds: [adPayload] }, headers: { 'Content-Type': 'application/vnd.spProductAd.v3+json' } });
        const adSuccess = adResponse?.productAds?.success?.[0];
        if (!adSuccess?.adId) throw new Error(`Product Ad creation failed: ${JSON.stringify(adResponse?.productAds?.error?.[0])}`);
        
        // 5. Associate Rules
        let rulesAssociated = 0;
        if (ruleIds && ruleIds.length > 0) {
            client = await pool.connect();
            await client.query('BEGIN');
            for (const ruleId of ruleIds) {
                const { rows } = await client.query('SELECT scope FROM automation_rules WHERE id = $1', [ruleId]);
                if (rows.length > 0) {
                    const scope = rows[0].scope || {};
                    const campaignIds = new Set(scope.campaignIds || []);
                    campaignIds.add(newCampaignId);
                    const newScope = { ...scope, campaignIds: Array.from(campaignIds) };
                    await client.query('UPDATE automation_rules SET scope = $1 WHERE id = $2', [newScope, ruleId]);
                    rulesAssociated++;
                }
            }
            await client.query('COMMIT');
        }

        res.status(201).json({ 
            message: 'Campaign created successfully.', 
            campaignId: newCampaignId, 
            campaignName: campaignName,
            adGroupId: newAdGroupId,
            adId: adSuccess.adId,
            rulesAssociated
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('[Create Auto Campaign] Error:', error);
        res.status(500).json({ message: error.message || 'An unknown server error occurred.' });
    } finally {
        if (client) client.release();
    }
});


export default router;