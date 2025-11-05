import { playersCol } from '../src/lib/db';
import admin from 'firebase-admin';

// Use global fetch if available; else fallback to undici if installed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _fetch: any = (globalThis as any).fetch ?? undefined;

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

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

async function getFetch() {
  if (_fetch) return _fetch;
  const { fetch } = await import('undici');
  return fetch as typeof globalThis.fetch;
}

async function fetchJson(url: string, timeoutMs = 12000, retries = 4, retryDelayMs = 1000) {
  const fetchImpl = await getFetch();
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(url, { headers: NBA_HEADERS, signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) {
        if ((r.status === 429 || r.status === 403 || r.status >= 500) && attempt < retries) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }
        throw new Error(`HTTP ${r.status} for ${url}`);
      }
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (attempt < retries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function seasonString(yearStart: number) {
  const yy = (yearStart + 1).toString().slice(-2);
  return `${yearStart}-${yy}`;
}

async function getSeasonsForPlayer(playerId: string) {
  // Use commonplayerinfo to get from_year/to_year
  const url = `https://stats.nba.com/stats/commonplayerinfo?PlayerID=${playerId}`;
  const json = await fetchJson(url);
  const resultSets = json?.resultSets ?? json?.resultSet ?? [];
  const rows = (resultSets[0]?.rowSet ?? []) as any[];
  if (!rows.length) return [] as string[];
  const headers = resultSets[0]?.headers ?? [];
  const mapRow = (row: any[]) => Object.fromEntries(headers.map((h: string, i: number) => [h, row[i]]));
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
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
}

async function upsertLogs(playerId: string, season: string, seasonType: SeasonType, games: any[]) {
  const db = admin.firestore();
  const key = `${playerId}_${season}_${seasonType === 'Regular Season' ? 'REG' : 'POST'}`;
  await db.collection('playerGameLogs').doc(key).set({ playerId, season, seasonType, games, updatedAt: Date.now() }, { merge: true });
}

async function findPlayerId(nameOrId: string) {
  if (/^\d+$/.test(nameOrId)) return nameOrId;
  const snap = await playersCol().where('full_name', '==', nameOrId).limit(1).get();
  if (!snap.empty) return snap.docs[0].id;
  // Try legacy fields
  const legacy = await playersCol().where('name', '==', nameOrId).limit(1).get();
  if (!legacy.empty) return legacy.docs[0].id;
  throw new Error(`Player not found in Firestore: ${nameOrId}`);
}

async function main() {
  const target = process.env.PLAYER_ID || process.env.PLAYER_NAME || '1631094'; // Paolo default
  const playerId = await findPlayerId(String(target));
  let seasons = await getSeasonsForPlayer(playerId);
  // Optional limits to reduce load: FROM_YEAR/TO_YEAR to filter seasons
  const FROM_YEAR = Number(process.env.FROM_YEAR || '0');
  const TO_YEAR = Number(process.env.TO_YEAR || '0');
  if (FROM_YEAR || TO_YEAR) {
    seasons = seasons.filter((s) => {
      const y = parseInt(String(s).slice(0, 4), 10);
      if (!Number.isFinite(y)) return false;
      if (FROM_YEAR && y < FROM_YEAR) return false;
      if (TO_YEAR && y > TO_YEAR) return false;
      return true;
    });
  }
  if (!seasons.length) throw new Error(`No seasons found for ${playerId}`);
  const SKIP_EXISTING = process.env.SKIP_EXISTING === '1';
  const DELAY_MS = Number(process.env.DELAY_MS || '600');
  const ONLY_REGULAR = process.env.ONLY_REGULAR === '1';
  const ONLY_PLAYOFFS = process.env.ONLY_PLAYOFFS === '1';
  const db = admin.firestore();

  // Sequential to avoid rate limiting; short delay between requests
  for (const season of seasons) {
    const seasonTypes: SeasonType[] = ONLY_PLAYOFFS
      ? ['Playoffs']
      : ONLY_REGULAR
      ? ['Regular Season']
      : (['Regular Season', 'Playoffs'] as SeasonType[]);
    for (const type of seasonTypes) {
      try {
        if (SKIP_EXISTING) {
          const key = `${playerId}_${season}_${type === 'Regular Season' ? 'REG' : 'POST'}`;
          const existing = await db.collection('playerGameLogs').doc(key).get();
          if (existing.exists) {
            console.log(`Skip existing ${playerId} ${season} ${type}`);
            continue;
          }
        }
        const games = await fetchPlayerGameLog(playerId, season, type);
        await upsertLogs(playerId, season, type, games);
        await sleep(DELAY_MS); // polite delay
        console.log(`Saved ${games.length} logs for ${playerId} ${season} ${type}`);
      } catch (e) {
        console.warn(`Failed ${playerId} ${season} ${type}:`, (e as Error).message);
        // continue
      }
    }
  }
  console.log('Done');
}

main().catch(e => { console.error(e); process.exit(1); });
