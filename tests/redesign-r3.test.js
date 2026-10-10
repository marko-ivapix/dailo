// Redesign R3: the task window and the picker sheets (D1–D4, E1–E6, E8, E9).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r3-task-window.md
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
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const TODAY = Core.dateOnly();
const day = offset => Core.addDays(TODAY, offset);
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function tasksModule() {
  let module;
  runInNewContextWithI18n(read('js/tasks-ui.js'), { window: { TodoDomainModules: { register(value) { module = value; } } } });
  return module;
}

function windowHtml(task, extra = {}) {
  return tasksModule().renderRoute({ type: 'modal', modalType: 'task' }, {
    modalState: { type: 'task', taskId: task.id, titleDraft: task.title, notesDraft: task.notes || '' },
    getTask: () => task, getProject: id => (id === 'p' ? { id: 'p', name: 'Posao', color: '#123456', areaId: 'a' } : null), getArea: id => (id === 'a' ? { id: 'a', name: 'Kuća', status: 'active' } : null),
    state: { goals: [{ id: 'g', title: 'Cilj', status: 'active' }], areas: [{ id: 'a', name: 'Kuća', status: 'active' }], settings: { focusTaskIds: [] } },
    Core, esc, relativeDateLabel: date => `R(${date})`, tagSummary: ids => (ids?.length ? `TAGS(${ids.join(',')})` : ''), priorityLabel: value => ({ high: 'High', medium: 'Medium', low: 'Low' }[value] || 'None'),
    formatReminder: value => `REM(${value})`, recurrenceLabel: rule => `RULE(${rule.frequency})`, durationLabel: minutes => `${minutes} min`,
    renderAttachmentsSection: () => '<attachments>', clampOrder: value => value || 0, modalFrame: (content, cls, attrs) => `<frame ${cls} ${attrs}>${content}</frame>`,
    ...extra,
  });
}

test('D1–D4, E1: the task window has the title, the project link, Planiranje and Organizacija rows and one completion button', () => {
  const task = { id: 't1', title: 'Report', projectId: 'p', plannedDate: TODAY, plannedTime: '09:30', dueDate: day(-1), reminderAt: '2026-10-10T08:00:00.000Z', recurrence: { frequency: 'weekly', interval: 1 }, durationMinutes: 45, priority: 'high', tagIds: ['x'], subtasks: [{ id: 's1', title: 'A', isCompleted: true }, { id: 's2', title: 'B', isCompleted: false }], goalIds: [], isInbox: false };
  const html = windowHtml(task);
  assert.match(html, /<span id="task-modal-title" class="task-window-kind">Task<\/span>/);
  assert.match(html, /<button class="btn-icon" type="button" data-action="task-menu" data-task-id="t1" aria-label="Task actions">/);
  assert.match(html, /<input id="detail-title" class="modal-task-title task-window-title" type="text" maxlength="500" value="Report"/);
  assert.match(html, /<button class="task-window-project" type="button" data-action="task-project-picker" data-task-id="t1"><i class="ph ph-folder-simple" aria-hidden="true"><\/i>Posao<\/button>/);
  const rows = [...html.matchAll(/<button class="task-window-row" type="button" data-action="([a-z-]+)" data-task-id="t1"><i class="ph (ph-[a-z-]+)" aria-hidden="true"><\/i><span class="task-window-row-label">([^<]+)<\/span><span class="task-window-row-value([^"]*)">(.*?)<\/span><i class="ph ph-caret-right task-window-row-caret" aria-hidden="true"><\/i><\/button>/g)];
  assert.deepEqual(rows.map(row => row[1]), ['task-plan-picker', 'task-due-picker', 'task-reminder-picker', 'task-repeat-picker', 'task-duration-picker', 'task-project-picker', 'task-tags-picker', 'task-priority-picker']);
  assert.deepEqual(rows.map(row => row[3]), ['Planned', 'Due date', 'Reminder', 'Repeat', 'Duration', 'Project', 'Tags', 'Priority']);
  assert.notEqual(rows[0][2], rows[1][2], 'D3: Rok has its own icon');
  assert.equal(rows[0][5], `R(${TODAY}) · 09:30`);
  assert.equal(rows[1][4], ' is-set is-overdue', 'G6 colors on the due value');
  assert.equal(rows[2][5], 'REM(2026-10-10T08:00:00.000Z)');
  assert.equal(rows[3][5], 'RULE(weekly)');
  assert.equal(rows[4][5], '45 min');
  assert.equal(rows[6][5], 'TAGS(x)');
  assert.match(rows[7][5], /^<i class="ph ph-flag task-flag task-flag--high" aria-hidden="true"><\/i>High$/);
  assert.ok(html.indexOf('>Planning<') < html.indexOf('task-plan-picker" data-task-id="t1"><i'), 'Planiranje heads its rows');
  assert.ok(html.indexOf('>Organization<') < html.indexOf('data-action="task-tags-picker"'));
  assert.match(html, /<h3 class="task-window-group">Subtasks · 1\/2<\/h3>/);
  assert.match(html, /<label class="task-window-group" for="detail-notes">Notes<\/label><textarea id="detail-notes"/);
  assert.match(html, /<attachments>/);
  assert.match(html, /<details class="task-window-more"><summary><span>More options<\/span><span class="task-window-more-meta">Area, goals, importance<\/span>/);
  assert.match(html, /data-task-goal="t1" value="g"/);
  assert.match(html, /data-task-flag="isImportant"/);
  assert.match(html, /data-task-flag="isUrgent"/);
  assert.match(html, /<div class="task-window-footer"><button class="btn btn-primary task-complete-button" type="button" data-action="toggle-complete" data-task-id="t1">Complete task<\/button><\/div>/);
  assert.equal((html.match(/data-action="toggle-complete"/g) || []).length, 1, 'one completion control');
  for (const gone of ['data-task-time=', 'data-task-duration', 'toggle-focus-task', 'data-action="delete-task"', 'task-quick-properties', 'task-properties-disclosure']) assert.ok(!html.includes(gone), gone);
});

