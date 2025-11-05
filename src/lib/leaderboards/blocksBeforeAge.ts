// NOTE: Legacy FS loader. Runtime has moved to SQLite. Firestore removed.
import fs from "node:fs";
import path from "node:path";

export type BlocksBeforeAgeRow = { playerId: string; blocks: number; player?: { id: string; full_name: string; birthday: string | null; active?: boolean | null } | null };
export type BlocksBeforeAgeData = {
  age: number;
  includesBirthday: boolean;
  excludePlayoffs: boolean;
  definition: string;
  top25: BlocksBeforeAgeRow[];
  updatedAt: string | null;
};

type RawBlocksLeaderboard = {
  age?: number | string;
  includesBirthday?: boolean;
  excludePlayoffs?: boolean;
  definition?: string;
  top25?: Array<{ playerId: string | number; blocks: number; name?: string }>;
  updatedAt?: string | number;
} | null;

// --- Module-level caches to mitigate Firestore read bursts ---
function getTtlMs() {
  if (String(process.env.BYPASS_LEADERBOARD_CACHE || process.env.BYPASS_CACHE || '0') === '1') return 0;
  const fromEnv = Number(process.env.LEADERBOARD_CACHE_MS || NaN);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) return fromEnv;
  return process.env.NODE_ENV === 'production' ? 5 * 60 * 1000 : 30 * 1000;
}
type CacheEntry<T> = { value: T; expiresAt: number };

const leaderboardCache = new Map<string, CacheEntry<BlocksBeforeAgeData>>();
const playerCache = new Map<string, CacheEntry<{ id: string; full_name: string; birthday: string | null; active?: boolean | null } | null>>();

let playersCsvIndex: Map<string, { id: string; full_name: string; active?: boolean | null }> | null = null;
function loadPlayersCsvOnce(): Map<string, { id: string; full_name: string; active?: boolean | null }> {
  if (playersCsvIndex) return playersCsvIndex;
  const m = new Map<string, { id: string; full_name: string; active?: boolean | null }>();
  try {
    const file = path.resolve(process.cwd(), "data", "players.csv");
    if (!fs.existsSync(file)) {
      playersCsvIndex = m;
      return m;
    }
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    // header: id,full_name,first_name,last_name,is_active
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const parts = line.split(",");
      const id = parts[0];
      const full = parts[1];
      const isActive = parts[4] !== undefined ? (parts[4] === '1' || parts[4].toLowerCase() === 'true') : undefined;
      if (id && full) m.set(id, { id, full_name: full, active: isActive });
    }
  } catch {
    // ignore
  }
  playersCsvIndex = m;
  return m;
}

function getFromCache<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function setInCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs = getTtlMs()) {
  if (ttlMs <= 0) return;
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function getPlayerInfo(playerId: string): Promise<{ id: string; full_name: string; birthday: string | null; active?: boolean | null } | null> {
  const cached = getFromCache(playerCache, playerId);
  if (cached !== null) return cached;

  // Firestore path removed; read from CSV only

  const csv = loadPlayersCsvOnce().get(String(playerId));
  const val = csv ? { id: csv.id, full_name: csv.full_name, birthday: null, active: csv.active ?? null } : null;
  setInCache(playerCache, playerId, val);
  return val;
}

function readFsLeaderboard(key: string): BlocksBeforeAgeData | null {
  try {
    const dir = path.resolve(process.cwd(), "data", "cache", "leaderboards");
    const file = path.join(dir, `${key}.json`);
    if (!fs.existsSync(file)) return null;
    const txt = fs.readFileSync(file, "utf8");
    let parsed: unknown = null;
    try { parsed = JSON.parse(txt); } catch { return null; }
    const raw = parsed as RawBlocksLeaderboard;
    if (!raw || !Array.isArray(raw.top25)) return null;
    const top = raw.top25 as Array<{ playerId: string | number; blocks: number; name?: string }>;
    return {
      age: Number(raw.age ?? 0),
      includesBirthday: Boolean(raw.includesBirthday),
      excludePlayoffs: Boolean(raw.excludePlayoffs),
      definition: typeof raw.definition === 'string' ? raw.definition : '',
      top25: top.map(r => ({ playerId: String(r.playerId), blocks: Number(r.blocks) || 0, player: undefined })),
      updatedAt: raw.updatedAt !== undefined ? String(raw.updatedAt) : null,
    };
  } catch {
    return null;
  }
}

export async function getBlocksBeforeAge(age: number, includePlayoffs = false): Promise<BlocksBeforeAgeData | null> {
  const baseKey = `blocksBeforeAge_${age}`;
  const key = includePlayoffs ? `${baseKey}_ALL` : baseKey;

  // Serve from cache if fresh
  const cached = getFromCache(leaderboardCache, key);
  if (cached) return cached;

  let raw: RawBlocksLeaderboard = null;
  {
    const fromFs = readFsLeaderboard(key) || (includePlayoffs ? readFsLeaderboard(baseKey) : null);
    if (fromFs) {
      raw = {
        age: fromFs.age,
        includesBirthday: fromFs.includesBirthday,
        excludePlayoffs: fromFs.excludePlayoffs,
        definition: fromFs.definition,
        updatedAt: fromFs.updatedAt ?? undefined,
        top25: fromFs.top25.map(r => ({ playerId: r.playerId, blocks: r.blocks })),
      };
    }
  }

  // Firestore removed; no remote fetch

  if (!raw) return null;

  const top = Array.isArray(raw.top25) ? (raw.top25 as Array<{ playerId: string | number; blocks: number; name?: string }>) : [];

  // Enrich with player info using cache + CSV fallback
  const enriched = await Promise.all(
    top.map(async (row) => {
      const id = String(row.playerId);
      const info = await getPlayerInfo(id);
      if (row.name) {
        return { playerId: id, blocks: Number(row.blocks || 0), player: info ? { ...info, full_name: row.name } : { id, full_name: row.name, birthday: null, active: null } } as BlocksBeforeAgeRow;
      }
      return { playerId: id, blocks: Number(row.blocks || 0), player: info } as BlocksBeforeAgeRow;
    })
  );

  const result: BlocksBeforeAgeData = {
    age: Number((raw?.age as number | string | undefined) ?? 0),
    includesBirthday: raw?.includesBirthday === true,
    excludePlayoffs: raw?.excludePlayoffs === true,
    definition:
      typeof raw?.definition === "string"
        ? (raw?.definition as string)
        : "All players (active + retired). Regular Season only. Includes games on the birthday (<= cutoff age). Excludes playoffs.",
    top25: enriched,
    updatedAt: (raw?.updatedAt as string | number | undefined) ? String(raw?.updatedAt) : null,
  };

  setInCache(leaderboardCache, key, result);
  return result;
}
