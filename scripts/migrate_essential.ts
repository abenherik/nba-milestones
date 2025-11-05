#!/usr/bin/env node

/**
 * Fast Turso Migration - Essential Data Only
 * Migrates only the core tables and a subset of data for quick deployment
 */

import { createClient } from '@libsql/client';
import { openSqlite, dbAll } from '../src/lib/sqlite-original';
import { ensureCoreSchema } from '../src/lib/database';

async function migrateEssentialData() {
  const DATABASE_URL = process.env.TURSO_DATABASE_URL;
  const AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
  
  if (!DATABASE_URL || !AUTH_TOKEN) {
    console.error('❌ Missing environment variables');
    console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first');
    process.exit(1);
  }
  
  console.log('🔄 Connecting to Turso...');
  const turso = createClient({ url: DATABASE_URL, authToken: AUTH_TOKEN });
  
  console.log('📂 Opening local database...');
  const local = openSqlite();
  
  try {
    // Test connection
    await turso.execute('SELECT 1');
    console.log('✅ Connected to Turso');
    
    // Create schema in Turso
    console.log('🏗️  Creating schema...');
    await ensureCoreSchema(turso);
    
    // Migrate essential data in batches
    console.log('📊 Migrating core players (top 100 active)...');
    
    // Get top active players only
    const activePlayers = await dbAll(local, `
      SELECT id, full_name, is_active, birthdate 
      FROM players 
      WHERE is_active = 1 
      ORDER BY full_name 
      LIMIT 100
    `);
    
    console.log(`Found ${activePlayers.length} active players to migrate`);
    
    // Batch insert players
    for (const player of activePlayers) {
      await turso.execute({
        sql: `INSERT OR REPLACE INTO players (id, full_name, is_active, birthdate) VALUES (?, ?, ?, ?)`,
        args: [player.id, player.full_name, player.is_active, player.birthdate]
      });
    }
    console.log('✅ Players migrated');
    
    // Migrate recent game data for these players (last 2 seasons only)
    console.log('🏀 Migrating recent game data...');
    const playerIds = activePlayers.map(p => `'${p.id}'`).join(',');
    
    const recentGames = await dbAll(local, `
      SELECT * FROM game_summary 
      WHERE player_id IN (${playerIds})
      AND season IN ('2023-24', '2024-25')
      ORDER BY game_date DESC
      LIMIT 5000
    `);
    
    console.log(`Found ${recentGames.length} recent games to migrate`);
    
    // Batch insert game data
    for (let i = 0; i < recentGames.length; i += 50) {
      const batch = recentGames.slice(i, i + 50);
      
      for (const game of batch) {
        await turso.execute({
          sql: `INSERT OR REPLACE INTO game_summary 
                (player_id, player_name, game_id, game_date, season, season_type, 
                 points, rebounds, assists, blocks, steals, age_at_game_years) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            game.player_id, game.player_name, game.game_id, game.game_date,
            game.season, game.season_type, game.points, game.rebounds,
            game.assists, game.blocks, game.steals, game.age_at_game_years
          ]
        });
      }
      
      if (i % 250 === 0) {
        console.log(`⏳ Migrated ${i}/${recentGames.length} games...`);
      }
    }
    
    console.log('✅ Game data migrated');
    
    // Migrate watchlist if it exists
    try {
      const watchlist = await dbAll(local, 'SELECT * FROM watchlist LIMIT 50');
      for (const item of watchlist) {
        await turso.execute({
          sql: `INSERT OR REPLACE INTO watchlist (player_id, created_at) VALUES (?, ?)`,
          args: [item.player_id, item.created_at]
        });
      }
      console.log(`✅ Watchlist migrated (${watchlist.length} items)`);
    } catch (e) {
      console.log('ℹ️  No watchlist data found');
    }
    
    // Verify migration
    const playerCount = await turso.execute('SELECT COUNT(*) as count FROM players');
    const gameCount = await turso.execute('SELECT COUNT(*) as count FROM game_summary');
    
    console.log('\n🎉 Migration Complete!');
    console.log(`📊 Players: ${playerCount.rows[0].count}`);
    console.log(`🏀 Games: ${gameCount.rows[0].count}`);
    console.log('\n✅ Your app is ready to deploy with essential data!');
    console.log('💡 You can migrate more data later using the full migration script');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Migration failed:', errorMessage);
    process.exit(1);
  } finally {
    await turso.close();
    local.close();
  }
}

if (require.main === module) {
  migrateEssentialData().catch(console.error);
}

export { migrateEssentialData };