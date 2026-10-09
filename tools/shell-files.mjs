// The exact runtime shell, read from sw.js so the service worker, the www/ build and the tests share one list.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export function readShellFiles(root) {
  const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const match = source.match(/const SHELL_FILES = (\[[\s\S]*?\]);/);
  if (!match) throw new Error('SHELL_FILES not found in sw.js');
  const files = vm.runInNewContext(match[1]);
  if (!Array.isArray(files) || !files.every(file => typeof file === 'string')) throw new Error('SHELL_FILES must be a list of paths');
  return files;
}
