"use client";
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TotalsRow, Metric, Source } from '../../../lib/leaderboards/totalsSqlite';
import { LeaderboardTable } from '../../../components/LeaderboardTable';
import { AllTimeTabs } from '../../../components/AllTimeTabs';
import { AllTimeControls } from '../../../components/AllTimeControls';

const LABELS: Record<Metric, string> = {
  points: 'Points',
  rebounds: 'Rebounds',
  assists: 'Assists',
  steals: 'Steals',
  blocks: 'Blocks',
};

function AllTimeTotalsContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<{ top25: TotalsRow[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const includePlayoffs = String(searchParams?.get('includePlayoffs') || '0') === '1';
  const metric = (['points','rebounds','assists','steals','blocks'].includes(String(searchParams?.get('metric'))) ? searchParams?.get('metric') : 'points') as Metric;
  const source = (['boxscores','league'].includes(String(searchParams?.get('source'))) ? searchParams?.get('source') : 'boxscores') as Source;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          metric,
          includePlayoffs: includePlayoffs ? '1' : '0',
          source
        });
        const res = await fetch(`/api/leaderboards/all-time-totals?${params}`);
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch (error) {
        console.error('Failed to fetch leaderboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [metric, includePlayoffs, source]);

  const rows = (data?.top25 || []).map((r: TotalsRow) => ({
    key: r.playerId,
    name: r.player?.full_name || r.playerId,
    value: r.value,
    isActive: r.player?.active ?? null,
  }));

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">All-time {LABELS[metric]} Totals {includePlayoffs ? '(Including Playoffs)' : ''}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">Top 25 career total for the selected stat. Choose source: Official box scores (per-game sums) or League-adjusted season totals.</p>
        <AllTimeTabs current={metric} includePlayoffs={includePlayoffs} source={source} />
        <AllTimeControls metric={metric} includePlayoffs={includePlayoffs} source={source} />
        {metric === 'assists' && source === 'boxscores' && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
            Note: For classic-era players, box score assists may be incomplete; try switching to League-adjusted for official season totals.
          </p>
        )}
      </header>
      {loading && <p className="text-gray-600">Loading...</p>}
      {!loading && !data && <p className="text-red-600">Totals leaderboard not found</p>}
      {!loading && data && <LeaderboardTable rows={rows} valueHeader={LABELS[metric]} valueKey={metric} />}
    </div>
  );
}

export default function AllTimeTotalsPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto p-6"><p className="text-gray-600">Loading...</p></div>}>
      <AllTimeTotalsContent />
    </Suspense>
  );
}
