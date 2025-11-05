// Runtime JS clone of detect_missing_seasons focusing on a given ONLY_IDS list.
const { openSqlite, ensureCoreSchema, dbAll } = require('../src/lib/sqlite');
const NBA_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.nba.com',
  'Referer': 'https://www.nba.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function fetchJson(url,retries=4){
  const fetchImpl = global.fetch || (await import('undici')).fetch;
  let last;
  for(let i=0;i<=retries;i++){
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(),15000);
    try {
      const r = await fetchImpl(url,{ headers: NBA_HEADERS, signal: ctrl.signal });
      clearTimeout(t);
      if(!r.ok) throw new Error('HTTP '+r.status);
      return await r.json();
    } catch(e){
      clearTimeout(t); last=e; if(i<retries){ await sleep(1000*(i+1)); continue; } else throw e; }
  }
  throw last;
}
function seasonString(y){ return `${y}-${String(y+1).slice(-2)}`; }
async function getSeasonsForPlayer(id){
  const json = await fetchJson(`https://stats.nba.com/stats/commonplayerinfo?PlayerID=${id}`);
  const rs = json.resultSets?.[0]||json.resultSet; if(!rs) return [];
  const headers = rs.headers||[]; const row = rs.rowSet?.[0]; if(!row) return [];
  const obj = Object.fromEntries(headers.map((h,i)=>[h,row[i]]));
  const fromYear = Number(obj.FROM_YEAR||obj.from_year||0)||0; const toYear = Number(obj.TO_YEAR||obj.to_year||fromYear)||fromYear;
  const out=[]; for(let y=fromYear;y<=toYear;y++) out.push(seasonString(y)); return out; }
(async()=>{
  console.log('[detect_missing_seasons_runtime] start');
  const ONLY_IDS = (process.env.ONLY_IDS||'').split(/[\s,]+/).filter(Boolean);
  const db = openSqlite(); await ensureCoreSchema(db);
  const players = await dbAll(db, `SELECT id, full_name FROM players WHERE id IN (${ONLY_IDS.map(()=>'?').join(',')})`, ONLY_IDS);
  for(const p of players){
    try {
      const expected = await getSeasonsForPlayer(p.id);
      const presentRows = await dbAll(db, `SELECT DISTINCT season FROM player_stats WHERE player_id=? AND season_type='Regular Season'`, [p.id]);
      const present = new Set(presentRows.map(r=>r.season));
      const missing = expected.filter(s=>!present.has(s));
      if(missing.length) console.log(`[MISSING] ${p.full_name} (${p.id}) missing: ${missing.join(', ')}`); else console.log(`[OK] ${p.full_name}`);
    } catch(e){ console.warn('Failed', p.full_name, e.message); }
  }
  db.close();
})();
