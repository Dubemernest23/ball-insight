const { pool } = require('../config/database');
const footballData = require('./apiService');

/**
 * Analysis Service - Cache-Aside Pattern
 * Analyzes goal timing, BTTS, Over/Under, First to Score, Home/Away patterns.
 *
 * FIX: fetchAndStoreMatches now validates that both home_team_id and
 * away_team_id exist in the `teams` table before inserting a match, 
 * preventing foreign-key violations when the analysisService fetches
 * matches on-the-fly for a team that has opponents not yet in the DB.
 *
 * FIX: halftime score field corrected from `halftime` → `halfTime`
 * (matches the actual Football-Data.org API response shape).
 */

class AnalysisService {

  // ─── Public Entry Point ──────────────────────────────────────────────────────

  async analyzeTeam(teamId, numMatches = 10, homeAway = 'both') {
    console.log(`📊 Analyzing team ${teamId} — Last ${numMatches} matches (${homeAway})`);

    try {
      const cached = await this.checkCache(teamId, numMatches, homeAway);
      if (cached) {
        console.log('✅ Serving from cache');
        return cached;
      }

      console.log('🔄 Cache miss — fetching fresh data...');

      await this.getTeamData(teamId);
      const matches            = await this.getMatches(teamId, numMatches, homeAway);
      const matchesWithEvents  = await this.getMatchEvents(matches);
      const analysis           = await this.runAnalysis(teamId, matchesWithEvents);

      await this.cacheResults(teamId, numMatches, homeAway, analysis);
      return analysis;

    } catch (error) {
      console.error('Error in analyzeTeam:', error);
      throw error;
    }
  }

  // ─── Cache ───────────────────────────────────────────────────────────────────

  async checkCache(teamId, numMatches, homeAway) {
    try {
      const [rows] = await pool.query(`
        SELECT data FROM analysis_cache
        WHERE team_id        = ?
          AND analysis_type  = 'team_analysis'
          AND matches_analyzed = ?
          AND home_away      = ?
          AND created_at     > DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ORDER BY created_at DESC
        LIMIT 1
      `, [teamId, numMatches, homeAway]);

      if (rows.length === 0) return null;

      const cachedData = rows[0].data;
      if (cachedData === null || cachedData === undefined) return null;

      if (typeof cachedData === 'string') {
        try {
          return JSON.parse(cachedData);
        } catch {
          console.warn(`⚠️ Invalid cached JSON for team ${teamId}; ignoring cache entry.`);
          return null;
        }
      }

      if (Buffer.isBuffer(cachedData)) {
        try {
          return JSON.parse(cachedData.toString('utf8'));
        } catch {
          console.warn(`⚠️ Invalid cached JSON buffer for team ${teamId}; ignoring cache entry.`);
          return null;
        }
      }

      if (typeof cachedData === 'object') {
        return cachedData;
      }

      console.warn(`⚠️ Unexpected cache payload type: ${typeof cachedData}`);
      return null;
    } catch (error) {
      console.error('Error checking cache:', error);
      return null;
    }
  }

  async cacheResults(teamId, numMatches, homeAway, analysis) {
    try {
      await pool.query(`
        INSERT INTO analysis_cache
          (team_id, analysis_type, time_period, home_away, data, matches_analyzed, expires_at)
        VALUES (?, 'team_analysis', ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))
      `, [teamId, `last_${numMatches}`, homeAway, JSON.stringify(analysis), numMatches]);
      console.log('✅ Analysis cached for 24 hours');
    } catch (error) {
      console.error('Error caching results:', error);
    }
  }

  // ─── Team Data ───────────────────────────────────────────────────────────────

  async getTeamData(teamId) {
    try {
      const [rows] = await pool.query('SELECT * FROM teams WHERE id = ?', [teamId]);
      if (rows.length > 0) return rows[0];

      console.log('⚠️ Team not in database, fetching from API...');
      const apiTeam = await footballData.getTeam(teamId);
      const team    = footballData.convertTeamToOurFormat(apiTeam);

      await pool.query(`
        INSERT INTO teams (id, name, code, country, logo)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name)
      `, [team.id, team.name, team.code, team.country, team.logo]);

      return team;
    } catch (error) {
      console.error('Error getting team data:', error);
      throw error;
    }
  }

