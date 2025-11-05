import admin from 'firebase-admin';
import { playersCol } from '../src/lib/db';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';

type Entry = { playerId: string; value: number };
type Metric = 'points' | 'rebounds' | 'assists' | 'steals';

const DEFAULT_AGES = Array.from({ length: 11 }, (_, i) => 20 + i); // 20..30
function parseAgesEnv(): number[] {
  const raw = String(process.env.AGES || '').trim();
  if (!raw) return DEFAULT_AGES;
  if (/^\d+\s*-\s*\d+$/.test(raw)) {
    const [a, b] = raw.split('-').map((s) => Number(s.trim()));
    if (Number.isFinite(a) && Number.isFinite(b) && a <= b) {
      return Array.from({ length: b - a + 1 }, (_, i) => a + i);
    }
  }
  const parts = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
  return parts.length ? Array.from(new Set(parts)).sort((x, y) => x - y) : DEFAULT_AGES;
}

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
  const d1 = new Date(s);
  if (!Number.isNaN(d1.getTime())) return d1;
  const m = s.toUpperCase().match(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2}),\s*(\d{4})$/);
  if (m) {
    const month = MONTHS[m[1]];
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    return new Date(Date.UTC(year, month, day));
  }
  return null;
}

type BirthdayMap = Map<string, Date>;
async function loadBirthdaysCached(): Promise<BirthdayMap> {
  // Unified strategy:
  // 1) If cache file is fresh and not bypassed, use it.
  // 2) Otherwise, load Firestore birthdays first (authoritative),
  //    then merge in CSV as a fallback for any missing players.
  // 3) Write merged results to cache file for next time.
  const out: BirthdayMap = new Map();
  const cacheDir = path.resolve(process.cwd(), 'data', 'cache');
  const cacheFile = path.join(cacheDir, 'players_birthdays.json');
  const ONE_DAY = 1000 * 60 * 60 * 24;
  const BYPASS_BIRTHDAY_CACHE = String(process.env.BYPASS_CACHE || process.env.BYPASS_BIRTHDAY_CACHE || '0') === '1';

  try {
    if (!BYPASS_BIRTHDAY_CACHE && fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < ONE_DAY) {
        const arr = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as Array<{ id: string; birthday: string }>;
        for (const r of arr) {
          const d = new Date(r.birthday);
          if (!Number.isNaN(d.getTime())) out.set(String(r.id), d);
        }
        if (out.size > 0) return out;
      }
    }
  } catch { /* ignore */ }

  // Step 1: Firestore (authoritative when present)
  try {
    const snap = await playersCol().select('birthday', 'birthDate').get();
    for (const doc of snap.docs) {
      const data = doc.data() as any;
      const b = data?.birthday || data?.birthDate;
      if (!b) continue;
      const d = new Date(String(b));
      if (!Number.isNaN(d.getTime())) out.set(doc.id, d);
    }
  } catch { /* ignore firestore read issues; we'll still use CSV */ }

  // Step 2: Merge CSV fallback for any missing players
  try {
    const localFile = path.resolve(process.cwd(), 'data', 'raw', 'csv', 'common_player_info.csv');
    if (fs.existsSync(localFile)) {
      const text = fs.readFileSync(localFile, 'utf8');
      const records = parseCsv(text, { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;
      for (const rec of records) {
        const id = String(rec.person_id || '').trim();
        const bd = String(rec.birthdate || '').trim();
        if (!id || !bd) continue;
        if (out.has(id)) continue; // keep Firestore override
        const d = new Date(bd.replace(' 00:00:00', ''));
        if (!Number.isNaN(d.getTime())) out.set(id, d);
      }
    }
  } catch { /* ignore CSV parse issues */ }

  // Step 3: Write cache
  try {
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const arr = Array.from(out.entries()).map(([id, d]) => ({ id, birthday: d.toISOString() }));
    fs.writeFileSync(cacheFile, JSON.stringify(arr, null, 2));
  } catch { /* ignore */ }
  return out;
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

function getBirthdayWithFallbackFromMaps(playerId: string, mapDb: BirthdayMap): Date | null {
  const fromDb = mapDb.get(playerId);
  if (fromDb) return fromDb;
  const map = ensureCsvBirthdays();
  return map.get(playerId) ?? null;
}

function metricValue(metric: Metric, g: Record<string, unknown>): number {
  const pick = (k: string) => Number((g as any)[k] || 0) || 0;
  switch (metric) {
    case 'points': return pick('PTS');
    case 'assists': return pick('AST');
    case 'steals': return pick('STL');
    case 'rebounds': {
      const reb = (g as any).REB;
      if (reb !== undefined && reb !== null && !Number.isNaN(Number(reb))) return Number(reb);
      return pick('OREB') + pick('DREB');
    }
  }
}

async function main() {
  const metrics: Metric[] = (String(process.env.METRICS || '').trim() || 'points,rebounds,assists,steals')
    .split(',')
    .map((s) => s.trim() as Metric)
    .filter((m): m is Metric => ['points','rebounds','assists','steals'].includes(m));
  const AGES = parseAgesEnv();
  const db = admin.firestore();

  type MinimalGame = Record<string, unknown>;
  type CachedDoc = { playerId: string; seasonType: string; games: MinimalGame[] };
  const cacheDir = path.resolve(process.cwd(), 'data', 'cache');
  const cacheFile = path.join(cacheDir, 'playerGameLogs.min.jsonl');
  const maxAgeMs = 1000 * 60 * 30; // 30 minutes
  const BYPASS_CACHE = String(process.env.BYPASS_CACHE || '0') === '1';
  const REQUIRE_CACHE = String(process.env.REQUIRE_CACHE || '0') === '1';
  let docs: CachedDoc[] = [];
  try {
    if (!BYPASS_CACHE && fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < maxAgeMs) {
        const lines = fs.readFileSync(cacheFile, 'utf8').split(/\r?\n/).filter(Boolean);
        docs = lines.map(l => JSON.parse(l));
      }
    }
  } catch { /* ignore */ }
  if (docs.length === 0) {
    if (REQUIRE_CACHE) {
      console.error('[leaderboard] Cache required but not found or bypassed. Set REQUIRE_CACHE=0 or provide cache file:', cacheFile);
      process.exit(2);
    }

    // Support incremental refresh by updatedAt threshold OR narrowed player set.
    const updatedSince = Number(process.env.UPDATED_SINCE_MS || 0); // e.g., 7 days: 1000*60*60*24*7
    const col = db.collection('playerGameLogs');
    const playersRaw = String(process.env.PLAYERS || '').trim();
    const players = playersRaw ? Array.from(new Set(playersRaw.split(',').map(s => s.trim()).filter(Boolean))) : [];
    const FULL_SCAN = String(process.env.FULL_SCAN || '0') === '1';

    // Helper to push docs into memory with minimal shape
    const pushDocs = (snap: FirebaseFirestore.QuerySnapshot) => {
      for (const d of snap.docs) {
        const data = d.data() as any;
        const playerId = String(data.playerId || '');
        if (!playerId) continue;
        if (players.length && !players.includes(playerId)) continue;
        const seasonType = String(data.seasonType || '');
        const arr = Array.isArray(data.games) ? data.games : [];
        const games = arr.map((g: any) => ({
          GAME_DATE: g.GAME_DATE ?? g.Game_Date ?? g.GAME_DATE_EST,
          PTS: Number(g.PTS || 0) || 0,
          AST: Number(g.AST || 0) || 0,
          STL: Number(g.STL || 0) || 0,
          REB: g.REB,
          OREB: g.OREB,
          DREB: g.DREB,
        }));
        docs.push({ playerId, seasonType, games });
      }
    };

    if (players.length > 0) {
      // Query by playerId in chunks of 10 (Firestore IN limit). Optionally filter by updatedAt if provided.
      const chunkSize = 10;
      for (let i = 0; i < players.length; i += chunkSize) {
        const chunk = players.slice(i, i + chunkSize);
        let q: FirebaseFirestore.Query = col.where('playerId', 'in', chunk);
        if (updatedSince > 0) {
          const cutoff = Date.now() - updatedSince;
          q = q.where('updatedAt', '>=', cutoff);
        }
        const snap = await q.get();
        pushDocs(snap);
      }
    } else if (updatedSince > 0) {
      const cutoff = Date.now() - updatedSince;
      const snap = await col.where('updatedAt', '>=', cutoff).get();
      pushDocs(snap);
    } else if (FULL_SCAN) {
      const snap = await col.get();
      pushDocs(snap);
    } else {
      console.error('[leaderboard] Refusing full collection scan. Provide one of: PLAYERS, UPDATED_SINCE_MS, or FULL_SCAN=1.');
      process.exit(2);
    }

    try {
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      const stream = fs.createWriteStream(cacheFile);
      for (const doc of docs) stream.write(JSON.stringify(doc) + "\n");
      stream.end();
    } catch { /* ignore */ }
  }

  const regByPlayer: Record<string, any[]> = {};
  const allByPlayer: Record<string, any[]> = {};
  for (const d of docs) {
    const playerId = d.playerId;
    const type = d.seasonType.toLowerCase();
    const arr = Array.isArray(d.games) ? d.games : [];
    if (!allByPlayer[playerId]) allByPlayer[playerId] = [];
    allByPlayer[playerId].push(...arr);
    if (type.includes('regular')) {
      if (!regByPlayer[playerId]) regByPlayer[playerId] = [];
      regByPlayer[playerId].push(...arr);
    }
  }

  // Preload birthdays once to avoid per-player reads
  const birthdays = await loadBirthdaysCached();

  for (const metric of metrics) {
    const boardsReg: Record<number, Entry[]> = {};
    const boardsAll: Record<number, Entry[]> = {};
    for (const age of AGES) { boardsReg[age] = []; boardsAll[age] = []; }

  const computeFor = async (gamesByPlayer: Record<string, any[]>, boards: Record<number, Entry[]>) => {
      for (const [playerId, games] of Object.entries(gamesByPlayer)) {
    const birthday = getBirthdayWithFallbackFromMaps(playerId, birthdays);
        if (!birthday) continue;
        const parsed = games.map(g => ({
          date: parseNbaDate((g as any).GAME_DATE || (g as any).Game_Date || (g as any).GAME_DATE_EST || ''),
          val: metricValue(metric, g as any),
        })).filter(x => x.date instanceof Date && !Number.isNaN((x.date as Date).getTime()));

        for (const age of AGES) {
          const cutoff = addYears(birthday, age);
          let value = 0;
          for (const row of parsed) {
            if ((row.date as Date) <= cutoff) value += row.val;
          }
          if (value > 0) boards[age].push({ playerId, value });
        }
      }
    };

    await computeFor(regByPlayer, boardsReg);
    await computeFor(allByPlayer, boardsAll);

    const col = db.collection('leaderboards');
    const batch = db.batch();
    const now = Date.now();
    const FS_EXPORT = String(process.env.FS_EXPORT || '0') === '1';
    const fsOutDir = path.resolve(process.cwd(), 'data', 'cache', 'leaderboards');
    if (FS_EXPORT) {
      try { if (!fs.existsSync(fsOutDir)) fs.mkdirSync(fsOutDir, { recursive: true }); } catch { /* ignore */ }
    }
    const nameMap = (() => {
      try {
        const file = path.resolve(process.cwd(), 'data', 'players.csv');
        if (!fs.existsSync(file)) return new Map<string, string>();
        const text = fs.readFileSync(file, 'utf8');
        const [_header, ...rows] = text.split(/\r?\n/).filter(Boolean);
        const m = new Map<string, string>();
        for (const line of rows) { const [id, full] = line.split(','); if (id && full) m.set(id, full); }
        return m;
      } catch { return new Map<string, string>(); }
    })();
    for (const age of AGES) {
      const topReg = boardsReg[age].sort((a, b) => b.value - a.value).slice(0, 25);
      const topAll = boardsAll[age].sort((a, b) => b.value - a.value).slice(0, 25);
      const base = `${metric}BeforeAge_${age}`; // e.g., pointsBeforeAge_21
      const defBase = metric.charAt(0).toUpperCase() + metric.slice(1);
      // Optionally skip write if unchanged (small read per doc) unless SKIP_DEDUPE=1
      const doDedupe = String(process.env.SKIP_DEDUPE || '0') !== '1';
      const existingReg = doDedupe ? await col.doc(base).get().catch(() => null) : null;
      const existingAll = doDedupe ? await col.doc(`${base}_ALL`).get().catch(() => null) : null;

      const nextReg = {
        age,
        metric,
        excludePlayoffs: true,
        includesBirthday: true,
        definition: `${defBase}. Regular Season only. Includes games on the birthday (<= cutoff age). Excludes playoffs. Source: NBA Stats API gamelogs.`,
        // Firestore rejects undefined fields; use null when name is unknown.
        top25: topReg.map(r => ({ playerId: r.playerId, value: r.value, name: nameMap.get(String(r.playerId)) ?? null })),
        updatedAt: now,
      } as const;
      const nextAll = {
        age,
        metric,
        excludePlayoffs: false,
        includesBirthday: true,
        definition: `${defBase}. Includes playoffs. Includes games on the birthday (<= cutoff age). Source: NBA Stats API gamelogs.`,
        // Firestore rejects undefined fields; use null when name is unknown.
        top25: topAll.map(r => ({ playerId: r.playerId, value: r.value, name: nameMap.get(String(r.playerId)) ?? null })),
        updatedAt: now,
      } as const;

      const eq = (a: any, b: any) => JSON.stringify(a?.top25) === JSON.stringify(b?.top25);
      const shouldWriteReg = !doDedupe || !existingReg || !existingReg.exists || !eq(existingReg.data(), nextReg);
      const shouldWriteAll = !doDedupe || !existingAll || !existingAll.exists || !eq(existingAll.data(), nextAll);

      if (shouldWriteReg) batch.set(col.doc(base), nextReg, { merge: true });
      if (shouldWriteAll) batch.set(col.doc(`${base}_ALL`), nextAll, { merge: true });

      if (FS_EXPORT) {
        try {
          fs.writeFileSync(path.join(fsOutDir, `${base}.json`), JSON.stringify(nextReg, null, 2));
          fs.writeFileSync(path.join(fsOutDir, `${base}_ALL.json`), JSON.stringify(nextAll, null, 2));
        } catch { /* ignore FS export errors */ }
      }
    }
    await batch.commit();
    console.log(`Leaderboards written for ${metric} ages ${AGES.join(', ')}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
