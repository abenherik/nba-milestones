import { spawn } from 'child_process';

type Player = {
  id: string;
  name: string;
  birthday?: string;
  retired?: boolean;
};

const PLAYERS: Player[] = [
  { id: '406', name: "Shaquille O'Neal", birthday: '1972-03-06', retired: true },
  { id: '2740', name: 'Andris Biedrins', birthday: '1986-04-02', retired: true },
  { id: '2199', name: 'Tyson Chandler', birthday: '1982-10-02', retired: true },
];

function runStep(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, shell: true, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function processPlayer(p: Player) {
  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PLAYER_ID: p.id,
    FULL_NAME: p.name,
    BIRTHDAY: p.birthday || '',
    RETIRED: p.retired ? '1' : '0',
  };

  console.log(`\n=== Upsert ${p.name} (${p.id}) ===`);
  await runStep('npm', ['run', 'db:upsert:player'], baseEnv);

  console.log(`\n=== Fetch gamelogs for ${p.id} ===`);
  await runStep('npm', ['run', 'db:fetch:gamelogs'], { ...baseEnv });

  console.log(`\n=== Aggregate totals for ${p.id} (incl. playoffs) ===`);
  await runStep('npm', ['run', 'db:aggregate:totals'], { ...baseEnv, INCLUDE_PLAYOFFS: '1' });

  console.log(`\n=== Done ${p.name} (${p.id}) ===`);
}

async function main() {
  console.log('Batch starting for players:', PLAYERS.map(p => `${p.name}(${p.id})`).join(', '));
  for (const p of PLAYERS) {
    try {
      await processPlayer(p);
    } catch (e) {
      console.warn(`Step failed for ${p.id}: ${(e as Error).message}`);
    }
    await sleep(800);
  }
  console.log('Batch complete');
}

main().catch(e => { console.error(e); process.exit(1); });
