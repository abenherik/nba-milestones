import fs from 'node:fs';
import path from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';

type Leader = { name: string };

const LEADERS: Leader[] = [
  { name: 'Wilt Chamberlain' },
  { name: 'Bill Russell' },
  { name: 'Kareem Abdul-Jabbar' },
  { name: 'Elvin Hayes' },
  { name: 'Moses Malone' },
  { name: 'Tim Duncan' },
  { name: 'Karl Malone' },
  { name: 'Robert Parish' },
  { name: 'Kevin Garnett' },
  { name: 'Dwight Howard' },
  { name: 'Nate Thurmond' },
  { name: 'Walt Bellamy' },
  { name: 'Wes Unseld' },
  { name: 'Hakeem Olajuwon' },
  { name: "Shaquille O'Neal" },
  { name: 'Buck Williams' },
  { name: 'Jerry Lucas' },
  { name: 'Bob Pettit' },
  { name: 'Charles Barkley' },
  { name: 'Dikembe Mutombo' },
  { name: 'Paul Silas' },
  { name: 'Charles Oakley' },
  { name: 'Dennis Rodman' },
  { name: 'Kevin Willis' },
  { name: 'LeBron James' },
];

function normalize(s: string) { return (s || '').trim().toLowerCase(); }

function normalizeDateStr(s: string): string | null {
  if (!s) return null;
  const cleaned = s.replace(' 00:00:00', '');
  const d = new Date(cleaned);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function loadPlayersNameToId(): Map<string, string> {
  const candidates = [
    path.resolve(process.cwd(), 'data', 'players.csv'),
    path.resolve(process.cwd(), 'data', 'raw', 'csv', 'player.csv'),
  ];
  const map = new Map<string, string>();
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const records = parseCsv(text, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
    for (const r of records) {
      // Try common field names
      const id = String(r.id ?? r.person_id ?? r.PERSON_ID ?? r.player_id ?? '').trim();
      const full = String(r.full_name ?? r.DISPLAY_FIRST_LAST ?? r.display_first_last ?? r.PLAYER ?? r.name ?? '').trim();
      if (id && full) {
        const key = normalize(full);
        if (!map.has(key)) map.set(key, id);
      }
    }
  }
  return map;
}

function loadIdToBirthday(): Map<string, string> {
  const file = path.resolve(process.cwd(), 'data', 'raw', 'csv', 'common_player_info.csv');
  const map = new Map<string, string>();
  if (!fs.existsSync(file)) return map;
  const text = fs.readFileSync(file, 'utf8');
  const records = parseCsv(text, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  for (const r of records) {
    const id = String(r.person_id ?? r.PERSON_ID ?? '').trim();
    const birth = normalizeDateStr(String(r.birthdate ?? r.BIRTHDATE ?? '').trim());
    if (id && birth) map.set(id, birth);
  }
  return map;
}

async function main() {
  const nameToId = loadPlayersNameToId();
  const idToBday = loadIdToBirthday();

  let missingId = 0;
  let missingBday = 0;
  const lines: string[] = [];

  for (const { name } of LEADERS) {
    const id = nameToId.get(normalize(name));
    if (!id) {
      const msg = `${name}: ID not found in CSVs`;
      console.log(msg);
      lines.push(msg);
      missingId++;
      continue;
    }
    const bday = idToBday.get(id);
    if (!bday) {
      const msg = `${name} (${id}): birthday not found in common_player_info.csv`;
      console.log(msg);
      lines.push(msg);
      missingBday++;
    } else {
      const msg = `${name} (${id}): ${bday}`;
      console.log(msg);
      lines.push(msg);
    }
  }

  const summary = `Summary: ${LEADERS.length - missingId} IDs found, ${LEADERS.length} total; ${missingBday} birthdays missing.`;
  console.log(`\n${summary}`);
  lines.push('', summary);

  // Write report file for convenience
  const outDir = path.resolve(process.cwd(), 'docs', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'rebound_leaders_birthdays.txt');
  fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
  console.log(`\nWrote report: ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
