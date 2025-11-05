import admin from 'firebase-admin';
import { playersCol } from '../src/lib/db';

async function main() {
  const db = admin.firestore();
  const snap = await playersCol().get();
  if (snap.empty) {
    console.log('No players found.');
    return;
  }
  let updated = 0;
  let skipped = 0;
  let batch = db.batch();
  let ops = 0;
  const now = Date.now();

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const retired = data.retired === true;
    const desired = retired ? false : true;
    const current = data.active2024_25 as boolean | undefined;
    if (current === desired) { skipped++; continue; }
    batch.set(d.ref, { active2024_25: desired, updatedAt: now }, { merge: true });
    updated++; ops++;
    if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops > 0) await batch.commit();
  console.log(`Players scanned: ${snap.size}. Updated: ${updated}. Unchanged: ${skipped}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
