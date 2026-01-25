import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll, dbRun } from '../src/lib/database.js';
import { fetchPlayerGameLog, getCurrentSeason } from '../src/lib/nba-api.js';

async function testUpdate() {
  console.log('\n=== Testing Single Player Update ===\n');
  
  const db = openDatabase();
  const season = getCurrentSeason();
  
  console.log(`Current season: ${season}`);
  
  // Test with Paolo Banchero (1630163)
  const testPlayer = {
    id: '1630163',
    full_name: 'Paolo Banchero',
    birthdate: '2002-11-12'
  };
  
  console.log(`\nFetching games for ${testPlayer.full_name}...`);
  
  try {
    const games = await fetchPlayerGameLog(testPlayer.id, season);
    console.log(`Found ${games.length} games from NBA API`);
    
    if (games.length > 0) {
      console.log('\nFirst 3 games:');
      games.slice(0, 3).forEach((g: any) => {
        console.log(`  ${g.GAME_DATE}: ${g.PTS} pts, ${g.AST} ast (Game ID: ${g.Game_ID})`);
      });
      
      console.log('\n Attempting to insert first game...');
      const game = games[0];
      
      try {
        await dbRun(
          db,
          `INSERT OR REPLACE INTO game_summary (
            player_id, player_name, game_id, game_date, season, season_type,
            points, rebounds, assists, blocks, steals, age_at_game_years
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            testPlayer.id,
            testPlayer.full_name,
            game.Game_ID,
            game.GAME_DATE,
            season,
            'Regular Season',
            game.PTS ?? 0,
            game.REB ?? 0,
            game.AST ?? 0,
            game.BLK ?? 0,
            game.STL ?? 0,
            null
          ]
        );
        
        console.log('✓ Successfully inserted game!');
        
        // Verify it was inserted
        const check = await dbAll(
          db,
          'SELECT * FROM game_summary WHERE game_id = ?',
          [game.Game_ID]
        );
        
        if (check.length > 0) {
          console.log('✓ Verified game in database:', check[0]);
        } else {
          console.log('❌ Game not found in database after insert!');
        }
        
      } catch (insertErr) {
        console.error('❌ Error inserting game:', insertErr);
      }
    }
  } catch (err) {
    console.error('❌ Error fetching games:', err);
  }
}

testUpdate().catch(console.error);
