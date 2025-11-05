import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse';
import { playersCol, statsCol } from '../src/lib/db';
import admin from 'firebase-admin';

// CONFIG
// Put your Kaggle CSVs into data/raw/. We'll look for players.csv and player_season_stats.csv (you can adjust names below)
const DATA_DIR = path.resolve(process.cwd(), 'data', 'raw');
const PLAYERS_CSV = ['players.csv', 'Player.csv', 'player.csv'];
const STATS_CSV = ['player_season.csv', 'season_stats.csv', 'player_season_stats.csv'];

async function exists(p: string) { try { await fs.promises.access(p); return true; } catch { return false; } }

async function findFirst(paths: string[]) {
  for (const name of paths) {
    const full = path.join(DATA_DIR, name);
    if (await exists(full)) return full;
  }
  return undefined;
}

async function readCsv(file: string): Promise<any[]> {
  const rows: any[] = [];
  const stream = fs.createReadStream(file).pipe(parse({ columns: true, skip_empty_lines: true }));
  for await (const rec of stream) rows.push(rec);
  return rows;
}

function parseDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) return input;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Optional: legacy players seeding (disabled by default to avoid touching canonical birthdays/docs)
async function seedPlayers(players: any[]) {
  // Expect fields: id/external_id, name/full_name, birth_date
  for (const r of players) {
    const name = r.name || r.full_name || r.player_name || r.Player || r.PLAYER || r.player || null;
    const externalId = String(r.id || r.player_id || r.PlayerID || r.PLAYER_ID || '').trim() || null;
    const birthDateRaw = r.birth_date || r.birthdate || r.birth_day || r.birth || r.BirthDate || null;

    if (!name) continue;
    const birthDate = parseDate(birthDateRaw);

    // Upsert by name+externalId preference; if no externalId, use name only
  const existingByExt = externalId ? await playersCol().where('externalId', '==', externalId).limit(1).get() : null;
  const existingByName = await playersCol().where('name', '==', name).limit(1).get();
  const existingDoc = existingByExt && !existingByExt.empty ? existingByExt.docs[0] : (!existingByName.empty ? existingByName.docs[0] : undefined);

    if (existingDoc) {
      // Never modify existing.birthDate; if mismatch, log
      const existing = existingDoc.data() as any;
      const existingBD = existing.birthDate ? new Date(existing.birthDate) : null;
      if (birthDate && existingBD && existingBD.toISOString().slice(0,10) !== birthDate.toISOString().slice(0,10)) {
        console.warn(`Birthdate mismatch for ${existing.name}: existing=${existingBD.toISOString().slice(0,10)} incoming=${birthDate.toISOString().slice(0,10)}`);
      }
      // Update other fields except birthDate
      await existingDoc.ref.set({ name, externalId, isActive: true, nameLower: String(name).toLowerCase() }, { merge: true });
    } else {
      const docRef = playersCol().doc();
      await docRef.set({
        name,
        nameLower: String(name).toLowerCase(),
        externalId: externalId || null,
        isActive: true,
        birthDate: (birthDate || new Date('1900-01-01')).toISOString(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }
}

async function seedStats(stats: any[]) {
  // Expect: player_id or player name; season; team; points, rebounds, assists, threesMade, games
  for (const r of stats) {
    const name = r.name || r.full_name || r.player_name || r.Player || r.PLAYER || r.player || null;
    const externalId = String(r.player_id || r.PlayerID || r.PLAYER_ID || '').trim() || null;
    const season = String(r.season || r.Season || r.YEAR || r.season_id || '').trim();
    if (!season) continue;

  const existingByExt = externalId ? await playersCol().where('externalId', '==', externalId).limit(1).get() : null;
  const existingByName = await playersCol().where('name', '==', name).limit(1).get();
  const pDoc = existingByExt && !existingByExt.empty ? existingByExt.docs[0] : (!existingByName.empty ? existingByName.docs[0] : undefined);
  if (!pDoc) continue;

    const data = {
      playerId: pDoc.id,
      season,
      team: r.team || r.TEAM || r.team_abbreviation || null,
      points: Number(r.points || r.PTS || 0) || 0,
      rebounds: Number(r.rebounds || r.REB || r.TRB || 0) || 0,
      assists: Number(r.assists || r.AST || 0) || 0,
      threesMade: Number(r.threesMade || r['3P'] || r['3PM'] || 0) || 0,
      gamesPlayed: Number(r.games || r.G || r.GP || 0) || 0,
      updatedAt: Date.now(),
    };

    const key = `${data.playerId}_${data.season}`;
    await statsCol().doc(key).set(data, { merge: true });
  }
}

async function aggregateCareerTotalsForPlayerId(playerId: string) {
  const snap = await statsCol().where('playerId', '==', playerId).get();
  let totals = { points: 0, rebounds: 0, assists: 0, threesMade: 0, gamesPlayed: 0 };
  for (const d of snap.docs) {
    const s = d.data() as any;
    totals.points += s.points || 0;
    totals.rebounds += s.rebounds || 0;
    totals.assists += s.assists || 0;
    totals.threesMade += s.threesMade || 0;
    totals.gamesPlayed += s.gamesPlayed || 0;
  }
  return totals;
}

async function findPlayerByName(fullName: string) {
  // Preferred: slim schema exact match on full_name
  const exactSlim = await playersCol().where('full_name', '==', fullName).limit(1).get();
  if (!exactSlim.empty) return exactSlim.docs[0];
  // Fallbacks for older schemas/fields
  const exactLegacy = await playersCol().where('name', '==', fullName).limit(1).get();
  if (!exactLegacy.empty) return exactLegacy.docs[0];
  const [first, ...rest] = fullName.split(' ');
  const last = rest.join(' ');
  if (first && last) {
    const flSlim = await playersCol().where('first_name', '==', first).where('last_name', '==', last).limit(1).get();
    if (!flSlim.empty) return flSlim.docs[0];
    const flLegacy = await playersCol().where('firstName', '==', first).where('lastName', '==', last).limit(1).get();
    if (!flLegacy.empty) return flLegacy.docs[0];
  }
  return undefined;
}

async function seedCareerTotalsFor(fullName: string) {
  const pDoc = await findPlayerByName(fullName);
  if (!pDoc) {
    console.warn(`Player not found in Firestore: ${fullName}`);
    return;
  }
  // Prefer computing totals from CSV if available to avoid per-season writes
  let totals = await aggregateCareerTotalsForPlayerId(pDoc.id);
  try {
    const sCsv = await findFirst(STATS_CSV);
    if (sCsv) {
      const rows = await readCsv(sCsv);
      const [fn, ...rest] = fullName.split(' ');
      const ln = rest.join(' ');
      let p = 0, r = 0, a = 0, t3 = 0, gp = 0;
      for (const s of rows) {
        const n = s.name || s.full_name || s.player_name || s.Player || s.PLAYER || s.player || '';
        const first = s.first_name || s.firstname || s.FirstName || '';
        const last = s.last_name || s.lastname || s.LastName || '';
        const matchByFull = n && String(n).trim().toLowerCase() === fullName.toLowerCase();
        const matchByFL = first && last && String(first).toLowerCase() === fn.toLowerCase() && String(last).toLowerCase() === ln.toLowerCase();
        if (matchByFull || matchByFL) {
          p += Number(s.points || s.PTS || 0) || 0;
          r += Number(s.rebounds || s.REB || s.TRB || 0) || 0;
          a += Number(s.assists || s.AST || 0) || 0;
          t3 += Number(s.threesMade || s['3P'] || s['3PM'] || 0) || 0;
          gp += Number(s.games || s.G || s.GP || 0) || 0;
        }
      }
      if (p + r + a + t3 + gp > 0) totals = { points: p, rebounds: r, assists: a, threesMade: t3, gamesPlayed: gp };
    }
  } catch {}
  // Write to careerTotals collection: one doc per player
  const db = admin.firestore();
  await db.collection('careerTotals').doc(pDoc.id).set({ playerId: pDoc.id, ...totals, updatedAt: Date.now() }, { merge: true });
  console.log(`Wrote careerTotals for ${fullName} (${pDoc.id})`);
}

async function seedCareerTotalsForId(playerId: string) {
  const pDoc = await playersCol().doc(String(playerId)).get();
  if (!pDoc.exists) {
    console.warn(`Player not found by ID: ${playerId}`);
    return;
  }
  let totals = await aggregateCareerTotalsForPlayerId(pDoc.id);
  try {
    const sCsv = await findFirst(STATS_CSV);
    if (sCsv) {
      const rows = await readCsv(sCsv);
      // If CSV has player_id, prefer that for aggregation
      let p = 0, r = 0, a = 0, t3 = 0, gp = 0;
      for (const s of rows) {
        const ext = String(s.player_id || s.PlayerID || s.PLAYER_ID || '').trim();
        if (ext && ext === String(pDoc.id)) {
          p += Number(s.points || s.PTS || 0) || 0;
          r += Number(s.rebounds || s.REB || s.TRB || 0) || 0;
          a += Number(s.assists || s.AST || 0) || 0;
          t3 += Number(s.threesMade || s['3P'] || s['3PM'] || s.FG3M || 0) || 0;
          gp += Number(s.games || s.G || s.GP || s.gp || 0) || 0;
        }
      }
      if (p + r + a + t3 + gp > 0) {
        totals = { points: p, rebounds: r, assists: a, threesMade: t3, gamesPlayed: gp };
      } else {
        // Fallback: aggregate by name if IDs don't align with CSV
        const d = pDoc.data() as any;
        const full = d?.full_name || [d?.first_name, d?.last_name].filter(Boolean).join(' ');
        if (full) {
          const [fn, ...rest] = full.split(' ');
          const ln = rest.join(' ');
          let p2 = 0, r2 = 0, a2 = 0, t32 = 0, gp2 = 0;
          for (const s of rows) {
            const n = s.name || s.full_name || s.player_name || s.Player || s.PLAYER || s.PLAYER_NAME || s.player || '';
            const first = s.first_name || s.firstname || s.FirstName || '';
            const last = s.last_name || s.lastname || s.LastName || '';
            const matchByFull = n && String(n).trim().toLowerCase() === full.toLowerCase();
            const matchByFL = first && last && String(first).toLowerCase() === String(fn).toLowerCase() && String(last).toLowerCase() === String(ln).toLowerCase();
            if (matchByFull || matchByFL) {
              p2 += Number(s.points || s.PTS || 0) || 0;
              r2 += Number(s.rebounds || s.REB || s.TRB || 0) || 0;
              a2 += Number(s.assists || s.AST || 0) || 0;
              t32 += Number(s.threesMade || s['3P'] || s['3PM'] || s.FG3M || 0) || 0;
              gp2 += Number(s.games || s.G || s.GP || s.gp || 0) || 0;
            }
          }
          if (p2 + r2 + a2 + t32 + gp2 > 0) {
            totals = { points: p2, rebounds: r2, assists: a2, threesMade: t32, gamesPlayed: gp2 };
          }
        }
      }
    }
  } catch {}
  const db = admin.firestore();
  await db.collection('careerTotals').doc(pDoc.id).set({ playerId: pDoc.id, ...totals, updatedAt: Date.now() }, { merge: true });
  console.log(`Wrote careerTotals for ID ${pDoc.id}`);
}

async function main() {
  const pCsv = await findFirst(PLAYERS_CSV);
  const sCsv = await findFirst(STATS_CSV);
  if (!pCsv) console.warn('Players CSV not found in data/raw');
  if (!sCsv) console.warn('Stats CSV not found in data/raw');

  const allowSeedPlayers = ((process.env.SEED_PLAYERS || '').toLowerCase() === '1');
  if (pCsv && allowSeedPlayers) {
    const rows = await readCsv(pCsv);
    await seedPlayers(rows);
  }
  // If targeting a single player, skip per-season writes unless FULL_INGEST=1
  const targetId = process.env.SEED_SINGLE_PLAYER_ID;
  const target = process.env.SEED_SINGLE_PLAYER_FULLNAME;
  const fullIngest = (process.env.FULL_INGEST || '').toLowerCase() === '1';
  if (sCsv && (!(target || targetId) || fullIngest)) {
    const rows = await readCsv(sCsv);
    await seedStats(rows);
  }

  // Low-write path: seed just one player's career totals (e.g., Paolo Banchero)
  if (targetId) {
    await seedCareerTotalsForId(targetId);
  } else if (target) {
    await seedCareerTotalsFor(target);
  } else {
    console.log('Tip: set SEED_SINGLE_PLAYER_FULLNAME="Paolo Banchero" to aggregate totals for a single player.');
  }

  console.log('Seeding complete');
}

main().catch(e => { console.error(e); process.exit(1); });
