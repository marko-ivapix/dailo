// R67: the user's own starter examples for "Popuni primerima" and the rough month of a task (task.plannedMonth).
// Spec: docs/superpowers/specs/2026-10-13-r67-own-examples.md · data model: docs/superpowers/specs/2026-10-13-r67-rough-month-data.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Backup = require('../js/backup.js');
const Release = require('../js/release.js');
const I18n = require('../js/i18n.js');
const Starter = require('../js/starter-examples.js');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const PROJECT_COLORS = ['#5362FF', '#30CBAD', '#A879FF', '#4CC9F0', '#F5B942', '#FF8A5B', '#F06A8A', '#8FD14F'];
const stamp = '2026-10-13T08:00:00.000Z';
const task = (fields = {}) => ({ id: 't1', title: 'Iron', notes: '', projectId: null, areaId: null, goalIds: [], plannedDate: null, plannedTime: null, dueDate: null, dueTime: null, reminderAt: null, reminderFiredAt: null, recurrence: null, tagIds: [], priority: 'none', attachmentIds: [], isInbox: false, isCompleted: false, completedAt: null, subtasks: [], todayOrder: null, projectOrder: null, inboxOrder: null, createdAt: stamp, updatedAt: stamp, ...fields });
const emptyState = () => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: Core.normalizeV16Settings({}), ui: {} });

// --- The rough month (data model) --------------------------------------------------------------------

test('R67: a rough month is "YYYY-MM"; anything else reads as no month', () => {
  assert.equal(Core.normalizePlannedMonth('2026-12'), '2026-12');
  for (const value of ['2026-13', '2026-00', '2026-1', '26-01', '2026-12-01', '', 5, null, undefined, {}]) assert.equal(Core.normalizePlannedMonth(value), null, String(value));
  assert.equal(Core.monthKey('2026-10-13'), '2026-10');
  assert.equal(Core.addMonths('2026-11', 2), '2027-01');
  assert.equal(Core.addMonths('2026-01', -1), '2025-12');
  // The next time a calendar month comes round; the current month counts.
  assert.equal(Core.upcomingMonth(10, '2026-10-13'), '2026-10');
  assert.equal(Core.upcomingMonth(3, '2026-10-13'), '2027-03');
  assert.equal(Core.upcomingMonth(12, '2026-10-13'), '2026-12');
});

test('R67: normalizing keeps a valid month, clears an invalid one and leaves older tasks without the field', () => {
  const state = { ...emptyState(), tasks: [task({ id: 'a', plannedMonth: '2026-12' }), task({ id: 'b', plannedMonth: '2026-13' }), task({ id: 'c' })] };
  const tasks = Core.normalizeState(state).tasks;
  assert.equal(tasks[0].plannedMonth, '2026-12');
  assert.equal(tasks[1].plannedMonth, null);
  assert.equal(Object.hasOwn(tasks[2], 'plannedMonth'), false, 'an older task is not rewritten, so sync sends nothing new');
});

test('R67: backups accept a valid month and refuse a bad one', () => {
  const ok = { ...emptyState(), tasks: [task({ plannedMonth: '2027-01' })] };
  assert.doesNotThrow(() => Backup.validateDomain(ok, [], []));
  const bad = { ...emptyState(), tasks: [task({ plannedMonth: 'January' })] };
  assert.throws(() => Backup.validateDomain(bad, [], []), /plannedMonth/);
});

test('R67: sync carries the month with the task record; no migration is needed', () => {
  const Sync = require('../js/sync.js');
  const records = Sync.collectRecords({ ...emptyState(), tasks: [task({ plannedMonth: '2026-12' })] });
  assert.equal(records.get('tasks/t1').data.plannedMonth, '2026-12');
  assert.deepEqual(fs.readdirSync(path.join(__dirname, '..', 'supabase', 'migrations')).filter(name => /^0007/.test(name)), []);
});

