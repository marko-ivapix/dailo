const test = require('node:test');
const assert = require('node:assert/strict');

global.TodoCore = require('../js/core.js');
global.__TODO_TEST_MEMORY_DB__ = true;
const Storage = require('../js/storage.js');

test('storage normalization exposes V1.6 additive settings without dropping records', () => {
  const state = { version: 3, settings: {}, ui: {}, tasks: [{ id: 't1', title: 'Keep me' }], projects: [], tags: [], areas: [], goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [], unknownRecords: [{ id: 'u1' }] };
  const normalized = Storage.normalizeState(state);

  assert.equal(normalized.settings.todayFocusFilter, 'all');
  assert.equal(normalized.settings.todayFocusStrip, true);
  assert.equal(normalized.settings.compactDensity, true);
  assert.equal(normalized.settings.weekStartsOn, 1);
  assert.deepEqual(normalized.unknownRecords, [{ id: 'u1' }]);
});
