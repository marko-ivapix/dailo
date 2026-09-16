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

test('validateAreaName normalizes names and rejects duplicates', () => {
  const areas = [{ id: 'a1', name: '  Business  ' }];
  assert.deepEqual(Core.validateAreaName(areas, 'business'), { ok: false, reason: 'duplicate-area' });
  assert.deepEqual(Core.validateAreaName(areas, 'Business', 'a1'), { ok: true });
  assert.deepEqual(Core.validateAreaName(areas, '   '), { ok: false, reason: 'empty-area' });
});

test('area summary counts only matching effective objects', () => {
  const state = {
    projects: [{ id: 'p1', areaId: 'a1', isArchived: false }],
    tasks: [
      { id: 't1', projectId: 'p1', areaId: null, isCompleted: false },
      { id: 't2', projectId: null, areaId: 'a1', isCompleted: false },
      { id: 't3', projectId: null, areaId: 'a2', isCompleted: false },
      { id: 't4', projectId: 'p1', areaId: null, isCompleted: true },
    ],
    goals: [{ id: 'g1', areaId: 'a1', status: 'active' }],
    habits: [{ id: 'h1', areaId: 'a1', status: 'active' }],
  };
  assert.deepEqual(Core.areaSummary('a1', state), {
    projects: 1, openTasks: 2, activeGoals: 1, activeHabits: 1,
  });
});

test('linked task goal counts each parent task equally', () => {
  const goal = { progressMode: 'linkedTasks', taskIds: ['t1', 't2'], projectLinks: [] };
  const state = { tasks: [
    { id: 't1', isCompleted: true, subtasks: [{ isCompleted: false }] },
    { id: 't2', isCompleted: false, subtasks: [{ isCompleted: true }, { isCompleted: true }] },
  ], projects: [] };
  assert.deepEqual(Core.computeGoalProgress(goal, state, {}), { current: 1, target: 2, percent: 50 });
});

test('allTasks project links include future project tasks dynamically', () => {
  const goal = { progressMode: 'linkedTasks', taskIds: [], projectLinks: [{ projectId: 'p1', contributionMode: 'allTasks', selectedTaskIds: [] }] };
  const state = { tasks: [{ id: 't1', projectId: 'p1', isCompleted: true }, { id: 't2', projectId: 'p1', isCompleted: false }] };
  assert.equal(Core.computeGoalProgress(goal, state, {}).percent, 50);
  state.tasks.push({ id: 't3', projectId: 'p1', isCompleted: false });
  assert.equal(Core.computeGoalProgress(goal, state, {}).percent, 33.33333333333333);
});

test('linked habit goal equal-weights capped habit contributions', () => {
  const goal = { progressMode: 'linkedHabits', habitLinks: [
    { habitId: 'h1', metric: 'totalCheckins', target: 10 },
    { habitId: 'h2', metric: 'streak', target: 5 },
  ] };
  const metrics = { h1: { totalCheckins: 20, streak: 0, successfulPeriods: 0 }, h2: { totalCheckins: 0, streak: 2, successfulPeriods: 0 } };
  assert.equal(Core.computeGoalProgress(goal, {}, metrics).percent, 70);
});

test('manual goal progress keeps source value while clamping percentage display', () => {
  const progress = Core.computeGoalProgress({ progressMode: 'manual', progressType: 'percentage', currentValue: 125 }, {}, {});
  assert.deepEqual(progress, { current: 125, target: 100, percent: 100 });
});

test('goal date helpers keep paused goals out of overdue and derive milestones/reminders', () => {
  const goal = {
    status: 'paused', targetDate: '2026-09-15',
    milestones: [{ id: 'm1', date: '2026-09-15', isCompleted: false }, { id: 'm2', date: '2026-09-16', isCompleted: false }],
    reminders: { sevenDaysBefore: true, threeDaysBefore: true, oneDayBefore: true, onTargetDate: true, time: '08:30' },
  };
  assert.equal(Core.isGoalOverdue(goal, '2026-09-16'), false);
  goal.status = 'active';
  assert.equal(Core.isGoalOverdue(goal, '2026-09-16'), true);
  assert.deepEqual(Core.overdueMilestones(goal, '2026-09-16').map(item => item.id), ['m1']);
  assert.deepEqual(Core.goalReminderMoments(goal), [
    '2026-09-08T08:30:00', '2026-09-12T08:30:00', '2026-09-14T08:30:00', '2026-09-15T08:30:00',
  ]);
});

