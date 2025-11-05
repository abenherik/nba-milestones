import fs from 'node:fs';
import path from 'node:path';
import { openSqlite, ensureCoreSchema, dbRun } from '../src/lib/sqlite';

function parseDateToISO(dateStr: string): string | null {
  if (!dateStr) return null;
  // Accept formats like "Feb 12 1978" or "Feb 12, 1978" or with hyphen bullets
  const cleaned = dateStr.replace(/[\u202F\u00A0\u2009\u2011]/g, ' ').replace(/[,·]/g, ' ').replace(/\s+/g, ' ').trim();
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function main() {
  const file = path.resolve(process.cwd(), 'docs', 'reports', 'birthdays_manual.tsv');
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

  const db = openSqlite();
  await ensureCoreSchema(db);
  let applied = 0;
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const id = parts[0].trim();
    const name = parts[1].trim();
    const raw = parts.slice(2).join(' ').trim();
    const iso = parseDateToISO(raw);
    if (!iso) {
      console.warn(`Skip unparseable date for ${id} ${name}: ${raw}`);
      continue;
    }
    await dbRun(db, 'UPDATE players SET birthdate = ? WHERE id = ?', [iso, id]);
    applied++;
  }
  db.close();
  console.log(`Applied ${applied} birthdays to SQLite (players.birthdate).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
