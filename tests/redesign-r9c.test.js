// Redesign R9c: the new goal window (GO7) and the floating "+" on Ciljevi.
// Spec: docs/superpowers/specs/2026-10-10-redesign-r9c-new-goal.md
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
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function moduleFor() {
  let adapter;
  runInNewContextWithI18n(goalsUi, { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: fn => fn() });
  return adapter;
}

const draft = fields => ({ title: '', areaId: null, status: 'active', horizon: 'short', progressMode: 'manual', progressType: 'percentage', currentValue: 0, targetValue: 100, unit: '', targetDate: '', projectLinks: [], taskIds: [], habitLinks: [], milestones: [], reminders: { sevenDaysBefore: false, threeDaysBefore: false, oneDayBefore: false, onTargetDate: false, time: '09:00' }, ...fields });
function windowCtx(fields = {}, extra = {}) {
  const calls = [];
  const inputs = {};
  const state = { goals: [], tasks: [], projects: [], habits: [], areas: [{ id: 'a1', name: 'Finance', status: 'active' }, { id: 'a2', name: 'Old', status: 'archived' }], habitMetrics: {}, ui: {}, settings: {}, ...extra.state };
  const ctx = {
    calls, inputs, state, Core, esc,
    modalState: { type: 'goal', goalId: null, draft: draft(fields), error: '' },
    getGoal: id => state.goals.find(item => item.id === id),
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`,
    formatDate: value => `D:${value}`,
    $: selector => (selector in inputs ? { value: inputs[selector] } : null),
    openPopover: (anchor, html, meta) => calls.push(['open', html, meta]),
    refreshSheet: html => calls.push(['refresh', html]),
    closePopover: () => calls.push(['close']),
    renderModal: () => calls.push(['renderModal']),
    render: () => calls.push(['render']),
    closeModal: () => { calls.push(['closeModal']); ctx.modalState = null; },
    navigate: route => calls.push(['navigate', route]),
    saveState: () => { calls.push(['save']); return true; },
    setToastMessage: message => calls.push(['toast', message]),
    nowIso: () => '2026-10-10T08:00:00.000Z',
    uid: kind => `${kind}-1`,
    putGoalHistory: (id, type) => calls.push(['history', id, type]),
    syncGoalLinks: (goal, projectLinks, taskIds, habitLinks) => Object.assign(goal, { projectLinks, taskIds, habitLinks }),
    maybePromptGoalReached: () => {},
    ...extra.ctx,
  };
  return ctx;
}
const render = ctx => moduleFor().renderRoute({ type: 'modal', modalType: 'goal' }, ctx);
const act = (module, ctx, action, dataset = {}) => module.handleAction(action, { target: { closest: () => ({ dataset }) } }, ctx);
const lastSheet = ctx => [...ctx.calls].reverse().find(call => call[0] === 'open' || call[0] === 'refresh')[1];
const rowsOf = html => [...html.matchAll(/<button class="task-window-row" type="button" data-action="([a-z-]+)"><i class="ph [\w-]+" aria-hidden="true"><\/i><span class="task-window-row-label">([^<]+)<\/span><span class="task-window-row-value(?: is-set)?">([^<]*)<\/span>/g)].map(match => match.slice(1));
const segment = (html, action) => [...html.matchAll(new RegExp(`<button class="btn( is-selected)?" type="button" data-action="${action}" data-value="(\\w+)" aria-pressed="(true|false)">([^<]+)</button>`, 'g'))].map(match => [match[2], match[4], match[3] === 'true']);

test('GO7: "Novi cilj" is a tall sheet with the big name field, the rows and segments, and "Napravi cilj"', () => {
  const html = render(windowCtx());
  assert.match(html, /^<frame quick><div class="modal-inner quick-sheet habit-window goal-window"><div class="modal-header"><h2 class="modal-title">New goal<\/h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"><\/i><\/button><\/div><input id="goal-title" class="quick-title-input" type="text" maxlength="120" autocomplete="off" placeholder="What do you want to achieve\?" value="" aria-label="Goal name"><div class="habit-window-card">/);
  assert.deepEqual(rowsOf(html), [['goal-draft-area', 'Area', 'No area (optional)'], ['goal-draft-date', 'Target date', 'No target date']]);
  assert.match(html, /<div class="habit-window-block"><span class="habit-window-label"><i class="ph ph-path" aria-hidden="true"><\/i>Horizon<\/span><div class="view-tabs habit-window-seg" role="group" aria-label="Horizon">/);
  assert.deepEqual(segment(html, 'goal-draft-horizon'), [['short', 'Short-term', true], ['mid', 'Mid-term', false], ['long', 'Long-term', false]]);
  assert.deepEqual(segment(html, 'goal-draft-mode'), [['manual', 'Manual', true], ['linkedTasks', 'Tasks', false], ['linkedHabits', 'Habits', false]]);
  assert.deepEqual(segment(html, 'goal-draft-type'), [['percentage', 'Percentage', true], ['numeric', 'Number', false]]);
  assert.doesNotMatch(html, /<select|id="goal-target"|id="goal-current"|id="goal-target-date"/);
  assert.match(html, /<button class="habit-window-more" type="button" data-action="toggle-goal-more" aria-expanded="false"><strong>More settings<\/strong><span>Milestones, reminder, links <i class="ph ph-caret-down" aria-hidden="true"><\/i><\/span><\/button><div class="quick-sheet-footer"><span><\/span><button class="btn btn-primary habit-window-save" type="button" data-action="save-goal">Create goal<\/button><\/div><\/div><\/frame>$/);
  // Broj shows the target and unit; Zadaci and Navike explain the source
  const numeric = render(windowCtx({ progressType: 'numeric', targetValue: 12, unit: 'books', areaId: 'a1', targetDate: '2026-12-31' }));
  assert.match(numeric, /<div class="habit-window-target"><label for="goal-target">Target<\/label><input id="goal-target" class="input" type="number" min="0" step="any" value="12"><input id="goal-unit" class="input" maxlength="40" value="books" placeholder="unit" aria-label="Unit"><\/div>/);
  assert.deepEqual(rowsOf(numeric), [['goal-draft-area', 'Area', 'Finance'], ['goal-draft-date', 'Target date', 'D:2026-12-31']]);
  const tasks = render(windowCtx({ progressMode: 'linkedTasks' }));
  assert.deepEqual(segment(tasks, 'goal-draft-type'), [], 'only a manual goal has a type');
  assert.match(tasks, /<p class="sheet-note">Progress is calculated from linked tasks\. Link tasks or projects under “More settings”\.<\/p>/);
  assert.match(render(windowCtx({ progressMode: 'linkedHabits' })), /<p class="sheet-note">Each linked Habit has equal weight; its contribution is capped at 100%\. Link habits under “More settings”\.<\/p>/);
  const error = windowCtx(); error.modalState.error = 'Goal needs a title.';
  assert.match(render(error), /<input id="goal-title" class="quick-title-input is-error"[^>]*><div class="validation" role="alert">Goal needs a title\.<\/div>/);
});

test('GO7: the segments set the draft; the area and date sheets apply to the draft', () => {
  const module = moduleFor();
  const ctx = windowCtx();
  ctx.inputs['#goal-title'] = 'Read 12 books';
  act(module, ctx, 'goal-draft-horizon', { value: 'long' });
  act(module, ctx, 'goal-draft-mode', { value: 'manual' });
  act(module, ctx, 'goal-draft-type', { value: 'numeric' });
  const d = ctx.modalState.draft;
  assert.deepEqual([d.title, d.horizon, d.progressType], ['Read 12 books', 'long', 'numeric'], 'the typed name is kept');
  act(module, ctx, 'goal-draft-mode', { value: 'other' });
  assert.equal(d.progressMode, 'manual');
  act(module, ctx, 'goal-draft-mode', { value: 'linkedHabits' });
  assert.equal(d.progressMode, 'linkedHabits');
  // Oblast
  act(module, ctx, 'goal-draft-area');
  let sheet = lastSheet(ctx);
  assert.match(sheet, /^<div class="popover-title">Area<\/div><p class="sheet-subtitle">Read 12 books<\/p>/);
  assert.doesNotMatch(sheet, /Old/, 'archived areas are not offered');
  act(module, ctx, 'goal-draft-set-area', { areaId: 'a1' });
  assert.equal(d.areaId, 'a1');
  assert.deepEqual(ctx.calls.slice(-2), [['close'], ['renderModal']]);
  act(module, ctx, 'goal-draft-set-area', { areaId: 'missing' });
  assert.equal(d.areaId, null);
  // Ciljni datum
  act(module, ctx, 'goal-draft-date');
  sheet = lastSheet(ctx);
  assert.match(sheet, /^<div class="popover-title">Target date<\/div><p class="sheet-subtitle">Read 12 books<\/p><div class="sheet-chips">/);
  assert.match(sheet, new RegExp(`data-pop-action="goal-date-pick" data-date="${TODAY.slice(0, 4)}-12-31" aria-pressed="false">End of the year<`));
  act(module, ctx, 'goal-date-pick', { date: `${TODAY.slice(0, 4)}-12-31` });
  act(module, ctx, 'goal-date-apply');
  assert.equal(d.targetDate, `${TODAY.slice(0, 4)}-12-31`);
  assert.ok(!ctx.calls.some(call => call[0] === 'save' || call[0] === 'history'), 'a draft is not saved');
  act(module, ctx, 'goal-draft-date');
  act(module, ctx, 'goal-date-clear');
  assert.equal(d.targetDate, null);
  const blank = windowCtx();
  act(module, blank, 'goal-draft-date');
  assert.match(lastSheet(blank), /<p class="sheet-subtitle">New goal<\/p>/);
});

test('GO7: "Više" holds the milestones, the reminder and the links', () => {
  const ctx = windowCtx({ moreOpen: true, milestones: [{ id: 'm1', title: '<Plan>', date: '2026-11-01', isCompleted: false, order: 0 }, { id: 'm2', title: 'Start', date: null, isCompleted: false, order: 1 }], reminders: { sevenDaysBefore: true, threeDaysBefore: false, oneDayBefore: true, onTargetDate: false, time: '08:30' }, projectLinks: [{ projectId: 'p' }], taskIds: ['t1', 't2'] });
  const html = render(ctx);
  assert.match(html, /data-action="toggle-goal-more" aria-expanded="true"><strong>More settings<\/strong><span>Hide <i class="ph ph-caret-up" aria-hidden="true"><\/i><\/span><\/button><h3 class="goal-details-label">Milestones<\/h3><div class="today-card goal-details-milestones">/);
  assert.match(html, /<div class="today-row goal-draft-milestone"><button class="today-row-main" type="button" data-action="draft-goal-milestone" data-milestone-id="m1"><span class="task-title">&lt;Plan><\/span><span class="task-meta">D:2026-11-01<\/span><\/button><button class="btn-icon" type="button" data-action="delete-draft-goal-milestone" data-milestone-id="m1" aria-label="Delete milestone: &lt;Plan>"><i class="ph ph-x"><\/i><\/button><\/div>/);
  // R17: the date sits under the title; a milestone without one has no date line.
  assert.match(html, /data-milestone-id="m2"><span class="task-title">Start<\/span><\/button><button class="btn-icon"/);
  assert.match(html, /<button class="inline-add" type="button" data-action="draft-goal-milestone"><i class="ph ph-plus" aria-hidden="true"><\/i> Add milestone<\/button><\/div>/);
  assert.deepEqual(rowsOf(html).slice(2), [['draft-goal-reminders', 'Reminder', '2 reminder points at 08:30'], ['draft-goal-links', 'Linked', '1 project · 2 tasks']]);
  const module = moduleFor();
  const toggle = windowCtx();
  toggle.inputs['#goal-title'] = 'Kept';
  act(module, toggle, 'toggle-goal-more');
  assert.deepEqual([toggle.modalState.draft.moreOpen, toggle.modalState.draft.title], [true, 'Kept']);
});

test('GO7: "Napravi cilj" needs a name and a numeric target; a new goal stays on the screen with a toast', () => {
  const module = moduleFor();
  const empty = windowCtx();
  empty.inputs['#goal-title'] = '   ';
  act(module, empty, 'save-goal');
  assert.equal(empty.modalState.error, 'Goal needs a title.');
  assert.equal(empty.state.goals.length, 0);
  const numeric = windowCtx({ progressType: 'numeric' });
  Object.assign(numeric.inputs, { '#goal-title': 'Save', '#goal-target': '0', '#goal-unit': '€' });
  act(module, numeric, 'save-goal');
  assert.equal(numeric.modalState.error, 'Numeric goals need a target above zero.');
  const ctx = windowCtx({ progressType: 'numeric', horizon: 'mid', areaId: 'a1', moreOpen: true, milestones: [{ id: 'm1', title: 'Half', date: null, isCompleted: false, order: 0 }] });
  Object.assign(ctx.inputs, { '#goal-title': ' Save 5000 ', '#goal-target': '5000', '#goal-unit': ' € ' });
  act(module, ctx, 'save-goal');
  const [goal] = ctx.state.goals;
  assert.equal(goal.title, 'Save 5000');
  assert.deepEqual([goal.horizon, goal.areaId, goal.progressMode, goal.progressType, goal.targetValue, goal.unit, goal.currentValue, goal.targetDate, goal.status], ['mid', 'a1', 'manual', 'numeric', 5000, '€', 0, null, 'active']);
  assert.deepEqual(goal.milestones.map(item => item.title), ['Half']);
  assert.equal('moreOpen' in goal, false);
  assert.deepEqual(ctx.calls.filter(call => ['history', 'save', 'closeModal', 'render', 'toast', 'navigate'].includes(call[0])), [['history', 'goal-1', 'created'], ['save'], ['closeModal'], ['render'], ['toast', 'Goal created']]);
});

test('app.js: the floating "+" on Ciljevi opens the window and says "Novi cilj"; Q does the same; editing opens the goal window', () => {
  // R10b generalized the direct "+" to a table of screens (Ciljevi, Beleške, Resursi).
  assert.match(app, /const QUICK_ADD_DIRECT = Object\.freeze\(\{ '#goals': \[msg\('New goal'\), \(\) => openGoalModal\(\)\]/);
  assert.match(app, /const quickAddDirect = \(\) => QUICK_ADD_DIRECT\[location\.hash\] \|\| null;/);
  assert.match(fn('handleClick'), /if \(action === 'toggle-mobile-quick-add'\) \{ const direct = quickAddDirect\(\); if \(direct\) \{ direct\[1\]\(\); return; \} setMobileQuickAddOpen\(el\.getAttribute\('aria-expanded'\) !== 'true'\); return; \}/);
  assert.match(fn('handleKeydown'), /if\(command==='newTask'\)\{const direct=quickAddDirect\(\);if\(direct\)direct\[1\]\(\);else openQuickAdd\(\);\}/);
  assert.match(fn('setMobileQuickAddOpen'), /const direct = !open && quickAddDirect\(\);[\s\S]*toggle\.setAttribute\('aria-label', direct \? tr\(direct\[0\]\)/);
  assert.match(fn('syncQuickAddToggle'), /quickAddDirect\(\)/);
  assert.match(fn('renderMain'), /syncQuickAddToggle\(\);/);
  assert.match(fn('openGoalModal'), /^  function openGoalModal\(context = \{\}\) \{/);
  assert.match(fn('openGoalModal'), /modalState = \{ type: 'goal', draft: goalDraft\(null, context\.areaId\), error: '', returnFocus \};/);
  assert.match(goalsUi, /else if \(action === 'edit-goal'\) \{ if \(el\.dataset\.popAction\) ctx\.closePopover\(\); ctx\.openGoalDetails\(el\.dataset\.goalId\); \}/);
  const save = goalsUi.slice(goalsUi.indexOf('function saveGoalModal('), goalsUi.indexOf('function saveGoalProgress('));
  assert.doesNotMatch(save, /modalState\.goalId|navigate\(/, 'the window only creates');
  assert.doesNotMatch(goalsUi, /tr\('Edit goal'\) : tr\('New goal'\)/);
  for (const call of ['ctx.openGoalModal(null,', 'openGoalModal(null,']) assert.ok(!goalsUi.includes(call) && !read('js/areas-ui.js').includes(call) && !app.includes(call), call);
});

test('the R9c layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R9c'));
  assert.ok(layer.length > 20, 'R9c layer');
  for (const selector of ['.goal-window .quick-title-input', '.goal-draft-milestone']) assert.ok(layer.includes(selector), selector);
  for (const [en, value] of [['Number', 'Broj'], ['Milestones, reminder, links', 'Etape, podsetnik, veze'], ['Link tasks or projects under “More settings”.', 'Poveži zadatke ili projekte pod „Više“.'], ['Link habits under “More settings”.', 'Poveži navike pod „Više“.']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R9c shipped as 2.0.0-alpha.18 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 18);
});
