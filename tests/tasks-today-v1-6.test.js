const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
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

test('Today filters use an explicit projection date without mutating rows or arrays', () => {
  const sections = {
    overdue: [{ id: 'overdue', isCompleted: false, isImportant: true, dueDate: '2026-09-16' }],
    today: [
      { id: 'open', isCompleted: false, plannedDate: '2026-09-17' },
      { id: 'due', isCompleted: false, isImportant: true, dueDate: '2026-09-17' },
    ],
    completed: [{ id: 'done', isCompleted: true, isImportant: true, completedAt: '2026-09-17T08:00:00Z', dueDate: '2026-09-17' }],
    suggestions: [{ task: { id: 'suggested-due', isCompleted: false, dueDate: '2026-09-17' }, reason: 'due-today' }],
  };
  const snapshot = structuredClone(sections);
  const ids = (filter, key) => Core.filterTodayTasks(sections, filter, '2026-09-17')[key].map(entry => (entry.task || entry).id);

  assert.deepEqual(ids('all', 'today'), ['open', 'due']);
  assert.deepEqual(ids('open', 'completed'), []);
  assert.deepEqual(ids('completed', 'completed'), ['done']);
  assert.deepEqual(ids('important', 'today'), ['due']);
  assert.deepEqual(ids('dueToday', 'today'), ['due']);
  assert.deepEqual(ids('dueToday', 'suggestions'), ['suggested-due']);
  assert.deepEqual(Core.filterTodayTasks(sections, 'dueToday', '2026-09-18').today, []);
  assert.deepEqual(sections, snapshot);
  for (const key of ['overdue', 'today', 'completed', 'suggestions']) assert.notEqual(Core.filterTodayTasks(sections, 'all', '2026-09-17')[key], sections[key]);
});

// Redesign R2 (T2, M3, M6): the summary strip, its filter and their settings left Today. The stored values
// stay valid (normalization and backups), and Core.filterTodayTasks stays for compatibility.
test('Today has no filter or summary strip; its settings stay stored but unused', () => {
  const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  assert.doesNotMatch(app, /data-today-filter|data-today-focus-strip|data-today-open-count|todayFocusStrip/);
  assert.match(app, /data-action="quick-add" data-today="true"/, 'the one Today capture row stays');
  const settings = Core.normalizeV16Settings({ todayFocusStrip: false, todayFocusFilter: 'important' });
  assert.equal(settings.todayFocusStrip, false);
  assert.equal(settings.todayFocusFilter, 'important');
});

test('Today counts overdue and planned work; suggestions moved to Zadaci', () => {
  const vm = require('node:vm');
  const { withI18n } = require('./support/i18n.js');
  const today = Core.dateOnly();
  const tasks = [
    { id: 'overdue', title: 'Overdue', dueDate: Core.addDays(today, -1) },
    { id: 'planned', title: 'Planned', plannedDate: today },
    { id: 'suggested', title: 'Due today', dueDate: today },
  ];
  const state = Core.normalizeState({ version: 3, tasks, projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: {}, ui: {} });
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const fn = name => { const start = source.indexOf(`  function ${name}(`); return source.slice(start, source.indexOf('\n  }\n', start) + 4); };
  const context = { state, Core, esc: String, formatDate: String, formatPageToday: String, pageHeader: () => '', backupReminderNotice: () => '', weeklyReviewNotice: () => '', renderHabitTodayRow: () => '', taskRow: task => `<t ${task.id}>` };
  vm.createContext(withI18n(context));
  vm.runInContext(`const TODAY_LIMITS = { overdue: 3, today: 5, habits: 5 };\n${fn('todayLimited')}${fn('todayDueLabel')}${fn('deadlineRow')}${fn('renderToday')}`, context);
  const html = vm.runInContext('renderToday()', context);
  assert.match(html, /Past due<\/h2><span class="section-count">1<\/span><\/div><div class="task-list today-card"><t overdue>/);
  assert.match(html, /Planned today<\/h2><span class="section-count">1<\/span>/);
  assert.doesNotMatch(html, /<t suggested>/);
});

test('task rows retain existing handlers through compact affordance hooks', () => {
  const tasksUi = fs.readFileSync(require.resolve('../js/tasks-ui.js'), 'utf8');
  assert.match(tasksUi, /data-task-row-compact/);
  assert.match(tasksUi, /data-task-compact-actions/);
  assert.match(tasksUi, /data-action="toggle-focus-task"/);
  assert.match(tasksUi, /data-action="task-plan-picker"/);
  assert.match(tasksUi, /data-action="task-menu"/);
});
