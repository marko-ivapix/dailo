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
  const code = source.slice(source.indexOf('  function compactState('), source.indexOf('  async function enableBrowserNotifications('));
  const input = { value: '' };
  const ctx = { state, Core, TodoStorage: Storage, Backup, localStorage, STORAGE_KEY: 'todoAppData', structuredClone,
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
  return { ctx, input, begin: file => ctx.beginGlobalOperation('restore', file), commit: () => ctx.commitGlobalOperation(ctx.globalOperation) };
}

test('live restore confirmation lists V1.6 counts and keeps typed RESTORE safety copies through rollback', async () => {
  await Storage.clearAllForTests(); values.clear();
  const current = Core.normalizeState({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {} });
  localStorage.setItem('todoAppData', JSON.stringify(current));
  const imported = Core.normalizeState({ version: 3, tasks: [{ id: 'task', title: 'Plan', plannedTime: '09:00' }], projects: [{ id: 'project', name: 'Project' }], tags: [], areas: [], goals: [{ id: 'goal', title: 'Goal' }], habits: [{ id: 'habit', name: 'Habit' }], notes: [{ id: 'note', title: 'Note', body: 'Body', createdAt: '2026-09-17T10:00:00.000Z', updatedAt: '2026-09-17T10:00:00.000Z', linkUrls: [], tagIds: [], attachmentIds: [] }], resources: [{ id: 'resource', title: 'Resource', description: 'Description', createdAt: '2026-09-17T10:00:00.000Z', updatedAt: '2026-09-17T10:00:00.000Z', linkUrls: [], tagIds: [], attachmentIds: [], relatedTaskIds: [], relatedProjectIds: [], relatedGoalIds: [], relatedHabitIds: [] }], templates: [], savedViews: [], settings: {}, ui: {} });
  const payload = await Backup.exportBackupV3(imported, { attachments: { getMany: async () => [] }, habitLogs: { listAll: async () => [{ id: 'log', habitId: 'habit', date: '2026-09-17', status: 'done', value: null }] }, goalHistory: { listAll: async () => [{ id: 'history', goalId: 'goal', type: 'created', data: {}, createdAt: '2026-09-17T10:00:00.000Z' }] } }, '2026-09-17T10:00:00.000Z');
  const app = recoveryApp(current);

  await app.begin(payload);
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