test('the window shows "Nije podešeno", the Inbox label, the area for a task without a project and "Vrati kao otvoren"', () => {
  const html = windowHtml({ id: 't2', title: 'Idea', isInbox: true, isCompleted: true, priority: 'none', tagIds: [], subtasks: [], goalIds: [], areaId: 'a' });
  assert.match(html, /<span id="task-modal-title" class="task-window-kind">Task in Inbox<\/span>/);
  assert.match(html, /data-action="task-project-picker" data-task-id="t2"><i class="ph ph-folder-simple" aria-hidden="true"><\/i>No project<\/button>/);
  assert.equal((html.match(/<span class="task-window-row-value">Not set<\/span>/g) || []).length, 8);
  assert.match(html, /<select id="detail-area" class="input task-property-select" data-task-area="t2">/);
  assert.match(html, /<button class="btn btn-secondary task-complete-button" type="button" data-action="toggle-complete" data-task-id="t2">Reopen task<\/button>/);
  for (const [key, value] of [['Reopen task', 'Vrati kao otvoren'], ['Task in Inbox', 'Zadatak · u Inbox-u'], ['More options', 'Više opcija'], ['Area, goals, importance', 'Oblast, ciljevi, važnost']]) assert.match(sr, new RegExp(`"${key}": "${value}"`), key);
});

function sheetContext(extra = {}) {
  const calls = [];
  const ctx = {
    calls, Core, esc, I18n: require('../js/i18n.js'), Intl,
    state: { settings: { weekStartsOn: 'monday' }, tags: [], projects: [], areas: [], tasks: [] },
    modalState: null, popoverEl: null,
    getTask: id => ctx.state.tasks.find(task => task.id === id), getTag: id => ctx.state.tags.find(tag => tag.id === id),
    getArea: id => ctx.state.areas.find(area => area.id === id),
    sortedAreas: () => ctx.state.areas, sortedProjects: () => ctx.state.projects,
    relativeDateLabel: date => `R(${date})`, formatDate: (date, mode) => `F(${date}${mode ? `,${mode}` : ''})`,
    parseLocalDate: value => new Date(`${value}T12:00:00`), durationLabel: minutes => `${minutes} min`,
    priorityLabel: value => ({ high: 'High', medium: 'Medium', low: 'Low' }[value] || 'None'),
    fromLocalDateTimeValue: value => new Date(value).toISOString(),
    openPopover: (anchor, html, meta) => calls.push(['open', html, meta]),
    refreshSheet: (html, focus) => calls.push(['refresh', html, focus]),
    closePopover: () => calls.push(['close']),
    requestTaskEdit: (id, changes) => calls.push(['edit', id, changes]),
    renderModal: () => calls.push(['renderModal']),
    $: () => null,
    ...extra,
  };
  vm.createContext(withI18n(ctx));
  vm.runInContext(`let dateSheet = null, reminderSheet = null, tagSheet = null;\n${['nextMonday', 'monthGrid', 'openDateSheet', 'dateSheetHtml', 'applyDateSheet', 'openPriorityPicker', 'openReminderPicker', 'reminderSheetHtml', 'applyReminderSheet', 'setReminder', 'openProjectPicker', 'openTagPicker', 'tagSheetHtml', 'toggleTagSheet', 'applyTagSheet', 'openTaskDurationPicker', 'setTaskDuration'].map(fn).join('')}`, ctx);
  return ctx;
}

