// Redesign R8b: the new habit window and the frequency sheet (N1–N6).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r8b-new-habit.md
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

function moduleFor() {
  let adapter;
  runInNewContextWithI18n(habitsUi, { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: fn => fn() });
  return adapter;
}

// The draft as app.js habitDraft() builds it for a new habit.
function draft(fields = {}) {
  const ctx = { Core };
  vm.createContext(withI18n(ctx));
  vm.runInContext(fn('habitDraft'), ctx);
  return { ...plain(ctx.habitDraft()), ...fields };
}

function windowCtx(fields = {}, extra = {}) {
  const calls = [];
  const inputs = {};
  const ctx = {
    calls, inputs, Core, esc,
    state: { habits: [], areas: [{ id: 'a1', name: 'Zdravlje', status: 'active' }, { id: 'a2', name: 'Staro', status: 'archived' }], goals: [{ id: 'g1', title: 'Maraton', status: 'active' }, { id: 'g2', title: 'Arhiva', status: 'archived' }], settings: { weekStartsOn: 'monday' }, habitLogCache: {} },
    modalState: { type: 'habit', habitId: null, draft: draft(fields), error: '' },
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`,
    formatDate: (value, mode) => (mode === 'full' ? `F:${value}` : `D:${value}`),
    relativeDateLabel: value => `R:${value}`,
    sortedAreas: () => ctx.state.areas,
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
    setToastMessage: message => calls.push(['toast', message]),
    navigate: route => calls.push(['navigate', route]),
    nowIso: () => '2026-10-10T08:00:00.000Z',
    uid: kind => `${kind}-1`,
    getHabit: id => ctx.state.habits.find(habit => habit.id === id),
    captureGoalProgress: () => null,
    evaluateGoalProgressChanges: () => {},
    syncHabitGoalLinks: (habit, ids) => { habit.goalIds = [...ids]; calls.push(['goals', [...ids]]); },
    openHabitStartSheet: anchor => calls.push(['start-sheet']),
    ...extra,
  };
  return ctx;
}
const windowHtml = ctx => moduleFor().renderRoute({ type: 'modal', modalType: 'habit' }, ctx);
const act = (module, ctx, action, dataset = {}) => module.handleAction(action, { target: { closest: () => ({ dataset }) } }, ctx);
const lastHtml = ctx => [...ctx.calls].reverse().find(call => call[0] === 'open' || call[0] === 'refresh')[1];

test('N1, N2, N5: a tall sheet with the name, Oblast, Rutina, Praćenje, Učestalost, Podsetnik, "Više" and "Napravi naviku"', () => {
  const html = windowHtml(windowCtx());
  assert.match(html, /^<frame quick><div class="modal-inner quick-sheet habit-window"><div class="modal-header"><h2 class="modal-title">New habit<\/h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close">/);
  assert.match(html, /<input id="habit-name" class="quick-title-input" type="text" maxlength="120" autocomplete="off" placeholder="What do you want to practice\?" value="" aria-label="Habit name">/);
  assert.match(html, /<button class="task-window-row" type="button" data-action="habit-draft-area"><i class="ph ph-squares-four" aria-hidden="true"><\/i><span class="task-window-row-label">Area<\/span><span class="task-window-row-value">No area \(optional\)<\/span>/);
  assert.match(html, /<div class="view-tabs habit-window-seg" role="group" aria-label="Routine"><button class="btn" type="button" data-action="habit-draft-routine" data-value="morning" aria-pressed="false">Morning<\/button><button class="btn is-selected" type="button" data-action="habit-draft-routine" data-value="daily" aria-pressed="true">Daytime<\/button><button class="btn" type="button" data-action="habit-draft-routine" data-value="night" aria-pressed="false">Night<\/button><\/div>/);
  assert.match(html, /data-action="habit-draft-tracking" data-value="checkbox" aria-pressed="true">Checkbox<\/button><button class="btn" type="button" data-action="habit-draft-tracking" data-value="numeric" aria-pressed="false">Numeric<\/button>/);
  assert.doesNotMatch(html, /habit-target-value/, 'no target for a checkbox habit');
  assert.match(html, /data-action="habit-draft-frequency"><i class="ph ph-repeat" aria-hidden="true"><\/i><span class="task-window-row-label">Frequency<\/span><span class="task-window-row-value is-set">Daily<\/span>/);
  assert.match(html, /data-action="habit-draft-reminders"><i class="ph ph-bell" aria-hidden="true"><\/i><span class="task-window-row-label">Reminder<\/span><span class="task-window-row-value">Not set<\/span>/);
  assert.match(html, /<button class="habit-window-more" type="button" data-action="toggle-habit-more" aria-expanded="false"><strong>More settings<\/strong><span>Start, end, goals <i class="ph ph-caret-down" aria-hidden="true"><\/i><\/span><\/button>/);
  assert.doesNotMatch(html, /habit-draft-start/);
  assert.match(html, /<div class="quick-sheet-footer"><span><\/span><button class="btn btn-primary habit-window-save" type="button" data-action="save-habit">Create habit<\/button><\/div><\/div><\/frame>$/);
  assert.doesNotMatch(html, /<select|habit-reminders|habit-times-per-week|data-action="close-modal">Cancel/);
  const edit = windowCtx({ name: 'Read' });
  edit.modalState.habitId = 'h1';
  assert.match(windowHtml(edit), /<h2 class="modal-title">Edit habit<\/h2>[\s\S]*data-action="save-habit">Save changes<\/button>/);
});

test('N3, N4: Brojevno shows the target per day; "Više" holds Početak, Kraj, the targets, quick values and goals', () => {
  const ctx = windowCtx({ trackingType: 'numeric', targetValue: 2, unit: 'l', moreOpen: true, areaId: 'a1', reminders: [{ id: 'r1', time: '18:00', enabled: true }, { id: 'r0', time: '07:00', enabled: true }, { id: 'rx', time: '12:00', enabled: false }] });
  const html = windowHtml(ctx);
  assert.match(html, /<div class="habit-window-target"><label for="habit-target-value">Target<\/label><input id="habit-target-value" class="input" type="number" min="0" step="any" value="2"><input id="habit-unit" class="input" maxlength="20" value="l" placeholder="unit" aria-label="Unit"><span>per day<\/span><\/div>/);
  assert.match(html, /<span class="task-window-row-value is-set">Zdravlje<\/span>/);
  assert.match(html, /data-action="habit-draft-reminders">[\s\S]*?<span class="task-window-row-value is-set">07:00, 18:00<\/span>/, 'enabled times, sorted');
  assert.match(html, /aria-expanded="true"><strong>More settings<\/strong><span>Hide <i class="ph ph-caret-up" aria-hidden="true"><\/i><\/span><\/button><div class="habit-window-card">/);
  const rows = [...html.matchAll(/data-action="(habit-draft-[a-z]+)"><i class="ph [\w-]+" aria-hidden="true"><\/i><span class="task-window-row-label">([^<]+)<\/span><span class="task-window-row-value(?: is-set)?">([^<]*)<\/span>/g)].map(match => match.slice(1));
  assert.deepEqual(rows.slice(3), [['habit-draft-start', 'Start', 'Today'], ['habit-draft-end', 'End', 'Never'], ['habit-draft-targets', 'Minimum and ideal', 'Same as the target'], ['habit-draft-quick', 'Quick values', '+0.25  +0.5  +1'], ['habit-draft-goals', 'Linked goals', 'None']]);
  assert.match(html, /<p class="sheet-note">“Continuation” and “Grace days” are in the habit details\.<\/p>/);
  const checkbox = windowHtml(windowCtx({ moreOpen: true }));
  assert.doesNotMatch(checkbox, /habit-draft-targets|habit-draft-quick/, 'a daily checkbox habit has neither');
  assert.match(windowHtml(windowCtx({ moreOpen: true, frequencyType: 'timesPerWeek', timesPerWeek: 3 })), /habit-draft-targets/, 'X puta nedeljno has targets');
  const set = windowHtml(windowCtx({ moreOpen: true, trackingType: 'numeric', targetValue: 2, minimumTarget: 1.5, idealTarget: null, startDate: Core.addDays(TODAY, 2), endType: 'successfulPeriods', successfulPeriodsTarget: 30, goalIds: ['g1'] }));
  assert.match(set, new RegExp(`Start<\\/span><span class="task-window-row-value is-set">R:${Core.addDays(TODAY, 2)}<\\/span>`));
  assert.match(set, /End<\/span><span class="task-window-row-value is-set">After 30 successful days<\/span>/);
  assert.match(set, /Minimum and ideal<\/span><span class="task-window-row-value is-set">Minimum 1\.5 · ideal 2<\/span>/);
  assert.match(set, /Linked goals<\/span><span class="task-window-row-value is-set">Maraton<\/span>/);
  assert.match(windowHtml(windowCtx({ moreOpen: true, frequencyType: 'timesPerWeek', endType: 'successfulPeriods', successfulPeriodsTarget: 1 })), /After 1 successful week</);
  assert.match(windowHtml(windowCtx({ moreOpen: true, endType: 'date', endDate: '2026-12-31' })), /End<\/span><span class="task-window-row-value is-set">Until D:2026-12-31<\/span>/);
});

test('the segments: Rutina, Praćenje (which clears the targets) and "Više"', () => {
  const module = moduleFor();
  const ctx = windowCtx({ minimumTarget: 2, idealTarget: 3 });
  ctx.inputs['#habit-name'] = 'Water';
  act(module, ctx, 'habit-draft-routine', { value: 'morning' });
  assert.equal(ctx.modalState.draft.routine, 'morning');
  assert.equal(ctx.modalState.draft.name, 'Water', 'the typed name is kept');
  act(module, ctx, 'habit-draft-tracking', { value: 'numeric' });
  assert.deepEqual([ctx.modalState.draft.trackingType, ctx.modalState.draft.minimumTarget, ctx.modalState.draft.idealTarget], ['numeric', null, null]);
  act(module, ctx, 'habit-draft-routine', { value: 'nope' });
  assert.equal(ctx.modalState.draft.routine, 'morning', 'only the three routines');
  act(module, ctx, 'toggle-habit-more');
  assert.equal(ctx.modalState.draft.moreOpen, true);
  assert.equal(ctx.calls.filter(call => call[0] === 'renderModal').length, 3, 'an unknown routine is ignored');
});

test('N6: the frequency sheet with four choices, weekdays (Mon–Fri by default, at least one), the steppers and "Primeni"', () => {
  const module = moduleFor();
  const ctx = windowCtx({ name: 'Gym', minimumTarget: 2 });
  act(module, ctx, 'habit-draft-frequency');
  let html = lastHtml(ctx);
  assert.equal(ctx.calls.at(-1)[2].type, 'habit-frequency');
  assert.match(html, /^<div class="popover-title">Frequency<\/div><p class="sheet-subtitle">Gym<\/p><div class="sheet-card" role="radiogroup" aria-label="Frequency">/);
  assert.deepEqual([...html.matchAll(/role="radio" aria-checked="(true|false)" data-pop-action="habit-freq-type" data-value="(\w+)"><span class="sheet-radio[^"]*" aria-hidden="true"><\/span><span class="sheet-option-label">([^<]+)</g)].map(match => match.slice(1)), [['true', 'daily', 'Daily'], ['false', 'weekdays', 'Selected weekdays'], ['false', 'timesPerWeek', 'X times per week'], ['false', 'everyNDays', 'Every N days']]);
  assert.match(html, /<div class="sheet-footer"><span><\/span><button class="btn btn-primary" type="button" data-pop-action="habit-freq-apply">Apply<\/button><\/div>$/);

  act(module, ctx, 'habit-freq-type', { value: 'weekdays' });
  html = lastHtml(ctx);
  assert.deepEqual([...html.matchAll(/<button class="habit-weekday( is-on)?" type="button" data-pop-action="habit-freq-day" data-day="(\d)" aria-pressed="(?:true|false)">(\w+)<\/button>/g)].map(match => [match[2], Boolean(match[1]), match[3]]), [['1', true, 'Mon'], ['2', true, 'Tue'], ['3', true, 'Wed'], ['4', true, 'Thu'], ['5', true, 'Fri'], ['6', false, 'Sat'], ['0', false, 'Sun']]);
  assert.match(html, /<p class="sheet-note">On workdays<\/p>/);
  for (const day of ['1', '2', '3', '4', '5']) act(module, ctx, 'habit-freq-day', { day });
  html = lastHtml(ctx);
  assert.match(html, /<p class="sheet-note">Choose at least one day\.<\/p>/);
  assert.match(html, /data-pop-action="habit-freq-apply" disabled>Apply/);
  act(module, ctx, 'habit-freq-apply');
  assert.equal(ctx.modalState.draft.frequencyType, 'daily', 'nothing applied without a day');
  act(module, ctx, 'habit-freq-day', { day: '6' });
  act(module, ctx, 'habit-freq-day', { day: '0' });
  assert.match(lastHtml(ctx), /<p class="sheet-note">On weekends<\/p>/);

  act(module, ctx, 'habit-freq-type', { value: 'timesPerWeek' });
  html = lastHtml(ctx);
  assert.match(html, /<div class="sheet-field habit-stepper-field"><span>Successful days a week<\/span><span class="habit-stepper"><button class="btn-icon" type="button" data-pop-action="habit-freq-step" data-key="timesPerWeek" data-step="-1" aria-label="Decrease"><i class="ph ph-minus"><\/i><\/button><span class="habit-stepper-value" aria-live="polite">4<\/span><button class="btn-icon" type="button" data-pop-action="habit-freq-step" data-key="timesPerWeek" data-step="1" aria-label="Increase"><i class="ph ph-plus"><\/i><\/button><\/span><\/div><p class="sheet-note">One check-in a day, on any day of the week\. You can go past the weekly target\.<\/p>/);
  for (let i = 0; i < 5; i += 1) act(module, ctx, 'habit-freq-step', { key: 'timesPerWeek', step: '1' });
  assert.match(lastHtml(ctx), /habit-stepper-value" aria-live="polite">7<\/span><button class="btn-icon" type="button" data-pop-action="habit-freq-step" data-key="timesPerWeek" data-step="1" disabled/, 'at most 7');
  act(module, ctx, 'habit-freq-apply');
  assert.deepEqual(ctx.calls.slice(-2), [['close'], ['renderModal']]);
  assert.deepEqual([ctx.modalState.draft.frequencyType, ctx.modalState.draft.timesPerWeek, ctx.modalState.draft.minimumTarget], ['timesPerWeek', 7, null], 'switching to X puta nedeljno clears the targets');
  assert.deepEqual(plain(ctx.modalState.draft.weekdays), [0, 6], 'the chosen days are kept in the draft');

  act(module, ctx, 'habit-draft-frequency');
  act(module, ctx, 'habit-freq-type', { value: 'everyNDays' });
  html = lastHtml(ctx);
  assert.match(html, /<span>Every other day<\/span><span class="habit-stepper"><button class="btn-icon" type="button" data-pop-action="habit-freq-step" data-key="everyNDays" data-step="-1" disabled/, 'starts at 2');
  assert.match(html, new RegExp(`<label class="sheet-field"><i class="ph ph-calendar-blank" aria-hidden="true"><\\/i><span>Starts<\\/span><input id="habit-freq-start" class="input" type="date" value="${TODAY}"><\\/label><p class="sheet-note"><strong>Next days:<\\/strong> D:${TODAY} · D:${Core.addDays(TODAY, 2)} · D:${Core.addDays(TODAY, 4)}<\\/p>`));
  act(module, ctx, 'habit-freq-step', { key: 'everyNDays', step: '1' });
  module.handleInput({ type: 'change', target: { id: 'habit-freq-start', value: Core.addDays(TODAY, -4), matches: () => false, closest: () => null } }, ctx);
  html = lastHtml(ctx);
  assert.match(html, /<span>Once every 3 days<\/span>/);
  assert.match(html, new RegExp(`Next days:<\\/strong> D:${Core.addDays(TODAY, 2)} · D:${Core.addDays(TODAY, 5)} · D:${Core.addDays(TODAY, 8)}<`), 'the next three from today on');
  act(module, ctx, 'habit-freq-apply');
  assert.deepEqual([ctx.modalState.draft.frequencyType, ctx.modalState.draft.everyNDays, ctx.modalState.draft.startDate], ['everyNDays', 3, Core.addDays(TODAY, -4)], 'the start is Početak');
});

test('the reminder sheet holds several times, "+ Dodaj vreme", "Bez podsetnika" and "Primeni"', () => {
  const module = moduleFor();
  const ctx = windowCtx({ name: 'Read', reminders: [{ id: 'r9', time: '21:00', enabled: true }, { id: 'rx', time: '12:00', enabled: false }] });
  act(module, ctx, 'habit-draft-reminders');
  let html = lastHtml(ctx);
  assert.match(html, /^<div class="popover-title">Reminder<\/div><p class="sheet-subtitle">Read<\/p><div class="sheet-field habit-reminder-time"><i class="ph ph-bell" aria-hidden="true"><\/i><span>Time<\/span><input class="input" type="time" value="21:00" data-habit-reminder-index="0" aria-label="Time"><\/div><button class="btn btn-ghost habit-reminder-add" type="button" data-pop-action="habit-reminder-add"><i class="ph ph-plus" aria-hidden="true"><\/i> Add time<\/button><p class="sheet-note">The reminder comes only on days when the habit is planned\.<\/p><div class="sheet-footer"><button class="btn btn-ghost" type="button" data-pop-action="habit-reminder-clear">No reminder<\/button><button class="btn btn-primary" type="button" data-pop-action="habit-reminder-apply">Apply<\/button><\/div>$/);
  act(module, ctx, 'habit-reminder-add');
  html = lastHtml(ctx);
  assert.match(html, /<span>Time 1<\/span><input class="input" type="time" value="21:00" data-habit-reminder-index="0" aria-label="Time 1"><button class="btn-icon" type="button" data-pop-action="habit-reminder-remove" data-index="0" aria-label="Remove time">/);
  assert.match(html, /value="18:00" data-habit-reminder-index="1"/);
  module.handleInput({ type: 'change', target: { id: '', value: '07:30', dataset: { habitReminderIndex: '1' }, matches: selector => selector === '[data-habit-reminder-index]', closest: () => null } }, ctx);
  act(module, ctx, 'habit-reminder-apply');
  const reminders = ctx.modalState.draft.reminders;
  assert.deepEqual(plain(reminders.filter(item => item.enabled !== false).map(item => item.time)), ['07:30', '21:00']);
  assert.equal(reminders.find(item => item.time === '21:00').id, 'r9', 'an unchanged time keeps its record');
  assert.ok(reminders.some(item => item.id === 'rx' && item.enabled === false), 'disabled records stay');
  act(module, ctx, 'habit-draft-reminders');
  act(module, ctx, 'habit-reminder-remove', { index: '0' });
  assert.match(lastHtml(ctx), /value="21:00" data-habit-reminder-index="0" aria-label="Time"/);
  act(module, ctx, 'habit-reminder-clear');
  assert.deepEqual(plain(ctx.modalState.draft.reminders), [{ id: 'rx', time: '12:00', enabled: false }]);
});

test('N4: Kraj, Minimalna i idealna, Brze vrednosti, Oblast and Povezani ciljevi', () => {
  const module = moduleFor();
  const ctx = windowCtx({ name: 'Water', trackingType: 'numeric', targetValue: 2, unit: 'l' });
  // Kraj
  act(module, ctx, 'habit-draft-end');
  assert.deepEqual([...lastHtml(ctx).matchAll(/data-pop-action="habit-end-type" data-value="(\w+)"><span class="sheet-radio[^"]*" aria-hidden="true"><\/span><span class="sheet-option-label">([^<]+)</g)].map(match => match.slice(1)), [['never', 'Never'], ['date', 'On date'], ['successfulPeriods', 'After successful days']]);
  act(module, ctx, 'habit-end-type', { value: 'date' });
  assert.match(lastHtml(ctx), new RegExp(`<input id="habit-end-date" class="input" type="date" min="${TODAY}" value="">`));
  act(module, ctx, 'habit-end-apply');
  assert.match(lastHtml(ctx), /<p class="validation" role="alert">Choose an end date\.<\/p>/);
  ctx.inputs['#habit-end-date'] = Core.addDays(TODAY, -1);
  act(module, ctx, 'habit-end-apply');
  assert.match(lastHtml(ctx), /The end date cannot be before the start\./);
  ctx.inputs['#habit-end-date'] = '2026-12-31';
  act(module, ctx, 'habit-end-apply');
  assert.deepEqual([ctx.modalState.draft.endType, ctx.modalState.draft.endDate], ['date', '2026-12-31']);
  act(module, ctx, 'habit-draft-end');
  act(module, ctx, 'habit-end-type', { value: 'successfulPeriods' });
  assert.match(lastHtml(ctx), /<span>Number of days<\/span><input id="habit-end-count" class="input" type="number" min="1" step="1" value="30">/);
  ctx.inputs['#habit-end-count'] = '0';
  act(module, ctx, 'habit-end-apply');
  assert.match(lastHtml(ctx), /Successful periods must be a positive whole number\./);
  ctx.inputs['#habit-end-count'] = '21';
  act(module, ctx, 'habit-end-apply');
  assert.deepEqual([ctx.modalState.draft.endType, ctx.modalState.draft.endDate, ctx.modalState.draft.successfulPeriodsTarget], ['successfulPeriods', '', 21]);

  // Minimalna i idealna: blank is the target; the ideal is at least the minimum.
  act(module, ctx, 'habit-draft-targets');
  assert.match(lastHtml(ctx), /<input id="habit-minimum" class="input" type="number" min="0" step="any" value="" placeholder="2">/);
  assert.match(lastHtml(ctx), /<p class="sheet-note">Per day\. Blank means the same as the target\.<\/p>/);
  Object.assign(ctx.inputs, { '#habit-minimum': '3', '#habit-ideal': '2' });
  act(module, ctx, 'habit-targets-apply');
  assert.match(lastHtml(ctx), /Ideal target must be at least the minimum target\./);
  Object.assign(ctx.inputs, { '#habit-minimum': '1.5', '#habit-ideal': '' });
  act(module, ctx, 'habit-targets-apply');
  assert.deepEqual([ctx.modalState.draft.minimumTarget, ctx.modalState.draft.idealTarget], [1.5, null]);

  // Brze vrednosti: suggested from the target until changed.
  act(module, ctx, 'habit-draft-quick');
  assert.match(lastHtml(ctx), /<input id="habit-quick-values" class="input" inputmode="decimal" value="0\.25 0\.5 1">/);
  ctx.inputs['#habit-quick-values'] = '0,5 1 1 x -2';
  act(module, ctx, 'habit-quick-apply');
  assert.deepEqual([plain(ctx.modalState.draft.quickValues), ctx.modalState.draft.quickValuesSet], [[0.5, 1], true]);
  act(module, ctx, 'habit-draft-quick');
  act(module, ctx, 'habit-quick-suggest');
  assert.deepEqual([plain(ctx.modalState.draft.quickValues), ctx.modalState.draft.quickValuesSet], [[], false]);
  assert.match(windowHtml(Object.assign(ctx, { modalState: { ...ctx.modalState, draft: { ...ctx.modalState.draft, targetValue: 20, unit: 'min', moreOpen: true } } })), /Quick values<\/span><span class="task-window-row-value is-set">\+5  \+10  \+20<\/span>/);

  // Oblast applies at once; archived areas are not offered.
  act(module, ctx, 'habit-draft-area');
  assert.match(lastHtml(ctx), /data-pop-action="habit-draft-set-area" data-area-id="a1"><span class="sheet-option-label">Zdravlje<\/span>/);
  assert.doesNotMatch(lastHtml(ctx), /Staro/);
  act(module, ctx, 'habit-draft-set-area', { areaId: 'a1' });
  assert.equal(ctx.modalState.draft.areaId, 'a1');
  act(module, ctx, 'habit-draft-set-area', { areaId: '' });
  assert.equal(ctx.modalState.draft.areaId, null);

  // Povezani ciljevi: several, with "Primeni"; archived goals are not offered.
  act(module, ctx, 'habit-draft-goals');
  assert.match(lastHtml(ctx), /data-pop-action="habit-goal-toggle" data-goal-id="g1" aria-pressed="false">/);
  assert.doesNotMatch(lastHtml(ctx), /Arhiva/);
  act(module, ctx, 'habit-goal-toggle', { goalId: 'g1' });
  assert.match(lastHtml(ctx), /data-goal-id="g1" aria-pressed="true">/);
  act(module, ctx, 'habit-goals-apply');
  assert.deepEqual(plain(ctx.modalState.draft.goalIds), ['g1']);

  // Početak uses the shared date sheet.
  act(module, ctx, 'habit-draft-start');
  assert.deepEqual(ctx.calls.at(-1), ['start-sheet']);
});

test('frequency labels: Svaki dan, Radnim danima, Vikendom, days, Jednom / N puta nedeljno, Svaki drugi dan, Na svaka N dana', () => {
  const ctx = windowCtx({ moreOpen: false });
  const label = fields => windowHtml(Object.assign(ctx, { modalState: { ...ctx.modalState, draft: { ...draft(), ...fields } } })).match(/data-action="habit-draft-frequency">[\s\S]*?<span class="task-window-row-value is-set">([^<]+)</)[1];
  assert.equal(label({ frequencyType: 'daily' }), 'Daily');
  assert.equal(label({ frequencyType: 'weekdays', weekdays: [1, 2, 3, 4, 5] }), 'On workdays');
  assert.equal(label({ frequencyType: 'weekdays', weekdays: [6, 0] }), 'On weekends');
  assert.equal(label({ frequencyType: 'weekdays', weekdays: [0, 1, 2, 3, 4, 5, 6] }), 'Daily');
  assert.equal(label({ frequencyType: 'weekdays', weekdays: [3, 1] }), 'Weekdays Mon, Wed');
  assert.equal(label({ frequencyType: 'timesPerWeek', timesPerWeek: 1 }), 'Once a week');
  assert.equal(label({ frequencyType: 'timesPerWeek', timesPerWeek: 3 }), '3 times/week');
  assert.equal(label({ frequencyType: 'everyNDays', everyNDays: 2 }), 'Every other day');
  assert.equal(label({ frequencyType: 'everyNDays', everyNDays: 5 }), 'Once every 5 days');
});

test('N1: "Napravi naviku" asks for a name, creates the habit without UI fields, shows a toast and stays', async () => {
  const module = moduleFor();
  const ctx = windowCtx({ trackingType: 'numeric', targetValue: 2, unit: 'l', moreOpen: true, quickValuesSet: false, continuation: 'askEachPeriod', graceDays: 2 });
  ctx.inputs['#habit-name'] = '   ';
  act(module, ctx, 'save-habit');
  assert.equal(ctx.modalState.error, 'Habit needs a name.');
  assert.deepEqual(ctx.calls.at(-1), ['renderModal']);
  assert.match(windowHtml(ctx), /<input id="habit-name" class="quick-title-input is-error"[^>]*>(<div class="validation" role="alert">Habit needs a name\.<\/div>)/);
  ctx.inputs['#habit-name'] = 'Water';
  ctx.inputs['#habit-target-value'] = '2';
  ctx.inputs['#habit-unit'] = ' l ';
  act(module, ctx, 'save-habit');
  await new Promise(resolve => setTimeout(resolve, 0));
  const habit = ctx.state.habits[0];
  assert.equal(habit.name, 'Water');
  assert.equal(habit.unit, 'l');
  assert.deepEqual(plain(habit.quickValues), [0.25, 0.5, 1], 'the suggested quick values are saved');
  assert.equal(habit.continuation, 'askEachPeriod', 'continuation is kept');
  assert.equal(habit.graceDays, 2, 'grace days are kept');
  assert.ok(!('moreOpen' in habit) && !('quickValuesSet' in habit), 'no UI fields in the record');
  assert.ok(ctx.calls.some(call => call[0] === 'closeModal'));
  assert.deepEqual(ctx.calls.find(call => call[0] === 'toast'), ['toast', 'Habit created']);
  assert.ok(!ctx.calls.some(call => call[0] === 'navigate'), 'it stays on the screen');
});

test('app.js: Početak uses the date sheet without a time; the context hands over refreshSheet and the start sheet', () => {
  assert.match(fn('openDateSheet'), /target\.type === 'habit'/);
  assert.match(fn('dateSheetHtml'), /kind === 'start'/);
  assert.match(fn('applyDateSheet'), /if \(target\.type === 'habit'\) \{ modalState\.draft\.startDate = dateSheet\.date \|\| Core\.dateOnly\(\); closePopover\(\); renderModal\(\); return; \}/);
  assert.match(app, /openHabitStartSheet\(anchor\) \{ openDateSheet\(anchor, \{ type: 'habit' \}, 'start'\); \}/);
  assert.match(fn('domainContext'), /refreshSheet,/);
});

test('the R8b layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R8b'));
  assert.ok(layer.length > 20, 'R8b layer');
  for (const selector of ['.habit-window-card', '.habit-window-seg', '.habit-window-target', '.habit-window-more', '.habit-weekday.is-on', '.habit-stepper', '.habit-reminder-time']) assert.ok(layer.includes(selector), selector);
  for (const [en, value] of [['Checkbox', 'Kvadratić'], ['Numeric', 'Brojevno'], ['Selected weekdays', 'Određeni dani'], ['Every N days', 'Na svakih N dana'], ['More settings', 'Više'], ['Start, end, goals', 'Početak, kraj, ciljevi'], ['On workdays', 'Radnim danima'], ['On weekends', 'Vikendom'], ['Once a week', 'Jednom nedeljno'], ['Every other day', 'Svaki drugi dan'], ['Habit created', 'Navika je napravljena'], ['Choose at least one day.', 'Izaberi bar jedan dan.']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
  assert.match(sr, /"Once every \{count\} days": \{ one: "Na svaki \{count\} dan", few: "Na svaka \{count\} dana", other: "Na svakih \{count\} dana" \}/);
});

test('R8b is released as 2.0.0-alpha.14', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.14');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.14';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.14');
});
