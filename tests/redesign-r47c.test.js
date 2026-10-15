// Redesign R47c: the desktop layer, part 3 — two columns where there is room (K7): Danas has its tasks on the left and
// its habits on the right; Navike has the list on the left and Napredak on the right.
// Spec: docs/superpowers/specs/2026-10-12-redesign-r47-desktop.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const habitsUi = read('js/habits-ui.js');
const css = read('css/styles.css');
const fn = (source, name) => { const start = source.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return source.slice(start, source.indexOf('\n  }\n', start) + 4); };
const block = css.slice(css.indexOf('/* Redesign R47c'), css.indexOf('/* Keep primary compact actions touchable'));

test('screenColumns: the main part, the side part and what follows, in the order a phone reads them', () => {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fn(app, 'screenColumns'), context);
  assert.equal(context.screenColumns('<a>', '<b>', '<c>'), '<div class="screen-columns has-side"><div class="screen-main"><a></div><div class="screen-side"><b></div><div class="screen-rest"><c></div></div>');
  assert.equal(context.screenColumns('<a>', '', ''), '<div class="screen-columns"><div class="screen-main"><a></div></div>', 'without a side part it stays one column');
  assert.match(app, /\n      pageHeader, modalFrame, renderMain, renderModal, currentRoute, screenColumns,/);
});

test('Danas: overdue, planned and the suggestions on the left, the habits on the right, Završeno under the tasks', () => {
  const today = fn(app, 'renderToday');
  // R83: the past-due actions are prepared between the start of the main part and the overdue section.
  // R96: the week's priorities come first.
  assert.match(today, /let main = '';\n    \/\/ R96[^\n]*\n    const listed = [^\n]*\n    const priorities = [^\n]*\n    if \(priorities\.length\) main \+= section\('priorities'[^\n]*\n(?:    \/\/ R83[^\n]*\n    let overdueBody = '';\n    if \(sections\.overdue\.length\) overdueBody = [^\n]*\n)    if \(overdueRows\.length\) main \+= section\('overdue'/);
  assert.match(today, /main \+= section\('today', tr\('Planned today'\)/);
  assert.match(today, /if \(suggestions\.length\) main \+= `<button class="today-suggestions-link"/);
  assert.match(today, /const side = habits\.length \? section\('habits', tr\('Habits'\)/);
  assert.match(today, /let rest = '';\n    if \(sections\.completed\.length\) \{/);
  assert.match(today, /return html \+ screenColumns\(main, side, rest\);\n  \}/);
});

test('Navike: the week, the rings and the day or week view on the left, Napredak on the right, the folds under the list', () => {
  const habits = fn(habitsUi, 'renderHabits');
  assert.match(habits, /let main = '';\n    let side = '';\n    if \(active\.length\) \{[\s\S]*main = weekNav\(ctx, week\);/);
  assert.match(habits, /side = `<section class="section habits-progress">/);
  assert.match(habits, /let rest = habitFold\(ctx, 'paused'/);
  assert.match(habits, /return html \+ ctx\.screenColumns\(main, side, rest\);\n  \}/);
});

test('CSS: from 1280 px on the two parts stand side by side and the column widens; below that one column', () => {
  assert.ok(block.length > 0, 'the R47c block sits before the touch guard');
  assert.match(block, /@media \(min-width: 1280px\) \{\n  \.content:has\(> \.screen-columns\.has-side\) \{ max-width: 1120px; \}/);
  assert.match(block, /  \.screen-columns\.has-side \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(300px, 360px\); grid-template-rows: auto 1fr; column-gap: 32px; align-items: start; \}/);
  assert.match(block, /  \.screen-columns\.has-side > \.screen-main \{ grid-column: 1; grid-row: 1; \}/);
  assert.match(block, /  \.screen-columns\.has-side > \.screen-side \{ grid-column: 2; grid-row: 1 \/ 3; \}/);
  assert.match(block, /  \.screen-columns\.has-side > \.screen-rest \{ grid-column: 1; grid-row: 2; \}/);
});

test('R47c shipped as 2.0.0-alpha.75 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 75);
});
