"use client";
import { useState } from 'react';

export default function SeedPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');

  const seedDatabase = async () => {
    setLoading(true);
    setResult('Seeding database...');
    
    try {
      const response = await fetch('/api/force-seed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key: 'demo-seed-2024' })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setResult(`✅ Success! Added ${data.playersInserted} players and ${data.gamesInserted} games.\n\nPlayers: ${data.samplePlayers.join(', ')}\n\nYou can now search for these players and view leaderboards!`);
      } else {
        setResult(`❌ Error: ${data.error}\n${data.details || ''}`);
      }
    } catch (error) {
      setResult(`❌ Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">Database Setup</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Click the button below to populate the database with sample NBA players and stats.
        </p>
      </div>

      <div className="bg-zinc-50 dark:bg-zinc-800 p-6 rounded-lg space-y-4">
        <h2 className="text-xl font-semibold">What will be added:</h2>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li>• <strong>Players:</strong> LeBron James, Stephen Curry, Giannis Antetokounmpo, Luka Dončić, Paolo Banchero, Russell Westbrook</li>
          <li>• <strong>Young career stats</strong> for "Blocks before age" leaderboards</li>
          <li>• <strong>Career totals</strong> for "All-time Stats" leaderboards</li>
        </ul>
      </div>

      <div className="text-center">
        <button
          onClick={seedDatabase}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-8 py-3 rounded-lg font-medium transition-colors"
        >
          {loading ? 'Seeding Database...' : 'Populate Database'}
        </button>
      </div>

      {result && (
        <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
          <pre className="whitespace-pre-wrap text-sm">{result}</pre>
        </div>
      )}

      <div className="text-center space-y-2 text-sm text-gray-500">
        <p>After seeding, you can:</p>
        <div className="flex flex-wrap justify-center gap-4">
          <a href="/" className="text-blue-600 hover:underline">Search Players</a>
          <a href="/leaderboards/blocks-before-age" className="text-blue-600 hover:underline">View Leaderboards</a>
          <a href="/leaderboards/all-time-totals" className="text-blue-600 hover:underline">All-time Stats</a>
        </div>
      </div>
    </div>
  );
}