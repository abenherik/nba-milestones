#!/usr/bin/env tsx
import { openDatabase, dbAll, closeDatabase } from '../src/lib/database';

async function main() {
  const db = openDatabase();
  try {
    console.log('Searching for Mathurin...');
    const results = await dbAll(db, `SELECT id, full_name FROM players WHERE full_name LIKE '%Mathurin%'`);
    console.log('Mathurin results:', results);
    
    console.log('\nSearching for Benedict...');
    const results2 = await dbAll(db, `SELECT id, full_name FROM players WHERE full_name LIKE '%Benedict%'`);
    console.log('Benedict results:', results2);
    
    console.log('\nSearching for Bennedict...');
    const results3 = await dbAll(db, `SELECT id, full_name FROM players WHERE full_name LIKE '%Bennedict%'`);
    console.log('Bennedict results:', results3);
    
    console.log('\nChecking current watchlist...');
    const watchlist = await dbAll(db, `SELECT w.player_id, p.full_name FROM watchlist w LEFT JOIN players p ON w.player_id = p.id`);
    console.log('Current watchlist:', watchlist);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await closeDatabase(db);
  }
}

if (require.main === module) {
  main();
}