const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../js/core.js');

test('V1.6 settings defaults are additive and preserve existing values', () => {
  const source = { weekStartsOn: 'monday', customPreference: 'keep' };
  const normalized = Core.normalizeV16Settings(source);

  assert.deepEqual(normalized, {
    weekStartsOn: 'monday',
    customPreference: 'keep',
    todayFocusFilter: 'all',
    todayFocusStrip: true,
    compactDensity: true,
    todayVisibleSections: ['focus', 'review', 'actions'],
  });
  assert.deepEqual(source, { weekStartsOn: 'monday', customPreference: 'keep' });
});

test('V1.6 migration preserves records, does not mutate input, and is idempotent', () => {
  const source = { version: 3, settings: {}, tasks: [{ id: 't1', title: 'Keep me' }], unknownRecords: [{ id: 'u1' }] };
  const once = Core.migrateStateV16(source);
  const twice = Core.migrateStateV16(once.state);

  assert.equal(once.changed, true);
  assert.equal(once.state.tasks[0].title, 'Keep me');
  assert.deepEqual(once.state.unknownRecords, [{ id: 'u1' }]);
  assert.equal(once.state.settings.todayFocusFilter, 'all');
  assert.equal(once.state.settings.todayFocusStrip, true);
  assert.equal(once.state.settings.compactDensity, true);
  assert.deepEqual(once.state.settings.todayVisibleSections, ['focus', 'review', 'actions']);
  assert.equal(once.state.settings.weekStartsOn, 1);
  assert.deepEqual(source, { version: 3, settings: {}, tasks: [{ id: 't1', title: 'Keep me' }], unknownRecords: [{ id: 'u1' }] });
  assert.deepEqual(twice.state, once.state);
  assert.equal(twice.changed, false);
  assert.deepEqual(twice.warnings, []);
});
