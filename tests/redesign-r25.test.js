// Redesign R25: a left swipe opens the date sheet; rows reorder by touch (additions D and E).
// Spec: docs/superpowers/specs/2026-10-11-redesign-r25-swipe-reorder.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const css = read('css/styles.css');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };

function fakeRow(id, context = 'today') {
  const classes = new Set();
  return {
    dataset: { taskId: id, listContext: context }, style: {},
    classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name) },
    classes, setPointerCapture() {}, releasePointerCapture() {},
    closest(selector) { return /task-row/.test(selector) ? this : null; },
  };
}

function harness() {
  const calls = [];
  const timers = [];
  const rows = { a: fakeRow('a'), b: fakeRow('b'), c: fakeRow('c'), x: fakeRow('x', 'inbox') };
  const under = { current: null };
  const body = { classList: { add: name => calls.push(['body+', name]), remove: name => calls.push(['body-', name]) } };
  const ctx = {
    window: { innerWidth: 400 }, document: { body, elementFromPoint: () => under.current },
    setTimeout: (callback, ms) => { timers.push({ callback, ms }); return timers.length; }, clearTimeout: () => {},
    toggleComplete: id => calls.push(['complete', id]), openPlanPicker: (anchor, target) => calls.push(['plan', anchor.dataset.taskId, target]),
    reorderTasks: (...args) => calls.push(['reorder', ...args]), haptic: kind => calls.push(['haptic', kind]),
    Math,
  };
  vm.createContext(ctx);
  // R33: subtasks share the touch reorder, and an Inbox row stays within its capture group.
  const constLine = name => app.match(new RegExp(`\\n  const ${name} = [^\\n]+`))[0];
  vm.runInContext(`let taskSwipeState = null; let suppressTaskSwipeClick = false; let touchReorder = null;\n${constLine('REORDER_ROWS')}\n${constLine('dropGroup')}\n${['sameReorderList', 'resetTaskSwipe', 'handleTaskSwipeStart', 'handleTaskSwipeMove', 'finishTaskSwipe', 'handleTouchReorderStart', 'startTouchReorder', 'handleTouchReorderMove', 'finishTouchReorder', 'cancelTouchReorder', 'blockTouchScroll'].map(fn).join('\n')}`, ctx);
  const event = (type, row, x, y, extra = {}) => ({ type, pointerType: 'touch', isPrimary: true, button: 0, pointerId: 1, clientX: x, clientY: y, target: { closest: selector => (/button|input/.test(selector) ? null : row) }, preventDefault() { calls.push(['prevent', type]); }, ...extra });
  return { ctx, calls, timers, rows, under, event };
}

test('D: a left swipe past the threshold opens the plan date sheet; a right swipe still completes', () => {
  const { ctx, calls, rows, event } = harness();
  ctx.handleTaskSwipeStart(event('pointerdown', rows.a, 200, 100));
  ctx.handleTaskSwipeMove(event('pointermove', rows.a, 150, 102));
  assert.match(rows.a.style.background, /^rgba\(83, 98, 255,/, 'the row turns blue to the left');
  ctx.handleTaskSwipeMove(event('pointermove', rows.a, 90, 102));
  assert.deepEqual(calls.filter(call => call[0] === 'haptic'), [['haptic', 'tick']], 'a tick at the threshold');
  ctx.finishTaskSwipe(event('pointerup', rows.a, 90, 102));
  assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))), ['plan', 'a', { type: 'task', taskId: 'a' }]);
  ctx.handleTaskSwipeStart(event('pointerdown', rows.b, 100, 100));
  ctx.handleTaskSwipeMove(event('pointermove', rows.b, 210, 100));
  ctx.finishTaskSwipe(event('pointerup', rows.b, 210, 100));
  assert.deepEqual(calls.at(-1), ['complete', 'b']);
  ctx.handleTaskSwipeStart(event('pointerdown', rows.c, 200, 100));
  ctx.handleTaskSwipeMove(event('pointermove', rows.c, 150, 100));
  ctx.finishTaskSwipe(event('pointerup', rows.c, 150, 100));
  assert.ok(!['plan', 'complete'].includes(calls.at(-1)[0]) || calls.at(-1)[1] !== 'c', 'a short swipe does nothing');
});

