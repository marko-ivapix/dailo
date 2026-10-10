// Redesign R5: Zadaci (Kad stignem by project, Projekti by area) and the project screen (Z1–Z7, S10).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r5-tasks.md
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

function fixture() {
  const projects = [
    { id: 'p1', name: 'Selidba', color: '#111111', areaId: 'a1', order: 0, isArchived: false },
    { id: 'p2', name: 'Stari', color: '#222222', areaId: null, order: 1, isArchived: true },
    { id: 'p3', name: 'Ostalo', color: '#333333', areaId: null, order: 2, isArchived: false },
  ];
  const tasks = [
    { id: 'a', title: 'Loose', projectId: null, isInbox: false },
    { id: 'b', title: 'Pack', projectId: 'p1', isInbox: false, dueDate: day(2) },
    { id: 'c', title: 'Planned', projectId: 'p1', isInbox: false, plannedDate: day(1) },
    { id: 'd', title: 'Archived', projectId: 'p2', isInbox: false },
    { id: 'e', title: 'Captured', projectId: null, isInbox: true },
    { id: 'f', title: 'Done', projectId: 'p1', isInbox: false, isCompleted: true },
  ];
  return { projects, tasks, areas: [{ id: 'a1', name: 'Kuća', status: 'active' }] };
}

function screenContext(ui = {}) {
  const { projects, tasks, areas } = fixture();
  const ctx = {
    Core, esc, state: { tasks, projects, areas, goals: [], ui: { tasksView: 'anytime', ...ui } },
    getProject: id => projects.find(project => project.id === id), getArea: id => areas.find(area => area.id === id),
    sortedProjects: () => projects.filter(project => !project.isArchived), sortedAreas: () => areas,
    pageHeader: (title, subtitle) => `<header title="${title}" subtitle="${subtitle}"></header>`,
    taskRow: (task, context, options) => `<row ${task.id} ${context}${options?.today ? ' today' : ''}${options?.hidePlace ? ' noplace' : ''}>`,
    emptyState: title => `<empty ${title}>`, formatDate: date => `F(${date})`,
  };
  vm.createContext(withI18n(ctx));
  vm.runInContext(['listTasks', 'todayDueLabel', 'projectOverviewRow', 'renderTasksScreen'].map(fn).join(''), ctx);
  return ctx;
}

test('Z5: Kad stignem groups open unplanned tasks by project, "Bez projekta" first; archived and Inbox tasks stay out', () => {
  const ctx = screenContext();
  const html = ctx.renderTasksScreen();
  assert.match(html, /<header title="Tasks" subtitle="3 open tasks · 2 projects"><\/header>/);
  assert.match(html, /data-action="tasks-view" data-view="anytime" aria-pressed="true">Anytime · 2<\/button>/);
  assert.match(html, /<p class="tasks-note">Sorted tasks without a planned day, by project\.<\/p>/);
  const groups = [...html.matchAll(/<h2 class="section-label tasks-group-label">(?:<span class="project-dot" style="--project-color:#\w+" aria-hidden="true"><\/span>)?([^<]+)<\/h2><span class="section-count">(\d+)<\/span>/g)].map(match => [match[1], match[2]]);
  assert.deepEqual(groups, [['No project', '1'], ['Selidba', '1']]);
  assert.match(html, /<row a anytime today>/);
  assert.match(html, /<row b anytime today noplace>/, 'the project name is not repeated inside its group');
  for (const gone of ['<row c', '<row d', '<row e', '<row f']) assert.ok(!html.includes(gone), gone);
  assert.match(html, /<button class="inline-add" type="button" data-action="quick-add" data-anytime="true">/);
  assert.match(sr, /"Sorted tasks without a planned day, by project\.": "Razvrstani zadaci bez planiranog dana, po projektima\."/);
});

