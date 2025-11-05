import fs from 'node:fs';
import path from 'node:path';
import { openSqlite, ensureCoreSchema, dbAll, dbRun } from '../src/lib/sqlite';

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

async function upsertPlayer(db: ReturnType<typeof openSqlite>, id: string, fullName: string, birthdate?: string | null, isActive?: number | null) {
  await dbRun(db, `INSERT INTO players(id, full_name, is_active, birthdate)
    VALUES(?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET full_name = COALESCE(excluded.full_name, players.full_name),
      is_active = COALESCE(excluded.is_active, players.is_active),
      birthdate = COALESCE(excluded.birthdate, players.birthdate)`,
    [id, fullName, isActive ?? null, birthdate ?? null]);
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

function normalizeName(n: string) {
  return n
    .replace(/[’‘ʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function resolvePlayerByNameFromNba(name: string): Promise<{ id: string; full_name: string } | null> {
  // Try current season list first for speed; then fall back to all-time roster
  const season = process.env.NBA_LOOKUP_SEASON || '2024-25';
  const urls = [
    `https://stats.nba.com/stats/commonallplayers?LeagueID=00&Season=${encodeURIComponent(season)}&IsOnlyCurrentSeason=1`,
    `https://stats.nba.com/stats/commonallplayers?LeagueID=00&Season=All+Time&IsOnlyCurrentSeason=0`,
  ];
  const key = normalizeName(name);
  for (const url of urls) {
    try {
      const json = await fetchJson(url);
      const rs = json?.resultSets?.[0] ?? json?.resultSet;
      const headers: string[] = rs?.headers ?? [];
      const rows: any[][] = rs?.rowSet ?? [];
      const idx: Record<string, number> = Object.fromEntries(headers.map((h: string, i: number) => [h, i]));
      for (const r of rows) {
        const full = String(r[idx.DISPLAY_FIRST_LAST] ?? r[idx.PLAYER] ?? '').trim();
        if (!full) continue;
        if (normalizeName(full) === key) {
          const id = String(r[idx.PERSON_ID] ?? r[idx.PERSON_ID] ?? '');
          if (id) return { id, full_name: full };
        }
      }
    } catch (e) {
      console.warn('NBA name lookup failed for', name, (e as Error).message);
    }
  }
  return null;
}

function loadCsvPlayersIndex(): Map<string, { id: string; full_name: string; is_active?: boolean }> {
  const file = path.resolve(process.cwd(), 'data', 'players.csv');
  const map = new Map<string, { id: string; full_name: string; is_active?: boolean }>();
  if (!fs.existsSync(file)) return map;
  const text = fs.readFileSync(file, 'utf8');
  const [header, ...lines] = text.split(/\r?\n/).filter(Boolean);
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
    const key = normalizeName(full);
    const is_active = activeRaw ? activeRaw === '1' || activeRaw.toLowerCase() === 'true' : undefined;
    map.set(key, { id, full_name: full, is_active });
  }
  return map;
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

async function alreadyFetched(db: ReturnType<typeof openSqlite>, playerId: string, opts: { onlyRegular?: boolean; onlyPlayoffs?: boolean }) {
  if (opts.onlyPlayoffs) {
    const rows = await dbAll<{ c: number }>(db, 'SELECT COUNT(1) as c FROM player_stats WHERE player_id = ? AND season_type = "Playoffs"', [playerId]);
    return (rows?.[0]?.c ?? 0) > 0;
  }
  if (opts.onlyRegular) {
    const rows = await dbAll<{ c: number }>(db, 'SELECT COUNT(1) as c FROM player_stats WHERE player_id = ? AND season_type = "Regular Season"', [playerId]);
    return (rows?.[0]?.c ?? 0) > 0;
  }
  const rows = await dbAll<{ c: number }>(db, 'SELECT COUNT(1) as c FROM player_stats WHERE player_id = ?', [playerId]);
  return (rows?.[0]?.c ?? 0) > 0;
}

async function fetchPlayer(db: ReturnType<typeof openSqlite>, playerId: string, playerName: string, options: { delayMs: number; onlyRegular?: boolean; onlyPlayoffs?: boolean; fromYear?: number; toYear?: number }) {
  const seasons = await getSeasonsForPlayer(playerId);
  const filtered = seasons.filter((s) => {
    const y = parseInt(String(s).slice(0, 4), 10);
    if (options.fromYear && y < options.fromYear) return false;
    if (options.toYear && y > options.toYear) return false;
    return true;
  });
  const types: SeasonType[] = options.onlyPlayoffs ? ['Playoffs'] : options.onlyRegular ? ['Regular Season'] : ['Regular Season', 'Playoffs'];
  for (const s of filtered) {
    for (const t of types) {
      try {
        const games = await fetchPlayerGameLog(playerId, s, t);
        await upsertGames(db, playerId, s, t, games);
        await sleep(options.delayMs);
        console.log(`Saved ${games.length} logs for ${playerId} ${playerName} ${s} ${t}`);
      } catch (e) {
        console.warn(`Failed ${playerId} ${playerName} ${s} ${t}:`, (e as Error).message);
      }
    }
  }
}

async function main() {
  const ONLY_REGULAR = process.env.ONLY_REGULAR === '1';
  const ONLY_PLAYOFFS = process.env.ONLY_PLAYOFFS === '1';
  const DELAY_MS = Number(process.env.DELAY_MS || '800');
  const BETWEEN_PLAYERS_MS = Number(process.env.BETWEEN_PLAYERS_MS || '1000');
  const FROM_YEAR = Number(process.env.FROM_YEAR || '0') || undefined;
  const TO_YEAR = Number(process.env.TO_YEAR || '0') || undefined;
  const LIMIT = Number(process.env.LIMIT || '0') || undefined;
  const START_FROM = Number(process.env.START_FROM || '0') || 0;

  const db = openSqlite();
  await ensureCoreSchema(db);
  const csvIdx = loadCsvPlayersIndex();
  const bdays = loadBirthdays();

  // Provided list (mixed active/retired). We'll filter by is_active from CSV.
  const baseNames: string[] = [
    'LeBron James',
    'Stephen Curry',
    'James Harden',
    'Russell Westbrook',
    'Chris Paul',
    'Kareem Abdul-Jabbar',
    'Karl Malone',
    'Kobe Bryant',
    'Michael Jordan',
    'Dirk Nowitzki',
    'Wilt Chamberlain',
    'Shaquille O\'Neal',
    'Carmelo Anthony',
    'Moses Malone',
    'Elvin Hayes',
    'Hakeem Olajuwon',
    'Oscar Robertson',
    'Dominique Wilkins',
    'Tim Duncan',
    'Paul Pierce',
    'John Havlicek',
    'Kevin Garnett',
    'Vince Carter',
    'Alex English',
    'DeMar DeRozan',
    'John Stockton',
    'Jason Kidd',
    'Steve Nash',
    'Mark Jackson',
    'Magic Johnson',
    'Isiah Thomas',
    'Gary Payton',
    'Andre Miller',
    'Rod Strickland',
    'Rajon Rondo',
    'Maurice Cheeks',
    'Lenny Wilkens',
    'Terry Porter',
    'Tim Hardaway',
    'Tony Parker',
    'Bob Cousy',
    'Guy Rodgers',
    'Deron Williams',
    'Muggsy Bogues',
    'Bill Russell',
    'Robert Parish',
    'Nate Thurmond',
    'Walt Bellamy',
    'Wes Unseld',
    'Buck Williams',
    'Jerry Lucas',
    'Bob Pettit',
    'Charles Barkley',
    'Dikembe Mutombo',
    'Mark Eaton',
    'David Robinson',
    'Patrick Ewing',
    'Tree Rollins',
    'Alonzo Mourning',
    'Marcus Camby',
    'Dwight Howard',
    'Ben Wallace',
    'Shawn Bradley',
    'Manute Bol',
    'George Johnson',
    'Larry Nance',
    'Theo Ratliff',
    'Pau Gasol',
    'Brook Lopez',
    'Elton Brand',
    'Jermaine O\'Neal',
  ];
  // Additional requested names
  const additional: string[] = [
    'Fat Lever',
    'Grant Hill',
    'Clyde Drexler',
    'Walt Frazier',
    'Micheal Ray Richardson',
    'Chris Webber',
    'Kyle Lowry',
    'George B. Johnson',
    'George Gervin',
    'Julius Erving',
    'Derrick Coleman',
    'Vlade Divac',
    'Carmelo Anthony',
    'Jerry West',
    'Allen Iverson',
    'Elgin Baylor',
    'Dominique Wilkins',
  ];

  // Allow adding names via env or file
  const extraFromEnv = (process.env.EXTRA_NAMES || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const namesFile = process.env.NAMES_FILE ? path.resolve(process.cwd(), String(process.env.NAMES_FILE)) : '';
  const extraFromFile: string[] = namesFile && fs.existsSync(namesFile)
    ? fs.readFileSync(namesFile, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : [];

  const ONLY_EXTRA = process.env.ONLY_EXTRA === '1';
  const names = ONLY_EXTRA ? [...extraFromEnv, ...extraFromFile] : [...baseNames, ...additional, ...extraFromEnv, ...extraFromFile];
  const normalized = names.map((n) => ({ name: n, key: normalizeName(n) }));
  const mapped = await Promise.all(normalized.map(async (n) => {
    const csv = csvIdx.get(n.key) || null;
    if (csv) return { ...n, csv, resolved: null as null | { id: string; full_name: string } };
    // Fallback: try NBA lookup for actives not present in CSV (e.g., recent rookies)
    const resolved = await resolvePlayerByNameFromNba(n.name);
    return { ...n, csv: null as any, resolved };
  }));

  const withIds = mapped
    .filter((m) => m.csv || m.resolved)
    .map((m) => ({
      id: String((m.csv?.id as string) || m.resolved!.id),
      full_name: (m.csv?.full_name as string) || m.resolved!.full_name,
      is_active: m.csv?.is_active ?? true, // resolved from NBA API implies active
    }));

  const INCLUDE_ACTIVE = process.env.INCLUDE_ACTIVE === '1';
  const candidates = INCLUDE_ACTIVE ? withIds : withIds.filter((p) => p.is_active === false);

  // Apply pagination controls
  const slice = LIMIT ? candidates.slice(START_FROM, START_FROM + LIMIT) : candidates.slice(START_FROM);

  console.log(`Mapped IDs: ${withIds.length} | Selected: ${candidates.length} (INCLUDE_ACTIVE=${INCLUDE_ACTIVE ? '1' : '0'}) | Processing: ${slice.length}`);

  for (let i = 0; i < slice.length; i++) {
  const p = slice[i];
  const already = await alreadyFetched(db, p.id, { onlyRegular: ONLY_REGULAR, onlyPlayoffs: ONLY_PLAYOFFS });
    if (already) {
      console.log(`Skip existing ${p.full_name} (${p.id})`);
      continue;
    }
  const b = bdays.get(p.id) ?? null;
  const isActiveNum = p.is_active == null ? null : (p.is_active ? 1 : 0);
  await upsertPlayer(db, p.id, p.full_name, b, isActiveNum);
    try {
      await fetchPlayer(db, p.id, p.full_name, {
        delayMs: DELAY_MS,
        onlyRegular: ONLY_REGULAR,
        onlyPlayoffs: ONLY_PLAYOFFS,
        fromYear: FROM_YEAR,
        toYear: TO_YEAR,
      });
    } catch (e) {
      console.warn(`Failed fetch for ${p.full_name} (${p.id}):`, (e as Error).message);
    }
    // Delay between players with small jitter
    const jitter = Math.floor(Math.random() * 400);
    await sleep(BETWEEN_PLAYERS_MS + jitter);
  }

  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
