// R110: the second part of js/app.js moves into a module (plan part 1, "drag"). Task swipes, touch reordering, the
// calendar's hold-and-drag, the Navike week swipe, mouse drag and drop with its drops on the sidebar and on days, and
// the long press live in js/drag-ui.js. The module gets the app's helpers through domainContext() and wires its own
// listeners through a new optional attach(ctx) entry; app.js asks it whether a drag is under way before applying a
// pull. Nothing changes for the user. reorderTasks, reorderSubtasks and dropGroup stay in app.js, because the
// "Pomeri gore / dole" buttons and the subtask editor use them too.
// Spec: docs/superpowers/specs/2026-10-16-r110-drag-module.md · plan: docs/superpowers/plans/2026-10-12-app-js-modules.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');
const { APP_FILES, functionSource, contextKeys } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const fn = name => functionSource(name).source;
const app = read('js/app.js');
const MOVED = [
  'resetTaskSwipe', 'handleTaskSwipeStart', 'handleTaskSwipeMove', 'finishTaskSwipe',
  'sameReorderList', 'handleTouchReorderStart', 'startTouchReorder', 'handleTouchReorderMove', 'finishTouchReorder', 'cancelTouchReorder', 'blockTouchScroll',
  'handleCalendarTouchStart', 'startCalendarTouch', 'handleCalendarTouchMove', 'finishCalendarTouch', 'cancelCalendarTouch',
  'handleWeekSwipeStart', 'finishWeekSwipe', 'handleWeekSwipeClick', 'handleTaskSwipeClick',
  'handleDragStart', 'handleDragOver', 'handleDragLeave', 'handleDrop', 'sidebarDropTarget', 'dropTaskOnSidebar', 'moveTaskToProject', 'dropTaskOnDay', 'handleDragEnd', 'cleanupDrag',
  'handleLongPressStart', 'runLongPress', 'cancelLongPress', 'handleLongPressClick',
];
// The listeners attachEvents wired before R110, in the same order.
const LISTENERS = [
  "document.addEventListener('pointerdown', handleLongPressStart);",
  "document.addEventListener('pointerup', cancelLongPress);",
  "document.addEventListener('pointercancel', cancelLongPress);",
  "document.addEventListener('pointermove', event => { if (longPressTimer && (Math.abs(event.movementX) > 4 || Math.abs(event.movementY) > 4)) cancelLongPress(); });",
  "document.addEventListener('click', handleLongPressClick, true);",
  "document.addEventListener('contextmenu', event => { if (event.target.closest?.('[data-long-press]')) event.preventDefault(); });",
  "document.addEventListener('pointerdown', handleTaskSwipeStart);",
  "document.addEventListener('pointermove', handleTaskSwipeMove, { passive: false });",
  "document.addEventListener('pointerup', finishTaskSwipe);",
  "document.addEventListener('pointercancel', finishTaskSwipe);",
  "document.addEventListener('click', handleTaskSwipeClick, true);",
  "document.addEventListener('pointerdown', handleWeekSwipeStart);",
  "document.addEventListener('pointerup', finishWeekSwipe);",
  "document.addEventListener('pointercancel', () => { weekSwipe = null; });",
  "document.addEventListener('click', handleWeekSwipeClick, true);",
  "document.addEventListener('pointerdown', handleTouchReorderStart);",
  "document.addEventListener('pointermove', handleTouchReorderMove, { passive: false });",
  "document.addEventListener('pointerup', finishTouchReorder);",
  "document.addEventListener('pointercancel', finishTouchReorder);",
  "document.addEventListener('pointerdown', handleCalendarTouchStart);",
  "document.addEventListener('pointermove', handleCalendarTouchMove, { passive: false });",
  "document.addEventListener('pointerup', finishCalendarTouch);",
  "document.addEventListener('pointercancel', finishCalendarTouch);",
  "document.addEventListener('touchmove', blockTouchScroll, { passive: false });",
  "document.addEventListener('contextmenu', event => { if (touchReorder || taskSwipeState || calendarTouch) event.preventDefault(); });",
  "document.addEventListener('dragstart', handleDragStart);",
  "document.addEventListener('dragover', handleDragOver);",
  "document.addEventListener('dragleave', handleDragLeave);",
  "document.addEventListener('drop', handleDrop);",
  "document.addEventListener('dragend', handleDragEnd);",
];

function loadModule() {
  let adapter;
  const listeners = [];
  const timers = [];
  const sandbox = withI18n({
    window: { TodoDomainModules: { register: value => { adapter = value; } }, innerWidth: 1280 },
    document: { addEventListener: (type, handler, options) => listeners.push({ type, handler, options }), body: { classList: { add() {}, remove() {} } } },
    setTimeout: run => { timers.push(run); return timers.length; }, clearTimeout() {},
  });
  vm.runInNewContext(read('js/drag-ui.js'), sandbox);
  return { adapter, listeners, timers };
}

test('the drag code left app.js for js/drag-ui.js; the shared reorder helpers stay', () => {
  for (const name of MOVED) {
    assert.equal(functionSource(name).file, 'js/drag-ui.js', name);
    assert.doesNotMatch(app, new RegExp(`\\n  function ${name}\\(`), `${name} left app.js`);
  }
  for (const name of ['let dragState', 'let taskSwipeState', 'let weekSwipe', 'let suppressWeekSwipeClick', 'let suppressTaskSwipeClick', 'let touchReorder', 'let calendarTouch', 'let longPressTimer', 'const REORDER_ROWS', 'const CALENDAR_TOUCH_SOURCES', 'const CALENDAR_TOUCH_TARGETS']) {
    assert.ok(!app.includes(`  ${name} `), `${name} left app.js`);
  }
  for (const name of ['reorderTasks', 'reorderSubtasks']) assert.equal(functionSource(name).file, 'js/app.js', name);
  assert.match(app, /\n  const dropGroup = row => row\?\.closest\('\.inbox-group-items'\) \|\| null;\n/, 'the Inbox capture group, for the move buttons too');
  for (const listener of LISTENERS) assert.ok(!app.includes(listener), `app.js no longer wires ${listener}`);
});

