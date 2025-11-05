'use client';

import { useEffect } from 'react';
import { clientPerf, perfMonitor } from '../lib/performance';

export default function PerformanceMonitor() {
  useEffect(() => {
    // Initialize client-side performance monitoring silently
    clientPerf.measureCoreWebVitals();
    clientPerf.measureNavigationTiming();

    // Only log performance data in development when DEBUG is enabled
    if (process.env.NODE_ENV === 'development' && process.env.DEBUG?.includes('perf')) {
      const interval = setInterval(() => {
        perfMonitor.logSummary();
      }, 60000); // Log every 60 seconds, less frequent

      return () => clearInterval(interval);
    }
  }, []);

  return null; // This component doesn't render anything
}