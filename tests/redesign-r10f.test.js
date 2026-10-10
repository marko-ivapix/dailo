// Redesign R10f: Pretraga and Fokus (S11, S12).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r10f-search-focus.md
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
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const TODAY = Core.dateOnly();

function searchContext(query = '') {
  const state = {
    tasks: [{ id: 't1', title: 'Report draft', projectId: 'p1' }, { id: 't2', title: 'Old report', isCompleted: true, completedAt: new Date().toISOString() }],
    projects: [{ id: 'p1', name: 'Report site', color: '#4f8cff' }, { id: 'p2', name: 'Reports 2025', color: '#2fbf71', isArchived: true }],
  };
  const ctx = {
    state, Core, esc, modalState: { type: 'search', query },
    getProject: id => state.projects.find(project => project.id === id) || null,
    relativeDateLabel: value => `L:${value}`,
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`,
  };
  vm.createContext(withI18n(ctx));
  vm.runInContext(`${app.match(/  const SEARCH_[\s\S]*?\n\n/)[0]}${['renderSearchModal', 'searchResultsHtml', 'searchMoreNote', 'searchTaskResult'].map(fn).join('\n')}`, ctx);
  return ctx;
}

test('S11: Search is a full-height window with the field on top and the two groups with counts', () => {
  const empty = searchContext().renderSearchModal();
  assert.match(empty, /^<frame quick><div class="modal-inner quick-sheet search-window"><div class="modal-header"><h2 class="modal-title">Search<\/h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close Search"><i class="ph ph-x"><\/i><\/button><\/div><label class="search-box"><i class="ph ph-magnifying-glass" aria-hidden="true"><\/i><input id="search-query" class="search-input" type="search" autocomplete="off" placeholder="Search tasks and projects\.\.\." value="" aria-label="Search"><\/label><div id="search-results" class="search-results">/);
  assert.match(empty, /Search tasks and projects<\/h3><p>Type a task title, note or project name\.<\/p>/);
  const ctx = searchContext('report');
  const html = ctx.searchResultsHtml('report');
  assert.match(html, /^<h3 class="search-section-title">Tasks · 2<\/h3><div class="today-card search-list"><button class="search-result" type="button" data-action="open-task" data-task-id="/);
  assert.match(html, /<h3 class="search-section-title">Projects · 2<\/h3><div class="today-card search-list">/);
  assert.match(html, /data-route="project\/p2"><span class="search-result-icon"><span class="project-dot" style="--project-color:#2fbf71"><\/span><\/span><span><span class="search-result-title">Reports 2025<\/span><span class="search-result-meta">Project · archived<\/span><\/span><\/button>/);
  assert.match(html, /data-route="project\/p1">[\s\S]*?<span class="search-result-meta">Project<\/span>/);
  const order = [...html.matchAll(/data-task-id="(\w+)"/g)].map(match => match[1]);
  assert.deepEqual(order, Core.searchItems(ctx.state.tasks, ctx.state.projects, 'report').tasks.map(({ task }) => task.id), 'the order is unchanged');
});

function focusContext(task, extra = {}) {
  const calls = [];
  const tasks = [task, ...(extra.tasks || [])];
  const ctx = {
    calls, Core, esc,
    modalState: { type: 'focus', taskId: task.id, timer: { isRunning: true, elapsedMs: 0, startedAt: Date.now() } },
    getTask: id => tasks.find(item => item.id === id) || null,
    getProject: id => (id === 'p1' ? { id: 'p1', name: 'Site', color: '#4f8cff' } : null),
    focusableTasks: () => tasks.filter(item => !item.isCompleted),
    createFocusTimer: () => ({ isRunning: true, elapsedMs: 0, startedAt: Date.now() }), startFocusTimer: () => calls.push(['start']),
    focusElapsedMs: () => 65000,
    relativeDateLabel: value => `L:${value}`, priorityLabel: value => value[0].toUpperCase() + value.slice(1), clampOrder: value => Number(value) || 0,
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`,
  };
  vm.createContext(withI18n(ctx));
  vm.runInContext(['formatFocusElapsed', 'renderFocusModal'].map(fn).join('\n'), ctx);
  return ctx;
}

