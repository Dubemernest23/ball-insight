const { pool } = require('../config/database');
const apiFootballData = require('./apiService');  // ← Using football-data.org now

/**
 * Analysis Service
 * Implements Cache-Aside Pattern for efficient data fetching
 * Analyzes goal timing, BTTS, Over/Under, First to Score patterns
 */
class AnalysisService {
  
  /**
   * Main analysis function - implements cache-aside pattern
   * @param {number} teamId - Team ID to analyze
   * @param {number} numMatches - Number of matches to analyze (default: 10)
   * @param {string} homeAway - 'home', 'away', or 'both' (default: 'both')
   * @returns {object} Complete analysis results
   */
  async analyzeTeam(teamId, numMatches = 10, homeAway = 'both') {
    console.log(`📊 Analyzing team ${teamId} - Last ${numMatches} matches (${homeAway})`);

    // Step 1: Check cache first
    const cached = await this.checkCache(teamId, numMatches, homeAway);
    if (cached) {
      console.log('✅ Serving from cache');
      return cached;
    }

    console.log('🔄 Cache miss - fetching fresh data...');

    // Step 2: Get team data
    const team = await this.getTeamData(teamId);
    if (!team) {
      console.warn(`Team ${teamId} not found`);
    }

    // Step 3: Get matches (DB first, then API)
    const matches = await this.getMatches(teamId, numMatches, homeAway);

    // Step 4: Get events for matches
    const matchesWithEvents = await this.getMatchEvents(matches);

    // Step 5: Run analysis
    const analysis = this.runAnalysis(teamId, matchesWithEvents);

    // Step 6: Cache results
    await this.cacheResults(teamId, numMatches, homeAway, analysis);

    return analysis;
  }

  /**
   * Safe cache check - handles both string and object from DB
   */
  async checkCache(teamId, numMatches, homeAway) {
    try {
      const [rows] = await pool.query(`
        SELECT data, created_at 
        FROM analysis_cache 
        WHERE team_id = ? 
          AND analysis_type = 'team_analysis'
          AND matches_analyzed = ?
          AND home_away = ?
          AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ORDER BY created_at DESC
        LIMIT 1
      `, [teamId, numMatches, homeAway]);

      if (rows.length === 0) return null;

      const rawData = rows[0].data;

      if (typeof rawData === 'object' && rawData !== null) {
        console.log(`Cache hit - already object for team ${teamId}`);
        return rawData;
      }

      if (typeof rawData === 'string') {
        try {
          const parsed = JSON.parse(rawData);
          console.log(`Cache hit - parsed string for team ${teamId}`);
          return parsed;
        } catch (parseErr) {
          console.error(`Cache parse failed for team ${teamId}:`, parseErr.message);
          console.error('Raw (first 100 chars):', rawData.substring(0, 100));
          return null;
        }
      }

      console.warn(`Unexpected cache data type for team ${teamId}:`, typeof rawData);
      return null;
    } catch (error) {
      console.error('Error checking cache:', error.message);
      return null;
    }
  }

  async getTeamData(teamId) {
    try {
      const [rows] = await pool.query('SELECT * FROM teams WHERE id = ?', [teamId]);
      if (rows.length > 0) return rows[0];

      console.log(`⚠️ Team ${teamId} not in DB - no API fetch implemented yet`);
      return null;
    } catch (error) {
      console.error('Error getting team data:', error.message);
      return null;
    }
  }

  async getMatches(teamId, numMatches, homeAway) {
    try {
      let whereClause = '';
      let params = [teamId, teamId];

      if (homeAway === 'home') {
        whereClause = 'WHERE m.home_team_id = ?';
        params = [teamId];
      } else if (homeAway === 'away') {
        whereClause = 'WHERE m.away_team_id = ?';
        params = [teamId];
      } else {
        whereClause = 'WHERE (m.home_team_id = ? OR m.away_team_id = ?)';
      }

      const [matches] = await pool.query(`
        SELECT m.*, 
               ht.name as home_team_name,
               at.name as away_team_name
        FROM matches m
        JOIN teams ht ON m.home_team_id = ht.id
        JOIN teams at ON m.away_team_id = at.id
        ${whereClause}
          AND m.status = 'FINISHED'
        ORDER BY m.match_date DESC
        LIMIT ?
      `, [...params, numMatches]);

      if (matches.length < numMatches) {
        console.log(`⚠️ Only ${matches.length}/${numMatches} matches in DB - fetching from football-data.org...`);
        await this.fetchAndStoreMatches(teamId, numMatches);

        const [newMatches] = await pool.query(`
          SELECT m.*, 
                 ht.name as home_team_name,
                 at.name as away_team_name
          FROM matches m
          JOIN teams ht ON m.home_team_id = ht.id
          JOIN teams at ON m.away_team_id = at.id
          ${whereClause}
            AND m.status = 'FINISHED'
          ORDER BY m.match_date DESC
          LIMIT ?
        `, [...params, numMatches]);

        return newMatches;
      }

      return matches;
    } catch (error) {
      console.error('Error getting matches:', error.message);
      throw error;
    }
  }

