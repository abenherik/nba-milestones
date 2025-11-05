import fs from 'fs';
import path from 'path';
import { openSqlite, ensureCoreSchema, dbAll } from '../src/lib/sqlite';

function seasonString(yearStart: number) { const yy = (yearStart + 1).toString().slice(-2); return `${yearStart}-${yy}`; }
function startYearFromSeason(s: string): number { const y = Number(s.slice(0,4)); return Number.isFinite(y) ? y : NaN; }

function isFutureSeason(season:string, now = new Date()): boolean {
  const startYear = Number(season.slice(0,4));
  if (!Number.isFinite(startYear)) return false;
  const currentYear = now.getFullYear();
  if (startYear > currentYear) return true;
  if (startYear === currentYear) {
    const m = now.getMonth();
    const d = now.getDate();
    if (m < 9) return true; // before October
    if (m === 9 && d < 10) return true; // early October buffer
  }
  return false;
}

async function main(){
  const LIMIT = Number(process.env.LIMIT || '0');
  const ONLY_IDS = String(process.env.ONLY_IDS || '').trim();
  const TARGET_POINTS_MIN = Number(process.env.MIN_PTS || '0');
  const IGNORE_FUTURE = process.env.IGNORE_FUTURE !== '0';
  const WRITE_REPORT = process.env.WRITE_REPORT === '1';
  const OUT_DIR = String(process.env.OUT_DIR || 'docs/reports');
  const OUT_BASENAME = String(process.env.OUT_BASENAME || 'missing-seasons-offline');
  const OUT_FORMATS = String(process.env.OUT_FORMATS || 'json').split(/[\,\s]+/).filter(Boolean);

  const db = openSqlite();
  await ensureCoreSchema(db);

  // Build candidate list: players with any Regular Season stats and optional min points filter
  let players = await dbAll<{ id: string; full_name: string; pts: number }>(db, `
    SELECT p.id, p.full_name, COALESCE(SUM(ps.points),0) AS pts
    FROM players p
    LEFT JOIN player_stats ps ON ps.player_id=p.id AND ps.season_type='Regular Season'
    GROUP BY p.id, p.full_name
    HAVING pts >= ?
    ORDER BY pts DESC
  `, [TARGET_POINTS_MIN]);

  if (ONLY_IDS) {
    const set = new Set(ONLY_IDS.split(/[,\s]+/).filter(Boolean));
    players = players.filter(p=>set.has(p.id));
  }
  if (LIMIT && players.length > LIMIT) players = players.slice(0, LIMIT);

  console.log(`[offline] scanning ${players.length} players for gaps between first and last Regular Season`);

  const results: { id:string; name:string; expected:number; present:number; missing:string[] }[] = [];

  for (const p of players) {
    const seasonsRows = await dbAll<{ season:string }>(db, `
      SELECT DISTINCT season FROM player_stats WHERE player_id=? AND season_type='Regular Season' ORDER BY season
    `,[p.id]);
    const seasons = seasonsRows.map(r=>r.season);
    if (!seasons.length) continue;
    const years = seasons.map(startYearFromSeason).filter(Number.isFinite) as number[];
    if (!years.length) continue;
    const minY = Math.min(...years), maxY = Math.max(...years);
    const presentSet = new Set(seasons);
    const expectedAll: string[] = [];
    for (let y=minY; y<=maxY; y++) expectedAll.push(seasonString(y));
    let missing = expectedAll.filter(s=>!presentSet.has(s));
    if (IGNORE_FUTURE) missing = missing.filter(s=>!isFutureSeason(s));
    if (missing.length) {
      results.push({ id: p.id, name: p.full_name, expected: expectedAll.length, present: seasons.length, missing });
      console.log(`[MISSING-OFFLINE] ${p.full_name} (${p.id}) missing ${missing.length} season(s): ${missing.join(', ')}`);
    }
  }

  if (!results.length) {
    console.log('[offline] No gaps detected.');
  } else {
    console.log(`\n[offline] Summary (${results.length} players with gaps):`);
    for (const r of results) console.log(`${r.name} present=${r.present}/${r.expected} missing: ${r.missing.join(', ')}`);
  }

  if (WRITE_REPORT) {
    try {
      const ts = new Date();
      const stamp = `${ts.getFullYear()}${String(ts.getMonth()+1).padStart(2,'0')}${String(ts.getDate()).padStart(2,'0')}-${String(ts.getHours()).padStart(2,'0')}${String(ts.getMinutes()).padStart(2,'0')}${String(ts.getSeconds()).padStart(2,'0')}`;
      const dir = path.resolve(OUT_DIR);
      fs.mkdirSync(dir, { recursive: true });
      const meta = {
        generatedAt: ts.toISOString(),
        scannedPlayers: players.length,
        filters: { LIMIT, ONLY_IDS, MIN_PTS: TARGET_POINTS_MIN, IGNORE_FUTURE },
        counts: { missing: results.length }
      };
      if (OUT_FORMATS.includes('json')) {
        const jsonPath = path.join(dir, `${OUT_BASENAME}-${stamp}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify({ meta, results }, null, 2), 'utf8');
        console.log(`[offline report] wrote ${jsonPath}`);
      }
      if (OUT_FORMATS.includes('md') || OUT_FORMATS.includes('markdown')) {
        const mdPath = path.join(dir, `${OUT_BASENAME}-${stamp}.md`);
        const lines: string[] = [];
        lines.push('# Missing Seasons Report (Offline heuristic)');
        lines.push('');
        lines.push(`- Generated: ${meta.generatedAt}`);
        lines.push(`- Scanned players: ${meta.scannedPlayers}`);
        lines.push(`- Players with gaps: ${meta.counts.missing}`);
        lines.push('');
        lines.push('Note: This heuristic flags gaps between the first and last recorded Regular Season for each player. It may include legitimate non-playing seasons (injury, pre-NBA, post-NBA).');
        lines.push('');
        if (results.length) {
          lines.push('| Player | ID | Present/Expected | Missing |');
          lines.push('|---|---:|---:|---|');
          for (const r of results) lines.push(`| ${r.name} | ${r.id} | ${r.present}/${r.expected} | ${r.missing.join(', ')} |`);
        }
        fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');
        console.log(`[offline report] wrote ${mdPath}`);
      }
    } catch (e) {
      console.warn('[offline report] failed:', (e as Error).message);
    }
  }

  db.close();
}

main().catch(e=>{ console.error(e); process.exit(1); });
