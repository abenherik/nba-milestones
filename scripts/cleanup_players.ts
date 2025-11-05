import { playersCol } from '../src/lib/db';

// Keep ONLY these canonical fields, preserving original snake_case and values:
// - full_name, first_name, last_name, birthday, player_id
// Plus derived/search and status flags we rely on in the app:
// - nameLower, retired, active2024_25
const KEEP_FIELDS = new Set(['full_name', 'first_name', 'last_name', 'birthday', 'player_id', 'nameLower', 'retired', 'active2024_25']);

async function main() {
  const dryRun = (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false';
  const snap = await playersCol().get();
  let changed = 0;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, any>;
    const next: Record<string, any> = {};

    // Prefer existing normalized fields; otherwise, derive from legacy 'name'
  // Derive canonical fields from existing snake_case/camelCase, but DO NOT change values if already present
  const legacyName = typeof data.name === 'string' ? data.name : undefined;
  const full_name = typeof data.full_name === 'string' ? data.full_name : (legacyName ? legacyName : undefined);
  const first_name = typeof data.first_name === 'string' ? data.first_name : (legacyName ? legacyName.split(' ')[0] : (typeof data.firstName === 'string' ? data.firstName : undefined));
  const last_name = typeof data.last_name === 'string' ? data.last_name : (legacyName ? legacyName.split(' ').slice(1).join(' ') || undefined : (typeof data.lastName === 'string' ? data.lastName : undefined));

  if (full_name) next.full_name = full_name;
  if (first_name) next.first_name = first_name;
  if (last_name) next.last_name = last_name;

  // Preserve birthday exactly as stored (do not rename or reformat)
  if (data.birthday) next.birthday = data.birthday;

  // Preserve player_id if present; otherwise set from doc id
  if (data.player_id) next.player_id = data.player_id;
  else next.player_id = d.id;

  // Everything else should be removed to meet the slim schema
  const toDelete = Object.keys(data).filter(k => !KEEP_FIELDS.has(k));
  const hasDiff = toDelete.length > 0 || ['full_name','first_name','last_name','birthday','player_id'].some(k => (data as any)[k] !== (next as any)[k]);
    if (!hasDiff) continue;
    changed++;
    if (dryRun) {
      console.log(`[DRY RUN] Would clean doc ${d.id}: remove [${toDelete.join(', ')}], keep fields: ${Object.keys(next).join(', ')}`);
    } else {
      await d.ref.set(next, { merge: false });
      console.log(`Cleaned doc ${d.id}`);
    }
  }
  console.log(`Players scanned: ${snap.size}. ${dryRun ? 'Would change' : 'Changed'}: ${changed}.`);
}

main().catch(err => { console.error(err); process.exit(1); });
