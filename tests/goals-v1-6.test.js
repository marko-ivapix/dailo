const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../js/core.js');

test('goal summary caps percent and exposes remaining linked work', () => {
  const summary = Core.goalProgressSummary(
    { progressMode: 'manual', progressType: 'numeric', currentValue: 12, targetValue: 10, taskIds: ['t1'] },
    { tasks: [{ id: 't1', isCompleted: false }], goals: [], habits: [] },
    {},
  );

  assert.equal(summary.percent, 100);
  assert.equal(summary.remaining, 0);
  assert.equal(summary.linkedTasks.open, 1);
});

test('goal history projection sorts progress snapshots without mutating records', () => {
  const state = {
    goalHistory: [
      { id: 'later', goalId: 'g1', type: 'progressChanged', createdAt: '2026-09-16T12:00:00Z', data: { to: 80 } },
      { id: 'other', goalId: 'g2', type: 'progressChanged', createdAt: '2026-09-17T12:00:00Z', data: { to: 90 } },
      { id: 'first', goalId: 'g1', type: 'progressChanged', createdAt: '2026-09-15T12:00:00Z', data: { to: 40 } },
    ],
  };
  const before = structuredClone(state.goalHistory);

  assert.deepEqual(Core.goalProgressHistory({ id: 'g1' }, state, { start: '2026-09-15', end: '2026-09-16' }), [
    { id: 'first', date: '2026-09-15', percent: 40, type: 'progressChanged' },
    { id: 'later', date: '2026-09-16', percent: 80, type: 'progressChanged' },
  ]);
  assert.deepEqual(state.goalHistory, before);
});