test('goal reminder due moments fire once and never after the target date', () => {
  const goal = {
    status: 'active', targetDate: '2026-09-16',
    reminders: { sevenDaysBefore: false, threeDaysBefore: false, oneDayBefore: false, onTargetDate: true, time: '09:00' },
    reminderFiredMoments: [],
  };
  assert.deepEqual(Core.goalReminderDueMoments(goal, '2026-09-16T09:05:00Z'), ['2026-09-16T09:00:00']);
  goal.reminderFiredMoments.push('2026-09-16T09:00:00');
  assert.deepEqual(Core.goalReminderDueMoments(goal, '2026-09-16T09:05:00Z'), []);
  goal.reminderFiredMoments = [];
  assert.deepEqual(Core.goalReminderDueMoments(goal, '2026-09-17T09:05:00Z'), []);
});

test('habit schedules daily, selected weekdays, every N days, and weekly targets by their defined units', () => {
  assert.equal(Core.habitScheduledOn({ frequencyType: 'daily', startDate: '2026-09-01', status: 'active' }, '2026-09-16'), true);
  assert.equal(Core.habitScheduledOn({ frequencyType: 'weekdays', weekdays: [1, 3, 5], startDate: '2026-09-01', status: 'active' }, '2026-09-16'), true);
  assert.equal(Core.habitScheduledOn({ frequencyType: 'weekdays', weekdays: [1, 3, 5], startDate: '2026-09-01', status: 'active' }, '2026-09-17'), false);
  assert.equal(Core.habitScheduledOn({ frequencyType: 'everyNDays', everyNDays: 3, startDate: '2026-09-01', status: 'active' }, '2026-09-16'), true);
  assert.equal(Core.habitScheduledOn({ frequencyType: 'everyNDays', everyNDays: 3, startDate: '2026-09-01', status: 'active' }, '2026-09-17'), false);
  assert.equal(Core.habitPeriodKey({ frequencyType: 'timesPerWeek' }, '2026-09-16', 'monday'), '2026-09-14');
});

test('timesPerWeek streak is successful weeks, not individual checkins', () => {
  const habit = { id: 'h1', frequencyType: 'timesPerWeek', timesPerWeek: 4, startDate: '2026-09-01', status: 'active', trackingType: 'checkbox' };
  const logs = [
    ['2026-09-07', 'done'], ['2026-09-08', 'done'], ['2026-09-09', 'done'], ['2026-09-11', 'done'], ['2026-09-12', 'done'],
    ['2026-09-14', 'done'], ['2026-09-15', 'done'], ['2026-09-16', 'done'], ['2026-09-18', 'done'],
  ].map(([date, status], index) => ({ id: String(index), habitId: 'h1', date, status, value: null }));
  const metrics = Core.deriveHabitMetrics(habit, logs, '2026-09-20', 'monday');
  assert.equal(metrics.currentStreak, 2);
  assert.equal(metrics.currentPeriodCount, 4);
  assert.equal(metrics.totalCheckins, 9);
});

test('skipped does not break weekday streak while missed required occurrence does', () => {
  const habit = { id: 'h-weekdays', frequencyType: 'weekdays', weekdays: [1, 3, 5], startDate: '2026-09-01', status: 'active', trackingType: 'checkbox' };
  const logs = [
    ['2026-09-07', 'done'], ['2026-09-09', 'skipped'], ['2026-09-11', 'done'], ['2026-09-14', 'missed'], ['2026-09-16', 'done'],
  ].map(([date, status], index) => ({ id: String(index), habitId: habit.id, date, status, value: null }));
  const metrics = Core.deriveHabitMetrics(habit, logs, '2026-09-16', 'monday');
  assert.equal(metrics.currentStreak, 1);
  assert.equal(metrics.longestStreak, 2);
});

test('numeric habit becomes done at target while preserving over-target value', () => {
  const habit = { id: 'numeric', status: 'active', trackingType: 'numeric', targetValue: 2, frequencyType: 'daily', startDate: '2026-09-16' };
  assert.deepEqual(Core.numericHabitState(habit, 2.4), { status: 'done', value: 2.4, percent: 100 });
  assert.deepEqual(Core.numericHabitState(habit, 1), { status: 'missed', value: 1, percent: 50 });
  assert.equal(Core.deriveHabitMetrics(habit, [{ id: '1', habitId: 'numeric', date: '2026-09-16', status: 'done', value: 2.4 }], '2026-09-16', 'monday').currentPeriodCount, 2.4);
});

