const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const Core = require('../js/core.js');
global.TodoCore = Core;
global.__TODO_TEST_MEMORY_DB__ = true;
require('../js/storage.js');
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');

// 2026-10-09 is a Friday; with Monday weeks the week started on 2026-10-05.
const TODAY = '2026-10-09';
const task = (id, fields = {}) => ({ id, title: id, isCompleted: false, isInbox: false, plannedDate: null, dueDate: null, projectId: null, areaId: null, tagIds: [], subtasks: [], ...fields });
const fixture = () => ({
  tasks: [
    task('i1', { isInbox: true }),
    task('o2', { dueDate: '2026-10-05', plannedDate: '2026-10-03' }),
    task('o1', { dueDate: '2026-10-01' }),
    task('m1', { plannedDate: '2026-10-06', areaId: 'a1' }),
    task('c1', { dueDate: '2026-10-01', isCompleted: true, areaId: 'a1' }),
    task('t1', { plannedDate: TODAY }),
    task('n1', { plannedDate: '2026-10-10', areaId: 'a1' }),
    task('n2', { dueDate: '2026-10-12', projectId: 'p1' }),
    task('n3', { plannedDate: '2026-10-16' }),
    task('n4', { plannedDate: '2026-10-17' }),
  ],
  projects: [{ id: 'p1', name: 'Kuća', areaId: 'a2', isArchived: false }],
  areas: [{ id: 'a1', name: 'Zdravlje' }, { id: 'a2', name: 'Dom' }],
  goals: [
    { id: 'g1', title: 'Maraton', status: 'active', targetDate: '2026-10-01', progressMode: 'manual', progressType: 'percent', currentValue: 10, targetValue: 100 },
    { id: 'g2', title: 'Gotovo', status: 'completed' },
  ],
  habits: [{ id: 'h1', name: 'Šetnja', status: 'active' }, { id: 'h2', name: 'Stara', status: 'archived' }],
  settings: { weekStartsOn: 1 },
});

test('deriveWeeklyReview collects Inbox, overdue, missed plans, the next 7 days, active goals, habits and Areas', () => {
  const review = Core.deriveWeeklyReview(fixture(), TODAY, 1);
  assert.equal(review.weekStart, '2026-10-05');
  assert.deepEqual(review.inbox.map(item => item.id), ['i1']);
  assert.deepEqual(review.overdue.map(item => item.id), ['o1', 'o2']);
  assert.deepEqual(review.missedPlans.map(item => item.id), ['m1']);
  assert.deepEqual(JSON.parse(JSON.stringify(review.nextDays)), [
    { date: '2026-10-10', planned: 1, due: 0 }, { date: '2026-10-11', planned: 0, due: 0 }, { date: '2026-10-12', planned: 0, due: 1 },
    { date: '2026-10-13', planned: 0, due: 0 }, { date: '2026-10-14', planned: 0, due: 0 }, { date: '2026-10-15', planned: 0, due: 0 },
    { date: '2026-10-16', planned: 1, due: 0 },
  ]);
  assert.deepEqual(review.goals.map(item => [item.goal.id, item.health]), [['g1', 'overdue']]);
  assert.deepEqual(review.habits.map(habit => habit.id), ['h1']);
  assert.deepEqual(review.areas.map(item => [item.area.id, item.open]), [['a1', 2], ['a2', 1]]);
  assert.equal(Core.deriveWeeklyReview(fixture(), TODAY, 'sunday').weekStart, '2026-10-04');
});

test('the review log keeps one valid entry per week, newest first, at most 26', () => {
  assert.deepEqual(Core.weeklyReviewLog({}), []);
  const messy = { weeklyReviews: [
    { weekStart: '2026-09-28', completedAt: '2026-10-02T18:00:00.000Z' },
    { weekStart: 'nope', completedAt: '2026-10-02T18:00:00.000Z' },
    { weekStart: '2026-10-05', completedAt: 'later' },
    'junk',
    { weekStart: '2026-09-28', completedAt: '2026-10-01T18:00:00.000Z' },
    { weekStart: '2026-09-21', completedAt: '2026-09-26T09:00:00.000Z' },
  ] };
  assert.deepEqual(Core.weeklyReviewLog(messy), [
    { weekStart: '2026-09-28', completedAt: '2026-10-02T18:00:00.000Z' },
    { weekStart: '2026-09-21', completedAt: '2026-09-26T09:00:00.000Z' },
  ]);
  const recorded = Core.recordWeeklyReview(messy, { today: TODAY, now: '2026-10-09T17:00:00.000Z', weekStartsOn: 1 });
  assert.deepEqual(recorded[0], { weekStart: '2026-10-05', completedAt: '2026-10-09T17:00:00.000Z' });
  const again = Core.recordWeeklyReview({ weeklyReviews: recorded }, { today: '2026-10-10', now: '2026-10-10T08:00:00.000Z', weekStartsOn: 1 });
  assert.equal(again.length, recorded.length, 'the same week is replaced, not added');
  assert.equal(again[0].completedAt, '2026-10-10T08:00:00.000Z');
  const many = { weeklyReviews: Array.from({ length: 40 }, (_, index) => ({ weekStart: Core.addDays('2026-01-05', index * 7), completedAt: '2026-10-01T00:00:00.000Z' })) };
  assert.equal(Core.weeklyReviewLog(many).length, 26);
});

