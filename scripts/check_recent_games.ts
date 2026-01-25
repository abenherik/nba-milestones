/**
 * Check when game_summary was last updated in Turso
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll, closeDatabase, setForcePrimaryReads } from '../src/lib/database.js';

async function checkLastUpdate() {
  // Force primary read
  setForcePrimaryReads(30000);
  
  const db = openDatabase();
  
  try {
    // Check most recent games in game_summary
    const recentGames = await dbAll<any>(
      db,
      `SELECT player_id, game_date, season, blocks, game_id
       FROM game_summary
       WHERE player_id = '1641705'
       ORDER BY game_date DESC
       LIMIT 20`
    );
    
    console.log('\n=== Victor Wembanyama Recent Games (PRIMARY) ===');
    recentGames.forEach((game, idx) => {
      console.log(`${idx + 1}. ${game.game_date} (${game.season}) - ${game.blocks} blocks [Game: ${game.game_id}]`);
    });
    
    // Check total blocks by season
    const seasonTotals = await dbAll<any>(
      db,
      `SELECT season, COUNT(*) as games, SUM(blocks) as blocks
       FROM game_summary
       WHERE player_id = '1641705' AND season_type = 'Regular Season'
       GROUP BY season
       ORDER BY season DESC`
    );
    
    console.log('\n=== Season Totals (PRIMARY) ===');
    seasonTotals.forEach(row => {
      console.log(`${row.season}: ${row.games} games, ${row.blocks} blocks`);
    });
    
  } finally {
    await closeDatabase(db);
  }
}

checkLastUpdate().catch(console.error);
