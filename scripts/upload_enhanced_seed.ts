#!/usr/bin/env node

/**
 * Upload enhanced seed data to production via API
 */

import { readFileSync } from 'fs';
import fetch from 'node-fetch';

const API_BASE = 'https://nba-milestones-20250822-123137-o1ycjxw4b-abenheriks-projects.vercel.app';

async function uploadSeedData(filename: string) {
  console.log(`📁 Loading seed file: ${filename}`);
  
  const seedData = JSON.parse(readFileSync(filename, 'utf-8'));
  console.log('📊 Seed metadata:', seedData.metadata);
  
  console.log('📤 Uploading to production...');
  
  try {
    const response = await fetch(`${API_BASE}/api/enhanced-seed`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        key: 'enhanced-seed-2024',
        seedData
      })
    });

    if (!response.ok) {
      console.error(`❌ Upload failed: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('Error response:', errorText.substring(0, 500));
      return false;
    }

    const result = await response.json();
    
    console.log('\n' + '='.repeat(50));
    console.log('🎉 SEED UPLOAD COMPLETE');
    console.log('='.repeat(50));
    console.log(`👥 Players imported: ${result.results.players}`);
    console.log(`🏀 Games imported: ${result.results.games}`);
    console.log(`📊 Player stats: ${result.results.playerStats}`);
    console.log(`📋 Game summaries: ${result.results.gameSummary}`);
    console.log(`🔧 Season overrides: ${result.results.seasonOverrides}`);
    console.log(`📈 Total records: ${result.totalRecords?.toLocaleString()}`);
    
    if (result.hasErrors) {
      console.log(`⚠️  Errors encountered: ${result.results.errors.length}`);
      console.log('Sample errors:', result.errorSample);
    } else {
      console.log('✅ No errors encountered');
    }
    
    console.log(`🌐 Test app: ${API_BASE}`);
    console.log('='.repeat(50));
    
    return true;
    
  } catch (error) {
    console.error('❌ Upload error:', error);
    return false;
  }
}

// Get filename from command line
const args = process.argv.slice(2);
let filename = args[0];

if (!filename) {
  // Auto-detect latest focused seed file (smaller, more reliable)
  const { readdirSync } = require('fs');
  const files = readdirSync('.')
    .filter((file: string) => file.startsWith('focused_seed_') && file.endsWith('.json'))
    .sort()
    .reverse();
  
  filename = files[0];
  if (!filename) {
    console.error('❌ No seed file found. Run generate_enhanced_seed.ts first.');
    process.exit(1);
  }
  console.log(`🎯 Auto-detected: ${filename}`);
}

uploadSeedData(filename).then(success => {
  process.exit(success ? 0 : 1);
});