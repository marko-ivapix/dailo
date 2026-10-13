// R70: more examples the user picked — car and motorcycle chores, health and tax dates, the meal-plan shopping
// template from the user's list, saved views by tag and a gift-ideas note.
// Spec: docs/superpowers/specs/2026-10-13-r70-more-examples.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Backup = require('../js/backup.js');
const Release = require('../js/release.js');
const I18n = require('../js/i18n.js');
const Starter = require('../js/starter-examples.js');
const { functionSource } = require('./support/source.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const PROJECT_COLORS = ['#5362FF', '#30CBAD', '#A879FF', '#4CC9F0', '#F5B942', '#FF8A5B', '#F06A8A', '#8FD14F'];
const stamp = '2026-10-13T08:00:00.000Z';
const emptyState = () => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: Core.normalizeV16Settings({}), ui: {} });
function examples(view = emptyState(), today = '2026-10-13') {
  let counter = 0;
  return Starter.workspaceExamples(view, { Core, uid: prefix => `${prefix}_${++counter}`, today, timestamp: stamp, habitDraft: () => ({}), PROJECT_COLORS });
}
const group = (out, key) => {
  const project = out.projects.find(item => item.sampleKey === `${Starter.PREFIX}:project:${key}`);
  assert.ok(project, key);
  return { project, tasks: out.tasks.filter(task => task.projectId === project.id) };
};
const rule = task => [task.recurrence.frequency, task.recurrence.interval];

test('R70: "Auto i motor" is a Redovne obaveze group with the thirteen chores at their rhythm', () => {
  const { project, tasks } = group(examples(), 'car-and-motorcycle');
  assert.deepEqual([project.name, project.isCleaningRoom, project.isArchived], ['Car and motorcycle', true, false]);
  assert.deepEqual(tasks.map(task => [task.title, ...rule(task)]), [
    ['Car registration and technical inspection', 'yearly', 1], ['Motorcycle registration', 'yearly', 1], ['Car service (oil and filters)', 'yearly', 1],
    ['Motorcycle service before the season', 'yearly', 1], ['Winter tyres', 'yearly', 1], ['Summer tyres', 'yearly', 1], ['Tyre pressure', 'monthly', 1],
    ['Car oil and fluids', 'monthly', 1], ['Lubricate and tension the motorcycle chain', 'weekly', 2], ['Motorcycle battery over the winter', 'monthly', 1],
    ['Car wash', 'weekly', 2], ['Wiper blades', 'yearly', 1], ['First aid kit expiry date in the car', 'yearly', 1],
  ]);
  const day = title => tasks.find(task => task.title === title).plannedDate;
  assert.equal(day('Motorcycle service before the season'), '2027-03-01');
  assert.equal(day('Winter tyres'), '2026-10-25', 'before winter equipment is required on 1 November');
  assert.equal(day('Summer tyres'), '2027-04-10');
  assert.ok(tasks.every(task => task.plannedDate === task.dueDate && task.plannedDate > '2026-10-13' && task.recurrence.seriesId === task.id && task.notes === ''));
});

test('R70: "Zdravlje i računi" keeps the dentist, the check-up, the eyes and the property tax', () => {
  const out = examples();
  const { project, tasks } = group(out, 'health-and-bills');
  assert.equal(project.areaId, out.areas.find(area => area.name === 'Health').id);
  assert.deepEqual(tasks.map(task => [task.title, ...rule(task)]), [
    ['Dentist', 'monthly', 6], ['Medical check-up', 'yearly', 1], ['Eye test', 'yearly', 2], ['Property tax', 'monthly', 3],
  ]);
  // The quarterly instalments fall due 45 days into each quarter: 14 February, 15 May, 14 August and 14 November.
  assert.equal(tasks.find(task => task.title === 'Property tax').dueDate, '2026-11-14');
  assert.equal(group(examples(emptyState(), '2026-11-20'), 'health-and-bills').tasks.find(task => task.title === 'Property tax').dueDate, '2027-02-14');
  assert.doesNotMatch(tasks.map(task => task.title).join(' '), /bills|mole|flu|ID card|licence/i);
});

test('R70: the shopping template follows the user\'s meal-plan list, group by group, into Groceries', () => {
  const out = examples();
  const template = out.templates.find(item => item.sampleKey === `${Starter.PREFIX}:template:meal-plan-shopping`);
  assert.ok(template);
  assert.deepEqual([template.name, template.type], ['Shopping for the meal plan (4 days)', 'task']);
  assert.equal(template.data.projectId, group(out, 'groceries').project.id);
  assert.equal(template.data.notes, 'For 8 days, double the amounts.');
  const items = template.data.subtasks.map(item => item.title);
  assert.equal(items.length, 32);
  assert.deepEqual(items.slice(0, 3), ['Chicken fillet – 620 g', 'Turkey fillet – 400 g', 'Lean beef – 220 g']);
  for (const title of ['Skyr – 500 g', 'Whey protein – 120 g', 'Oat flakes – 150 g', 'Potatoes – 900 g', 'Blueberries – 100 g', 'Creatine – 20 g', 'Omega-3 – as on the label', 'Canned mushrooms (drained) – 1100 g', 'Cucumber – 100 g']) {
    assert.ok(items.includes(title), title);
  }
  const made = Core.instantiateTemplate(template, '2026-10-20', { nowIso: stamp, state: { ...emptyState(), projects: out.projects } }).task;
  assert.equal(made.subtasks.length, 32);
  assert.equal(made.projectId, group(out, 'groceries').project.id);
});