test('the review is due on the last three days of the week until it is recorded', () => {
  const settings = { weeklyReviews: [] };
  assert.equal(Core.weeklyReviewDue(settings, '2026-10-08', 1), false, 'Thursday');
  for (const day of ['2026-10-09', '2026-10-10', '2026-10-11']) assert.equal(Core.weeklyReviewDue(settings, day, 1), true, day);
  assert.equal(Core.weeklyReviewDue(settings, '2026-10-12', 1), false, 'next Monday starts a new week');
  const done = { weeklyReviews: Core.recordWeeklyReview(settings, { today: TODAY, now: '2026-10-09T17:00:00.000Z', weekStartsOn: 1 }) };
  assert.equal(Core.weeklyReviewDue(done, '2026-10-10', 1), false);
  assert.equal(Core.weeklyReviewDue({}, '2026-10-10', 'sunday'), true, 'Saturday ends a Sunday week');
  assert.equal(Core.weeklyReviewDue({}, '2026-10-11', 'sunday'), false, 'Sunday starts a new week');
});

test('backups keep the review log and reject an invalid one', async () => {
  const base = Core.migrateStateV3({ version: 2, tasks: [], projects: [], tags: [], settings: {}, ui: {} }).state;
  const storage = { attachments: { getMany: async () => [] }, habitLogs: { listAll: async () => [] }, goalHistory: { listAll: async () => [] } };
  const log = [{ weekStart: '2026-10-05', completedAt: '2026-10-09T17:00:00.000Z' }];
  const good = await Backup.exportBackupV3({ ...base, settings: { ...base.settings, weeklyReviews: log } }, storage, '2026-10-09T18:00:00.000Z');
  const inspected = await Backup.inspectBackupV3(good);
  assert.deepEqual(JSON.parse(JSON.stringify(inspected.state.settings.weeklyReviews)), log);
  await assert.rejects(Backup.exportBackupV3({ ...base, settings: { ...base.settings, weeklyReviews: 'x' } }, storage, '2026-10-09T18:00:00.000Z'), /weeklyReviews/);
  // A hand-edited ZIP with a malformed log is rejected on import.
  const zip = await JSZip.loadAsync(await good.arrayBuffer());
  const data = JSON.parse(await zip.file('data.json').async('string'));
  data.data.settings.weeklyReviews = [{ weekStart: 'x', completedAt: 'y' }];
  zip.file('data.json', JSON.stringify(data));
  await assert.rejects(Backup.inspectBackupV3(await zip.generateAsync({ type: 'blob' })), /weeklyReviews/);
});

