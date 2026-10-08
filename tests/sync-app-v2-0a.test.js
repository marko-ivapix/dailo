const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');
const { createFakeSupabase } = require('./support/fake-supabase.js');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const task = (id, fields = {}) => ({ id, title: id, isCompleted: false, attachmentIds: [], updatedAt: '2026-10-08T09:00:00.000Z', ...fields });
const baseState = (fields = {}) => ({
  version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [],
  settings: { weekStartsOn: 1, compactDensity: true, backupStatus: {} }, ui: {}, ...fields,
});

function renderSettings(syncView) {
  let adapter;
  runInNewContextWithI18n(read('js/settings-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  return adapter.renderRoute({ type: 'settings' }, {
    state: { settings: { shortcuts: {}, compactDensity: true, todayFocusFilter: 'all', todayVisibleSections: [] } },
    pageHeader: () => '', shortcutLabels: {}, shortcutError: () => '', notificationButtonLabel: () => 'Enable', esc,
    release: Release, environmentInfo: () => ({}), ...(syncView ? { syncView } : {}),
  });
}

test('the sync scripts load after the backup module and before the app, and are precached', () => {
  const html = read('index.html');
  const at = file => html.indexOf(`<script src="${file}"></script>`);
  assert.ok(at('js/backup.js') > 0);
  assert.ok(at('js/backup.js') < at('js/sync-config.js'), 'the config loads after the backup module');
  assert.ok(at('js/sync-config.js') < at('js/sync.js'), 'the config loads before the sync module');
  assert.ok(at('js/sync.js') < at('js/domain-modules.js') && at('js/sync.js') < at('js/app.js'), 'sync loads before the domain modules and the app');
  const worker = read('sw.js');
  for (const file of ['js/sync-config.js', 'js/sync.js']) assert.match(worker, new RegExp(`'${file.replace('.', '\\.')}',`), `${file} is precached`);
});

test('sync is off until the project URL and public key are supplied, and never takes a secret key', () => {
  const sandbox = {};
  vm.runInNewContext(read('js/sync-config.js'), sandbox);
  const config = sandbox.DailoSyncConfig;
  assert.equal(typeof config.url, 'string');
  assert.equal(typeof config.anonKey, 'string');
  assert.ok(Object.isFrozen(config));
  if (config.url || config.anonKey) {
    assert.ok(Sync.isConfigured(config), 'a filled config is complete');
    assert.match(config.url, /^https:\/\/[a-z0-9-]+\.supabase\.co$/);
  } else assert.equal(Sync.isConfigured(config), false);
  assert.doesNotMatch(config.anonKey, /^sb_secret_/, 'never a secret key');
  const parts = config.anonKey.split('.');
  if (parts.length === 3) assert.notEqual(JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role, 'service_role', 'never the service_role key');
  for (const [, literal] of read('js/sync-config.js').matchAll(/'([^']*)'/g)) assert.doesNotMatch(literal, /service_role|sb_secret_/, 'the config file holds only public values');
  assert.equal(Sync.isConfigured({ url: 'https://abcd1234.supabase.co', anonKey: 'x'.repeat(40) }), true);
  assert.equal(Sync.isConfigured({ url: 'http://abcd1234.supabase.co', anonKey: 'x'.repeat(40) }), false);
});

