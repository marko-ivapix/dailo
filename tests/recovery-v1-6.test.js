const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const Core = global.TodoCore = require('../js/core.js');
global.__TODO_TEST_MEMORY_DB__ = true;
const Storage = require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');
const values = new Map();
global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };

function recoveryApp(state) {
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const code = source.slice(source.indexOf('  async function exportBackupAction('), source.indexOf('  async function enableBrowserNotifications('));
  const input = { value: '' };
  const ctx = { state, Core, TodoStorage: Storage, Backup, Attachments: {}, localStorage, STORAGE_KEY: 'todoAppData', structuredClone,
    globalOperation: null, globalRecoveryNotice: null, recovery: null, startupPromise: null, modalState: null, modalReturnFocus: null,
    undoHold: null, undoGeneration: 0, undoState: null, undoWork: new Set(),
    normalizeState: Core.normalizeState, nowIso: () => '2026-09-17T12:00:00.000Z', flushTextSave() {},
    deleteLifecycle: { hold: async () => ({}), retire() {}, resume: async () => {} },
    downloadBackup: blob => { ctx.download = blob; }, openConfirm: config => { ctx.confirm = config; },
    renderModal() {}, render() {}, renderToast() {}, location: { hash: '#today' },
    setToastMessage: message => { ctx.message = message; }, setUndo: (message, fn) => { ctx.undo = fn; },
    refreshHabitMetrics: async () => {}, $: () => input,
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  ctx.downloadBackup = blob => { ctx.download = blob; };
  return { ctx, input, begin: file => ctx.beginGlobalOperation('restore', file), commit: () => ctx.commitGlobalOperation(ctx.globalOperation) };
}

function startupRecoveryApp() {
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const load = source.slice(source.indexOf('  async function loadState('), source.indexOf('  function reportStorageFailure('));
  const status = source.slice(source.indexOf('  function compactState('), source.indexOf('  function assertGlobalSource('));
  const ctx = { state: null, Core, TodoStorage: Storage, localStorage, STORAGE_KEY: 'todoAppData',
    recovery: null, globalOperation: null, globalRecoveryNotice: null, normalizeState: Core.normalizeState,
    globalNotice(message, retry) { ctx.globalRecoveryNotice = { message, retry }; }, renderToast() {},
    console, saveState() { localStorage.setItem('todoAppData', JSON.stringify(ctx.state)); } };
  vm.createContext(ctx); vm.runInContext(`${status}\n${load}`, ctx);
  return ctx;
}

test('startup reports a retained recovery snapshot after valid state has loaded', async () => {
  await Storage.clearAllForTests(); values.clear();
  const current = Core.normalizeState({ version: 3, tasks: [{ id: 'task', title: 'Original' }], projects: [], tags: [], settings: {}, ui: {} });
  localStorage.setItem('todoAppData', JSON.stringify(current));
  await Storage.recoverySnapshots.put({ id: 'retained', reason: 'restore', phase: 'committed' });
  const app = startupRecoveryApp();

  const raw = await app.loadState();

  assert.equal(app.recovery, null);
  assert.equal(app.state.settings.backupStatus.snapshotAvailable, true);
  assert.equal(JSON.parse(localStorage.getItem('todoAppData')).settings.backupStatus.snapshotAvailable, true);
  assert.equal(raw, localStorage.getItem('todoAppData'), 'startup returns the persisted source including its status');
  await app.globalRecoveryNotice.retry();
  assert.equal(app.state.settings.backupStatus.snapshotAvailable, false);
  assert.equal((await Storage.recoverySnapshots.listAll()).length, 0);
});

test('startup recovery cleanup never overwrites a newer workspace written during deletion', async () => {
  await Storage.clearAllForTests(); values.clear();
  const current = Core.normalizeState({ version: 3, tasks: [{ id: 'task', title: 'Original' }], projects: [], tags: [], settings: {}, ui: {} });
  localStorage.setItem('todoAppData', JSON.stringify(current));
  await Storage.recoverySnapshots.put({ id: 'retained', reason: 'reset', phase: 'committed' });
  const app = startupRecoveryApp();
  await app.loadState();
  const newer = structuredClone(current); newer.tasks[0].title = 'NEWER DURING STARTUP CLEANUP';
  const newerRaw = JSON.stringify(newer);
  const remove = Storage.recoverySnapshots.deleteMany;
  Storage.recoverySnapshots.deleteMany = async ids => { await remove(ids); localStorage.setItem('todoAppData', newerRaw); };
  try { await app.globalRecoveryNotice.retry(); } finally { Storage.recoverySnapshots.deleteMany = remove; }

  assert.equal(localStorage.getItem('todoAppData'), newerRaw);
  assert.equal((await Storage.recoverySnapshots.listAll()).length, 0);
});

test('startup recovery cleanup clears its status after a saved workspace edit', async () => {
  await Storage.clearAllForTests(); values.clear();
  const current = Core.normalizeState({ version: 3, tasks: [{ id: 'task', title: 'Original' }], projects: [], tags: [], settings: {}, ui: {} });
  localStorage.setItem('todoAppData', JSON.stringify(current));
  await Storage.recoverySnapshots.put({ id: 'retained', reason: 'restore', phase: 'committed' });
  const app = startupRecoveryApp();
  await app.loadState();

  app.state.tasks[0].title = 'Edited after startup';
  app.saveState();
  await app.globalRecoveryNotice.retry();

  const saved = JSON.parse(localStorage.getItem('todoAppData'));
  assert.equal(saved.tasks[0].title, 'Edited after startup');
  assert.equal(saved.settings.backupStatus.snapshotAvailable, false);
  assert.equal(app.state.settings.backupStatus.snapshotAvailable, false);
  assert.equal((await Storage.recoverySnapshots.listAll()).length, 0);
});

test('live restore confirmation lists V1.6 counts and keeps typed RESTORE safety copies through rollback', async () => {
  await Storage.clearAllForTests(); values.clear();
  const current = Core.normalizeState({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {} });
  localStorage.setItem('todoAppData', JSON.stringify(current));
  const imported = Core.normalizeState({ version: 3, tasks: [{ id: 'task', title: 'Plan', plannedTime: '09:00' }], projects: [{ id: 'project', name: 'Project' }], tags: [], areas: [], goals: [{ id: 'goal', title: 'Goal' }], habits: [{ id: 'habit', name: 'Habit' }], notes: [{ id: 'note', title: 'Note', body: 'Body', createdAt: '2026-09-17T10:00:00.000Z', updatedAt: '2026-09-17T10:00:00.000Z', linkUrls: [], tagIds: [], attachmentIds: [] }], resources: [{ id: 'resource', title: 'Resource', description: 'Description', createdAt: '2026-09-17T10:00:00.000Z', updatedAt: '2026-09-17T10:00:00.000Z', linkUrls: [], tagIds: [], attachmentIds: [], relatedTaskIds: [], relatedProjectIds: [], relatedGoalIds: [], relatedHabitIds: [] }], templates: [], savedViews: [], settings: {}, ui: {} });
  const payload = await Backup.exportBackupV3(imported, { attachments: { getMany: async () => [] }, habitLogs: { listAll: async () => [{ id: 'log', habitId: 'habit', date: '2026-09-17', status: 'done', value: null }] }, goalHistory: { listAll: async () => [{ id: 'history', goalId: 'goal', type: 'created', data: {}, createdAt: '2026-09-17T10:00:00.000Z' }] } }, '2026-09-17T10:00:00.000Z');
  const app = recoveryApp(current);

  await app.begin(payload);
  assert.ok(app.ctx.confirm, app.ctx.message);
  assert.equal(app.ctx.confirm.phrase, 'RESTORE');
  for (const value of ['1 tasks', '1 projects', '1 Goals', '1 Habits', '1 Notes', '1 Resources', '1 logs', '1 history events']) assert.match(app.ctx.confirm.message, new RegExp(value));
  assert.ok(app.ctx.download);
  assert.equal((await Storage.recoverySnapshots.listAll()).length, 1);
  assert.equal(app.ctx.state.settings.backupStatus.snapshotAvailable, true);
  assert.equal(app.ctx.state.settings.backupStatus.validationResult, 'Backup validated and recovery copy ready');
  await app.commit();
  assert.equal(app.ctx.state.tasks.length, 0, 'missing typed confirmation must not replace data');
  const replace = Storage.replaceAllValidatedBackup;
  Storage.replaceAllValidatedBackup = async (_validated, _original, guard) => { guard.onCommit(); throw new Error('injected replacement failure'); };
  app.input.value = 'RESTORE';
  try { await app.commit(); } finally { Storage.replaceAllValidatedBackup = replace; }
  assert.equal(app.ctx.state.tasks.length, 0, 'rollback must retain the original state');
  assert.equal(app.ctx.state.settings.backupStatus.snapshotAvailable, false);
  assert.equal(app.ctx.state.settings.backupStatus.validationResult, 'Import failed; original data restored and verified');
});

test('cancelled restore keeps recovery status available until cleanup retry succeeds', async () => {
  await Storage.clearAllForTests(); values.clear();
  const current = Core.normalizeState({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {} });
  localStorage.setItem('todoAppData', JSON.stringify(current));
  const payload = await Backup.exportBackupV3(current, { attachments: { getMany: async () => [] }, habitLogs: { listAll: async () => [] }, goalHistory: { listAll: async () => [] } }, '2026-09-17T10:00:00.000Z');
  const app = recoveryApp(current);
  await app.begin(payload);
  const remove = Storage.recoverySnapshots.deleteMany;
  let fail = true;
  Storage.recoverySnapshots.deleteMany = async ids => { if (fail) throw new Error('cleanup denied'); return remove(ids); };
  try {
    await app.ctx.confirm.onCancel();
    assert.equal(app.ctx.state.settings.backupStatus.snapshotAvailable, true);
    assert.match(app.ctx.state.settings.backupStatus.validationResult, /retained/i);
    fail = false;
    await app.ctx.globalRecoveryNotice.retry();
  } finally { Storage.recoverySnapshots.deleteMany = remove; }
  assert.equal(app.ctx.state.settings.backupStatus.snapshotAvailable, false);
  assert.match(app.ctx.state.settings.backupStatus.validationResult, /canceled.*removed/i);
  assert.equal((await Storage.recoverySnapshots.listAll()).length, 0);
});

test('aborted restore preparation never overwrites a newer local workspace while recording status', async () => {
  await Storage.clearAllForTests(); values.clear();
  const current = Core.normalizeState({ version: 3, tasks: [{ id: 'task', title: 'Original' }], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {} });
  localStorage.setItem('todoAppData', JSON.stringify(current));
  const payload = await Backup.exportBackupV3(current, { attachments: { getMany: async () => [] }, habitLogs: { listAll: async () => [] }, goalHistory: { listAll: async () => [] } }, '2026-09-17T10:00:00.000Z');
  const app = recoveryApp(current);
  const capture = Storage.captureUserData;
  const newer = structuredClone(current);
  newer.tasks[0].title = 'Newer task from another tab';
  const newerRaw = JSON.stringify(newer);
  let injected = false;
  Storage.captureUserData = async () => {
    const captured = await capture();
    if (!injected) { injected = true; localStorage.setItem('todoAppData', newerRaw); }
    return captured;
  };
  try { await app.begin(payload); } finally { Storage.captureUserData = capture; }
  assert.equal(localStorage.getItem('todoAppData'), newerRaw);
  assert.equal(JSON.parse(localStorage.getItem('todoAppData')).tasks[0].title, 'Newer task from another tab');
  assert.match(app.ctx.message, /Nothing was replaced/);
});

test('invalid restore preparation keeps a physically retained recovery snapshot marked available', async () => {
  await Storage.clearAllForTests(); values.clear();
  const current = Core.normalizeState({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {} });
  localStorage.setItem('todoAppData', JSON.stringify(current));
  const app = recoveryApp(current);
  const remove = Storage.recoverySnapshots.deleteMany;
  Storage.recoverySnapshots.deleteMany = async () => { throw new Error('cleanup denied'); };
  try { await app.begin(new Blob(['not a backup'])); } finally { Storage.recoverySnapshots.deleteMany = remove; }
  assert.equal((await Storage.recoverySnapshots.listAll()).length, 1);
  assert.equal(app.ctx.state.settings.backupStatus.snapshotAvailable, true);
  assert.match(app.ctx.state.settings.backupStatus.validationResult, /retained/i);
  assert.match(app.ctx.globalRecoveryNotice.message, /cleanup/i);
});

test('export status never overwrites a newer local workspace', async () => {
  await Storage.clearAllForTests(); values.clear();
  const current = Core.normalizeState({ version: 3, tasks: [{ id: 'task', title: 'Original' }], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {} });
  localStorage.setItem('todoAppData', JSON.stringify(current));
  const app = recoveryApp(current);
  const exportBackup = Backup.exportBackupV3;
  const newer = structuredClone(current);
  newer.tasks[0].title = 'NEWER DURING EXPORT';
  const newerRaw = JSON.stringify(newer);
  Backup.exportBackupV3 = async () => { localStorage.setItem('todoAppData', newerRaw); return new Blob(['backup']); };
  try { await app.ctx.exportBackupAction(); } finally { Backup.exportBackupV3 = exportBackup; }
  assert.equal(localStorage.getItem('todoAppData'), newerRaw);
  assert.equal(JSON.parse(localStorage.getItem('todoAppData')).tasks[0].title, 'NEWER DURING EXPORT');
});

test('export keeps a retained recovery snapshot available after both success and failure', async () => {
  await Storage.clearAllForTests(); values.clear();
  const current = Core.normalizeState({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {} });
  localStorage.setItem('todoAppData', JSON.stringify(current));
  const payload = await Backup.exportBackupV3(current, { attachments: { getMany: async () => [] }, habitLogs: { listAll: async () => [] }, goalHistory: { listAll: async () => [] } }, '2026-09-17T10:00:00.000Z');
  const app = recoveryApp(current);
  const remove = Storage.recoverySnapshots.deleteMany;
  Storage.recoverySnapshots.deleteMany = async () => { throw new Error('cleanup denied'); };
  try { await app.begin(payload); await app.ctx.confirm.onCancel(); } finally { Storage.recoverySnapshots.deleteMany = remove; }
  await app.ctx.exportBackupAction();
  assert.equal(app.ctx.state.settings.backupStatus.snapshotAvailable, true);
  const exportBackup = Backup.exportBackupV3;
  Backup.exportBackupV3 = async () => { throw new Error('export denied'); };
  try { await app.ctx.exportBackupAction(); } finally { Backup.exportBackupV3 = exportBackup; }
  assert.equal(app.ctx.state.settings.backupStatus.snapshotAvailable, true);
  assert.equal((await Storage.recoverySnapshots.listAll()).length, 1);
});

test('rollback status never overwrites a newer workspace written during Undo resume', async () => {
  await Storage.clearAllForTests(); values.clear();
  const current = Core.normalizeState({ version: 3, tasks: [{ id: 'task', title: 'Original' }], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {} });
  localStorage.setItem('todoAppData', JSON.stringify(current));
  const payload = await Backup.exportBackupV3(current, { attachments: { getMany: async () => [] }, habitLogs: { listAll: async () => [] }, goalHistory: { listAll: async () => [] } }, '2026-09-17T10:00:00.000Z');
  const app = recoveryApp(current);
  await app.begin(payload);
  const replace = Storage.replaceAllValidatedBackup;
  const resume = app.ctx.deleteLifecycle.resume;
  const newer = structuredClone(current);
  newer.tasks[0].title = 'NEWER DURING ROLLBACK';
  const newerRaw = JSON.stringify(newer);
  Storage.replaceAllValidatedBackup = async (_validated, _original, guard) => { guard.onCommit(); throw new Error('replacement denied'); };
  app.ctx.deleteLifecycle.resume = async () => { localStorage.setItem('todoAppData', newerRaw); };
  app.input.value = 'RESTORE';
  try { await app.commit(); } finally { Storage.replaceAllValidatedBackup = replace; app.ctx.deleteLifecycle.resume = resume; }
  assert.equal(localStorage.getItem('todoAppData'), newerRaw);
  assert.equal(JSON.parse(localStorage.getItem('todoAppData')).tasks[0].title, 'NEWER DURING ROLLBACK');
});

test('failed restore rolls V1.6 data back without leaving partial metadata or history', async () => {
  await Storage.clearAllForTests();
  const original = Core.normalizeState({ version: 3, settings: { todayFocusFilter: 'open' }, tasks: [{ id: 'task', title: 'Original', plannedTime: '09:00' }], projects: [], tags: [], areas: [], goals: [{ id: 'goal', title: 'Goal' }], habits: [{ id: 'habit', name: 'Habit' }], notes: [{ id: 'note', title: 'Note', body: 'Before', createdAt: '2026-09-17T10:00:00.000Z', updatedAt: '2026-09-17T10:00:00.000Z', linkUrls: [], tagIds: [], attachmentIds: [] }], resources: [], templates: [], savedViews: [], ui: {} });
  const replacement = structuredClone(original);
  replacement.settings.todayFocusFilter = 'completed'; replacement.tasks[0].title = 'Replacement'; replacement.tasks[0].plannedTime = '10:00'; replacement.notes[0].body = 'After';
  const logs = [{ id: 'log', habitId: 'habit', date: '2026-09-17', status: 'done', value: null }];
  const history = [{ id: 'history', goalId: 'goal', type: 'created', data: {}, createdAt: '2026-09-17T10:00:00.000Z' }];
  await Storage.habitLogs.put(logs[0]); await Storage.goalHistory.put(history[0]);
  let stored = structuredClone(original);

  await assert.rejects(() => Backup.restoreBackup({ state: replacement, attachmentRecords: [], habitLogs: [], goalHistory: [] }, {
    attachmentApi: { listAll: async () => [], replaceAll: async () => {} },
    readState: async () => stored,
    writeState: async next => { if (next.tasks[0].title !== 'Original') throw new Error('injected write failure'); stored = structuredClone(next); },
  }), /injected write failure/);

  assert.equal(stored.settings.todayFocusFilter, 'open');
  assert.equal(stored.tasks[0].plannedTime, '09:00');
  assert.equal(stored.notes[0].body, 'Before');
  assert.deepEqual(await Storage.habitLogs.listAll(), logs);
  assert.deepEqual(await Storage.goalHistory.listAll(), history);
});
