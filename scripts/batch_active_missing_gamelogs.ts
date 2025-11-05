import { playersCol, firestore } from '../src/lib/db';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

type Options = {
  limit?: number;
  delayMs?: number;
  skipExisting?: boolean;
};

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

async function findActivePlayersMissingLogs(limit?: number) {
  // Find active players
  const activeSnap = await playersCol().where('active2024_25', '==', true).get();
  const db = firestore;
  const results: { id: string; name: string }[] = [];
  for (const d of activeSnap.docs) {
    const id = d.id;
    const name = (d.data().full_name as string) || (d.data().name as string) || id;
    // quick existence check: any gamelog doc with this playerId
    const glSnap = await db.collection('playerGameLogs').where('playerId', '==', id).limit(1).get();
    if (glSnap.empty) results.push({ id, name });
    if (limit && results.length >= limit) break;
  }
  return results;
}

function runNpm(script: string, env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', script], { env, shell: true, stdio: 'inherit' });
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)));
    child.on('error', reject);
  });
}

async function processPlayer(id: string, opts: Options) {
  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PLAYER_ID: id,
    SKIP_EXISTING: opts.skipExisting ? '1' : '0',
    DELAY_MS: String(opts.delayMs ?? 700),
  };
  // fetch gamelogs first (script itself will skip existing season docs if enabled)
  await runNpm('db:fetch:gamelogs', baseEnv);
  // aggregate totals (once per player) to a single doc
  await runNpm('db:aggregate:totals', { ...baseEnv, INCLUDE_PLAYOFFS: '1' });
}

// Minimal CSV reader for data/players.csv to map names -> IDs
function loadPlayersCsv(): Record<string, { id: string; first: string; last: string; active: boolean }[]> {
  const file = path.resolve(process.cwd(), 'data', 'players.csv');
  const byLowerName: Record<string, { id: string; first: string; last: string; active: boolean }[]> = {};
  if (!fs.existsSync(file)) return byLowerName;
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  // header: id,full_name,first_name,last_name,is_active
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const [id, full, first, last, active] = line.split(',');
    if (!id || !full) continue;
    const key = full.toLowerCase();
    const entry = { id, first: first || '', last: last || '', active: active === '1' };
    byLowerName[key] ||= [];
    byLowerName[key].push(entry);
  }
  return byLowerName;
}

async function fetchJson(url: string) {
  const headers = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://www.nba.com',
    'Referer': 'https://www.nba.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true',
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal } as any);
    clearTimeout(t);
    if (!r.ok) return undefined;
    return await r.json();
  } catch {
    clearTimeout(t);
    return undefined;
  }
}

async function hasNbaSeasons(playerId: string): Promise<boolean> {
  const url = `https://stats.nba.com/stats/commonplayerinfo?PlayerID=${playerId}`;
  const json = await fetchJson(url);
  const rs = (json as any)?.resultSets ?? (json as any)?.resultSet ?? [];
  const rows = rs?.[0]?.rowSet ?? [];
  return Array.isArray(rows) && rows.length > 0;
}

async function migrateId(oldId: string, newId: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, OLD_ID: oldId, NEW_ID: newId };
  await runNpm('db:migrate:player-id', env);
}

async function main() {
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : undefined;
  const delayMs = process.env.BATCH_DELAY_MS ? Number(process.env.BATCH_DELAY_MS) : 1200;
  const skipExisting = process.env.SKIP_EXISTING !== '0'; // default true

  const targets = await findActivePlayersMissingLogs(limit);
  if (!targets.length) {
    console.log('No active players without gamelogs found.');
    return;
  }
  console.log(`Processing ${targets.length} players...`);
  const byName = loadPlayersCsv();
  let i = 0;
  for (const t of targets) {
    i++;
    console.log(`\n=== (${i}/${targets.length}) ${t.name} (${t.id}) ===`);
    try {
      let playerId = t.id;
      // Validate the ID against NBA stats; if invalid, try to remap via players.csv
      const ok = await hasNbaSeasons(playerId);
      if (!ok) {
        const key = t.name.toLowerCase();
        const candidates = byName[key] || [];
        const activeCand = candidates.find(c => c.active) || candidates[0];
        if (activeCand && activeCand.id !== playerId) {
          console.log(`Remapping ${t.name} ${playerId} -> ${activeCand.id}`);
          try {
            await migrateId(playerId, activeCand.id);
            playerId = activeCand.id;
          } catch (e) {
            console.warn(`Migration failed for ${t.name}:`, (e as Error).message);
          }
        } else {
          console.warn(`No NBA mapping found for ${t.name}; skipping.`);
          continue;
        }
      }
      await processPlayer(playerId, { delayMs: 700, skipExisting });
    } catch (e) {
      console.warn(`Player ${t.id} failed:`, (e as Error).message);
    }
    await sleep(delayMs);
  }
  console.log('Batch complete');
}

main().catch(e => { console.error(e); process.exit(1); });
