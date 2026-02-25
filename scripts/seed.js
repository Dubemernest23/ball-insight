require('dotenv').config();
const { pool } = require('../src/config/database');
const footballData = require('../src/services/apiService');

/**
 * DYNAMIC SEED SCRIPT - Fetches Real Data from Football-Data.org API
 *
 * KEY FIX: We now build a teamIdMap (apiTeamId → dbTeamId) while seeding
 * teams, then use that map when inserting matches.  This prevents the
 * foreign-key violations that occurred when a match referenced a team ID
 * that was not yet (or never) stored in the `teams` table.
 */

async function seedFromAPI() {
  console.log('🌱 Seeding database from Football-Data.org API...\n');

  try {
    const competitionsToSeed = [
      { code: 'PL',  name: 'Premier League' },
      { code: 'BL1', name: 'Bundesliga'     },
      { code: 'SA',  name: 'Serie A'        },
      { code: 'PD',  name: 'La Liga'        }
    ];

    let totalTeams   = 0;
    let totalMatches = 0;

    for (const comp of competitionsToSeed) {
      console.log(`\n📊 Processing ${comp.name}...`);

      try {
        // ── Step 1: Seed league ────────────────────────────────────────────
        const competitionId = footballData.getCompetitionId(comp.code);
        const countryMap = { PL: 'England', BL1: 'Germany', SA: 'Italy', PD: 'Spain' };

        await pool.query(`
          INSERT INTO leagues (id, name, country, season, logo)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE name = VALUES(name)
        `, [
          competitionId,
          comp.name,
          countryMap[comp.code] || 'Unknown',
          2024,
          `https://crests.football-data.org/${comp.code}.png`
        ]);
        console.log(`✅ Seeded league: ${comp.name}`);

        // ── Step 2: Fetch & seed teams ─────────────────────────────────────
        console.log(`📥 Fetching teams...`);
        const teamsData = await footballData.getCompetitionTeams(comp.code, 2025);

        // FIX: Build a map of  apiTeamId → dbTeamId  as we insert each team.
        // The API uses its own numeric IDs; we store those same IDs as the
        // primary key (ON DUPLICATE KEY handles re-runs), so the map is
        // straightforward — but having it explicit makes the match-insertion
        // step safe and easy to validate.
        const teamIdMap = {}; // { apiId: dbId }

        if (teamsData && teamsData.teams) {
          for (const teamData of teamsData.teams) {
            const team = footballData.convertTeamToOurFormat(teamData);

            await pool.query(`
              INSERT INTO teams (id, name, code, country, logo)
              VALUES (?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                name  = VALUES(name),
                logo  = VALUES(logo)
            `, [team.id, team.name, team.code, team.country, team.logo]);

            // Map the API id to the DB id (same value, but now guaranteed to exist)
            teamIdMap[team.id] = team.id;
          }

          totalTeams += teamsData.teams.length;
          console.log(`✅ Seeded ${teamsData.teams.length} teams`);
        }

        // Rate-limit pause
        console.log('⏳ Waiting 6 seconds (rate limit)...');
        await footballData.delay(6000);

        // ── Step 3: Fetch & seed recent matches ────────────────────────────
        console.log(`📥 Fetching recent matches...`);
        const matchesData = await footballData.getCompetitionMatches(comp.code, 'FINISHED', 2025);

        if (matchesData && matchesData.matches) {
          const recentMatches = matchesData.matches.slice(0, 20);
          let seededCount = 0;

          for (const rawMatch of recentMatches) {
            try {
              // FIX: pass teamIdMap so home_team_id / away_team_id are
              // resolved to IDs that actually exist in the `teams` table.
              const match = footballData.convertMatchToOurFormat(rawMatch, teamIdMap);

              // FIX: skip matches whose teams we didn't seed (e.g. cup
              // rounds involving lower-league clubs not in our 20 teams).
              if (!match.home_team_id || !match.away_team_id) {
                console.warn(`⚠️  Skipping match ${rawMatch.id}: team not in seeded list ` +
                  `(home: ${rawMatch.homeTeam?.name}, away: ${rawMatch.awayTeam?.name})`);
                continue;
              }

              const matchDate = new Date(match.match_date)
                .toISOString()
                .slice(0, 19)
                .replace('T', ' ');

              await pool.query(`
                INSERT INTO matches
                  (id, league_id, season, match_date, home_team_id, away_team_id,
                   home_score, away_score, halftime_home_score, halftime_away_score,
                   status, venue)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  home_score             = VALUES(home_score),
                  away_score             = VALUES(away_score),
                  halftime_home_score    = VALUES(halftime_home_score),
                  halftime_away_score    = VALUES(halftime_away_score),
                  status                 = VALUES(status)
              `, [
                match.id,
                match.league_id,
                match.season,
                matchDate,
                match.home_team_id,
                match.away_team_id,
                match.home_score,
                match.away_score,
                match.halftime_home_score,
                match.halftime_away_score,
                match.status,
                match.venue
              ]);

              // Seed goal events (also pass teamIdMap for accurate team_id)
              const events = footballData.extractGoalEvents(rawMatch, teamIdMap);
              for (const event of events) {
                // Skip events whose team_id isn't in our seeded set
                if (!event.team_id || !teamIdMap[event.team_id]) continue;

                await pool.query(`
                  INSERT INTO match_events
                    (match_id, team_id, player_name, event_type, event_detail,
                     time_elapsed, time_extra, comments)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                  ON DUPLICATE KEY UPDATE time_elapsed = VALUES(time_elapsed)
                `, [
                  event.match_id,
                  event.team_id,
                  event.player_name,
                  event.event_type,
                  event.event_detail,
                  event.time_elapsed,
                  event.time_extra  || 0,
                  event.comments    || ''
                ]);
              }

              seededCount++;
              totalMatches++;
            } catch (matchError) {
              console.error(`⚠️  Error seeding match ${rawMatch.id}:`, matchError.message);
              // Continue with next match
            }
          }

          console.log(`✅ Seeded ${seededCount} matches with events`);
        }

        // Pause before next competition (skip on last iteration)
        if (comp !== competitionsToSeed[competitionsToSeed.length - 1]) {
          console.log('⏳ Waiting 6 seconds before next competition...');
          await footballData.delay(6000);
        }

      } catch (compError) {
        console.error(`❌ Error processing ${comp.name}:`, compError.message);
        // Continue with next competition
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 Database seeding completed!');
    console.log('='.repeat(60));
    console.log(`📊 Total leagues seeded : ${competitionsToSeed.length}`);
    console.log(`👥 Total teams seeded   : ${totalTeams}`);
    console.log(`⚽ Total matches seeded : ${totalMatches}`);
    console.log('='.repeat(60));
    console.log('\n✅ You can now:');
    console.log('   1. Start the server : npm run dev');
    console.log('   2. Visit            : http://localhost:3000/analysis');
    console.log('   3. Select any team and analyze!\n');

  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error('💡 Make sure:');
    console.error('   - FOOTBALL_DATA_API_KEY is set in .env');
    console.error('   - MySQL is running');
    console.error('   - You ran: npm run db:migrate');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

console.log('🚀 Starting dynamic seed from Football-Data.org API...');
console.log('⏱️  This will take ~2-3 minutes due to rate limiting (10 req/min)');
console.log('');
seedFromAPI();
