// Redesign R13: Nedeljni pregled with "Poslednjih 7 dana" and "Dnevnik ove nedelje" (S5, J8).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r13-weekly-review.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const plain = value => JSON.parse(JSON.stringify(value));
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const TODAY = '2026-10-10'; // a Saturday; the week starts on Monday 2026-10-05
const at = (date, time = '12:00') => new Date(`${date}T${time}:00`).toISOString();
const done = (id, date) => ({ id, title: id, isCompleted: true, completedAt: at(date), createdAt: at('2026-09-01') });

function fixture() {
  return {
    tasks: [
      done('a', '2026-10-10'), done('b', '2026-10-10'), done('c', '2026-10-08'), done('d', '2026-10-04'), done('e', '2026-10-01'), done('f', '2026-10-03'), done('g', '2026-10-02'),
      { id: 'new1', title: 'New', isCompleted: false, createdAt: at('2026-10-09') }, { id: 'new2', title: 'New 2', isCompleted: false, createdAt: at('2026-10-04'), isInbox: true },
      { id: 'later', title: 'Later', isCompleted: false, createdAt: at('2026-09-01'), plannedDate: '2026-10-12', dueDate: '2026-10-12' },
      { id: 'late', title: 'Late', isCompleted: false, createdAt: at('2026-09-01'), dueDate: '2026-10-08' },
    ],
    habits: [
      { id: 'h1', name: 'Walk', status: 'active', frequencyType: 'daily', startDate: '2026-09-01' },
      { id: 'h2', name: 'Gym', status: 'active', frequencyType: 'timesPerWeek', timesPerWeek: 3, startDate: '2026-09-01' },
    ],
    habitLogCache: {
      h1: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09', '2026-10-01'].map(date => ({ id: `l-${date}`, habitId: 'h1', date, status: 'done' })),
      h2: ['2026-10-05', '2026-10-07', '2026-10-08', '2026-10-09'].map(date => ({ id: `g-${date}`, habitId: 'h2', date, status: 'done' })),
    },
    goals: [{ id: 'g1', title: 'Marathon', status: 'active', progressMode: 'manual', currentValue: 10, targetValue: 100 }],
    areas: [{ id: 'a1', name: 'Health', status: 'active' }], projects: [],
    journal: [
      { id: 'journal_2026-10-05', date: '2026-10-05', text: 'Monday', mood: 4, createdAt: at('2026-10-05'), updatedAt: at('2026-10-05') },
      { id: 'journal_2026-10-07', date: '2026-10-07', text: 'No mood', mood: null, createdAt: at('2026-10-07'), updatedAt: at('2026-10-07') },
    ],
    settings: { weekStartsOn: 'monday', weeklyReviews: [] }, ui: {},
  };
}

test('S5: Core.weeklyReviewStats counts the last 7 days, the change, new tasks and this week\'s habits', () => {
  const state = fixture();
  const stats = Core.weeklyReviewStats(state, Object.values(state.habitLogCache).flat(), TODAY, 'monday');
  assert.deepEqual(plain(stats.days), [['2026-10-04', 1], ['2026-10-05', 0], ['2026-10-06', 0], ['2026-10-07', 0], ['2026-10-08', 1], ['2026-10-09', 0], ['2026-10-10', 2]].map(([date, completed]) => ({ date, completed })));
  assert.deepEqual([stats.total, stats.previousTotal, stats.added], [4, 3, 2]);
  // Walk: 6 planned days Mon–Sat, 4 done; Gym: target 3, 4 done counts as 3 → 7 of 9.
  assert.equal(stats.habitsPercent, 78);
  assert.equal(Core.weeklyReviewStats({ tasks: [], habits: [] }, [], TODAY, 'monday').habitsPercent, null, 'no habits planned');
});

