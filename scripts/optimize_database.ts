#!/usr/bin/env node

/**
 * Database Optimization Script
 * Creates indexes and views to improve query performance
 */

import sqlite3 from 'sqlite3';
import { Database } from 'sqlite';
import { open } from 'sqlite';

async function optimizeDatabase() {
  console.log('🔧 Starting database optimization...');
  
  const db = await open({
    filename: 'data/app.sqlite',
    driver: sqlite3.Database
  });

  console.log('📊 Creating performance indexes...');

  // Covering index for age-based milestone queries
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_game_summary_age_stats 
    ON game_summary(age_at_game_years, season_type, points, rebounds, assists, steals, blocks, player_id)
    WHERE age_at_game_years IS NOT NULL;
  `);

  // Index for player + season type queries (used in watchlist)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_game_summary_player_season 
    ON game_summary(player_id, season_type, season, game_date);
  `);

  // Partial index for active players only
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_players_active_search 
    ON players(full_name, birthdate, id) 
    WHERE is_active = 1;
  `);

  // Index for milestone game queries (20+ points, etc.)
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_game_summary_thresholds 
    ON game_summary(player_id, season_type, age_at_game_years, points, rebounds, assists)
    WHERE season_type = 'Regular Season';
  `);

  console.log('📈 Creating optimized views...');

  // View for active player stats
  await db.exec(`
    CREATE VIEW IF NOT EXISTS active_player_totals AS
    SELECT 
      p.id,
      p.full_name,
      p.birthdate,
      gs.season_type,
      COUNT(*) as games,
      SUM(gs.points) as total_points,
      SUM(gs.rebounds) as total_rebounds,
      SUM(gs.assists) as total_assists,
      SUM(gs.steals) as total_steals,
      SUM(gs.blocks) as total_blocks,
      AVG(gs.points) as avg_points,
      MAX(gs.age_at_game_years) as current_age_approx
    FROM players p
    JOIN game_summary gs ON p.id = gs.player_id
    WHERE p.is_active = 1 
      AND gs.season_type = 'Regular Season'
    GROUP BY p.id, p.full_name, p.birthdate, gs.season_type;
  `);

  // View for milestone progress tracking
  await db.exec(`
    CREATE VIEW IF NOT EXISTS milestone_progress AS
    SELECT 
      gs.player_id,
      p.full_name,
      gs.age_at_game_years,
      gs.season_type,
      COUNT(*) as games,
      SUM(CASE WHEN gs.points >= 20 THEN 1 ELSE 0 END) as games_20pts,
      SUM(CASE WHEN gs.points >= 30 THEN 1 ELSE 0 END) as games_30pts,
      SUM(CASE WHEN gs.points >= 40 THEN 1 ELSE 0 END) as games_40pts,
      SUM(CASE WHEN gs.rebounds >= 10 THEN 1 ELSE 0 END) as games_10reb,
      SUM(CASE WHEN gs.assists >= 10 THEN 1 ELSE 0 END) as games_10ast,
      SUM(CASE WHEN gs.points >= 20 AND gs.assists >= 10 THEN 1 ELSE 0 END) as games_20pts_10ast,
      SUM(CASE WHEN gs.points >= 20 AND gs.rebounds >= 10 THEN 1 ELSE 0 END) as games_20pts_10reb,
      SUM(gs.points) as total_points,
      SUM(gs.rebounds) as total_rebounds,
      SUM(gs.assists) as total_assists,
      SUM(gs.steals) as total_steals,
      SUM(gs.blocks) as total_blocks
    FROM game_summary gs
    JOIN players p ON p.id = gs.player_id
    WHERE gs.age_at_game_years IS NOT NULL
    GROUP BY gs.player_id, p.full_name, gs.age_at_game_years, gs.season_type;
  `);

  console.log('🔍 Updating query planner statistics...');
  await db.exec('ANALYZE;');

  console.log('🧹 Running VACUUM to optimize storage...');
  await db.exec('VACUUM;');

  console.log('✅ Database optimization complete!');

  // Show index information
  const indexes = await db.all(`
    SELECT name, tbl_name, sql 
    FROM sqlite_master 
    WHERE type = 'index' AND name NOT LIKE 'sqlite_%' 
    ORDER BY tbl_name, name;
  `);

  console.log('\n📋 Active indexes:');
  for (const idx of indexes) {
    console.log(`  ${idx.tbl_name}: ${idx.name}`);
  }

  await db.close();
}

if (require.main === module) {
  optimizeDatabase().catch(console.error);
}

export { optimizeDatabase };