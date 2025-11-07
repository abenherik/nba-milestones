import { NextRequest, NextResponse } from 'next/server';
import { openDatabase, dbAll, dbRun, closeDatabase, setForcePrimaryReads } from '@/lib/database';
import { perfMonitor, timeQuery } from '@/lib/performance';
import { withCacheHeaders } from '@/lib/caching';
// zod removed; request bodies validated minimally in handlers

// Force dynamic rendering to avoid caching issues with Turso edge database
export const dynamic = 'force-dynamic';

function computeAgeFromBirthdate(birthdate?: string | null): number | undefined {
  if (!birthdate) return undefined;
  const d = new Date(birthdate);
  if (isNaN(d.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

// In-memory cache for watchlist data
let watchlistCache: {
  data: any;
  timestamp: number;
  bypassUntil?: number; // Timestamp to bypass cache until (for read-after-write consistency)
} | null = null;

const CACHE_DURATION = 500; // Very short cache for better consistency

export async function GET() {
  return perfMonitor.timeAsync('api:watchlist:GET', async () => {
    const startTime = Date.now();
    
    // Check cache first, but bypass if we're in read-after-write mode
    const now = Date.now();
    const shouldBypassCache = watchlistCache?.bypassUntil && now < watchlistCache.bypassUntil;
    
    if (watchlistCache && !shouldBypassCache && (now - watchlistCache.timestamp < CACHE_DURATION)) {
      if (process.env.DEBUG?.includes('watchlist')) {
        console.log(`[GET /api/watchlist] Returning cached data (${now - watchlistCache.timestamp}ms old)`);
      }
      return NextResponse.json(watchlistCache.data);
    }
    
    if (shouldBypassCache && process.env.DEBUG?.includes('watchlist')) {
      console.log(`[GET /api/watchlist] Bypassing cache for read-after-write consistency`);
    }
    
    const db = openDatabase();
    const dbOpenTime = Date.now() - startTime;
    let queryTime = 0;
    
    try {
      type Row = { player_id: string | number; id?: string; full_name: string | null; birthdate?: string | null };
      const queryStart = Date.now();
      const rows = await dbAll<Row>(db, `
        SELECT w.player_id, p.id, p.full_name, p.birthdate
        FROM watchlist w
        LEFT JOIN players p ON w.player_id = p.id
        ORDER BY w.created_at DESC
        LIMIT 100
      `);
      queryTime = Date.now() - queryStart;
      
      if (process.env.DEBUG?.includes('watchlist')) {
        console.log(`[GET /api/watchlist] Timing: dbOpen=${dbOpenTime}ms, query=${queryTime}ms, rows=${rows.length}`);
        console.log('Raw watchlist SQL rows:', rows);
      }
      
      const responseData = {
        items: Array.isArray(rows) ? rows.map(r => ({
          playerId: r.player_id != null ? String(r.player_id) : '',
          player: r.full_name ? { id: r.id ? String(r.id) : '', full_name: r.full_name, age: computeAgeFromBirthdate(r.birthdate) } : undefined,
          debug: !r.full_name ? `Missing player for id ${r.player_id}` : undefined
        })) : []
      };
      
      // Cache the result
      watchlistCache = {
        data: responseData,
        timestamp: Date.now()
      };
      
      const response = NextResponse.json(responseData);
      
      // Add cache headers for watchlist data
      return withCacheHeaders(response, 'watchlist');
    } catch (err) {
      console.error('[GET /api/watchlist] Error:', err);
      return NextResponse.json({ items: [] });
    } finally {
      const closeStart = Date.now();
      await closeDatabase(db);
      const closeTime = Date.now() - closeStart;
      const totalTime = Date.now() - startTime;
      
      if (process.env.DEBUG?.includes('watchlist')) {
        console.log(`[GET /api/watchlist] Total timing: ${totalTime}ms (open=${dbOpenTime}ms, query=${queryTime}ms, close=${closeTime}ms)`);
      }
    }
  }, { endpoint: 'watchlist' });
}


export async function POST(req: NextRequest) {
  return perfMonitor.timeAsync('api:watchlist:POST', async () => {
    const body = await req.json();
    const playerId: string = String(body.playerId ?? '').trim();
    if (process.env.DEBUG?.includes('watchlist')) console.log('[POST /api/watchlist] Incoming playerId:', playerId);
    if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 });
    if (!/^\d+$/.test(playerId)) return NextResponse.json({ error: 'playerId must be digits', debug: body.playerId }, { status: 400 });
    
    const db = openDatabase();
    try {
      // validate player exists
      const exists = await dbAll(db, `SELECT 1 FROM players WHERE id = ? LIMIT 1`, [playerId]);
      if (process.env.DEBUG?.includes('watchlist')) console.log('[POST /api/watchlist] Exists?', playerId, exists.length > 0);
      
      if (exists.length === 0) {
        return NextResponse.json({ error: 'player not found', debug: playerId }, { status: 404 });
      }
      
      const beforeResult = await dbAll<{ count: number }>(db, `SELECT COUNT(*) as count FROM watchlist WHERE player_id = ?`, [playerId]);
      await dbRun(db, `INSERT OR IGNORE INTO watchlist(player_id) VALUES(?)`, [playerId]);
      const afterResult = await dbAll<{ count: number }>(db, `SELECT COUNT(*) as count FROM watchlist WHERE player_id = ?`, [playerId]);
      
      const beforeCount = Number(beforeResult[0]?.count ?? 0);
      const afterCount = Number(afterResult[0]?.count ?? 0);
      const added = afterCount > beforeCount;
      
      // Completely invalidate cache and force primary database reads
      watchlistCache = null;
      // Force all subsequent reads to primary database for 15 seconds (Turso consistency)
      setForcePrimaryReads(15000);
      // Create new cache entry with bypass flag for next 15 seconds
      watchlistCache = {
        data: null,
        timestamp: 0,
        bypassUntil: Date.now() + 15000 // 15 seconds bypass
      };
      if (process.env.DEBUG?.includes('watchlist')) {
        console.log(`[POST /api/watchlist] Invalidated cache, forced primary reads, and set 15s bypass after ${added ? 'adding' : 'no change'}`);
      }
      
      return NextResponse.json({ ok: true, playerId, added, counts: { before: beforeCount, after: afterCount } });
    } catch (error) {
      console.error('[POST /api/watchlist] Error:', error);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    } finally {
      await closeDatabase(db);
    }
  }, { endpoint: 'watchlist', operation: 'add' });
}

export async function DELETE(req: NextRequest) {
  return perfMonitor.timeAsync('api:watchlist:DELETE', async () => {
    const body = await req.json();
    const playerId: string = String(body.playerId ?? '').trim();
    if (!playerId) return NextResponse.json({ error: 'playerId required' }, { status: 400 });
    if (!/^\d+$/.test(playerId)) return NextResponse.json({ error: 'playerId must be digits' }, { status: 400 });
    
    const db = openDatabase();
    try {
      await dbRun(db, `DELETE FROM watchlist WHERE player_id = ?`, [playerId]);
      
      // Completely invalidate cache and force primary database reads
      watchlistCache = null;
      // Force all subsequent reads to primary database for 15 seconds (Turso consistency)
      setForcePrimaryReads(15000);
      // Create new cache entry with bypass flag for next 15 seconds
      watchlistCache = {
        data: null,
        timestamp: 0,
        bypassUntil: Date.now() + 15000 // 15 seconds bypass
      };
      if (process.env.DEBUG?.includes('watchlist')) {
        console.log(`[DELETE /api/watchlist] Invalidated cache, forced primary reads, and set 15s bypass after removing player ${playerId}`);
      }
      
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error('[DELETE /api/watchlist] Error:', error);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    } finally {
      await closeDatabase(db);
    }
  }, { endpoint: 'watchlist', operation: 'delete' });
}