test('E4: the month grid starts on the week start, marks today and the selected day', () => {
  const ctx = sheetContext();
  const grid = ctx.monthGrid('2026-10-14', { y: 2026, m: 9 }, '2026-10-10');
  assert.equal((grid.match(/class="sheet-calendar-day/g) || []).length, 31);
  assert.equal((grid.match(/<span class="sheet-calendar-weekday">/g) || []).length, 7);
  assert.match(grid, /<span class="sheet-calendar-weekday">Mon<\/span>/);
  assert.equal((grid.split('<span class="sheet-calendar-weekday">').at(-1).match(/<span><\/span>/g) || []).length, 3, '1 October 2026 is a Thursday');
  assert.match(grid, /<button class="sheet-calendar-day is-selected" type="button" data-pop-action="date-sheet-pick" data-date="2026-10-14" aria-pressed="true"/);
  assert.match(grid, /<button class="sheet-calendar-day is-today" type="button" data-pop-action="date-sheet-pick" data-date="2026-10-10" aria-pressed="false"/);
  assert.match(grid, /data-pop-action="date-sheet-month" data-step="-1" aria-label="Previous month"/);
  ctx.state.settings.weekStartsOn = 'sunday';
  const sunday = ctx.monthGrid(null, { y: 2026, m: 9 }, '2026-10-10');
  assert.match(sunday, /<div class="sheet-calendar-grid"><span class="sheet-calendar-weekday">Sun<\/span>/);
  assert.equal((sunday.split('<span class="sheet-calendar-weekday">').at(-1).match(/<span><\/span>/g) || []).length, 4);
});

test('E4: the date sheet offers Danas, Sutra and next week, a time and the other date; Primeni saves date and time', () => {
  const task = { id: 't1', title: 'Report', plannedDate: null, dueDate: day(3), dueTime: '17:00', isInbox: true };
  const ctx = sheetContext();
  ctx.state.tasks = [task];
  ctx.openDateSheet({}, { type: 'task', taskId: 't1' }, 'plan');
  const [, html, meta] = ctx.calls.at(-1);
  assert.equal(meta.type, 'date-sheet');
  assert.match(html, /^<div class="popover-title">Planned<\/div><p class="sheet-subtitle">Report<\/p><div class="sheet-chips">/);
  assert.match(html, new RegExp(`data-pop-action="date-sheet-pick" data-date="${TODAY}" aria-pressed="false">Today<`));
  assert.match(html, new RegExp(`data-date="${day(1)}" aria-pressed="false">Tomorrow<`));
  assert.match(html, new RegExp(`data-date="${ctx.nextMonday(TODAY)}" aria-pressed="false">Start of next week<`));
  assert.equal(new Date(`${ctx.nextMonday(TODAY)}T12:00:00`).getDay(), 1);
  assert.ok(ctx.nextMonday(TODAY) > TODAY);
  assert.match(html, /<input id="date-sheet-time" class="input" type="time" value="">/);
  assert.match(html, new RegExp(`<p class="sheet-note">The due date stays: R\\(${day(3)}\\) · 17:00</p>`));
  assert.match(html, /<button class="btn btn-ghost" type="button" data-pop-action="date-sheet-clear">Remove date<\/button><button class="btn btn-primary" type="button" data-pop-action="date-sheet-apply">Apply<\/button>/);
  vm.runInContext(`dateSheet.date = '${day(1)}';`, ctx);
  ctx.$ = () => ({ value: '08:15' });
  ctx.applyDateSheet(false);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.slice(-2))), [['close'], ['edit', 't1', { plannedDate: day(1), plannedTime: '08:15', isInbox: false }]]);
  ctx.openDateSheet({}, { type: 'task', taskId: 't1' }, 'due');
  assert.match(ctx.calls.at(-1)[1], /<div class="popover-title">Due date<\/div>/);
  assert.match(ctx.calls.at(-1)[1], /<p class="sheet-note">No planned date is set\.<\/p>/);
  ctx.applyDateSheet(true);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.at(-1))), ['edit', 't1', { dueDate: null, dueTime: null }]);
  for (const [key, value] of [['Remove date', 'Ukloni datum'], ['Start of next week', 'Sledeće nedelje'], ['The due date stays: {date}', 'Rok ostaje isti: {date}'], ['No planned date is set.', 'Planirani datum nije postavljen.']]) assert.match(sr, new RegExp(`"${key.replace(/[.{}]/g, '\\$&')}": "${value.replace(/[.{}]/g, '\\$&')}"`), key);
});

