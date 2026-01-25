import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll } from '../src/lib/database.js';

async function comprehensiveCheck() {
  const db = openDatabase();
  
  console.log('\n' + '='.repeat(60));
  console.log('COMPREHENSIVE DATA QUALITY CHECK');
  console.log('='.repeat(60));
  
  // 1. Check for unrealistic single-game stats
  console.log('\n1. UNREALISTIC SINGLE-GAME STATS');
  console.log('-'.repeat(60));
  
  const highPoints = await dbAll(db, `
    SELECT player_name, game_id, game_date, season, points, assists, rebounds, steals, blocks
    FROM game_summary
    WHERE points > 100 OR assists > 30 OR rebounds > 40 OR steals > 15 OR blocks > 20
    ORDER BY points DESC
    LIMIT 20
  `);
  
  if (highPoints.length > 0) {
    console.log(`❌ Found ${highPoints.length} games with unrealistic stats:`);
    highPoints.forEach((g: any) => {
      console.log(`  ${g.player_name} (${g.game_date}): ${g.points}pts ${g.assists}ast ${g.rebounds}reb ${g.steals}stl ${g.blocks}blk`);
    });
  } else {
    console.log('✅ No unrealistic single-game stats found');
  }
  
  // 2. Check for suspicious game IDs
  console.log('\n2. SUSPICIOUS GAME IDs');
  console.log('-'.repeat(60));
  
  const suspiciousIds = await dbAll(db, `
    SELECT DISTINCT game_id, COUNT(*) as player_count
    FROM game_summary
    WHERE game_id LIKE '%total%' 
       OR game_id LIKE '%test%'
       OR game_id LIKE '%seed%'
       OR game_id LIKE '%demo%'
       OR game_id LIKE '%sample%'
    GROUP BY game_id
    LIMIT 20
  `);
  
  if (suspiciousIds.length > 0) {
    console.log(`❌ Found ${suspiciousIds.length} suspicious game IDs:`);
    suspiciousIds.forEach((g: any) => {
      console.log(`  ${g.game_id} (${g.player_count} players)`);
    });
  } else {
    console.log('✅ No suspicious game IDs found');
  }
  
  // 3. Check for duplicate games
  console.log('\n3. DUPLICATE GAMES');
  console.log('-'.repeat(60));
  
  const duplicates = await dbAll(db, `
    SELECT game_id, player_id, COUNT(*) as count
    FROM game_summary
    GROUP BY game_id, player_id
    HAVING count > 1
    LIMIT 20
  `);
  
  if (duplicates.length > 0) {
    console.log(`❌ Found ${duplicates.length} duplicate game entries:`);
    duplicates.forEach((d: any) => {
      console.log(`  Game ${d.game_id}, Player ${d.player_id}: ${d.count} copies`);
    });
  } else {
    console.log('✅ No duplicate games found');
  }
  
  // 4. Check for invalid dates
  console.log('\n4. INVALID DATES');
  console.log('-'.repeat(60));
  
  const invalidDates = await dbAll(db, `
    SELECT player_name, game_id, game_date, season
    FROM game_summary
    WHERE game_date IS NULL 
       OR game_date = '' 
       OR game_date = '0000-00-00'
       OR game_date LIKE '%total%'
       OR game_date LIKE '%test%'
    LIMIT 20
  `);
  
  if (invalidDates.length > 0) {
    console.log(`❌ Found ${invalidDates.length} games with invalid dates:`);
    invalidDates.forEach((g: any) => {
      console.log(`  ${g.player_name} - ${g.game_id}: "${g.game_date}" (${g.season})`);
    });
  } else {
    console.log('✅ No invalid dates found');
  }
  
  // 5. Check for NULL critical fields
  console.log('\n5. NULL CRITICAL FIELDS');
  console.log('-'.repeat(60));
  
  const nullFields = await dbAll(db, `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN player_id IS NULL THEN 1 ELSE 0 END) as null_player_id,
      SUM(CASE WHEN game_id IS NULL THEN 1 ELSE 0 END) as null_game_id,
      SUM(CASE WHEN season IS NULL THEN 1 ELSE 0 END) as null_season,
      SUM(CASE WHEN season_type IS NULL THEN 1 ELSE 0 END) as null_season_type
    FROM game_summary
  `);
  
  const nf = nullFields[0] as any;
  if (nf.null_player_id > 0 || nf.null_game_id > 0 || nf.null_season > 0 || nf.null_season_type > 0) {
    console.log(`❌ Found NULL values in critical fields:`);
    if (nf.null_player_id > 0) console.log(`  player_id: ${nf.null_player_id} records`);
    if (nf.null_game_id > 0) console.log(`  game_id: ${nf.null_game_id} records`);
    if (nf.null_season > 0) console.log(`  season: ${nf.null_season} records`);
    if (nf.null_season_type > 0) console.log(`  season_type: ${nf.null_season_type} records`);
  } else {
    console.log('✅ No NULL values in critical fields');
  }
  
  // 6. Check for unrealistic season assignments
  console.log('\n6. SEASON/DATE MISMATCHES');
  console.log('-'.repeat(60));
  
  const seasonMismatches = await dbAll(db, `
    SELECT player_name, game_id, game_date, season
    FROM game_summary
    WHERE (season = '2024-25' AND game_date < '2024-10-01')
       OR (season = '2023-24' AND (game_date < '2023-10-01' OR game_date >= '2024-10-01'))
       OR (season = '2022-23' AND (game_date < '2022-10-01' OR game_date >= '2023-10-01'))
    LIMIT 20
  `);
  
  if (seasonMismatches.length > 0) {
    console.log(`❌ Found ${seasonMismatches.length} season/date mismatches:`);
    seasonMismatches.forEach((g: any) => {
      console.log(`  ${g.player_name}: ${g.season} season but date ${g.game_date}`);
    });
  } else {
    console.log('✅ No season/date mismatches found');
  }
  
  // 7. Check for negative stats
  console.log('\n7. NEGATIVE STATS');
  console.log('-'.repeat(60));
  
  const negativeStats = await dbAll(db, `
    SELECT player_name, game_id, game_date, points, assists, rebounds, steals, blocks
    FROM game_summary
    WHERE points < 0 OR assists < 0 OR rebounds < 0 OR steals < 0 OR blocks < 0
    LIMIT 20
  `);
  
  if (negativeStats.length > 0) {
    console.log(`❌ Found ${negativeStats.length} games with negative stats:`);
    negativeStats.forEach((g: any) => {
      console.log(`  ${g.player_name} (${g.game_date}): ${g.points}pts ${g.assists}ast ${g.rebounds}reb`);
    });
  } else {
    console.log('✅ No negative stats found');
  }
  
  // 8. Check for age anomalies
  console.log('\n8. AGE ANOMALIES');
  console.log('-'.repeat(60));
  
  const ageAnomalies = await dbAll(db, `
    SELECT player_name, game_id, game_date, age_at_game_years
    FROM game_summary
    WHERE age_at_game_years IS NOT NULL 
      AND (age_at_game_years < 16 OR age_at_game_years > 50)
    LIMIT 20
  `);
  
  if (ageAnomalies.length > 0) {
    console.log(`❌ Found ${ageAnomalies.length} games with unusual ages:`);
    ageAnomalies.forEach((g: any) => {
      console.log(`  ${g.player_name} (${g.game_date}): age ${g.age_at_game_years}`);
    });
  } else {
    console.log('✅ No age anomalies found');
  }
  
  // 9. Summary statistics
  console.log('\n9. SUMMARY STATISTICS');
  console.log('-'.repeat(60));
  
  const summary = await dbAll(db, `
    SELECT 
      COUNT(*) as total_games,
      COUNT(DISTINCT player_id) as unique_players,
      COUNT(DISTINCT game_id) as unique_games,
      COUNT(DISTINCT season) as seasons,
      MIN(game_date) as earliest_date,
      MAX(game_date) as latest_date,
      AVG(points) as avg_points,
      MAX(points) as max_points
    FROM game_summary
  `);
  
  const s = summary[0] as any;
  console.log(`Total game records: ${s.total_games.toLocaleString()}`);
  console.log(`Unique players: ${s.unique_players}`);
  console.log(`Unique games: ${s.unique_games.toLocaleString()}`);
  console.log(`Seasons covered: ${s.seasons}`);
  console.log(`Date range: ${s.earliest_date} to ${s.latest_date}`);
  console.log(`Average points per game: ${s.avg_points.toFixed(1)}`);
  console.log(`Highest single-game points: ${s.max_points}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('CHECK COMPLETE');
  console.log('='.repeat(60) + '\n');
}

comprehensiveCheck().catch(console.error);
