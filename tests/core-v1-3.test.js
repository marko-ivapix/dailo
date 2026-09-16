const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');

test('task template offsets resolve from instantiation date', () => {
  const tpl = { type:'task', data:{ title:'Proposal', plannedOffsetDays:0, dueOffsetDays:3 } };
  const out = Core.instantiateTemplate(tpl, '2026-09-20', { taskId:'new-task' });
  assert.equal(out.task.plannedDate, '2026-09-20');
  assert.equal(out.task.dueDate, '2026-09-23');
  assert.equal(Core.instantiateTemplate({type:'task',data:{title:'Undated',dueOffsetDays:-1,recurrence:{frequency:null,interval:null}}},'2028-03-01',{taskId:'undated'}).task.recurrence,null);
});

test('goal template excludes live links history progress and completed milestone state', () => {
  const goal = {
    id:'g1', title:'Launch', areaId:'a1', progressMode:'manual', progressType:'percentage',
    currentValue:70, targetValue:100, unit:'%', targetDate:'2026-11-15',
    projectLinks:[{projectId:'p1',contributionMode:'allTasks',selectedTaskIds:[]}],
    taskIds:['t1'], habitLinks:[{habitId:'h1',metric:'streak',target:30}],
    milestones:[{id:'m1',title:'Beta',date:'2026-10-01',isCompleted:true,completedAt:'2026-09-30T10:00:00Z',order:0}],
    reminders:{sevenDaysBefore:true,threeDaysBefore:false,oneDayBefore:true,onTargetDate:true,time:'09:00'}
  };
  const tpl = Core.templateFromEntity('goal', goal, { projects:[], tasks:[], habits:[] });
  assert.equal(tpl.data.projectLinks, undefined);
  assert.equal(tpl.data.taskIds, undefined);
  assert.equal(tpl.data.habitLinks, undefined);
  assert.equal(tpl.data.currentValue, undefined);
  assert.equal(tpl.data.milestones.every(m=>m.isCompleted === false && m.completedAt == null), true);
});

test('template snapshots keep nested relative dates independent and reset runtime with fresh IDs', () => {
  let counter = 0;
  const ids = { makeId: prefix => `${prefix}-fresh-${++counter}`, nowIso:'2026-10-24T12:00:00Z' };
  const state = {areas:[{id:'a'}], goals:[{id:'g'}], tags:[{id:'tag'}], projects:[{id:'p',areaId:'a'}], tasks:[]};
  const source = {id:'old',title:'Task',projectId:'p',areaId:null,goalIds:['g'],tagIds:['tag'],plannedDate:'2026-10-24',plannedTime:'08:00',dueDate:'2026-10-27',dueTime:'17:00',reminderAt:new Date(2026,9,25,9,30).toISOString(),reminderFiredAt:'old',attachmentIds:['file'],isCompleted:true,subtasks:[{id:'s',title:'Child',isCompleted:true}],recurrence:{frequency:'weekly',interval:2}};
  state.tasks = [source];
  const tpl = Core.templateFromEntity('task',source,state,'2026-10-24');
  assert.equal(tpl.data.plannedDate,undefined);
  assert.equal(tpl.data.reminderAt,undefined);
  assert.equal(tpl.data.reminderOffsetDays,1);
  source.subtasks[0].title='Changed'; source.recurrence.interval=8;
  const out=Core.instantiateTemplate(tpl,'2026-10-25',{...ids,state}).task;
  assert.equal(out.plannedDate,'2026-10-25'); assert.equal(out.dueDate,'2026-10-28');
  assert.equal(out.plannedTime,'08:00'); assert.equal(out.dueTime,'17:00');
  assert.equal(new Date(out.reminderAt).getHours(),9); assert.equal(Core.dateOnly(new Date(out.reminderAt)),'2026-10-26');
  assert.equal(out.areaId,null); assert.deepEqual(out.goalIds,['g']); assert.deepEqual(out.tagIds,['tag']);
  assert.equal(out.isCompleted,false); assert.deepEqual(out.attachmentIds,[]); assert.equal(out.reminderFiredAt,null);
  assert.equal(out.subtasks[0].title,'Child'); assert.equal(out.subtasks[0].isCompleted,false); assert.notEqual(out.subtasks[0].id,'s'); assert.equal(out.recurrence.interval,2);
  const missing=Core.instantiateTemplate(tpl,'2028-02-28',{...ids,state:{projects:[],areas:[],goals:[],tags:[]}}).task;
  assert.equal(missing.projectId,null); assert.equal(missing.areaId,null); assert.deepEqual(missing.goalIds,[]); assert.deepEqual(missing.tagIds,[]); assert.equal(missing.dueDate,'2028-03-02');
  const project=Core.templateFromEntity('project',{id:'p',name:'Project',areaId:'a',goalIds:['g'],isArchived:true},state,'2026-10-24');
  const a=Core.instantiateTemplate(project,'2026-12-31',{...ids,state});
  const b=Core.instantiateTemplate(project,'2027-01-02',{...ids,state});
  assert.notEqual(a.project.id,b.project.id); assert.equal(a.project.isArchived,false);
  assert.equal(a.tasks[0].projectId,a.project.id); assert.equal(a.tasks[0].areaId,null); assert.equal(a.tasks[0].dueDate,'2027-01-03');
  assert.notEqual(a.tasks[0].id,b.tasks[0].id); assert.notEqual(a.tasks[0].subtasks[0].id,b.tasks[0].subtasks[0].id);
});

