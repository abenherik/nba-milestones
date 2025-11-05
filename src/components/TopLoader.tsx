"use client";
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// Lightweight top progress bar for App Router navigations
export default function TopLoader() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const trickleRef = useRef<number | null>(null);
  const safetyRef = useRef<number | null>(null);

  const clearTrickle = () => {
    if (trickleRef.current != null) {
      window.clearTimeout(trickleRef.current);
      trickleRef.current = null;
    }
  };

  const start = () => {
    if (visible) return; // avoid re-entrance
    clearTrickle();
    setVisible(true);
    setProgress(8);
    const tick = () => {
      setProgress((p) => Math.min(p + (Math.random() * 12 + 5), 88));
      trickleRef.current = window.setTimeout(tick, 300);
    };
    trickleRef.current = window.setTimeout(tick, 250);
    // Safety: auto-complete after 8s in case no route change occurs
    if (safetyRef.current) window.clearTimeout(safetyRef.current);
    safetyRef.current = window.setTimeout(() => finish(), 8000);
  };
  const finish = () => {
    clearTrickle();
    setProgress(100);
    // Let it paint at 100% then fade out
    window.setTimeout(() => {
      setVisible(false);
      setProgress(0);
      if (safetyRef.current) {
        window.clearTimeout(safetyRef.current);
        safetyRef.current = null;
      }
    }, 220);
  };

  // Detect SPA navigation starts via anchor clicks and browser navigation
  useEffect(() => {
    const onPop = () => start();
    window.addEventListener('popstate', onPop);

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      let el = e.target as Element | null;
      while (el && el.tagName !== 'A') el = el.parentElement;
      const a = el as HTMLAnchorElement | null;
      if (!a) return;
      if (a.target === '_blank' || a.hasAttribute('download') || a.getAttribute('rel')?.includes('external')) return;
      const href = a.getAttribute('href') || '';
      if (href.startsWith('/') && !href.startsWith('//')) start();
    };
    document.addEventListener('click', onClick, true);

    const onBeforeUnload = () => start();
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (safetyRef.current) window.clearTimeout(safetyRef.current);
      clearTrickle();
    };
  }, []);

  // Mark complete when the route (pathname or search) updates
  const pathname = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    if (visible) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search?.toString()]);

  return (
    <div
      aria-hidden={!visible}
      className="fixed top-0 left-0 right-0 z-50 pointer-events-none"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 150ms ease' }}
    >
      <div
        style={{
          transform: `scaleX(${progress / 100})`,
          transformOrigin: '0 0',
          height: 3,
          width: '100%',
          background: 'linear-gradient(90deg, #2563eb, #22c55e)',
          boxShadow: '0 0 8px rgba(37,99,235,.4)',
        }}
      />
    </div>
  );
}
