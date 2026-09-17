const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
global.__TODO_TEST_MEMORY_DB__ = true;
const Core = global.TodoCore = require('../js/core.js');
const Storage = require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');
const values = new Map();
global.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };

function fixture() {
  return Core.normalizeState({ version: 3, tasks: [{ id: 'task', title: 'Original', attachmentIds: ['file'] }, { id: 'other', title: 'Unrelated' }], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {} });
}
async function seed() {
  await Storage.clearAllForTests(); values.clear();
  const state = fixture();
  localStorage.setItem('todoAppData', JSON.stringify(state));
  await Storage.attachments.put({ id: 'file', taskId: 'task', fileName: 'file.txt', mimeType: 'text/plain', size: 3, blob: new Blob(['old'], { type: 'text/plain' }), pendingDeleteUntil: null });
  return state;
}

function appRecovery(state) {
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const code = source.slice(source.indexOf('  function compactState('), source.indexOf('  async function enableBrowserNotifications('));
  const input = { value: '' };
  const ctx = { state, Core, TodoStorage: Storage, Backup, localStorage, STORAGE_KEY: 'todoAppData', structuredClone,
    globalOperation: null, globalRecoveryNotice: null, recovery: null, startupPromise: null, modalState: null, modalReturnFocus: null,
    normalizeState: Core.normalizeState, nowIso: () => '2026-09-17T12:00:00Z', flushTextSave() {},
    deleteLifecycle: { hold: async () => ({}), retire() {}, resume: async () => {} },
    downloadBackup: blob => { ctx.download = blob; }, openConfirm: config => { ctx.confirm = config; },
    renderModal() {}, render() {}, renderToast() {}, location: { hash: '#today' },
    setToastMessage: message => { ctx.message = message; }, setUndo: (message, fn) => { ctx.undo = fn; },
    refreshHabitMetrics: async () => {}, $: () => input,
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { ctx, input, begin: selection => ctx.beginGlobalOperation('restore', null, selection), commit: () => ctx.commitGlobalOperation(ctx.globalOperation) };
}

test('Automatic snapshots retain five latest copies without pruning operation recovery', async () => {
  const state = await seed();
  state.habits = [{ id: 'habit', name: 'Habit' }]; state.goals = [{ id: 'goal', title: 'Goal' }];
  await Storage.habitLogs.put({ id: 'log', habitId: 'habit', date: '2026-09-17', status: 'done', value: null });
  await Storage.goalHistory.put({ id: 'event', goalId: 'goal', type: 'created', data: {}, createdAt: '2026-09-17T12:00:00Z' });
  await Storage.recoverySnapshots.put({ id: 'keep-recovery', reason: 'restore', phase: 'rollback-failed', createdAt: '2026-01-01' });
  for (let index = 0; index < 7; index++) {
    state.tasks[0].title = `Version ${index}`;
    localStorage.setItem('todoAppData', JSON.stringify(state));
    await Storage.createAutomaticSnapshot(state, new Date(Date.UTC(2026, 8, 17, 12, index * 6)));
  }
  const snapshots = await Storage.recoverySnapshots.listAll();
  assert.equal(snapshots.length, 6);
  const automatic = snapshots.filter(item => item.reason === 'automatic').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  assert.equal(automatic[0].appData.tasks[0].title, 'Version 2');
  assert.equal(automatic[4].appData.tasks[0].title, 'Version 6');
  assert.equal(await automatic[0].attachments[0].blob.text(), 'old');
  assert.equal(automatic[0].habitLogs[0].id, 'log'); assert.equal(automatic[0].goalHistory[0].id, 'event');
  assert.ok(snapshots.some(item => item.id === 'keep-recovery'));
  assert.equal(await Storage.createAutomaticSnapshot(state, new Date('2026-09-17T12:37:00Z')), null, 'debounced within five minutes');
});

test('Selective Task restore changes one entity and its owned file while preserving unrelated edits', async () => {
  const state = await seed();
  const snapshot = { appData: structuredClone(state), ...(await Storage.captureUserData()) };
  state.tasks[0].title = 'Newer'; state.tasks[1].title = 'Keep newer unrelated edit';
  const currentFiles = await Storage.attachments.listAll(); currentFiles[0].blob = new Blob(['new'], { type: 'text/plain' });
  const current = { state, attachmentRecords: currentFiles, habitLogs: [], goalHistory: [] };
  const candidate = Backup.prepareSelectiveRestore(current, snapshot, 'tasks', 'task');
  assert.equal(candidate.state.tasks[0].title, 'Original');
  assert.equal(candidate.state.tasks[1].title, 'Keep newer unrelated edit');
  assert.equal(await candidate.attachmentRecords[0].blob.text(), 'old');
  assert.equal(current.state.tasks[0].title, 'Newer');
  assert.equal(await current.attachmentRecords[0].blob.text(), 'new');
});

for (const [collection, linkField, ownerField] of [['tasks', 'taskIds', null], ['projects', 'projectLinks', 'projectId'], ['habits', 'habitLinks', 'habitId']]) {
  test(`Selective ${collection} restore reconciles Goal membership and contribution without replacing Goal metadata`, () => {
    const savedLink = collection === 'tasks' ? 'selected' : collection === 'projects'
      ? { projectId: 'selected', contributionMode: 'selectedTasks', selectedTaskIds: ['done'] }
      : { habitId: 'selected', metric: 'totalCheckins', target: 2 };
    const unrelatedLink = collection === 'tasks' ? 'other' : collection === 'projects'
      ? { projectId: 'other', contributionMode: 'allTasks', selectedTaskIds: [] }
      : { habitId: 'other', metric: 'totalCheckins', target: 1 };
    const source = fixture(); source.tasks = [];
    source[collection] = [{ id: 'selected', title: 'Selected', name: 'Selected', goalIds: ['saved'], isCompleted: true }, { id: 'other', title: 'Other', name: 'Other', goalIds: ['saved'] }];
    if (collection === 'projects') source.tasks = [{ id: 'done', title: 'Done', projectId: 'selected', isCompleted: true }, { id: 'open', title: 'Open', projectId: 'selected' }, { id: 'unrelated', title: 'Other', projectId: 'other' }];
    source.goals = ['saved', 'newer'].map(id => ({ id, title: id, progressMode: collection === 'habits' ? 'linkedHabits' : 'linkedTasks', [linkField]: id === 'saved' ? [savedLink, unrelatedLink] : [] }));
    const appData = Core.normalizeState(source);
    const logs = collection === 'habits' ? [{ id: 'checkin', habitId: 'selected', date: '2026-09-17', status: 'done', value: null }] : [];
    const snapshot = { appData, attachments: [], habitLogs: logs, goalHistory: [] };
    const state = structuredClone(appData);
    state[collection][0].goalIds = ['newer'];
    state.goals[0][linkField] = [unrelatedLink]; state.goals[1][linkField] = [savedLink];
    state.goals[0].title = 'Keep current title'; state.goals[0].targetValue = 73;
    const current = { state, attachmentRecords: [], habitLogs: [], goalHistory: [] };
    const before = structuredClone(current);
    const candidate = Backup.prepareSelectiveRestore(current, snapshot, collection, 'selected');
    assert.deepEqual(candidate.state[collection][0].goalIds, ['saved']);
    assert.deepEqual(candidate.state.goals[0][linkField], [unrelatedLink, savedLink]);
    assert.deepEqual(candidate.state.goals[1][linkField], []);
    for (let i = 0; i < state.goals.length; i++) {
      const { [linkField]: ignoredBefore, ...beforeFields } = state.goals[i];
      const { [linkField]: ignoredAfter, ...afterFields } = candidate.state.goals[i];
      assert.deepEqual(afterFields, beforeFields);
    }
    const metrics = collection === 'habits' ? Object.fromEntries(candidate.state.habits.map(habit => [habit.id, Core.deriveHabitMetrics(habit, candidate.habitLogs.filter(log => log.habitId === habit.id), '2026-09-17')])) : {};
    assert.equal(Core.computeGoalProgress(candidate.state.goals[0], candidate.state, metrics).percent, collection === 'habits' ? 25 : 50);
    assert.equal(Core.computeGoalProgress(candidate.state.goals[1], candidate.state, metrics).percent, 0);
    assert.deepEqual(current, before, 'candidate preparation must not mutate live state');
    if (collection === 'projects') {
      const moved = structuredClone(current);
      moved.state.tasks.find(task => task.id === 'done').projectId = 'other';
      assert.throws(() => Backup.prepareSelectiveRestore(moved, snapshot, collection, 'selected'), /selected project Task/i, 'incompatible saved selection must reject instead of moving current Tasks');
    }
    if (ownerField) {
      snapshot.appData.goals[0][linkField] = [unrelatedLink];
      assert.throws(() => Backup.prepareSelectiveRestore(current, snapshot, collection, 'selected'), /reciprocal|contribution/i, 'missing saved contribution settings must reject');
    }
  });
}

test('Selective restore rejects missing dependencies and foreign file ownership before writes', async () => {
  const state = await seed();
  const snapshot = { appData: structuredClone(state), ...(await Storage.captureUserData()) };
  const current = { state, attachmentRecords: snapshot.attachments, habitLogs: [], goalHistory: [] };
  snapshot.appData.tasks[0].projectId = 'missing';
  assert.throws(() => Backup.prepareSelectiveRestore(current, snapshot, 'tasks', 'task'), /reference|project|linked/i);
  snapshot.appData.tasks[0].projectId = null;
  snapshot.attachments[0].taskId = 'other';
  assert.throws(() => Backup.prepareSelectiveRestore(current, snapshot, 'tasks', 'task'), /attachment|ownership/i);
  assert.equal(localStorage.getItem('todoAppData'), JSON.stringify(state));
});

test('Selective restore rejects malformed saved fields before normalization could hide them', async () => {
  const state = await seed();
  const snapshot = { appData: structuredClone(state), ...(await Storage.captureUserData()) };
  snapshot.appData.tasks[0].durationMinutes = -10;
  assert.throws(() => Backup.prepareSelectiveRestore({ state, attachmentRecords: snapshot.attachments, habitLogs: [], goalHistory: [] }, snapshot, 'tasks', 'task'), /durationMinutes/);
});

test('Selective Habit restore includes only its own logs and keeps unrelated histories', async () => {
  const state = await seed();
  state.habits = [{ id: 'habit', name: 'Habit', trackingType: 'checkbox' }, { id: 'other-habit', name: 'Other' }];
  const snapshot = { appData: structuredClone(state), attachments: await Storage.attachments.listAll(), habitLogs: [{ id: 'l', habitId: 'habit', date: '2026-09-16', status: 'done', value: null }], goalHistory: [] };
  const current = { state, attachmentRecords: snapshot.attachments, habitLogs: [{ id: 'l', habitId: 'habit', date: '2026-09-16', status: 'missed', value: null }, { id: 'other-log', habitId: 'other-habit', date: '2026-09-17', status: 'done', value: null }], goalHistory: [] };
  const candidate = Backup.prepareSelectiveRestore(current, snapshot, 'habits', 'habit');
  assert.equal(candidate.habitLogs.find(log => log.id === 'l').status, 'done');
  assert.deepEqual(candidate.habitLogs.find(log => log.id === 'other-log'), current.habitLogs[1]);
});

test('Selective restore downloads safety ZIP, requires RESTORE, commits and Undo recovers original bytes', async () => {
  const state = await seed();
  const snapshot = { appData: structuredClone(state), ...(await Storage.captureUserData()) };
  state.tasks[0].title = 'Current version'; state.tasks[1].title = 'Keep other edit';
  localStorage.setItem('todoAppData', JSON.stringify(state));
  const file = await Storage.attachments.get('file'); file.blob = new Blob(['new'], { type: 'text/plain' }); await Storage.attachments.put(file);
  const app = appRecovery(state);
  await app.begin({ snapshot, collection: 'tasks', id: 'task' });
  assert.equal(app.ctx.confirm.phrase, 'RESTORE');
  const safety = await Backup.inspectBackupV3(app.ctx.download);
  assert.equal(safety.state.tasks[0].title, 'Current version');
  await app.commit();
  assert.equal(JSON.parse(localStorage.getItem('todoAppData')).tasks[0].title, 'Current version');
  app.input.value = 'RESTORE'; await app.commit();
  assert.equal(app.ctx.state.tasks[0].title, 'Original');
  assert.equal(app.ctx.state.tasks[1].title, 'Keep other edit');
  assert.equal(await (await Storage.attachments.get('file')).blob.text(), 'old');
  await app.ctx.undo();
  assert.equal(app.ctx.state.tasks[0].title, 'Current version');
  assert.equal(await (await Storage.attachments.get('file')).blob.text(), 'new');
  assert.equal(app.ctx.globalOperation, null);
});

test('Selective restore rolls back metadata and native records when the commit write fails', async () => {
  const state = await seed();
  const snapshot = { appData: structuredClone(state), ...(await Storage.captureUserData()) };
  state.tasks[0].title = 'Current version'; localStorage.setItem('todoAppData', JSON.stringify(state));
  const app = appRecovery(state); await app.begin({ snapshot, collection: 'tasks', id: 'task' });
  const before = localStorage.getItem('todoAppData');
  const write = localStorage.setItem; let fail = true;
  localStorage.setItem = (key, value) => { if (fail) { fail = false; throw new Error('quota denied'); } write(key, value); };
  try { app.input.value = 'RESTORE'; await app.commit(); }
  finally { localStorage.setItem = write; }
  assert.equal(localStorage.getItem('todoAppData'), before);
  assert.equal(app.ctx.state.tasks[0].title, 'Current version');
  assert.equal(app.ctx.globalOperation, null);
  assert.match(app.ctx.message, /restored and verified/);
});

test('Selective Undo refuses later edits without overwriting them', async () => {
  const state = await seed();
  const snapshot = { appData: structuredClone(state), ...(await Storage.captureUserData()) };
  state.tasks[0].title = 'Current version'; localStorage.setItem('todoAppData', JSON.stringify(state));
  const app = appRecovery(state); await app.begin({ snapshot, collection: 'tasks', id: 'task' });
  app.input.value = 'RESTORE'; await app.commit();
  app.ctx.state.tasks[1].title = 'Later edit'; localStorage.setItem('todoAppData', JSON.stringify(app.ctx.state));
  await assert.rejects(() => app.ctx.undo(), /Data changed/);
  assert.equal(JSON.parse(localStorage.getItem('todoAppData')).tasks[1].title, 'Later edit');
  assert.equal(app.ctx.globalOperation, null);
});

test('Successful Undo remains verified when recovery-copy cleanup fails', async () => {
  const state = await seed();
  const snapshot = { appData: structuredClone(state), ...(await Storage.captureUserData()) };
  state.tasks[0].title = 'Current version'; localStorage.setItem('todoAppData', JSON.stringify(state));
  const app = appRecovery(state); await app.begin({ snapshot, collection: 'tasks', id: 'task' });
  app.input.value = 'RESTORE'; await app.commit();
  const remove = Storage.recoverySnapshots.deleteMany;
  Storage.recoverySnapshots.deleteMany = async () => { throw new Error('cleanup denied'); };
  try { await app.ctx.undo(); } finally { Storage.recoverySnapshots.deleteMany = remove; }
  assert.equal(app.ctx.state.tasks[0].title, 'Current version');
  assert.equal(app.ctx.globalOperation, null);
  assert.equal((await Storage.recoverySnapshots.listAll())[0].phase, 'rolled-back');
  assert.match(app.ctx.globalRecoveryNotice.message, /cleanup/i);
});