test('Settings shows the sync card only when sync is configured: e-mail, then code, then the account', () => {
  const off = renderSettings();
  assert.doesNotMatch(off, /data-settings-sync/);
  assert.match(off, /<span data-privacy-note>Your data stays only on this device\. Dailo has no server or account\.<\/span>/);
  assert.doesNotMatch(renderSettings(() => ({ configured: false })), /data-settings-sync/);

  const view = fields => () => ({ configured: true, signedIn: false, step: 'email', email: '', busy: false, error: '', running: false, lastSyncAt: null, lastError: '', ...fields });
  const email = renderSettings(view({ email: 'ana@example.com', error: 'Enter a valid e-mail address.' }));
  assert.match(email, /<section class="settings-card" data-settings-sync>\s*<h2>Sync<\/h2>/);
  assert.match(email, /<input class="input" id="sync-email" type="email" inputmode="email" autocomplete="email" value="ana@example\.com" \/>/);
  assert.match(email, /data-action="sync-request-code">Send code<\/button>/);
  assert.match(email, /<p class="validation" role="alert">Enter a valid e-mail address\.<\/p>/);
  assert.match(email, /<span data-privacy-note>Your data stays only on this device until you sign in to sync\.<\/span>/);

  const code = renderSettings(view({ step: 'code', email: 'ana@example.com', busy: true }));
  assert.match(code, /<input class="input" id="sync-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" \/>/);
  assert.match(code, /A code was sent to ana@example\.com\./);
  assert.match(code, /data-action="sync-verify-code" disabled>Confirm<\/button>/);
  assert.match(code, /data-action="sync-request-code" disabled>Send a new code<\/button>/);
  assert.match(code, /data-action="sync-change-email">Change e-mail<\/button>/);

  const signedIn = renderSettings(view({ signedIn: true, email: 'ana@example.com', lastSyncAt: '2026-10-08T10:00:00.000Z', lastError: 'Network unavailable: offline' }));
  assert.match(signedIn, /<strong>Account<\/strong><span>ana@example\.com<\/span>/);
  assert.match(signedIn, /<span data-sync-status><time datetime="2026-10-08T10:00:00\.000Z">/);
  assert.match(signedIn, /<span class="validation" role="alert">Network unavailable: offline<\/span>/);
  for (const action of ['sync-now', 'sync-sign-out', 'sync-delete-account']) assert.match(signedIn, new RegExp(`data-action="${action}"`));
  assert.match(signedIn, /Attachments stay on the device where they were added\./);
  assert.match(signedIn, /<span data-privacy-note>Your data is on this device and in your sync account on a server in the EU\. Attachments stay only on this device\.<\/span>/);
  assert.match(renderSettings(view({ signedIn: true, email: 'ana@example.com', running: true })), /<span data-sync-status>Syncing…<\/span>[\s\S]*data-action="sync-now" disabled>/);
  assert.match(renderSettings(view({ signedIn: true, email: 'ana@example.com' })), /<span data-sync-status>Never<\/span>/);
});

