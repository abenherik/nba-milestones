import { openDatabase, dbAll } from './src/lib/database.ts';

async function main() {
  const db = openDatabase();
  console.log(await dbAll(db, "SELECT name, sql FROM sqlite_master WHERE type='index'"));
}
main();