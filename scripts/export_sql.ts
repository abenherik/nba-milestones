#!/usr/bin/env node

/**
 * Export local SQLite data as SQL INSERT statements
 * These can then be executed against Turso via production API
 */

import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';

class SQLExporter {
  private db: Database.Database;

  constructor() {
    this.db = new Database('data/app.sqlite');
    console.log('📊 SQLite Data Exporter initialized');
  }

  exportTableData(tableName: string): string {
    console.log(`\n📦 Exporting ${tableName}...`);

    // Get column info
    const columns = this.db.pragma(`table_info(${tableName})`) as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: any;
      pk: number;
    }>;

    const columnNames = columns.map(col => col.name);
    
    // Get all data
    const rows = this.db.prepare(`SELECT * FROM ${tableName}`).all();
    
    if (rows.length === 0) {
      console.log(`⏭️  ${tableName} is empty, skipping`);
      return '';
    }

    console.log(`📊 ${tableName}: ${rows.length.toLocaleString()} rows`);

    // Generate SQL statements
    const sqlStatements = [];
    
    // Clear existing data
    sqlStatements.push(`-- Clear existing data from ${tableName}`);
    sqlStatements.push(`DELETE FROM ${tableName};`);
    sqlStatements.push('');

    // Batch insert statements
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      sqlStatements.push(`-- Insert batch ${Math.floor(i / batchSize) + 1} for ${tableName}`);
      sqlStatements.push(`INSERT INTO ${tableName} (${columnNames.join(', ')}) VALUES`);
      
      const valueRows = batch.map(row => {
        const values = columnNames.map(col => {
          const value = row[col];
          if (value === null) return 'NULL';
          if (typeof value === 'string') {
            // Escape single quotes
            return `'${value.replace(/'/g, "''")}'`;
          }
          return value;
        });
        return `  (${values.join(', ')})`;
      });
      
      sqlStatements.push(valueRows.join(',\n') + ';');
      sqlStatements.push('');
    }

    return sqlStatements.join('\n');
  }

  exportAll(): void {
    console.log('🚀 Starting full database export...\n');

    const tables = [
      'app_meta',
      'players', 
      'games',
      'player_stats',
      'game_summary', 
      'season_totals_override',
      'watchlist',
      'slices_top25'
    ];

    let fullExport = '';
    fullExport += '-- NBA Milestones Database Export\n';
    fullExport += `-- Generated: ${new Date().toISOString()}\n`;
    fullExport += '-- This file contains all data from local SQLite database\n\n';

    fullExport += '-- Disable foreign key checks during import\n';
    fullExport += 'PRAGMA foreign_keys = OFF;\n\n';

    let totalRecords = 0;

    for (const tableName of tables) {
      try {
        const tableSQL = this.exportTableData(tableName);
        if (tableSQL) {
          fullExport += `-- ========================================\n`;
          fullExport += `-- TABLE: ${tableName}\n`;
          fullExport += `-- ========================================\n\n`;
          fullExport += tableSQL;
          fullExport += '\n';
          
          // Count records
          const count = this.db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
          totalRecords += count.count;
        }
      } catch (error) {
        console.error(`❌ Error exporting ${tableName}:`, error);
      }
    }

    fullExport += '\n-- Re-enable foreign key checks\n';
    fullExport += 'PRAGMA foreign_keys = ON;\n\n';
    fullExport += `-- Export complete: ${totalRecords.toLocaleString()} total records\n`;

    // Write to file
    const filename = `export_${Date.now()}.sql`;
    writeFileSync(filename, fullExport);

    console.log('\n' + '='.repeat(50));
    console.log('📄 EXPORT COMPLETE');
    console.log('='.repeat(50));
    console.log(`📁 File: ${filename}`);
    console.log(`📊 Total records: ${totalRecords.toLocaleString()}`);
    console.log(`💾 File size: ${Math.round(fullExport.length / 1024)} KB`);
    console.log('='.repeat(50));
  }

  close(): void {
    this.db.close();
  }
}

const exporter = new SQLExporter();
exporter.exportAll();
exporter.close();