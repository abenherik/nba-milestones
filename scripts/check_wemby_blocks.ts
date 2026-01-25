/**
 * Quick script to check Victor Wembanyama's block stats in Turso
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll, closeDatabase } from '../src/lib/database.js';

async function checkWembyBlocks() {
  const db = openDatabase();
  
  try {
    // Get Victor Wembanyama's total blocks
    const results = await dbAll<any>(
      db,
      `SELECT 
        p.id,
        p.full_name,
        p.birthdate,
        COUNT(DISTINCT ps.game_id) as total_games,
        SUM(ps.blocks) as total_blocks,
        SUM(CASE WHEN ps.season = '2025-26' THEN ps.blocks ELSE 0 END) as blocks_2025_26,
        COUNT(DISTINCT CASE WHEN ps.season = '2025-26' THEN ps.game_id END) as games_2025_26,
        SUM(CASE WHEN ps.season = '2024-25' THEN ps.blocks ELSE 0 END) as blocks_2024_25,
        COUNT(DISTINCT CASE WHEN ps.season = '2024-25' THEN ps.game_id END) as games_2024_25,
        SUM(CASE WHEN ps.season = '2023-24' THEN ps.blocks ELSE 0 END) as blocks_2023_24,
        COUNT(DISTINCT CASE WHEN ps.season = '2023-24' THEN ps.game_id END) as games_2023_24
      FROM players p
      LEFT JOIN player_stats ps ON p.id = ps.player_id AND ps.season_type = 'Regular Season'
      WHERE p.id = '1641705'
      GROUP BY p.id, p.full_name, p.birthdate`
    );
    
    if (results.length > 0) {
      const stats = results[0];
      console.log('\n=== Victor Wembanyama Block Stats ===');
      console.log(`Player: ${stats.full_name} (ID: ${stats.id})`);
      console.log(`Birthdate: ${stats.birthdate}`);
      console.log('\nCareer Totals (Regular Season):');
      console.log(`  Total Games: ${stats.total_games}`);
      console.log(`  Total Blocks: ${stats.total_blocks}`);
      console.log('\n2025-26 Season:');
      console.log(`  Games: ${stats.games_2025_26}`);
      console.log(`  Blocks: ${stats.blocks_2025_26}`);
      console.log('\n2024-25 Season:');
      console.log(`  Games: ${stats.games_2024_25}`);
      console.log(`  Blocks: ${stats.blocks_2024_25}`);
      console.log('\n2023-24 Season (Rookie):');
      console.log(`  Games: ${stats.games_2023_24}`);
      console.log(`  Blocks: ${stats.blocks_2023_24}`);
    } else {
      console.log('No data found for Victor Wembanyama (ID: 1641705)');
    }
    
  } finally {
    await closeDatabase(db);
  }
}

checkWembyBlocks().catch(console.error);
