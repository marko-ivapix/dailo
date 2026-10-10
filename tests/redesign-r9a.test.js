// Redesign R9a: the Goals list (GO1–GO4).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r9a-goals.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const goalsUi = read('js/goals-ui.js');
const app = read('js/app.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const TODAY = Core.dateOnly();
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const plus = days => Core.addDays(TODAY, days);

function moduleFor() {
  let adapter;
  runInNewContextWithI18n(goalsUi, { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: fn => fn() });
  return adapter;
}

const manual = (id, fields) => ({ id, status: 'active', progressMode: 'manual', progressType: 'percentage', currentValue: 0, targetValue: 100, unit: '', horizon: 'short', milestones: [], projectLinks: [], taskIds: [], habitLinks: [], ...fields });
function screen(goals, ui = {}, extra = {}) {
  const calls = [];
  const state = { goals, tasks: [], projects: [], habits: [], habitMetrics: {}, ui: { goalGroup: 'horizon', ...ui }, settings: {}, ...extra };
  const ctx = {
    calls, state, Core, esc,
    pageHeader: (title, subtitle, options) => `<header title="${title}" subtitle="${subtitle}" add="${options?.add}"></header>`,
    emptyState: (title, text, cta, action) => `<empty ${title} ${action}>`,
    formatDate: value => `D:${value}`,
    saveAndRender: () => calls.push(['saveAndRender']),
    updateGoalStatus: (id, status) => calls.push(['status', id, status]),
  };
  return ctx;
}
const render = ctx => moduleFor().renderRoute({ type: 'goals' }, ctx);
const fixture = () => [
  manual('late', { title: 'Taxes', currentValue: 40, targetDate: plus(-2) }),
  manual('risk', { title: 'Site', progressMode: 'linkedTasks', taskIds: ['t1', 't2', 't3', 't4'], targetDate: plus(3) }),
  manual('ok', { title: 'Books', progressType: 'numeric', currentValue: 3, targetValue: 4, unit: 'books', horizon: 'mid', targetDate: plus(60) }),
  manual('soonok', { title: 'Almost', currentValue: 80, targetDate: plus(2) }),
  manual('habits', { title: 'Run', progressMode: 'linkedHabits', habitLinks: [{ habitId: 'h1', metric: 'totalCheckins', target: 10 }, { habitId: 'h2', metric: 'totalCheckins', target: 10 }], horizon: 'long' }),
  manual('done', { title: 'Photography', status: 'completed', completedAt: '2026-09-12T10:00:00.000Z', currentValue: 100 }),
  manual('paused', { title: 'Guitar', status: 'paused', currentValue: 10 }),
  manual('arch', { title: 'Old plan', status: 'archived' }),
];
const tasks = [{ id: 't1', isCompleted: true, goalIds: ['risk'] }, { id: 't2', isCompleted: false, goalIds: ['risk'] }, { id: 't3', isCompleted: false, goalIds: ['risk'] }, { id: 't4', isCompleted: false, goalIds: ['risk'] }];

test('GO1: "Ciljevi" with "N aktivnih · M u riziku · K kasni"; no dashboard, tabs or header button', () => {
  const html = render(screen(fixture(), {}, { tasks }));
  assert.match(html, /^<header title="Goals" subtitle="" add="false"><\/header><p class="goals-summary">5 active · <span class="is-risk">1 at risk<\/span> · <span class="is-overdue">1 overdue<\/span><\/p>/);
  assert.doesNotMatch(html, /goal-dashboard|data-goal-tab|data-action="new-goal"|Goal pulse/);
  assert.match(render(screen([manual('a', { title: 'A' })])), /<p class="goals-summary">1 active<\/p>/);
});

test('GO2: the Horizont / Rok switch; horizon groups and month groups with "Bez datuma" last', () => {
  const ctx = screen(fixture(), {}, { tasks });
  const html = render(ctx);
  assert.match(html, /<div class="view-tabs goals-group-switch" role="group" aria-label="Group goals"><button class="btn is-selected" type="button" data-action="goals-group" data-view="horizon" aria-pressed="true">Horizon<\/button><button class="btn" type="button" data-action="goals-group" data-view="date" aria-pressed="false">Due date<\/button><\/div>/);
  const groups = html => [...html.matchAll(/<section class="section goals-group" data-goal-group="([\w-]+)"><div class="section-header"><h2 class="section-label"><i class="ph ([\w-]+)" aria-hidden="true"><\/i> ([^<]+)<\/h2><span class="section-count">(\d+)<\/span><\/div><div class="today-card goals-list">(.*?)<\/div><\/section>/g)].map(match => [match[1], match[2], match[3], match[4], [...match[5].matchAll(/data-route="goal\/(\w+)"/g)].map(row => row[1])]);
  assert.deepEqual(groups(html), [['short', 'ph-flag', 'Short-term', '3', ['late', 'soonok', 'risk']], ['mid', 'ph-path', 'Mid-term', '1', ['ok']], ['long', 'ph-mountains', 'Long-term', '1', ['habits']]]);
  const byDate = groups(render(screen(fixture(), { goalGroup: 'date' }, { tasks })));
  const month = date => { const name = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(Core.parseDateOnly(date)); return name; };
  const expected = [...new Map([plus(-2), plus(2), plus(3), plus(60)].map(date => [date.slice(0, 7), date])).values()].map(date => month(date));
  assert.deepEqual(byDate.map(group => group[2]), [...expected, 'No date']);
  assert.equal(byDate.at(-1)[0], 'none');
  assert.deepEqual(byDate.at(-1)[4], ['habits']);
  const module = moduleFor();
  module.handleAction('goals-group', { target: { closest: () => ({ dataset: { view: 'date' } }) } }, ctx);
  assert.equal(ctx.state.ui.goalGroup, 'date');
  module.handleAction('goals-group', { target: { closest: () => ({ dataset: { view: 'other' } }) } }, ctx);
  assert.equal(ctx.state.ui.goalGroup, 'horizon');
});

test('GO3: a row has the title, the percentage, a toned bar and the progress with the date words', () => {
  const html = render(screen(fixture(), {}, { tasks }));
  const row = id => html.match(new RegExp(`<button class="goal-list-row" type="button" data-route="goal/${id}">(.*?)</button>`))[1];
  assert.equal(row('late'), `<span class="goal-list-top"><span class="task-title">Taxes</span><span class="goal-list-percent">40%</span></span><span class="goal-list-bar is-overdue" aria-hidden="true"><i style="width:40%"></i></span><span class="goal-list-meta"><span>Manual</span><span class="goal-list-date is-overdue">Overdue · D:${plus(-2)}</span></span>`);
  assert.match(row('risk'), new RegExp(`goal-list-percent">25%<\\/span>[\\s\\S]*goal-list-bar is-risk"[\\s\\S]*<span>1 of 4 tasks<\\/span><span class="goal-list-date is-risk">At risk · D:${plus(3)}<\\/span>`));
  assert.match(row('ok'), new RegExp(`goal-list-percent">75%<\\/span>[\\s\\S]*goal-list-bar is-ok"[\\s\\S]*<span>3 of 4 books<\\/span><span class="goal-list-date">D:${plus(60)}<\\/span>`));
  assert.match(row('soonok'), /goal-list-bar is-ok"[\s\S]*<span class="goal-list-date">D:/, '80% within a week is on track');
  assert.match(row('habits'), /<span>2 habits<\/span><span class="goal-list-date">No date<\/span>/);
  const full = render(screen([manual('full', { title: 'Done soon', progressMode: 'linkedTasks', taskIds: ['x'], targetDate: plus(1) })], {}, { tasks: [{ id: 'x', isCompleted: true, goalIds: ['full'] }] }));
  assert.match(full, /goal-list-bar is-complete"/, 'a linked goal at 100% is never at risk');
});

test('GO4: Ostvareni, Pauzirani and Arhivirani fold at the bottom; the empty screen offers "Novi cilj"', () => {
  const closed = render(screen(fixture(), {}, { tasks }));
  assert.match(closed, /<section class="goals-fold"><button class="collapsible-trigger" type="button" data-action="goals-fold" data-fold="done" aria-expanded="false"><span class="left"><i class="ph ph-caret-down" aria-hidden="true"><\/i> Achieved goals · 1<\/span><\/button><\/section><section class="goals-fold">[\s\S]*data-fold="paused"[\s\S]*Paused goals · 1[\s\S]*data-fold="archived"[\s\S]*Archived goals · 1<\/span><\/button><\/section>$/);
  const open = render(screen(fixture(), { goalsDoneOpen: true, goalsPausedOpen: true, goalsArchivedOpen: true }, { tasks }));
  assert.match(open, /<div class="today-row goals-fold-row"><button class="today-row-main" type="button" data-route="goal\/done"><span class="task-title">Photography<\/span><span class="task-meta">Achieved D:2026-09-12<\/span><\/button><\/div>/);
  assert.match(open, /data-route="goal\/paused"><span class="task-title">Guitar<\/span><span class="task-meta">Manual<\/span><\/button><button class="quick-chip" type="button" data-action="resume-goal" data-goal-id="paused">Resume<\/button>/);
  assert.match(open, /data-route="goal\/arch">[\s\S]*?<button class="quick-chip" type="button" data-action="restore-goal" data-goal-id="arch">Restore<\/button>/);
  const ctx = screen(fixture(), {}, { tasks });
  const module = moduleFor();
  for (const fold of ['done', 'paused', 'archived']) module.handleAction('goals-fold', { target: { closest: () => ({ dataset: { fold } }) } }, ctx);
  assert.deepEqual([ctx.state.ui.goalsDoneOpen, ctx.state.ui.goalsPausedOpen, ctx.state.ui.goalsArchivedOpen], [true, true, true]);
  assert.equal(render(screen([])), '<header title="Goals" subtitle="" add="false"></header><empty No goals here yet. new-goal>');
  assert.doesNotMatch(goalsUi, /'goal-tab'|renderGoalDashboard/);
  assert.doesNotMatch(app, /data-goal-tab/);
});

test('the R9a layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R9a'));
  assert.ok(layer.length > 20, 'R9a layer');
  for (const selector of ['.goals-summary .is-risk', '.goals-summary .is-overdue', '.goal-list-row', '.goal-list-bar.is-risk', '.goal-list-bar.is-overdue', '.goal-list-date.is-risk', '.goals-fold']) assert.ok(layer.includes(selector), selector);
  for (const [en, value] of [['At risk · {date}', 'U riziku · {date}'], ['{current} of {target} tasks', '{current} od {target} zadataka'], ['Group goals', 'Grupisanje ciljeva'], ['Achieved goals', 'Ostvareni'], ['Paused goals', 'Pauzirani'], ['Archived goals', 'Arhivirani'], ['Achieved {date}', 'Ostvaren {date}']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
  assert.match(sr, /"\{count\} at risk": \{ one: "\{count\} u riziku", few: "\{count\} u riziku", other: "\{count\} u riziku" \}/);
});

test('R9a is released as 2.0.0-alpha.16', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.16');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.16';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.16');
});
