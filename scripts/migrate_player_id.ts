import admin from 'firebase-admin';
import { playersCol } from '../src/lib/db';

async function migrate(oldId: string, newId: string) {
  const db = admin.firestore();
  const oldPlayerRef = playersCol().doc(oldId);
  const newPlayerRef = playersCol().doc(newId);
  const watchlistOldRef = db.collection('watchlist').doc(oldId);
  const watchlistNewRef = db.collection('watchlist').doc(newId);
  const totalsOldRef = db.collection('careerTotals').doc(oldId);
  const totalsNewRef = db.collection('careerTotals').doc(newId);

  // Read first, then perform writes to satisfy transaction constraints
  const [oldSnap, wlSnap, totSnap] = await Promise.all([
    oldPlayerRef.get(),
    watchlistOldRef.get(),
    totalsOldRef.get(),
  ]);
  if (!oldSnap.exists) throw new Error(`Old player doc not found: ${oldId}`);
  const data = oldSnap.data() || {};
  const merged = { ...data, player_id: newId };
  const batch = db.batch();
  batch.set(newPlayerRef, merged, { merge: true });
  batch.delete(oldPlayerRef);
  if (wlSnap.exists) {
    batch.set(watchlistNewRef, { playerId: newId, createdAt: wlSnap.data()?.createdAt || Date.now() }, { merge: true });
    batch.delete(watchlistOldRef);
  }
  if (totSnap.exists) {
    const tdata = totSnap.data() || {};
    batch.set(totalsNewRef, { ...tdata, playerId: newId, migratedAt: Date.now() }, { merge: true });
    batch.delete(totalsOldRef);
  }
  await batch.commit();
}

async function main() {
  const oldId = process.env.OLD_ID;
  const newId = process.env.NEW_ID;
  if (!oldId || !newId) throw new Error('Set OLD_ID and NEW_ID');
  await migrate(String(oldId), String(newId));
  console.log(`Migrated player ${oldId} -> ${newId}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
