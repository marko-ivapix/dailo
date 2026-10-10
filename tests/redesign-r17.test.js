// Redesign R17: fixes from the design audit (items 1–12).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r17-audit-fixes.md
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
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const tasksUi = read('js/tasks-ui.js');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const layerStart = css.indexOf('/* Redesign R17');
const layer = css.slice(layerStart, css.indexOf('/* Keep primary compact actions touchable', layerStart));
const rule = selector => {
  const start = layer.indexOf(`\n${selector} {`);
  assert.ok(start >= 0, selector);
  return layer.slice(start, layer.indexOf('}', start) + 1);
};
const moduleFor = file => {
  let module;
  runInNewContextWithI18n(read(file), { window: { TodoDomainModules: { register(value) { module = value; } } }, requestAnimationFrame: run => run() });
  return module;
};

test('1: "Bez projekta" has a route, and the domain context hands over taskRow', () => {
  assert.match(fn('currentRoute'), /if \(id === 'none' \|\| getProject\(id\)\) return \{ type: 'project', id \};/);
  assert.match(fn('domainContext'), /\n      taskRow,\n/);
});

test('2, 3: the Još tile icon is 36 px square and the task title 22 px on touch phones', () => {
  assert.match(rule('.more-tiles > .more-row > .more-row-icon'), /width: 36px;/);
  assert.match(rule('#detail-title'), /font-size: 22px;/);
});

test('4: inside the phone app Dailo counts as installed', () => {
  assert.match(app, /standalone: Boolean\(globalThis\.DailoPlatform\?\.isNative\) \|\| navigator\.standalone === true \|\| Boolean\(window\.matchMedia\?\.\('\(display-mode: standalone\)'\)\.matches\)/);
});

test('5, 6: the "+" moves up for a toast at every width; no invisible buttons on touch screens', () => {
  assert.match(rule('body:has(#toast-root .toast) .mobile-quick-add'), /transform: translateY\(-64px\);/);
  assert.match(layer, /@media \(pointer: coarse\) \{\n  \.task-row--today \.task-actions \{ display: none; \}\n  \.subtask-row \.btn-icon \{ opacity: 1; \}\n\}/);
});

