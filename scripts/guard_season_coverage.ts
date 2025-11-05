import { openSqlite, ensureCoreSchema, dbAll } from '../src/lib/sqlite';

/*
  Guard script: Ensures no high-total player is missing a full regular season between FROM_YEAR..TO_YEAR derived from their own min/max season.
  Usage:
    npm run -s local:guard:seasons
    MIN_PTS=15000 LIMIT=50 npm run -s local:guard:seasons
*/

interface PlayerSeasonRow { id:string; full_name:string; season:string; pts:number }

function seasonToYear(s:string){ return parseInt(s.slice(0,4),10); }

async function main(){
  const MIN_PTS = Number(process.env.MIN_PTS || '10000');
  const LIMIT = Number(process.env.LIMIT || '0');
  const db = openSqlite();
  await ensureCoreSchema(db);

  const rows = await dbAll<PlayerSeasonRow>(db, `
    SELECT ps.player_id as id, p.full_name, ps.season, SUM(ps.points) AS pts
    FROM player_stats ps
    JOIN players p ON p.id = ps.player_id
    WHERE ps.season_type='Regular Season'
    GROUP BY ps.player_id, ps.season
  `);

  const byPlayer = new Map<string,{ name:string; seasons:Set<string>; totalPts:number }>();
  for(const r of rows){
    let o = byPlayer.get(r.id);
    if(!o){ o = { name:r.full_name, seasons:new Set(), totalPts:0 }; byPlayer.set(r.id,o); }
    o.seasons.add(r.season);
    o.totalPts += r.pts;
  }

  const issues: { id:string; name:string; missing:string[]; span:string }[] = [];
  for(const [id,data] of byPlayer){
    if(data.totalPts < MIN_PTS) continue;
    const years = Array.from(data.seasons).map(seasonToYear).filter(n=>Number.isFinite(n)).sort((a,b)=>a-b);
    if(!years.length) continue;
    const minY = years[0];
    const maxY = years[years.length-1];
    const missing:string[] = [];
    for(let y=minY; y<=maxY; y++){
      const s = `${y}-${String((y+1)).slice(-2)}`;
      if(!data.seasons.has(s)) missing.push(s);
    }
    if(missing.length){
      issues.push({ id, name:data.name, missing, span:`${minY}-${maxY}` });
    }
  }

  issues.sort((a,b)=>a.missing.length===b.missing.length ? a.name.localeCompare(b.name) : b.missing.length - a.missing.length);
  const limited = LIMIT?issues.slice(0,LIMIT):issues;

  if(!limited.length){
    console.log(`Season coverage guard PASS (MIN_PTS=${MIN_PTS})`);
  } else {
    console.log(`Season coverage guard FAIL: ${limited.length} player(s) have gaps (MIN_PTS=${MIN_PTS})`);
    for(const i of limited){
      console.log(`[GAP] ${i.name} (${i.id}) span ${i.span} missing ${i.missing.length}: ${i.missing.join(', ')}`);
    }
    process.exitCode = 2;
  }
  db.close();
}

main().catch(e=>{ console.error(e); process.exit(1); });
