// Match Controller
// Handles all match-related requests

const { pool } = require('../config/database');

/**
 * GET /matches
 * Recent finished matches list.
 * ADDED: league filter support + pagination via ?page=
 * ADDED: leagues list passed to view for filter dropdown.
 */
const getAllMatches = async (req, res) => {
  try {
    const leagueId  = req.query.league ? parseInt(req.query.league) : null;
    const page      = Math.max(parseInt(req.query.page) || 1, 1);
    const perPage   = 20;
    const offset    = (page - 1) * perPage;

    let whereClause = "WHERE m.status = 'FT'";
    const params    = [];

    if (leagueId) {
      whereClause += ' AND m.league_id = ?';
      params.push(leagueId);
    }

    // Total count for pagination
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM matches m ${whereClause}`,
      params
    );
    const totalMatches = countRows[0].total;
    const totalPages   = Math.ceil(totalMatches / perPage);

    const [matches] = await pool.query(`
      SELECT m.*,
             ht.name AS home_team_name,
             ht.logo AS home_team_logo,
             at.name AS away_team_name,
             at.logo AS away_team_logo,
             l.name  AS league_name
      FROM   matches m
      JOIN   teams ht ON m.home_team_id = ht.id
      JOIN   teams at ON m.away_team_id = at.id
      JOIN   leagues l ON m.league_id   = l.id
      ${whereClause}
      ORDER  BY m.match_date DESC
      LIMIT  ? OFFSET ?
    `, [...params, perPage, offset]);

    const [leagues] = await pool.query('SELECT id, name, country FROM leagues ORDER BY name');

    res.render('matches/list', {
      title:        'Recent Matches',
      page:         'matches',
      matches,
      leagues,
      pagination: {
        current:     page,
        total:       totalPages,
        totalItems:  totalMatches,
        perPage
      },
      filters: { leagueId }
    });
  } catch (error) {
    console.error('Error in getAllMatches:', error);
    res.status(500).render('error', {
      title: 'Error',
      page:  'error',
      error
    });
  }
};

/**
 * GET /matches/:id
 * Single match detail with events.
 * ADDED: goal events grouped by team for cleaner rendering.
 * ADDED: team logos in match data.
 */
const getMatchById = async (req, res) => {
  try {
    const matchId = parseInt(req.params.id);

    if (isNaN(matchId) || matchId <= 0) {
      return res.status(400).render('error', {
        title: 'Bad Request',
        page:  'error',
        error: { message: 'Invalid match ID' }
      });
    }

    const [matches] = await pool.query(`
      SELECT m.*,
             ht.name  AS home_team_name,
             ht.logo  AS home_team_logo,
             at.name  AS away_team_name,
             at.logo  AS away_team_logo,
             l.name   AS league_name,
             l.id     AS league_id
      FROM   matches m
      JOIN   teams ht  ON m.home_team_id = ht.id
      JOIN   teams at  ON m.away_team_id = at.id
      JOIN   leagues l ON m.league_id    = l.id
      WHERE  m.id = ?
    `, [matchId]);

    if (matches.length === 0) {
      return res.status(404).render('404', {
        title: '404 - Match Not Found',
        page:  '404'
      });
    }

    const match = matches[0];

    const [events] = await pool.query(`
      SELECT me.*, t.name AS team_name
      FROM   match_events me
      JOIN   teams t ON me.team_id = t.id
      WHERE  me.match_id = ?
      ORDER  BY me.time_elapsed ASC
    `, [matchId]);

    // Split events by team for easier EJS rendering
    const homeEvents = events.filter(e => e.team_id === match.home_team_id);
    const awayEvents = events.filter(e => e.team_id === match.away_team_id);

    res.render('matches/detail', {
      title:      `${match.home_team_name} vs ${match.away_team_name}`,
      page:       'matches',
      match,
      events,
      homeEvents,
      awayEvents
    });
  } catch (error) {
    console.error('Error in getMatchById:', error);
    res.status(500).render('error', {
      title: 'Error',
      page:  'error',
      error
    });
  }
};

/**
 * GET /matches/search
 * Search matches by team name, date, or league.
 * FIXED: consistent response shape; added league name in results.
 * ADDED: season filter.
 */
const searchMatches = async (req, res) => {
  try {
    const { team, date, league, season } = req.query;

    const whereClauses = ['1=1'];
    const params       = [];

    if (team) {
      whereClauses.push('(ht.name LIKE ? OR at.name LIKE ?)');
      params.push(`%${team}%`, `%${team}%`);
    }

    if (date) {
      whereClauses.push('DATE(m.match_date) = ?');
      params.push(date);
    }

    if (league) {
      whereClauses.push('m.league_id = ?');
      params.push(parseInt(league));
    }

    if (season) {
      whereClauses.push('m.season = ?');
      params.push(parseInt(season));
    }

    params.push(20);

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
      WHERE  ${whereClauses.join(' AND ')}
      ORDER  BY m.match_date DESC
      LIMIT  ?
    `, params);

    res.json({
      success: true,
      count:   matches.length,
      matches
    });
  } catch (error) {
    console.error('Error in searchMatches:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /matches/recent/:teamId
 * NEW: Last N matches for a specific team — used by the team detail page
 * and the analysis frontend to show a quick form guide strip (W/D/L).
 */
const getRecentMatchesByTeam = async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const limit  = Math.min(parseInt(req.query.limit) || 5, 20);

    if (isNaN(teamId) || teamId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid team ID' });
    }

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
      LIMIT  ?
    `, [teamId, teamId, limit]);

    // Add W/D/L result from the requested team's perspective
    const matchesWithResult = matches.map(m => {
      const isHome   = m.home_team_id === teamId;
      const teamScore = isHome ? m.home_score : m.away_score;
      const oppScore  = isHome ? m.away_score : m.home_score;
      let result = 'D';
      if (teamScore > oppScore) result = 'W';
      if (teamScore < oppScore) result = 'L';
      return { ...m, result };
    });

    res.json({ success: true, teamId, matches: matchesWithResult });
  } catch (error) {
    console.error('Error in getRecentMatchesByTeam:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getAllMatches,
  getMatchById,
  searchMatches,
  getRecentMatchesByTeam   // NEW
};
