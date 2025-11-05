// NOTE: Legacy FS loader kept for offline viewing of precomputed JSON.
// New runtime uses SQLite via beforeAgeSqlite.ts. Firestore is removed.
import fs from "node:fs";
import path from "node:path";

export type Metric = "points" | "rebounds" | "assists" | "steals";

export type BeforeAgeRow = { playerId: string; value: number; player?: { id: string; full_name: string; birthday: string | null; active?: boolean | null } | null };
export type BeforeAgeData = {
  age: number;
  metric: Metric;
  includesBirthday: boolean;
  excludePlayoffs: boolean;
  definition: string;
  top25: BeforeAgeRow[];
  updatedAt: string | null;
};

// --- Module-level caches to mitigate Firestore read bursts ---
function getTtlMs() {
  // Allow disabling cache in dev or via env
  if (String(process.env.BYPASS_LEADERBOARD_CACHE || process.env.BYPASS_CACHE || '0') === '1') return 0;
  // In FS-mode or when Firestore is disabled, prefer always-fresh reads during dev
  const preferFs = String(process.env.LEADERBOARD_SOURCE || '').toLowerCase().includes('fs')
    || String(process.env.FIRESTORE_DISABLED || '0') === '1';
  if (preferFs) return 0;
  const fromEnv = Number(process.env.LEADERBOARD_CACHE_MS || NaN);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) return fromEnv;
  // Default: shorter TTL in dev, longer in prod
  return process.env.NODE_ENV === 'production' ? 5 * 60 * 1000 : 30 * 1000;
}
type CacheEntry<T> = { value: T; expiresAt: number };

const leaderboardCache = new Map<string, CacheEntry<BeforeAgeData>>();
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
      const isActive = parts[4] !== undefined ? parts[4] === '1' || parts[4].toLowerCase() === 'true' : undefined;
      if (id && full) m.set(id, { id, full_name: full, active: isActive });
    }
  } catch {
    // ignore
  }
  playersCsvIndex = m;
  return m;
}

type RawLeaderboard = {
  age?: number | string;
  metric?: string;
  includesBirthday?: boolean;
  excludePlayoffs?: boolean;
  definition?: string;
  top25?: Array<{ playerId: string | number; value: number; name?: string }>
  updatedAt?: string | number;
} | null;

function readFsLeaderboard(key: string): BeforeAgeData | null {
  try {
    const dir = path.resolve(process.cwd(), "data", "cache", "leaderboards");
    const file = path.join(dir, `${key}.json`);
    if (!fs.existsSync(file)) return null;
    const txt = fs.readFileSync(file, "utf8");
    let parsed: unknown = null;
    try { parsed = JSON.parse(txt); } catch { return null; }
    const raw = parsed as RawLeaderboard;
    if (!raw || !Array.isArray(raw.top25)) return null;
    return {
      age: Number(raw.age ?? 0),
      metric: String(raw.metric || "points") as Metric,
      includesBirthday: Boolean(raw.includesBirthday),
      excludePlayoffs: Boolean(raw.excludePlayoffs),
      definition: typeof raw.definition === "string" ? raw.definition : "",
      top25: raw.top25.map(r => ({ playerId: String(r.playerId), value: Number(r.value) || 0, player: undefined })),
      updatedAt: raw.updatedAt !== undefined ? String(raw.updatedAt) : null,
    };
  } catch {
    return null;
  }
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
  if (ttlMs <= 0) return; // skip caching
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function getPlayerInfo(playerId: string): Promise<{ id: string; full_name: string; birthday: string | null; active?: boolean | null } | null> {
  const cached = getFromCache(playerCache, playerId);
  if (cached !== null) return cached;

  const preferCsv = true; // Firestore removed; only CSV/FS fallback remains

  if (preferCsv) {
  const csv = loadPlayersCsvOnce().get(String(playerId));
  const val = csv ? { id: csv.id, full_name: csv.full_name, birthday: null, active: csv.active ?? null } : null;
    setInCache(playerCache, playerId, val);
    return val;
  }

  // Firestore path removed; read from CSV only

  const csv = loadPlayersCsvOnce().get(String(playerId));
  const val = csv ? { id: csv.id, full_name: csv.full_name, birthday: null, active: csv.active ?? null } : null;
  setInCache(playerCache, playerId, val);
  return val;
}

export async function getBeforeAge(metric: Metric, age: number, includePlayoffs = false): Promise<BeforeAgeData | null> {
  const metricKey = `${metric}BeforeAge_${age}`; // e.g., pointsBeforeAge_21
  const key = includePlayoffs ? `${metricKey}_ALL` : metricKey;

  // Serve from cache if fresh
  const cached = getFromCache(leaderboardCache, key);
  if (cached) return cached;

  const preferFs = true; // Firestore removed

  let rawDoc: Record<string, unknown> | null = null;
  if (preferFs) {
    const fromFs = readFsLeaderboard(key) || (includePlayoffs ? readFsLeaderboard(metricKey) : null);
    if (fromFs) {
      rawDoc = fromFs as unknown as Record<string, unknown>;
    }
  }

  // Firestore removed; no remote fetch

  if (!rawDoc) return null;

  const raw = rawDoc;
  const top = Array.isArray(raw.top25) ? (raw.top25 as Array<{ playerId: string; value: number; name?: string | null }>) : [];

  // Enrich with player info using cache + CSV fallback
  const enriched = await Promise.all(
    top.map(async (row) => {
      const id = String(row.playerId);
      const info = await getPlayerInfo(id);
  if (row.name) {
        // Merge provided name with canonical info to keep active/birthday
        return { ...row, player: info ? { ...info, full_name: row.name } : { id, full_name: row.name, birthday: null, active: null } };
      }
      return { ...row, player: info };
    })
  );

  const result: BeforeAgeData = {
    age: Number((raw.age as number | string | undefined) ?? 0),
    metric: metric as Metric,
    includesBirthday: raw.includesBirthday === true,
    excludePlayoffs: raw.excludePlayoffs === true,
    definition:
      typeof raw.definition === "string"
        ? raw.definition
        : "All players (active + retired). Regular Season only. Includes games on the birthday (<= cutoff age). Excludes playoffs.",
    top25: enriched,
    updatedAt: (raw.updatedAt as string | number | undefined) ? String(raw.updatedAt) : null,
  };

  setInCache(leaderboardCache, key, result);
  return result;
}
