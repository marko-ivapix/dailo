// R99: Šabloni. A built-in gallery of ready-made templates: Pakovanje za put, Selidba and Ispit (projects) and Jutarnja
// rutina (a morning habit). "Iz šablona" in the new project and new habit windows offers them under "Gotovi šabloni";
// picking one fills the window and saves nothing until the item is saved. Šabloni lists them too, with "Upotrebi šablon"
// and "Dodaj u moje šablone". A habit template keeps the habit's routine (template.data.routine). In the template
// editor the repeat and "Napravi jednom, na zadati dan" are two separate parts, and the list says which one a task
// template has.
// Data-model spec: docs/superpowers/specs/2026-10-15-r99-templates.md
process.env.TZ = 'Europe/Belgrade';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.TodoCore = require('../js/core.js');
const Core = global.TodoCore;
const Backup = require('../js/backup.js');
const Examples = require('../js/starter-examples.js');
const Release = require('../js/release.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const TODAY = '2026-10-15';
const stamp = '2026-10-15T08:00:00.000Z';
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const plain = value => JSON.parse(JSON.stringify(value));
let next = 0;
const deps = { Core, uid: kind => `${kind}-${++next}`, today: TODAY, timestamp: stamp, PROJECT_COLORS: ['#5362FF', '#4CAF7D'] };
const emptyState = (fields = {}) => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: Core.normalizeV16Settings({}), ui: {}, ...fields });

test('the gallery: three projects and a morning habit; one already among the templates is left out', () => {
  assert.deepEqual(Examples.galleryEntries({ templates: [] }).map(entry => [entry.key, entry.type, entry.name, entry.icon, entry.count]), [
    ['travel', 'project', 'Packing for a trip', 'ph-suitcase-rolling', 5], ['moving', 'project', 'Moving house', 'ph-truck', 7],
    ['exam', 'project', 'Exam', 'ph-graduation-cap', 8], ['morning', 'habit', 'Morning routine', 'ph-sun-horizon', 0],
  ]);
  assert.deepEqual(Examples.galleryEntries({ templates: [] }, 'habit').map(entry => entry.key), ['morning']);
  assert.deepEqual(Examples.galleryEntries({ templates: [] }, 'task'), []);
  const added = Examples.galleryTemplate('travel', deps);
  assert.deepEqual(Examples.galleryEntries({ templates: [added] }, 'project').map(entry => entry.key), ['moving', 'exam']);
  assert.deepEqual(Examples.galleryEntries({ templates: [{ name: ' exam ', type: 'project' }] }, 'project').map(entry => entry.key), ['travel', 'moving'], 'the same name counts too');
  assert.equal(Examples.galleryTemplate('nope', deps), null);
});

test('a gallery project is a valid template whose tasks carry their checklists', () => {
  const template = Examples.galleryTemplate('travel', deps);
  assert.deepEqual([template.type, template.name, template.sampleKey, template.data.name, template.data.color], ['project', 'Packing for a trip', 'template-gallery-v1:travel', 'Packing for a trip', '#5362FF']);
  assert.deepEqual(template.data.tasks.map(task => [task.title, task.subtasks.length]), [['Documents', 4], ['Clothes', 5], ['Hygiene', 4], ['Electronics', 4], ['Before you leave', 4]]);
  Backup.validateDomain(emptyState({ templates: ['travel', 'moving', 'exam', 'morning'].map(key => Examples.galleryTemplate(key, deps)) }), [], []);
  const made = Core.instantiateTemplate(template, TODAY, { state: emptyState(), makeId: deps.uid, nowIso: stamp });
  assert.equal(made.project.name, 'Packing for a trip');
  assert.deepEqual(made.tasks.map(task => task.title), ['Documents', 'Clothes', 'Hygiene', 'Electronics', 'Before you leave']);
  assert.deepEqual(made.tasks[0].subtasks.map(item => item.title), ['ID card or passport', 'Health insurance card', 'Tickets and bookings', 'Cash and cards']);
});

test('a habit template keeps the routine; the morning routine is a daily morning habit with a 07:00 reminder', () => {
  const template = Examples.galleryTemplate('morning', deps);
  assert.deepEqual([template.data.routine, template.data.frequencyType, plain(template.data.reminders)], ['morning', 'daily', [{ time: '07:00', enabled: true }]]);
  const habit = Core.instantiateTemplate(template, TODAY, { state: emptyState(), makeId: deps.uid, nowIso: stamp }).habit;
  assert.deepEqual([habit.name, habit.routine, habit.startDate], ['Morning routine', 'morning', TODAY]);
  assert.equal(Core.templateFromEntity('habit', { name: 'Čitanje', routine: 'night', trackingType: 'checkbox', frequencyType: 'daily' }, {}, TODAY).data.routine, 'night', 'Sačuvaj kao šablon keeps it');
  const older = { ...template, data: { ...template.data } }; delete older.data.routine;
  assert.equal(Core.instantiateTemplate(older, TODAY, { state: emptyState(), makeId: deps.uid, nowIso: stamp }).habit.routine, 'daily', 'an older template makes a daily-routine habit');
  assert.throws(() => Backup.validateDomain(emptyState({ templates: [{ ...template, data: { ...template.data, routine: 'noon' } }] }), [], []), /Invalid backup/);
});

