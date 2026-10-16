// R84: "Zatvori dan". In the evening (from the journal reminder time, 20:00 without one) Danas offers to close the day
// while tasks planned for today are still open: go through them one at a time (Sutra, Kad stignem, Datum…, Završi,
// Otvori, Obriši) or move them all to tomorrow in one step with Undo (the AGENTS.md exception the user chose). The pass
// ends with "Zapiši kako je prošao dan". "Ne danas" hides the card until tomorrow on this device.
// Spec: docs/superpowers/specs/2026-10-15-r84-close-day.md
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
const app = read('js/app.js');
const TODAY = '2026-10-15', TOMORROW = '2026-10-16';
const task = (id, fields = {}) => ({ id, title: id, isCompleted: false, isInbox: false, plannedDate: TODAY, dueDate: null, todayOrder: 1, recurrence: null, updatedAt: 'old', ...fields });

function harness(tasks, { time = '21:00', settings = {}, later = null } = {}) {
  const calls = [];
  const storage = new Map(later ? [['dailoCloseDayLater', later]] : []);
  const ctx = withI18n({
    state: { tasks, settings }, Core: { ...Core, dateOnly: value => (value ? Core.dateOnly(value) : TODAY) }, JSON, Map, Set, Date,
    nowIso: () => new Date(`${TODAY}T${time}:00`).toISOString(), esc: value => String(value),
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    listTasks: () => tasks, taskRecurrence: item => item.recurrence || null, copyTemplate: value => JSON.parse(JSON.stringify(value)), removeCloneGoalLinks() {},
    saveState: () => { calls.push(['save']); return true; }, render: () => calls.push(['render']), setToastMessage: text => calls.push(['toast', text]),
    setUndo: (message, undo) => { calls.push(['undo', message]); ctx.undo = undo; },
  });
  vm.createContext(ctx);
  // R103b: Undo snapshots and the Još count include the archived tasks (historyTasks); none are archived here.
  // R105: Poništi puts back only the moved tasks (restoreCopies), so a task added meanwhile stays.
  vm.runInContext(`let archivedTasks = [];\n${app.match(/  const CLOSE_DAY_LATER_KEY = [^\n]+/)[0]}\n${['historyTasks', 'snapshotTasks', 'restoreTasks', 'restoreCopies', 'closeDayOpenTasks', 'closeDayNotice', 'moveTodayToTomorrow'].map(fn).join('\n')}`, ctx);
  return { ctx, calls, storage };
}

test('the card shows in the evening while today\'s plan is still open, not before, not when done, not after "Ne danas"', () => {
  const tasks = [task('a'), task('b'), task('done', { isCompleted: true }), task('late', { dueDate: '2026-10-10' }), task('tomorrow', { plannedDate: TOMORROW })];
  const html = harness(tasks).ctx.closeDayNotice();
  assert.match(html, /<section class="weekly-review-notice close-day-notice" data-close-day role="status"/);
  assert.match(html, /Still open today: 2/, 'past-due tasks have their own section');
  for (const action of ['close-day-pass', 'close-day-all-tomorrow', 'close-day-later']) assert.ok(html.includes(`data-action="${action}"`), action);
  assert.equal(harness(tasks, { time: '19:59' }).ctx.closeDayNotice(), '', 'before 20:00');
  assert.notEqual(harness(tasks, { time: '18:30', settings: { journalReminderTime: '18:00' } }).ctx.closeDayNotice(), '', 'from the journal reminder time');
  assert.notEqual(harness(tasks, { settings: { journalReminderTime: null } }).ctx.closeDayNotice(), '', '20:00 when the journal reminder is off');
  assert.equal(harness([task('done', { isCompleted: true })]).ctx.closeDayNotice(), '');
  assert.equal(harness(tasks, { later: TODAY }).ctx.closeDayNotice(), '');
  assert.notEqual(harness(tasks, { later: '2026-10-14' }).ctx.closeDayNotice(), '', 'yesterday\'s "Ne danas" is over');
});