function render(state = fixture(), extra = {}) {
  let adapter;
  runInNewContextWithI18n(read('js/review-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  const calls = [];
  const ctx = {
    calls, state, esc, Core: { ...Core, dateOnly: value => (value ? Core.dateOnly(value) : TODAY) },
    pageHeader: (title, subtitle) => `<header title="${title}" subtitle="${subtitle}"></header>`,
    reviewTaskRow: (item, context, options) => `<row id="${item.id}" ${context} ${Object.keys(options).join(',')}></row>`,
    relativeDateLabel: value => `L:${value}`, formatDate: (value, mode) => `${mode === 'full' ? 'FULL' : 'F'}:${value}`,
    renderGoalListRow: goal => `<goal id="${goal.id}"></goal>`, habitMetrics: () => ({ currentStreak: 4, completionRate: 80 }),
    saveState: () => calls.push(['save']), navigate: route => calls.push(['navigate', route]), render: () => calls.push(['render']),
    ...extra,
  };
  return { adapter, ctx, html: () => adapter.renderRoute({ type: 'review' }, ctx) };
}

test('S5: the "Poslednjih 7 dana" card with seven columns, a selectable day and three numbers', () => {
  const view = render();
  const html = view.html();
  assert.match(html, /^<header title="Weekly review" subtitle="Week of F:2026-10-05"><\/header><div class="weekly-review"><h2 class="review-card-title">Last 7 days<\/h2><div class="today-card review-chart-card"><div class="review-chart" role="group" aria-label="Completed tasks per day"><p class="review-chart-title">Completed tasks per day<\/p><div class="review-columns">/);
  const columns = [...html.matchAll(/<button class="review-column( is-selected)?" type="button" data-action="review-day-bar" data-date="([^"]+)" aria-pressed="(\w+)" aria-label="([^"]+)"><span class="review-column-value">([^<]*)<\/span><span class="review-column-fill" style="height:(\d+)%"><\/span><span class="review-column-day">(\w+)<\/span><\/button>/g)];
  assert.deepEqual(columns.map(match => [match[2], match[3], match[5], match[6], match[7]]), [['2026-10-04', 'false', '', '50', 'Sun'], ['2026-10-05', 'false', '', '0', 'Mon'], ['2026-10-06', 'false', '', '0', 'Tue'], ['2026-10-07', 'false', '', '0', 'Wed'], ['2026-10-08', 'false', '', '50', 'Thu'], ['2026-10-09', 'false', '', '0', 'Fri'], ['2026-10-10', 'true', '2', '100', 'Sat']]);
  assert.equal(columns[6][4], 'FULL:2026-10-10: 2 completed');
  assert.match(html, /<p class="review-chart-caption">FULL:2026-10-10 · 2 completed<\/p><div class="review-tiles"><div class="review-tile"><strong>4<\/strong><span>Completed<\/span><small>▲ 1 against the previous 7<\/small><\/div><div class="review-tile"><strong>2<\/strong><span>Arrived<\/span><small>new tasks<\/small><\/div><div class="review-tile"><strong>78%<\/strong><span>Habits<\/span><small>done this week<\/small><\/div><\/div><\/div>/);
  view.adapter.handleAction('review-day-bar', { target: { closest: () => ({ dataset: { date: '2026-10-08' } }) } }, view.ctx);
  assert.deepEqual(view.ctx.calls.at(-1), ['render']);
  assert.match(view.html(), /data-date="2026-10-08" aria-pressed="true"[^>]*><span class="review-column-value">1<\/span>[\s\S]*<p class="review-chart-caption">FULL:2026-10-08 · 1 completed<\/p>/);
  const quiet = fixture(); quiet.tasks = []; quiet.habits = [];
  assert.match(render(quiet).html(), /<strong>0<\/strong><span>Completed<\/span><small>the same as the previous 7<\/small>[\s\S]*<strong>–<\/strong><span>Habits<\/span>/);
});

test('J8: "Dnevnik ove nedelje" shows faces, a pencil, dots and disabled future days; a tap opens the day', () => {
  const html = render().html();
  assert.match(html, /<h2 class="review-card-title">This week's journal<\/h2><div class="today-card review-journal">/);
  const days = [...html.matchAll(/<button class="review-journal-day" type="button" data-action="open-journal" data-date="([^"]+)"( disabled)? aria-label="([^"]+)"><span class="review-journal-mark" aria-hidden="true">([^<]+)<\/span><small>(\w+)<\/small><\/button>/g)];
  assert.deepEqual(days.map(match => [match[1], match[4], match[5], Boolean(match[2])]), [['2026-10-05', '🙂', 'Mon', false], ['2026-10-06', '·', 'Tue', false], ['2026-10-07', '✎', 'Wed', false], ['2026-10-08', '·', 'Thu', false], ['2026-10-09', '·', 'Fri', false], ['2026-10-10', '·', 'Sat', false], ['2026-10-11', '·', 'Sun', true]]);
  assert.deepEqual([days[0][3], days[2][3], days[1][3]], ['FULL:2026-10-05: good', 'FULL:2026-10-07: an entry without a mood', 'FULL:2026-10-06: no entry']);
});

test('S5: empty first steps fold into "· gotovo", the next days open the Calendar, and the other steps use rows', () => {
  const state = fixture();
  state.tasks = state.tasks.filter(task => task.id !== 'new2' && task.id !== 'late');
  const view = render(state);
  const html = view.html();
  assert.match(html, /<section class="section review-step is-done" data-weekly-review-step="1"><div class="section-header"><h2 class="section-label"><span class="weekly-review-number" aria-hidden="true"><i class="ph ph-check"><\/i><\/span>Empty the Inbox<span class="review-step-done"> · done<\/span><\/h2><\/div><\/section>/);
  assert.match(html, /data-weekly-review-step="2"><div class="section-header"><h2 class="section-label"><span class="weekly-review-number" aria-hidden="true"><i class="ph ph-check"><\/i><\/span>Overdue and missed plans<span class="review-step-done"> · done<\/span>/);
  assert.match(html, /<button class="review-day-row" type="button" data-action="review-open-day" data-date="2026-10-11"><span>FULL:2026-10-11<\/span><span class="review-day-free">Free<\/span><\/button><button class="review-day-row" type="button" data-action="review-open-day" data-date="2026-10-12"><span>FULL:2026-10-12<\/span><span class="review-day-busy">1 planned · 1 due<\/span><\/button>/);
  assert.doesNotMatch(html, /data-route="upcoming"/);
  view.adapter.handleAction('review-open-day', { target: { closest: () => ({ dataset: { date: '2026-10-12' } }) } }, view.ctx);
  assert.deepEqual([view.ctx.state.ui.calendarDate, view.ctx.state.ui.calendarView], ['2026-10-12', 'week']);
  assert.deepEqual(view.ctx.calls.slice(-2), [['save'], ['navigate', 'calendar']]);
  assert.match(html, /data-weekly-review-step="4">[\s\S]*?<div class="today-card"><goal id="g1"><\/goal><\/div>/);
  assert.match(html, /<button class="review-row" type="button" data-route="habit\/h1"><span>Walk<\/span><span class="review-row-meta">streak 4 · 80%<\/span><\/button>/);
  assert.match(html, /<button class="review-row" type="button" data-route="area\/a1"><span>Health<\/span><span class="review-row-meta">0 open tasks<\/span><\/button>/);
  const busy = render().html();
  assert.match(busy, /data-weekly-review-step="1"><div class="section-header"><h2 class="section-label"><span class="weekly-review-number" aria-hidden="true">1<\/span>Empty the Inbox<\/h2><span class="section-count">1<\/span><\/div><div class="today-card"><row id="new2" inbox today,inbox><\/row><\/div>/); // R17: the usual task rows
});

test('S5: the finish button, the done line and the earlier reviews', () => {
  assert.match(render().html(), /<section class="weekly-review-finish"><button class="btn btn-primary habit-window-save" type="button" data-action="complete-weekly-review"><i class="ph ph-check"><\/i> Finish weekly review<\/button><\/section><\/div>$/);
  const state = fixture();
  state.settings.weeklyReviews = [{ weekStart: '2026-10-05', completedAt: at('2026-10-10', '09:00') }, { weekStart: '2026-09-28', completedAt: at('2026-10-03', '09:00') }];
  assert.match(render(state).html(), /<section class="weekly-review-finish" data-weekly-review-done><i class="ph ph-check-circle" aria-hidden="true"><\/i><p>This week's review was completed F:2026-10-10\.<\/p><p class="weekly-review-history">Recent reviews: F:2026-10-03<\/p><\/section><\/div>$/);
});

test('the R13 layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R13'));
  assert.ok(layer.length > 20, 'R13 layer');
  for (const selector of ['.review-card-title', '.review-chart', '.review-columns', '.review-column', '.review-column.is-selected', '.review-column-fill', '.review-chart-caption', '.review-tiles', '.review-tile', '.review-journal', '.review-journal-day', '.review-step.is-done', '.review-day-row', '.review-day-free', '.review-row']) assert.ok(layer.includes(selector), selector);
  for (const [en, value] of [['Last 7 days', 'Poslednjih 7 dana'], ['Completed tasks per day', 'Završeni zadaci po danu'], ['Arrived', 'Stiglo'], ['new tasks', 'novih zadataka'], ['done this week', 'urađeno ove nedelje'], ["This week's journal", 'Dnevnik ove nedelje'], ['Free', 'Slobodno'], ['the same as the previous 7', 'isto kao prethodnih 7']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R13 shipped as 2.0.0-alpha.34 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 34);
});
