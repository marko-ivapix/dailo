// Redesign R6: Inbox (I1–I6).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r6-inbox.md
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
const sr = read('js/i18n-sr.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const constLine = name => app.match(new RegExp(`  const ${name} = [^\\n]+\\n`))[0];
const TODAY = Core.dateOnly();
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function inboxContext(data = {}) {
  const calls = [];
  const state = { tasks: [], goals: [], habits: [], notes: [], resources: [], areas: [{ id: 'a1', name: 'Kuća', status: 'active' }], ui: { inboxFilter: 'all' }, ...data };
  const ctx = {
    calls, Core, esc, state, modalState: null,
    pageHeader: (title, subtitle) => `<header title="${title}" subtitle="${subtitle}"></header>`,
    taskRow: (task, context, options) => `<task ${task.id} ${context}${options?.today ? ' today' : ''}${options?.inbox ? ' inbox' : ''}${options?.draggable ? ' drag' : ''}>`,
    clampOrder: value => (Number.isFinite(value) ? value : 999999), getArea: id => state.areas.find(area => area.id === id), sortedAreas: () => state.areas,
    nowIso: () => '2026-10-10T08:00:00.000Z', saveState: () => calls.push(['save']), saveAndRender: () => calls.push(['saveAndRender']), render: () => calls.push(['render']), renderModal: () => calls.push(['renderModal']),
    closePopover: () => calls.push(['close']), openPopover: (anchor, html, meta) => calls.push(['open', html, meta]),
    setUndo: (message, undo) => { calls.push(['undo', message]); ctx.lastUndo = undo; },
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`, formatDate: String,
  };
  vm.createContext(withI18n(ctx));
  vm.runInContext(`${constLine('INBOX_FILTERS')}${['inboxRecordsForState', 'activeInboxRecords', 'inboxGroupForDate', 'inboxItem', 'renderInboxRecord', 'renderInbox', 'removeInboxRecordFromState', 'removeInboxRecord', 'openInboxAreaSheet', 'setInboxArea', 'renderInboxTriage', 'inboxTriageOpen', 'todayDueLabel'].map(fn).join('')}`, ctx);
  return ctx;
}

const at = `${TODAY}T07:00:00.000Z`;

test('I1, I3, I4: the top line, "Razvrstaj redom", only present types as filters, and capture groups', () => {
  const ctx = inboxContext({
    tasks: [{ id: 't1', title: 'Idea', isInbox: true, createdAt: at, inboxOrder: 0 }],
    notes: [{ id: 'n1', title: 'Link from Ana', isInbox: true, createdAt: at }],
  });
  const html = ctx.renderInbox();
  assert.match(html, /^<header title="Inbox" subtitle="2 items waiting to be organized"><\/header><button class="inbox-triage-button" type="button" data-action="inbox-triage"><i class="ph ph-stack" aria-hidden="true"><\/i><span><strong>Sort one by one<\/strong> · one at a time<\/span><i class="ph ph-caret-right" aria-hidden="true"><\/i><\/button>/);
  const tabs = [...html.matchAll(/data-inbox-filter="(\w+)">([^<]+)<span class="inbox-filter-count">(\d+)<\/span>/g)].map(match => match.slice(1));
  assert.deepEqual(tabs, [['all', 'All', '2'], ['tasks', 'Tasks', '1'], ['notes', 'Notes', '1']]);
  assert.match(html, /<strong>Today<\/strong><span>2<\/span>/);
  assert.match(html, /<task t1 inbox today inbox drag>/);
  ctx.state.notes = [];
  ctx.state.ui.inboxFilter = 'notes';
  const single = ctx.renderInbox();
  assert.doesNotMatch(single, /inbox-filter-tabs/, 'one type: no filters');
  assert.match(single, /<task t1/, 'a gone type falls back to all');
});

test('I6: an empty Inbox shows a check, "Inbox je prazan" and "Sve je razvrstano."', () => {
  const html = inboxContext().renderInbox();
  assert.match(html, /<header title="Inbox" subtitle="Nothing is waiting"><\/header><div class="empty-state inbox-empty"><i class="ph ph-check-circle" aria-hidden="true"><\/i><h3>Inbox is empty<\/h3><p>Everything is sorted\.<\/p><\/div>$/);
  for (const [key, value] of [['Inbox is empty', 'Inbox je prazan'], ['Everything is sorted\\.', 'Sve je razvrstano\\.'], ['Nothing is waiting', 'Ništa ne čeka'], ['Sort one by one', 'Razvrstaj redom'], ['one at a time', 'jednu po jednu']]) assert.match(sr, new RegExp(`"${key}": "${value}"`), key);
});

test('I5: a non-task row has its icon, title and type with Otvori, Oblast… and Razvrstano', () => {
  const ctx = inboxContext({ goals: [{ id: 'g1', title: 'Run a 10K', isInbox: true, status: 'active', createdAt: at }] });
  const row = ctx.renderInboxRecord({ type: 'goal', item: ctx.state.goals[0] });
  assert.match(row, /^<article class="today-row inbox-item-row" data-inbox-type="goal" data-inbox-id="g1"><span class="inbox-item-icon" aria-hidden="true"><i class="ph ph-target"><\/i><\/span><button class="today-row-main" type="button" data-route="goal\/g1"><span class="task-title">Run a 10K<\/span><span class="task-meta">Goal<\/span><\/button>/);
  assert.match(row, /<div class="quick-actions inbox-item-chips"><button class="quick-chip" type="button" data-route="goal\/g1">Open details<\/button><button class="quick-chip" type="button" data-action="inbox-area" data-inbox-type="goal" data-inbox-id="g1">Area…<\/button><button class="quick-chip" type="button" data-action="inbox-remove" data-inbox-type="goal" data-inbox-id="g1">Sorted<\/button><\/div><\/article>$/);
  assert.match(sr, /"Open details": "Otvori"/);
  assert.match(sr, /"Area…": "Oblast…"/);
  assert.match(sr, /"Sorted": "Razvrstano"/);
});

test('I5: a task row in Inbox has Danas, Sutra, Kad stignem and Projekat…', () => {
  let module;
  runInNewContextWithI18n(read('js/tasks-ui.js'), { window: { TodoDomainModules: { register(value) { module = value; } } } });
  const html = module.renderTaskRow({ id: 't1', title: 'Idea', tagIds: [] }, 'inbox', { today: true, inbox: true, draggable: true }, { Core, esc, getProject: () => null, getArea: () => null, todayDueLabel: () => '', state: { settings: {} } });
  assert.match(html, /<div class="quick-actions"><button class="quick-chip" type="button" data-action="inbox-today" data-task-id="t1">Today<\/button><button class="quick-chip" type="button" data-action="inbox-tomorrow" data-task-id="t1">Tomorrow<\/button><button class="quick-chip" type="button" data-action="inbox-anytime" data-task-id="t1">Anytime<\/button><button class="quick-chip" type="button" data-action="inbox-project" data-task-id="t1">Project…<\/button><\/div>/);
  assert.match(app, /else if \(action === 'inbox-project'\) openProjectPicker\(el, \{ type: 'task', taskId: el\.dataset\.taskId \}\);/);
});

test('I6: Razvrstano and Oblast… take an item out of Inbox with "Poništi"', () => {
  const ctx = inboxContext({ notes: [{ id: 'n1', title: 'Link', isInbox: true, areaId: null, createdAt: at }] });
  ctx.removeInboxRecord('note', 'n1');
  assert.equal(ctx.state.notes[0].isInbox, false);
  assert.deepEqual(ctx.calls.find(call => call[0] === 'undo'), ['undo', 'Sorted']);
  ctx.lastUndo();
  assert.equal(ctx.state.notes[0].isInbox, true, 'Undo puts it back');
  ctx.openInboxAreaSheet({}, 'note', 'n1');
  const sheet = ctx.calls.find(call => call[0] === 'open');
  assert.match(sheet[1], /data-pop-action="inbox-set-area" data-inbox-type="note" data-inbox-id="n1" data-area-id="a1"><span class="sheet-option-label">Kuća<\/span>/);
  ctx.setInboxArea('note', 'n1', 'a1');
  assert.equal(ctx.state.notes[0].areaId, 'a1');
  assert.equal(ctx.state.notes[0].isInbox, false);
  assert.deepEqual(ctx.calls.filter(call => call[0] === 'undo').at(-1), ['undo', 'Moved to area']);
  ctx.lastUndo();
  assert.equal(ctx.state.notes[0].areaId, null);
  assert.equal(ctx.state.notes[0].isInbox, true);
});

test('I6: Projekat… from Inbox can be undone', () => {
  const set = fn('setProject');
  assert.match(set, /const previous = \{ projectId: task\.projectId \?\? null, areaId: task\.areaId \?\? null, isInbox: task\.isInbox \};/);
  assert.match(set, /if \(!asked && previous\.isInbox && projectId\) setUndo\(msg\('Task moved to project'\)/);
  assert.match(sr, /"Task moved to project": "Zadatak je premešten u projekat"/);
});

test('I2: "Razvrstaj redom" shows one item with large buttons, a counter and Preskoči, then Gotovo', () => {
  const ctx = inboxContext({
    tasks: [{ id: 't1', title: 'Call the bank', isInbox: true, createdAt: at, dueDate: TODAY }],
    resources: [{ id: 'r1', title: 'Article', isInbox: true, createdAt: at }],
  });
  ctx.modalState = { type: 'inbox-triage', queue: [['task', 't1'], ['resource', 'r1']], index: 0 };
  let html = ctx.renderInboxTriage();
  assert.match(html, /^<frame quick inbox-triage-modal><div class="modal-inner"><div class="modal-header"><h2 class="modal-title">Sorting<\/h2>/);
  assert.match(html, /<p class="inbox-triage-meta">Task · added today<\/p><p class="inbox-triage-title">Call the bank<\/p><p class="inbox-triage-due"><span class="task-due is-today">Due today<\/span><\/p>/);
  assert.match(html, /<div class="inbox-triage-actions"><button class="btn btn-secondary" type="button" data-action="inbox-today" data-task-id="t1">Today<\/button><button class="btn btn-secondary" type="button" data-action="inbox-tomorrow" data-task-id="t1">Tomorrow<\/button><button class="btn btn-secondary" type="button" data-action="inbox-anytime" data-task-id="t1">Anytime<\/button><button class="btn btn-secondary" type="button" data-action="inbox-project" data-task-id="t1">Project…<\/button><\/div>/);
  assert.match(html, /<div class="inbox-triage-footer"><span>1 of 2<\/span><button class="btn btn-ghost" type="button" data-action="inbox-triage-skip">Skip<\/button><\/div>/);
  assert.doesNotMatch(html, /delete/i, 'no deleting here');
  ctx.state.tasks[0].isInbox = false;
  html = ctx.renderInboxTriage();
  assert.match(html, /<p class="inbox-triage-meta">Resource · added today<\/p>/);
  assert.match(html, /data-action="inbox-triage-open" data-inbox-type="resource" data-inbox-id="r1">Open details<\/button><button class="btn btn-secondary" type="button" data-action="inbox-area" data-inbox-type="resource" data-inbox-id="r1">Area…<\/button><button class="btn btn-primary" type="button" data-action="inbox-remove" data-inbox-type="resource" data-inbox-id="r1">Sorted<\/button>/);
  assert.match(html, /<span>2 of 2<\/span>/);
  ctx.state.resources[0].isInbox = false;
  html = ctx.renderInboxTriage();
  assert.match(html, /<div class="empty-state inbox-empty"><i class="ph ph-check-circle" aria-hidden="true"><\/i><h3>Finished<\/h3><p>Inbox is empty\.<\/p><\/div><div class="modal-footer"><span><\/span><div class="modal-footer-actions"><button class="btn btn-secondary" type="button" data-action="close-modal">Close<\/button>/);
  assert.match(app, /else if \(action === 'inbox-triage'\) openInboxTriage\(\);/);
  assert.match(app, /else if \(action === 'inbox-triage-skip'\) \{ modalState\.index \+= 1; renderModal\(\); \}/);
  assert.match(sr, /"Finished": "Gotovo"/);
  assert.match(sr, /"\{current\} of \{total\}": "\{current\} od \{total\}"/);
});

test('R6 shipped as 2.0.0-alpha.11 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 11);
  assert.match(read('sw.js'), new RegExp(`const VERSION = '${Release.APP_VERSION.replace(/\./g, '\\.')}';`));
  assert.equal(JSON.parse(read('package.json')).version, Release.APP_VERSION);
});
