// Redesign R10d: Šabloni and Sačuvani prikazi (S7, S8).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r10d-templates-views.md
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
const templatesUi = read('js/templates-ui.js');
const viewsUi = read('js/saved-views-ui.js');
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const TODAY = Core.dateOnly();
const plain = value => JSON.parse(JSON.stringify(value));

function moduleFor(source) {
  let adapter;
  runInNewContextWithI18n(source, { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: fn => fn() });
  return adapter;
}

function fixture(extra = {}) {
  const calls = [];
  const inputs = {};
  const state = {
    templates: [
      { id: 'tp1', type: 'task', name: 'Weekly report', data: { title: 'Send report', subtasks: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] } },
      { id: 'tp2', type: 'task', name: 'Expenses', data: { title: 'Submit expenses', subtasks: [] } },
      { id: 'tp3', type: 'project', name: 'New client', data: { name: 'Client onboarding', tasks: [1, 2, 3, 4, 5].map(n => ({ title: `T${n}` })) } },
      { id: 'tp4', type: 'goal', name: 'Books', data: { title: 'Read 6 books', milestones: [{ title: '2' }, { title: '4' }, { title: '6' }] } },
    ],
    savedViews: [
      { id: 'v1', name: 'High · Work', type: 'tasks', filters: { areaId: 'a1', priority: 'high' }, isPinned: true },
      { id: 'v2', name: 'Numeric habits', type: 'habits', filters: { trackingType: 'numeric' }, isPinned: false },
      { id: 'v3', name: 'Every goal', type: 'goals', filters: {}, isPinned: false },
    ],
    tasks: [{ id: 't1', title: 'Ship', areaId: 'a1', priority: 'high', isCompleted: false }, { id: 't2', title: 'Tidy', areaId: 'a1', priority: 'low', isCompleted: false }],
    projects: [{ id: 'p1', name: 'Site' }], areas: [{ id: 'a1', name: 'Work' }], tags: [{ id: 'tag', name: 'Errand' }],
    goals: [{ id: 'g1', title: 'Launch', status: 'active' }],
    habits: [{ id: 'h1', name: 'Water', trackingType: 'numeric', status: 'active', frequencyType: 'daily' }, { id: 'h2', name: 'Walk', trackingType: 'checkbox', status: 'active', frequencyType: 'daily' }],
    ui: {},
    ...extra.state,
  };
  const ctx = {
    calls, inputs, state, Core, esc,
    templateTypes: ['task', 'project', 'habit', 'goal'], templateLabel: type => type,
    pageHeader: (title, subtitle, options) => `<header title="${title}" subtitle="${subtitle}">${options?.actionHtml || ''}</header>`,
    emptyState: (title, text) => `<empty ${title} | ${text}>`,
    formatDate: value => `D:${value}`,
    renderSavedViewItem: (view, item) => `<item ${view.type} ${item.id}>`,
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`,
    $: selector => (selector in inputs ? { value: inputs[selector], focus() {} } : null), $$: () => [],
    modalState: null, setModalState: value => { ctx.modalState = value; },
    captureModalReturnFocus() {}, copyTemplate: value => JSON.parse(JSON.stringify(value)),
    openPopover: (anchor, html, meta) => calls.push(['open', html, meta]), refreshSheet: html => calls.push(['refresh', html]),
    closePopover: () => calls.push(['closePopover']), renderModal: () => calls.push(['renderModal']), render: () => calls.push(['render']), saveAndRender: () => calls.push(['saveAndRender']),
    useTemplate: id => calls.push(['use', id]), duplicateTemplateRecord: id => calls.push(['duplicate-template', id]),
    requestDeleteEntity: (type, id) => calls.push(['delete', type, id]),
    saveSavedViewDraft: (id, draft) => calls.push(['save-view', id, JSON.parse(JSON.stringify(draft))]),
    duplicateSavedView: id => calls.push(['duplicate-view', id]), toggleSavedViewPin: id => calls.push(['pin-view', id]),
    ...extra.ctx,
  };
  return ctx;
}
const act = (module, ctx, action, dataset = {}) => module.handleAction(action, { target: { closest: () => ({ dataset }) } }, ctx);
const lastSheet = ctx => [...ctx.calls].reverse().find(call => call[0] === 'open' || call[0] === 'refresh')[1];

test('S7: templates are grouped by type with what they make; a tap opens a sheet with "Upotrebi šablon"', () => {
  const ctx = fixture();
  const module = moduleFor(templatesUi);
  const html = module.renderRoute({ type: 'templates' }, ctx);
  assert.match(html, /^<header title="Templates" subtitle="Reusable items with dates relative to the day you make them\."><\/header><section class="section templates-group"><div class="section-header"><h2 class="section-label"><i class="ph ph-check-square" aria-hidden="true"><\/i> Tasks · 2<\/h2><\/div><div class="today-card templates-list">/);
  assert.deepEqual([...html.matchAll(/<i class="ph ([\w-]+)" aria-hidden="true"><\/i> (\w+) · (\d)<\/h2>/g)].map(match => match.slice(1)), [['ph-check-square', 'Tasks', '2'], ['ph-folder', 'Projects', '1'], ['ph-target', 'Goals', '1']]);
  // R17: list rows lost the "›" arrow.
  assert.match(html, /<button class="template-list-row" type="button" data-action="template-open" data-template-id="tp1"><span class="template-list-main"><span class="task-title">Weekly report<\/span><span class="task-meta">Send report · 3 subtasks<\/span><\/span><\/button>/);
  assert.match(html, /data-template-id="tp2"><span class="template-list-main"><span class="task-title">Expenses<\/span><span class="task-meta">Submit expenses<\/span>/);
  assert.match(html, /<span class="task-meta">Client onboarding · 5 tasks<\/span>/);
  assert.match(html, /<span class="task-meta">Read 6 books · 3 milestones<\/span>/);
  assert.match(html, /<div class="today-card templates-add"><button class="inline-add" type="button" data-action="new-template"><i class="ph ph-plus" aria-hidden="true"><\/i> New template<\/button><\/div><p class="sheet-note templates-note">“Save as template” in the menu of a task, project, habit or goal also makes one\.<\/p>$/);
  assert.doesNotMatch(html, /data-template-type|view-tabs|data-action="use-template"/);
  assert.match(module.renderRoute({ type: 'templates' }, fixture({ state: { templates: [] } })), /<p class="today-empty">No templates yet\. Create one or save an existing item as a template\.<\/p><div class="today-card templates-add">/);
  act(module, ctx, 'template-open', { templateId: 'tp1' });
  assert.equal(lastSheet(ctx), '<div class="popover-title">Weekly report</div><p class="sheet-subtitle">Send report · 3 subtasks</p><button class="btn btn-primary sheet-primary" type="button" data-pop-action="use-template" data-template-id="tp1">Use template</button><div class="sheet-card"><button class="popover-option" type="button" data-pop-action="edit-template" data-template-id="tp1"><i class="ph ph-pencil-simple"></i>Edit template</button><button class="popover-option" type="button" data-pop-action="duplicate-template" data-template-id="tp1"><i class="ph ph-copy"></i>Duplicate template</button><button class="popover-option" type="button" style="color:var(--danger)" data-pop-action="delete-template" data-template-id="tp1"><i class="ph ph-trash"></i>Delete template</button></div>');
  act(module, ctx, 'use-template', { templateId: 'tp1', popAction: 'use-template' });
  act(module, ctx, 'duplicate-template', { templateId: 'tp1', popAction: 'duplicate-template' });
  act(module, ctx, 'delete-template', { templateId: 'tp1', popAction: 'delete-template' });
  assert.deepEqual(ctx.calls.filter(call => call[0] !== 'open').slice(-6), [['closePopover'], ['use', 'tp1'], ['closePopover'], ['duplicate-template', 'tp1'], ['closePopover'], ['delete', 'template', 'tp1']]);
});

test('S7: "+ Novi šablon" asks for the type, then opens the editor', () => {
  const ctx = fixture();
  const module = moduleFor(templatesUi);
  act(module, ctx, 'new-template');
  assert.deepEqual([...lastSheet(ctx).matchAll(/data-pop-action="new-template-type" data-template-type="(\w+)"><i class="ph [\w-]+" aria-hidden="true"><\/i>([^<]+)</g)].map(match => match.slice(1)), [['task', 'New task template'], ['project', 'New project template'], ['habit', 'New habit template'], ['goal', 'New goal template']]);
  act(module, ctx, 'new-template-type', { templateType: 'project', popAction: 'new-template-type' });
  assert.equal(ctx.modalState.type, 'template');
  assert.equal(ctx.modalState.draft.type, 'project');
});

test('S8: the view list shows the type, the pin, the filters and how many items each has now', () => {
  const ctx = fixture();
  const module = moduleFor(viewsUi);
  const html = module.renderRoute({ type: 'saved-views' }, ctx);
  assert.match(html, /^<header title="Saved Views" subtitle="Saved filters for one kind of item\."><\/header><div class="today-card views-list">/);
  // R17: list rows lost the "›" arrow.
  assert.match(html, /<button class="view-list-row" type="button" data-route="saved-view\/v1"><i class="ph ph-funnel view-list-icon" aria-hidden="true"><\/i><span class="view-list-main"><span class="task-title">High · Work<\/span><span class="task-meta">Tasks · pinned to “More” · Area: Work · Priority: High<\/span><\/span><span class="view-list-count">1<\/span><\/button>/);
  assert.match(html, /data-route="saved-view\/v2">[\s\S]*?<span class="task-meta">Habits · Tracking: Numeric<\/span><\/span><span class="view-list-count">1<\/span>/);
  assert.match(html, /data-route="saved-view\/v3">[\s\S]*?<span class="task-meta">Goals · All goals<\/span>/);
  assert.match(html, /<button class="inline-add" type="button" data-action="new-saved-view"><i class="ph ph-plus" aria-hidden="true"><\/i> New saved view<\/button><\/div>$/);
  assert.doesNotMatch(html, /btn-icon|edit-saved-view/);
});

test('S8: a view shows its items with the summary and count, and its menu', () => {
  const ctx = fixture();
  const module = moduleFor(viewsUi);
  assert.equal(module.renderRoute({ type: 'saved-view', id: 'v1' }, ctx), '<header title="High · Work" subtitle="Area: Work · Priority: High · 1"><button class="btn-icon" type="button" data-action="saved-view-menu" data-saved-view-id="v1" aria-label="View actions"><i class="ph ph-dots-three"></i></button></header><div class="task-list today-card"><item tasks t1></div>');
  assert.match(module.renderRoute({ type: 'saved-view', id: 'v3' }, ctx), /<div class="today-card goals-list"><item goals g1><\/div>$/);
  assert.match(module.renderRoute({ type: 'saved-view', id: 'v2' }, ctx), /<div class="today-card"><item habits h1><\/div>$/);
  ctx.state.savedViews[1].filters.trackingType = 'missing';
  assert.match(module.renderRoute({ type: 'saved-view', id: 'v2' }, ctx), /<empty No matching items \| Change this view’s filters for different results\.>$/);
  act(module, ctx, 'saved-view-menu', { savedViewId: 'v1' });
  assert.deepEqual([...lastSheet(ctx).matchAll(/data-pop-action="([a-z-]+)" data-saved-view-id="v1"><i class="ph [\w-]+"><\/i>([^<]+)</g)].map(match => match.slice(1)), [['edit-saved-view', 'Edit view'], ['duplicate-saved-view', 'Duplicate view'], ['pin-saved-view', 'Unpin from “More”'], ['delete-saved-view', 'Delete view']]);
  act(module, ctx, 'pin-saved-view', { savedViewId: 'v1', popAction: 'pin-saved-view' });
  act(module, ctx, 'delete-saved-view', { savedViewId: 'v1', popAction: 'delete-saved-view' });
  assert.deepEqual(ctx.calls.filter(call => call[0] !== 'open').slice(-4), [['closePopover'], ['pin-view', 'v1'], ['closePopover'], ['delete', 'saved-view', 'v1']]);
});

test('S8: the edit window has the name, the type segment, filter rows with sheets, the pin and the results now', () => {
  const ctx = fixture();
  const module = moduleFor(viewsUi);
  act(module, ctx, 'new-saved-view');
  let html = module.renderRoute({ type: 'modal', modalType: 'saved-view' }, ctx);
  assert.match(html, /^<frame quick><div class="modal-inner quick-sheet view-window"><div class="modal-header"><h2 class="modal-title">New saved view<\/h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"><\/i><\/button><\/div><input id="saved-view-name" class="quick-title-input" type="text" maxlength="80" autocomplete="off" placeholder="View name" value="" aria-label="View name"><h3 class="goal-details-label">Object type<\/h3><div class="view-tabs habit-window-seg" role="group" aria-label="Object type">/);
  assert.deepEqual([...html.matchAll(/data-action="saved-view-type" data-value="(\w+)" aria-pressed="(true|false)">(\w+)</g)].map(match => match.slice(1)), [['tasks', 'true', 'Tasks'], ['goals', 'false', 'Goals'], ['habits', 'false', 'Habits']]);
  const rows = html => [...html.matchAll(/data-action="saved-view-filter" data-field="(\w+)"><i class="ph [\w-]+" aria-hidden="true"><\/i><span class="task-window-row-label">([^<]+)<\/span><span class="task-window-row-value(?: is-set)?">([^<]*)</g)].map(match => match.slice(1));
  assert.deepEqual(rows(html), [['areaId', 'Area', 'Any'], ['projectId', 'Project', 'Any'], ['tagId', 'Tag', 'Any'], ['priority', 'Priority', 'Any'], ['plannedDate', 'Planned date (exact day)', 'Any'], ['dueDate', 'Due date (exact day)', 'Any'], ['completion', 'Completion', 'Any']]);
  assert.match(html, /<button class="view-pin-toggle" type="button" data-action="saved-view-draft-pin" aria-pressed="false"><span class="sheet-check" aria-hidden="true"><\/span>Pin to “More”<\/button><p class="sheet-note">Results now: 2<\/p><div class="quick-sheet-footer"><span><\/span><button class="btn btn-primary habit-window-save" type="button" data-action="save-saved-view">Save view<\/button><\/div><\/div><\/frame>$/);
  // A choice sheet and a date sheet
  act(module, ctx, 'saved-view-filter', { field: 'priority' });
  assert.deepEqual([...lastSheet(ctx).matchAll(/data-pop-action="saved-view-set-filter" data-field="priority" data-value="(\w*)"><span class="sheet-option-label">([^<]+)</g)].map(match => match.slice(1)), [['', 'Any'], ['none', 'None'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]);
  act(module, ctx, 'saved-view-set-filter', { field: 'priority', value: 'high', popAction: 'saved-view-set-filter' });
  assert.equal(ctx.modalState.draft.filters.priority, 'high');
  act(module, ctx, 'saved-view-filter', { field: 'plannedDate' });
  assert.match(lastSheet(ctx), /<input id="saved-view-date" class="input" type="date" value="">/);
  ctx.inputs['#saved-view-date'] = TODAY;
  act(module, ctx, 'saved-view-date-apply', { popAction: 'saved-view-date-apply' });
  assert.equal(ctx.modalState.draft.filters.plannedDate, TODAY);
  act(module, ctx, 'saved-view-filter', { field: 'plannedDate' });
  act(module, ctx, 'saved-view-date-clear', { popAction: 'saved-view-date-clear' });
  assert.equal('plannedDate' in ctx.modalState.draft.filters, false);
  html = module.renderRoute({ type: 'modal', modalType: 'saved-view' }, ctx);
  assert.deepEqual(rows(html)[3], ['priority', 'Priority', 'High']);
  assert.match(html, /Results now: 1</);
  // The type drops filters that do not apply; the pin toggles
  ctx.inputs['#saved-view-name'] = 'Habits only';
  act(module, ctx, 'saved-view-type', { value: 'habits' });
  assert.deepEqual(plain([ctx.modalState.draft.type, ctx.modalState.draft.filters, ctx.modalState.draft.name]), ['habits', {}, 'Habits only']);
  act(module, ctx, 'saved-view-draft-pin');
  assert.equal(ctx.modalState.draft.isPinned, true);
  // A name is required
  ctx.inputs['#saved-view-name'] = '  ';
  act(module, ctx, 'save-saved-view');
  assert.equal(ctx.modalState.error, 'Give this view a name.');
  assert.match(module.renderRoute({ type: 'modal', modalType: 'saved-view' }, ctx), /<input id="saved-view-name" class="quick-title-input is-error"[^>]*><div class="validation" role="alert">Give this view a name\.<\/div>/);
  ctx.inputs['#saved-view-name'] = 'Habits only';
  act(module, ctx, 'save-saved-view');
  assert.deepEqual(ctx.calls.at(-1), ['save-view', null, { name: 'Habits only', type: 'habits', filters: {}, isPinned: true }]);
  // Editing keeps a missing reference visible
  const edit = fixture();
  edit.state.savedViews[0].filters.areaId = 'gone';
  act(module, edit, 'edit-saved-view', { savedViewId: 'v1' });
  assert.match(module.renderRoute({ type: 'modal', modalType: 'saved-view' }, edit), /<h2 class="modal-title">Edit saved view<\/h2>[\s\S]*data-field="areaId">[\s\S]*?<span class="task-window-row-value is-set">Missing reference</);
});

test('app.js: copies are named "(kopija)", a saved view says so, and the floating "+" adds on both screens', () => {
  assert.match(app, /record\.name = tr\('\{name\} \(copy\)', \{ name: source\.name \}\);/);
  assert.match(app, /view\.name = tr\('\{name\} \(copy\)', \{ name: source\.name \}\);/);
  assert.doesNotMatch(app, /name \+= ' copy'/);
  assert.match(app, /setToastMessage\(tr\('Template duplicated'\)\)/);
  assert.match(app, /setToastMessage\(tr\('View duplicated'\)\)/);
  assert.match(app, /setToastMessage\(tr\('View saved'\)\)/);
  assert.match(app, /'#templates': \[msg\('New template'\), \(\) => callDomainHook\('handleAction', 'new-template', \{ target: \$\('#mobile-quick-add-toggle'\) \}\)\]/);
  assert.match(app, /'#saved-views': \[msg\('New saved view'\), \(\) => callDomainHook\('handleAction', 'new-saved-view', \{ target: \$\('#mobile-quick-add-toggle'\) \}\)\]/);
  assert.match(app, /duplicateTemplateRecord, useTemplate,/);
  assert.doesNotMatch(app, /ui\.templateType|data-template-type/);
});

test('the R10d layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R10d'));
  assert.ok(layer.length > 20, 'R10d layer');
  for (const selector of ['.template-list-row', '.templates-note', '.sheet-primary', '.view-list-row', '.view-list-count', '.view-window .quick-title-input', '.view-pin-toggle']) assert.ok(layer.includes(selector), selector);
  for (const [en, value] of [['Reusable items with dates relative to the day you make them.', 'Stavke za ponovnu upotrebu, sa datumima u odnosu na dan kad ih praviš.'], ['Saved filters for one kind of item.', 'Sačuvani filteri za jednu vrstu stavki.'], ['pinned to “More”', 'zakačen u „Još“'], ['View name', 'Naziv prikaza'], ['Filters', 'Filteri'], ['Results now: {count}', 'Rezultata sada: {count}'], ['{name} (copy)', '{name} (kopija)'], ['Template duplicated', 'Šablon je dupliran'], ['View duplicated', 'Prikaz je dupliran'], ['View saved', 'Prikaz je sačuvan'], ['No matching items', 'Nema odgovarajućih stavki'], ['View actions', 'Radnje za prikaz']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
  assert.match(sr, /"\{count\} milestones": \{ one: "\{count\} etapa", few: "\{count\} etape", other: "\{count\} etapa" \}/);
});

test('R10d shipped as 2.0.0-alpha.22 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 22);
});
