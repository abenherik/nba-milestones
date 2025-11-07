import { NextRequest, NextResponse } from 'next/server';
import { openSqlite, ensureCoreSchema, dbAll, dbRun } from '@/lib/sqlite';

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
  await ensureCoreSchema(db);

  // Check if database is empty and auto-seed
  const playerCount = await dbAll<{ count: number }>(db, 'SELECT COUNT(*) as count FROM players');
  if ((playerCount[0]?.count || 0) === 0) {
    // Auto-populate with sample data
    for (const player of samplePlayers) {
      await dbRun(db, 'INSERT OR IGNORE INTO players (id, full_name, is_active) VALUES (?, ?, ?)', 
        [player.id, player.full_name, player.is_active]);
    }
  }

  type Row = { id: string; full_name: string };
  let rows: Row[] = [];
  if (q) {
    rows = await dbAll<Row>(db, `SELECT id, full_name FROM players WHERE lower(full_name) LIKE ? ORDER BY full_name LIMIT 20`, [
      `%${q}%`,
    ]);
  } else {
    rows = await dbAll<Row>(db, `SELECT id, full_name FROM players ORDER BY full_name LIMIT 50`);
  }
  db.close();
  return NextResponse.json({ players: rows });
}
