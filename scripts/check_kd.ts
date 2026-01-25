import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll } from '../src/lib/database.js';

async function checkKD() {
  const db = openDatabase();
  
  console.log('\n=== Kevin Durant Stats ===\n');
  
  // Get KD's player info
  const player = await dbAll(db, `
    SELECT id, full_name, birthdate, is_active
    FROM players
    WHERE full_name LIKE '%Durant%'
    LIMIT 5
  `);
  
  console.log('Player matches:');
  player.forEach((p: any) => {
    console.log(`  ${p.full_name} (${p.id}) - birthdate: ${p.birthdate}, active: ${p.is_active}`);
  });
  
  // Check KD's games
  const kdId = '201142'; // Kevin Durant's known ID
  
  const games = await dbAll(db, `
    SELECT 
      COUNT(*) as total_games,
      MIN(age_at_game_years) as min_age,
      MAX(age_at_game_years) as max_age,
      SUM(points) as total_points,
      MAX(game_date) as latest_game
    FROM game_summary
    WHERE player_id = '${kdId}'
  `);
  
  console.log('\nKevin Durant game summary:');
  console.log(games[0]);
  
  // Check games before age 24
  const beforeAge24 = await dbAll(db, `
    SELECT 
      COUNT(*) as games,
      SUM(points) as points,
      SUM(assists) as assists,
      SUM(rebounds) as rebounds
    FROM game_summary
    WHERE player_id = '${kdId}' 
      AND age_at_game_years < 24
      AND season_type = 'Regular Season'
  `);
  
  console.log('\nBefore age 24 (Regular Season):');
  console.log(beforeAge24[0]);
  
  // Check if he's in any slices
  const inSlices = await dbAll(db, `
    SELECT slice_key, version
    FROM leaderboard_slices
    WHERE data LIKE '%Durant%'
    LIMIT 10
  `);
  
  console.log(`\nKevin Durant appears in ${inSlices.length} slices`);
  if (inSlices.length > 0) {
    console.log('Sample slices:');
    inSlices.slice(0, 3).forEach((s: any) => {
      console.log(`  ${s.slice_key}`);
    });
  }
  
  // Check watchlist
  const watchlist = await dbAll(db, `
    SELECT player_id, added_at
    FROM watchlist
    WHERE player_id = '${kdId}'
  `);
  
  console.log(`\nIn watchlist: ${watchlist.length > 0 ? 'YES' : 'NO'}`);
}

checkKD().catch(console.error);
