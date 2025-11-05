#!/usr/bin/env node

/**
 * Complete batch migration script for migrating entire local SQLite database to Turso
 * Handles large datasets in manageable chunks with progress tracking and error recovery
 */

import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const BATCH_SIZE = 1000; // Process records in batches of 1000
const RETRY_COUNT = 3;

interface MigrationConfig {
  tableName: string;
  orderBy?: string;
  chunkSize?: number;
  dependencies?: string[];
}

// Migration order - tables with dependencies come after their dependencies
const MIGRATION_TABLES: MigrationConfig[] = [
  { tableName: 'app_meta', chunkSize: 50 },
  { tableName: 'players', chunkSize: 500, orderBy: 'id' },
  { tableName: 'games', chunkSize: 1000, orderBy: 'game_id', dependencies: ['players'] },
  { tableName: 'player_stats', chunkSize: 1000, orderBy: 'game_id, player_id', dependencies: ['players', 'games'] },
  { tableName: 'game_summary', chunkSize: 1000, orderBy: 'game_id, player_id', dependencies: ['players'] },
  { tableName: 'season_totals_override', chunkSize: 100, orderBy: 'player_id, season', dependencies: ['players'] },
  { tableName: 'watchlist', chunkSize: 100, dependencies: ['players'] },
  { tableName: 'slices_top25', chunkSize: 100 }
];

class BatchMigrator {
  private localDb: Database.Database;
  private tursoDb: ReturnType<typeof createClient>;
  private stats = {
    tablesProcessed: 0,
    totalRecords: 0,
    errors: 0,
    startTime: Date.now()
  };

  constructor() {
    // Initialize local database connection
    this.localDb = new Database('data/app.sqlite');
    
    // Initialize Turso connection
    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
      throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in environment variables');
    }

