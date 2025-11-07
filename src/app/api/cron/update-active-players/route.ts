import { NextRequest, NextResponse } from 'next/server';
// Use tsconfig baseUrl+paths alias instead of deep relative traversal
import { openDatabase, dbAll, dbRun, closeDatabase } from '@/lib/database';
import {
  fetchPlayerGameLog,
  getCurrentSeason,
  calculateAgeAtGame,
  type SeasonType,
  type NBAGameLog
} from '@/lib/nba-api';

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
  seasonType: SeasonType
): Promise<{ added: number; skipped: number; errors: number }> {
  const db = openDatabase();
  
  try {
    const games = await fetchPlayerGameLog(playerId, season, seasonType);
    
    let added = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const game of games) {
      try {
        // Check if game already exists
        const existing = await dbAll(
          db,
          'SELECT 1 FROM game_summary WHERE player_id = ? AND game_id = ? LIMIT 1',
          [playerId, game.Game_ID]
        );
        
        if (existing.length > 0) {
          skipped++;
          continue;
        }
        
        // Calculate age if birthdate available
        const ageAtGame = birthdate && game.GAME_DATE 
          ? calculateAgeAtGame(birthdate, game.GAME_DATE)
          : null;
        
        // Insert new game
        // CRITICAL: Always set season_type='Regular Season' for consistency
        await dbRun(
          db,
          `INSERT INTO game_summary (
            player_id, player_name, game_id, game_date, season, season_type,
            points, rebounds, assists, blocks, steals, age_at_game_years
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            playerId,
            playerName,
            game.Game_ID,
            game.GAME_DATE,
            season,
            'Regular Season', // Always use 'Regular Season' as per project requirements
            game.PTS ?? 0,
            game.REB ?? 0,
            game.AST ?? 0,
            game.BLK ?? 0,
            game.STL ?? 0,
            ageAtGame
          ]
        );
        
        added++;
      } catch (err) {
        console.error(`Error inserting game ${game.Game_ID} for player ${playerId}:`, err);
        errors++;
      }
    }
    
    return { added, skipped, errors };
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
    
    // Get current season
    const currentSeason = getCurrentSeason();
    console.log(`[Cron] Current season: ${currentSeason}`);
    
    // Get all active players
    const players = await getActivePlayers();
    console.log(`[Cron] Found ${players.length} active players`);
    
    if (players.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active players to update',
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
        
        // Update regular season games
        const stats = await updatePlayerGames(
          player.id,
          player.full_name,
          player.birthdate,
          currentSeason,
          'Regular Season'
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
          errors: stats.errors
        });
        
        // Rate limiting: small delay between players
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`[Cron] Failed to update player ${player.full_name}:`, err);
        results.errors++;
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[Cron] Completed in ${duration}ms:`, results);
    
    return NextResponse.json({
      success: true,
      season: currentSeason,
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