  // ─── Match Fetching ──────────────────────────────────────────────────────────

  async getMatches(teamId, numMatches, homeAway = 'both', leagueId = null) {
    try {
      let whereClauses = ['(m.status = ? OR m.status = ?)'];
      let params       = ['FT', 'FINISHED'];

      if (homeAway === 'home') {
        whereClauses.push('m.home_team_id = ?');
        params.push(teamId);
      } else if (homeAway === 'away') {
        whereClauses.push('m.away_team_id = ?');
        params.push(teamId);
      } else {
        whereClauses.push('(m.home_team_id = ? OR m.away_team_id = ?)');
        params.push(teamId, teamId);
      }

      if (leagueId) {
        whereClauses.push('m.league_id = ?');
        params.push(leagueId);
      }

      const whereSQL = whereClauses.join(' AND ');
      params.push(numMatches);

      const query = `
        SELECT m.*,
               ht.name AS home_team_name,
               at.name AS away_team_name
        FROM   matches m
        JOIN   teams ht ON m.home_team_id = ht.id
        JOIN   teams at ON m.away_team_id = at.id
        WHERE  ${whereSQL}
        ORDER  BY m.match_date DESC
        LIMIT  ?
      `;

      let [rows] = await pool.query(query, params);

      if (rows.length < numMatches / 2) {
        console.log(`Only ${rows.length} matches in DB — fetching from API...`);
        await this.fetchAndStoreMatches(teamId, numMatches * 2);
        [rows] = await pool.query(query, params);
      }

      return rows;
    } catch (error) {
      console.error('Error getting matches:', error);
      throw error;
    }
  }

  /**
   * Fetch matches from API and store safely.
   *
   * FIX: Before inserting each match we check that both team IDs already
   * exist in our `teams` table.  If a team is missing we attempt to upsert
   * it from the API response data embedded in the match object, falling
   * back to a live API call.  This prevents the FK violation that fires
   * when a match references a club we haven't seeded yet.
   */
  async fetchAndStoreMatches(teamId, numMatches) {
    try {
      console.log('🌐 Fetching from Football-Data.org API...');

      const apiResponse = await footballData.getTeamMatches(teamId, 'FINISHED', numMatches);
      if (!apiResponse || !apiResponse.matches) {
        console.log('⚠️ No matches returned from API');
        return;
      }

      const rawMatches = apiResponse.matches;
      console.log(`📥 Fetched ${rawMatches.length} matches from API`);

      let storedCount = 0;

      for (const rawMatch of rawMatches) {
        try {
          // ── Ensure both teams exist in DB ──────────────────────────────
          await this.ensureTeamExists(rawMatch.homeTeam);
          await this.ensureTeamExists(rawMatch.awayTeam);

          // ── Convert & insert match ─────────────────────────────────────
          // No teamIdMap needed here because ensureTeamExists guarantees
          // the raw API ids are present as DB primary keys.
          const match     = footballData.convertMatchToOurFormat(rawMatch);
          await this.ensureLeagueExists(rawMatch.competition, match.season);
          const matchDate = new Date(match.match_date)
            .toISOString()
            .slice(0, 19)
            .replace('T', ' ');

          if (!match.home_team_id || !match.away_team_id) {
            console.warn(`⚠️  Skipping match ${rawMatch.id}: missing team id`);
            continue;
          }

          await pool.query(`
            INSERT INTO matches
              (id, league_id, season, match_date, home_team_id, away_team_id,
               home_score, away_score, halftime_home_score, halftime_away_score,
               status, venue)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              home_score           = VALUES(home_score),
              away_score           = VALUES(away_score),
              halftime_home_score  = VALUES(halftime_home_score),
              halftime_away_score  = VALUES(halftime_away_score),
              status               = VALUES(status)
          `, [
            match.id,
            match.league_id,
            match.season,
            matchDate,
            match.home_team_id,
            match.away_team_id,
            match.home_score,
            match.away_score,
            match.halftime_home_score,
            match.halftime_away_score,
            match.status,
            match.venue
          ]);

          await this.fetchAndStoreEvents(match.id, rawMatch);
          storedCount++;

          if (storedCount < rawMatches.length) {
            await footballData.delay(6000);
          }
        } catch (matchError) {
          console.error(`Error storing match ${rawMatch.id}:`, matchError.message);
        }
      }

      console.log(`✅ Stored ${storedCount} matches from API`);
    } catch (error) {
      console.error('Error fetching from API:', error);
      throw error;
    }
  }

