/**
 * Performance monitoring utilities for NBA Milestones tracker
 * Tracks API response times, database query performance, and page load metrics
 */

interface PerformanceEntry {
  name: string;
  startTime: number;
  duration: number;
  metadata?: Record<string, any>;
}

class PerformanceMonitor {
  private entries: PerformanceEntry[] = [];
  private isClient = typeof window !== 'undefined';

  /**
   * Start timing an operation
   */
  startTiming(name: string): () => number {
    const startTime = this.isClient ? performance.now() : Date.now();
    
    return (metadata?: Record<string, any>) => {
      const endTime = this.isClient ? performance.now() : Date.now();
      const duration = endTime - startTime;
      
      this.entries.push({
        name,
        startTime,
        duration,
        metadata
      });
      
      // Log slow operations in development only when DEBUG=perf is set
      if (process.env.NODE_ENV === 'development' && process.env.DEBUG?.includes('perf') && duration > 100) {
        console.warn(`⚠️  Slow operation: ${name} took ${duration.toFixed(2)}ms`, metadata);
      }
      
      return duration;
    };
  }

  /**
   * Time a promise-based operation
   */
  async timeAsync<T>(name: string, operation: () => Promise<T>, metadata?: Record<string, any>): Promise<T> {
    const endTiming = this.startTiming(name);
    try {
      const result = await operation();
      endTiming({ ...metadata, success: true });
      return result;
    } catch (error) {
      endTiming({ ...metadata, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Time a synchronous operation
   */
  timeSync<T>(name: string, operation: () => T, metadata?: Record<string, any>): T {
    const endTiming = this.startTiming(name);
    try {
      const result = operation();
      endTiming({ ...metadata, success: true });
      return result;
    } catch (error) {
      endTiming({ ...metadata, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Get performance summary for a specific operation
   */
  getStats(name: string) {
    const matching = this.entries.filter(entry => entry.name === name);
    if (matching.length === 0) return null;

    const durations = matching.map(e => e.duration);
    const total = durations.reduce((sum, d) => sum + d, 0);
    const avg = total / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const p95 = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)] || max;

    return {
      name,
      count: matching.length,
      total: Math.round(total),
      avg: Math.round(avg),
      min: Math.round(min),
      max: Math.round(max),
      p95: Math.round(p95),
      recent: matching.slice(-5).map(e => ({
        duration: Math.round(e.duration),
        timestamp: new Date(e.startTime).toISOString(),
        metadata: e.metadata
      }))
    };
  }

  /**
   * Get all performance stats
   */
  getAllStats() {
    const names = [...new Set(this.entries.map(e => e.name))];
    return names.map(name => this.getStats(name)).filter(Boolean);
  }

  /**
   * Clear all entries
   */
  clear() {
    this.entries = [];
  }

  /**
   * Get raw entries for detailed analysis
   */
  getEntries() {
    return [...this.entries];
  }

  /**
   * Log performance summary to console
   */
  logSummary() {
    const stats = this.getAllStats();
    if (stats.length === 0) {
      console.log('📊 No performance data collected yet');
      return;
    }

    console.group('📊 Performance Summary');
    stats
      .sort((a, b) => b.avg - a.avg) // Sort by average duration, slowest first
      .forEach(stat => {
        console.log(`${stat.name}: avg=${stat.avg}ms, count=${stat.count}, p95=${stat.p95}ms`);
      });
    console.groupEnd();
  }
}

// Global performance monitor instance
export const perfMonitor = new PerformanceMonitor();

/**
 * Higher-order function to wrap API handlers with performance monitoring
 */
export function withPerformanceMonitoring<T extends (...args: any[]) => any>(
  name: string,
  handler: T,
  getMetadata?: (...args: Parameters<T>) => Record<string, any>
): T {
  return ((...args: Parameters<T>) => {
    const endTiming = perfMonitor.startTiming(name);
    const metadata = getMetadata ? getMetadata(...args) : undefined;
    
    try {
      const result = handler(...args);
      
      // Handle both sync and async results
      if (result && typeof result.then === 'function') {
        return result
          .then((data: any) => {
            endTiming({ ...metadata, success: true });
            return data;
          })
          .catch((error: any) => {
            endTiming({ ...metadata, success: false, error: error.message });
            throw error;
          });
      } else {
        endTiming({ ...metadata, success: true });
        return result;
      }
    } catch (error) {
      endTiming({ ...metadata, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }) as T;
}

/**
 * Database query timing utility
 */
export function timeQuery<T>(queryName: string, query: () => T | Promise<T>): T | Promise<T> {
  const endTiming = perfMonitor.startTiming(`db:${queryName}`);
  
  try {
    const result = query();
    
    if (result && typeof (result as any).then === 'function') {
      return (result as Promise<T>)
        .then(data => {
          endTiming({ success: true });
          return data;
        })
        .catch(error => {
          endTiming({ success: false, error: error.message });
          throw error;
        });
    } else {
      endTiming({ success: true });
      return result;
    }
  } catch (error) {
    endTiming({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
}

/**
 * Client-side performance utilities
 */
export const clientPerf = {
  /**
   * Measure Core Web Vitals
   */
  measureCoreWebVitals() {
    if (typeof window === 'undefined') return;

    // Measure LCP (Largest Contentful Paint)
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      perfMonitor.entries.push({
        name: 'web-vital:LCP',
        startTime: 0,
        duration: lastEntry.startTime,
        metadata: { metric: 'Largest Contentful Paint' }
      });
    }).observe({ entryTypes: ['largest-contentful-paint'] });

    // Measure FID (First Input Delay)
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry: any) => {
        perfMonitor.entries.push({
          name: 'web-vital:FID',
          startTime: entry.startTime,
          duration: entry.processingStart - entry.startTime,
          metadata: { metric: 'First Input Delay' }
        });
      });
    }).observe({ entryTypes: ['first-input'] });

    // Measure CLS (Cumulative Layout Shift)
    let clsValue = 0;
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry: any) => {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      });
      perfMonitor.entries.push({
        name: 'web-vital:CLS',
        startTime: performance.now(),
        duration: clsValue,
        metadata: { metric: 'Cumulative Layout Shift', value: clsValue }
      });
    }).observe({ entryTypes: ['layout-shift'] });
  },

  /**
   * Measure navigation timing
   */
  measureNavigationTiming() {
    if (typeof window === 'undefined') return;

    window.addEventListener('load', () => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      
      perfMonitor.entries.push({
        name: 'navigation:DNS',
        startTime: nav.fetchStart,
        duration: nav.domainLookupEnd - nav.domainLookupStart,
        metadata: { phase: 'DNS Lookup' }
      });

      perfMonitor.entries.push({
        name: 'navigation:TCP',
        startTime: nav.domainLookupEnd,
        duration: nav.connectEnd - nav.connectStart,
        metadata: { phase: 'TCP Connection' }
      });

      perfMonitor.entries.push({
        name: 'navigation:TTFB',
        startTime: nav.requestStart,
        duration: nav.responseStart - nav.requestStart,
        metadata: { phase: 'Time to First Byte' }
      });

      perfMonitor.entries.push({
        name: 'navigation:DOMLoad',
        startTime: nav.responseEnd,
        duration: nav.loadEventStart - nav.responseEnd,
        metadata: { phase: 'DOM Load' }
      });
    });
  }
};