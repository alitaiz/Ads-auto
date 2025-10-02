// backend/routes/ppcManagementApi.js
import express from 'express';
import { amazonAdsApiRequest } from '../helpers/amazon-api.js';
import { getSkuByAsin } from '../helpers/spApiHelper.js';
import pool from '../db.js';

const router = express.Router();

/**
 * Creates a structured set of 12 SP Auto campaigns for a single ASIN,
 * each targeting a specific auto-targeting type and placement bidding strategy.
 */
export async function createAutoCampaignSet(profileId, asin, budget, defaultBid, placementBids, associatedRuleIds = []) {
    let client;
    const { top, rest, product } = placementBids;

    const targetingTypes = [
        { name: 'Close match', apiType: 'QUERY_HIGH_REL_MATCHES' },
        { name: 'Loose match', apiType: 'QUERY_BROAD_REL_MATCHES' },
        { name: 'Substitutes', apiType: 'ASIN_SUBSTITUTE_RELATED' },
        { name: 'Complements', apiType: 'ASIN_ACCESSORY_RELATED' }
    ];
    const placements = [
        { name: 'Top of search', apiType: 'PLACEMENT_TOP', bid: top },
        { name: 'Rest of search', apiType: 'PLACEMENT_REST_OF_SEARCH', bid: rest },
        { name: 'Product pages', apiType: 'PLACEMENT_PRODUCT_PAGE', bid: product }
    ];

    const createdCampaignsInfo = [];
    let rulesAssociatedCount = 0;

    try {
        console.log(`[Action:CreateSet] Starting creation for ASIN ${asin}`);
        const sku = await getSkuByAsin(asin);
        if (!sku) throw new Error(`Could not find a valid SKU for ASIN ${asin}. Add it to Listings or ensure it's in Seller Central.`);
        console.log(`[Action:CreateSet] Found SKU: ${sku}`);
        
        client = await pool.connect();

        for (const targeting of targetingTypes) {
            for (const placement of placements) {
                // 1. Construct Campaign Name
                const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                const campaignName = `[A] - ${asin} - [${targeting.name}] - [${placement.name}] - ${date}`;
                console.log(`[Action:CreateSet] Creating campaign: ${campaignName}`);

                // 2. Define Bidding Strategy
                const dynamicBidding = {
                    strategy: "LEGACY_FOR_SALES",
                    placementBidding: [
                        { placement: "PLACEMENT_TOP", percentage: placement.apiType === "PLACEMENT_TOP" ? placement.bid : 0 },
                        { placement: "PLACEMENT_REST_OF_SEARCH", percentage: placement.apiType === "PLACEMENT_REST_OF_SEARCH" ? placement.bid : 0 },
                        { placement: "PLACEMENT_PRODUCT_PAGE", percentage: placement.apiType === "PLACEMENT_PRODUCT_PAGE" ? placement.bid : 0 }
                    ]
                };

                // 3. Create Campaign
                const campaignPayload = { name: campaignName, targetingType: 'AUTO', state: 'ENABLED', budget: { budget: Number(budget), budgetType: 'DAILY' }, startDate: new Date().toISOString().slice(0, 10), dynamicBidding };
                const campResponse = await amazonAdsApiRequest({ method: 'post', url: '/sp/campaigns', profileId, data: { campaigns: [campaignPayload] }, headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' } });
                const campSuccess = campResponse?.campaigns?.success?.[0];
                if (!campSuccess?.campaignId) throw new Error(`Campaign creation failed for "${campaignName}": ${JSON.stringify(campResponse?.campaigns?.error?.[0])}`);
                const newCampaignId = campSuccess.campaignId;

                // 4. Create Ad Group
                const adGroupPayload = { name: `Ad Group - ${asin}`, campaignId: newCampaignId, state: 'ENABLED', defaultBid: Number(defaultBid) };
                const agResponse = await amazonAdsApiRequest({ method: 'post', url: '/sp/adGroups', profileId, data: { adGroups: [adGroupPayload] }, headers: { 'Content-Type': 'application/vnd.spAdGroup.v3+json', 'Accept': 'application/vnd.spAdGroup.v3+json' } });
                const agSuccess = agResponse?.adGroups?.success?.[0];
                if (!agSuccess?.adGroupId) throw new Error(`Ad Group creation failed for campaign "${campaignName}"`);
                const newAdGroupId = agSuccess.adGroupId;

                // 5. Create Product Ad
                const adPayload = { campaignId: newCampaignId, adGroupId: newAdGroupId, state: 'ENABLED', sku };
                await amazonAdsApiRequest({ method: 'post', url: '/sp/productAds', profileId, data: { productAds: [adPayload] }, headers: { 'Content-Type': 'application/vnd.spProductAd.v3+json', 'Accept': 'application/vnd.spProductAd.v3+json' } });

                // 6. Adjust Auto-Targeting Clauses
                const listTargetsResponse = await amazonAdsApiRequest({
                    method: 'post', url: '/sp/targets/list', profileId,
                    data: { adGroupIdFilter: { include: [newAdGroupId] } }, headers: { 'Content-Type': 'application/vnd.spTargetingClause.v3+json', 'Accept': 'application/vnd.spTargetingClause.v3+json' }
                });
                
                const targetUpdates = listTargetsResponse.targetingClauses
                    .filter(t => t.expression[0].type !== targeting.apiType)
                    .map(t => ({ targetId: t.targetId, state: 'PAUSED' }));
                
                if (targetUpdates.length > 0) {
                    await amazonAdsApiRequest({
                        method: 'put', url: '/sp/targets', profileId,
                        data: { targetingClauses: targetUpdates }, headers: { 'Content-Type': 'application/vnd.spTargetingClause.v3+json', 'Accept': 'application/vnd.spTargetingClause.v3+json' }
                    });
                }
                
                createdCampaignsInfo.push({ campaignId: newCampaignId, name: campaignName });
            }
        }
        
        // 7. Associate Rules to ALL created campaigns
        if (associatedRuleIds && associatedRuleIds.length > 0) {
            console.log(`[Action:CreateSet] Associating ${associatedRuleIds.length} rules to ${createdCampaignsInfo.length} new campaigns...`);
            await client.query('BEGIN');
            for (const ruleId of associatedRuleIds) {
                const { rows } = await client.query('SELECT scope FROM automation_rules WHERE id = $1', [ruleId]);
                if (rows.length > 0) {
                    const scope = rows[0].scope || {};
                    const campaignIds = new Set(scope.campaignIds?.map(String) || []);
                    createdCampaignsInfo.forEach(c => campaignIds.add(String(c.campaignId)));
                    const newScope = { ...scope, campaignIds: Array.from(campaignIds) };
                    await client.query('UPDATE automation_rules SET scope = $1 WHERE id = $2', [newScope, ruleId]);
                    rulesAssociatedCount++;
                }
            }
            await client.query('COMMIT');
            console.log(`[Action:CreateSet] Rules association step completed.`);
        }

        return {
            createdCampaigns: createdCampaignsInfo,
            rulesAssociated: (associatedRuleIds || []).length
        };
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('[Action:CreateSet] Error during campaign set creation:', error);
        throw error;
    } finally {
        if (client) client.release();
    }
}


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
    if (typeof campaign.budget === 'number') return campaign.budget;
    if (campaign.budget && typeof campaign.budget.budget === 'number') return campaign.budget.budget;
    if (campaign.budget && typeof campaign.budget.amount === 'number') return campaign.budget.amount;
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
        const spBody = { maxResults: 500, stateFilter: { include: baseStateFilter } };
        if (campaignIdFilter?.length > 0) spBody.campaignIdFilter = { include: campaignIdFilter.map(String) };
        const spPromise = fetchCampaignsForTypePost(profileId, '/sp/campaigns/list', { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' }, spBody)
            .catch(err => { console.error("SP Campaign fetch failed:", err.details || err); return []; });


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
        const sdParams = { stateFilter: baseStateFilter.map(s => s.toLowerCase()).join(','), count: 100 };
        if (campaignIdFilter?.length > 0) sdParams.campaignIdFilter = campaignIdFilter.join(',');
        const sdPromise = fetchCampaignsForTypeGet(profileId, '/sd/campaigns', {}, sdParams)
            .catch(err => { console.error("SD Campaign fetch failed:", err.details || err); return []; });

        const [spCampaigns, sbCampaigns, sdCampaigns] = await Promise.all([spPromise, sbPromise, sdPromise]);

        const transformCampaign = (c, type) => ({
            campaignId: c.campaignId, name: c.name, campaignType: type,
            targetingType: c.targetingType || c.tactic || 'UNKNOWN', state: (c.state || 'archived').toLowerCase(),
            dailyBudget: getBudgetAmount(c), startDate: c.startDate, endDate: c.endDate, bidding: c.bidding,
            portfolioId: c.portfolioId,
        });

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
            if (update.budget?.amount) newUpdate.budget = { budget: update.budget.amount, budgetType: 'DAILY' };
            return newUpdate;
        });
        const data = await amazonAdsApiRequest({
            method: 'put', url: '/sp/campaigns', profileId,
            data: { campaigns: transformedUpdates }, headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' },
        });
        res.json(data);
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: 'An unknown error occurred' });
    }
});


