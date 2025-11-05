import { NextResponse } from 'next/server';
import { openDatabase } from '@/lib/database';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { key, seedData } = body;
    
    // Security check
    if (key !== 'enhanced-seed-2024') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!seedData) {
      return NextResponse.json({ error: 'Seed data required' }, { status: 400 });
    }

    const db = await openDatabase();
    
    console.log('🌱 Starting enhanced seed import...');
    console.log('📊 Seed metadata:', seedData.metadata);

    const results = {
      players: 0,
      games: 0,
      playerStats: 0,
      gameSummary: 0,
      seasonOverrides: 0,
      appMeta: 0,
      errors: []
    };

    // Clear existing data first
    try {
      await db.execute('DELETE FROM game_summary');
      await db.execute('DELETE FROM player_stats');
      await db.execute('DELETE FROM season_totals_override');
      await db.execute('DELETE FROM games');
      await db.execute('DELETE FROM players');
      await db.execute('DELETE FROM app_meta');
      console.log('🧹 Cleared existing data');
    } catch (error) {
      console.error('Warning: Could not clear all data:', error);
    }

    // Import app_meta
    if (seedData.appMeta && Array.isArray(seedData.appMeta)) {
      for (const meta of seedData.appMeta) {
        try {
          await db.execute(
            'INSERT INTO app_meta (key, value) VALUES (?, ?)',
            [meta.key, meta.value]
          );
          results.appMeta++;
        } catch (error) {
          results.errors.push(`app_meta: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Import players
    if (seedData.players && Array.isArray(seedData.players)) {
      for (const player of seedData.players) {
        try {
          await db.execute(
            'INSERT INTO players (id, full_name, is_active, birthdate) VALUES (?, ?, ?, ?)',
            [player.id, player.full_name, player.is_active, player.birthdate]
          );
          results.players++;
        } catch (error) {
          results.errors.push(`player ${player.full_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Import games
    if (seedData.games && Array.isArray(seedData.games)) {
      for (const game of seedData.games) {
        try {
          await db.execute(
            'INSERT INTO games (game_id, game_date) VALUES (?, ?)',
            [game.game_id, game.game_date]
          );
          results.games++;
        } catch (error) {
          results.errors.push(`game ${game.game_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Import player_stats
    if (seedData.playerStats && Array.isArray(seedData.playerStats)) {
      for (const stat of seedData.playerStats) {
        try {
          await db.execute(`
            INSERT INTO player_stats 
            (game_id, player_id, season, season_type, minutes, points, rebounds, assists, blocks, steals) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            stat.game_id, stat.player_id, stat.season, stat.season_type,
            stat.minutes, stat.points, stat.rebounds, stat.assists, stat.blocks, stat.steals
          ]);
          results.playerStats++;
        } catch (error) {
          results.errors.push(`player_stat: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Import game_summary
    if (seedData.gameSummary && Array.isArray(seedData.gameSummary)) {
      for (const summary of seedData.gameSummary) {
        try {
          await db.execute(`
            INSERT INTO game_summary 
            (player_id, player_name, game_id, game_date, season, season_type, 
             points, rebounds, assists, blocks, steals, age_at_game_years) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            summary.player_id, summary.player_name, summary.game_id, summary.game_date,
            summary.season, summary.season_type, summary.points, summary.rebounds,
            summary.assists, summary.blocks, summary.steals, summary.age_at_game_years
          ]);
          results.gameSummary++;
        } catch (error) {
          results.errors.push(`game_summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Import season overrides
    if (seedData.seasonOverrides && Array.isArray(seedData.seasonOverrides)) {
      for (const override of seedData.seasonOverrides) {
        try {
          await db.execute(`
            INSERT INTO season_totals_override 
            (player_id, season, season_type, points, rebounds, assists, blocks, steals) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            override.player_id, override.season, override.season_type,
            override.points, override.rebounds, override.assists, override.blocks, override.steals
          ]);
          results.seasonOverrides++;
        } catch (error) {
          results.errors.push(`season_override: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    const totalRecords = results.players + results.games + results.playerStats + 
                        results.gameSummary + results.seasonOverrides + results.appMeta;

    console.log('✅ Enhanced seed import complete:', results);

    return NextResponse.json({
      message: 'Enhanced seed data imported successfully',
      results,
      totalRecords,
      metadata: seedData.metadata,
      hasErrors: results.errors.length > 0,
      errorSample: results.errors.slice(0, 5) // First 5 errors only
    });

  } catch (error) {
    console.error('Enhanced seed API error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}