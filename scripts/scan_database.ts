import fs from 'node:fs';
import path from 'node:path';
import { openSqlite, ensureCoreSchema, dbAll } from '../src/lib/sqlite';

type Player = { id: string; full_name: string; is_active: number | null; birthdate: string | null };

async function main() {
  const db = openSqlite();
  await ensureCoreSchema(db);

  const [{ totalPlayers }] = await dbAll<{ totalPlayers: number }>(db, 'SELECT COUNT(*) as totalPlayers FROM players');
  const [{ withBirthdays }] = await dbAll<{ withBirthdays: number }>(db, 'SELECT COUNT(*) as withBirthdays FROM players WHERE birthdate IS NOT NULL');
  const [{ activeCount }] = await dbAll<{ activeCount: number }>(db, 'SELECT COUNT(*) as activeCount FROM players WHERE is_active = 1');
  const [{ inactiveCount }] = await dbAll<{ inactiveCount: number }>(db, 'SELECT COUNT(*) as inactiveCount FROM players WHERE is_active = 0');

  const [{ totalSummaryRows }] = await dbAll<{ totalSummaryRows: number }>(db, 'SELECT COUNT(*) as totalSummaryRows FROM game_summary');
  const [{ playersWithSummary }] = await dbAll<{ playersWithSummary: number }>(db, 'SELECT COUNT(DISTINCT player_id) as playersWithSummary FROM game_summary');
  const [{ rowsWithNullAge }] = await dbAll<{ rowsWithNullAge: number }>(db, 'SELECT COUNT(*) as rowsWithNullAge FROM game_summary WHERE age_at_game_years IS NULL');
  const [{ playoffRows }] = await dbAll<{ playoffRows: number }>(db, "SELECT COUNT(*) as playoffRows FROM game_summary WHERE season_type = 'Playoffs'");

  const playersNoSummary = await dbAll<Player>(db, `
    SELECT p.id, p.full_name, p.is_active, p.birthdate
    FROM players p
    LEFT JOIN (
      SELECT DISTINCT player_id FROM game_summary
    ) s ON s.player_id = p.id
    WHERE s.player_id IS NULL
    ORDER BY (p.is_active IS NOT NULL AND p.is_active = 1) DESC, p.full_name ASC
    LIMIT 50
  `);

  const [{ activeWithSummary }] = await dbAll<{ activeWithSummary: number }>(db, `
    SELECT COUNT(DISTINCT s.player_id) as activeWithSummary
    FROM game_summary s
    JOIN players p ON p.id = s.player_id
    WHERE p.is_active = 1
  `);

  const activeNoSummary = await dbAll<Player>(db, `
    SELECT p.id, p.full_name, p.is_active, p.birthdate
    FROM players p
    WHERE p.is_active = 1 AND NOT EXISTS (
      SELECT 1 FROM game_summary s WHERE s.player_id = p.id
    )
    ORDER BY p.full_name ASC
    LIMIT 50
  `);

  const playersNullAgeSample = await dbAll<{ player_id: string; player_name: string; cnt: number }>(db, `
    SELECT player_id, player_name, COUNT(*) as cnt
    FROM game_summary
    WHERE age_at_game_years IS NULL
    GROUP BY player_id, player_name
    ORDER BY cnt DESC
    LIMIT 25
  `);

  // Compare with data/players.csv if present
  const playersCsvPath = path.resolve(process.cwd(), 'data', 'players.csv');
  let csvCount = 0;
  let csvOnlyIds: string[] = [];
  try {
    if (fs.existsSync(playersCsvPath)) {
      const txt = fs.readFileSync(playersCsvPath, 'utf8');
      const ids = new Set<string>();
      txt.split(/\r?\n/).slice(1).forEach(line => {
        if (!line) return;
        const id = line.split(',')[0];
        if (id) ids.add(id);
      });
      csvCount = ids.size;
      const dbIds = await dbAll<{ id: string }>(db, 'SELECT id FROM players');
      const dbSet = new Set(dbIds.map(r => String(r.id)));
      csvOnlyIds = Array.from(ids).filter(id => !dbSet.has(String(id))).slice(0, 25);
    }
  } catch {}

  const report = {
    players: {
      total: totalPlayers,
      active: activeCount,
      inactive: inactiveCount,
      withBirthdays,
      withoutBirthdays: totalPlayers - withBirthdays,
    },
    summary: {
      rows: totalSummaryRows,
      distinctPlayers: playersWithSummary,
      rowsWithNullAge,
      playoffRows,
    },
    coverage: {
      playersWithoutSummary: playersNoSummary.length,
      sampleMissing: playersNoSummary.map(p => ({ id: p.id, name: p.full_name, active: p.is_active === 1, hasBirthday: !!p.birthdate })).slice(0, 25),
      playersWithNullAgeSample: playersNullAgeSample,
      active: {
        totalActive: activeCount,
        activeWithSummary,
        activeMissing: Math.max(0, activeCount - activeWithSummary),
        sampleActiveMissing: activeNoSummary.map(p => ({ id: p.id, name: p.full_name })).slice(0, 25),
      }
    },
    csv: {
      present: csvCount,
      csvOnlyFirst25: csvOnlyIds,
    }
  } as const;

  // Pretty print
  console.log(JSON.stringify(report, null, 2));

  db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
