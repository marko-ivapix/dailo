// Redesign R4: Quick Add as a bottom sheet (Q1–Q3) with the "Iz šablona" chip (S7).
// Spec: docs/superpowers/specs/2026-10-10-redesign-r4-quick-add.md
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
const sr = read('js/i18n-sr.js');
const css = read('css/styles.css');
const fn = name => { const start = app.search(new RegExp(`\\n  (async )?function ${name}\\(`)) + 1; assert.ok(start > 0, name); return app.slice(start, app.indexOf('\n  }\n', start) + 4); };
const constLine = name => app.match(new RegExp(`  const ${name} = [^\\n]+\\n`))[0];
const TODAY = Core.dateOnly();
const day = offset => Core.addDays(TODAY, offset);
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function quickContext(draft = {}, extra = {}) {
  const calls = [];
  let n = 0;
  const projects = [{ id: 'p1', name: 'Posao', color: '#111111', areaId: null }];
  const tags = [{ id: 'tg', name: 'posao', color: '#222222' }];
  const templates = [{ id: 'tpl', type: 'task', name: 'Nedeljni izveštaj', data: { title: 'Izveštaj', plannedOffsetDays: 1, dueOffsetDays: 3, subtasks: [{ title: 'Podaci' }, { title: 'Slanje' }], tagIds: ['tg'], priority: 'medium' } }];
  const ctx = {
    calls, Core, esc,
    state: { tasks: [], projects, tags, areas: [], templates, goals: [], habits: [], settings: {} },
    modalState: { type: 'quick', defaults: { projectId: null, areaId: null, plannedDate: null, explicitPlan: false, processed: false }, templateContext: {}, draft: { title: '', notes: '', projectId: null, areaId: null, plannedDate: null, parsedPlanDate: null, explicitPlan: false, dueDate: null, plannedTime: null, dueTime: null, explicitPlannedTime: false, reminderAt: null, reminderFiredAt: null, recurrence: null, tagIds: [], priority: 'none', subtasks: [], ...draft }, error: '' },
    getProject: id => projects.find(project => project.id === id), getTag: id => tags.find(tag => tag.id === id), getArea: () => null,
    sortedProjects: () => projects, sortedAreas: () => [],
    relativeDateLabel: date => `R(${date})`, formatReminder: String, recurrenceLabel: String, durationLabel: minutes => `${minutes} min`, priorityLabel: value => value,
    modalFrame: (content, cls) => `<frame ${cls}>${content}</frame>`,
    uid: prefix => `${prefix}_${++n}`, nowIso: () => '2026-10-10T08:00:00.000Z', copyTemplate: value => JSON.parse(JSON.stringify(value)),
    nextOrder: () => 0, saveState: () => calls.push(['save']), closeModal: () => calls.push(['closeModal']), render: () => calls.push(['render']), renderModal: () => calls.push(['renderModal']),
    openTaskDetail: id => calls.push(['openTask', id]), syncTemplateEntityGoalLinks: () => calls.push(['goalLinks']),
    openPopover: (anchor, html, meta) => calls.push(['open', html, meta]), closePopover: () => calls.push(['close']),
    requestAnimationFrame: () => {}, $: () => null,
    ...extra,
  };
  vm.createContext(withI18n(ctx));
  vm.runInContext(`${constLine('QUICK_TEMPLATE_FIELDS')}${['parseQuickAddTitle', 'quickParsePreview', 'renderQuickModal', 'quickPlanLabel', 'quickPlace', 'quickTemplateRow', 'quickTemplateSummary', 'openQuickTemplatePicker', 'applyQuickTemplate', 'clearQuickTemplate', 'syncQuickDraftFromDom', 'createTask', 'openProjectPicker', 'setProject'].map(fn).join('')}`, ctx);
  return ctx;
}

