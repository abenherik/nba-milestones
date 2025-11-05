import { openSqlite, ensureCoreSchema, dbAll } from "../../lib/sqlite";

export type Metric = 'points' | 'rebounds' | 'assists' | 'steals' | 'blocks';

export type BeforeAgeRow = { playerId: string; value: number; player?: { id: string; full_name: string; birthday: string | null; active?: boolean | null } | null };
export type BeforeAgeData = {
  age: number;
  metric: Metric;
  includesBirthday: boolean;
  excludePlayoffs: boolean;
  definition: string;
  top25: BeforeAgeRow[];
  updatedAt: string | null;
};

function metricColumn(metric: Metric): string {
  switch (metric) {
    case 'points': return 'points';
    case 'rebounds': return 'rebounds';
    case 'assists': return 'assists';
    case 'steals': return 'steals';
    case 'blocks': return 'blocks';
  }
}

export async function getBeforeAgeSqlite(metric: Metric, age: number, includePlayoffs = false): Promise<BeforeAgeData> {
  const db = openSqlite();
  await ensureCoreSchema(db);
  const col = metricColumn(metric);
  const playFilter = includePlayoffs
    ? `season_type IN ('Regular Season','Playoffs')`
    : `season_type = 'Regular Season'`;

  type Row = { player_id: string; full_name: string; birthday: string | null; is_active: number | null; value: number };
  const rows = await dbAll<Row>(db, `
    SELECT s.player_id, p.full_name, p.birthdate as birthday, p.is_active, SUM(s.${col}) as value
    FROM game_summary s
    JOIN players p ON p.id = s.player_id
  WHERE s.age_at_game_years IS NOT NULL AND s.age_at_game_years < ? AND ${playFilter}
    GROUP BY s.player_id, p.full_name, p.birthdate, p.is_active
    HAVING SUM(s.${col}) > 0
    ORDER BY value DESC, p.full_name ASC
    LIMIT 25
  `, [age]);
  db.close();

  return {
    age,
    metric,
  // We use a strict cutoff: age_at_game_years < age, so birthday games are excluded.
  includesBirthday: false,
    excludePlayoffs: !includePlayoffs,
  definition: 'Strictly before the cutoff age (birthday games excluded). Regular Season by default; toggle to include Playoffs.',
    top25: rows.map(r => ({
      playerId: r.player_id,
      value: Number(r.value || 0),
      player: { id: r.player_id, full_name: r.full_name, birthday: r.birthday, active: r.is_active == null ? null : r.is_active === 1 },
    })),
    updatedAt: null,
  };
}
