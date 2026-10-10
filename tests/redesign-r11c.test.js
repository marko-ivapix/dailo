// Redesign R11c: repeat controls with Undo and the narrower "Samo ovo / Ovo i buduća" question (S14).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r11c-repeat-controls.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { withI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const plain = value => JSON.parse(JSON.stringify(value));
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const constants = app.match(/  const REPEAT_[\s\S]*?\n\n/)[0];
const weekly = (extra = {}) => ({ frequency: 'weekly', interval: 1, weekdays: [3], status: 'active', endType: 'never', endDate: null, endAfterOccurrences: null, occurrencesCreated: 0, skipNext: false, seriesId: 's', ...extra });

function appContext(tasks, extra = {}) {
  const calls = [];
  const state = { tasks };
  const ctx = {
    calls, state, Core: { ...Core, dateOnly: value => (value ? Core.dateOnly(value) : '2026-10-10') }, esc, plain,
    copyTemplate: value => (value == null ? value : plain(value)),
    getTask: id => state.tasks.find(task => task.id === id) || null,
    taskRecurrence: task => task?.recurrenceBaseline?.recurrence || task?.recurrence,
    parseLocalDate: value => { const [y, m, d] = String(value).split('-').map(Number); return new Date(y, m - 1, d, 12); },
    nowIso: () => '2026-10-14T10:00:00.000Z',
    saveState: () => calls.push(['save']), render: () => calls.push(['render']), renderModal: () => calls.push(['renderModal']), closePopover: () => calls.push(['close']),
    setUndo: (message, undo) => calls.push(['undo', message, undo]),
    removeCloneGoalLinks: id => calls.push(['unlink', id]),
    captureGoalProgress: () => null, evaluateGoalProgressChanges: () => {},
    document: { activeElement: null },
    modalState: null,
    ...extra,
  };
  vm.createContext(withI18n(ctx));
  return ctx;
}
const lastUndo = ctx => ctx.calls.filter(call => call[0] === 'undo').at(-1);

test('S14: completing a repeating task says when the next one comes, with Undo', () => {
  const task = { id: 't', title: 'Bins', plannedDate: '2026-10-14', isCompleted: false, completedAt: null, recurrence: weekly({ weekdays: [3, 6] }), subtasks: [] };
  const ctx = appContext([task], {
    generateRecurringSuccessor: (item, at) => { const next = Core.buildNextRecurringTask(item, at, 'n'); ctx.state.tasks.push(next); item.recurrenceSuccessorId = 'n'; return 'n'; },
  });
  vm.runInContext(`${constants}${['toggleComplete'].map(fn).join('\n')}`, ctx);
  ctx.toggleComplete('t');
  const [, message, undo] = lastUndo(ctx);
  assert.equal(message, 'Task completed · next Sat, Oct 17');
  undo();
  assert.deepEqual(ctx.state.tasks.map(item => item.id), ['t']);
  assert.equal(ctx.state.tasks[0].isCompleted, false);
  const single = appContext([{ id: 'p', title: 'Plain', subtasks: [] }], { generateRecurringSuccessor: () => null });
  vm.runInContext(`${constants}${fn('toggleComplete')}`, single);
  single.toggleComplete('p');
  assert.equal(lastUndo(single)[1], 'Task completed', 'no next one, no date');
});

function controlsContext(tasks, extra = {}) {
  const ctx = appContext(tasks, extra);
  vm.runInContext(['manageRecurrence', 'recurrencePendingSiblings', 'recurrenceSkipTarget', 'snapshotTasks', 'restoreTasks', 'controlRecurrence'].map(fn).join('\n'), ctx);
  return ctx;
}

