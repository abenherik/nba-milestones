#!/usr/bin/env tsx
/**
 * Dev Doctor: preflight checks to avoid common Next.js App Router pitfalls.
 * - Fails fast on legacy Pages Router files that cause mixed-router issues.
 * - Warns or deletes problematic middleware that intercepts Next internals.
 * - Ensures required error components exist for App Router dev overlay.
 * - Verifies SWC native binary presence; suggests `npm install` if missing.
 */
import fs from 'node:fs';
import path from 'node:path';

function has(p: string) { return fs.existsSync(p); }
function rm(p: string) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }
function ensureDir(p: string) { if (!has(p)) fs.mkdirSync(p, { recursive: true }); }

function readJson<T=any>(p: string): T | null { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

const root = process.cwd();
const appDir = path.join(root, 'src', 'app');
const pagesDir = path.join(root, 'src', 'pages');
const middlewareFile = path.join(root, 'src', 'middleware.ts');
const nextDir = path.join(root, '.next');

let ok = true;
const notes: string[] = [];

// Helpers to detect trivial/placeholder pages files
function isTrivialFile(fp: string): boolean {
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    const noComments = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '\n');
    const trimmed = noComments.trim();
    if (trimmed === '') return true;
    if (/^export\s*\{\s*\};?\s*$/.test(trimmed)) return true;
    return false;
  } catch { return false; }
}

// 1) Block mixed router: any substantive file under src/pages is a red flag in App Router-only app
if (has(pagesDir)) {
  const entries = fs.readdirSync(pagesDir).filter(n => !n.startsWith('.'));
  // Auto-clean trivial files
  for (const e of entries) {
    const fp = path.join(pagesDir, e);
    try {
      const stat = fs.statSync(fp);
      if (stat.isFile() && isTrivialFile(fp)) {
        fs.rmSync(fp, { force: true });
        notes.push(`Removed trivial legacy file ${path.relative(root, fp)}.`);
      }
    } catch {}
  }
  // Re-scan after cleanup
  const remaining = fs.readdirSync(pagesDir).filter(n => !n.startsWith('.'));
  // Classify remaining as substantive vs trivial
  const substantive: string[] = [];
  for (const e of remaining) {
    const fp = path.join(pagesDir, e);
    try {
      const st = fs.statSync(fp);
      if (st.isDirectory()) { substantive.push(e); continue; }
      if (!isTrivialFile(fp)) substantive.push(e);
    } catch { substantive.push(e); }
  }
  if (substantive.length === 0) {
    // Only trivial leftovers; remove trivial files but keep an empty directory with a .keep
    for (const e of remaining) {
      const fp = path.join(pagesDir, e);
      try { fs.rmSync(fp, { force: true }); } catch {}
    }
    try {
      ensureDir(pagesDir);
      const keep = path.join(pagesDir, '.keep');
      if (!has(keep)) fs.writeFileSync(keep, 'Placeholder to satisfy Next dev scanner. App Router only.');
      notes.push('Cleaned src/pages and left a .keep placeholder to avoid Next dev ENOENT.');
    } catch {}
  } else {
    ok = false;
    notes.push(`Found legacy Pages Router directory src/pages (${substantive.join(', ')}). Remove it to avoid mixed-router asset 404s.`);
  }
}

// 2) Middleware: known to intercept _next assets if not carefully scoped; auto-disable in dev
if (has(middlewareFile)) {
  // Auto-quarantine middleware by renaming
  const quarantine = path.join(root, 'src', '_middleware.quarantined.ts');
  try {
    fs.renameSync(middlewareFile, quarantine);
    notes.push('Quarantined src/middleware.ts -> src/_middleware.quarantined.ts to prevent dev asset interception.');
  } catch {
    notes.push('Warning: Detected src/middleware.ts which may intercept Next internals; consider removing or scoping matchers.');
  }
}

// 3) Required App Router error components
const requiredErrors = [
  path.join(appDir, 'error.tsx'),
  path.join(appDir, 'global-error.tsx'),
  path.join(appDir, 'not-found.tsx'),
];
for (const f of requiredErrors) {
  if (!has(f)) {
    ok = false;
    notes.push(`Missing ${path.relative(root, f)} (required for stable App Router dev overlay).`);
  }
}

// 4) SWC native hints: missing binaries can cause rebuild loops
const lock = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'].map(n => path.join(root, n)).find(has);
const swcDir = path.join(root, 'node_modules', '@next', 'swc');
if (!has(swcDir)) {
  notes.push('SWC native binaries not found under node_modules/@next/swc. Run `npm install` if you see SWC patching warnings.');
}

// 5) Clean stale dev artifacts when things look off
const devPortJson = path.join(nextDir, 'dev-port.json');
const devUrlTxt = path.join(nextDir, 'dev-url.txt');
const stale: string[] = [];
if (has(nextDir)) {
  // Heuristic: if dev-port.json exists without .next/server, it's stale
  const serverDir = path.join(nextDir, 'server');
  if (has(devPortJson) && !has(serverDir)) stale.push(devPortJson);
  if (has(devUrlTxt) && !has(serverDir)) stale.push(devUrlTxt);
}
for (const f of stale) rm(f);
if (stale.length) notes.push(`Removed stale dev artifacts: ${stale.map(s => path.relative(root, s)).join(', ')}`);

if (!ok) {
  console.error('Dev Doctor failed preflight:\n- ' + notes.join('\n- '));
  process.exit(2);
}
if (notes.length) {
  console.log('Dev Doctor notes:\n- ' + notes.join('\n- '));
}