test('"Iz šablona" offers the gallery in the new project and new habit windows; picking one saves nothing', () => {
  const app = read('js/app.js');
  assert.match(app, /function templateGallery\(type\) \{ return window\.DailoStarterExamples\?\.galleryEntries\?\.\(state, type\) \|\| \[\]; \}/);
  assert.match(app, /state\.templates\.some\(template => template\.type === modalState\.type\) \|\| templateGallery\(modalState\.type\)\.length\)\)/);
  const picker = functionSource('renderTemplatePicker').source;
  assert.match(picker, /const gallery = templateGallery\(modalState\.kind\);/);
  assert.match(picker, /<h3 class="sheet-group-title">\$\{tr\('Ready-made templates'\)\}<\/h3><div class="sheet-card">\$\{gallery\.map\(entry => `<button class="sheet-row template-choice" type="button" data-action="choose-gallery-template" data-gallery-key="\$\{esc\(entry\.key\)\}"><i class="ph \$\{entry\.icon\}" aria-hidden="true"><\/i><span>\$\{esc\(entry\.name\)\}<\/span><\/button>`\)\.join\(''\)\}<\/div>/);
  assert.match(functionSource('chooseTemplate').source, /^\s*function chooseTemplate\(id, given = null\) \{\n\s+const template = given \|\| state\.templates\.find\(t => t\.id === id\); if \(!template\) return;/);
  assert.match(app, /else if\(action==='choose-gallery-template'\)chooseTemplate\(null, galleryTemplateRecord\(el\.dataset\.galleryKey\)\);/);
  assert.match(functionSource('galleryTemplateRecord').source, /window\.DailoStarterExamples\?\.galleryTemplate\?\.\(key, \{ Core, uid, today: Core\.dateOnly\(\), timestamp: nowIso\(\), PROJECT_COLORS \}\) \|\| null/);
  const add = functionSource('addGalleryTemplate').source;
  assert.match(add, /state\.templates\.push\(template\);/);
  assert.match(add, /setToastMessage\(tr\('Template added: \{name\}', \{ name: template\.name \}\)\);/);
});

function templatesModule() {
  let module;
  runInNewContextWithI18n(read('js/templates-ui.js'), { window: { TodoDomainModules: { register: value => { module = value; } } }, requestAnimationFrame: run => run() });
  return module;
}
function screenCtx(templates = []) {
  const calls = [];
  return {
    calls, esc, Core, state: { templates, areas: [], goals: [], projects: [], tags: [] }, templateTypes: ['task', 'project', 'habit', 'goal'],
    pageHeader: (title, subtitle) => `<header title="${title}" subtitle="${subtitle}"></header>`, templateLabel: value => value, formatDate: value => `D:${value}`,
    templateGallery: type => Examples.galleryEntries({ templates }, type),
    openPopover: (anchor, html) => calls.push(['open', html]), closePopover: () => calls.push(['close']),
    useGalleryTemplate: key => calls.push(['use-gallery', key]), addGalleryTemplate: key => calls.push(['add-gallery', key]),
  };
}
const act = (module, ctx, action, dataset) => module.handleAction(action, { target: { closest: () => ({ dataset }) } }, ctx);

test('Šabloni lists the gallery with "Upotrebi šablon" and "Dodaj u moje šablone"', () => {
  const module = templatesModule();
  const ctx = screenCtx();
  const html = module.renderRoute({ type: 'templates' }, ctx);
  const gallery = html.slice(html.indexOf('<section class="section templates-gallery">'));
  assert.ok(gallery.startsWith('<section class="section templates-gallery"><div class="section-header"><h2 class="section-label">Ready-made templates</h2></div><p class="sheet-note">Use one as it is, or add it to your templates and change it.</p><div class="today-card templates-list">'));
  assert.match(gallery, /<button class="template-gallery-row" type="button" data-action="template-gallery-open" data-gallery-key="travel"><i class="ph ph-suitcase-rolling" aria-hidden="true"><\/i><span class="template-list-main"><span class="task-title">Packing for a trip<\/span><span class="task-meta">Project · 5 tasks<\/span><\/span><\/button>/);
  assert.match(gallery, /data-gallery-key="morning"><i class="ph ph-sun-horizon" aria-hidden="true"><\/i><span class="template-list-main"><span class="task-title">Morning routine<\/span><span class="task-meta">Habit · Every day · Morning<\/span>/);
  act(module, ctx, 'template-gallery-open', { galleryKey: 'moving' });
  assert.equal(ctx.calls.at(-1)[1], '<div class="popover-title">Moving house</div><p class="sheet-subtitle">Project · 7 tasks</p><button class="btn btn-primary sheet-primary" type="button" data-pop-action="use-gallery-template" data-gallery-key="moving">Use template</button><div class="sheet-card sheet-menu"><button class="popover-option" type="button" data-pop-action="add-gallery-template" data-gallery-key="moving"><i class="ph ph-plus"></i>Add to my templates</button></div>');
  act(module, ctx, 'use-gallery-template', { galleryKey: 'moving', popAction: 'use-gallery-template' });
  act(module, ctx, 'add-gallery-template', { galleryKey: 'exam', popAction: 'add-gallery-template' });
  assert.deepEqual(ctx.calls.slice(-4), [['close'], ['use-gallery', 'moving'], ['close'], ['add-gallery', 'exam']]);
  const all = ['travel', 'moving', 'exam', 'morning'].map(key => Examples.galleryTemplate(key, deps));
  assert.doesNotMatch(module.renderRoute({ type: 'templates' }, screenCtx(all)), /templates-gallery/, 'nothing left to offer, no section');
  assert.match(read('js/app.js'), /useGalleryTemplate, addGalleryTemplate, templateGallery,/);
});

