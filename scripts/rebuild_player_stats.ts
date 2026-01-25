/**
 * Rebuild player_stats from game_summary table
 * Run after updating game_summary to sync aggregated stats
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll, dbRun, closeDatabase } from '../src/lib/database.js';

async function rebuildPlayerStats() {
  console.log('='.repeat(60));
  console.log('Rebuilding player_stats from game_summary');
  console.log('='.repeat(60));
  
  const db = openDatabase();
  
  try {
    console.log('\n1. Clearing existing player_stats...');
    await dbRun(db, 'DELETE FROM player_stats');
    console.log('   ✓ Cleared');
    
    console.log('\n2. Aggregating from game_summary...');
    await dbRun(db, `
      INSERT INTO player_stats (
        player_id, game_id, season, season_type,
        points, rebounds, assists, blocks, steals
      )
      SELECT 
        player_id,
        game_id,
        season,
        season_type,
        points,
        rebounds,
        assists,
        blocks,
        steals
      FROM game_summary
    `);
    
    console.log('   ✓ Aggregated');
    
    // Get counts
    const gameSummaryCount = await dbAll(db, 'SELECT COUNT(*) as count FROM game_summary');
    const playerStatsCount = await dbAll(db, 'SELECT COUNT(*) as count FROM player_stats');
    
    console.log(`\n3. Verification:`);
    console.log(`   game_summary rows: ${gameSummaryCount[0].count}`);
    console.log(`   player_stats rows: ${playerStatsCount[0].count}`);
    
    // Check Wembanyama specifically
    const wembyStats = await dbAll<any>(db, `
      SELECT 
        season,
        COUNT(*) as games,
        SUM(blocks) as blocks
      FROM player_stats
      WHERE player_id = '1641705' AND season_type = 'Regular Season'
      GROUP BY season
      ORDER BY season DESC
    `);
    
    console.log(`\n4. Victor Wembanyama check:`);
    wembyStats.forEach(row => {
      console.log(`   ${row.season}: ${row.games} games, ${row.blocks} blocks`);
    });
    
    const totalBlocks = wembyStats.reduce((sum, r) => sum + (r.blocks || 0), 0);
    console.log(`   Total blocks: ${totalBlocks}`);
    
    console.log('\n✓ Rebuild complete!');
    
  } finally {
    await closeDatabase(db);
  }
}

rebuildPlayerStats().catch(console.error);
