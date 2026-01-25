import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const cwd = process.cwd();
for (const filename of ['.env.local', '.env']) {
  const filePath = path.join(cwd, filename);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath });
  }
}

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in env');
  process.exit(2);
}

const client = createClient({ url, authToken });

async function one(sql) {
  const res = await client.execute(sql);
  return res.rows?.[0] ?? null;
}

const normalizeDateSql = `
  CASE
    WHEN game_date GLOB '????-??-??' THEN game_date
    WHEN game_date LIKE '___ %,%' THEN
      substr(game_date, -4) || '-' ||
      (CASE substr(game_date, 1, 3)
        WHEN 'Jan' THEN '01'
        WHEN 'Feb' THEN '02'
        WHEN 'Mar' THEN '03'
        WHEN 'Apr' THEN '04'
        WHEN 'May' THEN '05'
        WHEN 'Jun' THEN '06'
        WHEN 'Jul' THEN '07'
        WHEN 'Aug' THEN '08'
        WHEN 'Sep' THEN '09'
        WHEN 'Oct' THEN '10'
        WHEN 'Nov' THEN '11'
        WHEN 'Dec' THEN '12'
        ELSE NULL
      END) || '-' ||
      printf('%02d', CAST(substr(game_date, 5, instr(game_date, ',') - 5) AS INTEGER))
    ELSE NULL
  END
`;

const main = await one(`
  SELECT
    COUNT(*) AS rows,
    SUM(CASE WHEN game_date GLOB '????-??-??' THEN 1 ELSE 0 END) AS isoDateRows,
    SUM(CASE WHEN game_date LIKE '___ %,%' THEN 1 ELSE 0 END) AS monthNameRows,
    SUM(CASE WHEN (${normalizeDateSql}) IS NULL THEN 1 ELSE 0 END) AS unparsedRows,
    MIN(${normalizeDateSql}) AS minDate,
    MAX(${normalizeDateSql}) AS maxDate
  FROM game_summary
`);

const recent7 = await one(`
  SELECT COUNT(*) AS recent7
  FROM game_summary
  WHERE (${normalizeDateSql}) >= date('now','-7 day')
`);

const recent30 = await one(`
  SELECT COUNT(*) AS recent30
  FROM game_summary
  WHERE (${normalizeDateSql}) >= date('now','-30 day')
`);

console.log(
  JSON.stringify(
    {
      now: new Date().toISOString().slice(0, 10),
      ...main,
      ...recent7,
      ...recent30,
    },
    null,
    2
  )
);