test('the module registers as "drag", wires the same listeners in the same order, and says when a drag is on', () => {
  const module = read('js/drag-ui.js');
  assert.match(module, /window\.TodoDomainModules\?\.register\(\{\n    name: 'drag',\n    attach,\n    isDragging: \(\) => Boolean\(dragState\),\n  \}\);/);
  const attach = fn('attach');
  assert.ok(attach.includes(LISTENERS.map(line => `    ${line}`).join('\n')), 'the listeners, unchanged and in order');
  // Everything the module takes from the context is there.
  const taken = attach.match(/\(\{ ([^}]+) \} = ctx\);/)[1].split(', ');
  // R111: checked against the context's own keys (the R110 review), not any mention in its source.
  const keys = contextKeys();
  for (const name of taken) assert.ok(keys.has(name), `domainContext gives ${name}`);
  assert.match(app, /\n      \/\/ R110: what js\/drag-ui\.js needs\.\n      haptic, toggleComplete, reorderTasks, reorderSubtasks, dropGroup, receiveAttachmentFiles, addTaskToToday, moveTaskToTomorrow, quickAddDirect, setMobileQuickAddOpen, routeQuickAddContext, callDomainHook,\n/);

  const { adapter, listeners, timers } = loadModule();
  assert.equal(adapter.name, 'drag');
  assert.deepEqual(listeners, [], 'nothing is wired before attach');
  const calls = [];
  const ctx = {
    Core, $$: () => [], getTask: id => ({ id }), getProject: () => null, currentRoute: () => ({ type: 'today' }), dropGroup: () => null,
    callDomainHook: (...args) => calls.push(args),
  };
  adapter.attach(ctx);
  assert.deepEqual(listeners.map(item => item.type), LISTENERS.map(line => line.match(/addEventListener\('([a-z]+)'/)[1]));
  assert.deepEqual(listeners.filter(item => item.options).map(item => [item.type, JSON.stringify(item.options)]), [['click', 'true'], ['pointermove', '{"passive":false}'], ['click', 'true'], ['click', 'true'], ['pointermove', '{"passive":false}'], ['pointermove', '{"passive":false}'], ['touchmove', '{"passive":false}']]);
  const on = type => listeners.find(item => item.type === type).handler;

  assert.equal(adapter.isDragging(), false);
  const row = { dataset: { taskId: 't1', listContext: 'today' }, classList: { add() {} } };
  on('dragstart')({ target: { closest: selector => (selector === '.task-row[draggable="true"]' ? row : null) }, dataTransfer: {} });
  assert.equal(adapter.isDragging(), true, 'a mouse drag holds the sync');
  on('dragend')();
  assert.equal(adapter.isDragging(), false);

  // A long press still reaches the module that owns its action.
  const el = { dataset: { longPress: 'habit-menu' } };
  on('pointerdown')({ isPrimary: true, button: 0, target: { closest: () => el } });
  timers.at(-1)();
  assert.equal(calls.length, 1);
  assert.deepEqual([calls[0][0], calls[0][1], calls[0][2].target === el], ['handleAction', 'habit-menu', true]);
});

test('app.js keeps the glue: attachEvents lets each module attach, and a pull waits for a drag', () => {
  assert.match(fn('attachEvents'), /^  function attachEvents\(\) \{\n    \/\/ R110: [^\n]+\n    for \(const adapter of window\.TodoDomainModules\?\.getAdapters\(\) \|\| \[\]\) adapter\.attach\?\.\(domainContext\(\)\);\n    document\.addEventListener\('click', handleClick\);/);
  assert.match(fn('syncWaiting'), /return Boolean\(modalState \|\| undoState \|\| undoHold \|\| textSaveTimer \|\| callDomainHook\('isDragging'\) \|\| editingText\(\)\);/);
});

test('the module loads before app.js, is precached, and the tests read it as part of the app', () => {
  // R111: js/quick-add-ui.js comes next, still before app.js.
  const html = read('index.html');
  assert.match(html, /<script src="js\/palette-ui\.js"><\/script>\n  <script src="js\/drag-ui\.js"><\/script>\n/);
  assert.ok(html.indexOf('src="js/drag-ui.js"') < html.indexOf('src="js/app.js"'));
  assert.match(read('sw.js'), /'js\/palette-ui\.js',\n  'js\/drag-ui\.js',\n/);
  assert.ok(APP_FILES.indexOf('js/drag-ui.js') === 1 && APP_FILES.at(-1) === 'js/app.js', APP_FILES.join());
  const plan = read('docs/superpowers/plans/2026-10-12-app-js-modules.md');
  assert.match(plan, /\| R110 \| [^\n]+ \| `js\/drag-ui\.js` \| `2\.0\.0-alpha\.139` \|/);
  assert.ok(plan.includes('`attach(ctx)`') && plan.includes('`isDragging`'));
});

test('R110 shipped as 2.0.0-alpha.139 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 139) >= 139);
});
