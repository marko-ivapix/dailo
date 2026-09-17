const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../js/core.js');

function taskState(tasks, focusTaskIds = []) {
  return { version: 3, tasks, projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], settings: { focusTaskIds }, ui: {} };
}

test('load/save normalizes focus IDs to three existing open tasks in requested order', () => {
  const tasks = ['a', 'b', 'c', 'd'].map(id => ({ id, title: id }));
  tasks.push({ id: 'done', title: 'Done', isCompleted: true });
  const state = taskState(tasks, ['gone', 'done', 'a', 'a', 'b', 'c', 'd']);
  assert.deepEqual(Core.normalizeState(state).settings.focusTaskIds, ['a', 'b', 'c']);
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const save = source.slice(source.indexOf('  function saveState()'), source.indexOf('  function saveAndRender()'));
  let persisted;
  const context = { state, Core, globalOperation: null, STORAGE_KEY: 'state', reportStorageFailure: error => { throw error; },
    localStorage: { setItem(key, value) { persisted = JSON.parse(value); } }, scheduleAutomaticSnapshot() {} };
  vm.createContext(context);
  assert.equal(vm.runInContext(`${save}\nsaveState()`, context), true);
  assert.deepEqual(persisted.settings.focusTaskIds, ['a', 'b', 'c']);
  assert.deepEqual(Array.from(state.settings.focusTaskIds), ['a', 'b', 'c']);
  tasks[0].isCompleted = true;
  vm.runInContext('saveState()', context);
  assert.deepEqual(persisted.settings.focusTaskIds, ['b', 'c']);
});

test('Add another retains implicit Today and resets explicit times before parsing the second task', () => {
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const create = source.slice(source.indexOf('  function createTask('), source.indexOf('  function syncQuickDraftFromDom()'));
  const parse = source.slice(source.indexOf('  function parseQuickAddTitle('), source.indexOf('  function nextOrder('));
  const today = Core.dateOnly();
  const defaults = { projectId: null, areaId: null, plannedDate: today, explicitPlan: false };
  const context = { Core, state: taskState([]), modalState: { type: 'quick', defaults,
    draft: { title: 'First today 09:30', explicitPlan: false, plannedDate: today, plannedTime: '14:00', dueTime: '15:00', explicitPlannedTime: true, subtasks: [] } },
    syncQuickDraftFromDom() {}, uid: () => 'task', nowIso: () => new Date().toISOString(), nextOrder: () => 0,
    saveState() {}, closeModal() {}, render() {}, renderModal() {}, requestAnimationFrame() {}, $() {} };
  vm.createContext(context);
  vm.runInContext(`${parse}\n${create}\ncreateTask(true)`, context);
  assert.equal(context.modalState.draft.explicitPlan, false);
  assert.equal(context.modalState.draft.plannedTime, null);
  assert.equal(context.modalState.draft.dueTime, null);
  assert.equal(context.modalState.draft.explicitPlannedTime, false);
  context.modalState.draft.title = 'Second tomorrow 09:30';
  vm.runInContext('createTask(false)', context);
  assert.equal(context.state.tasks[1].title, 'Second');
  assert.equal(context.state.tasks[1].plannedDate, Core.addDays(today, 1));
  assert.equal(context.state.tasks[1].plannedTime, '09:30');
  assert.equal(context.state.tasks[1].dueTime, null);
  context.modalState = { type: 'quick', defaults: { ...defaults, explicitPlan: true }, draft: { title: 'Explicit', explicitPlan: true, plannedDate: today, subtasks: [] } };
  vm.runInContext('createTask(true)', context);
  assert.equal(context.modalState.draft.explicitPlan, true);
});

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
