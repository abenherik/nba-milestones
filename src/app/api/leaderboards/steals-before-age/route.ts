import { NextRequest, NextResponse } from 'next/server';
import { getBeforeAgeSqlite } from '../../../../lib/leaderboards/beforeAgeSqlite';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ageParam = searchParams.get('age');
    const age = ageParam ? Number(ageParam) : 21;
    const includePlayoffs = (searchParams.get('includePlayoffs') === '1' || searchParams.get('includePlayoffs') === 'true');
    if (!Number.isFinite(age) || age < 18 || age > 40) {
      return NextResponse.json({ error: 'Invalid age' }, { status: 400 });
    }

  const data = await getBeforeAgeSqlite('steals', age, includePlayoffs);
    if (!data) return NextResponse.json({ error: 'Leaderboard not found' }, { status: 404 });

    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
