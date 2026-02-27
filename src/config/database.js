require('dotenv').config();
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

console.log(process.env.DB_HOST);
console.log(process.env.DB_USER);

/**
 * SSL Configuration
 * - Local dev:  reads ca.pem file via DB_SSL_CA path in .env
 * - Render:     reads cert contents directly from DB_SSL_CERT env variable
 * - Neither:    falls back to true (trusts server cert — not recommended for prod)
 */
function getSSLConfig() {
  if (process.env.DB_SSL_CERT) {
    // Render / any platform where you paste the cert as an env var
    return { ca: process.env.DB_SSL_CERT };
  }
  if (process.env.DB_SSL_CA) {
    // Local — path to the downloaded ca.pem file
    return { ca: fs.readFileSync(path.resolve(process.env.DB_SSL_CA)) };
  }
  // Local development without SSL (e.g. local MySQL)
  return false;
}

const dbConfig = {
  host:               process.env.DB_HOST     || 'localhost',
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'ballInsightDB',
  port:               parseInt(process.env.DB_PORT) || 3306,  // FIXED: Aiven uses a non-standard port, must be int
  waitForConnections: true,
  connectionLimit:    5,      // Aiven free tier has a low connection limit — keep this at 5
  queueLimit:         0,
  connectTimeout:     30000,  // 30s — Aiven cold connections can be slow
  ssl:                getSSLConfig()
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test connection — called on server startup
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    console.log(`   Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`   DB:   ${process.env.DB_NAME || 'ballInsightDB'}`);
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('💡 Check: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME in .env');
    console.error('💡 Aiven requires SSL — make sure DB_SSL_CA or DB_SSL_CERT is set');
    return false;
  }
};

module.exports = {
  pool,
  testConnection
};