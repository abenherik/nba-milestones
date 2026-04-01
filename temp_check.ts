import { openDatabase, dbAll } from './src/lib/database.ts';
import fs from 'fs';

async function check() {
  const db = openDatabase();
  try {
    const tables = await dbAll(db, "SELECT name FROM sqlite_master WHERE type='table'");
    
    // Also check how many rows in players vs game_summary
    const pCount = await dbAll(db, "SELECT COUNT(*) as c FROM players");
    const gCount = await dbAll(db, "SELECT COUNT(*) as c FROM game_summary");
    
    let sCount = [{c: 'error'}];
    try {
        sCount = await dbAll(db, "SELECT COUNT(*) as c FROM player_milestone_summary");
    } catch(e) {}
    
    const output = { tables, pCount, gCount, sCount };
    fs.writeFileSync('output.json', JSON.stringify(output, null, 2));
    console.log("WROTE TO output.json");
    process.exit(0);
  } catch (e: any) {
    fs.writeFileSync('output.json', JSON.stringify({error: e.message}));
    process.exit(1);
  }
}

check();
