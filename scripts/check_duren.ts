import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll } from '../src/lib/database.js';

async function checkDuren() {
  const db = openDatabase();
  
  console.log('\n=== Jalen Duren Stats Check ===\n');
  
  // Get Duren's recent games
  const recent = await dbAll(db, `
    SELECT game_date, season, points, rebounds, assists, age_at_game_years
    FROM game_summary
    WHERE player_name LIKE '%Duren%'
    ORDER BY game_date DESC
    LIMIT 10
  `);
  
  console.log('Most recent 10 games:');
  recent.forEach((g: any) => {
    console.log(`  ${g.game_date} (${g.season}): ${g.points}pts ${g.rebounds}reb ${g.assists}ast - Age ${g.age_at_game_years}`);
  });
  
  // Check rebounds before age 23
  const reboundsBefore23 = await dbAll(db, `
    SELECT 
      COUNT(*) as games,
      SUM(rebounds) as total_rebounds,
      MAX(game_date) as latest_game
    FROM game_summary
    WHERE player_name LIKE '%Duren%'
      AND age_at_game_years < 23
      AND season_type = 'Regular Season'
  `);
  
  console.log('\nRebounds before age 23 (Regular Season):');
  console.log(reboundsBefore23[0]);
  
  // Check what the current slices show
  const sliceData = await dbAll(db, `
    SELECT slice_key, age, data, version
    FROM leaderboard_slices
    WHERE slice_key LIKE '%rebounds%'
      AND age = 23
      AND season_group = 'RS'
    ORDER BY version DESC
    LIMIT 1
  `);
  
  if (sliceData.length > 0) {
    console.log('\nLeaderboard slice for rebounds before age 23:');
    console.log(`Version: ${sliceData[0].version}`);
    const data = JSON.parse(sliceData[0].data);
    const duren = data.find((p: any) => p.player_name.includes('Duren'));
    if (duren) {
      console.log(`Jalen Duren in slice: Rank ${duren.rank}, Value ${duren.value}`);
    } else {
      console.log('Jalen Duren NOT in top 25');
      console.log('Top 3:');
      data.slice(0, 3).forEach((p: any) => {
        console.log(`  ${p.rank}. ${p.player_name}: ${p.value}`);
      });
    }
  }
}

checkDuren().catch(console.error);