  /**
   * Fetch recent finished matches from football-data.org and store them
   */
  async fetchAndStoreMatches(teamId, numMatches) {
    try {
      console.log(`[FootballData] Fetching last ${numMatches} finished matches for team ${teamId}`);

      const matches = await apiFootballData.getTeamRecentMatches(teamId, numMatches);

      if (matches.length === 0) {
        console.warn(`[FootballData] No finished matches found for team ${teamId}`);
        return;
      }

      let storedCount = 0;

      for (const m of matches) {
        try {
          const matchDate = m.utcDate
            ? m.utcDate.replace('T', ' ').replace('Z', '')
            : null;

          await pool.query(`
            INSERT INTO matches 
            (id, league_id, season, match_date, home_team_id, away_team_id, 
             home_score, away_score, status, venue)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              home_score = VALUES(home_score),
              away_score = VALUES(away_score),
              status = VALUES(status),
              venue = VALUES(venue)
          `, [
            m.id,
            m.competition.id,
            m.season.startDate.slice(0, 4),
            matchDate,
            m.homeTeam.id,
            m.awayTeam.id,
            m.score.fullTime.home ?? null,
            m.score.fullTime.away ?? null,
            m.status,
            m.venue || ''
          ]);

          // Optional: store basic goal events (expand later with getMatchDetails)
          await this.storeBasicGoalEvents(m.id, m);

          storedCount++;
        } catch (insertErr) {
          console.error(`Failed to store match ${m.id}:`, insertErr.message);
        }
      }

      console.log(`[FootballData] Stored/updated ${storedCount} matches for team ${teamId}`);
    } catch (error) {
      console.error('[FootballData] fetchAndStoreMatches failed:', error.message);
    }
  }

  /**
   * Basic goal event storage (placeholder — expand with full events later)
   */
  async storeBasicGoalEvents(matchId, matchData) {
    try {
      const homeGoals = matchData.score.fullTime.home ?? 0;
      const awayGoals = matchData.score.fullTime.away ?? 0;

      if (homeGoals > 0 || awayGoals > 0) {
        console.log(`Match ${matchId}: ${homeGoals} home goals, ${awayGoals} away goals`);
        // Later: call apiFootballData.getMatchDetails(matchId) and parse real events
      }
    } catch (err) {
      console.error(`Failed to store events for match ${matchId}:`, err.message);
    }
  }

  /**
   * Get events for all matches (from DB)
   */
  async getMatchEvents(matches) {
    try {
      const matchIds = matches.map(m => m.id);
      
      if (matchIds.length === 0) return [];

      const [events] = await pool.query(`
        SELECT * FROM match_events 
        WHERE match_id IN (?)
        ORDER BY match_id, time_elapsed
      `, [matchIds]);

      const matchesWithEvents = matches.map(match => ({
        ...match,
        events: events.filter(e => e.match_id === match.id)
      }));

      return matchesWithEvents;
    } catch (error) {
      console.error('Error getting match events:', error.message);
      throw error;
    }
  }

  /**
   * Run complete analysis on matches
   */
  runAnalysis(teamId, matches) {
    const analysis = {
      team_id: teamId,
      matches_analyzed: matches.length,
      goal_timing: this.analyzeGoalTiming(teamId, matches),
      first_to_score: this.analyzeFirstToScore(teamId, matches),
      btts: this.analyzeBTTS(matches),
      over_under: this.analyzeOverUnder(matches),
      home_away: this.analyzeHomeAway(teamId, matches),
      halftime_fulltime: this.analyzeHalftimeFulltime(teamId, matches)
    };

    return analysis;
  }

  analyzeGoalTiming(teamId, matches) {
    const intervals = {
      '0-15': { scored: 0, conceded: 0 },
      '15-30': { scored: 0, conceded: 0 },
      '30-45': { scored: 0, conceded: 0 },
      '45-60': { scored: 0, conceded: 0 },
      '60-75': { scored: 0, conceded: 0 },
      '75-90': { scored: 0, conceded: 0 }
    };

    matches.forEach(match => {
      match.events.forEach(event => {
        if (event.event_type === 'Goal') {
          const minute = event.time_elapsed;
          const interval = this.getTimeInterval(minute);
          
          if (event.team_id === teamId) {
            intervals[interval].scored++;
          } else {
            intervals[interval].conceded++;
          }
        }
      });
    });

    const totalMatches = matches.length;
    const result = {};
    
    Object.keys(intervals).forEach(interval => {
      result[interval] = {
        scored: intervals[interval].scored,
        conceded: intervals[interval].conceded,
        scored_percentage: Math.round((intervals[interval].scored / totalMatches) * 100 || 0),
        conceded_percentage: Math.round((intervals[interval].conceded / totalMatches) * 100 || 0)
      };
    });

    return result;
  }

