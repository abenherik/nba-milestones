import fs from 'node:fs';
import path from 'node:path';
import { openSqlite, ensureCoreSchema, dbRun } from '../src/lib/sqlite';

type CsvPlayer = { id: string; full_name: string; is_active?: boolean };
type Bday = { id: string; birthday: string };

function loadPlayersCsv(): CsvPlayer[] {
  const file = path.resolve(process.cwd(), 'data', 'players.csv');
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const out: CsvPlayer[] = [];
  const header = lines.shift();
  const cols = (header ?? '').split(',');
  const idIdx = cols.findIndex((c) => c.trim().toLowerCase() === 'id');
  const fullIdx = cols.findIndex((c) => c.trim().toLowerCase() === 'full_name');
  const activeIdx = cols.findIndex((c) => c.trim().toLowerCase().includes('active'));
  for (const line of lines) {
    const parts = line.split(',');
    const id = parts[idIdx];
    const full = parts[fullIdx];
    const activeRaw = activeIdx >= 0 ? parts[activeIdx] : '';
    if (!id || !full) continue;
    const is_active = activeRaw ? activeRaw === '1' || activeRaw.toLowerCase() === 'true' : undefined;
    out.push({ id, full_name: full, is_active });
  }
  return out;
}

function loadBirthdays(): Map<string, string> {
  const file = path.resolve(process.cwd(), 'data', 'cache', 'players_birthdays.json');
  const map = new Map<string, string>();
  if (!fs.existsSync(file)) return map;
  try {
    const arr = JSON.parse(fs.readFileSync(file, 'utf8')) as Bday[];
    for (const r of arr) {
      if (r.id && r.birthday) map.set(String(r.id), r.birthday);
    }
  } catch {}
  return map;
}

async function main() {
  const players = loadPlayersCsv();
  const bdays = loadBirthdays();
  if (!players.length) {
    console.warn('No data/players.csv found or it is empty');
  }
  const db = openSqlite();
  await ensureCoreSchema(db);
  await dbRun(db, 'BEGIN');
  try {
    for (const p of players) {
      const b = bdays.get(p.id) ?? null;
      await dbRun(db, `INSERT INTO players(id, full_name, is_active, birthdate)
        VALUES(?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET full_name=excluded.full_name,
          is_active=COALESCE(excluded.is_active, players.is_active),
          birthdate=COALESCE(excluded.birthdate, players.birthdate)`,
        [String(p.id), p.full_name, p.is_active != null ? (p.is_active ? 1 : 0) : null, b]
      );
    }
    await dbRun(db, 'COMMIT');
  } catch (e) {
    await dbRun(db, 'ROLLBACK');
    throw e;
  } finally {
    db.close();
  }
  console.log(`Seeded ${players.length} players into SQLite`);
}

main().catch((e) => { console.error(e); process.exit(1); });
