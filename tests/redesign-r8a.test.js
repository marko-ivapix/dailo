// Redesign R8a: the Habits screen (H1–H7).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r8a-habits.md
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

// --- Core -----------------------------------------------------------------------------------------------
const T = '2026-10-08'; // a Thursday; the Monday week starts on 5 October
const daily = { id: 'd', name: 'Meditate', status: 'active', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-01-01' };
const weekly = { id: 'w', name: 'Gym', status: 'active', trackingType: 'checkbox', frequencyType: 'timesPerWeek', timesPerWeek: 3, startDate: '2026-01-01' };
const weekdays = { id: 'k', name: 'English', status: 'active', trackingType: 'checkbox', frequencyType: 'weekdays', weekdays: [1, 2, 3, 4, 5], startDate: '2026-01-01' };
const numeric = { id: 'n', name: 'Water', status: 'active', trackingType: 'numeric', targetValue: 2, unit: 'l', frequencyType: 'daily', startDate: '2026-01-01' };

test('Core.habitDayState: done, missed, open, skipped, unscheduled and future; weekly habits never miss a day', () => {
  const state = (habit, logs, date) => plain(Core.habitDayState(habit, logs, date, T, 'monday'));
  const dailyLogs = [log('d', '2026-10-05'), log('d', '2026-10-06', 'missed'), log('d', '2026-10-03', 'skipped')];
  assert.deepEqual(state(daily, dailyLogs, '2026-10-05'), { state: 'done', planned: true, value: null });
  assert.deepEqual(state(daily, dailyLogs, '2026-10-06'), { state: 'missed', planned: true, value: null });
  assert.deepEqual(state(daily, dailyLogs, '2026-10-07'), { state: 'missed', planned: true, value: null }, 'a past day without a log');
  assert.deepEqual(state(daily, dailyLogs, T), { state: 'open', planned: true, value: null });
  assert.deepEqual(state(daily, dailyLogs, '2026-10-03'), { state: 'skipped', planned: false, value: null });
  assert.deepEqual(state(daily, dailyLogs, '2026-10-09'), { state: 'future', planned: false, value: null });
  assert.deepEqual(state(weekdays, [], '2026-10-04'), { state: 'unscheduled', planned: false, value: null }, 'a Sunday');
  const weeklyLogs = [log('w', '2026-10-05'), log('w', '2026-10-07')];
  assert.deepEqual(state(weekly, weeklyLogs, '2026-10-05'), { state: 'done', planned: true, value: null });
  assert.deepEqual(state(weekly, weeklyLogs, '2026-10-06'), { state: 'open', planned: false, value: null }, 'no missed day for a weekly target');
  assert.deepEqual(state(weekly, weeklyLogs, T), { state: 'open', planned: true, value: null }, 'today counts while the week is open');
  assert.equal(Core.habitDayState(weekly, [...weeklyLogs, log('w', '2026-10-06')], T, T, 'monday').planned, false, 'the target is met');
  assert.equal(Core.habitDayState(weekly, [log('w', '2026-10-02'), log('w', '2026-10-03'), log('w', '2026-10-04')], T, T, 'monday').planned, true, 'last week does not count');
  assert.deepEqual(state(numeric, [log('n', T, 'missed', 1.5)], T), { state: 'open', planned: true, value: 1.5 }, 'a partial value today');
  assert.deepEqual(state(numeric, [log('n', '2026-10-07', 'done', 2)], '2026-10-07'), { state: 'done', planned: true, value: 2 });
});

test('Core.habitDayPercent and habitWeekProgress: the day share and the week plan without skipped days', () => {
  const logs = { d: [log('d', '2026-10-05'), log('d', '2026-10-06', 'skipped')], w: [log('w', '2026-10-05')], k: [log('k', '2026-10-05'), log('k', '2026-10-06'), log('k', '2026-10-07', 'skipped')] };
  assert.deepEqual(plain(Core.habitDayPercent([daily, weekly, weekdays], logs, '2026-10-05', T, 'monday')), { done: 3, planned: 3, percent: 100 });
  assert.deepEqual(plain(Core.habitDayPercent([daily, weekly, weekdays], logs, '2026-10-06', T, 'monday')), { done: 1, planned: 1, percent: 100 }, 'skipped and weekly days stay out');
  assert.deepEqual(plain(Core.habitDayPercent([daily, weekly, weekdays], logs, T, T, 'monday')), { done: 0, planned: 3, percent: 0 });
  assert.deepEqual(plain(Core.habitDayPercent([weekdays], logs, '2026-10-04', T, 'monday')), { done: 0, planned: 0, percent: null });
  assert.deepEqual(plain(Core.habitWeekProgress(weekdays, logs.k, '2026-10-05', T, 'monday')), { done: 2, planned: 4 }, 'five weekdays minus a skipped one');
  assert.deepEqual(plain(Core.habitWeekProgress(weekly, logs.w, '2026-10-05', T, 'monday')), { done: 1, planned: 3 });
  assert.deepEqual(plain(Core.habitWeekProgress(daily, logs.d, '2026-10-05', T, 'monday')), { done: 1, planned: 6 });
});

// --- The screen -------------------------------------------------------------------------------------------
function moduleFor() {
  let adapter;
  runInNewContextWithI18n(habitsUi, { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: fn => fn() });
  return adapter;
}

const dow = Core.parseDateOnly(TODAY).getDay();
function screen(ui = {}, extra = {}) {
  const calls = [];
  const habits = [
    { id: 'm', name: 'Meditate', status: 'active', routine: 'morning', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-01-01' },
    { id: 'n', name: 'Water', status: 'active', routine: 'morning', trackingType: 'numeric', targetValue: 2, unit: 'l', frequencyType: 'daily', startDate: '2026-01-01', quickValues: [0.5] },
    { id: 'g', name: 'Gym', status: 'active', routine: 'daily', trackingType: 'checkbox', frequencyType: 'timesPerWeek', timesPerWeek: 3, startDate: '2026-01-01' },
    { id: 'x', name: 'Not today', status: 'active', routine: 'daily', trackingType: 'checkbox', frequencyType: 'weekdays', weekdays: [(dow + 1) % 7], startDate: '2026-01-01' },
    { id: 'r', name: 'Read', status: 'active', routine: 'night', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-01-01' },
    { id: 'p', name: 'Paused one', status: 'paused', routine: 'night', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-01-01' },
    { id: 'a', name: 'Old one', status: 'archived', routine: 'night', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-01-01' },
  ];
  const state = {
    habits, settings: { weekStartsOn: 'monday' },
    habitLogCache: { m: [log('m', TODAY)], n: [log('n', TODAY, 'missed', 1.5)], g: [log('g', TODAY)] },
    ui: { habitsView: 'day', habitsDay: TODAY, habitTrackerMonth: TODAY.slice(0, 7), ...ui },
    ...extra,
  };
  const ctx = {
    calls, state, Core, esc,
    getHabit: id => habits.find(habit => habit.id === id),
    habitMetrics: habit => ({ currentStreak: habit.id === 'm' ? 5 : 1, currentPeriodCount: 1, currentPeriodTarget: 3 }),
    pageHeader: (title, subtitle, options) => `<header title="${title}" subtitle="${subtitle}" add="${options?.add}"></header>`,
    emptyState: (title, text, cta, action) => `<empty ${title} ${action}>`,
    formatDate: (value, mode) => (mode === 'full' ? `F:${value}` : `D:${value}`),
    setHabitLog: (...args) => { calls.push(['log', ...args]); return Promise.resolve(true); },
    openHabitValue: (...args) => calls.push(['value', ...args]),
    openPopover: (anchor, html, meta) => calls.push(['popover', html, meta]),
    closePopover: () => calls.push(['close']),
    saveAndRender: () => calls.push(['saveAndRender']),
    navigate: route => calls.push(['navigate', route]),
  };
  return ctx;
}
const render = ctx => moduleFor().renderRoute({ type: 'habits' }, ctx);
const weekStart = Core.habitPeriodKey({ frequencyType: 'timesPerWeek' }, TODAY, 'monday');
const week = Array.from({ length: 7 }, (_, index) => Core.addDays(weekStart, index));

test('H1, H4: "Navike" with "N od M danas", the week rings and the Dan / Nedelja switch; no header button or tabs', () => {
  const html = render(screen());
  assert.match(html, /^<header title="Habits" subtitle="2 of 4 today" add="false"><\/header>/, 'Meditate and Gym done; Water open; Read open; Not today is unscheduled');
  const rings = [...html.matchAll(/<button class="habit-ring([^"]*)" type="button" data-action="habits-ring" data-date="([\d-]+)"([^>]*)>/g)].map(match => [match[2], match[1].trim(), match[3]]);
  assert.deepEqual(rings.map(ring => ring[0]), week);
  for (const [date, classes, rest] of rings) {
    assert.equal(rest.includes(' disabled'), date > TODAY, `${date} future is inactive`);
    assert.equal(classes.includes('is-today'), date === TODAY);
    assert.equal(classes.includes('is-selected'), date === TODAY, 'Dan selects today');
  }
  assert.match(html, new RegExp(`data-date="${TODAY}" aria-label="F:${TODAY}, 50%" aria-current="date"><span class="habit-ring-weekday">\\w+<\\/span><svg class="habit-ring-svg" viewBox="0 0 44 44" aria-hidden="true"><circle class="habit-ring-track" cx="22" cy="22" r="18"\\/><circle class="habit-ring-arc" cx="22" cy="22" r="18" stroke-dasharray="56\\.5 113\\.1" transform="rotate\\(-90 22 22\\)"\\/><text x="22" y="26" text-anchor="middle">50<tspan class="habit-ring-pc">%<\\/tspan><\\/text><\\/svg><span class="habit-ring-date">${Number(TODAY.slice(8))}<\\/span><\\/button>`));
  if (week[6] > TODAY) assert.match(html, new RegExp(`data-date="${week[6]}" disabled aria-label="F:${week[6]}, no data"><span class="habit-ring-weekday">\\w+<\\/span><svg class="habit-ring-svg" viewBox="0 0 44 44" aria-hidden="true"><circle class="habit-ring-track" cx="22" cy="22" r="18"\\/><text class="habit-ring-none" x="22" y="26" text-anchor="middle">–<\\/text><\\/svg>`));
  assert.match(html, /<div class="view-tabs habits-view-switch" role="group" aria-label="Habit view"><button class="btn is-selected" type="button" data-action="habits-view" data-view="day" aria-pressed="true">Day<\/button><button class="btn" type="button" data-action="habits-view" data-view="week" aria-pressed="false">Week<\/button><\/div>/);
  assert.doesNotMatch(html, /data-habit-tab|habit-dashboard|data-action="new-habit"|Consistency/);
  const full = screen({}, { habitLogCache: { m: [log('m', TODAY)], n: [log('n', TODAY, 'done', 2)], g: [log('g', TODAY)], r: [log('r', TODAY)] } });
  assert.match(render(full), /<circle class="habit-ring-arc" cx="22" cy="22" r="18" stroke-dasharray="113\.1 113\.1" transform="rotate\(-90 22 22\)"\/><path class="habit-ring-check" d="M17\.5 22\.3l3 3 6-6\.3"\/><\/svg>/, 'a full ring shows a check');
});

test('H2, H6: Dan groups by routine, done habits last, with the frequency and streak, the week or "missed"', () => {
  const html = render(screen());
  const groups = [...html.matchAll(/<section class="section habits-routine habits-routine--(\w+)"><div class="section-header"><h2 class="section-label"><i class="ph ([\w-]+)" aria-hidden="true"><\/i> ([^<]+)<\/h2><span class="section-count">(\d+)<\/span><\/div>/g)].map(match => match.slice(1));
  assert.deepEqual(groups, [['morning', 'ph-sun', 'Morning', '2'], ['daily', 'ph-sun-horizon', 'Daytime', '1'], ['night', 'ph-moon', 'Night', '1']]);
  const rows = [...html.matchAll(/<article class="today-row habit-today-row[^"]*" data-habit-id="(\w)">/g)].map(match => match[1]);
  assert.deepEqual(rows, ['n', 'm', 'g', 'r'], 'Water before the done Meditate; Not today is not listed');
  assert.match(html, /<span class="task-title">Meditate<\/span><span class="task-meta">Daily · streak 5 days<\/span>/);
  // R14b: the circle now closes the row, so the name button is followed directly by it (no count span in between).
  assert.match(html, /<span class="task-title">Gym<\/span><span class="task-meta">3 times\/week · 1 \/ 3 this week<\/span><\/button><button class="habit-check"/, 'the weekly count is in the line, not repeated on the right');
  assert.match(html, /<span class="task-meta">[^<]* · 1\.5 \/ 2 l<\/span>/); // R17: the value joins the meta line
  assert.doesNotMatch(html, /habits-day-title/, 'today has no date line');
  const yesterday = Core.addDays(TODAY, -1);
  const past = render(screen({ habitsDay: yesterday }));
  assert.match(past, new RegExp(`<h2 class="habits-day-title">F:${yesterday}<\\/h2>`));
  assert.match(past, new RegExp(`<button class="habit-check" type="button" data-action="habit-today-toggle" data-habit-id="m" data-date="${yesterday}" data-long-press="habit-today-menu" aria-pressed="false" aria-label="Meditate">`));
  assert.match(past, new RegExp(`data-action="habit-today-menu" data-habit-id="m" data-date="${yesterday}" aria-haspopup="dialog"><span class="task-title">Meditate<\\/span><span class="task-meta">Daily · missed<\\/span>`));
  assert.doesNotMatch(render(screen({ habitsDay: Core.addDays(TODAY, 3) })), /habits-day-title/, 'a stored future day falls back to today');
});

test('H3: Nedelja is a table of habits by days with inactive future and unscheduled days, and a legend', () => {
  const html = render(screen({ habitsView: 'week' }));
  assert.match(html, /<button class="btn is-selected" type="button" data-action="habits-view" data-view="week" aria-pressed="true">Week<\/button>/);
  assert.doesNotMatch(html, /habits-ring[^>]*is-selected/, 'Nedelja selects no ring');
  assert.match(html, /<table class="habits-week-table"><thead><tr><th scope="col"><span class="sr-only">Habit<\/span><\/th>/);
  assert.equal((html.match(/<th scope="row" class="habits-week-name">/g) || []).length, 5, 'active habits only');
  assert.match(html, /<tr class="habits-week-group"><th scope="rowgroup" colspan="8">Morning<\/th><\/tr>/);
  const cell = (id, date) => html.match(new RegExp(`<button class="habit-cell ([^"]+)" type="button" data-action="habit-today-toggle" data-habit-id="${id}" data-date="${date}"([^>]*)>`));
  assert.match(cell('m', TODAY)[1], /^is-done is-today$/);
  assert.doesNotMatch(cell('m', TODAY)[2], /disabled/);
  assert.match(cell('m', TODAY)[2], /aria-label="Meditate, F:[\d-]+: Done" aria-pressed="true"/);
  assert.match(cell('x', TODAY)[1], /is-unscheduled/);
  assert.match(cell('x', TODAY)[2], / disabled/);
  if (week[6] > TODAY) { assert.match(cell('r', week[6])[1], /is-future/); assert.match(cell('r', week[6])[2], / disabled/); }
  if (week[0] < TODAY) assert.match(cell('g', week[0])[1], /^is-open/, 'a weekly habit has no missed day');
  assert.doesNotMatch(cell('n', TODAY)[2], /aria-pressed/, 'numeric cells open the value sheet');
  assert.match(html, /<div class="habits-legend"><span><i class="habit-cell-swatch is-done" aria-hidden="true"><\/i>Done<\/span><span><i class="habit-cell-swatch is-missed" aria-hidden="true"><\/i>Missed<\/span><span><i class="habit-cell-swatch is-skipped" aria-hidden="true"><\/i>Skipped<\/span><span><i class="habit-cell-swatch is-unscheduled" aria-hidden="true"><\/i>Not scheduled<\/span><\/div>/);
});

test('H7, H4: Napredak has the bars of this week and the month chart with today labelled', () => {
  const html = render(screen());
  assert.match(html, /<section class="section habits-progress"><div class="section-header"><h2 class="section-label">Progress<\/h2><\/div><div class="today-card habits-bars"><p class="habits-bars-title">By habit · this week<\/p>/);
  const bars = [...html.matchAll(/<div class="habits-bar"><span class="habits-bar-name">([^<]+)<\/span><span class="habits-bar-count">(.*?)<\/span><span class="habits-bar-track" role="img" aria-label="([^"]+)"><i style="width:(\d+)%"><\/i><\/span><\/div>/g)].map(match => match.slice(1));
  assert.deepEqual(bars.map(bar => bar[0]), ['Meditate', 'Water', 'Gym', 'Not today', 'Read'], 'routine order');
  assert.deepEqual(bars[2].slice(1), ['1/3', 'Gym: 1 of 3', '33']);
  assert.match(bars[0][2], /^Meditate: 1 of 7$/);
  const done = screen({}, { habitLogCache: { g: [log('g', week[0]), log('g', week[0] < TODAY ? Core.addDays(week[0], 1) : TODAY), log('g', TODAY)] } });
  const gym = render(done).match(/<span class="habits-bar-name">Gym<\/span><span class="habits-bar-count">(.*?)<\/span>/)[1];
  if (new Set([week[0], week[0] < TODAY ? Core.addDays(week[0], 1) : TODAY, TODAY]).size === 3) assert.match(gym, /^<svg class="habits-bar-check"/, 'a full bar shows a check');
  // The month chart: the average, the arrows (no future month), today's label and a hidden table for screen readers.
  assert.match(html, /<div class="habits-chart-head"><div><strong>\d+%<\/strong> <span>average<\/span><\/div><div class="habits-chart-month"><button class="btn-icon" type="button" data-action="habit-chart-month" data-shift="-1" aria-label="Previous month"[^>]*><i class="ph ph-caret-left"><\/i><\/button><span>[^<]+<\/span><button class="btn-icon" type="button" data-action="habit-chart-month" data-shift="1" aria-label="Next month" disabled>/);
  assert.match(html, /<svg class="habits-chart-svg" viewBox="0 0 320 150" role="img" aria-label="Share of habits done per day, [^"]+">/);
  assert.match(html, /<text class="habits-chart-today"[^>]*>today 50%<\/text>/);
  assert.equal((html.match(/<rect class="habits-chart-hit" /g) || []).length, Number(TODAY.slice(8)), 'one tap target per day so far');
  assert.equal((html.match(/<tr><th scope="row">/g) || []).length, Number(TODAY.slice(8)));
  const picked = render(screen({ habitChartDay: TODAY }));
  assert.match(picked, new RegExp(`<text class="habits-chart-pick"[^>]*>D:${TODAY}: 50%<\\/text>`));
  const past = render(screen({ habitTrackerMonth: Core.addDays(`${TODAY.slice(0, 7)}-01`, -1).slice(0, 7) }));
  assert.doesNotMatch(past, /habits-chart-today/, 'a past month has no today label');
  assert.match(past, /data-shift="1" aria-label="Next month"><i/, 'the next arrow works in a past month');
});

test('H5: paused and archived habits fold at the bottom with "Nastavi" and "Vrati"', () => {
  const closed = render(screen());
  assert.match(closed, /<section class="habits-fold"><button class="collapsible-trigger" type="button" data-action="habits-fold" data-fold="paused" aria-expanded="false"><span class="left"><i class="ph ph-caret-down" aria-hidden="true"><\/i> Paused habits · 1<\/span><\/button><\/section><section class="habits-fold"><button class="collapsible-trigger" type="button" data-action="habits-fold" data-fold="archived" aria-expanded="false"><span class="left"><i class="ph ph-caret-down" aria-hidden="true"><\/i> Archived habits · 1<\/span><\/button><\/section>$/);
  const open = render(screen({ habitsPausedOpen: true, habitsArchivedOpen: true }));
  assert.match(open, /<div class="today-row habits-fold-row"><button class="today-row-main" type="button" data-route="habit\/p"><span class="task-title">Paused one<\/span><span class="task-meta">Daily<\/span><\/button><button class="quick-chip" type="button" data-action="resume-habit" data-habit-id="p">Resume<\/button><\/div>/);
  assert.match(open, /data-route="habit\/a">[\s\S]*?<button class="quick-chip" type="button" data-action="restore-habit" data-habit-id="a">Restore<\/button>/);
  const empty = screen({}, { habits: [] });
  assert.equal(render(empty), '<header title="Habits" subtitle="" add="false"></header><empty No habits yet. new-habit>');
});

test('the actions: a day toggle, a value sheet for the day, a ring, the switch, the chart and the folds', () => {
  const module = moduleFor();
  const ctx = screen();
  const act = (action, dataset) => module.handleAction(action, { target: { closest: () => ({ dataset }) } }, ctx);
  const yesterday = Core.addDays(TODAY, -1);
  act('habit-today-toggle', { habitId: 'm', date: yesterday });
  assert.deepEqual(ctx.calls.at(-1), ['log', 'm', yesterday, 'done']);
  ctx.state.habitLogCache.m.push(log('m', yesterday, 'skipped'));
  act('habit-today-toggle', { habitId: 'm', date: yesterday });
  assert.deepEqual(ctx.calls.at(-1), ['log', 'm', yesterday, 'done'], 'a skipped day becomes done');
  act('habit-today-toggle', { habitId: 'm', date: TODAY });
  assert.deepEqual(ctx.calls.at(-1), ['log', 'm', TODAY, 'missed']);
  const before = ctx.calls.length;
  act('habit-today-toggle', { habitId: 'm', date: Core.addDays(TODAY, 1) });
  assert.equal(ctx.calls.length, before, 'future days are inactive');
  act('habit-today-toggle', { habitId: 'n', date: yesterday });
  assert.deepEqual(ctx.calls.at(-1), ['value', 'n', yesterday]);
  act('habit-today-menu', { habitId: 'm', date: yesterday });
  const [, menu] = ctx.calls.at(-1);
  assert.match(menu, new RegExp(`<p class="sheet-subtitle">F:${yesterday}<\\/p>`));
  assert.match(menu, new RegExp(`data-pop-action="habit-today-skip" data-habit-id="m" data-date="${yesterday}">.*Undo skip`, 's'));
  act('habit-today-skip', { habitId: 'm', date: yesterday });
  assert.deepEqual(ctx.calls.slice(-2), [['close'], ['log', 'm', yesterday, 'missed']]);
  act('habit-today-value', { habitId: 'n', date: yesterday });
  assert.deepEqual(ctx.calls.slice(-2), [['close'], ['value', 'n', yesterday]]);

  act('habits-ring', { date: yesterday });
  assert.deepEqual([ctx.state.ui.habitsDay, ctx.state.ui.habitsView], [yesterday, 'day']);
  act('habits-ring', { date: Core.addDays(TODAY, 1) });
  assert.equal(ctx.state.ui.habitsDay, yesterday, 'a future ring is ignored');
  act('habits-view', { view: 'week' });
  assert.equal(ctx.state.ui.habitsView, 'week');
  act('habits-view', { view: 'day' });
  assert.deepEqual([ctx.state.ui.habitsView, ctx.state.ui.habitsDay], ['day', TODAY], 'Dan returns to today');
  act('habit-chart-day', { date: TODAY });
  assert.equal(ctx.state.ui.habitChartDay, TODAY);
  act('habit-chart-day', { date: TODAY });
  assert.equal(ctx.state.ui.habitChartDay, null, 'a second tap hides it');
  act('habit-chart-month', { shift: '-1' });
  assert.equal(ctx.state.ui.habitTrackerMonth, Core.addDays(`${TODAY.slice(0, 7)}-01`, -1).slice(0, 7));
  act('habit-chart-month', { shift: '1' });
  act('habit-chart-month', { shift: '1' });
  assert.equal(ctx.state.ui.habitTrackerMonth, TODAY.slice(0, 7), 'never past this month');
  act('habits-fold', { fold: 'paused' });
  act('habits-fold', { fold: 'archived' });
  assert.deepEqual([ctx.state.ui.habitsPausedOpen, ctx.state.ui.habitsArchivedOpen], [true, true]);
  for (const old of ['habit-tab', 'habit-month-shift', 'habit-month-today', 'habit-grid-toggle']) assert.doesNotMatch(habitsUi, new RegExp(`'${old}'`), old);
});

test('the value sheet opens for a past day and names it; the screen opens on Dan and today', () => {
  assert.match(fn('openHabitValue'), /function openHabitValue\(habitId, date = Core\.dateOnly\(\)\) \{/);
  assert.match(fn('openHabitValue'), /modalState = \{ type: 'habit-value', habitId, date, total: Number\(existing\?\.value \|\| 0\) \};/);
  const ctx = screen({}, {});
  Object.assign(ctx, { modalState: { type: 'habit-value', habitId: 'n', date: Core.addDays(TODAY, -1), total: 1 }, modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>` });
  assert.match(moduleFor().renderRoute({ type: 'modal', modalType: 'habit-value' }, ctx), new RegExp(`<h2 class="modal-title">Water<\\/h2>[\\s\\S]*?<p class="sheet-subtitle">F:${Core.addDays(TODAY, -1)}<\\/p>`));

  const enter = { Core, state: { ui: { habitsView: 'week', habitsDay: '2026-01-05', habitTrackerMonth: '2026-01', habitChartDay: '2026-01-02' } } };
  vm.createContext(enter);
  vm.runInContext(`let habitsOpen = false;\n${fn('enterHabitsRoute')}`, enter);
  enter.enterHabitsRoute({ type: 'habits' });
  assert.deepEqual(plain(enter.state.ui), { habitsView: 'day', habitsDay: TODAY, habitTrackerMonth: TODAY.slice(0, 7), habitChartDay: null });
  enter.state.ui.habitsView = 'week';
  enter.enterHabitsRoute({ type: 'habits' });
  assert.equal(enter.state.ui.habitsView, 'week', 'staying on the screen keeps the view');
  enter.enterHabitsRoute({ type: 'today' });
  enter.enterHabitsRoute({ type: 'habits' });
  assert.equal(enter.state.ui.habitsView, 'day');
  assert.match(fn('renderMain'), /enterHabitsRoute\(route\);/);
  assert.doesNotMatch(app, /data-habit-tab/);
});

test('the R8a layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R8a'));
  assert.ok(layer.length > 20, 'R8a layer');
  for (const selector of ['.habit-rings', '.habit-ring.is-selected', '.habit-ring-pc', '.habits-week-table', '.habit-cell.is-done', '.habit-cell.is-missed', '.habit-cell.is-skipped', '.habits-bar-track', '.habits-chart-svg', '.habits-fold']) assert.ok(layer.includes(selector), selector);
  for (const [en, value] of [['Day', 'Dan'], ['Daytime', 'Dan'], ['Habit view', 'Prikaz navika'], ['Progress', 'Napredak'], ['By habit · this week', 'Po navici · ova nedelja'], ['average', 'prosek'], ['Not scheduled', 'Nije u planu'], ['Paused habits', 'Pauzirane'], ['Archived habits', 'Arhivirane']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
  assert.match(sr, /"\{done\} of \{total\} today": "\{done\} od \{total\} danas"/);
  assert.match(sr, /"streak \{count\} days": \{ one: "niz \{count\} dan", few: "niz \{count\} dana", other: "niz \{count\} dana" \}/);
});

test('R8a shipped as 2.0.0-alpha.13 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 13);
  assert.match(read('sw.js'), new RegExp(`const VERSION = '${Release.APP_VERSION.replace(/\./g, '\\.')}';`));
  assert.equal(JSON.parse(read('package.json')).version, Release.APP_VERSION);
});
