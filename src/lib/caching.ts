import { NextResponse } from 'next/server';

// Response cache configuration
const CACHE_CONFIG = {
  // Static data that changes rarely
  players: { maxAge: 300, staleWhileRevalidate: 600 }, // 5min fresh, 10min stale
  // Dynamic milestone data
  milestones: { maxAge: 60, staleWhileRevalidate: 300 }, // 1min fresh, 5min stale
  // User watchlist data
  watchlist: { maxAge: 30, staleWhileRevalidate: 120 }, // 30s fresh, 2min stale
  // Leaderboard data
  leaderboards: { maxAge: 180, staleWhileRevalidate: 600 }, // 3min fresh, 10min stale
} as const;

type CacheKey = keyof typeof CACHE_CONFIG;

interface CacheOptions {
  maxAge?: number;
  staleWhileRevalidate?: number;
  mustRevalidate?: boolean;
  private?: boolean;
}

/**
 * Add performance-optimized cache headers to API responses
 */
export function withCacheHeaders(
  response: NextResponse,
  cacheKey: CacheKey,
  customOptions?: CacheOptions
): NextResponse {
  const config = CACHE_CONFIG[cacheKey];
  const options = { ...config, ...customOptions };

  const cacheControl = [
    options.private ? 'private' : 'public',
    `max-age=${options.maxAge}`,
    options.staleWhileRevalidate && `stale-while-revalidate=${options.staleWhileRevalidate}`,
    options.mustRevalidate && 'must-revalidate',
  ].filter(Boolean).join(', ');

  response.headers.set('Cache-Control', cacheControl);
  response.headers.set('Vary', 'Accept-Encoding');
  
  // Add ETag for better cache validation
  const etag = generateETag(response);
  if (etag) {
    response.headers.set('ETag', etag);
  }

  return response;
}

/**
 * Simple ETag generation based on response content
 */
function generateETag(response: NextResponse): string | null {
  try {
    // For JSON responses, create hash of the content
    const contentLength = response.headers.get('content-length');
    const lastModified = response.headers.get('last-modified') || Date.now().toString();
    
    if (contentLength) {
      return `"${Buffer.from(contentLength + lastModified).toString('base64')}"`;
    }
  } catch {
    // Ignore ETag generation errors
  }
  return null;
}

/**
 * Memory cache for expensive computations
 */
class MemoryCache<T = any> {
  private cache = new Map<string, { value: T; expires: number; stale: number }>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  set(key: string, value: T, ttl = 300000): void { // 5min default TTL
    const now = Date.now();
    const expires = now + ttl;
    const stale = expires + (ttl * 2); // Stale period is 2x TTL

    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, { value, expires, stale });
  }

  get(key: string): { value: T; fresh: boolean } | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    
    // Remove completely stale entries
    if (now > entry.stale) {
      this.cache.delete(key);
      return null;
    }

    const fresh = now < entry.expires;
    return { value: entry.value, fresh };
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Global memory cache instance
export const memoryCache = new MemoryCache(200); // Store up to 200 cached responses

/**
 * Higher-order function to add memory caching to API handlers
 */
export function withMemoryCache<T extends (...args: any[]) => Promise<NextResponse>>(
  handler: T,
  getCacheKey: (...args: Parameters<T>) => string,
  ttl?: number
): T {
  return (async (...args: Parameters<T>) => {
    const cacheKey = getCacheKey(...args);
    const cached = memoryCache.get(cacheKey);

    if (cached && cached.fresh) {
      // Return fresh cached response
      return cached.value;
    }

    // Execute handler
    const response = await handler(...args);
    
    // Cache the response if successful
    if (response.status < 400) {
      memoryCache.set(cacheKey, response, ttl);
    }

    return response;
  }) as T;
}