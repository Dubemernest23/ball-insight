require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3434;

// Import routes
const indexRoutes = require('./routes/index');
const matchRoutes = require('./routes/matches');
const analysisRoutes = require('./routes/analysis');
const teamRoutes = require('./routes/team');
const scheduler = require('./services/scheduler');

// Security middleware
// app.use(helmet());
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
app.use('/matches', matchRoutes);
app.use('/analysis', analysisRoutes);
app.use('/teams', teamRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { 
    title: '404 - Not Found',
    page: '404'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { 
    title: 'Error',
    page: 'error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Import database connection
const { testConnection } = require('./config/database');

// Start server
async function startServer() {
  try {
    await testConnection();
    app.listen(PORT, () => {
      scheduler.start();
      console.log(`🚀 Football Analytics Tool running on http://localhost:${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (error) {
    console.error("❌ Server Startup Failed");
    console.error(error);
    process.exit(1);
  }
}

// Graceful shutdown — stop cron before process exits
process.on('SIGTERM', () => {
  scheduler.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  scheduler.stop();
  process.exit(0);
});

startServer();

module.exports = app;
