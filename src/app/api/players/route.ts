import { NextRequest, NextResponse } from 'next/server';
import { openSqlite, ensureCoreSchemaOnce, dbAll, dbRun, closeDatabase } from '@/lib/sqlite';

// Sample NBA players for empty database
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim().toLowerCase() ?? '';
  const db = openSqlite();
  await ensureCoreSchemaOnce(db);

  // Skip auto-seed check on every request - database should already be populated
  // Auto-seeding only happens on first run or empty database scenarios

  type Row = { id: string; full_name: string };
  let rows: Row[] = [];
  if (q) {
    rows = await dbAll<Row>(db, `SELECT id, full_name FROM players WHERE lower(full_name) LIKE ? ORDER BY full_name LIMIT 20`, [
      `%${q}%`,
    ]);
  } else {
    rows = await dbAll<Row>(db, `SELECT id, full_name FROM players ORDER BY full_name LIMIT 50`);
  }
  
  // If empty, do one-time auto-seed
  if (rows.length === 0) {
    const values = samplePlayers.map(() => '(?, ?, ?)').join(', ');
    const params = samplePlayers.flatMap(p => [p.id, p.full_name, p.is_active]);
    await dbRun(db, `INSERT OR IGNORE INTO players (id, full_name, is_active) VALUES ${values}`, params);
    rows = await dbAll<Row>(db, `SELECT id, full_name FROM players ORDER BY full_name LIMIT 50`);
  }
  
  await closeDatabase(db);
  
  const response = NextResponse.json({ players: rows });
  // Cache player list (6 hours allows twice-daily checks)
  response.headers.set('Cache-Control', 'public, max-age=21600, stale-while-revalidate=43200');
  return response;
}
