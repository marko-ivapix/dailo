const test = require('node:test');
const assert = require('node:assert/strict');

const Core = global.TodoCore = require('../js/core.js');
global.__TODO_TEST_MEMORY_DB__ = true;
const Storage = require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');

function v16State() {
  return Core.normalizeState({
    version: 3,
    settings: { todayFocusFilter: 'open', todayFocusStrip: false, compactDensity: false, weekStartsOn: 0 },
    tasks: [{ id: 'task', title: 'Plan', plannedDate: '2026-09-17', plannedTime: '09:00', dueDate: '2026-09-17', dueTime: '17:00', attachmentIds: [] }],
    projects: [], tags: [], areas: [],
    goals: [{ id: 'goal', title: 'Ship' }],
    habits: [{ id: 'habit', name: 'Review' }],
    notes: [{ id: 'note', title: 'Research', body: 'Findings', createdAt: '2026-09-17T10:00:00.000Z', updatedAt: '2026-09-17T10:00:00.000Z', linkUrls: [], tagIds: [], attachmentIds: [] }],
    resources: [{ id: 'resource', title: 'Guide', description: 'Reference', createdAt: '2026-09-17T10:00:00.000Z', updatedAt: '2026-09-17T10:00:00.000Z', linkUrls: [], tagIds: [], attachmentIds: [], relatedTaskIds: [], relatedProjectIds: [], relatedGoalIds: [], relatedHabitIds: [] }],
    templates: [], savedViews: [], ui: {},
  });
}

test('v1.6 backup round trip includes preferences, time fields, knowledge records, and progress history', async () => {
  const payload = await Backup.exportBackupV3(v16State(), {
    attachments: { getMany: async () => [] },
    habitLogs: { listAll: async () => [{ id: 'log', habitId: 'habit', date: '2026-09-17', status: 'done', value: null }] },
    goalHistory: { listAll: async () => [{ id: 'history', goalId: 'goal', type: 'created', data: {}, createdAt: '2026-09-17T10:00:00.000Z' }] },
  }, '2026-09-17T10:00:00.000Z');

  const restored = await Backup.inspectBackupV3(payload);

  assert.equal(restored.state.settings.todayFocusFilter, 'open');
  assert.equal(restored.state.settings.compactDensity, false);
  assert.equal(restored.state.tasks[0].plannedTime, '09:00');
  assert.equal(restored.state.tasks[0].dueTime, '17:00');
  assert.deepEqual(restored.state.notes.map(item => item.id), ['note']);
  assert.deepEqual(restored.state.resources.map(item => item.id), ['resource']);
  assert.equal(restored.habitLogs[0].id, 'log');
  assert.equal(restored.goalHistory[0].id, 'history');
  assert.deepEqual(restored.summary, {
    exportedAt: '2026-09-17T10:00:00.000Z', tasks: 1, projects: 0, tags: 0, goals: 1, habits: 1,
    notes: 1, resources: 1, attachments: 0, habitLogs: 1, goalHistory: 1, totalSize: 0,
  });
});
