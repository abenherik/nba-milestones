import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll } from '../src/lib/database.js';

async function checkDateRange() {
  const db = openDatabase();
  
  const dates = await dbAll(db, `
    SELECT 
      MIN(game_date) as earliest,
      MAX(game_date) as latest,
      COUNT(*) as total
    FROM game_summary
  `);
  
  console.log('\nDate Range in Database:');
  console.log(dates[0]);
  
  const recent = await dbAll(db, `
    SELECT player_name, game_date, season, points, assists
    FROM game_summary
    ORDER BY game_date DESC
    LIMIT 10
  `);
  
  console.log('\nMost Recent 10 Games:');
  recent.forEach((g: any) => {
    console.log(`${g.game_date} - ${g.player_name} (${g.season}): ${g.points}pts ${g.assists}ast`);
  });
  
  const bySeason = await dbAll(db, `
    SELECT season, COUNT(*) as games, MIN(game_date) as first, MAX(game_date) as last
    FROM game_summary
    GROUP BY season
    ORDER BY season DESC
    LIMIT 10
  `);
  
  console.log('\nRecent Seasons:');
  bySeason.forEach((s: any) => {
    console.log(`${s.season}: ${s.games} games (${s.first} to ${s.last})`);
  });
}

checkDateRange().catch(console.error);