test('habit and goal templates rebase end targets and milestones without tracking timelines', () => {
  let n=0; const ids={makeId:p=>`${p}-${++n}`,state:{areas:[],goals:[]}};
  const h=Core.templateFromEntity('habit',{id:'old',name:'Habit',status:'paused',startDate:'2026-01-01',endType:'date',endDate:'2026-09-19',pauseIntervals:[{}],logs:[{}],quickValues:[1,2],reminders:[{id:'r',time:'09:00',enabled:true}],reminderFiredMoments:['x'],lastContinuationPeriod:'x'}, {}, '2026-09-20');
  assert.equal(h.data.startDate,undefined); assert.equal(h.data.endDate,undefined); assert.equal(h.data.endOffsetDays,-1);
  const fresh=Core.instantiateTemplate(h,'2027-01-01',ids).habit;
  assert.equal(fresh.startDate,'2027-01-01'); assert.equal(fresh.endDate,'2026-12-31'); assert.equal(fresh.status,'active');
  assert.deepEqual(fresh.reminderFiredMoments,[]); assert.deepEqual(fresh.pauseIntervals,[]); assert.equal(fresh.logs,undefined); assert.equal(fresh.lastContinuationPeriod,undefined); assert.notEqual(fresh.reminders[0].id,'r');
  const g=Core.templateFromEntity('goal',{id:'g',title:'Goal',currentValue:70,targetValue:100,targetDate:'2026-09-23',milestones:[{id:'m',title:'First',date:'2026-09-19',isCompleted:true},{id:'u',title:'Undated'}],history:[{}],reminderFiredMoments:['x']},{},'2026-09-20');
  const out=Core.instantiateTemplate(g,'2028-03-01',ids).goal;
  assert.equal(out.currentValue,0); assert.equal(out.targetDate,'2028-03-04'); assert.equal(out.milestones[0].date,'2028-02-29'); assert.equal(out.milestones[1].date,null);
  assert.equal(out.milestones[0].isCompleted,false); assert.notEqual(out.milestones[0].id,'m'); assert.deepEqual(out.projectLinks,[]); assert.deepEqual(out.taskIds,[]); assert.deepEqual(out.habitLinks,[]); assert.equal(out.history,undefined);
});

test('project and habit template snapshots rebind independent per-goal relation settings', () => {
  let n=0;const ids={makeId:p=>`${p}-${++n}`};
  const state={projects:[{id:'p',name:'P',goalIds:['g']}],tasks:[{id:'t0',title:'Zero',projectId:'p',projectOrder:0},{id:'t1',title:'One',projectId:'p',projectOrder:1}],habits:[{id:'h',name:'H',goalIds:['g']}],goals:[{id:'g',projectLinks:[{projectId:'p',contributionMode:'selectedTasks',selectedTaskIds:['t1']}],habitLinks:[{habitId:'h',metric:'streak',target:30}]}]};
  const project=Core.templateFromEntity('project',state.projects[0],state,'2026-09-20');
  const habit=Core.templateFromEntity('habit',state.habits[0],state,'2026-09-20');
  assert.deepEqual(project.data.goalLinkConfigs,[{goalId:'g',contributionMode:'selectedTasks',selectedTaskIndices:[1]}]);
  assert.deepEqual(habit.data.goalLinkConfigs,[{goalId:'g',metric:'streak',target:30}]);
  state.goals[0].projectLinks[0].selectedTaskIds=[];state.goals[0].habitLinks[0].target=2;
  const p=Core.instantiateTemplate(project,'2026-10-01',{...ids,state});const h=Core.instantiateTemplate(habit,'2026-10-01',{...ids,state});
  assert.deepEqual(p.goalLinks,[{goalId:'g',contributionMode:'selectedTasks',selectedTaskIds:[p.tasks[1].id]}]);
  assert.deepEqual(h.goalLinks,[{goalId:'g',metric:'streak',target:30}]);
  p.goalLinks[0].selectedTaskIds.length=0; h.goalLinks[0].target=1;
  assert.deepEqual(project.data.goalLinkConfigs[0].selectedTaskIndices,[1]);assert.equal(habit.data.goalLinkConfigs[0].target,30);
  assert.deepEqual(Core.instantiateTemplate(project,'2026-10-01',{...ids,state:{goals:[]}}).goalLinks,[]);
  assert.deepEqual(Core.instantiateTemplate(habit,'2026-10-01',{...ids,state:{goals:[]}}).goalLinks,[]);
});

test('calendar merges same-day task dates and retains independent event times and object identity', () => {
  const a = { id: 'a', title: 'A', plannedDate: '2026-10-28', plannedTime: '09:00', dueDate: '2026-10-30', dueTime: '17:00' };
  const b = { id: 'b', title: 'B', plannedDate: '2026-10-29', plannedTime: '14:00', dueDate: '2026-10-29', dueTime: '18:00' };
  const state = { tasks: [a, b], goals: [], habits: [] };
  const planned = Core.deriveCalendarDay(state, [], '2026-10-28');
  const due = Core.deriveCalendarDay(state, [], '2026-10-30');
  const combined = Core.deriveCalendarDay(state, [], '2026-10-29');
  assert.equal(planned.tasks[0].task, a);
  assert.equal(due.tasks[0].task, a);
  assert.equal(planned.tasks[0].kind, 'planned');
  assert.equal(due.tasks[0].kind, 'due');
  assert.equal(planned.timed[0].time, '09:00');
  assert.equal(due.timed[0].time, '17:00');
  assert.equal(combined.tasks.length, 1);
  assert.equal(combined.tasks[0].kind, 'planned+due');
  assert.equal(combined.tasks[0].task, b);
  assert.equal(combined.timed[0].time, '14:00');
});

