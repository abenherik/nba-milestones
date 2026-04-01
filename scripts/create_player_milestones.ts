import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import { openDatabase, dbRun } from '../src/lib/database.js';

async function main() {
  const db = openDatabase();
  console.log('Creating player_milestone_summary...');
  await dbRun(db, `
      CREATE TABLE IF NOT EXISTS player_milestone_summary (
        player_id TEXT NOT NULL,
        season_type TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        age_cutoff INTEGER NOT NULL,
        total_count INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (player_id, season_type, metric_type, age_cutoff)
      )
  `);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_player_milestone_summary ON player_milestone_summary(metric_type, season_type, age_cutoff, total_count DESC)`);
  console.log('Done.');
  process.exit(0);
}
main().catch(console.error);
