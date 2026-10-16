// R105: fixes from the review of R83–R92. Editing a habit keeps its duration. The Inbox add row keeps the words it does
// not use (a repeat or a time stays in the title), and +project/@area stay as typed there. Task and habit templates keep
// "Od dana završetka" and the habit's duration. A tag whose name has a space or diacritics is read from its suggestion
// ("#kod-kuće", "#kuca"). A habit with a weekly target counts whole weeks for its 30-day success. "do pola deset" is not
// a planned time. The habit duration field steps by one minute. A pasted list keeps leading numbers unless they count
// 1, 2, 3…. What was typed before a paste (+project, @area, #tags, !priority) applies to every pasted line. The
// day a repeat sets is tapped back together with the repeat. "Zatvori dan" waits for the evening (18:00 at the earliest)
// even with a morning journal reminder. Poništi after "Sve na sutra" and "Zatvori dan → sutra" keeps tasks added
// meanwhile.
// Spec: docs/superpowers/specs/2026-10-15-r105-review-fixes.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const fn = name => functionSource(name).source;
const plain = value => JSON.parse(JSON.stringify(value));
const TODAY = '2026-10-15', TOMORROW = '2026-10-16';

test('editing a habit keeps its duration', () => {
  const ctx = vm.createContext({ Core });
  vm.runInContext(fn('habitDraft'), ctx);
  assert.equal(ctx.habitDraft({ name: 'Šetnja', durationMinutes: 30 }).durationMinutes, 30);
  assert.equal(ctx.habitDraft(null).durationMinutes, null);
  assert.match(read('js/habits-ui.js'), /id="habit-duration" class="input" type="number" min="1" max="1440" step="1" inputmode="numeric"/);
});

test('the Inbox add row keeps the words it does not use; #tags and !priority still count', () => {
  const tasks = [];
  const ctx = vm.createContext({
    Core: { ...Core, dateOnly: () => TODAY }, state: { tasks, tags: [{ id: 'home', name: 'Kuća' }], projects: [{ id: 'p', name: 'Posao' }], areas: [{ id: 'a', name: 'Dom' }] },
    newTaskRecord: fields => ({ id: `t${tasks.length + 1}`, ...fields }), nextOrder: () => 1, saveState: () => true, render() {}, requestAnimationFrame() {}, $: () => null,
  });
  vm.runInContext(fn('addToInbox'), ctx);
  ctx.addToInbox('Teretana utorkom #kuca !visok');
  ctx.addToInbox('Nazovi mamu u osam +Posao @Dom');
  assert.deepEqual(plain(tasks.map(item => [item.title, item.tagIds, item.priority])), [['Teretana utorkom', ['home'], 'high'], ['Nazovi mamu u osam +Posao @Dom', [], 'none']]);
});

test('templates keep "Od dana završetka" and the habit\'s duration', () => {
  const task = { id: 't', title: 'Zalij cveće', recurrence: { frequency: 'daily', interval: 3, afterCompletion: true, status: 'active', endType: 'never', seriesId: 't' }, subtasks: [] };
  const data = Core.templateFromEntity('task', task, {}, TODAY).data;
  assert.equal(data.recurrence.afterCompletion, true);
  const made = Core.instantiateTemplate({ type: 'task', data }, TODAY, { makeId: prefix => `${prefix}-1`, nowIso: `${TODAY}T10:00:00.000Z` }).task;
  assert.deepEqual([made.recurrence.afterCompletion, made.recurrence.interval], [true, 3]);
  const calendar = Core.templateFromEntity('task', { ...task, recurrence: { frequency: 'weekly', interval: 1, weekdays: [2], status: 'active', endType: 'never' } }, {}, TODAY).data;
  assert.equal(Object.hasOwn(calendar.recurrence, 'afterCompletion'), false, 'a calendar repeat gets no flag');
  const habit = { id: 'h', name: 'Šetnja', trackingType: 'checkbox', frequencyType: 'daily', durationMinutes: 30, reminders: [] };
  const habitData = Core.templateFromEntity('habit', habit, {}, TODAY).data;
  assert.equal(habitData.durationMinutes, 30);
  assert.equal(Core.instantiateTemplate({ type: 'habit', data: habitData }, TODAY, { makeId: prefix => `${prefix}-1` }).habit.durationMinutes, 30);
  const without = Core.instantiateTemplate({ type: 'habit', data: Core.templateFromEntity('habit', { ...habit, durationMinutes: undefined }, {}, TODAY).data }, TODAY, { makeId: prefix => `${prefix}-1` }).habit;
  assert.equal(Object.hasOwn(without, 'durationMinutes'), false, 'no duration, no empty field');
});

