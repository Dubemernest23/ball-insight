const express = require('express');
const router = express.Router();
const matchController = require('../controllers/matchController');

// Get all matches
router.get('/', matchController.getAllMatches);

// Get match by ID
router.get('/:id', matchController.getMatchById);

// Search matches
router.get('/search', matchController.searchMatches);

module.exports = router;
