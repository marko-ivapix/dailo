// R66: a habit keeps its place when its state changes. On Navike → Dan and on Danas a done habit no longer moves to
// the bottom of its group, so the list does not jump under the finger. In the windows, the choices (Rutina, Praćenje,
// Napredak, the repeat frequency, the saved-view type) are compact, and the large main button ("Napravi naviku",
// "Završi zadatak" and the others) is lower. Fingers still get 44 px: the hit area reaches past the visible edge (from the padding box, so a 34 px choice reaches 44 px with 6 px, and the 40 px button with 3 px).
// Spec: docs/superpowers/specs/2026-10-13-r66-steady-habits-compact-windows.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Release = require('../js/release.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const css = read('css/styles.css');
const beforeMarker = css.slice(0, css.indexOf('/* Keep primary compact actions touchable after all density rules. */'));

test('Navike → Dan lists each routine in the habits\' own order, done or not', () => {
  const day = functionSource('renderHabitsDay', ['js/habits-ui.js']).source;
  assert.doesNotMatch(day, /entry\.day\.state !== 'done'\), \.\.\.entries\.filter/, 'no done-last sorting');
  assert.match(day, /const rows = entries\.map\(\(\{ habit, day \}\) => renderHabitTodayRow\(/);
});

test('Danas lists the habits in their own order too', () => {
  const today = read('js/app.js');
  assert.doesNotMatch(today, /\[\.\.\.sections\.habits\.filter\(item => item\.status\.status !== 'done'\), \.\.\.sections\.habits\.filter/);
  assert.match(today, /const habits = sections\.habits;/);
});

test('the window choices are compact, with a 44 px touch area', () => {
  for (const rule of [
    '.view-tabs.habit-window-seg { overflow: visible; }',
    '.view-tabs.habit-window-seg .btn { position: relative; min-height: 34px; padding-block: 4px; }',
    '.view-tabs.habit-window-seg .btn::after { content: ""; position: absolute; inset: -6px 0; }',
  ]) assert.ok(beforeMarker.includes(rule), rule);
});

test('the large main button of the windows is lower, with a 44 px touch area', () => {
  assert.match(css, /\.habit-window-save \{ position: relative; width: 100%; min-height: 40px; \}/);
  assert.match(css, /\.task-complete-button \{ position: relative; width: 100%; min-height: 40px; font-size: var\(--text-lg\); \}/);
  assert.ok(beforeMarker.includes('.habit-window-save::after, .task-complete-button::after { content: ""; position: absolute; inset: -3px 0; }'));
});

test('R66 is released as 2.0.0-alpha.93', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.93');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.93';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.93');
});
