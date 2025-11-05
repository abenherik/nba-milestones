import { openSqlite, dbAll } from '../src/lib/sqlite';

async function main() {
  const db = openSqlite();
  // Example: total points before age 20
  const pointsUnder20 = await dbAll<{ player_name: string; total_points: number }>(db,
    `SELECT player_name, SUM(points) AS total_points
     FROM game_summary
     WHERE age_at_game_years IS NOT NULL AND age_at_game_years < 20
     GROUP BY player_name
     ORDER BY total_points DESC
     LIMIT 25`
  );
  console.log('Top points before age 20:', pointsUnder20.slice(0, 5));

  // Example: 20+ point games before age 20
  const g20 = await dbAll<{ player_name: string; games_count: number }>(db,
    `SELECT player_name, COUNT(*) AS games_count
     FROM game_summary
     WHERE points >= 20 AND age_at_game_years IS NOT NULL AND age_at_game_years < 20
     GROUP BY player_name
     ORDER BY games_count DESC
     LIMIT 25`
  );
  console.log('20+ pt games before 20:', g20.slice(0, 5));

  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
