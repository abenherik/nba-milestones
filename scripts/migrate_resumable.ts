#!/usr/bin/env node

/**
 * Resumable migration with smaller batches and rate limiting
 * Can continue from where previous migration left off
 */

import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';
import * as dotenv from 'dotenv';

dotenv.config();

const BATCH_SIZE = 50; // Even smaller batches
const DELAY_MS = 100; // Small delay between operations to avoid rate limits

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function resumableMigration() {
  console.log('🚀 Starting resumable migration...');
  
  const localDb = new Database('data/app.sqlite');
  const tursoDb = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  await tursoDb.execute('SELECT 1');
  console.log('✅ Connection verified');

  try {
    // Check current state in Turso
    console.log('\n🔍 Checking current state...');
    const currentPlayers = await tursoDb.execute('SELECT COUNT(*) as count FROM players');
    const currentGames = await tursoDb.execute('SELECT COUNT(*) as count FROM games');
    const currentSummary = await tursoDb.execute('SELECT COUNT(*) as count FROM game_summary');
    
    console.log(`📊 Current state:`);
    console.log(`   Players: ${currentPlayers.rows[0]?.count?.toLocaleString() || 0}`);
    console.log(`   Games: ${currentGames.rows[0]?.count?.toLocaleString() || 0}`);
    console.log(`   Game summary: ${currentSummary.rows[0]?.count?.toLocaleString() || 0}`);

    // Get total counts from local
    const totalPlayers = localDb.prepare('SELECT COUNT(*) as count FROM players').get().count;
    const totalGames = localDb.prepare('SELECT COUNT(*) as count FROM games').get().count;
    const totalSummary = localDb.prepare('SELECT COUNT(*) as count FROM game_summary').get().count;
    
    console.log(`🎯 Target totals:`);
    console.log(`   Players: ${totalPlayers.toLocaleString()}`);
    console.log(`   Games: ${totalGames.toLocaleString()}`);
    console.log(`   Game summary: ${totalSummary.toLocaleString()}`);

    // Continue players migration if needed
    const playersCompleted = currentPlayers.rows[0]?.count || 0;
    if (playersCompleted < totalPlayers) {
      console.log(`\n👥 Resuming players migration from ${playersCompleted.toLocaleString()}...`);
      
      const playersRemaining = totalPlayers - playersCompleted;
      const playerBatches = Math.ceil(playersRemaining / BATCH_SIZE);
      
      for (let i = 0; i < playerBatches; i++) {
        const offset = playersCompleted + (i * BATCH_SIZE);
        const players = localDb.prepare(`
          SELECT * FROM players 
          ORDER BY id 
          LIMIT ${BATCH_SIZE} OFFSET ${offset}
        `).all();

        if (players.length === 0) break;

        try {
          for (const player of players) {
            await tursoDb.execute(
              'INSERT INTO players (id, full_name, is_active, birthdate) VALUES (?, ?, ?, ?)',
              [player.id, player.full_name, player.is_active, player.birthdate]
            );
          }

          const currentCount = playersCompleted + (i + 1) * players.length;
          if (i % 10 === 0 || players.length < BATCH_SIZE) {
            process.stdout.write(`\r👥 Players: ${currentCount.toLocaleString()}/${totalPlayers.toLocaleString()}`);
          }

          await sleep(DELAY_MS); // Rate limiting
        } catch (error) {
          console.error(`\n❌ Error in player batch ${i}:`, error);
          // Continue with next batch
        }
      }
      console.log('\n✅ Players migration completed');
    }

    // Continue games migration if needed
    const gamesCompleted = currentGames.rows[0]?.count || 0;
    if (gamesCompleted < totalGames) {
      console.log(`\n🏀 Resuming games migration from ${gamesCompleted.toLocaleString()}...`);
      
      const gamesRemaining = totalGames - gamesCompleted;
      const gameBatches = Math.ceil(gamesRemaining / BATCH_SIZE);
      
      for (let i = 0; i < gameBatches; i++) {
        const offset = gamesCompleted + (i * BATCH_SIZE);
        const games = localDb.prepare(`
          SELECT * FROM games 
          ORDER BY game_id 
          LIMIT ${BATCH_SIZE} OFFSET ${offset}
        `).all();

        if (games.length === 0) break;

        try {
          for (const game of games) {
            await tursoDb.execute(
              'INSERT INTO games (game_id, game_date) VALUES (?, ?)',
              [game.game_id, game.game_date]
            );
          }

          const currentCount = gamesCompleted + (i + 1) * games.length;
          if (i % 20 === 0 || games.length < BATCH_SIZE) {
            process.stdout.write(`\r🏀 Games: ${currentCount.toLocaleString()}/${totalGames.toLocaleString()}`);
          }

          await sleep(DELAY_MS);
        } catch (error) {
          console.error(`\n❌ Error in games batch ${i}:`, error);
        }
      }
      console.log('\n✅ Games migration completed');
    }

    // Continue game_summary migration if needed  
    const summaryCompleted = currentSummary.rows[0]?.count || 0;
    if (summaryCompleted < totalSummary) {
      console.log(`\n📋 Resuming game_summary migration from ${summaryCompleted.toLocaleString()}...`);
      
      const summaryRemaining = totalSummary - summaryCompleted;
      const summaryBatches = Math.ceil(summaryRemaining / BATCH_SIZE);
      
      for (let i = 0; i < summaryBatches; i++) {
        const offset = summaryCompleted + (i * BATCH_SIZE);
        const summaries = localDb.prepare(`
          SELECT * FROM game_summary 
          ORDER BY game_id, player_id 
          LIMIT ${BATCH_SIZE} OFFSET ${offset}
        `).all();

        if (summaries.length === 0) break;

        try {
          for (const summary of summaries) {
            await tursoDb.execute(`
              INSERT INTO game_summary 
              (player_id, player_name, game_id, game_date, season, season_type, 
               points, rebounds, assists, blocks, steals, age_at_game_years) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              summary.player_id, summary.player_name, summary.game_id, summary.game_date,
              summary.season, summary.season_type, summary.points, summary.rebounds,
              summary.assists, summary.blocks, summary.steals, summary.age_at_game_years
            ]);
          }

          const currentCount = summaryCompleted + (i + 1) * summaries.length;
          if (i % 20 === 0 || summaries.length < BATCH_SIZE) {
            process.stdout.write(`\r📋 Game summary: ${currentCount.toLocaleString()}/${totalSummary.toLocaleString()}`);
          }

          await sleep(DELAY_MS);
        } catch (error) {
          console.error(`\n❌ Error in summary batch ${i}:`, error);
        }
      }
      console.log('\n✅ Game summary migration completed');
    }

    // Migrate remaining smaller tables
    console.log('\n🔧 Migrating remaining tables...');

    // Season overrides
    const currentOverrides = await tursoDb.execute('SELECT COUNT(*) as count FROM season_totals_override');
    if ((currentOverrides.rows[0]?.count || 0) === 0) {
      const overrides = localDb.prepare('SELECT * FROM season_totals_override').all();
      for (const override of overrides) {
        try {
          await tursoDb.execute(`
            INSERT INTO season_totals_override 
            (player_id, season, season_type, points, rebounds, assists, blocks, steals) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            override.player_id, override.season, override.season_type,
            override.points, override.rebounds, override.assists, override.blocks, override.steals
          ]);
        } catch (error) {
          // Skip duplicates
        }
      }
      console.log(`✅ Season overrides: ${overrides.length}`);
    }

    // Watchlist
    const currentWatchlist = await tursoDb.execute('SELECT COUNT(*) as count FROM watchlist');
    if ((currentWatchlist.rows[0]?.count || 0) === 0) {
      const watchlist = localDb.prepare('SELECT * FROM watchlist').all();
      for (const item of watchlist) {
        try {
          await tursoDb.execute(
            'INSERT INTO watchlist (player_id, created_at) VALUES (?, ?)',
            [item.player_id, item.created_at]
          );
        } catch (error) {
          // Skip duplicates
        }
      }
      console.log(`✅ Watchlist: ${watchlist.length}`);
    }

    // Final verification
    console.log('\n🔍 Final verification...');
    const finalPlayers = await tursoDb.execute('SELECT COUNT(*) as count FROM players');
    const finalGames = await tursoDb.execute('SELECT COUNT(*) as count FROM games');
    const finalSummary = await tursoDb.execute('SELECT COUNT(*) as count FROM game_summary');
    const finalOverrides = await tursoDb.execute('SELECT COUNT(*) as count FROM season_totals_override');

    console.log('\n' + '='.repeat(60));
    console.log('🎉 RESUMABLE MIGRATION STATUS');
    console.log('='.repeat(60));
    console.log(`👥 Players: ${finalPlayers.rows[0]?.count?.toLocaleString() || 0}/${totalPlayers.toLocaleString()}`);
    console.log(`🏀 Games: ${finalGames.rows[0]?.count?.toLocaleString() || 0}/${totalGames.toLocaleString()}`);
    console.log(`📋 Game summary: ${finalSummary.rows[0]?.count?.toLocaleString() || 0}/${totalSummary.toLocaleString()}`);
    console.log(`🔧 Season overrides: ${finalOverrides.rows[0]?.count?.toLocaleString() || 0}`);
    console.log('='.repeat(60));

    const isComplete = (finalPlayers.rows[0]?.count >= totalPlayers) &&
                       (finalGames.rows[0]?.count >= totalGames) &&
                       (finalSummary.rows[0]?.count >= totalSummary);

    if (isComplete) {
      console.log('✅ MIGRATION FULLY COMPLETE!');
    } else {
      console.log('⚠️  Migration incomplete - run again to resume');
    }

  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    localDb.close();
  }
}

resumableMigration().catch(console.error);