import { openSqlite, ensureCoreSchema, dbRun } from '../src/lib/sqlite';

async function main() {
  const idsRaw = String(process.env.IDS || '').trim();
  if (!idsRaw) throw new Error('Provide IDS as comma-separated player IDs');
  const ids = idsRaw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  const db = openSqlite();
  await ensureCoreSchema(db);
  for (const id of ids) {
    await dbRun(db, 'UPDATE players SET is_active = 0 WHERE id = ?', [id]);
    console.log(`Set inactive: ${id}`);
  }
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
