import { dbRun, type DatabaseConnection } from './database';

export type MetricPreset =
  | { type: 'points'; minPoints: number }
  | { type: 'rebounds'; minRebounds: number }
  | { type: 'assists'; minAssists: number }
  | { type: 'steals'; minSteals: number }
  | { type: 'blocks'; minBlocks: number }
  | { type: 'combo'; minPoints?: number; minRebounds?: number; minAssists?: number }
  | { type: 'doubleDouble' }
  | { type: 'tripleDouble' }
  | { type: 'total'; stat: 'points' | 'rebounds' | 'assists' | 'gamesPlayed' | 'blocks' | 'steals' };

export const ALL_PRESETS: MetricPreset[] = [
  { type: 'points', minPoints: 20 },
  { type: 'points', minPoints: 30 },
  { type: 'points', minPoints: 40 },
  { type: 'rebounds', minRebounds: 10 },
  { type: 'assists', minAssists: 10 },
  { type: 'steals', minSteals: 5 },
  { type: 'blocks', minBlocks: 5 },
  { type: 'combo', minPoints: 20, minRebounds: 10 },
  { type: 'combo', minPoints: 30, minRebounds: 10 },
  { type: 'combo', minPoints: 40, minRebounds: 10 },
  { type: 'combo', minPoints: 20, minAssists: 5 },
  { type: 'combo', minPoints: 20, minAssists: 10 },
  { type: 'combo', minPoints: 30, minAssists: 10 },
  { type: 'combo', minPoints: 40, minAssists: 10 },
  { type: 'combo', minPoints: 20, minAssists: 5, minRebounds: 5 },
  { type: 'doubleDouble' },
  { type: 'tripleDouble' },
  { type: 'total', stat: 'points' },
  { type: 'total', stat: 'rebounds' },
  { type: 'total', stat: 'assists' },
  { type: 'total', stat: 'blocks' },
  { type: 'total', stat: 'steals' },
  { type: 'total', stat: 'gamesPlayed' }
];

export function getMetricKey(preset: MetricPreset): string {
  if (preset.type === 'total') return `total_${preset.stat}`;
  if (preset.type === 'points') return `points_${preset.minPoints}`;
  if (preset.type === 'rebounds') return `rebounds_${preset.minRebounds}`;
  if (preset.type === 'assists') return `assists_${preset.minAssists}`;
  if (preset.type === 'steals') return `steals_${preset.minSteals}`;
  if (preset.type === 'blocks') return `blocks_${preset.minBlocks}`;
  if (preset.type === 'doubleDouble') return 'doubleDouble';
  if (preset.type === 'tripleDouble') return 'tripleDouble';
  if (preset.type === 'combo') {
    let parts = ['combo'];
    if (preset.minPoints) parts.push(`pts${preset.minPoints}`);
    if (preset.minRebounds) parts.push(`reb${preset.minRebounds}`);
    if (preset.minAssists) parts.push(`ast${preset.minAssists}`);
    return parts.join('_');
  }
  return 'unknown';
}

export function processGame(g: any, preset: MetricPreset): number {
  if (preset.type === 'total') {
    if (preset.stat === 'gamesPlayed') return 1;
    return Number(g[preset.stat] || 0);
  }
  const pts = Number(g.points || 0);
  const reb = Number(g.rebounds || 0);
  const ast = Number(g.assists || 0);
  const stl = Number(g.steals || 0);
  const blk = Number(g.blocks || 0);

  if (preset.type === 'points') return pts >= preset.minPoints ? 1 : 0;
  if (preset.type === 'rebounds') return reb >= preset.minRebounds ? 1 : 0;
  if (preset.type === 'assists') return ast >= preset.minAssists ? 1 : 0;
  if (preset.type === 'steals') return stl >= preset.minSteals ? 1 : 0;
  if (preset.type === 'blocks') return blk >= preset.minBlocks ? 1 : 0;
  if (preset.type === 'doubleDouble') {
    let doubles = 0;
    if (pts >= 10) doubles++;
    if (reb >= 10) doubles++;
    if (ast >= 10) doubles++;
    if (stl >= 10) doubles++;
    if (blk >= 10) doubles++;
    return doubles >= 2 ? 1 : 0;
  }
  if (preset.type === 'tripleDouble') {
    let doubles = 0;
    if (pts >= 10) doubles++;
    if (reb >= 10) doubles++;
    if (ast >= 10) doubles++;
    if (stl >= 10) doubles++;
    if (blk >= 10) doubles++;
    return doubles >= 3 ? 1 : 0;
  }
  if (preset.type === 'combo') {
    if (preset.minPoints && pts < preset.minPoints) return 0;
    if (preset.minRebounds && reb < preset.minRebounds) return 0;
    if (preset.minAssists && ast < preset.minAssists) return 0;
    return 1;
  }
  return 0;
}

export async function incrementPlayerMilestones(
  db: any,
  playerId: string,
  newGames: any[]
) {
  if (!newGames || newGames.length === 0) return;

  const timestamp = new Date().toISOString();
  const upserts: string[] = [];

  for (const seasonGroup of ['RS', 'ALL']) {
    for (const preset of ALL_PRESETS) {
      const metricKey = getMetricKey(preset);

      // Group by age
      for (let age = 18; age <= 45; age++) {
        let val = 0;
        for (const g of newGames) {
          if (seasonGroup === 'RS' && g.season_type !== 'Regular Season') continue;
          if (g.age_at_game_years !== null && g.age_at_game_years !== undefined && g.age_at_game_years < age) {
            val += processGame(g, preset);
          }
        }
        if (val > 0) {
          upserts.push(`('${playerId}', '${seasonGroup}', '${metricKey}', ${age}, ${val}, '${timestamp}')`);
        }
      }

      // 99
      let val99 = 0;
      for (const g of newGames) {
        if (seasonGroup === 'RS' && g.season_type !== 'Regular Season') continue;
        val99 += processGame(g, preset);
      }
      if (val99 > 0) {
        upserts.push(`('${playerId}', '${seasonGroup}', '${metricKey}', 99, ${val99}, '${timestamp}')`);
      }
    }
  }

  if (upserts.length > 0) {
    const chunkSize = 500;
    for (let c = 0; c < upserts.length; c += chunkSize) {
      const chunk = upserts.slice(c, c + chunkSize);
const sql = `
        INSERT INTO player_milestone_summary (player_id, season_type, metric_type, age_cutoff, total_count, updated_at)
        VALUES ${chunk.join(',')}
        ON CONFLICT(player_id, season_type, metric_type, age_cutoff)
        DO UPDATE SET
          total_count = player_milestone_summary.total_count + excluded.total_count,
          updated_at = excluded.updated_at
      `;
      
      // Execute the batch query: handling Turso / raw execution
      if ('execute' in db) {
        await (db as any).execute(sql);
      } else {
        // Fallback for custom dbRun wrapper
        await dbRun(db, sql);
      }
    }
  }
}
