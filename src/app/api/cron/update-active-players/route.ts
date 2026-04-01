import { NextRequest, NextResponse } from 'next/server';
// Use tsconfig baseUrl+paths alias instead of deep relative traversal
import { openDatabase, dbAll, dbRun, dbBatch, closeDatabase } from '@/lib/database';
import {
  fetchPlayerGameLog,
  getCurrentSeason,
  calculateAgeAtGame,
  type SeasonType,
  type NBAGameLog
} from '@/lib/nba-api';
import { incrementPlayerMilestones } from '@/lib/milestone_processor';

export const dynamic = 'force-dynamic';
// maxDuration removed - causes build issues on Vercel Hobby plan

/**
 * This endpoint updates stats for all active players.
 * It's designed to run as a scheduled job (GitHub Actions or Vercel Cron).
 * 
 * Authentication: Bearer token using CRON_SECRET environment variable
 */

interface Player {
  id: string;
  full_name: string;
  birthdate: string | null;
}

async function getActivePlayers(): Promise<Player[]> {
  const db = openDatabase();
  try {
    const players = await dbAll<Player>(
      db,
      'SELECT id, full_name, birthdate FROM players WHERE is_active = 1'
    );
    return players;
  } finally {
    await closeDatabase(db);
  }
}

async function updatePlayerGames(
  playerId: string,
  playerName: string,
  birthdate: string | null,
  season: string,
  seasonType: SeasonType,
  maxDurationMs: number = 8000 // Timeout after 8 seconds
): Promise<{ added: number; skipped: number; errors: number; timedOut?: boolean }> {
  const db = openDatabase();
  
  try {
    // Set a timeout for the entire operation
    const timeoutPromise = new Promise<NBAGameLog[]>((_, reject) =>
      setTimeout(() => reject(new Error('Player update timeout')), maxDurationMs)
    );
    
    const gamesPromise = fetchPlayerGameLog(playerId, season, seasonType);
    const games = await Promise.race([gamesPromise, timeoutPromise]);
    
    let added = 0;
    let skipped = 0;
    let errors = 0;

    // Fetch existing game_ids for this player+season once (avoids per-game SELECTs).
    const existingRows = await dbAll<{ game_id: string }>(
      db,
      `SELECT game_id FROM game_summary WHERE player_id = ? AND season = ?`,
      [playerId, season]
    );
    const existingIds = new Set(existingRows.map(r => String(r.game_id)));

    const toInsert = games.filter(g => !existingIds.has(String(g.Game_ID)));
    skipped = Math.max(0, games.length - toInsert.length);

    const statements = toInsert.map(game => {
      const ageAtGame = birthdate && game.GAME_DATE
        ? calculateAgeAtGame(birthdate, game.GAME_DATE)
        : null;
      return {
        sql: `INSERT INTO game_summary (
          player_id, player_name, game_id, game_date, season, season_type,
          points, rebounds, assists, blocks, steals, age_at_game_years
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          playerId,
          playerName,
          game.Game_ID,
          game.GAME_DATE,
          season,
          'Regular Season',
          game.PTS ?? 0,
          game.REB ?? 0,
          game.AST ?? 0,
          game.BLK ?? 0,
          game.STL ?? 0,
          ageAtGame,
        ],
        // keep the mapped data for delta processing
        dataForDelta: {
          season_type: 'Regular Season',
          points: game.PTS ?? 0,
          rebounds: game.REB ?? 0,
          assists: game.AST ?? 0,
          blocks: game.BLK ?? 0,
          steals: game.STL ?? 0,
          age_at_game_years: ageAtGame,
        }
      };
    });

    if (statements.length) {
      try {
        await dbBatch(db, statements.map(s => ({ sql: s.sql, params: s.params })));
        added = statements.length;
        
        try {
          await incrementPlayerMilestones(
            db,
            playerId,
            statements.map(s => s.dataForDelta)
          );
        } catch (deltaErr) {
          console.error(`[Cron] Failed to apply milestones delta for ${playerName}:`, deltaErr);
        }
      } catch (err) {
        // Fallback: do sequential inserts to isolate errors.
        console.error(`[Cron] Batch insert failed for ${playerName} (${playerId}); falling back to sequential inserts`, err);
        const successfulGames = [];
        for (const s of statements) {
          try {
            await dbRun(db, s.sql, s.params ?? []);
            added++;
            successfulGames.push(s.dataForDelta);
          } catch (e) {
            errors++;
          }
        }
        if (successfulGames.length > 0) {
          try {
            await incrementPlayerMilestones(
              db,
              playerId,
              successfulGames
            );
          } catch (deltaErr) {
            console.error(`[Cron] Failed to apply sequential milestones delta for ${playerName}:`, deltaErr);
          }
        }
      }
    }
    
    return { added, skipped, errors };
  } catch (err) {
    // Check if it was a timeout
    if (err instanceof Error && err.message === 'Player update timeout') {
      console.log(`[Timeout] Skipping ${playerName} - took too long`);
      return { added: 0, skipped: 0, errors: 0, timedOut: true };
    }
    throw err;
  } finally {
    await closeDatabase(db);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Authentication check
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    // Require valid Bearer token authentication
    const hasValidAuth = authHeader === `Bearer ${cronSecret}`;
    
    if (!hasValidAuth) {
      console.log('Unauthorized cron attempt:', {
        hasAuth: !!authHeader,
        userAgent: req.headers.get('user-agent')
      });
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    const startTime = Date.now();
    console.log('[Cron] Starting active player update...');
    
    // Parse batch parameters from request body
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 1; // Process 1 player per request by default (for Vercel 10s timeout)
    const offset = body.offset || 0; // Start from beginning by default
    
    // Get current season
    const currentSeason = getCurrentSeason();
    console.log(`[Cron] Current season: ${currentSeason}`);
    
    // Get all active players
    const allPlayers = await getActivePlayers();
    console.log(`[Cron] Found ${allPlayers.length} active players total`);
    
    // Get batch of players to process
    const players = allPlayers.slice(offset, offset + batchSize);
    const hasMore = offset + batchSize < allPlayers.length;
    
    console.log(`[Cron] Processing batch: ${offset}-${offset + players.length} of ${allPlayers.length}`);
    
    if (players.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No players in this batch',
        totalPlayers: allPlayers.length,
        hasMore: false,
        duration: Date.now() - startTime
      });
    }
    
    // Update each player
    const results = {
      playersProcessed: 0,
      gamesAdded: 0,
      gamesSkipped: 0,
      errors: 0,
      playerDetails: [] as any[]
    };
    
    for (const player of players) {
      try {
        console.log(`[Cron] Updating ${player.full_name} (${player.id})...`);
        
        // Update regular season games with 8-second timeout
        const stats = await updatePlayerGames(
          player.id,
          player.full_name,
          player.birthdate,
          currentSeason,
          'Regular Season',
          8000
        );
        
        results.playersProcessed++;
        results.gamesAdded += stats.added;
        results.gamesSkipped += stats.skipped;
        results.errors += stats.errors;
        
        results.playerDetails.push({
          id: player.id,
          name: player.full_name,
          added: stats.added,
          skipped: stats.skipped,
          errors: stats.errors,
          timedOut: stats.timedOut || false
        });
        
        // No delay needed - batch size is 1 player per request
      } catch (err) {
        console.error(`[Cron] Failed to update player ${player.full_name}:`, err);
        results.errors++;
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[Cron] Completed batch in ${duration}ms:`, results);
    
    return NextResponse.json({
      success: true,
      season: currentSeason,
      batch: {
        offset,
        size: players.length,
        totalPlayers: allPlayers.length,
        hasMore
      },
      ...results,
      duration
    });
    
  } catch (error) {
    console.error('[Cron] Update failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET endpoint for manual testing (with auth)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized - use POST with valid Bearer token' },
      { status: 401 }
    );
  }
  
  // Forward to POST handler
  return POST(req);
}