test('E4: in Quick Add the date sheet fills the draft and marks the plan as explicit', () => {
  const ctx = sheetContext({ modalState: { type: 'quick', draft: { title: 'New', plannedDate: TODAY, parsedPlanDate: TODAY, explicitPlan: false } } });
  ctx.openDateSheet({}, { type: 'quick' }, 'plan');
  vm.runInContext(`dateSheet.date = '${day(2)}';`, ctx);
  ctx.$ = () => ({ value: '' });
  ctx.applyDateSheet(false);
  const draft = ctx.modalState.draft;
  assert.equal(draft.plannedDate, day(2));
  assert.equal(draft.plannedTime, null);
  assert.equal(draft.explicitPlan, true);
  assert.equal(draft.parsedPlanDate, null);
  assert.equal(draft.explicitPlannedTime, false);
  assert.deepEqual(ctx.calls.slice(-2), [['close'], ['renderModal']]);
});

test('E5: priority is Bez, Nizak, Srednji, Visok with flags and the note; a tap applies', () => {
  const ctx = sheetContext();
  ctx.state.tasks = [{ id: 't1', title: 'Report', priority: 'medium' }];
  ctx.openPriorityPicker({}, { type: 'task', taskId: 't1' });
  const html = ctx.calls.at(-1)[1];
  const options = [...html.matchAll(/data-pop-action="set-priority" data-priority="(\w+)"[^>]*><i class="ph ph-flag task-flag task-flag--\1" aria-hidden="true"><\/i><span class="sheet-option-label">([^<]+)<\/span>/g)].map(match => [match[1], match[2]]);
  assert.deepEqual(options, [['none', 'No priority'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]);
  assert.match(html, /class="popover-option sheet-option is-selected" type="button" data-pop-action="set-priority" data-priority="medium"/);
  assert.match(html, /<p class="sheet-note">Priority does not change the order\.<\/p>/);
  assert.match(sr, /"No priority": "Bez"/);
  assert.match(sr, /"Priority does not change the order\.": "Prioritet ne menja redosled\."/);
});

test('E6: reminder presets follow the planned time; the sheet has date, time, a sentence and the task dates', () => {
  const ctx = sheetContext();
  ctx.state.tasks = [{ id: 't1', title: 'Report', plannedDate: '2026-10-20', plannedTime: '10:30', dueDate: '2026-10-22', reminderAt: null }];
  ctx.openReminderPicker({}, { type: 'task', taskId: 't1' });
  const html = ctx.calls.at(-1)[1];
  const presets = [...html.matchAll(/data-pop-action="reminder-preset" data-date="([\d-]+)" data-time="([\d:]+)"[^>]*>([^<]+)</g)].map(match => match.slice(1));
  assert.deepEqual(presets, [['2026-10-20', '10:30', 'At the planned time'], ['2026-10-20', '10:15', '15 min before'], ['2026-10-20', '09:30', '1 h before'], ['2026-10-19', '09:00', 'Day before at 9:00']]);
  assert.match(html, /<input id="reminder-date" class="input" type="date" value="2026-10-20">/);
  assert.match(html, /<input id="reminder-time" class="input" type="time" value="10:30">/);
  assert.match(html, /<p class="sheet-summary" data-reminder-summary>Remind me R\(2026-10-20\) at 10:30<\/p>/);
  assert.match(html, /<span class="sheet-option-label">Planned<\/span><span class="sheet-option-value">R\(2026-10-20\) · 10:30<\/span>/);
  assert.match(html, /<span class="sheet-option-label">Due date<\/span><span class="sheet-option-value">R\(2026-10-22\)<\/span>/);
  assert.doesNotMatch(html, /reminder-clear/, 'nothing to remove yet');
  ctx.$ = selector => ({ value: selector === '#reminder-date' ? '2026-10-20' : '10:15' });
  ctx.applyReminderSheet();
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.slice(-2))), [['close'], ['edit', 't1', { reminderAt: new Date('2026-10-20T10:15').toISOString(), reminderFiredAt: null }]]);
  ctx.state.tasks[0] = { id: 't1', title: 'Loose', reminderAt: '2026-10-20T08:00:00.000Z' };
  ctx.openReminderPicker({}, { type: 'task', taskId: 't1' });
  const loose = ctx.calls.at(-1)[1];
  assert.match(loose, /<p class="sheet-note">Quick choices for the planned time appear when the task has one\.<\/p>/);
  assert.match(loose, /data-pop-action="reminder-preset"[^>]*>Tomorrow morning</);
  assert.match(loose, /data-pop-action="reminder-clear">Clear reminder</);
  assert.match(fn('openReminderPicker'), /Core\.laterToday\(new Date\(\)\)/, 'H-2 still applies');
  assert.match(sr, /"Remind me \{date\} at \{time\}": "Podseti me \{date\} u \{time\}"/);
});

