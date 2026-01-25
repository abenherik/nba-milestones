'use client';

import { useState } from 'react';

interface UpdateResult {
  success: boolean;
  playersProcessed: number;
  gamesAdded: number;
  gamesSkipped: number;
  errors: number;
  timedOut?: boolean;
  playerDetails?: Array<{
    id: string;
    name: string;
    added: number;
    skipped: number;
    errors: number;
    timedOut?: boolean;
  }>;
}

export default function AdminPage() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [totalStats, setTotalStats] = useState({
    playersProcessed: 0,
    gamesAdded: 0,
    gamesSkipped: 0,
    errors: 0,
    timeouts: 0
  });
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);

  const addLog = (message: string) => {
    setProgress(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const updateAllPlayers = async () => {
    setIsUpdating(true);
    setProgress([]);
    setTotalStats({ playersProcessed: 0, gamesAdded: 0, gamesSkipped: 0, errors: 0, timeouts: 0 });
    setCurrentBatch(0);
    
    addLog('Starting player stats update...');
    
    const batchSize = 1; // Process 1 player at a time
    let offset = 0;
    let hasMore = true;
    let batchCount = 0;
    
    while (hasMore) {
      batchCount++;
      setCurrentBatch(batchCount);
      
      try {
        addLog(`Fetching batch ${batchCount} (offset: ${offset})...`);
        
        const response = await fetch('/api/cron/update-active-players', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET || 'dev-secret'}`
          },
          body: JSON.stringify({ batchSize, offset })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result: UpdateResult = await response.json();
        
        if (batchCount === 1 && result.batch?.totalPlayers) {
          setTotalPlayers(result.batch.totalPlayers);
          addLog(`Found ${result.batch.totalPlayers} total active players`);
        }
        
        // Update stats
        setTotalStats(prev => ({
          playersProcessed: prev.playersProcessed + result.playersProcessed,
          gamesAdded: prev.gamesAdded + result.gamesAdded,
          gamesSkipped: prev.gamesSkipped + result.gamesSkipped,
          errors: prev.errors + result.errors,
          timeouts: prev.timeouts + (result.playerDetails?.filter(p => p.timedOut).length || 0)
        }));
        
        // Log player details
        if (result.playerDetails && result.playerDetails.length > 0) {
          const player = result.playerDetails[0];
          if (player.timedOut) {
            addLog(`⏱️  ${player.name} - TIMEOUT (NBA API too slow)`);
          } else if (player.added > 0) {
            addLog(`✓ ${player.name} - Added ${player.added} games`);
          } else if (player.skipped > 0) {
            addLog(`↻ ${player.name} - ${player.skipped} games already exist`);
          } else {
            addLog(`○ ${player.name} - No new games`);
          }
        }
        
        hasMore = result.batch?.hasMore || false;
        offset += batchSize;
        
        // Small delay between batches
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        addLog(`❌ Error in batch ${batchCount}: ${error}`);
        // Continue to next batch even on error
        offset += batchSize;
        
        // If we get too many consecutive errors, stop
        if (batchCount > 10 && totalStats.errors > batchCount * 0.5) {
          addLog('Too many errors, stopping update.');
          hasMore = false;
        }
      }
    }
    
    addLog('');
    addLog('='.repeat(60));
    addLog('✓ Update Complete!');
    addLog(`Players processed: ${totalStats.playersProcessed}`);
    addLog(`Games added: ${totalStats.gamesAdded}`);
    addLog(`Games skipped: ${totalStats.gamesSkipped}`);
    addLog(`Timeouts: ${totalStats.timeouts}`);
    addLog(`Errors: ${totalStats.errors}`);
    addLog('='.repeat(60));
    
    setIsUpdating(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">NBA Milestones Admin</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Update Player Stats</h2>
          <p className="text-gray-600 mb-4">
            Fetch the latest game data for all active players from the NBA API.
            This will process players one at a time to avoid timeouts.
          </p>
          
          <button
            onClick={updateAllPlayers}
            disabled={isUpdating}
            className={`px-6 py-3 rounded-lg font-semibold text-white transition-colors ${
              isUpdating
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isUpdating ? 'Updating...' : 'Update All Players'}
          </button>
        </div>
        
        {(isUpdating || progress.length > 0) && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Progress</h2>
              {totalPlayers > 0 && (
                <span className="text-sm text-gray-600">
                  {currentBatch} / {totalPlayers} players
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-5 gap-4 mb-4 text-center">
              <div className="bg-blue-50 p-3 rounded">
                <div className="text-2xl font-bold text-blue-600">{totalStats.playersProcessed}</div>
                <div className="text-xs text-gray-600">Processed</div>
              </div>
              <div className="bg-green-50 p-3 rounded">
                <div className="text-2xl font-bold text-green-600">{totalStats.gamesAdded}</div>
                <div className="text-xs text-gray-600">Added</div>
              </div>
              <div className="bg-yellow-50 p-3 rounded">
                <div className="text-2xl font-bold text-yellow-600">{totalStats.gamesSkipped}</div>
                <div className="text-xs text-gray-600">Skipped</div>
              </div>
              <div className="bg-orange-50 p-3 rounded">
                <div className="text-2xl font-bold text-orange-600">{totalStats.timeouts}</div>
                <div className="text-xs text-gray-600">Timeouts</div>
              </div>
              <div className="bg-red-50 p-3 rounded">
                <div className="text-2xl font-bold text-red-600">{totalStats.errors}</div>
                <div className="text-xs text-gray-600">Errors</div>
              </div>
            </div>
            
            <div className="bg-gray-900 text-green-400 font-mono text-sm p-4 rounded h-96 overflow-y-auto">
              {progress.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
              {isUpdating && (
                <div className="animate-pulse">▊</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
