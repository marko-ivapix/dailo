const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const Core = global.TodoCore = require('../js/core.js');
global.__TODO_TEST_MEMORY_DB__ = true;
const Storage = require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');

function renderImportSummary(summary) {
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const start = source.indexOf('  function renderImportBackupModal()');
  const end = source.indexOf('  function renderConfirmModal()', start);
  const sandbox = {
    modalState: { validated: { summary } },
    esc: value => String(value), formatBytes: value => `${value} B`, modalFrame: body => body, Intl,
  };
  vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.renderImportSummary = renderImportBackupModal;`, sandbox);
  return sandbox.renderImportSummary();
}

test('restore dialog summarizes V1.6 knowledge and progress data before typed RESTORE', () => {
  const dialog = renderImportSummary({
    exportedAt: '2026-09-17T10:00:00.000Z', tasks: 1, projects: 0, tags: 0, goals: 1, habits: 1,
    notes: 1, resources: 1, attachments: 2, habitLogs: 3, goalHistory: 4, totalSize: 12,
  });

  for (const label of ['Goals', 'Habits', 'Notes', 'Resources', 'Habit logs', 'Goal history']) assert.match(dialog, new RegExp(label));
  assert.match(dialog, /Restore backup/);
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
