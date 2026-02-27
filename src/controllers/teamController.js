// Team Controller
// Handles team-related requests

const { pool } = require('../config/database');

/**
 * GET /teams
 * All teams list.
 * ADDED: league filter + search by name via ?search=
 * ADDED: leagues list for filter dropdown in view.
 */
const getAllTeams = async (req, res) => {
  try {
    const search   = req.query.search  || null;
    const leagueId = req.query.league  ? parseInt(req.query.league) : null;

    const whereClauses = ['1=1'];
    const params       = [];

    if (search) {
      whereClauses.push('t.name LIKE ?');
      params.push(`%${search}%`);
    }

    if (leagueId) {
      // Filter teams that have played in the given league
      whereClauses.push(`
        t.id IN (
          SELECT DISTINCT home_team_id FROM matches WHERE league_id = ?
          UNION
          SELECT DISTINCT away_team_id  FROM matches WHERE league_id = ?
        )
      `);
      params.push(leagueId, leagueId);
    }

    const [teams]   = await pool.query(
      `SELECT * FROM teams t WHERE ${whereClauses.join(' AND ')} ORDER BY t.name`,
      params
    );
    const [leagues] = await pool.query('SELECT id, name, country FROM leagues ORDER BY name');

    res.render('teams/list', {
      title:   'All Teams',
      page:    'teams',
      teams,
      leagues,
      filters: { search, leagueId }
    });
  } catch (error) {
    console.error('Error in getAllTeams:', error);
    res.status(500).render('error', {
      title: 'Error',
      page:  'error',
      error
    });
  }
};

/**
 * GET /teams/:id
 * Single team detail page.
 * FIXED: consistent error rendering (title + page props were missing).
 * ADDED: team standings row so current league position shows on the page.
 * ADDED: team logo in matches data.
 */
const getTeamById = async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);

    if (isNaN(teamId) || teamId <= 0) {
      return res.status(400).render('error', {
        title: 'Bad Request',
        page:  'error',
        error: { message: 'Invalid team ID' }
      });
    }

    const [teams] = await pool.query('SELECT * FROM teams WHERE id = ?', [teamId]);
    if (teams.length === 0) {
      return res.status(404).render('404', {
        title: '404 - Team Not Found',
        page:  '404'
      });
    }

    const team = teams[0];

    // Recent matches with logos
    const [matches] = await pool.query(`
      SELECT m.*,
             ht.name AS home_team_name,
             ht.logo AS home_team_logo,
             at.name AS away_team_name,
             at.logo AS away_team_logo,
             l.name  AS league_name
      FROM   matches m
      JOIN   teams ht  ON m.home_team_id = ht.id
      JOIN   teams at  ON m.away_team_id = at.id
      JOIN   leagues l ON m.league_id    = l.id
      WHERE  (m.home_team_id = ? OR m.away_team_id = ?)
        AND  m.status = 'FT'
      ORDER  BY m.match_date DESC
      LIMIT  10
    `, [teamId, teamId]);

    // W/D/L result tag for each match from this team's perspective
    const matchesWithResult = matches.map(m => {
      const isHome    = m.home_team_id === teamId;
      const teamScore = isHome ? m.home_score : m.away_score;
      const oppScore  = isHome ? m.away_score : m.home_score;
      let result = 'D';
      if (teamScore > oppScore) result = 'W';
      if (teamScore < oppScore) result = 'L';
      return { ...m, result };
    });

    // Current standings row (if exists — populated by refresh cron)
    const [standingsRows] = await pool.query(`
      SELECT s.*, l.name AS league_name
      FROM   standings s
      JOIN   leagues l ON s.league_id = l.id
      WHERE  s.team_id = ?
      ORDER  BY s.points DESC
      LIMIT  1
    `, [teamId]);
    const standing = standingsRows[0] || null;

    res.render('teams/detail', {
      title:   `${team.name} - Team Details`,
      page:    'teams',
      team,
      matches: matchesWithResult,
      standing
    });
  } catch (error) {
    console.error('Error in getTeamById:', error);
    res.status(500).render('error', {
      title: 'Error',
      page:  'error',
      error
    });
  }
};

