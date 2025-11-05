import { openSqlite, ensureCoreSchema, dbAll } from "../../lib/sqlite";

type BaseQuery = { minGames?: number };
export type MilestoneQuery = (
  | { type: "points"; minPoints: number }
  | { type: "rebounds"; minRebounds: number }
  | { type: "assists"; minAssists: number }
  | { type: "steals"; minSteals: number }
  | { type: "blocks"; minBlocks: number }
  | { type: "combo"; minPoints?: number; minRebounds?: number; minAssists?: number; minSteals?: number; minBlocks?: number }
  | { type: "doubleDouble" }
  | { type: "tripleDouble" }
  | { type: "fiveByFive" }
) & BaseQuery;

export type MilestoneRow = { playerId: string; playerName: string; value: number; active?: boolean | null; birthday?: string | null };
export type MilestoneData = {
  age: number;
  includePlayoffs: boolean;
  label: string;
  definition: string;
  top25: MilestoneRow[];
};

export function buildWhereClause(q: MilestoneQuery) {
  const parts: string[] = [];
  const params: (number)[] = [];

  const ge = (expr: string, min: number | undefined) => {
    if (min === undefined) return;
    parts.push(`${expr} >= ?`);
    params.push(min);
  };

  switch (q.type) {
    case "points": ge("points", q.minPoints); break;
    case "rebounds": ge("rebounds", q.minRebounds); break;
    case "assists": ge("assists", q.minAssists); break;
    case "steals": ge("steals", q.minSteals); break;
    case "blocks": ge("blocks", q.minBlocks); break;
    case "combo":
      ge("points", q.minPoints);
      ge("assists", q.minAssists);
      ge("rebounds", q.minRebounds);
      ge("steals", q.minSteals);
      ge("blocks", q.minBlocks);
      break;
    case "doubleDouble":
      parts.push(`((CASE WHEN points>=10 THEN 1 ELSE 0 END)
                 + (CASE WHEN rebounds>=10 THEN 1 ELSE 0 END)
                 + (CASE WHEN assists>=10 THEN 1 ELSE 0 END)
                 + (CASE WHEN blocks>=10 THEN 1 ELSE 0 END)
                 + (CASE WHEN steals>=10 THEN 1 ELSE 0 END)) >= 2`);
      break;
    case "tripleDouble":
      parts.push(`((CASE WHEN points>=10 THEN 1 ELSE 0 END)
                 + (CASE WHEN rebounds>=10 THEN 1 ELSE 0 END)
                 + (CASE WHEN assists>=10 THEN 1 ELSE 0 END)
                 + (CASE WHEN blocks>=10 THEN 1 ELSE 0 END)
                 + (CASE WHEN steals>=10 THEN 1 ELSE 0 END)) >= 3`);
      break;
    case "fiveByFive":
      parts.push(`points>=5 AND rebounds>=5 AND assists>=5 AND blocks>=5 AND steals>=5`);
      break;
  }

  return { sql: parts.length ? parts.join(" AND ") : "1=1", params } as const;
}

function condLabel(q: MilestoneQuery): string {
  switch (q.type) {
    case "points": return `${q.minPoints}+ points`;
    case "rebounds": return `${q.minRebounds}+ rebounds`;
    case "assists": return `${q.minAssists}+ assists`;
    case "steals": return `${q.minSteals}+ steals`;
    case "blocks": return `${q.minBlocks}+ blocks`;
    case "combo": {
      const parts: string[] = [];
      if (q.minPoints) parts.push(`${q.minPoints}+ pts`);
      if (q.minAssists) parts.push(`${q.minAssists}+ ast`);
      if (q.minRebounds) parts.push(`${q.minRebounds}+ reb`);
      if (q.minSteals) parts.push(`${q.minSteals}+ stl`);
      if (q.minBlocks) parts.push(`${q.minBlocks}+ blk`);
      return parts.join(" & ");
    }
    case "doubleDouble": return "double-doubles";
    case "tripleDouble": return "triple-doubles";
    case "fiveByFive": return "5x5";
  }
}

export function labelFor(q: MilestoneQuery): string {
  const base = condLabel(q);
  if (q.minGames && (q.type !== "doubleDouble" && q.type !== "tripleDouble" && q.type !== "fiveByFive")) {
  // Simplify wording per request for rebounds presets
  if (q.type === 'rebounds' && q.minRebounds === 10) return `Games with 10+ reb`;
  if (q.type === 'rebounds' && q.minRebounds === 5) return `Games with 5+ rebounds`;
  return `${q.minGames}+ games with ${base}`;
  }
  // For aggregate types, keep existing labels
  if (q.type === "doubleDouble") return "Double-doubles";
  if (q.type === "tripleDouble") return "Triple-doubles";
  if (q.type === "fiveByFive") return "5x5 games";
  return `${base} games`;
}

export async function getMilestoneGamesBeforeAge(q: MilestoneQuery, age: number, includePlayoffs = false): Promise<MilestoneData> {
  const db = openSqlite();
  await ensureCoreSchema(db);

  const playFilter = includePlayoffs
    ? `season_type IN ('Regular Season','Playoffs')`
    : `season_type = 'Regular Season'`;

  const baseWhere = [`age_at_game_years IS NOT NULL`, `age_at_game_years < ?`, playFilter];
  const baseParams: (number)[] = [age];

  const cond = buildWhereClause(q);
  // Debug: log the built conditions to diagnose inflated counts (guarded by env)
  if (process.env.DEBUG_MILESTONES === '1') {
    try {
      console.log('[milestoneGames] q=', JSON.stringify(q), 'WHERE=', cond.sql, 'params=', cond.params, 'age<', age, 'playoffs=', includePlayoffs);
    } catch {}
  }
  const where = [...baseWhere, cond.sql].join(" AND ");
  const params = [...baseParams, ...cond.params];

  type Row = { player_id: string; player_name: string; value: number; is_active: number | null; birthdate: string | null };
  const havingSql = (q.minGames && (q.type !== "doubleDouble" && q.type !== "tripleDouble" && q.type !== "fiveByFive")) ? `HAVING COUNT(DISTINCT s.game_id) >= ?` : ``;
  const rows = await dbAll<Row>(db, `
    SELECT s.player_id, s.player_name, COUNT(DISTINCT s.game_id) as value, p.is_active, p.birthdate
    FROM game_summary s
    JOIN players p ON p.id = s.player_id
    WHERE ${where}
    GROUP BY s.player_id, s.player_name, p.is_active, p.birthdate
    ${havingSql}
    ORDER BY value DESC, s.player_name ASC
    LIMIT 25
  `, havingSql ? [...params, q.minGames as number] : params);
  db.close();

  const defBase = "Count of qualifying games on or before cutoff age. Regular Season by default; toggle to include Playoffs.";
  const defMin = q.minGames && (q.type !== "doubleDouble" && q.type !== "tripleDouble" && q.type !== "fiveByFive")
    ? ` Players shown have at least ${q.minGames} qualifying games; the value is the total number of qualifying games.`
    : "";
  return {
    age,
    includePlayoffs,
    label: labelFor(q),
    definition: defBase + defMin,
    top25: rows.map(r => ({
      playerId: r.player_id,
      playerName: r.player_name,
      value: Number(r.value||0),
      active: r.is_active == null ? null : r.is_active === 1,
      birthday: r.birthdate ?? null,
    })),
  };
}
