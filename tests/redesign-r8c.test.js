// Redesign R8c: the habit details window (S13).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r8c-habit-details.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const habitsUi = read('js/habits-ui.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const TODAY = Core.dateOnly();
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const plain = value => JSON.parse(JSON.stringify(value));
const log = (habitId, date, status = 'done', value = null) => ({ id: `${habitId}:${date}`, habitId, date, status, value });

function moduleFor() {
  let adapter;
  runInNewContextWithI18n(habitsUi, { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: fn => fn() });
  return adapter;
}
function habitDraftFn() {
  const ctx = { Core };
  vm.createContext(withI18n(ctx));
  vm.runInContext(fn('habitDraft'), ctx);
  return ctx.habitDraft;
}

function detailsCtx(habitFields = {}, logs = [], extra = {}) {
  const calls = [];
  const inputs = {};
  const habit = { id: 'h', name: 'Water', status: 'active', routine: 'morning', trackingType: 'numeric', targetValue: 2, unit: 'l', quickValues: [0.25, 0.5, 1], frequencyType: 'daily', weekdays: [], timesPerWeek: 4, everyNDays: 2, startDate: '2026-01-01', reminders: [{ id: 'r1', time: '08:00', enabled: true }], minimumTarget: 1.5, idealTarget: null, graceDays: 1, continuation: 'automatic', endType: 'never', endDate: null, successfulPeriodsTarget: null, goalIds: ['g1'], areaId: 'a1', ...habitFields };
  const draftOf = habitDraftFn();
  const ctx = {
    calls, inputs, Core, esc,
    state: { habits: [habit], areas: [{ id: 'a1', name: 'Zdravlje', status: 'active' }], goals: [{ id: 'g1', title: 'Maraton', status: 'active' }], settings: { weekStartsOn: 'monday' }, habitLogCache: { h: logs } },
    modalState: { type: 'habit-details', habitId: 'h', month: TODAY.slice(0, 7), draft: null },
    getHabit: id => ctx.state.habits.find(item => item.id === id),
    habitDraft: item => draftOf(item),
    habitMetrics: () => ({ currentStreak: 3, longestStreak: 14, totalCheckins: 120, currentPeriodCount: 1, currentPeriodTarget: 1, periods: [] }),
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`,
    formatDate: (value, mode) => (mode === 'full' ? `F:${value}` : `D:${value}`),
    relativeDateLabel: value => `R:${value}`,
    $: selector => (selector in inputs ? { value: inputs[selector] } : null),
    $$: () => [],
    openPopover: (anchor, html, meta) => calls.push(['open', html, meta]),
    refreshSheet: html => calls.push(['refresh', html]),
    closePopover: () => calls.push(['close']),
    renderModal: () => calls.push(['renderModal']),
    closeModal: () => calls.push(['closeModal']),
    render: () => calls.push(['render']),
    saveState: () => { calls.push(['save']); return true; },
    refreshHabitMetrics: () => Promise.resolve(),
    nowIso: () => '2026-10-10T08:00:00.000Z',
    uid: kind => `${kind}-1`,
    captureGoalProgress: () => 'before',
    evaluateGoalProgressChanges: value => calls.push(['evaluate', value]),
    syncHabitGoalLinks: (item, ids) => { item.goalIds = [...ids]; calls.push(['goals', [...ids]]); },
    setHabitLog: (...args) => { calls.push(['log', ...args]); return Promise.resolve(true); },
    openHabitValue: (...args) => calls.push(['value', ...args]),
    openHabitDetails: id => calls.push(['details', id]),
    openHabitStartSheet: () => calls.push(['start-sheet']),
    updateHabitStatus: (id, status) => calls.push(['status', id, status]),
    templateMenuEntry: () => '<template-entry>',
    requestDeleteEntity: (type, id) => calls.push(['delete', type, id]),
    snoozeHabit: (id, kind) => calls.push(['snooze', id, kind]),
    ...extra,
  };
  return ctx;
}
const render = ctx => moduleFor().renderRoute({ type: 'modal', modalType: 'habit-details' }, ctx);
const act = (module, ctx, action, dataset = {}) => module.handleAction(action, { target: { closest: () => ({ dataset }) } }, ctx);
const lastHtml = ctx => [...ctx.calls].reverse().find(call => call[0] === 'open' || call[0] === 'refresh')[1];
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('S13: a tall window with "Navika", ⋯ and X, the name and its line, today, four numbers and the footer', () => {
  const ctx = detailsCtx({}, [log('h', TODAY, 'missed', 1.5)]);
  const html = render(ctx);
  assert.match(html, /^<frame quick><div class="modal-inner quick-sheet habit-details"><div class="modal-header task-window-header"><span class="task-window-kind">Habit<\/span><div class="task-window-actions"><button class="btn-icon" type="button" data-action="habit-details-menu" data-habit-id="h" aria-label="Habit actions"><i class="ph ph-dots-three"><\/i><\/button><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"><\/i><\/button><\/div><\/div><h2 class="habit-details-title">Water<\/h2><p class="habit-details-meta">Daily · Morning · Active<\/p>/);
  assert.match(html, /<div class="today-card habit-details-today"><article class="today-row habit-today-row" data-habit-id="h">/);
  assert.match(html, /<span class="task-side habit-today-count">1\.5 \/ 2 l<\/span>/);
  assert.match(html, /<div class="habit-details-today-line"><span>Today: Not checked in<\/span><\/div>/, 'a numeric habit is not skipped');
  assert.deepEqual([...html.matchAll(/<div class="habit-details-tile"><strong>([^<]+)<\/strong><span>([^<]+)<\/span><\/div>/g)].map(match => match.slice(1)), [['3 days', 'Current streak'], ['14 days', 'Longest streak'], ['120', 'Total check-ins'], [ /* the week */ html.match(/<strong>(\d+%)<\/strong><span>Done this week/)[1], 'Done this week']]);
  assert.match(html, /<div class="quick-sheet-footer"><span><\/span><button class="btn btn-secondary habit-details-status" type="button" data-action="habit-details-status" data-habit-id="h" data-status="paused">Pause habit<\/button><\/div><\/div><\/frame>$/);
  const checkbox = detailsCtx({ trackingType: 'checkbox' }, [log('h', TODAY, 'skipped')]);
  assert.match(render(checkbox), /<span>Today: Skipped<\/span><button class="btn btn-ghost" type="button" data-action="habit-today-skip" data-habit-id="h">Undo skip<\/button>/);
  const paused = detailsCtx({ status: 'paused' });
  const pausedHtml = render(paused);
  assert.doesNotMatch(pausedHtml, /habit-details-today"/);
  assert.match(pausedHtml, /<p class="sheet-note">Paused and archived habits preserve history but cannot be checked in\.<\/p>/);
  assert.match(pausedHtml, /data-status="active">Resume habit<\/button>/);
  assert.match(render(detailsCtx({ status: 'archived' })), /data-status="active">Restore habit<\/button>/);
  assert.match(render(detailsCtx({ frequencyType: 'timesPerWeek', timesPerWeek: 3 })), /<strong>3 weeks<\/strong><span>Current streak<\/span>/, 'a weekly habit counts weeks');
});

test('S13: the month calendar records today or a past day; future and unscheduled days are inactive', () => {
  const yesterday = Core.addDays(TODAY, -1);
  const ctx = detailsCtx({ trackingType: 'checkbox' }, [log('h', yesterday, 'done')]);
  const html = render(ctx);
  assert.match(html, /<div class="habit-details-month"><div class="habit-details-month-head"><button class="btn-icon" type="button" data-action="habit-details-month" data-shift="-1" aria-label="Previous month"><i class="ph ph-caret-left"><\/i><\/button><span>[^<]+<\/span><button class="btn-icon" type="button" data-action="habit-details-month" data-shift="1" aria-label="Next month" disabled>/);
  const length = new Date(Number(TODAY.slice(0, 4)), Number(TODAY.slice(5, 7)), 0).getDate();
  assert.equal((html.match(/<button class="habit-cell /g) || []).length, length);
  assert.equal((html.match(/<span class="habit-details-weekday">/g) || []).length, 7);
  assert.match(html, /<span class="habit-details-weekday">Mon<\/span>/);
  if (yesterday.slice(0, 7) === TODAY.slice(0, 7)) assert.match(html, new RegExp(`<button class="habit-cell is-done" type="button" data-action="habit-today-toggle" data-habit-id="h" data-date="${yesterday}" aria-label="F:${yesterday}: Done" aria-pressed="true">${Number(yesterday.slice(8))}<\\/button>`));
  assert.match(html, new RegExp(`<button class="habit-cell is-open is-today" type="button" data-action="habit-today-toggle" data-habit-id="h" data-date="${TODAY}" aria-label="F:${TODAY}: Not checked in" aria-pressed="false">`));
  const tomorrow = Core.addDays(TODAY, 1);
  if (tomorrow.slice(0, 7) === TODAY.slice(0, 7)) assert.match(html, new RegExp(`data-date="${tomorrow}" disabled aria-label="F:${tomorrow}: Future"`));
  assert.match(html, /<p class="sheet-note">A tap on a past day changes the history\.<\/p>/);
  const archived = render(detailsCtx({ trackingType: 'checkbox', status: 'archived' }));
  assert.match(archived, new RegExp(`data-date="${TODAY}" disabled`), 'today cannot be checked in once archived');
  if (yesterday.slice(0, 7) === TODAY.slice(0, 7)) assert.doesNotMatch(archived, new RegExp(`data-date="${yesterday}" disabled`), 'the past stays editable');
  const module = moduleFor();
  act(module, ctx, 'habit-details-month', { shift: '-1' });
  assert.equal(ctx.modalState.month, Core.addDays(`${TODAY.slice(0, 7)}-01`, -1).slice(0, 7));
  assert.deepEqual(ctx.calls.at(-1), ['renderModal']);
  act(module, ctx, 'habit-details-month', { shift: '1' });
  act(module, ctx, 'habit-details-month', { shift: '1' });
  assert.equal(ctx.modalState.month, TODAY.slice(0, 7), 'never past this month');
  act(module, ctx, 'habit-today-toggle', { habitId: 'h', date: yesterday });
  assert.deepEqual(ctx.calls.at(-1), ['log', 'h', yesterday, 'missed']);
});

test('S13: "Uvid" shows the week, the period target and the recovery line', () => {
  const ctx = detailsCtx({ idealTarget: 2.5 }, [], { habitMetrics: () => ({ currentStreak: 0, longestStreak: 0, totalCheckins: 0, currentPeriodCount: 1.5, periods: [] }) });
  const html = render(ctx);
  assert.match(html, /<h3 class="habit-details-label">Insight<\/h3><div class="today-card habit-details-insight" data-habit-target-status="minimum"><p>This week: \d+ of \d+<\/p><p>1\.5 \/ 1\.5 minimum · 2\.5 ideal · Minimum target met<\/p><p class="task-meta" data-habit-recovery>No recent missed period to recover from\.<\/p><\/div>/);
  assert.doesNotMatch(render(detailsCtx({ trackingType: 'checkbox', minimumTarget: null })), /data-habit-target-status/, 'a daily checkbox habit has no period target line');
});

test('S13: "Podešavanja" lists the settings rows with their values', () => {
  const html = render(detailsCtx({ graceDays: 2, continuation: 'askEachPeriod', endType: 'date', endDate: '2026-12-31' }));
  const rows = [...html.matchAll(/data-action="(habit-(?:draft|details)-[a-z]+)"><i class="ph [\w-]+" aria-hidden="true"><\/i><span class="task-window-row-label">([^<]+)<\/span><span class="task-window-row-value(?: is-set)?">([^<]*)<\/span>/g)].map(match => match.slice(1));
  assert.deepEqual(rows, [
    ['habit-details-name', 'Name', 'Water'], ['habit-draft-area', 'Area', 'Zdravlje'], ['habit-details-routine', 'Routine', 'Morning'],
    ['habit-details-tracking', 'Tracking', 'Numeric · 2 l'], ['habit-draft-quick', 'Quick values', '+0.25  +0.5  +1'], ['habit-draft-frequency', 'Frequency', 'Daily'],
    ['habit-draft-reminders', 'Reminders', '08:00'], ['habit-draft-targets', 'Minimum and ideal', 'Minimum 1.5 · ideal 1.5'], ['habit-details-grace', 'Grace days', '2 days'],
    // R16: "Početak" sits before "Kraj".
    ['habit-details-continuation', 'Continuation', 'Ask each period'], ['habit-draft-start', 'Start', 'R:2026-01-01'], ['habit-draft-end', 'End', 'Until D:2026-12-31'], ['habit-draft-goals', 'Linked goals', 'Maraton'],
  ]);
  assert.match(html, /<h3 class="habit-details-label">Settings<\/h3><div class="habit-window-card">/);
  const plainHabit = render(detailsCtx({ trackingType: 'checkbox', graceDays: 0, minimumTarget: null, reminders: [], goalIds: [], areaId: null }));
  assert.match(plainHabit, /Tracking<\/span><span class="task-window-row-value is-set">Checkbox<\/span>/);
  assert.doesNotMatch(plainHabit, /habit-draft-quick|habit-draft-targets/);
  assert.match(plainHabit, /Grace days<\/span><span class="task-window-row-value is-set">No grace days<\/span>/);
  assert.match(plainHabit, /Reminders<\/span><span class="task-window-row-value">Not set<\/span>/);
});

test('S13: the sheets save at once — name, area, routine, grace days, continuation, frequency and goals', async () => {
  const module = moduleFor();
  const ctx = detailsCtx({ trackingType: 'checkbox', frequencyType: 'timesPerWeek', timesPerWeek: 3, minimumTarget: null });
  const habit = ctx.state.habits[0];
  // Naziv
  act(module, ctx, 'habit-details-name');
  assert.match(lastHtml(ctx), /^<div class="popover-title">Name<\/div><label class="sheet-field"><span>Name<\/span><input id="habit-rename" class="input" maxlength="120" value="Water" data-sheet-focus><\/label>/);
  ctx.inputs['#habit-rename'] = '  ';
  act(module, ctx, 'habit-name-apply');
  assert.match(lastHtml(ctx), /<p class="validation" role="alert">Habit needs a name\.<\/p>/);
  ctx.inputs['#habit-rename'] = ' Water 2 l ';
  act(module, ctx, 'habit-name-apply');
  await settle();
  assert.equal(habit.name, 'Water 2 l');
  assert.equal(ctx.modalState.draft, null, 'the draft is cleared after a save');
  assert.ok(ctx.calls.some(call => call[0] === 'save'));
  // Oblast applies at once
  act(module, ctx, 'habit-draft-area');
  act(module, ctx, 'habit-draft-set-area', { areaId: '' });
  assert.equal(habit.areaId, null);
  // Rutina
  act(module, ctx, 'habit-details-routine');
  assert.deepEqual([...lastHtml(ctx).matchAll(/data-pop-action="habit-details-set-routine" data-value="(\w+)"/g)].map(match => match[1]), ['morning', 'daily', 'night']);
  act(module, ctx, 'habit-details-set-routine', { value: 'night' });
  assert.equal(habit.routine, 'night');
  // Dani tolerancije
  act(module, ctx, 'habit-details-grace');
  assert.match(lastHtml(ctx), /<input id="habit-grace" class="input" type="number" min="0" step="1" value="1">/);
  ctx.inputs['#habit-grace'] = '1.5';
  act(module, ctx, 'habit-grace-apply');
  assert.match(lastHtml(ctx), /Enter zero or more whole days\./);
  ctx.inputs['#habit-grace'] = '3';
  act(module, ctx, 'habit-grace-apply');
  assert.equal(habit.graceDays, 3);
  // Nastavak
  act(module, ctx, 'habit-details-continuation');
  act(module, ctx, 'habit-details-set-continuation', { value: 'onePeriod' });
  assert.equal(habit.continuation, 'onePeriod');
  // Učestalost: a new weekly target applies from this week on (M11)
  act(module, ctx, 'habit-draft-frequency');
  act(module, ctx, 'habit-freq-step', { key: 'timesPerWeek', step: '1' });
  act(module, ctx, 'habit-freq-apply');
  assert.equal(habit.timesPerWeek, 4);
  assert.deepEqual(plain(habit.targetHistory), [{ before: Core.habitPeriodKey({ frequencyType: 'timesPerWeek' }, TODAY, Core.habitWeekRule({ weekStartsOn: 'monday' })), timesPerWeek: 3 }]);
  // Povezani ciljevi: progress is re-evaluated
  act(module, ctx, 'habit-draft-goals');
  act(module, ctx, 'habit-goal-toggle', { goalId: 'g1' });
  act(module, ctx, 'habit-goals-apply');
  await settle();
  assert.deepEqual(plain(habit.goalIds), []);
  assert.ok(ctx.calls.some(call => call[0] === 'goals'));
  assert.ok(ctx.calls.some(call => call[0] === 'evaluate'));
  // Opening a sheet and closing it with X saves nothing.
  const saves = ctx.calls.filter(call => call[0] === 'save').length;
  act(module, ctx, 'habit-draft-end');
  act(module, ctx, 'habit-end-type', { value: 'date' });
  assert.equal(ctx.calls.filter(call => call[0] === 'save').length, saves);
});

test('S13: Praćenje cannot change with history; a numeric target and unit can', async () => {
  const module = moduleFor();
  const ctx = detailsCtx({}, [log('h', TODAY, 'done', 2)]);
  const habit = ctx.state.habits[0];
  act(module, ctx, 'habit-details-tracking');
  let html = lastHtml(ctx);
  assert.match(html, /<p class="sheet-note">Tracking cannot change while this Habit has history\.<\/p>/);
  assert.doesNotMatch(html, /habit-tracking-type/);
  assert.match(html, /<input id="habit-tracking-target" class="input" type="number" min="0" step="any" value="2">/);
  Object.assign(ctx.inputs, { '#habit-tracking-target': '0', '#habit-tracking-unit': 'l' });
  act(module, ctx, 'habit-tracking-apply');
  assert.match(lastHtml(ctx), /Numeric habits need a target above zero\./);
  Object.assign(ctx.inputs, { '#habit-tracking-target': '2.5', '#habit-tracking-unit': ' L ' });
  act(module, ctx, 'habit-tracking-apply');
  await settle();
  assert.deepEqual([habit.trackingType, habit.targetValue, habit.unit], ['numeric', 2.5, 'L']);
  const fresh = detailsCtx({ trackingType: 'checkbox' });
  act(module, fresh, 'habit-details-tracking');
  html = lastHtml(fresh);
  assert.match(html, /data-pop-action="habit-tracking-type" data-value="checkbox"/);
  act(module, fresh, 'habit-tracking-type', { value: 'numeric' });
  assert.match(lastHtml(fresh), /habit-tracking-target/);
  Object.assign(fresh.inputs, { '#habit-tracking-target': '20', '#habit-tracking-unit': 'min' });
  act(module, fresh, 'habit-tracking-apply');
  assert.deepEqual([fresh.state.habits[0].trackingType, fresh.state.habits[0].targetValue, fresh.state.habits[0].minimumTarget], ['numeric', 20, null], 'a new tracking clears the targets');
});

test('S13: the menu, pause / resume / restore, the value sheet return and the openers', () => {
  const module = moduleFor();
  const ctx = detailsCtx();
  act(module, ctx, 'habit-details-menu', { habitId: 'h' });
  const [, menu] = ctx.calls.at(-1);
  assert.match(menu, /^<template-entry>/);
  assert.match(menu, /data-pop-action="archive-habit" data-habit-id="h">/);
  assert.match(menu, /data-pop-action="snooze-habit" data-habit-id="h" data-snooze="15m">/);
  assert.match(menu, /data-pop-action="delete-habit" data-habit-id="h"/);
  assert.doesNotMatch(menu, /edit-habit|pause-habit/, 'the details have their own rows and footer');
  act(module, ctx, 'habit-details-status', { habitId: 'h', status: 'paused' });
  assert.deepEqual(ctx.calls.slice(-2), [['status', 'h', 'paused'], ['closeModal']]);
  act(module, ctx, 'archive-habit', { habitId: 'h' });
  assert.deepEqual(ctx.calls.slice(-2), [['status', 'h', 'archived'], ['closeModal']], 'archiving from the details closes them');
  act(module, ctx, 'habit-today-details', { habitId: 'h' });
  assert.deepEqual(ctx.calls.slice(-2), [['close'], ['details', 'h']]);
  // app.js: links and old addresses open the window; the value sheet returns to it.
  assert.match(fn('navigate'), /const habitRoute = \/\^#\?habit\\\/\(\.\+\)\$\/\.exec\(route\);\n\s+if \(habitRoute\) \{ openHabitDetails\(decodeURIComponent\(habitRoute\[1\]\)\); return; \}/);
  assert.match(fn('renderMain'), /if \(route\.type === 'habit'\) \{ history\.replaceState\(null, '', '#habits'\); openHabitDetails\(route\.id\); \}/);
  assert.match(fn('openHabitDetails'), /modalState = \{ type: 'habit-details', habitId, month: Core\.dateOnly\(\)\.slice\(0, 7\), draft: null \};/);
  assert.match(fn('openHabitValue'), /const previous = modalState\?\.type === 'habit-details' \? modalState : null;/);
  assert.match(fn('closeModal'), /if \(modalState\?\.type === 'habit-value' && modalState\.previous\) \{ modalState = modalState\.previous; renderModal\(\); return; \}/);
  assert.match(fn('setHabitLog'), /render\(\); if \(modalState\?\.type === 'habit-details'\) renderModal\(\); return true;/);
  assert.doesNotMatch(app, /habitPropertyEditor|'habit-settings'|data-habit-property\]/);
  for (const old of ['renderHabitInsights', 'renderHabitAnalytics', 'heatmapHtml', 'renderHabitProperty', 'saveHabitSettings', 'renderHabitSettingsModal']) assert.doesNotMatch(habitsUi, new RegExp(`function ${old}\\(`), old);
});

test('the R8c layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R8c'));
  assert.ok(layer.length > 20, 'R8c layer');
  for (const selector of ['.habit-details-title', '.habit-details-tiles', '.habit-details-tile', '.habit-details-calendar', '.habit-details-insight', '.habit-details-status']) assert.ok(layer.includes(selector), selector);
  for (const [en, value] of [['Done this week', 'Ostvareno ove nedelje'], ['Insight', 'Uvid'], ['Settings', 'Podešavanja'], ['No grace days', 'Bez tolerancije'], ['A tap on a past day changes the history.', 'Dodir na prošli dan menja istoriju.']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
  assert.match(sr, /"This week: \{done\} of \{planned\}": "Ova nedelja: \{done\} od \{planned\}"/);
});

test('R8c shipped as 2.0.0-alpha.15 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 15);
  assert.match(read('sw.js'), new RegExp(`const VERSION = '${Release.APP_VERSION.replace(/\./g, '\\.')}';`));
  assert.equal(JSON.parse(read('package.json')).version, Release.APP_VERSION);
});
