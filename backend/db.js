// backend/db.js
import pg from 'pg';

const { Pool } = pg;

// --- Pre-flight check for essential environment variables ---
const requiredEnvVars = ['DB_USER', 'DB_HOST', 'DB_DATABASE', 'DB_PASSWORD', 'DB_PORT'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
    console.error('\n\n================================================================================');
    console.error(' F A T A L   D A T A B A S E   C O N N E C T I O N   E R R O R');
    console.error('--------------------------------------------------------------------------------');
    console.error(` The following required environment variables are missing: ${missingVars.join(', ')}`);
    console.error("\n Please create or check your 'backend/.env' file and ensure it contains");
    console.error(' all the necessary PostgreSQL connection details.');
    console.error('\n Example from backend/.env.example.txt:');
    console.error(' DB_USER=yourdbuser');
    console.error(' DB_HOST=localhost');
    console.error(' DB_DATABASE=amazon_data_analyzer');
    console.error(' DB_PASSWORD=your_secure_password_here');
    console.error(' DB_PORT=5432');
    console.error('================================================================================\n\n');
    process.exit(1); // Stop the application from starting
}


// The database connection pool.
// It uses the environment variables loaded by dotenv in server.js.
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

pool.on('connect', () => {
  console.log('🔗 Connected to the PostgreSQL database!');
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

export default pool;