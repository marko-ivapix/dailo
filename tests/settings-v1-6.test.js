const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../js/core.js');

test('personalization defaults can be reset without touching entity data', () => {
  const settings = Core.normalizeV16Settings({
    todayFocusFilter: 'completed',
    compactDensity: false,
    todayFocusStrip: false,
    todayVisibleSections: ['focus'],
    weekStartsOn: 0,
    shortcuts: { newTask: 'N' },
  });
  const reset = Core.resetV16Settings(settings);

  assert.equal(settings.todayFocusFilter, 'completed');
  assert.equal(reset.todayFocusFilter, 'all');
  assert.equal(reset.compactDensity, true);
  assert.equal(reset.todayFocusStrip, true);
  assert.deepEqual(reset.todayVisibleSections, ['focus', 'review', 'actions']);
  assert.equal(reset.weekStartsOn, 1);
  assert.deepEqual(reset.shortcuts, { newTask: 'N' });
});

test('personalization normalization keeps only supported Today sections', () => {
  const settings = Core.normalizeV16Settings({ todayVisibleSections: ['actions', 'focus', 'actions', 'unknown'] });

  assert.deepEqual(settings.todayVisibleSections, ['focus', 'actions']);
});
