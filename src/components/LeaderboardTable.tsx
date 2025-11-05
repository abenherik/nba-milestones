import React from 'react';

export function LeaderboardTable({
  rows,
  valueHeader,
  valueKey: _valueKey,
}: {
  rows: Array<{ key: string; name: string; value: number; isActive?: boolean | null; inHunt?: boolean }>;
  valueHeader: string;
  valueKey: string;
}) {
  // Keep API stable: valueKey is unused in current implementation
  void _valueKey;
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      {/* Mobile: card list */}
      <div className="md:hidden divide-y divide-zinc-200 dark:divide-zinc-800">
        {rows.map((r, i) => (
          <div key={r.key} className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 text-zinc-500 shrink-0 tabular-nums">{i + 1}</div>
              <div className="min-w-0">
                <div className="truncate font-medium">{r.name}</div>
                <div className="mt-0.5 flex flex-wrap gap-1.5 text-[10px] text-zinc-500">
                  {r.isActive === true && (
                    <span className="inline-flex items-center rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-1.5 py-0.5 uppercase tracking-wide">Active</span>
                  )}
                  {r.inHunt && (
                    <span className="inline-flex items-center rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 uppercase tracking-wide">In the Hunt</span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-500">{valueHeader}</div>
              <div className="font-semibold tabular-nums">{r.value}</div>
            </div>
          </div>
        ))}
      </div>
      {/* Desktop: table */}
      <table className="hidden md:table w-full text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-900">
          <tr>
            <th className="text-left px-4 py-2 w-16">#</th>
            <th className="text-left px-4 py-2">Player</th>
            <th className="text-right px-4 py-2 w-28">{valueHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className="border-t border-zinc-200 dark:border-zinc-800">
              <td className="px-4 py-2 text-zinc-500">{i + 1}</td>
              <td className="px-4 py-2">
                <span>{r.name}</span>
                {r.isActive === true && (
                  <span className="ml-2 inline-flex items-center rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Active</span>
                )}
                {r.inHunt && (
                  <span className="ml-2 inline-flex items-center rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">In the Hunt</span>
                )}
              </td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
