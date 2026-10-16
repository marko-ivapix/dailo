// R83: Danas no longer piles up guilt. "Zakasnelo" (tasks whose deadline passed) gets "Sredi jedan po jedan", a pass
// over the past-due tasks (Danas, Sutra, Novi rok…, Bez roka, Završi, Obriši, Otvori), and "Sve na sutra", which moves
// all of them to tomorrow in one step with Undo (an exception to the AGENTS.md bulk rule, the user's choice). The backup
// reminder leaves Danas for the top of Još, and the Još tab shows an amber dot while a backup is due.
// Spec: docs/superpowers/specs/2026-10-15-r83-today-overdue.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const fn = name => functionSource(name).source;
const css = read('css/styles.css');
const beforeMarker = css.slice(0, css.indexOf('/* Keep primary compact actions touchable after all density rules. */'));
const TODAY = '2026-10-15', TOMORROW = '2026-10-16';
const task = (id, fields = {}) => ({ id, title: id, isCompleted: false, isInbox: false, plannedDate: null, dueDate: null, todayOrder: null, recurrence: null, updatedAt: 'old', ...fields });

function harness(tasks) {
  const calls = [];
  const ctx = withI18n({
    state: { tasks, projects: [] }, Core: { ...Core, dateOnly: () => TODAY }, JSON, Map, Set,
    listTasks: () => tasks, taskRecurrence: item => item.recurrence || null, getTask: id => tasks.find(item => item.id === id),
    copyTemplate: value => JSON.parse(JSON.stringify(value)), removeCloneGoalLinks() {}, nowIso: () => 'now',
    nextOrder: () => 7, saveState: () => { calls.push(['save']); return true; }, render: () => calls.push(['render']),
    setUndo: (message, undo) => { calls.push(['undo', message]); ctx.undo = undo; }, setToastMessage: text => calls.push(['toast', text]),
  });
  vm.createContext(ctx);
  // R103b: Undo snapshots and the Još count include the archived tasks (historyTasks); none are archived here.
  // R105: Poništi puts back only the moved tasks (restoreCopies), so a task added meanwhile stays.
  vm.runInContext(['historyTasks', 'snapshotTasks', 'restoreTasks', 'restoreCopies', 'overdueMoveChanges', 'moveAllOverdueToTomorrow'].map(fn).join('\n') + '\nlet archivedTasks = [];', ctx);
  return { ctx, calls };
}

test('a past-due task moves to a day with its deadline and its plan, out of Inbox', () => {
  const { ctx } = harness([]);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.overdueMoveChanges(task('a'), TODAY))), { dueDate: TODAY, plannedDate: TODAY, isInbox: false, todayOrder: 7 });
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.overdueMoveChanges(task('a'), TOMORROW))), { dueDate: TOMORROW, plannedDate: TOMORROW, isInbox: false, todayOrder: null });
});

test('"Sve na sutra" moves every past-due task to tomorrow in one step, with Undo; a repeat moves only this occurrence', () => {
  const tasks = [
    task('late', { dueDate: '2026-10-10', plannedDate: '2026-10-09', isInbox: true }),
    task('repeat', { dueDate: '2026-10-14', recurrence: { frequency: 'weekly', interval: 1 } }),
    task('fine', { dueDate: TOMORROW }),
    task('done', { dueDate: '2026-10-01', isCompleted: true }),
  ];
  const { ctx, calls } = harness(tasks);
  ctx.moveAllOverdueToTomorrow();
  assert.deepEqual(tasks.map(item => [item.id, item.dueDate, item.plannedDate]), [['late', TOMORROW, TOMORROW], ['repeat', TOMORROW, TOMORROW], ['fine', TOMORROW, null], ['done', '2026-10-01', null]]);
  assert.equal(tasks[0].isInbox, false);
  assert.equal(tasks[1].recurrenceBaseline.dueDate, '2026-10-14', 'the series keeps its own day, as "Samo ovo" would');
  assert.deepEqual(calls.map(call => call[0]), ['save', 'render', 'undo']);
  assert.equal(calls.at(-1)[1], 'Past-due tasks moved to tomorrow');
  ctx.undo();
  assert.deepEqual(ctx.state.tasks.map(item => [item.id, item.dueDate, item.plannedDate, item.isInbox]), [['late', '2026-10-10', '2026-10-09', true], ['repeat', '2026-10-14', null, false], ['fine', TOMORROW, null, false], ['done', '2026-10-01', null, false]]);
  assert.equal(ctx.state.tasks[1].recurrenceBaseline, undefined);
});

test('Danas: "Zakasnelo" offers the pass and "Sve na sutra"; the backup reminder is no longer on Danas', () => {
  const today = fn('renderToday');
  assert.match(today, /if \(sections\.overdue\.length\) overdueBody = `<div class="today-overdue-actions"><button class="btn btn-secondary" type="button" data-action="overdue-triage">\$\{tr\('Go through them'\)\}<\/button><button class="btn btn-ghost" type="button" data-action="overdue-all-tomorrow">\$\{tr\('All to tomorrow'\)\}<\/button><\/div>`;/);
  assert.doesNotMatch(today, /backupReminderNotice\(\)/);
  assert.ok(beforeMarker.includes('.today-overdue-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0 0 var(--space-2); }'));
});

