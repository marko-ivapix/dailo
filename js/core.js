(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TodoCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const pad = n => String(n).padStart(2, '0');

  function applySavedView(view, state, today = dateOnly()) {
    if (!['tasks','goals','habits'].includes(view?.type)) return [];
    const f = view.filters || {};
    const has = key => f[key] !== undefined && f[key] !== null && f[key] !== '';
    for (const [key, collection] of [['areaId','areas'],['projectId','projects'],['tagId','tags']]) {
      if (has(key) && (key === 'areaId' || view.type === 'tasks') && !(state[collection] || []).some(x=>x.id===f[key])) return [];
    }
    const same = (item,key) => !has(key) || item[key] === f[key];
    return (state[view.type] || []).filter(item => {
      if (has('areaId') && (view.type === 'tasks' ? effectiveTaskArea(item,state.projects) : item.areaId) !== f.areaId) return false;
      if (view.type === 'tasks') return same(item,'projectId') && same(item,'priority') && same(item,'plannedDate') && same(item,'dueDate') && (!has('tagId') || (item.tagIds || []).includes(f.tagId)) && (!has('completion') || f.completion === 'open' && !item.isCompleted || f.completion === 'completed' && !!item.isCompleted);
      if (view.type === 'goals') return same(item,'status') && same(item,'targetDate');
      return same(item,'status') && same(item,'trackingType') && same(item,'frequencyType');
    });
  }

  function normalizeShortcut(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const parts=value.split('+').map(p=>p.trim().toLowerCase());
    const aliases={ctrl:'Ctrl/Cmd',control:'Ctrl/Cmd',cmd:'Ctrl/Cmd',meta:'Ctrl/Cmd','ctrl/cmd':'Ctrl/Cmd',alt:'Alt',shift:'Shift'};
    const modifiers=new Set(), keys=[];
    for(const part of parts) { if(aliases[part])modifiers.add(aliases[part]); else keys.push(part); }
    if(keys.length!==1 || !/^[a-z0-9/]$/.test(keys[0]))return null;
    return [...['Ctrl/Cmd','Alt','Shift'].filter(m=>modifiers.has(m)),keys[0].toUpperCase()].join('+');
  }

  function dateOnly(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseDateOnly(value) {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function addDays(value, amount) {
    const base = typeof value === 'string' ? parseDateOnly(value) : new Date(value);
    const copy = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    copy.setDate(copy.getDate() + amount);
    return dateOnly(copy);
  }

  const templateCopy = value => JSON.parse(JSON.stringify(value));
  function templateOffset(value, anchor) {
    if (!value) return null;
    const a = parseDateOnly(anchor), b = parseDateOnly(value);
    return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
  }
  function templateFromEntity(type, entity, state = {}, contextDate = dateOnly()) {
    const pick = keys => Object.fromEntries(keys.filter(key => entity[key] !== undefined).map(key => [key, templateCopy(entity[key])]));
    let data;
    if (type === 'task') {
      data = pick(['title','notes','projectId','areaId','goalIds','tagIds','priority','plannedTime','dueTime']);
      const rule = normalizeRecurrenceV3(entity.recurrence);
      data.recurrence = rule ? {frequency:rule.frequency,interval:rule.interval,endType:rule.endType,endAfterOccurrences:rule.endAfterOccurrences,endOffsetDays:templateOffset(rule.endDate,contextDate)} : null;
      data.plannedOffsetDays = templateOffset(entity.plannedDate, contextDate);
      data.dueOffsetDays = templateOffset(entity.dueDate, contextDate);
      data.subtasks = (entity.subtasks || []).map((s, order) => ({ title:s.title, order, isCompleted:false, completedAt:null }));
      const reminder = entity.reminderAt && new Date(entity.reminderAt);
      data.reminderOffsetDays = reminder && !Number.isNaN(reminder.getTime()) ? templateOffset(dateOnly(reminder), contextDate) : null;
      data.reminderTime = reminder && !Number.isNaN(reminder.getTime()) ? `${pad(reminder.getHours())}:${pad(reminder.getMinutes())}` : null;
    } else if (type === 'project') {
      data = pick(['name','areaId','goalIds','color']);
      const children=(state.tasks || []).filter(t => t.projectId === entity.id).sort(byOrder('projectOrder'));
      data.tasks = children.map(t => {
        const child = templateFromEntity('task',t,state,contextDate).data;
        child.projectId = null; child.areaId = null;
        return child;
      });
      data.goalLinkConfigs=(data.goalIds || []).flatMap(goalId=>{
        const link=(state.goals || []).find(g=>g.id===goalId)?.projectLinks?.find(l=>l.projectId===entity.id);
        return link ? [{goalId,contributionMode:link.contributionMode,selectedTaskIndices:children.map((t,index)=>(link.selectedTaskIds || []).includes(t.id)?index:null).filter(index=>index!==null)}] : [];
      });
    } else if (type === 'habit') {
      data = pick(['name','areaId','goalIds','trackingType','targetValue','unit','quickValues','frequencyType','weekdays','timesPerWeek','everyNDays','continuation','endType','successfulPeriodsTarget']);
      data.endOffsetDays = templateOffset(entity.endDate, contextDate);
      data.reminders = (entity.reminders || []).map(r => ({time:r.time,enabled:r.enabled !== false}));
      data.goalLinkConfigs=(data.goalIds || []).flatMap(goalId=>{
        const link=(state.goals || []).find(g=>g.id===goalId)?.habitLinks?.find(l=>l.habitId===entity.id);
        return link ? [{goalId,metric:link.metric,target:link.target}] : [];
      });
    } else if (type === 'goal') {
      data = pick(['title','areaId','progressMode','progressType','targetValue','unit']);
      data.targetOffsetDays = templateOffset(entity.targetDate, contextDate);
      data.milestones = (entity.milestones || []).map((m,order) => ({title:m.title,dateOffsetDays:templateOffset(m.date,contextDate),order,isCompleted:false,completedAt:null}));
      const r = entity.reminders || {};
      data.reminders = {sevenDaysBefore:!!r.sevenDaysBefore,threeDaysBefore:!!r.threeDaysBefore,oneDayBefore:!!r.oneDayBefore,onTargetDate:!!r.onTargetDate,time:r.time || '09:00'};
    } else throw new Error('Unsupported template type');
    return {type,data};
  }

  function instantiateTemplate(template, contextDate, ids = {}) {
    const d = templateCopy(template.data || {});
    const makeId = ids.makeId || (prefix => `${prefix}_${globalThis.crypto.randomUUID()}`);
    const ts = ids.nowIso || new Date().toISOString();
    const resolve = offset => Number.isInteger(offset) ? addDays(contextDate,offset) : null;
    const live = (key,id) => id && (!ids.state || (ids.state[key] || []).some(e => e.id === id)) ? id : null;
    const links = (key,values) => [...new Set((values || []).filter(id => live(key,id)))];
    const common = {createdAt:ts,updatedAt:ts};
    const configs=(d.goalLinkConfigs || []).filter(c=>(d.goalIds || []).includes(c.goalId) && live('goals',c.goalId));
    const task = (data, taskId, projectId = live('projects',data.projectId)) => {
      const id=taskId || makeId('task');
      return {
      ...common,id,title:data.title || '',notes:data.notes || '',projectId,areaId:projectId ? null : live('areas',data.areaId),goalIds:links('goals',data.goalIds),tagIds:links('tags',data.tagIds),priority:data.priority || 'none',
      plannedDate:resolve(data.plannedOffsetDays),dueDate:resolve(data.dueOffsetDays),plannedTime:normalizeTime(data.plannedTime),dueTime:normalizeTime(data.dueTime),
      reminderAt:resolve(data.reminderOffsetDays) && normalizeTime(data.reminderTime) ? combineDateTime(resolve(data.reminderOffsetDays), data.reminderTime) : null,reminderFiredAt:null,
      recurrence:freshRecurrence({...data.recurrence,endDate:resolve(data.recurrence?.endOffsetDays)},id),recurrenceBaseline:null,recurrenceSuccessorId:null,attachmentIds:[],isCompleted:false,completedAt:null,isInbox:!(projectId || resolve(data.plannedOffsetDays)),todayOrder:null,projectOrder:null,inboxOrder:null,
      subtasks:(data.subtasks || []).map((s,order)=>({id:makeId('sub'),title:s.title,order,isCompleted:false,completedAt:null})),
    };};
    if (template.type === 'task') return {task:task(d,ids.taskId)};
    if (template.type === 'project') {
      const project = {...common,id:ids.projectId || makeId('project'),name:d.name || '',color:d.color || '#5362FF',areaId:live('areas',d.areaId),goalIds:links('goals',d.goalIds),isArchived:false,archivedAt:null,order:null};
      const tasks=(d.tasks || []).map(child=>task(child,null,project.id));
      return {project,tasks,goalLinks:configs.map(c=>({goalId:c.goalId,contributionMode:c.contributionMode,selectedTaskIds:[...new Set((c.selectedTaskIndices || []).filter(i=>Number.isInteger(i) && tasks[i]).map(i=>tasks[i].id))]}))};
    }
    if (template.type === 'habit') return {habit:{...common,id:ids.habitId || makeId('habit'),name:d.name || '',areaId:live('areas',d.areaId),goalIds:links('goals',d.goalIds),status:'active',trackingType:d.trackingType || 'checkbox',targetValue:d.targetValue ?? 1,unit:d.unit || '',quickValues:d.quickValues || [],frequencyType:d.frequencyType || 'daily',weekdays:d.weekdays || [1,2,3,4,5],timesPerWeek:d.timesPerWeek || 4,everyNDays:d.everyNDays || 2,startDate:contextDate,continuation:d.continuation || 'automatic',endType:d.endType || 'never',endDate:resolve(d.endOffsetDays),successfulPeriodsTarget:d.successfulPeriodsTarget || null,reminders:(d.reminders || []).map(r=>({id:makeId('habit-reminder'),time:r.time,enabled:r.enabled !== false})),reminderFiredMoments:[],pauseIntervals:[],pauseStartedAt:null},goalLinks:configs.map(c=>({goalId:c.goalId,metric:c.metric,target:c.target}))};
    if (template.type === 'goal') return {goal:{...common,id:ids.goalId || makeId('goal'),title:d.title || '',areaId:live('areas',d.areaId),status:'active',progressMode:d.progressMode || 'manual',progressType:d.progressType || 'percentage',currentValue:0,targetValue:d.targetValue ?? 100,unit:d.unit || '',targetDate:resolve(d.targetOffsetDays),projectLinks:[],taskIds:[],habitLinks:[],completedAt:null,reminderFiredMoments:[],reminders:d.reminders || {},milestones:(d.milestones || []).map((m,order)=>({id:makeId('milestone'),title:m.title,date:resolve(m.dateOffsetDays),order,isCompleted:false,completedAt:null}))}};
    throw new Error('Unsupported template type');
  }

  function isCompleted(task) {
    return Boolean(task && task.isCompleted);
  }

  function isOverdue(task, today) {
    return !isCompleted(task) && Boolean(task.dueDate) && task.dueDate < today;
  }

  function isInboxActive(task) {
    return Boolean(task && task.isInbox && !task.isCompleted);
  }

  function byOrder(field) {
    return (a, b) => {
      const av = Number.isFinite(a[field]) ? a[field] : Number.MAX_SAFE_INTEGER;
      const bv = Number.isFinite(b[field]) ? b[field] : Number.MAX_SAFE_INTEGER;
      if (av !== bv) return av - bv;
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    };
  }

  function deriveTodaySections(tasks, today) {
    const tomorrow = addDays(today, 1);
    const dueSoonEnd = addDays(today, 3);
    const active = tasks.filter(t => !t.isCompleted);
    const overdue = active.filter(t => isOverdue(t, today)).sort((a, b) => {
      if (a.dueDate !== b.dueDate) return String(a.dueDate).localeCompare(String(b.dueDate));
      return byOrder('todayOrder')(a, b);
    });
    const overdueIds = new Set(overdue.map(t => t.id));

    const todayTasks = active
      .filter(t => !overdueIds.has(t.id) && t.plannedDate === today)
      .sort(byOrder('todayOrder'));
    const todayIds = new Set(todayTasks.map(t => t.id));

    const suggestions = [];
    for (const task of active) {
      if (overdueIds.has(task.id) || todayIds.has(task.id)) continue;
      let reason = null;
      if (task.dueDate === today) reason = 'due-today';
      else if (task.plannedDate && task.plannedDate < today) reason = 'missed-plan';
      else if (task.dueDate === tomorrow) reason = 'due-tomorrow';
      else if (task.dueDate && task.dueDate > tomorrow && task.dueDate <= dueSoonEnd) reason = 'due-soon';
      if (reason) suggestions.push({ task, reason });
    }
    const rank = { 'due-today': 0, 'missed-plan': 1, 'due-tomorrow': 2, 'due-soon': 3 };
    suggestions.sort((a, b) => rank[a.reason] - rank[b.reason] || String(a.task.title).localeCompare(String(b.task.title)));

    const completed = tasks
      .filter(t => t.isCompleted && t.completedAt && String(t.completedAt).slice(0, 10) === today)
      .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));

    return { overdue, today: todayTasks, suggestions, completed };
  }

  function futureRelevant(task, today) {
    if (task.isCompleted || isOverdue(task, today) || task.plannedDate === today) return null;
    const candidates = [];
    if (task.plannedDate && task.plannedDate > today) candidates.push({ date: task.plannedDate, kind: 'planned' });
    if (task.dueDate && task.dueDate > today) candidates.push({ date: task.dueDate, kind: 'due' });
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'planned' ? -1 : 1));
    return candidates[0];
  }

  function deriveUpcoming(tasks, today) {
    const map = new Map();
    for (const task of tasks) {
      const relevant = futureRelevant(task, today);
      if (!relevant) continue;
      if (!map.has(relevant.date)) map.set(relevant.date, []);
      map.get(relevant.date).push({ task, displayReason: relevant.kind });
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({
        date,
        items: items.sort((a, b) => String(a.task.title).localeCompare(String(b.task.title))),
      }));
  }

  function deriveTodayV3(state, habitLogs, today) {
    const goals = state.goals || [];
    const activeGoals = goals.filter(goal => goal.status === 'active');
    return {
      ...deriveTodaySections(state.tasks || [], today),
      habits: (state.habits || []).filter(habit => habitScheduledOn(habit, today)).map(habit => ({
        habit, status: habitStatusForDate(habit, habitLogs || [], today, today),
      })),
      overdueMilestones: goals.flatMap(goal => (goal.milestones || [])
        .filter(milestone => milestone.date && milestone.date < today && !milestone.isCompleted)
        .map(milestone => ({ goal, milestone }))),
      overdueGoals: activeGoals.filter(goal => goal.targetDate && goal.targetDate < today),
      goals: activeGoals.filter(goal => goal.targetDate === today),
    };
  }

  function deriveUpcomingV3(state, today) {
    const groups = new Map(deriveUpcoming(state.tasks || [], today).map(group => [group.date, { ...group, goals: [], habits: [], milestones: [] }]));
    const horizonEnd = addDays(today, 14);
    const ensureGroup = date => {
      if (!groups.has(date)) groups.set(date, { date, items: [], goals: [], habits: [], milestones: [] });
      return groups.get(date);
    };
    for (const goal of state.goals || []) {
      if (goal.status !== 'active' || !goal.targetDate || goal.targetDate <= today) continue;
      ensureGroup(goal.targetDate).goals.push(goal);
      for (const milestone of goal.milestones || []) {
        if (!milestone?.date || milestone.date <= today || milestone.date > horizonEnd || milestone.isCompleted) continue;
        ensureGroup(milestone.date).milestones.push({ goal, milestone });
      }
    }
    for (const habit of state.habits || []) {
      if (habit.status !== 'active') continue;
      for (let offset = 1; offset <= 14; offset += 1) {
        const date = addDays(today, offset);
        if (!habitScheduledOn(habit, date)) continue;
        ensureGroup(date).habits.push({ habit, date });
        break;
      }
    }
    return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date)).map(group => ({
      ...group,
      goals: group.goals.sort((a, b) => String(a.title).localeCompare(String(b.title))),
      habits: group.habits.sort((a, b) => String(a.habit.name || a.habit.title).localeCompare(String(b.habit.name || b.habit.title))),
      milestones: group.milestones.sort((a, b) => String(a.milestone.title).localeCompare(String(b.milestone.title))),
    }));
  }

  // Calendar projects dates, not active lists. Every entry retains its entity.
  function deriveCalendarDay(state, habitLogs, date) {
    const visibility = { tasks: true, habits: true, goals: true, milestones: true, ...(state.ui?.calendarVisibility || {}) };
    const tasks = visibility.tasks ? (state.tasks || []).flatMap(task => {
      const planned = task.plannedDate === date; const due = task.dueDate === date;
      if (!planned && !due) return [];
      return [{ type: 'task', task, kind: planned && due ? 'planned+due' : planned ? 'planned' : 'due', time: (planned ? task.plannedTime : task.dueTime) || (due ? task.dueTime : null) || null }];
    }) : [];
    const goals = visibility.goals ? (state.goals || []).filter(goal => goal.targetDate === date).map(goal => ({ type: 'goal', goal, time: null })) : [];
    const milestones = visibility.milestones ? (state.goals || []).flatMap(goal => (goal.milestones || []).filter(milestone => milestone.date === date).map(milestone => ({ type: 'milestone', goal, milestone, time: null }))) : [];
    const habits = visibility.habits ? (state.habits || []).filter(habit => habitScheduledOn(habit, date)).map(habit => ({ type: 'habit', habit, status: habitStatusForDate(habit, habitLogs, date), time: null })) : [];
    const entries = [...tasks, ...habits, ...goals, ...milestones];
    return { date, tasks, habits, goals, milestones, allDay: entries.filter(entry => !entry.time), timed: entries.filter(entry => entry.time).sort((a, b) => a.time.localeCompare(b.time)) };
  }

  function deriveCalendarWeek(state, habitLogs, weekStart) {
    if (!parseDateOnly(weekStart)) return [];
    return Array.from({ length: 7 }, (_, index) => deriveCalendarDay(state, habitLogs, addDays(weekStart, index)));
  }

  function deriveCalendarMonthSummary(state, habitLogs, month) {
    const first = parseDateOnly(`${String(month).slice(0, 7)}-01`);
    if (!first) return [];
    const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return Array.from({ length }, (_, index) => {
      const day = deriveCalendarDay(state, habitLogs, addDays(dateOnly(first), index));
      return { date: day.date, counts: { tasks: day.tasks.length, habits: day.habits.length, goals: day.goals.length, milestones: day.milestones.length } };
    });
  }



  function deriveAnytime(tasks) {
    return tasks.filter(task => !task.isCompleted && !task.isInbox && !task.plannedDate);
  }

  function normalizeRecurrence(recurrence) {
    if (!recurrence || typeof recurrence !== 'object') return null;
    const frequency = ['daily', 'weekly', 'monthly'].includes(recurrence.frequency) ? recurrence.frequency : null;
    if (!frequency) return null;
    const interval = Math.max(1, Math.floor(Number(recurrence.interval) || 1));
    return { frequency, interval };
  }

  function normalizeRecurrenceV3(value) {
    const rule=normalizeRecurrence(value);if(!rule)return null;
    const positive=value=>Number.isInteger(Number(value)) && Number(value)>0 ? Number(value) : null;
    return {...rule,status:['active','paused','ended'].includes(value.status)?value.status:'active',endType:['never','date','afterOccurrences'].includes(value.endType)?value.endType:'never',endDate:typeof value.endDate==='string' && parseDateOnly(value.endDate) && dateOnly(parseDateOnly(value.endDate))===value.endDate ? value.endDate:null,endAfterOccurrences:positive(value.endAfterOccurrences),occurrencesCreated:Math.max(0,Math.floor(Number(value.occurrencesCreated)||0)),skipNext:value.skipNext===true,seriesId:typeof value.seriesId==='string' && value.seriesId.trim()?value.seriesId:null};
  }
  function freshRecurrence(value,id) {
    const rule=normalizeRecurrenceV3(value);
    return rule?{...rule,status:'active',occurrencesCreated:0,skipNext:false,seriesId:id}:null;
  }
  function shouldGenerateRecurrence(value,occurrenceDate) {
    const rule=normalizeRecurrenceV3(value);
    if(!rule || rule.status!=='active')return false;
    if(rule.endType==='date' && (!rule.endDate || !occurrenceDate || occurrenceDate>rule.endDate))return false;
    if(rule.endType==='afterOccurrences' && (!rule.endAfterOccurrences || rule.occurrencesCreated+1>=rule.endAfterOccurrences))return false;
    return true;
  }
  function splitRecurrenceForFuture(task,changes,effectiveDate) {
    const baseline=task.recurrenceBaseline;
    const clone=templateCopy(task),sourceRule=(baseline || task).recurrence;
    const rule=normalizeRecurrenceV3(changes.recurrence===undefined?sourceRule:changes.recurrence?{...sourceRule,...changes.recurrence}:null);
    Object.assign(clone,templateCopy(changes));
    clone.recurrence=rule?{...rule,seriesId:`${task.id}_branch_${effectiveDate}_${globalThis.crypto.randomUUID()}`}:null;
    clone.recurrenceBaseline=baseline?{...templateCopy(baseline),...templateCopy(changes),recurrence:templateCopy(clone.recurrence)}:null;
    if(clone.recurrenceBaseline) {
      for(const key of ['plannedDate','dueDate'])if(changes[key] && task[key] && baseline[key])clone.recurrenceBaseline[key]=addDays(baseline[key],templateOffset(changes[key],task[key]));
      if(changes.reminderAt && task.reminderAt && baseline.reminderAt) {
        const after=new Date(changes.reminderAt),before=new Date(task.reminderAt),base=new Date(baseline.reminderAt);
        clone.recurrenceBaseline.reminderAt=combineDateTime(addDays(dateOnly(base),templateOffset(dateOnly(after),dateOnly(before))),`${pad(after.getHours())}:${pad(after.getMinutes())}`);
      }
    }
    return clone;
  }

  function nextRecurrenceDate(value, recurrence) {
    const normalized = normalizeRecurrence(recurrence);
    const date = parseDateOnly(value);
    if (!normalized || !date) return null;
    if (normalized.frequency === 'daily') return addDays(value, normalized.interval);
    if (normalized.frequency === 'weekly') return addDays(value, normalized.interval * 7);

    const year = date.getFullYear();
    const monthIndex = date.getMonth();
    const day = date.getDate();
    const targetMonthIndex = monthIndex + normalized.interval;
    const targetYear = year + Math.floor(targetMonthIndex / 12);
    const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
    const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
    return dateOnly(new Date(targetYear, normalizedMonth, Math.min(day, lastDay)));
  }

  function advanceIsoTimestamp(value, recurrence) {
    if (!value) return null;
    const normalized = normalizeRecurrence(recurrence);
    const date = new Date(value);
    if (!normalized || Number.isNaN(date.getTime())) return null;
    if (normalized.frequency === 'daily') date.setUTCDate(date.getUTCDate() + normalized.interval);
    else if (normalized.frequency === 'weekly') date.setUTCDate(date.getUTCDate() + normalized.interval * 7);
    else {
      const originalDay = date.getUTCDate();
      const targetMonthIndex = date.getUTCMonth() + normalized.interval;
      const targetYear = date.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
      const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
      const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
      date.setUTCFullYear(targetYear, normalizedMonth, Math.min(originalDay, lastDay));
    }
    return date.toISOString();
  }

  function buildNextRecurringTask(task, nowIso, newId) {
    const source=task?.recurrenceBaseline || task;
    const recurrence = normalizeRecurrenceV3(source && source.recurrence);
    if (!task || !recurrence) return null;
    const now = new Date(nowIso);
    const nowDate = Number.isNaN(now.getTime()) ? dateOnly() : dateOnly(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    const advance=value=>{let next=nextRecurrenceDate(value,recurrence);if(recurrence.skipNext)next=nextRecurrenceDate(next,recurrence);return next;};
    let plannedDate = source.plannedDate ? advance(source.plannedDate) : null;
    const dueDate = source.dueDate ? advance(source.dueDate) : null;
    if (!plannedDate && !dueDate) plannedDate = advance(nowDate);
    if(!shouldGenerateRecurrence(recurrence,plannedDate || dueDate))return null;
    const id = String(newId || `task_${Date.now().toString(36)}`);
    let reminderAt=source.reminderAt?advanceIsoTimestamp(source.reminderAt,recurrence):null;
    if(reminderAt && recurrence.skipNext)reminderAt=advanceIsoTimestamp(reminderAt,recurrence);
    return {
      ...templateCopy(source),
      id,
      plannedDate,
      dueDate,
      reminderAt,
      reminderFiredAt: null,
      recurrence:{...recurrence,seriesId:recurrence.seriesId || task.id,occurrencesCreated:recurrence.occurrencesCreated+1,skipNext:false},
      recurrenceBaseline:null,
      recurrenceSuccessorId:null,
      attachmentIds: [],
      isInbox: false,
      isCompleted: false,
      completedAt: null,
      subtasks: (source.subtasks || []).map((subtask, index) => ({
        ...subtask,
        id: `${id}_sub_${index}_${Math.random().toString(36).slice(2, 7)}`,
        isCompleted: false,
      })),
      todayOrder: null,
      projectOrder: null,
      inboxOrder: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  function isReminderDue(task, nowIso) {
    if (!task || task.isCompleted || !task.reminderAt || task.reminderFiredAt) return false;
    const reminder = new Date(task.reminderAt).getTime();
    const now = new Date(nowIso).getTime();
    return Number.isFinite(reminder) && Number.isFinite(now) && reminder <= now;
  }

  function filterCompleted(tasks, options = {}, nowIso = new Date().toISOString()) {
    const projectId = options.projectId || null;
    const periodDays = Number(options.periodDays) || 0;
    const now = new Date(nowIso).getTime();
    const cutoff = periodDays > 0 && Number.isFinite(now) ? now - periodDays * 86400000 : null;
    return tasks
      .filter(task => {
        if (!task.isCompleted || !task.completedAt) return false;
        if (projectId && task.projectId !== projectId) return false;
        if (cutoff !== null && new Date(task.completedAt).getTime() < cutoff) return false;
        return true;
      })
      .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
  }

  function searchItems(tasks, projects, rawQuery) {
    const query = String(rawQuery || '').trim().toLocaleLowerCase();
    if (!query) return { tasks: [], projects: [] };
    const scored = [];
    for (const task of tasks) {
      const title = String(task.title || '').toLocaleLowerCase();
      const notes = String(task.notes || '').toLocaleLowerCase();
      let rank = null;
      if (title === query) rank = 0;
      else if (title.includes(query)) rank = 1;
      else if (notes.includes(query)) rank = 2;
      if (rank !== null) scored.push({ task, rank });
    }
    scored.sort((a, b) => a.rank - b.rank || String(b.task.updatedAt || '').localeCompare(String(a.task.updatedAt || '')));
    const projectMatches = projects
      .filter(p => String(p.name || '').toLocaleLowerCase().includes(query))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return { tasks: scored, projects: projectMatches };
  }


  const PRIORITIES = new Set(['none', 'low', 'medium', 'high']);

  function normalizeTagName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ');
  }

  function validateTagName(tags, name, excludeId = null) {
    const normalized = normalizeTagName(name);
    if (!normalized) return { ok: false, reason: 'empty-tag' };
    const lower = normalized.toLocaleLowerCase();
    const duplicate = (tags || []).some(tag => tag && tag.id !== excludeId && normalizeTagName(tag.name).toLocaleLowerCase() === lower);
    if (duplicate) return { ok: false, reason: 'duplicate-tag' };
    return { ok: true };
  }

  function validateAreaName(areas, name, excludeId = null) {
    const normalized = normalizeTagName(name);
    if (!normalized) return { ok: false, reason: 'empty-area' };
    const lower = normalized.toLocaleLowerCase();
    const duplicate = (areas || []).some(area => area && area.id !== excludeId && normalizeTagName(area.name).toLocaleLowerCase() === lower);
    if (duplicate) return { ok: false, reason: 'duplicate-area' };
    return { ok: true };
  }

  function areaSummary(areaId, state) {
    const source = state || {};
    const projects = (source.projects || []).filter(project => project && project.areaId === areaId);
    const openTasks = (source.tasks || []).filter(task => task && !task.isCompleted && effectiveTaskArea(task, source.projects || []) === areaId);
    const activeGoals = (source.goals || []).filter(goal => goal && goal.areaId === areaId && goal.status === 'active');
    const activeHabits = (source.habits || []).filter(habit => habit && habit.areaId === areaId && habit.status === 'active');
    return { projects: projects.length, openTasks: openTasks.length, activeGoals: activeGoals.length, activeHabits: activeHabits.length };
  }

  function goalTaskSet(goal, state) {
    const source = state || {};
    const taskById = new Map((source.tasks || []).filter(Boolean).map(task => [task.id, task]));
    const ids = new Set(Array.isArray(goal?.taskIds) ? goal.taskIds : []);
    for (const link of goal?.projectLinks || []) {
      if (!link || !link.projectId) continue;
      if (link.contributionMode === 'allTasks') {
        for (const task of source.tasks || []) if (task && task.projectId === link.projectId) ids.add(task.id);
      } else if (link.contributionMode === 'selectedTasks') {
        for (const id of link.selectedTaskIds || []) ids.add(id);
      }
    }
    return [...ids].map(id => taskById.get(id)).filter(Boolean);
  }

  function safeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function positiveIntegerOrNull(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  }

  function normalizeState(input) {
    const migration = migrateStateV3(input);
    if (!migration.ok) throw new Error(migration.reason || 'invalid-state');
    const state = migration.state;
    const focusTaskIds = selectFocusTasks(state.tasks, state.settings?.focusTaskIds);
    const dashboard = state.settings?.dashboard || {};
    state.settings = {
      ...(state.settings || {}),
      focusTaskIds,
      dashboard: {
        focusedMode: dashboard.focusedMode === true,
        sectionOrder: Array.isArray(dashboard.sectionOrder) ? [...new Set(dashboard.sectionOrder.filter(id => typeof id === 'string'))] : [],
        pinnedSectionIds: Array.isArray(dashboard.pinnedSectionIds) ? [...new Set(dashboard.pinnedSectionIds.filter(id => typeof id === 'string'))] : [],
      },
    };
    state.tasks = state.tasks.map(task => ({ ...task, durationMinutes: positiveIntegerOrNull(task.durationMinutes) }));
    state.goals = state.goals.map(goal => ({
      ...goal,
      currentValue: Number.isFinite(Number(goal.currentValue)) ? Number(goal.currentValue) : 0,
      targetValue: Number(goal.targetValue) > 0 && Number.isFinite(Number(goal.targetValue)) ? Number(goal.targetValue) : 100,
      unit: typeof goal.unit === 'string' ? goal.unit : '',
    }));
    state.habits = state.habits.map(habit => {
      const minimumTarget = positiveIntegerOrNull(habit.minimumTarget);
      const idealTarget = positiveIntegerOrNull(habit.idealTarget);
      return {
        ...habit,
        minimumTarget,
        idealTarget: idealTarget && minimumTarget ? Math.max(minimumTarget, idealTarget) : idealTarget,
        graceDays: Number.isInteger(Number(habit.graceDays)) && Number(habit.graceDays) >= 0 ? Number(habit.graceDays) : 0,
      };
    });
    state.resources = (state.resources || []).map(resource => ({
      ...resource,
      type: ['book', 'video', 'article', 'course', 'document', 'other'].includes(resource.type) ? resource.type : 'article',
      status: ['unread', 'reading', 'completed'].includes(resource.status) ? resource.status : 'unread',
      author: typeof resource.author === 'string' ? resource.author : '',
      favorite: resource.favorite === true,
      reviewedAt: typeof resource.reviewedAt === 'string' && parseDateOnly(resource.reviewedAt) && dateOnly(parseDateOnly(resource.reviewedAt)) === resource.reviewedAt ? resource.reviewedAt : null,
      clip: typeof resource.clip === 'string' ? resource.clip : '',
    }));
    return state;
  }

  function selectFocusTasks(tasks, focusTaskIds, limit = 3) {
    const openIds = new Set((tasks || []).filter(task => task && !task.isCompleted && typeof task.id === 'string').map(task => task.id));
    const maximum = Math.max(0, Math.floor(Number(limit) || 0));
    return [...new Set((focusTaskIds || []).filter(id => typeof id === 'string' && openIds.has(id)))].slice(0, maximum);
  }

  function goalProgressFraction(goal) {
    if (!goal || goal.progressMode === 'linkedTasks' || goal.progressMode === 'linkedHabits') return null;
    if (goal.progressType === 'numeric') {
      const target = safeNumber(goal.targetValue);
      return target > 0 ? safeNumber(goal.currentValue) / target : 0;
    }
    return safeNumber(goal.currentValue) / 100;
  }

  function getGoalHealth(goal, now = new Date()) {
    if (!goal) return 'on-track';
    const progress = goalProgressFraction(goal);
    if (goal.status === 'completed' || progress !== null && progress >= 1) return 'complete';
    const active = !goal.status || goal.status === 'active';
    const timestamp = now instanceof Date ? now : new Date(now);
    const today = Number.isNaN(timestamp.getTime()) ? dateOnly() : dateOnly(timestamp);
    if (active && goal.targetDate && goal.targetDate < today) return 'overdue';
    if (active && goal.targetDate && goal.targetDate <= addDays(today, 7) && (progress === null || progress < 0.75)) return 'at-risk';
    return 'on-track';
  }

  function getHabitTargetStatus(habit, periodStats) {
    const current = Math.max(0, safeNumber(periodStats?.currentPeriodCount ?? periodStats?.progressValue ?? periodStats?.count ?? periodStats));
    const fallback = positiveIntegerOrNull(habit?.targetValue) || positiveIntegerOrNull(habit?.timesPerWeek) || 1;
    const minimumTarget = positiveIntegerOrNull(habit?.minimumTarget) || fallback;
    const idealTarget = Math.max(minimumTarget, positiveIntegerOrNull(habit?.idealTarget) || minimumTarget);
    const minimumMet = current >= minimumTarget;
    const idealMet = current >= idealTarget;
    return { current, minimumTarget, idealTarget, minimumMet, idealMet, status: idealMet ? 'ideal' : minimumMet ? 'minimum' : 'below-minimum' };
  }

  function getTimedTaskBlocks(tasks, date) {
    const blocks = (tasks || []).flatMap(task => {
      const durationMinutes = positiveIntegerOrNull(task?.durationMinutes);
      const time = normalizeTime(task?.plannedTime);
      if (!task || task.isCompleted || task.plannedDate !== date || !time || !durationMinutes) return [];
      const [hours, minutes] = time.split(':').map(Number);
      const startMinutes = hours * 60 + minutes;
      return [{ taskId: task.id, startMinutes, durationMinutes, endMinutes: startMinutes + durationMinutes }];
    }).sort((a, b) => a.startMinutes - b.startMinutes || String(a.taskId).localeCompare(String(b.taskId)));
    return blocks.map(block => ({
      ...block,
      conflict: blocks.some(other => other !== block && block.startMinutes < other.endMinutes && other.startMinutes < block.endMinutes),
    }));
  }

  function clampPercent(value) {
    return Math.max(0, Math.min(100, value));
  }

  function computeGoalProgress(goal, state = {}, habitMetrics = {}) {
    const source = goal || {};
    if (source.progressMode === 'linkedTasks') {
      const tasks = goalTaskSet(source, state);
      const current = tasks.filter(task => Boolean(task.isCompleted)).length;
      const target = tasks.length;
      return { current, target, percent: target ? current / target * 100 : 0 };
    }
    if (source.progressMode === 'linkedHabits') {
      const links = (source.habitLinks || []).filter(link => link && link.habitId);
      const total = links.reduce((sum, link) => {
        const target = safeNumber(link.target);
        const actual = safeNumber(habitMetrics?.[link.habitId]?.[link.metric]);
        return sum + (target > 0 ? Math.min(actual / target, 1) * 100 : 0);
      }, 0);
      const percent = links.length ? total / links.length : 0;
      return { current: percent, target: 100, percent };
    }
    const current = safeNumber(source.currentValue);
    if (source.progressType === 'numeric') {
      const target = safeNumber(source.targetValue);
      return { current, target, percent: target > 0 ? clampPercent(current / target * 100) : 0 };
    }
    return { current, target: 100, percent: clampPercent(current) };
  }

  function isGoalOverdue(goal, today) {
    return Boolean(goal && goal.status === 'active' && goal.targetDate && goal.targetDate < today);
  }

  function goalReminderMoments(goal) {
    if (!goal?.targetDate || !parseDateOnly(goal.targetDate)) return [];
    const reminders = goal.reminders || {};
    const time = normalizeTime(reminders.time) || '09:00';
    const offsets = [
      ['sevenDaysBefore', -7], ['threeDaysBefore', -3], ['oneDayBefore', -1], ['onTargetDate', 0],
    ];
    return offsets.filter(([key]) => reminders[key]).map(([, offset]) => combineDateTime(addDays(goal.targetDate, offset), time));
  }

  function goalReminderDueMoments(goal, now) {
    if (!goal || goal.status !== 'active' || !goal.targetDate) return [];
    const nowDate = new Date(now);
    if (Number.isNaN(nowDate.getTime()) || dateOnly(nowDate) > goal.targetDate) return [];
    const fired = new Set(Array.isArray(goal.reminderFiredMoments) ? goal.reminderFiredMoments : []);
    return goalReminderMoments(goal).filter(moment => !fired.has(moment) && new Date(moment).getTime() <= nowDate.getTime());
  }

  function overdueMilestones(goal, today) {
    return (goal?.milestones || []).filter(milestone => milestone && !milestone.isCompleted && milestone.date && milestone.date < today);
  }

  function daysBetween(start, end) {
    const a = parseDateOnly(start); const b = parseDateOnly(end);
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  function weekStartFor(date, weekStartsOn = 'monday') {
    const parsed = parseDateOnly(date);
    if (!parsed) return null;
    const firstDay = weekStartsOn === 'sunday' ? 0 : 1;
    return addDays(date, -((parsed.getDay() - firstDay + 7) % 7));
  }

  function habitPausedOn(habit, date) {
    return (habit?.pauseIntervals || []).some(interval => interval?.startDate && date >= interval.startDate && (!interval.endDate || date <= interval.endDate))
      || Boolean(habit?.pauseStartedAt && date >= habit.pauseStartedAt);
  }

  function habitScheduledOn(habit, date, options = {}) {
    if (!habit || (!options.historical && habit.status !== 'active') || !parseDateOnly(date)) return false;
    const start = habit.startDate && parseDateOnly(habit.startDate) ? habit.startDate : date;
    if (date < start || habitPausedOn(habit, date) || (habit.endType === 'date' && habit.endDate && date > habit.endDate)) return false;
    if (habit.frequencyType === 'timesPerWeek') return true;
    if (habit.frequencyType === 'weekdays') return (habit.weekdays || []).map(Number).includes(parseDateOnly(date).getDay());
    if (habit.frequencyType === 'everyNDays') {
      const days = daysBetween(start, date);
      return days !== null && days >= 0 && days % Math.max(1, Math.floor(Number(habit.everyNDays) || 1)) === 0;
    }
    return habit.frequencyType === 'daily' || !habit.frequencyType;
  }

  function habitPeriodKey(habit, date, weekStartsOn = 'monday') {
    if (!parseDateOnly(date)) return null;
    return habit?.frequencyType === 'timesPerWeek' ? weekStartFor(date, weekStartsOn) : date;
  }

  function numericHabitState(habit, rawValue) {
    const value = Math.max(0, safeNumber(rawValue));
    const target = Math.max(0, safeNumber(habit?.targetValue));
    const percent = target > 0 ? clampPercent(value / target * 100) : 0;
    return { status: target > 0 && value >= target ? 'done' : 'missed', value, percent };
  }

  function habitStatusForDate(habit, logs, date, today = dateOnly()) {
    const log = (logs || []).find(item => item && item.date === date && (!habit?.id || item.habitId === habit.id));
    if (log) {
      if (habit?.trackingType === 'numeric') return numericHabitState(habit, log.value);
      return { status: log.status, value: log.value ?? null, percent: log.status === 'done' ? 100 : 0 };
    }
    if (!habitScheduledOn(habit, date, { historical: true })) return { status: 'unscheduled', value: null, percent: 0 };
    return { status: date < today ? 'missed' : 'pending', value: null, percent: 0 };
  }

  function habitScheduleDates(habit, today, weekStartsOn, logs = []) {
    const start = habit?.startDate && parseDateOnly(habit.startDate) ? habit.startDate : today;
    const recordedDates = new Set((logs || []).filter(log => log?.date >= start && log.date <= today).map(log => log.date));
    const dates = [];
    for (let date = start; date <= today; date = addDays(date, 1)) {
      // A pre-existing log is historical evidence even if a pause boundary was
      // recorded on the same day. It must not disappear from metrics/history.
      if (habitScheduledOn(habit, date, { historical: true }) || recordedDates.has(date)) dates.push(date);
    }
    if (habit?.frequencyType === 'timesPerWeek') {
      const keys = [...new Set(dates.map(date => habitPeriodKey(habit, date, weekStartsOn)))];
      return keys.map(key => ({ key, dates: dates.filter(date => habitPeriodKey(habit, date, weekStartsOn) === key) }));
    }
    return dates.map(date => ({ key: date, dates: [date] }));
  }

  function deriveHabitMetrics(habit, logs, today = dateOnly(), weekStartsOn = 'monday') {
    const relevantLogs = (logs || []).filter(log => log && (!habit?.id || log.habitId === habit.id) && log.date <= today);
    const logByDate = new Map(relevantLogs.map(log => [log.date, log]));
    const periods = habitScheduleDates(habit, today, weekStartsOn, relevantLogs);
    const currentKey = habitPeriodKey(habit, today, weekStartsOn);
    const target = habit?.frequencyType === 'timesPerWeek' ? Math.max(1, Math.floor(Number(habit.timesPerWeek) || 1)) : 1;
    let totalCheckins = 0; let successfulPeriods = 0; let longestStreak = 0; let running = 0;
    const periodStates = periods.map(period => {
      const entries = period.dates.map(date => ({ date, log: logByDate.get(date), state: habitStatusForDate(habit, relevantLogs, date, today) }));
      const done = entries.filter(entry => entry.state.status === 'done').length;
      const progressValue = habit?.trackingType === 'numeric' && habit?.frequencyType !== 'timesPerWeek'
        ? entries.reduce((sum, entry) => sum + safeNumber(entry.state.value), 0)
        : done;
      totalCheckins += done;
      const skipped = entries.some(entry => entry.state.status === 'skipped');
      const occurrenceMissed = entries.some(entry => entry.state.status === 'missed');
      const successful = habit?.frequencyType === 'timesPerWeek' ? done >= target : done > 0;
      const isCurrent = period.key === currentKey;
      // A weekly habit has one required unit: the week. Missing individual days
      // cannot break an otherwise successful week.
      const missed = habit?.frequencyType === 'timesPerWeek'
        ? (!successful && period.key < currentKey)
        : occurrenceMissed;
      return { ...period, done, progressValue, skipped, missed, successful, isCurrent };
    });
    for (const period of periodStates) {
      if (period.missed || (!period.successful && !period.skipped && !period.isCurrent)) running = 0;
      if (period.successful) { running += habit?.frequencyType === 'timesPerWeek' ? 1 : period.done; successfulPeriods += 1; }
      longestStreak = Math.max(longestStreak, running);
    }
    const current = periodStates.find(period => period.isCurrent);
    const considered = periodStates.filter(period => period.key <= currentKey);
    const completedUnits = habit?.frequencyType === 'timesPerWeek'
      ? considered.filter(period => period.successful).length
      : considered.reduce((sum, period) => sum + period.done, 0);
    const expectedUnits = habit?.frequencyType === 'timesPerWeek'
      ? considered.length
      : considered.length;
    return {
      currentStreak: running,
      streak: running,
      longestStreak,
      totalCheckins,
      successfulPeriods,
      completionRate: expectedUnits ? clampPercent(completedUnits / expectedUnits * 100) : 0,
      currentPeriodCount: current?.progressValue || 0,
      currentPeriodTarget: habit?.trackingType === 'numeric' && habit?.frequencyType !== 'timesPerWeek' ? Math.max(0, safeNumber(habit.targetValue)) : target,
      periods: periodStates,
    };
  }

  function habitReminderActive(habit, logs, now, weekStartsOn = 'monday') {
    if (!habit || habit.status !== 'active' || !(habit.reminders || []).some(reminder => reminder?.enabled && normalizeTime(reminder.time))) return false;
    const timestamp = new Date(now); if (Number.isNaN(timestamp.getTime())) return false;
    const today = dateOnly(timestamp);
    if (!habitScheduledOn(habit, today)) return false;
    const metrics = deriveHabitMetrics(habit, logs, today, weekStartsOn);
    return habit.frequencyType !== 'timesPerWeek' || metrics.currentPeriodCount < metrics.currentPeriodTarget;
  }

  function tasksForTag(tasks, tagId) {
    return (tasks || []).filter(task => !task.isCompleted && Array.isArray(task.tagIds) && task.tagIds.includes(tagId));
  }

  function parseQuickPlanPhrase(rawTitle, today) {
    const original = String(rawTitle || '');
    const trimmed = original.trim();
    if (!trimmed) return { title: original, plannedDate: null };
    const timed = trimmed.match(/^(.*?\S)\s+(?:at\s+)?(\d{2}:\d{2})$/i);
    if (timed) {
      const plannedTime = normalizeTime(timed[2]);
      if (!plannedTime) return { title: original, plannedDate: null };
      return { ...parseQuickPlanPhrase(timed[1], today), plannedTime };
    }
    const match = trimmed.match(/^(.*\S)\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i);
    if (!match) return { title: original, plannedDate: null };
    const title = match[1].trim();
    const token = match[2].toLocaleLowerCase();
    if (!title) return { title: original, plannedDate: null };
    if (token === 'today') return { title, plannedDate: today };
    if (token === 'tomorrow') return { title, plannedDate: addDays(today, 1) };
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const base = parseDateOnly(today);
    if (!base) return { title: original, plannedDate: null };
    const target = weekdays.indexOf(token);
    let delta = (target - base.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    return { title, plannedDate: addDays(today, delta) };
  }

  function cloneTaskForDuplicate(task, newId, nowIso) {
    const id = String(newId);
    return {
      ...task,
      id,
      recurrence:freshRecurrence(task.recurrence,id),
      recurrenceBaseline:null,
      recurrenceSuccessorId:null,
      isCompleted: false,
      completedAt: null,
      attachmentIds: [],
      subtasks: (task.subtasks || []).map((subtask, index) => ({
        ...subtask,
        id: `${id}_sub_${index}_${Math.random().toString(36).slice(2, 7)}`,
        isCompleted: false,
      })),
      todayOrder: null,
      projectOrder: null,
      inboxOrder: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  function normalizeTime(value) {
    if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    return value;
  }

  function combineDateTime(date, time) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !normalizeTime(time)) return null;
    const parsed = parseDateOnly(date);
    if (!parsed || dateOnly(parsed) !== date) return null;
    return `${date}T${time}:00`;
  }

  function effectiveTaskArea(task, projects) {
    if (!task || typeof task !== 'object') return null;
    if (!task.projectId) return task.areaId || null;
    const project = (projects || []).find(item => item && item.id === task.projectId);
    return project && project.areaId ? project.areaId : null;
  }

  function collectionIsValid(state, key) {
    return Array.isArray(state[key]);
  }

  function invalidV3Collection(input) {
    return ['tasks', 'projects', 'tags', 'areas', 'goals', 'habits', 'notes', 'resources', 'templates', 'savedViews']
      .find(key => Object.hasOwn(input, key) && !Array.isArray(input[key]));
  }

  function isNullableEntityId(value) {
    return value === null || typeof value === 'string' && value.trim();
  }

  function entityIdArrayIsValid(value) {
    return Array.isArray(value) && value.every(id => typeof id === 'string' && id.trim());
  }

  function invalidExplicitV3Field(input) {
    for (const [key, field, values] of [['goals', 'horizon', ['short', 'mid', 'long']], ['habits', 'routine', ['morning', 'daily', 'night']]]) {
      for (const item of input[key] || []) {
        if (item && Object.hasOwn(item, field) && !values.includes(item[field])) return `invalid-${field}`;
      }
    }
    for (const key of ['notes', 'resources']) {
      for (const item of input[key] || []) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return `invalid-${key}`;
        for (const field of ['title', key === 'notes' ? 'body' : 'description', 'createdAt', 'updatedAt']) {
          if (Object.hasOwn(item, field) && typeof item[field] !== 'string') return `invalid-${key}-${field}`;
        }
        if (Object.hasOwn(item, 'areaId') && !isNullableEntityId(item.areaId)) return `invalid-${key}-area-id`;
        if (Object.hasOwn(item, 'linkUrls') && (!Array.isArray(item.linkUrls) || item.linkUrls.some(url => typeof url !== 'string'))) return `invalid-${key}-links`;
        for (const field of ['attachmentIds', ...(key === 'resources' ? ['relatedTaskIds', 'relatedProjectIds', 'relatedGoalIds', 'relatedHabitIds'] : [])]) {
          if (Object.hasOwn(item, field) && !entityIdArrayIsValid(item[field])) return `invalid-${key}-${field}`;
        }
      }
    }
    if (Array.isArray(input.tasks)) {
      for (const task of input.tasks) {
        if (!task || typeof task !== 'object') continue;
        if (Object.hasOwn(task, 'areaId') && !isNullableEntityId(task.areaId)) return 'invalid-task-area-id';
        if (Object.hasOwn(task, 'goalIds') && !Array.isArray(task.goalIds)) return 'invalid-task-goal-ids';
        if (Object.hasOwn(task, 'attachmentIds') && !entityIdArrayIsValid(task.attachmentIds)) return 'invalid-task-attachment-ids';
        if (Object.hasOwn(task, 'plannedTime') && task.plannedTime !== null && normalizeTime(task.plannedTime) !== task.plannedTime) return 'invalid-task-planned-time';
        if (Object.hasOwn(task, 'dueTime') && task.dueTime !== null && normalizeTime(task.dueTime) !== task.dueTime) return 'invalid-task-due-time';
      }
    }
    if (Array.isArray(input.projects)) {
      for (const project of input.projects) {
        if (!project || typeof project !== 'object') continue;
        if (Object.hasOwn(project, 'areaId') && !isNullableEntityId(project.areaId)) return 'invalid-project-area-id';
        if (Object.hasOwn(project, 'goalIds') && !Array.isArray(project.goalIds)) return 'invalid-project-goal-ids';
        if (Object.hasOwn(project, 'isArchived') && typeof project.isArchived !== 'boolean') return 'invalid-project-is-archived';
      }
    }
    return null;
  }

  function objectIdsAreValid(items) {
    return items.every(item => item && typeof item === 'object' && typeof item.id === 'string' && item.id.trim());
  }

  function validateStateV3(state, migrated = false) {
    if (!state || typeof state !== 'object' || state.version !== 3) return { ok: false, reason: 'unsupported-version' };
    // Older V3 recovery destinations can predate these optional collections.
    state = { notes: [], resources: [], ...state };
    const collections = ['tasks', 'projects', 'tags', 'areas', 'goals', 'habits', 'notes', 'resources', 'templates', 'savedViews'];
    for (const key of collections) {
      if (!collectionIsValid(state, key)) return { ok: false, reason: `invalid-${key}` };
    }
    if (!state.settings || typeof state.settings !== 'object' || Array.isArray(state.settings)
      || !state.ui || typeof state.ui !== 'object' || Array.isArray(state.ui)) return { ok: false, reason: 'invalid-state' };
    if (!objectIdsAreValid(state.tasks)) return { ok: false, reason: 'invalid-task' };
    if (!objectIdsAreValid(state.projects)) return { ok: false, reason: 'invalid-project' };
    if (!objectIdsAreValid(state.tags)) return { ok: false, reason: 'invalid-tag' };
    if (!objectIdsAreValid(state.areas)) return { ok: false, reason: 'invalid-area' };
    if (!objectIdsAreValid(state.goals)) return { ok: false, reason: 'invalid-goal' };
    if (!objectIdsAreValid(state.habits)) return { ok: false, reason: 'invalid-habit' };
    if (!objectIdsAreValid(state.templates)) return { ok: false, reason: 'invalid-template' };
    if (!objectIdsAreValid(state.savedViews)) return { ok: false, reason: 'invalid-saved-view' };
    const malformedField = invalidExplicitV3Field(state);
    if (malformedField) return { ok: false, reason: malformedField };
    for (const key of ['notes', 'resources']) {
      if (!objectIdsAreValid(state[key]) || new Set(state[key].map(item => item.id)).size !== state[key].length) return { ok: false, reason: `invalid-${key}-id` };
      for (const item of state[key]) {
        if (typeof item.title !== 'string' || !item.title.trim()
          || typeof item[key === 'notes' ? 'body' : 'description'] !== 'string'
          || typeof item.createdAt !== 'string' || typeof item.updatedAt !== 'string'
          || !isNullableEntityId(item.areaId) || !Array.isArray(item.linkUrls)
          || !entityIdArrayIsValid(item.attachmentIds)) return { ok: false, reason: `invalid-${key}` };
      }
    }

    for (const task of state.tasks) {
      if (!String(task.title || '').trim()) return { ok: false, reason: 'invalid-task' };
      if (!isNullableEntityId(task.areaId)) return { ok: false, reason: 'invalid-task-area-id' };
      if (!Array.isArray(task.goalIds)) return { ok: false, reason: 'invalid-task-goal-ids' };
      if (task.plannedTime !== null && normalizeTime(task.plannedTime) !== task.plannedTime) return { ok: false, reason: 'invalid-task-planned-time' };
      if (task.dueTime !== null && normalizeTime(task.dueTime) !== task.dueTime) return { ok: false, reason: 'invalid-task-due-time' };
    }
    for (const project of state.projects) {
      if (!String(project.name || '').trim()) return { ok: false, reason: 'invalid-project' };
      if (!isNullableEntityId(project.areaId)) return { ok: false, reason: 'invalid-project-area-id' };
      if (!Array.isArray(project.goalIds)) return { ok: false, reason: 'invalid-project-goal-ids' };
      if (typeof project.isArchived !== 'boolean') return { ok: false, reason: 'invalid-project-is-archived' };
    }

    const projectIds = new Set(state.projects.map(project => project.id));
    const areaIds = new Set(state.areas.map(area => area.id));
    const goalIds = new Set(state.goals.map(goal => goal.id));
    const relatedIds = {
      relatedTaskIds: new Set(state.tasks.map(task => task.id)), relatedProjectIds: projectIds,
      relatedGoalIds: goalIds, relatedHabitIds: new Set(state.habits.map(habit => habit.id)),
    };
    for (const key of ['notes', 'resources']) {
      for (const item of state[key]) {
        if (item.areaId && !areaIds.has(item.areaId)) return { ok: false, reason: `missing-${key}-area` };
        if (key === 'resources') for (const [field, ids] of Object.entries(relatedIds)) {
          if (!entityIdArrayIsValid(item[field]) || item[field].some(id => !ids.has(id))) return { ok: false, reason: `invalid-resource-${field}` };
        }
      }
    }
    for (const task of state.tasks) {
      if (task.projectId && !projectIds.has(task.projectId)) return { ok: false, reason: 'missing-task-project' };
      if (task.projectId && task.areaId) return { ok: false, reason: 'task-area-project-conflict' };
      if (task.areaId && !areaIds.has(task.areaId)) return { ok: false, reason: 'missing-task-area' };
      if (task.goalIds.some(goalId => !goalIds.has(goalId))) return { ok: false, reason: 'missing-task-goal' };
    }
    for (const project of state.projects) {
      if (project.areaId && !areaIds.has(project.areaId)) return { ok: false, reason: 'missing-project-area' };
      if (project.goalIds.some(goalId => !goalIds.has(goalId))) return { ok: false, reason: 'missing-project-goal' };
    }
    return { ok: true, state, migrated: Boolean(migrated) };
  }

  function migrateStateV3(input) {
    if (!input || typeof input !== 'object') return { ok: false, reason: 'invalid-state' };
    if (![1, 2, 3].includes(input.version)) return { ok: false, reason: 'unsupported-version' };

    const malformedCollection = input.version === 3 ? invalidV3Collection(input) : null;
    if (malformedCollection) return { ok: false, reason: `invalid-${malformedCollection}` };
    const malformedField = input.version === 3 ? invalidExplicitV3Field(input) : null;
    if (malformedField) return { ok: false, reason: malformedField };

    const base = input.version === 3
      ? { ok: true, state: JSON.parse(JSON.stringify(input)), migrated: false }
      : migrateStateV2(input);
    if (!base.ok) return base;

    const state = base.state;
    state.version = 3;
    state.areas = Array.isArray(state.areas) ? state.areas : [];
    state.goals = Array.isArray(state.goals) ? state.goals : [];
    state.habits = Array.isArray(state.habits) ? state.habits : [];
    state.templates = Array.isArray(state.templates) ? state.templates : [];
    state.savedViews = Array.isArray(state.savedViews) ? state.savedViews : [];
    for (const key of ['notes', 'resources']) {
      state[key] = (state[key] || []).map(item => ({
        title: '', [key === 'notes' ? 'body' : 'description']: '', areaId: null,
        attachmentIds: [], createdAt: '', updatedAt: '',
        ...(key === 'resources' ? { relatedTaskIds: [], relatedProjectIds: [], relatedGoalIds: [], relatedHabitIds: [] } : {}),
        ...item,
        linkUrls: [...new Set((item.linkUrls || []).map(url => url.trim()).filter(Boolean))],
      }));
    }
    state.goals = state.goals.map(goal => goal && ({ horizon: 'short', ...goal }));
    state.habits = state.habits.map(habit => habit && ({ routine: 'daily', ...habit }));
    if (!Array.isArray(state.tasks) || !Array.isArray(state.projects)) return { ok: false, reason: 'invalid-state' };
    state.tasks = state.tasks.map(task => {
      const recurrence=normalizeRecurrenceV3(task.recurrence);
      return {
      ...task,
      areaId: task.areaId || null,
      goalIds: Array.isArray(task.goalIds) ? task.goalIds : [],
      plannedTime: normalizeTime(task.plannedTime),
      dueTime: normalizeTime(task.dueTime),
      recurrence:recurrence?{...recurrence,seriesId:recurrence.seriesId || task.id}:null,
    };});
    state.projects = state.projects.map(project => ({
      ...project,
      areaId: project.areaId || null,
      goalIds: Array.isArray(project.goalIds) ? project.goalIds : [],
      isArchived: Boolean(project.isArchived),
    }));
    return validateStateV3(state, input.version !== 3);
  }

  function migrateStateV2(input) {
    if (!input || typeof input !== 'object') return { ok: false, reason: 'invalid-state' };
    if (input.version !== 1 && input.version !== 2) return { ok: false, reason: 'unsupported-version' };
    if (!Array.isArray(input.tasks) || !Array.isArray(input.projects)) return { ok: false, reason: 'invalid-state' };
    const state = JSON.parse(JSON.stringify(input));
    const migrated = state.version === 1;
    state.version = 2;
    state.tags = Array.isArray(state.tags) ? state.tags : [];
    state.settings = state.settings && typeof state.settings === 'object' ? state.settings : {};
    state.ui = state.ui && typeof state.ui === 'object' ? state.ui : {};

    for (const task of state.tasks) {
      if (!task || typeof task !== 'object' || !String(task.title || '').trim()) return { ok: false, reason: 'invalid-task' };
    }
    for (const project of state.projects) {
      if (!project || typeof project !== 'object' || !String(project.name || '').trim()) return { ok: false, reason: 'invalid-project' };
    }
    for (const tag of state.tags) {
      if (!tag || typeof tag !== 'object' || !normalizeTagName(tag.name) || !String(tag.id || '').trim()) return { ok: false, reason: 'invalid-tag' };
    }

    const tagIds = new Set(state.tags.map(tag => tag.id));
    state.tasks = state.tasks.map(task => ({
      ...task,
      tagIds: [...new Set((Array.isArray(task.tagIds) ? task.tagIds : []).filter(id => tagIds.has(id)))],
      priority: PRIORITIES.has(task.priority) ? task.priority : 'none',
      attachmentIds: [...new Set((Array.isArray(task.attachmentIds) ? task.attachmentIds : []).filter(id => typeof id === 'string' && id))],
    }));
    return { ok: true, state, migrated };
  }

  function validateState(state) {
    const result = migrateStateV2(state);
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  }

  return {
    dateOnly,
    parseDateOnly,
    addDays,
    templateFromEntity,
    instantiateTemplate,
    isOverdue,
    isInboxActive,
    deriveTodaySections,
    deriveTodayV3,
    deriveAnytime,
    deriveUpcoming,
    deriveUpcomingV3,
    deriveCalendarDay,
    deriveCalendarWeek,
    deriveCalendarMonthSummary,
    nextRecurrenceDate,
    normalizeRecurrenceV3,
    shouldGenerateRecurrence,
    splitRecurrenceForFuture,
    buildNextRecurringTask,
    isReminderDue,
    filterCompleted,
    searchItems,
    validateState,
    migrateStateV2,
    migrateStateV3,
    validateStateV3,
    effectiveTaskArea,
    applySavedView,
    normalizeShortcut,
    normalizeTime,
    combineDateTime,
    normalizeTagName,
    validateTagName,
    validateAreaName,
    areaSummary,
    normalizeState,
    selectFocusTasks,
    getGoalHealth,
    getHabitTargetStatus,
    getTimedTaskBlocks,
    computeGoalProgress,
    isGoalOverdue,
    goalReminderMoments,
    goalReminderDueMoments,
    overdueMilestones,
    habitScheduledOn,
    habitPeriodKey,
    numericHabitState,
    habitStatusForDate,
    deriveHabitMetrics,
    habitReminderActive,
    tasksForTag,
    parseQuickPlanPhrase,
    cloneTaskForDuplicate,
  };
});
