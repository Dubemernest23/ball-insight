const express = require('express');
const router = express.Router();
const matchController = require('../controllers/matchController');

// Get all matches
router.get('/', matchController.getAllMatches);

// Search matches
router.get('/search', matchController.searchMatches);

// Get recent matches by team
router.get('/recent/:teamId', matchController.getRecentMatchesByTeam);

// Get match by ID
router.get('/:id', matchController.getMatchById);

module.exports = router;
