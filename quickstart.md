# Football Analytics Tool - Quick Start Guide

## 🎯 Project Overview

We've built a professional foundation for our football analytics tool focused on helping bettors make data-driven decisions. The tool analyzes:

1. Goals scored/conceded by time intervals
2. First to score percentage
3. Both teams to score frequency
4. Over/under patterns at different time marks
5. Home/away performance differences

## 📁 What We've Built

### Complete Folder Structure
```
football-analytics-tool/
├── src/
│   ├── app.js (main server)
│   ├── config/ (database setup)
│   ├── controllers/ (business logic)
│   ├── routes/ (API endpoints)
│   ├── services/ (API-Football integration)
│   └── views/ (EJS templates)
├── public/ (CSS, JS, images)
├── scripts/ (database schema)
└── Configuration files
```

### Key Files Created

1. **package.json** - All dependencies configured
2. **app.js** - Express server with middleware
3. **Database Schema** - MySQL tables for teams, matches, events, statistics
4. **API Service** - Complete API-Football integration
5. **Controllers** - Match, Analysis, and Team controllers
6. **Routes** - RESTful API structure
7. **Views** - Home page with EJS templating
8. **README.md** - Complete project documentation

## 🚀 Next Steps to Get Running

### 1. Install Dependencies
```bash
cd football-analytics-tool
npm install
```

### 2. Setup Environment Variables
```bash
# Copy the example file
cp .env.example .env

# Edit .env and add:
# - Your MySQL credentials
# - API-Football API key (get free at api-football.com)
# - Session secret
```

### 3. Create Database
```bash
# Login to MySQL
mysql -u root -p

# Create database
CREATE DATABASE football_analytics;

# Import schema
USE football_analytics;
source scripts/schema.sql;
```

### 4. Get API-Football Key
1. Visit https://www.api-football.com/
2. Sign up for FREE account
3. Get your API key from dashboard
4. Add to .env file

### 5. Run the Application
```bash
# Development mode with auto-reload
npm run dev

# Visit http://localhost:3000
```

## 🎨 Current Features

### ✅ Implemented
- Professional project structure
- Express server with security middleware
- Database schema for all analytics
- API-Football service integration
- Route structure for all features
- Basic UI with navigation
- Error handling

### 🔨 Ready to Build (Next Phase)
- Fetch and store match data from API
- Calculate goal timing analytics
- Implement first-to-score tracking
- Build BTTS frequency calculator
- Create over/under pattern analyzer
- Add data visualization charts

## 💡 How the Analytics Will Work

### Example: Chelsea Analysis
```javascript
// User selects: Chelsea, Last 10 games, Home & Away

1. Fetch Chelsea's last 10 matches
2. Extract goal events with timing
3. Calculate:
   - Goals in 0-15min: X goals
   - Goals in 15-30min: Y goals
   - First to score: 7/10 times (70%)
   - Both teams scored: 6/10 games (60%)
   - Over 2.5 goals: 8/10 games (80%)
   - Home record: 4W-1D-0L
   - Away record: 3W-1D-1L
```

## 🔑 API-Football Endpoints We'll Use

1. `/fixtures` - Get match fixtures
2. `/fixtures/events` - Get goals with exact minutes
3. `/fixtures/statistics` - Get detailed match stats
4. `/fixtures/headtohead` - H2H between teams

## 📊 Database Design Highlights

- **teams** - Store team info
- **matches** - Store fixtures and results (including HT/FT scores)
- **match_events** - Store every goal with time_elapsed
- **match_statistics** - Store shots, possession, etc.
- **analysis_cache** - Cache computed analytics to save API calls

## 🎯 Your Competitive Advantage

Unlike generic betting tips sites, we're building:
1. **Time-interval specific data** - Most sites don't show 15-min breakdowns
2. **Pattern recognition** - Identify when teams typically score
3. **Historical depth** - Last 5-10 games analysis
4. **Venue-specific insights** - Home/away performance splits

## ⚠️ Important Notes

- **Free API Tier**: 100 requests/day (enough for testing)
- **Rate Limiting**: Implement caching to avoid hitting limits
- **Data Storage**: Store fetched data in MySQL to reuse
- **Responsible Gambling**: Always include disclaimers

## 🤝 Next Development Session

We should focus on:
1. Implementing data fetching from API-Football
2. Storing data in MySQL
3. Building the first analytics calculator (goal timing)
4. Creating a simple analysis results page

## 📝 Git Repository

Initialize git:
```bash
cd football-analytics-tool
git init
git add .
git commit -m "Initial project setup with complete structure"
```

Then push to GitHub/GitLab for version control and collaboration.

---

**You're all set!** The foundation is solid. Let's build the analytics engine next! 🚀⚽