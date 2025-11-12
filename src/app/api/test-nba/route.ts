import { NextRequest, NextResponse } from 'next/server';
import { fetchPlayerGameLog, getCurrentSeason } from '@/lib/nba-api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('playerId') || '1631094'; // Paolo Banchero
  const season = req.nextUrl.searchParams.get('season') || getCurrentSeason();
  
  console.log(`[Test NBA] Fetching player ${playerId} season ${season}`);
  const startTime = Date.now();
  
  try {
    const games = await fetchPlayerGameLog(playerId, season, 'Regular Season');
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      playerId,
      season,
      gamesFound: games.length,
      duration,
      firstGame: games[0] || null,
      message: `Successfully fetched ${games.length} games in ${duration}ms`
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    
    return NextResponse.json({
      success: false,
      playerId,
      season,
      duration,
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      message: 'Failed to fetch NBA data'
    }, { status: 500 });
  }
}
