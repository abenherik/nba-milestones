import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import { openDatabase, dbAll, closeDatabase } from '../src/lib/database.js';
import { ALL_PRESETS, getMetricKey, processGame } from '../src/lib/milestone_processor.js';

async function rebuildAll() {
  const db = openDatabase();
  console.log('Fetching active players...');
  const players = await dbAll<{ id: string }>(db, `SELECT id FROM players WHERE is_active = 1`);
  
  console.log(`Building summaries for ${players.length} active players...`);

  // Clear existing
  // Use a transaction/batch? Not easily exported in dbAll wrapper, so we just run directly or recreate
  if ('execute' in db) {
      await db.execute('DELETE FROM player_milestone_summary');
  }

  let totalInserts = 0;
  for (let i = 0; i < players.length; i++) {
    const pid = players[i].id;
    const games = await dbAll<{
      season_type: string;
      age_at_game_years: number;
      points: number;
      rebounds: number;
      assists: number;
      steals: number;
      blocks: number;
    }>(db, `SELECT season_type, age_at_game_years, points, rebounds, assists, steals, blocks FROM game_summary WHERE player_id = ?`, [pid]);

    // We only care about age 20 to 45
    // And seasons: "RS" (Regular Season), "Playoffs" (ignored mostly but we just group them), and ALL (merged)
    // The route checks: includePlayoffs. So we group by "RS" and "ALL".
    const inserts: any[] = [];
    const timestamp = new Date().toISOString();

    for (const seasonGroup of ['RS', 'ALL']) {
      for (const preset of ALL_PRESETS) {
        const metricKey = getMetricKey(preset);
        let cumulative = 0;

        for (let age = 18; age <= 45; age++) {
          // Accumulate games the player played BEFORE this age
          const gamesBeforeAge = games.filter(g => {
            if (seasonGroup === 'RS' && g.season_type !== 'Regular Season') return false;
            // The route uses < age logic (e.g. before age 24 = age_at_game_years under 24)
            // Actually `getMilestoneGamesBeforeAge` uses `WHERE age_at_game_years < ?`
            return g.age_at_game_years < age;
          });

          let val = 0;
          for (const g of gamesBeforeAge) {
             val += processGame(g, preset);
          }
          
          if (val > 0) {
            inserts.push(`('${pid}', '${seasonGroup}', '${metricKey}', ${age}, ${val}, '${timestamp}')`);
          }
        }
      }
    }
    
    // Also build a special age_cutoff = 99 for CAREER totals
    for (const seasonGroup of ['RS', 'ALL']) {
      for (const preset of ALL_PRESETS) {
        const metricKey = getMetricKey(preset);
        let val = 0;
        const validGames = games.filter(g => seasonGroup === 'ALL' || g.season_type === 'Regular Season');
        for (const g of validGames) {
           val += processGame(g, preset);
        }
        if (val > 0) {
           inserts.push(`('${pid}', '${seasonGroup}', '${metricKey}', 99, ${val}, '${timestamp}')`);
        }
      }
    }

    if (inserts.length > 0) {
       // batch insert
       const chunkSize = 500;
       for (let c = 0; c < inserts.length; c += chunkSize) {
         const chunk = inserts.slice(c, c + chunkSize);
         const sql = `INSERT INTO player_milestone_summary (player_id, season_type, metric_type, age_cutoff, total_count, updated_at) VALUES ${chunk.join(',')}`;
         if ('execute' in db) {
           await db.execute(sql);
         }
       }
       totalInserts += inserts.length;
    }

    if ((i+1) % 50 === 0) console.log(`Processed ${i+1}/${players.length}`);
  }

  console.log(`Done! Inserted ${totalInserts} summary rows.`);
  await closeDatabase(db);
}

rebuildAll().catch(console.error);