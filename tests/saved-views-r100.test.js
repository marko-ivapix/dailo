// R100: Sačuvani prikazi. Ready-made views, added with one tap: "Do 15 minuta", "Visok prioritet ove nedelje",
// "Bez roka" and "Čekam" (tasks with the "Čekam" tag, made when missing). For them a tasks view gets three filters:
// `period` ('today' | 'thisWeek': planned or due in that range), `maxMinutes` (a duration of at most N minutes) and
// `noDue` (true: no due date). The edit window shows them as rows.
// Data-model spec: docs/superpowers/specs/2026-10-15-r100-saved-views.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.TodoCore = require('../js/core.js');
const Core = global.TodoCore;
const Backup = require('../js/backup.js');
const Sync = require('../js/sync.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const TODAY = '2026-10-15'; // a Thursday; the week runs 12–18 October from Monday
const stamp = '2026-10-15T08:00:00.000Z';
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const plain = value => JSON.parse(JSON.stringify(value));
const task = (id, fields = {}) => ({ id, title: id, isCompleted: false, isInbox: false, plannedDate: null, dueDate: null, projectId: null, areaId: null, tagIds: [], subtasks: [], priority: 'none', createdAt: stamp, updatedAt: stamp, ...fields });
const view = filters => ({ id: 'v', name: 'v', type: 'tasks', filters, isPinned: false, createdAt: stamp, updatedAt: stamp });
const emptyState = (fields = {}) => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: Core.normalizeV16Settings({}), ui: {}, ...fields });

test('the new filters: this week or today (planned or due), a duration of at most N minutes, no due date', () => {
  const state = emptyState({ settings: { ...Core.normalizeV16Settings({}), weekStartsOn: 'monday' }, tasks: [
    task('mon', { plannedDate: '2026-10-12' }), task('sun-due', { dueDate: '2026-10-18' }), task('next', { plannedDate: '2026-10-19' }), task('today', { plannedDate: TODAY }),
    task('quick', { durationMinutes: 10 }), task('long', { durationMinutes: 45 }), task('due', { dueDate: '2026-11-01' }),
  ] });
  const ids = filters => Core.applySavedView(view(filters), state, TODAY).map(item => item.id);
  assert.deepEqual(ids({ period: 'thisWeek' }), ['mon', 'sun-due', 'today']);
  assert.deepEqual(ids({ period: 'today' }), ['today']);
  state.settings.weekStartsOn = 'sunday';
  assert.deepEqual(ids({ period: 'thisWeek' }), ['mon', 'today'], 'the week follows the setting (11–17 October)');
  assert.deepEqual(ids({ maxMinutes: 15 }), ['quick'], 'a task without a duration is left out');
  assert.deepEqual(ids({ noDue: true }), ['mon', 'next', 'today', 'quick', 'long']);
});

test('backups accept the new filters with valid values only; sync carries them', () => {
  Backup.validateDomain(emptyState({ savedViews: [view({ period: 'thisWeek', maxMinutes: 15, noDue: true, priority: 'high' })] }), [], []);
  for (const filters of [{ period: 'month' }, { maxMinutes: 0 }, { maxMinutes: 2.5 }, { noDue: 'yes' }]) assert.throws(() => Backup.validateDomain(emptyState({ savedViews: [view(filters)] }), [], []), /Invalid backup/, JSON.stringify(filters));
  assert.deepEqual(plain(Sync.collectRecords(emptyState({ savedViews: [view({ period: 'today', noDue: true })] }), []).get('savedViews/v').data.filters), { period: 'today', noDue: true });
});

