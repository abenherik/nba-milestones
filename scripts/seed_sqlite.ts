import path from 'node:path';
import sqlite3 from 'sqlite3';
import admin from 'firebase-admin';
import { playersCol } from '../src/lib/db';
import { promisify } from 'node:util';

function openDb() {
  const dbPathOptions = [
    path.resolve(process.cwd(), 'data', 'raw', 'nba.sqlite'),
    path.resolve(process.cwd(), 'data', 'nba.sqlite'),
  ];
  for (const p of dbPathOptions) {
    try {
      const db = new sqlite3.Database(p);
      return db;
    } catch {}
  }
  throw new Error('nba.sqlite not found in data/raw or data');
}

function dbAll(db: sqlite3.Database, sql: string, params: any[] = []) {
  return new Promise<any[]>((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as any[])));
  });
}

async function findPlayerDocById(id: string) {
  const snap = await playersCol().doc(id).get();
  return snap.exists ? snap : undefined;
}

async function findPlayerDocByName(name: string) {
  const exactSlim = await playersCol().where('full_name', '==', name).limit(1).get();
  if (!exactSlim.empty) return exactSlim.docs[0];
  const exactLegacy = await playersCol().where('name', '==', name).limit(1).get();
  if (!exactLegacy.empty) return exactLegacy.docs[0];
  return undefined;
}

async function aggregateFromSqliteByExternalId(db: sqlite3.Database, playerId: string) {
  const tables: string[] = [
    'player_season',
    'player_season_stats',
  ];
  for (const t of tables) {
    try {
  const rows = await dbAll(db,
        `SELECT 
           SUM(CAST(COALESCE(points, 0) AS REAL)) as points,
           SUM(CAST(COALESCE(rebounds, 0) AS REAL)) as rebounds,
           SUM(CAST(COALESCE(assists, 0) AS REAL)) as assists,
           SUM(CAST(COALESCE("3P", COALESCE("3PM", COALESCE(FG3M, 0))) AS REAL)) as threesMade,
           SUM(CAST(COALESCE(games, COALESCE(G, COALESCE(GP, COALESCE(gp, 0))) ) AS REAL)) as gamesPlayed
         FROM ${t}
         WHERE CAST(player_id AS TEXT) = ?`,
        [String(playerId)]
      );
      const r = rows?.[0];
      const totals = {
        points: Math.floor(Number(r?.points || 0)),
        rebounds: Math.floor(Number(r?.rebounds || 0)),
        assists: Math.floor(Number(r?.assists || 0)),
        threesMade: Math.floor(Number(r?.threesMade || 0)),
        gamesPlayed: Math.floor(Number(r?.gamesPlayed || 0)),
      };
      if (totals.points + totals.rebounds + totals.assists + totals.threesMade + totals.gamesPlayed > 0) return totals;
    } catch {}
  }
  return { points: 0, rebounds: 0, assists: 0, threesMade: 0, gamesPlayed: 0 };
}

async function main() {
  const playerId = process.env.SEED_SINGLE_PLAYER_ID;
  const playerName = process.env.SEED_SINGLE_PLAYER_FULLNAME;
  if (!playerId && !playerName) throw new Error('Provide SEED_SINGLE_PLAYER_ID or SEED_SINGLE_PLAYER_FULLNAME');

  const pDoc = playerId
    ? await findPlayerDocById(String(playerId))
    : await findPlayerDocByName(String(playerName));
  if (!pDoc) throw new Error('Player not found in Firestore');

  const db = openDb();
  let totals = { points: 0, rebounds: 0, assists: 0, threesMade: 0, gamesPlayed: 0 };
  if (playerId) totals = await aggregateFromSqliteByExternalId(db, String(playerId));
  db.close();

  const fsDb = admin.firestore();
  await fsDb.collection('careerTotals').doc(pDoc.id).set({ playerId: pDoc.id, ...totals, updatedAt: Date.now() }, { merge: true });
  console.log(`Wrote careerTotals from sqlite for ${pDoc.id}:`, totals);
}

main().catch(e => { console.error(e); process.exit(1); });
