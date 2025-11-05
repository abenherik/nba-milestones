#!/usr/bin/env node

/**
 * Final verification of migration completion
 */

import { createClient } from '@libsql/client';
import Database from 'better-sqlite3';
import * as dotenv from 'dotenv';

dotenv.config();

async function finalVerification() {
  console.log('🔍 Final migration verification...\n');
  
  const localDb = new Database('data/app.sqlite');
  const tursoDb = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  const tables = [
    'players',
    'games', 
    'game_summary',
    'player_stats',
    'season_totals_override',
    'app_meta',
    'watchlist',
    'slices_top25'
  ];

  let totalLocal = 0;
  let totalTurso = 0;
  let allMatched = true;

  console.log('📊 Table-by-table verification:');
  console.log('='.repeat(60));

  for (const table of tables) {
    try {
      const localCount = localDb.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
      const tursoResult = await tursoDb.execute(`SELECT COUNT(*) as count FROM ${table}`);
      const tursoCount = tursoResult.rows[0]?.count || 0;

      totalLocal += localCount;
      totalTurso += tursoCount;

      const match = localCount === tursoCount;
      if (!match) allMatched = false;

      const icon = match ? '✅' : '❌';
      const status = match ? 'MATCH' : 'MISMATCH';
      
      console.log(`${icon} ${table.padEnd(20)} | Local: ${localCount.toLocaleString().padStart(8)} | Turso: ${tursoCount.toLocaleString().padStart(8)} | ${status}`);
    } catch (error) {
      console.log(`❌ ${table.padEnd(20)} | Error: ${error}`);
      allMatched = false;
    }
  }

  console.log('='.repeat(60));
  console.log(`📈 TOTALS                | Local: ${totalLocal.toLocaleString().padStart(8)} | Turso: ${totalTurso.toLocaleString().padStart(8)}`);
  
  if (allMatched) {
    console.log('\n🎉 MIGRATION FULLY SUCCESSFUL!');
    console.log('✅ All tables match perfectly between local and Turso');
    console.log(`📊 Total records migrated: ${totalTurso.toLocaleString()}`);
  } else {
    console.log('\n⚠️  Some mismatches found - please review above');
  }

  console.log('\n🌐 Production app ready at:');
  console.log('https://nba-milestones-20250822-123137-iapay4l0f-abenheriks-projects.vercel.app');

  localDb.close();
}

finalVerification().catch(console.error);