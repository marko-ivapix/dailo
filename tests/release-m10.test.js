// Modernization M10: the release that carries M1–M9 (the Capacitor app and the audit fixes).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Release = require('../js/release.js');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('the modernization shipped as 2.0.0-alpha.2 or later, the same everywhere (the newest release test pins it)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.([2-9]|\d{2,})$|^2\.\d+\.\d+/);
  assert.match(read('sw.js'), new RegExp(`const VERSION = '${Release.APP_VERSION.replace(/\./g, '\\.')}';`), 'installed PWAs get the update notice and a new cache');
  assert.equal(JSON.parse(read('package.json')).version, Release.APP_VERSION);
  assert.equal(JSON.parse(read('package-lock.json')).version, Release.APP_VERSION);
});

test('the Serbian Mac build guide covers both platforms with the repository commands', () => {
  const guide = read('docs/v2/capacitor-mac.md');
  for (const command of ['npm ci', 'npm run verify', 'npm run cap:sync', 'npm run cap:ios', 'npm run cap:android']) assert.ok(guide.includes(command), command);
  for (const topic of ['Xcode', 'Android Studio', 'Signing & Capabilities', 'USB', 'Tačno vreme', 'Uvezi rezervnu kopiju']) assert.ok(guide.includes(topic), topic);
  assert.match(guide, /zatvori(te)? aplikaciju/i, 'the first flow reopens the app');
});
