import Link from 'next/link';

type Metric = 'points' | 'rebounds' | 'assists' | 'steals' | 'blocks';
type Source = 'boxscores' | 'league';

export function AllTimeTabs({ current, includePlayoffs, source }: { current: Metric; includePlayoffs: boolean; source?: Source }) {
  const src = source && (source === 'league' ? '&source=league' : '&source=boxscores');
  const tabs: Array<{ key: Metric; label: string; href: string }> = [
    { key: 'points', label: 'Points', href: `/leaderboards/all-time-totals?metric=points${includePlayoffs ? '&includePlayoffs=1' : ''}${src || ''}` },
    { key: 'rebounds', label: 'Rebounds', href: `/leaderboards/all-time-totals?metric=rebounds${includePlayoffs ? '&includePlayoffs=1' : ''}${src || ''}` },
    { key: 'assists', label: 'Assists', href: `/leaderboards/all-time-totals?metric=assists${includePlayoffs ? '&includePlayoffs=1' : ''}${src || ''}` },
    { key: 'steals', label: 'Steals', href: `/leaderboards/all-time-totals?metric=steals${includePlayoffs ? '&includePlayoffs=1' : ''}${src || ''}` },
    { key: 'blocks', label: 'Blocks', href: `/leaderboards/all-time-totals?metric=blocks${includePlayoffs ? '&includePlayoffs=1' : ''}${src || ''}` },
  ];

  return (
    <nav className="overflow-x-auto mb-4">
      <ul className="inline-flex gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-1">
        {tabs.map(t => (
          <li key={t.key}>
            <Link
              href={t.href}
              className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${
                t.key === current
                  ? 'bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 shadow-sm'
                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-white/60 dark:hover:bg-white/10'
              }`}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}