export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    hasTursoUrl: !!process.env.TURSO_DATABASE_URL,
    tursoUrlPrefix: process.env.TURSO_DATABASE_URL?.substring(0, 15),
    hasTursoToken: !!process.env.TURSO_AUTH_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL
  });
}
