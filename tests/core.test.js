const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');

const TODAY = '2026-09-15';
const task = (overrides = {}) => ({
  id: overrides.id || Math.random().toString(36).slice(2),
  title: 'Task',
  notes: '',
  projectId: null,
  plannedDate: null,
  dueDate: null,
  isInbox: false,
  isCompleted: false,
  completedAt: null,
  subtasks: [],
  todayOrder: null,
  projectOrder: null,
  inboxOrder: null,
  createdAt: '2026-09-10T10:00:00.000Z',
  updatedAt: '2026-09-10T10:00:00.000Z',
  ...overrides,
});

test('today derivation enforces overdue > today > suggestions precedence', () => {
  const tasks = [
    task({ id: 'overdue', title: 'Overdue', dueDate: '2026-09-14', plannedDate: TODAY }),
    task({ id: 'today', title: 'Today', plannedDate: TODAY, dueDate: '2026-09-20' }),
    task({ id: 'dueToday', title: 'Due today', dueDate: TODAY }),
    task({ id: 'missed', title: 'Missed', plannedDate: '2026-09-14', dueDate: '2026-09-20' }),
    task({ id: 'dueTomorrow', title: 'Due tomorrow', dueDate: '2026-09-16' }),
    task({ id: 'done', title: 'Done', plannedDate: TODAY, isCompleted: true, completedAt: '2026-09-15T10:00:00.000Z' }),
  ];

  const result = Core.deriveTodaySections(tasks, TODAY);
  assert.deepEqual(result.overdue.map(t => t.id), ['overdue']);
  assert.deepEqual(result.today.map(t => t.id), ['today']);
  assert.deepEqual(result.suggestions.map(s => [s.task.id, s.reason]), [
    ['dueToday', 'due-today'],
    ['missed', 'missed-plan'],
    ['dueTomorrow', 'due-tomorrow'],
  ]);
  assert.deepEqual(result.completed.map(t => t.id), ['done']);
});

test('an inbox task with only a due date remains inbox and can also appear upcoming', () => {
  const inboxTask = task({ id: 'inbox-due', isInbox: true, dueDate: '2026-09-18' });
  assert.equal(Core.isInboxActive(inboxTask), true);
  const groups = Core.deriveUpcoming([inboxTask], TODAY);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].date, '2026-09-18');
  assert.equal(groups[0].items[0].task.id, 'inbox-due');
});

test('upcoming uses the earliest future relevant date and excludes overdue/today precedence', () => {
  const tasks = [
    task({ id: 'planned-first', plannedDate: '2026-09-17', dueDate: '2026-09-20' }),
    task({ id: 'due-first', plannedDate: '2026-09-22', dueDate: '2026-09-18' }),
    task({ id: 'today-plan', plannedDate: TODAY, dueDate: '2026-09-19' }),
    task({ id: 'overdue-future-plan', dueDate: '2026-09-14', plannedDate: '2026-09-18' }),
  ];

  const groups = Core.deriveUpcoming(tasks, TODAY);
  assert.deepEqual(groups.map(g => g.date), ['2026-09-17', '2026-09-18']);
  assert.equal(groups[0].items[0].task.id, 'planned-first');
  assert.equal(groups[0].items[0].displayReason, 'planned');
  assert.equal(groups[1].items[0].task.id, 'due-first');
  assert.equal(groups[1].items[0].displayReason, 'due');
});

test('search includes completed tasks and project matches with sensible ranking', () => {
  const tasks = [
    task({ id: 'a', title: 'Homepage', notes: '' }),
    task({ id: 'b', title: 'Review homepage copy', isCompleted: true, completedAt: '2026-09-14T10:00:00.000Z' }),
    task({ id: 'c', title: 'Other task', notes: 'homepage details' }),
  ];
  const projects = [
    { id: 'p1', name: 'Homepage Redesign', color: '#5362FF', order: 1 },
  ];
  const result = Core.searchItems(tasks, projects, 'homepage');
  assert.deepEqual(result.tasks.map(r => r.task.id), ['a', 'b', 'c']);
  assert.equal(result.tasks[1].task.isCompleted, true);
  assert.deepEqual(result.projects.map(p => p.id), ['p1']);
});

