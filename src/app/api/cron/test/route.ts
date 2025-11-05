import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ 
    message: 'Cron test route works!',
    timestamp: new Date().toISOString()
  });
}
