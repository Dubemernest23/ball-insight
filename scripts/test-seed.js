// scripts/test-seed-fd.js
require('dotenv').config();
const axios = require('axios');

const TOKEN =  "b31c7d1d578843989e51ec6936171388";

if (!TOKEN) {
  throw new Error('Add FOOTBALL_DATA_TOKEN to your .env file');
}

const BASE = 'https://api.football-data.org/v4';

const api = axios.create({
  baseURL: BASE,
  headers: {
    'X-Auth-Token': TOKEN,
    'Accept': 'application/json'
  }
});

async function testFetchRecentMatches(teamId = 66) {  // 66 = Manchester United (common ID)
  try {
    console.log(`\nFetching recent finished matches for team ID ${teamId}...`);

    const response = await api.get(`/teams/${teamId}/matches`, {
      params: {
        status: 'FINISHED',
        dateFrom: '2025-01-01',  // adjust as needed
        dateTo:   '2026-02-20',
        limit:    20             // max recent ones
      }
    });

    const data = response.data;

    console.log('\nRAW API RESPONSE SUMMARY:');
    console.log('Status code:', response.status);
    console.log('Total matches returned:', data.count || data.matches?.length || 0);
    console.log('Filters applied:', data.filters || 'None');
    console.log('Competition (first match):', data.matches?.[0]?.competition?.name || 'N/A');

    if (data.matches && data.matches.length > 0) {
      console.log('\nFirst 2 matches (summary):');
      data.matches.slice(0, 2).forEach((m, i) => {
        console.log(`Match ${i+1}:`);
        console.log('  - ID:', m.id);
        console.log('  - Date:', m.utcDate);
        console.log('  - Home:', m.homeTeam?.shortName || m.homeTeam?.name);
        console.log('  - Away:', m.awayTeam?.shortName || m.awayTeam?.name);
        console.log('  - Score:', `${m.score?.fullTime?.home ?? '?'} - ${m.score?.fullTime?.away ?? '?'}`);
        console.log('  - Status:', m.status);
        console.log('  - Competition:', m.competition?.name);
      });

      console.log(`\nFull response has ${data.matches.length} matches.`);
      console.log('Example keys in a match object:', Object.keys(data.matches[0]));
    } else {
      console.log('No matches returned.');
      console.log('Full response body:', JSON.stringify(data, null, 2));
    }

  } catch (err) {
    console.error('Fetch error:', err.message);
    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Response data:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

// Run test - change teamId to test different teams (e.g. 57=Arsenal, 65=Man City)
testFetchRecentMatches(66);