test('the pass goes through the past-due tasks one at a time with every way out', () => {
  const open = fn('openOverdueTriage');
  assert.match(open, /modalState = \{ type: 'overdue-triage', queue: Core\.deriveTodaySections\(listTasks\(\), Core\.dateOnly\(\)\)\.overdue\.map\(item => item\.id\), index: 0 \};/);
  const render = fn('renderOverdueTriage');
  assert.match(render, /const open = \(modalState\.queue \|\| \[\]\)\.filter\(id => \{ const item = getTask\(id\); return Boolean\(item && Core\.isOverdue\(item, Core\.dateOnly\(\)\)\); \}\);/);
  for (const action of ['overdue-today', 'overdue-tomorrow', 'overdue-due', 'overdue-no-due', 'overdue-complete', 'overdue-delete', 'overdue-open']) assert.ok(render.includes(`button('${action}'`), action);
  assert.ok(render.includes('data-action="overdue-skip"'));
  assert.match(render, /tr\('Due was \{date\}', \{ date: formatDate\(item\.dueDate\) \}\)/);
  const app = read('js/app.js');
  assert.match(app, /else if \(action === 'overdue-today'\) \{ const item = getTask\(el\.dataset\.taskId\); if \(item\) requestTaskEdit\(item\.id, overdueMoveChanges\(item, Core\.dateOnly\(\)\)\); \}/);
  assert.match(app, /else if \(action === 'overdue-delete'\) requestDeleteEntity\('task', el\.dataset\.taskId, \{ returnTo: modalState \}\);/);
  assert.match(app, /else if \(action === 'overdue-all-tomorrow'\) moveAllOverdueToTomorrow\(\);/);
  // R84: the "Zatvori dan" pass gets the task window back too.
  assert.match(fn('openTaskDetail'), /const back = focus \|\| \(\['inbox-triage', 'overdue-triage', 'close-day'\]\.includes\(modalState\?\.type\) \? modalState : null\);/);
  assert.match(fn('requestDeleteEntity'), /function requestDeleteEntity\(type, identity, \{ returnTo = null \} = \{\}\)/);
  assert.match(fn('requestDeleteEntity'), /\.\.\.\(returnTo \? \{ returnTo \} : \{\}\),/);
});

test('the backup reminder sits at the top of Još, and the Još tab shows an amber dot while it is due', () => {
  assert.match(fn('renderMoreScreen'), /let html = pageHeader\(tr\('More'\), '', \{ add: false \}\);\n\s+html \+= backupReminderNotice\(\);/);
  assert.match(fn('backupReminderNotice'), /if \(!backupReminderDue\(\)\) return '';/);
  const nav = fn('renderMobileBottomNav');
  assert.match(nav, /const failed = syncStatus\(\)\.state === 'error', backup = !failed && backupReminderDue\(\);/);
  assert.match(nav, /syncAlert\.hidden = !failed && !backup;\n\s+syncAlert\.classList\.toggle\('is-backup', backup\);\n\s+syncAlert\.setAttribute\('aria-label', failed \? tr\('Sync failed'\) : tr\('Time for a backup'\)\);/);
  assert.ok(beforeMarker.includes('.mobile-bottom-nav-alert.is-backup { background: var(--warning); }'));
  assert.match(fn('backupReminderNotice'), /syncView\(\)\.signedIn \? tr\('Your account keeps a copy on the server; a ZIP is a copy only you keep\.'\) : tr\('Dailo keeps everything only on this device\.'\)/);
});

test('AGENTS.md records the exception to the bulk rule', () => {
  assert.match(read('AGENTS.md'), /- No bulk-selection\/bulk-action UI\. Exception \(the user's choice, 2026-10-15\): "Sve na sutra" for past-due tasks on Danas \(R83\) and the evening "Zatvori dan" \(R84\)/);
});

test('the new lines are Serbian', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['Go through them', 'Sredi jedan po jedan'], ['All to tomorrow', 'Sve na sutra'], ['Due was {date}', 'Rok je bio {date}'],
    ['New deadline…', 'Novi rok…'], ['No deadline', 'Bez roka'], ['Past-due tasks moved to tomorrow', 'Zakasneli zadaci su pomereni na sutra'],
    ['Nothing is past due.', 'Ništa nije zakasnelo.'], ['Time for a backup', 'Vreme je za rezervnu kopiju'],
    ['Your account keeps a copy on the server; a ZIP is a copy only you keep.', 'Nalog čuva kopiju na serveru, a ZIP je kopija koju čuvaš samo ti.'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
});

test('R83 shipped as 2.0.0-alpha.110 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 110) >= 110);
});
