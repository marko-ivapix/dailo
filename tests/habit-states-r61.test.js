// R61: a yes/no habit has three states on a day: done (✓), not done (a red ✗) and not recorded (empty). A tap cycles
// empty → done → not done → empty. "Not done" is the existing `missed` log, now shown; empty is no log at all.
// Data-model spec: docs/superpowers/specs/2026-10-12-r61-habit-three-states.md
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
const plain = value => JSON.parse(JSON.stringify(value));
const T = '2026-10-12';
const log = (habitId, date, status = 'done', value = null) => ({ id: `${habitId}:${date}`, habitId, date, status, value });
const habit = { id: 'h', name: 'Vežbanje', status: 'active', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-10-01' };

test('Core: a "not done" mark is a logged missed day, today too; an unrecorded day is not marked', () => {
  assert.deepEqual(plain(Core.habitStatusForDate(habit, [log('h', T, 'missed')], T, T)), { status: 'missed', value: null, percent: 0, logged: true });
  assert.deepEqual(plain(Core.habitStatusForDate(habit, [], T, T)), { status: 'pending', value: null, percent: 0 });
  assert.deepEqual(plain(Core.habitDayState(habit, [log('h', T, 'missed')], T, T)), { state: 'missed', planned: true, value: null, marked: true });
  assert.deepEqual(plain(Core.habitDayState(habit, [], '2026-10-11', T)), { state: 'missed', planned: true, value: null }, 'a past day without a log stays plain missed');
  assert.deepEqual(plain(Core.habitDayState(habit, [], T, T)), { state: 'open', planned: true, value: null });
  const water = { ...habit, id: 'w', trackingType: 'numeric', targetValue: 2 };
  assert.equal(Core.habitDayState(water, [log('w', T, 'missed', 1)], T, T).marked, undefined, 'a numeric day below its target is partial, not marked');
  const weekly = { ...habit, id: 'k', frequencyType: 'timesPerWeek', timesPerWeek: 3 };
  assert.deepEqual(plain(Core.habitDayState(weekly, [log('k', T, 'missed')], T, T)), { state: 'missed', planned: false, value: null, marked: true });
});

test('Core: a "not done" day silences its reminders; the widget shows it', () => {
  assert.equal(Core.habitDayClosed(habit, [log('h', T, 'missed')], T), true);
  assert.equal(Core.habitDayClosed(habit, [], T), false);
  assert.equal(Core.habitDayClosed({ ...habit, trackingType: 'numeric', targetValue: 2 }, [log('h', T, 'missed', 1)], T), false, 'a numeric habit below its target still reminds');
  const snapshot = Core.habitsWidgetSnapshot([habit, { ...habit, id: 'g', name: 'Čitanje' }], { h: [log('h', T, 'missed')], g: [] }, T);
  assert.deepEqual(snapshot.items.map(item => [item.id, item.done, item.missed]), [['h', false, true], ['g', false, false]]);
  assert.match(read('js/app.js'), /text: `\$\{item\.done \? '✓' : item\.missed \? '✗' : '○'\}  \$\{item\.name\}/);
});

function row(todayStatus, options = {}) {
  const context = withI18n({ I18n: { locale: () => 'sr-Latn-RS' } });
  vm.createContext(context);
  const habitsUi = read('js/habits-ui.js');
  vm.runInContext(`${habitsUi.match(/\n  const number = [^\n]+/)[0]}\n${functionSource('habitCircle', ['js/habits-ui.js']).source}\n${functionSource('renderHabitTodayRow', ['js/habits-ui.js']).source}\nthis.renderHabitTodayRow = renderHabitTodayRow;`, context);
  const ctx = { esc: value => String(value), habitMetrics: () => ({}), Core: { dateOnly: () => T } };
  return context.renderHabitTodayRow(ctx, habit, todayStatus, options);
}

test('the row: a red ✗ for "not done", a tick for done, an empty circle otherwise, and the state in its name', () => {
  const missed = row({ status: 'missed', value: null, logged: true });
  assert.match(missed, /<article class="today-row habit-today-row is-missed"/);
  assert.match(missed, /<svg class="habit-circle is-missed" viewBox="0 0 28 28" aria-hidden="true"><circle class="habit-circle-missed" cx="14" cy="14" r="12.5"\/><path class="habit-circle-x" d="M10 10l8 8M18 10l-8 8"\/><\/svg>/);
  assert.match(missed, /aria-label="Vežbanje: Not done"/, 'English in Node; Serbian "Nije urađeno" in the app');
  assert.match(row({ status: 'pending', marked: true }), /habit-circle is-missed/, 'Dan and the details window pass the mark');
  assert.match(row({ status: 'done' }), /aria-label="Vežbanje: Done"/);
  const empty = row({ status: 'pending' });
  assert.match(empty, /aria-label="Vežbanje: Not checked in"/);
  assert.doesNotMatch(empty, /is-missed/);
  assert.doesNotMatch(row({ status: 'missed', value: null }), /is-missed/, 'a past day without a log is not marked');
});

test('a tap cycles empty → done → not done → empty; a skipped day goes to done', () => {
  const ui = read('js/habits-ui.js');
  assert.match(ui, /else \{ const current = dayLog\(habit\.id\)\?\.status; setHabitLog\(habit\.id, date, current === 'done' \? 'missed' : current === 'missed' \? null : 'done'\); \}/);
  assert.match(ui, /renderHabitTodayRow\(ctx, habit, \{ status: day\.state === 'done' \? 'done' : day\.state === 'skipped' \? 'skipped' : 'pending', value: day\.value, marked: day\.marked \}/);
  assert.match(ui, /renderHabitTodayRow\(ctx, habit, \{ status: today\.state === 'done' \? 'done' : today\.state === 'skipped' \? 'skipped' : 'pending', value: today\.value, marked: today\.marked \}/);
  const set = functionSource('setHabitLog').source;
  assert.match(set, /const clearing = requestedStatus === null;/);
  assert.match(set, /if \(clearing && !existing\) return true;/);
  assert.match(set, /if \(clearing\) await TodoStorage\.habitLogs\.deleteIfCurrent\(existing\.id, existing\);/);
  assert.match(set, /if \(clearing\) \{ if \(!\(await TodoStorage\.habitLogs\.get\(existing\.id\)\)\) await TodoStorage\.habitLogs\.putIfCurrent\(existing, null\); \}/, 'a failed clear puts the log back');
});

test('the week table and the details calendar mark the day; the legend explains it', () => {
  const ui = read('js/habits-ui.js');
  assert.equal((ui.match(/\$\{day\.marked \? ' is-marked' : ''\}/g) || []).length, 2, 'both grids');
  assert.match(ui, /const CROSS = '<svg class="habit-cell-x" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"\/><\/svg>';/);
  assert.match(ui, /marked: msg\('Not done'\)/);
  assert.match(ui, /\['done', 'marked', 'missed', 'skipped', 'unscheduled'\]\.map\(key =>/);
  const css = read('css/styles.css');
  for (const rule of [/\.habit-circle-missed \{ fill: var\(--danger-fill\); \}/, /\.habit-circle-x \{ fill: none; stroke: var\(--on-accent\);/, /\.habit-cell\.is-marked::before \{ border-color: var\(--danger-fill\); background: var\(--danger-fill\); \}/, /\.habit-cell-x \{/, /\.habit-cell-swatch\.is-marked \{/]) assert.match(css, rule);
  assert.ok(read('js/i18n-sr.js').includes('"Not done": "Nije urađeno"'));
});

test('R61 is released as 2.0.0-alpha.88', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.88');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.88';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.88');
});
