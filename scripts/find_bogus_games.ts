import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll } from '../src/lib/database.js';

async function findBogusGames() {
  const db = openDatabase();
  
  console.log('\n=== Finding aggregate/total games (not real games) ===');
  
  // Check for game IDs with "total" in them
  const totalGames = await dbAll(db, `
    SELECT player_id, player_name, game_id, game_date, season, points, assists, steals
    FROM game_summary
    WHERE game_id LIKE '%total%'
    ORDER BY points DESC
    LIMIT 50
  `);
  
  console.log(`\nFound ${totalGames.length} games with 'total' in game_id:`);
  totalGames.forEach((g: any) => {
    console.log(`${g.player_name} - ${g.game_id}: ${g.points} pts, ${g.assists} ast (${g.game_date})`);
  });
  
  // Check for abnormally high point totals (> 150)
  const highPoints = await dbAll(db, `
    SELECT player_id, player_name, game_id, game_date, season, points, assists, steals
    FROM game_summary
    WHERE points > 150
    ORDER BY points DESC
  `);
  
  console.log(`\n=== Games with > 150 points ===`);
  console.log(`Found ${highPoints.length} games:`);
  highPoints.forEach((g: any) => {
    console.log(`${g.player_name} - ${g.game_id}: ${g.points} pts, ${g.assists} ast (${g.game_date})`);
  });
  
  // Count affected players
  const affectedPlayers = await dbAll(db, `
    SELECT DISTINCT player_id, player_name
    FROM game_summary
    WHERE game_id LIKE '%total%' OR points > 150
  `);
  
  console.log(`\n=== Affected players: ${affectedPlayers.length} ===`);
  affectedPlayers.slice(0, 20).forEach((p: any) => {
    console.log(`${p.player_name} (${p.player_id})`);
  });
}

findBogusGames().catch(console.error);
