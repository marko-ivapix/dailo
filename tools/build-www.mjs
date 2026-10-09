// Builds www/, the web directory Capacitor packages into the iOS and Android apps.
// It copies the exact runtime shell (sw.js SHELL_FILES) and nothing else: no docs, tests or release ZIPs.
// The service worker is left out on purpose: the native app ships its files inside the binary (audit P-1).
// Usage: node tools/build-www.mjs [outputDir]   (default: www)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readShellFiles } from './shell-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function buildWww(outputDir = path.join(root, 'www')) {
  const files = readShellFiles(root);
  const out = path.resolve(outputDir);
  // The output directory is deleted first, so never accept the repository itself, one of its parents or a drive root.
  if (out === root || root.startsWith(out + path.sep) || out === path.parse(out).root) throw new Error(`Refusing to build into ${out}`);
  fs.rmSync(out, { recursive: true, force: true });
  for (const file of files) {
    const from = path.join(root, file);
    if (!fs.existsSync(from)) throw new Error(`Missing shell file: ${file}`);
    const to = path.join(out, file);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  return { outputDir: out, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildWww(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log(`www: ${result.files.length} files in ${path.relative(process.cwd(), result.outputDir) || '.'}`);
}
