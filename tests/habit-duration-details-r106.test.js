// R106: Detalji navike has a "Trajanje" row, so an existing habit's duration (R85) can be set, changed or removed; it
// saves at once like the other rows. The habit window for an existing habit has no way in (R105), so this is the only
// place to change it. A habit that never had a duration gets no empty field.
// Spec: docs/superpowers/specs/2026-10-15-r106-habit-duration-details.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function moduleFor() {
  let adapter;
  runInNewContextWithI18n(read('js/habits-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: run => run() });
  return adapter;
}
function detailsCtx(fields = {}) {
  const calls = [];
  const inputs = {};
  const draftCtx = { Core };
  vm.createContext(withI18n(draftCtx));
  vm.runInContext(functionSource('habitDraft').source, draftCtx);
  const habit = { id: 'h', name: 'Šetnja', status: 'active', routine: 'daily', trackingType: 'checkbox', targetValue: 1, unit: '', quickValues: [], frequencyType: 'daily', weekdays: [], timesPerWeek: 4, everyNDays: 2, startDate: '2026-01-01', reminders: [], minimumTarget: null, idealTarget: null, graceDays: 0, continuation: 'automatic', endType: 'never', endDate: null, successfulPeriodsTarget: null, goalIds: [], areaId: null, ...fields };
  const ctx = {
    calls, inputs, Core, esc,
    state: { habits: [habit], areas: [], goals: [], settings: { weekStartsOn: 'monday' }, habitLogCache: { h: [] } },
    modalState: { type: 'habit-details', habitId: 'h', month: '2026-10', draft: null },
    getHabit: id => ctx.state.habits.find(item => item.id === id), habitDraft: item => draftCtx.habitDraft(item),
    habitMetrics: () => ({ currentStreak: 0, longestStreak: 0, totalCheckins: 0, currentPeriodCount: 0, currentPeriodTarget: 1, periods: [] }),
    modalFrame: content => content, formatDate: value => value, relativeDateLabel: value => value,
    $: selector => (selector in inputs ? { value: inputs[selector] } : null), $$: () => [],
    openPopover: (anchor, html) => calls.push(['open', html]), refreshSheet: html => calls.push(['refresh', html]), closePopover: () => calls.push(['close']),
    renderModal() {}, render() {}, saveState: () => { calls.push(['save']); return true; }, refreshHabitMetrics: () => Promise.resolve(),
    nowIso: () => '2026-10-15T08:00:00.000Z', captureGoalProgress: () => null, evaluateGoalProgressChanges() {}, syncHabitGoalLinks() {},
  };
  return { ctx, habit, module: moduleFor() };
}
const act = (view, action) => view.module.handleAction(action, { target: { closest: () => ({ dataset: {} }) } }, view.ctx);
const lastSheet = view => [...view.ctx.calls].reverse().find(call => call[0] === 'open' || call[0] === 'refresh')[1];
const render = view => view.module.renderRoute({ type: 'modal', modalType: 'habit-details' }, view.ctx);

test('Detalji navike shows the duration among the settings', () => {
  assert.match(render(detailsCtx({ durationMinutes: 30 })), /data-action="habit-details-duration"[^>]*><i class="ph ph-timer" aria-hidden="true"><\/i><span class="task-window-row-label">Duration<\/span><span class="task-window-row-value is-set">30 min<\/span>/);
  assert.match(render(detailsCtx()), /data-action="habit-details-duration"[^>]*>.*?<span class="task-window-row-value">None<\/span>/);
});

test('the duration sheet sets, changes and removes it, and refuses what is out of range', () => {
  const view = detailsCtx();
  act(view, 'habit-details-duration');
  assert.match(lastSheet(view), /<input id="habit-details-duration-input" class="input" type="number" min="1" max="1440" step="1" inputmode="numeric" value="" data-sheet-focus>/);
  view.ctx.inputs['#habit-details-duration-input'] = '25';
  act(view, 'habit-duration-apply');
  assert.equal(view.habit.durationMinutes, 25);
  act(view, 'habit-details-duration');
  assert.match(lastSheet(view), /value="25"/);
  view.ctx.inputs['#habit-details-duration-input'] = '2000';
  act(view, 'habit-duration-apply');
  assert.match(lastSheet(view), /<p class="validation" role="alert">Duration must be 1 to 1440 minutes\.<\/p>/);
  assert.equal(view.habit.durationMinutes, 25, 'a refused value saves nothing');
  view.ctx.inputs['#habit-details-duration-input'] = '';
  act(view, 'habit-duration-apply');
  assert.equal(view.habit.durationMinutes, null, 'an empty field removes it');
  const untouched = detailsCtx();
  act(untouched, 'habit-details-grace');
  untouched.ctx.inputs['#habit-grace'] = '1';
  act(untouched, 'habit-grace-apply');
  assert.equal(Object.hasOwn(untouched.habit, 'durationMinutes'), false, 'a habit that never had one gets no field');
});

test('the guide and Šta je novo mention it', () => {
  assert.ok(read('uputstvo.html').includes('Trajanje postojeće navike menjaš u <strong>Detaljima navike</strong>.'));
  assert.ok(read('novo.html').includes('<li><strong>Trajanje navike u detaljima.</strong>'));
});

test('R106 shipped as 2.0.0-alpha.135 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 135) >= 135);
});
