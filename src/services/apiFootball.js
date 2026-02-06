const axios = require('axios');

class APIFootballService {
  constructor() {
    this.apiKey = process.env.API_FOOTBALL_KEY;
    this.apiHost = process.env.API_FOOTBALL_HOST || 'v3.football.api-sports.io';
    this.baseURL = `https://${this.apiHost}`;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'x-rapidapi-key': this.apiKey,
        'x-rapidapi-host': this.apiHost
      }
    });
  }

  // Get fixtures by date
  async getFixtures(date, leagueId = null) {
    try {
      const params = { date };
      if (leagueId) params.league = leagueId;
      
      const response = await this.client.get('/fixtures', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching fixtures:', error.message);
      throw error;
    }
  }

  // Get fixture events (goals, cards, etc.) with timing
  async getFixtureEvents(fixtureId) {
    try {
      const response = await this.client.get('/fixtures/events', {
        params: { fixture: fixtureId }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching fixture events:', error.message);
      throw error;
    }
  }

  // Get fixture statistics
  async getFixtureStatistics(fixtureId) {
    try {
      const response = await this.client.get('/fixtures/statistics', {
        params: { fixture: fixtureId }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching fixture statistics:', error.message);
      throw error;
    }
  }

  // Get team fixtures (last N games)
  async getTeamFixtures(teamId, last = 10) {
    try {
      const response = await this.client.get('/fixtures', {
        params: { 
          team: teamId,
          last: last
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching team fixtures:', error.message);
      throw error;
    }
  }

  // Get head to head matches
  async getHeadToHead(team1Id, team2Id) {
    try {
      const response = await this.client.get('/fixtures/headtohead', {
        params: { 
          h2h: `${team1Id}-${team2Id}`
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching H2H data:', error.message);
      throw error;
    }
  }

  // Get leagues
  async getLeagues(country = null) {
    try {
      const params = {};
      if (country) params.country = country;
      
      const response = await this.client.get('/leagues', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching leagues:', error.message);
      throw error;
    }
  }

  // Get teams by league
  async getTeamsByLeague(leagueId, season) {
    try {
      const response = await this.client.get('/teams', {
        params: { 
          league: leagueId,
          season: season
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching teams:', error.message);
      throw error;
    }
  }
}

module.exports = new APIFootballService();
