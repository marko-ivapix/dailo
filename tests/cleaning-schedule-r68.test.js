// R68: the Redovne obaveze examples follow a researched cleaning and replacement schedule by room, without daily chores.
// Spec: docs/superpowers/specs/2026-10-13-r68-cleaning-schedule.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/core.js');
const Backup = require('../js/backup.js');
const Release = require('../js/release.js');
const I18n = require('../js/i18n.js');
const { runInNewContextWithI18n } = require('./support/i18n.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const stamp = '2026-10-13T08:00:00.000Z';
const emptyState = () => ({ version: 3, tasks: [], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], journal: [], settings: Core.normalizeV16Settings({}), ui: {} });

function cleaning(state = emptyState()) {
  let adapter;
  let counter = 0;
  runInNewContextWithI18n(read('js/cleaning-ui.js'), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  const ctx = { state, Core, uid: prefix => `${prefix}_${++counter}`, nowIso: () => stamp, saveState: () => true, navigate() {}, saveAndRender() {} };
  const add = preset => adapter.handleAction('add-cleaning-examples', { target: { closest: () => ({ dataset: { action: 'add-cleaning-examples', cleaningPreset: preset } }) } }, ctx);
  return { state, add };
}
const rooms = state => state.projects.filter(project => project.isCleaningRoom);
const chore = (state, title) => { const found = state.tasks.find(task => task.title === title); assert.ok(found, title); return found; };
const rule = (state, title) => [chore(state, title).recurrence.frequency, chore(state, title).recurrence.interval];

test('R68: the apartment example has the six rooms, the house adds the garden', () => {
  const flat = cleaning();
  flat.add('apartment');
  assert.deepEqual(rooms(flat.state).map(room => room.name), ['Kitchen', 'Bathroom', 'Bedroom', 'Living Room', 'Hallway', 'Appliances']);
  const house = cleaning();
  house.add('house');
  assert.deepEqual(rooms(house.state).map(room => room.name), ['Kitchen', 'Bathroom', 'Bedroom', 'Living Room', 'Hallway', 'Appliances', 'Garden']);
  assert.ok(house.state.tasks.length > flat.state.tasks.length);
});

test('R68: each chore repeats at the researched rhythm', () => {
  const { state, add } = cleaning();
  add('apartment');
  for (const [title, expected] of [
    ['Replace the sponge', ['weekly', 2]], ['Disinfect the sink', ['weekly', 1]], ['Clean the range hood filter', ['monthly', 1]],
    ['Clean fridge', ['monthly', 3]], ['Clean the oven', ['monthly', 3]], ['Clean the coils behind the fridge', ['monthly', 6]], ['Defrost the freezer', ['monthly', 6]],
    ['Replace the water pitcher filter', ['monthly', 2]], ['Replace the tap water filter', ['monthly', 4]],
    ['Clean bathroom', ['weekly', 1]], ['Change the towels', ['weekly', 1]], ['Wash the shower curtain', ['monthly', 1]], ['Replace the toothbrushes', ['monthly', 3]],
    ['Replace the shower curtain', ['yearly', 1]], ['Flush the water heater', ['yearly', 1]], ['Replace the water heater anode', ['yearly', 4]],
    ['Change bedding', ['weekly', 1]], ['Change the duvet cover', ['weekly', 2]], ['Vacuum and turn the mattress', ['monthly', 3]],
    ['Wash the pillows', ['monthly', 6]], ['Replace the pillows', ['yearly', 2]],
    ['Wash the curtains', ['monthly', 6]], ['Clean the windows outside', ['monthly', 6]], ['Deep-clean the carpets', ['yearly', 1]],
    ['Vacuum hallway', ['daily', 3]], ['Wash the doormat', ['monthly', 1]],
    ['Run the washing machine cleaning program', ['monthly', 1]], ['Clean the washing machine pump filter', ['monthly', 3]], ['Replace the vacuum filter', ['yearly', 1]],
  ]) assert.deepEqual(rule(state, title), expected, title);
  assert.deepEqual(plain(chore(state, 'Clean bathroom').subtasks.map(item => item.title)), ['Toilet', 'Shower', 'Mirror', 'Floor']);
  assert.equal(chore(state, 'Replace the sponge').projectId, rooms(state).find(room => room.name === 'Kitchen').id);
});

test('R68: no daily chores, no reasons, no smoke alarm and no boiler service', () => {
  const { state, add } = cleaning();
  add('house');
  assert.ok(state.tasks.every(task => !(task.recurrence.frequency === 'daily' && task.recurrence.interval === 1)), 'nothing every day');
  assert.ok(state.tasks.every(task => task.notes === ''), 'the chores carry no explanations');
  const titles = state.tasks.map(task => task.title).join(' | ');
  assert.doesNotMatch(titles, /smoke|alarm|gas|boiler service|Wipe counters|Check boiler/i);
});

test('R68: first dates are spread so Today is not flooded; every chore starts today or later', () => {
  const { state, add } = cleaning();
  add('house');
  const today = Core.dateOnly();
  // R95: a chore has no strict deadline, only its planned day.
  assert.ok(state.tasks.every(task => task.plannedDate && task.dueDate === null && task.plannedDate >= today));
  assert.ok(state.tasks.filter(task => task.plannedDate === today).length <= 3);
  assert.ok(state.tasks.every(task => task.recurrence.seriesId === task.id && task.cleaningSampleKey.startsWith('cleaning:house:')));
});

test('R68: a second run adds nothing, and the set passes validation', () => {
  const { state, add } = cleaning();
  add('apartment');
  const before = [state.projects.length, state.tasks.length];
  add('apartment');
  assert.deepEqual([state.projects.length, state.tasks.length], before);
  const normalized = Core.normalizeState(plain(state));
  assert.equal(Core.validateStateV3(normalized).ok, true);
  assert.doesNotThrow(() => Backup.validateDomain(normalized, [], []));
});

test('R68: the chores are Serbian in the app', () => {
  require('../js/i18n-sr.js');
  I18n.setLanguage('sr');
  try {
    const { state, add } = cleaning();
    add('apartment');
    assert.deepEqual(rooms(state).map(room => room.name), ['Kuhinja', 'Kupatilo', 'Spavaća soba', 'Dnevna soba', 'Hodnik', 'Uređaji']);
    for (const title of ['Zameni sunđer', 'Odmrzni zamrzivač', 'Zameni četkice za zube', 'Promeni posteljinu', 'Operi otirač', 'Očisti filter pumpe veš mašine']) assert.ok(state.tasks.some(task => task.title === title), title);
  } finally { I18n.setLanguage('en'); }
});

test('R68 shipped as 2.0.0-alpha.95 or later (the newest release test pins the exact version)', () => {
  assert.match(Release.APP_VERSION, /^2\.0\.0-alpha\.\d{2,}$|^2\.\d+\.\d+/);
  assert.ok(Number(Release.APP_VERSION.split('alpha.')[1] ?? 99) >= 95);
});
