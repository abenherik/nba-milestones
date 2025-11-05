"use client";

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React from 'react';

type Metric = 'points' | 'rebounds' | 'assists' | 'steals' | 'blocks';
type Source = 'boxscores' | 'league';

export function AllTimeControls({ metric, includePlayoffs, source }: { metric: Metric; includePlayoffs: boolean; source: Source }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const push = React.useCallback(
    (next: Partial<{ metric: Metric; includePlayoffs: boolean; source: Source }>) => {
      const usp = new URLSearchParams(params?.toString() || '');
      // metric
      usp.set('metric', String(next.metric ?? metric));
      // source
      usp.set('source', String(next.source ?? source));
      // includePlayoffs
      const ip = typeof next.includePlayoffs === 'boolean' ? next.includePlayoffs : includePlayoffs;
      if (ip) usp.set('includePlayoffs', '1'); else usp.delete('includePlayoffs');
      router.push(`${pathname}?${usp.toString()}`);
    },
    [router, pathname, params, metric, includePlayoffs, source]
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <fieldset className="flex items-center gap-3 text-sm">
        <legend className="sr-only">Totals source</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="source"
            value="boxscores"
            checked={source === 'boxscores'}
            onChange={() => push({ source: 'boxscores' })}
          />
          Official box scores
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="source"
            value="league"
            checked={source === 'league'}
            onChange={() => push({ source: 'league' })}
          />
          League-adjusted season totals
        </label>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="includePlayoffs"
          value="1"
          checked={includePlayoffs}
          onChange={e => push({ includePlayoffs: e.currentTarget.checked })}
        />
        Include Playoffs
      </label>
    </div>
  );
}
