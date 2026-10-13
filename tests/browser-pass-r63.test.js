// R63: fixes from a pass through the app in Chromium, as a phone (390 px, touch) and on a wide screen. A window
// opened again after it was closed animates in again (R62 kept the old type after a close). The habit chart shows
// "100%" whole. A done subtask's tick no longer draws over "Završi zadatak". The tasks "Bez vremena" in Raspored are
// readable titles next to a narrow time field. On a wide screen, "Danas" in Kalendar is a styled button and the "+"
// is one line, "+ Novi zadatak", inside its pill.
// Spec: docs/superpowers/specs/2026-10-13-r63-browser-pass.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const css = read('css/styles.css');
const beforeMarker = css.slice(0, css.indexOf('/* Keep primary compact actions touchable after all density rules. */'));

function modalHarness() {
  const fake = () => { const classes = new Set(); return { scrollTop: 0, classes, classList: { add: (...names) => names.forEach(name => classes.add(name)) } }; };
  const root = { dataset: {}, backdrop: null, modal: null, html: '' };
  Object.defineProperty(root, 'innerHTML', { get() { return root.html; }, set(value) { root.html = value; root.backdrop = value ? fake() : null; root.modal = value ? fake() : null; } });
  root.querySelector = selector => selector === '.modal-backdrop' ? root.backdrop : selector === '.modal' ? root.modal : null;
  root.querySelectorAll = selector => selector === '.modal-backdrop, .modal' ? [root.backdrop, root.modal].filter(Boolean) : [];
  root.contains = () => false;
  const frames = [];
  const ctx = {
    modalState: null, state: { templates: [] }, document: { activeElement: null }, $: selector => selector === '#modal-root' ? root : null,
    focusDescriptor: () => null, requestAnimationFrame: callback => frames.push(callback), tr: text => text, autoGrow: () => {},
    callDomainHook: (hook, route) => `<div class="modal-backdrop"><section class="modal">${route.modalType}</section></div>`,
  };
  vm.createContext(ctx);
  vm.runInContext(`${app.match(/\n  let modalFrameToken = [^\n]+/)[0]}\n${functionSource('renderModal').source}\nthis.renderModal = renderModal;`, ctx);
  return { ctx, root, frame: () => frames.splice(0).forEach(callback => callback()) };
}

test('a window opened again after it was closed animates in again', () => {
  const { ctx, root, frame } = modalHarness();
  ctx.modalState = { type: 'quick' };
  ctx.renderModal();
  frame();
  // closeModal empties the root itself; even if a path left the old type behind, an empty root is not "the same window".
  root.innerHTML = '';
  ctx.renderModal();
  assert.ok(!root.backdrop.classes.has('is-steady'), 'Quick Add opened again on Inbox animates in');
  assert.match(functionSource('closeModal').source, /const root = \$\('#modal-root'\);\n    root\.innerHTML = '';\n    root\.dataset\.modalType = '';/, 'and closing forgets the type');
});

test('the habit chart leaves room for "100%" left of its lines', () => {
  const geometry = read('js/habits-ui.js').match(/const W = 320, H = 150, L = (\d+), R = 10, T = 10, B = 22;/);
  assert.ok(geometry, 'the chart geometry');
  assert.ok(Number(geometry[1]) >= 42, `the left margin is ${geometry[1]}; "100%" at the axis size needs about 36 units before x = L - 6`);
  assert.match(beforeMarker, /\.habits-chart-svg \{ overflow: visible; \}/, 'a larger text size may use the card padding instead of being cut');
});

test('the sticky "Završi zadatak" stays above a done subtask\'s tick', () => {
  assert.match(css, /\.subtask-row > \.complete-control i \{ position: relative; z-index: 1;/, 'the tick that rose above it');
  assert.match(beforeMarker, /\.task-window-footer \{ z-index: 2; \}/);
});

test('Raspored: a task without a time is a readable title next to a narrow time field', () => {
  assert.match(beforeMarker, /\.day-unscheduled-title \{ padding: 8px 0; border: 0; background: none; font: inherit; cursor: pointer; \}/);
  assert.match(beforeMarker, /\.day-unscheduled-item \.task-time-input \{ flex: 0 0 136px; \}/);
});

test('wide screen: "Danas" in Kalendar is a styled button, and the "+" is one line inside its pill', () => {
  assert.match(read('js/calendar-ui.js'), /<button class="btn btn-secondary calendar-today" type="button" data-action="calendar-today">/);
  assert.match(css, /@media \(min-width: 1024px\) \{[^@]*\n  \.mobile-quick-add-toggle \{ display: inline-flex; align-items: center; width: auto; gap: 8px; padding: 0 20px 0 16px; border-radius: var\(--radius-pill\); font-size: var\(--text-base\); font-weight: 600; \}\n  \.mobile-quick-add-toggle i \{ font-size: var\(--text-lg\); \}\n  \.quick-add-label \{ display: inline; \}/);
});

test('R63 is released as 2.0.0-alpha.90', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.90');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.90';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.90');
});
