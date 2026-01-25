import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { openDatabase, dbAll } from '../src/lib/database.js';

async function quickCheck() {
  const db = openDatabase();
  
  const total = await dbAll(db, 'SELECT COUNT(*) as count FROM game_summary');
  console.log(`\nTotal games in database: ${total[0]?.count?.toLocaleString()}`);
  
  const recent = await dbAll(db, `
    SELECT game_date, COUNT(*) as games
    FROM game_summary
    GROUP BY game_date
    ORDER BY game_date DESC
    LIMIT 20
  `);
  
  console.log('\nMost recent dates (any format):');
  recent.forEach((d: any) => {
    console.log(`  ${d.game_date}: ${d.games} games`);
  });
  
  const nov2025 = await dbAll(db, `
    SELECT COUNT(*) as count
    FROM game_summary
    WHERE game_date LIKE 'Nov%2025%' OR game_date LIKE '2025-11%'
  `);
  
  console.log(`\nNovember 2025 games: ${nov2025[0]?.count || 0}`);
}

quickCheck().catch(console.error);
