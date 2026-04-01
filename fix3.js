const fs = require('fs');
let c = fs.readFileSync('src/lib/leaderboards/beforeAgeSqlite.ts', 'utf8');

const regex = /const col = metricColumn\(metric\);[\s\S]*?`,\s*\[age\]\);/;

c = c.replace(regex, `const seasonType = includePlayoffs ? 'ALL' : 'RS';
  const metricType = 'total_' + metric;

  type Row = { player_id: string; full_name: string; birthday: string | null; is_active: number | null; value: number };
  const rows = await dbAll<Row>(dbConn, \\\`
    SELECT ps.player_id, p.full_name, p.birthdate as birthday, p.is_active, ps.total_count as value
    FROM player_milestone_summary ps
    JOIN players p ON p.id = ps.player_id
    WHERE ps.age_cutoff = ? AND ps.season_type = ? AND ps.metric_type = ?
    ORDER BY ps.total_count DESC, p.full_name ASC
    LIMIT 25
  \\\`, [age, seasonType, metricType]);`);

fs.writeFileSync('src/lib/leaderboards/beforeAgeSqlite.ts', c, 'utf8');
