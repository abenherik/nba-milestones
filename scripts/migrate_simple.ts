#!/usr/bin/env node

/**
 * Simple direct migration script - smaller batches with explicit commits
 */

import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';
import * as dotenv from 'dotenv';

dotenv.config();

async function simpleMigration() {
  console.log('🚀 Starting simple direct migration...');
  
  // Connect to local SQLite
  const localDb = new Database('data/app.sqlite');
  
  // Connect to Turso
  const tursoDb = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  // Test connection first
  console.log('🧪 Testing connection...');
  const testResult = await tursoDb.execute('SELECT 1 as test');
  console.log('✅ Connection verified');

  // Start with just a few key players for testing
  const keyPlayerNames = [
    'LeBron James',
    'Stephen Curry', 
    'Kevin Durant',
    'Giannis Antetokounmpo',
    'Paolo Banchero'
  ];

  console.log('👥 Finding key players...');
  const players = [];
  for (const name of keyPlayerNames) {
    const player = localDb.prepare('SELECT * FROM players WHERE full_name = ?').get(name);
    if (player) {
      players.push(player);
      console.log(`✅ Found: ${player.full_name}`);
    }
  }

  console.log(`\n📊 Migrating ${players.length} players...`);

  // Clear and insert players one by one
  await tursoDb.execute('DELETE FROM game_summary');
  await tursoDb.execute('DELETE FROM player_stats');  
  await tursoDb.execute('DELETE FROM games');
  await tursoDb.execute('DELETE FROM players');

  for (const player of players) {
    try {
      await tursoDb.execute(
        'INSERT INTO players (id, full_name, is_active, birthdate) VALUES (?, ?, ?, ?)',
        [player.id, player.full_name, player.is_active, player.birthdate]
      );
      console.log(`✅ Inserted player: ${player.full_name}`);
    } catch (error) {
      console.error(`❌ Failed to insert ${player.full_name}:`, error);
    }
  }

  // Verify players were inserted
  const playerCount = await tursoDb.execute('SELECT COUNT(*) as count FROM players');
  console.log(`📊 Players in Turso: ${playerCount.rows[0]?.count}`);

  if (playerCount.rows[0]?.count > 0) {
    console.log('✅ Basic migration successful!');
    
    // Now add some recent games for these players
    const playerIds = players.map(p => `'${p.id}'`).join(',');
    
    console.log('\n🏀 Adding recent games...');
    const recentGames = localDb.prepare(`
      SELECT DISTINCT g.*
      FROM games g
      JOIN game_summary gs ON g.game_id = gs.game_id
      WHERE gs.player_id IN (${playerIds})
      AND gs.season = '2023-24'
      ORDER BY g.game_date DESC
      LIMIT 100
    `).all();

    console.log(`📅 Found ${recentGames.length} recent games`);

    // Insert games in small batches
    let gameCount = 0;
    for (const game of recentGames) {
      try {
        await tursoDb.execute(
          'INSERT INTO games (game_id, game_date) VALUES (?, ?)',
          [game.game_id, game.game_date]
        );
        gameCount++;
        if (gameCount % 10 === 0) {
          process.stdout.write(`\r📈 Games: ${gameCount}/${recentGames.length}`);
        }
      } catch (error) {
        // Skip duplicates
      }
    }

    console.log(`\n✅ Inserted ${gameCount} games`);

    // Add game summary data
    console.log('\n📋 Adding game summaries...');
    const gameIds = recentGames.map(g => `'${g.game_id}'`).join(',');
    
    const summaries = localDb.prepare(`
      SELECT gs.*
      FROM game_summary gs
      WHERE gs.player_id IN (${playerIds})
      AND gs.game_id IN (${gameIds})
      ORDER BY gs.game_date DESC
      LIMIT 500
    `).all();

    let summaryCount = 0;
    for (const summary of summaries) {
      try {
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
        summaryCount++;
        if (summaryCount % 25 === 0) {
          process.stdout.write(`\r📈 Summaries: ${summaryCount}/${summaries.length}`);
        }
      } catch (error) {
        // Skip duplicates
      }
    }

    console.log(`\n✅ Inserted ${summaryCount} game summaries`);
  }

  // Final verification
  console.log('\n🔍 Final verification...');
  const finalPlayers = await tursoDb.execute('SELECT COUNT(*) as count FROM players');
  const finalGames = await tursoDb.execute('SELECT COUNT(*) as count FROM games');
  const finalSummaries = await tursoDb.execute('SELECT COUNT(*) as count FROM game_summary');

  console.log('\n' + '='.repeat(40));
  console.log('🎉 SIMPLE MIGRATION COMPLETE');
  console.log('='.repeat(40));
  console.log(`👥 Players: ${finalPlayers.rows[0]?.count}`);
  console.log(`🏀 Games: ${finalGames.rows[0]?.count}`);
  console.log(`📋 Game summaries: ${finalSummaries.rows[0]?.count}`);
  console.log('='.repeat(40));

  localDb.close();
}

simpleMigration().catch(console.error);