// backend/server.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Configuration ---
// Load environment variables FIRST. This is the most critical step.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

// --- Dynamic Import & Server Startup ---
// We wrap the server startup in an async function.
// This allows us to use dynamic `await import(...)` statements, which execute
// sequentially and are NOT hoisted. This guarantees that modules like `./db.js`
// are only loaded *after* dotenv has populated `process.env`.
async function startServer() {
    // Dynamically import modules
    const express = (await import('express')).default;
    const cors = (await import('cors')).default;

    // We don't need the `pool` export here, but importing the module
    // ensures the database connection logic (and its pre-flight check) runs.
    await import('./db.js');

    const ppcManagementApiRoutes = (await import('./routes/ppcManagementApi.js')).default;
    const spSearchTermsRoutes = (await import('./routes/spSearchTerms.js')).default;
    const streamRoutes = (await import('./routes/stream.js')).default;
    const ppcManagementRoutes = (await import('./routes/ppcManagement.js')).default;

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
        // The check in db.js already validates this, but a warning here is still useful.
        if (!process.env.DB_PASSWORD || !process.env.ADS_API_CLIENT_ID) {
            console.warn('⚠️ WARNING: Essential environment variables (e.g., DB_PASSWORD, ADS_API_CLIENT_ID) are not set. The application will not work correctly.');
        }
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`❌ FATAL ERROR: Port ${port} is already in use.`);
        } else {
            console.error('❌ FATAL ERROR on server startup:', err);
        }
        process.exit(1);
    });
}

// Execute the async startup function
startServer().catch(err => {
    // This will catch errors from both the dynamic imports and the server setup.
    // The pre-flight check in `db.js` will cause `process.exit(1)`, so this might not
    // always be reached, but it's good practice for other potential import errors.
    console.error('💥 Failed to start server due to a critical error:', err);
    process.exit(1);
});