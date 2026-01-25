/**
 * Show schema for player_stats table
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll, closeDatabase } from '../src/lib/database.js';

async function showSchema() {
  const db = openDatabase();
  
  try {
    const schema = await dbAll(db, "PRAGMA table_info(player_stats)");
    console.log('\n=== player_stats schema ===');
    schema.forEach((col: any) => {
      console.log(`  ${col.name}: ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.pk ? ' PRIMARY KEY' : ''}`);
    });
    
  } finally {
    await closeDatabase(db);
  }
}

showSchema().catch(console.error);