test('habit reminders suppress completed weekly targets and inactive habits', () => {
  const habit = { id: 'h-reminder', trackingType: 'checkbox', frequencyType: 'timesPerWeek', timesPerWeek: 4, startDate: '2026-09-01', status: 'active', reminders: [{ id: 'r1', time: '09:00', enabled: true }] };
  const logs = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'].map((date, index) => ({ id: String(index), habitId: habit.id, date, status: 'done', value: null }));
  assert.equal(Core.habitReminderActive(habit, logs, '2026-09-17T10:00:00', 'monday'), false);
  assert.equal(Core.habitReminderActive({ ...habit, status: 'paused' }, [], '2026-09-17T10:00:00', 'monday'), false);
});

test('paused historical habit metrics preserve completed periods and skip its pause boundary', () => {
  const habit = { id: 'paused', status: 'paused', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-09-01', pauseIntervals: [{ startDate: '2026-09-03', endDate: '2026-09-05' }] };
  const logs = [{ id: '1', habitId: 'paused', date: '2026-09-01', status: 'done', value: null }, { id: '2', habitId: 'paused', date: '2026-09-02', status: 'done', value: null }, { id: '3', habitId: 'paused', date: '2026-09-06', status: 'done', value: null }];
  const metrics = Core.deriveHabitMetrics(habit, logs, '2026-09-06', 'monday');
  assert.equal(metrics.totalCheckins, 3);
  assert.equal(metrics.currentStreak, 3);
  assert.equal(Core.habitScheduledOn(habit, '2026-09-02', { historical: true }), true);
  assert.equal(Core.habitScheduledOn(habit, '2026-09-04', { historical: true }), false);
});

test('streak carries across unscheduled, skipped, and pending current units until a closed required miss', () => {
  const habit = { id: 'carry', status: 'active', trackingType: 'checkbox', frequencyType: 'weekdays', weekdays: [1, 3, 5], startDate: '2026-09-01' };
  const logs = [{ id: '1', habitId: 'carry', date: '2026-09-14', status: 'done', value: null }, { id: '2', habitId: 'carry', date: '2026-09-16', status: 'skipped', value: null }];
  assert.equal(Core.deriveHabitMetrics(habit, logs, '2026-09-16', 'monday').currentStreak, 1);
  assert.equal(Core.deriveHabitMetrics(habit, logs, '2026-09-15', 'monday').currentStreak, 1);
  const weekly = { id: 'weekly-carry', status: 'active', trackingType: 'checkbox', frequencyType: 'timesPerWeek', timesPerWeek: 2, startDate: '2026-09-01' };
  const weeklyLogs = [{ id: '1', habitId: weekly.id, date: '2026-09-07', status: 'done', value: null }, { id: '2', habitId: weekly.id, date: '2026-09-08', status: 'done', value: null }];
  assert.equal(Core.deriveHabitMetrics(weekly, weeklyLogs, '2026-09-15', 'monday').currentStreak, 1);
});

test('completed pause-boundary logs remain counted through pause/archive/resume history', () => {
  const logs = ['2026-09-01', '2026-09-02', '2026-09-03'].map((date, index) => ({ id: String(index), habitId: 'boundary', date, status: 'done', value: null }));
  const paused = { id: 'boundary', status: 'paused', pauseStartedAt: '2026-09-03', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-09-01' };
  const pausedMetrics = Core.deriveHabitMetrics(paused, logs, '2026-09-03', 'monday');
  assert.deepEqual([pausedMetrics.totalCheckins, pausedMetrics.currentStreak, pausedMetrics.longestStreak], [3, 3, 3]);
  const archived = { ...paused, status: 'archived' };
  const archivedMetrics = Core.deriveHabitMetrics(archived, logs, '2026-09-05', 'monday');
  assert.deepEqual([archivedMetrics.totalCheckins, archivedMetrics.currentStreak, archivedMetrics.longestStreak], [3, 3, 3]);
  const resumed = { ...archived, status: 'active', pauseStartedAt: null, pauseIntervals: [{ startDate: '2026-09-03', endDate: '2026-09-04' }] };
  assert.equal(Core.habitStatusForDate(resumed, logs, '2026-09-03', '2026-09-05').status, 'done');
});