test('Z6: Projekti has "Bez projekta", the projects grouped by area with counts, due dates and bars, and "+ Novi projekat"', () => {
  const ctx = screenContext({ tasksView: 'projects' });
  const html = ctx.renderTasksScreen();
  assert.match(html, /<button class="project-row" type="button" data-route="project\/none"><i class="ph ph-tray project-row-icon" aria-hidden="true"><\/i><span class="project-row-main"><span class="task-title">No project<\/span><span class="task-meta">1 open<\/span><\/span><i class="ph ph-caret-right" aria-hidden="true"><\/i><\/button>/);
  assert.match(html, /<h2 class="section-label tasks-group-label">Kuća<\/h2><span class="section-count">1<\/span>/);
  assert.match(html, /<h2 class="section-label tasks-group-label">No area<\/h2><span class="section-count">1<\/span>/);
  assert.ok(html.indexOf('Selidba') < html.indexOf('Ostalo'));
  assert.doesNotMatch(html, /Stari/, 'archived projects stay in Arhiva');
  const row = ctx.projectOverviewRow(ctx.state.projects[0], ctx.listTasks());
  assert.match(row, /^<button class="project-row" type="button" data-route="project\/p1"><span class="project-dot" style="--project-color:#111111" aria-hidden="true"><\/span><span class="project-row-main"><span class="task-title">Selidba<\/span><span class="task-meta">2 open · <span class="task-due">Due F\(/);
  assert.match(row, /<span class="project-row-bar" aria-hidden="true"><i style="width:33%;background:#111111"><\/i><\/span>/, '1 of 3 tasks done');
  assert.match(html, /data-action="new-project"/);
  assert.match(sr, /"\{count\} open": \{ one: "\{count\} otvoren", few: "\{count\} otvorena", other: "\{count\} otvorenih" \}/);
});

function projectModule() {
  let module;
  runInNewContextWithI18n(read('js/projects-ui.js'), { window: { TodoDomainModules: { register(value) { module = value; } } } });
  return module;
}

function projectCtx(extra = {}) {
  const { projects, tasks, areas } = fixture();
  const goals = [{ id: 'g1', title: 'Novi stan', status: 'active', projectLinks: [{ projectId: 'p1', contributionMode: 'allTasks', selectedTaskIds: [] }] }];
  return {
    state: { projects, tasks, areas, goals, ui: { projectCompletedExpanded: {} } }, esc, Core,
    getProject: id => projects.find(project => project.id === id), getArea: id => areas.find(area => area.id === id),
    projectTasks: (id, done) => tasks.filter(task => task.projectId === id && Boolean(task.isCompleted) === done),
    looseTasks: done => tasks.filter(task => !task.projectId && !task.isInbox && Boolean(task.isCompleted) === done),
    renderProjectTaskRow: (task, id, options) => `<row ${task.id}${options?.draggable ? ' drag' : ''}${options?.today ? ' today' : ''}${options?.hidePlace ? ' noplace' : ''}${options?.completed ? ' done' : ''}>`,
    taskRow: (task, context, options) => `<row ${task.id} ${context}${options?.today ? ' today' : ''}>`,
    goalPercent: () => 45, pageHeader: () => '', emptyState: () => '',
    ...extra,
  };
}

test('Z7: the project screen has "‹ Zadaci", ⋯, the color, area · counts, the goal, the tasks, "+ Dodaj zadatak" and done folded', () => {
  const html = projectModule().renderRoute({ type: 'project', id: 'p1' }, projectCtx());
  assert.match(html, /^<div class="screen-topbar"><button class="screen-back" type="button" data-route="tasks"><i class="ph ph-caret-left" aria-hidden="true"><\/i>Tasks<\/button><button class="btn-icon" type="button" data-action="project-menu" data-project-id="p1" aria-label="Project menu">/);
  assert.match(html, /<h1 class="page-title project-title"><span class="project-dot" style="--project-color:#111111" aria-hidden="true"><\/span>Selidba<\/h1><p class="page-subtitle">Kuća · 2 open · 1 done<\/p>/);
  assert.match(html, /<button class="project-goal-link" type="button" data-route="goal\/g1"><i class="ph ph-target" aria-hidden="true"><\/i>Goal: Novi stan · 45%<\/button>/);
  assert.match(html, /<div class="task-list today-card" data-list-context="project:p1"><row b drag today noplace><row c drag today noplace><\/div><button class="inline-add" type="button" data-action="quick-add" data-project-id="p1">/);
  assert.match(html, /data-action="toggle-project-completed" data-project-id="p1" aria-expanded="false"><span class="left"><i class="ph ph-check-circle"><\/i> Completed<\/span><span>1 /);
  assert.doesNotMatch(html, /project-archived-notice/);
});

test('S10: an archived project opens read-only with "Arhiviran projekat" and "Vrati"', () => {
  const ctx = projectCtx();
  const html = projectModule().renderRoute({ type: 'project', id: 'p2' }, ctx);
  assert.match(html, /<section class="weekly-review-notice project-archived-notice" role="status"><i class="ph ph-archive weekly-review-notice-icon" aria-hidden="true"><\/i><div class="backup-reminder-copy"><strong>Archived project<\/strong><span>Its tasks stay out of every list until you restore it\.<\/span><\/div><div class="backup-reminder-actions"><button class="btn btn-secondary" type="button" data-action="restore-project" data-project-id="p2">Restore<\/button><\/div><\/section>/);
  assert.match(html, /<row d today noplace>/, 'no drag');
  assert.doesNotMatch(html, /data-action="quick-add"/);
  assert.match(sr, /"Its tasks stay out of every list until you restore it\.": "Njegovi zadaci se ne vide u listama dok ga ne vratiš\."/);
});

test('"Bez projekta" lists sorted tasks without a project, adds outside Inbox and folds the done ones', () => {
  const html = projectModule().renderRoute({ type: 'project', id: 'none' }, projectCtx());
  assert.match(html, /<h1 class="page-title project-title">No project<\/h1><p class="page-subtitle">1 open<\/p>/);
  assert.match(html, /<div class="task-list today-card"><row a anytime today><\/div><button class="inline-add" type="button" data-action="quick-add" data-anytime="true">/);
  assert.doesNotMatch(html, /<row e/, 'Inbox stays in Inbox');
  assert.match(html, /<p class="tasks-note">Sorted tasks that belong to no project\.<\/p>/);
  assert.doesNotMatch(html, /data-action="project-menu"/);
});

test('S10: Today, Zadaci and Predstojeće read tasks through listTasks, which leaves archived projects out', () => {
  const ctx = screenContext();
  assert.deepEqual(Array.from(ctx.listTasks(), task => task.id), ['a', 'b', 'c', 'e', 'f']);
  assert.match(fn('renderToday'), /Core\.deriveTodayV3\(\{ \.\.\.state, tasks: listTasks\(\) \}/);
  assert.match(fn('renderUpcoming'), /Core\.deriveUpcomingV3\(\{ \.\.\.state, tasks: listTasks\(\) \}, today\)/);
  assert.match(fn('addAllSuggestions'), /Core\.deriveTodaySections\(listTasks\(\), Core\.dateOnly\(\)\)/);
});

function sheetCtx() {
  const calls = [];
  const { projects, areas } = fixture();
  const goals = [{ id: 'g1', title: 'Novi stan', status: 'active', projectLinks: [], taskIds: [], habitLinks: [] }, { id: 'g2', title: 'Staro', status: 'archived', projectLinks: [] }];
  const ctx = {
    calls, esc, Core, state: { projects, areas, goals },
    getProject: id => projects.find(project => project.id === id), sortedAreas: () => areas,
    openPopover: (anchor, html, meta) => calls.push(['open', html, meta]), closePopover: () => calls.push(['close']),
    nowIso: () => 'now', saveState: () => calls.push(['save']), render: () => calls.push(['render']),
    captureGoalProgress: () => 'before', evaluateGoalProgressChanges: value => calls.push(['evaluate', value]),
    syncGoalLinks: (goal, links) => { goal.projectLinks = links; calls.push(['sync', goal.id, links]); },
    putGoalHistory: (id, kind, data) => calls.push(['history', id, kind, data]),
  };
  vm.createContext(withI18n(ctx));
  vm.runInContext(`let projectGoalSheet = null;\n${['openProjectAreaSheet', 'setProjectArea', 'openProjectGoalsSheet', 'applyProjectGoals'].map(fn).join('')}`, ctx);
  return ctx;
}

test('the project menu sets the area at once and links goals with "Primeni"', () => {
  const ctx = sheetCtx();
  ctx.openProjectAreaSheet({}, 'p3');
  const area = ctx.calls.at(-1)[1];
  assert.match(area, /^<div class="popover-title">Area<\/div><p class="sheet-subtitle">Ostalo<\/p>/);
  assert.match(area, /class="popover-option sheet-option is-selected" type="button" data-pop-action="set-project-area" data-project-id="p3" data-area-id=""><span class="sheet-option-label">No area<\/span>/);
  assert.match(area, /data-pop-action="set-project-area" data-project-id="p3" data-area-id="a1"><span class="sheet-option-label">Kuća<\/span>/);
  ctx.setProjectArea('p3', 'a1');
  assert.equal(ctx.state.projects[2].areaId, 'a1');
  assert.deepEqual(ctx.calls.slice(-3), [['close'], ['save'], ['render']]);

  ctx.openProjectGoalsSheet({}, 'p1');
  const goals = ctx.calls.at(-1)[1];
  assert.match(goals, /^<div class="popover-title">Linked goals<\/div>/);
  assert.match(goals, /data-pop-action="project-goal-toggle" data-goal-id="g1" aria-pressed="false">/);
  assert.doesNotMatch(goals, /Staro/, 'archived goals are not offered');
  vm.runInContext("projectGoalSheet.ids.add('g1')", ctx);
  ctx.applyProjectGoals();
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.find(call => call[0] === 'sync'))), ['sync', 'g1', [{ projectId: 'p1', contributionMode: 'allTasks', selectedTaskIds: [] }]]);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.find(call => call[0] === 'history'))), ['history', 'g1', 'projectLinked', { projectId: 'p1' }]);
  assert.deepEqual(ctx.calls.find(call => call[0] === 'evaluate'), ['evaluate', 'before']);
  const menu = read('js/projects-ui.js');
  assert.match(menu, /data-pop-action="project-area" data-project-id="\$\{esc\(projectId\)\}"><i class="ph ph-squares-four"><\/i>\$\{tr\('Area'\)\}/);
  assert.match(menu, /data-pop-action="project-goals" data-project-id="\$\{esc\(projectId\)\}"><i class="ph ph-target"><\/i>\$\{tr\('Linked goals'\)\}/);
});

