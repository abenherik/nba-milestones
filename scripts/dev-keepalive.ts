#!/usr/bin/env tsx
import { spawn, ChildProcess } from 'node:child_process';
import { platform } from 'node:os';
import { env } from 'node:process';
import net from 'node:net';

const START_PORT = Number(env.PORT || 3000);
const HEALTH_HOST = env.HEALTH_HOST || '127.0.0.1';
const AUTO_OPEN = env.AUTO_OPEN !== '0';
const MAX_TRIES = 15;
const CHECK_INTERVAL_MS = Number(env.CHECK_INTERVAL_MS || 4000);
const FAIL_THRESHOLD = Number(env.FAIL_THRESHOLD || 3);

async function checkPortInUse(port: number): Promise<boolean> {
  const tryConnect = (host: string) => new Promise<boolean>((res) => {
    const socket = net.connect({ port, host, timeout: 500 }, () => { socket.destroy(); res(true); });
    socket.on('timeout', () => { socket.destroy(); res(false); });
    socket.on('error', () => res(false));
  });
  return Promise.race([
    Promise.all([tryConnect('127.0.0.1'), tryConnect('::1')]).then(([v4, v6]) => v4 || v6),
    new Promise<boolean>((res) => setTimeout(() => res(false), 800)),
  ]);
}

async function findAvailablePort(start = START_PORT): Promise<number> {
  for (let i = 0; i < MAX_TRIES; i++) {
    const p = start + i;
    const inUse = await checkPortInUse(p);
    if (!inUse) {
      try {
        await new Promise<void>((resolve, reject) => {
          const s = net.createServer().once('error', reject).once('listening', () => s.close(() => resolve())).listen(p, '::');
        });
        return p;
      } catch {
        // try next
      }
    }
  }
  return start; // fallback
}

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function isHealthy(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 1500);
  const url = `http://${HEALTH_HOST}:${port}/api/health`;
    const { fetch } = await import('undici');
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(t);
    // Consider any response < 500 healthy (includes 3xx/4xx during build or missing route)
    return res.status < 500;
  } catch {
    // If fetch failed, but port is listening, assume it's still coming up
    return checkPortInUse(port);
  }
}

async function main() {
  let port = await findAvailablePort(START_PORT);
  let child: ChildProcess | null = null;
  let failures = 0;
  const opened: Record<number, boolean> = {};

  async function start() {
    if (child) { try { child.kill(); } catch {} child = null; }
    port = await findAvailablePort(START_PORT);
    console.log(`[dev-keepalive] Starting Next dev on http://localhost:${port}`);
  child = spawn('npx', ['next', 'dev'], {
      stdio: 'inherit',
      env: { ...env, PORT: String(port) },
      shell: platform() === 'win32',
    });
    child.on('exit', (code) => {
      console.warn(`[dev-keepalive] next dev exited with code ${code ?? 0}; restarting in 2s...`);
      setTimeout(start, 2000);
    });
  }

  await start();

  // health loop
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await wait(CHECK_INTERVAL_MS);
    const ok = await isHealthy(port);
    if (ok) {
      failures = 0;
      if (AUTO_OPEN && !opened[port]) {
        const url = `http://${HEALTH_HOST}:${port}`;
        try {
          if (platform() === 'win32') {
            spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Start-Process '${url}'`], { detached: true, stdio: 'ignore' }).unref();
          } else if (process.platform === 'darwin') {
            spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
          } else {
            spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
          }
          console.log(`[dev-keepalive] Opened ${url}`);
          opened[port] = true;
        } catch (e) {
          console.warn('[dev-keepalive] Failed to auto-open browser:', e);
        }
      }
      continue;
    }
    failures++;
    if (failures >= FAIL_THRESHOLD) {
      console.warn(`[dev-keepalive] Health check failed ${failures}x; restarting server...`);
      failures = 0;
      await start();
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
