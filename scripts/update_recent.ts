/**
 * Recent-range backfill to Turso (economical):
 * - Fetch league-wide player game logs for a date range (1-2 API calls)
 * - Batch insert into game_summary with INSERT OR IGNORE
 *
 * Run with: npm run update:recent
 */

import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll, dbBatch, closeDatabase } from '../src/lib/database.js';
import {
  calculateAgeAtGame,
  fetchLeagueGameLog,
  getCurrentSeason,
  type NBALeagueGameLogRow,
} from '../src/lib/nba-api.js';

interface PlayerRow {
  id: string;
  full_name: string;
  birthdate: string | null;
}

function formatMmDdYyyy(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function getRowPlayerId(r: NBALeagueGameLogRow): string {
  const v = (r as any).PLAYER_ID ?? (r as any).Player_ID ?? (r as any).PLAYERID;
  return v == null ? '' : String(v);
}

function getRowGameId(r: NBALeagueGameLogRow): string {
  const v = (r as any).GAME_ID ?? (r as any).Game_ID;
  return v == null ? '' : String(v);
}

async function updateRecent() {
  const db = openDatabase();
  const season = getCurrentSeason();

  // Default to last ~35 days. (Simple + safe; you can widen if needed.)
  const dateTo = new Date();
  const dateFrom = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);

  const dateFromStr = formatMmDdYyyy(dateFrom);
  const dateToStr = formatMmDdYyyy(dateTo);

  console.log('='.repeat(60));
  console.log('NBA Recent Backfill (LeagueGameLog)');
  console.log('='.repeat(60));
  console.log(`Season: ${season}`);
  console.log(`Date range: ${dateFromStr} → ${dateToStr}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  try {
    const [{ totalBefore }] = await dbAll<{ totalBefore: number }>(
      db,
      'SELECT COUNT(*) as totalBefore FROM game_summary'
    );

    console.log(`game_summary rows before: ${totalBefore}`);

    const rows = await fetchLeagueGameLog(season, 'Regular Season', dateFromStr, dateToStr);
    console.log(`Fetched league rows: ${rows.length}`);

    if (!rows.length) {
      console.log('No rows returned; nothing to do.');
      return;
    }

    // Load player metadata for age calculation (chunked IN query)
    const playerIds = Array.from(new Set(rows.map(getRowPlayerId).filter(Boolean)));
    const playersById = new Map<string, PlayerRow>();

    for (const idsChunk of chunk(playerIds, 500)) {
      const placeholders = idsChunk.map(() => '?').join(',');
      const found = await dbAll<PlayerRow>(
        db,
        `SELECT id, full_name, birthdate FROM players WHERE id IN (${placeholders})`,
        idsChunk
      );
      for (const p of found) playersById.set(String(p.id), p);
    }

    const statements = rows
      .map(r => {
        const playerId = getRowPlayerId(r);
        const gameId = getRowGameId(r);
        const gameDate = (r as any).GAME_DATE;
        if (!playerId || !gameId || !gameDate) return null;

        const meta = playersById.get(playerId);
        const playerName = meta?.full_name ?? (r as any).PLAYER_NAME ?? 'Unknown';
        const birthdate = meta?.birthdate ?? null;
        const ageAtGame = birthdate ? calculateAgeAtGame(birthdate, String(gameDate)) : null;

        return {
          sql: `INSERT OR IGNORE INTO game_summary (
            player_id, player_name, game_id, game_date, season, season_type,
            points, rebounds, assists, blocks, steals, age_at_game_years
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            playerId,
            playerName,
            gameId,
            String(gameDate),
            season,
            'Regular Season',
            (r as any).PTS ?? 0,
            (r as any).REB ?? 0,
            (r as any).AST ?? 0,
            (r as any).BLK ?? 0,
            (r as any).STL ?? 0,
            ageAtGame,
          ],
        };
      })
      .filter(Boolean) as Array<{ sql: string; params: any[] }>;

    console.log(`Prepared inserts: ${statements.length}`);

    // Batch inserts in smaller chunks to stay well under request limits.
    let batchCount = 0;
    for (const stmtsChunk of chunk(statements, 250)) {
      await dbBatch(db, stmtsChunk);
      batchCount++;
      if (batchCount % 10 === 0) {
        console.log(`  Insert batches completed: ${batchCount}`);
      }
    }

    const [{ totalAfter }] = await dbAll<{ totalAfter: number }>(
      db,
      'SELECT COUNT(*) as totalAfter FROM game_summary'
    );

    console.log(`game_summary rows after:  ${totalAfter}`);
    console.log(`Rows added (delta):       ${totalAfter - totalBefore}`);

    console.log('\n' + '='.repeat(60));
    console.log('✓ Recent backfill complete');
    console.log('='.repeat(60));
  } finally {
    await closeDatabase(db);
  }
}

updateRecent().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
