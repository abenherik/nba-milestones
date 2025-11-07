import { NextRequest, NextResponse } from 'next/server';
import { getBeforeAgeSqlite } from '@/lib/leaderboards/beforeAgeSqlite';
import { openSqlite, ensureCoreSchema, dbAll, dbRun } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';

// Sample game data to populate if database is empty
const sampleGameData = [
  { player_id: '2544', player_name: 'LeBron James', game_id: 'game1', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 28, rebounds: 8, assists: 11, blocks: 1, steals: 2, age_at_game_years: 19 },
  { player_id: '201939', player_name: 'Stephen Curry', game_id: 'game2', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 32, rebounds: 5, assists: 8, blocks: 0, steals: 3, age_at_game_years: 20 },
  { player_id: '203507', player_name: 'Giannis Antetokounmpo', game_id: 'game3', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 35, rebounds: 12, assists: 6, blocks: 2, steals: 1, age_at_game_years: 19 },
  { player_id: '1629029', player_name: 'Luka Doncic', game_id: 'game4', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 41, rebounds: 9, assists: 12, blocks: 0, steals: 2, age_at_game_years: 20 },
  { player_id: '1630163', player_name: 'Paolo Banchero', game_id: 'game5', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 24, rebounds: 7, assists: 4, blocks: 1, steals: 1, age_at_game_years: 19 },
  { player_id: '1641705', player_name: 'Victor Wembanyama', game_id: 'game6', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 20, rebounds: 10, assists: 3, blocks: 4, steals: 1, age_at_game_years: 19 }
];

async function ensureSampleData() {
  const db = openSqlite();
  await ensureCoreSchema(db);
  
  // Check if game_summary is empty
  const gameCount = await dbAll<{ count: number }>(db, 'SELECT COUNT(*) as count FROM game_summary');
  if ((gameCount[0]?.count || 0) === 0) {
    // Add sample game data
    for (const game of sampleGameData) {
      await dbRun(db, 'INSERT OR IGNORE INTO game_summary (player_id, player_name, game_id, game_date, season, season_type, points, rebounds, assists, blocks, steals, age_at_game_years) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [game.player_id, game.player_name, game.game_id, game.game_date, game.season, game.season_type, game.points, game.rebounds, game.assists, game.blocks, game.steals, game.age_at_game_years]);
    }
  }
  
  db.close();
}

export async function GET(req: NextRequest) {
  try {
    // Ensure we have sample data
    await ensureSampleData();
    
    const { searchParams } = new URL(req.url);
    const ageParam = searchParams.get('age');
    const age = ageParam ? Number(ageParam) : 21;
    const includePlayoffs = (searchParams.get('includePlayoffs') === '1' || searchParams.get('includePlayoffs') === 'true');
    if (!Number.isFinite(age) || age < 18 || age > 40) {
      return NextResponse.json({ error: 'Invalid age' }, { status: 400 });
    }

    const data = await getBeforeAgeSqlite('blocks', age, includePlayoffs);
    if (!data) return NextResponse.json({ error: 'Leaderboard not found' }, { status: 404 });

    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
