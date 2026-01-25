import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbRun } from '../src/lib/database.js';

async function deleteBogusGames() {
  const db = openDatabase();
  
  console.log('\n=== Deleting bogus aggregate games ===');
  
  try {
    await dbRun(db, `
      DELETE FROM game_summary
      WHERE game_id LIKE '%total%'
    `);
    
    console.log('✓ Deleted all games with game_id containing "total"');
    console.log('\nThese were test/seed data that inflated player stats');
    console.log('Affected players: LeBron, Curry, Giannis, Luka, Paolo');
    console.log('\nNext steps:');
    console.log('1. Run: npx tsx scripts/rebuild_slices.ts');
    console.log('2. Check the watchlist to verify stats are correct');
  } catch (error) {
    console.error('Error deleting bogus games:', error);
  }
}

deleteBogusGames().catch(console.error);
