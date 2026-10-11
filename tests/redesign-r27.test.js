// Redesign R27: an automatic weekly backup on the phone (addition J).
// Spec: docs/superpowers/specs/2026-10-11-redesign-r27-auto-backup.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const Platform = require('../js/platform.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };

function fakeFilesystem(existing = []) {
  const calls = [];
  const files = new Map(existing.map(name => [`Dailo/${name}`, 'x']));
  const fsPlugin = {
    writeFile: async options => { calls.push(['write', options.path, options.directory, options.recursive === true]); files.set(options.path, options.data); },
    appendFile: async options => { calls.push(['append', options.path, options.directory]); },
    readdir: async options => { calls.push(['readdir', options.path, options.directory]); return { files: [...files.keys()].filter(key => key.startsWith(`${options.path}/`)).map(key => ({ name: key.slice(options.path.length + 1), type: 'file' })) }; },
    deleteFile: async options => { calls.push(['delete', options.path, options.directory]); files.delete(options.path); },
  };
  const platform = Platform.create({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', registerPlugin: name => (name === 'Filesystem' ? fsPlugin : {}) }, btoa: value => Buffer.from(value, 'binary').toString('base64'), console });
  return { platform, calls, files };
}

test('J: the phone keeps a backup copy in Documents/Dailo and only the newest four automatic ones', async () => {
  const { platform, calls, files } = fakeFilesystem(['dailo-auto-2026-09-13.zip', 'dailo-auto-2026-09-20.zip', 'dailo-auto-2026-09-27.zip', 'dailo-auto-2026-10-04.zip', 'moja-kopija.zip']);
  const result = await platform.files.saveBackupCopy(new Blob(['zip']), 'dailo-auto-2026-10-11.zip', { keep: 4, prefix: 'dailo-auto-' });
  assert.deepEqual(result, { folder: 'Documents/Dailo', name: 'dailo-auto-2026-10-11.zip' });
  assert.deepEqual(calls[0], ['write', 'Dailo/dailo-auto-2026-10-11.zip', 'DOCUMENTS', true]);
  assert.deepEqual(calls.filter(call => call[0] === 'delete'), [['delete', 'Dailo/dailo-auto-2026-09-13.zip', 'DOCUMENTS']], 'the oldest automatic copy goes');
  assert.ok(files.has('Dailo/moja-kopija.zip'), 'other files in the folder stay');
  await assert.rejects(Platform.files.saveBackupCopy(new Blob(['zip']), 'x.zip'), /app/, 'the web has no device folder');
});

function harness({ meta = null, native = true, busy = false } = {}) {
  const calls = [];
  const storage = new Map(meta ? [['dailoAutoBackup', JSON.stringify(meta)]] : []);
  const ctx = withI18n({
    state: { tasks: [] }, globalOperation: busy ? {} : null, recovery: null, startupPromise: null, JSON, Date, Math, console,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    nowIso: () => '2026-10-11T08:00:00.000Z', Core: { dateOnly: () => '2026-10-11' },
    Backup: { exportBackupV3: async () => { calls.push(['export']); return new Blob(['zip']); } }, TodoStorage: {},
    DailoPlatform: { isNative: native, files: { saveBackupCopy: async (blob, name, options) => { calls.push(['save', name, options]); return { folder: 'Documents/Dailo', name }; } } },
    render: () => calls.push(['render']), currentRoute: () => ({ type: 'settings' }), setToastMessage: text => calls.push(['toast', text]),
  });
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(`${app.match(/const AUTO_BACKUP_KEY = [^\n]+/)[0]}\nlet autoBackupRunning = false;\n${['readAutoBackup', 'writeAutoBackup', 'autoBackupDue', 'runAutoBackup'].map(fn).join('\n')}`, ctx);
  return { ctx, calls, storage };
}

test('J: a backup is due a week after the last one, only when it is on and only in the app', () => {
  assert.equal(harness().ctx.autoBackupDue(), false, 'off by default');
  assert.equal(harness({ meta: { enabled: true, lastAt: null } }).ctx.autoBackupDue(), true);
  assert.equal(harness({ meta: { enabled: true, lastAt: '2026-10-05T08:00:00.000Z' } }).ctx.autoBackupDue(), false, 'six days');
  assert.equal(harness({ meta: { enabled: true, lastAt: '2026-10-04T08:00:00.000Z' } }).ctx.autoBackupDue(), true, 'seven days');
  assert.equal(harness({ meta: { enabled: true, lastAt: null }, native: false }).ctx.autoBackupDue(), false);
  assert.equal(harness({ meta: { enabled: true, lastAt: 'garbage' } }).ctx.autoBackupDue(), true, 'an unreadable date counts as never');
});

test('J: a run writes the full ZIP, remembers it, and records an error without throwing', async () => {
  const { ctx, calls, storage } = harness({ meta: { enabled: true, lastAt: null } });
  assert.equal(await ctx.runAutoBackup(), true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.slice(0, 2))), [['export'], ['save', 'dailo-auto-2026-10-11.zip', { keep: 4, prefix: 'dailo-auto-' }]]);
  assert.deepEqual(JSON.parse(storage.get('dailoAutoBackup')), { enabled: true, lastAt: '2026-10-11T08:00:00.000Z', lastFile: 'Documents/Dailo/dailo-auto-2026-10-11.zip', error: null });
  const failing = harness({ meta: { enabled: true, lastAt: null } });
  failing.ctx.DailoPlatform.files.saveBackupCopy = async () => { throw new Error('No space'); };
  assert.equal(await failing.ctx.runAutoBackup(), false);
  assert.equal(JSON.parse(failing.storage.get('dailoAutoBackup')).error, 'No space');
  const busy = harness({ meta: { enabled: true, lastAt: null }, busy: true });
  assert.equal(await busy.ctx.runAutoBackup(), false);
  assert.deepEqual(busy.calls, [], 'never during an import, restore or recovery');
});

