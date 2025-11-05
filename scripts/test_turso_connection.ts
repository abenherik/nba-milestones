#!/usr/bin/env node

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  console.log('🧪 Testing Turso connection...');
  console.log(`📡 URL: ${process.env.TURSO_DATABASE_URL}`);
  console.log(`🔑 Token: ${process.env.TURSO_AUTH_TOKEN ? 'Set (length: ' + process.env.TURSO_AUTH_TOKEN.length + ')' : 'Not set'}`);

  try {
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });

    // Test simple query
    const result = await client.execute('SELECT COUNT(*) as count FROM players');
    console.log('✅ Connection successful!');
    console.log(`📊 Current players in Turso: ${result.rows[0]?.count || 0}`);

    // Test table list
    const tables = await client.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%' 
      ORDER BY name
    `);
    console.log('📋 Tables in Turso:', tables.rows.map(r => r.name).join(', '));

    return true;
  } catch (error) {
    console.error('❌ Connection failed:', error);
    return false;
  }
}

testConnection().then((success) => {
  process.exit(success ? 0 : 1);
});