import path from 'node:path';
import sqlite3 from 'sqlite3';
import admin from 'firebase-admin';
import { playersCol } from '../src/lib/db';

function openDb() {
  const options = [
    path.resolve(process.cwd(), 'data', 'raw', 'nba.sqlite'),
    path.resolve(process.cwd(), 'data', 'nba.sqlite'),
  ];
  for (const p of options) {
    try { return new sqlite3.Database(p); } catch {}
  }
  throw new Error('nba.sqlite not found');
}

async function findPlayerDocByName(name: string) {
  const exactSlim = await playersCol().where('full_name', '==', name).limit(1).get();
  if (!exactSlim.empty) return exactSlim.docs[0];
  const exactLegacy = await playersCol().where('name', '==', name).limit(1).get();
  if (!exactLegacy.empty) return exactLegacy.docs[0];
  return undefined;
}

async function getPersonId(db: sqlite3.Database, fullName: string): Promise<string | undefined> {
  const rows: any[] = await new Promise((resolve, reject) => {
    db.all(
      "SELECT person_id FROM common_player_info WHERE display_first_last = ? LIMIT 1",
      [fullName],
      (err, rows) => (err ? reject(err) : resolve(rows as any[]))
    );
  });
  const id = rows?.[0]?.person_id;
  return id ? String(id) : undefined;
}

function includes3PT(desc: string) {
  return /(3\s?PT|3-pt|3pt|three point|3-pointer)/i.test(desc);
}

async function aggregateFromPBP(db: sqlite3.Database, personId: string) {
  const rows: any[] = await new Promise((resolve, reject) => {
    db.all(
      `SELECT game_id, eventmsgtype, homedescription, visitordescription, neutraldescription,
            player1_id, player2_id, player3_id
       FROM play_by_play
       WHERE player1_id = ? OR player2_id = ? OR player3_id = ?`,
      [personId, personId, personId],
      (err, rows) => (err ? reject(err) : resolve(rows as any[]))
    );
  });
  let points = 0, rebounds = 0, assists = 0, threes = 0;
  const games = new Set<string>();
  for (const r of rows as any[]) {
    const gid = String(r.game_id);
    const pid1 = String(r.player1_id || '');
    const pid2 = String(r.player2_id || '');
    const pid3 = String(r.player3_id || '');
    const desc = String(r.homedescription || r.visitordescription || r.neutraldescription || '');
    const evt = Number(r.eventmsgtype || 0);
    if (pid1 === personId || pid2 === personId || pid3 === personId) games.add(gid);
    if (evt === 1) { // made field goal
      if (pid1 === personId) {
        if (includes3PT(desc)) { threes += 1; points += 3; }
        else { points += 2; }
      }
      if (pid2 === personId) { assists += 1; }
    } else if (evt === 3) { // free throw
      if (pid1 === personId && !/MISS/i.test(desc)) { points += 1; }
    } else if (evt === 4) { // rebound
      if (pid1 === personId && !/TEAM REBOUND/i.test(desc)) { rebounds += 1; }
    }
  }
  return { points, rebounds, assists, threesMade: threes, gamesPlayed: games.size };
}

async function main() {
  const fullName = process.env.SEED_SINGLE_PLAYER_FULLNAME;
  if (!fullName) throw new Error('Set SEED_SINGLE_PLAYER_FULLNAME');
  const pDoc = await findPlayerDocByName(fullName);
  if (!pDoc) throw new Error('Player not found in Firestore');

  const db = openDb();
  const personId = await getPersonId(db, fullName);
  if (!personId) throw new Error('Player not found in sqlite common_player_info');

  const totals = await aggregateFromPBP(db, personId);
  db.close();

  const fsDb = admin.firestore();
  await fsDb.collection('careerTotals').doc(pDoc.id).set({ playerId: pDoc.id, ...totals, updatedAt: Date.now() }, { merge: true });
  console.log(`Wrote careerTotals from PBP for ${pDoc.id} (${fullName}):`, totals);
}

main().catch(e => { console.error(e); process.exit(1); });
