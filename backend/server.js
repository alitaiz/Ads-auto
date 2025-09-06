// backend/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

// Import routers for other functionalities
import spSearchTermRoutes from './routes/spSearchTerms.js';
import ppcManagementRoutes from './routes/ppcManagement.js';
import streamRoutes from './routes/stream.js';
// The logic from ppcManagementApi.js has been moved directly into this file for simplicity.

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 4001;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// =================================================================
// == START: AMAZON ADS API PROXY LOGIC                            ==
// =================================================================

// --- Constants and Credentials ---
const {
    ADS_API_CLIENT_ID,
    ADS_API_CLIENT_SECRET,
    ADS_API_REFRESH_TOKEN,
} = process.env;

const TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const ADS_API_ENDPOINT = 'https://advertising-api.amazon.com';

// In-memory cache for the access token
let accessTokenCache = {
    token: null,
    expiresAt: 0,
};

/**
 * Gets a valid Amazon Ads API Access Token, refreshing it if necessary.
 */
async function getAccessToken() {
    if (!ADS_API_CLIENT_ID || !ADS_API_REFRESH_TOKEN || !ADS_API_CLIENT_SECRET) {
        throw new Error('Missing Amazon Ads API credentials in .env file.');
    }

    if (accessTokenCache.token && Date.now() < accessTokenCache.expiresAt) {
        console.log("Using cached Amazon Ads API access token.");
        return accessTokenCache.token;
    }

    console.log("Requesting new Amazon Ads API access token...");
    try {
        const response = await axios.post(TOKEN_URL, new URLSearchParams({
            'grant_type': 'refresh_token',
            'refresh_token': ADS_API_REFRESH_TOKEN,
            'client_id': ADS_API_CLIENT_ID,
            'client_secret': ADS_API_CLIENT_SECRET,
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const data = response.data;
        accessTokenCache = {
            token: data.access_token,
            expiresAt: Date.now() + 55 * 60 * 1000, // Cache for 55 mins
        };
        console.log("Successfully obtained and cached new Amazon Ads API access token.");
        return accessTokenCache.token;
    } catch (error) {
        console.error("Error refreshing Amazon Ads API access token:", error.response?.data || error.message);
        throw new Error('Could not refresh Amazon Ads API access token. Please check your credentials.');
    }
}

// --- API Endpoints Exposed to Frontend ---

/**
 * GET /api/amazon/profiles
 * Fetches all available advertising profiles.
 */
app.get('/api/amazon/profiles', async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        const response = await axios.get(`${ADS_API_ENDPOINT}/v2/profiles`, {
            headers: {
                'Amazon-Advertising-API-ClientId': ADS_API_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`,
            }
        });
        res.json(response.data);
    } catch (error) {
        const status = error.response?.status || 500;
        const details = error.response?.data || { message: error.message };
        console.error(`[Proxy Error] GET /profiles:`, details);
        res.status(status).json(details);
    }
});

/**
 * POST /api/amazon/campaigns/list
 * Fetches a list of Sponsored Products campaigns for a given profile.
 */
app.post('/api/amazon/campaigns/list', async (req, res) => {
    const { profileId, stateFilter } = req.body;
    if (!profileId) {
        return res.status(400).json({ message: 'profileId is required.' });
    }

    try {
        const accessToken = await getAccessToken();
        const amazonRequestBody = {
            stateFilter: { include: stateFilter || ["ENABLED", "PAUSED", "ARCHIVED"] },
        };

        const response = await axios.post(`${ADS_API_ENDPOINT}/sp/campaigns/list`, amazonRequestBody, {
            headers: {
                'Amazon-Advertising-API-ClientId': ADS_API_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`,
                'Amazon-Advertising-API-Scope': profileId,
                'Content-Type': 'application/vnd.spCampaign.v3+json',
                'Accept': 'application/vnd.spCampaign.v3+json',
            }
        });

        const transformedCampaigns = (response.data.campaigns || []).map(c => ({
            campaignId: c.campaignId,
            name: c.name,
            campaignType: 'sponsoredProducts',
            targetingType: c.targetingType,
            state: c.state.toLowerCase(),
            dailyBudget: c.budget?.amount,
            startDate: c.startDate,
            endDate: c.endDate,
            bidding: c.bidding,
        }));
        
        res.json({ campaigns: transformedCampaigns });

    } catch (error) {
        const status = error.response?.status || 500;
        const details = error.response?.data || { message: error.message };
        console.error(`[Proxy Error] POST /campaigns/list:`, details);
        res.status(status).json(details);
    }
});

/**
 * PUT /api/amazon/campaigns
 * Updates one or more Sponsored Products campaigns.
 */
app.put('/api/amazon/campaigns', async (req, res) => {
    const { profileId, updates } = req.body;
    if (!profileId || !Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ message: 'profileId and a non-empty updates array are required.' });
    }

    try {
        const accessToken = await getAccessToken();
        const amazonRequestBody = { campaigns: updates };

        const response = await axios.put(`${ADS_API_ENDPOINT}/sp/campaigns`, amazonRequestBody, {
            headers: {
                'Amazon-Advertising-API-ClientId': ADS_API_CLIENT_ID,
                'Authorization': `Bearer ${accessToken}`,
                'Amazon-Advertising-API-Scope': profileId,
                'Content-Type': 'application/vnd.spCampaign.v3+json',
                'Accept': 'application/vnd.spCampaign.v3+json',
            }
        });
        res.json(response.data);
    } catch (error) {
        const status = error.response?.status || 500;
        const details = error.response?.data || { message: error.message };
        console.error(`[Proxy Error] PUT /campaigns:`, details);
        res.status(status).json(details);
    }
});

// =================================================================
// == END: AMAZON ADS API PROXY LOGIC                              ==
// =================================================================

// --- Mount Other Routers ---
app.use('/api', spSearchTermRoutes);
app.use('/api', ppcManagementRoutes);
app.use('/api', streamRoutes);

// Base route to check if server is running
app.get('/', (req, res) => {
  res.send('PPC Auto Backend is running!');
});

// --- Start Server ---
app.listen(port, () => {
  console.log(`Backend server is listening at http://localhost:${port}`);
  if (!process.env.DB_USER || !process.env.ADS_API_CLIENT_ID) {
      console.warn('WARNING: Essential environment variables (e.g., DB_USER, ADS_API_CLIENT_ID) are not set. Please check your backend/.env file.');
  }
});