#!/usr/bin/env tsx
/**
 * Dev Clean: remove common stale caches that confuse Next dev.
 */
import fs from 'node:fs';
import path from 'node:path';

function rm(p: string) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }
const root = process.cwd();
const targets = [
  path.join(root, '.next'),
  path.join(root, 'node_modules', '.cache'),
];
for (const t of targets) rm(t);
console.log('Removed caches: ' + targets.map(t => path.relative(root, t)).join(', '));
