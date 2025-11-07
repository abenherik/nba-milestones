/**
 * NBA API utilities for fetching live game data
 */

const NBA_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.nba.com',
  'Referer': 'https://www.nba.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

async function fetchJson(url: string, timeoutMs = 8000, retries = 2, retryDelayMs = 500) {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { headers: NBA_HEADERS, signal: ctrl.signal });
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

export type SeasonType = 'Regular Season' | 'Playoffs';

export interface NBAGameLog {
  SEASON_ID: string;
  Player_ID: string;
  Game_ID: string;
  GAME_DATE: string;
  MATCHUP: string;
  WL?: string;
  MIN?: number;
  PTS?: number;
  FGM?: number;
  FGA?: number;
  FG_PCT?: number;
  FG3M?: number;
  FG3A?: number;
  FG3_PCT?: number;
  FTM?: number;
  FTA?: number;
  FT_PCT?: number;
  OREB?: number;
  DREB?: number;
  REB?: number;
  AST?: number;
  STL?: number;
  BLK?: number;
  TOV?: number;
  PF?: number;
  PLUS_MINUS?: number;
  [key: string]: any;
}

/**
 * Get the current NBA season string (e.g., "2024-25")
 */
export function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  
  // NBA season starts in October (month 10)
  // If we're in Jan-Sep, we're in the season that started last year
  // If we're in Oct-Dec, we're in the season starting this year
  const seasonStart = month >= 10 ? year : year - 1;
  return seasonString(seasonStart);
}

/**
 * Fetch game logs for a player for a specific season
 */
export async function fetchPlayerGameLog(
  playerId: string,
  season: string,
  seasonType: SeasonType = 'Regular Season'
): Promise<NBAGameLog[]> {
  const params = new URLSearchParams({ 
    PlayerID: playerId, 
    Season: season, 
    SeasonType: seasonType 
  });
  const url = `https://stats.nba.com/stats/playergamelog?${params.toString()}`;
  
  try {
    const json = await fetchJson(url);
    const rs = json?.resultSets?.[0] ?? json?.resultSet;
    if (!rs) return [];
    
    const headers: string[] = rs.headers ?? [];
    const rows: any[][] = rs.rowSet ?? [];
    
    return rows.map(r => 
      Object.fromEntries(headers.map((h, i) => [h, r[i]]))
    ) as NBAGameLog[];
  } catch (err) {
    console.error(`Failed to fetch game logs for player ${playerId}, season ${season}:`, err);
    return [];
  }
}

/**
 * Get all seasons a player has played
 */
export async function getPlayerSeasons(playerId: string): Promise<string[]> {
  const url = `https://stats.nba.com/stats/commonplayerinfo?PlayerID=${playerId}`;
  
  try {
    const json = await fetchJson(url);
    const resultSets = json?.resultSets ?? json?.resultSet ?? [];
    const rows = (resultSets[0]?.rowSet ?? []) as any[];
    
    if (!rows.length) return [];
    
    const headers = resultSets[0]?.headers ?? [];
    const mapRow = (row: any[]) => 
      Object.fromEntries(headers.map((h: string, i: number) => [h, row[i]]));
    
    const info = mapRow(rows[0]);
    const fromYear = Number(info.FROM_YEAR || info.from_year || 0) || 0;
    const toYear = Number(info.TO_YEAR || info.to_year || 0) || fromYear;
    
    const seasons: string[] = [];
    for (let y = fromYear; y <= toYear; y++) {
      seasons.push(seasonString(y));
    }
    
    return seasons;
  } catch (err) {
    console.error(`Failed to get seasons for player ${playerId}:`, err);
    return [];
  }
}

/**
 * Calculate age at game date
 */
export function calculateAgeAtGame(birthdate: string, gameDate: string): number | null {
  try {
    const birth = new Date(birthdate);
    const game = new Date(gameDate);
    
    if (isNaN(birth.getTime()) || isNaN(game.getTime())) {
      return null;
    }
    
    let age = game.getFullYear() - birth.getFullYear();
    const monthDiff = game.getMonth() - birth.getMonth();
    
    // If birthday hasn't occurred yet this year, subtract 1
    if (monthDiff < 0 || (monthDiff === 0 && game.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  } catch {
    return null;
  }
}