    this.tursoDb = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });

    console.log('🚀 Batch migrator initialized');
    console.log(`📊 Local database: data/app.sqlite`);
    console.log(`🌐 Turso database: ${process.env.TURSO_DATABASE_URL}`);
  }

  async migrate(): Promise<void> {
    console.log('\n📋 Starting complete database migration...\n');

    try {
      // Get local table schemas and create them in Turso
      await this.createTablesInTurso();

      // Migrate each table in dependency order
      for (const config of MIGRATION_TABLES) {
        await this.migrateTable(config);
      }

      // Final verification
      await this.verifyMigration();

      this.printSummary();
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  }

  private async createTablesInTurso(): Promise<void> {
    console.log('🏗️  Creating table schemas in Turso...');
    
    // Get all table creation statements from local DB
    const schemaQuery = `
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%' 
      ORDER BY name
    `;
    
    const schemas = this.localDb.prepare(schemaQuery).all() as { sql: string }[];
    
    for (const { sql } of schemas) {
      if (sql) {
        try {
          await this.tursoDb.execute(sql);
          console.log(`✅ Created table: ${this.extractTableName(sql)}`);
        } catch (error) {
          console.log(`ℹ️  Table may already exist: ${this.extractTableName(sql)}`);
        }
      }
    }
  }

  private extractTableName(sql: string): string {
    const match = sql.match(/CREATE TABLE (\w+)/i);
    return match ? match[1] : 'unknown';
  }

  private async migrateTable(config: MigrationConfig): Promise<void> {
    const { tableName, orderBy, chunkSize = BATCH_SIZE } = config;
    
    console.log(`\n📦 Migrating table: ${tableName}`);
    
    // Get total count
    const countResult = this.localDb.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
    const totalRows = countResult.count;
    
    if (totalRows === 0) {
      console.log(`⏭️  Skipping empty table: ${tableName}`);
      return;
    }

    console.log(`📊 Total rows to migrate: ${totalRows.toLocaleString()}`);

    // Clear existing data in Turso table
    await this.tursoDb.execute(`DELETE FROM ${tableName}`);
    console.log(`🧹 Cleared existing data in ${tableName}`);

    let offset = 0;
    let migratedCount = 0;

    while (offset < totalRows) {
      const limit = Math.min(chunkSize, totalRows - offset);
      
      // Build query with ordering for consistent pagination
      let query = `SELECT * FROM ${tableName}`;
      if (orderBy) {
        query += ` ORDER BY ${orderBy}`;
      }
      query += ` LIMIT ${limit} OFFSET ${offset}`;

      const rows = this.localDb.prepare(query).all();
      
      if (rows.length === 0) break;

      // Insert batch into Turso
      await this.insertBatch(tableName, rows);
      
      migratedCount += rows.length;
      offset += limit;

      // Progress update
      const progress = Math.round((migratedCount / totalRows) * 100);
      process.stdout.write(`\r📈 Progress: ${migratedCount.toLocaleString()}/${totalRows.toLocaleString()} (${progress}%)`);
    }

    console.log(`\n✅ Completed migration of ${tableName}: ${migratedCount.toLocaleString()} records`);
    this.stats.tablesProcessed++;
    this.stats.totalRecords += migratedCount;
  }

  private async insertBatch(tableName: string, rows: any[]): Promise<void> {
    if (rows.length === 0) return;

    // Get column names from first row
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(',');
    const columnsList = columns.join(',');

    const insertSQL = `INSERT INTO ${tableName} (${columnsList}) VALUES (${placeholders})`;

    let retryCount = 0;
    while (retryCount < RETRY_COUNT) {
      try {
        // Use transaction for batch insert
        const transaction = this.tursoDb.transaction([
          ...rows.map(row => ({
            sql: insertSQL,
            args: columns.map(col => row[col])
          }))
        ]);

        await transaction;
        break; // Success, exit retry loop
      } catch (error) {
        retryCount++;
        this.stats.errors++;
        
        if (retryCount >= RETRY_COUNT) {
          console.error(`\n❌ Failed to insert batch into ${tableName} after ${RETRY_COUNT} retries:`, error);
          throw error;
        }
        
        console.log(`\n⚠️  Retry ${retryCount}/${RETRY_COUNT} for ${tableName} batch...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
      }
    }
  }

  private async verifyMigration(): Promise<void> {
    console.log('\n🔍 Verifying migration integrity...');

    for (const config of MIGRATION_TABLES) {
      const { tableName } = config;
      
      try {
        // Compare counts between local and Turso
        const localCount = this.localDb.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
        const tursoResult = await this.tursoDb.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
        const tursoCount = tursoResult.rows[0]?.count as number || 0;

        if (localCount.count === tursoCount) {
          console.log(`✅ ${tableName}: ${localCount.count.toLocaleString()} rows (match)`);
        } else {
          console.log(`⚠️  ${tableName}: Local=${localCount.count.toLocaleString()}, Turso=${tursoCount.toLocaleString()} (mismatch)`);
          this.stats.errors++;
        }
      } catch (error) {
        console.log(`❌ Failed to verify ${tableName}:`, error);
        this.stats.errors++;
      }
    }
  }

  private printSummary(): void {
    const elapsed = Date.now() - this.stats.startTime;
    const elapsedMin = Math.round(elapsed / 1000 / 60 * 100) / 100;

    console.log('\n' + '='.repeat(50));
    console.log('🎉 MIGRATION COMPLETE');
    console.log('='.repeat(50));
    console.log(`📊 Tables processed: ${this.stats.tablesProcessed}`);
    console.log(`📈 Total records migrated: ${this.stats.totalRecords.toLocaleString()}`);
    console.log(`⚠️  Errors encountered: ${this.stats.errors}`);
    console.log(`⏱️  Time elapsed: ${elapsedMin} minutes`);
    console.log(`🌐 Turso database ready at: ${process.env.TURSO_DATABASE_URL}`);
    console.log('='.repeat(50));

    if (this.stats.errors > 0) {
      console.log('⚠️  Please review errors above and consider re-running specific tables if needed.');
    } else {
      console.log('✅ Migration completed successfully with no errors!');
    }
  }

  close(): void {
    this.localDb.close();
  }
}

// Run migration if called directly
if (require.main === module) {
  const migrator = new BatchMigrator();
  
  migrator.migrate()
    .then(() => {
      migrator.close();
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      migrator.close();
      process.exit(1);
    });
}

export default BatchMigrator;