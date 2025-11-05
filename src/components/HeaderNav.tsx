"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Restored original blurred header (translucent) without extra overlays.
export default function HeaderNav() {
  const pathname = usePathname() || '/';

  const links: { href: string; label: string; active: (p: string) => boolean }[] = [
    { href: '/select-players', label: 'Select Players', active: (p) => p.startsWith('/select-players') || p === '/' },
    { href: '/leaderboards/blocks-before-age', label: 'Leaderboards', active: (p) => p.startsWith('/leaderboards') && !p.includes('/leaderboards/all-time-totals') },
    { href: '/leaderboards/all-time-totals', label: 'All-time Stats', active: (p) => p.includes('/leaderboards/all-time-totals') },
    { href: '/watchlist', label: 'Watchlist', active: (p) => p.startsWith('/watchlist') },
    { href: '/about', label: 'About', active: (p) => p.startsWith('/about') },
  ];

  const baseItem = 'text-sm px-0.5 font-medium whitespace-nowrap shrink-0';
  const activeItem = 'text-blue-600 dark:text-blue-400';
  const inactiveItem = 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-200';

  return (
  <header className="app-nav sticky top-0 z-40 backdrop-blur bg-white/70 dark:bg-zinc-950/60 supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-zinc-950/55">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
        <nav className="flex flex-nowrap gap-4 overflow-x-auto no-scrollbar">
          {links.map((l) => (
            <Link key={l.label} href={l.href} className={`${baseItem} ${l.active(pathname) ? activeItem : inactiveItem}`}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