test('the floating "+" adds a task for the screen it is on', () => {
  const ctx = { state: { ui: { tasksView: 'anytime' } }, route: { type: 'today' }, currentRoute: () => ctx.route, getProject: id => ({ p1: { id: 'p1' }, p2: { id: 'p2', isArchived: true } })[id] };
  vm.createContext(ctx);
  vm.runInContext(fn('routeQuickAddContext'), ctx);
  const at = route => { ctx.route = route; return JSON.parse(JSON.stringify(ctx.routeQuickAddContext())); };
  assert.deepEqual(at({ type: 'today' }), { today: true });
  assert.deepEqual(at({ type: 'project', id: 'p1' }), { projectId: 'p1' });
  assert.equal(at({ type: 'project', id: 'p2' }), null, 'archived: restore first');
  assert.deepEqual(at({ type: 'project', id: 'none' }), { anytime: true });
  assert.deepEqual(at({ type: 'tasks' }), { anytime: true });
  assert.deepEqual(at({ type: 'inbox' }), {});
  assert.match(app, /else if \(action === 'quick-add'\) \{ const context = el\.closest\('#mobile-quick-add-menu'\) \? routeQuickAddContext\(\) : \{ projectId: el\.dataset\.projectId \|\| null, areaId: el\.dataset\.areaId \|\| null, today: el\.dataset\.today === 'true', anytime: el\.dataset\.anytime === 'true' \}; if \(context\) openQuickAdd\(context\); else setToastMessage\(tr\('Restore the project to add tasks\.'\)\); \}/);
  assert.match(sr, /"Restore the project to add tasks\.": "Vrati projekat da bi dodao zadatke\."/);
});

test('R5 is released as 2.0.0-alpha.10', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.10');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.10';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.10');
});
