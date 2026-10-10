// Redesign R9b: the goal window (GO5, GO6).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r9b-goal-window.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const goalsUi = read('js/goals-ui.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const TODAY = Core.dateOnly();
const plus = days => Core.addDays(TODAY, days);
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function moduleFor() {
  let adapter;
  runInNewContextWithI18n(goalsUi, { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: fn => fn() });
  return adapter;
}

function goalCtx(fields = {}, extra = {}) {
  const calls = [];
  const inputs = {};
  const goal = { id: 'g', title: 'Taxes', status: 'active', areaId: 'a1', horizon: 'short', progressMode: 'manual', progressType: 'percentage', currentValue: 40, targetValue: 100, unit: '', targetDate: plus(20), milestones: [{ id: 'm1', title: 'Collect papers', isCompleted: true, completedAt: '2026-09-25T10:00:00.000Z', date: '2026-09-25', order: 0 }, { id: 'm2', title: 'Fill in the form', isCompleted: false, date: plus(5), order: 1 }], projectLinks: [], taskIds: [], habitLinks: [], reminders: { sevenDaysBefore: true, threeDaysBefore: false, oneDayBefore: false, onTargetDate: false, time: '09:00' }, ...fields };
  const state = { goals: [goal], tasks: [], projects: [], habits: [], areas: [{ id: 'a1', name: 'Finance', status: 'active' }, { id: 'a2', name: 'Old', status: 'archived' }], habitMetrics: {}, ui: {}, settings: {}, ...extra.state };
  const ctx = {
    calls, inputs, state, Core, esc,
    modalState: { type: 'goal-details', goalId: 'g', showAllTasks: false },
    getGoal: id => state.goals.find(item => item.id === id),
    getHabit: id => state.habits.find(item => item.id === id),
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`,
    formatDate: value => `D:${value}`,
    todayDueLabel: date => `<due ${date}>`,
    reviewTaskRow: (task, context, options) => `<row ${task.id} ${context}${options?.today ? ' today' : ''}>`,
    $: selector => (selector in inputs ? { value: inputs[selector] } : null),
    openPopover: (anchor, html, meta) => calls.push(['open', html, meta]),
    refreshSheet: html => calls.push(['refresh', html]),
    closePopover: () => calls.push(['close']),
    renderModal: () => calls.push(['renderModal']),
    render: () => calls.push(['render']),
    saveState: () => { calls.push(['save']); return true; },
    nowIso: () => '2026-10-10T08:00:00.000Z',
    putGoalHistory: (id, type, data) => calls.push(['history', id, type, data]),
    captureGoalProgress: () => 'before',
    evaluateGoalProgressChanges: value => calls.push(['evaluate', value]),
    maybePromptGoalReached: () => calls.push(['reached']),
    updateGoalStatus: (id, status) => calls.push(['status', id, status]),
    openGoalHistory: id => calls.push(['history-window', id]),
    templateMenuEntry: () => '<template-entry>',
    setModalState: value => { ctx.modalState = value; },
    goalFocusTarget: () => null,
    goalDraft: item => ({ ...item }),
    ...extra.ctx,
  };
  return ctx;
}
const render = ctx => moduleFor().renderRoute({ type: 'modal', modalType: 'goal-details' }, ctx);
const act = (module, ctx, action, dataset = {}) => module.handleAction(action, { target: { closest: () => ({ dataset }) } }, ctx);
const lastHtml = ctx => [...ctx.calls].reverse().find(call => call[0] === 'open' || call[0] === 'refresh')[1];

test('GO5: the window has "Cilj" with ⋯ and X, a renamable title, the area link and the progress card with its health', () => {
  const html = render(goalCtx());
  assert.match(html, /^<frame quick><div class="modal-inner quick-sheet goal-details"><div class="modal-header task-window-header"><span class="task-window-kind">Goal<\/span><div class="task-window-actions"><button class="btn-icon" type="button" data-action="goal-details-menu" data-goal-id="g" aria-label="Goal actions"><i class="ph ph-dots-three"><\/i><\/button><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"><\/i><\/button><\/div><\/div><h2 class="goal-details-heading"><button class="goal-details-title" type="button" data-action="goal-details-rename" data-goal-id="g">Taxes<\/button><\/h2><button class="goal-details-area" type="button" data-action="goal-details-area" data-goal-id="g"><i class="ph ph-squares-four" aria-hidden="true"><\/i>Finance<\/button>/);
  assert.match(html, /<div class="goal-details-progress"><div class="goal-details-big"><strong>40%<\/strong><span>Manual<\/span><\/div><span class="goal-list-bar is-ok" aria-hidden="true"><i style="width:40%"><\/i><\/span><p class="goal-details-health" data-goal-health="on-track"><span class="goal-details-dot is-ok" aria-hidden="true"><\/span><strong>On track<\/strong> · Progress and target date are on track\.<\/p><button class="btn btn-secondary goal-details-update" type="button" data-action="goal-details-progress" data-goal-id="g">Update progress<\/button><\/div>/);
  assert.match(render(goalCtx({ targetDate: plus(3) })), /data-goal-health="at-risk"><span class="goal-details-dot is-risk" aria-hidden="true"><\/span><strong>At risk<\/strong> · Target is within seven days and progress is below 75%\./);
  assert.match(render(goalCtx({ targetDate: plus(-1) })), /data-goal-health="overdue"[\s\S]*The target date has passed\./);
  assert.match(render(goalCtx({ currentValue: 100 })), /data-goal-health="complete"[\s\S]*<strong>Achieved<\/strong>/);
  assert.match(render(goalCtx({ areaId: null })), /data-action="goal-details-area" data-goal-id="g"><i class="ph ph-squares-four" aria-hidden="true"><\/i>No area<\/button>/);
});

test('GO5: Etape with round checks, the editor and "+ Dodaj etapu"', () => {
  const html = render(goalCtx());
  assert.match(html, /<h3 class="goal-details-label">Milestones · 1\/2<\/h3><div class="today-card goal-details-milestones">/);
  // R14c: the date sits under the title and the circle closes the row on the right.
  assert.match(html, /<div class="today-row goal-milestone-row is-done"><button class="today-row-main" type="button" data-action="edit-milestone" data-goal-id="g" data-milestone-id="m1"><span class="task-title">Collect papers<\/span><span class="task-meta">D:2026-09-25<\/span><\/button><button class="habit-check" type="button" data-action="toggle-milestone" data-goal-id="g" data-milestone-id="m1" aria-pressed="true" aria-label="Complete milestone: Collect papers">/);
  assert.match(html, new RegExp(`data-milestone-id="m2"><span class="task-title">Fill in the form<\\/span><span class="task-meta"><due ${plus(5)}><\\/span><\\/button><button class="habit-check"`));
  assert.match(html, /aria-label="Complete milestone: Collect papers">[\s\S]*?<\/svg><\/button><\/div>/, 'the circle is the last part of the row');
  assert.match(html, /<button class="inline-add" type="button" data-action="new-milestone" data-goal-id="g"><i class="ph ph-plus" aria-hidden="true"><\/i> Add milestone<\/button><\/div>/);
  const module = moduleFor();
  const ctx = goalCtx();
  act(module, ctx, 'toggle-milestone', { goalId: 'g', milestoneId: 'm2' });
  assert.equal(ctx.state.goals[0].milestones[1].isCompleted, true);
  assert.deepEqual(ctx.calls.slice(-1), [['renderModal']], 'the window shows the change');
  act(module, ctx, 'edit-milestone', { goalId: 'g', milestoneId: 'm2' });
  assert.equal(ctx.modalState.type, 'milestone');
  assert.equal(ctx.modalState.returnTo.type, 'goal-details', 'the editor returns to the window');
  assert.match(moduleFor().renderRoute({ type: 'modal', modalType: 'milestone' }, ctx), /<button class="btn btn-ghost goal-milestone-delete" type="button" data-action="delete-milestone" data-goal-id="g" data-milestone-id="m2">Delete<\/button>/);
});

test('GO5: linked tasks as Today rows with "Prikaži još", and habit contributions with bars', () => {
  const tasks = Array.from({ length: 5 }, (_, index) => ({ id: `t${index}`, title: `Task ${index}`, projectId: 'p', isCompleted: index === 0 }));
  const ctx = goalCtx({ progressMode: 'linkedTasks', projectLinks: [{ projectId: 'p', contributionMode: 'allTasks', selectedTaskIds: [] }] }, { state: { tasks, projects: [{ id: 'p', name: 'Site' }] } });
  let html = render(ctx);
  assert.match(html, /<div class="goal-details-big"><strong>20%<\/strong><span>1 of 5 tasks<\/span><\/div>/);
  assert.match(html, /<p class="sheet-note">Progress is calculated from linked tasks\.<\/p>/);
  assert.match(html, /<h3 class="goal-details-label">Tasks · 4 open<\/h3><div class="task-list today-card goal-details-tasks"><row t1 goal today><row t2 goal today><row t3 goal today><button class="today-more" type="button" data-action="goal-details-all-tasks" aria-expanded="false">Show 1 more<\/button><\/div>/);
  const module = moduleFor();
  act(module, ctx, 'goal-details-all-tasks');
  html = render(ctx);
  assert.match(html, /<row t4 goal today><button class="today-more" type="button" data-action="goal-details-all-tasks" aria-expanded="true">Show less<\/button>/);
  const habitCtx = goalCtx({ progressMode: 'linkedHabits', habitLinks: [{ habitId: 'h', metric: 'totalCheckins', target: 10 }] }, { state: { habits: [{ id: 'h', name: '<b>Walk</b>' }], habitMetrics: { h: { totalCheckins: 4 } } } });
  html = render(habitCtx);
  assert.match(html, /<h3 class="goal-details-label">Habit contributions<\/h3><div class="today-card habits-bars"><div class="habits-bar"><span class="habits-bar-name">&lt;b>Walk&lt;\/b><\/span><span class="habits-bar-count">40%<\/span><span class="habits-bar-track" aria-hidden="true"><i style="width:40%"><\/i><\/span><span class="task-meta goal-habit-meta">4 \/ 10 Check-ins<\/span><\/div><\/div>/);
  assert.match(html, /<p class="sheet-note">Each linked Habit has equal weight; its contribution is capped at 100%\.<\/p>/);
});

test('GO5: Planiranje and Organizacija rows; the date, horizon, area and rename sheets save at once', () => {
  const ctx = goalCtx({ projectLinks: [{ projectId: 'p', contributionMode: 'allTasks' }], taskIds: ['t1', 't2'], habitLinks: [{ habitId: 'h', metric: 'streak', target: 5 }] });
  const html = render(ctx);
  const rows = [...html.matchAll(/data-action="([a-z-]+)" data-goal-id="g"><i class="ph [\w-]+" aria-hidden="true"><\/i><span class="task-window-row-label">([^<]+)<\/span><span class="task-window-row-value(?: is-set)?">([^<]*)<\/span>/g)].map(match => match.slice(1));
  assert.deepEqual(rows, [
    ['goal-details-date', 'Target date', `D:${plus(20)}`], ['goal-details-horizon', 'Horizon', 'Short-term'], ['edit-goal-source', 'Progress source', 'Manual · Percentage'], ['edit-goal-reminders', 'Reminder', '1 reminder point at 09:00'],
    ['goal-details-area', 'Area', 'Finance'], ['edit-goal-links', 'Linked', '1 project · 2 tasks · 1 habit'],
  ]);
  assert.match(html, /<h3 class="goal-details-label">Planning<\/h3><div class="habit-window-card">/);
  assert.match(html, /<h3 class="goal-details-label">Organization<\/h3>/);
  assert.match(html, /<button class="habit-window-more" type="button" data-action="goal-details-menu" data-goal-id="g"><strong>More options<\/strong><span>History, pause, archive <i class="ph ph-caret-right" aria-hidden="true"><\/i><\/span><\/button>/);
  const module = moduleFor();
  // Ciljni datum
  act(module, ctx, 'goal-details-date', { goalId: 'g' });
  let sheet = lastHtml(ctx);
  assert.match(sheet, /^<div class="popover-title">Target date<\/div><p class="sheet-subtitle">Taxes<\/p><div class="sheet-chips">/);
  assert.match(sheet, new RegExp(`data-pop-action="goal-date-pick" data-date="${plus(30)}" aria-pressed="false">In a month<\\/button>`));
  assert.match(sheet, new RegExp(`data-date="${plus(91)}" aria-pressed="false">In 3 months<`));
  assert.match(sheet, new RegExp(`data-date="${TODAY.slice(0, 4)}-12-31" aria-pressed="false">End of the year<`));
  assert.match(sheet, /<p class="sheet-note">Seven days before the target date, a goal below 75% is marked “At risk”\.<\/p><div class="sheet-footer"><button class="btn btn-ghost" type="button" data-pop-action="goal-date-clear">No date<\/button><button class="btn btn-primary" type="button" data-pop-action="goal-date-apply">Apply<\/button><\/div>$/);
  act(module, ctx, 'goal-date-pick', { date: plus(30) });
  assert.match(lastHtml(ctx), new RegExp(`data-date="${plus(30)}" aria-pressed="true"`));
  act(module, ctx, 'goal-date-apply');
  assert.equal(ctx.state.goals[0].targetDate, plus(30));
  assert.ok(ctx.calls.some(call => call[0] === 'history' && call[2] === 'targetDateChanged'));
  act(module, ctx, 'goal-details-date', { goalId: 'g' });
  act(module, ctx, 'goal-date-clear');
  assert.equal(ctx.state.goals[0].targetDate, null);
  // Horizont, Oblast, rename
  act(module, ctx, 'goal-details-horizon', { goalId: 'g' });
  assert.deepEqual([...lastHtml(ctx).matchAll(/data-pop-action="goal-set-horizon" data-value="(\w+)"/g)].map(match => match[1]), ['short', 'mid', 'long']);
  act(module, ctx, 'goal-set-horizon', { value: 'long' });
  assert.equal(ctx.state.goals[0].horizon, 'long');
  act(module, ctx, 'goal-details-area', { goalId: 'g' });
  assert.doesNotMatch(lastHtml(ctx), /Old/, 'archived areas are not offered');
  act(module, ctx, 'goal-set-area', { areaId: '' });
  assert.equal(ctx.state.goals[0].areaId, null);
  act(module, ctx, 'goal-details-rename', { goalId: 'g' });
  ctx.inputs['#goal-rename'] = '  ';
  act(module, ctx, 'goal-rename-apply');
  assert.match(lastHtml(ctx), /Goal needs a title\./);
  ctx.inputs['#goal-rename'] = ' Taxes 2026 ';
  act(module, ctx, 'goal-rename-apply');
  assert.equal(ctx.state.goals[0].title, 'Taxes 2026');
  assert.deepEqual(ctx.calls.slice(-4), [['save'], ['close'], ['render'], ['renderModal']], 'saved at once, the window re-rendered');
});

test('GO5: "Ažuriraj napredak" offers quick steps and saves through the history; the source window edits target and unit', () => {
  const module = moduleFor();
  const ctx = goalCtx({ progressType: 'numeric', currentValue: 4200, targetValue: 15000, unit: '€' });
  act(module, ctx, 'goal-details-progress', { goalId: 'g' });
  let sheet = lastHtml(ctx);
  assert.match(sheet, /^<div class="popover-title">Update progress<\/div><p class="sheet-subtitle">Taxes<\/p><div class="sheet-chips">/);
  assert.deepEqual([...sheet.matchAll(/data-pop-action="goal-progress-add" data-value="(\d+)">/g)].map(match => Number(match[1])), [375, 1875, 3750]);
  assert.match(sheet, /<label class="sheet-field"><span>Current value<\/span><input id="goal-current-value" class="input" type="number" min="0" step="any" value="4200"><span>of 15,000 €<\/span><\/label><p class="sheet-note">Every change is kept in the goal history\.<\/p>/);
  ctx.inputs['#goal-current-value'] = '4200';
  act(module, ctx, 'goal-progress-add', { value: '375' });
  assert.match(lastHtml(ctx), /value="4575"/);
  ctx.inputs['#goal-current-value'] = '4575';
  act(module, ctx, 'save-goal-progress', { goalId: 'g' });
  assert.equal(ctx.state.goals[0].currentValue, 4575);
  assert.ok(ctx.calls.some(call => call[0] === 'history' && call[2] === 'progressChanged'));
  assert.ok(ctx.calls.some(call => call[0] === 'close'));
  const percent = goalCtx();
  act(module, percent, 'goal-details-progress', { goalId: 'g' });
  assert.deepEqual([...lastHtml(percent).matchAll(/data-pop-action="goal-progress-add" data-value="(\d+)">\+(\d+)%</g)].map(match => match[1]), ['5', '10', '25']);
  // Izvor napretka: the target and the unit of a numeric goal
  act(module, ctx, 'edit-goal-source', { goalId: 'g' });
  assert.equal(ctx.modalState.returnTo.type, 'goal-details');
  const source = moduleFor().renderRoute({ type: 'modal', modalType: 'goal-source' }, ctx);
  assert.match(source, /<input id="goal-target" class="input" type="number" step="any" value="15000" \/>/);
  assert.doesNotMatch(source, /id="goal-current"/);
  Object.assign(ctx.inputs, { '#goal-progress-mode': 'manual', '#goal-progress-type': 'numeric', '#goal-target': '20000', '#goal-unit': ' EUR ' });
  ctx.closeModal = () => ctx.calls.push(['closeModal']);
  act(module, ctx, 'save-goal-source');
  assert.deepEqual([ctx.state.goals[0].targetValue, ctx.state.goals[0].unit], [20000, 'EUR']);
});

test('GO6: "Označi kao ostvaren" is gray below 100% and blue at 100%; finished and archived goals offer "Vrati"', () => {
  assert.match(render(goalCtx()), /<div class="quick-sheet-footer"><span><\/span><button class="btn btn-secondary goal-details-complete" type="button" data-action="complete-goal" data-goal-id="g">Mark as achieved<\/button><\/div><\/div><\/frame>$/);
  assert.match(render(goalCtx({ currentValue: 100 })), /<button class="btn btn-primary goal-details-complete" type="button" data-action="complete-goal" data-goal-id="g">Mark as achieved<\/button>/);
  assert.match(render(goalCtx({ status: 'completed' })), /<button class="btn btn-secondary goal-details-complete" type="button" data-action="restore-goal" data-goal-id="g">Restore as active<\/button>/);
  assert.match(render(goalCtx({ status: 'archived' })), /data-action="restore-goal" data-goal-id="g">Restore goal<\/button>/);
  const module = moduleFor();
  const ctx = goalCtx();
  act(module, ctx, 'goal-details-menu', { goalId: 'g' });
  const [, menu] = ctx.calls.at(-1);
  assert.match(menu, /^<template-entry><button class="popover-option" type="button" data-pop-action="open-goal-history" data-goal-id="g"><i class="ph ph-clock-counter-clockwise"><\/i>History<\/button>/);
  assert.match(menu, /data-pop-action="pause-goal" data-goal-id="g">/);
  assert.match(menu, /data-pop-action="archive-goal"/);
  assert.match(menu, /data-pop-action="delete-goal"/);
  assert.doesNotMatch(menu, /edit-goal|complete-goal/, 'the footer completes; the rows edit');
});

test('app.js: links and old addresses open the window; nested windows return to it; the page and its editor are gone', () => {
  assert.match(fn('navigate'), /const goalRoute = \/\^#\?goal\\\/\(\.\+\)\$\/\.exec\(route\);\n\s+if \(goalRoute\) \{ openGoalDetails\(decodeURIComponent\(goalRoute\[1\]\)\); return; \}/);
  assert.match(fn('renderMain'), /if \(route\.type === 'goal'\) \{ history\.replaceState\(null, '', '#goals'\); openGoalDetails\(route\.id\); \}/);
  assert.match(fn('openGoalDetails'), /modalState = \{ type: 'goal-details', goalId, showAllTasks: false \};/);
  assert.match(fn('closeModal'), /if \(modalState\?\.returnTo\) \{ const back = modalState\.returnTo; modalState = back; renderModal\(\); return; \}/);
  assert.match(fn('openGoalHistory'), /returnTo: modalState\?\.type === 'goal-details' \? modalState : null/);
  assert.match(app, /render\(\); if \(\['task', 'goal-details'\]\.includes\(modalState\?\.type\)\) renderModal\(\); evaluateGoalProgressChanges\(goalProgressBefore\);/, 'completing a linked task updates the window');
  assert.doesNotMatch(app, /goalPropertyEditor|data-goal-property\]/);
  for (const old of ['renderGoal', 'renderGoalProperty', 'saveGoalProperty', 'openGoalStatusMenu']) assert.doesNotMatch(goalsUi, new RegExp(`function ${old}\\(`), old);
  assert.equal(typeof Core.goalTaskSet, 'function');
  assert.equal(moduleFor().renderRoute({ type: 'goal', id: 'g' }, { ...goalCtx(), pageHeader: () => '<header>', emptyState: () => '' }).startsWith('<header>'), true, 'the route shows the list');
});

test('the R9b layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R9b'));
  assert.ok(layer.length > 20, 'R9b layer');
  for (const selector of ['.goal-details-title', '.goal-details-area', '.goal-details-progress', '.goal-details-big', '.goal-details-dot.is-risk', '.goal-milestone-row']) assert.ok(layer.includes(selector), selector);
  for (const [en, value] of [['Mark as achieved', 'Označi kao ostvaren'], ['Restore as active', 'Vrati kao aktivan'], ['In a month', 'Za mesec dana'], ['In 3 months', 'Za 3 meseca'], ['End of the year', 'Kraj godine'], ['Linked', 'Povezano'], ['Planning', 'Planiranje'], ['Organization', 'Organizacija'], ['History, pause, archive', 'Istorija, pauza, arhiva'], ['Every change is kept in the goal history.', 'Svaka promena se čuva u istoriji cilja.']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R9b shipped as 2.0.0-alpha.17 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 17);
});