test('J: Settings → Podaci has the switch in the app; turning it on backs up at once; start and resume check the week', () => {
  const settings = read('js/settings-ui.js');
  assert.match(settings, /native \? `\s*<div class="settings-row"><label class="settings-label" for="auto-backup"><strong>\$\{tr\('Automatic backup'\)\}<\/strong><span>\$\{tr\('Once a week to Documents\/Dailo on this phone; the newest four are kept\.'\)\}/);
  assert.match(settings, /<input id="auto-backup" type="checkbox"\$\{autoBackup\.enabled \? ' checked' : ''\}>/);
  assert.match(app, /if \(event\.target\.id === 'auto-backup'\) \{ writeAutoBackup\(\{ enabled: event\.target\.checked \}\); if \(event\.target\.checked\) runAutoBackup\(\{ announce: true \}\); render\(\); return; \}/);
  assert.match(fn('startPlatform'), /setTimeout\(\(\) => \{ if \(autoBackupDue\(\)\) runAutoBackup\(\); \}, 8000\);/);
  assert.match(fn('resumeApp'), /if \(autoBackupDue\(\)\) runAutoBackup\(\);/);
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [['Automatic backup', 'Automatska rezervna kopija'], ['Once a week to Documents/Dailo on this phone; the newest four are kept.', 'Jednom nedeljno u Documents/Dailo na ovom telefonu; čuvaju se četiri najnovije.']]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
});

test('J: Android may write to Documents on older versions; iOS shows the folder in Files', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /<uses-permission android:name="android\.permission\.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" \/>/);
  assert.match(manifest, /<uses-permission android:name="android\.permission\.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" \/>/);
  assert.match(manifest, /android:requestLegacyExternalStorage="true"/);
  const plist = read('ios/App/App/Info.plist');
  assert.match(plist, /<key>UIFileSharingEnabled<\/key>\s*<true\/>/);
  assert.match(plist, /<key>LSSupportsOpeningDocumentsInPlace<\/key>\s*<true\/>/);
});

test('R27 shipped as 2.0.0-alpha.52 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 52);
});
