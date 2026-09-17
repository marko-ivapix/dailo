const test = require('node:test');
const assert = require('node:assert/strict');

global.__TODO_TEST_MEMORY_DB__ = true;
global.TodoCore = require('../js/core.js');
const Storage = require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');

function stateWithV15Fields() {
  const state = global.TodoCore.migrateStateV3({ version: 2, tasks: [{ id: 'task', title: 'Task' }], projects: [], tags: [], settings: {}, ui: {} }).state;
  state.tasks[0].durationMinutes = 45;
  state.settings.focusTaskIds = ['task'];
  state.settings.dashboard = { focusedMode: true, sectionOrder: ['focus'], pinnedSectionIds: ['focus'] };
  state.goals = [{ id: 'goal', title: 'Goal', currentValue: 4, targetValue: 10, unit: 'km' }];
  state.habits = [{ id: 'habit', name: 'Habit', minimumTarget: 2, idealTarget: 4, graceDays: 1 }];
  state.resources = [{ id: 'resource', title: 'Resource', description: '', areaId: null, tagIds: [], linkUrls: [], attachmentIds: [], relatedTaskIds: [], relatedProjectIds: [], relatedGoalIds: [], relatedHabitIds: [], createdAt: '', updatedAt: '', type: 'book', status: 'reading', author: 'Author', favorite: true, reviewedAt: '2026-09-17', clip: 'Excerpt' }];
  return state;
}

test('V1.5 metadata survives backup validation and ZIP import', async () => {
  await Storage.clearAllForTests();
  const state = stateWithV15Fields();
  const zip = await Backup.exportBackupV3(state, Storage, '2026-09-17T12:00:00Z');
  const restored = await Backup.inspectBackupV3(zip);
  assert.equal(restored.state.tasks[0].durationMinutes, 45);
  assert.deepEqual(restored.state.settings.focusTaskIds, ['task']);
  assert.equal(restored.state.goals[0].unit, 'km');
  assert.equal(restored.state.habits[0].idealTarget, 4);
  assert.equal(restored.state.resources[0].status, 'reading');
});

test('storage exposes the shared safe state normalizer to persistence callers', () => {
  const state = global.TodoCore.migrateStateV3({ version: 2, tasks: [{ id: 'task', title: 'Task' }], projects: [], tags: [], settings: {}, ui: {} }).state;
  assert.equal(typeof Storage.normalizeState, 'function');
  assert.deepEqual(Storage.normalizeState(state).settings.focusTaskIds, []);
});

test('backup validation rejects malformed V1.5 metadata', () => {
  const state = stateWithV15Fields();
  state.tasks[0].durationMinutes = -1;
  assert.throws(() => Backup.validateDomain(state, [], []), /durationMinutes/);
});