test('E: holding a row, then dragging it over another row of the same list reorders them', () => {
  const { ctx, calls, timers, rows, under, event } = harness();
  ctx.handleTouchReorderStart(event('pointerdown', rows.a, 100, 100));
  assert.equal(timers.at(-1).ms, 350, 'a short hold starts the drag');
  timers.at(-1).callback();
  assert.ok(rows.a.classes.has('is-touch-dragging'));
  assert.deepEqual(calls.filter(call => call[0] === 'haptic').at(-1), ['haptic', 'tick']);
  const scroll = { preventDefault() { calls.push(['no-scroll']); } };
  ctx.blockTouchScroll(scroll);
  assert.deepEqual(calls.at(-1), ['no-scroll'], 'the page does not scroll while a row is dragged');
  under.current = rows.c;
  ctx.handleTouchReorderMove(event('pointermove', rows.a, 102, 180));
  assert.equal(rows.a.style.transform, 'translateY(80px)');
  assert.ok(rows.c.classes.has('is-drop-target'));
  ctx.finishTouchReorder(event('pointerup', rows.a, 102, 180));
  assert.deepEqual(calls.at(-1), ['reorder', 'today', 'a', 'c']);
  assert.ok(!rows.a.classes.has('is-touch-dragging') && !rows.c.classes.has('is-drop-target') && rows.a.style.transform === '');
});

test('E: moving before the hold ends scrolls or swipes instead; another list is never a target', () => {
  const { ctx, calls, timers, rows, under, event } = harness();
  ctx.handleTouchReorderStart(event('pointerdown', rows.a, 100, 100));
  ctx.handleTouchReorderMove(event('pointermove', rows.a, 100, 120));
  timers.at(-1).callback();
  assert.ok(!rows.a.classes.has('is-touch-dragging'), 'the hold was cancelled by the move');
  ctx.blockTouchScroll({ preventDefault() { calls.push(['no-scroll']); } });
  assert.notDeepEqual(calls.at(-1), ['no-scroll']);
  ctx.handleTouchReorderStart(event('pointerdown', rows.a, 100, 100));
  timers.at(-1).callback();
  under.current = rows.x;
  ctx.handleTouchReorderMove(event('pointermove', rows.a, 100, 180));
  assert.ok(!rows.x.classes.has('is-drop-target'));
  ctx.finishTouchReorder(event('pointerup', rows.a, 100, 180));
  assert.equal(calls.filter(call => call[0] === 'reorder').length, 0);
});

test('E: the touch drag is wired to the page, blocks the native drag and long-press menu, and has its look', () => {
  const start = fn('attachEvents');
  assert.match(start, /document\.addEventListener\('pointerdown', handleTouchReorderStart\);/);
  assert.match(start, /document\.addEventListener\('pointermove', handleTouchReorderMove, \{ passive: false \}\);/);
  assert.match(start, /document\.addEventListener\('pointerup', finishTouchReorder\);/);
  assert.match(start, /document\.addEventListener\('pointercancel', finishTouchReorder\);/);
  assert.match(start, /document\.addEventListener\('touchmove', blockTouchScroll, \{ passive: false \}\);/);
  // R62: a row being swiped blocks the long-press menu too.
  assert.match(start, /document\.addEventListener\('contextmenu', event => \{ if \(touchReorder \|\| taskSwipeState\) event\.preventDefault\(\); \}\);/);
  assert.match(fn('handleDragStart'), /if \(touchReorder\) \{ event\.preventDefault\(\); return; \}/);
  assert.match(fn('handleTaskSwipeMove'), /if \(touchReorder\?\.active\) return;/);
  assert.match(css, /\.task-row\.is-touch-dragging \{ position: relative; z-index: 5; pointer-events: none;/);
  // R62: every task row on a touch screen selects no text (and swipes sideways), not only the draggable ones.
  assert.match(css, /@media \(pointer: coarse\) \{\n\s+\.task-row \{ touch-action: pan-y; touch-action: pan-y pinch-zoom; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; \}/);
});

test('R25 shipped as 2.0.0-alpha.50 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 50);
});
