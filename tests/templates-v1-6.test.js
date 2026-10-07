const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../js/core.js');

test('task templates are detached snapshots with relative date instantiation', () => {
  const task = {
    id: 'task-1', title: 'Plan {{tomorrow}}', notes: 'Review {{today}}', plannedDate: '2026-09-18', dueDate: '2026-09-20',
    goalIds: ['goal-1'], subtasks: [{ id: 'sub-1', title: 'Draft', isCompleted: true, completedAt: '2026-09-17T10:00:00.000Z' }],
  };
  const snapshot = Core.templateFromEntity('task', task, {}, '2026-09-17');
  const instantiated = Core.instantiateTemplate(snapshot, '2026-10-01', {
    taskId: 'new-task', nowIso: '2026-10-01T09:00:00.000Z', state: { goals: [{ id: 'goal-1' }] }, makeId: prefix => `${prefix}-new`,
  }).task;

  task.title = 'Changed later';
  task.subtasks[0].title = 'Changed subtask';
  assert.equal(snapshot.data.title, 'Plan {{tomorrow}}');
  assert.equal(snapshot.data.subtasks[0].title, 'Draft');
  assert.equal(instantiated.title, 'Plan 2026-10-02');
  assert.equal(instantiated.notes, 'Review 2026-10-01');
  assert.equal(instantiated.plannedDate, '2026-10-02');
  assert.equal(instantiated.dueDate, '2026-10-04');
  assert.equal(instantiated.id, 'new-task');
  assert.equal(instantiated.subtasks[0].isCompleted, false);
  assert.equal(instantiated.subtasks[0].completedAt, null);
});

test('template instantiation strips Goal links that no longer exist', () => {
  const snapshot = Core.templateFromEntity('task', { title: 'Goal task', goalIds: ['deleted-goal'] }, {}, '2026-09-17');
  const task = Core.instantiateTemplate(snapshot, '2026-09-17', { state: { goals: [] }, makeId: prefix => prefix, nowIso: '2026-09-17T09:00:00.000Z' }).task;

  assert.deepEqual(task.goalIds, []);
});
