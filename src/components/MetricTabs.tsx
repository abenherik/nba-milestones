import Link from 'next/link';

type Metric = 'blocks' | 'points' | 'rebounds' | 'steals' | 'assists';

export function MetricTabs({ current, age, includePlayoffs }: { current: Metric; age: number; includePlayoffs: boolean }) {
  const tabs: Array<{ key: Metric; label: string; href: string }> = [
    { key: 'blocks', label: 'Blocks', href: `/leaderboards/blocks-before-age?age=${age}${includePlayoffs ? '&includePlayoffs=1' : ''}` },
    { key: 'points', label: 'Points', href: `/leaderboards/points-before-age?age=${age}${includePlayoffs ? '&includePlayoffs=1' : ''}` },
    { key: 'rebounds', label: 'Rebounds', href: `/leaderboards/rebounds-before-age?age=${age}${includePlayoffs ? '&includePlayoffs=1' : ''}` },
    { key: 'steals', label: 'Steals', href: `/leaderboards/steals-before-age?age=${age}${includePlayoffs ? '&includePlayoffs=1' : ''}` },
    { key: 'assists', label: 'Assists', href: `/leaderboards/assists-before-age?age=${age}${includePlayoffs ? '&includePlayoffs=1' : ''}` },
  ];

  return (
    <div className="mb-5">
      <nav className="overflow-x-auto">
        <ul className="inline-flex gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-1">
          {tabs.map((t) => (
            <li key={t.key}>
              <Link
                className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${
                  t.key === current
                    ? 'bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 shadow-sm'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-white/60 dark:hover:bg-white/10'
                }`}
                href={t.href}
              >
                {t.label}
              </Link>
            </li>
          ))}
          {/* Divider and inline Milestones only on md+ */}
          <li aria-hidden="true" className="hidden md:list-item">
            <span className="mx-2 w-px h-6 bg-zinc-300 dark:bg-zinc-700 inline-block align-middle" />
          </li>
          <li className="hidden md:list-item">
            <Link
              className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap text-indigo-700 dark:text-indigo-300 hover:bg-white/60 dark:hover:bg-white/10 border border-zinc-200 dark:border-zinc-800`}
              href={`/leaderboards/milestones?age=${age}${includePlayoffs ? '&includePlayoffs=1' : ''}`}
            >
              Milestone Games
            </Link>
          </li>
        </ul>
      </nav>
      {/* Mobile-only Milestones button below */}
      <div className="md:hidden mt-2">
        <Link
          className="block w-full text-center px-3 py-2 rounded-md text-sm font-medium text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 bg-white dark:bg-zinc-900"
          href={`/leaderboards/milestones?age=${age}${includePlayoffs ? '&includePlayoffs=1' : ''}`}
        >
          Milestone Games
        </Link>
      </div>
    </div>
  );
}
