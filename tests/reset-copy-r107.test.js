// R107: "Resetuj podatke aplikacije" keeps a copy only when asked. Podešavanja → Podaci has "Sačuvaj kopiju pre
// brisanja", on by default; with it the reset works as before (safety ZIP, recovery copy, RESETUJ). Turned off, no ZIP
// is made, the window says the data cannot come back, and after the verified reset the device keeps no old data: the
// local snapshots and the phone's automatic backup files go too. The internal recovery copy still guards the reset
// and is removed right after. With an account signed in, the window says the account's data comes back with the next
// sync and that the account is deleted first. AGENTS.md amended with the user's approval.
// Spec: docs/superpowers/specs/2026-10-16-r107-reset-without-copy.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { withI18n } = require('./support/i18n.js');

const Core = global.TodoCore = require('../js/core.js');
global.__TODO_TEST_MEMORY_DB__ = true;
const Storage = require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');
const Platform = require('../js/platform.js');
const Release = require('../js/release.js');

const values = new Map();
global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const stamp = '2026-10-16T09:00:00.000Z';
const v3 = (fields = {}) => Core.normalizeState({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: {}, ui: {}, ...fields });

function resetApp(current, { signedIn = false } = {}) {
  const source = read('js/app.js');
  const code = source.slice(source.indexOf('  async function exportBackupAction('), source.indexOf('  async function enableBrowserNotifications('));
  const inputs = { '#global-confirm-phrase': { value: '' } };
  const calls = [];
  const ctx = { state: current, canonicalRaw: localStorage.getItem('todoAppData'), Core, TodoStorage: Storage, Backup, Attachments: {}, localStorage, STORAGE_KEY: 'todoAppData', structuredClone,
    globalOperation: null, globalRecoveryNotice: null, recovery: null, startupPromise: null, modalState: null, modalReturnFocus: null,
    undoHold: null, undoGeneration: 0, undoState: null, undoWork: new Set(), toasts: [], calls,
    normalizeState: Core.normalizeState, nowIso: () => stamp, flushTextSave() {}, createEmptyState: () => v3(),
    deleteLifecycle: { hold: async () => ({}), retire() {}, resume: async () => {} },
    openConfirm: config => { ctx.confirm = config; ctx.modalState = { type: 'confirm', ...config }; },
    renderModal() {}, render() {}, renderToast() {}, location: { hash: '#settings' },
    setToastMessage: message => { ctx.toasts.push(message); }, setUndo() {}, refreshHabitMetrics: async () => {}, $: selector => inputs[selector] || null,
    loadArchive: async () => {}, forgetSyncShadow() {}, scheduleDurableMirror() {}, journalCipherStored: () => null, deviceJournalKey: async () => null, storeJournalKey: async () => {},
    syncView: () => ({ configured: true, signedIn }),
    writeAutoBackup: patch => calls.push(['auto-backup', patch]),
    globalThis: { DailoPlatform: { isNative: true, files: { deleteBackupCopies: async options => { calls.push(['delete-copies', options]); return 2; } } } },
  };
  vm.createContext(withI18n(ctx)); vm.runInContext(code, ctx);
  ctx.downloadBackup = () => { calls.push(['download']); return 'downloaded'; };
  return { ctx, inputs, calls };
}

async function seeded() {
  await Storage.clearAllForTests(); values.clear();
  const current = v3({ tasks: [{ id: 'mine', title: 'Na uređaju' }] });
  localStorage.setItem('todoAppData', JSON.stringify(current));
  await Storage.createAutomaticSnapshot(current, new Date(stamp), { force: true });
  return current;
}

