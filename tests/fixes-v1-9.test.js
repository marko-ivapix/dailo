const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { withI18n, runInNewContextWithI18n } = require('./support/i18n.js');

const Core = require('../js/core.js');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function registerModule(file) {
  let adapter;
  runInNewContextWithI18n(read(file), { window: { TodoDomainModules: { register: value => { adapter = value; } } } });
  return adapter;
}

function withCrypto(value, fn) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value, configurable: true, writable: true });
  try { return fn(); } finally { Object.defineProperty(globalThis, 'crypto', descriptor); }
}

const recurringTask = () => ({ id: 'r1', title: 'Series', plannedDate: '2026-10-01', dueDate: null, subtasks: [], goalIds: [], recurrence: { frequency: 'weekly', interval: 1 } });

test('G1: a favorite knowledge item renders an existing Phosphor fill star', () => {
  const knowledge = registerModule('js/knowledge.js');
  const note = { id: 'n1', title: 'Pinned', body: '', favorite: true, areaId: null, tagIds: [], linkUrls: ['https://example.com'], attachmentIds: [], createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z' };
  const html = knowledge.renderRoute({ type: 'notes' }, {
    state: { notes: [note], resources: [], tags: [], areas: [], ui: { knowledgeFilters: {} } },
    knowledgeCollection: type => (type === 'note' ? 'notes' : 'resources'),
    pageHeader: () => '', esc: value => String(value), getArea: () => null,
  });
  assert.match(html, /knowledge-favorite is-favorite[^>]*><i class="ph-fill ph-star"><\/i>/);
  assert.doesNotMatch(read('js/knowledge.js'), /ph-star-fill/);
});

test('G2: stored week start values are interpreted the same way as the Settings select', () => {
  assert.equal(Core.weekStartKey(0), 'sunday');
  assert.equal(Core.weekStartKey('sunday'), 'sunday');
  for (const value of [1, 'monday', undefined, null, 'unexpected']) assert.equal(Core.weekStartKey(value), 'monday');
  // 2026-10-07 is a Wednesday.
  assert.equal(Core.habitPeriodKey({ frequencyType: 'timesPerWeek' }, '2026-10-07', 0), '2026-10-04');
  assert.equal(Core.habitPeriodKey({ frequencyType: 'timesPerWeek' }, '2026-10-07', 'sunday'), '2026-10-04');
  assert.equal(Core.habitPeriodKey({ frequencyType: 'timesPerWeek' }, '2026-10-07', 1), '2026-10-05');
});

test('G2: callers resolve week start through Core.weekStartKey instead of a monday fallback', () => {
  for (const file of ['js/app.js', 'js/calendar-ui.js', 'js/habits-ui.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /weekStartsOn \|\| 'monday'/, `${file} must not treat a stored 0 as Monday`);
    assert.doesNotMatch(source, /settings\.weekStartsOn === 'sunday'/, `${file} must not ignore a stored 0`);
  }
});

test('G3: Settings no longer shows the stale disabled week-start placeholder', () => {
  const settings = registerModule('js/settings-ui.js');
  const html = settings.renderRoute({ type: 'settings' }, {
    state: { settings: { shortcuts: {}, compactDensity: true, todayFocusFilter: 'all', todayVisibleSections: [], weekStartsOn: 0 } },
    pageHeader: () => '', shortcutLabels: {}, shortcutError: () => '', notificationButtonLabel: () => 'Enable', esc: value => String(value),
  });
  assert.doesNotMatch(html, /disabled aria-disabled="true">Monday</);
  assert.match(html, /id="preference-week-start"/);
  assert.match(html, /<option value="sunday" selected>/);
});

test('D: makeUuid prefers randomUUID, then getRandomValues, then Math.random', () => {
  assert.equal(Core.makeUuid({ randomUUID: () => 'native-id' }), 'native-id');
  let calls = 0;
  const fromRandomValues = Core.makeUuid({ getRandomValues: bytes => { calls += 1; for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 37) % 256; return bytes; } });
  assert.equal(calls, 1);
  assert.match(fromRandomValues, UUID_V4);
  assert.match(Core.makeUuid(null), UUID_V4);
  assert.match(Core.makeUuid(), UUID_V4);
});

test('D: recurring split and template ids work without crypto.randomUUID (insecure context)', () => {
  const insecureCrypto = { getRandomValues: bytes => { for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 53 + 7) % 256; return bytes; } };
  withCrypto(insecureCrypto, () => {
    const branch = Core.splitRecurrenceForFuture(recurringTask(), { title: 'Future' }, '2026-10-08');
    assert.match(branch.recurrence.seriesId, /^r1_branch_2026-10-08_[0-9a-f]{8}-[0-9a-f]{4}-4/);
    const created = Core.instantiateTemplate({ type: 'task', data: { title: 'From template', plannedOffsetDays: 0 } }, '2026-10-07');
    assert.match(created.task.id, /^task_[0-9a-f]{8}-[0-9a-f]{4}-4/);
  });
});
