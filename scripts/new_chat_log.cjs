#!/usr/bin/env node
/*
Creates a new daily chat log markdown file under docs/chat/YYYY-MM-DD.md
and appends a header if the file is new. Prints the path created.
*/

const fs = require('fs');
const path = require('path');

function today() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function main() {
  const root = process.cwd();
  const dir = path.join(root, 'docs', 'chat');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${today()}.md`);
  if (!fs.existsSync(file)) {
    const header = `# Chat log ${today()}\n\n- Started: ${new Date().toISOString()}\n\n## Notes\n\n`;
    fs.writeFileSync(file, header, 'utf8');
  }
  console.log(file);
}

main();
