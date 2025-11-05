import './globals.css';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import HeaderNav from '../components/HeaderNav';
import TopLoader from '../components/TopLoader';
import PerformanceMonitor from '../components/PerformanceMonitor';

export const metadata: Metadata = {
  title: 'NBA Milestones',
  description: 'Track NBA player milestone progress',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  {/* Hint to browsers & forced-dark engines that we supply both themes */}
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
        
        {/* Preload critical fonts */}
        <link 
          rel="preload" 
          href="/fonts/inter-var.woff2" 
          as="font" 
          type="font/woff2" 
          crossOrigin="anonymous"
        />
        
        {/* Minimal inline fallback styles to avoid "unstyled" look if Tailwind isn't loaded yet in dev */}
        <style dangerouslySetInnerHTML={{ __html: `
          *,*::before,*::after{box-sizing:border-box}
          html,body{margin:0;padding:0}
          body{font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Noto Sans, "Apple Color Emoji","Segoe UI Emoji"}
          header.app-nav nav{display:flex;gap:.75rem}
          a{text-decoration:none}
          input,button{border:1px solid #d4d4d8;border-radius:6px;padding:.5rem .75rem}
          /* Prevent layout shift */
          .loading-placeholder{min-height:2rem;background:#f4f4f5;border-radius:4px;animation:pulse 2s cubic-bezier(0.4,0,0.6,1) infinite}
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        `}} />
      </head>
      <body className="bg-zinc-50/40 dark:bg-zinc-950 font-sans antialiased text-zinc-900 dark:text-zinc-100">
  <Suspense fallback={null}>
    <TopLoader />
  </Suspense>
  <PerformanceMonitor />
  <HeaderNav />
        <main className="px-3 py-4 sm:p-4 max-w-6xl mx-auto">{children}</main>
      </body>
    </html>
  );
}
