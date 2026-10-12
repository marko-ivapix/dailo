// Redesign R30: the third design pass, bugs on the tasks side (findings 1, 2, 3, 5, 6, 7, 8).
// Spec: docs/superpowers/specs/2026-10-12-design-pass-3.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const plain = value => JSON.parse(JSON.stringify(value));
const TODAY = '2026-10-12';

test('3: Quick Add reads "18h", "u 18h" and "u 18" as a time; short hours and "24h" stay durations; "za" goes with a duration', () => {
  const parse = text => { const r = Core.parseQuickAdd(text, { today: TODAY }); return [r.title, r.plannedDate, r.plannedTime, r.durationMinutes]; };
  assert.deepEqual(parse('Kupi mleko sutra 18h'), ['Kupi mleko', '2026-10-13', '18:00', null]);
  assert.deepEqual(parse('Kupi mleko sutra u 18h'), ['Kupi mleko', '2026-10-13', '18:00', null]);
  assert.deepEqual(parse('Kupi mleko sutra u 18'), ['Kupi mleko', '2026-10-13', '18:00', null]);
  assert.deepEqual(parse('Sastanak u 9h'), ['Sastanak', null, '09:00', null]);
  assert.deepEqual(parse('Trening 2h'), ['Trening', null, null, 120]);
  assert.deepEqual(parse('Smena 8h'), ['Smena', null, null, 480], 'up to 8 hours is a duration');
  assert.deepEqual(parse('Put 24h'), ['Put', null, null, 1440]);
  assert.deepEqual(parse('Napiši izveštaj sutra za 30 min'), ['Napiši izveštaj', '2026-10-13', null, 30]);
  assert.deepEqual(parse('Napiši izveštaj za 2 sata'), ['Napiši izveštaj', null, null, 120]);
  assert.deepEqual(parse('Plati račune za 3 dana'), ['Plati račune', '2026-10-15', null, null], 'za N dana is still a date');
  assert.deepEqual(parse('Kupi mleko sutra u 25h'), ['Kupi mleko sutra u 25h', null, null, null], 'an hour that does not exist is left alone');
  assert.match(fn('quickParsePreview'), /item\('ph-timer', durationLabel\(parsed\.durationMinutes\)\)/);
});

function pickerCtx(source, projects) {
  const ctx = { sortedProjects: () => projects, sortedAreas: () => [], taskRecurrence: task => task?.recurrence || null };
  vm.createContext(ctx);
  vm.runInContext(fn('projectPickerGroups'), ctx);
  return plain(ctx.projectPickerGroups(source));
}

test('1: the project sheet offers groups of Redovne obaveze only for a repeating task or one already in a group', () => {
  const projects = [{ id: 'p1', name: 'Posao' }, { id: 'room', name: 'Kuhinja', isCleaningRoom: true }];
  assert.deepEqual(pickerCtx({ projectId: null }, projects), { projects: [{ id: 'p1', name: 'Posao' }], groups: [] });
  assert.deepEqual(pickerCtx({ projectId: null, recurrence: { frequency: 'weekly' } }, projects).groups.map(item => item.id), ['room']);
  assert.deepEqual(pickerCtx({ projectId: 'room' }, projects).groups.map(item => item.id), ['room']);
  assert.match(fn('openProjectPicker'), /projectPickerGroups\(source\)/);
  assert.match(fn('openProjectPicker'), /tr\('Recurring tasks'\)/);
});

