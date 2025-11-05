import { NextResponse } from 'next/server';
import { openDatabase } from '@/lib/database';

export async function POST(request: Request) {
  try {
    const { key, sql, chunk } = await request.json();
    
    // Security check
    if (key !== 'sql-import-2024') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!sql) {
      return NextResponse.json({ error: 'SQL required' }, { status: 400 });
    }

    const db = await openDatabase();
    
    console.log(`🔄 Executing SQL chunk ${chunk || 1}...`);
    console.log(`📊 SQL length: ${sql.length.toLocaleString()} chars`);

    // Split SQL into individual statements
    const statements = sql.split(';')
      .map((stmt: string) => stmt.trim())
      .filter((stmt: string) => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`📋 Found ${statements.length} SQL statements`);

    let executed = 0;
    let errors = 0;
    const results = [];

    // Execute each statement
    for (const statement of statements) {
      try {
        if (statement.toUpperCase().startsWith('PRAGMA')) {
          // Skip PRAGMA statements for now
          continue;
        }

        const result = await db.execute(statement);
        executed++;
        
        if (statement.toUpperCase().startsWith('INSERT')) {
          results.push({
            type: 'INSERT',
            rowsAffected: result.rowsAffected || 0
          });
        } else if (statement.toUpperCase().startsWith('DELETE')) {
          results.push({
            type: 'DELETE', 
            rowsAffected: result.rowsAffected || 0
          });
        }
      } catch (error) {
        errors++;
        console.error('SQL execution error:', error);
        
        // Log first few errors but don't fail completely
        if (errors <= 5) {
          results.push({
            type: 'ERROR',
            statement: statement.substring(0, 100) + '...',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    const summary = {
      chunk: chunk || 1,
      totalStatements: statements.length,
      executed,
      errors,
      success: executed > 0,
      results: results.slice(0, 10), // First 10 results only
      totalInserted: results
        .filter(r => r.type === 'INSERT')
        .reduce((sum, r) => sum + (r.rowsAffected || 0), 0)
    };

    console.log('✅ SQL execution complete:', summary);

    return NextResponse.json({
      message: `SQL chunk ${chunk || 1} executed`,
      ...summary
    });

  } catch (error) {
    console.error('SQL import API error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}