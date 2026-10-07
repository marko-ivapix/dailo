const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../js/core.js');

test('calendar time blocks retain independent task schedule metadata in planned-time order', () => {
  const state = {
    tasks: [
      { id: 'later', plannedDate: '2026-09-17', plannedTime: '14:00', dueDate: '2026-09-20', dueTime: '17:00' },
      { id: 'early', plannedDate: '2026-09-17', plannedTime: '09:00', dueDate: '2026-09-19', dueTime: '12:00' },
      { id: 'due-only', dueDate: '2026-09-17', dueTime: '08:00' },
    ],
  };

  const blocks = Core.calendarTimeBlocks(state, '2026-09-17');

  assert.deepEqual(blocks.map(entry => entry.task.id), ['early', 'later']);
  assert.deepEqual(blocks.map(entry => entry.task.dueDate), ['2026-09-19', '2026-09-20']);
  assert.deepEqual(blocks.map(entry => entry.task.dueTime), ['12:00', '17:00']);
});

test('calendar time block projection does not mutate task records', () => {
  const state = {
    tasks: [{ id: 't', plannedDate: '2026-09-17', plannedTime: '09:00', dueDate: '2026-09-19', dueTime: '17:00' }],
  };
  const snapshot = structuredClone(state);

  const entry = Core.calendarTimeBlocks(state, '2026-09-17')[0];

  assert.equal(entry.task.dueDate, '2026-09-19');
  assert.equal(entry.task.dueTime, '17:00');
  assert.deepEqual(state, snapshot);
});
