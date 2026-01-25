import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbRun, dbAll } from '../src/lib/database.js';

async function createSlicesTable() {
  const db = openDatabase();
  
  console.log('\n=== Creating leaderboard_slices table ===\n');
  
  try {
    // Create the table
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS leaderboard_slices (
        slice_key TEXT NOT NULL,
        season_group TEXT NOT NULL,
        age INTEGER NOT NULL,
        version TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (slice_key, season_group, age)
      )
    `);
    
    console.log('✓ Created leaderboard_slices table');
    
    // Create index for version queries
    await dbRun(db, `
      CREATE INDEX IF NOT EXISTS idx_slices_version 
      ON leaderboard_slices(version)
    `);
    
    console.log('✓ Created version index');
    
    // Create the slices_meta table for version tracking
    await dbRun(db, `
      CREATE TABLE IF NOT EXISTS slices_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    
    console.log('✓ Created slices_meta table');
    
    // Verify tables exist
    const tables = await dbAll(db, `
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name LIKE '%slice%'
    `);
    
    console.log('\nSlice-related tables:');
    tables.forEach((t: any) => {
      console.log(`  ${t.name}`);
    });
    
    console.log('\n✅ All slice tables ready!');
    console.log('\nNow run: npm run rebuild:slices');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

createSlicesTable().catch(console.error);
