

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import crypto from 'crypto';
import { getAdsApiAccessToken } from '../backend/helpers/amazon-api.js';

// --- Configuration ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendEnvPath = path.resolve(__dirname, '..', 'backend', '.env');
dotenv.config({ path: backendEnvPath });

const { 
    ADS_API_CLIENT_ID, 
    ADS_API_PROFILE_ID,
    ADS_API_FIREHOSE_ARN,
    ADS_API_FIREHOSE_SUBSCRIPTION_ROLE_ARN,
    ADS_API_FIREHOSE_SUBSCRIBER_ROLE_ARN
} = process.env;

const ADS_API_ENDPOINT = 'https://advertising-api.amazon.com';
const DATASETS_TO_SUBSCRIBE = [
    'sp-traffic', 
    'sp-conversion',
    'sb-traffic',
    'sb-conversion',
    'sd-traffic',
    'sd-conversion'
];

// --- Helper Functions ---

/**
 * Gets the correct `sourceType` required by the Amazon Ads API based on the dataset ID.
 * @param {string} dataSetId - The ID of the dataset (e.g., 'sb-traffic').
 * @returns {string} The corresponding source type (e.g., 'SPONSORED_BRANDS').
 */
function getSourceType(dataSetId) {
    if (dataSetId.startsWith('sb-')) {
        return 'SPONSORED_BRANDS';
    }
    if (dataSetId.startsWith('sd-')) {
        return 'SPONSORED_DISPLAY';
    }
    // Default for 'sp-' and any others
    return 'SPONSORED_PRODUCTS';
}


/**
 * Checks if an active subscription for a given dataset already exists.
 * @param {string} accessToken - The Amazon Ads API access token.
 * @param {string} dataSetId - The ID of the dataset to check (e.g., 'sp-traffic').
 * @returns {Promise<boolean>} - True if an active subscription exists, false otherwise.
 */
async function checkExistingSubscription(accessToken, dataSetId) {
    console.log(`🔍 Checking for existing subscription for '${dataSetId}'...`);
    const headers = {
        'Amazon-Advertising-API-ClientId': ADS_API_CLIENT_ID,
        'Amazon-Advertising-API-Scope': ADS_API_PROFILE_ID,
        'Authorization': `Bearer ${accessToken}`,
    };
    try {
        const response = await axios.get(`${ADS_API_ENDPOINT}/streams/subscriptions`, { headers });
        const subscriptions = response.data?.subscriptions || [];
        
        const existingSubscription = subscriptions.find(sub => 
            sub.dataSetId === dataSetId && sub.status === 'ACTIVE'
        );

        if (existingSubscription) {
            console.log(`✅ Found active subscription for '${dataSetId}' with ID: ${existingSubscription.subscriptionId}`);
            return true;
        }
        
        console.log(`👍 No active '${dataSetId}' subscription found.`);
        return false;
    } catch (error) {
        if (error.response) {
            console.error(`⚠️  Warning: Could not check for existing subscriptions for '${dataSetId}'.`, error.response.data);
        } else {
            console.error(`⚠️  Warning: Could not check for existing subscriptions for '${dataSetId}'.`, error.message);
        }
        return false; 
    }
}

/**
 * Creates a new subscription to the Amazon Marketing Stream for a specific dataset.
 * @param {string} accessToken - The Amazon Ads API access token.
 * @param {string} dataSetId - The ID of the dataset to subscribe to.
 */
async function subscribeToStream(accessToken, dataSetId) {
    console.log(`🚀 Subscribing to the '${dataSetId}' dataset...`);
    
    const headers = {
        'Content-Type': 'application/vnd.MarketingStreamSubscriptions.StreamSubscriptionResource.v1.0+json',
        'Amazon-Advertising-API-ClientId': ADS_API_CLIENT_ID,
        'Amazon-Advertising-API-Scope': ADS_API_PROFILE_ID,
        'Authorization': `Bearer ${accessToken}`,
    };
    
    const body = {
        clientRequestToken: crypto.randomUUID(),
        dataSetId: dataSetId,
        sourceType: getSourceType(dataSetId),
        destination: {
            firehoseDestination: {
                deliveryStreamArn: ADS_API_FIREHOSE_ARN,
                subscriptionRoleArn: ADS_API_FIREHOSE_SUBSCRIPTION_ROLE_ARN,
                subscriberRoleArn: ADS_API_FIREHOSE_SUBSCRIBER_ROLE_ARN
            }
        }
    };
    
    try {
        const response = await axios.post(`${ADS_API_ENDPOINT}/streams/subscriptions`, body, { headers });
        const subscriptionId = response.data.subscriptionId;
        console.log(`\n🎉 SUCCESS! You are now subscribed to the '${dataSetId}' dataset.`);
        console.log(`   Subscription ID: ${subscriptionId}`);
    } catch (error) {
        if (error.response && error.response.data) {
            const { message } = error.response.data;
            if (message && message.includes("Cannot have more than 1 subscriptions")) {
                 console.log(`\n❌ Failed to subscribe to '${dataSetId}'. Amazon's response: ${JSON.stringify(error.response.data)}`);
            } else {
                console.error(`\n❌ Failed to subscribe to '${dataSetId}'. Amazon's response: ${JSON.stringify(error.response.data)}`);
            }
        } else {
            throw error;
        }
    }
}

/**
 * Main orchestrator function.
 */
async function main() {
    console.log('\n--- Amazon Marketing Stream Subscription Script ---');
    try {
        const accessToken = await getAdsApiAccessToken();

        for (const dataSetId of DATASETS_TO_SUBSCRIBE) {
            console.log(`\n--- Processing Dataset: ${dataSetId} ---`);
            const alreadySubscribed = await checkExistingSubscription(accessToken, dataSetId);
            if (alreadySubscribed) {
                console.log(`Skipping '${dataSetId}' as an active subscription already exists.`);
                continue;
            }
            await subscribeToStream(accessToken, dataSetId);
        }
        
        console.log("\n--- All datasets processed. ---")

    } catch (error) {
        console.error('\n💥 An error occurred during the subscription process:');
        console.error(error.message);
    }
}

main();