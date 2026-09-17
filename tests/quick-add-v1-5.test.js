const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');

test('Quick Add parses only valid trailing date and time phrases', () => {
  const today = '2026-09-17';
  assert.deepEqual(Core.parseQuickPlanPhrase('Plan sprint tomorrow 09:30', today), { title: 'Plan sprint', plannedDate: '2026-09-18', plannedTime: '09:30' });
  assert.deepEqual(Core.parseQuickPlanPhrase('Call Monday at 10:00', today), { title: 'Call', plannedDate: '2026-09-21', plannedTime: '10:00' });
  assert.deepEqual(Core.parseQuickPlanPhrase('Read 18:45', today), { title: 'Read', plannedDate: null, plannedTime: '18:45' });
  assert.deepEqual(Core.parseQuickPlanPhrase('Read tomorrow 25:00', today), { title: 'Read tomorrow 25:00', plannedDate: null });
  assert.deepEqual(Core.parseQuickPlanPhrase('Read 09:30 tomorrow notes', today), { title: 'Read 09:30 tomorrow notes', plannedDate: null });
});