test('S14: skip toggles, pause / resume / end say what they did and Undo restores the series', () => {
  const tasks = [{ id: 't', title: 'Bins', plannedDate: '2026-10-14', recurrence: weekly(), subtasks: [] }];
  let ctx = controlsContext(tasks);
  ctx.controlRecurrence('t', 'skip-recurrence');
  assert.equal(ctx.state.tasks[0].recurrence.skipNext, true);
  assert.equal(lastUndo(ctx)[1], 'The next repeat will be skipped');
  ctx.controlRecurrence('t', 'skip-recurrence');
  assert.equal(ctx.state.tasks[0].recurrence.skipNext, false, 'tapping again cancels the skip');
  assert.equal(lastUndo(ctx)[1], 'Skip cancelled');
  lastUndo(ctx)[2]();
  assert.equal(ctx.getTask('t').recurrence.skipNext, true, 'Undo brings the skip back');

  ctx = controlsContext([{ id: 't', title: 'Bins', plannedDate: '2026-10-14', recurrence: weekly(), subtasks: [] }]);
  ctx.controlRecurrence('t', 'pause-recurrence');
  assert.equal(ctx.getTask('t').recurrence.status, 'paused');
  assert.equal(lastUndo(ctx)[1], 'Repeat paused');
  lastUndo(ctx)[2]();
  assert.equal(ctx.getTask('t').recurrence.status, 'active');
  ctx.controlRecurrence('t', 'end-recurrence');
  assert.equal(ctx.getTask('t').recurrence.status, 'ended');
  assert.equal(lastUndo(ctx)[1], 'Repeat ended');

  const done = { id: 'd', title: 'Bins', plannedDate: '2026-10-07', isCompleted: true, recurrence: weekly({ status: 'paused' }), subtasks: [] };
  ctx = controlsContext([done], { generateRecurringSuccessor: item => { ctx.state.tasks.push({ id: 'n', title: 'Bins', recurrence: weekly() }); item.recurrenceSuccessorId = 'n'; return 'n'; } });
  ctx.controlRecurrence('d', 'resume-recurrence');
  assert.deepEqual(ctx.state.tasks.map(item => item.id), ['d', 'n']);
  assert.equal(lastUndo(ctx)[1], 'Repeat resumed');
  lastUndo(ctx)[2]();
  assert.deepEqual(ctx.state.tasks.map(item => item.id), ['d'], 'Undo removes the next task "Nastavi" made');
  assert.equal(ctx.getTask('d').recurrence.status, 'paused');
  assert.equal(ctx.getTask('d').recurrenceSuccessorId, undefined);
  assert.ok(ctx.calls.some(call => call[0] === 'unlink' && call[1] === 'n'));
});

function editorContext(task, others = []) {
  const ctx = appContext([task, ...others], {
    modalState: { type: 'task', taskId: task.id }, popoverEl: {}, $: () => null, formatDate: value => `F:${value}`, cssEscape: String,
    openPopover: () => {}, refreshSheet: () => {}, setRecurrence: (type, id, rule) => ctx.calls.push(['set', type, id, plain(rule)]),
  });
  vm.runInContext(`let repeatSheet = null;\n${constants}${['recurrenceLabel', 'repeatList', 'openRepeatPicker', 'repeatSource', 'repeatEditorState', 'repeatRuleFromSheet', 'repeatPresetOn', 'repeatEditorHtml', 'repeatSheetHtml', 'readRepeatInputs', 'repeatEditorUpdate', 'repeatFocusSelector', 'repeatEditorError', 'handleRepeatAction', 'applyRepeatSheet', 'recurrencePendingSiblings', 'recurrenceSkipTarget'].map(fn).join('\n')}`, ctx);
  ctx.open = () => { ctx.openRepeatPicker({}, { type: 'task', taskId: task.id }); return ctx.repeatSheetHtml(); };
  return ctx;
}

