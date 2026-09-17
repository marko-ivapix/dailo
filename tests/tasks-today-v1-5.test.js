const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../js/core.js');

test('Task module renders duration, daily focus controls and inline Today completion', () => {
  let module;
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/tasks-ui.js'), 'utf8'), {
    window: { TodoDomainModules: { register(value) { module = value; } } },
  });
  const task = { id: 'a', title: 'Read', durationMinutes: 30, tagIds: [] };
  const html = module.renderTaskRow(task, 'today', {}, {
    Core, esc: String, getProject: () => null, state: { settings: { focusTaskIds: ['a'] } },
  });
  assert.match(html, /30 min/);
  assert.match(html, /data-inline-today-complete/);
  assert.match(html, /data-action="toggle-focus-task"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /data-action="task-plan-picker"/);
});

test('Today rendering caps focus at three and derives Daily Review from actual task records', () => {
  const today = Core.dateOnly();
  const tasks = ['a', 'b', 'c', 'd'].map(id => ({ id, title: id, plannedDate: today, durationMinutes: 20 }));
  tasks.push({ id: 'done', title: 'Done', isCompleted: true, completedAt: `${today}T12:00:00` });
  const state = Core.normalizeState({ version: 3, tasks, projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: { focusTaskIds: ['a', 'b', 'c', 'd'] }, ui: {} });
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const renderToday = source.slice(source.indexOf('  function renderToday()'), source.indexOf('  function renderInbox()'));
  const context = { state, Core, esc: String, getTask: id => tasks.find(task => task.id === id),
    pageHeader: () => '', formatPageToday: String, emptyState: () => '', taskRow: (task, view) => `<article data-view="${view}">${task.id}</article>` };
  vm.createContext(context);
  const html = vm.runInContext(`${renderToday}\nrenderToday()`, context);
  assert.equal((html.match(/data-view="focus"/g) || []).length, 3);
  assert.match(html, /data-daily-review-completed>1 completed today/);
  assert.match(html, /data-daily-review-open>4 unfinished planned tasks/);
  assert.match(html, /80 min planned remaining/);
});
