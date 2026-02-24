// Test API-Football Connection
// Run this after getting your API key to verify it works

const axios = require('axios');
require('dotenv').config();

async function testAPIKey() {
  console.log('🧪 Testing API-Football Connection...\n');

  // Replace this with your actual API key for testing
  const API_KEY = process.env.API_FOOTBALL_KEY || 'YOUR_API_KEY_HERE';
  const API_HOST = 'v3.football.api-sports.io';

  try {
    // Test 1: Check API Status
    console.log('1️⃣ Testing API Status...');
    const statusResponse = await axios.get(`https://${API_HOST}/status`, {
      headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': API_HOST
      }
    });

    if (statusResponse.data.response) {
      console.log('✅ API Connection Successful!\n');
      console.log('📊 Account Details:');
      console.log(`   Name: ${statusResponse.data.response.account.firstname || 'N/A'}`);
      console.log(`   Email: ${statusResponse.data.response.account.email || 'N/A'}`);
      console.log(`   Requests Today: ${statusResponse.data.response.requests.current}/${statusResponse.data.response.requests.limit_day}`);
      console.log('');
    }

    // Test 2: Get Premier League Info
    console.log('2️⃣ Testing Leagues Endpoint...');
    const leaguesResponse = await axios.get(`https://${API_HOST}/leagues`, {
      params: { id: 39 }, // Premier League
      headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': API_HOST
      }
    });

    if (leaguesResponse.data.response.length > 0) {
      const league = leaguesResponse.data.response[0].league;
      console.log(`✅ Successfully fetched: ${league.name} (${league.country})\n`);
    }

    // Test 3: Get a sample team
    console.log('3️⃣ Testing Teams Endpoint...');
    const teamsResponse = await axios.get(`https://${API_HOST}/teams`, {
      params: { 
        league: 39,  // Premier League
        season: 2024 
      },
      headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': API_HOST
      }
    });

    if (teamsResponse.data.response.length > 0) {
      const team = teamsResponse.data.response[0].team;
      console.log(`✅ Successfully fetched team: ${team.name}\n`);
    }

    // Test 4: Get recent fixtures
    console.log('4️⃣ Testing Fixtures Endpoint...');
    const fixturesResponse = await axios.get(`https://${API_HOST}/fixtures`, {
      params: { 
        league: 39,
        season: 2024,
        last: 5
      },
      headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': API_HOST
      }
    });

    if (fixturesResponse.data.response.length > 0) {
      console.log(`✅ Successfully fetched ${fixturesResponse.data.response.length} recent fixtures\n`);
      
      // Show one example
      const match = fixturesResponse.data.response[0];
      console.log('📋 Sample Match:');
      console.log(`   ${match.teams.home.name} ${match.goals.home} - ${match.goals.away} ${match.teams.away.name}`);
      console.log(`   Date: ${new Date(match.fixture.date).toLocaleDateString()}`);
      console.log('');
    }

    console.log('🎉 All tests passed! Your API key is working perfectly!\n');
    console.log('📝 Add this to your .env file:');
    console.log(`API_FOOTBALL_KEY=${API_KEY}`);
    console.log(`API_FOOTBALL_HOST=${API_HOST}`);

  } catch (error) {
    console.error('\n❌ API Test Failed!\n');
    
    if (error.response) {
      if (error.response.status === 401) {
        console.error('🔑 Error: Invalid API Key');
        console.error('💡 Make sure you copied the full API key correctly');
      } else if (error.response.status === 429) {
        console.error('⏰ Error: Rate limit exceeded');
        console.error('💡 You\'ve used all 100 requests for today');
      } else {
        console.error(`📛 Error: ${error.response.status} - ${error.response.statusText}`);
        console.error('💡 Response:', error.response.data);
      }
    } else {
      console.error('📛 Error:', error.message);
      console.error('💡 Check your internet connection');
    }
  }
}

// Run the test
testAPIKey();