test('R67: Upcoming groups open tasks by rough month; a past month waits in the current one', () => {
  const tasks = [
    task({ id: 'dec', title: 'Hoodie', plannedMonth: '2026-12' }),
    task({ id: 'nov', title: 'Iron', plannedMonth: '2026-11' }),
    task({ id: 'nov2', title: 'Car floor mats', plannedMonth: '2026-11' }),
    task({ id: 'sep', title: 'Socks', plannedMonth: '2026-09' }),
    task({ id: 'oct', title: 'T-shirt', plannedMonth: '2026-10' }),
    task({ id: 'done', title: 'Done', plannedMonth: '2026-11', isCompleted: true, completedAt: stamp }),
    task({ id: 'dated', title: 'Dated', plannedMonth: '2026-11', plannedDate: '2026-11-04' }),
    task({ id: 'none', title: 'No month' }),
  ];
  const groups = Core.deriveRoughMonths(tasks, '2026-10-13');
  assert.deepEqual(groups.map(group => [group.month, group.items.map(item => item.id)]), [
    ['2026-10', ['sep', 'oct']], ['2026-11', ['nov2', 'nov']], ['2026-12', ['dec']],
  ]);
  // A rough month never puts a task on Today.
  const today = Core.deriveTodaySections(tasks, '2026-10-13');
  assert.equal([...today.today, ...today.overdue, ...today.suggestions].some(entry => (entry.task || entry).plannedMonth), false);
});

test('R67: a repeat does not pass the month on, and templates do not keep it', () => {
  const rule = Core.normalizeRecurrenceV3({ frequency: 'weekly', interval: 1, endType: 'never', seriesId: 't1' });
  const next = Core.buildNextRecurringTask(task({ plannedDate: '2026-10-13', plannedMonth: '2026-10', recurrence: rule }), stamp, 't2');
  assert.equal(next.plannedMonth, null);
  assert.equal(Object.hasOwn(Core.templateFromEntity('task', task({ plannedMonth: '2026-10' }), {}, '2026-10-13').data, 'plannedMonth'), false);
});

// --- The task window, the row and Upcoming ----------------------------------------------------------

function tasksModule() {
  let adapter;
  runInNewContextWithI18n(read('js/tasks-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  return adapter;
}
function taskCtx(item, extra = {}) {
  const edits = [], popovers = [];
  const ctx = {
    state: { tasks: [item], tags: [], settings: {} }, Core, esc: value => String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]),
    getTask: id => (id === item.id ? item : null), getProject: () => null, getArea: () => null, todayDueLabel: () => '',
    plannedMonthLabel: month => ({ '2026-10': 'October', '2026-11': 'November', '2027-01': 'January 2027' })[month] || month,
    openPopover: (anchor, html, meta) => popovers.push({ html, meta }), closePopover() {}, requestTaskEdit: (id, changes) => edits.push([id, changes]),
    ...extra,
  };
  return { ctx, edits, popovers };
}

test('R67: the task window has a Rough month row whose sheet sets and removes the month', () => {
  assert.match(functionSource('renderTaskModal').source, /row\('task-month-picker', 'ph-calendar-dots', tr\('Rough month'\), task\.plannedMonth \? esc\(capital\(plannedMonthLabel\(task\.plannedMonth\)\)\) : ''\)/);
  const module = tasksModule();
  const item = task({ isInbox: true, plannedMonth: '2026-11' });
  const { ctx, edits, popovers } = taskCtx(item);
  const button = { dataset: { action: 'task-month-picker', taskId: 't1' } };
  assert.equal(module.handleAction('task-month-picker', { target: { closest: () => button } }, ctx), true);
  const sheet = popovers[0].html;
  assert.match(sheet, /Approximate month/);
  // Twelve months from the current one; the stored one is selected.
  assert.equal((sheet.match(/data-pop-action="set-task-month"[^>]*data-month="\d{4}-\d{2}"/g) || []).length, 12);
  assert.match(sheet, /data-month="2026-11" aria-pressed="true"|aria-pressed="true"[^>]*data-month="2026-11"/);
  assert.match(sheet, /Remove month/);
  assert.match(sheet, /An approximate month keeps the task out of Today\. It shows in Upcoming under that month\./);
  const pick = month => ({ target: { closest: () => ({ dataset: { popAction: 'set-task-month', taskId: 't1', month } }) } });
  assert.equal(module.handleAction('set-task-month', pick('2027-01'), ctx), true);
  assert.equal(module.handleAction('set-task-month', pick(''), ctx), true);
  assert.deepEqual(plain(edits), [['t1', { plannedMonth: '2027-01', isInbox: false }], ['t1', { plannedMonth: null }]]);
});

