// Deprecated: redirect users to the new All-time Totals page.
import Link from 'next/link';
export const dynamic = 'force-dynamic';

export default function LegacyReboundsTotalsPage() {
  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Rebounds Totals Moved</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400">This page has been consolidated into the new unified All-time Totals view covering Points, Rebounds, Assists, Steals, and Blocks.</p>
      <p><Link href="/leaderboards/all-time-totals" className="text-blue-600 underline">Go to All-time Totals</Link></p>
    </div>
  );
}
