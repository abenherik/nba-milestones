import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll } from '../src/lib/database.js';

async function checkAge35Games() {
  const db = openDatabase();
  
  console.log('\n=== Steph Curry Age 35 Games ===');
  const games = await dbAll(db, `
    SELECT game_id, game_date, season, season_type, points, assists, steals, rebounds, blocks
    FROM game_summary
    WHERE player_id = '201939' AND age_at_game_years = 35
    ORDER BY game_date
  `);
  
  console.log(`Total games at age 35: ${games.length}`);
  console.log('\nFirst 10 games:');
  games.slice(0, 10).forEach((g: any) => {
    console.log(`${g.game_date} ${g.season} ${g.season_type}: ${g.points} pts, ${g.assists} ast, ${g.steals} stl`);
  });
  
  console.log('\nLast 10 games:');
  games.slice(-10).forEach((g: any) => {
    console.log(`${g.game_date} ${g.season} ${g.season_type}: ${g.points} pts, ${g.assists} ast, ${g.steals} stl`);
  });
  
  // Check for games with abnormally high stats
  console.log('\n=== Games with > 100 points ===');
  const highGames = games.filter((g: any) => g.points > 100);
  console.log(`Found ${highGames.length} games with >100 points`);
  highGames.forEach((g: any) => {
    console.log(`${g.game_id} ${g.game_date}: ${g.points} pts, ${g.assists} ast`);
  });
  
  // Check season distribution
  console.log('\n=== Season distribution for age 35 ===');
  const bySeasonQuery = await dbAll(db, `
    SELECT season, season_type, COUNT(*) as games, SUM(points) as points
    FROM game_summary
    WHERE player_id = '201939' AND age_at_game_years = 35
    GROUP BY season, season_type
    ORDER BY season, season_type
  `);
  console.log(bySeasonQuery);
}

checkAge35Games().catch(console.error);
