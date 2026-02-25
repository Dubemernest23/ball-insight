const { pool } = require('../config/database');
const footballData = require('./apiService');

/**
 * Refresh Service
 * Handles scheduled updates for finished matches and standings.
 * Called by the cron job every 12 hours.
 */

const COMPETITIONS = [
  { code: 'PL',  name: 'Premier League', country: 'England' },
  { code: 'BL1', name: 'Bundesliga',     country: 'Germany' },
  { code: 'SA',  name: 'Serie A',        country: 'Italy'   },
  { code: 'PD',  name: 'La Liga',        country: 'Spain'   }
];

const CURRENT_SEASON = 2024;

class RefreshService {

  // ─── Main Entry Points ───────────────────────────────────────────────────────

  /**
   * Refresh finished matches for all competitions.
   * Only fetches matches played since the last refresh to save API calls.
   */
  async refreshMatches() {
    console.log('\n🔄 [Refresh] Starting match refresh...');
    let totalUpdated = 0;

    for (const comp of COMPETITIONS) {
      try {
        const updated = await this._refreshCompetitionMatches(comp);
        totalUpdated += updated;

        // Rate limit: wait between competitions
        if (comp !== COMPETITIONS[COMPETITIONS.length - 1]) {
          await footballData.delay(6000);
        }
      } catch (err) {
        console.error(`❌ [Refresh] Failed to refresh matches for ${comp.name}:`, err.message);
      }
    }

    console.log(`✅ [Refresh] Match refresh complete — ${totalUpdated} matches updated\n`);
    return totalUpdated;
  }

  /**
   * Refresh standings for all competitions.
   */
  async refreshStandings() {
    console.log('\n🔄 [Refresh] Starting standings refresh...');
    let totalUpdated = 0;

    for (const comp of COMPETITIONS) {
      try {
        const updated = await this._refreshCompetitionStandings(comp);
        totalUpdated += updated;

        if (comp !== COMPETITIONS[COMPETITIONS.length - 1]) {
          await footballData.delay(6000);
        }
      } catch (err) {
        console.error(`❌ [Refresh] Failed to refresh standings for ${comp.name}:`, err.message);
      }
    }

    console.log(`✅ [Refresh] Standings refresh complete — ${totalUpdated} rows updated\n`);
    return totalUpdated;
  }

