const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');

test('Today filters are presentation-only and preserve section identity', () => {
  const sections = {
    overdue: [{ id: 'o', isCompleted: false, isImportant: true }],
    today: [{ id: 'd', isCompleted: false, plannedDate: '2026-09-17' }],
    completed: [{ id: 'c', isCompleted: true, completedAt: '2026-09-17T08:00:00Z' }],
  };
  assert.deepEqual(Core.filterTodayTasks(sections, 'important').overdue.map(task => task.id), ['o']);
  assert.deepEqual(Core.filterTodayTasks(sections, 'completed').completed.map(task => task.id), ['c']);
  assert.deepEqual(sections.today.map(task => task.id), ['d']);
});
