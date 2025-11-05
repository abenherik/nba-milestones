import { openSqlite, ensureCoreSchema, dbAll } from '../src/lib/sqlite';
import fs from 'fs';
import path from 'path';
console.log('[detect_missing_seasons] module loaded');

// Minimal fetch with retries (mirrors logic in batch_fetch_by_ids but simplified)
const NBA_HEADERS: Record<string,string> = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.nba.com',
  // Use the stats area as referer to better match typical browser requests
  'Referer': 'https://www.nba.com/stats/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

async function getFetch() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyGlobal: any = globalThis as any;
  if (anyGlobal.fetch) return anyGlobal.fetch as typeof fetch;
  const { fetch } = await import('undici');
  return fetch as typeof globalThis.fetch;
}

function sleep(ms:number){ return new Promise(res=>setTimeout(res, ms)); }
function jitter(base:number){ return base + Math.floor(Math.random()*Math.min(500, Math.max(50, base*0.35))); }

async function fetchJson(url: string, timeoutMs = 12000, retries = 3, retryDelayMs = 900): Promise<any> {
  const f = await getFetch();
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await f(url, { headers: NBA_HEADERS, signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) {
        if ((r.status === 429 || r.status === 403 || r.status >= 500) && i < retries) {
          await sleep(jitter(retryDelayMs * (i + 1)));
          continue;
        }
        throw new Error(`HTTP ${r.status}`);
      }
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      // AbortError or network timeouts: retry with backoff
      if (i < retries) {
        await sleep(jitter(retryDelayMs * (i + 1)));
        continue;
      }
    }
  }
  throw lastErr;
}

function seasonString(yearStart: number) { const yy = (yearStart + 1).toString().slice(-2); return `${yearStart}-${yy}`; }

async function getSeasonsForPlayer(playerId: string): Promise<string[]> {
  const url = `https://stats.nba.com/stats/commonplayerinfo?PlayerID=${playerId}`;
  const json = await fetchJson(url);
  const rs = json?.resultSets?.[0] ?? json?.resultSet;
  const headers: string[] = rs?.headers ?? [];
  const rows: any[][] = rs?.rowSet ?? [];
  if (!rows.length) return [];
  const rowObj = Object.fromEntries(headers.map((h, i) => [h, rows[0][i]]));
  const fromYear = Number(rowObj.FROM_YEAR || rowObj.from_year || 0) || 0;
  const toYear = Number(rowObj.TO_YEAR || rowObj.to_year || 0) || fromYear;
  const seasons: string[] = [];
  for (let y = fromYear; y <= toYear; y++) seasons.push(seasonString(y));
  return seasons;
}

function isFutureSeason(season:string, now = new Date()): boolean {
  // Treat a season starting year >= current year as future until mid-October (preseason) of that year.
  const startYear = Number(season.slice(0,4));
  if (!Number.isFinite(startYear)) return false;
  const currentYear = now.getFullYear();
  if (startYear > currentYear) return true;
  if (startYear === currentYear) {
    // NBA regular season typically starts mid/late Oct; before Oct 10 treat as future/not missing.
    const m = now.getMonth(); // 0-based
    const d = now.getDate();
    if (m < 9) return true; // Jan(0)..Sep(8) => before Oct
    if (m === 9 && d < 10) return true; // Early October buffer
  }
  return false;
}

