import { NextResponse } from 'next/server';
import { openDatabase } from '@/lib/database';
import Database from 'better-sqlite3';

const BATCH_SIZE = 1000;
const MIGRATION_TABLES = [
  { tableName: 'app_meta', chunkSize: 50 },
  { tableName: 'players', chunkSize: 500, orderBy: 'id' },
  { tableName: 'games', chunkSize: 1000, orderBy: 'game_id' },
  { tableName: 'player_stats', chunkSize: 1000, orderBy: 'game_id, player_id' },
  { tableName: 'game_summary', chunkSize: 1000, orderBy: 'game_id, player_id' },
  { tableName: 'season_totals_override', chunkSize: 100, orderBy: 'player_id, season' },
  { tableName: 'watchlist', chunkSize: 100 },
  { tableName: 'slices_top25', chunkSize: 100 }
];

export async function POST(request: Request) {
  try {
    const { key, action } = await request.json();
    
    // Security check
    if (key !== 'full-migration-2024') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await openDatabase();
    
    if (action === 'status') {
      // Get current status of each table
      const status = [];
      for (const { tableName } of MIGRATION_TABLES) {
        try {
          const result = await db.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
          status.push({
            table: tableName,
            count: result.rows[0]?.count || 0
          });
        } catch (error) {
          status.push({
            table: tableName,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      return NextResponse.json({ 
        message: 'Current Turso database status',
        tables: status,
        environment: process.env.NODE_ENV,
        hasLocalFile: false, // Production won't have local SQLite
        tursoConnected: true
      });
    }

    if (action === 'clear') {
      // Clear all data from Turso tables
      const results = [];
      for (const { tableName } of MIGRATION_TABLES) {
        try {
          await db.execute(`DELETE FROM ${tableName}`);
          results.push({ table: tableName, cleared: true });
        } catch (error) {
          results.push({ 
            table: tableName, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }
      
      return NextResponse.json({
        message: 'Cleared all tables in preparation for migration',
        results
      });
    }

    return NextResponse.json({ 
      error: 'Invalid action. Use: status, clear' 
    }, { status: 400 });

  } catch (error) {
    console.error('Migration API error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}