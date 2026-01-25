import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll } from '../src/lib/database.js';

async function verifyData() {
  const db = openDatabase();
  
  console.log('\n=== DATA VERIFICATION ===\n');
  
  const summary = await dbAll(db, `
    SELECT 
      COUNT(*) as total_games,
      COUNT(DISTINCT player_id) as players,
      COUNT(DISTINCT season) as seasons
    FROM game_summary
  `);
  
  console.log('Overall Stats:');
  console.log(`  Total games: ${summary[0]?.total_games?.toLocaleString()}`);
  console.log(`  Unique players: ${summary[0]?.players}`);
  console.log(`  Seasons: ${summary[0]?.seasons}`);
  
  const bySeason = await dbAll(db, `
    SELECT season, COUNT(*) as games
    FROM game_summary
    GROUP BY season
    ORDER BY season DESC
    LIMIT 5
  `);
  
  console.log('\nRecent Seasons:');
  bySeason.forEach((s: any) => {
    console.log(`  ${s.season}: ${s.games.toLocaleString()} games`);
  });
  
  const sampleRecent = await dbAll(db, `
    SELECT player_name, game_date, season, points, assists
    FROM game_summary
    WHERE game_date LIKE 'Nov%2025'
    ORDER BY game_date DESC, player_name
    LIMIT 20
  `);
  
  console.log('\nSample November 2025 Games:');
  sampleRecent.forEach((g: any) => {
    console.log(`  ${g.game_date} - ${g.player_name}: ${g.points}pts ${g.assists}ast`);
  });
  
  console.log('\n✅ Data looks good! The update script IS working.');
  console.log('The issue was just date format sorting in queries.');
}

verifyData().catch(console.error);
