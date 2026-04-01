const fs = require('fs');
let c = fs.readFileSync('src/app/api/milestones/route.ts', 'utf8');
const start = c.indexOf('// Career totals using same DB');
const end = c.indexOf('const distances = {');
if (start > -1 && end > -1) {
  fs.writeFileSync('src/app/api/milestones/route.ts', c.substring(0, start) + 
`// Career totals using fast materialized view
      async function getCareerTotalsWithDb(dbLocal: DatabaseConnection, pid: string, isAll: boolean) {
        const rows = await dbAll<{ metric_type: string; total_count: number }>(dbLocal, \`SELECT metric_type, total_count FROM player_milestone_summary WHERE player_id = ? AND age_cutoff = 99 AND season_type = ?\`, [pid, isAll ? 'ALL' : 'RS']);
        const r: Record<string, number> = {};
        for (const row of rows) r[row.metric_type] = row.total_count;
        return {
          points: Number(r['total_points'] || 0),
          rebounds: Number(r['total_rebounds'] || 0),
          assists: Number(r['total_assists'] || 0),
          threesMade: 0,
          gamesPlayed: Number(r['total_gamesPlayed'] || 0)
        };
      }
      const totals = await getCareerTotalsWithDb(db, playerId, includePlayoffsParam === '1' || includePlayoffsParam === 'true');
    ` + c.substring(end), 'utf8');
  console.log('Fixed');
} else {
  console.log('Not found');
}