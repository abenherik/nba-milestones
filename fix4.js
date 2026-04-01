const fs = require('fs');
let c = fs.readFileSync('src/lib/leaderboards/milestoneGames.ts', 'utf8');

const regex = /export async function getMilestoneGamesBeforeAge[\s\S]*?  return \{\n    age,/;

c = c.replace(regex, `function getMetricKey(preset: MilestoneQuery): string {
  if (preset.type === 'points') return \`points_\${preset.minPoints}\`;
  if (preset.type === 'rebounds') return \`rebounds_\${preset.minRebounds}\`;
  if (preset.type === 'assists') return \`assists_\${preset.minAssists}\`;
  if (preset.type === 'steals') return \`steals_\${preset.minSteals}\`;
  if (preset.type === 'blocks') return \`blocks_\${preset.minBlocks}\`;
  if (preset.type === 'doubleDouble') return 'doubleDouble';
  if (preset.type === 'tripleDouble') return 'tripleDouble';
  if (preset.type === 'combo') {
    let parts = ['combo'];
    if (preset.minPoints) parts.push(\`pts\${preset.minPoints}\`);
    if (preset.minRebounds) parts.push(\`reb\${preset.minRebounds}\`);
    if (preset.minAssists) parts.push(\`ast\${preset.minAssists}\`);
    return parts.join('_');
  }
  return 'unknown';
}

export async function getMilestoneGamesBeforeAge(q: MilestoneQuery, age: number, includePlayoffs = false, db?: SqliteDb): Promise<MilestoneData> {
  const ownsDb = !db;
  const dbConn = db ?? openSqlite();
  await ensureCoreSchemaOnce(dbConn);

  const seasonType = includePlayoffs ? 'ALL' : 'RS';
  const metricType = getMetricKey(q);

  type Row = { player_id: string; player_name: string; value: number; is_active: number | null; birthdate: string | null };
  let rows: Row[] = [];

  // Use the fast materialized view
  rows = await dbAll<Row>(dbConn, \`
    SELECT ps.player_id, p.full_name as player_name, ps.total_count as value, p.is_active, p.birthdate
    FROM player_milestone_summary ps
    JOIN players p ON p.id = ps.player_id
    WHERE ps.age_cutoff = ? AND ps.season_type = ? AND ps.metric_type = ?
    ORDER BY ps.total_count DESC, p.full_name ASC
    LIMIT 25
  \`, [age, seasonType, metricType]);

  if (q.minGames && q.type !== "doubleDouble" && q.type !== "tripleDouble" && q.type !== "fiveByFive") {
     rows = rows.filter(r => r.value >= q.minGames!);
  }

  if (ownsDb) await closeDatabase(dbConn);

  return {
    age,`);

fs.writeFileSync('src/lib/leaderboards/milestoneGames.ts', c, 'utf8');
