import { playersCol } from '../src/lib/db';

async function main() {
  const full = process.argv.slice(2).join(' ') || 'Paolo Banchero';
  const exact = await playersCol().where('full_name', '==', full).limit(5).get();
  if (!exact.empty) {
    for (const d of exact.docs) console.log(`Match: id=${d.id} data=${JSON.stringify(d.data())}`);
    return;
  }
  console.log('No exact full_name match. Showing a few examples:');
  const snap = await playersCol().limit(10).get();
  for (const d of snap.docs) console.log(`id=${d.id} full_name=${(d.data() as any).full_name}`);
}

main().catch(e => { console.error(e); process.exit(1); });
