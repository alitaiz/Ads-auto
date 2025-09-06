import express from 'express';
import cors from 'cors';
// The pool is imported here to ensure the .env variables are loaded for the server log.
import pool from './db.js';
import searchTermsRoutes from './routes/searchTerms.js';
import queryPerformanceRoutes from './routes/queryPerformance.js';
import salesAndTrafficRoutes from './routes/salesAndTraffic.js';
import spSearchTermsRoutes from './routes/spSearchTerms.js';
import productDetailsRoutes from './routes/productDetails.js';
import strategicDashboardRoutes from './routes/strategicDashboard.js';
import streamRoutes from './routes/stream.js';
import ppcManagementRoutes from './routes/ppcManagement.js';
import ppcManagementApiRoutes from './routes/ppcManagementApi.js'; // Import the new router

const app = express();
const port = 3001;

// --- CORS Configuration ---
// Allow all origins to prevent issues in development environments like web-based IDEs
// where the origin may be an arbitrary domain.
app.use(cors());

app.use(express.json()); // Add JSON body parser

// Mount the routers
app.use('/api', searchTermsRoutes);
app.use('/api', queryPerformanceRoutes);
app.use('/api', salesAndTrafficRoutes);
app.use('/api', spSearchTermsRoutes);
app.use('/api', productDetailsRoutes);
app.use('/api', strategicDashboardRoutes);
app.use('/api', streamRoutes);
app.use('/api', ppcManagementRoutes);
app.use('/api/amazon', ppcManagementApiRoutes); // Use the new router for Amazon API calls

app.listen(port, () => {
    console.log(`[Server] Backend server started successfully.`);
    console.log(`[Server] Listening on http://localhost:${port}`);
    console.log(`[Server] Connected to PostgreSQL database: ${process.env.DB_DATABASE} on ${process.env.DB_HOST}:${process.env.DB_PORT}`);
});