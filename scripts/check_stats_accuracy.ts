import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll } from '../src/lib/database.js';

async function checkStats() {
  const db = openDatabase();
  
  console.log('\n=== Checking Steph Curry (201939) ===');
  const stephTotal = await dbAll(db, `
    SELECT 
      COUNT(*) as game_count,
      SUM(points) as total_points,
      SUM(assists) as total_assists,
      SUM(steals) as total_steals
    FROM game_summary 
    WHERE player_id = '201939'
  `);
  console.log('Total stats:', stephTotal[0]);
  
  const stephByAge = await dbAll(db, `
    SELECT 
      age_at_game_years,
      COUNT(*) as games,
      SUM(points) as points,
      SUM(assists) as assists,
      SUM(steals) as steals
    FROM game_summary 
    WHERE player_id = '201939'
    GROUP BY age_at_game_years
    ORDER BY age_at_game_years
  `);
  console.log('\nBy age:', stephByAge);
  
  console.log('\n=== Checking LeBron James (2544) ===');
  const lebronTotal = await dbAll(db, `
    SELECT 
      COUNT(*) as game_count,
      SUM(points) as total_points,
      SUM(assists) as total_assists,
      SUM(steals) as total_steals
    FROM game_summary 
    WHERE player_id = '2544'
  `);
  console.log('Total stats:', lebronTotal[0]);
  
  const lebronByAge = await dbAll(db, `
    SELECT 
      age_at_game_years,
      COUNT(*) as games,
      SUM(points) as points,
      SUM(assists) as assists,
      SUM(steals) as steals
    FROM game_summary 
    WHERE player_id = '2544'
    GROUP BY age_at_game_years
    ORDER BY age_at_game_years
  `);
  console.log('\nBy age:', lebronByAge.slice(0, 15)); // First 15 rows
  
  // Check for duplicates
  console.log('\n=== Checking for duplicate games ===');
  const stephDupes = await dbAll(db, `
    SELECT game_id, COUNT(*) as count, season, season_type
    FROM game_summary
    WHERE player_id = '201939'
    GROUP BY game_id
    HAVING count > 1
    LIMIT 10
  `);
  console.log('Steph duplicate games:', stephDupes.length > 0 ? stephDupes : 'None');
  
  const lebronDupes = await dbAll(db, `
    SELECT game_id, COUNT(*) as count, season, season_type
    FROM game_summary
    WHERE player_id = '2544'
    GROUP BY game_id
    HAVING count > 1
    LIMIT 10
  `);
  console.log('LeBron duplicate games:', lebronDupes.length > 0 ? lebronDupes : 'None');
  
  // Check season types
  console.log('\n=== Checking season types ===');
  const seasonTypes = await dbAll(db, `
    SELECT season_type, COUNT(*) as count
    FROM game_summary
    WHERE player_id IN ('201939', '2544')
    GROUP BY season_type
  `);
  console.log('Season types:', seasonTypes);
}

checkStats().catch(console.error);
