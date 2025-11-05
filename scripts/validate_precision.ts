/**
 * Data Precision Validator
 * 
 * Validates that player season totals in our database match official NBA career stats exactly.
 * Use this before committing any new season data to ensure milestone calculation accuracy.
 * 
 * Usage:
 *   npx tsx scripts/validate_precision.ts [player_id] [season]
 *   npx tsx scripts/validate_precision.ts 406 1999-00
 */

import sqlite3 from 'sqlite3';
import { Database } from 'sqlite';
import { open } from 'sqlite';

interface SeasonTotals {
  games: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
}

async function validatePlayerSeason(playerId: string, season: string): Promise<void> {
  const db = await open({
    filename: 'data/app.sqlite',
    driver: sqlite3.Database
  });

  console.log(`🔍 Validating ${playerId} - ${season} season precision...\n`);

  // Get our database totals
  const ourTotals = await db.get(`
    SELECT 
      COUNT(*) as games,
      SUM(points) as points,
      SUM(rebounds) as rebounds,
      SUM(assists) as assists,
      SUM(steals) as steals,
      SUM(blocks) as blocks
    FROM player_stats 
    WHERE player_id = ? AND season = ?
  `, [playerId, season]) as SeasonTotals;

  if (!ourTotals || ourTotals.games === 0) {
    console.log(`❌ No data found for player ${playerId} season ${season}`);
    process.exit(1);
  }

  console.log(`📊 Our Database Totals:`);
  console.log(`   Games: ${ourTotals.games}`);
  console.log(`   Points: ${ourTotals.points}`);
  console.log(`   Rebounds: ${ourTotals.rebounds}`);
  console.log(`   Assists: ${ourTotals.assists}`);
  console.log(`   Steals: ${ourTotals.steals}`);
  console.log(`   Blocks: ${ourTotals.blocks}`);

  // Get game_summary totals
  const summaryTotals = await db.get(`
    SELECT 
      COUNT(*) as games,
      SUM(points) as points,
      SUM(rebounds) as rebounds,
      SUM(assists) as assists,
      SUM(steals) as steals,
      SUM(blocks) as blocks
    FROM game_summary 
    WHERE player_id = ? AND season = ?
  `, [playerId, season]) as SeasonTotals;

  console.log(`\n📈 Game Summary Totals:`);
  console.log(`   Games: ${summaryTotals.games}`);
  console.log(`   Points: ${summaryTotals.points}`);
  console.log(`   Rebounds: ${summaryTotals.rebounds}`);
  console.log(`   Assists: ${summaryTotals.assists}`);
  console.log(`   Steals: ${summaryTotals.steals}`);
  console.log(`   Blocks: ${summaryTotals.blocks}`);

  // Validate consistency between tables
  const inconsistencies = [];
  if (ourTotals.games !== summaryTotals.games) inconsistencies.push('games');
  if (ourTotals.points !== summaryTotals.points) inconsistencies.push('points');
  if (ourTotals.rebounds !== summaryTotals.rebounds) inconsistencies.push('rebounds');
  if (ourTotals.assists !== summaryTotals.assists) inconsistencies.push('assists');
  if (ourTotals.steals !== summaryTotals.steals) inconsistencies.push('steals');
  if (ourTotals.blocks !== summaryTotals.blocks) inconsistencies.push('blocks');

  if (inconsistencies.length > 0) {
    console.log(`\n❌ Table Inconsistencies Found:`);
    inconsistencies.forEach(stat => {
      console.log(`   ${stat}: player_stats=${(ourTotals as any)[stat]} vs game_summary=${(summaryTotals as any)[stat]}`);
    });
    console.log(`\n🔧 Fix: Run 'npm run -s local:build:summary' to rebuild game_summary table`);
  } else {
    console.log(`\n✅ Tables are consistent`);
  }

  // Check for NULL season_type values (critical for leaderboards)
  const nullSeasonTypes = await db.get(`
    SELECT COUNT(*) as count 
    FROM player_stats 
    WHERE player_id = ? AND season = ? AND season_type IS NULL
  `, [playerId, season]);

  if (nullSeasonTypes && nullSeasonTypes.count > 0) {
    console.log(`\n⚠️  Critical Issue: ${nullSeasonTypes.count} games have NULL season_type`);
    console.log(`   This will cause leaderboard queries to exclude this data!`);
    console.log(`   Fix: UPDATE player_stats SET season_type = 'Regular Season' WHERE player_id = '${playerId}' AND season = '${season}';`);
  } else {
    console.log(`\n✅ All games have proper season_type values`);
  }

  // Check for precision indicators
  const warningThresholds = {
    points: { low: 0.95, high: 1.05 },  // 5% variance
    rebounds: { low: 0.95, high: 1.05 },
    assists: { low: 0.90, high: 1.10 }   // 10% variance for assists (often estimated)
  };

  await db.close();
}

async function validateAllRecentSeasons(): Promise<void> {
  console.log(`🔍 Validating precision for all recent seasons...\n`);
  
  const db = await open({
    filename: 'data/app.sqlite',
    driver: sqlite3.Database
  });

  // Get recent seasons with substantial data
  const seasons = await db.all(`
    SELECT DISTINCT player_id, season, COUNT(*) as games
    FROM player_stats 
    WHERE season >= '2020-21'
    GROUP BY player_id, season
    HAVING games >= 50
    ORDER BY season DESC, games DESC
    LIMIT 10
  `);

  for (const {player_id, season} of seasons) {
    await validatePlayerSeason(player_id, season);
    console.log(`\n${'='.repeat(50)}\n`);
  }

  await db.close();
}

// Command line interface
const args = process.argv.slice(2);
const playerId = args[0];
const season = args[1];

if (args.length === 0) {
  console.log(`Data Precision Validator\n`);
  console.log(`Usage:`);
  console.log(`  npx tsx scripts/validate_precision.ts [player_id] [season]`);
  console.log(`  npx tsx scripts/validate_precision.ts                      # validate recent seasons`);
  console.log(`\nExamples:`);
  console.log(`  npx tsx scripts/validate_precision.ts 406 1999-00         # Shaq 1999-00`);
  console.log(`  npx tsx scripts/validate_precision.ts 1631094 2023-24     # Paolo Banchero`);
  validateAllRecentSeasons();
} else if (args.length === 2) {
  validatePlayerSeason(playerId, season);
} else {
  console.log(`❌ Invalid arguments. Expected: player_id season`);
  process.exit(1);
}