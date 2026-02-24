require('dotenv').config();
const { pool } = require('../src/config/database'); // adjust path to your DB config

async function clearDatabase() {
  try {
    console.log('⚠️  Starting DB cleanup...');

    // Order matters due to foreign keys
    await pool.query('SET FOREIGN_KEY_CHECKS = 0;');

    await pool.query('TRUNCATE TABLE match_statistics;');
    await pool.query('TRUNCATE TABLE match_events;');
    await pool.query('TRUNCATE TABLE matches;');
    await pool.query('TRUNCATE TABLE analysis_cache;');
    await pool.query('TRUNCATE TABLE teams;');     // main one
    await pool.query('TRUNCATE TABLE leagues;');    // optional

    await pool.query('SET FOREIGN_KEY_CHECKS = 1;');

    console.log('✅ Database cleared successfully (teams, matches, events, cache, etc.)');
  } catch (err) {
    console.error('Error clearing database:', err.message);
  } finally {
    await pool.end();
  }
}

clearDatabase();