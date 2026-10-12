// R54: a habit's last year in its details window — 53 weeks by 7 days, oldest first, with the year's share done.
// Spec: docs/superpowers/specs/2026-10-12-r54-habit-year.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const T = '2026-10-12'; // a Monday
const log = (habitId, date, status = 'done', value = null) => ({ id: `${habitId}:${date}`, habitId, date, status, value });

test('the grid: 53 weeks from the week a year back to this week, seven days each, in the week rule order', () => {
  const habit = { id: 'h', name: 'Read', status: 'active', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-10-01' };
  const logs = [log('h', '2026-10-05'), log('h', '2026-10-06'), log('h', '2026-10-07', 'skipped'), log('h', T)];
  const year = JSON.parse(JSON.stringify(Core.habitYear(habit, logs, T, 'monday')));
  assert.equal(year.weeks.length, 53);
  assert.ok(year.weeks.every(week => week.length === 7));
  assert.deepEqual([year.weeks[0][0].date, year.weeks.at(-1).at(-1).date], ['2025-10-13', '2026-10-18']);
  const state = date => year.weeks.flat().find(day => day.date === date).state;
  assert.deepEqual(['2026-09-30', '2026-10-04', '2026-10-05', '2026-10-07', T, '2026-10-13'].map(state), ['unscheduled', 'missed', 'done', 'skipped', 'done', 'future']);
  assert.equal(year.done, 3);
  assert.equal(year.percent, 27, '3 done of 11 planned days (the skipped one does not count)');
  assert.deepEqual(year.months.slice(0, 2), [{ column: 2, month: '11' }, { column: 7, month: '12' }], 'a label where a month begins');
  const sunday = JSON.parse(JSON.stringify(Core.habitYear(habit, logs, T, 'sunday')));
  assert.equal(sunday.weeks[0][0].date, '2025-10-12');
});

test('a numeric day below its target is partial; a habit with nothing planned has no share', () => {
  const water = { id: 'w', name: 'Water', status: 'active', trackingType: 'numeric', targetValue: 2, frequencyType: 'daily', startDate: '2026-10-10' };
  const year = JSON.parse(JSON.stringify(Core.habitYear(water, [log('w', '2026-10-10', 'missed', 1), log('w', '2026-10-11', 'done', 2)], T, 'monday')));
  const state = date => year.weeks.flat().find(day => day.date === date).state;
  assert.deepEqual(['2026-10-10', '2026-10-11', T].map(state), ['partial', 'done', 'open']);
  const future = { ...water, startDate: '2026-11-01' };
  assert.equal(Core.habitYear(future, [], T, 'monday').percent, null);
});

test('the details window shows the year with a summary, month names and a legend', () => {
  const ui = read('js/habits-ui.js');
  assert.match(ui, /const year = Core\.habitYear\(habit, logs, week\.today, week\.rule\);/);
  assert.match(ui, /<h3 class="habit-details-label">\$\{tr\('Last 12 months'\)\}<\/h3>/);
  assert.match(ui, /<div class="habit-year-grid" role="img" aria-label="\$\{esc\(yearSummary\)\}">/);
  assert.match(ui, /<span class="habit-year-cell is-\$\{day\.state\}" title="\$\{esc\(/);
  const css = read('css/styles.css');
  assert.match(css, /\.habit-year-grid \{ display: grid; grid-template-rows: repeat\(7, auto\); grid-auto-flow: column; grid-auto-columns: minmax\(0, 1fr\); gap: 1px;/);
  for (const state of ['done', 'partial', 'skipped', 'missed']) assert.match(css, new RegExp(`\\.habit-year-cell\\.is-${state} \\{`));
});

test('Serbian', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [['Last 12 months', 'Poslednjih 12 meseci'], ['{done} days done · {percent}% of planned', 'Urađeno dana: {done} · {percent}% planiranog'], ['Partly', 'Delimično']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R54 shipped as 2.0.0-alpha.81 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 81);
});
