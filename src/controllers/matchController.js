// Match Controller
// Handles all match-related requests

const { pool } = require('../config/database');

const getAllMatches = async (req, res) => {
  try {
    // Get recent matches with team names
    const [matches] = await pool.query(`
      SELECT m.*, 
             ht.name as home_team_name,
             at.name as away_team_name
      FROM matches m
      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id
      WHERE m.status = 'FT'
      ORDER BY m.match_date DESC
      LIMIT 50
    `);
    
    res.render('matches/list', {
      title: 'Recent Matches',
      page: 'matches',
      matches: matches
    });
  } catch (error) {
    console.error('Error in getAllMatches:', error);
    res.status(500).render('error', { 
      title: 'Error',
      page: 'error',
      error 
    });
  }
};

const getMatchById = async (req, res) => {
  try {
    const matchId = req.params.id;
    
    // Get match with team names
    const [matches] = await pool.query(`
      SELECT m.*, 
             ht.name as home_team_name,
             at.name as away_team_name
      FROM matches m
      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id
      WHERE m.id = ?
    `, [matchId]);
    
    if (matches.length === 0) {
      return res.status(404).render('404', { 
        title: '404 - Match Not Found',
        page: '404'
      });
    }
    
    const match = matches[0];
    
    // Get match events
    const [events] = await pool.query(`
      SELECT * FROM match_events 
      WHERE match_id = ?
      ORDER BY time_elapsed ASC
    `, [matchId]);
    
    res.render('matches/detail', {
      title: `${match.home_team_name} vs ${match.away_team_name}`,
      page: 'matches',
      match: match,
      events: events
    });
  } catch (error) {
    console.error('Error in getMatchById:', error);
    res.status(500).render('error', { 
      title: 'Error',
      page: 'error',
      error 
    });
  }
};

const searchMatches = async (req, res) => {
  try {
    const { team, date, league } = req.query;
    
    let query = `
      SELECT m.*, 
             ht.name as home_team_name,
             at.name as away_team_name
      FROM matches m
      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (team) {
      query += ` AND (ht.name LIKE ? OR at.name LIKE ?)`;
      params.push(`%${team}%`, `%${team}%`);
    }
    
    if (date) {
      query += ` AND DATE(m.match_date) = ?`;
      params.push(date);
    }
    
    if (league) {
      query += ` AND m.league_id = ?`;
      params.push(league);
    }
    
    query += ` ORDER BY m.match_date DESC LIMIT 20`;
    
    const [matches] = await pool.query(query, params);
    
    res.json({ 
      success: true,
      matches: matches 
    });
  } catch (error) {
    console.error('Error in searchMatches:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

module.exports = {
  getAllMatches,
  getMatchById,
  searchMatches
};