test('E8: the project sheet searches, groups by area and applies on tap', () => {
  const ctx = sheetContext();
  ctx.state.areas = [{ id: 'a', name: 'Kuća', status: 'active' }];
  ctx.state.projects = [{ id: 'p1', name: 'Selidba', color: '#111111', areaId: 'a' }, { id: 'p2', name: 'Ostalo', color: '#222222', areaId: null }];
  ctx.state.tasks = [{ id: 't1', title: 'Report', projectId: 'p2' }];
  ctx.openProjectPicker({}, { type: 'task', taskId: 't1' });
  const html = ctx.calls.at(-1)[1];
  assert.match(html, /<label class="sheet-search"><i class="ph ph-magnifying-glass" aria-hidden="true"><\/i><input class="input" type="search" data-sheet-search placeholder="Search projects" aria-label="Search projects"><\/label>/);
  assert.match(html, /data-pop-action="set-project" data-project-id="" data-target-type="task" data-task-id="t1"><span class="sheet-option-label">No project<\/span><span class="sheet-radio" aria-hidden="true"><\/span>/);
  assert.match(html, /data-sheet-item data-search="selidba" data-pop-action="set-project" data-project-id="p1"[^>]*><span class="project-dot" style="--project-color:#111111"><\/span><span class="sheet-option-label">Selidba<small>Area: Kuća<\/small><\/span>/);
  assert.match(html, /class="popover-option sheet-option is-selected" type="button" data-sheet-item data-search="ostalo"/);
  assert.ok(html.indexOf('Selidba') < html.indexOf('Ostalo'), 'projects of areas first');
  assert.match(html, /data-pop-action="inline-new-project"/);
  assert.match(html, /<p class="sheet-note">The task takes its project's area\. A tap applies the choice\.<\/p>/);
  assert.match(app, /if \(event\.target\.matches\?\.\('\[data-sheet-search\]'\)\) \{/);
});

test('E9: tags are chosen together and saved with "Primeni"', () => {
  const ctx = sheetContext();
  ctx.state.tags = [{ id: 'x', name: 'Posao', color: '#111111' }, { id: 'y', name: 'Kuća', color: '#222222' }];
  ctx.state.tasks = [{ id: 't1', title: 'Report', tagIds: ['x'] }];
  ctx.openTagPicker({}, { type: 'task', taskId: 't1' });
  const html = ctx.calls.at(-1)[1];
  assert.match(html, /data-sheet-search placeholder="Search tags"/);
  assert.match(html, /class="popover-option sheet-option is-selected" type="button" data-sheet-item data-search="posao" data-pop-action="tag-sheet-toggle" data-tag-id="x" aria-pressed="true"><span class="tag-dot" style="--tag-color:#111111"><\/span>/);
  assert.match(html, /data-pop-action="inline-new-tag"/);
  assert.match(html, /<button class="btn btn-primary" type="button" data-pop-action="tag-sheet-apply">Apply<\/button>/);
  const button = { dataset: { tagId: 'y' }, classList: { toggle() {} }, setAttribute() {}, querySelector: () => ({ classList: { toggle() {} }, innerHTML: '' }) };
  ctx.toggleTagSheet(button);
  assert.ok(!ctx.calls.some(call => call[0] === 'edit'), 'nothing saved before Primeni');
  ctx.applyTagSheet();
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.slice(-2))), [['close'], ['edit', 't1', { tagIds: ['x', 'y'] }]]);
  ctx.modalState = { type: 'quick', draft: { tagIds: [] } };
  ctx.openTagPicker({}, { type: 'quick' });
  ctx.toggleTagSheet({ ...button, dataset: { tagId: 'x' } });
  ctx.applyTagSheet();
  assert.deepEqual(Array.from(ctx.modalState.draft.tagIds), ['x']);
});

