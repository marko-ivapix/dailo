// R87: Zadaci. The two dates get plain names, "Kad radim" (the day you plan to work on it) and "Rok" (the deadline).
// The task window shows the title, the project link, Kad radim and Rok, plus whatever the task already has; every
// empty field waits under "Više opcija", which stays open after a change made from inside it. Every gesture has a
// button: the task's ⋯ menu offers "Pomeri gore" and "Pomeri dole" (the hold-and-drag order, also from the task
// window on a phone, where rows have no ⋯), and a subtask being renamed gets ↑ and ↓.
// Spec: docs/superpowers/specs/2026-10-15-r87-task-window.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const fn = name => functionSource(name).source;
const app = read('js/app.js');
const sr = read('js/i18n-sr.js');
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function windowHtml(task, modal = {}) {
  let module;
  runInNewContextWithI18n(read('js/tasks-ui.js'), { window: { TodoDomainModules: { register(value) { module = value; } } } });
  return module.renderRoute({ type: 'modal', modalType: 'task' }, {
    modalState: { type: 'task', taskId: task.id, titleDraft: task.title, notesDraft: task.notes || '', ...modal },
    getTask: () => task, getProject: id => (id === 'p' ? { id: 'p', name: 'Posao', areaId: 'a' } : null), getArea: id => (id === 'a' ? { id: 'a', name: 'Kuća', status: 'active' } : null),
    state: { goals: [], areas: [], settings: { focusTaskIds: [] } },
    Core, esc, relativeDateLabel: date => `R(${date})`, tagSummary: ids => (ids?.length ? `TAGS(${ids.join(',')})` : ''), priorityLabel: value => ({ high: 'High' }[value] || 'None'),
    formatReminder: value => `REM(${value})`, recurrenceLabel: rule => `RULE(${rule.frequency})`, durationLabel: minutes => `${minutes} min`, plannedMonthLabel: month => `M(${month})`,
    renderAttachmentsSection: () => '<attachments>', clampOrder: value => value || 0, modalFrame: content => content,
  });
}
const rowsIn = html => [...html.matchAll(/data-action="(task-[a-z]+-picker)" data-task-id="t1"><i class="ph ph-[a-z-]+" aria-hidden="true"><\/i><span class="task-window-row-label">([^<]+)<\/span>/g)].map(match => [match[1], match[2]]);
const split = html => { const at = html.indexOf('<details class="task-window-more"'); return at < 0 ? [html, ''] : [html.slice(0, at), html.slice(at, html.indexOf('</details>', at))]; };

test('the two dates are "Kad radim" and "Rok" in the window, the date sheet, the reminder sheet, Fokus, saved views and templates', () => {
  assert.match(read('js/tasks-ui.js'), /row\('task-plan-picker', 'ph-calendar-check', tr\('When I do it'\), when\(task\.plannedDate, task\.plannedTime\)\)/);
  assert.match(fn('dateSheetHtml'), /<div class="popover-title">\$\{kind === 'plan' \? tr\('When I do it'\) : tr\('Due date'\)\}<\/div>/);
  assert.match(fn('dateSheetHtml'), /tr\('“When I do it” stays: \{date\}', \{ date: other \}\) : tr\('“When I do it” is not set\.'\)/);
  assert.match(app, /<span class="sheet-option-label">\$\{tr\('When I do it'\)\}<\/span><span class="sheet-option-value">\$\{esc\(when\(task\?\.plannedDate, task\?\.plannedTime\)\)\}<\/span>/);
  assert.match(fn('renderFocusModal'), /task\.plannedDate \? tr\('When I do it: \{date\}', \{ date: relativeDateLabel\(task\.plannedDate, today\) \}\) : ''/);
  const views = read('js/saved-views-ui.js');
  assert.match(views, /plannedDate: msg\('When I do it'\), dueDate: msg\('Due'\)/);
  assert.match(views, /plannedDate: msg\('When I do it \(exact day\)'\)/);
  assert.match(read('js/templates-ui.js'), /field\('plannedOffsetDays', tr\('When I do it: days after the day it is made \(blank = no date\)'\), 'number'\) \+ field\('plannedTime', tr\('Time to do it'\), 'time'\)/);
  for (const gone of ['"Planned"', '"Planned {date}"', '"The planned date stays: {date}"', '"No planned date is set."', '"Planned date (exact day)"', '"Planned time"', '"Area, goals"']) assert.ok(!sr.includes(`${gone}:`), `${gone} is no longer used`);
});

