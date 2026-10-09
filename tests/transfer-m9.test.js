// Modernization M9: moving data from the web version into the app (first-run notice, untouched examples).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Sync = require('../js/sync.js');
const { withI18n } = require('./support/i18n.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const NOW = '2026-10-09T08:00:00.000Z';
const base = () => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: { weekStartsOn: 'monday' }, ui: {} });
const sample = () => ({ ...base(), projects: [{ id: 'project_client', name: 'Client Website', createdAt: NOW, updatedAt: NOW }], tasks: [{ id: 'task_homepage', title: 'Finish homepage', projectId: 'project_client', createdAt: NOW, updatedAt: NOW }] });

test('the fingerprint recognizes the untouched examples and nothing else', () => {
  const fingerprint = Sync.recordFingerprint(sample());
  assert.deepEqual(Object.keys(fingerprint).sort(), ['projects/project_client', 'tasks/task_homepage'], 'settings are not part of it');
  assert.equal(Sync.untouchedSample(sample(), [], fingerprint), true);
  const settingsChanged = sample(); settingsChanged.settings.weekStartsOn = 'sunday';
  assert.equal(Sync.untouchedSample(settingsChanged, [], fingerprint), true, 'a preference is not user data');
  const edited = sample(); edited.tasks[0].title = 'My homepage';
  assert.equal(Sync.untouchedSample(edited, [], fingerprint), false);
  const added = sample(); added.tasks.push({ id: 't2', title: 'Mine' });
  assert.equal(Sync.untouchedSample(added, [], fingerprint), false);
  const removed = sample(); removed.tasks = [];
  assert.equal(Sync.untouchedSample(removed, [], fingerprint), false);
  assert.equal(Sync.untouchedSample(sample(), [{ id: 'log', habitId: 'h', date: '2026-10-09', status: 'done' }], fingerprint), false, 'a habit check-in is user data');
  assert.equal(Sync.untouchedSample(sample(), [], null), false);
  assert.equal(Sync.untouchedSample(base(), [], {}), false, 'an empty fingerprint never matches');
});

test('a first sync from untouched examples takes the account data instead of mixing in the examples', async () => {
  const rows = new Map([['tasks/mine', { type: 'tasks', id: 'mine', data: { id: 'mine', title: 'From the web', createdAt: NOW, updatedAt: NOW }, deleted: false, updated_at: NOW }]]);
  const client = { ensureSession: async session => session, push: async () => {}, pull: async () => [...rows.values()] };
  let state = sample();
  const local = { readLocal: async () => ({ state, habitLogs: [] }), writeLocal: async result => { state = result.state; } };
  const meta = { session: { accessToken: 'x' } };
  assert.equal((await Sync.syncOnce({ client, meta, ...local })).status, 'choose', 'both sides have data');
  assert.equal(Sync.untouchedSample(state, [], Sync.recordFingerprint(sample())), true);
  assert.equal((await Sync.syncOnce({ client, meta, mode: 'server', ...local })).status, 'ok');
  assert.deepEqual(state.tasks.map(task => task.id), ['mine']);
  assert.deepEqual(state.projects, [], 'the examples are gone');
});

function harness({ native = true, configured = true, signedIn = false, untouched = true, dismissed = false } = {}) {
  const storage = new Map(dismissed ? [['dailoTransferDismissed', NOW]] : []);
  const ctx = {
    state: sample(), Sync, nowIso: () => NOW, console,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    syncClient: configured ? {} : null, loadSyncMeta: () => (signedIn ? { session: { accessToken: 'x' } } : {}),
    DailoPlatform: { isNative: native }, esc: value => String(value),
  };
  vm.createContext(withI18n(ctx));
  vm.runInContext(['rememberSample', 'untouchedSample', 'transferNotice', 'dismissTransferNotice'].map(fn).join('\n'), ctx);
  ctx.rememberSample();
  if (!untouched) ctx.state.tasks[0].title = 'Changed';
  return { ctx, storage };
}

test('the app remembers the examples it created and recognizes them later', () => {
  const { ctx, storage } = harness();
  assert.ok(JSON.parse(storage.get('dailoSample'))['tasks/task_homepage'], 'device-local fingerprint');
  assert.equal(ctx.untouchedSample(), true);
  ctx.state.tasks[0].title = 'Mine';
  assert.equal(ctx.untouchedSample(), false);
  assert.match(fn('loadState'), /state = normalizeState\(createSampleState\(\)\);\n\s+saveState\(\);\n\s+rememberSample\(\);/);
});

test('in the app a fresh install offers to import a backup or sign in; the web never shows it', () => {
  const html = harness().ctx.transferNotice();
  assert.match(html, /data-transfer-notice/);
  assert.match(html, /data-action="import-backup"/);
  assert.match(html, /<input id="backup-import-input" type="file" accept="\.zip,application\/zip" hidden \/>/, 'the file chooser works from Today');
  assert.match(html, /data-route="settings"/, 'sign in goes to the sync card');
  assert.match(html, /data-action="dismiss-transfer-notice"/);
  assert.doesNotMatch(harness({ configured: false }).ctx.transferNotice(), /data-route="settings"/, 'no sign-in without a sync project');
  assert.doesNotMatch(harness({ signedIn: true }).ctx.transferNotice(), /data-route="settings"/);
  assert.equal(harness({ native: false }).ctx.transferNotice(), '');
  assert.equal(harness({ untouched: false }).ctx.transferNotice(), '', 'gone once the user has own data');
  assert.equal(harness({ dismissed: true }).ctx.transferNotice(), '');
  const { ctx, storage } = harness();
  ctx.dismissTransferNotice();
  assert.ok(storage.get('dailoTransferDismissed'));
  assert.equal(ctx.transferNotice(), '');
});

test('Today shows the notice, its actions are wired, and a first sync from the examples skips the question', () => {
  assert.match(app, /if \(globalThis\.DailoPlatform\?\.isNative\) html \+= transferNotice\(\);\n\s+html \+= backupReminderNotice\(\);/);
  assert.match(app, /action === 'dismiss-transfer-notice'\) \{ dismissTransferNotice\(\); render\(\); \}/);
  const run = fn('runSync');
  assert.match(run, /if \(result\.status === 'choose' && syncMeta === meta\) \{[\s\S]*?if \(untouchedSample\(\) && await TodoStorage\.createAutomaticSnapshot\(state, new Date\(\), \{ force: true \}\)[\s\S]*?return runSync\('server'\);[\s\S]*openSyncChoice\(\);/);
});
