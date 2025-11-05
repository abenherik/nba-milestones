import { openSqlite, ensureCoreSchema, dbAll, dbRun } from '../src/lib/sqlite';

function parseYMD(raw: string): { y: number; m: number; d: number } | null {
  if (!raw) return null;
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return { y: Number(isoMatch[1]), m: Number(isoMatch[2]), d: Number(isoMatch[3]) };
  }
  // Try to handle 'MMM DD, YYYY' e.g., 'Dec 05, 2006'
  const mmm = raw.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (mmm) {
    const key = String(mmm[1]).slice(0, 3).toLowerCase();
    const idx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(key);
    if (idx >= 0) {
      return { y: Number(mmm[3]), m: idx + 1, d: Number(mmm[2]) };
    }
  }
  return null;
}

function ageAt(dateStr: string, birthStr?: string | null): number | null {
  if (!birthStr) return null;
  const bIso = (birthStr || '').slice(0, 10); // 'YYYY-MM-DD' from ISO
  const bd = parseYMD(bIso);
  const gd = parseYMD(dateStr);
  if (!bd || !gd) return null;
  let age = gd.y - bd.y;
  if (gd.m < bd.m || (gd.m === bd.m && gd.d < bd.d)) age--;
  return age;
}

type Row = {
  game_id: string;
  game_date: string;
  player_id: string;
  full_name: string;
  season: string | null;
  season_type: string | null;
  points: number;
  rebounds: number;
  assists: number;
  blocks: number;
  steals: number;
  birthdate: string | null;
};

async function main() {
  const db = openSqlite();
  await ensureCoreSchema(db);

  // Pull all player game rows via join
  const rows = await dbAll<Row>(db, `
    SELECT ps.game_id, g.game_date, ps.player_id, p.full_name, p.birthdate,
           ps.season, ps.season_type, ps.points, ps.rebounds, ps.assists, ps.blocks, ps.steals
    FROM player_stats ps
    JOIN games g ON g.game_id = ps.game_id
    JOIN players p ON p.id = ps.player_id
  `);

  // Upsert into summary
  await dbRun(db, 'BEGIN');
  try {
    for (const r of rows) {
      const ageYears = ageAt(r.game_date, r.birthdate);
      await dbRun(db, `INSERT INTO game_summary(
        player_id, player_name, game_id, game_date, season, season_type,
        points, rebounds, assists, blocks, steals, age_at_game_years
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(game_id, player_id) DO UPDATE SET
        player_name=excluded.player_name,
        game_date=excluded.game_date,
        season=excluded.season,
        season_type=excluded.season_type,
        points=excluded.points,
        rebounds=excluded.rebounds,
        assists=excluded.assists,
        blocks=excluded.blocks,
        steals=excluded.steals,
        age_at_game_years=excluded.age_at_game_years
      `, [
        r.player_id, r.full_name, r.game_id, r.game_date, r.season, r.season_type,
        r.points ?? 0, r.rebounds ?? 0, r.assists ?? 0, r.blocks ?? 0, r.steals ?? 0,
        ageYears !== null ? ageYears : null,
      ]);
    }
    await dbRun(db, 'COMMIT');
  } catch (e) {
    await dbRun(db, 'ROLLBACK');
    throw e;
  } finally {
    db.close();
  }
  console.log(`Built/updated game_summary for ${rows.length} rows`);
}

main().catch((e) => { console.error(e); process.exit(1); });