test('a new task shows the title, the project link, Kad radim and Rok; the rest waits under "Više opcija"', () => {
  const html = windowHtml({ id: 't1', title: 'Idea', priority: 'none', tagIds: [], subtasks: [], goalIds: [], attachmentIds: [], isInbox: true });
  const [main, more] = split(html);
  assert.deepEqual(rowsIn(main), [['task-plan-picker', 'When I do it'], ['task-due-picker', 'Due date']]);
  assert.match(main, /data-action="task-project-picker"/);
  assert.doesNotMatch(main, /detail-subtask|detail-notes|<attachments>|task-window-group/, 'subtasks, notes and files wait below');
  assert.match(more, /^<details class="task-window-more"><summary data-action="task-window-more"><span>More options<\/span><span class="task-window-more-meta">Reminder, repeat, subtasks…<\/span>/);
  assert.deepEqual(rowsIn(more).map(row => row[0]), ['task-month-picker', 'task-reminder-picker', 'task-repeat-picker', 'task-duration-picker', 'task-tags-picker', 'task-priority-picker', 'task-area-picker', 'task-goals-picker']);
  assert.match(more, /<h3 class="task-window-group">Subtasks<\/h3>[\s\S]*id="detail-subtask"/);
  assert.match(more, /<label class="task-window-group" for="detail-notes">Notes<\/label><textarea id="detail-notes"/);
  assert.match(more, /<attachments>/);
  assert.match(html, /<div class="task-window-footer">/, 'the completion button stays at the bottom');
});

test('what a task has is in view; the fold keeps only the empty fields and stays open after a change from inside it', () => {
  const task = { id: 't1', title: 'Report', projectId: 'p', plannedDate: '2026-10-15', dueDate: '2026-10-20', reminderAt: '2026-10-15T08:00:00.000Z', recurrence: { frequency: 'weekly', interval: 1 }, priority: 'high', tagIds: ['x'], subtasks: [{ id: 's1', title: 'A', isCompleted: true }], notes: 'Text', goalIds: [], attachmentIds: ['f1'], isInbox: false };
  const [main, more] = split(windowHtml(task));
  assert.deepEqual(rowsIn(main).map(row => row[0]), ['task-plan-picker', 'task-due-picker', 'task-reminder-picker', 'task-repeat-picker', 'task-tags-picker', 'task-priority-picker']);
  assert.match(main, /<h3 class="task-window-group">Subtasks · 1\/1<\/h3>/);
  assert.match(main, /<textarea id="detail-notes" class="detail-notes"/);
  assert.match(main, /<attachments>/);
  assert.deepEqual(rowsIn(more).map(row => row[0]), ['task-month-picker', 'task-duration-picker', 'task-goals-picker']);
  assert.match(more, /<span class="task-window-more-meta">Duration, approximate month, goals<\/span>/);
  assert.match(more, /<div class="task-window-row is-static"><i class="ph ph-squares-four" aria-hidden="true"><\/i><span class="task-window-row-label">Area<\/span><span class="task-window-row-value is-set">Kuća<\/span>/, 'a project task\'s area is shown in the fold');
  assert.match(windowHtml(task, { moreOpen: true }), /<details class="task-window-more" open><summary data-action="task-window-more">/);
  const everything = { ...task, projectId: null, areaId: 'a', plannedMonth: '2026-11', durationMinutes: 30, goalIds: ['g'] };
  assert.doesNotMatch(windowHtml(everything), /task-window-more/, 'nothing left to fold');
  assert.match(read('js/tasks-ui.js'), /if \(action === 'task-window-more'\) \{ const details = event\?\.target\?\.closest\?\.\('details'\); if \(details && ctx\.modalState\) ctx\.modalState\.moreOpen = !details\.open; return true; \}/);
});

