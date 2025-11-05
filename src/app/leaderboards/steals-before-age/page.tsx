import { getBeforeAgeSqlite, BeforeAgeRow } from '../../../lib/leaderboards/beforeAgeSqlite';
import { MetricTabs } from '../../../components/MetricTabs';
import { AgePills } from '../../../components/AgePills';
import { PageHeader } from '../../../components/PageHeader';
import { Card } from '../../../components/Card';
import { LeaderboardTable } from '../../../components/LeaderboardTable';
import { isInHunt } from '../../../lib/age';

export default async function StealsBeforeAgePage({ searchParams }: { searchParams: { age?: string; includePlayoffs?: string } }) {
  const age = Number(searchParams?.age ?? 21);
  const includePlayoffs = searchParams?.includePlayoffs === '1' || searchParams?.includePlayoffs === 'true';
  const data = await getBeforeAgeSqlite('steals', age, includePlayoffs);


  return (
    <main className="max-w-4xl mx-auto p-4">
      <PageHeader
        title={`Steals before age ${age}`}
        right={<MetricTabs current="steals" age={age} includePlayoffs={includePlayoffs} />}
      />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AgePills age={age} includePlayoffs={includePlayoffs} basePath="/leaderboards/steals-before-age" />
          <form className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="includePlayoffs" defaultChecked={includePlayoffs} value="1" />
              Include Playoffs
            </label>
            <input type="hidden" name="age" value={age} />
            <button className="px-2 py-1" formAction="/leaderboards/steals-before-age">Apply</button>
          </form>
        </div>
      </Card>

      {data && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {data.definition && <p className="text-sm text-gray-600">{data.definition}</p>}
          {data.updatedAt && <p className="text-xs text-gray-500">Updated: {new Date(Number(data.updatedAt)).toLocaleString()}</p>}
        </div>
      )}
      {!data && <p className="text-red-600">Leaderboard not found</p>}

      <LeaderboardTable
        valueHeader="Steals"
        valueKey="value"
        rows={(data?.top25 ?? []).map((row: BeforeAgeRow) => ({
          key: String(row.player?.id ?? row.playerId),
          name: String(row.player?.full_name ?? row.playerId),
          value: Number(row.value || 0),
          isActive: row.player?.active ?? null,
          inHunt: isInHunt(row.player?.birthday ?? null, age, row.player?.active ?? null),
        }))}
      />

      <details className="mt-6 text-sm text-gray-600">
        <summary className="cursor-pointer select-none font-medium">Season totals parity (expand)</summary>
        <div className="mt-2 space-y-2">
          <p>
            We use a strict per-game birthday cutoff: only games where age_at_game_years &lt; {age} are counted (birthday games excluded).
            Some sources use a season-age method (age on Feb 1) and count the entire season under that age, which can yield higher totals
            if a birthday falls late in the season.
          </p>
          <p>
            Also, historical per-game logs can differ by 1–3 from season aggregate feeds in a few seasons. Our numbers are summed from per-game logs.
          </p>
        </div>
      </details>

      
    </main>
  );
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