function renderReview(stateOverrides = {}) {
  let adapter;
  runInNewContextWithI18n(read('js/review-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  const state = { ...fixture(), habitMetrics: { h1: { currentStreak: 4, completionRate: 80 } }, ...stateOverrides };
  const ctx = {
    state, Core: { ...Core, dateOnly: value => (value ? Core.dateOnly(value) : TODAY) }, esc: value => String(value),
    pageHeader: (title, subtitle) => `<header><h1>${title}</h1><p>${subtitle}</p></header>`,
    reviewTaskRow: (item, context, options) => `<div data-row="${item.id}" data-context="${context}" data-options="${Object.keys(options).join(',')}"></div>`,
    relativeDateLabel: value => `D:${value}`, formatDate: value => `F:${value}`, goalProgressLabel: () => '10%', habitMetrics: habit => state.habitMetrics[habit.id] || {},
    // R13: the goal rows are the Ciljevi rows.
    renderGoalListRow: goal => `<a data-route="goal/${goal.id}">${goal.title}</a>`,
  };
  return { adapter, html: adapter.renderRoute({ type: 'review' }, ctx), ignored: adapter.renderRoute({ type: 'today' }, ctx) };
}

test('the review page lists the six sections with existing row actions and links, and a finish button', () => {
  const { adapter, html, ignored } = renderReview();
  assert.equal(adapter.name, 'review');
  assert.equal(ignored, undefined, 'other routes are left to the app');
  assert.match(html, /<h1>Weekly review<\/h1><p>Week of F:2026-10-05<\/p>/);
  for (const heading of ['Empty the Inbox', 'Overdue and missed plans', 'Next 7 days', 'Goals', 'Habits', 'Areas']) assert.ok(html.includes(heading), heading);
  assert.match(html, /data-row="i1" data-context="inbox" data-options="inbox"/);
  assert.match(html, /data-row="o1" data-context="today" data-options="overdue"/);
  assert.match(html, /data-row="m1" data-context="today" data-options="overdue"/);
  // R13: the next days open the Calendar instead of Upcoming; goals are the Ciljevi rows.
  assert.match(html, /data-action="review-open-day"/);
  assert.match(html, /data-route="goal\/g1"[^>]*>Maraton/);
  assert.match(html, /data-route="habit\/h1"[^>]*>[\s\S]*?Šetnja[\s\S]*?4[\s\S]*?80%/);
  assert.match(html, /data-route="area\/a1"[^>]*>[\s\S]*?Zdravlje[\s\S]*?2 open tasks/);
  assert.doesNotMatch(html, /Gotovo|Stara|n4/);
  assert.match(html, /data-action="complete-weekly-review"/);
});

test('an empty week says so per section; a recorded week shows when it was done and recent reviews', () => {
  const empty = renderReview({ tasks: [], goals: [], habits: [], areas: [] }).html;
  // R13: empty first steps fold into "· done"; the others still say so.
  assert.equal((empty.match(/review-step is-done/g) || []).length, 2);
  for (const text of ['No active goals.', 'No active habits.', 'No Areas yet.']) assert.ok(empty.includes(text), text);
  const done = renderReview({ settings: { weekStartsOn: 1, weeklyReviews: [
    { weekStart: '2026-10-05', completedAt: '2026-10-09T17:00:00.000Z' }, { weekStart: '2026-09-28', completedAt: '2026-10-03T09:00:00.000Z' },
  ] } }).html;
  assert.match(done, /data-weekly-review-done/);
  assert.match(done, /This week's review was completed F:2026-10-09\./);
  assert.match(done, /F:2026-10-03/);
  assert.doesNotMatch(done, /data-action="complete-weekly-review"/);
});

test('the app routes, links, notices and records the weekly review', () => {
  const app = read('js/app.js');
  // R12b added 'journal' after 'settings' in the route list.
  assert.match(app, /'completed', 'review', 'settings'(, 'journal')?(, 'account')?\]\.includes\(hash\)/); // R15 added 'account'
  // Redesign R1: the Još screen replaced the More sheet's route list.
  assert.match(app, /moreRow\('review', 'ph-clipboard-text', tr\('Weekly review'\)\)/);
  assert.match(app, /reviewTaskRow\(task, context, options = \{\}\) \{\s*return taskRow\(task, context, options\);/);
  const html = read('index.html');
  assert.ok(html.indexOf('src="js/review-ui.js"') > html.indexOf('src="js/domain-modules.js"'));
  assert.ok(html.indexOf('src="js/review-ui.js"') < html.indexOf('src="js/app.js"'));
  assert.match(read('sw.js'), /'js\/review-ui\.js'/);

  const slice = (from, to) => app.slice(app.indexOf(from), app.indexOf(to));
  const context = { Core: { ...Core, dateOnly: value => (value ? Core.dateOnly(value) : TODAY) }, state: { settings: { weekStartsOn: 1 } } };
  vm.createContext(withI18n(context));
  // R14 (T6 amended 2026-10-10): the Today notice left; Core.weeklyReviewDue keeps the rule.
  assert.doesNotMatch(app, /weeklyReviewNotice/);
  assert.equal(Core.weeklyReviewDue({ weekStartsOn: 1 }, TODAY, 1), true);
  assert.equal(Core.weeklyReviewDue({ weekStartsOn: 1, weeklyReviews: [{ weekStart: '2026-10-05', completedAt: '2026-10-09T08:00:00.000Z' }] }, TODAY, 1), false);

  const saved = [];
  const recordContext = { Core: context.Core, state: { settings: { weekStartsOn: 1 } }, nowIso: () => '2026-10-09T17:00:00.000Z', saveState: () => saved.push(true), setToastMessage: message => { recordContext.toast = message; }, render() {} };
  vm.createContext(withI18n(recordContext));
  vm.runInContext(slice('  function completeWeeklyReview(', '  function backupReminderNotice('), recordContext);
  vm.runInContext('completeWeeklyReview()', recordContext);
  assert.deepEqual(JSON.parse(JSON.stringify(recordContext.state.settings.weeklyReviews)), [{ weekStart: '2026-10-05', completedAt: '2026-10-09T17:00:00.000Z' }]);
  assert.equal(saved.length, 1);
  assert.equal(recordContext.toast, 'Weekly review completed.');
  assert.match(app, /action === 'complete-weekly-review'\) completeWeeklyReview\(\)/);
});

test('V1.11 shipped as 1.11.0 or later so installed apps get the update notice', () => {
  const version = require('../js/release.js').APP_VERSION;
  const [major, minor] = version.split('.').map(Number);
  assert.ok(major > 1 || minor >= 11, version);
  assert.ok(read('sw.js').includes(`const VERSION = '${version}';`));
});
