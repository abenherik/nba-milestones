# NBA Data Processing Patterns & Techniques

This document captures effective patterns and techniques extracted from the project's debug and analysis scripts.

## 1. Database Query Patterns

### Player Lookup with Aggregated Stats
```typescript
const rows = await dbAll<{ id: string; full_name: string; games: number; ast: number }>(db, `
  SELECT p.id, p.full_name, COUNT(s.game_id) AS games, COALESCE(SUM(s.assists), 0) AS ast
  FROM players p
  LEFT JOIN game_summary s ON s.player_id = p.id AND s.season_type = 'Regular Season'
  WHERE lower(p.full_name) = lower(?)
  GROUP BY p.id, p.full_name
  ORDER BY ast DESC
`, [name]);
```

### Season-by-Season Totals with Override Support
```typescript
// Boxscore totals by season (game_summary materialized)
const seasons = await dbAll<{ season: string; box: number }>(db, `
  SELECT season, COALESCE(SUM(${METRIC}), 0) AS box
  FROM game_summary
  WHERE player_id = ? AND season_type = 'Regular Season'
  GROUP BY season ORDER BY season
`, [PLAYER_ID]);

// Season overrides for League-adjusted data
const overrides = await dbAll<{ season: string; ovr: number }>(db, `
  SELECT season, COALESCE(${METRIC}, 0) AS ovr
  FROM season_totals_override
  WHERE player_id = ? AND season_type = 'Regular Season'
  ORDER BY season
`, [PLAYER_ID]);
```

## 2. NBA API Rate Limiting & Error Handling

### Robust HTTP Request Pattern
```typescript
const NBA_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.nba.com',
  'Referer': 'https://www.nba.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

async function fetchJson(url: string, timeoutMs = 12000, retries = 4, retryDelayMs = 1100) {
  const f = await getFetch();
  let err: unknown;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await f(url, { headers: NBA_HEADERS, signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) {
        if ((r.status === 429 || r.status === 403 || r.status >= 500) && i < retries) {
          await sleep(retryDelayMs * (i + 1));
          continue;
        }
        throw new Error(`HTTP ${r.status}`);
      }
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      err = e;
      if (i < retries) { await sleep(retryDelayMs * (i + 1)); continue; }
      throw e;
    }
  }
  throw err;
}
```

### Python Rate Limiting with Exponential Backoff
```python
def _should_retry_error(err: Exception) -> bool:
    msg = str(err).lower()
    markers = [
        "429", "too many requests", "timeout", "timed out", "connection reset",
        "temporary", "service unavailable", "503", "502", "bad gateway",
    ]
    return any(m in msg for m in markers)

def request_with_retries(callable_fn):
    last_err = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            time.sleep(SLEEP_SECONDS)
            return callable_fn()
        except Exception as e:
            last_err = e
            if attempt >= MAX_ATTEMPTS or not _should_retry_error(e):
                break
            delay = min(MAX_DELAY, BASE_DELAY * (2 ** (attempt - 1)))
            jitter = delay * random.uniform(0.2, 0.5)
            sleep_for = delay + jitter
            time.sleep(sleep_for)
    raise last_err
```

## 3. Data Validation Patterns

### Season Totals Validation
```typescript
interface SeasonTotals {
  games: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
}

// Validate our database totals against expected values
const ourTotals = await db.get(`
  SELECT 
    COUNT(*) as games,
    SUM(points) as points,
    SUM(rebounds) as rebounds,
    SUM(assists) as assists,
    SUM(steals) as steals,
    SUM(blocks) as blocks
  FROM player_stats 
  WHERE player_id = ? AND season = ?
`, [playerId, season]) as SeasonTotals;
```

## 4. Utility Functions

### Type-Safe Metric Validation
```typescript
type Metric = 'points' | 'rebounds' | 'assists' | 'steals' | 'blocks';

function asMetric(v: string): Metric {
  const m = v?.toLowerCase();
  if (m === 'points' || m === 'rebounds' || m === 'assists' || m === 'steals' || m === 'blocks') return m;
  throw new Error(`Invalid METRIC '${v}'. Expected one of points|rebounds|assists|steals|blocks`);
}

function num(n: unknown) { 
  const v = Number(n); 
  return Number.isFinite(v) ? v : 0; 
}
```

### Sleep & Jitter for Rate Limiting
```typescript
function sleep(ms: number) { return new Promise((res) => setTimeout(res, ms)); }
function jitter(ms: number) { 
  const j = Math.floor(Math.random() * Math.min(400, Math.max(50, ms * 0.4))); 
  return ms + j; 
}
```

## 5. Data Processing Best Practices

### Always Filter by Season Type
- Critical: Always use `season_type = 'Regular Season'` in queries
- Prevents mixing regular season and playoff data
- Ensures consistent milestone calculations

### Use Materialized Views
- The `game_summary` table provides optimized access to aggregated game data
- Prefer `game_summary` over raw `player_stats` for performance

### Handle Missing Data Gracefully
- Use `COALESCE(SUM(metric), 0)` to handle NULL aggregations
- Check for zero games before processing player data
- Validate data existence before calculations

### Environment-Driven Configuration
```typescript
const PLAYER_ID = String(process.env.PLAYER_ID || '').trim();
const METRIC = asMetric(String(process.env.METRIC || ''));
if (!PLAYER_ID) throw new Error('PLAYER_ID required');
```

## 6. Error Handling Patterns

### Comprehensive Error Detection
- Check for HTTP status codes: 429, 403, 500+
- Detect timeout and connection errors
- Implement exponential backoff with jitter
- Log meaningful error context for debugging

### Database Connection Management
```typescript
const db = openSqlite();
await ensureCoreSchema(db);
// ... operations
db.close(); // Always close connections
```

This knowledge base captures the most effective patterns from the debugging scripts and should be referenced when implementing new data processing features.