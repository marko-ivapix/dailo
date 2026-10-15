// R96: Nedeljni pregled. It says how long it takes ("oko 10 minuta"), starts with the wins of the last 7 days (tasks
// completed, goals reached, habit streaks of a week or more), lets every step be skipped, merges goals, habits and areas
// into one look, and ends with up to three priorities for the coming week. The priorities are the existing
// settings.focusTaskIds (no data-model change): they lead Danas and Fokus starts with them.
// Spec: docs/superpowers/specs/2026-10-15-r96-weekly-review.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const TODAY = '2026-10-15';
const at = (date, time = '09:00') => new Date(`${date}T${time}:00`).toISOString();
const task = (id, fields = {}) => ({ id, title: id, isCompleted: false, isInbox: false, plannedDate: null, dueDate: null, projectId: null, recurrence: null, createdAt: at('2026-10-01'), ...fields });
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function fixture() {
  return {
    tasks: [
      task('won1', { isCompleted: true, completedAt: at('2026-10-14') }), task('won2', { isCompleted: true, completedAt: at('2026-10-15', '08:00') }),
      task('old', { isCompleted: true, completedAt: at('2026-10-01') }),
      task('next', { projectId: 'p1', projectOrder: 0 }), task('second', { projectId: 'p1', projectOrder: 1 }),
      task('soon', { plannedDate: '2026-10-18' }), task('later', { plannedDate: '2026-11-30' }), task('loose'), task('chore', { plannedDate: '2026-10-16', recurrence: { frequency: 'weekly', interval: 1 } }),
      task('inbox', { isInbox: true }),
    ],
    projects: [{ id: 'p1', name: 'Selidba', isArchived: false }, { id: 'p2', name: 'Ideje', isArchived: false, status: 'someday' }],
    goals: [{ id: 'g1', title: 'Maraton', status: 'completed', completedAt: at('2026-10-13') }, { id: 'g2', title: 'Staro', status: 'completed', completedAt: at('2026-09-01') }],
    habits: [{ id: 'h1', name: 'Šetnja', status: 'active' }, { id: 'h2', name: 'Čitanje', status: 'active' }],
    areas: [], journal: [], settings: { weekStartsOn: 1, focusTaskIds: ['soon'] }, ui: {},
  };
}

test('the wins of the last 7 days: completed tasks newest first and goals reached', () => {
  const wins = Core.weeklyWins(fixture(), TODAY);
  assert.deepEqual(wins.tasks.map(item => item.id), ['won2', 'won1']);
  assert.deepEqual(wins.goals.map(item => item.id), ['g1']);
});

test('priority candidates: next steps of active projects, then the next 7 days, then Kad stignem; no repeats, Inbox or chosen ones', () => {
  assert.deepEqual(Core.priorityCandidates(fixture(), TODAY, ['soon']).map(item => item.id), ['next', 'loose', 'second']);
  assert.deepEqual(Core.priorityCandidates(fixture(), TODAY, []).map(item => item.id), ['next', 'soon', 'loose', 'second']);
  assert.equal(Core.priorityCandidates(fixture(), TODAY, [], 2).length, 2);
});