test('a tag with a space or diacritics is read the way its suggestion writes it', () => {
  const tags = [{ id: 'home', name: 'kod kuće' }, { id: 'house', name: 'Kuća' }];
  const options = { today: TODAY, tags };
  assert.equal(Core.quickSuggestions('Usisaj #kod', { tags })[0].insert, '#kod-kuće');
  assert.deepEqual(plain(Core.parseQuickAdd('Usisaj #kod-kuće', options)).tagIds, ['home']);
  assert.equal(Core.parseQuickAdd('Usisaj #kod-kuće', options).title, 'Usisaj');
  assert.deepEqual(plain(Core.parseQuickAdd('Operi prozore #kuca', options)).tagIds, ['house']);
  assert.equal(Core.parseQuickAdd('Operi prozore #nepoznata', options).title, 'Operi prozore #nepoznata', 'an unknown tag stays in the title');
});

test('a weekly-target habit\'s 30-day success counts whole weeks, and this week once its target is met', () => {
  const habit = { id: 'w', status: 'active', trackingType: 'checkbox', frequencyType: 'timesPerWeek', timesPerWeek: 3, startDate: '2026-01-01' };
  const log = date => ({ id: `w:${date}`, habitId: 'w', date, status: 'done', value: null });
  const monWedFri = start => [0, 2, 4].map(offset => log(Core.addDays(start, offset)));
  // Today is Thursday 15 October; the 30 days start on Wednesday 16 September. Whole weeks: 21 Sep, 28 Sep and 5 Oct.
  const logs = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'].flatMap(monWedFri).concat([log('2026-10-12'), log('2026-10-14')]);
  assert.equal(Core.habitRecentSuccess(habit, logs, TODAY, 'monday'), 100, 'every whole week met its target; this week is still open');
  const short = logs.filter(item => item.date !== '2026-10-02');
  assert.equal(Core.habitRecentSuccess(habit, short, TODAY, 'monday'), 89, 'one week with two of three');
  assert.equal(Core.habitRecentSuccess(habit, [...logs, log('2026-10-15')], TODAY, 'monday'), 100, 'this week counts once met');
  assert.equal(Core.habitRecentSuccess({ ...habit, startDate: '2026-10-13' }, logs, TODAY, 'monday'), null, 'no whole week yet');
});

test('"do pola deset" is not a planned time; "u pola deset" still is', () => {
  const late = Core.parseQuickAdd('Završi izveštaj do pola deset', { today: TODAY });
  assert.deepEqual([late.title, late.plannedTime], ['Završi izveštaj do pola deset', null]);
  assert.equal(Core.parseQuickAdd('Završi izveštaj u pola deset', { today: TODAY }).plannedTime, '09:30');
});

test('a pasted list keeps leading numbers that are not a 1, 2, 3… count', () => {
  assert.deepEqual(Core.splitPastedList('15. maj platiti račun\n16. maj kupiti kartu'), ['15. maj platiti račun', '16. maj kupiti kartu']);
  assert.deepEqual(Core.splitPastedList('1. Mleko\n2) Hleb\n3. Jaja'), ['Mleko', 'Hleb', 'Jaja']);
  assert.deepEqual(Core.splitPastedList('- 10. 11. sastanak\n- Kupi so'), ['10. 11. sastanak', 'Kupi so']);
});

test('what was typed before a paste applies to every pasted line', () => {
  const tasks = [];
  const state = { tasks, tags: [{ id: 'urgent', name: 'hitno' }], projects: [{ id: 'home', name: 'Kuća' }], areas: [], settings: {} };
  const calls = [];
  const ctx = withI18n({
    state, Core: { ...Core, dateOnly: () => TODAY }, modalState: { type: 'quick', draft: { title: '+Kuća #hitno !visok', tagIds: [], keepInTitle: [] }, pasteLines: ['Mleko', 'Hleb #hitno', 'Jaja danas'] },
    syncQuickDraftFromDom() {}, newTaskRecord: fields => ({ id: `t${tasks.length + 1}`, ...fields }), nextOrder: () => 1, getProject: id => state.projects.find(item => item.id === id),
    saveState: () => true, closeModal: () => calls.push('close'), render() {}, setUndo: () => calls.push('undo'),
  });
  vm.createContext(ctx);
  vm.runInContext(['parseQuickAddTitle', 'quickPlace', 'createPastedTasks'].map(fn).join('\n'), ctx);
  ctx.createPastedTasks();
  assert.deepEqual(plain(tasks.map(item => [item.title, item.projectId, item.tagIds, item.priority, item.plannedDate])), [
    ['Mleko', 'home', ['urgent'], 'high', null], ['Hleb', 'home', ['urgent'], 'high', null], ['Jaja', 'home', ['urgent'], 'high', TODAY],
  ]);
  assert.deepEqual(calls, ['close', 'undo']);
});

