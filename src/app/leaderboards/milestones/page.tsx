import Link from 'next/link';
import { getMilestoneGamesBeforeAge, MilestoneData, MilestoneQuery } from '../../../lib/leaderboards/milestoneGames';
import { isInHunt } from '../../../lib/age';
import { LeaderboardTable } from '../../../components/LeaderboardTable';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Preset = { key: string; label: string; query: Parameters<typeof getMilestoneGamesBeforeAge>[0] };
const PRESETS: Preset[] = [
  // Min-games presets (accurately labeled)
  { key: 'g20r10', label: 'Games with 10+ reb', query: { type: 'rebounds', minRebounds: 10, minGames: 20 } },
  // No min-games variant to match watchlist links
  { key: 'reb10', label: '10+reb games', query: { type: 'rebounds', minRebounds: 10 } },
  { key: 'g20a5', label: '20+pts 5+ast', query: { type: 'combo', minPoints: 20, minAssists: 5 } },
  { key: 'g20a5r5', label: '20+pts 5+ast 5+reb', query: { type: 'combo', minPoints: 20, minAssists: 5, minRebounds: 5 } },
  // Points + rebounds combos
  { key: 'p20r10', label: '20+pts 10+reb', query: { type: 'combo', minPoints: 20, minRebounds: 10 } },
  { key: 'p30r10', label: '30+pts 10+reb', query: { type: 'combo', minPoints: 30, minRebounds: 10 } },
  { key: 'p40r10', label: '40+pts 10+reb', query: { type: 'combo', minPoints: 40, minRebounds: 10 } },
  { key: 'pts20', label: '20+pts', query: { type: 'points', minPoints: 20 } },
  { key: 'pts30', label: '30+pts', query: { type: 'points', minPoints: 30 } },
  { key: 'pts40', label: '40+pts', query: { type: 'points', minPoints: 40 } },
  { key: '20+10ast', label: '20+pts 10+ast', query: { type: 'combo', minPoints: 20, minAssists: 10 } },
  { key: '30+10ast', label: '30+pts 10+ast', query: { type: 'combo', minPoints: 30, minAssists: 10 } },
  { key: '40+10ast', label: '40+pts 10+ast', query: { type: 'combo', minPoints: 40, minAssists: 10 } },
  { key: 'dd', label: 'Double-doubles', query: { type: 'doubleDouble' } },
  { key: 'td', label: 'Triple-doubles', query: { type: 'tripleDouble' } },
  { key: '5x5', label: '5x5 games', query: { type: 'fiveByFive' } },
];

function parsePreset(s?: string): Preset {
  const p = PRESETS.find(x => x.key === s);
  return p ?? PRESETS[0];
}

export default async function MilestonesPage({ searchParams }: { searchParams?: { age?: string; includePlayoffs?: string; preset?: string } }) {
  const age = Math.max(18, Math.min(40, Number(searchParams?.age ?? 24)));
  const includePlayoffs = searchParams?.includePlayoffs === '1' || searchParams?.includePlayoffs === 'true';
  const preset = parsePreset(searchParams?.preset);
  const query: MilestoneQuery = preset.query;
  const data: MilestoneData = await getMilestoneGamesBeforeAge(query, age, includePlayoffs);

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{preset.label} before age {age}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{data.definition} {includePlayoffs ? 'Including Playoffs.' : 'Playoffs excluded.'}</p>
        </div>
        <nav className="flex gap-2 text-sm overflow-x-auto max-w-full px-1 -mx-1">
          {PRESETS.map(p => (
            <Link key={p.key} href={{ pathname: '/leaderboards/milestones', query: { age, includePlayoffs: includePlayoffs ? '1' : '0', preset: p.key } }}
              className={`px-2 py-1 rounded border ${p.key===preset.key ? 'bg-blue-600 text-white border-blue-700' : 'border-zinc-300 dark:border-zinc-700'}`}>{p.label}</Link>
          ))}
        </nav>
      </header>

      <form className="flex items-center gap-3 flex-wrap">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="includePlayoffs" defaultChecked={includePlayoffs} value="1" />
          Include Playoffs
        </label>
        <input type="hidden" name="preset" value={preset.key} />
        <input type="number" name="age" defaultValue={age} min={18} max={40} className="w-24" />
        <button className="px-3 py-1 bg-blue-600 text-white rounded" formAction="/leaderboards/milestones">Apply</button>
      </form>

      <LeaderboardTable
        valueHeader="Games"
        valueKey="value"
        rows={data.top25.map((r) => ({
          key: r.playerId,
          name: r.playerName,
          value: r.value,
          isActive: r.active ?? null,
          inHunt: isInHunt(r.birthday ?? null, age, r.active ?? null),
        }))}
      />
    </main>
  );
}
