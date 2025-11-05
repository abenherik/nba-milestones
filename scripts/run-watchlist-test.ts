#!/usr/bin/env node
/**
 * Quick script to run watchlist E2E test and report results
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

console.log('🧪 NBA Milestones - Automated Watchlist Test');
console.log('='.repeat(50));

const testCommand = 'npx';
const testArgs = ['playwright', 'test', 'watchlist-flow.test.ts', '--reporter=list'];

console.log(`Running: ${testCommand} ${testArgs.join(' ')}`);
console.log('');

const testProcess = spawn(testCommand, testArgs, {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd()
});

testProcess.on('close', (code) => {
  console.log('');
  console.log('='.repeat(50));
  
  if (code === 0) {
    console.log('✅ All watchlist tests passed!');
    console.log('📊 Performance benchmarks met');
    console.log('🎯 Watchlist functionality is working correctly');
  } else {
    console.log(`❌ Tests failed with exit code: ${code}`);
    console.log('🔍 Check the test output above for details');
    
    // Try to read test results if available
    const resultsPath = join(process.cwd(), 'test-results', 'results.json');
    if (existsSync(resultsPath)) {
      try {
        const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
        console.log(`📊 Test Summary: ${results.stats?.expected || 0} passed, ${results.stats?.failed || 0} failed`);
      } catch (e) {
        // Ignore JSON parse errors
      }
    }
  }
  
  console.log('');
  console.log('📝 To view detailed test report: npm run test:e2e:report');
  console.log('🎥 To run tests with visible browser: npm run test:watchlist:headed');
  console.log('');
  
  process.exit(code);
});

testProcess.on('error', (error) => {
  console.error('❌ Failed to run tests:', error.message);
  process.exit(1);
});