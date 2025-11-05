import { NextRequest, NextResponse } from 'next/server';
import { openSqlite, ensureCoreSchema, dbAll, dbRun } from '../../../lib/sqlite';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const db = openSqlite();
    
    // Ensure schema exists first
    await ensureCoreSchema(db);
    
    // Clear existing data and seed fresh
    await dbRun(db, 'DELETE FROM game_summary');
    await dbRun(db, 'DELETE FROM players');
    
    // Sample NBA players
    const players = [
      { id: '2544', full_name: 'LeBron James', is_active: 1 },
      { id: '201939', full_name: 'Stephen Curry', is_active: 1 },
      { id: '203507', full_name: 'Giannis Antetokounmpo', is_active: 1 },
      { id: '1629029', full_name: 'Luka Doncic', is_active: 1 },
      { id: '1630163', full_name: 'Paolo Banchero', is_active: 1 }
    ];
    
    // Insert players
    for (const player of players) {
      await dbRun(db, 'INSERT INTO players (id, full_name, is_active) VALUES (?, ?, ?)', 
        [player.id, player.full_name, player.is_active]);
    }
    
    // Sample game data - both young career and totals
    const games = [
      // Young career stats (for before-age leaderboards)
      { player_id: '1630163', player_name: 'Paolo Banchero', game_id: 'young1', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 24, rebounds: 7, assists: 4, blocks: 1, steals: 1, age_at_game_years: 20 },
      { player_id: '1629029', player_name: 'Luka Doncic', game_id: 'young2', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 32, rebounds: 9, assists: 8, blocks: 0, steals: 2, age_at_game_years: 20 },
      { player_id: '203507', player_name: 'Giannis Antetokounmpo', game_id: 'young3', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 28, rebounds: 12, assists: 5, blocks: 2, steals: 1, age_at_game_years: 20 },
      
      // Career totals (for all-time leaderboards) 
      { player_id: '2544', player_name: 'LeBron James', game_id: 'total1', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 38000, rebounds: 10000, assists: 10000, blocks: 1000, steals: 2000, age_at_game_years: 39 },
      { player_id: '201939', player_name: 'Stephen Curry', game_id: 'total2', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 22000, rebounds: 5000, assists: 6000, blocks: 200, steals: 1500, age_at_game_years: 35 },
      { player_id: '203507', player_name: 'Giannis Antetokounmpo', game_id: 'total3', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 15000, rebounds: 8000, assists: 4000, blocks: 800, steals: 1200, age_at_game_years: 29 }
    ];
    
    // Insert game data
    for (const game of games) {
      await dbRun(db, 'INSERT INTO game_summary (player_id, player_name, game_id, game_date, season, season_type, points, rebounds, assists, blocks, steals, age_at_game_years) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [game.player_id, game.player_name, game.game_id, game.game_date, game.season, game.season_type, game.points, game.rebounds, game.assists, game.blocks, game.steals, game.age_at_game_years]);
    }
    
    // Verify data
    const playerCount = await dbAll<{ count: number }>(db, 'SELECT COUNT(*) as count FROM players');
    const gameCount = await dbAll<{ count: number }>(db, 'SELECT COUNT(*) as count FROM game_summary');
    const samplePlayers = await dbAll<{ id: string; full_name: string }>(db, 'SELECT id, full_name FROM players LIMIT 5');
    
    db.close();
    
    return NextResponse.json({
      success: true,
      message: 'Database seeded successfully',
      playerCount: playerCount[0]?.count || 0,
      gameCount: gameCount[0]?.count || 0,
      samplePlayers,
      instruction: 'Now try the main app - it should have data!'
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to seed database',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}