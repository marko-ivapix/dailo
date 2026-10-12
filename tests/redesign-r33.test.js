// Redesign R33: the third design pass, windows and screens (findings 22–27, 29, 32–36).
// Spec: docs/superpowers/specs/2026-10-12-redesign-r33-windows.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const css = read('css/styles.css');
const tasksUi = read('js/tasks-ui.js');
const templatesUi = read('js/templates-ui.js');
const habitsUi = read('js/habits-ui.js');
const knowledge = read('js/knowledge.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const plain = value => JSON.parse(JSON.stringify(value));

test('22: the task title is a growing text field; Oblast and Ciljevi are rows with sheets; Važno and Hitno are gone', () => {
  assert.match(tasksUi, /<textarea id="detail-title" class="modal-task-title task-window-title" rows="1" maxlength="500" data-autogrow aria-label="\$\{tr\('Task title'\)\}">\$\{esc\(modalState\.titleDraft\)\}<\/textarea>/);
  assert.match(tasksUi, /row\('task-area-picker', 'ph-squares-four', tr\('Area'\)/);
  assert.match(tasksUi, /row\('task-goals-picker', 'ph-target', tr\('Goals'\)/);
  assert.doesNotMatch(tasksUi, /data-task-flag|data-task-area=|data-task-goal=/);
  assert.match(tasksUi, /tr\('Area, goals'\)/);
});

function taskSheetCtx() {
  const calls = [];
  const task = { id: 't', title: 'Plan', projectId: null, areaId: null, goalIds: ['g1'] };
  const goals = [{ id: 'g1', title: 'A', taskIds: ['t'], status: 'active' }, { id: 'g2', title: 'B', taskIds: [], status: 'active' }];
  const ctx = withI18n({
    state: { goals, areas: [{ id: 'a1', name: 'Dom', status: 'active' }] }, esc: value => String(value), nowIso: () => 'now',
    getTask: id => (id === 't' ? task : null), getArea: id => (id === 'a1' ? { id: 'a1' } : null), sortedAreas: () => [{ id: 'a1', name: 'Dom', status: 'active' }],
    openPopover: (anchor, html, meta) => calls.push(['popover', html, meta]), closePopover: () => calls.push(['close']), saveState: () => calls.push(['save']), render() {}, renderModal() {},
    captureGoalProgress: () => ({}), evaluateGoalProgressChanges: () => {},
  });
  vm.createContext(ctx);
  vm.runInContext(`let taskGoalSheet = null;\n${['openTaskAreaSheet', 'setTaskArea', 'openTaskGoalsSheet', 'applyTaskGoals'].map(fn).join('\n')}\nthis.sheet = () => taskGoalSheet;`, ctx);
  return { ctx, calls, task, goals };
}

test('22: the task window sets its area and goals through sheets', () => {
  const { ctx, calls, task, goals } = taskSheetCtx();
  ctx.openTaskAreaSheet({}, 't');
  assert.match(calls.at(-1)[1], /data-pop-action="task-set-area" data-task-id="t" data-area-id="a1"/);
  ctx.setTaskArea('t', 'a1');
  assert.equal(task.areaId, 'a1');
  ctx.openTaskGoalsSheet({}, 't');
  assert.match(calls.at(-1)[1], /data-pop-action="task-goal-toggle" data-goal-id="g2"/);
  ctx.sheet().ids.add('g2'); ctx.sheet().ids.delete('g1');
  ctx.applyTaskGoals();
  assert.deepEqual(plain(task.goalIds), ['g2']);
  assert.deepEqual(plain(goals.map(goal => goal.taskIds)), [[], ['t']]);
});

test('23: the template editor shows the essentials first, folds the rest, and shows a field only when it applies', () => {
  assert.match(templatesUi, /<details class="template-more"\$\{moreOpen\}><summary>\$\{tr\('More options'\)\}<\/summary>/);
  assert.match(templatesUi, /if \(recurrence\.frequency\) \{/);
  assert.match(templatesUi, /recurrence\.frequency === 'weekly' \? templateField\(ctx, recurrence, 'weekdays', tr\('On these days'\), 'weekdays', null, `\$\{prefix\}recurrence\.`\) : ''/);
  assert.match(templatesUi, /recurrence\.endType === 'date' \? templateField\(ctx, recurrence, 'endOffsetDays'/);
  assert.match(templatesUi, /recurrence\.endType === 'afterOccurrences' \? templateField\(ctx, recurrence, 'endAfterOccurrences'/);
  assert.match(templatesUi, /data\.scheduleEnabled \? field\('scheduleDate'/);
  assert.match(templatesUi, /handleInput\(event, ctx\) \{\n\s+if \(ctx\.modalState\?\.type !== 'template' \|\| event\.type !== 'change'\) return false;/);
  assert.match(templatesUi, /const title = data\.title \|\| data\.name \|\| '';\n\s+return \[title !== template\.name \? title : '', count\]\.filter\(Boolean\)\.join\(' · '\);/);
  assert.match(templatesUi, /\['none', tr\('No priority'\)\]/);
});

test('24: Nedelja puts each habit name on its own row; radio circles sit on the right; numbers are grouped', () => {
  assert.match(habitsUi, /<table class="habits-week-table"><thead><tr>\$\{head\}<\/tr><\/thead>/, 'seven columns in the head and in every row');
  assert.match(habitsUi, /<tr class="habits-week-name-row"><th scope="rowgroup" colspan="7" class="habits-week-name"><button class="habits-week-name-button" type="button" data-route="habit\/\$\{esc\(habit\.id\)\}">\$\{esc\(habit\.name\)\}<\/button><\/th><\/tr>/);
  assert.match(habitsUi, /const radioOption = \(action, value, label, on\) => `<button class="popover-option sheet-option\$\{on \? ' is-selected' : ''\}" type="button" role="radio" aria-checked="\$\{on\}" data-pop-action="\$\{action\}" data-value="\$\{value\}"><span class="sheet-option-label">\$\{label\}<\/span><span class="sheet-radio/);
  assert.match(app, /const radio = \(action, value, label, on, extra = ''\) => `<button[^`]*><span class="sheet-option-label">\$\{label\}<\/span>\$\{extra\}<span class="sheet-radio/);
  assert.doesNotMatch(habitsUi, /useGrouping: false/);
});

test('25: example areas get their own icon and color; "+" on Oblasti adds an area and on an area files into it', () => {
  assert.match(habitsUi, /\['family-friends', tr\('Family & Friends'\), 'ph-users'\]/);
  assert.match(habitsUi, /icon: areaIcon, color: PROJECT_COLORS\[\(state\.areas\.length \+ addedAreas\.length\) % PROJECT_COLORS\.length\]/);
  assert.match(app, /const AREA_ICONS = \['ph-briefcase', 'ph-house', 'ph-heart', 'ph-chart-line-up', 'ph-graduation-cap', 'ph-palette', 'ph-plant', 'ph-airplane', 'ph-users', 'ph-wallet'\];/);
  assert.match(app, /'#areas': \[msg\('New area'\), \(\) => callDomainHook\('handleAction', 'new-area', \{ target: \$\('#mobile-quick-add-toggle'\) \}\)\]/);
  assert.match(fn('routeQuickAddContext'), /if \(route\.type === 'area'\) return getArea\(route\.id\) \? \{ areaId: route\.id \} : \{\};/);
});

test('26: the note window\'s attachments, the journal menu, area icon names and growing text fields', () => {
  assert.match(knowledge, /html \+= `<div class="task-window-attachments">\$\{renderAttachmentsSection\(\{ ownerType: type, ownerId: modalState\.ownerId \}\)\}<\/div>`;/);
  assert.match(knowledge, /<textarea id="knowledge-text" class="input knowledge-text" rows="5" data-autogrow/);
  assert.match(read('js/journal-ui.js'), /ctx\.menuSheet\(/);
  assert.match(read('js/areas-ui.js'), /aria-label="\$\{esc\(ctx\.areaIconName\(icon\)\)\}"/);
  assert.match(css, /textarea\[data-autogrow\] \{ field-sizing: content;/);
  assert.match(app, /function autoGrow\(field\) \{/);
});

test('27: the resource link sheets search, show the chosen items first and leave out finished ones', () => {
  assert.match(knowledge, /const items = relationChoices\(state\[collection\], sheet\.ids\);/);
  assert.match(knowledge, /<label class="sheet-search"><i class="ph ph-magnifying-glass" aria-hidden="true"><\/i><input class="input" type="search" data-sheet-search/);
  let relationChoices;
  const ctx = withI18n({});
  vm.createContext(ctx);
  vm.runInContext(knowledge.slice(knowledge.indexOf('  function relationChoices('), knowledge.indexOf('\n  }\n', knowledge.indexOf('  function relationChoices(')) + 4), ctx);
  relationChoices = ctx.relationChoices;
  const items = [{ id: 'b', title: 'Beta' }, { id: 'done', title: 'Alpha', isCompleted: true }, { id: 'a', title: 'Alfa' }, { id: 'old', title: 'Old', isArchived: true }, { id: 'kept', title: 'Zeta', isCompleted: true }];
  assert.deepEqual(plain(relationChoices(items, ['kept']).map(item => item.id)), ['kept', 'a', 'b']);
});

test('29: dragging a sheet\'s header down closes it', () => {
  assert.match(fn('decorateSheet'), /header\.addEventListener\('pointerdown', event => \{/);
  assert.match(fn('decorateSheet'), /if \(drag > 80\) closePopover\(\);/);
  assert.match(css, /\.sheet-header \{ touch-action: none; cursor: grab; \}/);
});

test('32: an hourglass is the due date and a flag the priority everywhere; Bez projekta has its own icon', () => {
  assert.match(fn('quickParsePreview'), /item\('ph-hourglass-medium', tr\('Due \{date\}'/);
  assert.match(fn('quickParsePreview'), /item\('ph-flag', priorityLabel\(parsed\.priority\)\)/);
  assert.match(app, /data-route="project\/none"><i class="ph ph-circle-dashed project-row-icon"/);
});

test('33: Fokus → Detalji comes back to Fokus with its timer', () => {
  assert.match(fn('openTaskDetail'), /const focus = modalState\?\.type === 'focus' \? modalState : null;/);
  assert.match(fn('openTaskDetail'), /\.\.\.\(focus \? \{ returnTo: focus \} : \{\}\)/);
  assert.match(fn('closeModal'), /if \(modalState\?\.type === 'task' && modalState\.returnTo\?\.type === 'focus'\) \{/);
  assert.match(fn('closeModal'), /startFocusTimer\(\);/);
});

test('34: the task menu fits where it opens: no repeats of the window\'s rows and no moves for a finished task', () => {
  const calls = [];
  const ctx = withI18n({ Core: { dateOnly: () => '2026-10-12' }, esc: String, modalState: null, getTask: id => tasks[id], openPopover: (anchor, html) => calls.push(html), menuSheet: (title, body) => body, templateMenuEntry: () => '<template>' });
  const tasks = { open: { id: 'open', title: 'Open', isCompleted: false, plannedDate: null }, done: { id: 'done', title: 'Done', isCompleted: true } };
  vm.createContext(ctx);
  vm.runInContext(fn('openTaskMenu'), ctx);
  ctx.openTaskMenu({}, 'open');
  assert.match(calls.at(-1), /task-open-plan[\s\S]*task-open-due[\s\S]*task-open-project[\s\S]*task-duplicate[\s\S]*<template>[\s\S]*task-delete/);
  ctx.modalState = { type: 'task', taskId: 'open' };
  ctx.openTaskMenu({}, 'open');
  assert.doesNotMatch(calls.at(-1), /task-open-plan|task-open-due|task-open-project/);
  ctx.modalState = null;
  ctx.openTaskMenu({}, 'done');
  assert.doesNotMatch(calls.at(-1), /task-start-focus|task-add-today|task-move-tomorrow|task-move-anytime|task-open-plan|task-open-due/);
});

test('35, 36: small controls reach 44 px, and Kad stignem keeps the order set in the project', () => {
  assert.match(css, /\.inline-add, \.today-more, \.collapsible-trigger \{ min-height: 44px; \}/);
  assert.match(fn('renderTasksScreen'), /const later = Core\.deriveAnytime\(tasks\)\.sort\(byProjectOrder\);/);
});

// A small stand-in for DOM rows: classes, data attributes, a parent and closest() for the selectors the reorder code uses.
function row(classes, dataset = {}, parent = null, draggable = true) {
  const set = new Set(classes.split(' '));
  const self = {
    dataset, parent, style: {}, releasePointerCapture() {},
    classList: { contains: name => set.has(name), add: (...names) => names.forEach(name => set.add(name)), remove: (...names) => names.forEach(name => set.delete(name)) },
    matches: selector => selector.split(',').some(part => { const match = part.trim().match(/^\.([\w-]+)(\[draggable="true"\])?$/); return Boolean(match) && set.has(match[1]) && (!match[2] || draggable); }),
    closest(selector) { for (let at = self; at; at = at.parent) if (at.matches(selector)) return at; return null; },
  };
  return self;
}

function touchHarness() {
  const calls = [];
  const ctx = { calls, over: null, setTimeout: () => 1, clearTimeout() {}, haptic() {}, resetTaskSwipe() {},
    document: { body: { classList: { add() {}, remove() {} } }, elementFromPoint: () => ctx.over },
    reorderTasks: (...args) => calls.push(['tasks', ...args]), reorderSubtasks: (...args) => calls.push(['subtasks', ...args]) };
  vm.createContext(ctx);
  const constLine = name => app.match(new RegExp(`\\n  const ${name} = [^\\n]+`))[0];
  vm.runInContext(`var touchReorder = null, taskSwipeState = null, suppressTaskSwipeClick = false;\n${constLine('REORDER_ROWS')}\n${constLine('dropGroup')}\n${['sameReorderList', 'handleTouchReorderStart', 'startTouchReorder', 'handleTouchReorderMove', 'finishTouchReorder', 'cancelTouchReorder'].map(fn).join('')}`, ctx);
  const drag = (source, target) => {
    const event = (type, y) => ({ type, pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: 0, clientY: y, target: source, preventDefault() {} });
    ctx.handleTouchReorderStart(event('pointerdown', 0));
    ctx.startTouchReorder(ctx.touchReorder);
    ctx.over = target;
    ctx.handleTouchReorderMove(event('pointermove', 40));
    ctx.finishTouchReorder(event('pointerup', 40));
  };
  return { ctx, calls, drag };
}

test('35: subtasks reorder by holding and dragging, like task rows', () => {
  const { calls, drag } = touchHarness();
  const list = row('subtask-list');
  const first = row('subtask-row', { subtaskId: 's1', parentTaskId: 't' }, list);
  const second = row('subtask-row', { subtaskId: 's2', parentTaskId: 't' }, list);
  drag(first, second);
  assert.deepEqual(plain(calls), [['subtasks', 't', 's1', 's2']]);
  assert.match(css, /\.subtask-row\.is-touch-dragging \{/);
});

test('36: an Inbox row moves only within its capture group, by touch and by mouse', () => {
  const { calls, drag } = touchHarness();
  const today = row('inbox-group-items today-card');
  const earlier = row('inbox-group-items today-card');
  const a1 = row('task-row', { taskId: 'a1', listContext: 'inbox' }, today);
  const a2 = row('task-row', { taskId: 'a2', listContext: 'inbox' }, today);
  const b1 = row('task-row', { taskId: 'b1', listContext: 'inbox' }, earlier);
  drag(a1, b1);
  assert.deepEqual(plain(calls), [], 'another capture group is no drop target');
  drag(a1, a2);
  assert.deepEqual(plain(calls), [['tasks', 'inbox', 'a1', 'a2']]);
  assert.match(fn('handleDragStart'), /dragState = \{ type: 'task', id: row\.dataset\.taskId, context: row\.dataset\.listContext, group: dropGroup\(row\) \};/);
  assert.match(fn('handleDragOver'), /target\.dataset\.listContext !== dragState\.context \|\| dropGroup\(target\) !== dragState\.group/);
  assert.match(fn('handleDrop'), /target\.dataset\.listContext === dragState\.context && dropGroup\(target\) === dragState\.group/);
});

test('R33 is released as 2.0.0-alpha.59', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.59');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.59';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.59');
});