/**
 * POST /api/amazon/create-auto-campaign (Endpoint for both single and set creation)
 */
router.post('/create-auto-campaign', async (req, res) => {
    const { profileId, asin, budget, defaultBid, placementBids, ruleIds } = req.body;
    if (!profileId || !asin || !budget || !defaultBid || !placementBids) {
        return res.status(400).json({ message: 'profileId, asin, budget, defaultBid, and placementBids are required.' });
    }

    try {
        const result = await createAutoCampaignSet(profileId, asin, budget, defaultBid, placementBids, ruleIds);
        res.status(201).json({ 
            message: `Successfully created ${result.createdCampaigns.length} campaigns.`, 
            ...result,
        });
    } catch (error) {
        console.error('[Create Campaign Set API] Error:', error);
        res.status(500).json({ message: error.message || 'An unknown server error occurred during campaign set creation.' });
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
    try {
        const data = await amazonAdsApiRequest({
            method: 'post', url: '/sp/adGroups/list', profileId,
            data: { campaignIdFilter: { include: [campaignId] }, stateFilter: { include: ["ENABLED", "PAUSED", "ARCHIVED"] }, maxResults: 500 },
            headers: { 'Content-Type': 'application/vnd.spAdGroup.v3+json', 'Accept': 'application/vnd.spAdGroup.v3+json' },
        });
        const adGroups = (data.adGroups || []).map(ag => ({ adGroupId: ag.adGroupId, name: ag.name, campaignId: ag.campaignId, defaultBid: ag.defaultBid, state: (ag.state || 'archived').toLowerCase() }));
        res.json({ adGroups });
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: `Failed to fetch ad groups` });
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
        const data = await amazonAdsApiRequest({
            method: 'post', url: '/sp/keywords/list', profileId,
            data: { adGroupIdFilter: { include: [adGroupId] }, stateFilter: { include: ["ENABLED", "PAUSED", "ARCHIVED"] }, maxResults: 1000 },
            headers: { 'Content-Type': 'application/vnd.spKeyword.v3+json', 'Accept': 'application/vnd.spKeyword.v3+json' },
        });
        const keywords = (data.keywords || []).map(kw => ({ keywordId: kw.keywordId, adGroupId: kw.adGroupId, campaignId: kw.campaignId, keywordText: kw.keywordText, matchType: (kw.matchType || 'unknown').toLowerCase(), state: (kw.state || 'archived').toLowerCase(), bid: kw.bid }));
        res.json({ keywords, campaignId: keywords[0]?.campaignId });
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: `Failed to fetch keywords` });
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
         const transformedUpdates = updates.map(u => ({ keywordId: u.keywordId, state: u.state?.toUpperCase(), bid: u.bid }));
        const data = await amazonAdsApiRequest({
            method: 'put', url: '/sp/keywords', profileId,
            data: { keywords: transformedUpdates }, headers: { 'Content-Type': 'application/vnd.spKeyword.v3+json', 'Accept': 'application/vnd.spKeyword.v3+json' },
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
            method: 'post', url: '/sp/targets/list', profileId,
            data: { targetIdFilter: { include: targetIdFilter } }, headers: { 'Content-Type': 'application/vnd.spTargetingClause.v3+json', 'Accept': 'application/vnd.spTargetingClause.v3+json' }
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
        const transformedUpdates = updates.map(u => ({ targetId: u.targetId, state: u.state?.toUpperCase(), bid: u.bid }));
        const data = await amazonAdsApiRequest({
            method: 'put', url: '/sp/targets', profileId,
            data: { targetingClauses: transformedUpdates }, headers: { 'Content-Type': 'application/vnd.spTargetingClause.v3+json', 'Accept': 'application/vnd.spTargetingClause.v3+json' },
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
        const transformedKeywords = negativeKeywords.map(kw => ({ ...kw, state: 'ENABLED', matchType: kw.matchType }));
        const data = await amazonAdsApiRequest({
            method: 'post', url: '/sp/negativeKeywords', profileId,
            data: { negativeKeywords: transformedKeywords }, headers: { 'Content-Type': 'application/vnd.spNegativeKeyword.v3+json', 'Accept': 'application/vnd.spNegativeKeyword.v3+json' },
        });
        res.status(207).json(data);
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
        const transformedTargets = negativeTargets.map(t => ({ ...t, state: 'ENABLED' }));
        const data = await amazonAdsApiRequest({
            method: 'post',
            url: '/sp/negativeTargets',
            profileId,
            data: { negativeTargetingClauses: transformedTargets },
            headers: {
                'Content-Type': 'application/vnd.spNegativeTargetingClause.v3+json',
                'Accept': 'application/vnd.spNegativeTargetingClause.v3+json',
            }
        });
        res.status(207).json(data);
    } catch (error) {
        res.status(error.status || 500).json(error.details || { message: 'An unknown error occurred while creating negative targets' });
    }
});

// CREATE SP Campaigns
router.post('/campaigns', async (req, res) => {
    const { profileId, campaigns } = req.body;
    if (!profileId || !Array.isArray(campaigns) || campaigns.length === 0) return res.status(400).json({ message: 'profileId and campaigns array required.' });
    try {
        const data = await amazonAdsApiRequest({ method: 'post', url: '/sp/campaigns', profileId, data: { campaigns }, headers: { 'Content-Type': 'application/vnd.spCampaign.v3+json', 'Accept': 'application/vnd.spCampaign.v3+json' } });
        res.status(207).json(data);
    } catch (error) { res.status(error.status || 500).json(error.details || { message: 'Failed to create campaigns' }); }
});

// CREATE SP Ad Groups
router.post('/adGroups', async (req, res) => {
    const { profileId, adGroups } = req.body;
    if (!profileId || !Array.isArray(adGroups) || adGroups.length === 0) return res.status(400).json({ message: 'profileId and adGroups array required.' });
    try {
        const data = await amazonAdsApiRequest({ method: 'post', url: '/sp/adGroups', profileId, data: { adGroups }, headers: { 'Content-Type': 'application/vnd.spAdGroup.v3+json', 'Accept': 'application/vnd.spAdGroup.v3+json' } });
        res.status(207).json(data);
    } catch (error) { res.status(error.status || 500).json(error.details || { message: 'Failed to create ad groups' }); }
});

// CREATE SP Product Ads
router.post('/productAds', async (req, res) => {
    const { profileId, productAds } = req.body;
    if (!profileId || !Array.isArray(productAds) || productAds.length === 0) return res.status(400).json({ message: 'profileId and productAds array required.' });
    try {
        const data = await amazonAdsApiRequest({ method: 'post', url: '/sp/productAds', profileId, data: { productAds }, headers: { 'Content-Type': 'application/vnd.spProductAd.v3+json', 'Accept': 'application/vnd.spProductAd.v3+json' } });
        res.status(207).json(data);
    } catch (error) { res.status(error.status || 500).json(error.details || { message: 'Failed to create product ads' }); }
});

// CREATE SP Keywords
router.post('/keywords', async (req, res) => {
    const { profileId, keywords } = req.body;
    if (!profileId || !Array.isArray(keywords) || keywords.length === 0) return res.status(400).json({ message: 'profileId and keywords array required.' });
    try {
        const data = await amazonAdsApiRequest({ method: 'post', url: '/sp/keywords', profileId, data: { keywords }, headers: { 'Content-Type': 'application/vnd.spKeyword.v3+json', 'Accept': 'application/vnd.spKeyword.v3+json' } });
        res.status(207).json(data);
    } catch (error) { res.status(error.status || 500).json(error.details || { message: 'Failed to create keywords' }); }
});

// CREATE SP Targets
router.post('/targets', async (req, res) => {
    const { profileId, targets } = req.body;
    if (!profileId || !Array.isArray(targets) || targets.length === 0) return res.status(400).json({ message: 'profileId and targets array required.' });
    try {
        const data = await amazonAdsApiRequest({ method: 'post', url: '/sp/targets', profileId, data: { targetingClauses: targets }, headers: { 'Content-Type': 'application/vnd.spTargetingClause.v3+json', 'Accept': 'application/vnd.spTargetingClause.v3+json' } });
        res.status(207).json(data);
    } catch (error) { res.status(error.status || 500).json(error.details || { message: 'Failed to create targets' }); }
});

export default router;