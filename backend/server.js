// backend/server.js
import express from 'express';
import cors from 'cors';

// Import API route modules
import ppcManagementApiRoutes from './routes/ppcManagementApi.js';
import spSearchTermsRoutes from './routes/spSearchTerms.js';
import streamRoutes from './routes/stream.js';
import ppcManagementRoutes from './routes/ppcManagement.js';
import salesAndTrafficRoutes from './routes/salesAndTraffic.js';
import databaseRoutes from './routes/database.js'; // Replaced eventsRoutes
import automationRoutes from './routes/automation.js';
import aiRoutes from './routes/ai.js';
import aiConversationRoutes from './routes/aiConversations.js'; // New route for chat history
import queryPerformanceRoutes from './routes/queryPerformance.js';
import productDetailsRoutes from './routes/productDetails.js';
import listingsRoutes from './routes/listings.js';
import { startRulesEngine } from './services/rulesEngine.js';
import { syncGeminiKeys } from './helpers/keySync.js';

const app = express();
const port = process.env.PORT;

// --- Middlewares ---
// Enable Cross-Origin Resource Sharing for all routes
app.use(cors());
// Enable parsing of JSON request bodies with an increased limit to prevent "PayloadTooLargeError"
app.use(express.json({ limit: '50mb' }));

// --- API Routes ---
// Mount the various API routers to their respective base paths.
// This ensures that frontend requests are directed to the correct handler.
app.use('/api/amazon', ppcManagementApiRoutes);
app.use('/api', spSearchTermsRoutes);
app.use('/api', streamRoutes);
app.use('/api', ppcManagementRoutes);
app.use('/api', salesAndTrafficRoutes);
app.use('/api', databaseRoutes); // Use the new database router
app.use('/api', automationRoutes);
app.use('/api', aiRoutes);
app.use('/api/ai/conversations', aiConversationRoutes); // Mount the new conversation routes
app.use('/api', queryPerformanceRoutes);
app.use('/api', productDetailsRoutes);
app.use('/api', listingsRoutes);


// --- Root Endpoint for health checks ---
app.get('/', (req, res) => {
  res.send('PPC Auto Backend is running!');
});

// --- Error Handling ---
// Catch-all middleware for requests to undefined routes
app.use((req, res, next) => {
    res.status(404).json({ message: 'Endpoint not found.' });
});

// Generic error handler middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'An internal server error occurred.' });
});

// --- Start Server ---
(async () => {
    try {
        // Synchronize API keys from .env to the database on startup.
        await syncGeminiKeys();

        app.listen(port, () => {
            console.log(`🚀 Backend server is listening at http://localhost:${port}`);
            // A simple check on startup to warn if essential environment variables are missing
            if (!process.env.DB_USER || !process.env.ADS_API_CLIENT_ID || !process.env.SP_API_CLIENT_ID) {
                console.warn('⚠️ WARNING: Essential environment variables (e.g., DB_USER, ADS_API_CLIENT_ID, SP_API_CLIENT_ID) are not set. The application may not function correctly.');
            }
            startRulesEngine();
        });
    } catch (err) {
        console.error('Failed to initialize and start the server:', err);
        process.exit(1);
    }
})();