// Runs the app's sync block (from its marker to the weekly review prompt) against the fake server.
function syncHarness({ state = baseState(), habitLogs = [], meta = null, fake = createFakeSupabase() } = {}) {
  const app = read('js/app.js');
  const start = app.indexOf('  // Optional sync (V2.0-a).');
  const end = app.indexOf('  // Weekly review prompt (V1.11)');
  assert.ok(start > 0 && end > start, 'the sync block sits before the weekly review prompt');
  const storage = new Map(meta ? [['dailoSync', JSON.stringify(meta)]] : []);
  const logs = new Map(habitLogs.map(log => [log.id, clone(log)]));
  const calls = { saves: 0, renders: 0, snapshots: [], toasts: [], timers: [], confirm: null };
  const context = {
    console, JSON, Date, Promise, Error, Object, Array, String, Number, Boolean, Set, Map,
    Sync, syncClient: Sync.createClient({ url: fake.url, anonKey: fake.anonKey, fetch: fake.fetch, now: fake.now }),
    syncMeta: null, syncUi: { step: 'email', email: '', busy: false, error: '' }, syncTimer: null, syncRunning: false, applyingSync: false,
    state: clone(state), recovery: null, globalOperation: null, startupPromise: null, storageError: false, staleDataNotice: null,
    modalState: null, undoState: null, undoHold: null, textSaveTimer: null, dragState: null,
    document: { activeElement: null },
    localStorage: { getItem: key => (storage.has(key) ? storage.get(key) : null), setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    setTimeout: (fn, delay) => { calls.timers.push(delay); return calls.timers.length; }, clearTimeout() {},
    requestAnimationFrame: fn => fn(),
    TodoStorage: {
      habitLogs: {
        listAll: async () => [...logs.values()].map(clone),
        deleteMany: async ids => { for (const id of ids) logs.delete(id); },
        put: async log => { logs.set(log.id, clone(log)); },
      },
      createAutomaticSnapshot: async (source, now, options) => { calls.snapshots.push(clone({ tasks: source.tasks.map(item => item.id), options })); return 'snap'; },
    },
    normalizeState: value => clone(value),
    saveState() { calls.saves += 1; return true; },
    refreshHabitMetrics: async () => { context.state.habitLogCache = 'refreshed'; },
    render() { calls.renders += 1; }, renderModal() {}, closePopover() {}, captureModalReturnFocus() {},
    currentRoute: () => ({ type: 'settings' }),
    openConfirm(config) { calls.confirm = config; context.modalState = { type: 'confirm', ...config }; },
    setToastMessage(message) { calls.toasts.push(message); },
    inputs: {}, $: selector => (selector.startsWith('#') && selector.slice(1) in context.inputs ? { value: context.inputs[selector.slice(1)] } : null),
    modalFrame: content => content, esc,
  };
  vm.createContext(withI18n(context));
  vm.runInContext(app.slice(start, end), context);
  return { context, storage, logs, calls, fake, meta: () => JSON.parse(storage.get('dailoSync') || '{}') };
}

async function signedInHarness(options = {}) {
  const fake = options.fake || createFakeSupabase();
  const client = Sync.createClient({ url: fake.url, anonKey: fake.anonKey, fetch: fake.fetch, now: fake.now });
  await client.requestCode('ana@example.com');
  const session = await client.verifyCode('ana@example.com', '123456');
  return syncHarness({ ...options, fake, meta: { userId: session.user.id, session, ...(options.meta || {}) } });
}

test('runSync waits for dialogs, Undo, typing and drags, and stays off without a session', async () => {
  const idle = syncHarness();
  await vm.runInContext('runSync()', idle.context);
  assert.equal(idle.fake.rowsFor('ana@example.com').length, 0, 'nothing is sent without a session');
  assert.deepEqual(idle.calls.timers, []);

  const busy = await signedInHarness({ state: baseState({ tasks: [task('t1')] }) });
  for (const [key, value] of [['modalState', { type: 'quick' }], ['undoState', {}], ['textSaveTimer', 7], ['dragState', { type: 'task' }]]) {
    busy.context[key] = value;
    await vm.runInContext('runSync()', busy.context);
    assert.equal(busy.fake.rowsFor('ana@example.com').length, 0, `${key} defers the sync`);
    assert.equal(busy.calls.timers.at(-1), 15000, `${key} retries in 15 seconds`);
    busy.context[key] = null;
  }
  busy.context.document.activeElement = { matches: selector => selector.includes('textarea') };
  await vm.runInContext('runSync()', busy.context);
  assert.equal(busy.fake.rowsFor('ana@example.com').length, 0, 'typing defers the sync');
  busy.context.document.activeElement = null;
  for (const [key, value] of [['globalOperation', {}], ['recovery', 'corrupted-data'], ['staleDataNotice', {}], ['storageError', true]]) {
    busy.context[key] = value;
    const timers = busy.calls.timers.length;
    await vm.runInContext('runSync()', busy.context);
    assert.equal(busy.fake.rowsFor('ana@example.com').length, 0, `${key} stops the sync`);
    assert.equal(busy.calls.timers.length, timers, `${key} waits for the next trigger`);
    busy.context[key] = null;
  }
  await vm.runInContext('runSync()', busy.context);
  assert.deepEqual(busy.fake.rowsFor('ana@example.com').filter(row => row.type === 'tasks').map(row => row.id), ['t1']);
});

test('a signed-in sync pushes local changes and applies remote ones through the save path and habit-log storage', async () => {
  const fake = createFakeSupabase();
  const phone = await signedInHarness({ fake, state: baseState({ tasks: [task('t1', { attachmentIds: ['a1'] })] }) });
  await vm.runInContext('runSync()', phone.context);
  assert.equal(phone.meta().lastError, null);
  assert.ok(phone.meta().lastSyncAt);
  assert.ok(phone.meta().shadow['tasks/t1'], 'the shadow is kept on the device');

  const laptop = await signedInHarness({ fake, state: baseState({ tasks: [] }) });
  await vm.runInContext('runSync()', laptop.context);
  assert.deepEqual(laptop.context.state.tasks.map(item => [item.id, item.attachmentIds]), [['t1', []]], 'attachments stay on the phone');
  laptop.context.state.tasks[0].title = 'Edited on the laptop';
  laptop.context.state.tasks[0].updatedAt = '2026-10-08T11:00:00.000Z';
  laptop.context.state.habits = [{ id: 'h1', name: 'Walk', updatedAt: '2026-10-08T09:00:00.000Z' }];
  laptop.logs.set('l1', { id: 'l1', habitId: 'h1', date: '2026-10-08', value: 1 });
  await vm.runInContext('runSync()', laptop.context);

  const saves = phone.calls.saves, renders = phone.calls.renders;
  await vm.runInContext('runSync()', phone.context);
  assert.equal(phone.context.state.tasks[0].title, 'Edited on the laptop');
  assert.deepEqual(phone.context.state.tasks[0].attachmentIds, ['a1'], 'local attachments survive the pull');
  assert.deepEqual([...phone.logs.keys()], ['l1'], 'habit logs are written through TodoStorage');
  assert.equal(phone.context.state.habitLogCache, 'refreshed', 'habit metrics are refreshed');
  assert.equal(phone.calls.saves, saves + 1, 'pulled state is saved once');
  assert.ok(phone.calls.renders > renders);
  assert.equal(phone.context.applyingSync, false);

  vm.runInContext('scheduleSync()', phone.context);
  assert.equal(phone.calls.timers.at(-1), 3000, 'a local save syncs three seconds later');
  phone.context.applyingSync = true;
  const timers = phone.calls.timers.length;
  vm.runInContext('scheduleSync()', phone.context);
  assert.equal(phone.calls.timers.length, timers, 'saving pulled data does not schedule another sync');
});

test('a pull that arrives while a dialog opened is deferred without moving the shadow, and a failed save keeps the old state', async () => {
  const fake = createFakeSupabase();
  const laptop = await signedInHarness({ fake, state: baseState({ tasks: [task('remote')] }) });
  await vm.runInContext('runSync()', laptop.context);
  const phone = await signedInHarness({ fake, meta: { shadow: {}, cursor: null }, state: baseState({ tasks: [] }) });
  phone.context.Sync = { ...Sync, syncOnce: options => { phone.context.modalState = { type: 'quick' }; return Sync.syncOnce(options); } };
  await vm.runInContext('runSync()', phone.context);
  assert.deepEqual(phone.context.state.tasks, [], 'nothing is applied under an open dialog');
  assert.equal(phone.meta().lastError, null, 'a deferral is not an error');
  assert.equal(phone.meta().shadow['tasks/remote'], undefined, 'the shadow does not move');
  assert.equal(phone.calls.timers.at(-1), 15000);

  phone.context.Sync = Sync;
  phone.context.modalState = null;
  phone.context.saveState = () => false;
  await vm.runInContext('runSync()', phone.context);
  assert.deepEqual(phone.context.state.tasks, [], 'a failed save restores the previous state');
  assert.equal(phone.meta().lastError, 'Changes could not be saved locally. Try again.');
});

test('signing in keeps the shadow for the same account, resets it for another, and an expired session signs out', async () => {
  const fake = createFakeSupabase();
  const harness = syncHarness({ fake, meta: { userId: 'someone-else', shadow: { 'tasks/x': 'h' }, cursor: '2026-10-01T00:00:00.000Z' } });
  harness.context.inputs['sync-email'] = 'not-an-address';
  await vm.runInContext('requestSyncCode()', harness.context);
  assert.equal(harness.context.syncUi.error, 'Enter a valid e-mail address.');
  harness.context.inputs['sync-email'] = ' ana@example.com ';
  await vm.runInContext('requestSyncCode()', harness.context);
  assert.deepEqual(fake.sentCodes.map(item => item.email), ['ana@example.com']);
  assert.equal(harness.context.syncUi.step, 'code');
  harness.context.inputs['sync-code'] = '12';
  await vm.runInContext('verifySyncCode()', harness.context);
  assert.equal(harness.context.syncUi.error, 'Enter the code from the e-mail.');
  harness.context.inputs['sync-code'] = '000000';
  await vm.runInContext('verifySyncCode()', harness.context);
  assert.equal(harness.context.syncUi.error, 'The code is wrong or has expired.');
  harness.context.inputs['sync-code'] = '123 456';
  await vm.runInContext('verifySyncCode()', harness.context);
  const meta = harness.meta();
  assert.equal(meta.session.user.email, 'ana@example.com');
  assert.notEqual(meta.userId, 'someone-else');
  assert.ok(meta.lastSyncAt, 'the first sync runs after sign-in');
  assert.equal(meta.shadow['tasks/x'], undefined, 'another account starts from a fresh shadow');
  assert.equal(harness.context.syncUi.step, 'email');

  await vm.runInContext('requestSyncCode()', Object.assign(harness.context, { inputs: { 'sync-email': 'ana@example.com' } }));
  harness.context.inputs['sync-code'] = '123456';
  harness.storage.set('dailoSync', JSON.stringify({ ...meta, shadow: { 'tasks/kept': 'h' }, cursor: '2026-10-02T00:00:00.000Z' }));
  harness.context.syncRunning = true; // keep the follow-up sync from changing what sign-in stored
  await vm.runInContext('verifySyncCode()', harness.context);
  harness.context.syncRunning = false;
  assert.deepEqual(harness.meta().shadow, { 'tasks/kept': 'h' }, 'the same account keeps its shadow');
  assert.equal(harness.meta().cursor, '2026-10-02T00:00:00.000Z');
  assert.notEqual(harness.meta().session.accessToken, meta.session.accessToken, 'with the new session');

  const expired = harness.meta();
  harness.storage.set('dailoSync', JSON.stringify({ ...expired, session: { ...expired.session, refreshToken: 'revoked', expiresAt: 0 } }));
  await vm.runInContext('runSync()', harness.context);
  const after = harness.meta();
  assert.equal(after.session, undefined, 'an expired session is removed');
  assert.equal(after.lastError, 'Session expired');
  assert.deepEqual(after.shadow, expired.shadow, 'the shadow stays for the next sign-in');
  assert.equal(vm.runInContext('syncView()', harness.context).signedIn, false);
});

test('the first-sync choice takes a recovery snapshot, and cancelling it signs out', async () => {
  const fake = createFakeSupabase();
  const laptop = await signedInHarness({ fake, state: baseState({ tasks: [task('remote')] }) });
  await vm.runInContext('runSync()', laptop.context);
  const phone = await signedInHarness({ fake, state: baseState({ tasks: [task('local')] }) });
  await vm.runInContext('runSync()', phone.context);
  assert.equal(phone.context.modalState?.type, 'sync-choice');
  const html = vm.runInContext('renderSyncChoice()', phone.context);
  for (const mode of ['merge', 'server', 'device']) assert.match(html, new RegExp(`data-action="sync-choose" data-mode="${mode}"`));
  await vm.runInContext("chooseSyncMode('server')", phone.context);
  assert.deepEqual(phone.calls.snapshots, [{ tasks: ['local'], options: { force: true } }], 'a forced recovery snapshot comes first');
  assert.equal(phone.context.modalState, null);
  assert.deepEqual(phone.context.state.tasks.map(item => item.id), ['remote']);

  const tablet = await signedInHarness({ fake, state: baseState({ tasks: [task('tablet')] }) });
  await vm.runInContext('runSync()', tablet.context);
  assert.equal(tablet.context.modalState?.type, 'sync-choice');
  await tablet.context.modalState.onCancel();
  assert.equal(tablet.context.modalState, null);
  assert.equal(tablet.meta().session, undefined, 'cancelling signs out');
  assert.deepEqual(tablet.context.state.tasks.map(item => item.id), ['tablet'], 'local data stays');

  const failing = await signedInHarness({ fake, state: baseState({ tasks: [task('other')] }) });
  failing.context.TodoStorage.createAutomaticSnapshot = async () => { throw new Error('Storage full'); };
  await vm.runInContext('runSync()', failing.context);
  await vm.runInContext("chooseSyncMode('merge')", failing.context);
  assert.deepEqual(failing.context.state.tasks.map(item => item.id), ['other'], 'no snapshot, no sync');
  assert.match(failing.calls.toasts.at(-1), /Storage full/);
});

test('sign-out keeps local data, and account deletion needs the typed word', async () => {
  const fake = createFakeSupabase();
  const phone = await signedInHarness({ fake, state: baseState({ tasks: [task('t1')] }) });
  await vm.runInContext('runSync()', phone.context);
  vm.runInContext('deleteSyncAccount()', phone.context);
  assert.equal(phone.calls.confirm.phrase, 'OBRIŠI');
  assert.equal(phone.calls.confirm.title, 'Delete your sync account?');
  phone.context.inputs['global-confirm-phrase'] = 'obrisati';
  await phone.calls.confirm.onConfirm();
  assert.ok(fake.hasUser('ana@example.com'), 'a wrong word deletes nothing');
  assert.match(phone.calls.toasts.at(-1), /Type OBRIŠI exactly to continue\./);
  phone.context.inputs['global-confirm-phrase'] = ' obrisi ';
  await phone.calls.confirm.onConfirm();
  assert.equal(fake.hasUser('ana@example.com'), false, 'the word works without diacritics too');
  assert.deepEqual(phone.meta(), {});
  assert.deepEqual(phone.context.state.tasks.map(item => item.id), ['t1'], 'data on this device stays');

  const laptop = await signedInHarness({ fake, state: baseState({ tasks: [task('t2')] }) });
  await vm.runInContext('runSync()', laptop.context);
  await vm.runInContext('signOutSync()', laptop.context);
  assert.deepEqual(laptop.meta(), {});
  assert.deepEqual(laptop.context.state.tasks.map(item => item.id), ['t2']);
  assert.equal(vm.runInContext('syncView()', laptop.context).signedIn, false);
});

test('the app wires sync into saving, startup, dialogs, actions and the domain context', () => {
  const app = read('js/app.js');
  assert.match(app, /const Sync = window\.DailoSync \|\| null;/);
  assert.match(app, /const syncClient = Sync\?\.isConfigured\(syncConfig\) \? Sync\.createClient\(\{ url: syncConfig\.url, anonKey: syncConfig\.anonKey \}\) : null;/);
  assert.match(app, /scheduleAutomaticSnapshot\(\);\n\s+scheduleSync\(\);\n\s+return true;/, 'every successful save schedules a sync');
  assert.match(app, /await startReady\(\);[\s\S]*?startSync\(\);[\s\S]*?registerServiceWorker\(\);/, 'sync starts after the data is ready');
  assert.match(app, /else if \(modalState\.type === 'sync-choice'\) root\.innerHTML = renderSyncChoice\(\);/);
  for (const action of ['sync-request-code', 'sync-verify-code', 'sync-change-email', 'sync-now', 'sync-sign-out', 'sync-delete-account', 'sync-choose']) {
    assert.match(app, new RegExp(`action === '${action}'`), `${action} is handled`);
  }
  assert.match(app, /syncView,/, 'Settings reads the sync view from the domain context');
  assert.match(app, /visibilitychange[\s\S]*?scheduleSync\(500\)/);
  assert.match(app, /addEventListener\('online', \(\) => scheduleSync\(500\)\)/);
  assert.match(app, /setInterval\(\(\) => scheduleSync\(0\), 5 \* 60 \* 1000\)/);
});

test('a forced automatic snapshot skips the five-minute pause that ordinary saves keep', async () => {
  global.TodoCore = require('../js/core.js');
  global.__TODO_TEST_MEMORY_DB__ = true;
  const values = new Map();
  global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
  const Storage = require('../js/storage.js');
  global.JSZip = require('../vendor/jszip.min.js');
  require('../js/backup.js');
  await Storage.clearAllForTests();
  const state = TodoCore.normalizeState(baseState({ tasks: [task('t1')] }));
  localStorage.setItem('todoAppData', JSON.stringify(state));
  assert.ok(await Storage.createAutomaticSnapshot(state, new Date('2026-10-08T10:00:00Z')));
  assert.equal(await Storage.createAutomaticSnapshot(state, new Date('2026-10-08T10:01:00Z')), null, 'ordinary saves keep the pause');
  assert.ok(await Storage.createAutomaticSnapshot(state, new Date('2026-10-08T10:02:00Z'), { force: true }), 'the sync choice always gets a fresh copy');
  assert.equal((await Storage.recoverySnapshots.listAll()).filter(item => item.reason === 'automatic').length, 2);
});

test('a fired text save clears its timer, so a finished edit does not hold the sync back', () => {
  const app = read('js/app.js');
  let fire = null;
  const context = { textSaveTimer: null, saves: 0, saveState() { context.saves += 1; return true; }, clearTimeout() {}, setTimeout: fn => { fire = fn; return 9; } };
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('  function scheduleTextSave('), app.indexOf('  function getProject(')), context);
  vm.runInContext('scheduleTextSave()', context);
  assert.equal(context.textSaveTimer, 9);
  fire();
  assert.equal(context.textSaveTimer, null);
  assert.equal(context.saves, 1);
  vm.runInContext('flushTextSave()', context);
  assert.equal(context.saves, 1, 'nothing is left to flush');
});

