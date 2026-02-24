// Team Controller
// Handles team-related requests

const { pool } = require('../config/database');

const getAllTeams = async (req, res) => {
  try {
    const [teams] = await pool.query('SELECT * FROM teams ORDER BY name');
    
    res.render('teams/list', {
      title: 'All Teams',
      page: 'teams',
      teams: teams
    });
  } catch (error) {
    console.error('Error in getAllTeams:', error);
    res.status(500).render('error', { error });
  }
};

const getTeamById = async (req, res) => {
  try {
    const teamId = req.params.id;
    
    // Get team info
    const [teams] = await pool.query('SELECT * FROM teams WHERE id = ?', [teamId]);
    
    if (teams.length === 0) {
      return res.status(404).render('404', { title: '404 - Team Not Found' });
    }
    
    const team = teams[0];
    
    // Get recent matches
    const [matches] = await pool.query(`
      SELECT m.*, 
             ht.name as home_team_name,
             at.name as away_team_name
      FROM matches m
      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id
      WHERE (m.home_team_id = ? OR m.away_team_id = ?)
        AND m.status = 'FT'
      ORDER BY m.match_date DESC
      LIMIT 10
    `, [teamId, teamId]);
    
    res.render('teams/detail', {
      title: `${team.name} - Team Details`,
      page: 'teams',
      team: team,
      matches: matches
    });
  } catch (error) {
    console.error('Error in getTeamById:', error);
    res.status(500).render('error', { error });
  }
};

const getTeamStats = async (req, res) => {
  try {
    const teamId = req.params.id;
    
    // Get basic stats
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_matches,
        SUM(CASE WHEN (home_team_id = ? AND home_score > away_score) 
                   OR (away_team_id = ? AND away_score > home_score) THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN home_score = away_score THEN 1 ELSE 0 END) as draws,
        SUM(CASE WHEN (home_team_id = ? AND home_score < away_score) 
                   OR (away_team_id = ? AND away_score < home_score) THEN 1 ELSE 0 END) as losses
      FROM matches
      WHERE (home_team_id = ? OR away_team_id = ?)
        AND status = 'FT'
    `, [teamId, teamId, teamId, teamId, teamId, teamId]);
    
    res.json({ 
      teamId, 
      stats: stats[0] 
    });
  } catch (error) {
    console.error('Error in getTeamStats:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllTeams,
  getTeamById,
  getTeamStats
};
