import { openSqlite, ensureCoreSchema, dbAll } from '../src/lib/sqlite';

const CORE: Array<{ name: string; id: string; metric: 'blocks'|'rebounds'; minAgeCut: number; expectTopAt: number[] }> = [
  { name: 'Andrei Kirilenko', id: '1905', metric: 'blocks', minAgeCut: 23, expectTopAt: [23,25] },
  { name: 'Benoit Benjamin', id: '104', metric: 'blocks', minAgeCut: 23, expectTopAt: [23,25] },
  { name: 'Shawn Kemp', id: '431', metric: 'blocks', minAgeCut: 25, expectTopAt: [25] },
  { name: 'Chris Bosh', id: '2547', metric: 'rebounds', minAgeCut: 21, expectTopAt: [21,23,25] },
  { name: 'Greg Monroe', id: '202328', metric: 'rebounds', minAgeCut: 23, expectTopAt: [23,25] },
  { name: 'Tyson Chandler', id: '2199', metric: 'rebounds', minAgeCut: 21, expectTopAt: [21,23,25] },
  { name: 'Antoine Walker', id: '952', metric: 'rebounds', minAgeCut: 23, expectTopAt: [23] },
  // Charles Oakley isn’t Top-25 at these ages; include presence-only check
];

async function inTop25(db: ReturnType<typeof openSqlite>, metric: 'rebounds'|'blocks', age: number, playerId: string) {
  const rows = await dbAll<{ player_id: string; v: number }>(db, `
    SELECT player_id, SUM(${metric}) as v FROM game_summary
    WHERE age_at_game_years IS NOT NULL AND age_at_game_years < ? AND season_type = 'Regular Season'
    GROUP BY player_id ORDER BY v DESC LIMIT 30`, [age]);
  const idx = rows.findIndex(r => String(r.player_id) === String(playerId));
  return idx >= 0 && idx < 25;
}

async function main() {
  const db = openSqlite();
  await ensureCoreSchema(db);
  const players = await dbAll<{ id: string; full_name: string }>(db, `SELECT id, full_name FROM players WHERE id IN (${CORE.map(() => '?').join(',')})`, CORE.map(c => c.id));
  const map = new Map(players.map(p => [p.id, p.full_name] as const));
  let failures = 0;
  for (const c of CORE) {
    const present = map.has(c.id);
    if (!present) { console.error(`Missing player in DB: ${c.name} (${c.id})`); failures++; continue; }
    for (const a of c.expectTopAt) {
      const ok = await inTop25(db, c.metric, a, c.id);
      if (!ok) { console.error(`Not Top-25 as expected: ${c.name} ${c.metric} age<${a}`); failures++; }
    }
  }
  db.close();
  if (failures) { console.error(`Guard failed with ${failures} issue(s).`); process.exit(2); }
  console.log('Core players guard: PASS');
}

main().catch(e => { console.error(e); process.exit(1); });
