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

test('Today filter uses the shared compact select styling', () => {
  const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  assert.match(app, /<select class="filter-select" data-today-filter/);
});

test('Today focus strip exposes counts and a single Today capture action', () => {
  const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  assert.match(app, /data-today-focus-strip/);
  assert.match(app, /data-today-open-count/);
  assert.match(app, /data-today-completed-count/);
  assert.match(app, /data-action="quick-add" data-today="true"/);
});

test('Today open count includes distinct overdue and suggested task records', () => {
  const vm = require('node:vm');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');
  const today = Core.dateOnly();
  const tasks = [
    { id: 'overdue', title: 'Overdue', dueDate: Core.addDays(today, -1) },
    { id: 'planned', title: 'Planned', plannedDate: today },
    { id: 'suggested', title: 'Due today', dueDate: today },
  ];
  const state = Core.normalizeState({ version: 3, tasks, projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: { todayFocusStrip: true }, ui: {} });
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const renderToday = source.slice(source.indexOf('  function renderToday()'), source.indexOf('  function renderInbox()'));
  const context = { state, Core, esc: String, getTask: id => tasks.find(task => task.id === id), pageHeader: () => '', formatPageToday: String, emptyState: () => '', backupReminderNotice: () => '', weeklyReviewNotice: () => '', taskRow: () => '' };
  vm.createContext(withI18n(context));
  const html = vm.runInContext(`${renderToday}\nrenderToday()`, context);
  assert.match(html, /data-today-open-count>3 open/);
});

test('Today focus strip respects its disabled dashboard setting', () => {
  const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  assert.match(app, /state\.settings\.todayFocusStrip !== false/);
});

test('task rows retain existing handlers through compact affordance hooks', () => {
  const tasksUi = fs.readFileSync(require.resolve('../js/tasks-ui.js'), 'utf8');
  assert.match(tasksUi, /data-task-row-compact/);
  assert.match(tasksUi, /data-task-compact-actions/);
  assert.match(tasksUi, /data-action="toggle-focus-task"/);
  assert.match(tasksUi, /data-action="task-plan-picker"/);
  assert.match(tasksUi, /data-action="task-menu"/);
});
