import path from 'node:path';
import fs from 'node:fs';
import sqlite3 from 'sqlite3';
import { createClient, Client as LibSQLClient } from '@libsql/client';

export type SqliteDb = sqlite3.Database;
export type LibSQLDb = LibSQLClient;
export type DatabaseConnection = SqliteDb | LibSQLDb;

// Reuse a single Turso client per process to avoid unnecessary reconnect overhead.
let tursoClient: LibSQLClient | null = null;

// Type guards
function isLibSQLClient(db: DatabaseConnection): db is LibSQLDb {
  return 'execute' in db && typeof db.execute === 'function';
}

// Global flag to force reads to primary database (for read-after-write consistency)
let forcePrimaryReads = false;
let forcePrimaryUntil = 0;

export function setForcePrimaryReads(durationMs: number = 15000) {
  forcePrimaryReads = true;
  forcePrimaryUntil = Date.now() + durationMs;
  console.log(`[Database] Forcing primary reads for ${durationMs}ms`);
}

export function openDatabase(): DatabaseConnection {
  // Debug logging
  console.log('Database connection debug:', {
    NODE_ENV: process.env.NODE_ENV,
    hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
    hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
    tursoUrlPrefix: process.env.TURSO_DATABASE_URL?.substring(0, 20),
    forcePrimaryReads,
    forcePrimaryUntil: forcePrimaryUntil > Date.now() ? forcePrimaryUntil - Date.now() : 0
  });
  
  // Check if forced primary reads have expired
  if (forcePrimaryReads && Date.now() > forcePrimaryUntil) {
    forcePrimaryReads = false;
    console.log('[Database] Primary read forcing expired, returning to normal');
  }
  
  // Check if we should use Turso (in production OR when explicitly configured with credentials)
  const shouldUseTurso = process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN;
  
  if (shouldUseTurso) {
    let url = process.env.TURSO_DATABASE_URL!;
    // Vercel serverless works best with https:// RPC instead of libsql:// websockets
    if (process.env.VERCEL && url.startsWith('libsql://')) {
      url = url.replace('libsql://', 'https://');
    }
    
    console.log(`[Database] Using Turso database${forcePrimaryReads ? ' (FORCE PRIMARY - note: may still hit replicas)' : ''}`);
    if (!tursoClient) {
      tursoClient = createClient({
        url: url,
        authToken: process.env.TURSO_AUTH_TOKEN!,
      });
    }
    return tursoClient;
  }
  
  // If on Vercel but missing Turso credentials, do NOT hang by hitting local sqlite!
  if (process.env.VERCEL && !shouldUseTurso) {
    throw new Error("Cannot use local SQLite on Vercel. Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN.");
  }
  
  // Fall back to local SQLite
  console.log('Using local SQLite (fallback)');
  const dbPath = process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), 'data', 'app.sqlite');
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  
  const db = new sqlite3.Database(dbPath);
  
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
      db.run(`PRAGMA cache_size=${-Math.abs(cacheKb)}`);
    } else if (lowMem) {
      db.run('PRAGMA cache_size=-8000');
    }
    if (lowMem) {
      db.run('PRAGMA temp_store=FILE');
      db.run('PRAGMA mmap_size=0');
    }
  });
  
  return db;
}

// Unified query functions that work with both database types
export function dbRun(db: DatabaseConnection, sql: string, params: unknown[] = []): Promise<void> {
  if (isLibSQLClient(db)) {
    return db.execute({ sql, args: params as any[] }).then(() => void 0);
  } else {
    return new Promise((resolve, reject) => {
      db.run(sql, params, (err) => (err ? reject(err) : resolve()));
    });
  }
}

export type DbExecResult = { rowsAffected: number };

export async function dbExec(db: DatabaseConnection, sql: string, params: unknown[] = []): Promise<DbExecResult> {
  if (isLibSQLClient(db)) {
    const result: any = await db.execute({ sql, args: params as any[] });
    return { rowsAffected: Number(result?.rowsAffected ?? 0) };
  }

  return new Promise((resolve, reject) => {
    db.run(sql, params, function (this: sqlite3.RunResult, err) {
      if (err) return reject(err);
      resolve({ rowsAffected: Number(this.changes ?? 0) });
    });
  });
}

export async function dbBatch(db: DatabaseConnection, statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
  if (!statements.length) return;

  if (isLibSQLClient(db)) {
    if (process.env.DEBUG?.includes('db')) {
      console.log(`[Database] libsql batch: ${statements.length} statements`);
    }
    await db.batch(
      statements.map(s => ({ sql: s.sql, args: (s.params ?? []) as any[] })),
      'deferred'
    );
    return;
  }

  // Local sqlite fallback: run sequentially.
  for (const s of statements) {
    await dbRun(db, s.sql, s.params ?? []);
  }
}

