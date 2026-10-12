// Redesign R44: a horizontal swipe over the week bar or the rings on Navike pages the week like ‹ and ›.
// Spec: docs/superpowers/specs/2026-10-12-redesign-r44-week-swipe.md
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

function harness({ disabled = {} } = {}) {
  const clicks = [];
  const arrow = shift => ({ disabled: Boolean(disabled[shift]), click: () => clicks.push(shift) });
  const context = {
    weekSwipe: null, suppressWeekSwipeClick: false, Math, timers: [], setTimeout(run) { context.timers.push(run); },
    document: { querySelector: selector => { const match = /data-shift="(-?1)"/.exec(selector); return match ? arrow(match[1]) : null; } },
  };
  vm.createContext(context);
  vm.runInContext(`${fn('handleWeekSwipeStart')}${fn('finishWeekSwipe')}${fn('handleWeekSwipeClick')}`, context);
  const inStrip = { closest: selector => (selector.includes('.habit-rings') ? {} : null) };
  const swipe = (dx, dy, { target = inStrip, pointerType = 'touch' } = {}) => {
    context.handleWeekSwipeStart({ pointerType, target, clientX: 200, clientY: 300, isPrimary: true });
    context.finishWeekSwipe({ pointerType, target, clientX: 200 + dx, clientY: 300 + dy });
  };
  return { context, clicks, swipe };
}

test('a swipe to the left shows the next week, to the right the previous one', () => {
  const h = harness();
  h.swipe(-80, 10);
  h.swipe(90, -12);
  assert.deepEqual(h.clicks, ['1', '-1']);
});

test('short, mostly vertical, outside or mouse movements do nothing; a disabled arrow stays', () => {
  const h = harness({ disabled: { '1': true } });
  h.swipe(-30, 0);
  h.swipe(-80, 70);
  h.swipe(-80, 0, { target: { closest: () => null } });
  h.swipe(80, 0, { pointerType: 'mouse' });
  h.swipe(-80, 0);
  assert.deepEqual(h.clicks, [], 'the next arrow is disabled at next week');
});

test('the click that ends a swipe does not open the ring under the finger; the arrow\'s own click is not swallowed', () => {
  const h = harness();
  h.context.document.querySelector = () => ({ disabled: false, click: () => { h.clicks.push(h.context.suppressWeekSwipeClick ? 'swallowed' : 'pressed'); } });
  h.swipe(-80, 0);
  assert.deepEqual(h.clicks, ['pressed']);
  const click = { prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
  h.context.handleWeekSwipeClick(click);
  assert.deepEqual([click.prevented, click.stopped], [true, true]);
  const next = { prevented: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {} };
  h.context.handleWeekSwipeClick(next);
  assert.equal(next.prevented, false, 'only once');
  h.swipe(-80, 0);
  h.context.timers.at(-1)();
  assert.equal(h.context.suppressWeekSwipeClick, false, 'a swipe without a following click clears the guard');
});

test('wiring: the listeners, the swipe area and touch-action', () => {
  const events = fn('attachEvents');
  assert.match(events, /document\.addEventListener\('pointerdown', handleWeekSwipeStart\);\n    document\.addEventListener\('pointerup', finishWeekSwipe\);\n    document\.addEventListener\('pointercancel', \(\) => \{ weekSwipe = null; \}\);\n    document\.addEventListener\('click', handleWeekSwipeClick, true\);/);
  assert.match(fn('handleWeekSwipeStart'), /event\.target\?\.closest\?\.\('\.habit-rings, \.habits-week-nav'\)/);
  assert.match(css, /\.habit-rings, \.habits-week-nav \{ touch-action: pan-y; \}/);
});

test('R44 is released as 2.0.0-alpha.70', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.70');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.70';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.70');
});
