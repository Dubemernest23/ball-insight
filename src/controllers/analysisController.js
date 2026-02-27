// Analysis Controller
// Handles all analytics and betting insights

const analysisService = require('../services/analysisService');
const { pool } = require('../config/database');

/**
 * GET /analysis
 * Render the analysis page with teams + leagues for dropdowns.
 * ADDED: leagues list so the frontend can filter teams by league.
 */
const getAnalysisPage = async (req, res) => {
  try {
    const [teams]   = await pool.query('SELECT id, name, logo FROM teams ORDER BY name');
    const [leagues] = await pool.query('SELECT id, name, country FROM leagues ORDER BY name');

    res.render('analysis/index', {
      title: 'Match Analysis',
      page:  'analysis',
      teams,
      leagues
    });
  } catch (error) {
    console.error('Error in getAnalysisPage:', error);
    res.status(500).render('error', {
      title: 'Error',
      page:  'error',
      error
    });
  }
};

/**
 * POST /analysis/team/:teamId
 * Full team analysis — returns all 6 analysis modules.
 * FIXED: added input validation; returns team info alongside analysis
 * so the frontend doesn't need a second request for the team name/logo.
 */
const analyzeTeam = async (req, res) => {
  try {
    const teamId   = parseInt(req.params.teamId);
    const matches  = parseInt(req.body.matches)  || 10;
    const homeAway = req.body.homeAway            || 'both';

    if (isNaN(teamId) || teamId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid team ID' });
    }

    if (!['both', 'home', 'away'].includes(homeAway)) {
      return res.status(400).json({ success: false, error: 'homeAway must be both | home | away' });
    }

    if (matches < 1 || matches > 38) {
      return res.status(400).json({ success: false, error: 'matches must be between 1 and 38' });
    }

    console.log(`📊 Analyzing Team ID: ${teamId}, Matches: ${matches}, Type: ${homeAway}`);

    // Fetch team info to include in response (name + logo for UI)
    const [teamRows] = await pool.query('SELECT id, name, logo FROM teams WHERE id = ?', [teamId]);
    if (teamRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    const analysis = await analysisService.analyzeTeam(teamId, matches, homeAway);

    res.json({
      success:  true,
      team:     teamRows[0],   // includes name + logo for the UI
      analysis
    });
  } catch (error) {
    console.error('Error in analyzeTeam:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /analysis/h2h
 * Head-to-head analysis between two teams.
 * FIXED: removed duplicate console.log; added guard for same team;
 * ADDED: team info (name + logo) for both teams in response.
 * ADDED: h2h summary stats (team1 wins, team2 wins, draws).
 */
const headToHeadAnalysis = async (req, res) => {
  try {
    const rawTeam1Id = req.body.team1Id;
    const rawTeam2Id = req.body.team2Id;
    const rawMatches = req.body.matches;

    const team1Id = Number(req.body.team1Id);
    const team2Id = Number(req.body.team2Id);
    const matches = Number(req.body.matches) || 10;

    if (isNaN(team1Id) || isNaN(team2Id) || isNaN(matches)) {
      console.warn('⚠️ Invalid H2H payload received:', {
        team1Id: rawTeam1Id,
        team2Id: rawTeam2Id,
        matches: rawMatches
      });
      return res.status(400).json({ success: false, error: 'Invalid team IDs or matches count' });
    }

    if (team1Id === team2Id) {
      console.warn('⚠️ H2H rejected: identical teams selected', { team1Id, team2Id });
      return res.status(400).json({ success: false, error: 'Team 1 and Team 2 must be different' });
    }

    console.log(`🤝 H2H Analysis: Team ${team1Id} vs Team ${team2Id}, last ${matches} matches`);

    // Fetch both team records first — fail fast if either doesn't exist
    const [teamRows] = await pool.query(
      'SELECT id, name, logo FROM teams WHERE id IN (?, ?)',
      [team1Id, team2Id]
    );

    if (teamRows.length < 2) {
      return res.status(404).json({ success: false, error: 'One or both teams not found' });
    }

    const team1Info = teamRows.find(t => t.id === team1Id);
    const team2Info = teamRows.find(t => t.id === team2Id);

    // Run both analyses in parallel to save time
    const [team1Analysis, team2Analysis] = await Promise.all([
      analysisService.analyzeTeam(team1Id, matches, 'both'),
      analysisService.analyzeTeam(team2Id, matches, 'both')
    ]);

    // Get direct head-to-head matches
    const [h2hMatches] = await pool.query(`
      SELECT m.*,
             ht.name AS home_team_name,
             ht.logo AS home_team_logo,
             at.name AS away_team_name,
             at.logo AS away_team_logo
      FROM   matches m
      JOIN   teams ht ON m.home_team_id = ht.id
      JOIN   teams at ON m.away_team_id = at.id
      WHERE  ((m.home_team_id = ? AND m.away_team_id = ?)
           OR (m.home_team_id = ? AND m.away_team_id = ?))
        AND  m.status = 'FT'
      ORDER  BY m.match_date DESC
      LIMIT  ?
    `, [team1Id, team2Id, team2Id, team1Id, matches]);

    // Build H2H summary
    let team1Wins = 0, team2Wins = 0, draws = 0;
    h2hMatches.forEach(m => {
      const t1IsHome = m.home_team_id === team1Id;
      const t1Score  = t1IsHome ? m.home_score : m.away_score;
      const t2Score  = t1IsHome ? m.away_score : m.home_score;

      if (t1Score > t2Score)       team1Wins++;
      else if (t1Score < t2Score)  team2Wins++;
      else                         draws++;
    });

    res.json({
      success: true,
      team1: { info: team1Info, analysis: team1Analysis },
      team2: { info: team2Info, analysis: team2Analysis },
      h2h: {
        matches:       h2hMatches,
        total_matches: h2hMatches.length,
        summary: {
          team1_wins: team1Wins,
          team2_wins: team2Wins,
          draws
        }
      }
    });
  } catch (error) {
    console.error('Error in headToHeadAnalysis:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /analysis/goal-timing/:teamId
 * Returns only the goal timing slice of the full analysis.
 * FIXED: honours query params for matches + homeAway instead of hardcoding 10/'both'.
 */
const goalTimingAnalysis = async (req, res) => {
  try {
    const teamId   = parseInt(req.params.teamId);
    const matches  = parseInt(req.query.matches)  || 10;
    const homeAway = req.query.homeAway            || 'both';

    if (isNaN(teamId) || teamId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid team ID' });
    }

    const analysis = await analysisService.analyzeTeam(teamId, matches, homeAway);

    res.json({
      success:    true,
      teamId,
      goalTiming: analysis.goal_timing
    });
  } catch (error) {
    console.error('Error in goalTimingAnalysis:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /analysis/over-under/:teamId
 * Returns only the over/under slice of the full analysis.
 * FIXED: honours query params for matches + homeAway instead of hardcoding.
 */
const overUnderAnalysis = async (req, res) => {
  try {
    const teamId   = parseInt(req.params.teamId);
    const matches  = parseInt(req.query.matches)  || 10;
    const homeAway = req.query.homeAway            || 'both';

    if (isNaN(teamId) || teamId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid team ID' });
    }

    const analysis = await analysisService.analyzeTeam(teamId, matches, homeAway);

    res.json({
      success:   true,
      teamId,
      overUnder: analysis.over_under
    });
  } catch (error) {
    console.error('Error in overUnderAnalysis:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /analysis/standings/:leagueId
 * NEW: Returns the current standings for a league.
 * Pulls from the standings table populated by the refresh cron job.
 */
const getStandings = async (req, res) => {
  try {
    const leagueId = parseInt(req.params.leagueId);
    const season   = parseInt(req.query.season) || 2024;

    if (isNaN(leagueId) || leagueId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid league ID' });
    }

    const [rows] = await pool.query(`
      SELECT s.*, t.name AS team_name, t.logo AS team_logo
      FROM   standings s
      JOIN   teams t ON s.team_id = t.id
      WHERE  s.league_id = ? AND s.season = ?
      ORDER  BY s.position ASC
    `, [leagueId, season]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No standings found for this league/season' });
    }

    res.json({ success: true, leagueId, season, standings: rows });
  } catch (error) {
    console.error('Error in getStandings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getAnalysisPage,
  analyzeTeam,
  headToHeadAnalysis,
  goalTimingAnalysis,
  overUnderAnalysis,
  getStandings        // NEW
};