test('calendar week partitions all-day entries and sorts timed tasks chronologically without mutating state', () => {
  const state = { tasks: [
    { id: 'late', title: 'Late', plannedDate: '2026-10-29', plannedTime: '16:00' },
    { id: 'all', title: 'All day', plannedDate: '2026-10-29' },
    { id: 'early', title: 'Early', dueDate: '2026-10-29', dueTime: '08:00' },
  ], goals: [{ id: 'g', title: 'Goal', targetDate: '2026-10-29', milestones: [{ id: 'm', title: 'Milestone', date: '2026-10-29' }] }],
  habits: [{ id: 'h', name: 'Wednesday', status: 'active', frequencyType: 'weekdays', weekdays: [3], startDate: '2026-10-01' }] };
  const before = JSON.stringify(state);
  const week = Core.deriveCalendarWeek(state, [], '2026-10-26');
  assert.deepEqual(week.map(day => day.date), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  assert.deepEqual(week[3].timed.map(entry => entry.task.id), ['early', 'late']);
  assert.deepEqual(week[3].allDay.map(entry => entry.type), ['task', 'goal', 'milestone']);
  assert.equal(week[2].habits[0].habit.id, 'h');
  assert.equal(week[3].habits.length, 0);
  assert.equal(JSON.stringify(state), before);
});

test('calendar month summary uses actual leap-year and year-boundary dates with counts only', () => {
  const state = { tasks: [{ id: 't', plannedDate: '2028-02-29', dueDate: '2028-02-29' }], habits: [], goals: [] };
  const leap = Core.deriveCalendarMonthSummary(state, [], '2028-02');
  assert.equal(leap.length, 29);
  assert.equal(leap[0].date, '2028-02-01');
  assert.equal(leap[28].date, '2028-02-29');
  assert.deepEqual(leap[28].counts, { tasks: 1, habits: 0, goals: 0, milestones: 0 });
  assert.equal('tasks' in leap[28], false);
  assert.equal(Core.deriveCalendarMonthSummary(state, [], '2027-02').length, 28);
  assert.equal(Core.deriveCalendarMonthSummary(state, [], '2026-12').at(-1).date, '2026-12-31');
  assert.equal(Core.deriveCalendarMonthSummary(state, [], '2027-01')[0].date, '2027-01-01');
});

test('calendar visibility consistently filters day, week, and month without changing entities', () => {
  const state = { tasks: [{ id: 't', plannedDate: '2026-10-29' }], habits: [], goals: [{ id: 'g', targetDate: '2026-10-29', milestones: [{ id: 'm', date: '2026-10-29' }] }], ui: { calendarVisibility: { tasks: false, goals: false, milestones: true, habits: true } } };
  const day = Core.deriveCalendarDay(state, [], '2026-10-29');
  assert.equal(day.tasks.length, 0);
  assert.equal(day.goals.length, 0);
  assert.equal(day.milestones.length, 1);
  assert.equal(Core.deriveCalendarWeek(state, [], '2026-10-26')[3].allDay.length, 1);
  assert.deepEqual(Core.deriveCalendarMonthSummary(state, [], '2026-10')[28].counts, { tasks: 0, habits: 0, goals: 0, milestones: 1 });
});

test('calendar is a literal date projection but Habits use only canonical active schedules and statuses', () => {
  const state = { projects: [{ id: 'p', isArchived: true }], tasks: [{ id: 't', projectId: 'p', isCompleted: true, plannedDate: '2026-10-29' }],
    goals: ['active', 'paused', 'completed', 'archived'].map(status => ({ id: status, status, targetDate: '2026-10-29', milestones: [{ id: `m-${status}`, date: '2026-10-29', isCompleted: true }] })),
    habits: ['active', 'paused', 'archived'].map(status => ({ id: `h-${status}`, status, frequencyType: 'daily', startDate: '2026-10-01', trackingType: 'checkbox' })) };
  const logs = [{ id: 'l', habitId: 'h-active', date: '2026-10-29', status: 'done' }];
  const day = Core.deriveCalendarDay(state, logs, '2026-10-29');
  assert.equal(day.tasks.length, 1);
  assert.equal(day.goals.length, 4);
  assert.equal(day.milestones.length, 4);
  assert.deepEqual(day.habits.map(entry => entry.habit.id), ['h-active']);
  assert.equal(day.habits[0].status.status, 'done');
  assert.equal(Core.deriveCalendarDay(state, logs, '2026-10-30').habits[0].status.status, 'pending');
});

test('today v3 keeps task sections and adds scheduled habits, overdue milestones and goals', () => {
  const tasks = [
    { id: 'late', title: 'Late', dueDate: '2026-09-15' },
    { id: 'today', title: 'Today', plannedDate: '2026-09-16' },
    { id: 'suggest', title: 'Suggest', dueDate: '2026-09-16' },
    { id: 'done', title: 'Done', isCompleted: true, completedAt: '2026-09-16T10:00:00' },
  ];
  const state = { tasks, goals: [
    { id: 'g-overdue', title: 'Overdue goal', status: 'active', targetDate: '2026-09-15', milestones: [] },
    { id: 'g-today', title: 'Today goal', status: 'active', targetDate: '2026-09-16', milestones: [
      { id: 'm-overdue', title: 'Late milestone', date: '2026-09-15', isCompleted: false },
      { id: 'm-done', date: '2026-09-14', isCompleted: true },
      { id: 'm-today', date: '2026-09-16', isCompleted: false },
      { id: 'm-undated', isCompleted: false },
    ] },
    ...['paused', 'completed', 'archived'].map(status => ({ id: status, status, targetDate: '2026-09-15', milestones: [{ id: `m-${status}`, date: '2026-09-15', isCompleted: false }] })),
  ], habits: [
    { id: 'h-daily', name: 'Daily', status: 'active', frequencyType: 'daily', startDate: '2026-09-01', trackingType: 'checkbox' },
    { id: 'h-weekly', name: 'Gym', status: 'active', frequencyType: 'timesPerWeek', timesPerWeek: 4, startDate: '2026-09-01', trackingType: 'checkbox' },
    { id: 'h-weekday', status: 'active', frequencyType: 'weekdays', weekdays: [3], startDate: '2026-09-01' },
    { id: 'h-otherday', status: 'active', frequencyType: 'weekdays', weekdays: [4], startDate: '2026-09-01' },
    { id: 'h-interval', status: 'active', frequencyType: 'everyNDays', everyNDays: 2, startDate: '2026-09-14' },
    { id: 'h-offinterval', status: 'active', frequencyType: 'everyNDays', everyNDays: 2, startDate: '2026-09-15' },
    { id: 'h-future', status: 'active', frequencyType: 'daily', startDate: '2026-09-17' },
    { id: 'h-paused', status: 'paused', frequencyType: 'daily', startDate: '2026-09-01' },
    { id: 'h-ended', status: 'active', frequencyType: 'daily', startDate: '2026-09-01', endType: 'date', endDate: '2026-09-15' },
  ] };
  const logs = ['2026-09-13','2026-09-14','2026-09-15','2026-09-16'].map(date => ({ habitId: 'h-weekly', date, status: 'done' }));
  logs.push({ habitId: 'h-daily', date: '2026-09-16', status: 'skipped' });
  const before = JSON.stringify(state);
  const result = Core.deriveTodayV3(state, logs, '2026-09-16');
  for (const key of ['overdue', 'today', 'suggestions', 'completed']) assert.deepEqual(result[key], Core.deriveTodaySections(tasks, '2026-09-16')[key]);
  assert.deepEqual(result.overdueGoals.map(x => x.id), ['g-overdue']);
  assert.deepEqual(result.goals.map(x => x.id), ['g-today']);
  assert.deepEqual(result.overdueMilestones.map(x => [x.goal.id, x.milestone.id]), [['g-today', 'm-overdue'], ['paused', 'm-paused'], ['completed', 'm-completed'], ['archived', 'm-archived']]);
  assert.deepEqual(result.habits.map(x => x.habit.id), ['h-daily','h-weekly','h-weekday','h-interval']);
  assert.equal(result.habits[0].status.status, 'skipped');
  assert.equal(result.habits[1].status.status, 'done');
  assert.equal(JSON.stringify(state), before);
});

test('upcoming v3 preserves task groups and groups only future active goals without habits', () => {
  const state = { tasks: [{ id: 'future', title: 'Future task', plannedDate: '2026-09-18', dueDate: '2026-09-19' }], habits: [{ id: 'habit', status: 'active', frequencyType: 'daily' }], goals: [
    { id: 'g-future', title: 'Future goal', status: 'active', targetDate: '2026-09-18' },
    { id: 'g-only', title: 'Goal only', status: 'active', targetDate: '2026-09-17' },
    ...['paused','completed','archived'].map(status => ({ id: status, status, targetDate: '2026-09-20' })),
    { id: 'today', status: 'active', targetDate: '2026-09-16' },
    { id: 'late', status: 'active', targetDate: '2026-09-15' },
    { id: 'undated', status: 'active', targetDate: null },
  ] };
  const groups = Core.deriveUpcomingV3(state, '2026-09-16');
  assert.deepEqual(groups.map(group => [group.date, group.items.map(item => item.task.id), group.goals.map(goal => goal.id)]), [
    ['2026-09-17', [], ['g-only']], ['2026-09-18', ['future'], ['g-future']],
  ]);
  assert.deepEqual(groups[1].items, Core.deriveUpcoming(state.tasks, '2026-09-16')[0].items);
  assert.equal(groups.some(group => group.habits), false);
});

test('today v3 derives numeric partial and completed status from transient logs', () => {
  const state = { habits: [{ id: 'water', status: 'active', trackingType: 'numeric', targetValue: 2, frequencyType: 'daily', startDate: '2026-09-16' }] };
  assert.deepEqual(Core.deriveTodayV3(state, [{ habitId: 'water', date: '2026-09-16', value: 0.5 }], '2026-09-16').habits[0].status, { status: 'missed', value: 0.5, percent: 25 });
  assert.deepEqual(Core.deriveTodayV3(state, [{ habitId: 'water', date: '2026-09-16', value: 2.4 }], '2026-09-16').habits[0].status, { status: 'done', value: 2.4, percent: 100 });
  assert.deepEqual(Core.deriveUpcomingV3({}, '2026-09-16'), []);
});

function v2State(overrides = {}) {
  return {
    version: 2,
    tasks: [{
      id: 't1', title: 'Existing task', notes: '', projectId: 'p1',
      plannedDate: '2026-09-20', dueDate: '2026-09-21',
      tagIds: ['tag1'], priority: 'high', attachmentIds: ['att1'],
      isInbox: false, isCompleted: false, subtasks: [], createdAt: 'x', updatedAt: 'x',
    }],
    projects: [{ id: 'p1', name: 'Project', color: '#5362FF', order: 0, isArchived: false }],
    tags: [{ id: 'tag1', name: 'Client', color: '#30CBAD' }],
    settings: { weekStartsOn: 'monday' },
    ui: {},
    ...overrides,
  };
}

test('migrateStateV3 preserves v2 ids/data and adds v3 defaults', () => {
  const v2 = v2State();

  const result = Core.migrateStateV3(v2);

  assert.equal(result.ok, true);
  assert.equal(result.migrated, true);
  assert.equal(result.state.version, 3);
  assert.equal(result.state.tasks[0].id, 't1');
  assert.equal(result.state.tasks[0].attachmentIds[0], 'att1');
  assert.equal(result.state.tasks[0].areaId, null);
  assert.deepEqual(result.state.tasks[0].goalIds, []);
  assert.equal(result.state.tasks[0].plannedTime, null);
  assert.equal(result.state.tasks[0].dueTime, null);
  assert.equal(result.state.projects[0].areaId, null);
  assert.deepEqual(result.state.projects[0].goalIds, []);
  assert.deepEqual(result.state.areas, []);
  assert.deepEqual(result.state.goals, []);
  assert.deepEqual(result.state.habits, []);
  assert.deepEqual(result.state.templates, []);
  assert.deepEqual(result.state.savedViews, []);
});

test('migrateStateV3 rejects future schema versions', () => {
  assert.deepEqual(Core.migrateStateV3({ version: 99 }), { ok: false, reason: 'unsupported-version' });
});

test('migrateStateV3 rejects malformed v3 collections without resetting them', () => {
  const state = v2State({ version: 3, areas: { id: 'not-an-array' } });
  const original = structuredClone(state);

  assert.deepEqual(Core.migrateStateV3(state), { ok: false, reason: 'invalid-areas' });
  assert.deepEqual(state, original);
});

test('migrateStateV3 rejects malformed explicit v3 task fields without mutation', () => {
  const state = v2State({
    version: 3, areas: [], goals: [], habits: [], templates: [], savedViews: [],
    tasks: [{ ...v2State().tasks[0], areaId: null, goalIds: 'bad-goals', plannedTime: '9:30', dueTime: null }],
    projects: [{ ...v2State().projects[0], areaId: null, goalIds: [] }],
  });
  const original = structuredClone(state);

  assert.deepEqual(Core.migrateStateV3(state), { ok: false, reason: 'invalid-task-goal-ids' });
  assert.deepEqual(state, original);
});

test('migrateStateV3 rejects malformed explicit v3 task times without mutation', () => {
  const state = v2State({
    version: 3, areas: [], goals: [], habits: [], templates: [], savedViews: [],
    tasks: [{ ...v2State().tasks[0], areaId: null, goalIds: [], plannedTime: '9:30', dueTime: null }],
    projects: [{ ...v2State().projects[0], areaId: null, goalIds: [] }],
  });
  const original = structuredClone(state);

  assert.deepEqual(Core.migrateStateV3(state), { ok: false, reason: 'invalid-task-planned-time' });
  assert.deepEqual(state, original);
});

test('migrateStateV3 rejects an explicit empty v3 task area ID without mutation', () => {
  const state = v2State({
    version: 3, areas: [], goals: [], habits: [], templates: [], savedViews: [],
    tasks: [{ ...v2State().tasks[0], areaId: '', goalIds: [], plannedTime: null, dueTime: null }],
    projects: [{ ...v2State().projects[0], areaId: null, goalIds: [] }],
  });
  const original = structuredClone(state);

  assert.deepEqual(Core.migrateStateV3(state), { ok: false, reason: 'invalid-task-area-id' });
  assert.deepEqual(state, original);
});

test('migrateStateV3 rejects malformed explicit v3 project fields without mutation', () => {
  const state = v2State({
    version: 3, areas: [], goals: [], habits: [], templates: [], savedViews: [],
    tasks: [{ ...v2State().tasks[0], areaId: null, goalIds: [], plannedTime: null, dueTime: null }],
    projects: [{ ...v2State().projects[0], areaId: null, goalIds: 'bad-goals', isArchived: false }],
  });
  const original = structuredClone(state);

  assert.deepEqual(Core.migrateStateV3(state), { ok: false, reason: 'invalid-project-goal-ids' });
  assert.deepEqual(state, original);
});

test('migrateStateV3 rejects an explicit empty v3 project area ID without mutation', () => {
  const state = v2State({
    version: 3, areas: [], goals: [], habits: [], templates: [], savedViews: [],
    tasks: [{ ...v2State().tasks[0], areaId: null, goalIds: [], plannedTime: null, dueTime: null }],
    projects: [{ ...v2State().projects[0], areaId: '', goalIds: [], isArchived: false }],
  });
  const original = structuredClone(state);

  assert.deepEqual(Core.migrateStateV3(state), { ok: false, reason: 'invalid-project-area-id' });
  assert.deepEqual(state, original);
});

test('migrateStateV3 rejects malformed explicit v3 project archive state without mutation', () => {
  const state = v2State({
    version: 3, areas: [], goals: [], habits: [], templates: [], savedViews: [],
    tasks: [{ ...v2State().tasks[0], areaId: null, goalIds: [], plannedTime: null, dueTime: null }],
    projects: [{ ...v2State().projects[0], areaId: null, goalIds: [], isArchived: 'yes' }],
  });
  const original = structuredClone(state);

  assert.deepEqual(Core.migrateStateV3(state), { ok: false, reason: 'invalid-project-is-archived' });
  assert.deepEqual(state, original);
});

test('migrateStateV3 preserves legacy project archive booleans', () => {
  const v2 = v2State({
    projects: [
      { id: 'active', name: 'Active', color: '#5362FF', order: 0, isArchived: false },
      { id: 'archived', name: 'Archived', color: '#5362FF', order: 1, isArchived: true },
    ],
    tasks: [],
  });

  const result = Core.migrateStateV3(v2);

  assert.equal(result.ok, true);
  assert.deepEqual(result.state.projects.map(project => project.isArchived), [false, true]);
});

test('validateStateV3 rejects tasks that override their project area', () => {
  const state = v2State({
    version: 3,
    areas: [{ id: 'a1', name: 'Work' }],
    goals: [], habits: [], templates: [], savedViews: [],
    tasks: [{
      ...v2State().tasks[0],
      areaId: 'a1', goalIds: [], plannedTime: null, dueTime: null,
    }],
    projects: [{ ...v2State().projects[0], areaId: 'a1', goalIds: [] }],
  });

  assert.deepEqual(Core.validateStateV3(state), { ok: false, reason: 'task-area-project-conflict' });
});

test('effectiveTaskArea inherits project area and ignores direct task area', () => {
  const projects = [{ id: 'p1', areaId: 'a-project' }];
  assert.equal(Core.effectiveTaskArea({ projectId: 'p1', areaId: 'a-task' }, projects), 'a-project');
  assert.equal(Core.effectiveTaskArea({ projectId: null, areaId: 'a-task' }, projects), 'a-task');
});

test('normalizeTime accepts HH:MM only', () => {
  assert.equal(Core.normalizeTime('09:30'), '09:30');
  assert.equal(Core.normalizeTime('9:30'), null);
  assert.equal(Core.normalizeTime('25:00'), null);
});

test('combineDateTime returns a local datetime only for valid date and time', () => {
  assert.equal(Core.combineDateTime('2026-09-20', '09:30'), '2026-09-20T09:30:00');
  assert.equal(Core.combineDateTime('2026-09-20', '9:30'), null);
  assert.equal(Core.combineDateTime(null, '09:30'), null);
});

test('validateAreaName normalizes names and rejects duplicates', () => {
  const areas = [{ id: 'a1', name: '  Business  ' }];
  assert.deepEqual(Core.validateAreaName(areas, 'business'), { ok: false, reason: 'duplicate-area' });
  assert.deepEqual(Core.validateAreaName(areas, 'Business', 'a1'), { ok: true });
  assert.deepEqual(Core.validateAreaName(areas, '   '), { ok: false, reason: 'empty-area' });
});

test('area summary counts only matching effective objects', () => {
  const state = {
    projects: [{ id: 'p1', areaId: 'a1', isArchived: false }],
    tasks: [
      { id: 't1', projectId: 'p1', areaId: null, isCompleted: false },
      { id: 't2', projectId: null, areaId: 'a1', isCompleted: false },
      { id: 't3', projectId: null, areaId: 'a2', isCompleted: false },
      { id: 't4', projectId: 'p1', areaId: null, isCompleted: true },
    ],
    goals: [{ id: 'g1', areaId: 'a1', status: 'active' }],
    habits: [{ id: 'h1', areaId: 'a1', status: 'active' }],
  };
  assert.deepEqual(Core.areaSummary('a1', state), {
    projects: 1, openTasks: 2, activeGoals: 1, activeHabits: 1,
  });
});

test('linked task goal counts each parent task equally', () => {
  const goal = { progressMode: 'linkedTasks', taskIds: ['t1', 't2'], projectLinks: [] };
  const state = { tasks: [
    { id: 't1', isCompleted: true, subtasks: [{ isCompleted: false }] },
    { id: 't2', isCompleted: false, subtasks: [{ isCompleted: true }, { isCompleted: true }] },
  ], projects: [] };
  assert.deepEqual(Core.computeGoalProgress(goal, state, {}), { current: 1, target: 2, percent: 50 });
});

test('allTasks project links include future project tasks dynamically', () => {
  const goal = { progressMode: 'linkedTasks', taskIds: [], projectLinks: [{ projectId: 'p1', contributionMode: 'allTasks', selectedTaskIds: [] }] };
  const state = { tasks: [{ id: 't1', projectId: 'p1', isCompleted: true }, { id: 't2', projectId: 'p1', isCompleted: false }] };
  assert.equal(Core.computeGoalProgress(goal, state, {}).percent, 50);
  state.tasks.push({ id: 't3', projectId: 'p1', isCompleted: false });
  assert.equal(Core.computeGoalProgress(goal, state, {}).percent, 33.33333333333333);
});

test('linked habit goal equal-weights capped habit contributions', () => {
  const goal = { progressMode: 'linkedHabits', habitLinks: [
    { habitId: 'h1', metric: 'totalCheckins', target: 10 },
    { habitId: 'h2', metric: 'streak', target: 5 },
  ] };
  const metrics = { h1: { totalCheckins: 20, streak: 0, successfulPeriods: 0 }, h2: { totalCheckins: 0, streak: 2, successfulPeriods: 0 } };
  assert.equal(Core.computeGoalProgress(goal, {}, metrics).percent, 70);
});

test('manual goal progress keeps source value while clamping percentage display', () => {
  const progress = Core.computeGoalProgress({ progressMode: 'manual', progressType: 'percentage', currentValue: 125 }, {}, {});
  assert.deepEqual(progress, { current: 125, target: 100, percent: 100 });
});

test('goal date helpers keep paused goals out of overdue and derive milestones/reminders', () => {
  const goal = {
    status: 'paused', targetDate: '2026-09-15',
    milestones: [{ id: 'm1', date: '2026-09-15', isCompleted: false }, { id: 'm2', date: '2026-09-16', isCompleted: false }],
    reminders: { sevenDaysBefore: true, threeDaysBefore: true, oneDayBefore: true, onTargetDate: true, time: '08:30' },
  };
  assert.equal(Core.isGoalOverdue(goal, '2026-09-16'), false);
  goal.status = 'active';
  assert.equal(Core.isGoalOverdue(goal, '2026-09-16'), true);
  assert.deepEqual(Core.overdueMilestones(goal, '2026-09-16').map(item => item.id), ['m1']);
  assert.deepEqual(Core.goalReminderMoments(goal), [
    '2026-09-08T08:30:00', '2026-09-12T08:30:00', '2026-09-14T08:30:00', '2026-09-15T08:30:00',
  ]);
});

test('goal reminder due moments fire once and never after the target date', () => {
  const goal = {
    status: 'active', targetDate: '2026-09-16',
    reminders: { sevenDaysBefore: false, threeDaysBefore: false, oneDayBefore: false, onTargetDate: true, time: '09:00' },
    reminderFiredMoments: [],
  };
  assert.deepEqual(Core.goalReminderDueMoments(goal, '2026-09-16T09:05:00Z'), ['2026-09-16T09:00:00']);
  goal.reminderFiredMoments.push('2026-09-16T09:00:00');
  assert.deepEqual(Core.goalReminderDueMoments(goal, '2026-09-16T09:05:00Z'), []);
  goal.reminderFiredMoments = [];
  assert.deepEqual(Core.goalReminderDueMoments(goal, '2026-09-17T09:05:00Z'), []);
});

test('habit schedules daily, selected weekdays, every N days, and weekly targets by their defined units', () => {
  assert.equal(Core.habitScheduledOn({ frequencyType: 'daily', startDate: '2026-09-01', status: 'active' }, '2026-09-16'), true);
  assert.equal(Core.habitScheduledOn({ frequencyType: 'weekdays', weekdays: [1, 3, 5], startDate: '2026-09-01', status: 'active' }, '2026-09-16'), true);
  assert.equal(Core.habitScheduledOn({ frequencyType: 'weekdays', weekdays: [1, 3, 5], startDate: '2026-09-01', status: 'active' }, '2026-09-17'), false);
  assert.equal(Core.habitScheduledOn({ frequencyType: 'everyNDays', everyNDays: 3, startDate: '2026-09-01', status: 'active' }, '2026-09-16'), true);
  assert.equal(Core.habitScheduledOn({ frequencyType: 'everyNDays', everyNDays: 3, startDate: '2026-09-01', status: 'active' }, '2026-09-17'), false);
  assert.equal(Core.habitPeriodKey({ frequencyType: 'timesPerWeek' }, '2026-09-16', 'monday'), '2026-09-14');
});

test('timesPerWeek streak is successful weeks, not individual checkins', () => {
  const habit = { id: 'h1', frequencyType: 'timesPerWeek', timesPerWeek: 4, startDate: '2026-09-01', status: 'active', trackingType: 'checkbox' };
  const logs = [
    ['2026-09-07', 'done'], ['2026-09-08', 'done'], ['2026-09-09', 'done'], ['2026-09-11', 'done'], ['2026-09-12', 'done'],
    ['2026-09-14', 'done'], ['2026-09-15', 'done'], ['2026-09-16', 'done'], ['2026-09-18', 'done'],
  ].map(([date, status], index) => ({ id: String(index), habitId: 'h1', date, status, value: null }));
  const metrics = Core.deriveHabitMetrics(habit, logs, '2026-09-20', 'monday');
  assert.equal(metrics.currentStreak, 2);
  assert.equal(metrics.currentPeriodCount, 4);
  assert.equal(metrics.totalCheckins, 9);
});

test('skipped does not break weekday streak while missed required occurrence does', () => {
  const habit = { id: 'h-weekdays', frequencyType: 'weekdays', weekdays: [1, 3, 5], startDate: '2026-09-01', status: 'active', trackingType: 'checkbox' };
  const logs = [
    ['2026-09-07', 'done'], ['2026-09-09', 'skipped'], ['2026-09-11', 'done'], ['2026-09-14', 'missed'], ['2026-09-16', 'done'],
  ].map(([date, status], index) => ({ id: String(index), habitId: habit.id, date, status, value: null }));
  const metrics = Core.deriveHabitMetrics(habit, logs, '2026-09-16', 'monday');
  assert.equal(metrics.currentStreak, 1);
  assert.equal(metrics.longestStreak, 2);
});

test('numeric habit becomes done at target while preserving over-target value', () => {
  const habit = { id: 'numeric', status: 'active', trackingType: 'numeric', targetValue: 2, frequencyType: 'daily', startDate: '2026-09-16' };
  assert.deepEqual(Core.numericHabitState(habit, 2.4), { status: 'done', value: 2.4, percent: 100 });
  assert.deepEqual(Core.numericHabitState(habit, 1), { status: 'missed', value: 1, percent: 50 });
  assert.equal(Core.deriveHabitMetrics(habit, [{ id: '1', habitId: 'numeric', date: '2026-09-16', status: 'done', value: 2.4 }], '2026-09-16', 'monday').currentPeriodCount, 2.4);
});

test('habit reminders suppress completed weekly targets and inactive habits', () => {
  const habit = { id: 'h-reminder', trackingType: 'checkbox', frequencyType: 'timesPerWeek', timesPerWeek: 4, startDate: '2026-09-01', status: 'active', reminders: [{ id: 'r1', time: '09:00', enabled: true }] };
  const logs = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'].map((date, index) => ({ id: String(index), habitId: habit.id, date, status: 'done', value: null }));
  assert.equal(Core.habitReminderActive(habit, logs, '2026-09-17T10:00:00', 'monday'), false);
  assert.equal(Core.habitReminderActive({ ...habit, status: 'paused' }, [], '2026-09-17T10:00:00', 'monday'), false);
});

test('paused historical habit metrics preserve completed periods and skip its pause boundary', () => {
  const habit = { id: 'paused', status: 'paused', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-09-01', pauseIntervals: [{ startDate: '2026-09-03', endDate: '2026-09-05' }] };
  const logs = [{ id: '1', habitId: 'paused', date: '2026-09-01', status: 'done', value: null }, { id: '2', habitId: 'paused', date: '2026-09-02', status: 'done', value: null }, { id: '3', habitId: 'paused', date: '2026-09-06', status: 'done', value: null }];
  const metrics = Core.deriveHabitMetrics(habit, logs, '2026-09-06', 'monday');
  assert.equal(metrics.totalCheckins, 3);
  assert.equal(metrics.currentStreak, 3);
  assert.equal(Core.habitScheduledOn(habit, '2026-09-02', { historical: true }), true);
  assert.equal(Core.habitScheduledOn(habit, '2026-09-04', { historical: true }), false);
});

test('streak carries across unscheduled, skipped, and pending current units until a closed required miss', () => {
  const habit = { id: 'carry', status: 'active', trackingType: 'checkbox', frequencyType: 'weekdays', weekdays: [1, 3, 5], startDate: '2026-09-01' };
  const logs = [{ id: '1', habitId: 'carry', date: '2026-09-14', status: 'done', value: null }, { id: '2', habitId: 'carry', date: '2026-09-16', status: 'skipped', value: null }];
  assert.equal(Core.deriveHabitMetrics(habit, logs, '2026-09-16', 'monday').currentStreak, 1);
  assert.equal(Core.deriveHabitMetrics(habit, logs, '2026-09-15', 'monday').currentStreak, 1);
  const weekly = { id: 'weekly-carry', status: 'active', trackingType: 'checkbox', frequencyType: 'timesPerWeek', timesPerWeek: 2, startDate: '2026-09-01' };
  const weeklyLogs = [{ id: '1', habitId: weekly.id, date: '2026-09-07', status: 'done', value: null }, { id: '2', habitId: weekly.id, date: '2026-09-08', status: 'done', value: null }];
  assert.equal(Core.deriveHabitMetrics(weekly, weeklyLogs, '2026-09-15', 'monday').currentStreak, 1);
});

test('completed pause-boundary logs remain counted through pause/archive/resume history', () => {
  const logs = ['2026-09-01', '2026-09-02', '2026-09-03'].map((date, index) => ({ id: String(index), habitId: 'boundary', date, status: 'done', value: null }));
  const paused = { id: 'boundary', status: 'paused', pauseStartedAt: '2026-09-03', trackingType: 'checkbox', frequencyType: 'daily', startDate: '2026-09-01' };
  const pausedMetrics = Core.deriveHabitMetrics(paused, logs, '2026-09-03', 'monday');
  assert.deepEqual([pausedMetrics.totalCheckins, pausedMetrics.currentStreak, pausedMetrics.longestStreak], [3, 3, 3]);
  const archived = { ...paused, status: 'archived' };
  const archivedMetrics = Core.deriveHabitMetrics(archived, logs, '2026-09-05', 'monday');
  assert.deepEqual([archivedMetrics.totalCheckins, archivedMetrics.currentStreak, archivedMetrics.longestStreak], [3, 3, 3]);
  const resumed = { ...archived, status: 'active', pauseStartedAt: null, pauseIntervals: [{ startDate: '2026-09-03', endDate: '2026-09-04' }] };
  assert.equal(Core.habitStatusForDate(resumed, logs, '2026-09-03', '2026-09-05').status, 'done');
});
