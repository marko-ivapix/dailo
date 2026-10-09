// Modernization M1: package.json, the www/ build for Capacitor and the portable syntax check.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Release = require('../js/release.js');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const shellFiles = () => {
  const match = read('sw.js').match(/const SHELL_FILES = (\[[\s\S]*?\]);/);
  return [...require('node:vm').runInNewContext(match[1])]; // copy: an array from another vm realm fails strict deepEqual
};
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)).map(file => `${entry.name}/${file}`) : [entry.name]);

test('package.json is private, pins Node 22 and follows the app version', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(pkg.version, Release.APP_VERSION, 'package.json version equals APP_VERSION');
  for (const script of ['test', 'check', 'verify', 'build', 'smoke']) assert.ok(pkg.scripts[script], `script ${script}`);
  assert.match(pkg.scripts.test, /node --test "tests\/\*\.test\.js"/, 'the test glob is quoted so Node expands it on every OS');
  for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} is pinned to an exact version`);
  }
  assert.ok(fs.existsSync(path.join(root, 'package-lock.json')), 'lockfile is committed');
});

test('git ignores node_modules and the generated www/', () => {
  const ignore = read('.gitignore').split('\n').map(line => line.trim());
  assert.ok(ignore.includes('node_modules/'));
  assert.ok(ignore.includes('www/'));
});

test('build-www copies exactly the runtime shell, without the service worker', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dailo-www-'));
  const target = path.join(out, 'www');
  const result = spawnSync(process.execPath, [path.join(root, 'tools/build-www.mjs'), target], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const built = walk(target).sort();
  const expected = shellFiles().slice().sort();
  assert.deepEqual(built, expected, 'www/ holds the SHELL_FILES list and nothing else');
  assert.ok(!built.includes('sw.js'), 'no service worker in the app');
  assert.ok(!built.some(file => /^(docs|tests|tools|supabase)\//.test(file) || file.endsWith('.zip')), 'no docs, tests or release archives');
  for (const file of built) assert.ok(fs.readFileSync(path.join(target, file)).equals(fs.readFileSync(path.join(root, file))), `${file} is copied byte for byte`);
  fs.rmSync(out, { recursive: true, force: true });
});

test('build-www refuses to delete the repository or one of its parents', () => {
  for (const target of [root, path.dirname(root)]) {
    const result = spawnSync(process.execPath, [path.join(root, 'tools/build-www.mjs'), target], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, `refused ${target}`);
    assert.match(result.stderr, /Refusing to build into/);
  }
  assert.ok(fs.existsSync(path.join(root, 'index.html')), 'the repository is untouched');
});

test('every file index.html loads is in the shell, so www/ is complete', () => {
  const html = read('index.html');
  const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map(match => match[1]);
  const shell = new Set(shellFiles());
  for (const ref of refs) assert.ok(shell.has(ref), `${ref} is packaged`);
});

test('check-syntax covers runtime, vendor, tests and tools and passes', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'tools/check-syntax.mjs')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const [, ok, total] = result.stdout.match(/syntax: (\d+)\/(\d+)/);
  assert.equal(ok, total);
  assert.ok(Number(total) >= 78);
});