export function dbAll<T = unknown>(db: DatabaseConnection, sql: string, params: unknown[] = []): Promise<T[]> {
  if (isLibSQLClient(db)) {
    return db.execute({ sql, args: params as any[] }).then(result => result.rows as T[]);
  } else {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
    });
  }
}

export function closeDatabase(db: DatabaseConnection): Promise<void> {
  if (isLibSQLClient(db)) {
    // LibSQL (Turso) client is reused across requests; do not close per-request.
    // Closing it will break subsequent calls within the same process.
    return Promise.resolve();
  } else {
    return new Promise((resolve) => {
      db.close(() => resolve());
    });
  }
}

export async function closeTursoClient(): Promise<void> {
  if (!tursoClient) return;
  const clientToClose = tursoClient;
  tursoClient = null;
  await clientToClose.close();
}

// Legacy compatibility functions
export const openSqlite = openDatabase;

export async function ensureCoreSchema(db: DatabaseConnection) {
  // Core tables (minimal) to support per-game stats.
  // For Turso (libsql), use a single batch request to avoid rate limits.
  const schemaStatements: Array<{ sql: string; params?: unknown[] }> = [
    {
      sql: `CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        is_active INTEGER,
        birthdate TEXT
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS games (
        game_id TEXT PRIMARY KEY,
        game_date TEXT NOT NULL
      )`,
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS player_stats (
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
      )`,
    },

    // Indexes
    { sql: `CREATE INDEX IF NOT EXISTS idx_players_name ON players(full_name)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_players_active ON players(is_active)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_stats(player_id)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_player_stats_season ON player_stats(season, season_type)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_games_date ON games(game_date)` },

    // Materialized summary table
    {
      sql: `CREATE TABLE IF NOT EXISTS game_summary (
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
      )`,
    },
    { sql: `CREATE INDEX IF NOT EXISTS idx_summary_player ON game_summary(player_id)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_summary_season ON game_summary(season, season_type)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_summary_age ON game_summary(age_at_game_years)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_summary_player_season ON game_summary(player_id, season_type)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_summary_milestones ON game_summary(points, rebounds, assists, steals, blocks)` },

    // Season totals with override capability
    {
      sql: `CREATE TABLE IF NOT EXISTS season_totals_override (
        player_id TEXT NOT NULL,
        season TEXT NOT NULL,
        season_type TEXT NOT NULL,
        points INTEGER DEFAULT 0,
        rebounds INTEGER DEFAULT 0,
        assists INTEGER DEFAULT 0,
        blocks INTEGER DEFAULT 0,
        steals INTEGER DEFAULT 0,
        games_played INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (player_id, season, season_type)
      )`,
    },

    // Watchlist
    {
      sql: `CREATE TABLE IF NOT EXISTS watchlist (
        player_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (player_id),
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
      )`,
    },
    { sql: `CREATE INDEX IF NOT EXISTS idx_watchlist_created ON watchlist(created_at)` },

    // App metadata
    {
      sql: `CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      )`,
    },

    // Precomputed slices
    {
      sql: `CREATE TABLE IF NOT EXISTS slices_top25 (
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
      )`,
    },
    { sql: `CREATE INDEX IF NOT EXISTS idx_slices_lookup ON slices_top25(version, slice_key, season_group, age)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_slices_player ON slices_top25(version, slice_key, season_group, age, player_id)` },
    { sql: `CREATE INDEX IF NOT EXISTS idx_slices_v_s_a_rank ON slices_top25(version, season_group, slice_key, age, rank)` },
  ];

  await dbBatch(db, schemaStatements);
}

const coreSchemaOnce = new Map<string, Promise<void>>();

function coreSchemaKey(): string {
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    return `turso:${process.env.TURSO_DATABASE_URL}`;
  }
  const dbPath = process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), 'data', 'app.sqlite');
  return `sqlite:${dbPath}`;
}

export function ensureCoreSchemaOnce(db: DatabaseConnection): Promise<void> {
  const key = coreSchemaKey();
  const existing = coreSchemaOnce.get(key);
  if (existing) return existing;

  if (process.env.DEBUG?.includes('db')) {
    console.log(`[Database] ensureCoreSchemaOnce: running schema setup for ${key}`);
  }

  const p = ensureCoreSchema(db).catch(err => {
    coreSchemaOnce.delete(key);
    throw err;
  });
  coreSchemaOnce.set(key, p);
  return p;
}