test('the day a repeat sets is tapped back together with the repeat', () => {
  const parsed = Core.parseQuickAdd('Teretana utorkom', { today: TODAY, sources: true });
  assert.ok(parsed.plannedDate && !parsed.sources.plannedDate && parsed.sources.recurrence);
  const ctx = withI18n({ esc: value => String(value ?? ''), relativeDateLabel: date => `L:${date}`, recurrenceLabel: () => 'Utorkom', getProject: () => null, getArea: () => null, getTag: () => null });
  vm.createContext(ctx);
  vm.runInContext(fn('quickParsePreview'), ctx);
  const html = ctx.quickParsePreview(parsed);
  assert.match(html, /data-slot="recurrence"[^>]*><i class="ph ph-calendar-check" aria-hidden="true"><\/i>L:/, 'the day chip keeps the repeat words');
  assert.doesNotMatch(html, /data-slot="plannedDate"/);
  assert.match(ctx.quickParsePreview(Core.parseQuickAdd('Teretana sutra', { today: TODAY, sources: true })), /data-slot="plannedDate"/, 'a written day keeps its own slot');
});

const task = (id, fields = {}) => ({ id, title: id, isCompleted: false, isInbox: false, plannedDate: TODAY, dueDate: null, todayOrder: 1, recurrence: null, updatedAt: 'old', ...fields });
function closeDay(tasks, { time = '21:00', settings = {} } = {}) {
  const app = read('js/app.js');
  const ctx = withI18n({
    state: { tasks, settings }, Core: { ...Core, dateOnly: value => (value ? Core.dateOnly(value) : TODAY) }, JSON, Map, Set, Date,
    nowIso: () => new Date(`${TODAY}T${time}:00`).toISOString(), esc: value => String(value), localStorage: { getItem: () => null, setItem() {} },
    listTasks: () => ctx.state.tasks, taskRecurrence: item => item.recurrence || null, copyTemplate: value => JSON.parse(JSON.stringify(value)), removeCloneGoalLinks() {},
    saveState: () => true, render() {}, setToastMessage() {}, setUndo: (message, undo) => { ctx.undo = undo; },
  });
  vm.createContext(ctx);
  vm.runInContext(`let archivedTasks = [];\n${app.match(/  const CLOSE_DAY_LATER_KEY = [^\n]+/)[0]}\n${['historyTasks', 'snapshotTasks', 'restoreTasks', 'restoreCopies', 'closeDayOpenTasks', 'closeDayNotice', 'moveTodayToTomorrow'].map(fn).join('\n')}`, ctx);
  return ctx;
}

test('"Zatvori dan" waits for the evening even with a morning journal reminder', () => {
  const morning = { journalReminderTime: '07:00' };
  assert.equal(closeDay([task('a')], { time: '09:00', settings: morning }).closeDayNotice(), '', 'not in the morning');
  assert.notEqual(closeDay([task('a')], { time: '18:05', settings: morning }).closeDayNotice(), '', 'from 18:00');
  assert.notEqual(closeDay([task('a')], { time: '18:30', settings: { journalReminderTime: '18:00' } }).closeDayNotice(), '', 'a journal time in the evening still counts (R84)');
});

test('Poništi after moving the day to tomorrow keeps a task added meanwhile', () => {
  const ctx = closeDay([task('a'), task('b')]);
  ctx.moveTodayToTomorrow();
  assert.deepEqual(ctx.state.tasks.map(item => item.plannedDate), [TOMORROW, TOMORROW]);
  ctx.state.tasks.push(task('new', { plannedDate: TOMORROW }));
  ctx.undo();
  assert.deepEqual(plain(ctx.state.tasks.map(item => [item.id, item.plannedDate])), [['a', TODAY], ['b', TODAY], ['new', TOMORROW]]);
  const app = read('js/app.js');
  assert.match(fn('moveAllOverdueToTomorrow'), /setUndo\(msg\('Past-due tasks moved to tomorrow'\), \(\) => \{ restoreCopies\(snapshot\); saveState\(\); render\(\); \}\);/);
  assert.ok(app.includes('function restoreCopies(snapshot)'));
});

test('R105 shipped as 2.0.0-alpha.134 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 134) >= 134);
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs/superpowers/specs/2026-10-15-r105-review-fixes.md')));
});
