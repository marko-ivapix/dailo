// Redesign R14c: milestone circles on the right, like tasks (R14) and habits (R14b); GO5 amended 2026-10-10.
// Spec: docs/superpowers/specs/2026-10-10-redesign-r14c-milestone-circles.md
// The rendered rows are checked in tests/redesign-r9b.test.js (GO5).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const goalsUi = read('js/goals-ui.js');
const css = read('css/styles.css');
const layerStart = css.indexOf('/* Redesign R14c');
const layer = css.slice(layerStart, css.indexOf('/* Keep primary compact actions touchable', layerStart));
const rule = selector => {
  const start = layer.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, selector);
  return layer.slice(start, layer.indexOf('}', start) + 1);
};

test('GO5: a milestone row is the title with its date under it, and the circle at the far right', () => {
  const row = goalsUi.slice(goalsUi.indexOf('const milestoneRows'), goalsUi.indexOf("join('');", goalsUi.indexOf('const milestoneRows')));
  assert.ok(row.indexOf('class="today-row-main"') >= 0 && row.indexOf('class="today-row-main"') < row.indexOf('class="habit-check"'), 'the title before the circle');
  assert.match(row, /<span class="task-title">\$\{esc\(item\.title\)\}<\/span>\$\{date \? `<span class="task-meta">\$\{date\}<\/span>` : ''\}<\/button><button class="habit-check"/);
  assert.match(row, /\$\{roundCheck\(item\.isCompleted\)\}<\/button><\/div>`/, 'the circle closes the row');
  assert.doesNotMatch(row, /task-side/, 'no date on the right any more');
});

test('GO5: the milestone row is a flex line with a 44 px circle box', () => {
  assert.ok(layerStart > css.indexOf('/* Redesign R14b'), 'after the R14b layer');
  assert.match(rule('.goal-milestone-row'), /display: flex; align-items: center;/);
  assert.match(rule('.goal-milestone-row > .today-row-main'), /flex: 1; min-width: 0;/);
  assert.match(rule('.goal-milestone-row > .habit-check'), /flex: none; width: 44px; height: 44px;/);
});

test('R14c is released as 2.0.0-alpha.37', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.37');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.37';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.37');
});
