// backend/server.js
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Configuration ---
// IMPORTANT: Load environment variables right at the start, before any other modules are imported.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

// --- Local Module Imports (Now safe to import) ---
import pool from './db.js';
import ppcManagementApiRoutes from './routes/ppcManagementApi.js';
import spSearchTermsRoutes from './routes/spSearchTerms.js';
import streamRoutes from './routes/stream.js';
import ppcManagementRoutes from './routes/ppcManagement.js';

const app = express();
const port = process.env.PORT || 4001;


// --- Middlewares ---
app.use(cors());
app.use(express.json());


// --- API Routes ---
app.use('/api/amazon', ppcManagementApiRoutes);
app.use('/api', spSearchTermsRoutes);
app.use('/api', streamRoutes);
app.use('/api', ppcManagementRoutes);

// --- Root Endpoint ---
app.get('/', (req, res) => {
  res.send('PPC Auto Backend is running!');
});


// --- Server Initialization ---
const server = app.listen(port, () => {
    console.log(`🚀 Backend server is listening at http://localhost:${port}`);
    if (!process.env.DB_PASSWORD || !process.env.ADS_API_CLIENT_ID) {
        console.warn('⚠️ WARNING: Essential environment variables (e.g., DB_PASSWORD, ADS_API_CLIENT_ID) are not set. The application will not work correctly.');
    }
});

// Robust startup error handling
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ FATAL ERROR: Port ${port} is already in use.`);
    } else {
        console.error('❌ FATAL ERROR on server startup:', err);
    }
    process.exit(1);
});