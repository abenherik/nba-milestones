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

async function fetchJson(url: string, timeoutMs = 12000, retries = 4, retryDelayMs = 1100) {
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
      if (i < retries) { await sleep(retryDelayMs * (i + 1)); continue; }
      throw e;
    }
  }
  throw err;
}

function seasonString(yearStart: number) {
  const yy = (yearStart + 1).toString().slice(-2);
  return `${yearStart}-${yy}`;
}

async function getSeasonsForPlayer(playerId: string) {
  const url = `https://stats.nba.com/stats/commonplayerinfo?PlayerID=${playerId}`;
  const json = await fetchJson(url);
  const rs = json?.resultSets?.[0] ?? json?.resultSet;
  const headers: string[] = rs?.headers ?? [];
  const rows: any[][] = rs?.rowSet ?? [];
  if (!rows.length) return [] as string[];
  const mapRow = (r: any[]) => Object.fromEntries(headers.map((h, i) => [h, r[i]]));
  const info = mapRow(rows[0]);
  const fromYear = Number(info.FROM_YEAR || info.from_year || 0) || 0;
  const toYear = Number(info.TO_YEAR || info.to_year || 0) || fromYear;
  const seasons: string[] = [];
  for (let y = fromYear; y <= toYear; y++) seasons.push(seasonString(y));
  return seasons;
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

async function upsertPlayer(db: ReturnType<typeof openSqlite>, id: string, fullName: string, birthdate?: string | null) {
  await dbRun(db, `INSERT INTO players(id, full_name, is_active, birthdate)
    VALUES(?, ?, NULL, ?)
    ON CONFLICT(id) DO UPDATE SET full_name = COALESCE(excluded.full_name, players.full_name), birthdate = COALESCE(excluded.birthdate, players.birthdate)`,
    [id, fullName, birthdate ?? null]);
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

async function main() {
  const playerId = String(process.env.PLAYER_ID || process.env.PLAYER || '1631094'); // Paolo default
  const playerName = process.env.PLAYER_NAME || 'Paolo Banchero';
  const birth = process.env.BIRTHDATE || null;
  const ONLY_REGULAR = process.env.ONLY_REGULAR === '1';
  const ONLY_PLAYOFFS = process.env.ONLY_PLAYOFFS === '1';
  const DELAY_MS = Number(process.env.DELAY_MS || '700');
  const FROM_YEAR = Number(process.env.FROM_YEAR || '0');
  const TO_YEAR = Number(process.env.TO_YEAR || '0');

  const db = openSqlite();
  await ensureCoreSchema(db);
  await upsertPlayer(db, playerId, playerName, birth);

  let seasons = await getSeasonsForPlayer(playerId);
  if (FROM_YEAR || TO_YEAR) {
    seasons = seasons.filter((s) => {
      const y = parseInt(String(s).slice(0, 4), 10);
      if (!Number.isFinite(y)) return false;
      if (FROM_YEAR && y < FROM_YEAR) return false;
      if (TO_YEAR && y > TO_YEAR) return false;
      return true;
    });
  }
  if (!seasons.length) throw new Error('No seasons');

  for (const s of seasons) {
    const types: SeasonType[] = ONLY_PLAYOFFS ? ['Playoffs'] : ONLY_REGULAR ? ['Regular Season'] : ['Regular Season', 'Playoffs'];
    for (const t of types) {
      try {
        const games = await fetchPlayerGameLog(playerId, s, t);
        await upsertGames(db, playerId, s, t, games);
        await sleep(DELAY_MS);
        console.log(`Saved ${games.length} logs for ${playerId} ${s} ${t}`);
      } catch (e) {
        console.warn(`Failed ${playerId} ${s} ${t}:`, (e as Error).message);
      }
    }
  }
  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
