// backend/db.js
import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const { Pool } = pg;

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
