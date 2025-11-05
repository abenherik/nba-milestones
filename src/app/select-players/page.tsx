"use client";
import { useEffect, useState, useRef } from "react";
import { createPortal } from 'react-dom';
import { perfMonitor } from '../../lib/client-performance';

interface Player {
  id: string;
  full_name: string;
}

interface WatchItem {
  playerId: string;
  player: Player;
  milestones?: any;
}

export default function SelectPlayersPage() {
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Player[]>([]);
  const [selected, setSelected] = useState<WatchItem[]>([]);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [pendingToggle, setPendingToggle] = useState<Set<string>>(new Set()); // Track players being toggled
  // Track dark preference to drive inline styles that forced-dark modes can't easily override
  const [isDark, setIsDark] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [portalEl, setPortalEl] = useState<HTMLDivElement | null>(null);

  // Create a detached portal container so vendor forced-dark or ancestor styles can't interfere
  useEffect(() => {
    const el = document.createElement('div');
    el.setAttribute('data-select-portal', 'true');
    document.body.appendChild(el);
    setPortalEl(el);
    return () => { document.body.removeChild(el); };
  }, []);

  useEffect(() => {
    fetch("/api/watchlist")
      .then((res) => res.json())
      .then((data) => setWatchlist(data.items?.map((i: any) => i.playerId) ?? []));
  }, []);

  // Auto-refresh watchlist when returning to this page
  useEffect(() => {
    const refreshWatchlist = async () => {
      try {
        const res = await fetch("/api/watchlist");
        const data = await res.json();
        setWatchlist(data.items?.map((i: any) => i.playerId) ?? []);
      } catch (e) {
        console.error('Failed to refresh watchlist:', e);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Add delay to ensure database operations are complete
        setTimeout(refreshWatchlist, 200);
      }
    };
    
    const handleFocus = () => {
      setTimeout(refreshWatchlist, 200);
    };

    // Listen for storage events in case other tabs modify watchlist
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'watchlist:refresh') {
        // Don't refresh if we have pending toggles - it would overwrite optimistic updates
        if (pendingToggle.size > 0) {
          console.log('[Select-Players] Ignoring refresh signal - toggle operations pending:', Array.from(pendingToggle));
          return;
        }
        console.log('[Select-Players] Handling storage refresh signal');
        refreshWatchlist();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
    };
  }, [pendingToggle]);

  // Enforce absolute dropdown colors if some vendor forced-dark still alters them
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setIsDark(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Debounced remote search for players
  useEffect(() => {
    if (search.length === 0) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(() => {
      fetch(`/api/players?q=${encodeURIComponent(search)}`)
        .then((res) => res.json())
        .then((data) => setSuggestions(data.players ?? []))
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [search]);

  // Removed: client-side filtering by full list. Suggestions are from the API.

  const selectPlayer = async (player: Player) => {
    if (selected.some((s) => s.playerId === player.id)) return;
    // Fast path: do not calculate milestones here; watchlist page handles it.
    setSelected(prev => [...prev, { playerId: player.id, player }]);
  };

  const toggleWatch = async (playerId: string) => {
    const strId = String(playerId);
    const operation = watchlist.includes(strId) ? 'remove' : 'add';
    
    // Start performance monitoring
    const perfMetric = perfMonitor.startToggleOperation(strId, operation);
    
    console.log(`[UI] toggleWatch called for player ${strId}`);
    console.log(`[UI] Current watchlist:`, watchlist);
    console.log(`[UI] Player in watchlist?`, watchlist.includes(strId));
    
    // Prevent multiple simultaneous toggles of the same player
    if (pendingToggle.has(strId)) {
      console.log(`[UI] Toggle already pending for player ${strId}`);
      return;
    }
    
    // Mark as pending
    setPendingToggle(prev => new Set(prev).add(strId));
    const originalWatchlist = watchlist;
    
  // toggle watch
    try {
      const method = watchlist.includes(strId) ? 'DELETE' : 'POST';
      console.log(`[UI] Starting ${method} operation for player ${strId}`);
      
      // Immediate optimistic update - show result instantly
      setWatchlist(prev => method === 'POST' ? Array.from(new Set([...prev, strId])) : prev.filter(id => id !== strId));
      
      // Send instant notifications BEFORE API call for immediate cross-tab updates
      try {
        const playerName = selected.find(s => s.playerId === strId)?.player?.full_name || `Player ${strId}`;
        
        // Store player info immediately for instant display
        if (method === 'POST') {
          const playerInfo = selected.find(s => s.playerId === strId)?.player || { full_name: playerName };
          const watchlistItem = {
            playerId: strId,
            player: playerInfo,
            timestamp: Date.now(),
            optimistic: true // Mark as optimistic update
          };
          localStorage.setItem(`watchlist:added:${strId}`, JSON.stringify(watchlistItem));
          
          // Also update a simple list for instant cross-tab sync
          const currentOptimistic = localStorage.getItem('watchlist:optimistic') || '[]';
          try {
            const optimisticList = JSON.parse(currentOptimistic) as string[];
            if (!optimisticList.includes(strId)) {
              optimisticList.push(strId);
              localStorage.setItem('watchlist:optimistic', JSON.stringify(optimisticList));
            }
          } catch (e) {
            localStorage.setItem('watchlist:optimistic', JSON.stringify([strId]));
          }
          
          console.log(`[UI] Stored player ${playerName} for instant display`);
        }
        
        // Immediate localStorage signal
        localStorage.setItem('watchlist:last_update', Date.now().toString());
        
        // Immediate BroadcastChannel message  
        if ('BroadcastChannel' in window) {
          const channel = new BroadcastChannel('watchlist');
          channel.postMessage({ 
            type: method === 'POST' ? 'added' : 'removed', 
            playerId: strId, 
            playerName: playerName,
            timestamp: Date.now() 
          });
          console.log(`[UI] Sent instant BroadcastChannel message for ${method} ${strId}`);
          channel.close();
        }
        
        // Trigger storage event manually within same tab (storage events don't fire in same tab)
        if (method === 'POST') {
          window.dispatchEvent(new CustomEvent('watchlist-player-added', { 
            detail: { playerId: strId, playerName: playerName }
          }));
          console.log(`[UI] Dispatched custom event for instant same-tab update`);
        }
      } catch (e) {
        console.warn('[UI] Failed to send instant notifications:', e);
      }
      
      perfMonitor.recordApiCall(perfMetric);
      const res = await fetch('/api/watchlist', {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId: strId }),
      });
      
  // response received
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[UI] toggleWatch failed', res.status, err);
        perfMonitor.recordApiResponse(perfMetric, false, `API error: ${res.status}`);
        // Revert optimistic update on error
        setWatchlist(originalWatchlist);
      } else {
        const action = method === 'POST' ? 'added' : 'removed';
        console.log(`[UI] Successfully ${action} player ${strId} to watchlist`);
        perfMonitor.recordApiResponse(perfMetric, true);
        
        // Small delay to allow Turso replication to catch up before user navigation
        if (method === 'POST') {
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log(`[UI] Waited 500ms for database replication after adding player ${strId}`);
        }
        
        // Use multiple notification methods for reliability
        try {
          // Look for player in suggestions first, then selected list, or use minimal info
          let playerInfo = suggestions.find((p: Player) => String(p.id) === strId);
          if (!playerInfo) {
            playerInfo = selected.find((s: WatchItem) => s.playerId === strId)?.player;
          }
          
          // Method 1: localStorage with current timestamp
          localStorage.setItem('watchlist:refresh', Date.now().toString());
          
          // Method 2: localStorage with player-specific info
          if (method === 'POST') {
            
            if (playerInfo) {
              localStorage.setItem(`watchlist:added:${strId}`, JSON.stringify({
                playerId: strId,
                player: {
                  full_name: playerInfo.full_name,
                  first_name: (playerInfo as any).first_name,
                  last_name: (playerInfo as any).last_name
                },
                timestamp: Date.now()
              }));
            } else {
              // Fallback with minimal info
              localStorage.setItem(`watchlist:added:${strId}`, JSON.stringify({
                playerId: strId,
                player: { full_name: `Player ${strId}` },
                timestamp: Date.now()
              }));
            }
          } else {
            // For removes, set a removal flag and clean up optimistic tracking
            localStorage.setItem(`watchlist:removed:${strId}`, Date.now().toString());
            localStorage.removeItem(`watchlist:added:${strId}`);
            
            // CRITICAL: Also remove from optimistic list
            const currentOptimistic = localStorage.getItem('watchlist:optimistic') || '[]';
            try {
              const optimisticList = JSON.parse(currentOptimistic) as string[];
              const updatedList = optimisticList.filter(id => id !== strId);
              localStorage.setItem('watchlist:optimistic', JSON.stringify(updatedList));
              console.log(`[UI] Removed ${strId} from optimistic list: ${optimisticList.length} -> ${updatedList.length}`);
              console.log(`[UI] Set removal flag for ${strId} at timestamp:`, Date.now());
              console.log(`[UI] Updated optimistic list:`, updatedList);
            } catch (e) {
              console.warn('[UI] Failed to update optimistic list on removal:', e);
            }
          }
          
          // Method 3: Broadcast Channel API (modern browsers)
          if ('BroadcastChannel' in window) {
            const channel = new BroadcastChannel('watchlist');
            const message = { 
              type: action, 
              playerId: strId, 
              timestamp: Date.now(),
              playerName: playerInfo?.full_name || `Player ${strId}`
            };
            channel.postMessage(message);
            console.log(`[UI] Sent BroadcastChannel message:`, message);
            channel.close();
          }
          
          // Method 4: Force a storage event by updating a timestamp
          localStorage.setItem('watchlist:last_update', Date.now().toString());
          
          console.log(`[UI] Sent multiple refresh signals for ${action} of player ${strId}`);
        } catch (e) {
          console.error('[UI] Failed to send refresh signals:', e);
        }
      }
    } catch (e) {
      console.error('[UI] toggleWatch error', e);
      perfMonitor.recordApiResponse(perfMetric, false, `Exception: ${e}`);
      // Revert optimistic update on error
      setWatchlist(originalWatchlist);
    } finally {
      // Always clear the pending flag
      setPendingToggle(prev => {
        const newSet = new Set(prev);
        newSet.delete(strId);
        return newSet;
      });
      console.log(`[UI] Cleared pending flag for player ${strId}`);
      
      // Record UI update timing
      perfMonitor.recordUiUpdate(perfMetric);
    }
  };

  return (
    <main className="max-w-2xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">Select Players</h1>
      <input
        ref={inputRef}
        type="text"
        placeholder="Search players..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-2 px-3 py-2 border rounded"
        autoComplete="off"
      />
      {/* Portal suggestions: detached from layout, absolute inline colors (rev r5) */}
      {portalEl && suggestions.length > 0 && inputRef.current && (() => {
        const r = inputRef.current!.getBoundingClientRect();
        const listStyle: React.CSSProperties = {
          position: 'absolute',
          top: `${r.bottom + window.scrollY}px`,
          left: `${r.left + window.scrollX}px`,
          width: `${r.width}px`,
          background: isDark ? '#0b0b0b' : '#ffffff',
          color: isDark ? '#ffffff' : '#000000',
          border: isDark ? '1px solid #2d2d2d' : '1px solid #d4d4d8',
          boxShadow: '0 8px 20px -6px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.05)',
          borderRadius: 6,
          zIndex: 2147483647,
          overflow: 'hidden',
          fontFamily: 'system-ui, sans-serif',
          WebkitTextFillColor: isDark ? '#ffffff' : '#000000',
          pointerEvents: 'auto'
        };
        const node = (
          <ul role="listbox" data-style-rev="final" style={listStyle}>
            {suggestions.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected="false"
                onClick={() => { selectPlayer(p); setSearch(''); setSuggestions([]); }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  background: isDark ? (i % 2 ? '#101010':'#0b0b0b') : (i % 2 ? '#ffffff':'#f8f8f8'),
                  color: isDark ? '#ffffff' : '#000000',
                  WebkitTextFillColor: isDark ? '#ffffff' : '#000000',
                  transition: 'background 80ms',
                }}
                onPointerEnter={(e) => { (e.currentTarget as HTMLLIElement).style.background = isDark ? '#1c1c1c':'#e6f3ff'; }}
                onPointerLeave={(e) => { (e.currentTarget as HTMLLIElement).style.background = isDark ? (i % 2 ? '#060606':'#0b0b0b') : (i % 2 ? '#ffffff':'#f9f9f9'); }}
              >
                {p.full_name}
              </li>
            ))}
          </ul>
        );
        return createPortal(node, portalEl);
      })()}

      {/* Inline fallback dropdown: shows suggestions within normal flow if portal rendering is blocked */}
      {suggestions.length > 0 && !portalEl && (
        <div className="mt-2">
          <ul
            role="listbox"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl max-h-80 overflow-auto"
          >
            {suggestions.map((p) => (
              <li key={p.id} className="px-3 py-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-zinc-800"
                  onClick={() => { selectPlayer(p); setSearch(''); setSuggestions([]); }}>
                <span className="font-semibold text-sm">{p.full_name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4">
        {selected.map((s) => (
          <div key={s.playerId} className="mb-4 p-3 border rounded bg-zinc-50 dark:bg-zinc-900">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">{s.player.full_name}</span>
              <button
                onClick={(e) => {
                  console.log(`[UI] Button clicked for player ${s.playerId}`, e);
                  e.preventDefault();
                  e.stopPropagation();
                  toggleWatch(s.playerId);
                }}
                disabled={pendingToggle.has(s.playerId)}
                className={`px-3 py-1 rounded font-semibold transition-colors cursor-pointer ${
                  pendingToggle.has(s.playerId)
                    ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                    : watchlist.includes(s.playerId)
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                }`}
                style={{ pointerEvents: pendingToggle.has(s.playerId) ? 'none' : 'auto' }}
              >
                {pendingToggle.has(s.playerId) 
                  ? "Loading..." 
                  : watchlist.includes(s.playerId) 
                  ? "Watching" 
                  : "Toggle Watchlist"}
              </button>
            </div>
            {s.milestones && s.milestones.inHuntStats && s.milestones.inHuntStats.length > 0 && (
              <div>
                <div className="font-semibold text-sm mb-1">In the Hunt Milestones:</div>
                <ul className="space-y-1">
                  {s.milestones.inHuntStats.map((stat: any, idx: number) => (
                    <li key={idx} className="text-xs bg-zinc-100 dark:bg-zinc-800 p-2 rounded">
                      <div><span className="font-medium">{stat.leaderboard}</span></div>
                      <div>Rank: <span className="font-bold">{stat.rank}</span> &nbsp; Value: <span className="font-bold">{stat.value}</span></div>
                      {stat.nextRank ? (
                        <div className="text-green-700 dark:text-green-400">Needs <span className="font-bold">{stat.nextRank.needed}</span> more to reach rank <span className="font-bold">{stat.nextRank.rank}</span> ({stat.nextRank.player})</div>
                      ) : (
                        <div className="text-gray-500">Already highest rank in leaderboard</div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