test('S14: the controls under "Ovo ponavljanje", the sentence suffixes and an ended repeat starting again', () => {
  const html = editorContext({ id: 't', title: 'Bins', plannedDate: '2026-10-14', recurrence: weekly(), subtasks: [] }).open();
  assert.match(html, /<h3 class="sheet-group-title">This repeat<\/h3><div class="sheet-card"><button class="popover-option sheet-option" type="button" data-pop-action="skip-recurrence" data-task-id="t" data-target-type="task"><span class="sheet-option-label">Skip next occurrence<small>When you complete this one, the next repeat is skipped\.<\/small><\/span><\/button><button class="popover-option sheet-option" type="button" data-pop-action="pause-recurrence" data-task-id="t" data-target-type="task"><span class="sheet-option-label">Pause recurrence<small>While paused, completing makes no next one\.<\/small><\/span><\/button><button class="popover-option sheet-option is-danger" type="button" data-pop-action="end-recurrence" data-task-id="t" data-target-type="task"><span class="sheet-option-label">End recurrence<small>This task stays; no more are made\.<\/small><\/span><\/button><\/div>/);
  const scheduled = editorContext({ id: 't', title: 'Bins', plannedDate: '2026-10-14', recurrence: weekly({ status: 'paused', skipNext: true }), subtasks: [] }).open();
  assert.match(scheduled, /data-pop-action="skip-recurrence"[^>]*><span class="sheet-option-label">Skip is scheduled · cancel<small>The next task is made for the repeat after it\.<\/small>/);
  assert.match(scheduled, /data-pop-action="resume-recurrence"[^>]*><span class="sheet-option-label">Resume recurrence<small>Completing makes the next task again\.<\/small>/);
  assert.match(scheduled, /data-repeat-summary>On Wednesdays · paused</);
  const ended = editorContext({ id: 't', title: 'Bins', plannedDate: '2026-10-14', recurrence: weekly({ status: 'ended' }), subtasks: [] });
  const endedHtml = ended.open();
  assert.doesNotMatch(endedHtml, /This repeat|skip-recurrence/);
  assert.match(endedHtml, /data-repeat-summary>On Wednesdays · ended</);
  ended.handleRepeatAction('repeat-apply', { dataset: {} });
  assert.deepEqual(ended.calls.at(-1), ['set', 'task', 't', { frequency: 'weekly', interval: 1, weekdays: [3], endType: 'never', endDate: null, endAfterOccurrences: null, status: 'active' }], 'Primeni starts an ended repeat again');
});

function editContext(task) {
  const ctx = appContext([task], { modalState: { type: 'task', taskId: task.id }, taskDraftChanges: () => ({}) });
  vm.runInContext(fn('requestTaskEdit'), ctx);
  return ctx;
}

test('S14: only a date, the reminder or the repeat asks; other fields save at once and reach the baseline', () => {
  const baseline = { id: 't', title: 'Bins', plannedDate: '2026-10-14', priority: 'none', recurrence: weekly(), subtasks: [] };
  const occurrence = () => ({ ...plain(baseline), plannedDate: '2026-10-15', recurrence: weekly(), recurrenceBaseline: plain(baseline) });
  let ctx = editContext(occurrence());
  assert.equal(ctx.requestTaskEdit('t', { title: 'Take out bins' }), false);
  assert.equal(ctx.modalState.type, 'task', 'no question');
  assert.equal(ctx.getTask('t').title, 'Take out bins');
  assert.equal(ctx.getTask('t').recurrenceBaseline.title, 'Take out bins', 'the next occurrence carries it');
  for (const changes of [{ priority: 'high' }, { notes: 'Blue bin' }, { tagIds: ['x'] }, { projectId: 'p', areaId: null }, { durationMinutes: 15 }, { subtasks: [{ id: 's', title: 'Bag', isCompleted: false, order: 0 }] }]) {
    ctx = editContext(occurrence());
    assert.equal(ctx.requestTaskEdit('t', changes), false, JSON.stringify(changes));
    assert.equal(ctx.modalState.type, 'task');
    for (const [key, value] of Object.entries(changes)) assert.deepEqual(plain(ctx.getTask('t')[key]), value);
  }
  for (const changes of [{ plannedDate: '2026-10-16' }, { plannedTime: '09:00' }, { dueDate: '2026-10-20' }, { reminderAt: '2026-10-15T07:00:00.000Z' }, { recurrence: { frequency: 'daily', interval: 1 } }]) {
    ctx = editContext(occurrence());
    assert.equal(ctx.requestTaskEdit('t', changes), true, JSON.stringify(changes));
    assert.equal(ctx.modalState.type, 'recurrence-scope');
  }
  ctx = editContext({ id: 'p', title: 'Plain', plannedDate: '2026-10-14', subtasks: [] });
  assert.equal(ctx.requestTaskEdit('p', { plannedDate: '2026-10-16' }), false, 'a task that does not repeat never asks');
  assert.equal(ctx.getTask('p').plannedDate, '2026-10-16');
});

