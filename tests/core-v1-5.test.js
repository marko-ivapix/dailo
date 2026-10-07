const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../js/core.js');

function oldState() {
  return Core.migrateStateV3({
    version: 2,
    tasks: [{ id: 'task-open', title: 'Open' }, { id: 'task-done', title: 'Done', isCompleted: true }],
    projects: [], tags: [], settings: {}, ui: {},
  }).state;
}

test('normalizeState supplies V1.5 defaults without altering V1.4 records', () => {
  const state = oldState();
  state.goals = [{ id: 'goal', title: 'Goal' }];
  state.habits = [{ id: 'habit', name: 'Habit' }];
  state.resources = [{ id: 'resource', title: 'Resource', description: '', areaId: null, tagIds: [], linkUrls: [], attachmentIds: [], relatedTaskIds: [], relatedProjectIds: [], relatedGoalIds: [], relatedHabitIds: [], createdAt: '', updatedAt: '' }];

  const normalized = Core.normalizeState(state);
  assert.equal(normalized.tasks[0].durationMinutes, null);
  assert.deepEqual(normalized.settings.focusTaskIds, []);
  assert.deepEqual(normalized.settings.dashboard, { focusedMode: false, sectionOrder: [], pinnedSectionIds: [] });
  assert.deepEqual(normalized.goals[0].currentValue, 0);
  assert.deepEqual(normalized.goals[0].targetValue, 100);
  assert.equal(normalized.goals[0].unit, '');
  assert.deepEqual(normalized.habits[0].minimumTarget, null);
  assert.deepEqual(normalized.habits[0].idealTarget, null);
  assert.equal(normalized.habits[0].graceDays, 0);
  assert.deepEqual(normalized.resources[0], { ...state.resources[0], type: 'article', status: 'unread', author: '', favorite: false, reviewedAt: null, clip: '' });
  assert.equal(state.tasks[0].durationMinutes, undefined, 'normalization does not mutate its input');
});

test('selectFocusTasks preserves requested order and excludes completed or missing tasks', () => {
  const tasks = [{ id: 'a' }, { id: 'done', isCompleted: true }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  assert.deepEqual(Core.selectFocusTasks(tasks, ['gone', 'b', 'done', 'a', 'c', 'd']), ['b', 'a', 'c']);
  assert.deepEqual(Core.selectFocusTasks(tasks, ['a', 'a', 'b'], 1), ['a']);
});

test('getGoalHealth distinguishes complete, overdue, at-risk, and on-track goals', () => {
  const now = new Date(2026, 8, 17, 12);
  assert.equal(Core.getGoalHealth({ status: 'completed', currentValue: 0 }, now), 'complete');
  assert.equal(Core.getGoalHealth({ progressType: 'numeric', currentValue: 10, targetValue: 10, targetDate: '2026-09-01' }, now), 'complete');
  assert.equal(Core.getGoalHealth({ currentValue: 20, targetDate: '2026-09-16' }, now), 'overdue');
  assert.equal(Core.getGoalHealth({ currentValue: 20, targetDate: '2026-09-20' }, now), 'at-risk');
  assert.equal(Core.getGoalHealth({ currentValue: 90, targetDate: '2026-09-20' }, now), 'on-track');
});

test('getHabitTargetStatus reports progress against both minimum and ideal targets', () => {
  const habit = { minimumTarget: 2, idealTarget: 4 };
  assert.deepEqual(Core.getHabitTargetStatus(habit, { currentPeriodCount: 1 }), { current: 1, minimumTarget: 2, idealTarget: 4, minimumMet: false, idealMet: false, status: 'below-minimum' });
  assert.deepEqual(Core.getHabitTargetStatus(habit, { currentPeriodCount: 2 }), { current: 2, minimumTarget: 2, idealTarget: 4, minimumMet: true, idealMet: false, status: 'minimum' });
  assert.deepEqual(Core.getHabitTargetStatus(habit, { currentPeriodCount: 4 }), { current: 4, minimumTarget: 2, idealTarget: 4, minimumMet: true, idealMet: true, status: 'ideal' });
});

test('Habit target defaults preserve fractional numeric targets and weekly check-in units', () => {
  assert.equal(Core.getHabitTargetStatus({ trackingType: 'numeric', targetValue: 0.5 }, { currentPeriodCount: 0.5 }).status, 'ideal');
  const weekly = Core.getHabitTargetStatus({ trackingType: 'numeric', targetValue: 10, frequencyType: 'timesPerWeek', timesPerWeek: 2 }, { currentPeriodCount: 2 });
  assert.equal(weekly.minimumTarget, 2);
  assert.equal(weekly.status, 'ideal');
});

test('Numeric Habit custom targets survive normalization and calculate fractional achievement', () => {
  const state = oldState();
  state.habits = [{ id: 'h', name: 'Water', trackingType: 'numeric', frequencyType: 'daily', targetValue: 2, minimumTarget: 0.5, idealTarget: 1 }];
  const habit = Core.normalizeState(state).habits[0];
  assert.equal(habit.minimumTarget, 0.5);
  assert.equal(habit.idealTarget, 1);
  assert.equal(Core.getHabitTargetStatus(habit, 0.5).status, 'minimum');
  assert.equal(Core.getHabitTargetStatus(habit, 1).status, 'ideal');
  for (const mode of [{ trackingType: 'checkbox' }, { frequencyType: 'timesPerWeek', timesPerWeek: 2 }]) {
    state.habits[0] = { ...habit, ...mode, minimumTarget: 0.5, idealTarget: 1.5 };
    const normalized = Core.normalizeState(state).habits[0];
    assert.equal(normalized.minimumTarget, null);
    assert.equal(normalized.idealTarget, null);
  }
});

test('getTimedTaskBlocks orders planned blocks and flags overlapping ranges', () => {
  const blocks = Core.getTimedTaskBlocks([
    { id: 'later', plannedDate: '2026-09-17', plannedTime: '10:00', durationMinutes: 30 },
    { id: 'overlap', plannedDate: '2026-09-17', plannedTime: '09:20', durationMinutes: 60 },
    { id: 'early', plannedDate: '2026-09-17', plannedTime: '09:00', durationMinutes: 30 },
    { id: 'all-day', plannedDate: '2026-09-17' },
    { id: 'done', plannedDate: '2026-09-17', plannedTime: '08:00', durationMinutes: 30, isCompleted: true },
  ], '2026-09-17');
  assert.deepEqual(blocks, [
    { taskId: 'early', startMinutes: 540, durationMinutes: 30, endMinutes: 570, conflict: true },
    { taskId: 'overlap', startMinutes: 560, durationMinutes: 60, endMinutes: 620, conflict: true },
    { taskId: 'later', startMinutes: 600, durationMinutes: 30, endMinutes: 630, conflict: true },
  ]);
});

test('getTimedTaskBlocks leaves all-day, completed, and other-day Tasks out of the time grid', () => {
  assert.deepEqual(Core.getTimedTaskBlocks([
    { id: 'all-day', plannedDate: '2026-09-17' },
    { id: 'done', plannedDate: '2026-09-17', plannedTime: '09:00', durationMinutes: 30, isCompleted: true },
    { id: 'other-day', plannedDate: '2026-09-18', plannedTime: '09:00', durationMinutes: 30 },
    { id: 'valid', plannedDate: '2026-09-17', plannedTime: '23:45', durationMinutes: 30 },
  ], '2026-09-17'), [
    { taskId: 'valid', startMinutes: 1425, durationMinutes: 30, endMinutes: 1455, conflict: false },
  ]);
});
