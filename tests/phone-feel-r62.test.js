// R62: two phone-feel fixes. A window redrawn after a change (a group chip in "Nova redovna obaveza", a start day, a
// repeat option) stays put: no entrance animation again and the same scroll, so it no longer flickers as if it closed
// and opened. A task row swipes on a real phone: the row tells the browser up front that sideways is ours
// (touch-action), holding a row and then moving it to the side still completes the task or picks its date, and a
// long press selects no text, neither in the row nor under the lifted row.
// Spec: docs/superpowers/specs/2026-10-13-r62-phone-feel.md
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
const plain = value => JSON.parse(JSON.stringify(value));

function fakeElement() {
  const classes = new Set();
  return { scrollTop: 0, classes, classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name) } };
}

function modalHarness() {
  const root = { dataset: {}, backdrop: null, modal: null, html: '' };
  Object.defineProperty(root, 'innerHTML', {
    get() { return root.html; },
    set(value) { root.html = value; root.backdrop = value ? fakeElement() : null; root.modal = value ? fakeElement() : null; },
  });
  root.querySelector = selector => selector === '.modal-backdrop' ? root.backdrop : selector === '.modal' ? root.modal : null;
  root.querySelectorAll = selector => selector === '.modal-backdrop, .modal' ? [root.backdrop, root.modal].filter(Boolean) : [];
  root.contains = () => false;
  const frames = [];
  const ctx = {
    modalState: null, state: { templates: [] }, document: { activeElement: null },
    $: selector => selector === '#modal-root' ? root : null,
    focusDescriptor: () => null, requestAnimationFrame: callback => frames.push(callback), tr: text => text, autoGrow: () => {},
    callDomainHook: (hook, route) => `<div class="modal-backdrop"><section class="modal">${route.modalType}</section></div>`,
  };
  vm.createContext(ctx);
  vm.runInContext(`${app.match(/\n  let modalFrameToken = [^\n]+/)[0]}\n${functionSource('renderModal').source}\nthis.renderModal = renderModal;`, ctx);
  const frame = () => frames.splice(0).forEach(callback => callback());
  return { ctx, root, frame };
}

test('a window redrawn after a change keeps still and keeps its scroll; a new window still animates in', () => {
  const { ctx, root, frame } = modalHarness();
  ctx.modalState = { type: 'cleaning-chore' };
  ctx.renderModal();
  assert.ok(!root.backdrop.classes.has('is-steady'), 'opening animates in');
  ctx.renderModal();
  assert.ok(!root.backdrop.classes.has('is-steady'), 'a redraw before the window was ever drawn on screen still animates in');
  frame();
  root.modal.scrollTop = 120;
  root.backdrop.scrollTop = 30;
  ctx.renderModal();
  assert.ok(root.backdrop.classes.has('is-steady'), 'a tap on Kuhinja redraws the same window without the entrance');
  assert.deepEqual([root.backdrop.scrollTop, root.modal.scrollTop], [30, 120], 'and at the same place');
  ctx.modalState = { type: 'confirm' };
  ctx.renderModal();
  assert.ok(!root.backdrop.classes.has('is-steady'), 'another window animates in');
  assert.equal(root.modal.scrollTop, 0);
  ctx.modalState = null;
  ctx.renderModal();
  assert.equal(root.dataset.modalType, '');
  frame();
  ctx.modalState = { type: 'confirm' };
  ctx.renderModal();
  assert.ok(!root.backdrop.classes.has('is-steady'), 'closed and opened again animates in');
  frame();
  ctx.renderModal();
  assert.ok(root.backdrop.classes.has('is-steady'));
});

test('the steady window has no animation, on a phone and on a wide screen', () => {
  assert.match(css, /\.modal-backdrop\.is-steady, \.modal-backdrop\.is-steady \.modal \{ animation: none; \}/);
  const at = css.indexOf('.modal-backdrop.is-steady');
  assert.ok(at > 0 && at < css.indexOf('/* Keep primary compact actions touchable after all density rules. */'), 'before the closing density rules');
  assert.match(functionSource('refreshSheet').source, /popoverEl\.innerHTML = html;/, 'a sheet already redraws inside the same element, so it does not animate again');
});

function fakeRow(id) {
  const self = fakeElement();
  return Object.assign(self, { dataset: { taskId: id, listContext: 'today' }, style: {}, setPointerCapture() {}, releasePointerCapture() {}, closest(selector) { return /task-row/.test(selector) ? self : null; } });
}

