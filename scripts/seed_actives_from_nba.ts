import fs from 'node:fs';
import path from 'node:path';
import { openSqlite, ensureCoreSchema, dbRun } from '../src/lib/sqlite';

const NBA_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.nba.com',
  'Referer': 'https://www.nba.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

async function getFetch() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyGlobal = globalThis as any;
  if (anyGlobal.fetch) return anyGlobal.fetch as typeof fetch;
  const { fetch } = await import('undici');
  return fetch as typeof globalThis.fetch;
}

async function fetchJson(url: string, timeoutMs = 12000) {
  const f = await getFetch();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await f(url, { headers: NBA_HEADERS, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

function loadBirthdays(): Map<string, string> {
  const file = path.resolve(process.cwd(), 'data', 'cache', 'players_birthdays.json');
  const map = new Map<string, string>();
  if (!fs.existsSync(file)) return map;
  try {
    const arr = JSON.parse(fs.readFileSync(file, 'utf8')) as Array<{ id: string; birthday: string }>;
    for (const r of arr) map.set(String(r.id), r.birthday);
  } catch {}
  return map;
}

async function main() {
  const season = process.env.SEASON || '2024-25';
  const url = `https://stats.nba.com/stats/commonallplayers?LeagueID=00&Season=${encodeURIComponent(season)}&IsOnlyCurrentSeason=1`;
  const json = await fetchJson(url);
  const rs = json?.resultSets?.[0] ?? json?.resultSet;
  const headers: string[] = rs?.headers ?? [];
  const rows: any[][] = rs?.rowSet ?? [];
  const idx: Record<string, number> = Object.fromEntries(headers.map((h: string, i: number) => [h, i]));

  const bdays = loadBirthdays();
  const db = openSqlite();
  await ensureCoreSchema(db);
  let upserts = 0;
  await dbRun(db, 'BEGIN');
  try {
    for (const r of rows) {
      const id = String(r[idx.PERSON_ID] ?? '');
      const full = String(r[idx.DISPLAY_FIRST_LAST] ?? r[idx.PLAYER] ?? '').trim();
      if (!id || !full) continue;
      const b = bdays.get(id) ?? null;
      await dbRun(db, `INSERT INTO players(id, full_name, is_active, birthdate)
        VALUES(?, ?, 1, ?)
        ON CONFLICT(id) DO UPDATE SET full_name=excluded.full_name, is_active=1, birthdate=COALESCE(players.birthdate, excluded.birthdate)`,
        [id, full, b]
      );
      upserts++;
    }
    await dbRun(db, 'COMMIT');
  } catch (e) {
    await dbRun(db, 'ROLLBACK');
    throw e;
  } finally {
    db.close();
  }
  console.log(`Seeded/updated ${upserts} active players from NBA (${season})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
