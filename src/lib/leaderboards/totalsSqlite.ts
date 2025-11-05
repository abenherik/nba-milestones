import { openSqlite, ensureCoreSchema, dbAll } from "../../lib/sqlite";

export type Metric = 'points' | 'rebounds' | 'assists' | 'steals' | 'blocks';
export type TotalsRow = { playerId: string; value: number; player: { id: string; full_name: string; active?: boolean | null } };
export type Source = 'boxscores' | 'league';
export type TotalsData = { metric: Metric; includePlayoffs: boolean; source: Source; definition: string; top25: TotalsRow[] };

function metricColumn(metric: Metric): string {
  switch (metric) {
    case 'points': return 'points';
    case 'rebounds': return 'rebounds';
    case 'assists': return 'assists';
    case 'steals': return 'steals';
    case 'blocks': return 'blocks';
  }
}

export async function getTotalsSqlite(metric: Metric, includePlayoffs = false, source: Source = 'boxscores'): Promise<TotalsData> {
  const db = openSqlite();
  await ensureCoreSchema(db);
  const col = metricColumn(metric);
  const playFilter = includePlayoffs
    ? `season_type IN ('Regular Season','Playoffs')`
    : `season_type = 'Regular Season'`;

  type Row = { player_id: string; full_name: string; is_active: number | null; value: number };

  let rows: Row[] = [];

  if (source === 'boxscores') {
    // Sum directly from game_summary (official box scores path)
    rows = await dbAll<Row>(db, `
      SELECT s.player_id, p.full_name, p.is_active, SUM(s.${col}) as value
      FROM game_summary s
      JOIN players p ON p.id = s.player_id
      WHERE ${playFilter}
      GROUP BY s.player_id, p.full_name, p.is_active
      HAVING SUM(s.${col}) > 0
      ORDER BY value DESC, p.full_name ASC
      LIMIT 25
    `);
  } else {
    // League-adjusted season totals: base box scores + season_totals_override deltas
    // Filter overrides with the same season_type filter
    rows = await dbAll<Row>(db, `
      WITH base AS (
        SELECT s.player_id, SUM(s.${col}) AS base_value
        FROM game_summary s
        WHERE ${playFilter}
        GROUP BY s.player_id
      ), ov AS (
        SELECT o.player_id, SUM(o.${col}) AS ov_value
        FROM season_totals_override o
  WHERE ${playFilter.replace(/season_type/g, 'o.season_type')}
        GROUP BY o.player_id
      )
      SELECT b.player_id, p.full_name, p.is_active,
             (COALESCE(b.base_value,0) + COALESCE(ov.ov_value,0)) AS value
      FROM base b
      JOIN players p ON p.id = b.player_id
      LEFT JOIN ov ON ov.player_id = b.player_id
      WHERE (COALESCE(b.base_value,0) + COALESCE(ov.ov_value,0)) > 0
      ORDER BY value DESC, p.full_name ASC
      LIMIT 25
    `);
  }
  db.close();

  return {
    metric,
    includePlayoffs,
    source,
    definition: source === 'boxscores'
      ? 'All-time totals from official box scores (sum of per-game values). Regular Season by default; toggle to include Playoffs.'
      : 'All-time totals adjusted to match league season totals (box scores plus per-season deltas). Regular Season by default; toggle to include Playoffs.',
    top25: rows.map(r => ({
      playerId: r.player_id,
      value: Number(r.value || 0),
      player: { id: r.player_id, full_name: r.full_name, active: r.is_active == null ? null : r.is_active === 1 },
    })),
  };
}
