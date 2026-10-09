(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TodoCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const pad = n => String(n).padStart(2, '0');
  // Marks a user-visible error text as a translation key (see js/i18n.js); the app translates it where it is shown.
  const msg = text => text;

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

  // The local calendar day of an instant ("2026-10-08T22:30:00Z" is 2026-10-09 in Belgrade). A plain
  // YYYY-MM-DD value is already a calendar day and passes through. Never cut an ISO instant with slice(0, 10).
  function localDateOf(value) {
    if (typeof value !== 'string' || !value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? dateOnly(date) : null;
  }

  function addDays(value, amount) {
    const base = typeof value === 'string' ? parseDateOnly(value) : new Date(value);
    const copy = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    copy.setDate(copy.getDate() + amount);
    return dateOnly(copy);
  }

  const templateCopy = value => JSON.parse(JSON.stringify(value));
  function resolveTemplateVariables(value, contextDate) {
    const date = parseDateOnly(contextDate) ? contextDate : dateOnly();
    const replacements = { date, today: date, tomorrow: addDays(date, 1) };
    const replace = text => String(text).replace(/\{\{(date|today|tomorrow)\}\}/gi, (_, key) => replacements[key.toLowerCase()]);
    if (typeof value === 'string') return replace(value);
    if (Array.isArray(value)) return value.map(item => resolveTemplateVariables(item, date));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveTemplateVariables(item, date)]));
    return value;
  }
  function templateOffset(value, anchor) {
    if (!value) return null;
    const a = parseDateOnly(anchor), b = parseDateOnly(value);
    return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
  }
  function templateFromEntity(type, entity, state = {}, contextDate = dateOnly()) {
    const pick = keys => Object.fromEntries(keys.filter(key => entity[key] !== undefined).map(key => [key, templateCopy(entity[key])]));
    let data;
    if (type === 'task') {
      data = pick(['title','notes','projectId','areaId','goalIds','tagIds','priority','plannedTime','dueTime','durationMinutes']);
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
      data = pick(['name','areaId','goalIds','trackingType','targetValue','minimumTarget','idealTarget','graceDays','unit','quickValues','frequencyType','weekdays','timesPerWeek','everyNDays','continuation','endType','successfulPeriodsTarget']);
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
    } else throw new Error(msg('Unsupported template type'));
    return {type,data};
  }

  // crypto.randomUUID only exists in secure contexts (HTTPS/localhost); getRandomValues works everywhere.
  function makeUuid(cryptoSource = globalThis.crypto) {
    if (typeof cryptoSource?.randomUUID === 'function') return cryptoSource.randomUUID();
    const bytes = new Uint8Array(16);
    if (typeof cryptoSource?.getRandomValues === 'function') cryptoSource.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function instantiateTemplate(template, contextDate, ids = {}) {
    const d = resolveTemplateVariables(templateCopy(template.data || {}), contextDate);
    const makeId = ids.makeId || (prefix => `${prefix}_${makeUuid()}`);
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
      plannedDate:resolve(data.plannedOffsetDays),dueDate:resolve(data.dueOffsetDays),plannedTime:normalizeTime(data.plannedTime),dueTime:normalizeTime(data.dueTime),durationMinutes:positiveIntegerOrNull(data.durationMinutes),
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
    if (template.type === 'habit') return {habit:{...common,id:ids.habitId || makeId('habit'),name:d.name || '',areaId:live('areas',d.areaId),goalIds:links('goals',d.goalIds),status:'active',trackingType:d.trackingType || 'checkbox',targetValue:d.targetValue ?? 1,minimumTarget:habitTargetOrNull(d,d.minimumTarget),idealTarget:habitTargetOrNull(d,d.idealTarget),graceDays:Number.isInteger(d.graceDays) && d.graceDays >= 0 ? d.graceDays : 0,unit:d.unit || '',quickValues:d.quickValues || [],frequencyType:d.frequencyType || 'daily',weekdays:d.weekdays || [1,2,3,4,5],timesPerWeek:d.timesPerWeek || 4,everyNDays:d.everyNDays || 2,startDate:contextDate,continuation:d.continuation || 'automatic',endType:d.endType || 'never',endDate:resolve(d.endOffsetDays),successfulPeriodsTarget:d.successfulPeriodsTarget || null,reminders:(d.reminders || []).map(r=>({id:makeId('habit-reminder'),time:r.time,enabled:r.enabled !== false})),reminderFiredMoments:[],pauseIntervals:[],pauseStartedAt:null},goalLinks:configs.map(c=>({goalId:c.goalId,metric:c.metric,target:c.target}))};
    if (template.type === 'goal') return {goal:{...common,id:ids.goalId || makeId('goal'),title:d.title || '',areaId:live('areas',d.areaId),status:'active',progressMode:d.progressMode || 'manual',progressType:d.progressType || 'percentage',currentValue:0,targetValue:d.targetValue ?? 100,unit:d.unit || '',targetDate:resolve(d.targetOffsetDays),projectLinks:[],taskIds:[],habitLinks:[],completedAt:null,reminderFiredMoments:[],reminders:d.reminders || {},milestones:(d.milestones || []).map((m,order)=>({id:makeId('milestone'),title:m.title,date:resolve(m.dateOffsetDays),order,isCompleted:false,completedAt:null}))}};
    throw new Error(msg('Unsupported template type'));
  }
  function instantiateScheduledTaskTemplates(state, today, ids = {}) {
    const created = [];
    for (const template of state?.templates || []) {
      const data = template.type === 'task' ? template.data || {} : null;
      // One-shot catch-up: run missed dates once, anchored to their scheduled
      // day. The marker identifies that schedule, not the later execution day.
      if (!data?.scheduleEnabled || !data.scheduleDate || data.scheduleDate > today || data.scheduleGeneratedOn === data.scheduleDate) continue;
      const task = instantiateTemplate(template, data.scheduleDate, { ...ids, state }).task;
      if (!task?.title) continue;
      created.push(task); data.scheduleGeneratedOn = data.scheduleDate;
    }
    return created;
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
      .filter(t => t.isCompleted && t.completedAt && localDateOf(String(t.completedAt)) === today)
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

  function filterTodayTasks(sections, filter, today = dateOnly()) {
    const activeFilter = ['all', 'open', 'completed', 'important', 'dueToday'].includes(filter) ? filter : 'all';
    const matches = task => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'open') return !task.isCompleted;
      if (activeFilter === 'completed') return Boolean(task.isCompleted);
      if (activeFilter === 'important') return Boolean(task.isImportant) && !task.isCompleted;
      return task.dueDate === today && !task.isCompleted;
    };
    const result = { ...sections };
    for (const key of ['overdue', 'today', 'completed', 'suggestions']) {
      if (!Array.isArray(sections[key])) continue;
      result[key] = sections[key].filter(entry => matches(entry.task || entry));
    }
    return result;
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

  function calendarTimeBlocks(state, date) {
    if (!parseDateOnly(date) || state?.ui?.calendarVisibility?.tasks === false) return [];
    return (state?.tasks || []).flatMap(task => {
      const plannedTime = normalizeTime(task?.plannedTime);
      if (!task || task.plannedDate !== date || !plannedTime) return [];
      const dueToday = task.dueDate === date;
      return [{ type: 'task', task, kind: dueToday ? 'planned+due' : 'planned', time: plannedTime }];
    }).sort((a, b) => a.time.localeCompare(b.time) || String(a.task.id).localeCompare(String(b.task.id)));
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
    clone.recurrence=rule?{...rule,seriesId:`${task.id}_branch_${effectiveDate}_${makeUuid()}`}:null;
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
    const localHour = date.getHours(), localMinute = date.getMinutes(), localSecond = date.getSeconds(), localMs = date.getMilliseconds();
    // Reminder timestamps represent a local wall-clock appointment. Advance
    // calendar fields in local time so a DST offset change does not move the
    // appointment from (for example) 09:30 to 08:30.
    if (normalized.frequency === 'daily') date.setDate(date.getDate() + normalized.interval);
    else if (normalized.frequency === 'weekly') date.setDate(date.getDate() + normalized.interval * 7);
    else {
      const originalDay = date.getDate();
      const targetMonthIndex = date.getMonth() + normalized.interval;
      const targetYear = date.getFullYear() + Math.floor(targetMonthIndex / 12);
      const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
      const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
      date.setFullYear(targetYear, normalizedMonth, Math.min(originalDay, lastDay));
    }
    date.setHours(localHour, localMinute, localSecond, localMs);
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
    const reminder = reminderInstant(task.reminderAt);
    const now = new Date(nowIso).getTime();
    return reminder !== null && Number.isFinite(now) && reminder <= now;
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

  function habitTargetOrNull(habit, value) {
    const number = Number(value);
    const fractional = habit?.trackingType === 'numeric' && habit?.frequencyType !== 'timesPerWeek';
    return Number.isFinite(number) && number > 0 && (fractional || Number.isInteger(number)) ? number : null;
  }

  function normalizeV16Settings(settings) {
    const source = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
    const normalized = { ...source };
    normalized.todayFocusFilter = ['all', 'open', 'completed', 'important', 'dueToday'].includes(source.todayFocusFilter) ? source.todayFocusFilter : 'all';
    normalized.todayFocusStrip = source.todayFocusStrip !== false;
    normalized.compactDensity = source.compactDensity !== false;
    const visible = Array.isArray(source.todayVisibleSections) ? source.todayVisibleSections : ['focus', 'review', 'actions'];
    normalized.todayVisibleSections = ['focus', 'review', 'actions'].filter(section => visible.includes(section));
    if (!Object.prototype.hasOwnProperty.call(source, 'weekStartsOn')) normalized.weekStartsOn = 1;
    return normalized;
  }

  // Backup reminder (V1.9). A missing or invalid preference means the 7-day default; 0 turns it off.
  function backupReminderDays(settings) {
    const value = settings?.backupReminderDays;
    return Number.isInteger(value) && value >= 0 && value <= 90 ? value : 7;
  }

  // Weekly review (V1.11). settings.weeklyReviews holds one { weekStart, completedAt } per week, newest first.
  const WEEKLY_REVIEW_LOG_LIMIT = 26;

  function validWeeklyReviewEntry(entry) {
    return Boolean(entry && typeof entry === 'object' && typeof entry.weekStart === 'string'
      && parseDateOnly(entry.weekStart) && dateOnly(parseDateOnly(entry.weekStart)) === entry.weekStart && isIsoTimestamp(entry.completedAt));
  }

  function weeklyReviewLog(settings) {
    const seen = new Set();
    return (Array.isArray(settings?.weeklyReviews) ? settings.weeklyReviews : [])
      .filter(validWeeklyReviewEntry)
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart) || b.completedAt.localeCompare(a.completedAt))
      .filter(entry => !seen.has(entry.weekStart) && seen.add(entry.weekStart))
      .slice(0, WEEKLY_REVIEW_LOG_LIMIT)
      .map(entry => ({ weekStart: entry.weekStart, completedAt: entry.completedAt }));
  }

  function recordWeeklyReview(settings, { today = dateOnly(), now = new Date().toISOString(), weekStartsOn = 'monday' } = {}) {
    const weekStart = weekStartFor(today, weekStartsOn);
    return weeklyReviewLog({ weeklyReviews: [{ weekStart, completedAt: now }, ...weeklyReviewLog(settings).filter(entry => entry.weekStart !== weekStart)] });
  }

  // Due on the last three days of the week until this week has a record.
  function weeklyReviewDue(settings, today = dateOnly(), weekStartsOn = 'monday') {
    const weekStart = weekStartFor(today, weekStartsOn);
    if (!weekStart || today < addDays(weekStart, 4)) return false;
    return !weeklyReviewLog(settings).some(entry => entry.weekStart === weekStart);
  }

  function deriveWeeklyReview(state, today = dateOnly(), weekStartsOn = 'monday') {
    const source = state || {};
    const open = (source.tasks || []).filter(task => task && !task.isCompleted);
    const byDate = key => (a, b) => String(a[key]).localeCompare(String(b[key])) || String(a.title).localeCompare(String(b.title));
    const overdue = open.filter(task => isOverdue(task, today)).sort(byDate('dueDate'));
    const overdueIds = new Set(overdue.map(task => task.id));
    const nextDays = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(today, index + 1);
      return { date, planned: open.filter(task => task.plannedDate === date).length, due: open.filter(task => task.dueDate === date).length };
    });
    const now = parseDateOnly(today) || new Date();
    return {
      weekStart: weekStartFor(today, weekStartsOn),
      inbox: open.filter(isInboxActive),
      overdue,
      missedPlans: open.filter(task => !overdueIds.has(task.id) && task.plannedDate && task.plannedDate < today).sort(byDate('plannedDate')),
      nextDays,
      goals: (source.goals || []).filter(goal => goal && (!goal.status || goal.status === 'active')).map(goal => ({ goal, health: getGoalHealth(goal, now) })),
      habits: (source.habits || []).filter(habit => habit && habit.status === 'active'),
      areas: (source.areas || []).filter(Boolean).map(area => ({ area, open: areaSummary(area.id, source).openTasks })),
    };
  }

  function oldestCreatedAt(state) {
    let oldest = null;
    for (const key of ['tasks', 'goals', 'habits', 'notes', 'resources']) {
      for (const item of state?.[key] || []) {
        if (isIsoTimestamp(item?.createdAt) && (oldest === null || Date.parse(item.createdAt) < Date.parse(oldest))) oldest = item.createdAt;
      }
    }
    return oldest;
  }

  // Without any export the reminder counts from the oldest record, so an empty workspace never nags.
  function backupReminderDue({ lastExport = null, reminderDays = 7, snoozedUntil = null, oldestCreatedAt: oldest = null, now } = {}) {
    if (!Number.isInteger(reminderDays) || reminderDays <= 0) return false;
    const nowMs = Date.parse(now);
    if (!Number.isFinite(nowMs)) return false;
    const snoozeMs = Date.parse(snoozedUntil);
    if (Number.isFinite(snoozeMs) && nowMs < snoozeMs) return false;
    const exportedMs = Date.parse(lastExport);
    const referenceMs = Number.isFinite(exportedMs) ? exportedMs : Date.parse(oldest);
    return Number.isFinite(referenceMs) && nowMs - referenceMs >= reminderDays * 86400000;
  }

  function resetV16Settings(settings) {
    return { ...normalizeV16Settings(settings), todayFocusFilter: 'all', todayFocusStrip: true, compactDensity: true, todayVisibleSections: ['focus', 'review', 'actions'], weekStartsOn: 1 };
  }

  function migrateStateV16(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { state: input, changed: false, warnings: ['invalid-state'] };
    const state = JSON.parse(JSON.stringify(input));
    const before = state.settings && typeof state.settings === 'object' && !Array.isArray(state.settings) ? state.settings : {};
    state.settings = normalizeV16Settings(before);
    const changed = Object.keys(state.settings).some(key => !Object.prototype.hasOwnProperty.call(before, key));
    return { state, changed, warnings: [] };
  }

  function normalizeState(input) {
    const migration = migrateStateV3(input);
    if (!migration.ok) throw new Error(migration.reason || 'invalid-state');
    let state = migrateStateV16(migration.state).state;
    state = repairGoalLinks(state, { strict: false });
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
      const minimumTarget = habitTargetOrNull(habit, habit.minimumTarget);
      const idealTarget = habitTargetOrNull(habit, habit.idealTarget);
      return {
        ...habit,
        minimumTarget,
        idealTarget: idealTarget && minimumTarget ? Math.max(minimumTarget, idealTarget) : idealTarget,
        graceDays: Number.isInteger(Number(habit.graceDays)) && Number(habit.graceDays) >= 0 ? Number(habit.graceDays) : 0,
      };
    });
    state.templates = (state.templates || []).map(template => {
      const data = { ...(template.data || {}) };
      if (template.type === 'task') {
        const validDate = typeof data.scheduleDate === 'string' && parseDateOnly(data.scheduleDate) && dateOnly(parseDateOnly(data.scheduleDate)) === data.scheduleDate;
        data.scheduleEnabled = data.scheduleEnabled === true && Boolean(validDate);
        data.scheduleDate = validDate ? data.scheduleDate : null;
        data.scheduleGeneratedOn = validDate && typeof data.scheduleGeneratedOn === 'string' && parseDateOnly(data.scheduleGeneratedOn) && dateOnly(parseDateOnly(data.scheduleGeneratedOn)) === data.scheduleGeneratedOn ? data.scheduleGeneratedOn : null;
      }
      return { ...template, data };
    });
    state.notes = (state.notes || []).map(note => ({
      ...note, favorite: note.favorite === true, clip: typeof note.clip === 'string' ? note.clip : '',
    }));
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
    const fallback = habit?.frequencyType === 'timesPerWeek'
      ? positiveIntegerOrNull(habit?.timesPerWeek) || 1
      : safeNumber(habit?.targetValue) > 0 ? safeNumber(habit.targetValue) : 1;
    const minimumTarget = habitTargetOrNull(habit, habit?.minimumTarget) || fallback;
    const idealTarget = Math.max(minimumTarget, habitTargetOrNull(habit, habit?.idealTarget) || minimumTarget);
    const minimumMet = current >= minimumTarget;
    const idealMet = current >= idealTarget;
    return { current, minimumTarget, idealTarget, minimumMet, idealMet, status: idealMet ? 'ideal' : minimumMet ? 'minimum' : 'below-minimum' };
  }

  // Time-blocking (V1.12). Capacity is a device-wide preference in minutes; 0 turns it off, missing means 6 h.
  function dailyCapacityMinutes(settings) {
    const value = settings?.dailyCapacityMinutes;
    return Number.isInteger(value) && value >= 0 && value <= 1440 ? value : 360;
  }

  function dayLoad(tasks, date) {
    const open = (tasks || []).filter(task => task && !task.isCompleted && task.plannedDate === date);
    const durations = open.map(task => positiveIntegerOrNull(task.durationMinutes));
    return { minutes: durations.reduce((total, minutes) => total + (minutes || 0), 0), withDuration: durations.filter(Boolean).length, withoutDuration: durations.filter(minutes => !minutes).length };
  }

  // One day as a schedule: timed blocks (a missing duration is estimated), tasks without a time, and the hour range to draw.
  function daySchedule(tasks, date, { defaultMinutes = 30 } = {}) {
    const planned = (tasks || []).filter(task => task && task.plannedDate === date);
    const blocks = planned.flatMap(task => {
      const time = normalizeTime(task.plannedTime);
      if (!time) return [];
      const [hours, minutes] = time.split(':').map(Number);
      const duration = positiveIntegerOrNull(task.durationMinutes);
      const startMinutes = hours * 60 + minutes;
      const durationMinutes = duration || defaultMinutes;
      return [{ task, startMinutes, durationMinutes, endMinutes: startMinutes + durationMinutes, estimated: !duration }];
    }).sort((a, b) => a.startMinutes - b.startMinutes || String(a.task.id).localeCompare(String(b.task.id)));
    const overlaps = (block, other) => block.startMinutes < other.endMinutes && other.startMinutes < block.endMinutes;
    const withConflicts = blocks.map(block => ({ ...block, conflict: !block.task.isCompleted && blocks.some(other => other !== block && !other.task.isCompleted && overlaps(block, other)) }));
    const unscheduled = planned.filter(task => !task.isCompleted && !normalizeTime(task.plannedTime))
      .sort((a, b) => byOrder('todayOrder')(a, b) || String(a.title).localeCompare(String(b.title)));
    const earliest = blocks.length ? Math.floor(blocks[0].startMinutes / 60) : 6;
    return { blocks: withConflicts, unscheduled, range: { startHour: Math.min(6, earliest), endHour: 24 } };
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

  function goalProgressSummary(goal, state = {}, habitMetrics = {}) {
    const progress = computeGoalProgress(goal, state, habitMetrics);
    const tasks = goalTaskSet(goal, state);
    const habitLinks = (goal?.habitLinks || []).filter(link => link?.habitId);
    const linkedTasks = {
      total: tasks.length,
      completed: tasks.filter(task => task.isCompleted).length,
      open: tasks.filter(task => !task.isCompleted).length,
    };
    const linkedHabits = {
      total: habitLinks.length,
      complete: habitLinks.filter(link => {
        const target = safeNumber(link.target);
        return target > 0 && safeNumber(habitMetrics?.[link.habitId]?.[link.metric]) >= target;
      }).length,
      remaining: habitLinks.filter(link => {
        const target = safeNumber(link.target);
        return !(target > 0 && safeNumber(habitMetrics?.[link.habitId]?.[link.metric]) >= target);
      }).length,
    };
    return {
      ...progress,
      remaining: Math.max(0, progress.target - progress.current),
      linkedTasks,
      linkedHabits,
    };
  }

  function goalProgressHistory(goal, state = {}, range = {}) {
    const source = Array.isArray(state?.goalHistory) ? state.goalHistory : Array.isArray(goal?.history) ? goal.history : [];
    const start = typeof range === 'string' ? range : range?.start;
    const end = typeof range === 'string' ? undefined : range?.end;
    return [...source].filter(event => {
      const date = localDateOf(String(event?.createdAt || ''));
      return event?.goalId === goal?.id && ['progressChanged', 'manualProgress'].includes(event.type) && date
        && (!start || date >= start) && (!end || date <= end);
    }).sort((a, b) => {
      const left = Date.parse(a.createdAt), right = Date.parse(b.createdAt);
      return (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0) || String(a.id).localeCompare(String(b.id));
    }).map(event => ({
      id: event.id,
      date: localDateOf(String(event.createdAt)),
      percent: clampPercent(safeNumber(event.data?.to ?? event.data?.value ?? event.data?.percent)),
      type: event.type,
    }));
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

  // Settings stores 'monday'/'sunday'; older data and defaults use 0 (Sunday) or 1 (Monday).
  function weekStartKey(value) {
    return value === 'sunday' || value === 0 ? 'sunday' : 'monday';
  }

  function weekStartFor(date, weekStartsOn = 'monday') {
    const parsed = parseDateOnly(date);
    if (!parsed) return null;
    const firstDay = weekStartKey(weekStartsOn) === 'sunday' ? 0 : 1;
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

  function habitCompletionForDates(habit, logs, dates, today = dateOnly(), weekStartsOn = 'monday') {
    const recordedDates = new Set((logs || []).filter(log => log && log.date <= today && (!habit?.id || log.habitId === habit.id)).map(log => log.date));
    const eligible = [...new Set((dates || []).filter(date => typeof date === 'string' && date && date <= today && (habitScheduledOn(habit, date, { historical: true }) || recordedDates.has(date))))];
    if (!eligible.length) return 0;
    const statusFor = date => habitStatusForDate(habit, logs || [], date, today);
    if (habit?.frequencyType === 'timesPerWeek') {
      const target = Math.max(1, Math.floor(Number(habit.timesPerWeek) || 1));
      const periods = new Map();
      for (const date of eligible) {
        const key = habitPeriodKey(habit, date, weekStartsOn);
        if (!periods.has(key)) periods.set(key, []);
        periods.get(key).push(date);
      }
      let score = 0;
      for (const periodDates of periods.values()) {
        const completed = periodDates.reduce((count, date) => {
          const status = statusFor(date);
          return count + (status.status === 'done' ? 1 : 0);
        }, 0);
        score += Math.min(target, completed) / target;
      }
      return Math.round((score / periods.size) * 100);
    }
    const score = eligible.reduce((sum, date) => {
      const status = statusFor(date);
      return sum + Math.max(0, Math.min(1, Number(status.percent || (status.status === 'done' ? 100 : 0)) / 100));
    }, 0);
    return Math.round((score / eligible.length) * 100);
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

  function habitAnalytics(habit, logs, options = {}) {
    const today = options.today || dateOnly();
    const weekStartsOn = options.weekStartsOn || 'monday';
    const suppliedDates = [...new Set((options.dates || []).filter(date => typeof date === 'string' && date <= today))].sort();
    const dates = suppliedDates.length ? suppliedDates : habitScheduleDates(habit, today, weekStartsOn, logs).flatMap(period => period.dates);
    const relevantLogs = (logs || []).filter(log => log && log.date <= today && (!habit?.id || log.habitId === habit.id));
    const recordedDates = new Set(relevantLogs.map(log => log.date));
    const eligible = dates.filter(date => habitScheduledOn(habit, date, { historical: true }) || recordedDates.has(date));
    const metrics = deriveHabitMetrics(habit, relevantLogs, today, weekStartsOn);
    const statusFor = date => habitStatusForDate(habit, logs || [], date, today);
    const visiblePeriodKeys = new Set(eligible.map(date => habitPeriodKey({ ...habit, frequencyType: 'timesPerWeek' }, date, weekStartsOn)));
    const target = Math.max(1, Math.floor(Number(habit?.timesPerWeek) || 1));
    const visibleWeeklyPeriods = habitScheduleDates(habit, today, weekStartsOn, relevantLogs)
      .filter(period => visiblePeriodKeys.has(period.key));
    const weeklySeries = visibleWeeklyPeriods
      .map(({ key, dates: periodDates }) => {
        const completed = periodDates.filter(date => statusFor(date).status === 'done').length;
        return { key, percent: Math.round(Math.min(target, completed) / target * 100), completed, target };
      });
    const monthlySeries = eligible.map(date => {
      const state = statusFor(date);
      return { date, percent: Math.round(Number(state.percent || (state.status === 'done' ? 100 : 0))), status: state.status };
    });
    return {
      completionPercent: habitCompletionForDates(habit, logs, habit?.frequencyType === 'timesPerWeek' ? visibleWeeklyPeriods.flatMap(period => period.dates) : eligible, today, weekStartsOn),
      checkedToday: statusFor(today).status === 'done',
      currentStreak: metrics.currentStreak,
      bestStreak: metrics.longestStreak,
      weeklySeries,
      monthlySeries,
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

  // Reminder moments (audit R-2). `reminderAt` is stored either as a floating local time ("2026-10-09T09:00:00",
  // from pickers and templates) or as a UTC timestamp; both name one instant. A date alone is not a moment.
  function reminderInstant(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
  }

  // One key per reminder moment, shared by the notification plan and the in-app checker.
  const notificationKey = (kind, id, moment) => `${kind}:${id}:${moment}`;

  // Native reminders (audit R-1, M6): the next reminder moments, scheduled as phone notifications so they arrive
  // while Dailo is closed. It follows the in-app checker: open tasks' reminderAt; active goals' unfired moments;
  // habit reminder times on scheduled days, where a snooze silences the moments before it and is a notification
  // of its own, and a met weekly target silences the rest of the current week. Only future moments inside the
  // window are listed, at most `limit` (iOS keeps 64 pending notifications per app).
  function notificationPlan(state, now, { days = 14, limit = 60, logs = {} } = {}) {
    const start = new Date(now).getTime();
    if (!state || !Number.isFinite(start)) return [];
    const end = start + days * 86400000;
    const list = [];
    const add = (kind, item, moment, title, date = null) => {
      const time = reminderInstant(moment.startsWith('snooze:') ? moment.slice(7) : moment);
      if (time === null || time <= start || time > end) return;
      list.push({ key: notificationKey(kind, item.id, moment), kind, id: item.id, at: new Date(time).toISOString(), title, route: `${kind}/${encodeURIComponent(item.id)}`, date });
    };
    for (const task of state.tasks || []) {
      if (!task.isCompleted && task.reminderAt && !task.reminderFiredAt) add('task', task, task.reminderAt, task.title, task.dueDate || null);
    }
    for (const goal of state.goals || []) {
      if (goal.status !== 'active') continue;
      const fired = new Set(Array.isArray(goal.reminderFiredMoments) ? goal.reminderFiredMoments : []);
      for (const moment of goalReminderMoments(goal)) if (!fired.has(moment)) add('goal', goal, moment, goal.title, goal.targetDate);
    }
    const weekStartsOn = weekStartKey(state.settings?.weekStartsOn);
    const today = dateOnly(new Date(start));
    for (const habit of state.habits || []) {
      if (habit.status !== 'active') continue;
      let quietWeek = null;
      if (habit.frequencyType === 'timesPerWeek') {
        const metrics = deriveHabitMetrics(habit, logs[habit.id] || [], today, weekStartsOn);
        if (metrics.currentPeriodCount >= metrics.currentPeriodTarget) quietWeek = weekStartFor(today, weekStartsOn);
      }
      const silent = date => !habitScheduledOn(habit, date) || (quietWeek && weekStartFor(date, weekStartsOn) === quietWeek);
      const snoozeEnd = reminderInstant(habit.snoozedUntil);
      if (habit.pendingSnoozeAt && reminderInstant(habit.pendingSnoozeAt) !== null && !silent(dateOnly(new Date(habit.pendingSnoozeAt)))) add('habit', habit, `snooze:${habit.pendingSnoozeAt}`, habit.name);
      const times = (habit.reminders || []).filter(reminder => reminder?.enabled && normalizeTime(reminder.time)).map(reminder => reminder.time);
      if (!times.length) continue;
      const fired = new Set(habit.reminderFiredMoments || []);
      for (let offset = 0; offset <= days; offset += 1) {
        const date = addDays(today, offset);
        if (silent(date)) continue;
        for (const time of times) {
          const moment = combineDateTime(date, time);
          if (moment && !fired.has(moment) && !(snoozeEnd !== null && reminderInstant(moment) < snoozeEnd)) add('habit', habit, moment, habit.name);
        }
      }
    }
    return list.sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key)).slice(0, limit);
  }

  // Snooze choices (audit H-2): "tonight" is 19:00, or 21:00 once it is 19:00; later than that there is no tonight
  // left. "Later today" is two hours ahead while that is still today. Null means the choice is not offered.
  function snoozeTarget(kind, now = new Date()) {
    const next = new Date(now);
    if (Number.isNaN(next.getTime())) return null;
    if (kind === '15m') return new Date(next.getTime() + 15 * 60000).toISOString();
    if (kind === '1h') return new Date(next.getTime() + 3600000).toISOString();
    if (kind !== 'tonight' || next.getHours() >= 21) return null;
    next.setHours(next.getHours() >= 19 ? 21 : 19, 0, 0, 0);
    return next.toISOString();
  }
  function laterToday(now = new Date()) {
    const start = new Date(now);
    if (Number.isNaN(start.getTime())) return null;
    const later = new Date(start.getTime() + 2 * 3600000);
    return dateOnly(later) === dateOnly(start) ? later.toISOString() : null;
  }

  function tasksForTag(tasks, tagId) {
    return (tasks || []).filter(task => !task.isCompleted && Array.isArray(task.tagIds) && task.tagIds.includes(tagId));
  }

  // Quick Add (V1.10). Trailing clauses are read right to left; English and Serbian words work,
  // Serbian with or without diacritics. See docs/superpowers/specs/2026-10-08-todo-v1-10-design.md.
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const QUICK_DAY_OFFSETS = { today: 0, tomorrow: 1, danas: 0, sutra: 1, prekosutra: 2 };
  const QUICK_WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const QUICK_WEEKDAYS_SR = { nedelja: 0, nedelju: 0, ponedeljak: 1, utorak: 2, sreda: 3, sredu: 3, četvrtak: 4, cetvrtak: 4, petak: 5, subota: 6, subotu: 6 };
  // "do petka" = by Friday: weekdays in the genitive case.
  const QUICK_WEEKDAYS_SR_GENITIVE = { nedelje: 0, ponedeljka: 1, utorka: 2, srede: 3, četvrtka: 4, cetvrtka: 4, petka: 5, subote: 6 };
  const QUICK_PRIORITIES = { high: 'high', medium: 'medium', low: 'low', visok: 'high', srednji: 'medium', nizak: 'low' };
  const QUICK_DAY_UNITS = { dan: 1, dana: 1, day: 1, days: 1, nedelju: 7, nedelje: 7, nedelja: 7, week: 7, weeks: 7 };
  const QUICK_HOUR_WORDS = new Set(['h', 'sat', 'sata', 'sati']);
  const QUICK_MINUTE_WORDS = new Set(['min', 'minut', 'minuta']);
  const INVALID = 'invalid';

  // Matches names case-insensitively, ignoring spaces, "_", "-" and diacritics ("đ" as "dj").
  function looseName(value) {
    return String(value || '').toLocaleLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_-]+/g, '');
  }

  function nextWeekday(today, weekday) {
    const base = parseDateOnly(today);
    if (!base) return INVALID;
    const delta = (weekday - base.getDay() + 7) % 7 || 7;
    return addDays(today, delta);
  }

  // A day word or calendar date: a YYYY-MM-DD string, INVALID for a malformed date, or null when the word is not a day.
  function quickDay(word, today, weekdays) {
    const token = word.toLocaleLowerCase();
    if (own(QUICK_DAY_OFFSETS, token)) return QUICK_DAY_OFFSETS[token] ? addDays(today, QUICK_DAY_OFFSETS[token]) : today;
    if (own(weekdays, token)) return nextWeekday(today, weekdays[token]);
    const local = token.match(/^(\d{1,2})\.(\d{1,2})\.(?:(\d{4})\.?)?$/);
    const iso = token.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!local && !iso) return null;
    const year = iso ? iso[1] : local[3] || today.slice(0, 4);
    const value = iso ? token : `${year}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
    const parsed = parseDateOnly(value);
    if (!parsed || dateOnly(parsed) !== value) return INVALID;
    if (local && !local[3] && value < today) return quickDay(`${local[1]}.${local[2]}.${Number(year) + 1}.`, today, weekdays);
    return value;
  }

  function quickMinutes(value) {
    const minutes = Math.round(value);
    return minutes >= 1 && minutes <= 1440 ? minutes : INVALID;
  }

  // Duration in the last one or two words: 45min, 45 min, 45m, 1h, 1,5h, 1h30, 1h30m, 1h 30min, 2 sata.
  function quickDuration(words) {
    const last = words[words.length - 1].toLocaleLowerCase();
    const before = words.length > 1 ? words[words.length - 2].toLocaleLowerCase() : '';
    const hours = text => Number(text.replace(',', '.'));
    const splitHours = before.match(/^(\d+)h$/);
    const splitMinutes = last.match(/^(\d+)(?:m|min)$/);
    if (splitHours && splitMinutes) return { consumed: 2, value: quickMinutes(Number(splitHours[1]) * 60 + Number(splitMinutes[1])) };
    let match;
    if (/^\d+(?:[.,]\d+)?$/.test(before) && QUICK_HOUR_WORDS.has(last)) return { consumed: 2, value: quickMinutes(hours(before) * 60) };
    if (/^\d+$/.test(before) && QUICK_MINUTE_WORDS.has(last)) return { consumed: 2, value: quickMinutes(Number(before)) };
    if ((match = last.match(/^(\d+)(?:min|m)$/))) return { consumed: 1, value: quickMinutes(Number(match[1])) };
    if ((match = last.match(/^(\d+(?:[.,]\d+)?)h$/))) return { consumed: 1, value: quickMinutes(hours(match[1]) * 60) };
    if ((match = last.match(/^(\d+)h(\d+)(?:m|min)?$/))) return { consumed: 1, value: quickMinutes(Number(match[1]) * 60 + Number(match[2])) };
    return null;
  }

  // The trailing clause at the end of `words`: { slot, value, consumed }, { stop: true } or INVALID.
  function quickClause(words, today, parsePlan) {
    const n = words.length;
    const lower = words.map(word => word.toLocaleLowerCase());
    const last = lower[n - 1];
    const before = n > 1 ? lower[n - 2] : '';
    if (before === 'rok' || before === 'due') {
      const day = quickDay(last, today, { ...QUICK_WEEKDAYS, ...QUICK_WEEKDAYS_SR });
      if (day) return day === INVALID ? INVALID : { slot: 'dueDate', value: day, consumed: 2 };
    }
    if (before === 'do') {
      const day = quickDay(last, today, QUICK_WEEKDAYS_SR_GENITIVE);
      if (day) return day === INVALID ? INVALID : { slot: 'dueDate', value: day, consumed: 2 };
    }
    if (n >= 3 && (lower[n - 3] === 'za' || lower[n - 3] === 'in') && /^\d+$/.test(before) && own(QUICK_DAY_UNITS, last)) {
      if (!parsePlan) return { stop: true };
      const days = Number(before) * QUICK_DAY_UNITS[last];
      return days >= 1 && days <= 366 ? { slot: 'plannedDate', value: addDays(today, days), consumed: 3 } : INVALID;
    }
    const time = last.match(/^(\d{1,2}):(\d{2})$/);
    if (time) {
      if (before === 'do') return { stop: true };
      const value = normalizeTime(`${time[1].padStart(2, '0')}:${time[2]}`);
      if (!value) return INVALID;
      return { slot: 'plannedTime', value, consumed: before === 'u' || before === 'at' ? 2 : 1 };
    }
    const duration = quickDuration(words);
    if (duration) return duration.value === INVALID ? INVALID : { slot: 'durationMinutes', value: duration.value, consumed: duration.consumed };
    const serbianWeekday = own(QUICK_WEEKDAYS_SR, last);
    const day = quickDay(last, today, serbianWeekday ? QUICK_WEEKDAYS_SR : QUICK_WEEKDAYS);
    if (!day) return { stop: true };
    if (!parsePlan || (serbianWeekday && before === 'za')) return { stop: true };
    if (day === INVALID) return INVALID;
    return { slot: 'plannedDate', value: day, consumed: serbianWeekday && before === 'u' ? 2 : 1 };
  }

  // Parses a Quick Add title into task fields. Pure: `tags`, `projects` and `areas` are the existing records to match.
  function parseQuickAdd(rawTitle, { today = dateOnly(), tags = [], projects = [], areas = [], parsePlan = true, tokens = true, slots = null } = {}) {
    const original = String(rawTitle || '');
    const result = { title: original, plannedDate: null, plannedTime: null, dueDate: null, durationMinutes: null, priority: null, tagIds: [], projectId: null, areaId: null };
    let text = original;
    if (tokens) {
      const findLoose = (records, name) => (records || []).find(record => record && !record.isArchived && looseName(record.name) === looseName(name));
      text = original.replace(/(^|\s)(#[^\s#]+|![^\s!]+|[+@][^\s+@#!]+)(?=\s|$)/g, (match, prefix, token) => {
        const sigil = token[0];
        const name = token.slice(1);
        if (sigil === '#') {
          const tag = (tags || []).find(item => item && normalizeTagName(item.name).toLocaleLowerCase() === name.toLocaleLowerCase());
          if (!tag) return match;
          if (!result.tagIds.includes(tag.id)) result.tagIds.push(tag.id);
        } else if (sigil === '!') {
          const priority = QUICK_PRIORITIES[name.toLocaleLowerCase()];
          if (!priority || result.priority) return match;
          result.priority = priority;
        } else {
          const key = sigil === '+' ? 'projectId' : 'areaId';
          const record = findLoose(sigil === '+' ? projects : areas, name);
          if (!record || result[key]) return match;
          result[key] = record.id;
        }
        return prefix;
      });
      if (result.projectId) result.areaId = null;
    }
    const tokenFree = text.replace(/\s{2,}/g, ' ').trim();
    const words = tokenFree ? tokenFree.split(' ') : [];
    const found = {};
    while (words.length) {
      const clause = quickClause(words, today, parsePlan);
      if (clause === INVALID) return { ...result, title: tokens ? tokenFree : original };
      if (clause.stop || own(found, clause.slot) || (slots && !slots.includes(clause.slot)) || clause.consumed >= words.length) break;
      found[clause.slot] = clause.value;
      words.splice(words.length - clause.consumed, clause.consumed);
    }
    if (!Object.keys(found).length) return { ...result, title: tokens ? tokenFree : original };
    return { ...result, ...found, title: words.join(' ') };
  }

  // V1.5 API kept for its tests: only the trailing plan date and time.
  function parseQuickPlanPhrase(rawTitle, today) {
    const parsed = parseQuickAdd(rawTitle, { today, tokens: false, slots: ['plannedDate', 'plannedTime'] });
    const result = { title: parsed.title, plannedDate: parsed.plannedDate };
    if (parsed.plannedTime) result.plannedTime = parsed.plannedTime;
    return result;
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

  function isIsoTimestamp(value) {
    if (typeof value !== 'string') return false;
    const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?(Z|[+-](\d{2}):?(\d{2}))$/);
    if (!parts) return false;
    const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
    const hour = Number(parts[4]), minute = Number(parts[5]), second = Number(parts[6]);
    if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return false;
    if (hour > 23 || minute > 59 || second > 59) return false;
    if (parts[7] !== 'Z' && (Number(parts[8]) > 23 || Number(parts[9]) > 59)) return false;
    return Number.isFinite(Date.parse(value));
  }

  function validEntityTimestamps(item) {
    return ['createdAt', 'updatedAt'].every(field => !Object.hasOwn(item || {}, field)
      || typeof item[field] === 'string' && item[field] !== '' && isIsoTimestamp(item[field]));
  }

  function combineDateTime(date, time) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !normalizeTime(time)) return null;
    const parsed = parseDateOnly(date);
    if (!parsed || dateOnly(parsed) !== date) return null;
    return `${date}T${time}:00`;
  }

  function normalizeKnowledgeUrl(value) {
    const source = typeof value === 'string' ? value.trim() : '';
    if (!source) return null;
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(source) ? source : `https://${source}`;
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return null;
      return (url.protocol !== 'mailto:' && url.pathname === '/' && !url.search && !url.hash) ? url.href.slice(0, -1) : url.href;
    } catch (_) {
      return null;
    }
  }

  function validateKnowledgeRecord(record) {
    const source = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
    const type = source.type;
    const errors = [];
    if (!['note', 'resource'].includes(type)) errors.push('type');
    const title = typeof source.title === 'string' ? source.title.trim() : '';
    if (!title) errors.push('title');
    const suppliedUrls = Array.isArray(source.linkUrls) ? source.linkUrls : [];
    const linkUrls = [...new Set(suppliedUrls.map(normalizeKnowledgeUrl).filter(Boolean))];
    if (!Array.isArray(source.linkUrls) || suppliedUrls.some(url => typeof url !== 'string' || url.trim() && !normalizeKnowledgeUrl(url))) errors.push('linkUrls');
    const suppliedAttachments = Array.isArray(source.attachmentIds) ? source.attachmentIds : [];
    const attachmentIds = [...new Set(suppliedAttachments.filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))];
    if (!Array.isArray(source.attachmentIds) || suppliedAttachments.some(id => typeof id !== 'string' || !id.trim())) errors.push('attachmentIds');
    if (!linkUrls.length && !attachmentIds.length) errors.push('source');
    return { valid: !errors.length, errors, normalized: { ...source, type, title, linkUrls, attachmentIds } };
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

  // Sync (audit Y-2): another device may delete a project, area, goal, task or habit that local records still
  // point to. Those references are dropped (a task leaves the deleted project, a link disappears) instead of
  // rejecting the whole state, which would stop sync for good. Returns a copy; valid links stay as they are.
  function pruneDanglingReferences(input) {
    if (!input || typeof input !== 'object') return input;
    const state = JSON.parse(JSON.stringify(input));
    const ids = key => new Set((Array.isArray(state[key]) ? state[key] : []).filter(item => item && item.id).map(item => item.id));
    const projects = ids('projects'), areas = ids('areas'), goals = ids('goals'), tasks = ids('tasks'), habits = ids('habits');
    const keep = (list, valid) => Array.isArray(list) ? list.filter(id => valid.has(id)) : list;
    const area = item => { if (item && item.areaId && !areas.has(item.areaId)) item.areaId = null; };
    for (const task of state.tasks || []) {
      if (!task) continue;
      if (task.projectId && !projects.has(task.projectId)) task.projectId = null;
      area(task);
      task.goalIds = keep(task.goalIds, goals);
    }
    for (const project of state.projects || []) { if (!project) continue; area(project); project.goalIds = keep(project.goalIds, goals); }
    for (const key of ['notes', 'resources', 'goals', 'habits']) for (const item of state[key] || []) area(item);
    for (const resource of state.resources || []) {
      if (!resource) continue;
      resource.relatedTaskIds = keep(resource.relatedTaskIds, tasks);
      resource.relatedProjectIds = keep(resource.relatedProjectIds, projects);
      resource.relatedGoalIds = keep(resource.relatedGoalIds, goals);
      resource.relatedHabitIds = keep(resource.relatedHabitIds, habits);
    }
    return state;
  }

  // Attachments open inside the app only when the type cannot run script in the app's origin (audit S-1):
  // raster images, PDF and plain text. Everything else (HTML, SVG, XML, scripts, unknown) is downloaded.
  function attachmentOpensInline(mimeType) {
    const type = String(mimeType || '').split(';')[0].trim().toLowerCase();
    return /^image\/(png|jpe?g|gif|webp|heic|heif|avif|bmp)$/.test(type) || type === 'application/pdf' || type === 'text/plain';
  }

  function isNullableEntityId(value) {
    return value === null || typeof value === 'string' && value.trim();
  }

  function entityIdArrayIsValid(value) {
    return Array.isArray(value) && value.every(id => typeof id === 'string' && id.trim());
  }

  function validateGoalLinks(state) {
    const goals = new Map((state.goals || []).map(goal => [goal.id, goal]));
    const check = (owner, goalId, field, predicate) => {
      const goal = goals.get(goalId);
      return goal && predicate(goal) ? null : `invalid-goal-link-${field}`;
    };
    for (const collection of ['tasks', 'projects', 'habits']) for (const owner of state[collection] || []) {
      for (const goalId of owner.goalIds || []) {
        const field = collection === 'tasks' ? 'taskIds' : collection === 'projects' ? 'projectLinks' : 'habitLinks';
        const reason = check(owner, goalId, field, goal => collection === 'tasks'
          ? (goal.taskIds || []).includes(owner.id)
          : collection === 'projects'
            ? (goal.projectLinks || []).some(link => link?.projectId === owner.id)
            : (goal.habitLinks || []).some(link => link?.habitId === owner.id));
        if (reason) return reason;
      }
    }
    for (const goal of state.goals || []) {
      for (const taskId of goal.taskIds || []) {
        const task = (state.tasks || []).find(item => item.id === taskId);
        if (!task || !(task.goalIds || []).includes(goal.id)) return 'invalid-goal-link-taskIds';
      }
      for (const link of goal.projectLinks || []) {
        const project = (state.projects || []).find(item => item.id === link?.projectId);
        if (!project || !(project.goalIds || []).includes(goal.id)) return 'invalid-goal-link-projectLinks';
      }
      for (const link of goal.habitLinks || []) {
        const habit = (state.habits || []).find(item => item.id === link?.habitId);
        if (!habit || !(habit.goalIds || []).includes(goal.id)) return 'invalid-goal-link-habitLinks';
      }
    }
    return null;
  }

  function duplicateEntityId(state) {
    const seen = new Set();
    for (const key of ['tasks', 'projects', 'tags', 'areas', 'goals', 'habits', 'notes', 'resources', 'templates', 'savedViews']) {
      for (const item of state[key] || []) {
        if (seen.has(item.id)) return item.id;
        seen.add(item.id);
      }
    }
    return null;
  }

  function repairGoalLinks(input, options = {}) {
    const strict = options.strict !== false;
    const state = JSON.parse(JSON.stringify(input));
    const warnings = [];
    const goals = new Map((state.goals || []).map(goal => [goal.id, goal]));
    for (const task of state.tasks || []) for (const goalId of task.goalIds || []) {
      const goal = goals.get(goalId);
      if (goal && !(goal.taskIds || []).includes(task.id)) { goal.taskIds = [...(goal.taskIds || []), task.id]; warnings.push(`goal:${goal.id}:task:${task.id}`); }
    }
    for (const goal of state.goals || []) {
      for (const taskId of goal.taskIds || []) { const item = (state.tasks || []).find(value => value.id === taskId); if (item && !(item.goalIds || []).includes(goal.id)) { item.goalIds = [...(item.goalIds || []), goal.id]; warnings.push(`goal:${goal.id}:task:${item.id}`); } }
      for (const link of goal.projectLinks || []) { const item = (state.projects || []).find(value => value.id === link?.projectId); if (item && !(item.goalIds || []).includes(goal.id)) { item.goalIds = [...(item.goalIds || []), goal.id]; warnings.push(`goal:${goal.id}:project:${item.id}`); } }
      for (const link of goal.habitLinks || []) { const item = (state.habits || []).find(value => value.id === link?.habitId); if (item && !(item.goalIds || []).includes(goal.id)) { item.goalIds = [...(item.goalIds || []), goal.id]; warnings.push(`goal:${goal.id}:habit:${item.id}`); } }
    }
    const error = validateGoalLinks(state);
    if (error && strict) throw new Error(`${msg('Goal-link repair required')}: ${error}`);
    return options.report ? { state, warnings } : state;
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
    if (duplicateEntityId(state)) return { ok: false, reason: 'duplicate-id' };
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
        if (item.createdAt !== '' && !isIsoTimestamp(item.createdAt)
          || item.updatedAt !== '' && !isIsoTimestamp(item.updatedAt)) return { ok: false, reason: `invalid-${key}-timestamp` };
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
    if (!migrated) for (const key of ['tasks', 'goals', 'habits']) {
      if (state[key].some(item => !validEntityTimestamps(item))) return { ok: false, reason: `invalid-${key.slice(0, -1)}-timestamp` };
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
    localDateOf,
    addDays,
    pruneDanglingReferences,
    attachmentOpensInline,
    templateFromEntity,
    resolveTemplateVariables,
    instantiateTemplate,
    instantiateScheduledTaskTemplates,
    isOverdue,
    isInboxActive,
    deriveTodaySections,
    deriveTodayV3,
    filterTodayTasks,
    deriveAnytime,
    deriveUpcoming,
    deriveUpcomingV3,
    deriveCalendarDay,
    deriveCalendarWeek,
    deriveCalendarMonthSummary,
    calendarTimeBlocks,
    nextRecurrenceDate,
    normalizeRecurrenceV3,
    shouldGenerateRecurrence,
    splitRecurrenceForFuture,
    makeUuid,
    weekStartKey,
    buildNextRecurringTask,
    isReminderDue,
    reminderInstant,
    notificationKey,
    notificationPlan,
    snoozeTarget,
    laterToday,
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
    validateKnowledgeRecord,
    isIsoTimestamp,
    validEntityTimestamps,
    validateGoalLinks,
    repairGoalLinks,
    normalizeTagName,
    validateTagName,
    validateAreaName,
    areaSummary,
    normalizeState,
    normalizeV16Settings,
    resetV16Settings,
    backupReminderDays,
    weeklyReviewLog,
    dailyCapacityMinutes,
    dayLoad,
    daySchedule,
    recordWeeklyReview,
    weeklyReviewDue,
    deriveWeeklyReview,
    backupReminderDue,
    oldestCreatedAt,
    migrateStateV16,
    selectFocusTasks,
    getGoalHealth,
    getHabitTargetStatus,
    getTimedTaskBlocks,
    computeGoalProgress,
    goalProgressSummary,
    goalProgressHistory,
    isGoalOverdue,
    goalReminderMoments,
    goalReminderDueMoments,
    overdueMilestones,
    habitScheduledOn,
    habitPeriodKey,
    numericHabitState,
    habitStatusForDate,
    habitCompletionForDates,
    deriveHabitMetrics,
    habitAnalytics,
    habitReminderActive,
    tasksForTag,
    parseQuickPlanPhrase,
    parseQuickAdd,
    cloneTaskForDuplicate,
  };
});
