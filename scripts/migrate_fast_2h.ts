#!/usr/bin/env node

/**
 * Fast migration optimized for 2-hour sprint
 * Larger batches, minimal delays, aggressive approach
 */

import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';
import * as dotenv from 'dotenv';

dotenv.config();

const BATCH_SIZE = 200; // Much larger batches
const DELAY_MS = 50; // Reduced delay for speed
const UPDATE_INTERVAL = 100; // Show progress every 100 batches

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fastMigration() {
  console.log('🚀 Starting FAST 2-hour migration sprint...');
  
  const localDb = new Database('data/app.sqlite');
  const tursoDb = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  const startTime = Date.now();
  
  await tursoDb.execute('SELECT 1');
  console.log('✅ Connection verified');

  try {
    // Check current state
    console.log('\n🔍 Checking current state...');
    const currentPlayers = await tursoDb.execute('SELECT COUNT(*) as count FROM players');
    const currentGames = await tursoDb.execute('SELECT COUNT(*) as count FROM games');
    const currentSummary = await tursoDb.execute('SELECT COUNT(*) as count FROM game_summary');
    
    console.log(`📊 Starting state:`);
    console.log(`   Players: ${currentPlayers.rows[0]?.count?.toLocaleString() || 0}`);
    console.log(`   Games: ${currentGames.rows[0]?.count?.toLocaleString() || 0}`);
    console.log(`   Game summary: ${currentSummary.rows[0]?.count?.toLocaleString() || 0}`);

    // Get totals
    const totalGames = localDb.prepare('SELECT COUNT(*) as count FROM games').get().count;
    const totalSummary = localDb.prepare('SELECT COUNT(*) as count FROM game_summary').get().count;
    
    console.log(`⏱️  2-hour target: Migrate as much as possible!`);
    console.log(`🎯 Remaining: ${(totalGames - (currentGames.rows[0]?.count || 0)).toLocaleString()} games, ${totalSummary.toLocaleString()} summaries`);

    let recordsProcessed = 0;
    const twoHours = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
    
    // Continue games migration with larger batches
    const gamesCompleted = currentGames.rows[0]?.count || 0;
    if (gamesCompleted < totalGames) {
      console.log(`\n🏀 FAST games migration from ${gamesCompleted.toLocaleString()}...`);
      
      const gamesRemaining = totalGames - gamesCompleted;
      const gameBatches = Math.ceil(gamesRemaining / BATCH_SIZE);
      
      for (let i = 0; i < gameBatches; i++) {
        // Check time limit
        if (Date.now() - startTime > twoHours) {
          console.log('\n⏰ 2-hour time limit reached during games migration');
          break;
        }

        const offset = gamesCompleted + (i * BATCH_SIZE);
        const games = localDb.prepare(`
          SELECT * FROM games 
          ORDER BY game_id 
          LIMIT ${BATCH_SIZE} OFFSET ${offset}
        `).all();

        if (games.length === 0) break;

        try {
          // Use batch transaction for speed
          const insertStatements = games.map(game => ({
            sql: 'INSERT INTO games (game_id, game_date) VALUES (?, ?)',
            args: [game.game_id, game.game_date]
          }));

          await tursoDb.batch(insertStatements);
          
          recordsProcessed += games.length;
          const currentCount = gamesCompleted + (i + 1) * games.length;
          
          if (i % UPDATE_INTERVAL === 0 || games.length < BATCH_SIZE) {
            const elapsed = (Date.now() - startTime) / 1000 / 60;
            const rate = recordsProcessed / elapsed;
            process.stdout.write(`\r🏀 Games: ${currentCount.toLocaleString()}/${totalGames.toLocaleString()} | ${elapsed.toFixed(1)}min | ${rate.toFixed(0)}/min`);
          }

          await sleep(DELAY_MS);
        } catch (error) {
          console.error(`\n❌ Error in games batch ${i}:`, error);
          // Try individual inserts for this batch
          for (const game of games) {
            try {
              await tursoDb.execute(
                'INSERT INTO games (game_id, game_date) VALUES (?, ?)',
                [game.game_id, game.game_date]
              );
            } catch (e) {
              // Skip duplicates
            }
          }
        }
      }
      console.log('\n✅ Games migration phase completed');
    }

    // If we have time left, start game_summary
    const elapsed = Date.now() - startTime;
    if (elapsed < twoHours) {
      const remainingTime = (twoHours - elapsed) / 1000 / 60;
      console.log(`\n📋 Starting game_summary migration (${remainingTime.toFixed(1)}min remaining)...`);
      
      const summaryCompleted = (await tursoDb.execute('SELECT COUNT(*) as count FROM game_summary')).rows[0]?.count || 0;
      const summaryRemaining = totalSummary - summaryCompleted;
      const summaryBatches = Math.ceil(summaryRemaining / BATCH_SIZE);
      
      for (let i = 0; i < summaryBatches; i++) {
        // Check time limit
        if (Date.now() - startTime > twoHours) {
          console.log('\n⏰ 2-hour time limit reached during summary migration');
          break;
        }

        const offset = summaryCompleted + (i * BATCH_SIZE);
        const summaries = localDb.prepare(`
          SELECT * FROM game_summary 
          ORDER BY game_id, player_id 
          LIMIT ${BATCH_SIZE} OFFSET ${offset}
        `).all();

        if (summaries.length === 0) break;

        try {
          // Use batch transaction for speed
          const insertStatements = summaries.map(summary => ({
            sql: `INSERT INTO game_summary 
                  (player_id, player_name, game_id, game_date, season, season_type, 
                   points, rebounds, assists, blocks, steals, age_at_game_years) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              summary.player_id, summary.player_name, summary.game_id, summary.game_date,
              summary.season, summary.season_type, summary.points, summary.rebounds,
              summary.assists, summary.blocks, summary.steals, summary.age_at_game_years
            ]
          }));

          await tursoDb.batch(insertStatements);
          
          recordsProcessed += summaries.length;
          const currentCount = summaryCompleted + (i + 1) * summaries.length;
          
          if (i % UPDATE_INTERVAL === 0 || summaries.length < BATCH_SIZE) {
            const elapsedNow = (Date.now() - startTime) / 1000 / 60;
            const rate = recordsProcessed / elapsedNow;
            process.stdout.write(`\r📋 Summary: ${currentCount.toLocaleString()}/${totalSummary.toLocaleString()} | ${elapsedNow.toFixed(1)}min | ${rate.toFixed(0)}/min`);
          }

          await sleep(DELAY_MS);
        } catch (error) {
          console.error(`\n❌ Error in summary batch ${i}:`, error);
        }
      }
    }

    // Final status
    const finalElapsed = (Date.now() - startTime) / 1000 / 60;
    
    console.log('\n\n🔍 Final verification...');
    const finalPlayers = await tursoDb.execute('SELECT COUNT(*) as count FROM players');
    const finalGames = await tursoDb.execute('SELECT COUNT(*) as count FROM games');
    const finalSummary = await tursoDb.execute('SELECT COUNT(*) as count FROM game_summary');

    const totalRecordsMigrated = (finalPlayers.rows[0]?.count || 0) + 
                                (finalGames.rows[0]?.count || 0) + 
                                (finalSummary.rows[0]?.count || 0);

    console.log('\n' + '='.repeat(70));
    console.log('🏁 2-HOUR MIGRATION SPRINT COMPLETE');
    console.log('='.repeat(70));
    console.log(`⏱️  Total time: ${finalElapsed.toFixed(1)} minutes`);
    console.log(`📊 Records processed this session: ${recordsProcessed.toLocaleString()}`);
    console.log(`📈 Average rate: ${(recordsProcessed / finalElapsed).toFixed(0)} records/minute`);
    console.log('');
    console.log('📋 Final counts:');
    console.log(`   👥 Players: ${finalPlayers.rows[0]?.count?.toLocaleString() || 0}/5,002 (${Math.round(((finalPlayers.rows[0]?.count || 0) / 5002) * 100)}%)`);
    console.log(`   🏀 Games: ${finalGames.rows[0]?.count?.toLocaleString() || 0}/346,114 (${Math.round(((finalGames.rows[0]?.count || 0) / 346114) * 100)}%)`);
    console.log(`   📋 Summaries: ${finalSummary.rows[0]?.count?.toLocaleString() || 0}/346,114 (${Math.round(((finalSummary.rows[0]?.count || 0) / 346114) * 100)}%)`);
    console.log('');
    console.log(`🎯 Total records: ${totalRecordsMigrated.toLocaleString()}/697,230`);
    
    const completionPercent = Math.round((totalRecordsMigrated / 697230) * 100);
    console.log(`📊 Overall completion: ${completionPercent}%`);
    
    if (completionPercent < 100) {
      console.log('');
      console.log('⚡ To continue: run this script again (it will resume automatically)');
    } else {
      console.log('');
      console.log('🎉 MIGRATION FULLY COMPLETE!');
    }
    
    console.log('='.repeat(70));

  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    localDb.close();
  }
}

fastMigration().catch(console.error);