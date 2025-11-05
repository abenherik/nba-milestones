import path from 'node:path';
import sqlite3 from 'sqlite3';

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
  throw new Error('nba.sqlite not found');
}

async function main() {
  const db = openDb();
  const all = (sql: string, params: any[] = []) => new Promise<any[]>((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as any[])));
  });
  const tables = await all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  console.log('Tables:', tables.map((r: any) => r.name));
  const pick = (process.argv[2] as string) || '';
  const targets = pick ? [pick] : tables.map((r: any) => r.name).filter((n: string) => /player|box|season/i.test(n));
  for (const t of targets) {
    try {
  const cols = await all(`PRAGMA table_info(${t})`);
      console.log(`\nTable ${t} columns:`, cols.map((c: any) => `${c.name}:${c.type}`));
  const sample = await all(`SELECT * FROM ${t} LIMIT 3`);
      console.log(`Sample ${t}:`, sample);
    } catch (e) {
      console.warn('Failed to introspect', t, e);
    }
  }
  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
