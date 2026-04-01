import { openDatabase, dbAll } from './src/lib/database.ts';

async function check() {
  const db = openDatabase();
  try {
    const sCount = await dbAll<{metric_type: string}>(db, "SELECT DISTINCT metric_type FROM player_milestone_summary");
    console.log("Metrics:", sCount.map((r: any) => r.metric_type));
  } catch (e) {
    console.error("Error:", e);
  }
}

check();
