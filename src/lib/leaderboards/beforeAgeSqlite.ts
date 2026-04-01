import { openSqlite, ensureCoreSchemaOnce, dbAll, closeDatabase, type SqliteDb } from "../../lib/sqlite";

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

export async function getBeforeAgeSqlite(metric: Metric, age: number, includePlayoffs = false, db?: SqliteDb): Promise<BeforeAgeData> {
  const ownsDb = !db;
  const dbConn = db ?? openSqlite();
  await ensureCoreSchemaOnce(dbConn);
  const seasonType = includePlayoffs ? 'ALL' : 'RS';
  const metricType = 'total_' + metric;

  type Row = { player_id: string; full_name: string; birthday: string | null; is_active: number | null; value: number };
  const rows = await dbAll<Row>(dbConn, `
    SELECT ps.player_id, p.full_name, p.birthdate as birthday, p.is_active, ps.total_count as value
    FROM player_milestone_summary ps
    JOIN players p ON p.id = ps.player_id
    WHERE ps.age_cutoff = ? AND ps.season_type = ? AND ps.metric_type = ?
    ORDER BY ps.total_count DESC, p.full_name ASC
    LIMIT 25
  `, [age, seasonType, metricType]);
  if (ownsDb) await closeDatabase(dbConn);

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
