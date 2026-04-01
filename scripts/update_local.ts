/**
 * Local script to update active players directly to Turso
 * Bypasses Vercel entirely - run with: npm run update:local
 */

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll, dbRun, dbBatch, closeDatabase } from '../src/lib/database.js';
import { fetchPlayerGameLog, getCurrentSeason, calculateAgeAtGame } from '../src/lib/nba-api.js';
import { incrementPlayerMilestones } from '../src/lib/milestone_processor.js';

interface Player {
  id: string;
  full_name: string;
  birthdate: string | null;
}

async function updatePlayers() {
  console.log('='.repeat(60));
  console.log('NBA Active Player Stats Update (Local)');
  console.log('='.repeat(60));
  console.log(`Started: ${new Date().toISOString()}\n`);

  const db = openDatabase();
  const season = getCurrentSeason();
  
  console.log(`Current season: ${season}\n`);

  try {
    // Get all active players
    const players = await dbAll<Player>(
      db,
      'SELECT id, full_name, birthdate FROM players WHERE is_active = 1'
    );
    
    console.log(`Found ${players.length} active players\n`);

    let stats = {
      playersIterated: 0,
      playersWithGames: 0,
      playersNoGames: 0,
      gamesAdded: 0,
      gamesSkipped: 0,
      errors: 0,
      timeouts: 0
    };

    // Process each player
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const progress = `[${i + 1}/${players.length}]`;

      stats.playersIterated++;
      
      console.log(`${progress} Processing ${player.full_name} (${player.id})...`);

      try {
        // Fetch games from NBA API
        const games = await fetchPlayerGameLog(player.id, season, 'Regular Season');
        
        if (games.length === 0) {
          console.log(`  No games found`);
          stats.playersNoGames++;
          continue;
        }

        stats.playersWithGames++;

        console.log(`  Found ${games.length} games`);

        // Fetch existing game_ids for this player+season once (avoids per-game SELECTs).
        const existingRows = await dbAll<{ game_id: string }>(
          db,
          `SELECT game_id FROM game_summary WHERE player_id = ? AND season = ?`,
          [player.id, season]
        );
        const existingIds = new Set(existingRows.map(r => String(r.game_id)));

        const toInsert = games.filter(g => !existingIds.has(String(g.Game_ID)));
        const skipped = Math.max(0, games.length - toInsert.length);
        stats.gamesSkipped += skipped;

        const statements = toInsert.map(game => {
          const ageAtGame = player.birthdate && game.GAME_DATE
            ? calculateAgeAtGame(player.birthdate, game.GAME_DATE)
            : null;
          return {
            sql: `INSERT INTO game_summary (
              player_id, player_name, game_id, game_date, season, season_type,
              points, rebounds, assists, blocks, steals, age_at_game_years
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            params: [
              player.id,
              player.full_name,
              game.Game_ID,
              game.GAME_DATE,
              season,
              'Regular Season',
              game.PTS ?? 0,
              game.REB ?? 0,
              game.AST ?? 0,
              game.BLK ?? 0,
              game.STL ?? 0,
              ageAtGame,
            ],
            // keep the mapped data for delta processing
            dataForDelta: {
              season_type: 'Regular Season',
              points: game.PTS ?? 0,
              rebounds: game.REB ?? 0,
              assists: game.AST ?? 0,
              blocks: game.BLK ?? 0,
              steals: game.STL ?? 0,
              age_at_game_years: ageAtGame,
            }
          };
        });

        let addedForPlayer = 0;
        let errorsForPlayer = 0;

        if (statements.length) {
          try {
            // we map to just dbBatch input payload: { sql, params } to prevent database errors 
            // since dataForDelta is not part of the standard batch record
            await dbBatch(db, statements.map(s => ({ sql: s.sql, params: s.params })));
            addedForPlayer = statements.length;
            
            // Process the delta for milestones immediately!
            try {
               await incrementPlayerMilestones(
                 db, 
                 player.id, 
                 statements.map(s => s.dataForDelta)
               );
            } catch (deltaErr) {
               console.error(`  Failed to apply milestones delta:`, deltaErr);
            }
          } catch (err) {
            console.error(`  Batch insert failed; falling back to sequential inserts`, err);
            const successfulGames = [];
            for (const s of statements) {
              try {
                await dbRun(db, s.sql, s.params ?? []);
                addedForPlayer++;
                successfulGames.push(s.dataForDelta);
              } catch (e) {
                errorsForPlayer++;
              }
            }
            if (successfulGames.length > 0) {
               try {
                 await incrementPlayerMilestones(
                   db,
                   player.id,
                   successfulGames
                 );
               } catch (deltaErr) {
                 console.error(`  Failed to apply sequential milestones delta:`, deltaErr);
               }
            }
          }
        }

        stats.gamesAdded += addedForPlayer;
        stats.errors += errorsForPlayer;
        // (Players iterated is tracked at loop start; playersWithGames increments above.)

        if (addedForPlayer || skipped || errorsForPlayer) {
          console.log(`  ✓ Added ${addedForPlayer}, skipped ${skipped}, errors ${errorsForPlayer}\n`);
        } else {
          console.log(`  ✓ No new games\n`);
        }

      } catch (err: any) {
        if (err.message?.includes('timeout') || err.message?.includes('timed out')) {
          console.log(`  ⏱️  TIMEOUT - NBA API too slow, skipping\n`);
          stats.timeouts++;
        } else {
          console.error(`  ✗ ERROR: ${err.message}\n`);
          stats.errors++;
        }
      }

      // Progress update every 50 players
      if ((i + 1) % 50 === 0) {
        console.log(`\n--- Progress: ${i + 1}/${players.length} players ---`);
        console.log(`Games added: ${stats.gamesAdded}, Skipped: ${stats.gamesSkipped}, Timeouts: ${stats.timeouts}, Errors: ${stats.errors}\n`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✓ Update Complete!');
    console.log('='.repeat(60));
    console.log(`Players iterated: ${stats.playersIterated}`);
    console.log(`Players with games: ${stats.playersWithGames}`);
    console.log(`Players with no games: ${stats.playersNoGames}`);
    console.log(`Games added: ${stats.gamesAdded}`);
    console.log(`Games skipped: ${stats.gamesSkipped}`);
    console.log(`Timeouts: ${stats.timeouts}`);
    console.log(`Errors: ${stats.errors}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('✗ FATAL ERROR:', error);
    console.error('='.repeat(60));
  } finally {
    await closeDatabase(db);
  }
}

// Run the update
updatePlayers().catch(console.error);
