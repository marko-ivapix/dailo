// Redesign R29: richer real-life starter examples for "Popuni primerima" — a camping packing list, a bucket list,
// everyday habits, goals with milestones, recurring chores, tags, notes, resources and templates.
// Spec: docs/superpowers/specs/2026-10-11-redesign-r29-real-life-examples.md
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

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const plain = value => JSON.parse(JSON.stringify(value));
const PROJECT_COLORS = ['#5362FF', '#30CBAD', '#A879FF', '#4CC9F0', '#F5B942', '#FF8A5B', '#F06A8A', '#8FD14F'];

function emptyState() {
  return { version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: Core.normalizeV16Settings({}), ui: {} };
}

function harness(state = emptyState(), { saveOk = true } = {}) {
  let adapter;
  let counter = 0;
  const toasts = [];
  runInNewContextWithI18n(read('js/habits-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } }, DailoStarterExamples: Starter }, requestAnimationFrame: run => run() });
  const draftCtx = withI18n({ Core });
  vm.createContext(draftCtx);
  vm.runInContext(fn('habitDraft'), draftCtx);
  const ctx = {
    state, Core, uid: prefix => `${prefix}_${++counter}`, nowIso: () => '2026-10-11T08:00:00.000Z',
    habitDraft: (...args) => plain(draftCtx.habitDraft(...args)), areaDefaults: { color: PROJECT_COLORS[0], icon: 'ph-circle' }, PROJECT_COLORS,
    saveState: () => saveOk, render() {}, setToastMessage: text => toasts.push(text), refreshHabitMetrics: () => Promise.resolve(),
  };
  const run = async () => { adapter.handleAction('add-starter-examples', null, ctx); await new Promise(resolve => setImmediate(resolve)); };
  return { ctx, state, run, toasts };
}

const byTitle = (items, title, field = 'title') => items.find(item => item[field] === title);
const counts = state => Object.fromEntries(['areas', 'tags', 'habits', 'projects', 'tasks', 'goals', 'notes', 'resources', 'templates'].map(key => [key, state[key].length]));

test('R29: the camping project has the trip tasks and a packing list by category as subtasks', async () => {
  const { state, run } = harness();
  await run();
  const camping = byTitle(state.projects, 'Camping at Tara', 'name');
  assert.ok(camping, 'the camping project exists');
  assert.equal(camping.areaId, byTitle(state.areas, 'Travel', 'name').id);
  const tasks = state.tasks.filter(task => task.projectId === camping.id);
  assert.deepEqual(tasks.map(task => task.title), ['Reserve a campsite', 'Check the weather forecast', 'Pack: tent and sleeping', 'Pack: kitchen and water', 'Pack: clothes', 'Pack: first aid and hygiene', 'Pack: often forgotten', 'Leave the campsite cleaner than you found it']);
  assert.deepEqual(tasks.map(task => task.projectOrder), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(byTitle(tasks, 'Reserve a campsite').dueDate, Core.addDays(Core.dateOnly(), 14));
  const subtasks = tasks.flatMap(task => task.subtasks);
  assert.ok(subtasks.length >= 35, `a real packing list, got ${subtasks.length}`);
  for (const title of ['Tent, stakes and rainfly', 'Sleeping bag rated for the night temperature', 'Camping stove and gas cartridge', 'Rain jacket', 'Spare socks', 'First aid kit: plasters, antiseptic, painkillers', 'Mosquito and tick repellent', 'Sunscreen', 'Toilet paper and wet wipes', 'Power bank and chargers', 'ID card and some cash']) {
    assert.ok(subtasks.some(item => item.title === title), title);
  }
  for (const task of tasks) {
    task.subtasks.forEach((item, order) => {
      assert.deepEqual(Object.keys(item).sort(), ['completedAt', 'id', 'isCompleted', 'order', 'title']);
      assert.deepEqual([item.order, item.isCompleted, item.completedAt], [order, false, null]);
    });
  }
  assert.equal(new Set(subtasks.map(item => item.id)).size, subtasks.length, 'every subtask has its own id');
  assert.ok(tasks.every(task => task.isInbox === false && task.isCompleted === false && task.recurrence === null));
});

test('R29: the bucket list holds undated "Someday" dreams', async () => {
  const { state, run } = harness();
  await run();
  const bucket = byTitle(state.projects, 'Bucket list', 'name');
  const someday = byTitle(state.tags, 'Someday', 'name');
  const dreams = state.tasks.filter(task => task.projectId === bucket.id);
  assert.ok(dreams.length >= 8);
  for (const title of ['See the northern lights', 'Skydive', 'Climb Bobotov Kuk on Durmitor', 'Raft the Tara river', 'Watch the sunrise from Rtanj']) assert.ok(byTitle(dreams, title), title);
  assert.ok(dreams.every(task => !task.plannedDate && !task.dueDate && task.tagIds.includes(someday.id)));
});

test('R29: everyday habits include numeric targets with quick values and different routines and frequencies', async () => {
  const { state, run } = harness();
  await run();
  const water = byTitle(state.habits, 'Drink 2 liters of water', 'name');
  assert.deepEqual([water.trackingType, water.targetValue, water.unit, plain(water.quickValues), water.routine], ['numeric', 2, 'l', [0.25, 0.5], 'daily']);
  const steps = byTitle(state.habits, '10,000 steps', 'name');
  assert.deepEqual([steps.trackingType, steps.targetValue, steps.unit], ['numeric', 10000, 'steps']);
  const spanish = byTitle(state.habits, 'Spanish 15 minutes', 'name');
  assert.deepEqual([spanish.frequencyType, plain(spanish.weekdays)], ['weekdays', [1, 2, 3, 4, 5]]);
  const call = byTitle(state.habits, 'Call your parents or a friend', 'name');
  assert.deepEqual([call.frequencyType, call.timesPerWeek], ['timesPerWeek', 2]);
  for (const name of ['Make the bed', 'Meditate 10 minutes', 'Five servings of fruit and vegetables', 'Write down expenses', 'No phone an hour before bed', 'Write down three good things']) assert.ok(byTitle(state.habits, name, 'name'), name);
  const added = state.habits.filter(habit => habit.sampleKey?.startsWith('workspace-starter-v2:'));
  assert.equal(added.length, 10);
  assert.deepEqual([...new Set(added.map(habit => habit.routine))].sort(), ['daily', 'morning', 'night']);
  assert.ok(added.every(habit => habit.areaId && habit.startDate === Core.dateOnly() && Array.isArray(habit.quickValues) && habit.status === 'active'));
});

test('R29: goals use numeric targets, milestones, linked habits and a linked project', async () => {
  const { state, run } = harness();
  await run();
  const books = byTitle(state.goals, 'Read 12 books in a year');
  assert.deepEqual([books.progressMode, books.progressType, books.currentValue, books.targetValue, books.unit, books.horizon], ['manual', 'numeric', 0, 12, 'books', 'long']);
  const race = byTitle(state.goals, 'Run a half marathon');
  assert.deepEqual(race.milestones.map(item => item.title), ['Run 5 km without stopping', 'Run 10 km', 'Run 15 km', 'Sign up for a race', 'Finish 21.1 km']);
  assert.deepEqual(race.milestones.map(item => item.order), [0, 1, 2, 3, 4]);
  assert.ok(race.milestones.every((item, index, list) => item.isCompleted === false && item.completedAt === null && (!index || list[index - 1].date < item.date)));
  assert.equal(race.milestones.at(-1).date, race.targetDate);
  assert.equal(byTitle(state.goals, 'Emergency fund for three months').milestones.length, 3);
  const spanishGoal = byTitle(state.goals, 'Learn Spanish to A1 level');
  const spanish = byTitle(state.habits, 'Spanish 15 minutes', 'name');
  assert.deepEqual(plain(spanishGoal.habitLinks), [{ habitId: spanish.id, metric: 'totalCheckins', target: 60 }]);
  assert.equal(spanishGoal.progressMode, 'linkedHabits');
  assert.ok(spanish.goalIds.includes(spanishGoal.id), 'the habit links back');
  const nature = byTitle(state.goals, 'Spend more time in nature');
  const camping = byTitle(state.projects, 'Camping at Tara', 'name');
  assert.deepEqual(plain(nature.projectLinks), [{ projectId: camping.id, contributionMode: 'allTasks', selectedTaskIds: [] }]);
  assert.ok(camping.goalIds.includes(nature.id), 'the project links back');
});

test('R29: recurring chores repeat weekly, monthly, every few months and yearly', async () => {
  const { state, run } = harness();
  await run();
  const rule = title => { const task = byTitle(state.tasks, title); assert.ok(task, title); assert.equal(task.recurrence.seriesId, task.id); assert.ok(task.plannedDate && task.dueDate); return [task.recurrence.frequency, task.recurrence.interval]; };
  assert.deepEqual(rule('Pay the bills (electricity, water, internet)'), ['monthly', 1]);
  assert.deepEqual(rule('Change the bed sheets'), ['weekly', 2]);
  assert.deepEqual(rule('Replace the water filter'), ['monthly', 3]);
  assert.deepEqual(rule('Check medicine expiry dates'), ['monthly', 6]);
  assert.deepEqual(rule('Dental check-up'), ['monthly', 6]);
  assert.deepEqual(rule('Car registration and technical inspection'), ['yearly', 1]);
});

test('R29: tags for context, energy and waiting, plus the moving and birthday projects use them', async () => {
  const { state, run } = harness();
  await run();
  for (const name of ['Quick (5 min)', 'Waiting for', 'Phone', 'Computer', 'Shopping', 'Someday', 'Low energy']) {
    const tag = byTitle(state.tags, name, 'name');
    assert.ok(tag, name);
    assert.match(tag.color, /^#[0-9A-Fa-f]{6}$/, 'hex colors only (S-4)');
  }
  const moving = byTitle(state.projects, 'Moving to a new apartment', 'name');
  const box = byTitle(state.tasks, 'Pack a first-night box');
  assert.equal(box.projectId, moving.id);
  assert.ok(box.subtasks.length >= 5);
  assert.ok(byTitle(state.tasks, 'Get the deposit back from the landlord').tagIds.includes(byTitle(state.tags, 'Waiting for', 'name').id));
  const party = byTitle(state.projects, 'Birthday party', 'name');
  assert.ok(state.tasks.filter(task => task.projectId === party.id).length >= 5);
});

test('R29: notes and resources carry real content and links', async () => {
  const { state, run } = harness();
  await run();
  assert.match(byTitle(state.notes, 'Books to read').body, /Ivo Andrić/);
  const numbers = byTitle(state.notes, 'Emergency numbers').body;
  for (const number of ['112', '192', '193', '194', '1987']) assert.ok(numbers.includes(number), number);
  for (const title of ['Gift ideas', 'Movies and series to watch', 'Recipe: proja (cornbread)']) assert.ok(byTitle(state.notes, title), title);
  const links = state.resources.flatMap(item => item.linkUrls);
  for (const url of ['https://www.pss.rs', 'https://www.nptara.rs', 'https://lnt.org/why/7-principles/', 'https://www.who.int/europe/news-room/fact-sheets/item/physical-activity', 'https://jamesclear.com/atomic-habits']) assert.ok(links.includes(url), url);
  const book = byTitle(state.resources, 'Atomic Habits');
  assert.deepEqual([book.type, book.author, book.status], ['book', 'James Clear', 'unread']);
  const camping = byTitle(state.projects, 'Camping at Tara', 'name');
  assert.ok(byTitle(state.resources, 'Leave No Trace: the seven principles').relatedProjectIds.includes(camping.id));
});

test('R29: two templates — packing for a trip and the camping weekend — that create real items', async () => {
  const { state, run } = harness();
  await run();
  const packing = byTitle(state.templates, 'Packing for a trip', 'name');
  assert.equal(packing.type, 'task');
  assert.ok(packing.data.subtasks.length >= 8);
  const created = Core.instantiateTemplate(packing, '2026-10-20', { nowIso: '2026-10-11T08:00:00.000Z', state }).task;
  assert.ok(created.subtasks.some(item => item.title === 'Travel health insurance'));
  const weekend = byTitle(state.templates, 'Camping weekend', 'name');
  assert.equal(weekend.type, 'project');
  const project = Core.instantiateTemplate(weekend, '2026-10-20', { nowIso: '2026-10-11T08:00:00.000Z', state });
  assert.equal(project.tasks.length, 8);
  assert.ok(project.tasks.find(task => task.title === 'Pack: clothes').subtasks.some(item => item.title === 'Rain jacket'));
  assert.deepEqual(plain(weekend.data.goalIds), [], 'a new camping weekend does not join the example goal');
  assert.ok(state.templates.every(item => item.sampleKey?.startsWith('workspace-starter-v2:') && item.createdAt && item.updatedAt && item.id));
});

test('R29: the whole example workspace passes state and backup validation', async () => {
  const { state, run } = harness();
  await run();
  const normalized = Core.normalizeState(plain(state));
  const result = Core.validateStateV3(normalized);
  assert.equal(result.ok, true, result.reason);
  assert.doesNotThrow(() => Backup.validateDomain(normalized, [], []));
});

test('R29: a second run adds nothing, a deleted example comes back alone, and own items with the same name are reused', async () => {
  const first = harness();
  await first.run();
  const before = counts(first.state);
  await first.run();
  assert.deepEqual(counts(first.state), before);
  assert.equal(first.toasts.at(-1), 'Starter examples already present.');
  const index = first.state.tasks.findIndex(task => task.title === 'Pack: clothes');
  first.state.tasks.splice(index, 1);
  await first.run();
  assert.deepEqual(counts(first.state), before);
  assert.equal(first.state.tasks.filter(task => task.title === 'Pack: clothes').length, 1);
  const own = emptyState();
  own.tags.push({ id: 'tag_mine', name: 'someday', color: '#123456', createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z' });
  const second = harness(own);
  await second.run();
  assert.equal(second.state.tags.filter(tag => tag.name.toLowerCase() === 'someday').length, 1);
  assert.ok(second.state.tasks.find(task => task.title === 'Skydive').tagIds.includes('tag_mine'));
});

test('R29: the toast counts templates too; a failed save removes every new example', async () => {
  const { toasts, run } = harness();
  await run();
  assert.match(toasts.at(-1), /^Added 8 Areas, \d+ Projects, \d+ Tasks, \d+ Goals, 22 Habits, 13 Tags, 6 Notes, 6 Resources and 2 Templates\. All examples are editable\.$/);
  const failing = harness(emptyState(), { saveOk: false });
  await failing.run();
  assert.deepEqual(counts(failing.state), { areas: 0, tags: 0, habits: 0, projects: 0, tasks: 0, goals: 0, notes: 0, resources: 0, templates: 0 });
  assert.equal(failing.toasts.at(-1), 'Could not save starter examples locally. Free up browser storage and try again.');
});

test('R29: the examples are Serbian in the app', () => {
  require('../js/i18n-sr.js');
  I18n.setLanguage('sr');
  try {
    const state = emptyState();
    let counter = 0;
    const extra = Starter.realLifeExamples(state, { Core, uid: prefix => `${prefix}_${++counter}`, today: '2026-10-11', timestamp: '2026-10-11T08:00:00.000Z', habitDraft: () => ({}), PROJECT_COLORS });
    assert.ok(extra.projects.some(project => project.name === 'Kampovanje na Tari'));
    assert.ok(extra.projects.some(project => project.name === 'Bucket lista'));
    assert.ok(extra.tasks.some(task => task.subtasks.some(item => item.title === 'Šator, kočići i nadstrešnica')));
    assert.ok(extra.habits.some(habit => habit.name === 'Popij 2 litra vode' && habit.unit === 'l'));
    assert.ok(extra.tags.some(tag => tag.name === 'Jednog dana'));
  } finally { I18n.setLanguage('en'); }
});

test('R29: the examples load before the habits module, work offline and the Settings row names them', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('src="js/starter-examples.js"') > 0 && html.indexOf('src="js/starter-examples.js"') < html.indexOf('src="js/habits-ui.js"'));
  assert.match(read('sw.js'), /'js\/starter-examples\.js',\n  'js\/habits-ui\.js',/);
  assert.match(read('js/settings-ui.js'), /tr\('Add missing editable examples from everyday life: habits, goals, a bucket list, a camping packing list, recurring chores, tags, notes, resources and templates\. Existing items and edits stay intact\.'\)/);
});

test('R29 shipped as 2.0.0-alpha.54 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 54);
});

test('R29: the first set\'s goals save a valid progress type, and an invalid stored one reads as a percentage', async () => {
  const { state, run } = harness();
  await run();
  assert.ok(state.goals.every(goal => ['percentage', 'numeric'].includes(goal.progressType)), 'without normalizing first');
  assert.doesNotThrow(() => Backup.validateDomain(plain(state), [], []));
  const stored = { ...emptyState(), goals: [{ id: 'goal_old', title: 'Old', progressMode: 'linkedTasks', progressType: 'linkedTasks', createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z' }, { id: 'goal_numeric', title: 'Numeric', progressMode: 'manual', progressType: 'numeric', currentValue: 2, targetValue: 5, createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z' }] };
  assert.deepEqual(Core.normalizeState(stored).goals.map(goal => goal.progressType), ['percentage', 'numeric']);
});
