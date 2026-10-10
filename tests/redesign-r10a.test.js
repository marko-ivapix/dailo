// Redesign R10a: Oblasti and one area (S1, S2).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r10a-areas.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('js/app.js');
const areasUi = read('js/areas-ui.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const plain = value => JSON.parse(JSON.stringify(value));
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function moduleFor(source) {
  let adapter;
  runInNewContextWithI18n(source, { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: fn => fn() });
  return adapter;
}

function fixture(extra = {}) {
  const calls = [];
  const inputs = {};
  const state = {
    areas: [
      { id: 'a1', name: 'Work', color: '#4f8cff', icon: 'ph-briefcase', status: 'active', isPinned: true },
      { id: 'a2', name: 'Home', color: '#2fbf71', icon: 'ph-house', status: 'active', isPinned: false },
      { id: 'a3', name: 'Old', color: '#999999', icon: 'ph-heart', status: 'archived', isPinned: false },
    ],
    projects: [{ id: 'p1', name: 'Site', areaId: 'a1' }, { id: 'p2', name: 'Shop', areaId: 'a1' }, { id: 'p3', name: 'Past', areaId: 'a1', isArchived: true }],
    tasks: [
      ...Array.from({ length: 6 }, (_, index) => ({ id: `t${index}`, title: `Task ${index}`, projectId: index < 2 ? 'p1' : null, areaId: index < 2 ? null : 'a1', isCompleted: false })),
      { id: 'done', title: 'Done', areaId: 'a1', isCompleted: true },
      { id: 'inbox', title: 'Inbox', areaId: 'a1', isInbox: true },
      { id: 'gone', title: 'Archived project task', projectId: 'p3' },
    ],
    goals: [{ id: 'g1', title: 'Launch', areaId: 'a1', status: 'active' }, { id: 'g2', title: 'Paused', areaId: 'a1', status: 'paused' }],
    habits: [{ id: 'h1', name: 'Walk', areaId: 'a1', status: 'active' }, { id: 'h2', name: 'Old habit', areaId: 'a1', status: 'archived' }],
    notes: [{ id: 'n1', title: 'Older note', areaId: 'a1', updatedAt: '2026-09-01T10:00:00.000Z' }],
    resources: [{ id: 'r1', title: '<Guide>', areaId: 'a1', updatedAt: '2026-10-01T10:00:00.000Z' }],
    ui: {},
    ...extra.state,
  };
  const archivedProjects = new Set(state.projects.filter(project => project.isArchived).map(project => project.id));
  const ctx = {
    calls, inputs, state, Core, esc,
    AREA_ICONS: ['ph-briefcase', 'ph-house', 'ph-heart'], PROJECT_COLORS: ['#4f8cff', '#2fbf71'],
    sortedAreas: () => state.areas,
    getArea: id => state.areas.find(area => area.id === id),
    pageHeader: (title, subtitle, options) => `<header title="${title}" subtitle="${subtitle}" add="${options?.add}">${options?.actionHtml || ''}</header>`,
    emptyState: (title, text, cta, action) => `<empty ${title} ${action}>`,
    listTasks: () => state.tasks.filter(task => !archivedProjects.has(task.projectId)),
    projectOverviewRow: project => `<prow ${project.id}>`,
    renderAreaTaskRow: (task, areaId) => `<trow ${task.id} ${areaId}>`,
    renderGoalListRow: goal => `<grow ${goal.id}>`,
    renderHabitListRow: habit => `<hrow ${habit.id}>`,
    $: selector => (selector in inputs ? { value: inputs[selector], focus() {} } : null),
    modalState: null,
    setModalState: value => { ctx.modalState = value; },
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`,
    captureModalReturnFocus: () => {}, closePopover: () => calls.push(['closePopover']),
    openPopover: (anchor, html, meta) => calls.push(['open', html, meta]),
    renderModal: () => calls.push(['renderModal']), render: () => calls.push(['render']), saveAndRender: () => calls.push(['saveAndRender']),
    closeModal: () => { calls.push(['closeModal']); ctx.modalState = null; },
    saveState: () => { calls.push(['save']); return true; },
    setToastMessage: message => calls.push(['toast', message]),
    nowIso: () => '2026-10-10T08:00:00.000Z', uid: kind => `${kind}-1`,
    ...extra.ctx,
  };
  return ctx;
}
const act = (module, ctx, action, dataset = {}) => module.handleAction(action, { target: { closest: () => ({ dataset }) } }, ctx);

test('S1: "Oblasti" lists the active areas in one card with "+ Nova oblast"; no tabs and no row menus', () => {
  const ctx = fixture();
  const html = moduleFor(areasUi).renderRoute({ type: 'areas' }, ctx);
  assert.match(html, /^<header title="Areas" subtitle="2 active areas" add="false"><\/header><div class="today-card areas-list">/);
  // R17: list rows lost the "›" arrow.
  assert.match(html, /<button class="area-list-row" type="button" data-route="area\/a1"><i class="ph ph-briefcase area-list-icon" style="color:#4f8cff" aria-hidden="true"><\/i><span class="area-list-main"><span class="task-title">Work<\/span><span class="task-meta">2 projects · 6 open · 1 goal · pinned<\/span><\/span><\/button>/);
  assert.match(html, /data-route="area\/a2">[\s\S]*?<span class="task-meta">0 open<\/span>/, 'projects and goals only when there are any');
  assert.match(html, /<button class="inline-add" type="button" data-action="new-area"><i class="ph ph-plus" aria-hidden="true"><\/i> New area<\/button><\/div><section class="areas-fold"><button class="collapsible-trigger" type="button" data-action="areas-fold" aria-expanded="false"><span class="left"><i class="ph ph-caret-down" aria-hidden="true"><\/i> Archived areas · 1<\/span><\/button><\/section>$/);
  assert.doesNotMatch(html, /role="tab|data-tab=|area-menu|data-route="area\/a3"/);
  const module = moduleFor(areasUi);
  act(module, ctx, 'areas-fold');
  assert.equal(ctx.state.ui.areasArchivedOpen, true);
  const open = module.renderRoute({ type: 'areas' }, ctx);
  assert.match(open, /aria-expanded="true">[\s\S]*<div class="today-card"><div class="today-row goals-fold-row"><button class="today-row-main" type="button" data-route="area\/a3"><span class="task-title">Old<\/span><\/button><button class="quick-chip" type="button" data-action="restore-area" data-area-id="a3">Restore<\/button><\/div><\/div><\/section>$/);
  act(module, ctx, 'restore-area', { areaId: 'a3' });
  assert.equal(ctx.state.areas[2].status, 'active');
  assert.ok(ctx.calls.some(call => call[0] === 'toast' && call[1] === 'Area restored'));
  assert.equal(moduleFor(areasUi).renderRoute({ type: 'areas' }, fixture({ state: { areas: [] } })), '<header title="Areas" subtitle="0 active areas" add="false"></header><empty No areas yet. new-area>');
});

test('S1: the area window has the big name field, Boja, Ikonica and one big button; names stay unique', () => {
  const module = moduleFor(areasUi);
  const ctx = fixture();
  act(module, ctx, 'new-area');
  const html = module.renderRoute({ type: 'modal', modalType: 'area' }, ctx);
  assert.match(html, /^<frame quick><div class="modal-inner quick-sheet area-window"><div class="modal-header"><h2 class="modal-title">New area<\/h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"><\/i><\/button><\/div><input id="area-name" class="quick-title-input" type="text" maxlength="100" autocomplete="off" placeholder="Area name" value="" aria-label="Area name"><span class="habit-window-label">Color<\/span><div class="color-grid">/);
  assert.match(html, /<span class="habit-window-label">Icon<\/span><div class="area-icon-grid">[\s\S]*<\/div><div class="quick-sheet-footer"><span><\/span><button class="btn btn-primary habit-window-save" type="button" data-action="save-area">Create area<\/button><\/div><\/div><\/frame>$/);
  assert.doesNotMatch(html, /btn-ghost/);
  ctx.inputs['#area-name'] = ' ';
  act(module, ctx, 'save-area');
  assert.match(module.renderRoute({ type: 'modal', modalType: 'area' }, ctx), /<input id="area-name" class="quick-title-input is-error"[^>]*><div class="validation" role="alert">Area needs a name\.<\/div>/);
  ctx.inputs['#area-name'] = 'work';
  act(module, ctx, 'save-area');
  assert.equal(ctx.modalState.error, 'An area with this name already exists.');
  ctx.inputs['#area-name'] = 'Health';
  act(module, ctx, 'select-area-icon', { icon: 'ph-heart' });
  act(module, ctx, 'save-area');
  assert.deepEqual(plain(ctx.state.areas.at(-1)), { id: 'area-1', name: 'Health', color: '#2fbf71', icon: 'ph-heart', status: 'active', isPinned: false, createdAt: '2026-10-10T08:00:00.000Z', updatedAt: '2026-10-10T08:00:00.000Z' });
  assert.deepEqual(ctx.calls.slice(-4), [['save'], ['closeModal'], ['render'], ['toast', 'Area “Health” created']]);
  const edit = fixture();
  act(module, edit, 'edit-area', { areaId: 'a2', popAction: 'edit-area' });
  assert.match(module.renderRoute({ type: 'modal', modalType: 'area' }, edit), /<h2 class="modal-title">Edit area<\/h2>[\s\S]*value="Home"[\s\S]*data-action="save-area">Save changes<\/button>/);
  edit.inputs['#area-name'] = 'House';
  act(module, edit, 'save-area');
  assert.equal(edit.state.areas[1].name, 'House');
  assert.ok(!edit.calls.some(call => call[0] === 'toast'));
});

test('S2: one area has a summary line, sections with "+", rows and "Prikaži još"', () => {
  const ctx = fixture();
  const module = moduleFor(areasUi);
  let html = module.renderRoute({ type: 'area', id: 'a1' }, ctx);
  assert.match(html, /^<header title="Work" subtitle="2 projects · 6 open · 1 goal · 2 in the library" add="false"><button class="btn-icon" type="button" data-action="area-menu" data-area-id="a1" aria-label="Area actions"><i class="ph ph-dots-three"><\/i><\/button><\/header>/);
  const sections = [...html.matchAll(/<section class="section area-section"><div class="section-header"><h2 class="section-label">([^<]+)<\/h2><button class="btn-icon area-section-add" type="button" data-action="([a-z-]+)" data-area-id="a1"(?: data-owner-type="note")? aria-label="Add: ([^"]+)"><i class="ph ph-plus" aria-hidden="true"><\/i><\/button><\/div>/g)].map(match => match.slice(1));
  assert.deepEqual(sections, [['Projects · 2', 'area-new-project', 'Projects'], ['Tasks · 6', 'area-new-task', 'Tasks'], ['Goals · 1', 'area-new-goal', 'Goals'], ['Habits · 1', 'area-new-habit', 'Habits'], ['Notes and resources · 2', 'new-knowledge', 'Notes and resources']]);
  assert.match(html, /<div class="more-card"><prow p1><prow p2><\/div>/);
  assert.match(html, /<div class="task-list today-card"><trow t0 a1><trow t1 a1><trow t2 a1><trow t3 a1><trow t4 a1><button class="today-more" type="button" data-action="area-all-tasks" data-area-id="a1" aria-expanded="false">Show 1 more<\/button><\/div>/);
  assert.match(html, /<div class="today-card goals-list"><grow g1><\/div>/);
  assert.match(html, /<div class="today-card"><hrow h1><\/div>/);
  assert.match(html, /<div class="today-card"><div class="today-row area-library-row"><button class="today-row-main" type="button" data-route="resource\/r1"><span class="task-title"><i class="ph ph-link" aria-hidden="true"><\/i> &lt;Guide><\/span><span class="task-meta">Resource<\/span><\/button><\/div><div class="today-row area-library-row"><button class="today-row-main" type="button" data-route="note\/n1">/);
  assert.match(html, /data-action="new-knowledge" data-area-id="a1" data-owner-type="note" aria-label="Add: Notes and resources"/);
  act(module, ctx, 'area-all-tasks', { areaId: 'a1' });
  html = module.renderRoute({ type: 'area', id: 'a1' }, ctx);
  assert.match(html, /<trow t5 a1><button class="today-more" type="button" data-action="area-all-tasks" data-area-id="a1" aria-expanded="true">Show less<\/button>/);
  assert.doesNotMatch(html, /area-summary|area-empty-copy|No projects in this Area/);
});

test('S2: empty sections keep their header and "+"; an empty area says where to add; archived areas say so', () => {
  const ctx = fixture();
  const module = moduleFor(areasUi);
  const html = module.renderRoute({ type: 'area', id: 'a2' }, ctx);
  assert.match(html, /^<header title="Home" subtitle="0 open · 0 in the library" add="false">[\s\S]*?<\/header><p class="area-empty-hint">This area is empty\. Add a project, task, goal, habit or note with “\+”\.<\/p><section class="section area-section">/);
  assert.equal([...html.matchAll(/<section class="section area-section">/g)].length, 5);
  assert.match(html, /<h2 class="section-label">Projects · 0<\/h2><button[^>]*><i class="ph ph-plus" aria-hidden="true"><\/i><\/button><\/div><\/section>/);
  const archived = module.renderRoute({ type: 'area', id: 'a3' }, ctx);
  assert.match(archived, /subtitle="Archived area · 0 open · 0 in the library"/);
});

test('S2: the area menu holds Izmeni, Zakači u „Još“, Arhiviraj and Obriši', () => {
  const ctx = fixture();
  const module = moduleFor(areasUi);
  act(module, ctx, 'area-menu', { areaId: 'a1' });
  const menu = ctx.calls.at(-1)[1];
  assert.deepEqual([...menu.matchAll(/data-pop-action="([a-z-]+)"[^>]*><i class="ph [\w-]+"><\/i>([^<]+)</g)].map(match => match.slice(1)), [['edit-area', 'Edit area'], ['unpin-area', 'Unpin from “More”'], ['archive-area', 'Archive area'], ['delete-area', 'Delete area']]);
  act(module, ctx, 'area-menu', { areaId: 'a2' });
  assert.match(ctx.calls.at(-1)[1], /data-pop-action="pin-area" data-area-id="a2"><i class="ph ph-push-pin"><\/i>Pin to “More”</);
});

test('the goal and habit list rows and app.js wiring', () => {
  const goals = moduleFor(read('js/goals-ui.js'));
  const goalCtx = { state: { tasks: [], projects: [], habits: [], habitMetrics: {} }, Core, esc, formatDate: value => value };
  assert.match(goals.renderRoute({ type: 'goal-list-row', goal: { id: 'g', title: 'Launch', status: 'active', progressMode: 'manual', progressType: 'percentage', currentValue: 30, targetValue: 100, projectLinks: [], taskIds: [], habitLinks: [] } }, goalCtx), /^<button class="goal-list-row" type="button" data-route="goal\/g">/);
  const habits = moduleFor(read('js/habits-ui.js'));
  assert.equal(habits.renderRoute({ type: 'habit-list-row', habit: { id: 'h', name: '<Walk>', frequencyType: 'daily', status: 'active' } }, { esc, Core, state: { settings: {} } }), '<div class="today-row area-habit-row"><button class="today-row-main" type="button" data-route="habit/h"><span class="task-title">&lt;Walk></span><span class="task-meta">Daily</span></button></div>');
  assert.match(app, /renderAreaTaskRow\(task, areaId\) \{ return taskRow\(task, `area:\$\{areaId\}`, \{ today: true \}\); \}/);
  assert.match(app, /renderGoalListRow\(goal\) \{ return callDomainHook\('renderRoute', \{ type: 'goal-list-row', goal \}\) \|\| ''; \}/);
  assert.match(app, /renderHabitListRow\(habit\) \{ return callDomainHook\('renderRoute', \{ type: 'habit-list-row', habit \}\) \|\| ''; \}/);
  assert.match(app, /projectOverviewRow\(project\) \{ return projectOverviewRow\(project, listTasks\(\)\); \}/);
  assert.doesNotMatch(app, /handleAreaTabKeydown|areaTab|'area-tab'/);
  assert.doesNotMatch(areasUi, /areaTab|area-tabs|renderAreaKnowledge|areaSummaryCards/);
});

test('the R10a layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R10a'));
  assert.ok(layer.length > 20, 'R10a layer');
  for (const selector of ['.area-list-row', '.area-list-icon', '.area-section-add', '.area-empty-hint', '.area-window .quick-title-input']) assert.ok(layer.includes(selector), selector);
  for (const [en, value] of [['Notes and resources', 'Beleške i resursi'], ['Add: {name}', 'Dodaj: {name}'], ['Archived areas', 'Arhivirane'], ['pinned', 'zakačena'], ['Pin to “More”', 'Zakači u „Još“'], ['Unpin from “More”', 'Otkači iz „Još“'], ['Area “{name}” created', 'Oblast „{name}“ je napravljena'], ['This area is empty. Add a project, task, goal, habit or note with “+”.', 'Oblast je prazna. Dodaj projekat, zadatak, cilj, naviku ili belešku preko „+“.']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
  assert.match(sr, /"\{count\} in the library": \{ one: "\{count\} u biblioteci", few: "\{count\} u biblioteci", other: "\{count\} u biblioteci" \}/);
});

test('R10a shipped as 2.0.0-alpha.19 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 19);
});