test('R70: four saved views gather the open tasks of a tag', () => {
  const out = examples();
  const tag = name => out.tags.find(item => item.name === name).id;
  assert.deepEqual(plain(out.savedViews.map(view => [view.name, view.type, view.filters, view.isPinned])), [
    ['Shopping', 'tasks', { tagId: tag('Shopping'), completion: 'open' }, false], ['Work', 'tasks', { tagId: tag('Work'), completion: 'open' }, false],
    ['House', 'tasks', { tagId: tag('House'), completion: 'open' }, false], ['Health', 'tasks', { tagId: tag('Health'), completion: 'open' }, false],
  ]);
  const state = { ...emptyState(), ...out };
  assert.deepEqual(Core.applySavedView(out.savedViews[0], state).map(task => task.title), ['Summer jacket']);
  assert.ok(Core.applySavedView(out.savedViews[1], state).some(task => task.title === 'JavaScript'));
});

test('R70: the gift-ideas note joins the notes; the whole set validates and a second run adds nothing', () => {
  const out = examples();
  assert.deepEqual(out.notes.map(note => note.title), ['Clothing sizes', 'Emergency numbers', 'Gift ideas']);
  assert.equal(out.notes[2].body, 'Mom —\nDad —\nFriends —\nColleagues —');
  const state = Core.normalizeState(plain({ ...emptyState(), ...out }));
  assert.equal(Core.validateStateV3(state).ok, true);
  assert.doesNotThrow(() => Backup.validateDomain(state, [], []));
  const again = examples(state);
  assert.deepEqual(Object.values(again).map(list => list.length).reduce((a, b) => a + b, 0), 0);
});

test('R70: the toast counts the saved views; Redovne obaveze keeps offering its cleaning examples until they are added', () => {
  assert.match(read('js/habits-ui.js'), /tr\('Added \{areas\} Areas, \{projects\} Projects, \{tasks\} Tasks, \{goals\} Goals, \{habits\} Habits, \{tags\} Tags, \{notes\} Notes, \{resources\} Resources, \{templates\} Templates and \{savedViews\} Saved views\. All examples are editable\.'/);
  const list = functionSource('renderList', ['js/cleaning-ui.js']).source;
  assert.match(list, /const cleaningExamplesAdded = groupsOf\(ctx\)\.some\(group => String\(group\.cleaningSampleKey \|\| ''\)\.startsWith\('cleaning:'\)\);/);
  assert.match(list, /if \(!cleaningExamplesAdded\) html \+= `<div class="sheet-chips cleaning-chips">\$\{example\('apartment', msg\('Example: apartment'\)\)\}\$\{example\('house', msg\('Example: house'\)\)\}<\/div>`;/);
});

test('R70: the new examples are Serbian in the app', () => {
  require('../js/i18n-sr.js');
  I18n.setLanguage('sr');
  try {
    const out = examples();
    assert.equal(group(out, 'car-and-motorcycle').project.name, 'Auto i motor');
    assert.equal(group(out, 'health-and-bills').project.name, 'Zdravlje i računi');
    const template = out.templates.find(item => item.sampleKey.endsWith(':meal-plan-shopping'));
    assert.equal(template.name, 'Nabavka za plan ishrane (4 dana)');
    for (const title of ['Pileći file – 620 g', 'Belanca – 200 g', 'Integralni / ražani hleb – 300 g', 'Omega-3 – prema deklaraciji', 'Gotovi šampinjoni (oceđeni) – 1100 g']) {
      assert.ok(template.data.subtasks.some(item => item.title === title), title);
    }
    assert.deepEqual(out.savedViews.map(view => view.name), ['Kupovina', 'Posao', 'Kuća', 'Zdravlje']);
    assert.ok(out.tasks.some(task => task.title === 'Zimske gume'));
    assert.ok(out.notes.some(note => note.title === 'Ideje za poklone' && note.body.startsWith('Mama —')));
  } finally { I18n.setLanguage('en'); }
});

test('R70 is released as 2.0.0-alpha.97', () => {
  assert.equal(Release.APP_VERSION, '2.0.0-alpha.97');
  assert.match(read('sw.js'), /const VERSION = '2\.0\.0-alpha\.97';/);
  assert.equal(JSON.parse(read('package.json')).version, '2.0.0-alpha.97');
});
