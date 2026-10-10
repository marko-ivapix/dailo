const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { withI18n } = require('./support/i18n.js');
const Core = require('../js/core.js');
const Release = require('../js/release.js');

// 2026-10-07 is a Wednesday (sreda).
const TODAY = '2026-10-07';
const tags = [{ id: 't1', name: 'posao' }];
const projects = [{ id: 'p1', name: 'Kućni projekat' }, { id: 'p2', name: 'Klijenti' }];
const areas = [{ id: 'a1', name: 'Zdravlje' }];
const EMPTY = { plannedDate: null, plannedTime: null, dueDate: null, durationMinutes: null, priority: null, tagIds: [], projectId: null, areaId: null };
const parse = (text, options = {}) => JSON.parse(JSON.stringify(Core.parseQuickAdd(text, { today: TODAY, tags, projects, areas, ...options })));
const expect = (text, fields, options) => assert.deepEqual(parse(text, options), { ...EMPTY, ...fields }, text);

test('one line carries project, tag, priority, due date, duration, plan date and time', () => {
  expect('Pošalji ponudu +Klijenti #posao !visok rok petak 45min sutra u 9:30', {
    title: 'Pošalji ponudu', projectId: 'p2', tagIds: ['t1'], priority: 'high', dueDate: '2026-10-09', durationMinutes: 45, plannedDate: '2026-10-08', plannedTime: '09:30',
  });
  expect('Send offer +Klijenti !low due friday 1h tomorrow at 09:30', {
    title: 'Send offer', projectId: 'p2', priority: 'low', dueDate: '2026-10-09', durationMinutes: 60, plannedDate: '2026-10-08', plannedTime: '09:30',
  });
});

test('plan dates: day words, relative days and weeks, and calendar dates', () => {
  const cases = {
    'Pijaca prekosutra': '2026-10-09', 'Pijaca za 3 dana': '2026-10-10', 'Pijaca za 2 nedelje': '2026-10-21', 'Pijaca za 1 nedelju': '2026-10-14',
    'Market in 3 days': '2026-10-10', 'Market in 2 weeks': '2026-10-21', 'Market in 1 day': '2026-10-08',
    'Pijaca 15.10.': '2026-10-15', 'Pijaca 15.10.2026.': '2026-10-15', 'Pijaca 15.10.2026': '2026-10-15', 'Market 2026-10-15': '2026-10-15',
    'Pijaca 7.10.': '2026-10-07', 'Pijaca 1.3.': '2027-03-01', 'Pijaca u nedelju': '2026-10-11', 'Pijaca sreda': '2026-10-14',
  };
  for (const [text, plannedDate] of Object.entries(cases)) expect(text, { title: text.replace(/ (?:prekosutra|za .*|in .*|[\d.-]+|u nedelju|sreda)$/, ''), plannedDate });
});

test('due dates: rok, do + genitive weekday, due', () => {
  const cases = {
    'Izveštaj rok petak': '2026-10-09', 'Izveštaj rok sutra': '2026-10-08', 'Izveštaj rok 15.10.': '2026-10-15',
    'Izveštaj do petka': '2026-10-09', 'Izveštaj do srede': '2026-10-14', 'Izveštaj do četvrtka': '2026-10-08', 'Izveštaj do cetvrtka': '2026-10-08',
    'Izveštaj do ponedeljka': '2026-10-12', 'Izveštaj do utorka': '2026-10-13', 'Izveštaj do subote': '2026-10-10', 'Izveštaj do nedelje': '2026-10-11',
    'Izveštaj do sutra': '2026-10-08', 'Izveštaj do 15.10.': '2026-10-15', 'Report due friday': '2026-10-09', 'Report due tomorrow': '2026-10-08',
  };
  for (const [text, dueDate] of Object.entries(cases)) expect(text, { title: text.replace(/ (?:rok|do|due) .*$/, ''), dueDate });
  expect('Izveštaj rok sutra', { title: 'Izveštaj', dueDate: '2026-10-08' }, { parsePlan: false });
});

