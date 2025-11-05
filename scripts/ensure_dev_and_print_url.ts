#!/usr/bin/env tsx
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

function tryConnect(port: number, host: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => { if (!done) { done = true; resolve(ok); } };
    const socket = net.connect({ port, host });
    const t = setTimeout(() => { socket.destroy(); finish(false); }, timeoutMs);
    socket.on('connect', () => { clearTimeout(t); socket.destroy(); finish(true); });
    socket.on('error', () => { clearTimeout(t); finish(false); });
  });
}

async function isListening(port: number): Promise<boolean> {
  const [v4, v6] = await Promise.all([
    tryConnect(port, '127.0.0.1', 400),
    tryConnect(port, '::1', 400),
  ]);
  return v4 || v6;
}

function candidatesFromState(): number[] {
  const cs: number[] = [];
  const envPort = Number(process.env.PORT);
  if (Number.isFinite(envPort) && envPort > 0) cs.push(envPort);
  // Read persisted dev port if present
  try {
    const j = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.next', 'dev-port.json'), 'utf8')) as { port?: number };
    if (j.port && !cs.includes(j.port)) cs.push(j.port);
  } catch {}
  for (const p of [3001, 3000]) if (!cs.includes(p)) cs.push(p);
  return cs;
}

async function detectListeningPort(): Promise<number | null> {
  const cs = candidatesFromState();
  for (const p of cs) {
    if (await isListening(p)) return p;
  }
  return null;
}

async function ensureDev(): Promise<number> {
  // If something is already listening, just use it.
  let port = await detectListeningPort();
  if (port) return port;

  // Start dev in detached background via low-mem path; prefer PORT if provided else 3001.
  const startPort = String(process.env.PORT || 3001);
  // Respect STRICT_PORT=1: if requested port is busy, do not spawn another server; keep waiting for it to free up.
  if (process.env.STRICT_PORT === '1') {
    const target = Number(startPort);
    const deadline = Date.now() + Number(process.env.WAIT_MS || 60000);
    while (Date.now() < deadline) {
      const listening = await isListening(target);
      if (!listening) break; // port freed; proceed to spawn
      // If already listening, just return it
      return target;
    }
  }
  const child = spawn('npm', ['run', '-s', 'dev:lowmem'], {
    env: { ...process.env, PORT: startPort },
    shell: process.platform === 'win32',
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  // Wait for it to begin listening; watch .next/dev-port.json for the actual port.
  const deadline = Date.now() + Number(process.env.WAIT_MS || 60000);
  while (Date.now() < deadline) {
    // Re-check persisted port if available
    try {
      const j = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.next', 'dev-port.json'), 'utf8')) as { port?: number };
      if (j.port && await isListening(j.port)) return j.port;
    } catch {}
    const p = await detectListeningPort();
    if (p) return p;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Timed out waiting for dev server to start');
}

async function main() {
  const p = await ensureDev();
  process.stdout.write(`http://localhost:${p}\n`);
}

main().catch((e) => { console.error(String(e?.message || e)); process.exit(1); });