  /**
   * Run both refreshes in sequence (called by cron).
   */
  async runFullRefresh() {
    const startTime = Date.now();
    console.log('\n' + '='.repeat(60));
    console.log(`🕐 [Refresh] Full refresh started at ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    try {
      const matchesUpdated   = await this.refreshMatches();
      await footballData.delay(6000); // pause between the two refresh types
      const standingsUpdated = await this.refreshStandings();

      // Invalidate stale analysis cache so next request gets fresh data
      await this._invalidateAnalysisCache();

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log('='.repeat(60));
      console.log(`🎉 [Refresh] Full refresh done in ${elapsed}s`);
      console.log(`   ⚽ Matches updated   : ${matchesUpdated}`);
      console.log(`   📊 Standings updated : ${standingsUpdated}`);
      console.log('='.repeat(60) + '\n');

      await this._logRefresh('success', matchesUpdated, standingsUpdated);
    } catch (err) {
      console.error('❌ [Refresh] Full refresh failed:', err.message);
      await this._logRefresh('failed', 0, 0, err.message);
    }
  }

  // ─── Private: Matches ────────────────────────────────────────────────────────

  async _refreshCompetitionMatches(comp) {
    console.log(`  📥 [Refresh] Fetching ${comp.name} matches...`);

    // Get the latest match date we have in DB for this competition
    const lastKnownDate = await this._getLastMatchDate(comp.code);
    console.log(`     Last known match: ${lastKnownDate ?? 'none (fetching all)'}`);

    const matchesData = await footballData.getCompetitionMatches(
      comp.code, 'FINISHED', CURRENT_SEASON
    );

    if (!matchesData?.matches?.length) {
      console.log(`     No matches returned for ${comp.name}`);
      return 0;
    }

    // Filter to only matches newer than what we already have
    const newMatches = lastKnownDate
      ? matchesData.matches.filter(m => new Date(m.utcDate) > new Date(lastKnownDate))
      : matchesData.matches;

    if (newMatches.length === 0) {
      console.log(`     ✅ ${comp.name} already up to date`);
      return 0;
    }

    console.log(`     Found ${newMatches.length} new/updated matches`);

    // Build teamIdMap for this competition to avoid FK violations
    const teamIdMap = await this._getTeamIdMapForCompetition(comp.code);

    let updatedCount = 0;

    for (const rawMatch of newMatches) {
      try {
        const match = footballData.convertMatchToOurFormat(rawMatch, teamIdMap);

        if (!match.home_team_id || !match.away_team_id) {
          console.warn(`     ⚠️  Skipping match ${rawMatch.id}: team not in DB`);
          continue;
        }

        const matchDate = new Date(match.match_date)
          .toISOString()
          .slice(0, 19)
          .replace('T', ' ');

        await pool.query(`
          INSERT INTO matches
            (id, league_id, season, match_date, home_team_id, away_team_id,
             home_score, away_score, halftime_home_score, halftime_away_score,
             status, venue)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            home_score          = VALUES(home_score),
            away_score          = VALUES(away_score),
            halftime_home_score = VALUES(halftime_home_score),
            halftime_away_score = VALUES(halftime_away_score),
            status              = VALUES(status)
        `, [
          match.id, match.league_id, match.season, matchDate,
          match.home_team_id, match.away_team_id,
          match.home_score, match.away_score,
          match.halftime_home_score, match.halftime_away_score,
          match.status, match.venue
        ]);

        // Refresh goal events for this match
        const events = footballData.extractGoalEvents(rawMatch, teamIdMap);
        for (const event of events) {
          if (!event.team_id || !teamIdMap[event.team_id]) continue;

          await pool.query(`
            INSERT INTO match_events
              (match_id, team_id, player_name, event_type, event_detail,
               time_elapsed, time_extra, comments)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              time_elapsed = VALUES(time_elapsed),
              player_name  = VALUES(player_name)
          `, [
            event.match_id, event.team_id, event.player_name,
            event.event_type, event.event_detail,
            event.time_elapsed, event.time_extra || 0, event.comments || ''
          ]);
        }

        updatedCount++;
      } catch (matchErr) {
        console.error(`     ⚠️  Error updating match ${rawMatch.id}:`, matchErr.message);
      }
    }

    console.log(`     ✅ ${comp.name}: ${updatedCount} matches refreshed`);
    return updatedCount;
  }

  // ─── Private: Standings ──────────────────────────────────────────────────────

  async _refreshCompetitionStandings(comp) {
    console.log(`  📊 [Refresh] Fetching ${comp.name} standings...`);

    const standingsData = await footballData.getStandings(comp.code);

    if (!standingsData?.standings) {
      console.log(`     No standings returned for ${comp.name}`);
      return 0;
    }

    // Football-Data.org returns TOTAL, HOME, AWAY tables — we want TOTAL
    const totalTable = standingsData.standings.find(s => s.type === 'TOTAL');
    if (!totalTable?.table) {
      console.log(`     No TOTAL standings table found for ${comp.name}`);
      return 0;
    }

    const leagueId  = footballData.getCompetitionId(comp.code);
    let updatedCount = 0;

    for (const row of totalTable.table) {
      try {
        await pool.query(`
          INSERT INTO standings
            (league_id, season, team_id, position, played, won, drawn, lost,
             goals_for, goals_against, goal_difference, points)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            position          = VALUES(position),
            played            = VALUES(played),
            won               = VALUES(won),
            drawn             = VALUES(drawn),
            lost              = VALUES(lost),
            goals_for         = VALUES(goals_for),
            goals_against     = VALUES(goals_against),
            goal_difference   = VALUES(goal_difference),
            points            = VALUES(points)
        `, [
          leagueId,
          CURRENT_SEASON,
          row.team.id,
          row.position,
          row.playedGames,
          row.won,
          row.draw,
          row.lost,
          row.goalsFor,
          row.goalsAgainst,
          row.goalDifference,
          row.points
        ]);
        updatedCount++;
      } catch (rowErr) {
        console.error(`     ⚠️  Error updating standings row for ${row.team?.name}:`, rowErr.message);
      }
    }

    console.log(`     ✅ ${comp.name}: ${updatedCount} standing rows refreshed`);
    return updatedCount;
  }

  // ─── Private: Helpers ────────────────────────────────────────────────────────

  /**
   * Get the most recent match date we have stored for a competition.
   * Used to avoid re-fetching matches we already have.
   */
  async _getLastMatchDate(competitionCode) {
    try {
      const leagueId = footballData.getCompetitionId(competitionCode);
      const [rows] = await pool.query(`
        SELECT MAX(match_date) AS last_date
        FROM   matches
        WHERE  league_id = ? AND season = ?
      `, [leagueId, CURRENT_SEASON]);
      return rows[0]?.last_date ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Build { apiTeamId: dbTeamId } map from teams already stored for a competition.
   * Prevents FK violations when inserting refreshed matches.
   */
  async _getTeamIdMapForCompetition(competitionCode) {
    try {
      const leagueId = footballData.getCompetitionId(competitionCode);
      const [rows] = await pool.query(`
        SELECT DISTINCT t.id
        FROM   teams t
        JOIN   matches m ON (t.id = m.home_team_id OR t.id = m.away_team_id)
        WHERE  m.league_id = ? AND m.season = ?
      `, [leagueId, CURRENT_SEASON]);

      const map = {};
      rows.forEach(r => { map[r.id] = r.id; });
      return map;
    } catch {
      return {};
    }
  }

  /**
   * Invalidate cached analysis results so the next request re-computes
   * with the freshly updated match data.
   */
  async _invalidateAnalysisCache() {
    try {
      const [result] = await pool.query(`
        DELETE FROM analysis_cache
        WHERE created_at < DATE_SUB(NOW(), INTERVAL 12 HOUR)
      `);
      console.log(`🧹 [Refresh] Cleared ${result.affectedRows} stale cache entries`);
    } catch (err) {
      console.error('⚠️  [Refresh] Cache invalidation failed:', err.message);
    }
  }

  /**
   * Log each refresh run to the DB for auditability.
   * Requires a refresh_log table — see migration note in scheduler.js.
   */
  async _logRefresh(status, matchesUpdated, standingsUpdated, errorMsg = null) {
    try {
      await pool.query(`
        INSERT INTO refresh_log
          (status, matches_updated, standings_updated, error_message, ran_at)
        VALUES (?, ?, ?, ?, NOW())
      `, [status, matchesUpdated, standingsUpdated, errorMsg]);
    } catch {
      // Non-critical — table may not exist yet on first run
    }
  }
}

module.exports = new RefreshService();
