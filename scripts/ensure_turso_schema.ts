#!/usr/bin/env tsx
/**
 * Ensure Turso database has all required tables and indexes
 * Run this once after migration to set up the schema properly
 */

import { openDatabase, ensureCoreSchema, closeDatabase } from '../src/lib/database';

async function main() {
  console.log('Setting up Turso database schema...');
  
  const db = openDatabase();
  
  try {
    console.log('Creating tables and indexes...');
    await ensureCoreSchema(db);
    console.log('✅ Schema setup complete!');
  } catch (error) {
    console.error('❌ Schema setup failed:', error);
    process.exit(1);
  } finally {
    await closeDatabase(db);
  }
}

if (require.main === module) {
  main();
}