import admin from 'firebase-admin';
import { playersCol } from '../src/lib/db';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';

type BlocksEntry = { playerId: string; blocks: number };

const AGES = Array.from({ length: 11 }, (_, i) => 20 + i); // 20..30

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function parseNbaDate(input: any): Date | null {
  if (!input) return null;
  if (input instanceof Date) return input;
  const s = String(input).trim();
  // Try ISO first
  const d1 = new Date(s);
  if (!Number.isNaN(d1.getTime())) return d1;
  // Try NBA format like "OCT 19, 2022"
  const m = s.toUpperCase().match(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2}),\s*(\d{4})$/);
  if (m) {
    const month = MONTHS[m[1]];
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    return new Date(Date.UTC(year, month, day));
  }
  return null;
}

async function getBirthday(playerId: string): Promise<Date | null> {
  const snap = await playersCol().doc(playerId).get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  const b = data?.birthday || data?.birthDate;
  if (!b) return null;
  const d = new Date(String(b));
  return Number.isNaN(d.getTime()) ? null : d;
}

let csvBirthdays: Map<string, Date> | null = null;
function ensureCsvBirthdays() {
  if (csvBirthdays) return csvBirthdays;
  csvBirthdays = new Map<string, Date>();
  const file = path.resolve(process.cwd(), 'data', 'raw', 'csv', 'common_player_info.csv');
  if (!fs.existsSync(file)) return csvBirthdays;
  const text = fs.readFileSync(file, 'utf8');
  const records = parseCsv(text, { columns: true, skip_empty_lines: true });
  for (const rec of records as Array<Record<string, string>>) {
    const id = String(rec.person_id || '').trim();
    const bd = String(rec.birthdate || '').trim();
    if (!id || !bd) continue;
    const d = new Date(bd.replace(' 00:00:00', ''));
    if (!Number.isNaN(d.getTime())) {
      csvBirthdays.set(id, d);
    }
  }
  return csvBirthdays;
}

async function getBirthdayWithFallback(playerId: string): Promise<Date | null> {
  const fromDb = await getBirthday(playerId);
  if (fromDb) return fromDb;
  const map = ensureCsvBirthdays();
  return map.get(playerId) ?? null;
}

function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

type MinimalGame = { GAME_DATE?: string; Game_Date?: string; GAME_DATE_EST?: string; BLK?: number } & Record<string, unknown>;
type CachedDoc = { playerId: string; seasonType: string; games: MinimalGame[] };

function loadPlayersCsv(): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const file = path.resolve(process.cwd(), 'data', 'players.csv');
    if (!fs.existsSync(file)) return out;
    const text = fs.readFileSync(file, 'utf8');
  const [_header, ...rows] = text.split(/\r?\n/).filter(Boolean);
    for (const line of rows) {
      const [id, full] = line.split(',');
      if (id && full) out.set(id, full);
    }
  } catch { /* ignore */ }
  return out;
}

async function readPlayerGameLogsCached(db: FirebaseFirestore.Firestore): Promise<CachedDoc[]> {
  const cacheDir = path.resolve(process.cwd(), 'data', 'cache');
  const cacheFile = path.join(cacheDir, 'playerGameLogs.min.jsonl');
  const maxAgeMs = 1000 * 60 * 30; // 30 minutes
  try {
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < maxAgeMs) {
        const lines = fs.readFileSync(cacheFile, 'utf8').split(/\r?\n/).filter(Boolean);
        return lines.map(l => JSON.parse(l));
      }
    }
  } catch { /* ignore and fall through to fetch */ }

  const snap = await db.collection('playerGameLogs').get();
  const docs: CachedDoc[] = [];
  for (const d of snap.docs) {
    const data = d.data() as any;
    const playerId = String(data.playerId || '');
    if (!playerId) continue;
    const seasonType = String(data.seasonType || '');
    const arr = Array.isArray(data.games) ? data.games : [];
    // Keep only minimal fields to shrink cache file
    const games = arr.map((g: any) => ({
      GAME_DATE: g.GAME_DATE ?? g.Game_Date ?? g.GAME_DATE_EST,
      BLK: Number(g.BLK || 0) || 0,
    }));
    docs.push({ playerId, seasonType, games });
  }

  ensureDir(cacheDir);
  try {
    const stream = fs.createWriteStream(cacheFile);
    for (const doc of docs) stream.write(JSON.stringify(doc) + "\n");
    stream.end();
  } catch { /* ignore cache write errors */ }
  return docs;
}