  /**
   * Guarantee a team stub exists in the `teams` table.
   * Uses data already available in the match payload (no extra API call).
   * Falls back to a live API call only if the embedded data is insufficient.
   */
  async ensureTeamExists(teamStub) {
    if (!teamStub?.id) return;

    const [rows] = await pool.query('SELECT id FROM teams WHERE id = ?', [teamStub.id]);
    if (rows.length > 0) return; // already there

    console.log(`⚠️  Team ${teamStub.name ?? teamStub.id} not in DB — inserting stub...`);

    // Try to upsert from the stub data embedded in the match response
    if (teamStub.name) {
      const team = footballData.convertTeamToOurFormat(teamStub);
      await pool.query(`
        INSERT INTO teams (id, name, code, country, logo)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name)
      `, [team.id, team.name, team.code, team.country, team.logo]);
      return;
    }

    // Last resort: fetch full team details from API
    try {
      const apiTeam = await footballData.getTeam(teamStub.id);
      const team    = footballData.convertTeamToOurFormat(apiTeam);
      await pool.query(`
        INSERT INTO teams (id, name, code, country, logo)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name)
      `, [team.id, team.name, team.code, team.country, team.logo]);
    } catch (err) {
      console.error(`Failed to fetch team ${teamStub.id}:`, err.message);
    }
  }

  // ─── Events ──────────────────────────────────────────────────────────────────

  /**
   * Guarantee a competition row exists before inserting matches.
   * Prevents FK failures on matches.league_id -> leagues.id.
   */
  async ensureLeagueExists(competitionStub, season = 2024) {
    const leagueId = competitionStub?.id ?? footballData.getCompetitionId(competitionStub?.code);
    if (!leagueId) return;

    const [rows] = await pool.query('SELECT id FROM leagues WHERE id = ?', [leagueId]);
    if (rows.length > 0) return;

    const leagueName = competitionStub?.name || competitionStub?.code || `League ${leagueId}`;
    console.log(`⚠️  League ${leagueName} not in DB - inserting stub...`);

    await pool.query(`
      INSERT INTO leagues (id, name, country, season, logo)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        country = VALUES(country),
        season = VALUES(season),
        logo = VALUES(logo)
    `, [
      leagueId,
      leagueName,
      competitionStub?.area?.name || 'Unknown',
      Number.isFinite(Number(season)) ? Number(season) : 2024,
      competitionStub?.emblem || ''
    ]);
  }

