import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll } from '../src/lib/database.js';

async function checkSlices() {
  const db = openDatabase();
  
  // Check current slices version
  const versions = await dbAll(db, `
    SELECT DISTINCT version 
    FROM leaderboard_slices 
    ORDER BY version DESC 
    LIMIT 5
  `);
  
  console.log('\nSlices versions in database:');
  versions.forEach((v: any) => {
    console.log(`  ${v.version}`);
  });
  
  // Check Anthony Edwards stats
  const anthonyEdwards = await dbAll(db, `
    SELECT 
      SUM(points) as total_points,
      SUM(assists) as total_assists,
      SUM(rebounds) as total_rebounds,
      COUNT(*) as games,
      MAX(game_date) as latest_game
    FROM game_summary
    WHERE player_id = '1630162'
  `);
  
  console.log('\nAnthony Edwards raw stats in database:');
  console.log(anthonyEdwards[0]);
  
  // Check what's in the slices for Anthony Edwards
  const sliceData = await dbAll(db, `
    SELECT slice_key, version, data
    FROM leaderboard_slices
    WHERE data LIKE '%Anthony Edwards%'
    ORDER BY version DESC
    LIMIT 5
  `);
  
  console.log(`\nAnthony Edwards in ${sliceData.length} slices (latest version):`);
  if (sliceData.length > 0) {
    const parsed = JSON.parse(sliceData[0].data);
    const ant = parsed.find((p: any) => p.player_name === 'Anthony Edwards');
    if (ant) {
      console.log(`  Version: ${sliceData[0].version}`);
      console.log(`  Value: ${ant.value}`);
      console.log(`  Rank: ${ant.rank}`);
    }
  }
  
  // Check for bogus games still in database
  const bogus = await dbAll(db, `
    SELECT COUNT(*) as count
    FROM game_summary
    WHERE game_id LIKE '%total%'
  `);
  
  console.log(`\nBogus 'total' games remaining: ${bogus[0]?.count || 0}`);
}

checkSlices().catch(console.error);