test('durations in minutes and hours', () => {
  const cases = { '45min': 45, '45 min': 45, '45m': 45, '1h': 60, '1,5h': 90, '1.5h': 90, '1h30': 90, '1h30m': 90, '1h 30min': 90, '2 sata': 120, '1 sat': 60, '5 sati': 300, '24h': 1440 };
  for (const [token, durationMinutes] of Object.entries(cases)) expect(`Trening ${token}`, { title: 'Trening', durationMinutes });
});

test('trailing clauses come in any order, one per kind, and parsing stops at the first ordinary word', () => {
  expect('Trening 30min sutra', { title: 'Trening', durationMinutes: 30, plannedDate: '2026-10-08' });
  expect('Trening sutra 30min', { title: 'Trening', durationMinutes: 30, plannedDate: '2026-10-08' });
  expect('Sastanak sutra petak', { title: 'Sastanak sutra', plannedDate: '2026-10-09' });
  expect('Sastanak 30min 45min', { title: 'Sastanak 30min', durationMinutes: 45 });
  expect('Kupi sutra mleko', { title: 'Kupi sutra mleko' });
  expect('Pročitaj 2 sata dnevno', { title: 'Pročitaj 2 sata dnevno' });
});

test('invalid clauses leave the trailing part as written; tokens still apply', () => {
  for (const text of ['Zubar sutra u 25:00', 'Pijaca 31.02.', 'Trening 0min', 'Trening 1500min', 'Pijaca za 0 dana', 'Izveštaj rok 30.02.']) expect(text, { title: text });
  expect('Zubar #posao sutra u 25:00', { title: 'Zubar sutra u 25:00', tagIds: ['t1'] });
});

test('phrases that only look like clauses stay in the title', () => {
  for (const text of ['Uradi do 17:00', 'Idi do prodavnice', 'Trči 45 m', 'Kupi kolače za nedelju', 'Pozovi +381641234567', 'Pošalji mail na ana@example.com']) expect(text, { title: text });
});

test('project and Area tokens match existing names loosely; unknown tokens stay', () => {
  for (const token of ['+Kućni_projekat', '+kucni-projekat', '+KućniProjekat', '+KUCNI_PROJEKAT']) expect(`Popravi slavinu ${token}`, { title: 'Popravi slavinu', projectId: 'p1' });
  expect('Pregled @Zdravlje', { title: 'Pregled', areaId: 'a1' });
  expect('Pregled @zdravlje +Klijenti', { title: 'Pregled', projectId: 'p2' }, undefined);
  expect('Pregled +Nepoznato @Nigde #nema', { title: 'Pregled +Nepoznato @Nigde #nema' });
  for (const [token, priority] of Object.entries({ '!visok': 'high', '!srednji': 'medium', '!nizak': 'low', '!HIGH': 'high', '!medium': 'medium' })) expect(`Zadatak ${token}`, { title: 'Zadatak', priority });
});

test('with parsePlan false the plan words stay in the title, other clauses still parse', () => {
  expect('Zubar sutra u 9:30', { title: 'Zubar sutra', plannedTime: '09:30' }, { parsePlan: false });
  expect('Zubar 30min', { title: 'Zubar', durationMinutes: 30 }, { parsePlan: false });
});

test('V1.5 and V1.9 Quick Add results are unchanged', () => {
  expect('Plan sprint tomorrow 09:30', { title: 'Plan sprint', plannedDate: '2026-10-08', plannedTime: '09:30' });
  expect('Read 18:45', { title: 'Read', plannedTime: '18:45' });
  expect('Read 09:30 tomorrow notes', { title: 'Read 09:30 tomorrow notes' });
  expect('Send invoice tomorrow morning', { title: 'Send invoice tomorrow morning' });
  expect('Tomorrow report', { title: 'Tomorrow report' });
  expect('Sastanak u ponedeljak u 14:15', { title: 'Sastanak', plannedDate: '2026-10-12', plannedTime: '14:15' });
  expect('Plan u Monday', { title: 'Plan u', plannedDate: '2026-10-12' });
  expect('u sredu', { title: 'u sredu' });
});

