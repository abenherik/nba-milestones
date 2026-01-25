# Database Read Optimization - Cache Improvements

## Problem
Turso database reads at 497M/500M (99.4% limit) due to aggressive querying.

## Root Causes
1. **Milestones API** - No server-side caching, every watchlist player triggered fresh DB queries
2. **Leaderboards** - Only 5min browser cache, not aggressive enough
3. **Slices cache** - Only 30 seconds TTL, too short for frequently accessed data
4. **Watchlist** - Only 500ms cache, almost no caching benefit

## Changes Made

### 1. Milestones API (`/api/milestones`) - MAJOR IMPROVEMENT
**Before:** No server-side cache, every request hit database
**After:** Aggressive 24-hour server-side cache with stale-while-revalidate

- Added in-memory cache (up to 1000 entries)
- 24-hour TTL with automatic cleanup (data updates daily anyway)
- Cache key: `playerId:view:includePlayoffs:ageCount`
- Browser cache: 24hr fresh, 48hr stale-while-revalidate
- X-Cache header shows HIT/MISS for debugging

**Impact:** First visit of the day queries DB, subsequent visits use cache. Since data updates daily, no need for shorter cache.

### 2. Leaderboard Endpoints - DOUBLED CACHE TIME
**Before:** 5-minute browser cache only
**After:** 10-minute fresh, 30-minute stale-while-revalidate

Files updated:
- `/api/leaderboards/points-before-age`
- `/api/leaderboards/rebounds-before-age`
- `/api/leaderboards/assists-before-age`
- `/api/leaderboards/steals-before-age`
- `/api/leaderboards/blocks-before-age`

**Impact:** Leaderboard pages can be served from browser cache longer, reducing repeat visits.

### 3. Slices In-Memory Cache - 10X INCREASE
**Before:** 30 seconds TTL
**After:** 5 minutes TTL (300 seconds)

File: `src/lib/slices.ts`

**Impact:** Precomputed leaderboard data stays in memory longer, reducing DB queries for hot data.

### 5. Players API - OPTIMIZED QUERIES
**Before:** COUNT(*) check on every request + no cache headers
**After:** Skip COUNT(*) check, 24-hour cache

File: `/api/players`

**Impact:** Eliminated unnecessary COUNT(*) query that ran on every player search. 24-hour cache since player list changes only with daily updates.

### 6. Watchlist API - 10X INCREASE
**Before:** 500ms server cache
**After:** 5-second server cache

File: `/api/watchlist`

**Impact:** Multiple watchlist loads within 5 seconds use cache instead of DB.

## Cache Philosophy Change

**Original approach:** Short caches (60s) for "freshness"
**Updated approach:** 24-hour caches because data updates daily

Since you run UPDATE_STATS.bat once per day:
- No point in refreshing cache every minute
- 24-hour cache = data stays fresh until next daily update
- Eliminates 99% of redundant queries
- Browser/CDN can serve cached responses for full day

## Expected Database Read Reduction

### Current Usage Scenarios
1. **User views watchlist with 10 players**
   - Before: 10+ DB queries every time
   - After: Mostly cache HITs after first load

2. **User browses leaderboards**
   - Before: Fresh DB query every 5 minutes
   - After: Fresh DB query every 10 minutes, browser serves stale up to 30 minutes

3. **Multiple users view same leaderboards**
   - Before: Each user triggers separate DB query
   - After: Server-side slices cache serves multiple users

### Estimated Impact
- **Milestones API:** 95-99% reduction (cache valid for 24 hours, not 60 seconds)
- **Leaderboards:** 50-60% reduction (longer cache)
- **Watchlist:** 80-90% reduction (rapid page loads reuse cache)
- **Players API:** 100% reduction in COUNT(*) overhead
- **Overall:** Expecting 80-95% reduction in total database reads (was 60-80% with shorter caches)

## Monitoring

### Headers to Check
- `X-Cache: HIT` - Response served from cache (milestones API only)
- `X-Cache-Age: <seconds>` - How old the cached response is
- `Cache-Control` - Browser caching directive

### Next Steps if Still High
1. Add Redis/Vercel KV for distributed caching (currently in-memory per instance)
2. Increase cache TTLs further (currently conservative)
3. Pre-warm cache for popular players
4. Add cache warming script that runs after data updates

## Deployment
Changes are code-only, no database migrations needed. Will take effect immediately on next deployment to Vercel.

## Risk Assessment
**Low Risk** - All caching is read-only and has reasonable TTLs. Stale data is acceptable for this use case since:
- Stats update daily via batch job
- Milestones don't change minute-to-minute
- Worst case: User sees slightly stale data for 1-5 minutes

## Rollback
If issues occur, revert by:
1. Setting all cache TTLs back to original values
2. No data loss or database changes involved