test('reordering has buttons: the task ⋯ menu moves a task up or down within its own list, also from the task window', () => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${fn('reorderNeighbours')}; this.reorderNeighbours = reorderNeighbours;`, ctx);
  const rows = [{ id: 'a', context: 'today', group: null }, { id: 'b', context: 'today', group: null }, { id: 'c', context: 'today', group: null }, { id: 'x', context: 'inbox', group: 'g1' }, { id: 'y', context: 'inbox', group: 'g2' }];
  const near = id => JSON.parse(JSON.stringify(ctx.reorderNeighbours(rows, id)));
  assert.deepEqual(near('a'), { context: 'today', up: null, down: 'b' });
  assert.deepEqual(near('b'), { context: 'today', up: 'a', down: 'c' });
  assert.deepEqual(near('c'), { context: 'today', up: 'b', down: null });
  assert.deepEqual(near('x'), { context: 'inbox', up: null, down: null }, 'an Inbox row stays within its capture group, as with a drag');
  assert.equal(ctx.reorderNeighbours(rows, 'missing'), null);
  const menu = fn('openTaskMenu');
  assert.match(menu, /const near = open \? reorderNeighbours\(\[\.\.\.document\.querySelectorAll\('#main \.task-row\[draggable="true"\]'\)\]\.map\(row => \(\{ id: row\.dataset\.taskId, context: row\.dataset\.listContext, group: dropGroup\(row\) \}\)\), taskId\) : null;/);
  assert.match(menu, /const move = \(action, icon, label, target\) => `<button class="popover-option" type="button" data-pop-action="\$\{action\}" data-task-id="\$\{esc\(taskId\)\}" data-target-id="\$\{esc\(target\)\}" data-list-context="\$\{esc\(near\.context\)\}"><i class="ph \$\{icon\}"><\/i>\$\{label\}<\/button>`;/);
  assert.match(menu, /near\?\.up \? move\('task-move-up', 'ph-arrow-up', tr\('Move up'\), near\.up\) : ''/);
  assert.match(menu, /near\?\.down \? move\('task-move-down', 'ph-arrow-down', tr\('Move down'\), near\.down\) : ''/);
  assert.match(app, /else if \(\['task-move-up', 'task-move-down'\]\.includes\(action\)\) \{ closePopover\(\); reorderTasks\(button\.dataset\.listContext, button\.dataset\.taskId, button\.dataset\.targetId\); setToastMessage\(action === 'task-move-up' \? tr\('Moved up'\) : tr\('Moved down'\)\); \}/);
});

test('a subtask being renamed gets ↑ and ↓, which keep it in edit mode', () => {
  const edit = fn('editSubtask');
  assert.match(edit, /const ordered = \[\.\.\.task\.subtasks\]\.sort\(\(a, b\) => clampOrder\(a\.order\) - clampOrder\(b\.order\)\);/);
  assert.match(edit, /const arrow = \(step, icon, label\) => \{/);
  assert.match(edit, /for \(const type of \['pointerdown', 'mousedown'\]\) button\.addEventListener\(type, event => event\.preventDefault\(\)\);/, 'the title field keeps the focus');
  assert.match(edit, /reorderSubtasks\(taskId, subtaskId, neighbour\.id\);\n\s+editSubtask\(taskId, subtaskId\);/);
  assert.match(edit, /input\.after\(\.\.\.\[index > 0 \? arrow\(-1, 'ph-arrow-up', tr\('Move up'\)\) : null, index < ordered\.length - 1 \? arrow\(1, 'ph-arrow-down', tr\('Move down'\)\) : null\]\.filter\(Boolean\)\);/);
  assert.match(edit, /else if \(e\.altKey && \['ArrowUp', 'ArrowDown'\]\.includes\(e\.key\)\) \{ e\.preventDefault\(\); move\(e\.key === 'ArrowUp' \? -1 : 1\); \}/, 'Alt+↑ and Alt+↓ on a keyboard');
  assert.match(edit, /if \(changed && taskRecurrence\(task\)\) \{ finish\(true\); return; \}/, 'a renamed repeating task asks about its series first');
  assert.ok(read('css/styles.css').includes('.subtask-row > .subtask-title-input { flex: 1; min-width: 0; }'));
});

test('the guide and the FAQ name both dates and the buttons for the gestures', () => {
  const guide = read('uputstvo.html');
  assert.ok(guide.includes('Zadatak ima dva datuma: <strong>Kad radim</strong> je dan kad planiraš da ga uradiš (tada je na Danas), a <strong>Rok</strong> je dan do kog mora biti gotov.'));
  assert.ok(guide.includes('<li>Kad radim: <code>danas</code>'));
  const buttons = 'Sve ovo ima i dugme: krug na kraju reda završava zadatak, datum biraš u prozoru zadatka, a redosled menjaš u meniju <strong>⋯</strong> prozora zadatka (Pomeri gore, Pomeri dole).';
  assert.ok(guide.includes(buttons), 'guide');
  assert.ok(read('pitanja.html').includes(buttons), 'FAQ');
});

test('the new lines are Serbian', () => {
  for (const [en, value] of [
    ['When I do it', 'Kad radim'], ['When I do it: {date}', 'Kad radim: {date}'], ['“When I do it” stays: {date}', '„Kad radim“ ostaje isto: {date}'],
    ['“When I do it” is not set.', '„Kad radim“ nije postavljeno.'], ['When I do it (exact day)', 'Kad radim (tačan dan)'],
    ['When I do it: days after the day it is made (blank = no date)', 'Kad radim: dana posle pravljenja (prazno = bez datuma)'], ['Time to do it', 'Vreme kad radim'],
    ['Move up', 'Pomeri gore'], ['Move down', 'Pomeri dole'], ['Moved up', 'Pomereno gore'], ['Moved down', 'Pomereno dole'], ['Subtask title', 'Naziv podzadatka'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
});

test('R87 shipped as 2.0.0-alpha.114 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 114) >= 114);
});
