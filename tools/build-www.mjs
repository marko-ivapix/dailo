// Builds the Capacitor web directory (V2.0-b): an exact copy of the app shell the service worker
// precaches (SHELL_FILES in sw.js). No bundler and no transformation; sw.js itself is left out,
// because the native app needs no service worker.
//
// Usage (from the repository root): node tools/build-www.mjs [output directory, default www]
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'www'));
const list = readFileSync(join(root, 'sw.js'), 'utf8').match(/const SHELL_FILES = \[([\s\S]*?)\];/);
if (!list) throw new Error('SHELL_FILES not found in sw.js');
const files = [...list[1].matchAll(/'([^']+)'/g)].map(match => match[1]);

rmSync(out, { recursive: true, force: true });
for (const file of files) {
  mkdirSync(dirname(join(out, file)), { recursive: true });
  copyFileSync(join(root, file), join(out, file));
}
console.log(`www: ${files.length} files copied to ${out}`);
