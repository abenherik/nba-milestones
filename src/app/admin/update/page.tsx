'use client';

import { useState } from 'react';

interface BatchResult {
  offset: number;
  playersProcessed: number;
  gamesAdded: number;
  gamesSkipped: number;
  errors: number;
  timedOut?: number;
}

export default function AdminUpdatePage() {
  const [isRunning, setIsRunning] = useState(false);
  const [batches, setBatches] = useState<BatchResult[]>([]);
  const [totalStats, setTotalStats] = useState({
    batches: 0,
    players: 0,
    added: 0,
    skipped: 0,
    errors: 0
  });
  const [error, setError] = useState<string | null>(null);

  const runUpdate = async () => {
    setIsRunning(true);
    setError(null);
    setBatches([]);
    setTotalStats({ batches: 0, players: 0, added: 0, skipped: 0, errors: 0 });

    const batchSize = 1; // Process 1 player at a time
    let offset = 0;
    let hasMore = true;

    try {
      while (hasMore) {
        const response = await fetch('/api/cron/update-active-players', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}`
          },
          body: JSON.stringify({ batchSize, offset })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();

        // Add batch result
        const batchResult: BatchResult = {
          offset,
          playersProcessed: data.playersProcessed || 0,
          gamesAdded: data.gamesAdded || 0,
          gamesSkipped: data.gamesSkipped || 0,
          errors: data.errors || 0,
          timedOut: data.playerDetails?.filter((p: any) => p.timedOut).length || 0
        };

        setBatches(prev => [...prev, batchResult]);

        // Update totals
        setTotalStats(prev => ({
          batches: prev.batches + 1,
          players: prev.players + batchResult.playersProcessed,
          added: prev.added + batchResult.gamesAdded,
          skipped: prev.skipped + batchResult.gamesSkipped,
          errors: prev.errors + batchResult.errors
        }));

        // Check if there are more batches
        hasMore = data.batch?.hasMore || false;
        offset += batchSize;

        // Small delay between batches
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Update Active Players</h1>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <button
            onClick={runUpdate}
            disabled={isRunning}
            className={`px-6 py-3 rounded-lg font-semibold ${
              isRunning
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isRunning ? 'Updating...' : 'Start Update'}
          </button>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 font-semibold">Error:</p>
              <p className="text-red-600">{error}</p>
            </div>
          )}
        </div>

        {totalStats.batches > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Total Summary</h2>
            <div className="grid grid-cols-5 gap-4">
              <div>
                <p className="text-sm text-gray-600">Batches</p>
                <p className="text-2xl font-bold">{totalStats.batches}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Players</p>
                <p className="text-2xl font-bold">{totalStats.players}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Added</p>
                <p className="text-2xl font-bold text-green-600">{totalStats.added}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Skipped</p>
                <p className="text-2xl font-bold text-gray-600">{totalStats.skipped}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Errors</p>
                <p className="text-2xl font-bold text-red-600">{totalStats.errors}</p>
              </div>
            </div>
          </div>
        )}

        {batches.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Batch Progress</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {batches.slice().reverse().map((batch, idx) => (
                <div key={batches.length - idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="font-semibold">Batch {batches.length - idx}</span>
                  <div className="flex gap-4 text-sm">
                    <span className="text-green-600">+{batch.gamesAdded} games</span>
                    <span className="text-gray-600">{batch.gamesSkipped} skipped</span>
                    {batch.timedOut ? <span className="text-orange-600">⏱️ timeout</span> : null}
                    {batch.errors > 0 && <span className="text-red-600">{batch.errors} errors</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
