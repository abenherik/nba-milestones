#!/usr/bin/env -S node --no-warnings
/**
 * Creates/opens a daily chat log markdown file under docs/chat/YYYY-MM-DD.md
 * Prints the path to stdout so a task can reveal it.
 */

import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function today() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function main() {
  const root = process.cwd();
  const dir = join(root, 'docs', 'chat');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, `${today()}.md`);
  if (!existsSync(file)) {
    const header = `# Chat log ${today()}\n\n- Started: ${new Date().toISOString()}\n\n## Notes\n\n`;
    writeFileSync(file, header, 'utf8');
  }
  console.log(file);
}

main();
