// Redesign R14b: habit circles on the right, like the R14 task checkbox (T5 amended 2026-10-10).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r14b-habit-circles.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const css = read('css/styles.css');
const layerStart = css.indexOf('/* Redesign R14b');
const layer = css.slice(layerStart, css.indexOf('/* Keep primary compact actions touchable', layerStart));
const rule = selector => {
  const start = layer.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, selector);
  return layer.slice(start, layer.indexOf('}', start) + 1);
};
const TODAY = Core.dateOnly();

function habitModule() {
  let module;
  runInNewContextWithI18n(read('js/habits-ui.js'), { window: { TodoDomainModules: { register(value) { module = value; } } } });
  const ctx = { Core, esc: String, state: { habitLogCache: {}, settings: {} }, habitMetrics: () => ({ currentPeriodCount: 2, currentPeriodTarget: 4 }) };
  return (habit, status) => module.renderRoute({ type: 'habit-today-row', habit, todayStatus: status }, ctx);
}
const order = row => ['today-row-main', 'habit-today-count', 'habit-check'].map(name => row.indexOf(`class="${name}`) >= 0 ? row.indexOf(`class="${name}`) : row.indexOf(name));
const endsWithCircle = row => /<button class="habit-check"[^>]*><svg[\s\S]*<\/svg><\/button><\/article>$/.test(row);

test('T5: a habit row is the name, the progress text and the circle at the far right', () => {
  const row = habitModule();
  const daily = row({ id: 'h1', name: 'Read', trackingType: 'checkbox', frequencyType: 'daily', status: 'active' }, { status: 'done' });
  assert.match(daily, /^<article class="today-row habit-today-row is-done" data-habit-id="h1"><button class="today-row-main" type="button" data-action="habit-today-menu"/);
  assert.ok(endsWithCircle(daily), 'the row ends with the circle');
  assert.match(daily, /<button class="habit-check" type="button" data-action="habit-today-toggle" data-habit-id="h1" data-long-press="habit-today-menu" aria-pressed="true" aria-label="Read">/);
  const numeric = row({ id: 'h2', name: 'Water', trackingType: 'numeric', targetValue: 2, unit: 'l', frequencyType: 'daily', status: 'active' }, { status: 'pending', value: 1.5 });
  const [main, count, check] = order(numeric);
  assert.ok(main < count && count < check, 'name, then "1.5 / 2 l", then the circle');
  assert.ok(endsWithCircle(numeric));
  const weekly = row({ id: 'h3', name: 'Gym', trackingType: 'checkbox', frequencyType: 'timesPerWeek', targetCount: 4, status: 'active' }, { status: 'pending' });
  assert.match(weekly, /<span class="task-side habit-today-count">2\/4 weekly<\/span><button class="habit-check"/);
  assert.ok(endsWithCircle(weekly));
});

test('T5: the Navike Dan view and the details window use the same row', () => {
  const source = read('js/habits-ui.js');
  assert.match(source, /renderHabitTodayRow\(ctx, habit, \{ status: day\.state === 'done'[^}]+\}, \{ date, meta: dayMeta\(ctx, habit, day, date, week\.today\), count: false \}\)/);
  assert.match(source, /<div class="today-card habit-details-today">\$\{renderHabitTodayRow\(ctx, habit,/);
  assert.equal((source.match(/class="today-row habit-today-row/g) || []).length, 1, 'one renderer');
});

test('T5: the habit row is a flex line, so the circle lines up with the task checkboxes', () => {
  assert.ok(layerStart > css.indexOf('/* Redesign R14 '), 'after the R14 layer');
  assert.match(rule('.habit-today-row'), /display: flex; align-items: center;/);
  assert.match(rule('.habit-today-row > .today-row-main'), /flex: 1; min-width: 0;/);
  assert.match(rule('.habit-today-row > :not(.today-row-main)'), /flex: none;/);
  assert.match(rule('.habit-today-row > .habit-check'), /width: 44px; height: 44px;/);
});

test('R14b shipped as 2.0.0-alpha.36 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 36);
});
