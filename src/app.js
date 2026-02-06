require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// Import routes
const indexRoutes = require('./routes/index');
// const matchRoutes = require('./routes/matches');
// const analysisRoutes = require('./routes/analysis');
// const teamRoutes = require('./routes/teams');

// Security middleware
app.use(helmet());
app.use(cors());

// Body parser middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'football-analytics-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/', indexRoutes);
// app.use('/matches', matchRoutes);
// app.use('/analysis', analysisRoutes);
// app.use('/teams', teamRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: '404 - Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { 
    title: 'Error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Import database connection
// const { testConnection } = require('./config/database');

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Football Analytics Tool running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Test database connection
//   await testConnection();
});

module.exports = app;
