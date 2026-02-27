/**
 * render-build.js
 * 
 * This runs automatically during Render's build phase (before the app starts).
 * It handles:
 *   1. Running database migrations
 *   2. Seeding the database ONLY if it's empty (safe to run on every deploy)
 *
 * Because Render free tier has no shell access, this is how we populate
 * the database without manual intervention.
 */

require('dotenv').config();
const { pool } = require('./src/config/database');

async function runMigrations() {
  console.log('\n🔧 Running migrations...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leagues (
      id      INT          NOT NULL,
      name    VARCHAR(100) NOT NULL,
      country VARCHAR(100),
      season  INT,
      logo    VARCHAR(255),
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id      INT          NOT NULL,
      name    VARCHAR(100) NOT NULL,
      code    VARCHAR(10),
      country VARCHAR(100),
      logo    VARCHAR(255),
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id                   INT          NOT NULL,
      league_id            INT          NOT NULL,
      season               INT,
      match_date           DATETIME,
      home_team_id         INT          NOT NULL,
      away_team_id         INT          NOT NULL,
      home_score           INT,
      away_score           INT,
      halftime_home_score  INT,
      halftime_away_score  INT,
      status               VARCHAR(20),
      venue                VARCHAR(255),
      PRIMARY KEY (id),
      CONSTRAINT matches_ibfk_1 FOREIGN KEY (league_id)    REFERENCES leagues (id),
      CONSTRAINT matches_ibfk_2 FOREIGN KEY (home_team_id) REFERENCES teams   (id),
      CONSTRAINT matches_ibfk_3 FOREIGN KEY (away_team_id) REFERENCES teams   (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_events (
      id            INT           NOT NULL AUTO_INCREMENT,
      match_id      INT           NOT NULL,
      team_id       INT           NOT NULL,
      player_name   VARCHAR(100),
      event_type    VARCHAR(50),
      event_detail  VARCHAR(100),
      time_elapsed  INT,
      time_extra    INT           DEFAULT 0,
      comments      TEXT,
      PRIMARY KEY (id),
      CONSTRAINT match_events_ibfk_1 FOREIGN KEY (match_id) REFERENCES matches (id),
      CONSTRAINT match_events_ibfk_2 FOREIGN KEY (team_id)  REFERENCES teams   (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS analysis_cache (
      id               INT          NOT NULL AUTO_INCREMENT,
      team_id          INT          NOT NULL,
      analysis_type    VARCHAR(50),
      time_period      VARCHAR(50),
      home_away        VARCHAR(10),
      data             LONGTEXT,
      matches_analyzed INT,
      expires_at       DATETIME,
      created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS standings (
      id               INT       NOT NULL AUTO_INCREMENT,
      league_id        INT       NOT NULL,
      season           INT       NOT NULL,
      team_id          INT       NOT NULL,
      position         INT       NOT NULL DEFAULT 0,
      played           INT       NOT NULL DEFAULT 0,
      won              INT       NOT NULL DEFAULT 0,
      drawn            INT       NOT NULL DEFAULT 0,
      lost             INT       NOT NULL DEFAULT 0,
      goals_for        INT       NOT NULL DEFAULT 0,
      goals_against    INT       NOT NULL DEFAULT 0,
      goal_difference  INT       NOT NULL DEFAULT 0,
      points           INT       NOT NULL DEFAULT 0,
      updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_standings (league_id, season, team_id),
      CONSTRAINT standings_ibfk_1 FOREIGN KEY (league_id) REFERENCES leagues (id),
      CONSTRAINT standings_ibfk_2 FOREIGN KEY (team_id)   REFERENCES teams   (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_log (
      id                INT     NOT NULL AUTO_INCREMENT,
      status            ENUM('success','failed') NOT NULL DEFAULT 'success',
      matches_updated   INT     NOT NULL DEFAULT 0,
      standings_updated INT     NOT NULL DEFAULT 0,
      error_message     TEXT,
      ran_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log('✅ Migrations complete');
}

async function shouldSeed() {
  // Only seed if the leagues table is empty — prevents re-seeding on every deploy
  const [rows] = await pool.query('SELECT COUNT(*) AS count FROM leagues');
  return rows[0].count === 0;
}

async function runSeed() {
  console.log('\n🌱 Database is empty — running seed...');
  console.log('⏱️  This will take ~2-3 minutes due to API rate limiting\n');

  // Dynamically require the seed function so it only loads when needed
  const footballData = require('./src/services/apiService');

  const competitionsToSeed = [
    { code: 'PL',  name: 'Premier League', country: 'England' },
    { code: 'BL1', name: 'Bundesliga',     country: 'Germany' },
    { code: 'SA',  name: 'Serie A',        country: 'Italy'   },
    { code: 'PD',  name: 'La Liga',        country: 'Spain'   }
  ];

  let totalTeams = 0, totalMatches = 0;

  for (const comp of competitionsToSeed) {
    console.log(`\n📊 Processing ${comp.name}...`);

    try {
      const competitionId = footballData.getCompetitionId(comp.code);

      await pool.query(`
        INSERT INTO leagues (id, name, country, season, logo)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name)
      `, [competitionId, comp.name, comp.country, 2024,
          `https://crests.football-data.org/${comp.code}.png`]);

      console.log(`✅ Seeded league: ${comp.name}`);

      // Fetch & seed teams
      console.log(`📥 Fetching teams...`);
      const teamsData = await footballData.getCompetitionTeams(comp.code, 2024);
      const teamIdMap = {};

      if (teamsData?.teams) {
        for (const teamData of teamsData.teams) {
          const team = footballData.convertTeamToOurFormat(teamData);
          await pool.query(`
            INSERT INTO teams (id, name, code, country, logo)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE name = VALUES(name), logo = VALUES(logo)
          `, [team.id, team.name, team.code, team.country, team.logo]);
          teamIdMap[team.id] = team.id;
        }
        totalTeams += teamsData.teams.length;
        console.log(`✅ Seeded ${teamsData.teams.length} teams`);
      }

      console.log('⏳ Waiting 6 seconds (rate limit)...');
      await footballData.delay(6000);

      // Fetch & seed matches
      console.log(`📥 Fetching recent matches...`);
      const matchesData = await footballData.getCompetitionMatches(comp.code, 'FINISHED', 2024);

      if (matchesData?.matches) {
        const recentMatches = matchesData.matches.slice(0, 20);
        let seededCount = 0;

        for (const rawMatch of recentMatches) {
          try {
            const match = footballData.convertMatchToOurFormat(rawMatch, teamIdMap);

            if (!match.home_team_id || !match.away_team_id) {
              console.warn(`⚠️  Skipping match ${rawMatch.id}: team not in seeded list`);
              continue;
            }

            const matchDate = new Date(match.match_date)
              .toISOString().slice(0, 19).replace('T', ' ');

            await pool.query(`
              INSERT INTO matches
                (id, league_id, season, match_date, home_team_id, away_team_id,
                 home_score, away_score, halftime_home_score, halftime_away_score, status, venue)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                home_score          = VALUES(home_score),
                away_score          = VALUES(away_score),
                halftime_home_score = VALUES(halftime_home_score),
                halftime_away_score = VALUES(halftime_away_score),
                status              = VALUES(status)
            `, [
              match.id, match.league_id, match.season, matchDate,
              match.home_team_id, match.away_team_id,
              match.home_score, match.away_score,
              match.halftime_home_score, match.halftime_away_score,
              match.status, match.venue
            ]);

            const events = footballData.extractGoalEvents(rawMatch, teamIdMap);
            for (const event of events) {
              if (!event.team_id || !teamIdMap[event.team_id]) continue;
              await pool.query(`
                INSERT INTO match_events
                  (match_id, team_id, player_name, event_type, event_detail,
                   time_elapsed, time_extra, comments)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE time_elapsed = VALUES(time_elapsed)
              `, [
                event.match_id, event.team_id, event.player_name,
                event.event_type, event.event_detail,
                event.time_elapsed, event.time_extra || 0, event.comments || ''
              ]);
            }

            seededCount++;
            totalMatches++;
          } catch (err) {
            console.error(`⚠️  Error seeding match ${rawMatch.id}:`, err.message);
          }
        }
        console.log(`✅ Seeded ${seededCount} matches`);
      }

      if (comp !== competitionsToSeed[competitionsToSeed.length - 1]) {
        console.log('⏳ Waiting 6 seconds before next competition...');
        await footballData.delay(6000);
      }

    } catch (err) {
      console.error(`❌ Error processing ${comp.name}:`, err.message);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('🎉 Seed complete!');
  console.log(`   Teams seeded   : ${totalTeams}`);
  console.log(`   Matches seeded : ${totalMatches}`);
  console.log('='.repeat(50) + '\n');
}

async function main() {
  console.log('\n🚀 Render Build Script Starting...');
  console.log('='.repeat(50));

  try {
    await runMigrations();

    if (await shouldSeed()) {
      await runSeed();
    } else {
      console.log('\n✅ Database already seeded — skipping seed step');
    }

    console.log('\n✅ Build script complete — starting app...\n');
  } catch (err) {
    console.error('\n❌ Build script failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
