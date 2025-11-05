/**
 * Optimized client-side caching utilities
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

class OptimizedLocalStorage {
  private prefix: string;
  private maxSize: number;
  private compressionThreshold: number;

  constructor(prefix = 'nba-app:', maxSize = 50, compressionThreshold = 10000) {
    this.prefix = prefix;
    this.maxSize = maxSize;
    this.compressionThreshold = compressionThreshold;
  }

  /**
   * Store data with automatic expiration and compression
   */
  set<T>(key: string, value: T, ttlMs = 300000): boolean {
    try {
      const entry: CacheEntry<T> = {
        value,
        timestamp: Date.now(),
        ttl: ttlMs,
      };

      let serialized = JSON.stringify(entry);
      
      // Simple compression for large data
      if (serialized.length > this.compressionThreshold) {
        serialized = this.compress(serialized);
      }

      const fullKey = this.prefix + key;
      
      // Check storage quota before setting
      if (this.wouldExceedQuota(fullKey, serialized)) {
        this.evictOldEntries();
      }

      localStorage.setItem(fullKey, serialized);
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        this.evictOldEntries();
        try {
          localStorage.setItem(this.prefix + key, JSON.stringify({ value, timestamp: Date.now(), ttl: ttlMs }));
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  /**
   * Retrieve data with automatic expiration check
   */
  get<T>(key: string): T | null {
    try {
      const fullKey = this.prefix + key;
      let serialized = localStorage.getItem(fullKey);
      
      if (!serialized) return null;

      // Decompress if needed
      if (serialized.startsWith('COMPRESSED:')) {
        serialized = this.decompress(serialized);
      }

      const entry: CacheEntry<T> = JSON.parse(serialized);
      
      // Check if expired
      if (Date.now() - entry.timestamp > entry.ttl) {
        localStorage.removeItem(fullKey);
        return null;
      }

      return entry.value;
    } catch {
      // Clean up corrupted entries
      localStorage.removeItem(this.prefix + key);
      return null;
    }
  }

  /**
   * Remove specific key
   */
  delete(key: string): void {
    localStorage.removeItem(this.prefix + key);
  }

  /**
   * Clear all entries with this prefix
   */
  clear(): void {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
    keys.forEach(key => localStorage.removeItem(key));
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; totalBytes: number; entries: string[] } {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
    const totalBytes = keys.reduce((total, key) => {
      const value = localStorage.getItem(key);
      return total + (value?.length || 0);
    }, 0);

    return {
      size: keys.length,
      totalBytes,
      entries: keys.map(k => k.substring(this.prefix.length)),
    };
  }

  private compress(data: string): string {
    // Simple compression - just mark as compressed for now
    // In a real implementation, you might use a compression library
    return 'COMPRESSED:' + data;
  }

  private decompress(compressedData: string): string {
    return compressedData.substring('COMPRESSED:'.length);
  }

  private wouldExceedQuota(key: string, value: string): boolean {
    try {
      const testKey = '_quota_test_';
      localStorage.setItem(testKey, value);
      localStorage.removeItem(testKey);
      return false;
    } catch {
      return true;
    }
  }

  private evictOldEntries(): void {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
    
    // Sort by timestamp and remove oldest entries
    const entries = keys.map(key => {
      try {
        const value = localStorage.getItem(key);
        if (!value) return null;
        
        let serialized = value;
        if (serialized.startsWith('COMPRESSED:')) {
          serialized = this.decompress(serialized);
        }
        
        const entry = JSON.parse(serialized);
        return { key, timestamp: entry.timestamp };
      } catch {
        return { key, timestamp: 0 }; // Mark corrupted entries for removal
      }
    }).filter(Boolean) as { key: string; timestamp: number }[];

    entries.sort((a, b) => a.timestamp - b.timestamp);
    
    // Remove oldest 25% of entries
    const toRemove = Math.max(1, Math.floor(entries.length * 0.25));
    entries.slice(0, toRemove).forEach(entry => {
      localStorage.removeItem(entry.key);
    });
  }
}

// Global optimized cache instance
export const optimizedCache = new OptimizedLocalStorage('nba-milestones:', 100);

/**
 * React hook for optimized caching
 */
export function useOptimizedCache<T>(key: string, ttl = 300000) {
  const get = (): T | null => optimizedCache.get<T>(key);
  
  const set = (value: T): boolean => optimizedCache.set(key, value, ttl);
  
  const remove = (): void => optimizedCache.delete(key);

  return { get, set, remove };
}