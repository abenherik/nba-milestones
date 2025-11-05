#!/usr/bin/env tsx
import { openSqlite, ensureCoreSchema, dbAll } from '../src/lib/sqlite';
import { currentSlicesVersion, publishSlicesVersion, presetKey, writeSliceTop25 } from '../src/lib/slices';
import { getBeforeAgeSqlite } from '../src/lib/leaderboards/beforeAgeSqlite';
import { getMilestoneGamesBeforeAge } from '../src/lib/leaderboards/milestoneGames';

async function main() {
  const db = openSqlite();
  await ensureCoreSchema(db);
  const nowVersion = await currentSlicesVersion(db);
  const nextVersion = `v${Date.now()}`;
  const ages = (process.env.SLICE_AGES || '28,29,30,31,32').split(',').map(s=>Number(s.trim())).filter(n=>!isNaN(n));
  const includePlayoffs = process.env.SLICE_PLAYOFFS === '1';
  const seasonGroup = includePlayoffs ? 'ALL' : 'RS';

  const beforeMetrics: Array<'points'|'rebounds'|'assists'|'steals'|'blocks'> = ['points','rebounds','assists','steals','blocks'];
  for (const metric of beforeMetrics) {
    const key = presetKey({ kind: 'beforeAge', metric });
    for (const age of ages) {
      const data = await getBeforeAgeSqlite(metric as any, age, includePlayoffs);
      const rows = data.top25.map((r, i) => ({ rank: i+1, player_id: r.playerId, player_name: r.player?.full_name ?? r.playerId, value: r.value }));
      await writeSliceTop25(db, nextVersion, key, seasonGroup as any, age, rows);
      console.log(`[slice] beforeAge ${metric} age ${age} -> ${rows.length} rows`);
    }
  }

  const presets = [
    { type: 'combo', minPoints: 20, minRebounds: 10 },
    { type: 'combo', minPoints: 30, minRebounds: 10 },
    { type: 'combo', minPoints: 40, minRebounds: 10 },
  { type: 'combo', minPoints: 20, minAssists: 5 },
  { type: 'combo', minPoints: 20, minAssists: 5, minRebounds: 5 },
    { type: 'combo', minPoints: 20, minAssists: 10 },
    { type: 'combo', minPoints: 30, minAssists: 10 },
    { type: 'combo', minPoints: 40, minAssists: 10 },
    { type: 'points', minPoints: 20 },
    { type: 'points', minPoints: 30 },
    { type: 'points', minPoints: 40 },
  ] as const;
  for (const preset of presets) {
    const key = presetKey({ kind: 'milestone', preset });
    for (const age of ages) {
      const data = await getMilestoneGamesBeforeAge(preset as any, age, includePlayoffs);
      const rows = data.top25.map((r, i) => ({ rank: i+1, player_id: r.playerId, player_name: r.playerName, value: r.value }));
      await writeSliceTop25(db, nextVersion, key, seasonGroup as any, age, rows);
      console.log(`[slice] milestone ${JSON.stringify(preset)} age ${age} -> ${rows.length} rows`);
    }
  }

  await publishSlicesVersion(db, nextVersion);
  console.log(`Published slices version ${nextVersion} (was ${nowVersion})`);
  db.close();
}

main().catch((e)=>{ console.error(e); process.exit(1); });
