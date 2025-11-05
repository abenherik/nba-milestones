#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

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
    tryConnect(port, '127.0.0.1', 500),
    tryConnect(port, '::1', 500),
  ]);
  return v4 || v6;
}

const pJson = path.join(process.cwd(), '.next', 'dev-port.json');
const urlTxt = path.join(process.cwd(), '.next', 'dev-url.txt');

function getPortCandidates(): number[] {
  const candidates: number[] = [];
  const envPort = Number(process.env.PORT);
  if (Number.isFinite(envPort) && envPort > 0) candidates.push(envPort);
  try {
    if (fs.existsSync(pJson)) {
      const j = JSON.parse(fs.readFileSync(pJson, 'utf8')) as { url?: string; port?: number };
      if (j.port && !candidates.includes(j.port)) candidates.push(j.port);
      if (j.url) {
        const port = Number(String(j.url).split(':').pop());
        if (Number.isFinite(port) && !candidates.includes(port)) candidates.push(port);
      }
    }
  } catch {}
  // Prefer our Dev task's port first when probing, then common alternates
  const common = [3001, 3002, 3000, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010];
  for (const p of common) if (!candidates.includes(p)) candidates.push(p);
  return candidates;
}

async function main() {
  // Prefer the freshest state file (dev-url.txt vs dev-port.json)
  try {
    const stats: Array<{ path: string; mtimeMs: number; type: 'url'|'port' }>=[];
    if (fs.existsSync(urlTxt)) stats.push({ path: urlTxt, mtimeMs: fs.statSync(urlTxt).mtimeMs, type: 'url' });
    if (fs.existsSync(pJson)) stats.push({ path: pJson, mtimeMs: fs.statSync(pJson).mtimeMs, type: 'port' });
    stats.sort((a,b) => b.mtimeMs - a.mtimeMs);
    for (const s of stats) {
      if (s.type === 'url') {
        const raw = fs.readFileSync(s.path, 'utf8').trim();
        const m = raw.match(/:(\d+)/);
        const p = m ? Number(m[1]) : NaN;
        if (Number.isFinite(p) && await isListening(p)) {
          process.stdout.write(`${raw}\n`);
          return;
        }
      } else {
        const j = JSON.parse(fs.readFileSync(s.path, 'utf8')) as { port?: number };
        if (j.port && await isListening(j.port)) {
          process.stdout.write(`http://localhost:${j.port}\n`);
          return;
        }
      }
    }
  } catch {}

  // Otherwise, probe candidates and print the first listening one
  const candidates = getPortCandidates();
  for (const p of candidates) {
    if (await isListening(p)) {
      process.stdout.write(`http://localhost:${p}\n`);
      return;
    }
  }

  // Final fallback: default to 3001 (Dev task default)
  process.stdout.write('http://localhost:3001\n');
}

main().finally(() => process.exit(0));
