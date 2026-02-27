const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');

// Get all teams
router.get('/', teamController.getAllTeams);

// Team autocomplete/search
router.get('/search', teamController.searchTeams);

// Get team statistics
router.get('/:id/stats', teamController.getTeamStats);

// Get team by ID
router.get('/:id', teamController.getTeamById);

module.exports = router;