async function main() {
  const db = admin.firestore();
  const cached = await readPlayerGameLogsCached(db);
  const regGamesByPlayer: Record<string, any[]> = {};
  const allGamesByPlayer: Record<string, any[]> = {};
  for (const d of cached) {
    const playerId = d.playerId;
    const type = d.seasonType.toLowerCase();
    const arr = Array.isArray(d.games) ? d.games : [];
    if (!allGamesByPlayer[playerId]) allGamesByPlayer[playerId] = [];
    allGamesByPlayer[playerId].push(...arr);
    if (type.includes('regular')) {
      if (!regGamesByPlayer[playerId]) regGamesByPlayer[playerId] = [];
      regGamesByPlayer[playerId].push(...arr);
    }
  }

  // Compute blocks before age thresholds (REG and ALL)
  const boardsReg: Record<number, BlocksEntry[]> = {};
  const boardsAll: Record<number, BlocksEntry[]> = {};
  for (const age of AGES) { boardsReg[age] = []; boardsAll[age] = []; }

  const computeFor = async (gamesByPlayer: Record<string, any[]>, boards: Record<number, BlocksEntry[]>) => {
    for (const [playerId, games] of Object.entries(gamesByPlayer)) {
    const birthday = await getBirthdayWithFallback(playerId);
    if (!birthday) continue; // skip if no DOB

    // Pre-parse game dates and blocks once
    const parsed = games.map(g => ({
      date: parseNbaDate((g as any).GAME_DATE || (g as any).Game_Date || (g as any).GAME_DATE_EST || ''),
      blk: Number((g as any).BLK || 0) || 0,
    })).filter(x => x.date instanceof Date && !Number.isNaN((x.date as Date).getTime()));

    for (const age of AGES) {
      const cutoff = addYears(birthday, age);
      let blocks = 0;
      for (const row of parsed) {
        // Include the birthday game (<= cutoff)
        if ((row.date as Date) <= cutoff) blocks += row.blk;
      }
      if (blocks > 0) boards[age].push({ playerId, blocks });
    }
    }
  };

  await computeFor(regGamesByPlayer, boardsReg);
  await computeFor(allGamesByPlayer, boardsAll);

  // Sort and persist top 25 for each age (denormalize player names to cut UI reads)
  const leaderboardsCol = db.collection('leaderboards');
  const batch = db.batch();
  const now = Date.now();
  const FS_EXPORT = String(process.env.FS_EXPORT || '0') === '1';
  const fsOutDir = path.resolve(process.cwd(), 'data', 'cache', 'leaderboards');
  if (FS_EXPORT) {
    try { if (!fs.existsSync(fsOutDir)) fs.mkdirSync(fsOutDir, { recursive: true }); } catch { /* ignore */ }
  }
  const nameMap = loadPlayersCsv();
  for (const age of AGES) {
    const topReg = boardsReg[age].sort((a, b) => b.blocks - a.blocks).slice(0, 25);
    const topAll = boardsAll[age].sort((a, b) => b.blocks - a.blocks).slice(0, 25);
    const refReg = leaderboardsCol.doc(`blocksBeforeAge_${age}`);
    const refAll = leaderboardsCol.doc(`blocksBeforeAge_${age}_ALL`);
    const nextReg = {
      age,
      excludePlayoffs: true,
      includesBirthday: true,
      definition: 'Regular Season only. Includes games on the birthday (<= cutoff age). Excludes playoffs. Source: NBA Stats API gamelogs.',
      top25: topReg.map(r => ({ playerId: r.playerId, blocks: r.blocks, name: nameMap.get(String(r.playerId)) || undefined })),
      updatedAt: now,
    } as const;
    const nextAll = {
      age,
      excludePlayoffs: false,
      includesBirthday: true,
      definition: 'Includes playoffs. Includes games on the birthday (<= cutoff age). Source: NBA Stats API gamelogs.',
      top25: topAll.map(r => ({ playerId: r.playerId, blocks: r.blocks, name: nameMap.get(String(r.playerId)) || undefined })),
      updatedAt: now,
    } as const;
    batch.set(refReg, nextReg, { merge: true });
    batch.set(refAll, nextAll, { merge: true });
    if (FS_EXPORT) {
      try {
        fs.writeFileSync(path.join(fsOutDir, `blocksBeforeAge_${age}.json`), JSON.stringify(nextReg, null, 2));
        fs.writeFileSync(path.join(fsOutDir, `blocksBeforeAge_${age}_ALL.json`), JSON.stringify(nextAll, null, 2));
      } catch { /* ignore FS export errors */ }
    }
  }
  await batch.commit();
  console.log('Leaderboards written for ages', AGES.join(', '));
}

main().catch(e => { console.error(e); process.exit(1); });
