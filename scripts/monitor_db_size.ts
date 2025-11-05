#!/usr/bin/env node

/**
 * Database Size Monitor
 * Checks database size and provides optimization recommendations
 */

import fs from 'node:fs';
import path from 'node:path';

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function checkDatabaseSize() {
  const dbPath = path.resolve(process.cwd(), 'data', 'app.sqlite');
  
  if (!fs.existsSync(dbPath)) {
    console.log('❌ Database not found at', dbPath);
    return;
  }
  
  const stats = fs.statSync(dbPath);
  const sizeBytes = stats.size;
  const sizeFormatted = formatBytes(sizeBytes);
  const tursoLimitGB = 5;
  const tursoLimitBytes = tursoLimitGB * 1024 * 1024 * 1024;
  const percentageUsed = (sizeBytes / tursoLimitBytes) * 100;
  
  console.log('\n📊 Database Size Report');
  console.log('========================');
  console.log(`Current size: ${sizeFormatted}`);
  console.log(`Turso free tier limit: ${tursoLimitGB}GB`);
  console.log(`Usage: ${percentageUsed.toFixed(2)}% of free tier`);
  
  // Size recommendations
  if (percentageUsed < 20) {
    console.log('✅ Excellent - plenty of room to grow');
  } else if (percentageUsed < 50) {
    console.log('🟡 Good - consider monitoring growth');
  } else if (percentageUsed < 80) {
    console.log('🟠 Caution - approaching limit, consider optimization');
  } else {
    console.log('🔴 Warning - very close to limit, optimize immediately');
  }
  
  // Growth projections
  console.log('\n📈 Growth Projections:');
  const monthlyGrowthMB = 50; // Estimate 50MB per month of NBA data
  const monthsToLimit = Math.floor((tursoLimitBytes - sizeBytes) / (monthlyGrowthMB * 1024 * 1024));
  console.log(`At ~50MB/month growth: ${monthsToLimit} months until limit`);
  
  // Optimization suggestions
  if (percentageUsed > 30) {
    console.log('\n🛠️ Optimization Suggestions:');
    console.log('- Run VACUUM to compress database');
    console.log('- Archive old seasons (>5 years old)');
    console.log('- Remove inactive players with no recent stats');
    console.log('- Compress text fields where possible');
  }
}

if (require.main === module) {
  checkDatabaseSize();
}

export { checkDatabaseSize };