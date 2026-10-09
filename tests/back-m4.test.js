// Modernization M4: Android Back works like Escape, never interrupts a running reset/restore, and a route
// change no longer cancels the first-sync choice (which would sign out).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const region = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start) + start.length));

function harness(onEscape) {
  const sent = [];
  const body = { dispatchEvent: event => { sent.push(event.key); onEscape(ctx); return true; } };
  const ctx = {
    globalOperation: null, mobileMoreOpen: false, popoverEl: null, modalState: null, goalPropertyEditor: null, habitPropertyEditor: null,
    $: () => null, KeyboardEvent: class { constructor(type, init) { Object.assign(this, { type }, init); } },
    document: { body, activeElement: body, dispatchEvent() { throw new Error('dispatch on an element'); } },
  };
  vm.createContext(ctx);
  vm.runInContext(region('  const overlaySnapshot =', '\n  // Native integration'), ctx);
  return { ctx, sent };
}

test('Back sends Escape and reports whether something closed', () => {
  const { ctx, sent } = harness(state => { if (state.modalState) state.modalState = null; });
  ctx.modalState = { type: 'task' };
  assert.equal(ctx.handleBackButton(), true, 'a dialog closed');
  assert.equal(ctx.modalState, null);
  assert.equal(ctx.handleBackButton(), false, 'nothing open: the platform goes back or minimizes');
  assert.deepEqual(sent, ['Escape', 'Escape']);
});

test('Back is consumed without effect while a reset or restore is running', () => {
  const { ctx, sent } = harness(() => { throw new Error('must not dispatch'); });
  ctx.globalOperation = { reason: 'restore', busy: true };
  assert.equal(ctx.handleBackButton(), true);
  assert.deepEqual(sent, []);
});

test('the app registers the Back handler and starts on #today without an extra history step', () => {
  assert.match(region('  function startPlatform(', '\n  }\n'), /backButton\.setHandler\(handleBackButton\)/);
  assert.match(app, /if \(!location\.hash\) location\.replace\('#today'\);/);
  assert.doesNotMatch(region('  async function init(', '\n  window.TodoApp'), /location\.hash = '#today'/);
});

test('a route change keeps the first-sync choice open instead of signing out', () => {
  assert.match(app, /window\.addEventListener\('hashchange', \(\) => \{ closePopover\(\); if \(modalState\?\.type !== 'sync-choice'\) closeModal\(\); render\(\); \}\);/);
  const calls = [];
  const ctx = { modalState: { type: 'sync-choice' }, closePopover: () => calls.push('popover'), closeModal: () => calls.push('modal'), render: () => calls.push('render') };
  vm.createContext(ctx);
  const listener = vm.runInContext(`(${app.match(/window\.addEventListener\('hashchange', (\(\) => \{[^\n]*\})\);/)[1]})`, ctx);
  listener();
  assert.deepEqual(calls, ['popover', 'render']);
  ctx.modalState = { type: 'task' };
  listener();
  assert.deepEqual(calls, ['popover', 'render', 'popover', 'modal', 'render'], 'other dialogs still close on a route change');
});
