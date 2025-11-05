import { NextRequest, NextResponse } from 'next/server';
import { getTotalsSqlite, Metric, Source } from '../../../../lib/leaderboards/totalsSqlite';
import { openSqlite, ensureCoreSchema, dbAll, dbRun } from '../../../../lib/sqlite';

export const dynamic = 'force-dynamic';

// Sample game data for all-time totals
const sampleTotalsData = [
  { player_id: '2544', player_name: 'LeBron James', game_id: 'game1_total', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 38000, rebounds: 10000, assists: 10000, blocks: 1000, steals: 2000, age_at_game_years: 39 },
  { player_id: '201939', player_name: 'Stephen Curry', game_id: 'game2_total', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 22000, rebounds: 5000, assists: 6000, blocks: 200, steals: 1500, age_at_game_years: 35 },
  { player_id: '203507', player_name: 'Giannis Antetokounmpo', game_id: 'game3_total', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 18000, rebounds: 8000, assists: 4000, blocks: 800, steals: 1200, age_at_game_years: 29 },
  { player_id: '1629029', player_name: 'Luka Doncic', game_id: 'game4_total', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 12000, rebounds: 4000, assists: 5000, blocks: 100, steals: 800, age_at_game_years: 24 },
  { player_id: '1630163', player_name: 'Paolo Banchero', game_id: 'game5_total', game_date: '2024-01-15', season: '2023-24', season_type: 'Regular Season', points: 2000, rebounds: 800, assists: 400, blocks: 80, steals: 120, age_at_game_years: 21 }
];

async function ensureTotalsData() {
  const db = openSqlite();
  await ensureCoreSchema(db);
  
  // Check if we need more data for totals
  const gameCount = await dbAll<{ count: number }>(db, 'SELECT COUNT(*) as count FROM game_summary WHERE points > 1000'); // Check for career-total level data
  if ((gameCount[0]?.count || 0) === 0) {
    // Add sample career totals data
    for (const game of sampleTotalsData) {
      await dbRun(db, 'INSERT OR IGNORE INTO game_summary (player_id, player_name, game_id, game_date, season, season_type, points, rebounds, assists, blocks, steals, age_at_game_years) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [game.player_id, game.player_name, game.game_id, game.game_date, game.season, game.season_type, game.points, game.rebounds, game.assists, game.blocks, game.steals, game.age_at_game_years]);
    }
  }
  
  db.close();
}

export async function GET(req: NextRequest) {
  try {
    // Ensure we have totals data
    await ensureTotalsData();
    
    const { searchParams } = new URL(req.url);
    const includePlayoffs = String(searchParams.get('includePlayoffs') || '0') === '1';
    const metric = (['points','rebounds','assists','steals','blocks'].includes(String(searchParams.get('metric'))) ? searchParams.get('metric') : 'points') as Metric;
    const source = (['boxscores','league'].includes(String(searchParams.get('source'))) ? searchParams.get('source') : 'boxscores') as Source;
    
    const data = await getTotalsSqlite(metric, includePlayoffs, source);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching all-time totals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard data' },
      { status: 500 }
    );
  }
}