import { NextRequest, NextResponse } from 'next/server';
import { openDatabase, dbRun, dbAll, ensureCoreSchema, closeDatabase } from '../../../lib/database';

export const dynamic = 'force-dynamic';

const SEED_KEY = 'demo-seed-2024'; // Simple key to prevent accidental calls

const samplePlayers = [
  { id: '2544', full_name: 'LeBron James', is_active: 1 },
  { id: '201939', full_name: 'Stephen Curry', is_active: 1 },
  { id: '201566', full_name: 'Russell Westbrook', is_active: 1 },
  { id: '203507', full_name: 'Giannis Antetokounmpo', is_active: 1 },
  { id: '1629029', full_name: 'Luka Doncic', is_active: 1 },
  { id: '1630163', full_name: 'Paolo Banchero', is_active: 1 }
];

const sampleGames = [
  // Young career data for "before age" leaderboards
  { player_id: '2544', player_name: 'LeBron James', game_id: 'g1', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 25, rebounds: 8, assists: 6, blocks: 1, steals: 1, age_at_game_years: 20 },
  { player_id: '201939', player_name: 'Stephen Curry', game_id: 'g2', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 30, rebounds: 5, assists: 8, blocks: 0, steals: 2, age_at_game_years: 21 },
  { player_id: '203507', player_name: 'Giannis Antetokounmpo', game_id: 'g3', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 28, rebounds: 12, assists: 5, blocks: 3, steals: 1, age_at_game_years: 19 },
  { player_id: '1629029', player_name: 'Luka Doncic', game_id: 'g4', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 35, rebounds: 9, assists: 11, blocks: 0, steals: 2, age_at_game_years: 20 },
  { player_id: '1630163', player_name: 'Paolo Banchero', game_id: 'g5', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 22, rebounds: 7, assists: 4, blocks: 1, steals: 1, age_at_game_years: 19 },
  
  // Career totals for all-time leaderboards  
  { player_id: '2544', player_name: 'LeBron James', game_id: 'total1', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 38000, rebounds: 10000, assists: 10000, blocks: 1000, steals: 2000, age_at_game_years: 39 },
  { player_id: '201939', player_name: 'Stephen Curry', game_id: 'total2', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 22000, rebounds: 5000, assists: 6000, blocks: 200, steals: 1500, age_at_game_years: 35 },
  { player_id: '203507', player_name: 'Giannis Antetokounmpo', game_id: 'total3', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 18000, rebounds: 8000, assists: 4000, blocks: 800, steals: 1200, age_at_game_years: 29 }
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    if (body.key !== SEED_KEY) {
      return NextResponse.json({ error: 'Invalid seed key' }, { status: 403 });
    }

    const db = openDatabase();
    
    await ensureCoreSchema(db);
    
    console.log('🗑️ Clearing existing data...');
    await dbRun(db, 'DELETE FROM game_summary');
    await dbRun(db, 'DELETE FROM players');
    
    console.log('👥 Inserting players...');
    for (const player of samplePlayers) {
      await dbRun(db, 'INSERT INTO players (id, full_name, is_active) VALUES (?, ?, ?)', 
        [player.id, player.full_name, player.is_active]);
    }
    
    console.log('🏀 Inserting games...');
    for (const game of sampleGames) {
      await dbRun(db, 'INSERT INTO game_summary (player_id, player_name, game_id, game_date, season, season_type, points, rebounds, assists, blocks, steals, age_at_game_years) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [game.player_id, game.player_name, game.game_id, game.game_date, game.season, game.season_type, game.points, game.rebounds, game.assists, game.blocks, game.steals, game.age_at_game_years]);
    }
    
    // Verify data
    const playerCount = await dbAll<{ count: number }>(db, 'SELECT COUNT(*) as count FROM players');
    const gameCount = await dbAll<{ count: number }>(db, 'SELECT COUNT(*) as count FROM game_summary');
    
    await closeDatabase(db);
    
    return NextResponse.json({
      success: true,
      message: 'Database seeded successfully',
      playersInserted: playerCount[0]?.count || 0,
      gamesInserted: gameCount[0]?.count || 0,
      samplePlayers: samplePlayers.map(p => p.full_name)
    });
    
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to seed database',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Send POST request with {"key": "demo-seed-2024"} to seed the database',
    info: 'This will populate the database with sample NBA players and stats'
  });
}