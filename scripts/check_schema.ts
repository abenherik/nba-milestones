import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll } from '../src/lib/database.js';

async function checkSchema() {
  const db = openDatabase();
  
  const schema = await dbAll(db, `SELECT sql FROM sqlite_master WHERE name='game_summary'`);
  console.log('\nGame Summary Schema:');
  console.log(schema[0]?.sql);
  
  // Get a sample row to see actual columns
  const sample = await dbAll(db, `SELECT * FROM game_summary WHERE player_id = 201939 LIMIT 1`);
  console.log('\nSample row columns:');
  if (sample[0]) {
    console.log(Object.keys(sample[0]));
  }
}

checkSchema().catch(console.error);
