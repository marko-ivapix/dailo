// R82: "Prijavi problem" also carries the last errors on this device. The app keeps at most 10 (device-local
// dailoErrorLog) from uncaught errors, unhandled rejections and console.error: the time, the version, the file and
// line, and the message with quoted text and e-mail addresses cut out, so no user data goes along. The report lists
// at most 5; the user sees the e-mail before sending it.
// Spec: docs/superpowers/specs/2026-10-15-r82-error-log.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');

test('an error message keeps no quoted text and no e-mail address, and stays short', () => {
  assert.equal(Release.cleanErrorText('Cannot read properties of undefined (reading \'Kupi mleko\')'), 'Cannot read properties of undefined (reading "…")');
  assert.equal(Release.cleanErrorText('Sign-in failed for ana@example.com: “Pogrešna lozinka”'), 'Sign-in failed for [e-mail]: "…"');
  assert.equal(Release.cleanErrorText('  many\n\n  lines  '), 'many lines');
  assert.equal(Release.cleanErrorText('x'.repeat(400)).length, 160);
  assert.equal(Release.cleanErrorText(null), '');
});

test('the report lists at most five recent errors under their own heading, or says there are none', () => {
  const errors = Array.from({ length: 7 }, (_, index) => ({ at: `2026-10-15T08:0${index}:00.000Z`, version: '2.0.0-alpha.109', where: 'app.js:120', message: `Boom ${index}`, count: index === 0 ? 3 : 1 }));
  const body = new URLSearchParams(Release.problemReportMailto({ email: 'beta@example.com', userAgent: 'TestAgent', errors }).split('?')[1]).get('body');
  assert.match(body, /Recent errors \(no personal data\):\r\n2026-10-15 08:00 · 2\.0\.0-alpha\.109 · app\.js:120 · Boom 0 \(×3\)\r\n/);
  assert.equal((body.match(/Boom \d/g) || []).length, 5);
  const none = new URLSearchParams(Release.problemReportMailto({ email: 'beta@example.com' }).split('?')[1]).get('body');
  assert.match(none, /Recent errors \(no personal data\):\r\nnone/);
});

function errorLog({ stored = null, throws = false } = {}) {
  const storage = new Map(stored == null ? [] : [['dailoErrorLog', stored]]);
  const ctx = {
    Release, JSON, Date, Array, String,
    localStorage: { getItem: key => { if (throws) throw new Error('blocked'); return storage.get(key) ?? null; }, setItem: (key, value) => storage.set(key, String(value)) },
  };
  vm.createContext(ctx);
  vm.runInContext(`${app.match(/  const ERROR_LOG_KEY = [^\n]+/)[0]}\n${functionSource('readErrorLog').source}\n${functionSource('recordError').source}\nthis.readErrorLog = readErrorLog; this.recordError = recordError;`, ctx);
  return { ctx, storage, log: () => JSON.parse(JSON.stringify(ctx.readErrorLog())) };
}

test('the device keeps the ten newest errors, cleaned; a repeat counts up; blocked storage stays quiet', () => {
  const h = errorLog();
  h.ctx.recordError('Failed for “Tajna”', 'https://x/dailo/js/app.js:42');
  const [first] = h.log();
  assert.deepEqual([first.version, first.where, first.message, first.count], [Release.APP_VERSION, 'app.js:42', 'Failed for "…"', 1]);
  assert.match(first.at, /^\d{4}-\d{2}-\d{2}T/);
  h.ctx.recordError('Failed for “Druga”', 'https://x/dailo/js/app.js:42');
  assert.equal(h.log().length, 1, 'the same cleaned message counts up');
  assert.equal(h.log()[0].count, 2);
  for (let index = 0; index < 12; index += 1) h.ctx.recordError(`Error ${index}`, '');
  assert.equal(h.log().length, 10);
  assert.equal(h.log()[0].message, 'Error 11', 'newest first');
  h.ctx.recordError('   ', '');
  assert.equal(h.log()[0].message, 'Error 11', 'an empty message is not kept');
  assert.deepEqual(errorLog({ stored: '{bad json' }).log(), []);
  const blocked = errorLog({ throws: true });
  blocked.ctx.recordError('x', '');
  assert.deepEqual(blocked.log(), []);
});

test('uncaught errors, unhandled rejections and console.error are recorded; the report gets them', () => {
  const capture = functionSource('captureErrors').source;
  assert.match(capture, /window\.addEventListener\('error', event => recordError\(event\.message \|\| event\.error\?\.message, event\.filename \? `\$\{event\.filename\}:\$\{event\.lineno \|\| ''\}` : ''\)\);/);
  assert.match(capture, /window\.addEventListener\('unhandledrejection', event => recordError\(event\.reason\?\.message \|\| event\.reason, ''\)\);/);
  assert.match(capture, /const original = console\.error\.bind\(console\);\n\s+console\.error = \(\.\.\.args\) => \{ original\(\.\.\.args\); recordError\(args\.map\(arg => arg\?\.message \|\| arg\)\.join\(' '\), ''\); \};/);
  assert.match(functionSource('init').source, /captureErrors\(\);\n\s+applyTheme\(readTheme\(\)\);/);
  assert.match(app, /persistence: storagePersistence\.state, errors: readErrorLog\(\) \};/);
  assert.match(read('CLAUDE.md'), /`dailoErrorLog`/, 'the device-local key is listed');
});

test('Pomoć, the FAQ and the guide say the report carries the recent errors', () => {
  assert.match(read('js/settings-ui.js'), /tr\('Opens an e-mail with the app version, device details and recent errors\. Your data is not attached\.'\)/);
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['Opens an e-mail with the app version, device details and recent errors. Your data is not attached.', 'Otvara e-poruku sa verzijom aplikacije, podacima o uređaju i poslednjim greškama. Tvoji podaci se ne prilažu.'],
    ['Recent errors (no personal data):', 'Poslednje greške (bez ličnih podataka):'], ['none', 'nema'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  assert.ok(!sr.includes('"Opens an e-mail with the app version and device details. Your data is not attached."'), 'the old line is gone');
  for (const page of ['pitanja.html', 'uputstvo.html']) assert.ok(read(page).includes('verzijom aplikacije, podacima o uređaju i poslednjim greškama'), page);
});

test('R82 shipped as 2.0.0-alpha.109 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 109) >= 109);
});
