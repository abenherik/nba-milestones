import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { openDatabase, dbAll, closeDatabase, setForcePrimaryReads, ensureCoreSchemaOnce, type DatabaseConnection } from '@/lib/database';
import { getBeforeAgeSqlite, type Metric } from '@/lib/leaderboards/beforeAgeSqlite';
import { getMilestoneGamesBeforeAge, type MilestoneQuery } from '@/lib/leaderboards/milestoneGames';
import { currentSlicesVersion, presetKey, readSlicesTop25Batch, writeSliceTop25, type SeasonGroup } from '@/lib/slices';
import { perfMonitor, timeQuery } from '@/lib/performance';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

// Aggressive in-memory cache for milestone responses to reduce DB reads
type CacheEntry = { data: any; timestamp: number; headers: Record<string, string> };
const milestonesCache = new Map<string, CacheEntry>();
const CACHE_TTL = 21600000; // 6 hours cache (allows twice-daily checks)
const MAX_CACHE_SIZE = 1000; // Limit cache to 1000 entries

function getCacheKey(playerId: string, view: string | undefined, includePlayoffs: boolean, ageCount: number): string {
  return `${playerId}:${view || 'default'}:${includePlayoffs ? 'pl' : 'rs'}:${ageCount}`;
}

function cleanupCache() {
  if (milestonesCache.size > MAX_CACHE_SIZE) {
    const now = Date.now();
    // Remove expired entries
    for (const [key, entry] of milestonesCache.entries()) {
      if (now - entry.timestamp > CACHE_TTL) {
        milestonesCache.delete(key);
      }
    }
    // If still too large, remove oldest entries
    if (milestonesCache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(milestonesCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, milestonesCache.size - MAX_CACHE_SIZE);
      toRemove.forEach(([key]) => milestonesCache.delete(key));
    }
  }
}

// Simple placeholder computation; refine with real thresholds later
const ALL_TIME_TOP10 = {
  points: [40000, 38000, 37000, 36000, 35000, 34000, 33000, 32000, 31000, 30000],
  rebounds: [24000, 23000, 22000, 21000, 20000, 19000, 18000, 17000, 16000, 15000],
  assists: [16000, 15000, 14000, 13000, 12000, 11000, 10000, 9000, 8000, 7000],
  threesMade: [3500, 3400, 3300, 3200, 3100, 3000, 2900, 2800, 2700, 2600],
};

// Type definitions

function distanceToTop10(total: number, thresholds: number[]) {
  const target = thresholds[thresholds.length - 1]; // 10th place threshold
  return Math.max(0, target - total);
}

// Local helpers (step 1: rank-only queries)
// Removed legacy SQL helpers; we rely on slices + higher-level helpers.

// Removed old rank-by-scan helpers; using slices-based approach for performance.

// Removed legacy SQL where-clause builder used in older milestone rank scans.

// Removed old milestone rank helper; using slices-based approach for performance.

// Step 3: Batch ranks across multiple ages in a single query per metric/preset
// Removed old batch rank helper; using slices-based approach for performance.

