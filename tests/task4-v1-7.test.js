const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const Core = require('../js/core.js');
global.TodoCore = Core;
global.TodoStorage = { attachmentOwners: () => [], attachmentBelongsTo: () => true, verifyAttachmentReferences: () => {} };
global.JSZip = require('../vendor/jszip.min.js');
const Backup = require('../js/backup.js');

function state(overrides = {}) {
  return {
    version: 3, tasks: [], projects: [], tags: [], areas: [],
    goals: [], habits: [], notes: [], resources: [], templates: [], savedViews: [],
    settings: {}, ui: {}, ...overrides,
  };
}

test('recurring reminders preserve local wall-clock time across a DST transition', () => {
  const script = `const Core=require('./js/core.js'); const task={id:'dst-source',title:'DST',projectId:null,areaId:null,goalIds:[],tagIds:[],plannedDate:'2026-03-07',dueDate:null,reminderAt:'2026-03-07T09:30:00-05:00',recurrence:{frequency:'daily',interval:1},isCompleted:true,completedAt:'2026-03-07T14:00:00Z',subtasks:[]}; const next=Core.buildNextRecurringTask(task,'2026-03-07T14:00:00Z','dst-next'); console.log(next.reminderAt);`;
  const reminder = execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: 'America/New_York' } }).toString().trim();
  assert.equal(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(reminder)), '09:30');
});

test('core validation rejects mismatched reciprocal Goal links', () => {
  const result = Core.validateGoalLinks(state({
    tasks: [{ id: 'task-1', title: 'Task', projectId: null, areaId: null, goalIds: ['goal-1'], plannedTime: null, dueTime: null }],
    goals: [{ id: 'goal-1', title: 'Goal', areaId: null, taskIds: [], projectLinks: [], habitLinks: [] }],
  }));
  assert.match(result, /goal-link/);
});

test('backup validation rejects invalid Note and Resource ISO timestamps', () => {
  const base = state({
    notes: [{ id: 'note-1', title: 'Note', body: 'Body', areaId: null, linkUrls: [], attachmentIds: [], createdAt: '2026-09-17T12:00:00.000Z', updatedAt: 'not-a-timestamp' }],
    resources: [],
  });
  assert.throws(() => Backup.validateDomain(base, [], []), /timestamp/i);
});

test('backup validation rejects IDs reused across entity collections', () => {
  const candidate = state({
    tasks: [{ id: 'same-id', title: 'Task', projectId: null, areaId: null, goalIds: [], plannedTime: null, dueTime: null }],
    projects: [{ id: 'same-id', name: 'Project', areaId: null, goalIds: [], isArchived: false }],
  });
  assert.throws(() => Backup.validateDomain(candidate, [], []), /duplicate-id|projects/);
});

test('Goal repair refuses owner-only project links without contribution metadata', () => {
  assert.throws(() => Core.repairGoalLinks(state({
    projects: [{ id: 'project-1', name: 'Project', areaId: null, goalIds: ['goal-1'], isArchived: false }],
    goals: [{ id: 'goal-1', title: 'Goal', areaId: null, taskIds: [], projectLinks: [], habitLinks: [] }],
  })), /repair required/i);
});