test('7: subtasks, focus subtasks, review steps 1–2 and search results put the check on the right', () => {
  const subtask = tasksUi.slice(tasksUi.indexOf('  function subtaskRow('), tasksUi.indexOf('\n  }\n', tasksUi.indexOf('  function subtaskRow(')));
  assert.ok(subtask.indexOf('class="subtask-title"') < subtask.indexOf('data-action="delete-subtask"') && subtask.indexOf('data-action="delete-subtask"') < subtask.indexOf('class="complete-control'), 'title, ×, check');
  assert.match(tasksUi, /<div class="add-subtask-input"><input id="detail-subtask"/, 'no spacer for a left check');
  assert.match(rule('.subtask-row'), /display: flex; align-items: center;/);
  assert.match(rule('.subtask-row > .subtask-title'), /flex: 1; min-width: 0;/);
  assert.match(rule('.add-subtask-input'), /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(fn('renderFocusModal'), /<span class="subtask-title">\$\{esc\(subtask\.title\)\}<\/span><span class="complete-control/);
  assert.match(rule('.focus-subtask'), /grid-template-columns: minmax\(0, 1fr\) auto;/);
  const review = read('js/review-ui.js');
  assert.match(review, /ctx\.reviewTaskRow\(task, 'inbox', \{ today: true, inbox: true \}\)/);
  assert.match(review, /ctx\.reviewTaskRow\(task, 'today', \{ today: true, addToday: true \}\)/);
  assert.match(fn('renderAnytime'), /taskRow\(t, 'anytime', \{ today: true \}\)/);
  const search = fn('searchTaskResult');
  assert.match(search, /<span class="search-result-text"><span class="search-result-title">/);
  assert.match(search, /\$\{task\.isCompleted \? `<span class="search-result-done"><i class="ph-fill ph-check-circle" aria-label="\$\{tr\('Completed'\)\}"><\/i><\/span>` : ''\}<\/button>`/);
  assert.doesNotMatch(search, /ph ph-circle|style="color/);
  assert.match(rule('.search-result-text'), /flex: 1; min-width: 0;/);
  assert.match(rule('.search-result-done'), /color: var\(--success\);/);
});

test('8: dates and counts sit under the title', () => {
  const goalsUi = read('js/goals-ui.js');
  assert.match(goalsUi, /<span class="task-title">\$\{esc\(item\.title\)\}<\/span>\$\{item\.date \? `<span class="task-meta">\$\{esc\(ctx\.formatDate\(item\.date\)\)\}<\/span>` : ''\}<\/button><button class="btn-icon" type="button" data-action="delete-draft-goal-milestone"/);
  assert.match(rule('.goal-draft-milestone'), /grid-template-columns: minmax\(0, 1fr\) auto;/);
  const habits = moduleFor('js/habits-ui.js');
  const ctx = { Core, esc: String, state: { habitLogCache: {}, settings: {} }, habitMetrics: () => ({ currentPeriodCount: 2, currentPeriodTarget: 4 }) };
  const weekly = habits.renderRoute({ type: 'habit-today-row', habit: { id: 'g', name: 'Gym', trackingType: 'checkbox', frequencyType: 'timesPerWeek', status: 'active' }, todayStatus: { status: 'pending' } }, ctx);
  assert.match(weekly, /<span class="task-title">Gym<\/span><span class="task-meta">2\/4 weekly<\/span><\/button><button class="habit-check"/);
  assert.doesNotMatch(weekly, /task-side/);
  const numeric = habits.renderRoute({ type: 'habit-today-row', habit: { id: 'w', name: 'Water', trackingType: 'numeric', targetValue: 2, unit: 'l', frequencyType: 'daily', status: 'active' }, todayStatus: { status: 'pending', value: 1.5 } }, ctx);
  assert.match(numeric, /<span class="task-meta">1\.5 \/ 2 l<\/span>/);
  assert.match(rule('.review-row'), /display: grid; justify-items: start; gap: 2px;/);
});

test('9: list rows have no "›" arrow', () => {
  for (const [file, marker] of [['js/areas-ui.js', 'area-list-row'], ['js/templates-ui.js', 'template-list-row'], ['js/saved-views-ui.js', 'view-list-row']]) {
    const source = read(file);
    const line = source.split('\n').find(text => text.includes(`class="${marker}"`));
    assert.ok(line && !line.includes('ph-caret-right'), file);
  }
  assert.doesNotMatch(fn('projectOverviewRow'), /ph-caret-right/);
  assert.doesNotMatch(fn('renderTasksScreen'), /ph-caret-right/);
  assert.doesNotMatch(fn('renderTags'), /ph-caret-right/);
  for (const [selector, columns] of [['.area-list-row', 'auto minmax(0, 1fr)'], ['.tag-list-row', 'auto minmax(0, 1fr)'], ['.template-list-row', 'minmax(0, 1fr)'], ['.view-list-row', 'auto minmax(0, 1fr) auto'], ['.project-row', '18px minmax(0, 1fr)']]) {
    assert.match(rule(selector), new RegExp(`grid-template-columns: ${columns.replace(/[()]/g, '\\$&')};`), selector);
  }
});

test('10: the project screen and "Bez projekta" use the usual header with the color dot', () => {
  assert.match(fn('pageHeader'), /<h1 class="page-title">\$\{options\.color \? `<span class="project-dot" style="--project-color:\$\{esc\(options\.color\)\}" aria-hidden="true"><\/span>` : ''\}\$\{esc\(title\)\}<\/h1>/);
  const projects = moduleFor('js/projects-ui.js');
  const project = { id: 'p', name: 'Site', color: '#2fbf71', areaId: null };
  const ctx = {
    state: { goals: [], ui: {} }, esc, getProject: id => (id === 'p' ? project : null), getArea: () => null,
    projectTasks: () => [], renderProjectTaskRow: () => '', goalPercent: () => 0, looseTasks: () => [], taskRow: () => '',
    pageHeader: (title, subtitle, options) => `<header title="${title}" subtitle="${subtitle}" menu="${options.projectMenu || ''}" color="${options.color || ''}"></header>`,
  };
  const html = projects.renderRoute({ type: 'project', id: 'p' }, ctx);
  assert.match(html, /^<div class="screen-topbar"><button class="screen-back" type="button" data-route="tasks"><i class="ph ph-caret-left" aria-hidden="true"><\/i>Tasks<\/button><\/div><header title="Site" subtitle="0 open" menu="p" color="#2fbf71"><\/header>/);
  assert.match(html, /<p class="today-empty">No open tasks\.<\/p><button class="inline-add"/, '11: an empty project says so');
  const loose = projects.renderRoute({ type: 'project', id: 'none' }, ctx);
  assert.match(loose, /<header title="No project" subtitle="0 open" menu="" color=""><\/header>/);
  assert.match(loose, /<p class="today-empty">No sorted tasks without a project\.<\/p>/);
});

test('11: Sačuvani prikazi, Predstojeće and Pretraga have proper empty states', () => {
  const views = read('js/saved-views-ui.js');
  assert.match(views, /\$\{rows \|\| `<p class="today-empty">\$\{tr\('No saved views yet\. “\+” saves the filters you use often\.'\)\}<\/p>`\}/);
  assert.match(read('js/calendar-ui.js'), /ctx\.emptyState\(tr\('Nothing in the coming days'\), tr\('Planned tasks, due dates and deadlines of the next three weeks appear here\.'\)\)/);
  assert.doesNotMatch(fn('searchResultsHtml'), /style="border/, 'no inline styles on the empty states');
  assert.match(fn('searchResultsHtml'), /<div class="empty-state search-empty">/);
  assert.match(rule('.search-empty'), /border: 0; padding: 38px 12px;/);
});

test('12: "Novi projekat" is a sheet like "Nova oblast" with one big button', () => {
  const projects = moduleFor('js/projects-ui.js');
  const ctx = { modalState: { type: 'project', draft: { name: '', color: '#111111' }, error: '' }, modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`, PROJECT_COLORS: ['#111111', '#222222'], esc };
  const html = projects.renderRoute({ type: 'modal', modalType: 'project' }, ctx);
  assert.match(html, /^<frame quick><div class="modal-inner quick-sheet project-window"><div class="modal-header"><h2 class="modal-title">New project<\/h2>/);
  assert.match(html, /<input id="project-name" class="quick-title-input" type="text" maxlength="100" autocomplete="off" placeholder="Project name" value="" aria-label="Project name">/);
  assert.match(html, /<span class="habit-window-label">Color<\/span><div class="color-grid">/);
  assert.match(html, /<div class="quick-sheet-footer"><span><\/span><button class="btn btn-primary habit-window-save" type="button" data-action="save-project">Create project<\/button><\/div>/);
  assert.doesNotMatch(html, /field-label|modal-footer|data-action="close-modal">Cancel/);
});

test('the Serbian text', () => {
  for (const [en, value] of [['No open tasks.', 'Nema otvorenih zadataka.'], ['No sorted tasks without a project.', 'Nema razvrstanih zadataka bez projekta.'], ['No saved views yet. “+” saves the filters you use often.', 'Još nema sačuvanih prikaza. „+“ čuva filtere koje često koristiš.'], ['Planned tasks, due dates and deadlines of the next three weeks appear here.', 'Ovde se pojavljuju planirani zadaci, rokovi i ciljevi za naredne tri nedelje.']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
});

test('R17 shipped as 2.0.0-alpha.40 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 40);
});