function appContext(modalDraft = {}) {
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const slice = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
  const today = Core.dateOnly();
  const defaults = { projectId: null, areaId: null, plannedDate: null, explicitPlan: false };
  const state = { tasks: [], tags: [...tags], projects: [...projects], areas: [...areas], settings: {} };
  const context = { Core, state, modalState: { type: 'quick', defaults, draft: { title: '', subtasks: [], explicitPlan: false, ...modalDraft } },
    syncQuickDraftFromDom() {}, uid: () => 'task_1', nowIso: () => '2026-10-07T10:00:00.000Z', nextOrder: () => 0,
    saveState() {}, closeModal() {}, render() {}, renderModal() {}, requestAnimationFrame() {}, $() {}, syncTemplateEntityGoalLinks() {}, getProject: id => state.projects.find(project => project.id === id) };
  vm.createContext(withI18n(context));
  // Redesign R4: createTask files the task through quickPlace (picked place, parsed project, Inbox).
  vm.runInContext(`${slice('  function createTask(', '  function syncQuickDraftFromDom()')}\n${slice('  function parseQuickAddTitle(', '  function nextOrder(')}\n${slice('  function quickPlace(', '  // S7: the "Iz šablona" chip')}`, context);
  return { context, today };
}

test('saving applies parsed fields, keeps picker values first, and files a parsed project outside the Inbox', () => {
  const { context, today } = appContext({ title: 'Pošalji ponudu +Klijenti rok petak 45min !visok' });
  vm.runInContext('createTask(false)', context);
  const task = context.state.tasks[0];
  assert.equal(task.title, 'Pošalji ponudu');
  assert.equal(task.projectId, 'p2');
  assert.equal(task.areaId, null);
  assert.equal(task.priority, 'high');
  assert.equal(task.durationMinutes, 45);
  assert.equal(task.isInbox, false, 'a parsed project files the task outside the Inbox');
  assert.match(task.dueDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(task.dueDate > today && task.dueDate <= Core.addDays(today, 7));

  const explicit = appContext({ title: 'Zadatak +Klijenti rok petak 45min', projectId: 'p1', dueDate: '2030-01-01', durationMinutes: 15 });
  vm.runInContext('createTask(false)', explicit.context);
  const kept = explicit.context.state.tasks[0];
  assert.equal(kept.title, 'Zadatak');
  assert.equal(kept.projectId, 'p1');
  assert.equal(kept.dueDate, '2030-01-01');
  assert.equal(kept.durationMinutes, 15);
});

test('the Quick Add preview lists what the title will set and hides when nothing is recognized', () => {
  const source = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
  const slice = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
  const context = { Core, state: { tags, projects, areas }, esc: value => String(value), getProject: id => projects.find(p => p.id === id), getArea: id => areas.find(a => a.id === id), getTag: id => tags.find(t => t.id === id),
    relativeDateLabel: value => `D:${value}`, priorityLabel: value => `P:${value}` };
  vm.createContext(withI18n(context));
  vm.runInContext(`${slice('  function parseQuickAddTitle(', '  function nextOrder(')}\n${slice('  function quickParsePreview(', '  function renderQuickModal(')}`, context);
  const html = vm.runInContext("quickParsePreview(parseQuickAddTitle('Ponuda +Klijenti @Zdravlje #posao !visok rok petak 45min sutra u 9:30'))", context);
  assert.match(html, /^<div class="quick-parse-preview" data-quick-preview role="group" aria-label="Recognized in title">/);
  for (const part of ['ph-calendar-check', 'D:', '09:30', 'ph-flag', 'Due D:', 'ph-timer', '45 min', 'ph-folder-simple', 'Klijenti', 'ph-hash', 'posao', 'ph-arrow-fat-up', 'P:high']) assert.ok(html.includes(part), part);
  assert.doesNotMatch(html, /Zdravlje/, 'a project wins over an Area');
  assert.equal(vm.runInContext("quickParsePreview(parseQuickAddTitle('Samo naslov'))", context), '');
});

test('V1.10 shipped as 1.10.0 or later so installed apps get the update notice', () => {
  const [major, minor] = Release.APP_VERSION.split('.').map(Number);
  assert.ok(major > 1 || minor >= 10, Release.APP_VERSION);
  assert.ok(fs.readFileSync(require.resolve('../sw.js'), 'utf8').includes(`const VERSION = '${Release.APP_VERSION}';`));
});
