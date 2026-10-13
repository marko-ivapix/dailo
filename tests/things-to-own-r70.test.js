// R70: "Treba da imam" — the list of things to own that the user kept, as one example project with a task per group.
// Spec: docs/superpowers/specs/2026-10-13-r70-things-to-own.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Release = require('../js/release.js');
const I18n = require('../js/i18n.js');
const Starter = require('../js/starter-examples.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const PROJECT_COLORS = ['#5362FF', '#30CBAD', '#A879FF', '#4CC9F0', '#F5B942', '#FF8A5B', '#F06A8A', '#8FD14F'];
const emptyState = () => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: {}, ui: {} });
function examples(view = emptyState()) {
  let counter = 0;
  return Starter.workspaceExamples(view, { Core, uid: prefix => `${prefix}_${++counter}`, today: '2026-10-13', timestamp: '2026-10-13T08:00:00.000Z', habitDraft: () => ({}), PROJECT_COLORS });
}
const own = out => {
  const project = out.projects.find(item => item.sampleKey === `${Starter.PREFIX}:project:things-to-own`);
  assert.ok(project, 'the project exists');
  return { project, tasks: out.tasks.filter(task => task.projectId === project.id) };
};

const GROUPS = [
  ['Clothes and shoes', ['A dark suit', 'A light blue shirt', 'A dark plain tie', 'Leather belts, black and brown', 'Black leather shoes', 'Brown shoes or boots', 'White sneakers',
    'Dark jeans', 'Chinos', 'A polo shirt', 'A merino wool sweater', 'A winter coat', 'Rain jacket', 'A leather jacket', 'A good watch']],
  ['Grooming', ['Perfume', 'Face cream with SPF', 'A good mattress and pillow']],
  ['Tools and home', ['A basic toolbox (hammer, screwdrivers, pliers, tape measure, level)', 'A cordless drill', 'Hex and Torx key sets', 'A flashlight', 'Duct tape and WD-40',
    'A Swiss Army knife or multi-tool', 'A ladder', 'A fire extinguisher', 'A first aid kit', 'An extension cord', 'Iron']],
  ['Kitchen', ['A good kitchen knife', 'A cutting board', 'A cast-iron pan', 'A good pot', 'A coffee maker', 'A thermos']],
  ['Car and motorcycle', ['Jumper cables or a booster', 'A tyre inflator', 'A spare wheel and a jack', 'A tow rope', 'A good helmet and motorcycle protective gear',
    'A vest, a warning triangle and a first aid kit in the car']],
  ['Technology', ['A laptop', 'Power bank', 'Headphones', 'An external drive for backups', 'A password manager']],
  ['Documents and money', ['ID card and driving licence', 'An emergency fund', 'Travel health insurance', 'A folder with important documents', 'A card for payments abroad']],
  ['Nature and travel', ['A good backpack', 'A cabin suitcase', 'A tent and a sleeping bag', 'Hiking shoes', 'A water bottle']],
];

test('R70: "Things to own" is a Personal project with one task per group and the kept things as subtasks', () => {
  const out = examples();
  const { project, tasks } = own(out);
  assert.equal(project.name, 'Things to own');
  assert.equal(project.areaId, out.areas.find(area => area.name === 'Personal').id);
  assert.deepEqual(tasks.map(task => [task.title, task.subtasks.map(item => item.title)]), GROUPS);
  assert.equal(GROUPS.flatMap(([, items]) => items).length, 56);
  assert.deepEqual(tasks.map(task => task.projectOrder), GROUPS.map((_, index) => index));
  for (const task of tasks) task.subtasks.forEach((item, order) => assert.deepEqual([item.order, item.isCompleted, item.completedAt], [order, false, null]));
  assert.ok(tasks.every(task => !task.plannedDate && !task.dueDate && !task.plannedMonth && !task.tagIds.length));
});

test('R70: the removed things are gone, the reworded ones read as asked, and the mattress is under Grooming', () => {
  const items = own(examples()).tasks.flatMap(task => task.subtasks.map(item => item.title)).join(' | ');
  for (const gone of [/razor|trimmer/i, /nail/i, /white shirt/i, /T-shirts/i, /swim/i, /sportswear|training gear/i, /sunglasses/i, /wallet/i, /smartphone/i, /passport/i, /library|books/i, /hobby/i, /plant/i]) {
    assert.doesNotMatch(items, gone);
  }
  assert.match(items, /A dark suit \|/);
  assert.doesNotMatch(items, /fits well|portable battery/i);
  assert.equal(own(examples()).tasks.find(task => task.title === 'Grooming').subtasks.at(-1).title, 'A good mattress and pillow');
});

test('R70: the project joins the other example lists, after Movies and series', () => {
  const out = examples();
  // R71: the two Redovne obaveze groups follow the lists.
  assert.deepEqual(out.projects.map(project => project.name), ['Groceries', 'To buy', 'Clothes', 'Motorcycle', 'To learn', 'Bucket list', 'Movies and series', 'Things to own', 'Car and motorcycle', 'Health and bills']);
  const again = examples({ ...emptyState(), areas: out.areas, projects: out.projects, tasks: out.tasks });
  assert.equal(again.projects.length + again.tasks.length, 0, 'a second run adds nothing');
});

test('R70: the list is Serbian in the app', () => {
  require('../js/i18n-sr.js');
  I18n.setLanguage('sr');
  try {
    const { project, tasks } = own(examples());
    assert.equal(project.name, 'Treba da imam');
    assert.deepEqual(tasks.map(task => task.title), ['Odeća i obuća', 'Nega', 'Alat i kuća', 'Kuhinja', 'Auto i motor', 'Tehnologija', 'Dokumenti i novac', 'Priroda i putovanja']);
    const items = tasks.flatMap(task => task.subtasks.map(item => item.title));
    for (const title of ['Tamno odelo', 'Power bank', 'Kvalitetan dušek i jastuk', 'Akumulatorska bušilica', 'Liveni tiganj', 'Menadžer lozinki', 'Kofer za kabinu']) assert.ok(items.includes(title), title);
  } finally { I18n.setLanguage('en'); }
});

test('R70 shipped as 2.0.0-alpha.97 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 97);
});