test('without a copy: no ZIP, a clear warning, and after the reset no old copy stays on the device', async () => {
  const app = resetApp(await seeded());
  await app.ctx.beginGlobalOperation('reset', null, null, { keepCopy: false });
  assert.ok(app.ctx.confirm, app.ctx.toasts.join(' | '));
  assert.deepEqual(app.calls.filter(call => call[0] === 'download'), [], 'no safety ZIP');
  assert.equal(app.ctx.confirm.phrase, 'RESETUJ');
  assert.match(app.ctx.confirm.message, /^No copy is kept: afterwards the data cannot be brought back\. The local snapshots and the phone's automatic backups are deleted too\./);
  app.inputs['#global-confirm-phrase'].value = 'RESETUJ';
  await app.ctx.commitGlobalOperation(app.ctx.globalOperation);
  assert.deepEqual(app.ctx.state.tasks, []);
  assert.deepEqual(await Storage.recoverySnapshots.listAll(), [], 'the automatic snapshot and the recovery copy are gone');
  assert.deepEqual(JSON.parse(JSON.stringify(app.calls.filter(call => call[0] !== 'download'))), [['delete-copies', { prefix: 'dailo-auto-' }], ['auto-backup', { lastAt: null, lastFile: null, error: null }]], 'the phone\'s automatic copies go');
  assert.ok(app.ctx.toasts.includes('App data reset and verified.'));
});

test('with a copy (the default): the ZIP comes first and the local snapshots stay', async () => {
  const app = resetApp(await seeded());
  await app.ctx.beginGlobalOperation('reset');
  assert.deepEqual(app.calls, [['download']]);
  assert.match(app.ctx.confirm.message, /^A safety ZIP was downloaded and an internal recovery copy was created\./);
  app.inputs['#global-confirm-phrase'].value = 'RESETUJ';
  await app.ctx.commitGlobalOperation(app.ctx.globalOperation);
  assert.deepEqual(app.ctx.state.tasks, []);
  assert.deepEqual((await Storage.recoverySnapshots.listAll()).map(item => item.reason), ['automatic']);
  assert.deepEqual(app.calls, [['download']], 'the phone\'s copies stay');
  const restore = resetApp(await seeded());
  await restore.ctx.beginGlobalOperation('restore', null, null, { keepCopy: false }).catch(() => {});
  assert.deepEqual(restore.calls.slice(0, 1), [['download']], 'a restore always makes its ZIP');
});

test('with an account signed in, the window says the account keeps its data until it is deleted', async () => {
  const app = resetApp(await seeded(), { signedIn: true });
  await app.ctx.beginGlobalOperation('reset', null, null, { keepCopy: false });
  assert.match(app.ctx.confirm.message, /An account is signed in on this device: this deletes only the data on the device, and the account's data comes back with the next sync\. To delete everything, first delete the account \(More → Account → Delete account\), then reset\.$/);
  await app.ctx.abandonGlobalOperation(app.ctx.globalOperation);
});

test('the phone deletes only its automatic backup files; the web has none', async () => {
  const calls = [];
  const files = new Map(['dailo-auto-2026-10-04.zip', 'dailo-auto-2026-10-11.zip', 'moja-kopija.zip'].map(name => [`Dailo/${name}`, 'x']));
  const fsPlugin = {
    readdir: async options => ({ files: [...files.keys()].filter(key => key.startsWith(`${options.path}/`)).map(key => ({ name: key.slice(options.path.length + 1), type: 'file' })) }),
    deleteFile: async options => { calls.push([options.path, options.directory]); files.delete(options.path); },
  };
  const platform = Platform.create({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', registerPlugin: name => (name === 'Filesystem' ? fsPlugin : {}) }, console });
  assert.equal(await platform.files.deleteBackupCopies({ prefix: 'dailo-auto-' }), 2);
  assert.deepEqual(calls, [['Dailo/dailo-auto-2026-10-04.zip', 'DOCUMENTS'], ['Dailo/dailo-auto-2026-10-11.zip', 'DOCUMENTS']]);
  assert.ok(files.has('Dailo/moja-kopija.zip'), 'other files stay');
  assert.equal(await Platform.files.deleteBackupCopies({ prefix: 'dailo-auto-' }), 0);
});

test('Podešavanja has the choice, on by default; the rule, the strings and the pages follow', () => {
  const settings = read('js/settings-ui.js');
  assert.match(settings, /<div class="settings-row settings-sub"><label class="settings-label" for="reset-keep-copy"><strong>\$\{tr\('Keep a copy before deleting'\)\}<\/strong><span>\$\{tr\('A ZIP with all the data\. Without it the reset cannot be undone, and the local snapshots and the phone\\'s automatic backups are deleted too\.'\)\}<\/span><\/label><input id="reset-keep-copy" type="checkbox"\$\{ctx\.resetKeepCopy\?\.\(\) === false \? '' : ' checked'\}><\/div>/);
  const app = read('js/app.js');
  assert.match(app, /let resetKeepCopy = true;/);
  assert.match(app, /function resetApp\(\) \{\n\s+return beginGlobalOperation\('reset', null, null, \{ keepCopy: resetKeepCopy \}\);/);
  assert.match(app, /if \(event\.target\.id === 'reset-keep-copy'\) \{ resetKeepCopy = event\.target\.checked; return; \}/);
  assert.match(read('AGENTS.md'), /R107: Reset makes the safety ZIP unless the user turns off "Sačuvaj kopiju pre brisanja" \(on by default\)/);
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['Keep a copy before deleting', 'Sačuvaj kopiju pre brisanja'],
    ['Clears the tasks, projects, tags, attachments and preferences on this device.', 'Briše zadatke, projekte, oznake, priloge i podešavanja na ovom uređaju.'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  assert.ok(read('novo.html').includes('<li><strong>Brisanje bez kopije.</strong>'));
  assert.ok(read('uputstvo.html').includes('<strong>Sačuvaj kopiju pre brisanja</strong>'));
});

test('R107 shipped as 2.0.0-alpha.136 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 136) >= 136);
});