function scopeContext(tasks, changes) {
  const ctx = appContext(tasks, { combineDateTime: Core.combineDateTime, modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>` });
  ctx.modalState = { type: 'recurrence-scope', taskId: tasks[0].id, changes, previous: { type: 'task', taskId: tasks[0].id } };
  vm.runInContext(['renderRecurrenceScope', 'cancelRecurrenceScope', 'applyRecurrenceScope', 'snapshotTasks', 'restoreTasks'].map(fn).join('\n'), ctx);
  return ctx;
}

test('S14: the "Primeni izmenu" window', () => {
  const ctx = scopeContext([{ id: 't', title: 'Bins <weekly>', plannedDate: '2026-10-14', recurrence: weekly(), subtasks: [] }], { plannedDate: '2026-10-15' });
  assert.equal(ctx.renderRecurrenceScope(), '<frame small-modal><div class="modal-inner"><div class="modal-header"><h2 class="modal-title">Apply the change</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Cancel"><i class="ph ph-x"></i></button></div><p class="sheet-subtitle">Bins &lt;weekly></p><div class="sheet-card"><button class="popover-option sheet-option" type="button" data-action="recurrence-scope" data-scope="occurrence"><span class="sheet-option-label">This occurrence<small>The next repeats stay as they were.</small></span><i class="ph ph-caret-right" aria-hidden="true"></i></button><button class="popover-option sheet-option" type="button" data-action="recurrence-scope" data-scope="future"><span class="sheet-option-label">This and future<small>The change applies from this repeat on.</small></span><i class="ph ph-caret-right" aria-hidden="true"></i></button></div></div></frame>');
});

test('S14: "Ovo i buduća" moves the rule\'s day along, "Samo ovo" keeps it, and both offer Undo', () => {
  const series = () => [
    { id: 't', title: 'Bins', plannedDate: '2026-10-14', recurrence: weekly(), subtasks: [] },
    { id: 'u', title: 'Bins', plannedDate: '2026-10-21', recurrence: weekly(), subtasks: [] },
  ];
  let ctx = scopeContext(series(), { plannedDate: '2026-10-15' });
  ctx.applyRecurrenceScope('future');
  assert.deepEqual([ctx.getTask('t').plannedDate, ctx.getTask('u').plannedDate], ['2026-10-15', '2026-10-22']);
  assert.deepEqual(plain(ctx.getTask('t').recurrence.weekdays), [4], 'Wednesday → Thursday');
  assert.deepEqual(plain(ctx.getTask('u').recurrence.weekdays), [4]);
  assert.equal(Core.buildNextRecurringTask(ctx.getTask('u'), '2026-10-22T10:00:00Z', 'n').plannedDate, '2026-10-29');
  assert.equal(lastUndo(ctx)[1], 'Saved · this and future ones');
  lastUndo(ctx)[2]();
  assert.deepEqual(plain(ctx.state.tasks), series(), 'Undo restores every task the choice changed');

  ctx = scopeContext(series(), { plannedDate: '2026-10-15' });
  ctx.applyRecurrenceScope('occurrence');
  assert.equal(ctx.getTask('t').plannedDate, '2026-10-15');
  assert.deepEqual(plain(ctx.getTask('t').recurrence.weekdays), [3], 'the rule keeps its day');
  assert.equal(Core.buildNextRecurringTask(ctx.getTask('t'), '2026-10-15T10:00:00Z', 'n').plannedDate, '2026-10-21');
  assert.equal(lastUndo(ctx)[1], 'Saved · only this one');
  lastUndo(ctx)[2]();
  assert.deepEqual(plain(ctx.state.tasks), series());
});

test('Core.recurrenceDayShift moves the chosen day with the date', () => {
  const shift = (rule, from, to) => plain(Core.recurrenceDayShift(rule, from, to));
  assert.deepEqual(shift({ frequency: 'weekly', interval: 1, weekdays: [3] }, '2026-10-14', '2026-10-15'), { weekdays: [4] });
  assert.deepEqual(shift({ frequency: 'weekly', interval: 1, weekdays: [3, 6] }, '2026-10-14', '2026-10-15'), { weekdays: [4, 6] });
  assert.deepEqual(shift({ frequency: 'weekly', interval: 1, weekdays: [3, 6] }, '2026-10-14', '2026-10-17'), { weekdays: [6] });
  assert.deepEqual(shift({ frequency: 'weekly', interval: 1, weekdays: [3] }, '2026-10-13', '2026-10-15'), {}, 'not from a chosen day');
  assert.deepEqual(shift({ frequency: 'monthly', interval: 1, monthMode: 'day', monthDay: 10 }, '2026-10-10', '2026-10-12'), { monthDay: 12 });
  assert.deepEqual(shift({ frequency: 'monthly', interval: 1, monthMode: 'day', monthDay: 'last' }, '2026-10-31', '2026-10-30'), {});
  assert.deepEqual(shift({ frequency: 'monthly', interval: 1, monthMode: 'weekday', weekOfMonth: 1, weekday: 1 }, '2026-10-05', '2026-10-06'), { weekOfMonth: 1, weekday: 2 });
  assert.deepEqual(shift({ frequency: 'monthly', interval: 1, monthMode: 'weekday', weekOfMonth: 'last', weekday: 5 }, '2026-10-30', '2026-10-29'), { weekOfMonth: 'last', weekday: 4 });
  for (const rule of [{ frequency: 'weekly', interval: 1 }, { frequency: 'monthly', interval: 1 }, { frequency: 'daily', interval: 1 }, { frequency: 'yearly', interval: 1 }]) assert.deepEqual(shift(rule, '2026-10-14', '2026-10-15'), {}, rule.frequency);
});

test('the R11c layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R11c'));
  assert.ok(layer.length > 20, 'R11c layer');
  assert.ok(layer.includes('.sheet-option.is-danger'));
  for (const [en, value] of [['Skip next occurrence', 'Preskoči sledeći put'], ['Skip is scheduled · cancel', 'Preskakanje je zakazano · otkaži'], ['Task completed · next {date}', 'Zadatak je završen · sledeći put {date}'], ['Apply the change', 'Primeni izmenu'], ['This occurrence', 'Samo ovo'], ['This and future', 'Ovo i buduća'], ['Saved · only this one', 'Sačuvano · samo ovo'], ['Saved · this and future ones', 'Sačuvano · ovo i buduća'], ['Repeat paused', 'Ponavljanje je pauzirano'], ['paused', 'pauzirano'], ['ended', 'završeno']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
  assert.match(app, /\['pause-recurrence','resume-recurrence','skip-recurrence','end-recurrence'\]\.includes\(action\)\) controlRecurrence\(button\.dataset\.taskId,action\);/);
});

test('R11c shipped as 2.0.0-alpha.28 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 28);
});