test('Q1, Q2: Quick Add is a sheet with the title, the preview, two selectors, the template chip, "Više opcija" and "Dodaj zadatak"', () => {
  const ctx = quickContext({ title: 'Izveštaj sutra' });
  const html = ctx.renderQuickModal();
  assert.match(html, /^<frame quick><div class="modal-inner quick-sheet">\s*<div class="modal-header"><h2 class="modal-title">New task<\/h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close">/);
  assert.match(html, /<input id="quick-title" class="quick-title-input"[^>]*placeholder="What needs to be done\?" value="Izveštaj sutra"/);
  assert.match(html, /data-quick-preview-slot aria-live="polite"><div class="quick-parse-preview"/, 'the V1.10 preview stays');
  assert.match(html, new RegExp(`<button class="quick-selector" type="button" data-action="quick-plan-picker"><i class="ph ph-calendar-check" aria-hidden="true"></i><span data-quick-plan-label>R\\(${day(1)}\\)</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>`), 'the parsed date');
  assert.match(html, /<button class="quick-selector" type="button" data-action="quick-project-picker"><i class="ph ph-folder-simple" aria-hidden="true"><\/i><span data-quick-place-label>No project<\/span><i class="ph ph-caret-right" aria-hidden="true"><\/i><\/button>/, 'a dated task is never in Inbox');
  assert.match(html, /<button class="quick-chip" type="button" data-action="quick-template"><i class="ph ph-copy" aria-hidden="true"><\/i>From template<\/button>/);
  assert.match(html, /<button class="quick-more-options" type="button" data-action="quick-more-options"><span>More options<\/span><span class="quick-more-meta">Due date, reminder, tags<\/span>/);
  assert.match(html, /<button class="btn btn-primary quick-add-button" type="button" data-action="create-task">Add task<\/button>/);
  for (const gone of ['quick-due-picker', 'quick-duration-picker', 'quick-reminder-picker', 'quick-repeat-picker', 'toggle-quick-more', 'quick-notes', 'quick-planned-time', 'property-chip']) assert.ok(!html.includes(gone), gone);
  assert.match(fn('renderModal'), /\['project','habit','goal'\]\.includes\(modalState\.type\)/, 'the old top "Iz šablona" button is not added to Quick Add');
  assert.match(css, /\.modal-backdrop-quick \{[^}]*place-items: end center;/);
  for (const [key, value] of [['Due date, reminder, tags', 'Rok, podsetnik, oznake'], ['Where does the task go', 'Gde ide zadatak'], ['Sort it later', 'Razvrstaćeš ga kasnije'], ['Template: {name}', 'Šablon: {name}'], ['Remove template', 'Ukloni šablon'], ['Task template', 'Šablon zadatka']]) assert.match(sr, new RegExp(`"${key.replace(/[{}]/g, '\\$&')}": "${value.replace(/[{}]/g, '\\$&')}"`), key);
});

test('the place label is the project, "Bez projekta" or "Inbox", and no template chip without task templates', () => {
  const ctx = quickContext();
  const empty = ctx.renderQuickModal();
  assert.match(empty, /data-quick-plan-label>No date<\/span>/);
  assert.match(empty, /data-quick-place-label>Inbox<\/span>/);
  assert.equal(ctx.quickPlace(ctx.modalState.draft).label, 'Inbox');
  ctx.modalState.draft.processed = true;
  assert.equal(ctx.quickPlace(ctx.modalState.draft).label, 'No project');
  assert.equal(ctx.quickPlace(ctx.modalState.draft).isInbox, false);
  ctx.modalState.draft.title = 'Ponuda +Posao';
  assert.equal(ctx.quickPlace(ctx.modalState.draft).label, 'Posao', 'a parsed project');
  ctx.modalState.draft.placePicked = true;
  assert.equal(ctx.quickPlace(ctx.modalState.draft).projectId, null, 'a picked place wins over +project');
  ctx.state.templates = [];
  assert.doesNotMatch(ctx.renderQuickModal(), /quick-template/);
});

test('"Gde ide zadatak" adds Inbox and Bez projekta above the projects', () => {
  const ctx = quickContext();
  ctx.openProjectPicker({}, { type: 'quick' });
  const html = ctx.calls.at(-1)[1];
  assert.match(html, /^<div class="popover-title">Where does the task go<\/div>/);
  assert.match(html, /<button class="popover-option sheet-option is-selected" type="button" data-pop-action="quick-place" data-place="inbox"><i class="ph ph-tray" aria-hidden="true"><\/i><span class="sheet-option-label">Inbox<small>Sort it later<\/small><\/span><span class="sheet-radio is-on"/);
  assert.match(html, /data-pop-action="quick-place" data-place="none"><span class="sheet-option-label">No project<\/span>/);
  assert.match(html, /data-pop-action="set-project" data-project-id="p1"/);
  ctx.setProject('quick', '', 'p1');
  assert.equal(ctx.modalState.draft.placePicked, true);
  assert.equal(ctx.modalState.draft.projectId, 'p1');
  assert.match(app, /else if \(action === 'quick-place' && modalState\?\.type === 'quick'\) \{ const inbox = button\.dataset\.place === 'inbox'; Object\.assign\(modalState\.draft, \{ projectId: null, processed: !inbox, placePicked: true \}\); closePopover\(\); renderModal\(\); \}/);
});

test('createTask files a "Bez projekta" task outside Inbox and an Inbox task in Inbox', () => {
  const none = quickContext({ title: 'Kupiti mleko', processed: true, placePicked: true });
  none.createTask(false);
  assert.equal(none.state.tasks[0].isInbox, false);
  const inbox = quickContext({ title: 'Ideja', processed: false, placePicked: true });
  inbox.createTask(false);
  assert.equal(inbox.state.tasks[0].isInbox, true);
  const anytime = quickContext({ title: 'Ideja' });
  anytime.modalState.defaults.processed = true;
  anytime.createTask(false);
  assert.equal(anytime.state.tasks[0].isInbox, false, 'the Kad stignem context still skips Inbox');
});

test('S7: a template fills what is missing; a typed title, a picked date and a picked place win; ✕ takes it back', () => {
  const ctx = quickContext();
  ctx.applyQuickTemplate('tpl');
  const d = ctx.modalState.draft;
  assert.equal(d.title, 'Izveštaj');
  assert.equal(d.plannedDate, day(1));
  assert.equal(d.dueDate, day(3));
  assert.deepEqual(d.subtasks.map(subtask => subtask.title), ['Podaci', 'Slanje']);
  assert.deepEqual(Array.from(d.tagIds), ['tg']);
  assert.equal(d.priority, 'medium');
  const html = ctx.renderQuickModal();
  assert.match(html, /<button class="quick-chip is-selected" type="button" data-action="quick-template"><i class="ph ph-copy" aria-hidden="true"><\/i>Template: Nedeljni izveštaj<\/button><button class="quick-chip" type="button" data-action="quick-template-clear" aria-label="Remove template">/);
  assert.match(html, new RegExp(`<p class="quick-template-summary">R\\(${day(1)}\\) · Due R\\(${day(3)}\\) · 2 subtasks · #posao</p>`));
  ctx.clearQuickTemplate();
  assert.equal(d.title, '');
  assert.equal(d.plannedDate, null);
  assert.equal(d.dueDate, null);
  assert.deepEqual(Array.from(d.subtasks), []);
  assert.deepEqual(Array.from(d.tagIds), []);
  assert.equal(ctx.modalState.quickTemplate, null);

  const typed = quickContext({ title: 'Moj naslov', explicitPlan: true, plannedDate: day(5) });
  typed.applyQuickTemplate('tpl');
  assert.equal(typed.modalState.draft.title, 'Moj naslov');
  assert.equal(typed.modalState.draft.plannedDate, day(5), 'a picked date wins');
  assert.equal(typed.modalState.draft.dueDate, day(7), 'the due date moves with the plan');
  typed.createTask(false);
  const task = typed.state.tasks[0];
  assert.equal(task.title, 'Moj naslov');
  assert.equal(task.subtasks.length, 2);
  assert.ok(typed.calls.some(call => call[0] === 'goalLinks'), 'template goal links are kept');
  assert.match(app, /action==='use-template'\)\{const template=state\.templates\.find\(t=>t\.id===el\.dataset\.templateId\);if\(template\)\{if\(template\.type==='task'\)\{openQuickAdd\(\);applyQuickTemplate\(template\.id\);renderModal\(\);\}/);
});

test('the template sheet lists task templates with their summary', () => {
  const ctx = quickContext();
  ctx.openQuickTemplatePicker({});
  const [, html, meta] = ctx.calls.at(-1);
  assert.equal(meta.type, 'quick-template');
  assert.match(html, /^<div class="popover-title">Task template<\/div>/);
  assert.match(html, /data-pop-action="quick-template-pick" data-template-id="tpl"><i class="ph ph-copy" aria-hidden="true"><\/i><span class="sheet-option-label">Nedeljni izveštaj<small>/);
});

test('"Više opcija" saves the task and opens its task window', () => {
  const ctx = quickContext({ title: 'Plan puta' });
  ctx.createTask(false, true);
  const id = ctx.state.tasks[0].id;
  assert.deepEqual(ctx.calls.slice(-3), [['closeModal'], ['render'], ['openTask', id]]);
  assert.match(app, /else if \(action === 'quick-more-options'\) createTask\(false, true\);/);
  const empty = quickContext({ title: '' });
  empty.createTask(false, true);
  assert.equal(empty.state.tasks.length, 0, 'a title is still required');
});

test('typing updates the date and place labels without redrawing the field', () => {
  assert.match(app, /const planLabel = document\.querySelector\('\[data-quick-plan-label\]'\); if \(planLabel\) planLabel\.textContent = quickPlanLabel\(/);
  assert.match(app, /const placeLabel = document\.querySelector\('\[data-quick-place-label\]'\); if \(placeLabel\) placeLabel\.textContent = quickPlace\(modalState\.draft, parsed\)\.label;/);
});

test('R4 is released as 2.0.0-alpha.9', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.9');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.9';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.9');
});