function gestureHarness() {
  const calls = [];
  const timers = [];
  const rows = { a: fakeRow('a'), b: fakeRow('b') };
  const ctx = {
    window: { innerWidth: 400 }, document: { body: { classList: { add() {}, remove() {} } }, elementFromPoint: () => rows.b },
    setTimeout: (callback, ms) => { timers.push({ callback, ms }); return timers.length; }, clearTimeout: () => {},
    toggleComplete: id => calls.push(['complete', id]), openPlanPicker: (anchor, target) => calls.push(['plan', anchor.dataset.taskId, target]),
    reorderTasks: (...args) => calls.push(['reorder', ...args]), reorderSubtasks: () => {}, haptic: () => {}, Math,
  };
  vm.createContext(ctx);
  const constLine = name => app.match(new RegExp(`\\n  const ${name} = [^\\n]+`))[0];
  const fns = ['sameReorderList', 'resetTaskSwipe', 'handleTaskSwipeStart', 'handleTaskSwipeMove', 'finishTaskSwipe', 'handleTouchReorderStart', 'startTouchReorder', 'handleTouchReorderMove', 'finishTouchReorder', 'cancelTouchReorder', 'blockTouchScroll'];
  vm.runInContext(`let taskSwipeState = null; let suppressTaskSwipeClick = false; let touchReorder = null;\n${constLine('REORDER_ROWS')}\n${constLine('dropGroup')}\n${fns.map(name => functionSource(name).source).join('\n')}\nthis.swiping = () => Boolean(taskSwipeState?.swiping);`, ctx);
  const event = (type, row, x, y) => ({ type, pointerType: 'touch', isPrimary: true, button: 0, pointerId: 1, clientX: x, clientY: y, target: { closest: selector => (/button|input/.test(selector) ? null : row) }, preventDefault() { calls.push(['prevent', type]); } });
  // The page listens in this order (attachEvents): swipe first, then the touch reorder.
  const down = (row, x, y) => { ctx.handleTaskSwipeStart(event('pointerdown', row, x, y)); ctx.handleTouchReorderStart(event('pointerdown', row, x, y)); };
  const move = (row, x, y) => { ctx.handleTaskSwipeMove(event('pointermove', row, x, y)); ctx.handleTouchReorderMove(event('pointermove', row, x, y)); };
  const up = (row, x, y) => { ctx.finishTaskSwipe(event('pointerup', row, x, y)); ctx.finishTouchReorder(event('pointerup', row, x, y)); };
  const hold = () => timers.at(-1).callback();
  return { ctx, calls, rows, down, move, up, hold };
}

test('holding a row, then moving it to the side, still swipes: left picks the date, right completes', () => {
  const left = gestureHarness();
  left.down(left.rows.a, 200, 100);
  left.hold();
  assert.ok(left.rows.a.classes.has('is-touch-dragging'), 'the hold lifts the row');
  left.move(left.rows.a, 184, 102);
  assert.ok(!left.rows.a.classes.has('is-touch-dragging'), 'a clear move to the side puts it down again');
  assert.ok(left.ctx.swiping(), 'and swipes instead');
  left.move(left.rows.a, 90, 104);
  assert.match(left.rows.a.style.background, /^rgba\(83, 98, 255,/);
  left.up(left.rows.a, 90, 104);
  assert.deepEqual(plain(left.calls.at(-1)), ['plan', 'a', { type: 'task', taskId: 'a' }]);
  const right = gestureHarness();
  right.down(right.rows.a, 100, 100);
  right.hold();
  right.move(right.rows.a, 120, 101);
  right.move(right.rows.a, 210, 101);
  right.up(right.rows.a, 210, 101);
  assert.deepEqual(right.calls.at(-1), ['complete', 'a']);
  assert.equal(right.calls.filter(call => call[0] === 'reorder').length, 0);
});

test('holding a row and moving it up or down still reorders; a later sideways drift does not swipe', () => {
  const { ctx, calls, rows, down, move, up, hold } = gestureHarness();
  down(rows.a, 100, 100);
  hold();
  move(rows.a, 102, 130);
  assert.equal(rows.a.style.transform, 'translateY(30px)');
  move(rows.a, 160, 140);
  assert.ok(rows.a.classes.has('is-touch-dragging'), 'once it moved up or down it stays a reorder');
  assert.equal(ctx.swiping(), false);
  up(rows.a, 160, 140);
  assert.deepEqual(calls.at(-1), ['reorder', 'today', 'a', 'b']);
});

test('the page does not scroll under a sideways swipe, and a long press opens no menu on a task row', () => {
  const { ctx, calls, rows, down, move } = gestureHarness();
  down(rows.a, 200, 100);
  move(rows.a, 170, 101);
  calls.length = 0;
  ctx.blockTouchScroll({ cancelable: true, preventDefault() { calls.push(['no-scroll']); } });
  assert.deepEqual(calls, [['no-scroll']]);
  calls.length = 0;
  ctx.blockTouchScroll({ cancelable: false, preventDefault() { calls.push(['no-scroll']); } });
  assert.deepEqual(calls, [], 'a scroll that already started is not cancelled');
  assert.match(functionSource('attachEvents').source, /document\.addEventListener\('contextmenu', event => \{ if \(touchReorder \|\| taskSwipeState\) event\.preventDefault\(\); \}\);/);
});

test('on a touch screen a task row is swiped sideways by the app and selects no text; neither does the page under a lifted row', () => {
  assert.match(css, /@media \(pointer: coarse\) \{\n\s+\.task-row \{ touch-action: pan-y; touch-action: pan-y pinch-zoom; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; \}\n\s+\.task-drag-active \{ -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; \}\n\}/);
  assert.doesNotMatch(css, /\.task-row\[draggable="true"\] \{ -webkit-user-select/, 'the narrower R25 rule is replaced');
});

test('the hint says which way reorders', () => {
  assert.match(functionSource('gestureHint').source, /tr\('Swipe a task right to complete it, left to pick its date\. Hold a row, then drag it up or down to change the order\.'\)/);
  assert.ok(read('js/i18n-sr.js').includes('"Swipe a task right to complete it, left to pick its date. Hold a row, then drag it up or down to change the order.": "Prevuci zadatak udesno da ga završiš, ulevo da mu izabereš datum. Drži red pa ga prevuci gore ili dole da promeniš redosled."'));
});

test('R62 shipped as 2.0.0-alpha.89 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 89);
});
