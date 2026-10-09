// Portable syntax check (macOS, Linux, Windows): node --check on every runtime, vendor, test and tool script.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const list = (dir, test) => fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)).filter(test).map(name => path.join(dir, name)) : [];
const files = [
  ...list('js', name => name.endsWith('.js')),
  ...list('vendor', name => name.endsWith('.js')),
  ...list('vendor/capacitor', name => name.endsWith('.js')),
  ...list('tests', name => name.endsWith('.js')),
  ...list('tests/support', name => name.endsWith('.js')),
  ...list('tools', name => name.endsWith('.mjs') || name.endsWith('.js')),
  'sw.js',
];
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) { failed += 1; console.error(`FAIL ${file}\n${result.stderr}`); }
}
console.log(`syntax: ${files.length - failed}/${files.length}`);
process.exit(failed ? 1 : 0);
