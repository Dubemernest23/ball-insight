const axios = require('axios');

/**
 * Football-Data.org API Service
 * FREE TIER: 10 requests/minute, 12 competitions unlimited
 * Get your FREE API key: https://www.football-data.org/client/register
 */

class FootballDataService {
  constructor() {
    this.apiKey = process.env.FOOTBALL_DATA_API_KEY;
    this.baseURL = 'https://api.football-data.org/v4';

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-Auth-Token': this.apiKey
      }
    });

    // Competition code mapping
    this.competitions = {
      'PL':  { id: 2021, name: 'Premier League',   country: 'England' },
      'BL1': { id: 2002, name: 'Bundesliga',        country: 'Germany' },
      'SA':  { id: 2019, name: 'Serie A',           country: 'Italy'   },
      'PD':  { id: 2014, name: 'La Liga',           country: 'Spain'   },
      'FL1': { id: 2015, name: 'Ligue 1',           country: 'France'  },
      'CL':  { id: 2001, name: 'Champions League',  country: 'Europe'  }
    };
  }

  // ─── API Methods ────────────────────────────────────────────────────────────

  async getTeam(teamId) {
    try {
      const response = await this.client.get(`/teams/${teamId}`);
      return response.data;
    } catch (error) {
      this.handleError('getTeam', error);
      throw error;
    }
  }

  async getTeamMatches(teamId, status = 'FINISHED', limit = 20) {
    try {
      const response = await this.client.get(`/teams/${teamId}/matches`, {
        params: { status, limit }
      });
      return response.data;
    } catch (error) {
      this.handleError('getTeamMatches', error);
      throw error;
    }
  }

  async getMatch(matchId) {
    try {
      const response = await this.client.get(`/matches/${matchId}`);
      return response.data;
    } catch (error) {
      this.handleError('getMatch', error);
      throw error;
    }
  }

  async getCompetitionMatches(competitionCode = 'PL', status = 'FINISHED', season = 2025) {
    try {
      const response = await this.client.get(`/competitions/${competitionCode}/matches`, {
        params: { status, season }
      });
      return response.data;
    } catch (error) {
      this.handleError('getCompetitionMatches', error);
      throw error;
    }
  }

  async getCompetitionTeams(competitionCode = 'PL', season = 2025) {
    try {
      const response = await this.client.get(`/competitions/${competitionCode}/teams`, {
        params: { season }
      });
      return response.data;
    } catch (error) {
      this.handleError('getCompetitionTeams', error);
      throw error;
    }
  }

  async getStandings(competitionCode = 'PL') {
    try {
      const response = await this.client.get(`/competitions/${competitionCode}/standings`);
      return response.data;
    } catch (error) {
      this.handleError('getStandings', error);
      throw error;
    }
  }

  // ─── Converters ─────────────────────────────────────────────────────────────

  /**
   * Convert Football-Data.org match to our DB format.
   *
   * FIX: home_team_id / away_team_id are now resolved through the
   *      teamIdMap that is built during seeding, so the IDs actually
   *      exist in the `teams` table before we try to insert a match.
   *      When called from analysisService (no map), the raw API IDs are
   *      used as a fallback — those teams should already be in the DB
   *      from a previous seed run.
   */
  convertMatchToOurFormat(match, teamIdMap = null) {
    const mappedCompetitionId = this.getCompetitionId(match.competition?.code);
    const competitionId = match.competition?.id ?? mappedCompetitionId ?? null;

    let season = 2024;
    if (match.season?.startDate) {
      season = new Date(match.season.startDate).getFullYear();
    }

    // Resolve team IDs via map when available (seed script path)
    const rawHomeId = match.homeTeam?.id;
    const rawAwayId = match.awayTeam?.id;

    const homeTeamId = teamIdMap ? (teamIdMap[rawHomeId] ?? null) : (rawHomeId ?? null);
    const awayTeamId = teamIdMap ? (teamIdMap[rawAwayId] ?? null) : (rawAwayId ?? null);

    return {
      id:                    match.id,
      league_id:             competitionId,
      season:                season,
      match_date:            match.utcDate,
      home_team_id:          homeTeamId,
      away_team_id:          awayTeamId,
      home_score:            match.score?.fullTime?.home   ?? null,
      away_score:            match.score?.fullTime?.away   ?? null,
      halftime_home_score:   match.score?.halfTime?.home  ?? null,
      halftime_away_score:   match.score?.halfTime?.away  ?? null,
      status:                this.convertStatus(match.status),
      venue:                 match.venue || `${match.homeTeam?.name ?? 'Home'} Stadium`,
      home_team_name:        match.homeTeam?.name || 'Unknown',
      away_team_name:        match.awayTeam?.name || 'Unknown',
      // carry raw IDs so event extraction still works
      _rawHomeId:            rawHomeId,
      _rawAwayId:            rawAwayId
    };
  }

  /**
   * Extract goal events from a raw API match object.
   *
   * FIX: own-goal team flip now uses _rawHomeId/_rawAwayId so it works
   *      correctly whether or not a teamIdMap was applied.
   */
  extractGoalEvents(rawMatch, teamIdMap = null) {
    const events = [];

    if (!rawMatch.goals || rawMatch.goals.length === 0) return events;

    const rawHomeId = rawMatch.homeTeam?.id;
    const rawAwayId = rawMatch.awayTeam?.id;

    rawMatch.goals.forEach(goal => {
      let rawTeamId = goal.team?.id ?? goal.scorer?.team?.id ?? null;

      // Flip team for own goals
      if (goal.type === 'OWN' && rawTeamId != null) {
        rawTeamId = rawTeamId === rawHomeId ? rawAwayId : rawHomeId;
      }

      // Resolve to DB id if map is provided
      const teamId = teamIdMap
        ? (teamIdMap[rawTeamId] ?? teamIdMap[rawHomeId] ?? rawHomeId)
        : (rawTeamId ?? rawHomeId);

      events.push({
        match_id:     rawMatch.id,
        team_id:      teamId,
        player_name:  goal.scorer?.name || 'Unknown',
        event_type:   'Goal',
        event_detail: this.convertGoalType(goal.type),
        time_elapsed: goal.minute || 0,
        time_extra:   0,
        comments:     goal.assist?.name ? `Assisted by ${goal.assist.name}` : ''
      });
    });

    return events;
  }

  convertTeamToOurFormat(team) {
    return {
      id:      team.id,
      name:    team.name || team.shortName,
      code:    team.tla || team.shortName?.substring(0, 3).toUpperCase(),
      country: team.area?.name || 'Unknown',
      logo:    team.crest || ''
    };
  }

  convertCompetitionToOurFormat(competition) {
    return {
      id:      competition.id,
      name:    competition.name,
      country: competition.area?.name || 'International',
      season:  2024,
      logo:    competition.emblem || ''
    };
  }

  // ─── Status / Type Maps ──────────────────────────────────────────────────────

  convertStatus(status) {
    const map = {
      'FINISHED':  'FT',
      'SCHEDULED': 'NS',
      'LIVE':      'LIVE',
      'IN_PLAY':   'LIVE',
      'PAUSED':    'HT',
      'POSTPONED': 'PST',
      'CANCELLED': 'CANC',
      'SUSPENDED': 'SUSP'
    };
    return map[status] || status;
  }

  convertGoalType(type) {
    const map = {
      'REGULAR':  'Normal Goal',
      'PENALTY':  'Penalty',
      'OWN':      'Own Goal',
      'FREEKICK': 'Free-kick'
    };
    return map[type] || 'Normal Goal';
  }

  getCompetitionId(competitionCode) {
    const map = {
      'PL':  2021,
      'BL1': 2002,
      'SA':  2019,
      'PD':  2014,
      'FL1': 2015,
      'CL':  2001,
      'ELC': 2016,
      'DED': 2003,
      'PPL': 2017
    };
    return map[competitionCode] || null;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  handleError(method, error) {
    if (error.response) {
      const { status } = error.response;
      const message = error.response.data?.message || error.message;
      if (status === 403) {
        console.error(`❌ ${method}: Invalid API key or competition not in free tier`);
      } else if (status === 429) {
        console.error(`❌ ${method}: Rate limit exceeded (10 req/min)`);
      } else {
        console.error(`❌ ${method}: ${status} - ${message}`);
      }
    } else {
      console.error(`❌ ${method}:`, error.message);
    }
  }

  async delay(ms = 6000) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new FootballDataService();
