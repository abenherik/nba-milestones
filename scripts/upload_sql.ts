#!/usr/bin/env node

/**
 * Upload exported SQL data to Turso via production API
 */

import { readFileSync } from 'fs';
import fetch from 'node-fetch';

const API_BASE = 'https://nba-milestones-20250822-123137-39g41a22k-abenheriks-projects.vercel.app';
const SQL_KEY = 'sql-import-2024';
const CHUNK_SIZE = 50000; // Characters per chunk to avoid timeouts

class SQLUploader {
  private sqlContent: string;
  private chunks: string[] = [];

  constructor(filename: string) {
    console.log(`📄 Loading SQL file: ${filename}`);
    this.sqlContent = readFileSync(filename, 'utf-8');
    console.log(`📊 File size: ${Math.round(this.sqlContent.length / 1024)} KB`);
    
    this.prepareChunks();
  }

  private prepareChunks(): void {
    console.log('✂️  Preparing SQL chunks...');
    
    // Split by statements but keep them reasonable for HTTP requests
    const statements = this.sqlContent.split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    console.log(`📋 Total SQL statements: ${statements.length.toLocaleString()}`);

    let currentChunk = '';
    let chunkCount = 0;

    for (const statement of statements) {
      const statementWithSemicolon = statement + ';';
      
      // If adding this statement would exceed chunk size, save current chunk
      if (currentChunk.length + statementWithSemicolon.length > CHUNK_SIZE && currentChunk.length > 0) {
        this.chunks.push(currentChunk);
        currentChunk = statementWithSemicolon;
        chunkCount++;
      } else {
        currentChunk += '\n' + statementWithSemicolon;
      }
    }

    // Add final chunk
    if (currentChunk.trim().length > 0) {
      this.chunks.push(currentChunk);
      chunkCount++;
    }

    console.log(`📦 Created ${this.chunks.length} chunks`);
    console.log(`📏 Average chunk size: ${Math.round(this.sqlContent.length / this.chunks.length / 1024)} KB`);
  }

  async upload(): Promise<void> {
    console.log('\n🚀 Starting SQL upload to production...\n');

    let totalInserted = 0;
    let totalErrors = 0;

    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      const chunkNum = i + 1;
      
      console.log(`📤 Uploading chunk ${chunkNum}/${this.chunks.length}...`);
      
      try {
        const response = await fetch(`${API_BASE}/api/sql-import`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            key: SQL_KEY,
            sql: chunk,
            chunk: chunkNum
          })
        });

        if (!response.ok) {
          console.error(`❌ Chunk ${chunkNum} failed: ${response.status} ${response.statusText}`);
          const errorText = await response.text();
          console.error('Error response:', errorText.substring(0, 200));
          totalErrors++;
          continue;
        }

        const result = await response.json();
        console.log(`✅ Chunk ${chunkNum}: ${result.executed} statements, ${result.totalInserted} rows`);
        
        totalInserted += result.totalInserted || 0;
        totalErrors += result.errors || 0;

        // Brief pause between chunks
        if (i < this.chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error) {
        console.error(`❌ Chunk ${chunkNum} error:`, error);
        totalErrors++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('🎉 SQL UPLOAD COMPLETE');
    console.log('='.repeat(50));
    console.log(`📦 Chunks processed: ${this.chunks.length}`);
    console.log(`📊 Total rows inserted: ${totalInserted.toLocaleString()}`);
    console.log(`⚠️  Total errors: ${totalErrors}`);
    console.log(`🌐 Production app: ${API_BASE}`);
    console.log('='.repeat(50));

    if (totalErrors === 0) {
      console.log('✅ Upload completed successfully with no errors!');
      console.log('\n🔗 Test your app at:');
      console.log(`   ${API_BASE}`);
    } else {
      console.log('⚠️  Upload completed with some errors. Check logs above.');
    }
  }
}

// Get filename from command line or use latest export
const args = process.argv.slice(2);
let filename = args[0];

if (!filename) {
  // Find the latest export file
  const { readdirSync } = require('fs');
  const files = readdirSync('.')
    .filter((file: string) => file.startsWith('export_') && file.endsWith('.sql'))
    .sort()
    .reverse();
  
  filename = files[0];
  if (!filename) {
    console.error('❌ No export file found. Run export_sql.ts first or specify filename.');
    process.exit(1);
  }
  console.log(`📁 Auto-detected latest export: ${filename}`);
}

const uploader = new SQLUploader(filename);
uploader.upload().catch(error => {
  console.error('Upload failed:', error);
  process.exit(1);
});