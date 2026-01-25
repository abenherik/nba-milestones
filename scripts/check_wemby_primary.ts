/**
 * Check Wembanyama blocks with forced primary database read
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll, closeDatabase, setForcePrimaryReads } from '../src/lib/database.js';

async function checkWithPrimary() {
  // Force reads from primary database to bypass replica lag
  setForcePrimaryReads(30000); // 30 seconds
  
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
    
    console.log('\n=== Victor Wembanyama Blocks (PRIMARY READ) ===');
    results.forEach(row => {
      console.log(`${row.season}: ${row.games} games, ${row.blocks} blocks`);
    });
    
    const totalBlocks = results.reduce((sum, r) => sum + (r.blocks || 0), 0);
    console.log(`\nTotal career blocks: ${totalBlocks}`);
    
  } finally {
    await closeDatabase(db);
  }
}

checkWithPrimary().catch(console.error);
