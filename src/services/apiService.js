// src/services/apiFootballData.js
const axios = require('axios');

const BASE_URL = 'https://api.football-data.org/v4';
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;

if (!TOKEN) {
  throw new Error('Missing FOOTBALL_DATA_TOKEN in .env');
}

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-Auth-Token': TOKEN,
    'Accept': 'application/json'
  }
});

class FootballDataService {
  /**
   * Get the most recent finished matches for a team
   * @param {number} teamId - football-data.org team ID
   * @param {number} limit - max number of matches (default 20)
   * @returns {Array} array of match objects
   */
  async getTeamRecentMatches(teamId, limit = 20) {
    try {
      const response = await api.get(`/teams/${teamId}/matches`, {
        params: {
          status: 'FINISHED',
          limit
        }
      });

      let matches = response.data.matches || [];

      // Sort by date descending (most recent first)
      matches = matches.sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate));

      console.log(`[FootballData] Fetched ${matches.length} finished matches for team ${teamId}`);
      return matches;
    } catch (error) {
      console.error(`[FootballData] Error fetching matches for team ${teamId}:`, error.message);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
      return [];
    }
  }

  /**
   * Get detailed match information (including goals, cards, lineups)
   * @param {number} matchId 
   * @returns {Object|null} match object or null
   */
  async getMatchDetails(matchId) {
    try {
      const response = await api.get(`/matches/${matchId}`);
      return response.data.match || null;
    } catch (error) {
      console.error(`[FootballData] Error fetching match ${matchId}:`, error.message);
      return null;
    }
  }

  // Optional: Add more methods later (standings, etc.)
}

module.exports = new FootballDataService();