  async fetchAndStoreEvents(matchId, matchData = null) {
    try {
      if (!matchData) {
        const fullMatch = await footballData.getMatch(matchId);
        matchData = fullMatch.match || fullMatch;
      }

      const events = footballData.extractGoalEvents(matchData);

      for (const event of events) {
        await pool.query(`
          INSERT INTO match_events
            (match_id, team_id, player_name, event_type, event_detail,
             time_elapsed, time_extra, comments)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE time_elapsed = VALUES(time_elapsed)
        `, [
          event.match_id,
          event.team_id,
          event.player_name,
          event.event_type,
          event.event_detail,
          event.time_elapsed,
          event.time_extra || 0,
          event.comments   || ''
        ]);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
      // Non-critical — log and continue
    }
  }

  async getMatchEvents(matches) {
    try {
      const matchIds = matches.map(m => m.id);
      if (matchIds.length === 0) return [];

      const [events] = await pool.query(`
        SELECT * FROM match_events
        WHERE  match_id IN (?)
        ORDER  BY match_id, time_elapsed
      `, [matchIds]);

      return matches.map(match => ({
        ...match,
        events: events.filter(e => e.match_id === match.id)
      }));
    } catch (error) {
      console.error('Error getting match events:', error);
      throw error;
    }
  }

  // ─── Analysis ────────────────────────────────────────────────────────────────

  async runAnalysis(teamId, matches) {
    return {
      team_id:           teamId,
      matches_analyzed:  matches.length,
      goal_timing:       this.analyzeGoalTiming(teamId, matches),
      first_to_score:    this.analyzeFirstToScore(teamId, matches),
      btts:              this.analyzeBTTS(matches),
      over_under:        this.analyzeOverUnder(matches),
      home_away:         this.analyzeHomeAway(teamId, matches),
      halftime_fulltime: this.analyzeHalftimeFulltime(teamId, matches)
    };
  }

  analyzeGoalTiming(teamId, matches) {
    const intervals = {
      '0-15':  { scored: 0, conceded: 0 },
      '15-30': { scored: 0, conceded: 0 },
      '30-45': { scored: 0, conceded: 0 },
      '45-60': { scored: 0, conceded: 0 },
      '60-75': { scored: 0, conceded: 0 },
      '75-90': { scored: 0, conceded: 0 }
    };

    matches.forEach(match => {
      match.events.forEach(event => {
        if (event.event_type === 'Goal') {
          const interval = this.getTimeInterval(event.time_elapsed);
          if (event.team_id === teamId) {
            intervals[interval].scored++;
          } else {
            intervals[interval].conceded++;
          }
        }
      });
    });

    const totalMatches = matches.length || 1;
    const result = {};
    Object.keys(intervals).forEach(interval => {
      result[interval] = {
        scored:              intervals[interval].scored,
        conceded:            intervals[interval].conceded,
        scored_percentage:   Math.round((intervals[interval].scored   / totalMatches) * 100),
        conceded_percentage: Math.round((intervals[interval].conceded / totalMatches) * 100)
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
    let validMatches      = 0;

    matches.forEach(match => {
      const goals = match.events
        .filter(e => e.event_type === 'Goal')
        .sort((a, b) => a.time_elapsed - b.time_elapsed);

      if (goals.length > 0) {
        validMatches++;
        if (goals[0].team_id === teamId) firstToScoreCount++;
      }
    });

    return {
      count:      firstToScoreCount,
      total:      validMatches,
      percentage: validMatches > 0 ? Math.round((firstToScoreCount / validMatches) * 100) : 0
    };
  }

  analyzeBTTS(matches) {
    let bttsCount = 0;
    matches.forEach(match => {
      if ((match.home_score || 0) > 0 && (match.away_score || 0) > 0) bttsCount++;
    });
    return {
      count:      bttsCount,
      total:      matches.length,
      percentage: matches.length > 0 ? Math.round((bttsCount / matches.length) * 100) : 0
    };
  }

  analyzeOverUnder(matches) {
    const thresholds = { '0.5': 0, '1.5': 0, '2.5': 0, '3.5': 0, '4.5': 0 };

    matches.forEach(match => {
      const totalGoals = (match.home_score || 0) + (match.away_score || 0);
      Object.keys(thresholds).forEach(t => {
        if (totalGoals > parseFloat(t)) thresholds[t]++;
      });
    });

    const result       = {};
    const totalMatches = matches.length || 1;
    Object.keys(thresholds).forEach(t => {
      result[`over_${t}`] = {
        count:      thresholds[t],
        total:      matches.length,
        percentage: Math.round((thresholds[t] / totalMatches) * 100)
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
      const isHome    = match.home_team_id === teamId;
      const homeScore = match.home_score || 0;
      const awayScore = match.away_score || 0;
      const bucket    = isHome ? stats.home : stats.away;

      bucket.total++;
      const teamScore = isHome ? homeScore : awayScore;
      const oppScore  = isHome ? awayScore : homeScore;

      if (teamScore > oppScore)      bucket.wins++;
      else if (teamScore === oppScore) bucket.draws++;
      else                             bucket.losses++;
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
      const isHome    = match.home_team_id === teamId;
      const htResult  = this.getMatchResult(match.halftime_home_score, match.halftime_away_score, isHome);
      const ftResult  = this.getMatchResult(match.home_score,          match.away_score,          isHome);
      const pattern   = `${htResult}/${ftResult}`;
      if (patterns[pattern] !== undefined) patterns[pattern]++;
    });

    return patterns;
  }

  getMatchResult(homeScore, awayScore, isHome) {
    if (homeScore === null || awayScore === null) return 'D';
    const teamScore = isHome ? homeScore : awayScore;
    const oppScore  = isHome ? awayScore : homeScore;
    if (teamScore > oppScore)       return 'W';
    if (teamScore === oppScore)     return 'D';
    return 'L';
  }
}

module.exports = new AnalysisService();
