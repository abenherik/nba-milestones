#!/usr/bin/env node

/**
 * Turso Migration Script
 * Uploads local SQLite data to Turso database
 */

import { createClient } from '@libsql/client';
import fs from 'node:fs';

async function migrateToTurso() {
  const DATABASE_URL = process.env.TURSO_DATABASE_URL;
  const AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;
  
  if (!DATABASE_URL || !AUTH_TOKEN) {
    console.error('❌ Missing environment variables:');
    console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN');
    console.error('Example:');
    console.error('set TURSO_DATABASE_URL=libsql://your-db.turso.io');
    console.error('set TURSO_AUTH_TOKEN=your-token-here');
    process.exit(1);
  }
  
  console.log('🔄 Connecting to Turso database...');
  
  const client = createClient({
    url: DATABASE_URL,
    authToken: AUTH_TOKEN,
  });
  
  try {
    // Test connection
    await client.execute('SELECT 1');
    console.log('✅ Connected to Turso successfully');
    
    // Read the exported SQL file
    if (!fs.existsSync('export.sql')) {
      console.error('❌ export.sql not found. Run: data\\sqlite3.exe data\\app.sqlite .dump > export.sql');
      process.exit(1);
    }
    
    console.log('📂 Reading export.sql...');
    const sqlContent = fs.readFileSync('export.sql', 'utf-8');
    
    // Split into individual statements more carefully
    // Handle multi-line statements and avoid splitting on ';' inside string literals
    const statements = [];
    let currentStatement = '';
    let inStringLiteral = false;
    let stringChar = '';
    
    for (let i = 0; i < sqlContent.length; i++) {
      const char = sqlContent[i];
      const prevChar = i > 0 ? sqlContent[i - 1] : '';
      
      if (!inStringLiteral && (char === "'" || char === '"')) {
        inStringLiteral = true;
        stringChar = char;
      } else if (inStringLiteral && char === stringChar && prevChar !== '\\') {
        inStringLiteral = false;
        stringChar = '';
      }
      
      currentStatement += char;
      
      if (!inStringLiteral && char === ';') {
        const stmt = currentStatement.trim();
        if (stmt && !stmt.startsWith('--') && stmt !== 'BEGIN TRANSACTION;' && stmt !== 'COMMIT;') {
          statements.push(stmt.replace(/;$/, '')); // Remove trailing semicolon
        }
        currentStatement = '';
      }
    }
    
    // Add any remaining statement
    if (currentStatement.trim()) {
      const stmt = currentStatement.trim();
      if (stmt && !stmt.startsWith('--')) {
        statements.push(stmt);
      }
    }
    
    console.log(`📊 Found ${statements.length} SQL statements to execute`);
    
    // Execute statements one by one with better error handling
    let executed = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) continue;
      
      try {
        await client.execute(stmt);
        executed++;
        
        if (executed % 50 === 0) {
          console.log(`⏳ Executed ${executed}/${statements.length} statements...`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Skip certain expected errors
        if (errorMessage.includes('already exists') || 
            errorMessage.includes('UNIQUE constraint failed') ||
            errorMessage.includes('no such table') && stmt.includes('PRAGMA')) {
          // Skip these silently
        } else {
          console.warn(`⚠️  Statement ${i + 1}: ${errorMessage}`);
          console.warn(`Statement: ${stmt.substring(0, 100)}...`);
        }
      }
      
      // Small delay to avoid rate limits
      if (executed % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    console.log(`✅ Migration complete! Executed ${executed} statements`);
    
    // Verify data
    const result = await client.execute('SELECT COUNT(*) as count FROM players');
    const playerCount = result.rows[0]?.count || 0;
    console.log(`📊 Verification: ${playerCount} players in database`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Migration failed:', errorMessage);
    process.exit(1);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  migrateToTurso().catch(console.error);
}

export { migrateToTurso };