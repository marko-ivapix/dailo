// R78: fixes from the review of R75. The restore window's journal password check (PBKDF2) can take a few seconds on
// a phone: the window now says it is checking, and Otkaži pressed meanwhile is honored once the check ends, so
// nothing is replaced. The key is stored after the screen is redrawn, and only while the restored state still has
// its cipher. These tests run the real restore flow (Backup, Storage, Sync) in a harness.
// Spec: docs/superpowers/specs/2026-10-15-r78-restore-journal-fixes.md
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
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');
const { functionSource } = require('./support/source.js');

const values = new Map();
global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const stamp = '2026-10-14T20:00:00.000Z';
const v3 = (fields = {}) => Core.normalizeState({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: {}, ui: {}, ...fields });
const noStorage = { attachments: { getMany: async () => [] }, habitLogs: { listAll: async () => [] }, goalHistory: { listAll: async () => [] } };

async function sealedBackup() {
  const { cipher, key } = await Sync.createJournalCipher('lozinka dnevnika 7', { iterations: 1000 });
  const state = v3({ tasks: [{ id: 'task', title: 'Iz kopije' }], journal: [{ id: 'journal_2026-10-14', date: '2026-10-14', text: 'Tajna misao', mood: 4, createdAt: stamp, updatedAt: stamp }], settings: { journalCipher: cipher } });
  const blob = await Backup.exportBackupV3(state, noStorage, stamp, { sealJournal: async item => (await Sync.sealJournalRecord(key, { data: item })).data });
  return { blob, cipher };
}

function restoreApp(current) {
  const source = read('js/app.js');
  const code = source.slice(source.indexOf('  async function exportBackupAction('), source.indexOf('  async function enableBrowserNotifications('));
  const inputs = { '#global-confirm-phrase': { value: '' }, '#global-confirm-journal-password': { value: '' } };
  const ctx = { state: current, canonicalRaw: localStorage.getItem('todoAppData'), Core, TodoStorage: Storage, Backup, Sync, Attachments: {}, localStorage, STORAGE_KEY: 'todoAppData', structuredClone,
    globalOperation: null, globalRecoveryNotice: null, recovery: null, startupPromise: null, modalState: null, modalReturnFocus: null,
    undoHold: null, undoGeneration: 0, undoState: null, undoWork: new Set(), toasts: [],
    normalizeState: Core.normalizeState, nowIso: () => stamp, flushTextSave() {},
    deleteLifecycle: { hold: async () => ({}), retire() {}, resume: async () => {} },
    openConfirm: config => { ctx.confirm = config; ctx.modalState = { type: 'confirm', ...config }; },
    renderModal() {}, render() { ctx.rendered = (ctx.rendered || 0) + 1; }, renderToast() {}, location: { hash: '#settings' },
    setToastMessage: message => { ctx.toasts.push(message); }, setUndo() {}, refreshHabitMetrics: async () => {}, $: selector => inputs[selector] || null,
    loadArchive: async () => {}, // R103: the archive reloads after a commit or rollback (none here)
    forgetSyncShadow() {}, journalCipherStored: () => null, deviceJournalKey: async () => null,
    storeJournalKey: async (salt, key) => { ctx.storedKey = { salt, key, rendered: ctx.rendered || 0 }; },
  };
  vm.createContext(withI18n(ctx)); vm.runInContext(code, ctx);
  ctx.downloadBackup = () => 'downloaded';
  return { ctx, inputs, begin: file => ctx.beginGlobalOperation('restore', file), commit: () => ctx.commitGlobalOperation(ctx.globalOperation) };
}

async function prepared() {
  await Storage.clearAllForTests(); values.clear();
  const current = v3({ tasks: [{ id: 'mine', title: 'Na uređaju' }] });
  localStorage.setItem('todoAppData', JSON.stringify(current));
  const { blob, cipher } = await sealedBackup();
  const app = restoreApp(current);
  await app.begin(blob);
  assert.ok(app.ctx.confirm, app.ctx.toasts.join(' | '));
  assert.equal(app.ctx.confirm.journalPassword, true);
  app.inputs['#global-confirm-phrase'].value = 'VRATI';
  return { app, cipher };
}
const taskTitles = app => app.ctx.state.tasks.map(task => task.title);

test('a wrong journal password keeps the window and the data; the right one restores the journal and stores the key after the redraw', async () => {
  const { app, cipher } = await prepared();
  const op = app.ctx.globalOperation;
  app.inputs['#global-confirm-journal-password'].value = 'pogresna lozinka 1';
  await app.commit();
  assert.ok(app.ctx.toasts.includes('The journal password is wrong.'));
  assert.equal(app.ctx.globalOperation, op, 'the restore is still waiting for confirmation');
  assert.deepEqual(taskTitles(app), ['Na uređaju']);
  app.inputs['#global-confirm-journal-password'].value = 'lozinka dnevnika 7';
  await app.commit();
  assert.deepEqual(taskTitles(app), ['Iz kopije']);
  assert.deepEqual(app.ctx.state.journal.map(entry => entry.text), ['Tajna misao']);
  assert.equal(app.ctx.storedKey.salt, cipher.salt);
  assert.ok(app.ctx.storedKey.rendered > 0, 'the key is stored after the screen is redrawn');
  assert.ok(app.ctx.toasts.includes('Checking the journal password…'));
});

test('without a password everything but the journal is restored, and no key is stored', async () => {
  const { app } = await prepared();
  await app.commit();
  assert.deepEqual(taskTitles(app), ['Iz kopije']);
  assert.deepEqual(app.ctx.state.journal, []);
  assert.equal(app.ctx.storedKey, undefined);
  assert.ok(app.ctx.toasts.includes('Backup restored without the encrypted journal.'));
});

test('Otkaži while the password is checked cancels the restore once the check ends; nothing is replaced', async () => {
  const { app } = await prepared();
  const op = app.ctx.globalOperation;
  app.inputs['#global-confirm-journal-password'].value = 'lozinka dnevnika 7';
  const committing = app.commit();
  await app.ctx.abandonGlobalOperation(op);
  await committing;
  assert.deepEqual(taskTitles(app), ['Na uređaju'], 'the data on the device stays');
  assert.equal(app.ctx.globalOperation, null);
  assert.equal(app.ctx.storedKey, undefined);
  assert.ok(app.ctx.toasts.some(text => /canceled|Otkazano/i.test(text)), app.ctx.toasts.join(' | '));
});

test('the key is stored only while the restored state has its cipher', () => {
  const commit = functionSource('commitGlobalOperation').source;
  assert.match(commit, /globalOperation = phaseError \? op : null; renderModal\(\); location\.hash = '#today'; render\(\);\n\s+if \(op\.journalKey && state\.settings\?\.journalCipher\) await storeJournalKey\(state\.settings\.journalCipher\.salt, op\.journalKey\);/);
  assert.match(read('js/i18n-sr.js'), /"Checking the journal password…": "Proveravam lozinku dnevnika…",/);
});

test('R78 shipped as 2.0.0-alpha.105 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 105) >= 105);
});
