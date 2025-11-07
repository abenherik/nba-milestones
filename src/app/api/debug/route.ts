import { NextRequest, NextResponse } from 'next/server';
import { openDatabase, dbAll, dbRun, closeDatabase, ensureCoreSchema } from '@/lib/database';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const db = openDatabase();
    
    // First ensure schema exists
    await ensureCoreSchema(db);
    
    // Test basic connection and get table info
    const playerCount = await dbAll<{ count: number }>(db, 'SELECT COUNT(*) as count FROM players');
    const gameCount = await dbAll<{ count: number }>(db, 'SELECT COUNT(*) as count FROM game_summary');
    const samplePlayers = await dbAll<{ id: string; full_name: string }>(db, 'SELECT id, full_name FROM players LIMIT 5');
    
    // Check if we have any data, if not, add a test player
    const pCount = playerCount[0]?.count || 0;
    if (pCount === 0) {
      await dbRun(db, 'INSERT INTO players (id, full_name, is_active) VALUES (?, ?, ?)', 
        ['test123', 'Test Player', 1]);
      
      await dbRun(db, 'INSERT INTO game_summary (player_id, player_name, game_id, game_date, season, season_type, points, rebounds, assists, blocks, steals, age_at_game_years) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['test123', 'Test Player', 'game123', '2024-01-01', '2023-24', 'Regular Season', 25, 8, 5, 2, 1, 24]);
    }
    
    await closeDatabase(db);
    
    return NextResponse.json({
      status: 'ok',
      database: 'connected',
      env: process.env.NODE_ENV,
      usingTurso: !!process.env.TURSO_DATABASE_URL,
      hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
      tursoUrlPrefix: process.env.TURSO_DATABASE_URL?.substring(0, 30),
      playerCount: pCount,
      gameCount: gameCount[0]?.count || 0,
      samplePlayers,
      message: pCount === 0 ? 'Added test data' : 'Database has data'
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Database error',
      message: error instanceof Error ? error.message : 'Unknown error',
      env: process.env.NODE_ENV,
      usingTurso: !!process.env.TURSO_DATABASE_URL
    }, { status: 500 });
  }
}