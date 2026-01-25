/**
 * Check Wembanyama blocks WITHOUT forcing primary (test replica sync)
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll, closeDatabase } from '../src/lib/database.js';

async function checkReplica() {
  // DON'T force primary - let it hit replicas naturally
  const db = openDatabase();
  
  try {
    const results = await dbAll<any>(
      db,
      `SELECT 
        season,
        COUNT(*) as games,
        SUM(blocks) as blocks
      FROM game_summary
      WHERE player_id = '1641705' AND season_type = 'Regular Season'
      GROUP BY season
      ORDER BY season DESC`
    );
    
    console.log('\n=== Victor Wembanyama Blocks (REPLICA READ) ===');
    results.forEach(row => {
      console.log(`${row.season}: ${row.games} games, ${row.blocks} blocks`);
    });
    
    const totalBlocks = results.reduce((sum, r) => sum + (r.blocks || 0), 0);
    console.log(`\nTotal career blocks: ${totalBlocks}`);
    console.log(totalBlocks === 470 ? '✓ Replicas have synced!' : '✗ Replicas still lagging (expected 470)');
    
  } finally {
    await closeDatabase(db);
  }
}

checkReplica().catch(console.error);
