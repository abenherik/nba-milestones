import { playersCol } from '../src/lib/db';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

type Leader = { name: string; id?: string; retired?: boolean };

const LEADERS: Leader[] = [
  { name: 'Wilt Chamberlain', retired: true },
  { name: 'Bill Russell', retired: true },
  { name: 'Kareem Abdul-Jabbar', retired: true },
  { name: 'Elvin Hayes', retired: true },
  { name: 'Moses Malone', retired: true },
  { name: 'Tim Duncan', retired: true },
  { name: 'Karl Malone', retired: true },
  { name: 'Robert Parish', retired: true },
  { name: 'Kevin Garnett', retired: true },
  { name: 'Dwight Howard', retired: true },
  { name: 'Nate Thurmond', retired: true },
  { name: 'Walt Bellamy', retired: true },
  { name: 'Wes Unseld', retired: true },
  { name: 'Hakeem Olajuwon', retired: true },
  { name: "Shaquille O'Neal", retired: true },
  { name: 'Buck Williams', retired: true },
  { name: 'Jerry Lucas', retired: true },
  { name: 'Bob Pettit', retired: true },
  { name: 'Charles Barkley', retired: true },
  { name: 'Dikembe Mutombo', retired: true },
  { name: 'Paul Silas', retired: true },
  { name: 'Charles Oakley', retired: true },
  { name: 'Dennis Rodman', retired: true },
  { name: 'Kevin Willis', retired: true },
  { name: 'LeBron James', retired: false },
];

function normalize(s: string) { return s.trim().toLowerCase(); }

function findIdFromCsv(fullName: string): string | null {
  const files = [
    path.resolve(process.cwd(), 'data', 'raw', 'csv', 'player.csv'),
    path.resolve(process.cwd(), 'data', 'players.csv'),
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    // header: id,full_name,first_name,last_name,is_active
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const parts = line.split(',');
      const id = parts[0];
      const full = parts[1];
      if (normalize(full) === normalize(fullName)) return id;
    }
  }
  return null;
}

async function runStep(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { env, shell: true, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))));
    child.on('error', reject);
  });
}

async function ensurePlayer(id: string, name: string, retired: boolean) {
  const snap = await playersCol().doc(String(id)).get();
  const [first, ...rest] = name.split(' ').filter(Boolean);
  const last = rest.join(' ');
  if (!snap.exists) {
    console.log(`Creating player ${name} (${id})`);
    await playersCol().doc(String(id)).set({
      player_id: String(id),
      full_name: name,
      first_name: first || undefined,
      last_name: last || undefined,
      nameLower: name.toLowerCase(),
      retired: !!retired,
      active2024_25: retired ? false : true,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    }, { merge: true });
  } else {
    await playersCol().doc(String(id)).set({
      player_id: String(id),
      full_name: name,
      first_name: first || undefined,
      last_name: last || undefined,
      nameLower: name.toLowerCase(),
      retired: !!retired,
      active2024_25: retired ? false : true,
      updatedAt: Date.now(),
    }, { merge: true });
  }
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const ONLY_MISSING = process.env.ONLY_MISSING === '1';
  const DRY_RUN = process.env.DRY_RUN === '1';
  const PLAYERS_ONLY = process.env.PLAYERS_ONLY === '1';
  const missing: Array<{ name: string; id: string; retired: boolean }> = [];

  for (const p of LEADERS) {
    const id = findIdFromCsv(p.name);
    if (!id) {
      console.warn(`ID not found in CSV for ${p.name}`);
      continue;
    }
    p.id = id;
    const snap = await playersCol().doc(String(id)).get();
    if (!snap.exists) missing.push({ name: p.name, id, retired: !!p.retired });
    // Only ensure/create immediately when not in DRY_RUN; this does not fetch gamelogs
    if (!DRY_RUN) {
      await ensurePlayer(id, p.name, !!p.retired);
    }
    await sleep(200);
  }

  console.log(`Missing players: ${missing.map(m => `${m.name}(${m.id})`).join(', ') || 'none'}`);

  if (DRY_RUN) {
    console.log('DRY_RUN=1 set; exiting after search.');
    return;
  }

  if (PLAYERS_ONLY) {
    console.log('PLAYERS_ONLY=1 set; ensured/updated player docs only. Skipping fetch/aggregate.');
    return;
  }

  // Determine which players to process in fetch/aggregate stage
  const toProcess = ONLY_MISSING ? LEADERS.filter(p => p.id && missing.some(m => m.id === p.id)) : LEADERS.filter(p => p.id);
  if (ONLY_MISSING) {
    console.log(`ONLY_MISSING=1 set; will fetch for ${toProcess.length} missing players.`);
  }

  for (const p of toProcess) {
    if (!p.id) continue;
    const baseEnv: NodeJS.ProcessEnv = {
      ...process.env,
      FIREBASE_SERVICE_ACCOUNT_FILE: process.env.FIREBASE_SERVICE_ACCOUNT_FILE || 'credentials/NBA Milestones key.json',
      PLAYER_ID: String(p.id),
      FULL_NAME: p.name,
      SKIP_EXISTING: '1',
      DELAY_MS: process.env.DELAY_MS || '600',
    };
    console.log(`\n=== Fetch gamelogs for ${p.name} (${p.id}) ===`);
    await runStep('npm', ['run', 'db:fetch:gamelogs'], baseEnv);
    await sleep(500);
    console.log(`=== Aggregate totals (incl. playoffs) for ${p.name} (${p.id}) ===`);
    await runStep('npm', ['run', 'db:aggregate:totals'], { ...baseEnv, INCLUDE_PLAYOFFS: '1' });
    await sleep(800);
  }

  console.log('All-time rebound leaders ensured and data fetched.');
}

main().catch((e) => { console.error(e); process.exit(1); });
