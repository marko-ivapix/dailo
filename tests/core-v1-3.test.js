const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');

function v2State(overrides = {}) {
  return {
    version: 2,
    tasks: [{
      id: 't1', title: 'Existing task', notes: '', projectId: 'p1',
      plannedDate: '2026-09-20', dueDate: '2026-09-21',
      tagIds: ['tag1'], priority: 'high', attachmentIds: ['att1'],
      isInbox: false, isCompleted: false, subtasks: [], createdAt: 'x', updatedAt: 'x',
    }],
    projects: [{ id: 'p1', name: 'Project', color: '#5362FF', order: 0, isArchived: false }],
    tags: [{ id: 'tag1', name: 'Client', color: '#30CBAD' }],
    settings: { weekStartsOn: 'monday' },
    ui: {},
    ...overrides,
  };
}

test('migrateStateV3 preserves v2 ids/data and adds v3 defaults', () => {
  const v2 = v2State();

  const result = Core.migrateStateV3(v2);

  assert.equal(result.ok, true);
  assert.equal(result.migrated, true);
  assert.equal(result.state.version, 3);
  assert.equal(result.state.tasks[0].id, 't1');
  assert.equal(result.state.tasks[0].attachmentIds[0], 'att1');
  assert.equal(result.state.tasks[0].areaId, null);
  assert.deepEqual(result.state.tasks[0].goalIds, []);
  assert.equal(result.state.tasks[0].plannedTime, null);
  assert.equal(result.state.tasks[0].dueTime, null);
  assert.equal(result.state.projects[0].areaId, null);
  assert.deepEqual(result.state.projects[0].goalIds, []);
  assert.deepEqual(result.state.areas, []);
  assert.deepEqual(result.state.goals, []);
  assert.deepEqual(result.state.habits, []);
  assert.deepEqual(result.state.templates, []);
  assert.deepEqual(result.state.savedViews, []);
});

test('migrateStateV3 rejects future schema versions', () => {
  assert.deepEqual(Core.migrateStateV3({ version: 99 }), { ok: false, reason: 'unsupported-version' });
});

test('migrateStateV3 rejects malformed v3 collections without resetting them', () => {
  const state = v2State({ version: 3, areas: { id: 'not-an-array' } });
  const original = structuredClone(state);

  assert.deepEqual(Core.migrateStateV3(state), { ok: false, reason: 'invalid-areas' });
  assert.deepEqual(state, original);
});

test('migrateStateV3 rejects malformed explicit v3 task fields without mutation', () => {
  const state = v2State({
    version: 3, areas: [], goals: [], habits: [], templates: [], savedViews: [],
    tasks: [{ ...v2State().tasks[0], areaId: null, goalIds: 'bad-goals', plannedTime: '9:30', dueTime: null }],
    projects: [{ ...v2State().projects[0], areaId: null, goalIds: [] }],
  });
  const original = structuredClone(state);

  assert.deepEqual(Core.migrateStateV3(state), { ok: false, reason: 'invalid-task-goal-ids' });
  assert.deepEqual(state, original);
});

test('migrateStateV3 rejects malformed explicit v3 task times without mutation', () => {
  const state = v2State({
    version: 3, areas: [], goals: [], habits: [], templates: [], savedViews: [],
    tasks: [{ ...v2State().tasks[0], areaId: null, goalIds: [], plannedTime: '9:30', dueTime: null }],
    projects: [{ ...v2State().projects[0], areaId: null, goalIds: [] }],
  });
  const original = structuredClone(state);

  assert.deepEqual(Core.migrateStateV3(state), { ok: false, reason: 'invalid-task-planned-time' });
  assert.deepEqual(state, original);
});

test('migrateStateV3 rejects an explicit empty v3 task area ID without mutation', () => {
  const state = v2State({
    version: 3, areas: [], goals: [], habits: [], templates: [], savedViews: [],
    tasks: [{ ...v2State().tasks[0], areaId: '', goalIds: [], plannedTime: null, dueTime: null }],
    projects: [{ ...v2State().projects[0], areaId: null, goalIds: [] }],
  });
  const original = structuredClone(state);

  assert.deepEqual(Core.migrateStateV3(state), { ok: false, reason: 'invalid-task-area-id' });
  assert.deepEqual(state, original);
});

