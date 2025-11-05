#!/usr/bin/env node

/**
 * Comprehensive migration using proven direct approach
 * Migrates all data in manageable chunks with progress tracking
 */

import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';
import * as dotenv from 'dotenv';

dotenv.config();

const BATCH_SIZE = 100; // Smaller batches for reliability

async function comprehensiveMigration() {
  console.log('🚀 Starting comprehensive migration...');
  
  const localDb = new Database('data/app.sqlite');
  const tursoDb = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  // Test connection
  await tursoDb.execute('SELECT 1');
  console.log('✅ Connection verified');

  const stats = {
    players: 0,
    games: 0,
    playerStats: 0,
    gameSummary: 0,
    seasonOverrides: 0,
    appMeta: 0,
    watchlist: 0,
    slicesTop25: 0,
    startTime: Date.now()
  };

  try {
    // 1. Clear all tables
    console.log('\n🧹 Clearing existing data...');
    await tursoDb.execute('DELETE FROM game_summary');
    await tursoDb.execute('DELETE FROM player_stats');
    await tursoDb.execute('DELETE FROM season_totals_override');
    await tursoDb.execute('DELETE FROM games');
    await tursoDb.execute('DELETE FROM players');
    await tursoDb.execute('DELETE FROM app_meta');
    await tursoDb.execute('DELETE FROM watchlist');
    await tursoDb.execute('DELETE FROM slices_top25');
    console.log('✅ All tables cleared');

    // 2. Migrate app_meta (small table first)
    console.log('\n📝 Migrating app_meta...');
    const appMeta = localDb.prepare('SELECT * FROM app_meta').all();
    for (const meta of appMeta) {
      await tursoDb.execute(
        'INSERT INTO app_meta (key, value) VALUES (?, ?)',
        [meta.key, meta.value]
      );
      stats.appMeta++;
    }
    console.log(`✅ app_meta: ${stats.appMeta} records`);

    // 3. Migrate players
    console.log('\n👥 Migrating players...');
    const totalPlayers = localDb.prepare('SELECT COUNT(*) as count FROM players').get().count;
    const playerBatches = Math.ceil(totalPlayers / BATCH_SIZE);
    
    for (let i = 0; i < playerBatches; i++) {
      const offset = i * BATCH_SIZE;
      const players = localDb.prepare(`
        SELECT * FROM players 
        ORDER BY id 
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
      `).all();

      for (const player of players) {
        await tursoDb.execute(
          'INSERT INTO players (id, full_name, is_active, birthdate) VALUES (?, ?, ?, ?)',
          [player.id, player.full_name, player.is_active, player.birthdate]
        );
        stats.players++;
      }

      if (i % 10 === 0) {
        process.stdout.write(`\r👥 Players: ${stats.players.toLocaleString()}/${totalPlayers.toLocaleString()}`);
      }
    }
    console.log(`\n✅ Players completed: ${stats.players.toLocaleString()}`);

    // 4. Migrate games  
    console.log('\n🏀 Migrating games...');
    const totalGames = localDb.prepare('SELECT COUNT(*) as count FROM games').get().count;
    const gameBatches = Math.ceil(totalGames / BATCH_SIZE);

    for (let i = 0; i < gameBatches; i++) {
      const offset = i * BATCH_SIZE;
      const games = localDb.prepare(`
        SELECT * FROM games 
        ORDER BY game_id 
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
      `).all();

      for (const game of games) {
        await tursoDb.execute(
          'INSERT INTO games (game_id, game_date) VALUES (?, ?)',
          [game.game_id, game.game_date]
        );
        stats.games++;
      }

      if (i % 50 === 0) {
        process.stdout.write(`\r🏀 Games: ${stats.games.toLocaleString()}/${totalGames.toLocaleString()}`);
      }
    }
    console.log(`\n✅ Games completed: ${stats.games.toLocaleString()}`);

    // 5. Migrate game_summary (most important for app functionality)
    console.log('\n📋 Migrating game_summary...');
    const totalSummary = localDb.prepare('SELECT COUNT(*) as count FROM game_summary').get().count;
    const summaryBatches = Math.ceil(totalSummary / BATCH_SIZE);

    for (let i = 0; i < summaryBatches; i++) {
      const offset = i * BATCH_SIZE;
      const summaries = localDb.prepare(`
        SELECT * FROM game_summary 
        ORDER BY game_id, player_id 
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
      `).all();

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
        stats.gameSummary++;
      }

      if (i % 50 === 0) {
        process.stdout.write(`\r📋 Game summary: ${stats.gameSummary.toLocaleString()}/${totalSummary.toLocaleString()}`);
      }
    }
    console.log(`\n✅ Game summary completed: ${stats.gameSummary.toLocaleString()}`);

    // 6. Migrate season_totals_override
    console.log('\n🔧 Migrating season overrides...');
    const overrides = localDb.prepare('SELECT * FROM season_totals_override ORDER BY player_id, season').all();
    for (const override of overrides) {
      await tursoDb.execute(`
        INSERT INTO season_totals_override 
        (player_id, season, season_type, points, rebounds, assists, blocks, steals) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        override.player_id, override.season, override.season_type,
        override.points, override.rebounds, override.assists, override.blocks, override.steals
      ]);
      stats.seasonOverrides++;
    }
    console.log(`✅ Season overrides: ${stats.seasonOverrides}`);

    // 7. Migrate watchlist
    console.log('\n⭐ Migrating watchlist...');
    const watchlist = localDb.prepare('SELECT * FROM watchlist').all();
    for (const item of watchlist) {
      await tursoDb.execute(
        'INSERT INTO watchlist (player_id, created_at) VALUES (?, ?)',
        [item.player_id, item.created_at]
      );
      stats.watchlist++;
    }
    console.log(`✅ Watchlist: ${stats.watchlist}`);

    // 8. Migrate slices_top25
    console.log('\n🏆 Migrating slices_top25...');
    const totalSlices = localDb.prepare('SELECT COUNT(*) as count FROM slices_top25').get().count;
    const sliceBatches = Math.ceil(totalSlices / BATCH_SIZE);

    for (let i = 0; i < sliceBatches; i++) {
      const offset = i * BATCH_SIZE;
      const slices = localDb.prepare(`SELECT * FROM slices_top25 LIMIT ${BATCH_SIZE} OFFSET ${offset}`).all();

      for (const slice of slices) {
        const columns = Object.keys(slice).join(', ');
        const placeholders = Object.keys(slice).map(() => '?').join(', ');
        const values = Object.values(slice);
        
        await tursoDb.execute(
          `INSERT INTO slices_top25 (${columns}) VALUES (${placeholders})`,
          values
        );
        stats.slicesTop25++;
      }

      if (i % 10 === 0) {
        process.stdout.write(`\r🏆 Slices: ${stats.slicesTop25.toLocaleString()}/${totalSlices.toLocaleString()}`);
      }
    }
    console.log(`\n✅ Slices completed: ${stats.slicesTop25.toLocaleString()}`);

    // Final verification
    console.log('\n🔍 Final verification...');
    const verifyQueries = [
      { name: 'players', query: 'SELECT COUNT(*) as count FROM players' },
      { name: 'games', query: 'SELECT COUNT(*) as count FROM games' },
      { name: 'game_summary', query: 'SELECT COUNT(*) as count FROM game_summary' },
      { name: 'season_overrides', query: 'SELECT COUNT(*) as count FROM season_totals_override' },
      { name: 'app_meta', query: 'SELECT COUNT(*) as count FROM app_meta' },
      { name: 'watchlist', query: 'SELECT COUNT(*) as count FROM watchlist' },
      { name: 'slices_top25', query: 'SELECT COUNT(*) as count FROM slices_top25' }
    ];

    for (const { name, query } of verifyQueries) {
      const result = await tursoDb.execute(query);
      console.log(`✅ ${name}: ${result.rows[0]?.count?.toLocaleString() || 0} records`);
    }

    const elapsed = Math.round((Date.now() - stats.startTime) / 1000 / 60 * 100) / 100;
    const totalRecords = stats.players + stats.games + stats.gameSummary + 
                        stats.seasonOverrides + stats.appMeta + stats.watchlist + stats.slicesTop25;

    console.log('\n' + '='.repeat(60));
    console.log('🎉 COMPREHENSIVE MIGRATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`📊 Total records migrated: ${totalRecords.toLocaleString()}`);
    console.log(`⏱️  Time elapsed: ${elapsed} minutes`);
    console.log(`🌐 Turso database: ${process.env.TURSO_DATABASE_URL}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    localDb.close();
  }
}

comprehensiveMigration().catch(console.error);