  getTimeInterval(minute) {
    if (minute <= 15) return '0-15';
    if (minute <= 30) return '15-30';
    if (minute <= 45) return '30-45';
    if (minute <= 60) return '45-60';
    if (minute <= 75) return '60-75';
    return '75-90';
  }

  analyzeFirstToScore(teamId, matches) {
    let firstToScoreCount = 0;

    matches.forEach(match => {
      const goals = match.events
        .filter(e => e.event_type === 'Goal')
        .sort((a, b) => a.time_elapsed - b.time_elapsed);

      if (goals.length > 0 && goals[0].team_id === teamId) {
        firstToScoreCount++;
      }
    });

    return {
      count: firstToScoreCount,
      total: matches.length,
      percentage: Math.round((firstToScoreCount / matches.length) * 100 || 0)
    };
  }

  analyzeBTTS(matches) {
    let bttsCount = 0;

    matches.forEach(match => {
      const homeGoals = match.events.filter(e => 
        e.event_type === 'Goal' && e.team_id === match.home_team_id
      ).length;
      
      const awayGoals = match.events.filter(e => 
        e.event_type === 'Goal' && e.team_id === match.away_team_id
      ).length;

      if (homeGoals > 0 && awayGoals > 0) {
        bttsCount++;
      }
    });

    return {
      count: bttsCount,
      total: matches.length,
      percentage: Math.round((bttsCount / matches.length) * 100 || 0)
    };
  }

  analyzeOverUnder(matches) {
    const thresholds = {
      '0.5': 0,
      '1.5': 0,
      '2.5': 0,
      '3.5': 0,
      '4.5': 0
    };

    matches.forEach(match => {
      const totalGoals = (match.home_score || 0) + (match.away_score || 0);
      
      Object.keys(thresholds).forEach(threshold => {
        if (totalGoals > parseFloat(threshold)) {
          thresholds[threshold]++;
        }
      });
    });

    const result = {};
    Object.keys(thresholds).forEach(threshold => {
      result[`over_${threshold}`] = {
        count: thresholds[threshold],
        total: matches.length,
        percentage: Math.round((thresholds[threshold] / matches.length) * 100 || 0)
      };
    });

    return result;
  }

  analyzeHomeAway(teamId, matches) {
    const stats = {
      home: { wins: 0, draws: 0, losses: 0, total: 0 },
      away: { wins: 0, draws: 0, losses: 0, total: 0 }
    };

    matches.forEach(match => {
      const isHome = match.home_team_id === teamId;
      const homeScore = match.home_score || 0;
      const awayScore = match.away_score || 0;

      if (isHome) {
        stats.home.total++;
        if (homeScore > awayScore) stats.home.wins++;
        else if (homeScore === awayScore) stats.home.draws++;
        else stats.home.losses++;
      } else {
        stats.away.total++;
        if (awayScore > homeScore) stats.away.wins++;
        else if (homeScore === awayScore) stats.away.draws++;
        else stats.away.losses++;
      }
    });

    return stats;
  }

  analyzeHalftimeFulltime(teamId, matches) {
    const patterns = {
      'W/W': 0, 'W/D': 0, 'W/L': 0,
      'D/W': 0, 'D/D': 0, 'D/L': 0,
      'L/W': 0, 'L/D': 0, 'L/L': 0
    };

    matches.forEach(match => {
      const isHome = match.home_team_id === teamId;
      
      const htResult = this.getMatchResult(
        match.halftime_home_score, 
        match.halftime_away_score, 
        isHome
      );
      
      const ftResult = this.getMatchResult(
        match.home_score, 
        match.away_score, 
        isHome
      );

      const pattern = `${htResult}/${ftResult}`;
      if (patterns[pattern] !== undefined) {
        patterns[pattern]++;
      }
    });

    return patterns;
  }

  getMatchResult(homeScore, awayScore, isHome) {
    if (homeScore === null || awayScore === null) return 'D';
    
    if (isHome) {
      if (homeScore > awayScore) return 'W';
      if (homeScore === awayScore) return 'D';
      return 'L';
    } else {
      if (awayScore > homeScore) return 'W';
      if (homeScore === awayScore) return 'D';
      return 'L';
    }
  }

  async cacheResults(teamId, numMatches, homeAway, analysis) {
    try {
      await pool.query(`
        INSERT INTO analysis_cache 
        (team_id, analysis_type, time_period, home_away, data, matches_analyzed, expires_at)
        VALUES (?, 'team_analysis', ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))
      `, [
        teamId,
        `last_${numMatches}`,
        homeAway,
        JSON.stringify(analysis),
        numMatches
      ]);

      console.log('✅ Analysis cached for 24 hours');
    } catch (error) {
      console.error('Error caching results:', error.message);
    }
  }
}

module.exports = new AnalysisService();