test('1: Kad stignem lists a task that sits in a group under the group\'s name, so nothing disappears', () => {
  const screen = fn('renderTasksScreen');
  assert.match(screen, /const anytimeGroups = sortedProjects\(\);/);
  assert.match(screen, /for \(const project of anytimeGroups\) \{/);
});

function suggestionsCtx(tasks) {
  const calls = [];
  const ctx = withI18n({
    Core: { ...Core, dateOnly: () => TODAY }, listTasks: () => tasks, nextOrder: () => 5, nowIso: () => '2026-10-12T10:00:00.000Z',
    saveAndRender: () => calls.push('save'), saveState: () => calls.push('saveState'), render: () => calls.push('render'),
    setUndo: (message, undo) => calls.push(['undo', message, undo]), taskRecurrence: task => task?.recurrence || null,
  });
  vm.createContext(ctx);
  vm.runInContext(fn('addAllSuggestions'), ctx);
  return { ctx, calls };
}

test('2: "Dodaj sve u Danas" plans only the tasks that do not repeat and can be undone', () => {
  const task = (id, extra) => ({ id, title: id, isCompleted: false, isInbox: false, plannedDate: null, dueDate: TODAY, todayOrder: null, updatedAt: 'old', ...extra });
  const tasks = [task('a'), task('b', { plannedDate: '2026-10-11' }), task('rep', { recurrence: { frequency: 'weekly', interval: 1 } })];
  const { ctx, calls } = suggestionsCtx(tasks);
  ctx.addAllSuggestions();
  assert.deepEqual(tasks.map(item => item.plannedDate), [TODAY, TODAY, null], 'the repeating task keeps its own "+ Danas" and its question');
  assert.deepEqual(tasks.slice(0, 2).map(item => item.todayOrder), [5, 6]);
  const undo = calls.find(call => call[0] === 'undo');
  assert.equal(undo[1], 'Added to Today');
  undo[2]();
  assert.deepEqual(tasks.map(item => [item.plannedDate, item.todayOrder, item.updatedAt]), [[null, null, 'old'], ['2026-10-11', null, 'old'], [null, null, 'old']]);
  assert.match(fn('renderTasksScreen'), /suggestions\.some\(item => !taskRecurrence\(item\.task\)\) \? `<button class="btn btn-ghost" type="button" data-action="add-all-suggestions">/);
});

test('8: Danas links to the suggestions in Zadaci when there are any', () => {
  assert.match(fn('renderToday'), /const suggestions = Core\.deriveTodaySections\(listTasks\(\), today\)\.suggestions;/);
  assert.match(fn('renderToday'), /data-action="open-today-suggestions"/);
  assert.match(app, /else if \(action === 'open-today-suggestions'\) \{ state\.ui\.suggestionsExpanded = true; navigate\('#tasks'\); \}/);
  assert.match(read('css/styles.css'), /\.today-suggestions-link \{/);
});

function projectCtx(task) {
  const calls = [];
  const ctx = {
    modalState: null, getTask: id => (id === task.id ? task : null), closePopover: () => {}, nowIso: () => 'now',
    requestTaskEdit: (id, changes) => { calls.push(['edit', changes]); Object.assign(task, changes); return false; },
    setUndo: (message, undo) => calls.push(['undo', message, undo]), saveState: () => {}, render: () => {}, renderModal: () => {}, msg: text => text,
  };
  vm.createContext(ctx);
  vm.runInContext(fn('setProject'), ctx);
  return { ctx, calls };
}

test('6: "Bez projekta" on an Inbox task sorts it out of Inbox, keeps its area, and can be undone', () => {
  const task = { id: 't', isInbox: true, projectId: null, areaId: 'area-1' };
  const { ctx, calls } = projectCtx(task);
  ctx.setProject('task', 't', '');
  assert.deepEqual(plain(calls[0][1]), { projectId: null, isInbox: false });
  assert.equal(task.areaId, 'area-1');
  calls.find(call => call[0] === 'undo')[2]();
  assert.equal(task.isInbox, true);
  const other = { id: 't', isInbox: true, projectId: null, areaId: 'area-1' };
  const moved = projectCtx(other);
  moved.ctx.setProject('task', 't', 'p1');
  assert.deepEqual(plain(moved.calls[0][1]), { projectId: 'p1', areaId: null, isInbox: false }, 'a project still takes the area\'s place');
});

test('7: the reminder sheet never proposes a time that has passed, and the sentence keeps "danas" lowercase', () => {
  const ctx = withI18n({ Core: { ...Core, dateOnly: () => TODAY } });
  vm.createContext(ctx);
  vm.runInContext(fn('reminderStart'), ctx);
  const now = new Date('2026-10-12T11:00:00');
  const later = { date: TODAY, time: '14:00' }, tomorrow = { date: '2026-10-13', time: '09:00' };
  assert.deepEqual(plain(ctx.reminderStart({ date: TODAY, time: '09:00' }, [later, tomorrow], now)), later, 'today 09:00 has passed at 11:00');
  assert.deepEqual(plain(ctx.reminderStart({ date: '2026-10-14', time: '09:00' }, [later, tomorrow], now)), { date: '2026-10-14', time: '09:00' });
  assert.deepEqual(plain(ctx.reminderStart({ date: TODAY, time: '09:00' }, [{ date: TODAY, time: '08:00' }, tomorrow], now)), tomorrow, 'a passed preset is skipped too');
  assert.match(fn('openReminderPicker'), /presets = presets\.filter\(\(\[, value\]\) => new Date\(`\$\{value\.date\}T\$\{value\.time\}:00`\) > new Date\(\)\);/);
  assert.match(fn('applyReminderSheet'), /if \(value && new Date\(value\) <= new Date\(\)\) \{ Object\.assign\(reminderSheet, \{ date, time, error: msg\('That time has passed\. Choose a later one\.'\) \}\); refreshSheet\(reminderSheetHtml\(\)\); return; \}/);
  assert.match(app, /tr\('Remind me \{date\} at \{time\}', \{ date: lowerFirst\(relativeDateLabel\(date\)\), time \}\)/);
  assert.match(app, /tr\('Remind me \{date\} at \{time\}', \{ date: lowerFirst\(relativeDateLabel\(reminderSheet\.date\)\), time: reminderSheet\.time \}\)/);
});

function sampleCtx({ untouched = true, dismissed = false } = {}) {
  const calls = [];
  const storage = new Map(dismissed ? [['dailoSampleNotice', 'x']] : []);
  const state = { tasks: [{ id: 't1' }], projects: [{ id: 'p1' }], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: { weekStartsOn: 'monday' }, ui: {} };
  const ctx = withI18n({
    state, untouchedSample: () => untouched, nowIso: () => 'now', esc: value => String(value),
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    saveState: () => { calls.push('save'); return true; }, render: () => calls.push('render'), setUndo: (message, undo) => calls.push(['undo', message, undo]),
    globalThis: {},
  });
  vm.createContext(ctx);
  vm.runInContext(['sampleNotice', 'dismissSampleNotice', 'startEmpty'].map(fn).join('\n'), ctx);
  return { ctx, calls, storage, state };
}

test('5: a new workspace says its examples are examples: Počni prazno (with Undo) or Zadrži', () => {
  const { ctx, calls, storage, state } = sampleCtx();
  const html = ctx.sampleNotice();
  assert.match(html, /data-sample-notice/);
  assert.match(html, /data-action="sample-start-empty"/);
  assert.match(html, /data-action="sample-keep"/);
  assert.equal(sampleCtx({ untouched: false }).ctx.sampleNotice(), '', 'edited examples are the user\'s now');
  assert.equal(sampleCtx({ dismissed: true }).ctx.sampleNotice(), '');
  ctx.startEmpty();
  assert.deepEqual([state.tasks.length, state.projects.length], [0, 0]);
  assert.deepEqual(state.settings, { weekStartsOn: 'monday' }, 'settings stay');
  assert.ok(storage.has('dailoSampleNotice'));
  const undo = calls.find(call => call[0] === 'undo');
  assert.equal(undo[1], 'Examples removed');
  undo[2]();
  assert.deepEqual(plain([state.tasks, state.projects]), [[{ id: 't1' }], [{ id: 'p1' }]]);
  assert.ok(!storage.has('dailoSampleNotice'), 'after Poništi the card asks again');
  const untouchedGone = sampleCtx({ untouched: false });
  untouchedGone.ctx.startEmpty();
  assert.equal(untouchedGone.state.tasks.length, 1, 'nothing is removed once the examples were changed');
  assert.match(fn('renderToday'), /html \+= sampleNotice\(\);/);
});

test('5: the examples no longer start with a late task', () => {
  const ctx = withI18n({ Core: { ...Core, dateOnly: () => TODAY }, nowIso: () => '2026-10-12T08:00:00.000Z', PROJECT_COLORS: ['#5362FF', '#30CBAD', '#A879FF'], VERSION: 3, SHORTCUT_DEFAULTS: {} });
  vm.createContext(ctx);
  vm.runInContext(`${fn('createEmptyState')}\n${fn('createSampleState')}`, ctx);
  const sample = ctx.createSampleState();
  assert.deepEqual(plain(sample.tasks.filter(task => !task.isCompleted && task.dueDate && task.dueDate < TODAY).map(task => task.id)), []);
});

test('R30 shipped as 2.0.0-alpha.56 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 56);
});
