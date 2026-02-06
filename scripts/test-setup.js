require('dotenv').config();
const axios = require('axios');
const { testConnection } = require('../src/config/database');

async function runTests() {
  console.log('🧪 Running Setup Tests...\n');
  
  let allPassed = true;

  // Test 1: Environment Variables
  console.log('1️⃣ Testing Environment Variables...');
  const requiredVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'API_FOOTBALL_KEY'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.log('   ❌ Missing environment variables:', missingVars.join(', '));
    allPassed = false;
  } else {
    console.log('   ✅ All required environment variables are set');
  }

  // Test 2: Database Connection
  console.log('\n2️⃣ Testing Database Connection...');
  const dbConnected = await testConnection();
  if (!dbConnected) {
    allPassed = false;
  }

  // Test 3: Database Tables
  console.log('\n3️⃣ Testing Database Tables...');
  try {
    const { pool } = require('../src/config/database');
    const [tables] = await pool.query('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0]);
    
    const requiredTables = ['teams', 'leagues', 'matches', 'match_events', 'match_statistics', 'analysis_cache'];
    const missingTables = requiredTables.filter(table => !tableNames.includes(table));
    
    if (missingTables.length > 0) {
      console.log('   ❌ Missing tables:', missingTables.join(', '));
      console.log('   💡 Run: npm run db:migrate');
      allPassed = false;
    } else {
      console.log('   ✅ All required tables exist');
      console.log('   📊 Tables found:', tableNames.join(', '));
    }
    
    await pool.end();
  } catch (error) {
    console.log('   ❌ Database error:', error.message);
    allPassed = false;
  }

  // Test 4: API-Football Connection
  console.log('\n4️⃣ Testing API-Football Connection...');
  try {
    const response = await axios.get('https://v3.football.api-sports.io/status', {
      headers: {
        'x-rapidapi-key': process.env.API_FOOTBALL_KEY,
        'x-rapidapi-host': process.env.API_FOOTBALL_HOST || 'v3.football.api-sports.io'
      }
    });
    
    if (response.data && response.data.response) {
      console.log('   ✅ API-Football connection successful');
      console.log('   📊 Account:', response.data.response.account.firstname || 'N/A');
      console.log('   📊 Requests remaining today:', response.data.response.requests.current);
    }
  } catch (error) {
    console.log('   ❌ API-Football connection failed');
    if (error.response && error.response.status === 401) {
      console.log('   💡 Invalid API key. Check your API_FOOTBALL_KEY in .env');
    } else {
      console.log('   💡 Error:', error.message);
    }
    allPassed = false;
  }

  // Test 5: Required Packages
  console.log('\n5️⃣ Testing Required Packages...');
  const requiredPackages = ['express', 'ejs', 'mysql2', 'axios', 'dotenv'];
  let packagesMissing = false;
  
  for (const pkg of requiredPackages) {
    try {
      require(pkg);
    } catch (error) {
      console.log(`   ❌ Package '${pkg}' not found`);
      packagesMissing = true;
    }
  }
  
  if (!packagesMissing) {
    console.log('   ✅ All required packages are installed');
  } else {
    console.log('   💡 Run: npm install');
    allPassed = false;
  }

  // Final Result
  console.log('\n' + '='.repeat(50));
  if (allPassed) {
    console.log('🎉 All tests passed! Your setup is complete.');
    console.log('Run: npm run dev');
  } else {
    console.log('❌ Some tests failed. Please fix the issues above.');
  }
  console.log('='.repeat(50) + '\n');
}

// Run tests
runTests();