test('migrateStateV3 rejects malformed explicit v3 project fields without mutation', () => {
  const state = v2State({
    version: 3, areas: [], goals: [], habits: [], templates: [], savedViews: [],
    tasks: [{ ...v2State().tasks[0], areaId: null, goalIds: [], plannedTime: null, dueTime: null }],
    projects: [{ ...v2State().projects[0], areaId: null, goalIds: 'bad-goals', isArchived: false }],
  });
  const original = structuredClone(state);

  assert.deepEqual(Core.migrateStateV3(state), { ok: false, reason: 'invalid-project-goal-ids' });
  assert.deepEqual(state, original);
});

test('migrateStateV3 rejects an explicit empty v3 project area ID without mutation', () => {
  const state = v2State({
    version: 3, areas: [], goals: [], habits: [], templates: [], savedViews: [],
    tasks: [{ ...v2State().tasks[0], areaId: null, goalIds: [], plannedTime: null, dueTime: null }],
    projects: [{ ...v2State().projects[0], areaId: '', goalIds: [], isArchived: false }],
  });
  const original = structuredClone(state);

  assert.deepEqual(Core.migrateStateV3(state), { ok: false, reason: 'invalid-project-area-id' });
  assert.deepEqual(state, original);
});

test('migrateStateV3 rejects malformed explicit v3 project archive state without mutation', () => {
  const state = v2State({
    version: 3, areas: [], goals: [], habits: [], templates: [], savedViews: [],
    tasks: [{ ...v2State().tasks[0], areaId: null, goalIds: [], plannedTime: null, dueTime: null }],
    projects: [{ ...v2State().projects[0], areaId: null, goalIds: [], isArchived: 'yes' }],
  });
  const original = structuredClone(state);

  assert.deepEqual(Core.migrateStateV3(state), { ok: false, reason: 'invalid-project-is-archived' });
  assert.deepEqual(state, original);
});

test('migrateStateV3 preserves legacy project archive booleans', () => {
  const v2 = v2State({
    projects: [
      { id: 'active', name: 'Active', color: '#5362FF', order: 0, isArchived: false },
      { id: 'archived', name: 'Archived', color: '#5362FF', order: 1, isArchived: true },
    ],
    tasks: [],
  });

  const result = Core.migrateStateV3(v2);

  assert.equal(result.ok, true);
  assert.deepEqual(result.state.projects.map(project => project.isArchived), [false, true]);
});

test('validateStateV3 rejects tasks that override their project area', () => {
  const state = v2State({
    version: 3,
    areas: [{ id: 'a1', name: 'Work' }],
    goals: [], habits: [], templates: [], savedViews: [],
    tasks: [{
      ...v2State().tasks[0],
      areaId: 'a1', goalIds: [], plannedTime: null, dueTime: null,
    }],
    projects: [{ ...v2State().projects[0], areaId: 'a1', goalIds: [] }],
  });

  assert.deepEqual(Core.validateStateV3(state), { ok: false, reason: 'task-area-project-conflict' });
});

test('effectiveTaskArea inherits project area and ignores direct task area', () => {
  const projects = [{ id: 'p1', areaId: 'a-project' }];
  assert.equal(Core.effectiveTaskArea({ projectId: 'p1', areaId: 'a-task' }, projects), 'a-project');
  assert.equal(Core.effectiveTaskArea({ projectId: null, areaId: 'a-task' }, projects), 'a-task');
});

test('normalizeTime accepts HH:MM only', () => {
  assert.equal(Core.normalizeTime('09:30'), '09:30');
  assert.equal(Core.normalizeTime('9:30'), null);
  assert.equal(Core.normalizeTime('25:00'), null);
});

test('combineDateTime returns a local datetime only for valid date and time', () => {
  assert.equal(Core.combineDateTime('2026-09-20', '09:30'), '2026-09-20T09:30:00');
  assert.equal(Core.combineDateTime('2026-09-20', '9:30'), null);
  assert.equal(Core.combineDateTime(null, '09:30'), null);
});
