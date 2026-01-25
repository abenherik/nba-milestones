#!/usr/bin/env tsx
// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, closeDatabase } from '../src/lib/database.js';
import { currentSlicesVersion, publishSlicesVersion, presetKey, writeSliceTop25 } from '../src/lib/slices';
import { getBeforeAgeSqlite } from '../src/lib/leaderboards/beforeAgeSqlite';
import { getMilestoneGamesBeforeAge } from '../src/lib/leaderboards/milestoneGames';

async function main() {
  console.log('='.repeat(60));
  console.log('Rebuilding Slices (Precomputed Leaderboards)');
  console.log('='.repeat(60));
  
  const db = openDatabase();
  const nowVersion = await currentSlicesVersion(db);
  const nextVersion = `v${Date.now()}`;
  const ages = (process.env.SLICE_AGES || '20,21,22,23,24,25,26,27,28,29,30').split(',').map(s=>Number(s.trim())).filter(n=>!isNaN(n));
  const includePlayoffs = process.env.SLICE_PLAYOFFS === '1';
  const seasonGroup = includePlayoffs ? 'ALL' : 'RS';
  
  console.log(`\nCurrent version: ${nowVersion || 'none'}`);
  console.log(`New version: ${nextVersion}`);
  console.log(`Ages: ${ages.join(', ')}`);
  console.log(`Season type: ${seasonGroup} (${includePlayoffs ? 'including playoffs' : 'regular season only'})\n`);

  const beforeMetrics: Array<'points'|'rebounds'|'assists'|'steals'|'blocks'> = ['points','rebounds','assists','steals','blocks'];
  for (const metric of beforeMetrics) {
    const key = presetKey({ kind: 'beforeAge', metric });
    for (const age of ages) {
      const data = await getBeforeAgeSqlite(metric as any, age, includePlayoffs, db as any);
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
    { type: 'doubleDouble' },
    { type: 'tripleDouble' },
  ] as const;
  for (const preset of presets) {
    const key = presetKey({ kind: 'milestone', preset });
    for (const age of ages) {
      const data = await getMilestoneGamesBeforeAge(preset as any, age, includePlayoffs, db as any);
      const rows = data.top25.map((r, i) => ({ rank: i+1, player_id: r.playerId, player_name: r.playerName, value: r.value }));
      await writeSliceTop25(db, nextVersion, key, seasonGroup as any, age, rows);
      console.log(`[slice] milestone ${JSON.stringify(preset)} age ${age} -> ${rows.length} rows`);
    }
  }

  await publishSlicesVersion(db, nextVersion);
  console.log(`\n✓ Published slices version ${nextVersion} (was ${nowVersion})`);
  await closeDatabase(db);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
