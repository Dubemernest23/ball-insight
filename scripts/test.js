// const axios = require('axios');
// axios.get('https://api.football-data.org/v4/competitions', {
//   headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY }
// }).then(r => console.log('✅ API reachable, status:', r.status))
//   .catch(e => console.error('❌ Failed:', e.message));



require('dotenv').config();
const axios = require('axios');
console.log('🔑 API Key loaded:', process.env.FOOTBALL_DATA_API_KEY ? 'YES (' + process.env.FOOTBALL_DATA_API_KEY.substring(0,6) + '...)' : 'NO - KEY IS MISSING');
axios.get('https://api.football-data.org/v4/competitions', {
  headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY },
  timeout: 10000
}).then(r => console.log('✅ API reachable, status:', r.status))
  .catch(e => console.error('❌ Failed:', e.response ? e.response.status + ' - ' + e.response.data.message : e.message));
  