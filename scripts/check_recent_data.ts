import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll } from '../src/lib/database.js';

async function checkRecentData() {
  const db = openDatabase();
  
  console.log('\n=== Checking 2024-25 Season Data ===');
  
  const season2425 = await dbAll(db, `
    SELECT game_date, COUNT(*) as games
    FROM game_summary
    WHERE season = '2024-25'
    GROUP BY game_date
    ORDER BY game_date DESC
    LIMIT 20
  `);
  
  console.log('\nMost recent dates in 2024-25 season:');
  season2425.forEach((d: any) => {
    console.log(`  ${d.game_date}: ${d.games} games`);
  });
  
  console.log('\n=== Checking 2025-26 Season Data ===');
  
  const season2526 = await dbAll(db, `
    SELECT game_date, player_name, points, assists, season_type
    FROM game_summary
    WHERE season = '2025-26'
    ORDER BY game_date DESC
    LIMIT 20
  `);
  
  console.log(`\nTotal 2025-26 games: ${season2526.length} (showing sample):`);
  season2526.slice(0, 10).forEach((g: any) => {
    console.log(`  ${g.game_date} - ${g.player_name} (${g.season_type}): ${g.points}pts ${g.assists}ast`);
  });
  
  // Check for today's date
  console.log('\n=== Checking for November 2025 games ===');
  
  const nov2025 = await dbAll(db, `
    SELECT COUNT(*) as count
    FROM game_summary
    WHERE game_date >= '2025-11-01' AND game_date <= '2025-11-14'
  `);
  
  console.log(`Games between Nov 1-14, 2025: ${nov2025[0]?.count || 0}`);
  
  if (nov2025[0]?.count > 0) {
    const novGames = await dbAll(db, `
      SELECT game_date, player_name, points, assists
      FROM game_summary
      WHERE game_date >= '2025-11-01' AND game_date <= '2025-11-14'
      ORDER BY game_date DESC
      LIMIT 10
    `);
    
    console.log('\nSample November 2025 games:');
    novGames.forEach((g: any) => {
      console.log(`  ${g.game_date} - ${g.player_name}: ${g.points}pts ${g.assists}ast`);
    });
  }
}

checkRecentData().catch(console.error);