test('R67: an open task without a planned day shows its rough month in the row', () => {
  const module = tasksModule();
  const row = item => module.renderTaskRow(item, 'project:p1', {}, taskCtx(item).ctx);
  assert.match(row(task({ plannedMonth: '2026-11' })), /<div class="task-meta">Around November<\/div>/);
  assert.doesNotMatch(row(task({ plannedMonth: '2026-11', plannedDate: '2026-11-04' })), /Around/);
  assert.doesNotMatch(row(task({ plannedMonth: '2026-11', isCompleted: true, completedAt: stamp })), /Around/);
});

test('R67: Upcoming lists the rough months after the days, and the app names the month', () => {
  const upcoming = functionSource('renderUpcomingDays').source;
  assert.match(upcoming, /Core\.deriveRoughMonths\(source\.tasks, today, /); // the review fix passes the 21-day window
  assert.match(upcoming, /data-upcoming-month="\$\{group\.month\}"/);
  assert.match(upcoming, /tr\('approximately'\)/);
  const label = functionSource('plannedMonthLabel').source;
  assert.match(label, /MONTH_FMT|MONTH_YEAR_FMT/);
  assert.match(read('js/app.js'), /plannedMonthLabel,\n/);
  assert.match(read('js/app.js'), /requestTaskEdit,\n/);
  assert.match(read('js/i18n-sr.js'), /"Around \{month\}": "Okvirno \{month\}"/);
  assert.match(read('js/i18n-sr.js'), /"Rough month": "Okvirno"/);
});

// --- The examples -------------------------------------------------------------------------------------

function harness(state = emptyState(), { saveOk = true } = {}) {
  let adapter;
  let counter = 0;
  const toasts = [];
  runInNewContextWithI18n(read('js/habits-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } }, DailoStarterExamples: Starter }, requestAnimationFrame: run => run() });
  const draftCtx = withI18n({ Core });
  vm.createContext(draftCtx);
  vm.runInContext(functionSource('habitDraft').source, draftCtx);
  const ctx = {
    state, Core, uid: prefix => `${prefix}_${++counter}`, nowIso: () => stamp,
    habitDraft: (...args) => plain(draftCtx.habitDraft(...args)), areaDefaults: { color: PROJECT_COLORS[0], icon: 'ph-briefcase' }, PROJECT_COLORS,
    saveState: () => saveOk, render() {}, setToastMessage: text => toasts.push(text), refreshHabitMetrics: () => Promise.resolve(),
  };
  const run = async () => { adapter.handleAction('add-starter-examples', null, ctx); await new Promise(resolve => setImmediate(resolve)); };
  return { ctx, state, run, toasts };
}
const named = (items, name, field = 'name') => { const found = items.find(item => item[field] === name); assert.ok(found, name); return found; };
const counts = state => Object.fromEntries(['areas', 'tags', 'habits', 'projects', 'tasks', 'goals', 'notes', 'resources', 'templates'].map(key => [key, state[key].length]));
const inProject = (state, name) => state.tasks.filter(item => item.projectId === named(state.projects, name).id);

test('R67: five Areas and the user\'s tags', async () => {
  const { state, run } = harness();
  await run();
  assert.deepEqual(state.areas.map(area => [area.name, area.icon]), [['Personal', 'ph-graduation-cap'], ['Work', 'ph-briefcase'], ['Home', 'ph-house'], ['Health', 'ph-heart'], ['Hobbies and nature', 'ph-plant']]);
  assert.deepEqual(state.tags.map(tag => tag.name), ['House', 'Private', 'Work', 'Art', 'Hobby', 'Health', 'Shopping']);
  assert.ok(state.tags.every(tag => /^#[0-9A-Fa-f]{6}$/.test(tag.color)));
});

test('R67: the projects are the user\'s lists, each with its Area and items', async () => {
  const { state, run } = harness();
  await run();
  const area = name => named(state.areas, name).id;
  // R71: "Popuni primerima" also adds two Redovne obaveze groups (tests/more-examples-r71.test.js); the lists are the rest.
  const lists = state.projects.filter(project => !project.isCleaningRoom);
  assert.deepEqual(lists.map(project => [project.name, project.areaId]), [
    ['Groceries', area('Home')], ['To buy', area('Home')], ['Clothes', area('Personal')], ['Motorcycle', area('Hobbies and nature')],
    ['To learn', area('Personal')], ['Bucket list', area('Personal')], ['Movies and series', area('Personal')],
    ['Things to own', area('Personal')], // R70: the user's list of things to own (tests/things-to-own-r70.test.js)
  ]);
  assert.ok(state.projects.every(project => !project.isArchived));
  assert.deepEqual(state.projects.filter(project => project.isCleaningRoom).map(project => project.name), ['Car and motorcycle', 'Health and bills']);
  const titles = name => inProject(state, name).map(item => item.title);
  assert.deepEqual(titles('Groceries'), ['Eggs', 'Milk', 'Bananas', 'Fabric softener']);
  assert.deepEqual(titles('To buy'), ['Iron', 'Car floor mats', 'Hubcaps', 'Tools']);
  assert.deepEqual(titles('Clothes'), ['T-shirt', 'Hoodie', 'Socks']);
  assert.deepEqual(titles('Motorcycle'), ['Summer jacket', 'Chain and sprockets', 'Battery']);
  assert.deepEqual(titles('To learn'), ['JavaScript', 'Canva', 'Photoshop', 'Figma (Marko Pešić course)', 'Interior design', 'How a house is built', 'A musical instrument', 'Cooking', 'Training plan', 'Meal plan']);
  // R69: the bucket list became the user's own 81 items (tests/bucket-list-r69.test.js), which include an instrument.
  assert.ok(titles('Bucket list').includes('Raft the Tara river') && titles('Bucket list').length === 81);
  assert.deepEqual(titles('Movies and series'), ["Who's Singin' Over There?", 'The Marathon Family', 'Planet Earth II']);
  for (const name of lists.map(project => project.name)) assert.deepEqual(inProject(state, name).map(item => item.projectOrder), inProject(state, name).map((_, index) => index), name);
  const listTasks = state.tasks.filter(item => lists.some(project => project.id === item.projectId));
  assert.ok(listTasks.every(item => !item.isInbox && !item.isCompleted && !item.recurrence && !item.plannedDate && !item.dueDate));
});

test('R67: the lists use the tags and rough months, the way the user kept them', async () => {
  const { state, run } = harness();
  await run();
  const today = Core.dateOnly();
  const tag = name => named(state.tags, name).id;
  const item = title => named(state.tasks, title, 'title');
  assert.deepEqual(plain(item('Iron').tagIds), [tag('House')]);
  assert.deepEqual(plain(item('Hubcaps').tagIds), [tag('Private')]);
  assert.deepEqual(plain(item('A musical instrument').tagIds), [tag('Art'), tag('Hobby')]);
  assert.deepEqual(plain(item('JavaScript').tagIds), [tag('Work')]);
  assert.deepEqual(plain(item('Meal plan').tagIds), [tag('Health')]);
  assert.deepEqual(plain(item('Summer jacket').tagIds), [tag('Shopping')]);
  assert.equal(item('Iron').plannedMonth, Core.addMonths(Core.monthKey(today), 1));
  assert.equal(item('T-shirt').plannedMonth, Core.monthKey(today));
  assert.equal(item('Summer jacket').plannedMonth, Core.upcomingMonth(4, today));
  assert.equal(item('Battery').plannedMonth, Core.upcomingMonth(3, today));
  assert.equal(item('JavaScript').plannedMonth, Core.upcomingMonth(1, today));
  assert.ok(!Object.hasOwn(item('Eggs'), 'plannedMonth') || item('Eggs').plannedMonth === null);
  assert.ok(state.tasks.every(entry => entry.plannedMonth == null || Core.normalizePlannedMonth(entry.plannedMonth) === entry.plannedMonth));
});

test('R67: the user\'s habits keep their keys and get Areas', async () => {
  const { state, run } = harness();
  await run();
  assert.equal(state.habits.length, 10);
  const habit = name => named(state.habits, name);
  assert.equal(habit('Cold shower').sampleKey, 'area-routines-v1:habit:morning:cold-shower');
  assert.equal(habit('Wim Hof breathing').areaId, named(state.areas, 'Health').id);
  assert.equal(habit('Program 30 minutes').areaId, named(state.areas, 'Work').id);
  assert.equal(habit('Beard balm').areaId, named(state.areas, 'Personal').id);
  assert.deepEqual([habit('Training four times per week').frequencyType, habit('Training four times per week').timesPerWeek], ['timesPerWeek', 4]);
  assert.deepEqual([...new Set(state.habits.map(item => item.routine))].sort(), ['daily', 'morning', 'night']);
  assert.ok(state.habits.every(item => item.areaId && item.status === 'active' && item.startDate === Core.dateOnly()));
});

test('R67: Camping and Hiking are project templates with the user\'s packing lists', async () => {
  const { state, run } = harness();
  await run();
  // R71: the meal-plan shopping list joins them as a task template.
  assert.deepEqual(state.templates.map(item => [item.name, item.type]), [['Camping', 'project'], ['Hiking', 'project'], ['Shopping for the meal plan (4 days)', 'task']]);
  const camping = named(state.templates, 'Camping');
  assert.equal(camping.data.areaId, named(state.areas, 'Hobbies and nature').id);
  assert.deepEqual(camping.data.tasks.map(item => [item.title, item.subtasks.map(sub => sub.title)]), [
    ['Sleeping', ['Tent', 'Sleeping bag', 'Sleeping pad', 'Pillow', 'Blanket']],
    ['Water and food', ['Water canister', 'Cutlery and dishes']],
    ['Hygiene', ['Towel', 'Shampoo', 'Paper tissues and wet wipes', 'Waterless hand wash']],
    ['Gear', ['Lamp', 'Power bank']],
    ['Clothes', ['Swimsuit']],
  ]);
  const made = Core.instantiateTemplate(camping, '2026-10-20', { nowIso: stamp, state });
  assert.equal(made.project.name, 'Camping');
  assert.equal(made.tasks.length, 5);
  const hiking = named(state.templates, 'Hiking');
  assert.ok(hiking.data.tasks.find(item => item.title === 'Pack the backpack').subtasks.some(sub => sub.title === 'Hiking shoes'));
  assert.equal(state.projects.some(project => ['Camping', 'Hiking'].includes(project.name)), false, 'a template, not a project');
});

test('R67: books and the Figma course are resources; goals and notes follow the lists', async () => {
  const { state, run } = harness();
  await run();
  const figma = named(state.resources, 'Figma course', 'title');
  assert.deepEqual([figma.type, figma.author, figma.areaId], ['course', 'Marko Pešić', named(state.areas, 'Work').id]);
  assert.deepEqual(plain(figma.relatedTaskIds), [named(state.tasks, 'Figma (Marko Pešić course)', 'title').id]);
  const books = state.resources.filter(item => item.type === 'book');
  assert.deepEqual(books.map(item => item.title), ['Atomic Habits', 'The Bridge on the Drina', 'Death and the Dervish', 'Sapiens']);
  const reading = named(state.goals, 'Read 12 books in a year', 'title');
  assert.ok(books.every(item => item.status === 'unread' && item.relatedGoalIds.includes(reading.id)));
  const motorcycle = named(state.goals, 'Get the motorcycle ready for the season', 'title');
  assert.deepEqual(plain(motorcycle.projectLinks), [{ projectId: named(state.projects, 'Motorcycle').id, contributionMode: 'allTasks', selectedTaskIds: [] }]);
  assert.ok(named(state.projects, 'Motorcycle').goalIds.includes(motorcycle.id));
  const shape = named(state.goals, 'Stay in shape', 'title');
  const training = named(state.habits, 'Training four times per week');
  assert.deepEqual(plain(shape.habitLinks), [{ habitId: training.id, metric: 'totalCheckins', target: 48 }]);
  assert.ok(training.goalIds.includes(shape.id));
  assert.deepEqual(state.notes.map(note => note.title), ['Clothing sizes', 'Emergency numbers', 'Gift ideas']); // R71: gift ideas
});

test('R67: the old example set is gone', async () => {
  const { state, run } = harness();
  await run();
  for (const name of ['Plan your week', 'Camping at Tara', 'Moving to a new apartment', 'Living Room']) assert.equal(state.projects.some(project => project.name === name), false, name);
  assert.equal(state.tasks.some(item => item.cleaningSampleKey), false);
  assert.equal(state.areas.some(area => area.name === 'Career'), false);
  assert.doesNotMatch(read('js/habits-ui.js'), /workspace-starter-v1|Plan your week/);
  assert.doesNotMatch(read('js/starter-examples.js'), /realLifeExamples|Camping at Tara/);
});

test('R67: the whole set passes state and backup validation', async () => {
  const { state, run } = harness();
  await run();
  const normalized = Core.normalizeState(plain(state));
  const result = Core.validateStateV3(normalized);
  assert.equal(result.ok, true, result.reason);
  assert.doesNotThrow(() => Backup.validateDomain(normalized, [], []));
  assert.doesNotThrow(() => Backup.validateDomain(plain(state), [], []));
});

test('R67: a second run adds nothing, a deleted example comes back alone, own items with the same name are reused', async () => {
  const first = harness();
  await first.run();
  const before = counts(first.state);
  await first.run();
  assert.deepEqual(counts(first.state), before);
  assert.equal(first.toasts.at(-1), 'Starter examples already present.');
  first.state.tasks.splice(first.state.tasks.findIndex(item => item.title === 'Battery'), 1);
  await first.run();
  assert.deepEqual(counts(first.state), before);
  const own = emptyState();
  own.tags.push({ id: 'tag_mine', name: 'private', color: '#123456', createdAt: stamp, updatedAt: stamp });
  own.areas.push({ id: 'area_mine', name: 'home', color: '#123456', icon: 'ph-house', status: 'active', isPinned: false, createdAt: stamp, updatedAt: stamp });
  const second = harness(own);
  await second.run();
  assert.equal(second.state.tags.filter(tag => tag.name.toLowerCase() === 'private').length, 1);
  assert.ok(second.state.tasks.find(item => item.title === 'Hubcaps').tagIds.includes('tag_mine'));
  assert.equal(named(second.state.projects, 'Groceries').areaId, 'area_mine');
});

test('R67: the toast counts what was added; a failed save removes every new example', async () => {
  const { toasts, run } = harness();
  await run();
  // R69: 108 tasks — the bucket list grew from 9 to 81. R70: plus the "Things to own" project and its 8 group tasks.
  // R71: two groups with 17 chores, a third template, a third note and four saved views, which the toast now counts.
  assert.equal(toasts.at(-1), 'Added 5 Areas, 10 Projects, 133 Tasks, 3 Goals, 10 Habits, 7 Tags, 3 Notes, 5 Resources, 3 Templates and 4 Saved views. All examples are editable.');
  const failing = harness(emptyState(), { saveOk: false });
  await failing.run();
  assert.deepEqual(counts(failing.state), { areas: 0, tags: 0, habits: 0, projects: 0, tasks: 0, goals: 0, notes: 0, resources: 0, templates: 0 });
  assert.equal(failing.toasts.at(-1), 'Could not save starter examples locally. Free up browser storage and try again.');
});

test('R67: the examples are Serbian in the app, and Settings describes them', () => {
  require('../js/i18n-sr.js');
  I18n.setLanguage('sr');
  try {
    let counter = 0;
    const out = Starter.workspaceExamples(emptyState(), { Core, uid: prefix => `${prefix}_${++counter}`, today: '2026-10-13', timestamp: stamp, habitDraft: () => ({}), PROJECT_COLORS });
    assert.deepEqual(out.areas.map(area => area.name), ['Lično', 'Posao', 'Dom', 'Zdravlje', 'Hobi i priroda']);
    // R70: "Treba da imam" joins the lists.
    // R71: then the two Redovne obaveze groups.
    assert.deepEqual(out.projects.map(project => project.name), ['Namirnice', 'Za kupovinu', 'Odeća', 'Motor', 'Za učenje', 'Bucket lista', 'Filmovi i serije', 'Treba da imam', 'Auto i motor', 'Zdravlje i računi']);
    assert.deepEqual(out.tags.map(tag => tag.name), ['Kuća', 'Privatno', 'Posao', 'Umetnost', 'Hobi', 'Zdravlje', 'Kupovina']);
    for (const title of ['Omekšivač', 'Pegla', 'Patosnice', 'Ratkapne', 'Alat', 'Lanac i lančanici', 'Akumulator', 'Letnja jakna', 'Dukserica', 'Čarape', 'Plan ishrane']) assert.ok(out.tasks.some(item => item.title === title), title);
    assert.deepEqual(out.templates.map(item => item.name), ['Kampovanje', 'Planinarenje', 'Nabavka za plan ishrane (4 dana)']); // R71
    assert.ok(out.templates[0].data.tasks.some(item => item.subtasks.some(sub => sub.title === 'Suvo pranje ruku')));
    assert.equal(I18n.tr('Around {month}', { month: 'novembar' }), 'Okvirno novembar');
  } finally { I18n.setLanguage('en'); }
  assert.match(read('js/settings-ui.js'), /tr\('Add missing editable examples: your Areas, shopping and learning lists, a bucket list, habits, camping and hiking templates, tags, books and goals\. Existing items and edits stay intact\.'\)/);
});

// --- Fixes after the code review ------------------------------------------------------------------------

test('R67 review: a goal whose project or habit already existed is manual, not stuck at 0%', async () => {
  const own = emptyState();
  own.habits.push({ id: 'habit_old', sampleKey: 'area-routines-v1:habit:daily:training', name: 'Training four times per week', routine: 'daily', status: 'active', goalIds: [], createdAt: stamp, updatedAt: stamp });
  own.projects.push({ id: 'project_old', name: 'Motorcycle', color: '#5362FF', areaId: null, goalIds: [], order: 0, isArchived: false, archivedAt: null, createdAt: stamp, updatedAt: stamp });
  const { state, run } = harness(own);
  await run();
  const shape = named(state.goals, 'Stay in shape', 'title');
  const motorcycle = named(state.goals, 'Get the motorcycle ready for the season', 'title');
  assert.deepEqual([shape.progressMode, plain(shape.habitLinks)], ['manual', []]);
  assert.deepEqual([motorcycle.progressMode, plain(motorcycle.projectLinks)], ['manual', []]);
  assert.deepEqual(plain(state.habits[0].goalIds), [], 'existing items are never changed');
});

test('R67 review: the motorcycle goal falls on the first April 1st at least a month away', () => {
  const target = today => {
    let counter = 0;
    const out = Starter.workspaceExamples(emptyState(), { Core, uid: prefix => `${prefix}_${++counter}`, today, timestamp: stamp, habitDraft: () => ({}), PROJECT_COLORS });
    return out.goals.find(goal => goal.title === 'Get the motorcycle ready for the season').targetDate;
  };
  assert.equal(target('2026-10-13'), '2027-04-01');
  assert.equal(target('2027-03-01'), '2027-04-01');
  assert.equal(target('2027-03-20'), '2028-04-01');
  assert.equal(target('2027-04-15'), '2028-04-01');
});

test('R67 review: Upcoming does not list a task twice when its due day is already shown', () => {
  const tasks = [task({ id: 'x', plannedMonth: '2026-11', dueDate: '2026-10-20' }), task({ id: 'y', plannedMonth: '2026-11', dueDate: '2026-12-20' })];
  assert.deepEqual(Core.deriveRoughMonths(tasks, '2026-10-13', '2026-11-03').map(group => [group.month, group.items.map(item => item.id)]), [['2026-11', ['y']]]);
  assert.deepEqual(Core.deriveRoughMonths(tasks, '2026-10-13').map(group => group.items.length), [2], 'without a window every month task is listed');
  assert.match(functionSource('renderUpcomingDays').source, /Core\.deriveRoughMonths\(source\.tasks, today, Core\.addDays\(today, UPCOMING_DAYS\)\)/);
});

test('R67 shipped as 2.0.0-alpha.94 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 94);
});
