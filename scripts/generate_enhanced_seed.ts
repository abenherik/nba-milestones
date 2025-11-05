#!/usr/bin/env node

/**
 * Generate enhanced seed data from local database for production import
 * Creates manageable datasets that can be imported via the working seed API
 */

import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';

class EnhancedSeeder {
  private db: Database.Database;

  constructor() {
    this.db = new Database('data/app.sqlite');
    console.log('🌱 Enhanced seed data generator initialized');
  }

  generateTopPlayersSeed(): void {
    console.log('\n📊 Generating top players seed data...');

    // Get top 50 most active players (most games played)
    const topPlayers = this.db.prepare(`
      SELECT DISTINCT p.*, COUNT(*) as game_count
      FROM players p
      JOIN game_summary gs ON p.id = gs.player_id
      WHERE p.is_active = 1
      GROUP BY p.id, p.full_name, p.is_active, p.birthdate
      ORDER BY game_count DESC
      LIMIT 50
    `).all();

    console.log(`👥 Top players: ${topPlayers.length}`);

    // Get games for these players (last 2 seasons worth)
    const playerIds = topPlayers.map((p: any) => `'${p.id}'`).join(',');
    
    const recentGames = this.db.prepare(`
      SELECT DISTINCT g.*
      FROM games g
      JOIN game_summary gs ON g.game_id = gs.game_id
      WHERE gs.player_id IN (${playerIds})
      AND gs.season IN ('2023-24', '2024-25', '2022-23')
      ORDER BY g.game_date DESC
      LIMIT 5000
    `).all();

    console.log(`🏀 Recent games: ${recentGames.length}`);

    // Get player stats for these games
    const gameIds = recentGames.map((g: any) => `'${g.game_id}'`).join(',');
    
    const playerStats = this.db.prepare(`
      SELECT ps.*
      FROM player_stats ps
      WHERE ps.player_id IN (${playerIds})
      AND ps.game_id IN (${gameIds})
      ORDER BY ps.game_id DESC
    `).all();

    console.log(`📈 Player stats: ${playerStats.length}`);

    // Get game summary data
    const gameSummary = this.db.prepare(`
      SELECT gs.*
      FROM game_summary gs
      WHERE gs.player_id IN (${playerIds})
      AND gs.game_id IN (${gameIds})
      ORDER BY gs.game_date DESC
    `).all();

    console.log(`📋 Game summary: ${gameSummary.length}`);

    // Get season overrides for these players
    const seasonOverrides = this.db.prepare(`
      SELECT so.*
      FROM season_totals_override so
      WHERE so.player_id IN (${playerIds})
      ORDER BY so.player_id, so.season
    `).all();

    console.log(`🔧 Season overrides: ${seasonOverrides.length}`);

    // Generate TypeScript seed data file
    const seedData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        description: 'Enhanced seed data with top 50 active players and recent games',
        totalPlayers: topPlayers.length,
        totalGames: recentGames.length,
        totalStats: playerStats.length
      },
      players: topPlayers,
      games: recentGames,
      playerStats,
      gameSummary,
      seasonOverrides,
      // Add some sample data for other tables
      appMeta: [
        { key: 'last_updated', value: new Date().toISOString() },
        { key: 'data_source', value: 'enhanced_seed_generator' }
      ],
      watchlist: [],
      slicesTop25: []
    };

    // Write to file
    const filename = `enhanced_seed_${Date.now()}.json`;
    writeFileSync(filename, JSON.stringify(seedData, null, 2));

    console.log('\n' + '='.repeat(50));
    console.log('🌱 ENHANCED SEED GENERATED');
    console.log('='.repeat(50));
    console.log(`📁 File: ${filename}`);
    console.log(`👥 Players: ${topPlayers.length}`);
    console.log(`🏀 Games: ${recentGames.length}`);
    console.log(`📊 Stats records: ${playerStats.length}`);
    console.log(`💾 File size: ${Math.round(JSON.stringify(seedData).length / 1024)} KB`);
    console.log('='.repeat(50));

    // Also generate smaller focused seed for key players
    this.generateFocusedSeed(topPlayers.slice(0, 10));
  }

  private generateFocusedSeed(keyPlayers: any[]): void {
    console.log('\n🎯 Generating focused seed for key players...');

    const playerIds = keyPlayers.map(p => `'${p.id}'`).join(',');

    // Get comprehensive data for just these key players
    const focusedStats = this.db.prepare(`
      SELECT gs.*
      FROM game_summary gs
      WHERE gs.player_id IN (${playerIds})
      ORDER BY gs.game_date DESC
      LIMIT 2000
    `).all();

    const focusedData = {
      metadata: {
        generatedAt: new Date().toISOString(),
        description: 'Focused seed data for top 10 most active players',
        keyPlayers: keyPlayers.map(p => p.full_name)
      },
      players: keyPlayers,
      gameSummary: focusedStats,
      // Get unique games for these stats
      games: this.db.prepare(`
        SELECT DISTINCT g.*
        FROM games g
        JOIN game_summary gs ON g.game_id = gs.game_id
        WHERE gs.player_id IN (${playerIds})
        ORDER BY g.game_date DESC
        LIMIT 1000
      `).all()
    };

    const focusedFilename = `focused_seed_${Date.now()}.json`;
    writeFileSync(focusedFilename, JSON.stringify(focusedData, null, 2));

    console.log(`🎯 Focused seed: ${focusedFilename}`);
    console.log(`👥 Key players: ${keyPlayers.length}`);
    console.log(`📊 Stats: ${focusedStats.length}`);
    console.log(`🏀 Games: ${focusedData.games.length}`);
  }

  close(): void {
    this.db.close();
  }
}

const seeder = new EnhancedSeeder();
seeder.generateTopPlayersSeed();
seeder.close();