// Removed old milestone batch rank helper; using slices-based approach for performance.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const playerId: string | null = searchParams.get('playerId');
  if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 });
  
  // Check if client wants to force primary database read (bypasses replica lag AND cache)
  const forcePrimary = searchParams.get('forcePrimary') === 'true';
  
  const view = searchParams.get('view') || undefined;
  const includePlayoffsParam = searchParams.get('includePlayoffs');
  const ageCountParam = searchParams.get('ageCount');
  const includePlayoffs = includePlayoffsParam === '1' || includePlayoffsParam === 'true';
  const ageCount = Math.max(1, Math.min(10, Number(ageCountParam ?? 5)));
  
  // Check cache first (unless forcePrimary is set)
  if (!forcePrimary) {
    const cacheKey = getCacheKey(playerId, view, includePlayoffs, ageCount);
    const cached = milestonesCache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      // Return cached response with cache headers
      const response = NextResponse.json(cached.data);
      Object.entries(cached.headers).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      response.headers.set('X-Cache', 'HIT');
      response.headers.set('X-Cache-Age', String(Math.floor((now - cached.timestamp) / 1000)));
      return response;
    }
  }
  
  if (forcePrimary) {
    setForcePrimaryReads(20000); // Force primary reads for 20 seconds
  }
  
  return perfMonitor.timeAsync('api:milestones:GET', async () => {
    const t0 = Date.now();
    const view = searchParams.get('view') || undefined;
    const includePlayoffsParam = searchParams.get('includePlayoffs');
    const ageCountParam = searchParams.get('ageCount');
    // Basic validation for inputs
    const parsed = z.object({
      playerId: z.string().min(1),
      view: z.enum(['watchlist','leaderboards']).optional(),
      includePlayoffs: z.union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')]).optional(),
      ageCount: z.string().regex(/^\d+$/).optional(),
    }).safeParse({
      playerId,
      view,
      includePlayoffs: includePlayoffsParam ?? undefined,
      ageCount: ageCountParam ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query params', details: parsed.error.flatten() }, { status: 400 });
    }
    
    // Compute current age from players.birthdate
    function computeAgeFromBirthdate(birthdate?: string | null): number | undefined {
      if (!birthdate) return undefined;
      const d = new Date(birthdate);
      if (isNaN(d.getTime())) return undefined;
      const now = new Date();
      let age = now.getFullYear() - d.getFullYear();
      const m = now.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
      return age;
    }
    const db = openDatabase();
    try {
      await ensureCoreSchemaOnce(db);
      const birthRows = await timeQuery('milestones-birthdate', () => dbAll<{ birthdate: string | null }>(db, `SELECT birthdate FROM players WHERE id = ? LIMIT 1`, [playerId]));
      let currentAge = computeAgeFromBirthdate(birthRows[0]?.birthdate ?? null);
      if (currentAge == null) {
        // Fallback: approximate from latest recorded age in game_summary
        const maxAgeRows = await timeQuery('milestones-max-age', () => dbAll<{ maxAge: number | null }>(db, `SELECT MAX(age_at_game_years) as maxAge FROM game_summary WHERE player_id = ?`, [playerId]));
        const approx = Number(maxAgeRows[0]?.maxAge ?? 0);
        if (!isNaN(approx) && approx > 0) currentAge = approx;
      }
      // Career totals using fast materialized view
      async function getCareerTotalsWithDb(dbLocal: DatabaseConnection, pid: string, isAll: boolean) {
        const rows = await dbAll<{ metric_type: string; total_count: number }>(dbLocal, `SELECT metric_type, total_count FROM player_milestone_summary WHERE player_id = ? AND age_cutoff = 99 AND season_type = ?`, [pid, isAll ? 'ALL' : 'RS']);
        const r: Record<string, number> = {};
        for (const row of rows) r[row.metric_type] = row.total_count;
        return {
          points: Number(r['total_points'] || 0),
          rebounds: Number(r['total_rebounds'] || 0),
          assists: Number(r['total_assists'] || 0),
          threesMade: 0,
          gamesPlayed: Number(r['total_gamesPlayed'] || 0)
        };
      }
      const totals = await getCareerTotalsWithDb(db, playerId, includePlayoffsParam === '1' || includePlayoffsParam === 'true');
    const distances = {
    toTop10: {
      points: distanceToTop10(totals.points, ALL_TIME_TOP10.points),
      rebounds: distanceToTop10(totals.rebounds, ALL_TIME_TOP10.rebounds),
      assists: distanceToTop10(totals.assists, ALL_TIME_TOP10.assists),
      threesMade: distanceToTop10(totals.threesMade, ALL_TIME_TOP10.threesMade),
    },
    nextAgeMilestones: {
      // Placeholder: compute based on birthDate and seasons later
    },
  };

  // --- Milestone leaderboards ---
  // Define metrics and ages to check
  const metrics: Metric[] = ['points', 'rebounds', 'assists', 'steals', 'blocks'];
    // Build ages dynamically: for known age, check next N birthdays (cap at 45). Fallback to youth window.
    const defaultAges = [21, 22, 23, 24, 25];
    const nAhead = Math.max(1, Math.min(10, Number(ageCountParam ?? 5)));
    const ages = currentAge != null
      ? Array.from({ length: nAhead }, (_, i) => currentAge + 1 + i).filter(a => a <= 45)
    : defaultAges;
  const includePlayoffs = includePlayoffsParam === '1' || includePlayoffsParam === 'true';
  const seasonGroup: SeasonGroup = includePlayoffs ? 'ALL' : 'RS';
  const sliceVersion = await currentSlicesVersion(db);
  // Only include ages the player can still affect: "before age X" is active until Xth birthday
  // ages already > currentAge when computed dynamically; fallback keeps > currentAge filter too
  const agesToCheck = currentAge == null ? ages : ages.filter(a => a > currentAge);

  // Rank computation moved to rank-only helpers above.

  // Collect all 'In the Hunt' stats for this player using top-25 lists (fewer queries than rank-only v1)
  const inHuntStats = [] as any[];

  // Add milestone games (e.g., 20+ point games, 20+ pts & 10+ ast games)
  // Tailor presets for Watchlist to avoid confusing min-games variants.
  const milestonePresets: MilestoneQuery[] = (() => {
    if (view === 'watchlist') {
      return [
        // Points + rebounds combos
        { type: 'combo', minPoints: 20, minRebounds: 10 },
        { type: 'combo', minPoints: 30, minRebounds: 10 },
        { type: 'combo', minPoints: 40, minRebounds: 10 },
  // Rebounds-only threshold
  { type: 'rebounds', minRebounds: 10 },
        // Points + assists combos
  { type: 'combo', minPoints: 20, minAssists: 5 },
        { type: 'combo', minPoints: 20, minAssists: 10 },
        { type: 'combo', minPoints: 30, minAssists: 10 },
        { type: 'combo', minPoints: 40, minAssists: 10 },
  // 3-way combo
  { type: 'combo', minPoints: 20, minAssists: 5, minRebounds: 5 },
        // Points-only streaks
        { type: 'points', minPoints: 20 },
        { type: 'points', minPoints: 30 },
        { type: 'points', minPoints: 40 },
        // Double-doubles and triple-doubles
        { type: 'doubleDouble' },
        { type: 'tripleDouble' },
      ];
    }
    // Full preset list for leaderboards view
    return [
      // Min-games leaderboards
      { type: 'rebounds', minRebounds: 10, minGames: 20 },
      { type: 'rebounds', minRebounds: 10, minGames: 30 },
      { type: 'rebounds', minRebounds: 10, minGames: 40 },
  // Replace these two min-games presets with 20+pts combos per request
  { type: 'combo',    minPoints: 20, minAssists: 5 },
  { type: 'combo',    minPoints: 20, minAssists: 5, minRebounds: 5 },
      // Points-only and combos with points+rebounds thresholds
      { type: 'points', minPoints: 20 },
      { type: 'points', minPoints: 30 },
      { type: 'points', minPoints: 40 },
      { type: 'combo', minPoints: 20, minRebounds: 10 },
      { type: 'combo', minPoints: 30, minRebounds: 10 },
      { type: 'combo', minPoints: 40, minRebounds: 10 },
      { type: 'combo', minPoints: 20, minAssists: 10 },
      { type: 'combo', minPoints: 30, minAssists: 10 },
      { type: 'combo', minPoints: 40, minAssists: 10 },
    ];
  })();
  // Mega-batch: gather all (sliceKey, age) combos for metrics and milestones
  const allItems = [
    ...metrics.flatMap(metric => agesToCheck.map(age => ({ sliceKey: presetKey({ kind: 'beforeAge', metric }), age }))),
    ...milestonePresets.flatMap(preset => agesToCheck.map(age => ({ sliceKey: presetKey({ kind: 'milestone', preset }), age }))),
  ];
  const groupedAll = await readSlicesTop25Batch(db, sliceVersion, allItems, seasonGroup);

  // Fill beforeAge metrics from groupedAll (fallback to live compute on miss)
  for (const metric of metrics) {
    const key = presetKey({ kind: 'beforeAge', metric });
    for (const age of agesToCheck) {
      const mapKey = `${key}|${age}`;
      const rows = groupedAll.get(mapKey) || await (async () => {
        const data = await getBeforeAgeSqlite(metric, age, includePlayoffs, db);
        const live = data.top25.map((r, i) => ({ rank: i + 1, player_id: r.playerId, player_name: r.player?.full_name ?? r.playerId, value: r.value }));
        await writeSliceTop25(db, sliceVersion, key, seasonGroup, age, live);
        groupedAll.set(mapKey, live);
        return live;
      })();
      const idx = rows.findIndex(r => r.player_id === playerId);
      if (idx !== -1 && idx < 25) {
        const row = rows[idx];
        const prev = idx > 0 ? rows[idx - 1] : null;
        const metricLabel = metric.charAt(0).toUpperCase() + metric.slice(1);
        inHuntStats.push({
          leaderboard: `${metricLabel} before age ${age}`,
          metric,
          age,
          rank: idx + 1,
          value: row.value,
          nextRank: prev ? { needed: prev.value - row.value + 1, rank: idx, player: prev.player_name } : null,
        });
      }
    }
  }

  // Removed unused labelForPreset helper; labels are built inline below.
  // Use groupedAll for milestone presets
  for (const preset of milestonePresets) {
    const key = presetKey({ kind: 'milestone', preset });
    for (const age of agesToCheck) {
      const mapKey = `${key}|${age}`;
      const rows = groupedAll.get(mapKey) || await (async () => {
        const data = await getMilestoneGamesBeforeAge(preset, age, includePlayoffs, db);
        const live = data.top25.map((r, i) => ({ rank: i + 1, player_id: r.playerId, player_name: r.playerName, value: r.value }));
        await writeSliceTop25(db, sliceVersion, key, seasonGroup, age, live);
        groupedAll.set(mapKey, live);
        return live;
      })();
      const idx = rows.findIndex(r => r.player_id === playerId);
      if (idx !== -1 && idx < 25) {
        const row = rows[idx];
        const prev = idx > 0 ? rows[idx - 1] : null;
        // Map to exact labels requested for the watchlist
        const baseLabel = (() => {
          const type = preset.type;
          if (type === 'points' && (preset as any).minPoints === 20) return '20+pts';
          if (type === 'points' && (preset as any).minPoints === 30) return '30+pts';
          if (type === 'points' && (preset as any).minPoints === 40) return '40+pts';
          if (type === 'combo' && (preset as any).minPoints === 20 && (preset as any).minRebounds === 10) return '20+pts 10+reb';
          if (type === 'combo' && (preset as any).minPoints === 30 && (preset as any).minRebounds === 10) return '30+pts 10+reb';
          if (type === 'combo' && (preset as any).minPoints === 40 && (preset as any).minRebounds === 10) return '40+pts 10+reb';
          if (type === 'rebounds' && (preset as any).minRebounds === 10) return '10+reb games';
          if (type === 'combo' && (preset as any).minPoints === 20 && (preset as any).minAssists === 5 && !(preset as any).minRebounds) return '20+pts 5+ast';
          if (type === 'combo' && (preset as any).minPoints === 20 && (preset as any).minAssists === 5 && (preset as any).minRebounds === 5) return '20+pts 5+ast 5+reb';
          if (type === 'combo' && (preset as any).minPoints === 20 && (preset as any).minAssists === 10) return '20+pts 10+ast';
          if (type === 'combo' && (preset as any).minPoints === 30 && (preset as any).minAssists === 10) return '30+pts 10+ast';
          if (type === 'combo' && (preset as any).minPoints === 40 && (preset as any).minAssists === 10) return '40+pts 10+ast';
          if (type === 'doubleDouble') return 'Double-doubles';
          if (type === 'tripleDouble') return 'Triple-doubles';
          return 'Milestone';
        })();
        const milestoneLabel = /^[a-z]/.test(baseLabel) ? baseLabel.charAt(0).toUpperCase() + baseLabel.slice(1) : baseLabel;
        inHuntStats.push({
          leaderboard: `${milestoneLabel} before age ${age}`,
          metric: preset.type,
          age,
          rank: idx + 1,
          value: row.value,
          nextRank: prev ? { needed: prev.value - row.value + 1, rank: idx, player: prev.player_name } : null,
        });
      }
    }
  }

      const t1 = Date.now();
      if (process.env.DEBUG_MILESTONES === '1') {
        console.log(`[api/milestones] player=${playerId} view=${view} ages=${agesToCheck.join(',')} playoffs=${includePlayoffs} inHunt=${inHuntStats.length} ms=${t1 - t0}`);
      }
      
      const responseData = { totals, distances, inHuntStats, ms: t1 - t0 };
      const response = NextResponse.json(responseData);
      
      // Set aggressive cache headers (6 hours allows twice-daily checks)
      response.headers.set('Cache-Control', 'public, max-age=21600, stale-while-revalidate=43200');
      response.headers.set('X-Cache', 'MISS');
      
      // Store in server-side cache (unless forcePrimary was used)
      if (!forcePrimary) {
        const cacheKey = getCacheKey(playerId, view, includePlayoffs, ageCount);
        milestonesCache.set(cacheKey, {
          data: responseData,
          timestamp: Date.now(),
          headers: {
            'Cache-Control': 'public, max-age=21600, stale-while-revalidate=43200',
          }
        });
        cleanupCache();
      }
      
      return response;
    } catch (error) {
      console.error('[api/milestones] Error:', error);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    } finally {
      await closeDatabase(db);
    }
  }, { endpoint: 'milestones', playerId });
}
