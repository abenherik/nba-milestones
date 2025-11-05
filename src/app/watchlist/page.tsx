"use client";
import Link from 'next/link';
import { useEffect, useState, useCallback, useMemo, memo } from 'react';
import { optimizedCache } from '../../lib/optimizedCache';

type InHuntStat = {
  leaderboard: string;
  metric: string;
  age: number;
  rank: number;
  value: number;
  nextRank: null | { needed: number; rank: number; player: string };
};
type Milestones = {
  totals?: { points: number; rebounds: number; assists: number; threesMade: number; gamesPlayed: number };
  distances?: any;
  inHuntStats?: InHuntStat[];
} | undefined;
interface WatchItem { playerId: string; player: { full_name?: string; first_name?: string; last_name?: string }; milestones?: Milestones }

// Memoized milestone pill component to prevent unnecessary re-renders
const MilestonePill = memo(({ stat, href }: { stat: InHuntStat; href: string }) => (
  <Link
    href={href}
    className="text-xs bg-zinc-50 dark:bg-zinc-800 p-2 rounded flex flex-col justify-between hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
    title="Open leaderboard"
  >
    <div><span className="font-medium">{stat.leaderboard}</span></div>
    <div>Rank: <span className="font-bold">{stat.rank}</span> &nbsp; Value: <span className="font-bold">{stat.value}</span></div>
    {stat.nextRank ? (
      <div className="text-green-700 dark:text-green-400">Needs <span className="font-bold">{stat.nextRank.needed}</span> more to reach rank <span className="font-bold">{stat.nextRank.rank}</span> ({stat.nextRank.player})</div>
    ) : (
      <div className="text-gray-500">Already highest rank in leaderboard</div>
    )}
  </Link>
));