test('validateState rejects unsupported future versions and invalid task titles', () => {
  assert.deepEqual(Core.validateState({ version: 3, tasks: [], projects: [], tags: [], settings: {}, ui: {} }), {
    ok: false,
    reason: 'unsupported-version',
  });
  const invalid = Core.validateState({
    version: 1,
    tasks: [task({ title: '   ' })],
    projects: [],
    settings: {},
    ui: {},
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.reason, 'invalid-task');
});

test('anytime contains processed active tasks without a planned date', () => {
  const tasks = [
    task({ id: 'project-open', projectId: 'p1', dueDate: '2026-09-20' }),
    task({ id: 'processed-loose', isInbox: false }),
    task({ id: 'inbox', isInbox: true }),
    task({ id: 'planned', plannedDate: TODAY }),
    task({ id: 'done', isCompleted: true, completedAt: '2026-09-15T09:00:00.000Z' }),
  ];
  assert.deepEqual(Core.deriveAnytime(tasks).map(t => t.id), ['project-open', 'processed-loose']);
});

test('today suggestions include due-soon tasks two or three days away after due tomorrow', () => {
  const tasks = [
    task({ id: 'tomorrow', dueDate: '2026-09-16' }),
    task({ id: 'two-days', dueDate: '2026-09-17' }),
    task({ id: 'three-days', dueDate: '2026-09-18' }),
    task({ id: 'four-days', dueDate: '2026-09-19' }),
  ];
  const result = Core.deriveTodaySections(tasks, TODAY);
  assert.deepEqual(result.suggestions.map(s => [s.task.id, s.reason]), [
    ['tomorrow', 'due-tomorrow'],
    ['two-days', 'due-soon'],
    ['three-days', 'due-soon'],
  ]);
});

test('recurrence date advances daily weekly and monthly with end-of-month clamping', () => {
  assert.equal(Core.nextRecurrenceDate('2026-09-15', { frequency: 'daily', interval: 2 }), '2026-09-17');
  assert.equal(Core.nextRecurrenceDate('2026-09-15', { frequency: 'weekly', interval: 2 }), '2026-09-29');
  assert.equal(Core.nextRecurrenceDate('2026-01-31', { frequency: 'monthly', interval: 1 }), '2026-02-28');
});

test('buildNextRecurringTask clones content, advances dates and resets completion state', () => {
  const source = task({
    id: 'weekly',
    title: 'Weekly report',
    projectId: 'p1',
    plannedDate: '2026-09-15',
    dueDate: '2026-09-17',
    reminderAt: '2026-09-15T08:30:00.000Z',
    reminderFiredAt: '2026-09-15T08:30:01.000Z',
    recurrence: { frequency: 'weekly', interval: 1 },
    isCompleted: true,
    completedAt: '2026-09-15T09:00:00.000Z',
    subtasks: [
      { id: 's1', title: 'Collect numbers', isCompleted: true, order: 0 },
      { id: 's2', title: 'Send email', isCompleted: false, order: 1 },
    ],
    todayOrder: 3,
    projectOrder: 4,
  });
  const next = Core.buildNextRecurringTask(source, '2026-09-15T09:00:00.000Z', 'next-id');
  assert.equal(next.id, 'next-id');
  assert.equal(next.plannedDate, '2026-09-22');
  assert.equal(next.dueDate, '2026-09-24');
  assert.equal(next.reminderAt, '2026-09-22T08:30:00.000Z');
  assert.equal(next.reminderFiredAt, null);
  assert.equal(next.isCompleted, false);
  assert.equal(next.completedAt, null);
  assert.equal(next.todayOrder, null);
  assert.equal(next.projectOrder, null);
  assert.deepEqual(next.subtasks.map(s => s.isCompleted), [false, false]);
  assert.notEqual(next.subtasks[0].id, source.subtasks[0].id);
});

test('reminder due detection ignores completed, future and already-fired reminders', () => {
  const now = '2026-09-15T10:00:00.000Z';
  assert.equal(Core.isReminderDue(task({ reminderAt: '2026-09-15T09:59:00.000Z' }), now), true);
  assert.equal(Core.isReminderDue(task({ reminderAt: '2026-09-15T10:01:00.000Z' }), now), false);
  assert.equal(Core.isReminderDue(task({ reminderAt: '2026-09-15T09:59:00.000Z', reminderFiredAt: '2026-09-15T10:00:00.000Z' }), now), false);
  assert.equal(Core.isReminderDue(task({ reminderAt: '2026-09-15T09:59:00.000Z', isCompleted: true }), now), false);
});

test('completed filtering supports project and rolling period', () => {
  const tasks = [
    task({ id: 'recent-p1', projectId: 'p1', isCompleted: true, completedAt: '2026-09-14T10:00:00.000Z' }),
    task({ id: 'recent-p2', projectId: 'p2', isCompleted: true, completedAt: '2026-09-12T10:00:00.000Z' }),
    task({ id: 'old-p1', projectId: 'p1', isCompleted: true, completedAt: '2026-08-01T10:00:00.000Z' }),
    task({ id: 'open', projectId: 'p1', isCompleted: false }),
  ];
  assert.deepEqual(Core.filterCompleted(tasks, { projectId: 'p1', periodDays: 7 }, '2026-09-15T12:00:00.000Z').map(t => t.id), ['recent-p1']);
  assert.deepEqual(Core.filterCompleted(tasks, { projectId: null, periodDays: 30 }, '2026-09-15T12:00:00.000Z').map(t => t.id), ['recent-p1', 'recent-p2']);
});


test('migrateStateV2 preserves v1 data and adds v2 defaults', () => {
  const legacy = {
    version: 1,
    tasks: [task({ id: 'legacy', title: 'Legacy', reminderAt: '2026-09-16T10:00:00.000Z', recurrence: { frequency: 'weekly', interval: 1 } })],
    projects: [{ id: 'p1', name: 'Project', color: '#5362FF', order: 0, isArchived: true, archivedAt: '2026-09-01T10:00:00.000Z' }],
    settings: { weekStartsOn: 'monday' },
    ui: { sidebarCollapsed: true, completedPeriod: 7 },
  };
  const result = Core.migrateStateV2(legacy);
  assert.equal(result.ok, true);
  assert.equal(result.migrated, true);
  assert.equal(result.state.version, 2);
  assert.deepEqual(result.state.tags, []);
  assert.equal(result.state.tasks[0].reminderAt, legacy.tasks[0].reminderAt);
  assert.deepEqual(result.state.tasks[0].recurrence, legacy.tasks[0].recurrence);
  assert.deepEqual(result.state.tasks[0].tagIds, []);
  assert.equal(result.state.tasks[0].priority, 'none');
  assert.deepEqual(result.state.tasks[0].attachmentIds, []);
  assert.equal(result.state.projects[0].isArchived, true);
  assert.equal(result.state.ui.completedPeriod, 7);
});

test('migrateStateV2 normalizes v2 task refs and rejects future versions', () => {
  const v2 = {
    version: 2,
    tasks: [task({ id: 't1', title: 'Tagged', tagIds: ['tag1', 'missing'], priority: 'high', attachmentIds: ['a1'] })],
    projects: [],
    tags: [{ id: 'tag1', name: 'Work', color: '#5362FF', createdAt: TODAY, updatedAt: TODAY }],
    settings: {}, ui: {},
  };
  const result = Core.migrateStateV2(v2);
  assert.equal(result.ok, true);
  assert.equal(result.migrated, false);
  assert.deepEqual(result.state.tasks[0].tagIds, ['tag1']);
  assert.equal(result.state.tasks[0].priority, 'high');
  assert.deepEqual(Core.migrateStateV2({ version: 99, tasks: [], projects: [], tags: [] }), { ok: false, reason: 'unsupported-version' });
});

test('tag validation trims names, rejects duplicates case-insensitively and supports edit exclusion', () => {
  const tags = [
    { id: 'a', name: 'WordPress', color: '#5362FF' },
    { id: 'b', name: 'Client', color: '#30CBAD' },
  ];
  assert.equal(Core.normalizeTagName('  WordPress  '), 'WordPress');
  assert.deepEqual(Core.validateTagName(tags, ' wordpress '), { ok: false, reason: 'duplicate-tag' });
  assert.deepEqual(Core.validateTagName(tags, ' wordpress ', 'a'), { ok: true });
  assert.deepEqual(Core.validateTagName(tags, '   '), { ok: false, reason: 'empty-tag' });
});

test('tasksForTag returns only active matching tasks without priority reordering', () => {
  const tasks = [
    task({ id: 'first', tagIds: ['tag1'], priority: 'low', createdAt: '2026-09-10T01:00:00.000Z' }),
    task({ id: 'second', tagIds: ['tag1'], priority: 'high', createdAt: '2026-09-10T02:00:00.000Z' }),
    task({ id: 'done', tagIds: ['tag1'], isCompleted: true, completedAt: TODAY }),
    task({ id: 'other', tagIds: ['tag2'] }),
  ];
  assert.deepEqual(Core.tasksForTag(tasks, 'tag1').map(t => t.id), ['first', 'second']);
});

test('parseQuickPlanPhrase supports trailing today tomorrow and weekday only', () => {
  assert.deepEqual(Core.parseQuickPlanPhrase('Send invoice tomorrow', TODAY), { title: 'Send invoice', plannedDate: '2026-09-16' });
  assert.deepEqual(Core.parseQuickPlanPhrase('Call today', TODAY), { title: 'Call', plannedDate: TODAY });
  assert.deepEqual(Core.parseQuickPlanPhrase('Update homepage Friday', TODAY), { title: 'Update homepage', plannedDate: '2026-09-18' });
  assert.deepEqual(Core.parseQuickPlanPhrase('Tomorrow report', TODAY), { title: 'Tomorrow report', plannedDate: null });
  assert.deepEqual(Core.parseQuickPlanPhrase('Send invoice tomorrow morning', TODAY), { title: 'Send invoice tomorrow morning', plannedDate: null });
});

test('cloneTaskForDuplicate copies task metadata, resets completion and attachments, and gives subtasks new ids', () => {
  const source = task({
    id: 'source', title: 'Source', notes: 'Notes', projectId: 'p1', plannedDate: '2026-09-16', dueDate: '2026-09-17',
    tagIds: ['tag1'], priority: 'high', attachmentIds: ['att1'], reminderAt: '2026-09-16T09:00:00.000Z',
    recurrence: { frequency: 'weekly', interval: 1 }, isCompleted: true, completedAt: '2026-09-15T10:00:00.000Z',
    subtasks: [{ id: 's1', title: 'One', isCompleted: true, order: 0 }]
  });
  const copy = Core.cloneTaskForDuplicate(source, 'copy', '2026-09-15T12:00:00.000Z');
  assert.equal(copy.id, 'copy');
  assert.equal(copy.title, source.title);
  assert.equal(copy.notes, source.notes);
  assert.deepEqual(copy.tagIds, ['tag1']);
  assert.equal(copy.priority, 'high');
  assert.equal(copy.isCompleted, false);
  assert.equal(copy.completedAt, null);
  assert.deepEqual(copy.attachmentIds, []);
  assert.notEqual(copy.subtasks[0].id, source.subtasks[0].id);
  assert.equal(copy.subtasks[0].isCompleted, false);
  assert.equal(copy.createdAt, '2026-09-15T12:00:00.000Z');
});
