#!/usr/bin/env tsx
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function getPort(): number {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.next', 'dev-port.json'), 'utf8')) as { port?: number };
    if (typeof j.port === 'number') return j.port;
  } catch {}
  const envPort = Number(process.env.PORT);
  return Number.isFinite(envPort) && envPort > 0 ? envPort : 3001;
}

function getPrivateIp(): string | null {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const info of nets[name] || []) {
      if (info && typeof info === 'object' && 'family' in info) {
        const fam = (info as any).family;
        const ipv4 = fam === 4 || fam === 'IPv4';
        if (ipv4 && !(info as any).internal) {
          const addr = String((info as any).address || '');
          if (/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(addr)) {
            return addr;
          }
        }
      }
    }
  }
  return null;
}

const port = getPort();
const ip = getPrivateIp() || 'localhost';
process.stdout.write(`http://${ip}:${port}\n`);
