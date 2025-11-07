import { NextResponse } from 'next/server';
import { getTotalsSqlite } from '@/lib/leaderboards/totalsSqlite';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const includePlayoffs = searchParams.get('includePlayoffs') === '1';
  const source = (searchParams.get('source') === 'league') ? 'league' : 'boxscores';
  const data = await getTotalsSqlite('assists', includePlayoffs, source);
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(data);
}
