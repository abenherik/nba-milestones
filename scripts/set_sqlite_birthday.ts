import { openSqlite, ensureCoreSchema, dbRun } from '../src/lib/sqlite';

function getEnv(name: string, req = true): string | null {
  const v = String(process.env[name] ?? '').trim();
  if (!v && req) throw new Error(`${name} is required`);
  return v || null;
}

async function main(){
  const id = getEnv('PLAYER_ID')!;
  const birthday = getEnv('BIRTHDAY')!; // YYYY-MM-DD
  const db = openSqlite();
  await ensureCoreSchema(db);
  await dbRun(db, `UPDATE players SET birthdate = ? WHERE id = ?`, [birthday, id]);
  console.log(`Set SQLite players.birthdate for id=${id} to ${birthday}`);
  db.close();
}

main().catch(e=>{ console.error(e); process.exit(1); });
