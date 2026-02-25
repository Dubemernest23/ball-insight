require('dotenv').config();
const refreshService = require('../src/services/refreshService');
const { pool } = require('../src/config/database');

/**
 * Manual Refresh Script
 * Run this any time you want to force an immediate data update:
 *
 *   node scripts/manualRefresh.js
 *   node scripts/manualRefresh.js matches     ← only matches
 *   node scripts/manualRefresh.js standings   ← only standings
 */

async function run() {
  const arg = process.argv[2] || 'all';

  console.log(`\n🚀 Manual refresh triggered: ${arg}\n`);

  try {
    if (arg === 'matches') {
      await refreshService.refreshMatches();
    } else if (arg === 'standings') {
      await refreshService.refreshStandings();
    } else {
      await refreshService.runFullRefresh();
    }
    console.log('\n✅ Done!');
  } catch (err) {
    console.error('\n❌ Refresh failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
