import fs from 'fs';
import path from 'path';

type Category = 'logs' | 'ts' | 'sqlite-temp' | 'snapshots' | 'bref-raw';

function listDirSafe(dir: string): string[] {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function exists(p: string) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function rmFile(p: string) {
  try { fs.unlinkSync(p); return true; } catch { return false; }
}

function rmrf(p: string) {
  try { fs.rmSync(p, { recursive: true, force: true }); return true; } catch { return false; }
}

function resolveRoot(...parts: string[]) { return path.resolve(process.cwd(), ...parts); }

function collectLogs(): string[] {
  const files: string[] = [];
  // docs/reports logs
  const reportsDir = resolveRoot('docs', 'reports');
  for (const f of listDirSafe(reportsDir)) {
    if (f.endsWith('.log')) files.push(path.join(reportsDir, f));
    if (f.startsWith('processed-ids-') && f.endsWith('.txt')) files.push(path.join(reportsDir, f));
  }
  return files;
}

function collectTs(): string[] {
  const files: string[] = [];
  const root = resolveRoot();
  const rootFiles = listDirSafe(root);
  for (const f of rootFiles) {
    if (f.endsWith('.tsbuildinfo')) files.push(path.join(root, f));
  }
  // Next.js cache (optional): remove cache dir only, not entire .next
  const nextCache = resolveRoot('.next', 'cache');
  if (exists(nextCache)) files.push(nextCache);
  return files;
}

function collectSqliteTemp(): string[] {
  const files: string[] = [];
  const dataDir = resolveRoot('data');
  for (const f of listDirSafe(dataDir)) {
    if (f.endsWith('-wal') || f.endsWith('-shm')) files.push(path.join(dataDir, f));
  }
  return files;
}

function collectSnapshots(): string[] {
  const targets: string[] = [];
  const snapDir = resolveRoot('snapshots');
  if (exists(snapDir)) targets.push(snapDir);
  return targets;
}

function collectBrefRaw(): string[] {
  const targets: string[] = [];
  const rawDir = resolveRoot('data', 'bref', 'raw');
  if (exists(rawDir)) targets.push(rawDir);
  return targets;
}

function unique<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

async function main() {
  const raw = String(process.env.CATEGORIES || '').trim();
  const categories: Category[] = (raw ? raw.split(/[\,\s]+/) : ['logs','ts']).filter(Boolean) as Category[];
  const dryRun = process.env.DRY_RUN !== '0' && process.env.FORCE !== '1';

  let targets: string[] = [];
  if (categories.includes('logs')) targets = targets.concat(collectLogs());
  if (categories.includes('ts')) targets = targets.concat(collectTs());
  if (categories.includes('sqlite-temp')) targets = targets.concat(collectSqliteTemp());
  if (categories.includes('snapshots')) targets = targets.concat(collectSnapshots());
  if (categories.includes('bref-raw')) targets = targets.concat(collectBrefRaw());
  targets = unique(targets).filter(p => exists(p));

  if (!targets.length) {
    console.log('[clean] No matching files.');
    return;
  }

  console.log(`[clean] ${dryRun ? 'Would remove' : 'Removing'} ${targets.length} item(s):`);
  for (const p of targets) console.log(' -', path.relative(process.cwd(), p));

  if (dryRun) {
    console.log('\n[clean] Dry-run only. Set FORCE=1 to actually remove.');
    return;
  }

  let removed = 0;
  for (const p of targets) {
    const stat = (() => { try { return fs.statSync(p); } catch { return null; } })();
    if (!stat) continue;
    const ok = stat.isDirectory() ? rmrf(p) : rmFile(p);
    if (ok) removed++;
  }
  console.log(`[clean] Removed ${removed}/${targets.length} item(s).`);
}

main().catch(e => { console.error(e); process.exit(1); });
