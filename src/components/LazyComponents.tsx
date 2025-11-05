'use client';

import { lazy, Suspense, memo } from 'react';

// Lazy load heavy components
const LazyPlayerSearch = lazy(() => import('./PlayerSearchComponent'));
const LazyMilestoneDisplay = lazy(() => import('./MilestoneDisplayComponent'));

// Loading fallback component
const LoadingSpinner = memo(() => (
  <div className="flex items-center justify-center p-4">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
    <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Loading...</span>
  </div>
));

LoadingSpinner.displayName = 'LoadingSpinner';

export { LazyPlayerSearch, LazyMilestoneDisplay, LoadingSpinner };