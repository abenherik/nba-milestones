/**
 * Client-side performance monitoring for watchlist operations
 */

export interface WatchlistPerformanceMetrics {
  toggleStartTime: number;
  apiCallTime?: number;
  apiResponseTime?: number;
  uiUpdateTime?: number;
  totalTime?: number;
  operation: 'add' | 'remove';
  playerId: string;
  success: boolean;
  error?: string;
}

class ClientPerformanceMonitor {
  private metrics: WatchlistPerformanceMetrics[] = [];
  
  startToggleOperation(playerId: string, operation: 'add' | 'remove'): WatchlistPerformanceMetrics {
    const metric: WatchlistPerformanceMetrics = {
      toggleStartTime: performance.now(),
      operation,
      playerId,
      success: false
    };
    
    this.metrics.push(metric);
    console.log(`[Perf] Starting ${operation} operation for player ${playerId}`);
    return metric;
  }
  
  recordApiCall(metric: WatchlistPerformanceMetrics) {
    metric.apiCallTime = performance.now();
    console.log(`[Perf] API call started at ${metric.apiCallTime - metric.toggleStartTime}ms`);
  }
  
  recordApiResponse(metric: WatchlistPerformanceMetrics, success: boolean, error?: string) {
    metric.apiResponseTime = performance.now();
    metric.success = success;
    metric.error = error;
    
    const apiDuration = metric.apiResponseTime - (metric.apiCallTime || metric.toggleStartTime);
    console.log(`[Perf] API response received in ${apiDuration}ms, success: ${success}`);
  }
  
  recordUiUpdate(metric: WatchlistPerformanceMetrics) {
    metric.uiUpdateTime = performance.now();
    metric.totalTime = metric.uiUpdateTime - metric.toggleStartTime;
    
    console.log(`[Perf] UI updated, total operation time: ${metric.totalTime}ms`);
    
    // Log summary
    this.logSummary(metric);
  }
  
  private logSummary(metric: WatchlistPerformanceMetrics) {
    const summary = {
      operation: metric.operation,
      playerId: metric.playerId,
      success: metric.success,
      timings: {
        total: Math.round(metric.totalTime || 0),
        api: Math.round((metric.apiResponseTime || 0) - (metric.apiCallTime || metric.toggleStartTime)),
        ui: Math.round((metric.uiUpdateTime || 0) - (metric.apiResponseTime || metric.apiCallTime || metric.toggleStartTime))
      },
      error: metric.error
    };
    
    console.log(`[Perf] Watchlist ${metric.operation} summary:`, summary);
    
    // Store in localStorage for debugging
    try {
      const stored = JSON.parse(localStorage.getItem('watchlist:perf:metrics') || '[]');
      stored.push({ ...summary, timestamp: Date.now() });
      // Keep only last 50 metrics
      const recent = stored.slice(-50);
      localStorage.setItem('watchlist:perf:metrics', JSON.stringify(recent));
    } catch (e) {
      console.warn('[Perf] Failed to store metrics:', e);
    }
  }
  
  getMetrics(): WatchlistPerformanceMetrics[] {
    return [...this.metrics];
  }
  
  clearMetrics() {
    this.metrics = [];
    console.log('[Perf] Metrics cleared');
  }
  
  // Get performance summary from localStorage
  getStoredMetrics() {
    try {
      return JSON.parse(localStorage.getItem('watchlist:perf:metrics') || '[]');
    } catch {
      return [];
    }
  }
}

export const perfMonitor = new ClientPerformanceMonitor();

// Global function for easy debugging
if (typeof window !== 'undefined') {
  (window as any).getWatchlistPerf = () => perfMonitor.getStoredMetrics();
}