/**
 * GET /teams/:id/stats
 * Basic win/draw/loss stats for a team.
 * FIXED: losses query had a logic error — it was counting draws as losses too.
 * ADDED: goals scored / conceded / clean sheets / avg goals per game.
 */
const getTeamStats = async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);

    if (isNaN(teamId) || teamId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid team ID' });
    }

    const [teamRows] = await pool.query('SELECT id, name, logo FROM teams WHERE id = ?', [teamId]);
    if (teamRows.length === 0) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    const [stats] = await pool.query(`
      SELECT
        COUNT(*) AS total_matches,

        -- Wins
        SUM(CASE
          WHEN home_team_id = ? AND home_score > away_score THEN 1
          WHEN away_team_id = ? AND away_score > home_score THEN 1
          ELSE 0
        END) AS wins,

        -- Draws
        SUM(CASE
          WHEN home_score = away_score THEN 1
          ELSE 0
        END) AS draws,

        -- Losses (FIXED: was incorrectly using >= which counted draws)
        SUM(CASE
          WHEN home_team_id = ? AND home_score < away_score THEN 1
          WHEN away_team_id = ? AND away_score < home_score THEN 1
          ELSE 0
        END) AS losses,

        -- Goals scored
        SUM(CASE
          WHEN home_team_id = ? THEN home_score
          WHEN away_team_id = ? THEN away_score
          ELSE 0
        END) AS goals_scored,

        -- Goals conceded
        SUM(CASE
          WHEN home_team_id = ? THEN away_score
          WHEN away_team_id = ? THEN home_score
          ELSE 0
        END) AS goals_conceded,

        -- Clean sheets
        SUM(CASE
          WHEN home_team_id = ? AND away_score = 0 THEN 1
          WHEN away_team_id = ? AND home_score = 0 THEN 1
          ELSE 0
        END) AS clean_sheets

      FROM matches
      WHERE (home_team_id = ? OR away_team_id = ?)
        AND status = 'FT'
    `, [
      teamId, teamId,   // wins
      teamId, teamId,   // losses
      teamId, teamId,   // goals scored
      teamId, teamId,   // goals conceded
      teamId, teamId,   // clean sheets
      teamId, teamId    // WHERE clause
    ]);

    const s = stats[0];
    const totalMatches = s.total_matches || 1; // avoid div/0

    res.json({
      success: true,
      team:    teamRows[0],
      stats: {
        ...s,
        avg_goals_scored:   +(s.goals_scored   / totalMatches).toFixed(2),
        avg_goals_conceded: +(s.goals_conceded / totalMatches).toFixed(2),
        win_percentage:     Math.round((s.wins  / totalMatches) * 100),
        draw_percentage:    Math.round((s.draws / totalMatches) * 100),
        loss_percentage:    Math.round((s.losses / totalMatches) * 100)
      }
    });
  } catch (error) {
    console.error('Error in getTeamStats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /teams/search
 * NEW: Quick JSON search for teams by name — used by autocomplete inputs.
 */
const searchTeams = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const leagueId = req.query.league ? parseInt(req.query.league) : null;

    if (q.length < 2 && !leagueId) {
      return res.json({ success: true, teams: [] });
    }

    const whereClauses = ['1=1'];
    const params = [];

    if (q.length >= 2) {
      whereClauses.push('t.name LIKE ?');
      params.push(`%${q}%`);
    }

    if (leagueId) {
      whereClauses.push(`
        t.id IN (
          SELECT DISTINCT home_team_id FROM matches WHERE league_id = ?
          UNION
          SELECT DISTINCT away_team_id FROM matches WHERE league_id = ?
        )
      `);
      params.push(leagueId, leagueId);
    }

    const [teams] = await pool.query(`
      SELECT t.id, t.name, t.logo
      FROM teams t
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY t.name
      LIMIT 20
    `, params);

    res.json({ success: true, teams });
  } catch (error) {
    console.error('Error in searchTeams:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getAllTeams,
  getTeamById,
  getTeamStats,
  searchTeams    // NEW
};