async function main() {
  const LIMIT = Number(process.env.LIMIT || '0');
  const ONLY_IDS = String(process.env.ONLY_IDS || '').trim();
  const TARGET_POINTS_MIN = Number(process.env.MIN_PTS || '0'); // filter to players with at least this many points in player_stats
  const RETRIES = Number(process.env.RETRIES || '5');
  const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || '15000');
  const RETRY_DELAY_MS = Number(process.env.RETRY_DELAY_MS || '1000');
  const IGNORE_FUTURE = process.env.IGNORE_FUTURE !== '0';
  const VERBOSE = process.env.VERBOSE === '1';
  const WRITE_REPORT = process.env.WRITE_REPORT === '1';
  const OUT_DIR = String(process.env.OUT_DIR || 'docs/reports');
  const OUT_BASENAME = String(process.env.OUT_BASENAME || 'missing-seasons');
  const OUT_FORMATS = String(process.env.OUT_FORMATS || 'json').split(/[,\s]+/).filter(Boolean);
  const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || '6'));
  const APPEND_PROGRESS = process.env.APPEND_PROGRESS === '1';
  const PROCESSED_IDS_PATH = String(process.env.PROCESSED_IDS_PATH || '');
  const SLEEP_BETWEEN_MS = Math.max(0, Number(process.env.SLEEP_BETWEEN_MS || '50'));
  const USE_COMMONALLPLAYERS = process.env.USE_COMMONALLPLAYERS === '1';
  const ALLPLAYERS_SEASON = String(process.env.ALLPLAYERS_SEASON || '2024-25');

  // Patch fetchJson defaults via wrapper closure usage below (simple override by binding params)
  const originalFetch = fetchJson;
  async function fetchJsonPatched(url:string){
    return originalFetch(url, TIMEOUT_MS, RETRIES, RETRY_DELAY_MS);
  }
  // Monkey patch internal usage functions that call fetchJson directly (getSeasonsForPlayer)
  // Simpler: rebind global function name (works within this module scope)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (fetchJson as any) = fetchJsonPatched; // intentional reassignment
  const db = openSqlite();
  await ensureCoreSchema(db);

  // Build candidate list
  let players = await dbAll<{ id: string; full_name: string; pts: number }>(db, `
    SELECT p.id, p.full_name, COALESCE(SUM(ps.points),0) as pts
    FROM players p
    LEFT JOIN player_stats ps ON ps.player_id = p.id AND ps.season_type='Regular Season'
    GROUP BY p.id, p.full_name
    HAVING pts >= ?
    ORDER BY pts DESC
  `, [TARGET_POINTS_MIN]);

  if (ONLY_IDS) {
    const set = new Set(ONLY_IDS.split(/[\s,]+/).filter(Boolean));
    players = players.filter(p => set.has(p.id));
  }
  if (LIMIT && players.length > LIMIT) players = players.slice(0, LIMIT);

  console.log(`Scanning ${players.length} players for missing Regular Season seasons... (RETRIES=${RETRIES} TIMEOUT_MS=${TIMEOUT_MS} IGNORE_FUTURE=${IGNORE_FUTURE} CONCURRENCY=${CONCURRENCY} MODE=${USE_COMMONALLPLAYERS?`commonallplayers:${ALLPLAYERS_SEASON}`:'per-player'})`);

  const results: { id: string; name: string; expected: number; present: number; missing: string[] }[] = [];
  const aborted: { id:string; name:string; reason:string }[] = [];

  // Optional progress append file
  let progressPath = '';
  let stamp = '';
  if (APPEND_PROGRESS || WRITE_REPORT) {
    const ts = new Date();
    stamp = `${ts.getFullYear()}${String(ts.getMonth()+1).padStart(2,'0')}${String(ts.getDate()).padStart(2,'0')}-${String(ts.getHours()).padStart(2,'0')}${String(ts.getMinutes()).padStart(2,'0')}${String(ts.getSeconds()).padStart(2,'0')}`;
  }
  if (APPEND_PROGRESS) {
    const dir = path.resolve(OUT_DIR);
    fs.mkdirSync(dir, { recursive: true });
    progressPath = path.join(dir, `${OUT_BASENAME}-live-${stamp}.log`);
    fs.appendFileSync(progressPath, `start ${new Date().toISOString()} players=${players.length} concurrency=${CONCURRENCY}\n`);
  }

  function appendLine(line:string){
    if (APPEND_PROGRESS && progressPath) {
      try { fs.appendFileSync(progressPath, line + '\n'); } catch { /* ignore */ }
    }
  }

  // Resume/skip processed IDs if a file is provided (newline-separated IDs)
  let processedSet: Set<string> | null = null;
  if (PROCESSED_IDS_PATH) {
    try {
      const content = fs.readFileSync(PROCESSED_IDS_PATH, 'utf8');
      const ids = content.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      if (ids.length) {
        processedSet = new Set(ids);
        players = players.filter(p=>!processedSet!.has(p.id));
        console.log(`Skipping ${ids.length} already-processed players from ${PROCESSED_IDS_PATH}. Remaining: ${players.length}`);
      }
    } catch { /* no-op if not found */ }
  }

  // Global recent outcomes buffer for simple circuit-breaker backoff
  const recent: ('ok'|'missing'|'abort')[] = [];
  const RECENT_MAX = 50;
  async function maybeGlobalBackoff(){
    if (!recent.length) return;
    const window = recent.slice(-RECENT_MAX);
    const aborts = window.filter(x=>x==='abort').length;
    // If more than 60% of the last RECENT_MAX results aborted, pause to ease rate limits
    if (aborts / window.length > 0.6) {
      const pauseMs = 8000 + Math.floor(Math.random()*4000);
      const msg = `[backoff] high abort ratio (${aborts}/${window.length}); sleeping ${pauseMs}ms`;
      console.warn(msg);
      appendLine(msg);
      await sleep(pauseMs);
    }
  }

  // If using one-call commonallplayers mode, fetch once and avoid per-player network calls
  type SeasonBounds = { from:number; to:number };
  let allMap: Map<string, SeasonBounds> | null = null;
  if (USE_COMMONALLPLAYERS) {
    try {
      const url = `https://stats.nba.com/stats/commonallplayers?IsOnlyCurrentSeason=0&LeagueID=00&Season=${encodeURIComponent(ALLPLAYERS_SEASON)}`;
      const json = await fetchJson(url, TIMEOUT_MS, RETRIES, RETRY_DELAY_MS);
      const rs = json?.resultSets?.[0] ?? json?.resultSet ?? json?.ResultSets?.find((r: any)=>/CommonAllPlayers/i.test(r?.name));
      const headers: string[] = rs?.headers ?? [];
      const rows: any[][] = rs?.rowSet ?? [];
      const IDX_ID = headers.indexOf('PERSON_ID');
      const IDX_FROM = headers.indexOf('FROM_YEAR');
      const IDX_TO = headers.indexOf('TO_YEAR');
      allMap = new Map();
      for (const row of rows) {
        const id = String(row[IDX_ID]);
        const from = Number(row[IDX_FROM] || 0) || 0;
        const to = Number(row[IDX_TO] || from) || from;
        if (id) allMap.set(id, { from, to });
      }
      console.log(`[commonallplayers] loaded ${allMap.size} entries`);
    } catch (e) {
      console.warn('[commonallplayers] failed, falling back to per-player mode:', (e as Error).message);
      allMap = null;
    }
  }

  // Worker pool with bounded concurrency
  let idx = 0;
  async function worker(){
    for(;;){
      const i = idx++;
      if (i >= players.length) return;
      const p = players[i];
      try {
        let expected: string[] = [];
        if (allMap && allMap.has(p.id)) {
          const b = allMap.get(p.id)!;
          for (let y=b.from; y<=b.to; y++) expected.push(seasonString(y));
        } else {
          expected = await getSeasonsForPlayer(p.id);
        }
        if (!expected.length) { appendLine(`[NO-DATA] ${p.full_name} (${p.id})`); continue; }
        const presentRows = await dbAll<{ season: string }>(db, `SELECT DISTINCT season FROM player_stats WHERE player_id=? AND season_type='Regular Season'`, [p.id]);
        const present = new Set(presentRows.map(r => r.season));
        let missing = expected.filter(s => !present.has(s));
        if (IGNORE_FUTURE) missing = missing.filter(s => !isFutureSeason(s));
        if (missing.length) {
          results.push({ id: p.id, name: p.full_name, expected: expected.length, present: present.size, missing });
          const line = `[MISSING] ${p.full_name} (${p.id}) missing ${missing.length} season(s): ${missing.join(', ')}`;
          console.log(line);
          appendLine(line);
          recent.push('missing'); if (recent.length > RECENT_MAX) recent.shift();
        } else {
          const line = `[OK] ${p.full_name}`;
          if (VERBOSE) console.log(line);
          appendLine(line);
          recent.push('ok'); if (recent.length > RECENT_MAX) recent.shift();
        }
      } catch (e) {
        const msg = (e as Error).message || String(e);
        const line = `Failed seasons lookup for ${p.full_name} (${p.id}): ${msg}`;
        console.warn(line);
        appendLine(line);
        aborted.push({ id:p.id, name:p.full_name, reason:msg });
        recent.push('abort'); if (recent.length > RECENT_MAX) recent.shift();
      }
      await maybeGlobalBackoff();
      if (SLEEP_BETWEEN_MS > 0) await sleep(jitter(SLEEP_BETWEEN_MS));
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  if (!results.length) {
    console.log('No missing (non-future) seasons detected for scanned players.');
  } else {
    console.log('\nSummary:');
    for (const r of results) {
      console.log(`${r.name.padEnd(24)} present=${r.present}/${r.expected} missing: ${r.missing.join(', ')}`);
    }
    console.log('\nNext-step fetch suggestions (Regular Season only):');
    for (const r of results) {
      const years = r.missing.map(s => s.slice(0,4));
      const minYear = Math.min(...years.map(Number));
      const maxYear = Math.max(...years.map(Number));
      console.log(`IDS=${r.id} FROM_YEAR=${minYear} TO_YEAR=${maxYear} ONLY_REGULAR=1 SKIP_EXISTING=0`);
    }
  }

  if (aborted.length) {
    console.log(`\nNote: ${aborted.length} player(s) had aborted/failed season lookups (likely timeout/rate limit). Rerun with VERBOSE=1 or adjust RETRIES/TIMEOUT_MS.`);
    if (VERBOSE) {
      for (const a of aborted) console.log(`[ABORTED] ${a.name} (${a.id}) reason=${a.reason}`);
    }
  }

  // Optionally write reports to disk
  if (WRITE_REPORT) {
    try {
  const ts = new Date();
  // reuse stamp when available (so live log and final reports share timestamp)
  const finalStamp = stamp || `${ts.getFullYear()}${String(ts.getMonth()+1).padStart(2,'0')}${String(ts.getDate()).padStart(2,'0')}-${String(ts.getHours()).padStart(2,'0')}${String(ts.getMinutes()).padStart(2,'0')}${String(ts.getSeconds()).padStart(2,'0')}`;
      const dir = path.resolve(OUT_DIR);
      fs.mkdirSync(dir, { recursive: true });
      const meta = {
        generatedAt: ts.toISOString(),
        scannedPlayers: players.length,
        filters: { LIMIT, ONLY_IDS, MIN_PTS: TARGET_POINTS_MIN, RETRIES, TIMEOUT_MS, RETRY_DELAY_MS, IGNORE_FUTURE, VERBOSE },
        counts: { missing: results.length, aborted: aborted.length }
      };

      if (OUT_FORMATS.includes('json')) {
        const jsonPath = path.join(dir, `${OUT_BASENAME}-${finalStamp}.json`);
        const payload = { meta, results, aborted };
        fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
        console.log(`[report] wrote ${jsonPath}`);
      }

      if (OUT_FORMATS.includes('md') || OUT_FORMATS.includes('markdown')) {
  const mdPath = path.join(dir, `${OUT_BASENAME}-${finalStamp}.md`);
        const lines: string[] = [];
        lines.push(`# Missing Seasons Report`);
        lines.push('');
        lines.push(`- Generated: ${meta.generatedAt}`);
        lines.push(`- Scanned players: ${meta.scannedPlayers}`);
        lines.push(`- Missing entries: ${meta.counts.missing}`);
        lines.push(`- Aborted: ${meta.counts.aborted}`);
        lines.push('');
        lines.push(`## Filters`);
        lines.push('');
        lines.push(`- LIMIT: ${LIMIT || 'none'}`);
        lines.push(`- ONLY_IDS: ${ONLY_IDS || 'none'}`);
        lines.push(`- MIN_PTS: ${TARGET_POINTS_MIN}`);
        lines.push(`- IGNORE_FUTURE: ${IGNORE_FUTURE}`);
        lines.push(`- RETRIES: ${RETRIES}`);
        lines.push(`- TIMEOUT_MS: ${TIMEOUT_MS}`);
        lines.push(`- RETRY_DELAY_MS: ${RETRY_DELAY_MS}`);
        lines.push('');
        if (results.length) {
          lines.push('## Summary');
          lines.push('');
          lines.push('| Player | ID | Present/Expected | Missing |');
          lines.push('|---|---:|---:|---|');
          for (const r of results) {
            lines.push(`| ${r.name} | ${r.id} | ${r.present}/${r.expected} | ${r.missing.join(', ')} |`);
          }
          lines.push('');
          lines.push('## Suggested fetch commands');
          lines.push('');
          lines.push('These are for Regular Season only with SKIP_EXISTING=0:');
          lines.push('');
          for (const r of results) {
            const years = r.missing.map(s => s.slice(0,4));
            const minYear = Math.min(...years.map(Number));
            const maxYear = Math.max(...years.map(Number));
            lines.push(`- IDS=${r.id} FROM_YEAR=${minYear} TO_YEAR=${maxYear} ONLY_REGULAR=1 SKIP_EXISTING=0`);
          }
          lines.push('');
        } else {
          lines.push('No missing (non-future) seasons detected for scanned players.');
          lines.push('');
        }
        if (aborted.length) {
          lines.push('## Aborted lookups');
          lines.push('');
          for (const a of aborted) {
            lines.push(`- ${a.name} (${a.id}): ${a.reason}`);
          }
          lines.push('');
        }
        fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');
        console.log(`[report] wrote ${mdPath}`);
      }
    } catch (e) {
      console.warn('[report] failed to write reports:', (e as Error).message);
    }
  }

  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
