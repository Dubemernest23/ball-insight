// scripts/seed-fd.js
require('dotenv').config();
const axios = require('axios');
const { pool } = require('../src/config/database');

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
if (!TOKEN) throw new Error('Add FOOTBALL_DATA_TOKEN to .env');

const API = axios.create({
  baseURL: 'https://api.football-data.org/v4',
  headers: { 'X-Auth-Token': TOKEN }
});

const LEAGUES = [
  { code: 'PL',  name: 'Premier League', country: 'England' },
  { code: 'PD',  name: 'La Liga',        country: 'Spain'   },
  { code: 'SA',  name: 'Serie A',        country: 'Italy'   },
  { code: 'BL1', name: 'Bundesliga',     country: 'Germany' }
];

async function clearDb() {
  console.log('Clearing database...');
  
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  
  // Truncate one table at a time, in correct order
  await pool.query('TRUNCATE TABLE match_statistics');
  await pool.query('TRUNCATE TABLE match_events');
  await pool.query('TRUNCATE TABLE matches');
  await pool.query('TRUNCATE TABLE analysis_cache');
  await pool.query('TRUNCATE TABLE teams');
  await pool.query('TRUNCATE TABLE leagues');
  
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  
  console.log('Database cleared successfully.');
}

async function seedLeagues() {
  console.log('Seeding leagues...');
  for (const l of LEAGUES) {
    try {
      const res = await API.get(`/competitions/${l.code}`);
      const comp = res.data.competition || res.data;
      await pool.query(
        `INSERT INTO leagues (id, name, country, season, logo)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), season=VALUES(season), logo=VALUES(logo)`,
        [
          comp.id,
          comp.name,
          comp.area?.name || l.country,
          comp.currentSeason?.startDate?.slice(0,4) || 2025,
          comp.emblem || ''
        ]
      );
      console.log(`  → ${l.name} (ID ${comp.id}, season ${comp.currentSeason?.startDate?.slice(0,4) || 'N/A'})`);
    } catch (err) {
      console.error(`Failed to seed league ${l.code}:`, err.message);
    }
  }
}

async function seedTeams() {
  console.log('Seeding teams...');
  let total = 0;
  for (const l of LEAGUES) {
    try {
      const res = await API.get(`/competitions/${l.code}/teams`);
      const teams = res.data.teams || [];
      console.log(`  ${l.name}: ${teams.length} teams fetched`);
      for (const t of teams) {
        await pool.query(
          `INSERT INTO teams (id, name, code, country, logo)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name=VALUES(name), code=VALUES(code),
             country=VALUES(country), logo=VALUES(logo)`,
          [t.id, t.name, t.tla || null, t.area?.name || null, t.crest || null]
        );
        total++;
      }
    } catch (err) {
      console.error(`Failed to seed teams for ${l.code}:`, err.message);
    }
  }
  console.log(`Total teams inserted/updated: ${total}`);
}

async function seedMatches() {
  console.log('Seeding recent finished matches...');
  let total = 0;
  
  // Limit to first 15 teams to respect rate limit during test
  const [dbTeams] = await pool.query('SELECT id FROM teams LIMIT 15');
  const teamIds = dbTeams.map(r => r.id);

  const allowedLeagueIds = [2021, 2014, 2019, 2002]; // only your seeded leagues

  for (const tid of teamIds) {
    try {
      console.log(`Fetching matches for team ${tid}...`);
      const res = await API.get(`/teams/${tid}/matches`, {
        params: {
          status: 'FINISHED',
          limit: 20
        }
      });
      const matches = res.data.matches || [];
      console.log(`  Team ${tid}: ${matches.length} finished matches returned`);

      for (const m of matches) {
        // Skip matches from non-seeded leagues (prevents foreign key error)
        if (!allowedLeagueIds.includes(m.competition.id)) {
          continue;
        }

        const matchDate = m.utcDate
          ? m.utcDate.replace('T', ' ').replace('Z', '')  // Fix datetime format
          : null;

        await pool.query(
          `INSERT INTO matches 
           (id, league_id, season, match_date, home_team_id, away_team_id,
            home_score, away_score, status, venue)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
             home_score=VALUES(home_score), away_score=VALUES(away_score),
             status=VALUES(status)`,
          [
            m.id,
            m.competition.id,
            m.season.startDate.slice(0,4),
            matchDate,
            m.homeTeam.id,
            m.awayTeam.id,
            m.score.fullTime.home ?? null,
            m.score.fullTime.away ?? null,
            m.status,
            m.venue || ''
          ]
        );
        total++;
      }
    } catch (err) {
      console.error(`Team ${tid} matches failed:`, err.message);
      if (err.response?.status === 429) {
        console.log('Rate limit hit — waiting 60 seconds...');
        await new Promise(r => setTimeout(r, 60000));
      }
    }
    
    // Safety delay between teams (7 seconds → ~8-9 req/min)
    await new Promise(r => setTimeout(r, 7000));
  }
  
  console.log(`Total matches seeded (major leagues only): ${total}`);
}

async function main() {
  try {
    await clearDb();
    await seedLeagues();
    await seedTeams();
    await seedMatches();
    console.log('\nSeeding complete! Check your DB and test the app.');
  } catch (err) {
    console.error('Seeding process error:', err);
  } finally {
    await pool.end();
  }
}

main();