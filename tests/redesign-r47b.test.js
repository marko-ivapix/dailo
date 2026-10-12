// Redesign R47b: the desktop layer, part 2 — centered windows (K4), pickers next to their row (K6) and hover (K3).
// Spec: docs/superpowers/specs/2026-10-12-redesign-r47-desktop.md
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
const block = css.slice(css.indexOf('/* Redesign R47b'), css.indexOf('/* Keep primary compact actions touchable'));

function positions() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fn('anchoredPopoverPosition'), context);
  return (rect, size, viewport = { width: 1280, height: 800 }) => JSON.parse(JSON.stringify(context.anchoredPopoverPosition({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }, size, viewport)));
}

test('K4: from 1024 px on every window is a centered dialog — 560 px, or 640 px for the tall ones — and the welcome screen stays full', () => {
  assert.ok(block.length > 0, 'the R47b block sits before the touch guard');
  assert.match(block, /@media \(min-width: 1024px\) \{\n  \.modal-backdrop:not\(\.modal-backdrop-welcome-screen\) \{ place-items: center; padding: 32px 24px; \}/);
  assert.match(block, /  \.modal-backdrop-quick \.modal \{ width: min\(560px, 100%\); max-height: calc\(var\(--viewport-height\) - 64px\); border-bottom: 1px solid var\(--line-2\); border-radius: var\(--radius-lg\); animation: modal-in var\(--motion-slow\) var\(--ease-enter\); \}/);
  assert.match(block, /  \.modal-backdrop-quick \.modal:has\(> \.modal-inner:is\(\.task-window, \.goal-details, \.habit-details, \.knowledge-window, \.habit-window, \.focus-window, \.journal-window, \.template-window\)\) \{ width: min\(640px, 100%\); \}/);
  assert.match(block, /  \.modal-backdrop-quick \.modal:has\(> \.confirm-window\) \{ width: min\(480px, 100%\); \}/);
});

test('K6: a picker opens under its row, or above it when it does not fit, or shifted to fit; a wide row aligns its right edge', () => {
  const at = positions();
  assert.deepEqual(at({ left: 300, top: 100, width: 120, height: 40 }, { width: 380, height: 300 }), { left: 300, top: 146, maxHeight: 776 }, 'under a small control, left edges aligned');
  assert.deepEqual(at({ left: 300, top: 600, width: 120, height: 40 }, { width: 380, height: 300 }), { left: 300, top: 294, maxHeight: 776 }, 'above when there is no room below');
  assert.deepEqual(at({ left: 300, top: 350, width: 120, height: 40 }, { width: 380, height: 500 }), { left: 300, top: 288, maxHeight: 776 }, 'shifted up to fit when neither side has room');
  assert.deepEqual(at({ left: 320, top: 100, width: 640, height: 48 }, { width: 380, height: 300 }), { left: 580, top: 154, maxHeight: 776 }, 'a full-width row: under its value at the right');
  assert.deepEqual(at({ left: 1200, top: 100, width: 40, height: 40 }, { width: 380, height: 300 }), { left: 888, top: 146, maxHeight: 776 }, 'kept inside the window');
  assert.deepEqual(at({ left: 300, top: 100, width: 120, height: 40 }, { width: 380, height: 1200 }), { left: 300, top: 12, maxHeight: 776 }, 'taller than the window: it scrolls inside');
});

test('K6: placePopover — anchored next to the row on a wide screen, the repeat editor and anchorless pickers centered, phones untouched', () => {
  const make = (type, anchor) => {
    const classes = new Set(['popover', 'popover--sheet']);
    const backdropClasses = new Set(['sheet-backdrop']);
    const classList = set => ({ add: (...names) => names.forEach(name => set.add(name)), remove: (...names) => names.forEach(name => set.delete(name)), contains: name => set.has(name) });
    return { classes, backdropClasses, el: { dataset: { popoverType: type }, anchor, style: {}, offsetWidth: 0, scrollHeight: 300, classList: classList(classes), backdrop: { classList: classList(backdropClasses) } } };
  };
  const context = { wide: true, innerWidth: 1280, innerHeight: 800, Math, Object };
  context.wideScreen = () => context.wide;
  vm.createContext(context);
  vm.runInContext(`const POPOVER_WIDTH = 380;\n${fn('anchoredPopoverPosition')}${fn('placePopover')}`, context);
  const row = { isConnected: true, getBoundingClientRect: () => ({ left: 300, top: 100, right: 420, bottom: 140, width: 120, height: 40 }) };

  const date = make('date-sheet', row);
  context.placePopover(date.el);
  assert.ok(date.classes.has('popover--anchored') && date.backdropClasses.has('is-clear'));
  assert.deepEqual([date.el.style.left, date.el.style.top, date.el.style.maxHeight], ['300px', '146px', '776px']);
  // A redraw after the row itself was redrawn keeps the place.
  date.el.anchor = { isConnected: false };
  context.placePopover(date.el);
  assert.equal(date.el.style.top, '146px');

  const repeat = make('repeat', row);
  context.placePopover(repeat.el);
  assert.ok(repeat.classes.has('popover--center') && !repeat.classes.has('popover--anchored') && !repeat.backdropClasses.has('is-clear'));
  const loose = make('task-menu', null);
  context.placePopover(loose.el);
  assert.ok(loose.classes.has('popover--center'));

  context.wide = false;
  const phone = make('date-sheet', row);
  context.placePopover(phone.el);
  assert.ok(!phone.classes.has('popover--anchored') && !phone.classes.has('popover--center'));
  assert.equal(phone.el.style.top, '');
});

test('K6: wiring — opened, redrawn and dragged sheets', () => {
  assert.match(fn('openPopover'), /el\.anchor = anchor;\n[\s\S]*document\.body\.appendChild\(el\);\n    placePopover\(el\);/);
  assert.match(fn('openPopover'), /backdrop\.addEventListener\('wheel', event => event\.preventDefault\(\), \{ passive: false \}\);/);
  assert.match(fn('refreshSheet'), /labelSheet\(popoverEl\);\n    placePopover\(popoverEl\);/);
  assert.match(fn('setPopoverContent'), /decorateSheet\(popoverEl\);\n    placePopover\(popoverEl\);/);
  assert.match(fn('decorateSheet'), /if \(wideScreen\(\) \|\| event\.target\.closest\?\.\('button'\)/, 'the header is not dragged on a wide screen');
  assert.match(block, /  \.popover\.popover--sheet\.popover--anchored \{ bottom: auto; width: min\(380px, calc\(100vw - 24px\)\); max-height: none; transform: none; padding: 0 16px 16px; border-bottom: 1px solid var\(--line-2\); border-radius: var\(--radius-lg\); animation: popover-in var\(--motion-base\) var\(--ease-enter\); \}/);
  assert.match(block, /  \.popover\.popover--sheet\.popover--center \{ top: 50%; bottom: auto; width: min\(440px, calc\(100vw - 24px\)\); max-height: calc\(var\(--viewport-height\) - 64px\); transform: translate\(-50%, -50%\); padding: 0 16px 16px; border-bottom: 1px solid var\(--line-2\); border-radius: var\(--radius-lg\); animation: fade-in var\(--motion-base\) var\(--ease-enter\); \}/);
  assert.match(block, /  \.sheet-backdrop\.is-clear \{ background: transparent; animation: none; \}/);
  assert.match(block, /  :is\(\.popover--anchored, \.popover--center\) \.sheet-grabber \{ display: none; \}/);
});

test('K3: list rows light up under the mouse on a wide screen', () => {
  assert.match(block, /@media \(min-width: 1024px\) and \(hover: hover\) \{\n  :is\(\.today-row, \.goal-list-row, \.area-list-row, \.tag-list-row, \.view-list-row, \.journal-row, \.review-row, \.cleaning-archived-row\):hover \{ background: var\(--graphite-800\); \}/);
});

test('R47b is released as 2.0.0-alpha.74', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.74');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.74';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.74');
});