test('"Sve na sutra" moves today\'s open plan to tomorrow, deadlines untouched, a repeat only this once, with Undo', () => {
  const tasks = [task('a', { dueDate: TODAY, plannedTime: '18:00' }), task('repeat', { recurrence: { frequency: 'daily', interval: 1 } }), task('late', { dueDate: '2026-10-10' }), task('done', { isCompleted: true })];
  const { ctx, calls } = harness(tasks);
  ctx.moveTodayToTomorrow();
  assert.deepEqual(tasks.map(item => [item.id, item.plannedDate, item.dueDate, item.todayOrder]), [['a', TOMORROW, TODAY, null], ['repeat', TOMORROW, null, null], ['late', TODAY, '2026-10-10', 1], ['done', TODAY, null, 1]]);
  assert.equal(tasks[1].recurrenceBaseline.plannedDate, TODAY);
  assert.deepEqual(calls.map(call => call[0]), ['save', 'render', 'undo']);
  assert.equal(calls.at(-1)[1], 'Unfinished tasks moved to tomorrow');
  ctx.undo();
  assert.deepEqual(ctx.state.tasks.map(item => [item.id, item.plannedDate, item.todayOrder]), [['a', TODAY, 1], ['repeat', TODAY, 1], ['late', TODAY, 1], ['done', TODAY, 1]]);
});

test('the pass goes through today\'s open plan and ends with the journal', () => {
  assert.match(fn('openCloseDayPass'), /modalState = \{ type: 'close-day', queue: closeDayOpenTasks\(\)\.map\(item => item\.id\), index: 0 \};/);
  const render = fn('renderCloseDayPass');
  assert.match(render, /const open = \(modalState\.queue \|\| \[\]\)\.filter\(id => closeDayOpenTasks\(\)\.some\(item => item\.id === id\)\);/);
  for (const action of ['close-day-tomorrow', 'close-day-anytime', 'close-day-date', 'close-day-complete', 'close-day-open', 'close-day-delete']) assert.ok(render.includes(`button('${action}'`), action);
  assert.match(render, /<p>\$\{tr\('The day is closed\.'\)\}<\/p>/);
  assert.match(render, /data-action="open-journal">\$\{tr\('Write down how the day went'\)\}<\/button>/);
  assert.match(app, /else if \(action === 'close-day-tomorrow'\) requestTaskEdit\(el\.dataset\.taskId, \{ plannedDate: Core\.addDays\(Core\.dateOnly\(\), 1\), todayOrder: null \}\);/);
  assert.match(app, /else if \(action === 'close-day-anytime'\) requestTaskEdit\(el\.dataset\.taskId, \{ plannedDate: null, todayOrder: null \}\);/);
  assert.match(app, /else if \(action === 'close-day-delete'\) requestDeleteEntity\('task', el\.dataset\.taskId, \{ returnTo: modalState \}\);/);
  assert.match(app, /else if \(action === 'close-day-later'\) \{ try \{ localStorage\.setItem\(CLOSE_DAY_LATER_KEY, Core\.dateOnly\(\)\); \} catch \(_\) \{ \/\* shown again next time \*\/ \} render\(\); \}/);
  assert.match(fn('openTaskDetail'), /const back = focus \|\| \(\['inbox-triage', 'overdue-triage', 'close-day'\]\.includes\(modalState\?\.type\) \? modalState : null\);/);
});

test('Danas shows the card before the journal notice; the key is device-local', () => {
  assert.match(fn('renderToday'), /html \+= closeDayNotice\(\);\n\s+\/\/ R14 \(T6 amended\)[^\n]*\n\s+html \+= callDomainHook\('renderRoute', \{ type: 'journal-notice' \}\) \|\| '';/);
  assert.match(read('CLAUDE.md'), /`dailoCloseDayLater`/);
  assert.match(read('css/styles.css'), /\.close-day-notice \{ border-left-color: var\(--info\); \}/);
});

test('the new lines are Serbian', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [['Close the day', 'Zatvori dan'], ['Still open today: {count}', 'Otvoreno danas: {count}'], ['Unfinished tasks moved to tomorrow', 'Neurađeno je pomereno na sutra'], ['The day is closed.', 'Dan je zatvoren.']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R84 shipped as 2.0.0-alpha.111 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 111) >= 111);
});
