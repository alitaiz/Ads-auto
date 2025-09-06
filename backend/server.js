// backend/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Import API route modules
import ppcManagementApiRoutes from './routes/ppcManagementApi.js';
import spSearchTermsRoutes from './routes/spSearchTerms.js';
import streamRoutes from './routes/stream.js';
import ppcManagementRoutes from './routes/ppcManagement.js';

const app = express();
const port = process.env.PORT || 4001;

// --- Middlewares ---
// Enable Cross-Origin Resource Sharing for all routes
app.use(cors());
// Enable parsing of JSON request bodies
app.use(express.json());

// --- API Routes ---
// Mount the various API routers to their respective base paths.
// This ensures that frontend requests are directed to the correct handler.
app.use('/api/amazon', ppcManagementApiRoutes);
app.use('/api', spSearchTermsRoutes);
app.use('/api', streamRoutes);
app.use('/api', ppcManagementRoutes);

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
app.listen(port, () => {
    console.log(`🚀 Backend server is listening at http://localhost:${port}`);
    // A simple check on startup to warn if essential environment variables are missing
    if (!process.env.DB_USER || !process.env.ADS_API_CLIENT_ID) {
        console.warn('⚠️ WARNING: Essential environment variables (e.g., DB_USER, ADS_API_CLIENT_ID) are not set. The application may not function correctly.');
    }
});
