const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');

// Get all teams
router.get('/', teamController.getAllTeams);

// Get team by ID
router.get('/:id', teamController.getTeamById);

// Get team statistics
router.get('/:id/stats', teamController.getTeamStats);

module.exports = router;
