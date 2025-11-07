import { NextResponse } from 'next/server';
import { openDatabase, dbAll, closeDatabase } from '@/lib/database';

export async function GET() {
  try {
    // Simple test route
    const hasUrso = !!process.env.TURSO_DATABASE_URL;
    const hasToken = !!process.env.TURSO_AUTH_TOKEN;
    
    let dbTest = null;
    try {
      const db = openDatabase();
      // Simple query to test connection
      const result = await dbAll(db, 'SELECT 1 as test');
      dbTest = { success: true, result };
      await closeDatabase(db);
    } catch (dbError) {
      dbTest = { 
        success: false, 
        error: dbError instanceof Error ? dbError.message : 'Unknown database error' 
      };
    }
    
    return NextResponse.json({ 
      status: 'ok',
      env: process.env.NODE_ENV,
      hasUrso,
      hasToken,
      dbTest
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}