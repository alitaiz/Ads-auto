// backend/db.js
import pg from 'pg';

// Note: dotenv.config() is intentionally removed from this file.
// The configuration is handled once at the application's entry point (server.js)
// to ensure consistency and prevent loading issues.

const { Pool } = pg;

// --- CRITICAL DATABASE CONFIGURATION CHECK ---
// Provide a clear, actionable error if the database password is not configured.
// This prevents cryptic errors from the 'pg' library downstream.
if (typeof process.env.DB_PASSWORD !== 'string' || process.env.DB_PASSWORD === 'your_secure_db_password_here') {
    const errorMessage = `
    ================================================================================
    FATAL DATABASE ERROR: DB_PASSWORD is not set or is using the default placeholder.
    
    Please check your 'backend/.env' file and ensure that the
    'DB_PASSWORD' variable is correctly set to your PostgreSQL user's password.
    
    Example:
    DB_PASSWORD=your_actual_secure_password
    ================================================================================
    `;
    console.error(errorMessage);
    // Exit the process immediately because the application cannot function without a database.
    process.exit(1);
}


// Create a new PostgreSQL connection pool using credentials from the .env file
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

// Event listener for new client connections
pool.on('connect', () => {
  console.log('🔗 Connected to the PostgreSQL database!');
});

// Event listener for errors from idle clients
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1); // Exit the process to allow for a restart
});

export default pool;