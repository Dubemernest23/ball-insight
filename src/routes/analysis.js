const express = require('express');
const router = express.Router();
const analysisController = require('../controllers/analysisController');

// Get analysis page
router.get('/', analysisController.getAnalysisPage);

// Analyze team performance
router.post('/team/:teamId', analysisController.analyzeTeam);

// Head to head analysis
router.post('/h2h', analysisController.headToHeadAnalysis);

// Goal timing analysis
router.get('/goal-timing/:teamId', analysisController.goalTimingAnalysis);

// Over/Under analysis
router.get('/over-under/:teamId', analysisController.overUnderAnalysis);

// League standings
router.get('/standings/:leagueId', analysisController.getStandings);

module.exports = router;
