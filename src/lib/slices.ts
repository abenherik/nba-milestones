import crypto from 'node:crypto';
import { SqliteDb, dbAll, dbRun } from './sqlite';

export type SeasonGroup = 'RS' | 'ALL';

export function presetKey(def: unknown): string {
  // Stable key from JSON definition
  const json = JSON.stringify(def);
  return crypto.createHash('sha1').update(json).digest('hex');
}

export async function getMeta(db: SqliteDb, key: string): Promise<string | null> {
  const rows = await dbAll<{ value: string }>(db, `SELECT value FROM app_meta WHERE key = ? LIMIT 1`, [key]);
  return rows[0]?.value ?? null;
}

export async function setMeta(db: SqliteDb, key: string, value: string): Promise<void> {
  await dbRun(db, `INSERT INTO app_meta(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [key, value]);
}

export async function publishSlicesVersion(db: SqliteDb, newVersion: string) {
  await setMeta(db, 'slices_current_version', newVersion);
  await setMeta(db, 'slices_published_at', new Date().toISOString());
}

export async function currentSlicesVersion(db: SqliteDb): Promise<string> {
  const v = await getMeta(db, 'slices_current_version');
  if (v) return v;
  const init = 'v1';
  await setMeta(db, 'slices_current_version', init);
  return init;
}

export type SliceRow = { rank: number; player_id: string; player_name: string; value: number };

// Simple in-memory TTL cache for slice rows per process
type CacheEntry = { rows: SliceRow[]; ts: number };
const mem = new Map<string, CacheEntry>();
const ttlMs = Number(process.env.SLICES_MEM_TTL_MS || 30000); // 30s default
function cacheKey(version: string, key: string, season: SeasonGroup, age: number) {
  return `${version}|${key}|${season}|${age}`;
}

export async function readSliceTop25(db: SqliteDb, version: string, key: string, season: SeasonGroup, age: number): Promise<SliceRow[] | null> {
  const ck = cacheKey(version, key, season, age);
  const now = Date.now();
  const ce = mem.get(ck);
  if (ce && now - ce.ts < ttlMs) return ce.rows;
  const rows = await dbAll<SliceRow>(db, `SELECT rank, player_id, player_name, value
    FROM slices_top25 WHERE version=? AND slice_key=? AND season_group=? AND age=?
    ORDER BY rank ASC`, [version, key, season, age]);
  if (!rows.length) return null;
  mem.set(ck, { rows, ts: now });
  return rows;
}

export async function writeSliceTop25(db: SqliteDb, version: string, key: string, season: SeasonGroup, age: number, rows: SliceRow[]): Promise<void> {
  const ts = new Date().toISOString();
  const values = rows.map(r => `('${version}','${key}','${season}',${age},${r.rank},'${r.player_id}','${r.player_name.replace(/'/g, "''")}',${r.value},'${ts}')`).join(',');
  if (!values) return;
  await dbRun(db, `INSERT OR REPLACE INTO slices_top25(version,slice_key,season_group,age,rank,player_id,player_name,value,updated_at)
    VALUES ${values}`);
  // warm the in-memory cache
  const ck = cacheKey(version, key, season, age);
  mem.set(ck, { rows, ts: Date.now() });
}

export async function readSlicesTop25Batch(
  db: SqliteDb,
  version: string,
  items: Array<{ sliceKey: string; age: number }>,
  season: SeasonGroup
): Promise<Map<string, SliceRow[]>> {
  const out = new Map<string, SliceRow[]>();
  if (!items.length) return out;
  const now = Date.now();
  const toFetch: Array<{ sliceKey: string; age: number }> = [];
  // Check memory cache first
  for (const it of items) {
    const ck = cacheKey(version, it.sliceKey, season, it.age);
    const ce = mem.get(ck);
    if (ce && now - ce.ts < ttlMs) {
      out.set(`${it.sliceKey}|${it.age}`, ce.rows);
    } else {
      toFetch.push(it);
    }
  }
  if (!toFetch.length) return out;
  // Query DB for missing sliceKey/age combinations
  const keys = Array.from(new Set(toFetch.map(i => i.sliceKey)));
  const ages = Array.from(new Set(toFetch.map(i => i.age)));
  const keyPlace = keys.map(() => '?').join(',');
  const agePlace = ages.map(() => '?').join(',');
  const sql = `SELECT slice_key, age, rank, player_id, player_name, value
    FROM slices_top25
    WHERE version=? AND season_group=?
      AND slice_key IN (${keyPlace})
      AND age IN (${agePlace})
    ORDER BY slice_key, age, rank`;
  const rows = await dbAll<{ slice_key: string; age: number } & SliceRow>(db, sql, [version, season, ...keys, ...ages]);
  // Group results
  const grouped = new Map<string, SliceRow[]>();
  for (const r of rows) {
    const id = `${r.slice_key}|${r.age}`;
    let arr = grouped.get(id);
    if (!arr) { arr = []; grouped.set(id, arr); }
    arr.push({ rank: r.rank, player_id: r.player_id, player_name: r.player_name, value: r.value });
  }
  // Fill outputs and warm cache
  for (const it of toFetch) {
    const id = `${it.sliceKey}|${it.age}`;
    const arr = grouped.get(id);
    if (arr && arr.length) {
      out.set(id, arr);
      const ck = cacheKey(version, it.sliceKey, season, it.age);
      mem.set(ck, { rows: arr, ts: Date.now() });
    }
  }
  return out;
}
