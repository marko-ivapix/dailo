// Redesign R11d: "Redovne obaveze" and groups (S4, M4).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r11d-recurring-screen.md
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
const css = read('css/styles.css');
const sr = read('js/i18n-sr.js');
const plain = value => JSON.parse(JSON.stringify(value));
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const TODAY = '2026-10-10';
const rule = (extra = {}) => ({ frequency: 'weekly', interval: 1, weekdays: [6], status: 'active', endType: 'never', endDate: null, endAfterOccurrences: null, occurrencesCreated: 0, skipNext: false, seriesId: 's', ...extra });

function load() {
  let adapter;
  runInNewContextWithI18n(read('js/cleaning-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } }, requestAnimationFrame: fn => fn() });
  return adapter;
}

function fixture() {
  return {
    areas: [{ id: 'home', name: 'Home', status: 'active' }],
    projects: [
      { id: 'g1', name: 'Kupatilo', isCleaningRoom: true, isArchived: false, areaId: 'home', order: 0, color: '#4da3ff', goalIds: [] },
      { id: 'g2', name: 'Auto', isCleaningRoom: true, isArchived: false, areaId: 'home', order: 1, color: '#4da3ff', goalIds: [] },
      { id: 'g3', name: 'Bašta', isCleaningRoom: true, isArchived: true, areaId: 'home', order: 2, color: '#4da3ff', goalIds: [] },
      { id: 'p1', name: 'Finansije', isArchived: false, areaId: null, order: 3, color: '#2fbf71', goalIds: [] },
      { id: 'p2', name: 'Sajt', isArchived: false, areaId: null, order: 4, color: '#f5a524', goalIds: [] },
      { id: 'p3', name: 'Stari', isArchived: true, areaId: null, order: 5, color: '#999999', goalIds: [] },
    ],
    tasks: [
      { id: 'late', title: 'Clean bathroom', projectId: 'g1', plannedDate: '2026-10-08', dueDate: '2026-10-08', recurrence: rule() },
      { id: 'soon', title: 'Check boiler', projectId: 'g1', plannedDate: '2026-10-14', dueDate: null, recurrence: rule({ frequency: 'monthly', weekdays: undefined, monthMode: 'day', monthDay: 14 }) },
      { id: 'done', title: 'Clean bathroom', projectId: 'g1', plannedDate: '2026-10-01', isCompleted: true, completedAt: '2026-10-01T10:00:00.000Z', recurrence: rule() },
      { id: 'car', title: 'Registration', projectId: 'g2', plannedDate: '2026-11-20', dueDate: '2026-11-20', recurrence: rule({ frequency: 'yearly', weekdays: undefined }) },
      { id: 'pay', title: 'Pay internet', projectId: 'p1', plannedDate: TODAY, dueDate: TODAY, recurrence: rule({ frequency: 'monthly', weekdays: undefined, monthMode: 'day', monthDay: 10 }) },
      { id: 'loose', title: 'Water plants', projectId: null, plannedDate: '2026-10-11', recurrence: rule({ frequency: 'daily', weekdays: undefined, interval: 3 }) },
      { id: 'plain', title: 'One-off', projectId: 'p2', plannedDate: TODAY },
      { id: 'ended', title: 'Old chore', projectId: 'g1', plannedDate: TODAY, recurrence: rule({ status: 'ended' }) },
      { id: 'inbox', title: 'Inbox repeat', projectId: null, isInbox: true, recurrence: rule() },
      { id: 'garden', title: 'Mow', projectId: 'g3', plannedDate: TODAY, recurrence: rule() },
      { id: 'archived', title: 'Archived project repeat', projectId: 'p3', plannedDate: TODAY, recurrence: rule() },
    ],
    goals: [], resources: [], savedViews: [], ui: {}, settings: {},
  };
}

function context(state = fixture(), extra = {}) {
  const calls = [];
  const projects = () => state.projects.slice().sort((a, b) => a.order - b.order);
  const ctx = {
    calls, state, esc, Core: { ...Core, dateOnly: value => (value ? Core.dateOnly(value) : TODAY) },
    pageHeader: (title, subtitle) => `<header title="${title}" subtitle="${subtitle}"></header>`,
    allProjects: projects, sortedProjects: () => projects().filter(project => !project.isArchived),
    getProject: id => state.projects.find(project => project.id === id) || null,
    taskRecurrence: task => task?.recurrenceBaseline?.recurrence || task?.recurrence,
    recurrenceLabel: value => `R:${value.frequency}${value.status === 'paused' ? ' · paused' : ''}`,
    relativeDateLabel: value => `L:${value}`, formatDate: value => `F:${value}`,
    renderChoreRow: (task, options) => `<row id="${task.id}" meta="${options.metaText}" side='${options.sideHtml}'></row>`,
    uid: kind => `${kind}-new`, nowIso: () => '2026-10-10T08:00:00.000Z',
    $: selector => ctx.inputs[selector] || null, inputs: {},
    openPopover: (anchor, html, meta) => calls.push(['open', meta?.type, html]), refreshSheet: html => calls.push(['refresh', html]), closePopover: () => calls.push(['close']),
    saveState: () => calls.push(['save']), render: () => calls.push(['render']), saveAndRender: () => calls.push(['saveAndRender']), navigate: route => calls.push(['navigate', route]),
    setUndo: (message, undo) => calls.push(['undo', message, undo]), setToastMessage: message => calls.push(['toast', message]),
    openConfirm: config => calls.push(['confirm', config]),
    ...extra,
  };
  return ctx;
}
const render = (ctx, adapter = load()) => adapter.renderRoute({ type: 'cleaning' }, ctx);
const sectionTitles = html => [...html.matchAll(/<h2 class="cleaning-section-title">([\s\S]*?)<span class="cleaning-section-count"> · (\d+)<\/span><\/h2>/g)].map(match => `${match[1].replace(/<[^>]+>/g, '')} ${match[2]}`);
const rowIds = html => [...html.matchAll(/<row id="([^"]+)"/g)].map(match => match[1]);

test('S4: everything that repeats, with "Ove nedelje" first and groups, projects and "Bez grupe" after', () => {
  const html = render(context());
  assert.match(html, /^<header title="Recurring tasks" subtitle="5 tasks repeat · 1 late"><\/header>/);
  assert.deepEqual([...html.matchAll(/data-action="cleaning-filter" data-value="([^"]+)" aria-pressed="(\w+)">([^<]+)</g)].map(match => `${match[3]}${match[2] === 'true' ? '*' : ''}`), ['All*', 'Kupatilo', 'Auto', 'From projects']);
  assert.match(html, /<button class="quick-chip cleaning-add-group" type="button" data-action="new-cleaning-group">\+ Group<\/button>/);
  assert.deepEqual(sectionTitles(html), ['This week 4', 'Kupatilo 2', 'Auto 1', 'Finansije 1', 'No group 1']);
  const week = html.slice(html.indexOf('data-cleaning-section="week"'), html.indexOf('data-cleaning-section="g1"'));
  assert.deepEqual(rowIds(week), ['late', 'pay', 'loose', 'soon'], 'late or within 7 days, by date');
  assert.match(week, /<row id="late" meta="Kupatilo · R:weekly" side='<span class="task-due is-overdue">Overdue · F:2026-10-08<\/span>'>/);
  assert.match(week, /<row id="pay" meta="Finansije · R:monthly" side='<span class="task-due is-today">Today<\/span>'>/);
  assert.match(week, /<row id="loose" meta="No group · R:daily" side='<span class="task-due">Tomorrow<\/span>'>/);
  assert.match(week, /<row id="soon" meta="Kupatilo · R:monthly" side='<span class="task-due">F:2026-10-14<\/span>'>/);
  const group = html.slice(html.indexOf('data-cleaning-section="g1"'), html.indexOf('data-cleaning-section="g2"'));
  assert.match(group, /<button class="btn-icon" type="button" data-action="cleaning-group-menu" data-project-id="g1" aria-label="Group actions"><i class="ph ph-dots-three"><\/i><\/button>/);
  assert.deepEqual(rowIds(group), ['late', 'soon'], 'the fold is closed');
  assert.match(group, /<row id="late" meta="R:weekly"/, 'no place inside its own section');
  assert.match(group, /<button class="inline-add cleaning-add" type="button" data-action="new-cleaning-chore" data-project-id="g1"><i class="ph ph-plus"><\/i> Add a chore<\/button>/);
  assert.match(group, /<button class="collapsible-trigger cleaning-done-toggle" type="button" data-action="toggle-cleaning-completed" data-project-id="g1" aria-expanded="false"><span class="left">Completed · 1<\/span>/);
  const project = html.slice(html.indexOf('data-cleaning-section="p1"'), html.indexOf('data-cleaning-section="none"'));
  assert.match(project, /<button class="cleaning-project-link" type="button" data-route="project\/p1"><span class="project-dot" style="--project-color:#2fbf71" aria-hidden="true"><\/span>Finansije<\/button>/);
  assert.match(project, /<span class="cleaning-section-kind">project<\/span>/);
  assert.doesNotMatch(project, /new-cleaning-chore/);
  assert.match(html, /<button class="collapsible-trigger" type="button" data-action="cleaning-archived-fold" aria-expanded="false"><span class="left">Archived groups · 1<\/span>/);
  assert.match(html, /<p class="sheet-note cleaning-note">Everything that repeats is here/);
  for (const id of ['plain', 'ended', 'inbox', 'garden', 'archived']) assert.ok(!rowIds(html).includes(id), id);
});

test('S4: chips filter, the done fold, archived groups with "Vrati", and the empty state', () => {
  const state = fixture();
  state.ui = { cleaningRoomFilter: 'g1', cleaningCompletedExpanded: { g1: true }, cleaningArchivedOpen: true };
  let html = render(context(state));
  assert.deepEqual(sectionTitles(html), ['Kupatilo 2'], 'one group, without "Ove nedelje"');
  assert.match(html, /<row id="done" meta="Completed L:2026-10-01" side=''>/);
  assert.match(html, /<div class="cleaning-archived-row"><span class="cleaning-archived-name">Bašta<small>1 chore<\/small><\/span><button class="btn btn-secondary" type="button" data-action="restore-cleaning-group" data-project-id="g3">Restore<\/button><\/div>/);
  state.ui.cleaningRoomFilter = 'projects';
  assert.deepEqual(sectionTitles(render(context(state))), ['Finansije 1']);
  state.ui.cleaningRoomFilter = 'gone';
  assert.equal(sectionTitles(render(context(state)))[0], 'This week 4', 'an unknown filter falls back to "Sve"');
  const empty = render(context({ ...fixture(), projects: [], tasks: [] }));
  assert.match(empty, /<div class="empty-state"><h3>No recurring tasks yet<\/h3><p>Make a group \(home, car, garden…\), then add chores that repeat\.<\/p><div class="sheet-chips cleaning-chips"><button class="quick-chip" type="button" data-action="add-cleaning-examples" data-cleaning-preset="apartment">Example: apartment<\/button><button class="quick-chip" type="button" data-action="add-cleaning-examples" data-cleaning-preset="house">Example: house<\/button><button class="quick-chip cleaning-add-group" type="button" data-action="new-cleaning-group">\+ Group<\/button><\/div><\/div>/);
});

const act = (adapter, ctx, action, data = {}) => adapter.handleAction(action, { target: { closest: () => ({ dataset: data }) } }, ctx);

test('S4: "+ Grupa" makes a group; empty and duplicate names are refused', () => {
  const adapter = load(), ctx = context();
  act(adapter, ctx, 'new-cleaning-group');
  assert.equal(ctx.calls[0][1], 'cleaning-group');
  assert.match(ctx.calls[0][2], /^<div class="popover-title">New group<\/div><label class="sheet-field"><input id="cleaning-group-name" class="input" maxlength="80" value="" placeholder="Home, bathroom, car, garden…" aria-label="Group name"><\/label><div class="sheet-footer"><span><\/span><button class="btn btn-primary" type="button" data-pop-action="cleaning-group-save" data-project-id="">Create group<\/button><\/div>$/);
  ctx.inputs['#cleaning-group-name'] = { value: '  ' };
  act(adapter, ctx, 'cleaning-group-save', { projectId: '' });
  assert.match(ctx.calls.at(-1)[1], /<p class="validation" role="alert">Group needs a name\.<\/p>/);
  ctx.inputs['#cleaning-group-name'] = { value: 'kupatilo' };
  act(adapter, ctx, 'cleaning-group-save', { projectId: '' });
  assert.match(ctx.calls.at(-1)[1], /That group already exists\./);
  ctx.inputs['#cleaning-group-name'] = { value: 'Garaža' };
  act(adapter, ctx, 'cleaning-group-save', { projectId: '' });
  const made = ctx.state.projects.at(-1);
  assert.deepEqual([made.id, made.name, made.isCleaningRoom, made.areaId, made.isArchived], ['project-new', 'Garaža', true, 'home', false]);
  assert.deepEqual(ctx.calls.slice(-3).map(call => call[0]), ['close', 'saveAndRender', 'toast']);
  assert.equal(ctx.calls.at(-1)[1], 'Group “Garaža” created');
});

test('S4: the group menu renames, archives and restores with Undo', () => {
  const adapter = load(), ctx = context();
  act(adapter, ctx, 'cleaning-group-menu', { projectId: 'g1' });
  assert.match(ctx.calls[0][2], /^<div class="popover-title">Kupatilo<\/div><div class="sheet-card"><button class="popover-option sheet-option" type="button" data-pop-action="cleaning-group-rename" data-project-id="g1"><span class="sheet-option-label">Rename<\/span><\/button><button class="popover-option sheet-option" type="button" data-pop-action="cleaning-group-archive" data-project-id="g1"><span class="sheet-option-label">Archive group<small>The group and its chores step aside until you restore it\.<\/small><\/span><\/button><button class="popover-option sheet-option is-danger" type="button" data-pop-action="cleaning-group-delete" data-project-id="g1"><span class="sheet-option-label">Delete group<small>Its chores stay, in “No group”\.<\/small><\/span><\/button><\/div>$/);
  act(adapter, ctx, 'cleaning-group-rename', { projectId: 'g1' });
  assert.deepEqual(ctx.calls.at(-1)[0], 'refresh', 'the same sheet, in place');
  assert.match(ctx.calls.at(-1)[1], /<div class="popover-title">Rename group<\/div>[\s\S]*value="Kupatilo"[\s\S]*data-project-id="g1">Save<\/button>/);
  ctx.inputs['#cleaning-group-name'] = { value: 'Auto' };
  act(adapter, ctx, 'cleaning-group-save', { projectId: 'g1' });
  assert.match(ctx.calls.at(-1)[1], /That group already exists\./);
  ctx.inputs['#cleaning-group-name'] = { value: 'Kupatilo i WC' };
  act(adapter, ctx, 'cleaning-group-save', { projectId: 'g1' });
  assert.equal(ctx.getProject('g1').name, 'Kupatilo i WC');
  let [, message, undo] = ctx.calls.filter(call => call[0] === 'undo').at(-1);
  assert.equal(message, 'Group renamed');
  undo();
  assert.equal(ctx.getProject('g1').name, 'Kupatilo');
  ctx.state.ui.cleaningRoomFilter = 'g1';
  act(adapter, ctx, 'cleaning-group-archive', { projectId: 'g1' });
  assert.equal(ctx.getProject('g1').isArchived, true);
  assert.equal(ctx.state.ui.cleaningRoomFilter, 'all');
  [, message, undo] = ctx.calls.filter(call => call[0] === 'undo').at(-1);
  assert.equal(message, 'Group “Kupatilo” archived');
  undo();
  assert.equal(ctx.getProject('g1').isArchived, false);
  act(adapter, ctx, 'restore-cleaning-group', { projectId: 'g3' });
  assert.equal(ctx.getProject('g3').isArchived, false);
  [, message, undo] = ctx.calls.filter(call => call[0] === 'undo').at(-1);
  assert.equal(message, 'Group “Bašta” restored');
  undo();
  assert.equal(ctx.getProject('g3').isArchived, true);
});

test('S4: deleting a group asks first, moves its chores to "Bez grupe" and Undo puts everything back', () => {
  const adapter = load();
  const state = fixture();
  state.projects[0].goalIds = ['goal'];
  state.goals = [{ id: 'goal', title: 'Clean home', projectLinks: [{ projectId: 'g1', mode: 'all' }, { projectId: 'p1', mode: 'all' }] }];
  state.resources = [{ id: 'r', title: 'Manual', relatedProjectIds: ['g1', 'p1'] }];
  const before = plain(state);
  const ctx = context(state);
  act(adapter, ctx, 'cleaning-group-delete', { projectId: 'g1' });
  const [, config] = ctx.calls.find(call => call[0] === 'confirm');
  assert.deepEqual([config.title, config.message, config.confirmLabel], ['Delete group?', 'Its chores stay, in “No group”.', 'Delete group']);
  config.onConfirm();
  assert.equal(ctx.getProject('g1'), null);
  for (const id of ['late', 'soon', 'done', 'ended']) assert.deepEqual([ctx.state.tasks.find(task => task.id === id).projectId, ctx.state.tasks.find(task => task.id === id).areaId], [null, 'home'], id);
  assert.deepEqual(plain(ctx.state.goals[0].projectLinks), [{ projectId: 'p1', mode: 'all' }]);
  assert.deepEqual(plain(ctx.state.resources[0].relatedProjectIds), ['p1']);
  const [, message, undo] = ctx.calls.filter(call => call[0] === 'undo').at(-1);
  assert.equal(message, 'Group deleted · 4 chores in “No group”');
  undo();
  assert.deepEqual(plain(ctx.state), before);
});

test('M4, S4: the Još row, and groups stay out of Zadaci → Projekti and Arhivirani projekti', () => {
  assert.match(app, /moreRow\('cleaning', 'ph-arrows-clockwise', tr\('Recurring tasks'\), count\(state\.tasks\.filter\(isOpenRepeating\)\)\)/);
  assert.match(app, /const projects = sortedProjects\(\)\.filter\(project => !project\.isCleaningRoom\);/);
  assert.match(app, /moreRow\('archived', 'ph-archive', tr\('Archived Projects'\), count\(state\.projects\.filter\(project => project\.isArchived && !project\.isCleaningRoom\)\)\)/);
  assert.match(read('js/projects-ui.js'), /isArchived && !project\.isCleaningRoom/);
  assert.match(app, /renderChoreRow\(task, options = \{\}\) \{ return taskRow\(task, 'cleaning', \{ today: true, metaText: options\.metaText, sideHtml: options\.sideHtml \}\); \}/);
  const tasksUi = read('js/tasks-ui.js');
  assert.match(tasksUi, /const meta = options\.metaText \?\? \[task\.plannedTime, place\]\.filter\(Boolean\)\.join\(' · '\);/);
  assert.match(tasksUi, /<span class="task-side">\$\{options\.sideHtml \?\? `\$\{flag\}\$\{due\}`\}<\/span>/);
});

test('the R11d layer and the Serbian labels', () => {
  const layer = css.slice(css.indexOf('/* Redesign R11d'));
  assert.ok(layer.length > 20, 'R11d layer');
  for (const selector of ['.cleaning-section', '.cleaning-section-head', '.cleaning-section-title', '.cleaning-section-count', '.cleaning-section-kind', '.cleaning-project-link', '.cleaning-archived-row', '.cleaning-archived-name', '.cleaning-note']) assert.ok(layer.includes(selector), selector);
  for (const [en, value] of [['Recurring tasks', 'Redovne obaveze'], ['From projects', 'Iz projekata'], ['Group', 'Grupa'], ['No group', 'Bez grupe'], ['Add a chore', 'Dodaj obavezu'], ['New group', 'Nova grupa'], ['Create group', 'Napravi grupu'], ['Archived groups', 'Arhivirane grupe'], ['Example: apartment', 'Primer: stan'], ['Example: house', 'Primer: kuća']]) {
    assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  }
  assert.ok(sr.includes('"{count} tasks repeat": { one: "{count} obaveza se ponavlja", few: "{count} obaveze se ponavljaju", other: "{count} obaveza se ponavlja" }'));
});

test('R11d is released as 2.0.0-alpha.29', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.29');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.29';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.29');
});
