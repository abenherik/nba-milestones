#!/usr/bin/env tsx
/**
 * Single-instance dev launcher for Windows/PowerShell and cross-platform.
 * - If a Next.js dev server is already listening (default PORT or $PORT), exit with a helpful note.
 * - Otherwise, start `next dev` and proxy stdio.
 */

import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { env, exit } from 'node:process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PORT = Number(env.PORT || 3000);
const STRICT_PORT = env.STRICT_PORT === '1';
const MAX_TRIES = 10; // try 10 consecutive ports max

function checkPortInUse(port: number): Promise<boolean> {
  // Robust check: try connecting on IPv4 and IPv6; if either connects, it's in use.
  const tryConnect = (host: string) => new Promise<boolean>((res) => {
    const socket = net.connect({ port, host, timeout: 500 }, () => {
      socket.destroy();
      res(true);
    });
    socket.on('timeout', () => { socket.destroy(); res(false); });
    socket.on('error', () => { res(false); });
  });
  return Promise.race([
    Promise.all([tryConnect('127.0.0.1'), tryConnect('::1')]).then(([v4, v6]) => v4 || v6),
    new Promise<boolean>((res) => setTimeout(() => res(false), 800)),
  ]);
}

async function findAvailablePort(start: number, maxTries = MAX_TRIES): Promise<number> {
  if (STRICT_PORT) {
    // In strict mode, do not fall back; respect the requested port only.
    const inUse = await checkPortInUse(start);
    if (inUse) {
      console.log(`Port ${start} is busy. STRICT_PORT=1 set; not starting a second dev server.`);
      // Exit cleanly; callers (dev:link) will surface the existing URL.
      exit(0);
    }
    return start;
  }
  for (let i = 0; i < maxTries; i++) {
    const p = start + i;
    // Also guard against false-negatives by attempting a quick bind on IPv6
    const inUse = await checkPortInUse(p);
    if (!inUse) {
      try {
        await new Promise<void>((resolve, reject) => {
          const s = net.createServer().once('error', reject).once('listening', () => s.close(() => resolve())).listen(p, '::');
        });
        return p;
      } catch {
        // occupied; continue
      }
    }
  }
  return start; // fallback; Next will error if none free
}

(async () => {
  const port = await findAvailablePort(DEFAULT_PORT);
  if (port !== DEFAULT_PORT) {
    console.log(`Port ${DEFAULT_PORT} is busy. Starting dev server on http://localhost:${port} instead.`);
  }

  // Persist the chosen dev URL/port so other scripts and tooling can surface the correct link.
  try {
    const nextDir = path.join(process.cwd(), '.next');
    fs.mkdirSync(nextDir, { recursive: true });
    const url = `http://localhost:${port}`;
    fs.writeFileSync(path.join(nextDir, 'dev-port.json'), JSON.stringify({ port, url, ts: Date.now() }, null, 2));
    fs.writeFileSync(path.join(nextDir, 'dev-url.txt'), url + '\n');
  } catch { /* ignore */ }

  const child = spawn('npx', ['next', 'dev', '-H', '0.0.0.0', '-p', String(port)], {
    stdio: 'inherit',
    env: { ...env, PORT: String(port) },
    shell: platform() === 'win32',
  });

  child.on('exit', (code) => exit(code ?? 0));
})();
