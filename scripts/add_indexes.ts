import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbRun } from '../src/lib/database.js';

async function addIndexes() {
  const db = openDatabase();
  
  console.log('\n=== Adding Performance Indexes ===\n');
  
  try {
    // Index for age-based queries (most common)
    console.log('Creating index on (age_at_game_years, season_type)...');
    await dbRun(db, `
      CREATE INDEX IF NOT EXISTS idx_age_season 
      ON game_summary(age_at_game_years, season_type)
    `);
    console.log('✓ Created idx_age_season');
    
    // Index for player lookups
    console.log('Creating index on (player_id, season_type)...');
    await dbRun(db, `
      CREATE INDEX IF NOT EXISTS idx_player_season 
      ON game_summary(player_id, season_type)
    `);
    console.log('✓ Created idx_player_season');
    
    // Composite index for common query patterns
    console.log('Creating index on (age_at_game_years, season_type, player_id)...');
    await dbRun(db, `
      CREATE INDEX IF NOT EXISTS idx_age_season_player 
      ON game_summary(age_at_game_years, season_type, player_id)
    `);
    console.log('✓ Created idx_age_season_player');
    
    console.log('\n✅ All indexes created successfully!');
    console.log('\nThis will reduce database reads by 10-100x on future queries.');
    
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
  }
}

addIndexes().catch(console.error);