test('S12: Fokus is a tall window with the title, one meta line, the ring, tickable subtasks, notes and the footer', () => {
  const task = { id: 't', title: 'Write <report>', projectId: 'p1', dueDate: Core.addDays(TODAY, -1), plannedDate: TODAY, priority: 'high', notes: 'Keep it short', subtasks: [{ id: 's1', title: 'Draft', isCompleted: true, order: 0 }, { id: 's2', title: 'Send', isCompleted: false, order: 1 }] };
  const html = focusContext(task).renderFocusModal();
  assert.equal(html, `<frame quick><div class="modal-inner quick-sheet focus-window"><div class="modal-header task-window-header"><span class="task-window-kind">Focus</span><div class="task-window-actions"><button class="btn-icon" type="button" data-action="close-modal" aria-label="Exit focus mode"><i class="ph ph-x"></i></button></div></div><h2 class="focus-title">Write &lt;report></h2><p class="focus-meta-line">Site · Overdue · L:${Core.addDays(TODAY, -1)} · Planned L:${TODAY} · High priority</p><div class="focus-ring is-running" aria-live="off"><span class="focus-timer-label">Elapsed</span><strong id="focus-elapsed">01:05</strong></div><div class="focus-timer-actions"><button class="btn btn-secondary" type="button" data-action="focus-toggle-timer">Pause</button><button class="btn btn-ghost" type="button" data-action="focus-reset-timer">Reset</button></div><h3 class="goal-details-label">Subtasks · 1/2</h3><div class="today-card focus-subtasks"><button class="focus-subtask is-done" type="button" data-action="toggle-subtask" data-task-id="t" data-subtask-id="s1" aria-pressed="true"><span class="complete-control is-completed" aria-hidden="true"><i class="ph ph-check"></i></span><span class="subtask-title">Draft</span></button><button class="focus-subtask" type="button" data-action="toggle-subtask" data-task-id="t" data-subtask-id="s2" aria-pressed="false"><span class="complete-control" aria-hidden="true"></span><span class="subtask-title">Send</span></button></div><h3 class="goal-details-label">Notes</h3><p class="focus-notes">Keep it short</p><div class="quick-sheet-footer focus-footer"><div class="focus-footer-row"><button class="btn btn-secondary" type="button" data-action="focus-tomorrow" data-task-id="t">Tomorrow</button><button class="btn btn-secondary" type="button" data-action="focus-next" data-task-id="t">Next</button><button class="btn btn-secondary" type="button" data-action="focus-open-details" data-task-id="t">Details</button></div><button class="btn btn-primary habit-window-save" type="button" data-action="focus-complete" data-task-id="t"><i class="ph ph-check"></i> Complete task</button></div></div></frame>`);
  const plain = focusContext({ id: 'q', title: 'Quiet', subtasks: [] }).renderFocusModal();
  assert.match(plain, /<h2 class="focus-title">Quiet<\/h2><div class="focus-ring is-running"/, 'no meta line, subtasks or notes when there are none');
  const paused = focusContext({ id: 'q', title: 'Quiet', subtasks: [] });
  paused.modalState.timer.isRunning = false;
  assert.match(paused.renderFocusModal(), /<div class="focus-ring" aria-live="off">[\s\S]*data-action="focus-toggle-timer">Resume<\/button>/);
  const done = focusContext({ id: 'd', title: 'Done', isCompleted: true });
  assert.equal(done.renderFocusModal(), '<frame quick><div class="modal-inner quick-sheet focus-window"><div class="modal-header task-window-header"><span class="task-window-kind">Focus</span><div class="task-window-actions"><button class="btn-icon" type="button" data-action="close-modal" aria-label="Exit focus mode"><i class="ph ph-x"></i></button></div></div><h2 class="focus-title">Nothing left to focus on</h2><div class="quick-sheet-footer"><span></span><button class="btn btn-primary habit-window-save" type="button" data-action="close-modal">Exit</button></div></div></frame>');
});

test('the R10f layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R10f'));
  assert.ok(layer.length > 20, 'R10f layer');
  for (const selector of ['.search-window .search-box', '.search-list', '.focus-title', '.focus-meta-line', '.focus-ring', '.focus-ring.is-running', '.focus-subtask', '.focus-footer-row']) assert.ok(layer.includes(selector), selector);
  for (const [en, value] of [['Next', 'Sledeći'], ['Details', 'Detalji'], ['archived', 'arhiviran']]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
});

test('R10f shipped as 2.0.0-alpha.24 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 24);
});
