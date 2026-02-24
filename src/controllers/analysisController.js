// Analysis Controller
// Handles all analytics and betting insights

const analysisService = require('../services/analysisService');
const { pool } = require('../config/database');

const getAnalysisPage = async (req, res) => {
  try {
    // Get list of teams for dropdown
    const [teams] = await pool.query('SELECT id, name, logo FROM teams ORDER BY name');
    
    res.render('analysis/index', {
      title: 'Match Analysis',
      page: 'analysis',
      teams: teams
    });
  } catch (error) {
    console.error('Error in getAnalysisPage:', error);
    res.status(500).render('error', { error });
  }
};

const analyzeTeam = async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const { matches = 10, homeAway = 'both' } = req.body;
    
    console.log(`📊 Analyzing Team ID: ${teamId}, Matches: ${matches}, Type: ${homeAway}`);
    
    // Use the analysis service (implements cache-aside pattern)
    const analysis = await analysisService.analyzeTeam(teamId, parseInt(matches), homeAway);
    
    res.json({
      success: true,
      teamId,
      analysis
    });
  } catch (error) {
    console.error('Error in analyzeTeam:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

const headToHeadAnalysis = async (req, res) => {
  try {
    var { team1Id, team2Id, matches = 10 } = req.body;
    
    console.log(`🤝 H2H Analysis: Team ${team1Id} vs Team ${team2Id}`);
    
    // Force everything to number – very important here
    team1Id = Number(team1Id);
    team2Id = Number(team2Id);
    matches  = Number(matches) || 10;   // fallback + real number

    if (isNaN(team1Id) || isNaN(team2Id) || isNaN(matches)) {
      throw new Error('Invalid team IDs or matches count');
    }
    console.log(`🤝 H2H Analysis: Team ${team1Id} vs Team ${team2Id}`);


    // Get both team analyses
    const team1Analysis = await analysisService.analyzeTeam(parseInt(team1Id), parseInt(matches), 'both');
    const team2Analysis = await analysisService.analyzeTeam(parseInt(team2Id), parseInt(matches), 'both');
  console.log('About to run H2H query with values:', [team1Id, team2Id, team2Id, team1Id, matches]);    
    // Get head-to-head specific matches
    const [h2hMatches] = await pool.query(`
      SELECT m.*, 
             ht.name as home_team_name,
             at.name as away_team_name
      FROM matches m
      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id
      WHERE ((m.home_team_id = ? AND m.away_team_id = ?) 
         OR (m.home_team_id = ? AND m.away_team_id = ?))
        AND m.status = 'FT'
      ORDER BY m.match_date DESC
      LIMIT ?
    `, [team1Id, team2Id, team2Id, team1Id, matches]);
    
    res.json({
      success: true,
      team1: team1Analysis,
      team2: team2Analysis,
      h2h: {
        matches: h2hMatches,
        total_matches: h2hMatches.length
      }
    });
  } catch (error) {
    console.error('Error in headToHeadAnalysis:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

const goalTimingAnalysis = async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    
    // Use the full analysis and extract just goal timing
    const analysis = await analysisService.analyzeTeam(teamId, 10, 'both');
    
    res.json({
      success: true,
      teamId,
      goalTiming: analysis.goal_timing
    });
  } catch (error) {
    console.error('Error in goalTimingAnalysis:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

const overUnderAnalysis = async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    
    // Use the full analysis and extract just over/under
    const analysis = await analysisService.analyzeTeam(teamId, 10, 'both');
    
    res.json({
      success: true,
      teamId,
      overUnder: analysis.over_under
    });
  } catch (error) {
    console.error('Error in overUnderAnalysis:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

module.exports = {
  getAnalysisPage,
  analyzeTeam,
  headToHeadAnalysis,
  goalTimingAnalysis,
  overUnderAnalysis
};