test('the duration sheet applies a chip at once, or another number with "Primeni"', () => {
  const ctx = sheetContext();
  ctx.state.tasks = [{ id: 't1', title: 'Report', durationMinutes: 30 }];
  ctx.openTaskDurationPicker({}, 't1');
  const html = ctx.calls.at(-1)[1];
  for (const minutes of [15, 30, 45, 60, 90, 120]) assert.match(html, new RegExp(`data-pop-action="set-task-duration" data-task-id="t1" data-minutes="${minutes}"`));
  assert.match(html, /class="quick-chip is-selected" type="button" data-pop-action="set-task-duration" data-task-id="t1" data-minutes="30"/);
  assert.match(html, /<input id="task-duration-custom" class="input" type="number" min="1" max="1440" step="1" value="30">/);
  assert.match(html, /data-pop-action="set-task-duration" data-task-id="t1" data-minutes="">Remove duration</);
  ctx.setTaskDuration('t1', '25');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.at(-1))), ['edit', 't1', { durationMinutes: 25 }]);
  ctx.setTaskDuration('t1', '');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.at(-1))), ['edit', 't1', { durationMinutes: null }]);
  assert.match(app, /action === 'task-duration-picker'\) openTaskDurationPicker\(el, el\.dataset\.taskId\);/);
});

test('E2: every popover opens as a bottom sheet with a backdrop, a grabber, the title and X', () => {
  const open = fn('openPopover');
  assert.match(open, /el\.className = 'popover popover--sheet';/);
  assert.match(open, /backdrop\.className = 'sheet-backdrop';/);
  assert.match(open, /decorateSheet\(el\);/);
  assert.doesNotMatch(open, /style\.left|style\.top/, 'not anchored to the opener any more');
  const decorate = fn('decorateSheet');
  assert.match(decorate, /<span class="sheet-grabber" aria-hidden="true"><\/span>/);
  assert.match(decorate, /data-pop-action="close-sheet" aria-label="\$\{tr\('Close'\)\}"/);
  assert.match(fn('closePopover'), /popoverEl\.backdrop\?\.remove\(\);/);
  assert.match(fn('closePopover'), /dateSheet = null; reminderSheet = null; tagSheet = null;/);
  assert.match(app, /if \(action === 'close-sheet'\) closePopover\(\);/);
});

// openPopover first closes the previous sheet, which clears the sheet state, so each opener sets it again after.
test('opening a sheet keeps its own state', () => {
  assert.match(fn('openDateSheet'), /openPopover\(anchor, dateSheetHtml\(\), \{ type: 'date-sheet', target \}\);\n    dateSheet = sheet;/);
  assert.match(fn('openReminderPicker'), /openPopover\(anchor, reminderSheetHtml\(\), \{ type: 'reminder', target \}\);\n    reminderSheet = sheet;/);
  assert.match(fn('openTagPicker'), /openPopover\(anchor, tagSheetHtml\(\), \{ type: 'tag-picker', target \}\);\n    tagSheet = sheet;/);
});

test('the task menu offers "Započni fokus" for an open task', () => {
  const menu = fn('openTaskMenu');
  assert.match(menu, /data-pop-action="task-start-focus" data-task-id="\$\{esc\(taskId\)\}"><i class="ph ph-timer"><\/i>\$\{tr\('Start focus'\)\}/);
  assert.match(app, /else if \(action === 'task-start-focus'\) \{ const id = button\.dataset\.taskId; closePopover\(\); openFocusMode\(id\); \}/);
});

test('R3 is released as 2.0.0-alpha.8', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.8');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.8';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.8');
});
