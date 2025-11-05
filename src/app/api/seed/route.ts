import { NextRequest, NextResponse } from 'next/server';
import { openDatabase, dbAll, dbRun, closeDatabase, ensureCoreSchema } from '../../../lib/database';

export const dynamic = 'force-dynamic';

// Sample NBA players data
const samplePlayers = [
  { id: '2544', full_name: 'LeBron James', is_active: 1 },
  { id: '201939', full_name: 'Stephen Curry', is_active: 1 },
  { id: '201566', full_name: 'Russell Westbrook', is_active: 1 },
  { id: '202681', full_name: 'Kyrie Irving', is_active: 1 },
  { id: '203507', full_name: 'Giannis Antetokounmpo', is_active: 1 },
  { id: '203999', full_name: 'Nikola Jokic', is_active: 1 },
  { id: '1628369', full_name: 'Jayson Tatum', is_active: 1 },
  { id: '1629029', full_name: 'Luka Doncic', is_active: 1 },
  { id: '1630163', full_name: 'Paolo Banchero', is_active: 1 },
  { id: '1641705', full_name: 'Victor Wembanyama', is_active: 1 }
];

// Sample game data for these players
const sampleGameData = [
  { player_id: '2544', player_name: 'LeBron James', game_id: 'game1', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 28, rebounds: 8, assists: 11, blocks: 1, steals: 2, age_at_game_years: 39 },
  { player_id: '201939', player_name: 'Stephen Curry', game_id: 'game2', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 32, rebounds: 5, assists: 8, blocks: 0, steals: 3, age_at_game_years: 35 },
  { player_id: '203507', player_name: 'Giannis Antetokounmpo', game_id: 'game3', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 35, rebounds: 12, assists: 6, blocks: 2, steals: 1, age_at_game_years: 29 },
  { player_id: '1629029', player_name: 'Luka Doncic', game_id: 'game4', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 41, rebounds: 9, assists: 12, blocks: 0, steals: 2, age_at_game_years: 24 },
  { player_id: '1630163', player_name: 'Paolo Banchero', game_id: 'game5', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 24, rebounds: 7, assists: 4, blocks: 1, steals: 1, age_at_game_years: 21 },
];

export async function POST(req: NextRequest) {
  try {
    const db = openDatabase();
    
    // Ensure schema exists
    await ensureCoreSchema(db);
    
    // Clear existing data and insert fresh sample data
    await dbRun(db, 'DELETE FROM game_summary');
    await dbRun(db, 'DELETE FROM players');
    
    // Insert sample players
    for (const player of samplePlayers) {
      await dbRun(db, 'INSERT OR IGNORE INTO players (id, full_name, is_active) VALUES (?, ?, ?)', 
        [player.id, player.full_name, player.is_active]);
    }
    
    // Insert sample game data
    for (const game of sampleGameData) {
      await dbRun(db, 'INSERT OR IGNORE INTO game_summary (player_id, player_name, game_id, game_date, season, season_type, points, rebounds, assists, blocks, steals, age_at_game_years) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [game.player_id, game.player_name, game.game_id, game.game_date, game.season, game.season_type, game.points, game.rebounds, game.assists, game.blocks, game.steals, game.age_at_game_years]);
    }
    
    // Verify data was inserted
    const playerCount = await dbAll<{ count: number }>(db, 'SELECT COUNT(*) as count FROM players');
    const gameCount = await dbAll<{ count: number }>(db, 'SELECT COUNT(*) as count FROM game_summary');
    
    await closeDatabase(db);
    
    return NextResponse.json({
      success: true,
      message: 'Sample NBA data populated successfully',
      playersAdded: playerCount[0]?.count || 0,
      gamesAdded: gameCount[0]?.count || 0,
      players: samplePlayers.map(p => p.full_name)
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to populate data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const db = openDatabase();
    
    const playerCount = await dbAll<{ count: number }>(db, 'SELECT COUNT(*) as count FROM players');
    const gameCount = await dbAll<{ count: number }>(db, 'SELECT COUNT(*) as count FROM game_summary');
    const samplePlayersInDb = await dbAll<{ id: string; full_name: string }>(db, 'SELECT id, full_name FROM players LIMIT 10');
    
    await closeDatabase(db);
    
    return NextResponse.json({
      status: 'Database status',
      playerCount: playerCount[0]?.count || 0,
      gameCount: gameCount[0]?.count || 0,
      samplePlayersInDb,
      instruction: 'Send POST request to this endpoint to populate with sample NBA data'
    });
    
  } catch (error) {
    return NextResponse.json({
      error: 'Database error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}