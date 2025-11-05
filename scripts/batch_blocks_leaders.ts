import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'child_process';
import { playersCol } from '../src/lib/db';

type Leader = { name: string };

const NAMES: Leader[] = [
  { name: 'Hakeem Olajuwon' },
  { name: 'Dikembe Mutombo' },
  { name: 'Kareem Abdul-Jabbar' },
  { name: 'Mark Eaton' },
  { name: 'Tim Duncan' },
  { name: 'David Robinson' },
  { name: 'Patrick Ewing' },
  { name: "Shaquille O'Neal" },
  { name: 'Tree Rollins' },
  { name: 'Robert Parish' },
  { name: 'Alonzo Mourning' },
  { name: 'Marcus Camby' },
  { name: 'Dwight Howard' },
  { name: 'Ben Wallace' },
  { name: 'Shawn Bradley' },
  { name: 'Manute Bol' },
  { name: 'George Johnson' },
  { name: 'Brook Lopez' },
  { name: 'Kevin Garnett' },
  { name: 'Larry Nance' },
  { name: 'Theo Ratliff' },
  { name: 'Pau Gasol' },
  { name: 'Elton Brand' },
  { name: "Jermaine O'Neal" },
  { name: 'Anthony Davis' },
];

function loadPlayersCsv(): Map<string, { id: string; full_name: string; is_active: boolean }[]> {
  const file = path.resolve(process.cwd(), 'data', 'players.csv');
  const m = new Map<string, { id: string; full_name: string; is_active: boolean }[]>();
  if (!fs.existsSync(file)) return m;
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const [id, full, , , active] = line.split(',');
    if (!id || !full) continue;
    const key = full.toLowerCase();
    const arr = m.get(key) || [];
    arr.push({ id, full_name: full, is_active: active === '1' });
    m.set(key, arr);
  }
  return m;
}

async function runNpm(script: string, env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('npm', ['run', script], { env, shell: true, stdio: 'inherit' });
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))));
    child.on('error', reject);
  });
}

async function existsInFirestore(id: string): Promise<boolean> {
  const snap = await playersCol().doc(id).get();
  return snap.exists;
}

async function main() {
  const map = loadPlayersCsv();
  let processed = 0;
  for (const { name } of NAMES) {
    const key = name.toLowerCase();
  const cands = map.get(key) || [];
  const pick = cands[0]; // first entry
    if (!pick) {
      console.warn(`No NBA ID found in CSV for ${name}`);
      continue;
    }
    if (await existsInFirestore(pick.id)) {
      console.log(`Skip existing ${name} (${pick.id})`);
      continue;
    }
    const baseEnv: NodeJS.ProcessEnv = { ...process.env, PLAYER_ID: pick.id, FULL_NAME: pick.full_name, RETIRED: '1' };
    console.log(`\n=== ${name} (${pick.id}) ===`);
    await runNpm('db:upsert:player', baseEnv);
    await runNpm('db:fetch:gamelogs', { ...baseEnv, SKIP_EXISTING: '1', DELAY_MS: '900' });
    await runNpm('db:aggregate:totals', { ...baseEnv, INCLUDE_PLAYOFFS: '1' });
    processed++;
  }
  console.log(`Done. Processed ${processed} players.`);
}

main().catch(e => { console.error(e); process.exit(1); });
