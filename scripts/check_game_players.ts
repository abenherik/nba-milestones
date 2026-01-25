import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll } from '../src/lib/database.js';

async function checkGame() {
  const db = openDatabase();
  
  const players = await dbAll(db, `
    SELECT * FROM game_summary 
    WHERE game_id = '0022500143'
  `);
  
  console.log(`\nPlayers in game 0022500143: ${players.length}`);
  players.forEach((p: any) => {
    console.log(`  ${p.player_name} (${p.player_id}): ${p.points}pts ${p.assists}ast`);
  });
}

checkGame().catch(console.error);
