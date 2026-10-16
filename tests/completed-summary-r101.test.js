// R101: Arhiva. Završeni zadaci opens with what was done: "Ovog meseca: 84 zadatka", last month and this year, the best
// day this month and the run of days with something completed (from today, or from yesterday until something is done
// today). It counts all completed tasks, whatever the chips below filter. No data-model change.
// Spec: docs/superpowers/specs/2026-10-15-r101-completed-summary.md
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
const TODAY = '2026-10-15';
const at = (date, time = '12:00') => new Date(`${date}T${time}:00`).toISOString();
const done = (id, date, fields = {}) => ({ id, title: id, isCompleted: true, completedAt: at(date), ...fields });
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function fixture() {
  return [
    done('a', '2026-10-15'), done('b', '2026-10-14'), done('c', '2026-10-13'), done('d', '2026-10-13'), done('e', '2026-10-13'),
    done('f', '2026-10-02'), done('g', '2026-10-02'), done('h', '2026-10-02'),
    done('s1', '2026-09-30'), done('s2', '2026-09-01'), done('old', '2025-12-31'),
    { id: 'open', title: 'open', isCompleted: false }, done('later', '2026-10-20'),
  ];
}

test('the summary: this month, last month, this year, the best day and the run of days', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(Core.completionSummary(fixture(), TODAY))), { month: 8, lastMonth: 2, year: 10, best: { date: '2026-10-02', count: 3 }, streak: 3 });
  const notYet = fixture().filter(task => task.id !== 'a');
  assert.equal(Core.completionSummary(notYet, TODAY).streak, 2, 'nothing done today yet: the run counts from yesterday');
  assert.deepEqual(JSON.parse(JSON.stringify(Core.completionSummary([done('x', '2026-01-03')], '2026-01-10'))), { month: 1, lastMonth: 0, year: 1, best: { date: '2026-01-03', count: 1 }, streak: 0 });
  assert.equal(Core.completionSummary([done('dec', '2025-12-05')], '2026-01-10').lastMonth, 1, 'January\'s last month is December');
  assert.deepEqual(JSON.parse(JSON.stringify(Core.completionSummary([], TODAY))), { month: 0, lastMonth: 0, year: 0, best: null, streak: 0 });
});

function screen(tasks = fixture()) {
  const state = { tasks, projects: [], ui: { completedProjectFilter: '', completedPeriod: 0 } };
  const ctx = {
    state, Core: { ...Core, dateOnly: value => (value ? Core.dateOnly(value) : TODAY) }, esc,
    allProjects: () => [], pageHeader: (title, subtitle) => `<header title="${title}" subtitle="${subtitle}"></header>`,
    emptyState: (title, text) => `<empty ${title} | ${text}>`, taskRow: task => `<row ${task.id}>`, relativeDateLabel: date => `L:${date}`,
    formatDate: date => `D:${date}`, nowIso: () => at(TODAY),
  };
  vm.createContext(withI18n(ctx));
  // R103: the screen and its summary count the archived tasks too (historyTasks); none are archived here.
  vm.runInContext(['historyTasks', 'completedSummaryCard', 'renderCompleted'].map(name => functionSource(name).source).join('\n') + '\nlet archivedTasks = [];', ctx);
  return ctx;
}

test('Završeni zadaci opens with the summary card, before the chips', () => {
  const html = screen().renderCompleted();
  assert.match(html, /^<header title="Completed tasks" subtitle="12 tasks"><\/header><div class="today-card completed-summary"><p class="completed-summary-label">Achievements<\/p><p class="completed-summary-main">This month: 8 tasks<\/p><p class="completed-summary-line">Last month: 2 tasks · This year: 10 tasks<\/p><p class="completed-summary-line">Best day: D:2026-10-02 \(3\) · Streak: 3 days in a row<\/p><\/div><div class="sheet-chips completed-chips">/);
  assert.doesNotMatch(screen([done('x', '2026-10-15')]).renderCompleted(), /Best day|Streak/, 'one task: no best day, no run of one day');
  assert.doesNotMatch(screen([{ id: 'open', isCompleted: false }]).renderCompleted(), /completed-summary/, 'nothing completed, no card');
  const css = read('css/styles.css');
  for (const rule of ['.completed-summary {', '.completed-summary-label {', '.completed-summary-main {', '.completed-summary-line {']) assert.ok(css.includes(rule), rule);
});

test('the new lines are Serbian; the guide and Šta je novo mention the summary', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['Achievements', 'Postignuća'], ['This month: {tasks}', 'Ovog meseca: {tasks}'], ['Last month: {tasks}', 'Prošlog meseca: {tasks}'], ['This year: {tasks}', 'Ove godine: {tasks}'],
    ['Best day: {date} ({count})', 'Najbolji dan: {date} ({count})'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  assert.ok(sr.includes('"Streak: {count} days in a row": { one: "Niz: {count} dan zaredom", few: "Niz: {count} dana zaredom", other: "Niz: {count} dana zaredom" }'));
  assert.ok(read('uputstvo.html').includes('<strong>Još → Završeni zadaci</strong> počinje pregledom: koliko je zadataka završeno ovog meseca, prošlog meseca i ove godine, najbolji dan u mesecu i koliko dana zaredom nešto završiš.'));
  assert.ok(read('novo.html').includes('<li><strong>Postignuća.</strong>'));
});

test('R101 shipped as 2.0.0-alpha.129 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 129) >= 129);
});
