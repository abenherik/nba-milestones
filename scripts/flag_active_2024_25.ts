import admin from 'firebase-admin';
import { playersCol } from '../src/lib/db';

async function main() {
  const db = admin.firestore();
  const snap = await playersCol().get();
  if (snap.empty) {
    console.log('No players found.');
    return;
  }
  let changed = 0;
  let skipped = 0;
  let batch = db.batch();
  let ops = 0;
  for (const d of snap.docs) {
    const id = d.id;
    // Skip Josh Smith
    if (id === '2746') { skipped++; continue; }
    const data = d.data() as Record<string, unknown>;
    // If already true, skip to reduce writes
    if (data.active2024_25 === true) { skipped++; continue; }
    batch.set(d.ref, { active2024_25: true, updatedAt: Date.now() }, { merge: true });
    changed++; ops++;
    if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
  }
  if (ops > 0) await batch.commit();
  console.log(`Players scanned: ${snap.size}. Updated active2024_25 for: ${changed}. Skipped: ${skipped}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
