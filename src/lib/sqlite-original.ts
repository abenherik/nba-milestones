import path from 'node:path';
import fs from 'node:fs';
import sqlite3 from 'sqlite3';

export type SqliteDb = sqlite3.Database;

export function openSqlite(dbPath?: string): SqliteDb {
  const candidate = dbPath
    || process.env.SQLITE_DB_PATH
    || path.resolve(process.cwd(), 'data', 'app.sqlite');
  // Ensure parent dir exists
  fs.mkdirSync(path.dirname(candidate), { recursive: true });
  const db = new sqlite3.Database(candidate);
  // Set pragmas for optimal performance
  db.serialize(() => {
    db.run('PRAGMA journal_mode=WAL');
    db.run('PRAGMA synchronous=NORMAL');
    db.run('PRAGMA foreign_keys=ON');
    
    // Performance optimizations
    db.run('PRAGMA temp_store=MEMORY');
    db.run('PRAGMA mmap_size=268435456'); // 256MB memory map
    db.run('PRAGMA page_size=4096');
    db.run('PRAGMA optimize');
    
    // Optional low-memory tuning
    const lowMem = process.env.SQLITE_LOW_MEM === '1' || process.env.LOWMEM === '1';
    const cacheKb = Number(process.env.SQLITE_CACHE_KB || 0);
    if (process.env.SQLITE_TMPDIR) {
      process.env.TMPDIR = process.env.SQLITE_TMPDIR;
      process.env.TEMP = process.env.SQLITE_TMPDIR;
      process.env.TMP = process.env.SQLITE_TMPDIR;
    }
    if (cacheKb > 0) {
      // Negative value means KB units
      db.run(`PRAGMA cache_size=${-Math.abs(cacheKb)}`);
    } else if (lowMem) {
      // Default ~8MB cache in low-mem mode
      db.run('PRAGMA cache_size=-8000');
    }
    if (lowMem) {
      db.run('PRAGMA temp_store=FILE');
      db.run('PRAGMA mmap_size=0');
    }
  });
  return db;
}

export function dbRun(db: SqliteDb, sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

export function dbAll<T = unknown>(db: SqliteDb, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
  });
}

export async function ensureCoreSchema(db: SqliteDb) {
  // Core tables (minimal) to support per-game stats
  await dbRun(db, `CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    is_active INTEGER,
    birthdate TEXT
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS games (
    game_id TEXT PRIMARY KEY,
    game_date TEXT NOT NULL
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS player_stats (
    game_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    season TEXT,
    season_type TEXT,
    minutes TEXT,
    points INTEGER DEFAULT 0,
    rebounds INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    blocks INTEGER DEFAULT 0,
    steals INTEGER DEFAULT 0,
    PRIMARY KEY (game_id, player_id),
    FOREIGN KEY (game_id) REFERENCES games(game_id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
  )`);

  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_stats(player_id)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_player_stats_season ON player_stats(season, season_type)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_games_date ON games(game_date)`);

  // Materialized summary table (one-stop shop)
  await dbRun(db, `CREATE TABLE IF NOT EXISTS game_summary (
    player_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    game_id TEXT NOT NULL,
    game_date TEXT NOT NULL,
    season TEXT,
    season_type TEXT,
    points INTEGER DEFAULT 0,
    rebounds INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    blocks INTEGER DEFAULT 0,
    steals INTEGER DEFAULT 0,
    age_at_game_years INTEGER,
    PRIMARY KEY (game_id, player_id)
  )`);

  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_summary_player ON game_summary(player_id)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_summary_age ON game_summary(age_at_game_years)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_summary_points ON game_summary(points)`);
  // New composite indexes to accelerate common queries
  // Filter by season_type and age_at_game_years (used by leaderboards and watchlist)
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_summary_seasontype_age ON game_summary(season_type, age_at_game_years)`);
  // Optional: benefit queries that filter by player, season_type, and age together
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_summary_player_seasontype_age ON game_summary(player_id, season_type, age_at_game_years)`);

  // Lightweight watchlist (local-only)
  await dbRun(db, `CREATE TABLE IF NOT EXISTS watchlist (
    player_id TEXT PRIMARY KEY,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
  )`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_watchlist_created ON watchlist(created_at)`);

  // App metadata (for versioned publish, cache versioning, etc.)
  await dbRun(db, `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // Precomputed Top-25 slices (versioned publish)
  await dbRun(db, `CREATE TABLE IF NOT EXISTS slices_top25 (
    version TEXT NOT NULL,
    slice_key TEXT NOT NULL,
    season_group TEXT NOT NULL, -- 'RS' or 'ALL'
    age INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    player_id TEXT NOT NULL,
    player_name TEXT NOT NULL,
    value INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (version, slice_key, season_group, age, rank)
  )`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_slices_lookup ON slices_top25(version, slice_key, season_group, age)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_slices_player ON slices_top25(version, slice_key, season_group, age, player_id)`);
  // Helpful for ordered retrieval in mega-batch queries
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_slices_v_s_a_rank ON slices_top25(version, season_group, slice_key, age, rank)`);
}