MilestonePill.displayName = 'MilestonePill';

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState<{ [id: string]: boolean }>({});
  const [removing, setRemoving] = useState<Set<string>>(new Set()); // Track players being removed
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [collapsed, setCollapsed] = useState<{ [id: string]: boolean }>({});
  const [collapsedReady, setCollapsedReady] = useState(false);
  const [includePlayoffs, setIncludePlayoffs] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const raw = localStorage.getItem('watchlist:includePlayoffs');
    return raw === '1' || raw === 'true';
  });
  const [ageCount, setAgeCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 5;
    const raw = localStorage.getItem('watchlist:ageCount');
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 && n <= 10 ? n : 5;
  });

  // One-time cleanup: remove only v1 milestone cache entries (unversioned) to avoid stale UI
  useEffect(() => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const isVersioned = /^milestones:v\d+:.+/.test(k);
        if (k.startsWith('milestones:') && !isVersioned) keys.push(k);
      }
      if (keys.length) keys.forEach(k => localStorage.removeItem(k));
    } catch {
      // ignore
    }
  }, []);

  // Persist collapsed state
  const COLLAPSE_KEY = 'watchlist:collapsed:v1';
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { [id: string]: boolean };
        setCollapsed(parsed || {});
      }
    } catch {
      // ignore
    }
    setCollapsedReady(true);
  }, []);
  useEffect(() => {
    try {
      if (typeof window === 'undefined' || !collapsedReady) return;
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
    } catch {
      // ignore quota errors
    }
  }, [collapsed, collapsedReady]);

  // Persist watchlist controls
  useEffect(() => {
    try { if (typeof window !== 'undefined') localStorage.setItem('watchlist:includePlayoffs', includePlayoffs ? '1' : '0'); } catch {}
  }, [includePlayoffs]);
  useEffect(() => {
    try { if (typeof window !== 'undefined') localStorage.setItem('watchlist:ageCount', String(ageCount)); } catch {}
  }, [ageCount]);

  // Optimized cache functions with better performance
  const cacheKey = useCallback((playerId: string) => 
    `milestones:v4:${playerId}:pl${includePlayoffs ? '1' : '0'}:ac${ageCount}`, 
    [includePlayoffs, ageCount]
  );
  
  const readCache = useCallback((playerId: string): Milestones => {
    return optimizedCache.get(cacheKey(playerId)) || undefined;
  }, [cacheKey]);
  
  const writeCache = useCallback((playerId: string, data: Milestones) => {
    // Cache for 5 minutes with optimized storage
    optimizedCache.set(cacheKey(playerId), data, 300000);
  }, [cacheKey]);

  const loadWatchlist = useCallback(async (force = false) => {
    // Don't auto-refresh if there are active remove operations (unless forced)
    if (!force && removing.size > 0) {
      console.log('[Watchlist] Skipping auto-refresh - remove operations in progress:', Array.from(removing));
      return;
    }
    
    console.log('[Watchlist] Loading watchlist from API...', force ? '(forced)' : '');
    const res = await fetch('/api/watchlist', {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });
    const data = await res.json() as { items?: WatchItem[] };
    console.log('[Watchlist] Loaded', data.items?.length ?? 0, 'items');
    setItems(data.items ?? []);
  }, [removing]);

  // Helper function to get current optimistic removals
  const getCurrentRemovals = useCallback(() => {
    const removals = new Set<string>();
    const allRemovalKeys: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('watchlist:removed:')) {
        allRemovalKeys.push(key);
        const playerId = key.replace('watchlist:removed:', '');
        const timestamp = localStorage.getItem(key);
        if (timestamp && (Date.now() - parseInt(timestamp)) < 300000) { // Within last 5 minutes
          removals.add(playerId);
        }
      }
    }
    
    console.log('[Debug] All removal keys in localStorage:', allRemovalKeys);
    console.log('[Debug] Active removals (within 5min):', Array.from(removals));
    console.log('[Debug] Current optimistic list:', localStorage.getItem('watchlist:optimistic'));
    
    return removals;
  }, []);

  // Load immediately from localStorage, then hydrate from API
  const loadWatchlistImmediate = useCallback(async () => {
    const startTime = Date.now();
    console.log('[Watchlist] Starting loadWatchlistImmediate at:', new Date().toISOString());
    
    // FIRST: Check for optimistic removals
    const currentRemovals = getCurrentRemovals();
    console.log(`[Watchlist] Found ${currentRemovals.size} current removals:`, Array.from(currentRemovals));
    
    // THEN: Show optimistic additions (but exclude any removed players)
    const optimisticItems: WatchItem[] = [];
    const permanentOptimistic: WatchItem[] = [];
    
    try {
      // Get the optimistic list for instant display
      const optimisticListStr = localStorage.getItem('watchlist:optimistic') || '[]';
      const optimisticList = JSON.parse(optimisticListStr) as string[];
      
      // Load all optimistic players (excluding any that were removed)
      for (const playerId of optimisticList) {
        // Skip if this player was optimistically removed
        if (currentRemovals.has(playerId)) {
          console.log(`[Watchlist] Skipping optimistic ${playerId} - was removed`);
          continue;
        }
        
        const playerData = localStorage.getItem(`watchlist:added:${playerId}`);
        if (playerData) {
          const parsed = JSON.parse(playerData);
          const age = Date.now() - parsed.timestamp;
          
          if (age < 60000) { // Show for 60 seconds (long enough for DB sync)
            optimisticItems.push({
              playerId: parsed.playerId,
              player: parsed.player,
              // No milestones yet - will load after API
            });
          }
        }
      }
      
      // Also check for any individual optimistic items
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('watchlist:added:')) {
          const data = localStorage.getItem(key);
          if (data) {
            const parsed = JSON.parse(data);
            const age = Date.now() - parsed.timestamp;
            const playerId = parsed.playerId;
            
            // Skip if this player was optimistically removed
            if (currentRemovals.has(playerId)) {
              console.log(`[Watchlist] Skipping individual optimistic ${playerId} - was removed`);
              continue;
            }
            
            // If not already in optimistic list and recent enough
            if (age < 60000 && !optimisticItems.some(item => item.playerId === playerId)) {
              optimisticItems.push({
                playerId: parsed.playerId,
                player: parsed.player
              });
            }
          }
        }
      }
      
      // Show optimistic items IMMEDIATELY (or empty if only removals)
      console.log(`[Watchlist] Showing ${optimisticItems.length} optimistic items immediately`);
      setItems(optimisticItems); // Start with optimistic items (could be empty if only removals)
      
    } catch (e) {
      console.warn('[Watchlist] Failed to show optimistic updates:', e);
      // Still set empty array to respect any removals
      setItems([]);
    }
    
    // THEN: Get the authoritative list from API (in background) and merge
    const apiStartTime = Date.now();
    console.log('[Watchlist] Fetching authoritative list from API...');
    
    let apiItems: WatchItem[] = [];
    
    try {
      const res = await fetch('/api/watchlist', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      const data = await res.json() as { items?: WatchItem[] };
      apiItems = data.items ?? [];
      const apiDuration = Date.now() - apiStartTime;
      console.log(`[Watchlist] API returned ${apiItems.length} items in ${apiDuration}ms`);
      
      // Use the same removal check for consistency
      const optimisticRemovals = getCurrentRemovals();
      console.log(`[Watchlist] Found ${optimisticRemovals.size} optimistic removals for API merge:`, Array.from(optimisticRemovals));
      
      // Filter API items to exclude optimistically removed players FIRST
      const filteredApiItems = apiItems.filter(item => {
        if (optimisticRemovals.has(item.playerId)) {
          console.log(`[Watchlist] Filtering out API item ${item.playerId} - optimistically removed`);
          return false;
        }
        return true;
      });
      
      // Merge optimistic items with filtered API items
      const allPlayerIds = new Set([
        ...optimisticItems.map(item => item.playerId),
        ...filteredApiItems.map(item => item.playerId)
      ]);
      
      const finalItems: WatchItem[] = [];
      
      for (const playerId of allPlayerIds) {
        
        // Prefer API item if it exists, otherwise use optimistic
        const apiItem = filteredApiItems.find(item => item.playerId === playerId);
        const optimisticItem = optimisticItems.find(item => item.playerId === playerId);
        
        if (apiItem) {
          // Use API item but enhance with optimistic player info if better
          let enhancedItem = { ...apiItem };
          if (optimisticItem?.player && !apiItem.player?.full_name) {
            enhancedItem = { ...apiItem, player: optimisticItem.player };
          }
          finalItems.push(enhancedItem);
        } else if (optimisticItem) {
          // Keep optimistic item (API hasn't caught up yet)
          finalItems.push(optimisticItem);
        }
      }
      
      const totalDuration = Date.now() - startTime;
      console.log(`[Watchlist] Final merge: ${finalItems.length} items (${optimisticItems.length} optimistic + ${filteredApiItems.length} filtered API, ${optimisticRemovals.size} removed) in ${totalDuration}ms`);
      setItems(finalItems);
      
      // Clean up optimistic items that are confirmed in API AND old enough to be trusted
      const apiPlayerIds = new Set(apiItems.map(item => item.playerId));
      const currentOptimisticStr = localStorage.getItem('watchlist:optimistic') || '[]';
      try {
        const currentOptimistic = JSON.parse(currentOptimisticStr) as string[];
        const stillPending = currentOptimistic.filter(id => {
          // Keep if not in API (still pending)
          if (!apiPlayerIds.has(id)) return true;
          
          // If in API, only remove from optimistic list if the add operation is old enough (30+ seconds)
          const addedData = localStorage.getItem(`watchlist:added:${id}`);
          if (addedData) {
            try {
              const parsed = JSON.parse(addedData);
              const age = Date.now() - parsed.timestamp;
              return age < 30000; // Keep if less than 30 seconds old
            } catch (e) {
              return false; // If can't parse, assume it's safe to clean up
            }
          }
          return false; // No add data found, safe to clean up
        });
        localStorage.setItem('watchlist:optimistic', JSON.stringify(stillPending));
        console.log(`[Watchlist] Cleaned up optimistic list: ${currentOptimistic.length} -> ${stillPending.length} (conservative cleanup)`);
      } catch (e) {
        console.warn('[Watchlist] Failed to clean optimistic list:', e);
      }
      
    } catch (apiError) {
      console.error('[Watchlist] API fetch failed, keeping optimistic items:', apiError);
      // Keep optimistic items if API fails
    }
    
    // Clean up expired removal flags and other stale localStorage entries
    const currentPlayerIds = new Set(filteredApiItems.map(item => item.playerId));
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      // Clean up removal flags only when player is confirmed NOT in API AND flag is old enough
      if (key.startsWith('watchlist:removed:')) {
        const playerId = key.replace('watchlist:removed:', '');
        const timestamp = localStorage.getItem(key);
        const isPlayerInAPI = currentPlayerIds.has(playerId);
        
        if (timestamp) {
          const age = Date.now() - parseInt(timestamp);
          // Only clean up if: player is NOT in API (removal confirmed) AND flag is older than 5 minutes
          if (!isPlayerInAPI && age > 300000) {
            localStorage.removeItem(key);
            console.log('[Watchlist] Cleaned up confirmed removal flag:', key);
          }
          // OR if flag is extremely old (30 minutes) regardless of API status
          else if (age > 1800000) {
            localStorage.removeItem(key);
            console.log('[Watchlist] Cleaned up very old removal flag:', key);
          }
        }
        continue;
      }
      
      // Clean up other entries for players no longer in watchlist
      if (key.startsWith('watchlist:added:') || key.startsWith('watchlist:player:')) {
        const playerId = key.split(':')[2]; // Extract playerId from key
        if (playerId && !currentPlayerIds.has(playerId)) {
          // For added entries, only clean up if they're old enough
          if (key.startsWith('watchlist:added:')) {
            const data = localStorage.getItem(key);
            if (data) {
              try {
                const parsed = JSON.parse(data);
                const age = Date.now() - parsed.timestamp;
                if (age > 60000) { // Only clean up after 60 seconds
                  localStorage.removeItem(key);
                  console.log('[Watchlist] Cleaned up old added entry:', key);
                }
              } catch (e) {
                localStorage.removeItem(key); // Clean up malformed entries
              }
            }
          } else {
            localStorage.removeItem(key);
            console.log('[Watchlist] Cleaned up stale localStorage for player:', playerId);
          }
        }
      }
    }
  }, [getCurrentRemovals]);

  useEffect(() => {
    console.log('[Watchlist] Component mounted, checking for updates...');
    
    // Check if there are very recent localStorage updates that suggest immediate refresh
    let shouldRefreshImmediately = false;
    let hasRecentAdditions = false;
    try {
      const refreshSignal = localStorage.getItem('watchlist:refresh');
      if (refreshSignal) {
        const refreshAge = Date.now() - parseInt(refreshSignal);
        if (refreshAge < 10000) { // Less than 10 seconds ago
          console.log(`[Watchlist] Recent refresh signal detected (${refreshAge}ms ago), refreshing immediately`);
          shouldRefreshImmediately = true;
        }
      }
      
      // Check for recent additions that might need retry
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('watchlist:added:')) {
          const data = localStorage.getItem(key);
          if (data) {
            const parsed = JSON.parse(data);
            const age = Date.now() - parsed.timestamp;
            if (age < 30000) { // Less than 30 seconds ago
              hasRecentAdditions = true;
              break;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Watchlist] Failed to check refresh signal:', e);
    }
    
    // Always do immediate load
    loadWatchlistImmediate();
    
    // Set up a single delayed refresh to sync with API (no aggressive retries needed)
    if (hasRecentAdditions) {
      console.log('[Watchlist] Recent additions detected, scheduling API sync in 3 seconds');
      setTimeout(() => {
        console.log('[Watchlist] Syncing with API after optimistic updates...');
        loadWatchlistImmediate();
      }, 3000);
    }
  }, [loadWatchlistImmediate]);

  // Simple event listeners - no polling
  useEffect(() => {
    // Listen for storage events from other tabs
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'watchlist:refresh' || e.key === 'watchlist:last_update') {
        console.log('[Watchlist] Refresh signal received:', e.key);
        loadWatchlistImmediate();
      } else if (e.key?.startsWith('watchlist:added:')) {
        console.log('[Watchlist] Player addition detected:', e.key);
        
        // Extract player ID and try to show immediately
        const playerId = e.key.replace('watchlist:added:', '');
        try {
          const data = localStorage.getItem(e.key);
          if (data) {
            const parsed = JSON.parse(data);
            console.log(`[Watchlist] Instantly adding ${parsed.player.full_name} via storage event`);
            
            setItems(prev => {
              // Don't duplicate if already exists
              if (prev.some(item => item.playerId === playerId)) return prev;
              
              const newItem: WatchItem = {
                playerId,
                player: parsed.player
              };
              return [...prev, newItem];
            });
          }
        } catch (e) {
          console.warn('[Watchlist] Failed to parse added player data:', e);
        }
        
        loadWatchlistImmediate();
      } else if (e.key?.startsWith('watchlist:removed:')) {
        console.log('[Watchlist] Player removal detected:', e.key);
        loadWatchlistImmediate();
      }
    };

    // Listen for page becoming visible (user returning to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Watchlist] Page became visible, refreshing once');
        loadWatchlistImmediate();
      }
    };

    // Listen for same-tab custom events (storage events don't fire within same tab)
    const handleCustomEvent = (event: CustomEvent) => {
      const { playerId, playerName } = event.detail;
      console.log(`[Watchlist] Custom event received - instantly adding ${playerName} (${playerId})`);
      
      setItems(prev => {
        // Don't duplicate if already exists
        if (prev.some(item => item.playerId === playerId)) return prev;
        
        const newItem: WatchItem = {
          playerId,
          player: { full_name: playerName }
        };
        return [...prev, newItem];
      });
      
      // Still trigger background refresh for data consistency
      setTimeout(() => loadWatchlistImmediate(), 100);
    };

    // Add BroadcastChannel support for modern browsers
    let broadcastChannel: BroadcastChannel | null = null;
    if ('BroadcastChannel' in window) {
      broadcastChannel = new BroadcastChannel('watchlist');
      broadcastChannel.onmessage = (event) => {
        console.log('[Watchlist] BroadcastChannel message received:', event.data);
        
        // Instant update for BroadcastChannel messages
        if (event.data.type === 'added' && event.data.playerId) {
          const playerId = event.data.playerId;
          const playerName = event.data.playerName || `Player ${playerId}`;
          
          console.log(`[Watchlist] Instantly adding ${playerName} to watchlist`);
          setItems(prev => {
            // Don't duplicate if already exists
            if (prev.some(item => item.playerId === playerId)) return prev;
            
            const newItem: WatchItem = {
              playerId,
              player: { full_name: playerName }
            };
            return [...prev, newItem];
          });
        }
        
        // Still trigger full refresh in background
        loadWatchlistImmediate();
      };
    }

    // Set up listeners
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('watchlist-player-added', handleCustomEvent as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('watchlist-player-added', handleCustomEvent as EventListener);
      if (broadcastChannel) {
        broadcastChannel.close();
      }
    };
  }, [loadWatchlistImmediate]);

  // Debug function - expose to window for manual testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).debugWatchlist = {
        forceReload: () => {
          console.log('[Debug] Force reloading watchlist');
          loadWatchlistImmediate();
        },
        testBroadcast: () => {
          if ('BroadcastChannel' in window) {
            const channel = new BroadcastChannel('watchlist');
            channel.postMessage({ type: 'test', timestamp: Date.now() });
            console.log('[Debug] Sent test broadcast message');
            channel.close();
          }
        },
        checkStorage: () => {
          const keys = Object.keys(localStorage).filter(k => k.startsWith('watchlist:'));
          console.log('[Debug] Watchlist localStorage keys:', keys);
          keys.forEach(key => {
            console.log(`  ${key}:`, localStorage.getItem(key));
          });
        }
      };
    }
  }, [loadWatchlistImmediate]);

  const remove = useCallback(async (playerId: string) => {
    // Prevent multiple simultaneous removes of the same player
    if (removing.has(playerId)) {
      console.log('[Watchlist] Remove already in progress for player:', playerId);
      return;
    }

    // Mark as being removed
    setRemoving(prev => new Set(prev).add(playerId));
    
    // Use functional update to avoid stale closures
    setItems(prev => prev.filter(i => i.playerId !== playerId));
    
    // CRITICAL: Set optimistic removal tracking (same as select-players)
    localStorage.setItem(`watchlist:removed:${playerId}`, Date.now().toString());
    localStorage.removeItem(`watchlist:added:${playerId}`);
    
    // Also remove from optimistic list
    const currentOptimistic = localStorage.getItem('watchlist:optimistic') || '[]';
    try {
      const optimisticList = JSON.parse(currentOptimistic) as string[];
      const updatedList = optimisticList.filter(id => id !== playerId);
      localStorage.setItem('watchlist:optimistic', JSON.stringify(updatedList));
      console.log(`[Watchlist] Removed ${playerId} from optimistic list: ${optimisticList.length} -> ${updatedList.length}`);
      console.log(`[Watchlist] Set removal flag for ${playerId} at timestamp:`, Date.now());
    } catch (e) {
      console.warn('[Watchlist] Failed to update optimistic list on removal:', e);
    }
    
    try {
      const res = await fetch('/api/watchlist', { 
        method: 'DELETE', 
        headers: { 'content-type': 'application/json' }, 
        body: JSON.stringify({ playerId }) 
      });
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        console.error('[Watchlist] Remove failed:', res.status, error);
        // Revert optimistic update on error - refetch from server
        const refetchRes = await fetch('/api/watchlist');
        const refetchData = await refetchRes.json();
        setItems(refetchData.items ?? []);
        return;
      }
      
      console.log('[Watchlist] Successfully removed player:', playerId);
      // Success - signal other tabs that watchlist changed
      localStorage.setItem('watchlist:refresh', Date.now().toString());
    } catch (e) {
      console.error('[Watchlist] Remove error:', e);
      // Revert optimistic update on error - refetch from server
      try {
        const refetchRes = await fetch('/api/watchlist');
        const refetchData = await refetchRes.json();
        setItems(refetchData.items ?? []);
      } catch (refetchError) {
        console.error('[Watchlist] Failed to refetch after remove error:', refetchError);
      }
    } finally {
      // Always clear the removing flag
      setRemoving(prev => {
        const newSet = new Set(prev);
        newSet.delete(playerId);
        return newSet;
      });
    }
  }, [removing]);

  const compute = useCallback(async (playerId: string) => {
    console.log(`[Watchlist] Loading milestones for player ${playerId}`);
    setLoading(s => ({ ...s, [playerId]: true }));
    
    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.log(`[Watchlist] Milestone loading timeout for player ${playerId}`);
      setLoading(s => ({ ...s, [playerId]: false }));
      const fallback: Milestones = { inHuntStats: [], distances: {}, totals: undefined } as any;
      writeCache(playerId, fallback);
      setItems(prev => prev.map(i => (i.playerId === playerId ? { ...i, milestones: fallback } : i)));
    }, 10000); // 10 second timeout
    
    try {
      // Pass a view hint so API returns curated presets for Watchlist
      const params = new URLSearchParams({ view: 'watchlist', playerId, includePlayoffs: includePlayoffs ? '1' : '0', ageCount: String(ageCount) });
      console.log(`[Watchlist] Fetching milestones from: /api/milestones?${params.toString()}`);
      
      const res = await fetch('/api/milestones?' + params.toString(), {
        cache: 'no-store', // Ensure fresh data
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      clearTimeout(timeoutId); // Clear timeout on successful response
      
      if (!res.ok) {
        console.error(`[Watchlist] Milestone API error for player ${playerId}: ${res.status}`);
        const errorText = await res.text().catch(() => 'Unknown error');
        console.error(`[Watchlist] Error details:`, errorText);
        
        const fallback: Milestones = { inHuntStats: [], distances: {}, totals: undefined } as any;
        writeCache(playerId, fallback);
        setItems(prev => prev.map(i => (i.playerId === playerId ? { ...i, milestones: fallback } : i)));
        return;
      }
      
      let data: Milestones | undefined;
      try {
        data = await res.json() as Milestones;
        console.log(`[Watchlist] Successfully loaded milestones for player ${playerId}:`, data);
      } catch (jsonError) {
        console.error(`[Watchlist] JSON parse error for player ${playerId}:`, jsonError);
        data = { inHuntStats: [], distances: {}, totals: undefined } as any;
      }
      
      writeCache(playerId, data);
      setItems(prev => prev.map(i => (i.playerId === playerId ? { ...i, milestones: data } : i)));
    } catch (networkError) {
      clearTimeout(timeoutId); // Clear timeout on network error
      console.error(`[Watchlist] Network error loading milestones for player ${playerId}:`, networkError);
      
      const fallback: Milestones = { inHuntStats: [], distances: {}, totals: undefined } as any;
      writeCache(playerId, fallback);
      setItems(prev => prev.map(i => (i.playerId === playerId ? { ...i, milestones: fallback } : i)));
    } finally {
      setLoading(s => ({ ...s, [playerId]: false }));
    }
  }, [includePlayoffs, ageCount, writeCache]);

  // Hydrate milestones from cache only (no auto-fetching for performance)
  // Memoized hydration to avoid recalculating on every render
  const hydratedItems = useMemo(() => {
    return items.map(i => {
      if (i.milestones) return i;
      const cached = readCache(i.playerId);
      if (cached) return { ...i, milestones: cached };
      return i;
    });
  }, [items, readCache]);

  useEffect(() => {
    if (items.length === 0) return;
    const hydrated = hydratedItems;
    const hasNewCachedData = hydrated.some((item, index) => 
      item.milestones && !items[index].milestones
    );
    
    if (hasNewCachedData) {
      setItems(hydrated);
    }
    
    // Auto-fetch milestones for new players (those without milestones and not currently loading)
    const toFetch = hydrated.filter(i => !i.milestones && !loading[i.playerId]).map(i => i.playerId);
    if (toFetch.length > 0) {
      console.log(`[Watchlist] Auto-loading milestones for ${toFetch.length} players:`, toFetch);
      // Stagger the requests to avoid overwhelming the API
      toFetch.forEach((pid, index) => { 
        setTimeout(() => compute(pid), 200 * index); // Staggered delays: 0ms, 200ms, 400ms, etc.
      });
    }
  }, [items, hydratedItems]);

  const refreshAll = useCallback(async () => {
    setRefreshingAll(true);
    try {
      // First, reload the watchlist to get any newly added players
      await loadWatchlist();
      // Wait a bit to ensure state is updated, then get current items
      await new Promise(resolve => setTimeout(resolve, 100));
      // Get fresh items after reload
      const res = await fetch('/api/watchlist');
      const data = await res.json() as { items?: WatchItem[] };
      const currentItems = data.items ?? [];
      
      // Now compute milestones for all current items
      for (const i of currentItems) {
        await compute(i.playerId);
      }
    } finally {
      setRefreshingAll(false);
    }
  }, [loadWatchlist, compute]);

  // Helper to get age if available
  const getAge = (player: any) => player.age ?? player.current_age ?? '';
  const [expanded, setExpanded] = useState<{ [id: string]: boolean }>({});
  
  // Memoized function to build href for a given in-hunt pill
  const pillHref = useCallback((stat: InHuntStat) => {
    const include = includePlayoffs ? '1' : '0';
    // before-age metric leaderboards
    const basicMetrics = new Set(['points', 'rebounds', 'assists', 'steals', 'blocks']);
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    if (basicMetrics.has(stat.metric)) {
      const expected = `${cap(stat.metric)} before age ${stat.age}`;
      if (stat.leaderboard === expected) {
        return `/leaderboards/${stat.metric}-before-age?age=${stat.age}${includePlayoffs ? `&includePlayoffs=${include}` : ''}`;
      }
    }
    // milestone leaderboards: map label to preset
    const label = stat.leaderboard.split(' before age ')[0];
    const labelToPreset: Record<string, string> = {
      '20+pts': 'pts20',
      '30+pts': 'pts30',
      '40+pts': 'pts40',
      '20+pts 10+reb': 'p20r10',
      '30+pts 10+reb': 'p30r10',
      '40+pts 10+reb': 'p40r10',
      '10+reb games': 'reb10',
      '20+pts 5+ast': 'g20a5',
      '20+pts 5+ast 5+reb': 'g20a5r5',
      '20+pts 10+ast': '20+10ast',
      '30+pts 10+ast': '30+10ast',
      '40+pts 10+ast': '40+10ast',
    };
    const preset = labelToPreset[label];
    if (preset) {
      return `/leaderboards/milestones?preset=${encodeURIComponent(preset)}&age=${stat.age}${includePlayoffs ? `&includePlayoffs=${include}` : ''}`;
    }
    // Fallback: send to generic metric leaderboard if possible
    if (basicMetrics.has(stat.metric)) {
      return `/leaderboards/${stat.metric}-before-age?age=${stat.age}${includePlayoffs ? `&includePlayoffs=${include}` : ''}`;
    }
    return `/leaderboards/milestones?age=${stat.age}${includePlayoffs ? `&includePlayoffs=${include}` : ''}`;
  }, [includePlayoffs]);
  
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Your Watchlist</h1>
      {items.length === 0 && (
        <div className="text-sm text-zinc-600 dark:text-zinc-300">
          Your watchlist is empty. Add players from the Select Players page, then use the Refresh milestones button to populate their current milestones.
          <div className="mt-2">
            <a href="/select-players" className="inline-block px-3 py-1 rounded bg-blue-600 text-white">Go to Select Players</a>
          </div>
        </div>
      )}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includePlayoffs} onChange={(e) => setIncludePlayoffs(e.target.checked)} />
            Include Playoffs
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            Look years ahead
            <input
              type="number"
              min={1}
              max={10}
              value={ageCount}
              onChange={(e) => setAgeCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className="w-16"
            />
          </label>
          <button
            onClick={refreshAll}
            disabled={refreshingAll}
            className={`px-2 py-0.5 text-sm rounded ${refreshingAll ? 'bg-gray-300 dark:bg-gray-600 cursor-wait' : 'bg-gray-200 dark:bg-gray-700'}`}
            title="Reload watchlist and refresh all milestones"
          >
            {refreshingAll ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-3 w-3 text-gray-700 dark:text-gray-200" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                Refreshing all…
              </span>
            ) : (
              'Refresh all'
            )}
          </button>
        </div>
      )}
      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {items.map(i => {
          const hunts = i.milestones?.inHuntStats ?? [];
          const showAll = expanded[i.playerId];
          const visibleHunts = showAll ? hunts : hunts.slice(0, 6);
          // Safe player name fallback
          let playerName = 'Unknown Player';
          if (i.player) {
            if (i.player.full_name) playerName = i.player.full_name;
            else if (i.player.first_name || i.player.last_name) playerName = `${i.player.first_name ?? ''} ${i.player.last_name ?? ''}`.trim();
          }
          return (
            <li key={i.playerId} className="py-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-semibold text-base">{playerName}</span>
                  {i.player && getAge(i.player) && (
                    <span className="ml-2 text-xs text-gray-500">
                      {`Age:\u00A0`}{getAge(i.player)}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => compute(i.playerId)}
                    disabled={!!loading[i.playerId]}
                    className={`px-2 py-0.5 text-sm rounded ${loading[i.playerId] ? 'bg-gray-300 dark:bg-gray-600 cursor-wait' : 'bg-gray-200 dark:bg-gray-700'}`}
                  >
                    {loading[i.playerId] ? (
                      <span className="inline-flex items-center gap-2">
                        <svg className="animate-spin h-3 w-3 text-gray-700 dark:text-gray-200" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                        </svg>
                        Refreshing…
                      </span>
                    ) : (
                      'Refresh milestones'
                    )}
                  </button>
                  <button
                    onClick={() => remove(i.playerId)}
                    className={`px-2 py-0.5 text-sm rounded font-semibold transition-colors ${items.some(w => w.playerId === i.playerId) ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
                  >
                    Toggle Watch
                  </button>
                  <button
                    onClick={() => setCollapsed(c => ({ ...c, [i.playerId]: !c[i.playerId] }))}
                    aria-label={collapsed[i.playerId] ? 'Expand' : 'Collapse'}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                    title={collapsed[i.playerId] ? 'Expand' : 'Collapse'}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className={`h-4 w-4 text-zinc-600 dark:text-zinc-300 transition-transform ${collapsed[i.playerId] ? '' : 'rotate-180'}`}
                    >
                      <path fillRule="evenodd" d="M10 3a1 1 0 01.832.445l6 8a1 1 0 01-1.664 1.11L10 5.882 4.832 12.555A1 1 0 013.168 11.445l6-8A1 1 0 0110 3z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
              {!collapsed[i.playerId] && hunts.length > 0 && (
                <div className="mt-2">
                  <div className="font-semibold text-sm mb-1">In the Hunt Milestones:</div>
                  <div className="grid grid-cols-3 gap-2">
                    {visibleHunts.map((stat: any, idx: number) => (
                      <MilestonePill 
                        key={`${stat.leaderboard}-${stat.rank}-${stat.value}`} 
                        stat={stat} 
                        href={pillHref(stat)} 
                      />
                    ))}
                  </div>
                  {hunts.length > 6 && (
                    <button
                      className="mt-2 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded"
                      onClick={() => setExpanded(e => ({ ...e, [i.playerId]: !showAll }))}
                    >
                      {showAll ? 'Show less' : `Show all (${hunts.length})`}
                    </button>
                  )}
                </div>
              )}
              {!collapsed[i.playerId] && !i.milestones && !loading[i.playerId] && (
                <div className="mt-2 text-sm text-blue-500 italic flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading milestones...
                </div>
              )}
              {!collapsed[i.playerId] && i.milestones && hunts.length === 0 && !loading[i.playerId] && (
                <div className="mt-2 text-sm text-gray-500 italic">Player has no milestones within reach.</div>
              )}
              {collapsed[i.playerId] && i.milestones && (
                <div className="mt-2 text-xs text-gray-500 italic">Milestones collapsed{hunts.length ? ` (${hunts.length})` : ''}.</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