test('V2.0-a is released as 2.0.0-alpha.1', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.1');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.1';/);
});

test('after a reset or a restored backup the next sync asks again instead of pushing deletions', async () => {
  const fake = createFakeSupabase();
  const laptop = await signedInHarness({ fake, state: baseState({ tasks: [task('t1'), task('t2')] }) });
  await vm.runInContext('runSync()', laptop.context);
  const phone = await signedInHarness({ fake, state: baseState() });
  await vm.runInContext('runSync()', phone.context);
  assert.deepEqual(phone.context.state.tasks.map(item => item.id), ['t1', 't2']);
  // A reset leaves the device empty; without a fresh start the next sync would delete both tasks on the server.
  phone.context.state = baseState();
  vm.runInContext('forgetSyncShadow()', phone.context);
  assert.equal(phone.meta().shadow, undefined);
  assert.equal(phone.meta().cursor, undefined);
  assert.ok(phone.meta().session, 'the account stays signed in');
  await vm.runInContext('runSync()', phone.context);
  assert.deepEqual(fake.rowsFor('ana@example.com').filter(row => row.type === 'tasks' && !row.deleted).map(row => row.id), ['t1', 't2'], 'nothing is deleted on the server');
  assert.deepEqual(phone.context.state.tasks.map(item => item.id), ['t1', 't2'], 'an empty device takes the account data');
  assert.match(read('js/app.js'), /state = normalizeState\(op\.validated\.state\); canonicalRaw = localStorage\.getItem\(STORAGE_KEY\); recovery = null; modalState = null;\n\s+if \(!op\.selective\) forgetSyncShadow\(\);/);
});