function review(state = fixture()) {
  let adapter;
  runInNewContextWithI18n(read('js/review-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  const calls = [];
  const ctx = {
    calls, state, esc, Core: { ...Core, dateOnly: value => (value ? Core.dateOnly(value) : TODAY) },
    pageHeader: (title, subtitle) => `<header title="${title}" subtitle="${subtitle}"></header>`,
    reviewTaskRow: item => `<row id="${item.id}"></row>`, formatDate: value => `F:${value}`, getTask: id => state.tasks.find(item => item.id === id),
    renderGoalListRow: goal => `<goal id="${goal.id}"></goal>`, habitMetrics: habit => ({ currentStreak: habit.id === 'h1' ? 9 : 3, completionRate: 80 }),
    saveState: () => calls.push(['save']), navigate: route => calls.push(['navigate', route]), render: () => calls.push(['render']),
  };
  const act = (action, dataset) => adapter.handleAction(action, { target: { closest: () => ({ dataset }) } }, ctx);
  return { ctx, act, html: () => adapter.renderRoute({ type: 'review' }, ctx) };
}

test('the review says how long it takes and starts with the wins', () => {
  const html = review().html();
  assert.match(html, /^<header title="Weekly review" subtitle="Week of F:2026-10-12 · about 10 minutes"><\/header>/);
  const wins = html.slice(html.indexOf('<h2 class="review-card-title">Wins</h2>'), html.indexOf('data-weekly-review-step="1"'));
  assert.ok(wins.startsWith('<h2 class="review-card-title">Wins</h2><div class="today-card review-wins">'), 'before the first step');
  assert.match(wins, /2 tasks completed in the last 7 days: won2, won1/);
  assert.match(wins, /Goal reached: Maraton/);
  assert.match(wins, /Šetnja: streak 9 days/);
  assert.doesNotMatch(wins, /Čitanje/, 'a streak shorter than a week is not a win yet');
});

test('every step can be skipped for this week and shown again', () => {
  const view = review();
  assert.match(view.html(), /data-weekly-review-step="1">[\s\S]*?<button class="btn btn-ghost review-skip" type="button" data-action="review-skip" data-step="inbox">Skip this step<\/button><\/section>/);
  view.act('review-skip', { step: 'inbox' });
  assert.deepEqual(JSON.parse(JSON.stringify(view.ctx.state.ui.reviewSkipped)), { week: '2026-10-12', steps: ['inbox'] });
  assert.deepEqual(view.ctx.calls.slice(-2), [['save'], ['render']]);
  const skipped = view.html();
  assert.match(skipped, /<section class="section review-step is-skipped" data-weekly-review-step="1"><div class="section-header"><h2 class="section-label"><span class="weekly-review-number" aria-hidden="true">1<\/span>Empty the Inbox<span class="review-step-done"> · skipped<\/span><\/h2><button class="btn btn-ghost review-unskip" type="button" data-action="review-unskip" data-step="inbox">Show<\/button><\/div><\/section>/);
  view.act('review-unskip', { step: 'inbox' });
  assert.deepEqual(JSON.parse(JSON.stringify(view.ctx.state.ui.reviewSkipped.steps)), []);
  view.ctx.state.ui.reviewSkipped = { week: '2026-10-05', steps: ['inbox'] };
  assert.doesNotMatch(view.html(), /is-skipped/, 'last week\'s skips do not carry over');
});

test('goals, habits and areas are one step; the last step picks up to three priorities', () => {
  const view = review();
  const html = view.html();
  assert.match(html, /data-weekly-review-step="5"><div class="section-header"><h2 class="section-label"><span class="weekly-review-number" aria-hidden="true">5<\/span>Goals, habits and areas<\/h2><\/div>/);
  assert.doesNotMatch(html, /data-weekly-review-step="7"/);
  const last = html.slice(html.indexOf('data-weekly-review-step="6"'));
  assert.match(last, /Priorities for next week<\/h2><span class="section-count">1\/3<\/span>/);
  assert.match(last, /<div class="review-priority"><button class="review-row" type="button" data-action="open-task" data-task-id="soon"><span>soon<\/span><\/button><button class="quick-chip" type="button" data-action="review-priority-remove" data-task-id="soon" aria-label="Remove from priorities: soon">✕<\/button><\/div>/);
  assert.match(last, /data-action="review-priority-add" data-task-id="next"/);
  view.act('review-priority-add', { taskId: 'next' });
  view.act('review-priority-add', { taskId: 'loose' });
  view.act('review-priority-add', { taskId: 'second' });
  assert.deepEqual(JSON.parse(JSON.stringify(view.ctx.state.settings.focusTaskIds)), ['soon', 'next', 'loose'], 'three at most');
  assert.doesNotMatch(view.html().slice(view.html().indexOf('data-weekly-review-step="6"')), /review-priority-add/, 'no more suggestions once three are chosen');
  view.act('review-priority-remove', { taskId: 'next' });
  assert.deepEqual(JSON.parse(JSON.stringify(view.ctx.state.settings.focusTaskIds)), ['soon', 'loose']);
});

test('the priorities lead Danas and Fokus starts with them', () => {
  const today = functionSource('renderToday').source;
  assert.match(today, /const priorities = Core\.selectFocusTasks\(listed, state\.settings\?\.focusTaskIds\)\.map\(id => listed\.find\(task => task\.id === id\)\)\.filter\(Boolean\);/);
  assert.match(today, /section\('priorities', tr\("This week's priorities"\), priorities\.length, /);
  assert.match(today, /data-action="priority-focus"/);
  assert.match(functionSource('focusableTasks').source, /return \[\.\.\.new Set\(\[\.\.\.priorities, \.\.\.sections\.overdue, \.\.\.sections\.today\]\)\];/);
  assert.match(read('js/app.js'), /else if \(action === 'priority-focus'\) \{ const first = Core\.selectFocusTasks\(listTasks\(\), state\.settings\.focusTaskIds\)\[0\]; if \(first\) openFocusMode\(first\); \}/);
  const css = read('css/styles.css');
  for (const rule of ['.review-wins {', '.review-win {', '.review-skip, .review-unskip {', '.review-step.is-skipped', '.review-subtitle {', '.review-priority {', '.today-priorities {', '.today-priority {']) assert.ok(css.includes(rule), rule);
});

test('the new lines are Serbian; the guide follows', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['about 10 minutes', 'oko 10 minuta'], ['Wins', 'Pobede'], ['Goal reached: {goal}', 'Cilj ostvaren: {goal}'], ['Skip this step', 'Preskoči ovaj korak'],
    ['skipped', 'preskočeno'], ['Show', 'Prikaži'], ['Goals, habits and areas', 'Ciljevi, navike i oblasti'], ['Priorities for next week', 'Prioriteti za sledeću nedelju'],
    ["This week's priorities", 'Prioriteti ove nedelje'], ['Focus on them', 'Fokusiraj se na njih'], ['Remove from priorities: {task}', 'Ukloni iz prioriteta: {task}'],
    ['Add to priorities: {task}', 'Dodaj u prioritete: {task}'], ['Pick up to three tasks for next week. They stay at the top of Today and Focus starts with them.', 'Izaberi do tri zadatka za sledeću nedelju. Stoje na vrhu ekrana Danas, a Fokus počinje od njih.'],
    ['Nothing completed in the last 7 days yet.', 'U poslednjih 7 dana još ništa nije završeno.'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  assert.ok(sr.includes('"{count} tasks completed in the last 7 days: {titles}": { one: "{count} zadatak završen u poslednjih 7 dana: {titles}", few: "{count} zadatka završena u poslednjih 7 dana: {titles}", other: "{count} zadataka završeno u poslednjih 7 dana: {titles}" }'));
  assert.ok(read('uputstvo.html').includes('Traje oko 10 minuta i počinje pobedama iz poslednjih 7 dana. Svaki korak možeš da preskočiš. Na kraju biraš do tri prioriteta za sledeću nedelju: stoje na vrhu ekrana Danas, a <strong>Fokusiraj se na njih</strong> ih otvara u Fokusu.'));
});

test('R96 shipped as 2.0.0-alpha.123 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 123) >= 123);
});
