import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { openDatabase, dbAll, closeDatabase, type DatabaseConnection } from '@/lib/database';
import { getBeforeAgeSqlite, type Metric } from '@/lib/leaderboards/beforeAgeSqlite';
import { getMilestoneGamesBeforeAge, type MilestoneQuery } from '@/lib/leaderboards/milestoneGames';
import { currentSlicesVersion, presetKey, readSlicesTop25Batch, writeSliceTop25, type SeasonGroup } from '@/lib/slices';
import { perfMonitor, timeQuery } from '@/lib/performance';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

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
      const birthRows = await timeQuery('milestones-birthdate', () => dbAll<{ birthdate: string | null }>(db, `SELECT birthdate FROM players WHERE id = ? LIMIT 1`, [playerId]));
      let currentAge = computeAgeFromBirthdate(birthRows[0]?.birthdate ?? null);
      if (currentAge == null) {
        // Fallback: approximate from latest recorded age in game_summary
        const maxAgeRows = await timeQuery('milestones-max-age', () => dbAll<{ maxAge: number | null }>(db, `SELECT MAX(age_at_game_years) as maxAge FROM game_summary WHERE player_id = ?`, [playerId]));
        const approx = Number(maxAgeRows[0]?.maxAge ?? 0);
        if (!isNaN(approx) && approx > 0) currentAge = approx;
      }
      // Career totals using same DB
      async function getCareerTotalsWithDb(dbLocal: DatabaseConnection, pid: string) {
        type Row = { points: number | null; rebounds: number | null; assists: number | null; gamesPlayed: number | null };
        const rows = await dbAll<Row>(dbLocal, `
          SELECT
            SUM(points) AS points,
            SUM(rebounds) AS rebounds,
            SUM(assists) AS assists,
            COUNT(*) AS gamesPlayed
          FROM game_summary
          WHERE player_id = ?
        `, [pid]);
        const r = rows[0] || { points: 0, rebounds: 0, assists: 0, gamesPlayed: 0 };
    return {
      points: Number(r.points || 0),
      rebounds: Number(r.rebounds || 0),
      assists: Number(r.assists || 0),
      threesMade: 0,
      gamesPlayed: Number(r.gamesPlayed || 0),
    };
  }
  const totals = await getCareerTotalsWithDb(db, playerId);
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
  // Build ages dynamically: for known age, check next N birthdays (cap at 40). Fallback to youth window.
  const defaultAges = [21, 22, 23, 24, 25];
  const nAhead = Math.max(1, Math.min(10, Number(ageCountParam ?? 5)));
  const ages = currentAge != null
    ? Array.from({ length: nAhead }, (_, i) => currentAge + 1 + i).filter(a => a <= 40)
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
        const data = await getBeforeAgeSqlite(metric, age, includePlayoffs);
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
        const data = await getMilestoneGamesBeforeAge(preset, age, includePlayoffs);
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
      return NextResponse.json({ totals, distances, inHuntStats, ms: t1 - t0 });
    } catch (error) {
      console.error('[api/milestones] Error:', error);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    } finally {
      await closeDatabase(db);
    }
  }, { endpoint: 'milestones', playerId });
}
