# Ball-insight 🏆⚽

A comprehensive football analytics platform designed to help sports bettors make data-driven decisions. This tool analyzes match data, goal timing patterns, and team performance metrics to provide actionable insights.

## Features

- **Goal Timing Analysis**: Track when teams score and concede goals across different time intervals (0-15min, 15-30min, etc.)
- **First to Score Tracking**: Historical data on which team scores first
- **Both Teams to Score (BTTS)**: Analyze frequency of matches where both teams score
- **Over/Under Patterns**: Identify trends in total goals scored
- **Home/Away Performance**: Compare team performance based on venue
- **Head-to-Head Analysis**: Historical matchup data between specific teams

## Tech Stack

- **Backend**: Node.js with Express.js
- **Frontend**: EJS templating engine
- **Database**: MySQL
- **API**: API-Football (api-sports.io)
- **Additional Libraries**: Axios, Helmet, CORS

## Project Structure

```
ball-insight/
├── src/
│   ├── app.js                 # Main application file
│   ├── config/
│   │   └── database.js        # Database configuration
│   ├── controllers/           # Request handlers
│   │   ├── matchController.js
│   │   ├── analysisController.js
│   │   └── teamController.js
│   ├── models/                # Database models
│   ├── routes/                # API routes
│   │   ├── index.js
│   │   ├── matches.js
│   │   ├── analysis.js
│   │   └── teams.js
│   ├── services/              # External API services
│   │   └── apiFootball.js
│   ├── middleware/            # Custom middleware
│   ├── utils/                 # Helper functions
│   └── views/                 # EJS templates
├── public/                    # Static assets
│   ├── css/
│   ├── js/
│   └── images/
├── scripts/                   # Database scripts
│   ├── schema.sql
│   ├── migrate.js
│   └── seed.js
├── tests/                     # Test files
├── .env.example               # Environment variables template
├── .gitignore
├── package.json
└── README.md
```

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- MySQL (v8 or higher)
- API-Football API key (free tier available)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Dubemernest23/ball-insight.git
   cd ball-insight
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your credentials:
   - Database credentials
   - API-Football API key
   - Session secret

4. **Create database**
   ```bash
   mysql -u root -p
   CREATE DATABASE ball-insight;
   ```

5. **Run database migrations**
   ```bash
   npm run db:migrate
   ```

6. **Start the application**
   ```bash
   # Development mode with auto-reload
   npm run dev
   
   # Production mode
   npm start
   ```

7. **Access the application**
   Open your browser and navigate to `http://localhost:1414`

## API-Football Setup

1. Visit [API-Football](https://www.api-football.com/)
2. Sign up for a free account
3. Get your API key from the dashboard
4. Add the key to your `.env` file

**Free Tier Limits:**
- 100 requests per day
- Access to all endpoints
- Recent season data

## Database Schema

The application uses the following main tables:
- `teams`: Store team information
- `leagues`: Store league/competition data
- `matches`: Store match fixtures and results
- `match_events`: Store match events (goals, cards, etc.) with timing
- `match_statistics`: Store detailed match statistics
- `analysis_cache`: Cache computed analytics

## Usage

### Analyzing a Team

1. Navigate to the Analysis page
2. Select a team
3. Choose analysis parameters (number of matches, home/away)
4. View insights on:
   - Goal timing patterns
   - First to score percentage
   - BTTS frequency
   - Over/under trends

### Head-to-Head Analysis

1. Select two teams
2. View historical matchup data
3. Analyze scoring patterns between specific teams

## Development Roadmap

### Phase 1: Core Features ✅
- [x] Project setup and structure
- [x] Database schema design
- [x] API integration setup
- [ ] Basic data fetching and storage
- [ ] Core analytics calculations

### Phase 2: Analytics Engine
- [ ] Goal timing analysis implementation
- [ ] First to score tracking
- [ ] BTTS frequency calculator
- [ ] Over/under pattern detection
- [ ] Home/away performance comparison

### Phase 3: User Interface
- [ ] Dashboard design
- [ ] Team selection interface
- [ ] Analysis results visualization
- [ ] Charts and graphs

### Phase 4: Advanced Features
- [ ] AI prediction integration
- [ ] Real-time updates
- [ ] User accounts and saved analyses
- [ ] Custom alerts and notifications

## Contributing
Clone the project, and understand the ReadMe before making any contribution

## License

MIT License

## Authors
Restek
---

**Note**: This tool is for informational purposes only. Always gamble responsibly.
