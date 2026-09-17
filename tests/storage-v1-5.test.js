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
  for (const field of ['type', 'status', 'author', 'favorite', 'reviewedAt', 'clip']) assert.equal(restored.state.resources[0][field], state.resources[0][field]);
});

test('storage exposes the shared safe state normalizer to persistence callers', () => {
  const state = global.TodoCore.migrateStateV3({ version: 2, tasks: [{ id: 'task', title: 'Task' }], projects: [], tags: [], settings: {}, ui: {} }).state;
  assert.equal(typeof Storage.normalizeState, 'function');
  assert.deepEqual(Storage.normalizeState(state).settings.focusTaskIds, []);
});

test('template variables and dashboard preferences survive normalized persistence', () => {
  const state = stateWithV15Fields();
  state.templates = [{ id: 'template', name: 'Daily', type: 'task', data: { title: 'Plan {{date}}', notes: 'Tomorrow: {{tomorrow}}', scheduleEnabled: true, scheduleDate: '2026-09-18' } }];
  const normalized = Storage.normalizeState(state);
  const made = global.TodoCore.instantiateTemplate(normalized.templates[0], '2026-09-17', { state: normalized, makeId: prefix => `${prefix}_id`, nowIso: '2026-09-17T00:00:00.000Z' });
  assert.equal(made.task.title, 'Plan 2026-09-17');
  assert.equal(made.task.notes, 'Tomorrow: 2026-09-18');
  assert.deepEqual(normalized.settings.dashboard, { focusedMode: true, sectionOrder: ['focus'], pinnedSectionIds: ['focus'] });
});

test('normalization reconciles inverted Habit targets before backup validation', () => {
  const state = stateWithV15Fields();
  state.habits[0].minimumTarget = 4;
  state.habits[0].idealTarget = 2;
  const normalized = global.TodoCore.normalizeState(state);
  assert.equal(normalized.habits[0].minimumTarget, 4);
  assert.equal(normalized.habits[0].idealTarget, 4);
  assert.doesNotThrow(() => Backup.validateDomain(normalized, [], []));
});

test('backup validation rejects malformed V1.5 metadata', () => {
  const state = stateWithV15Fields();
  state.tasks[0].durationMinutes = -1;
  assert.throws(() => Backup.validateDomain(state, [], []), /durationMinutes/);
});

test('Old knowledge records receive safe defaults and Note clips/favorites round-trip separately', async () => {
  await Storage.clearAllForTests();
  const state = stateWithV15Fields();
  state.notes = [{ id: 'note', title: 'Note', body: 'Body', areaId: null, tagIds: [], linkUrls: [], attachmentIds: [], createdAt: '', updatedAt: '' }];
  for (const key of ['type', 'status', 'author', 'favorite', 'reviewedAt', 'clip']) delete state.resources[0][key];
  const normalized = global.TodoCore.normalizeState(state);
  assert.equal(normalized.notes[0].favorite, false); assert.equal(normalized.notes[0].clip, '');
  assert.equal(normalized.resources[0].type, 'article'); assert.equal(normalized.resources[0].status, 'unread');
  assert.equal(normalized.resources[0].author, ''); assert.equal(normalized.resources[0].reviewedAt, null);
  normalized.notes[0].favorite = true; normalized.notes[0].clip = 'Note excerpt';
  normalized.notes[0].attachmentIds = ['note-file']; normalized.resources[0].attachmentIds = ['resource-file'];
  for (const [id, ownerType, ownerId] of [['note-file', 'note', 'note'], ['resource-file', 'resource', 'resource']]) {
    await Storage.attachments.put({ id, ownerType, ownerId, fileName: id + '.txt', mimeType: 'text/plain', size: 4, blob: new Blob(['text'], { type: 'text/plain' }), pendingDeleteUntil: null });
  }
  const zip = await Backup.exportBackupV3(normalized, Storage, '2026-09-17T12:00:00Z');
  const restored = await Backup.inspectBackupV3(zip);
  assert.equal(restored.state.notes[0].clip, 'Note excerpt'); assert.equal(restored.state.notes[0].favorite, true);
  assert.equal(restored.state.resources[0].clip, ''); assert.equal(restored.state.resources[0].favorite, false);
  assert.deepEqual(restored.state.notes[0].attachmentIds, ['note-file']);
  assert.deepEqual(restored.state.resources[0].attachmentIds, ['resource-file']);
  for (const record of restored.attachmentRecords) {
    assert.equal(record.ownerId, record.ownerType); assert.equal(await record.blob.text(), 'text');
  }
  for (const [key, value] of [['clip', 4], ['favorite', 'yes']]) {
    const invalid = JSON.parse(JSON.stringify(normalized)); invalid.notes[0][key] = value;
    assert.throws(() => Backup.validateDomain(invalid, [], []), new RegExp(key));
  }
});

test('Fractional numeric Habit targets survive ZIP round-trip and count targets stay whole', async () => {
  await Storage.clearAllForTests();
  const state = stateWithV15Fields();
  Object.assign(state.habits[0], { trackingType: 'numeric', frequencyType: 'daily', targetValue: 2, minimumTarget: 0.5, idealTarget: 1 });
  assert.doesNotThrow(() => Backup.validateDomain(state, [], []));
  const zip = await Backup.exportBackupV3(state, Storage, '2026-09-17T12:00:00Z');
  const restored = await Backup.inspectBackupV3(zip);
  assert.equal(restored.state.habits[0].minimumTarget, 0.5);
  assert.equal(restored.state.habits[0].idealTarget, 1);
  for (const mode of [{ trackingType: 'checkbox', frequencyType: 'daily' }, { trackingType: 'numeric', frequencyType: 'timesPerWeek', timesPerWeek: 2 }]) {
    Object.assign(state.habits[0], mode);
    assert.throws(() => Backup.validateDomain(state, [], []), /minimumTarget/);
  }
  Object.assign(state.habits[0], { trackingType: 'numeric', frequencyType: 'daily' });
  for (const invalid of [0, -0.5, Infinity, '0.5']) {
    state.habits[0].minimumTarget = invalid;
    assert.throws(() => Backup.validateDomain(state, [], []), /minimumTarget/);
  }
});
