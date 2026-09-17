const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync(require.resolve('../js/app.js'), 'utf8');
const tasksUi = fs.readFileSync(require.resolve('../js/tasks-ui.js'), 'utf8');

function inboxHelpers(sourceStart, sourceEnd) {
  const context = {
    Core: { isInboxActive: item => Boolean(item?.isInbox && !item.isCompleted) },
    clampOrder: value => Number.isFinite(value) ? value : 999999,
  };
  vm.createContext(context);
  vm.runInContext(`${app.slice(app.indexOf(sourceStart), app.indexOf(sourceEnd))}`, context);
  return context;
}

test('Inbox exposes focused type filters without changing Search', () => {
  assert.match(app, /data-action="inbox-filter"/);
  assert.match(app, /INBOX_FILTERS = \[\['all', 'All'\], \['tasks', 'Tasks'\], \['goals', 'Goals'\], \['habits', 'Habits'\], \['notes', 'Notes'\], \['resources', 'Resources'\]\]/);
  assert.match(app, /function openSearch\(\)/);
  assert.match(app, /searchResultsHtml\(modalState\.query/);
});

test('Inbox groups captured items by Today, Yesterday and This week', () => {
  assert.match(app, /const order = \['Today', 'Yesterday', 'This week', 'Earlier'\]/);
  assert.match(app, /class="inbox-group-label"/);
  assert.match(app, /state\.ui\.inboxFilter/);
});

test('Inbox keeps one-at-a-time triage actions and supports Tomorrow', () => {
  assert.match(tasksUi, /data-action="inbox-today"/);
  assert.match(tasksUi, /data-action="inbox-anytime"/);
  assert.match(app, /action === 'inbox-tomorrow'/);
});

test('Inbox All preserves task inbox order and sidebar count uses all records', () => {
  const context = inboxHelpers('  function inboxRecordsForState', '  function inboxGroupForDate');
  const source = {
    tasks: [
      { id: 'late', isInbox: true, inboxOrder: 4, createdAt: '2026-09-17T10:00:00Z' },
      { id: 'first', isInbox: true, inboxOrder: 0, createdAt: '2026-09-17T08:00:00Z' },
      { id: 'middle', isInbox: true, inboxOrder: 2, createdAt: '2026-09-17T09:00:00Z' },
    ],
    goals: [{ id: 'goal-1', isInbox: true, status: 'active' }],
    habits: [{ id: 'habit-1', isInbox: true, status: 'archived' }],
    notes: [], resources: [],
  };
  const ids = context.inboxRecordsForState(source, 'all').map(record => record.item.id);
  assert.equal(ids.join(','), 'first,middle,late,goal-1');
  assert.equal(context.inboxRecordsForState(source, 'all').length, 4);
  assert.equal(context.inboxRecordsForState(source, 'tasks').map(record => record.item.id).join(','), 'first,middle,late');
});

test('mixed Inbox records can be removed without deleting the entity', () => {
  const context = inboxHelpers('  function removeInboxRecordFromState', '  function removeInboxRecord(type, id)');
  const source = { goals: [{ id: 'goal-1', isInbox: true, status: 'active', title: 'Plan' }] };
  assert.equal(context.removeInboxRecordFromState(source, 'goal', 'goal-1', '2026-09-17T12:00:00Z'), true);
  assert.equal(source.goals.length, 1);
  assert.equal(source.goals[0].isInbox, false);
  assert.equal(source.goals[0].updatedAt, '2026-09-17T12:00:00Z');
  assert.equal(context.removeInboxRecordFromState(source, 'goal', 'goal-1', '2026-09-17T12:01:00Z'), false);
});
