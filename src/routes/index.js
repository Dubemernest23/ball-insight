const express = require('express');
const router = express.Router();

// Home page
router.get('/', (req, res) => {
  res.render('index', { 
    title: 'Football Analytics Tool',
    page: 'home'
  });
});

// About page
router.get('/about', (req, res) => {
  res.render('about', { 
    title: 'About - Football Analytics Tool',
    page: 'about'
  });
});

module.exports = router;
