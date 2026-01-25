/**
 * Check game_summary table for Wembanyama's data in Turso
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll, closeDatabase } from '../src/lib/database.js';

async function checkGameSummary() {
  const db = openDatabase();
  
  try {
    // Check game_summary table for Wembanyama
    const results = await dbAll<any>(
      db,
      `SELECT 
        season,
        COUNT(*) as game_count,
        SUM(blocks) as total_blocks,
        MIN(game_date) as first_game,
        MAX(game_date) as last_game
      FROM game_summary
      WHERE player_id = '1641705'
      GROUP BY season
      ORDER BY season DESC`
    );
    
    console.log('\n=== Victor Wembanyama in game_summary (Turso) ===');
    
    if (results.length > 0) {
      results.forEach(row => {
        console.log(`\nSeason: ${row.season}`);
        console.log(`  Games: ${row.game_count}`);
        console.log(`  Blocks: ${row.total_blocks}`);
        console.log(`  Date range: ${row.first_game} to ${row.last_game}`);
      });
      
      const totalGames = results.reduce((sum, r) => sum + r.game_count, 0);
      const totalBlocks = results.reduce((sum, r) => sum + (r.total_blocks || 0), 0);
      console.log(`\n=== Career Totals ===`);
      console.log(`Total games: ${totalGames}`);
      console.log(`Total blocks: ${totalBlocks}`);
    } else {
      console.log('No data found in game_summary table');
    }
    
  } finally {
    await closeDatabase(db);
  }
}

checkGameSummary().catch(console.error);
