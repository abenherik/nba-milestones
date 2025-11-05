import fs from 'fs';
import path from 'path';
import { openSqlite, ensureCoreSchema, dbRun } from '../src/lib/sqlite';

type SeasonType = 'Regular Season' | 'Playoffs';

const NBA_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.nba.com',
  'Referer': 'https://www.nba.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

function sleep(ms: number) { return new Promise((res) => setTimeout(res, ms)); }

async function getFetch() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyGlobal = globalThis as any;
  if (anyGlobal.fetch) return anyGlobal.fetch as typeof fetch;
  const { fetch } = await import('undici');
  return fetch as typeof globalThis.fetch;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.TIMEOUT_MS || '12000');
const DEFAULT_RETRIES = Number(process.env.RETRIES || '4');
const DEFAULT_RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || '1100');
const ABORT_COOLDOWN_MS = Number(process.env.ABORT_COOLDOWN_MS || '15000');

async function fetchJson(url: string, timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES, retryDelayMs = DEFAULT_RETRY_DELAY_MS) {
  const f = await getFetch();
  let err: unknown;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await f(url, { headers: NBA_HEADERS, signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) {
        if ((r.status === 429 || r.status === 403 || r.status >= 500) && i < retries) {
          await sleep(retryDelayMs * (i + 1));
          continue;
        }
        throw new Error(`HTTP ${r.status}`);
      }
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      err = e;
      // incremental backoff on all retries
      if (i < retries) { await sleep(retryDelayMs * (i + 1)); continue; }
      throw e;
    }
  }
  throw err;
}

async function fetchPlayerGameLog(playerId: string, season: string, seasonType: SeasonType) {
  const params = new URLSearchParams({ PlayerID: playerId, Season: season, SeasonType: seasonType });
  const url = `https://stats.nba.com/stats/playergamelog?${params.toString()}`;
  const json = await fetchJson(url);
  const rs = json?.resultSets?.[0] ?? json?.resultSet;
  if (!rs) return [] as any[];
  const headers: string[] = rs.headers ?? [];
  const rows: any[][] = rs.rowSet ?? [];
  return rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

function num(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

async function upsertPlayer(db: ReturnType<typeof openSqlite>, id: string, fullName: string) {
  await dbRun(db, `INSERT INTO players(id, full_name, is_active)
    VALUES(?, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET full_name = COALESCE(excluded.full_name, players.full_name)`,
    [id, fullName]);
}

async function upsertGames(db: ReturnType<typeof openSqlite>, playerId: string, season: string, seasonType: SeasonType, games: any[]) {
  for (const g of games) {
    const gameId = String(g.GAME_ID ?? g.game_id ?? g.GAME_ID_X ?? `${playerId}:${season}:${g.GAME_DATE}`);
    const gameDate = String(g.GAME_DATE ?? g.GAME_DATE_EST ?? g.game_date);
    // Basic stats
    const pts = num(g.PTS ?? g.pts);
    const reb = num(g.REB ?? g.reb ?? (num(g.OREB) + num(g.DREB)));
    const ast = num(g.AST ?? g.ast);
    const blk = num(g.BLK ?? g.blk);
    const stl = num(g.STL ?? g.stl);
    const min = String(g.MIN ?? g.min ?? '');
    await dbRun(db, `INSERT OR IGNORE INTO games(game_id, game_date) VALUES(?, ?)`, [gameId, gameDate]);
    await dbRun(db, `INSERT INTO player_stats(game_id, player_id, season, season_type, minutes, points, rebounds, assists, blocks, steals)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(game_id, player_id) DO UPDATE SET season=excluded.season, season_type=excluded.season_type, minutes=excluded.minutes,
        points=excluded.points, rebounds=excluded.rebounds, assists=excluded.assists, blocks=excluded.blocks, steals=excluded.steals`,
      [gameId, playerId, season, seasonType, min, pts, reb, ast, blk, stl]
    );
  }
}

function findLatestReport(prefix = 'missing-seasons-offline', dir = 'docs/reports') {
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) return null;
  const files = fs.readdirSync(abs).filter(f => f.startsWith(prefix) && f.endsWith('.json'));
  if (!files.length) return null;
  files.sort((a, b) => b.localeCompare(a));
  return path.join(abs, files[0]);
}

function isFutureSeason(season: string, now = new Date()): boolean {
  const startYear = Number(season.slice(0,4));
  if (!Number.isFinite(startYear)) return false;
  const currentYear = now.getFullYear();
  if (startYear > currentYear) return true;
  if (startYear === currentYear) {
    const m = now.getMonth();
    const d = now.getDate();
    if (m < 9) return true; // before October
    if (m === 9 && d < 10) return true; // early October buffer
  }
  return false;
}

async function main(){
  const REPORT_PATH = String(process.env.REPORT_PATH || '') || findLatestReport() || '';
  if (!REPORT_PATH) throw new Error('Could not locate offline JSON report. Provide REPORT_PATH or generate one first.');
  const ONLY_IDS = String(process.env.ONLY_IDS || '').trim();
  const LIMIT_PLAYERS = Number(process.env.LIMIT_PLAYERS || '0');
  const LIMIT_SEASONS = Number(process.env.LIMIT_SEASONS || '0');
  const DELAY_MS = Number(process.env.DELAY_MS || '1200');
  const IGNORE_FUTURE = process.env.IGNORE_FUTURE !== '0';
  const DRY_RUN = process.env.DRY_RUN === '1';

  const json = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const results: Array<{ id:string; name:string; missing:string[] }> = json.results || [];
  let list = results;
  if (ONLY_IDS) {
    const set = new Set(ONLY_IDS.split(/[\,\s]+/).filter(Boolean));
    list = list.filter(r => set.has(r.id));
  }
  if (LIMIT_PLAYERS && list.length > LIMIT_PLAYERS) list = list.slice(0, LIMIT_PLAYERS);

  const db = openSqlite();
  await ensureCoreSchema(db);

  console.log(`[backfill] Using report: ${REPORT_PATH}`);
  let totalSeasons = 0, totalGames = 0;

  for (const r of list) {
    const missing = (r.missing || []).filter(s => IGNORE_FUTURE ? !isFutureSeason(s) : true);
    const seasons = LIMIT_SEASONS ? missing.slice(0, LIMIT_SEASONS) : missing;
    if (!seasons.length) continue;
    console.log(`[backfill] ${r.name} (${r.id}) seasons: ${seasons.join(', ')}`);
    await upsertPlayer(db, r.id, r.name);
    for (const s of seasons) {
      if (DRY_RUN) { console.log(`[dry-run] would fetch ${r.id} ${s} Regular Season`); continue; }
      try {
        const games = await fetchPlayerGameLog(r.id, s, 'Regular Season');
        await upsertGames(db, r.id, s, 'Regular Season', games);
        totalSeasons++;
        totalGames += games.length;
        console.log(`[saved] ${r.id} ${s} Regular Season -> ${games.length} logs`);
      } catch (e) {
        const msg = (e as Error).message || String(e);
        console.warn(`[warn] failed ${r.id} ${s} Regular Season:`, msg);
        if (/aborted|AbortError/i.test(msg) && ABORT_COOLDOWN_MS > 0) {
          console.warn(`[cool-off] abort detected, sleeping ${ABORT_COOLDOWN_MS}ms`);
          await sleep(ABORT_COOLDOWN_MS);
        }
      }
      const jitter = Math.floor(Math.random() * 300);
      await sleep(DELAY_MS + jitter);
    }
  }

  db.close();
  console.log(`[backfill] Done. Wrote ${totalGames} game logs across ${totalSeasons} seasons.`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
