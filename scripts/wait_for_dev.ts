#!/usr/bin/env tsx
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

function tryConnect(port: number, host: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return; done = true; resolve(ok);
    };
    const socket = net.connect({ port, host });
    const t = setTimeout(() => { socket.destroy(); finish(false); }, timeoutMs);
    socket.on('connect', () => { clearTimeout(t); socket.destroy(); finish(true); });
    socket.on('error', () => { clearTimeout(t); finish(false); });
  });
}

async function isListening(port: number): Promise<boolean> {
  const [v4, v6] = await Promise.all([
    tryConnect(port, '127.0.0.1', 500),
    tryConnect(port, '::1', 500),
  ]);
  return v4 || v6;
}

function getPortCandidates(): number[] {
  const cwd = process.cwd();
  const candidates: number[] = [];
  const envPort = Number(process.env.PORT);
  if (Number.isFinite(envPort) && envPort > 0) candidates.push(envPort);
  try {
    const j = JSON.parse(fs.readFileSync(path.join(cwd, '.next', 'dev-port.json'), 'utf8')) as { port?: number };
    if (j.port && !candidates.includes(j.port)) candidates.push(j.port);
  } catch {}
  // Common fallbacks
  for (const p of [3001, 3000]) if (!candidates.includes(p)) candidates.push(p);
  return candidates;
}

async function main() {
  const deadline = Date.now() + Number(process.env.WAIT_MS || 60000);
  const candidates = getPortCandidates();
  let readyPort: number | null = null;
  while (Date.now() < deadline) {
    for (const p of candidates) {
      if (await isListening(p)) { readyPort = p; break; }
    }
    if (readyPort) break;
    await new Promise(r => setTimeout(r, 500));
  }
  if (!readyPort) {
    console.error('TIMEOUT waiting for dev server');
    process.exit(1);
  }
  const url = `http://localhost:${readyPort}`;
  process.stdout.write(url + '\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
