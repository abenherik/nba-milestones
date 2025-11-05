// NOTE: Legacy FS loader. Replaced by totalsSqlite.ts for new UI routes. Firestore removed.
import fs from "node:fs";
import path from "node:path";

export type Metric = "points" | "rebounds" | "assists" | "steals";

export type TotalsRow = { playerId: string; value: number; player?: { id: string; full_name: string; active?: boolean | null } | null };
export type TotalsData = {
  metric: Metric;
  includePlayoffs: boolean;
  definition: string;
  top25: TotalsRow[];
  updatedAt: string | null;
};

type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<TotalsData>>();

function getTtlMs() {
  if (String(process.env.BYPASS_LEADERBOARD_CACHE || process.env.BYPASS_CACHE || '0') === '1') return 0;
  const fromEnv = Number(process.env.LEADERBOARD_CACHE_MS || NaN);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) return fromEnv;
  return process.env.NODE_ENV === 'production' ? 5 * 60 * 1000 : 30 * 1000;
}
function getFromCache<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = map.get(key as unknown as string);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { map.delete(key as unknown as string); return null; }
  return entry.value as unknown as T;
}
function setInCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs = getTtlMs()) {
  if (ttlMs <= 0) return; 
  map.set(key as unknown as string, { value, expiresAt: Date.now() + ttlMs } as CacheEntry<T>);
}

async function getPlayerInfo(playerId: string): Promise<{ id: string; full_name: string; active?: boolean | null } | null> {
  // Firestore removed; read from CSV only
  try {
    const file = path.resolve(process.cwd(), 'data', 'players.csv');
    if (fs.existsSync(file)) {
      const text = fs.readFileSync(file, 'utf8');
      const lines = text.split(/\r?\n/);
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts[0] === String(playerId)) return { id: parts[0], full_name: parts[1], active: null };
      }
    }
  } catch {}
  return null;
}

type RawTotals = { metric?: string; includePlayoffs?: boolean; definition?: string; updatedAt?: string | number; top25?: Array<{ playerId: string | number; value: number; name?: string }> } | null;
function readFsTotals(key: string): TotalsData | null {
  try {
    const dir = path.resolve(process.cwd(), 'data', 'cache', 'leaderboards');
    const file = path.join(dir, `${key}.json`);
    if (!fs.existsSync(file)) return null;
    const txt = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(txt) as RawTotals;
    if (!parsed || !Array.isArray(parsed.top25)) return null;
    return {
      metric: String(parsed.metric || 'points') as Metric,
      includePlayoffs: Boolean(parsed.includePlayoffs),
      definition: typeof parsed.definition === 'string' ? parsed.definition : '',
      top25: parsed.top25.map(r => ({ playerId: String(r.playerId), value: Number(r.value) || 0, player: undefined })),
      updatedAt: parsed.updatedAt !== undefined ? String(parsed.updatedAt) : null,
    };
  } catch { return null; }
}

export async function getTotals(metric: Metric, includePlayoffs = false): Promise<TotalsData | null> {
  const keyBase = `${metric}Totals`;
  const key = includePlayoffs ? `${keyBase}_ALL` : keyBase;

  const cached = getFromCache(cache, key);
  if (cached) return cached;

  const preferFs = true; // Firestore removed

  let rawDoc: Record<string, unknown> | null = null;
  if (preferFs) {
    const fromFs = readFsTotals(key) || (includePlayoffs ? readFsTotals(keyBase) : null);
    if (fromFs) rawDoc = fromFs as unknown as Record<string, unknown>;
  }
  // Firestore removed; no remote fetch
  if (!rawDoc) return null;

  const raw = rawDoc as { top25?: Array<{ playerId: string; value: number; name?: string }>; definition?: string; includePlayoffs?: boolean; updatedAt?: string | number };
  const top = Array.isArray(raw.top25) ? raw.top25 : [];
  const enriched = await Promise.all(top.map(async (row) => {
    const id = String(row.playerId);
    const info = await getPlayerInfo(id);
    if (row.name) return { ...row, player: info ? { ...info, full_name: row.name } : { id, full_name: row.name, active: null } };
    return { ...row, player: info };
  }));

  const result: TotalsData = {
    metric: metric as Metric,
    includePlayoffs: raw.includePlayoffs === true,
    definition: typeof raw.definition === 'string' ? raw.definition : 'All-time totals',
    top25: enriched,
    updatedAt: raw.updatedAt !== undefined ? String(raw.updatedAt) : null,
  };
  setInCache(cache, key, result);
  return result;
}
