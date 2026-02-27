require('dotenv').config();
const express    = require('express');
const path       = require('path');
const cors       = require('cors');
const bodyParser = require('body-parser');
const session    = require('express-session');

const app  = express();
// Render injects its own PORT — must use it or the health check will fail
const PORT = process.env.PORT || 3000;

// ─── Import Routes ────────────────────────────────────────────────────────────
const indexRoutes    = require('./routes/index');
const matchRoutes    = require('./routes/matches');
const analysisRoutes = require('./routes/analysis');
const teamRoutes     = require('./routes/team');
const scheduler      = require('./services/scheduler');

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret:            process.env.SESSION_SECRET || 'football-analytics-secret',
  resave:            false,
  saveUninitialized: true,
  cookie:            { secure: process.env.NODE_ENV === 'production' }
}));

// ─── View Engine ──────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ─── Health Check (must be before other routes) ───────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/',         indexRoutes);
app.use('/matches',  matchRoutes);
app.use('/analysis', analysisRoutes);
app.use('/teams',    teamRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404', {
    title: '404 - Not Found',
    page:  '404'
  });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    title: 'Error',
    page:  'error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// ─── Database + Server Startup ────────────────────────────────────────────────
const { testConnection } = require('./config/database');

async function startServer() {
  try {
    await testConnection();

    app.listen(PORT, () => {
      scheduler.start();
      console.log(`🚀 Ball Insight running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (error) {
    console.error('❌ Server Startup Failed:', error.message);
    process.exit(1);
  }
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', () => { scheduler.stop(); process.exit(0); });
process.on('SIGINT',  () => { scheduler.stop(); process.exit(0); });

startServer();

module.exports = app;
