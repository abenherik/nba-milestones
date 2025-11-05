import { NextRequest, NextResponse } from 'next/server';
import { perfMonitor } from '@/lib/performance';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'stats':
        return NextResponse.json({
          stats: perfMonitor.getAllStats(),
          totalEntries: perfMonitor.getEntries().length
        });

      case 'summary':
        const stats = perfMonitor.getAllStats();
        const summary = {
          totalOperations: perfMonitor.getEntries().length,
          uniqueOperations: stats.length,
          slowestOperations: stats
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 10)
            .map(s => ({ name: s.name, avgMs: s.avg, count: s.count })),
          recentSlow: perfMonitor.getEntries()
            .filter(e => e.duration > 100)
            .sort((a, b) => b.startTime - a.startTime)
            .slice(0, 20)
            .map(e => ({
              name: e.name,
              duration: Math.round(e.duration),
              timestamp: new Date(e.startTime).toISOString(),
              metadata: e.metadata
            }))
        };
        return NextResponse.json(summary);

      case 'clear':
        perfMonitor.clear();
        return NextResponse.json({ message: 'Performance data cleared' });

      default:
        return NextResponse.json({
          message: 'Performance monitoring API',
          endpoints: {
            '/api/performance?action=stats': 'Get detailed performance statistics',
            '/api/performance?action=summary': 'Get performance summary',
            '/api/performance?action=clear': 'Clear all performance data'
          }
        });
    }
  } catch (error) {
    console.error('Performance API error:', error);
    return NextResponse.json(
      { error: 'Failed to get performance data' },
      { status: 500 }
    );
  }
}