function viewsModule() {
  let module;
  runInNewContextWithI18n(read('js/saved-views-ui.js'), { window: { TodoDomainModules: { register: value => { module = value; } } }, requestAnimationFrame: run => run() });
  return module;
}
function ctxFor(savedViews = [], tags = []) {
  const calls = [];
  const ctx = {
    calls, esc, Core, state: { savedViews, tags, areas: [], projects: [], goals: [], habits: [], tasks: [task('t', { durationMinutes: 5 })], settings: { weekStartsOn: 'monday' } },
    pageHeader: (title, subtitle) => `<header title="${title}" subtitle="${subtitle}"></header>`, formatDate: value => `D:${value}`,
    uid: kind => `${kind}-1`, nowIso: () => stamp, modalState: null,
    ensureTag: name => { calls.push(['tag', name]); return 'tag-wait'; },
    addSavedView: item => calls.push(['add', plain(item)]),
    openPopover: (anchor, html) => calls.push(['open', html]), closePopover: () => calls.push(['closePopover']), renderModal: () => calls.push(['renderModal']),
    setModalState: value => { ctx.modalState = value; }, captureModalReturnFocus() {}, copyTemplate: value => plain(value), $: () => null,
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`,
  };
  return ctx;
}
const act = (module, ctx, action, dataset = {}) => module.handleAction(action, { target: { closest: () => ({ dataset }) } }, ctx);

test('Sačuvani prikazi offers the ready-made views; a tap adds one as the user\'s own and opens it', () => {
  const module = viewsModule();
  const ctx = ctxFor();
  const html = module.renderRoute({ type: 'saved-views' }, ctx);
  const ready = html.slice(html.indexOf('<section class="section views-ready">'));
  assert.ok(ready.startsWith('<section class="section views-ready"><div class="section-header"><h2 class="section-label">Ready-made views</h2></div><div class="today-card views-list">'));
  assert.deepEqual([...ready.matchAll(/data-action="saved-view-ready" data-ready-key="([\w-]+)"><i class="ph ([\w-]+) view-list-icon" aria-hidden="true"><\/i><span class="view-list-main"><span class="task-title">([^<]+)<\/span><span class="task-meta">([^<]+)<\/span><\/span><i class="ph ph-plus view-ready-add" aria-hidden="true"><\/i><\/button>/g)].map(match => match.slice(1)), [
    ['quick', 'ph-timer', 'Up to 15 minutes', 'Open tasks that take 15 minutes or less (the duration is set in the task).'],
    ['high-week', 'ph-flag', 'High priority this week', 'High priority, planned or due this week.'],
    ['no-due', 'ph-calendar-slash', 'Without a due date', 'Open tasks without a due date.'],
    ['waiting', 'ph-hourglass-medium', 'Waiting for', 'Tasks with the “Waiting for” tag: what you are waiting on from others.'],
  ]);
  act(module, ctx, 'saved-view-ready', { readyKey: 'high-week' });
  assert.deepEqual(ctx.calls.at(-1), ['add', { id: 'view-1', sampleKey: 'view-ready-v1:high-week', name: 'High priority this week', type: 'tasks', filters: { priority: 'high', period: 'thisWeek', completion: 'open' }, isPinned: false, createdAt: stamp, updatedAt: stamp }]);
  act(module, ctx, 'saved-view-ready', { readyKey: 'waiting' });
  assert.deepEqual(ctx.calls.slice(-2), [['tag', 'Waiting for'], ['add', { id: 'view-1', sampleKey: 'view-ready-v1:waiting', name: 'Waiting for', type: 'tasks', filters: { tagId: 'tag-wait', completion: 'open' }, isPinned: false, createdAt: stamp, updatedAt: stamp }]]);
  const added = module.renderRoute({ type: 'saved-views' }, ctxFor([{ ...view({ maxMinutes: 15, completion: 'open' }), sampleKey: 'view-ready-v1:quick', name: 'Brzo' }, { ...view({}), id: 'w', name: 'waiting for' }]));
  assert.deepEqual([...added.matchAll(/data-ready-key="([\w-]+)"/g)].map(match => match[1]), ['high-week', 'no-due'], 'one already added (by key or by name) is not offered');
  const app = read('js/app.js');
  assert.match(app, /ensureTag\(name\) \{/);
  assert.match(app, /addSavedView\(view\) \{ state\.savedViews\.push\(view\); saveState\(\); navigate\(`saved-view\/\$\{view\.id\}`\); setToastMessage\(tr\('View added'\)\); \},/);
});

test('the edit window shows the new filters; the summary reads them', () => {
  const module = viewsModule();
  const ctx = ctxFor([view({ period: 'thisWeek', maxMinutes: 15, noDue: true })]);
  assert.match(module.renderRoute({ type: 'saved-views' }, ctx), /<span class="task-meta">Tasks · When I do it or due: This week · Takes at most: 15 min · Without a due date<\/span>/);
  act(module, ctx, 'edit-saved-view', { savedViewId: 'v' });
  const html = module.renderRoute({ type: 'modal', modalType: 'saved-view' }, ctx);
  const rows = [...html.matchAll(/data-action="saved-view-filter" data-field="(\w+)"><i class="ph [\w-]+" aria-hidden="true"><\/i><span class="task-window-row-label">([^<]+)<\/span><span class="task-window-row-value(?: is-set)?">([^<]*)</g)].map(match => match.slice(1));
  assert.deepEqual(rows.slice(4, 9), [['plannedDate', 'When I do it (exact day)', 'Any'], ['dueDate', 'Due date (exact day)', 'Any'], ['period', 'When I do it or due', 'This week'], ['maxMinutes', 'Takes at most', '15 min'], ['noDue', 'Without a due date', 'Yes']]);
  act(module, ctx, 'saved-view-filter', { field: 'maxMinutes' });
  assert.deepEqual([...ctx.calls.at(-1)[1].matchAll(/data-value="(\d*)"><span class="sheet-option-label">([^<]+)<\/span><span class="sheet-radio( is-on)?"/g)].map(match => match.slice(1, 3).concat(Boolean(match[3]))), [['', 'Any', false], ['15', '15 min', true], ['30', '30 min', false], ['60', '60 min', false]]);
  act(module, ctx, 'saved-view-set-filter', { field: 'maxMinutes', value: '30', popAction: 'saved-view-set-filter' });
  act(module, ctx, 'saved-view-set-filter', { field: 'noDue', value: '', popAction: 'saved-view-set-filter' });
  assert.deepEqual(plain(ctx.modalState.draft.filters), { period: 'thisWeek', maxMinutes: 30 }, 'numbers stay numbers; "Any" removes the filter');
  const css = read('css/styles.css');
  for (const rule of ['.views-ready {', '.view-ready-add {']) assert.ok(css.includes(rule), rule);
});

test('the new lines are Serbian; the guide and Šta je novo mention the ready-made views', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['Ready-made views', 'Gotovi prikazi'], ['Up to 15 minutes', 'Do 15 minuta'], ['High priority this week', 'Visok prioritet ove nedelje'], ['Without a due date', 'Bez roka'],
    ['Waiting for', 'Čekam'], ['View added', 'Prikaz dodat'], ['When I do it or due', 'Kad radim ili rok'], ['Takes at most', 'Traje najviše'], ['{count} min', '{count} min'],
    ['Open tasks that take 15 minutes or less (the duration is set in the task).', 'Otvoreni zadaci koji traju do 15 minuta (trajanje se zadaje u zadatku).'],
    ['High priority, planned or due this week.', 'Visok prioritet, sa planom ili rokom ove nedelje.'], ['Open tasks without a due date.', 'Otvoreni zadaci bez roka.'],
    ['Tasks with the “{tag}” tag: what you are waiting on from others.', 'Zadaci sa oznakom „{tag}“: ono što čekaš od drugih.'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  assert.ok(read('uputstvo.html').includes('U <strong>Još → Sačuvani prikazi</strong> su i gotovi prikazi: Do 15 minuta, Visok prioritet ove nedelje, Bez roka i Čekam. Dodir ga doda među tvoje; za Čekam stavi zadatku oznaku <strong>#Čekam</strong> kad čekaš nekog drugog.'));
  assert.ok(read('novo.html').includes('<li><strong>Gotovi prikazi.</strong>'));
});

test('R100 shipped as 2.0.0-alpha.128 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 128) >= 128);
});
