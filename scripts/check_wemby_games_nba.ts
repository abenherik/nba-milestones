/**
 * Check what games NBA API returns for Wembanyama in 2025-26
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { fetchPlayerGameLog, getCurrentSeason } from '../src/lib/nba-api.js';

async function checkWembyGames() {
  const playerId = '1641705'; // Victor Wembanyama
  const season = getCurrentSeason(); // Should be 2025-26
  
  console.log(`\nFetching ${season} games for Victor Wembanyama (${playerId})...`);
  
  try {
    const games = await fetchPlayerGameLog(playerId, season, 'Regular Season');
    
    console.log(`\nFound ${games.length} games in ${season} season`);
    
    if (games.length > 0) {
      console.log('\nFirst 5 games:');
      games.slice(0, 5).forEach((game, idx) => {
        console.log(`  ${idx + 1}. ${game.GAME_DATE} vs ${game.MATCHUP}`);
        console.log(`     PTS: ${game.PTS}, BLK: ${game.BLK}, MIN: ${game.MIN}`);
      });
      
      const totalBlocks = games.reduce((sum, g) => sum + (g.BLK || 0), 0);
      console.log(`\nTotal blocks in ${season}: ${totalBlocks}`);
    } else {
      console.log('\nNo games found - 2025-26 season may not have started yet for Wembanyama');
    }
  } catch (error: any) {
    console.error('Error fetching games:', error.message);
  }
}

checkWembyGames().catch(console.error);
