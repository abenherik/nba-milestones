import Link from 'next/link';

export function AgePills({ age, includePlayoffs, basePath }: { age: number; includePlayoffs: boolean; basePath: string }) {
  const ages = Array.from({ length: 11 }, (_, i) => 20 + i); // 20..30
  return (
  <nav className="mb-4 flex flex-wrap gap-1.5 sm:gap-2">
      {ages.map((a) => (
        <Link
          key={a}
          href={`${basePath}?age=${a}${includePlayoffs ? '&includePlayoffs=1' : ''}`}
          className={`px-3 py-1.5 rounded border text-[0.92rem] ${
            a === age ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          Age {a}
        </Link>
      ))}
    </nav>
  );
}
