import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll } from '../src/lib/database.js';

async function checkLatestData() {
  const db = openDatabase();
  
  // Check most recent game date
  const latest = await dbAll(db, `
    SELECT MAX(game_date) as latest_date, COUNT(*) as total_games
    FROM game_summary
  `);
  
  console.log('\n=== Database Status ===');
  console.log(`Total games: ${latest[0]?.total_games?.toLocaleString()}`);
  console.log(`Latest game: ${latest[0]?.latest_date}`);
  
  // Check December 2025 games
  const dec2025 = await dbAll(db, `
    SELECT COUNT(*) as count
    FROM game_summary
    WHERE game_date LIKE 'Dec%2025'
  `);
  
  console.log(`December 2025 games: ${dec2025[0]?.count || 0}`);
  
  // Check Jalen Duren specifically
  const jalen = await dbAll(db, `
    SELECT 
      COUNT(*) as games,
      SUM(rebounds) as total_rebounds,
      MAX(game_date) as latest_game
    FROM game_summary
    WHERE player_id = '1631105'
      AND age_at_game_years < 23
      AND season_type = 'Regular Season'
  `);
  
  console.log('\n=== Jalen Duren (before age 23) ===');
  console.log(`Games: ${jalen[0]?.games}`);
  console.log(`Total rebounds: ${jalen[0]?.total_rebounds}`);
  console.log(`Latest game: ${jalen[0]?.latest_game}`);
  
  const today = new Date().toISOString().split('T')[0];
  console.log(`\nToday's date: ${today}`);
  console.log(`Data is ${latest[0]?.latest_date?.includes('Dec') && latest[0]?.latest_date?.includes('2025') ? '✅ FRESH' : '❌ OUTDATED'}`);
}

checkLatestData().catch(console.error);