test('the editor keeps the repeat apart from "Napravi jednom, na zadati dan"; the list says which one a template has', () => {
  const source = read('js/templates-ui.js');
  assert.match(source, /more \+= `<fieldset class="template-section"><legend>\$\{tr\('Repeat'\)\}<\/legend>\$\{repeat\}<\/fieldset>`;/);
  assert.match(source, /let repeat = templateField\(ctx, recurrence, 'frequency', tr\('How often'\)/);
  assert.match(source, /if \(!prefix\) more \+= `<fieldset class="template-section"><legend>\$\{tr\('Make it once, on a set day'\)\}<\/legend><p class="sheet-note">\$\{tr\('On that day Dailo makes one task from this template by itself\. That is not a repeat: for a task that comes back, use Repeat\.'\)\}<\/p>\$\{field\('scheduleEnabled'/);
  const module = templatesModule();
  const ctx = screenCtx([
    { id: 'r', type: 'task', name: 'Weekly report', data: { title: 'Weekly report', subtasks: [], recurrence: { frequency: 'weekly', interval: 1 } } },
    { id: 's', type: 'task', name: 'Taxes', data: { title: 'Taxes', subtasks: [], recurrence: null, scheduleEnabled: true, scheduleDate: '2027-03-01', scheduleGeneratedOn: null } },
    { id: 'd', type: 'task', name: 'Done', data: { title: 'Done', subtasks: [], recurrence: null, scheduleEnabled: true, scheduleDate: '2026-10-01', scheduleGeneratedOn: '2026-10-01' } },
  ]);
  const html = module.renderRoute({ type: 'templates' }, ctx);
  assert.match(html, /data-template-id="r"><span class="template-list-main"><span class="task-title">Weekly report<\/span><span class="task-meta">Repeats<\/span>/);
  assert.match(html, /data-template-id="s"><span class="template-list-main"><span class="task-title">Taxes<\/span><span class="task-meta">Made once on D:2027-03-01<\/span>/);
  assert.match(html, /data-template-id="d"><span class="template-list-main"><span class="task-title">Done<\/span><span class="task-meta"><\/span>/, 'already made, nothing to say');
  const css = read('css/styles.css');
  for (const rule of ['.template-gallery-row {', '.template-section {', '.template-section legend {']) assert.ok(css.includes(rule), rule);
});

test('the new lines are Serbian; the guide and Šta je novo mention the gallery', () => {
  const sr = read('js/i18n-sr.js');
  for (const [en, value] of [
    ['Packing for a trip', 'Pakovanje za put'], ['Moving house', 'Selidba'], ['Exam', 'Ispit'], ['Morning routine', 'Jutarnja rutina'],
    ['Ready-made templates', 'Gotovi šabloni'], ['Add to my templates', 'Dodaj u moje šablone'], ['Template added: {name}', 'Šablon dodat: {name}'],
    ['Use one as it is, or add it to your templates and change it.', 'Upotrebi ga ovakvog ili ga dodaj u svoje šablone i promeni.'],
    ['How often', 'Koliko često'], ['Make it once, on a set day', 'Napravi jednom, na zadati dan'], ['Made once on {date}', 'Pravi se jednom, {date}'],
    ['On that day Dailo makes one task from this template by itself. That is not a repeat: for a task that comes back, use Repeat.', 'Tog dana Dailo sam napravi jedan zadatak iz ovog šablona. To nije ponavljanje: za zadatak koji se vraća koristi Ponavljanje.'],
    ['ID card or passport', 'Lična karta ili pasoš'], ['Book a van or movers', 'Dogovori kombi ili selidbenu firmu'], ['Register for the exam', 'Prijavi ispit'],
  ]) assert.ok(sr.includes(`${JSON.stringify(en)}: ${JSON.stringify(value)}`), en);
  assert.ok(read('uputstvo.html').includes('Kad praviš novi projekat ili naviku, <strong>Iz šablona</strong> nudi i gotove šablone: Pakovanje za put, Selidba i Ispit za projekte, Jutarnja rutina za navike.'));
  assert.ok(read('novo.html').includes('<li><strong>Gotovi šabloni.</strong>'));
});

test('R99 is released as 2.0.0-alpha.127', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.127');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.127';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.127');
});
