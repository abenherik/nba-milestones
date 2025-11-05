'use client';

import { useState, useEffect } from 'react';

interface PerformanceStats {
  name: string;
  count: number;
  avg: number;
  min: number;
  max: number;
  p95: number;
  recent: Array<{
    duration: number;
    timestamp: string;
    metadata?: any;
  }>;
}

interface PerformanceSummary {
  totalOperations: number;
  uniqueOperations: number;
  slowestOperations: Array<{
    name: string;
    avgMs: number;
    count: number;
  }>;
  recentSlow: Array<{
    name: string;
    duration: number;
    timestamp: string;
    metadata?: any;
  }>;
}

export default function PerformancePage() {
  const [stats, setStats] = useState<PerformanceStats[]>([]);
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const [statsRes, summaryRes] = await Promise.all([
        fetch('/api/performance?action=stats'),
        fetch('/api/performance?action=summary')
      ]);

      if (!statsRes.ok || !summaryRes.ok) {
        throw new Error('Failed to fetch performance data');
      }

      const statsData = await statsRes.json();
      const summaryData = await summaryRes.json();

      setStats(statsData.stats || []);
      setSummary(summaryData);
      setError(null);
    } catch (err) {
      console.error('Error fetching performance data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const clearStats = async () => {
    try {
      const res = await fetch('/api/performance?action=clear');
      if (!res.ok) throw new Error('Failed to clear stats');
      await fetchStats(); // Refresh data
    } catch (err) {
      console.error('Error clearing stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to clear stats');
    }
  };

  useEffect(() => {
    fetchStats();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats.length) {
    return <div className="p-6">Loading performance data...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-600 mb-4">Error: {error}</div>
        <button 
          onClick={fetchStats}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Performance Dashboard</h1>
        <div className="flex gap-2">
          <button 
            onClick={fetchStats}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh
          </button>
          <button 
            onClick={clearStats}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Clear Data
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-zinc-800 p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-2">Total Operations</h3>
            <p className="text-3xl font-bold text-blue-600">{summary.totalOperations}</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-2">Unique Operations</h3>
            <p className="text-3xl font-bold text-green-600">{summary.uniqueOperations}</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-2">Slowest Avg</h3>
            <p className="text-3xl font-bold text-orange-600">
              {summary.slowestOperations[0]?.avgMs || 0}ms
            </p>
          </div>
          <div className="bg-white dark:bg-zinc-800 p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-2">Recent Slow</h3>
            <p className="text-3xl font-bold text-red-600">{summary.recentSlow.length}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* All Performance Stats */}
        <div className="bg-white dark:bg-zinc-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">All Operations</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-zinc-700">
                  <th className="text-left p-2">Operation</th>
                  <th className="text-right p-2">Count</th>
                  <th className="text-right p-2">Avg (ms)</th>
                  <th className="text-right p-2">P95 (ms)</th>
                  <th className="text-right p-2">Max (ms)</th>
                </tr>
              </thead>
              <tbody>
                {stats
                  .sort((a, b) => b.avg - a.avg)
                  .map((stat) => (
                    <tr key={stat.name} className="border-b dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700">
                      <td className="p-2 font-mono text-xs">{stat.name}</td>
                      <td className="text-right p-2">{stat.count}</td>
                      <td className="text-right p-2">
                        <span className={stat.avg > 500 ? 'text-red-600 font-bold' : stat.avg > 200 ? 'text-orange-600' : 'text-green-600'}>
                          {stat.avg}
                        </span>
                      </td>
                      <td className="text-right p-2">{stat.p95}</td>
                      <td className="text-right p-2">{stat.max}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Slow Operations */}
        <div className="bg-white dark:bg-zinc-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Recent Slow Operations (&gt;100ms)</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {summary?.recentSlow.map((op, idx) => (
              <div key={idx} className="border-l-4 border-red-500 pl-3 py-2 bg-red-50 dark:bg-red-900/20">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-sm">{op.name}</span>
                  <span className="font-bold text-red-600">{op.duration}ms</span>
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                  {new Date(op.timestamp).toLocaleString()}
                </div>
                {op.metadata && (
                  <div className="text-xs text-zinc-500 mt-1">
                    {JSON.stringify(op.metadata, null, 2)}
                  </div>
                )}
              </div>
            ))}
            {(!summary?.recentSlow.length) && (
              <p className="text-zinc-500 italic">No slow operations recorded</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        <p>Data refreshes automatically every 10 seconds. Slow operations (&gt;100ms) are highlighted in development.</p>
      </div>
    </div>
  );
}