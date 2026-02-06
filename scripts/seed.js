require('dotenv').config();
const { pool } = require('../src/config/database');

async function seedDatabase() {
  try {
    console.log('🌱 Seeding database...');

    // Insert sample leagues
    const leagues = [
      [39, 'Premier League', 'England', 2024, 'https://media.api-sports.io/football/leagues/39.png'],
      [140, 'La Liga', 'Spain', 2024, 'https://media.api-sports.io/football/leagues/140.png'],
      [135, 'Serie A', 'Italy', 2024, 'https://media.api-sports.io/football/leagues/135.png'],
      [78, 'Bundesliga', 'Germany', 2024, 'https://media.api-sports.io/football/leagues/78.png']
    ];

    for (const league of leagues) {
      await pool.query(
        `INSERT INTO leagues (id, name, country, season, logo) 
         VALUES (?, ?, ?, ?, ?) 
         ON DUPLICATE KEY UPDATE name=VALUES(name)`,
        league
      );
    }
    console.log('✅ Seeded 4 leagues');

    // Insert sample teams (Premier League)
    const teams = [
      [33, 'Manchester United', 'MUN', 'England', 'https://media.api-sports.io/football/teams/33.png'],
      [40, 'Liverpool', 'LIV', 'England', 'https://media.api-sports.io/football/teams/40.png'],
      [50, 'Manchester City', 'MCI', 'England', 'https://media.api-sports.io/football/teams/50.png'],
      [49, 'Chelsea', 'CHE', 'England', 'https://media.api-sports.io/football/teams/49.png'],
      [42, 'Arsenal', 'ARS', 'England', 'https://media.api-sports.io/football/teams/42.png'],
      [47, 'Tottenham', 'TOT', 'England', 'https://media.api-sports.io/football/teams/47.png']
    ];

    for (const team of teams) {
      await pool.query(
        `INSERT INTO teams (id, name, code, country, logo) 
         VALUES (?, ?, ?, ?, ?) 
         ON DUPLICATE KEY UPDATE name=VALUES(name)`,
        team
      );
    }
    console.log('✅ Seeded 6 teams');

    // Insert a sample match
    await pool.query(
      `INSERT INTO matches (id, league_id, season, match_date, home_team_id, away_team_id, 
       home_score, away_score, halftime_home_score, halftime_away_score, status, venue) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status=VALUES(status)`,
      [1234567, 39, 2024, '2024-02-03 15:00:00', 49, 42, 2, 1, 1, 0, 'FT', 'Stamford Bridge']
    );
    console.log('✅ Seeded 1 sample match (Chelsea 2-1 Arsenal)');

    // Insert sample match events
    const events = [
      [1234567, 49, 'Raheem Sterling', 'Goal', 'Normal Goal', 23, 0, 'Assisted by Cole Palmer'],
      [1234567, 42, 'Bukayo Saka', 'Goal', 'Normal Goal', 67, 0, 'Penalty'],
      [1234567, 49, 'Cole Palmer', 'Goal', 'Normal Goal', 81, 0, 'Free-kick']
    ];

    for (const event of events) {
      await pool.query(
        `INSERT INTO match_events (match_id, team_id, player_name, event_type, event_detail, 
         time_elapsed, time_extra, comments) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        event
      );
    }
    console.log('✅ Seeded 3 match events (goals)');

    console.log('\n🎉 Database seeded successfully!');
    console.log('You can now test the application with sample data.');

  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run seeding
seedDatabase();
