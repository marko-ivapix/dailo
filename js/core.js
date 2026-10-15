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
      data.recurrence = rule ? {frequency:rule.frequency,interval:rule.interval,...Object.fromEntries(RECURRENCE_EXTRA_KEYS.filter(key => rule[key] !== undefined).map(key => [key, templateCopy(rule[key])])),endType:rule.endType,endAfterOccurrences:rule.endAfterOccurrences,endOffsetDays:templateOffset(rule.endDate,contextDate)} : null;
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
      const project = {...common,id:ids.projectId || makeId('project'),name:d.name || '',color:safeColor(d.color, '#5362FF'),areaId:live('areas',d.areaId),goalIds:links('goals',d.goalIds),isArchived:false,archivedAt:null,order:null};
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

  // R28: what the Android "Danas" widget shows — late tasks first, then today's plan in its order, at most `limit`.
  function widgetSnapshot(state, today, limit = 5) {
    const sections = deriveTodaySections(state?.tasks || [], today);
    const rows = [...sections.overdue.map(task => ({ task, overdue: true })), ...sections.today.map(task => ({ task, overdue: false }))];
    return {
      date: today, overdue: sections.overdue.length, planned: sections.today.length,
      items: rows.slice(0, limit).map(({ task, overdue }) => ({ title: String(task.title || ''), time: task.plannedTime || null, overdue })),
      more: Math.max(0, rows.length - limit),
    };
  }

  // R45: the Android "Navike" widget — today's planned habits (as Navike counts them), open ones first in routine
  // order, then the done ones; numeric habits carry their value and target.
  function habitsWidgetSnapshot(habits, logsByHabit, today, weekRule = 'monday', limit = 5) {
    const routines = ['morning', 'daily', 'night'];
    const rank = habit => (routines.includes(habit.routine) ? routines.indexOf(habit.routine) : 1);
    const rows = (habits || []).filter(habit => habit?.status === 'active')
      .map((habit, index) => ({ habit, index, day: habitDayState(habit, logsByHabit?.[habit.id] || [], today, today, weekRule) }))
      .filter(({ day }) => day.planned)
      .sort((a, b) => Number(a.day.state === 'done') - Number(b.day.state === 'done') || rank(a.habit) - rank(b.habit) || a.index - b.index);
    const numeric = habit => habit.trackingType === 'numeric';
    return {
      date: today, done: rows.filter(({ day }) => day.state === 'done').length, planned: rows.length,
      items: rows.slice(0, limit).map(({ habit, day }) => ({ id: String(habit.id), name: String(habit.name || ''), done: day.state === 'done', missed: Boolean(day.marked), numeric: numeric(habit),
        value: numeric(habit) ? Number(day.value || 0) : null, target: numeric(habit) ? Number(habit.targetValue || 0) : null, unit: numeric(habit) ? String(habit.unit || '') : '' })),
      more: Math.max(0, rows.length - limit),
    };
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
      // Redesign R2 (T2a): open milestones of active goals due today join "Planirano danas".
      milestones: activeGoals.flatMap(goal => (goal.milestones || [])
        .filter(milestone => milestone.date === today && !milestone.isCompleted)
        .map(milestone => ({ goal, milestone }))),
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

  // R67: a task's rough month ("okvirno"), "YYYY-MM". It never puts the task on Today; Upcoming lists it under the month.
  function normalizePlannedMonth(value) {
    return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
  }
  const monthKey = date => String(date || '').slice(0, 7);
  function addMonths(month, amount) {
    const [year, number] = month.split('-').map(Number);
    const index = year * 12 + number - 1 + amount;
    return `${Math.floor(index / 12)}-${pad(index % 12 + 1)}`;
  }
  // The next time calendar month `number` (1–12) comes round; the current month counts.
  function upcomingMonth(number, today = dateOnly()) {
    const current = monthKey(today);
    const candidate = `${current.slice(0, 4)}-${pad(number)}`;
    return candidate < current ? addMonths(candidate, 12) : candidate;
  }
  // Open tasks with a rough month and no planned day, by month; a month already past waits in the current one.
  // A task due after today up to `dueShownUntil` is left out: Upcoming already lists it on its due day.
  function deriveRoughMonths(tasks, today = dateOnly(), dueShownUntil = null) {
    const current = monthKey(today);
    const groups = new Map();
    for (const task of tasks || []) {
      const month = normalizePlannedMonth(task?.plannedMonth);
      if (!month || task.isCompleted || task.plannedDate) continue;
      if (dueShownUntil && task.dueDate && task.dueDate > today && task.dueDate <= dueShownUntil) continue;
      const key = month < current ? current : month;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(task);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, items]) => ({
      month, items: items.sort((a, b) => a.plannedMonth.localeCompare(b.plannedMonth) || String(a.title).localeCompare(String(b.title))),
    }));
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

  // Redesign R7 (C2, C4, C9): what a calendar day lists. Open tasks sit on their plan day, or on their due day when
  // they have none; timed ones by time, the rest by title. Goal targets and open milestones of active goals come
  // as deadlines. Habits stay on the Habits screen. The caller passes the listed tasks (no archived projects).
  function calendarDayItems(state, date) {
    const byTitle = (a, b) => String(a.title).localeCompare(String(b.title));
    const tasks = (state?.tasks || []).filter(task => task && !task.isCompleted && (task.plannedDate ? task.plannedDate === date : task.dueDate === date));
    const timed = tasks.filter(task => task.plannedDate === date && normalizeTime(task.plannedTime))
      .sort((a, b) => a.plannedTime.localeCompare(b.plannedTime) || byTitle(a, b));
    const untimed = tasks.filter(task => !timed.includes(task)).sort(byTitle);
    const goals = (state?.goals || []).filter(goal => goal?.status === 'active');
    const deadlines = [
      ...goals.filter(goal => goal.targetDate === date).map(goal => ({ goal })),
      ...goals.flatMap(goal => (goal.milestones || []).filter(milestone => milestone?.date === date && !milestone.isCompleted).map(milestone => ({ goal, milestone }))),
    ];
    return { date, timed, untimed, deadlines, count: timed.length + untimed.length + deadlines.length };
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

  // R11a: weekly on chosen weekdays, monthly by day or nth weekday, and yearly. A field that does
  // not fit its frequency is dropped, so the rule falls back to the plain interval.
  const RECURRENCE_EXTRA_KEYS = ['weekdays', 'monthMode', 'monthDay', 'weekOfMonth', 'weekday'];
  const isWeekday = value => Number.isInteger(value) && value >= 0 && value <= 6;
  function recurrenceExtras(recurrence, frequency) {
    if (frequency === 'weekly' && Array.isArray(recurrence.weekdays) && recurrence.weekdays.length && recurrence.weekdays.every(isWeekday)) {
      return { weekdays: [...new Set(recurrence.weekdays)].sort((a, b) => a - b) };
    }
    if (frequency !== 'monthly') return {};
    const { monthMode, monthDay, weekOfMonth, weekday } = recurrence;
    if (monthMode === 'day' && (monthDay === 'last' || Number.isInteger(monthDay) && monthDay >= 1 && monthDay <= 31)) return { monthMode, monthDay };
    if (monthMode === 'weekday' && (weekOfMonth === 'last' || Number.isInteger(weekOfMonth) && weekOfMonth >= 1 && weekOfMonth <= 4) && isWeekday(weekday)) return { monthMode, weekOfMonth, weekday };
    return {};
  }
  // R88: a rule can count from the day the task is completed (afterCompletion, kept only when true). Such a rule is a
  // plain interval, so chosen weekdays or a month day are dropped.
  function normalizeRecurrence(recurrence) {
    if (!recurrence || typeof recurrence !== 'object') return null;
    const frequency = ['daily', 'weekly', 'monthly', 'yearly'].includes(recurrence.frequency) ? recurrence.frequency : null;
    if (!frequency) return null;
    const interval = Math.max(1, Math.floor(Number(recurrence.interval) || 1));
    if (recurrence.afterCompletion === true) return { frequency, interval, afterCompletion: true };
    return { frequency, interval, ...recurrenceExtras(recurrence, frequency) };
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

  const lastDayOfMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  // The rule's day in a month: the chosen day (clamped) or the nth / last weekday; a rule without a
  // month mode keeps the given day, clamped to shorter months.
  function recurrenceDayInMonth(year, month, rule, fallbackDay) {
    const last = lastDayOfMonth(year, month);
    if (rule.monthMode === 'day') return rule.monthDay === 'last' ? last : Math.min(rule.monthDay, last);
    if (rule.monthMode === 'weekday') {
      if (rule.weekOfMonth === 'last') return last - ((new Date(year, month, last).getDay() - rule.weekday + 7) % 7);
      return 1 + ((rule.weekday - new Date(year, month, 1).getDay() + 7) % 7) + (rule.weekOfMonth - 1) * 7;
    }
    return Math.min(fallbackDay, last);
  }
  // Weeks start on Monday: 0 = Monday … 6 = Sunday.
  const mondayIndex = day => (day + 6) % 7;

  function nextRecurrenceDate(value, recurrence) {
    const normalized = normalizeRecurrence(recurrence);
    const date = parseDateOnly(value);
    if (!normalized || !date) return null;
    if (normalized.frequency === 'daily') return addDays(value, normalized.interval);
    if (normalized.frequency === 'weekly' && normalized.weekdays) {
      const order = normalized.weekdays.map(mondayIndex).sort((a, b) => a - b), current = mondayIndex(date.getDay());
      const later = order.find(index => index > current);
      if (later !== undefined) return addDays(value, later - current);
      return addDays(value, normalized.interval * 7 - current + order[0]);
    }
    if (normalized.frequency === 'weekly') return addDays(value, normalized.interval * 7);
    if (normalized.frequency === 'yearly') {
      const year = date.getFullYear() + normalized.interval;
      return dateOnly(new Date(year, date.getMonth(), Math.min(date.getDate(), lastDayOfMonth(year, date.getMonth()))));
    }

    const targetMonthIndex = date.getMonth() + normalized.interval;
    const targetYear = date.getFullYear() + Math.floor(targetMonthIndex / 12);
    const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
    return dateOnly(new Date(targetYear, normalizedMonth, recurrenceDayInMonth(targetYear, normalizedMonth, normalized, date.getDate())));
  }

  // The first day on or after `start` that matches the rule (S15: "the first time is the first
  // matching day from the start"). Rules without chosen days start on the start itself.
  function firstRecurrenceDate(start, recurrence) {
    const rule = normalizeRecurrence(recurrence);
    const date = parseDateOnly(start);
    if (!rule || !date) return null;
    if (rule.weekdays) {
      const offset = [0, 1, 2, 3, 4, 5, 6].find(days => rule.weekdays.includes((date.getDay() + days) % 7));
      return addDays(start, offset);
    }
    if (rule.monthMode) {
      const day = recurrenceDayInMonth(date.getFullYear(), date.getMonth(), rule, date.getDate());
      if (day >= date.getDate()) return dateOnly(new Date(date.getFullYear(), date.getMonth(), day));
      const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      return dateOnly(new Date(next.getFullYear(), next.getMonth(), recurrenceDayInMonth(next.getFullYear(), next.getMonth(), rule, 1)));
    }
    return start;
  }

  // R11c (S14): "Ovo i buduća" moves the rule's chosen day along with the occurrence. Returns only the
  // changed fields; "last day", plain intervals, daily and yearly rules follow the date by themselves.
  function recurrenceDayShift(recurrence, fromDate, toDate) {
    const rule = normalizeRecurrence(recurrence);
    const from = parseDateOnly(fromDate), to = parseDateOnly(toDate);
    if (!rule || !from || !to || fromDate === toDate) return {};
    if (rule.weekdays) {
      if (!rule.weekdays.includes(from.getDay())) return {};
      return { weekdays: [...new Set(rule.weekdays.map(day => (day === from.getDay() ? to.getDay() : day)))].sort((a, b) => a - b) };
    }
    if (rule.monthMode === 'day') return rule.monthDay === from.getDate() ? { monthDay: to.getDate() } : {};
    if (rule.monthMode === 'weekday') {
      if (rule.weekday !== from.getDay()) return {};
      const nth = Math.ceil(to.getDate() / 7);
      return { weekOfMonth: rule.weekOfMonth === 'last' || nth > 4 ? 'last' : nth, weekday: to.getDay() };
    }
    return {};
  }

  // The next `count` dates from the first one, stopping at the rule's end date or remaining count.
  // Dates before `from` (e.g. today) are left out but still count toward the remaining count.
  function upcomingRecurrenceDates(start, recurrence, count = 5, from = null) {
    const rule = normalizeRecurrenceV3(recurrence);
    if (!rule) return [];
    const limit = Math.max(0, Math.floor(Number(count) || 0));
    let remaining = rule.endType === 'afterOccurrences' && rule.endAfterOccurrences ? Math.max(0, rule.endAfterOccurrences - rule.occurrencesCreated) : Infinity;
    const dates = [];
    for (let current = firstRecurrenceDate(start, rule), steps = 0; current && dates.length < limit && remaining > 0 && steps < 10000; current = nextRecurrenceDate(current, rule), steps += 1) {
      if (rule.endType === 'date' && rule.endDate && current > rule.endDate) break;
      remaining -= 1;
      if (!from || current >= from) dates.push(current);
    }
    return dates;
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
    else if (normalized.frequency === 'yearly') {
      const targetYear = date.getFullYear() + normalized.interval, month = date.getMonth();
      date.setFullYear(targetYear, month, Math.min(date.getDate(), lastDayOfMonth(targetYear, month)));
    } else {
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
    let plannedDate, dueDate, reminderAt;
    if (recurrence.afterCompletion) {
      // R88: the next one comes an interval after the day this one was completed (the plan day, else the deadline,
      // else a plan); the other date and the reminder keep their distance, the reminder on the same wall-clock time.
      const anchor = source.plannedDate || source.dueDate;
      const next = advance(nowDate), shift = templateOffset(next, anchor || nowDate);
      plannedDate = source.plannedDate || !source.dueDate ? next : null;
      dueDate = source.dueDate ? addDays(source.dueDate, shift) : null;
      const reminder = source.reminderAt ? new Date(source.reminderAt) : null;
      if (reminder && !Number.isNaN(reminder.getTime())) reminder.setDate(reminder.getDate() + shift);
      reminderAt = reminder && !Number.isNaN(reminder.getTime()) ? reminder.toISOString() : null;
    } else if (recurrence.weekdays || recurrence.monthMode) {
      // R11a: the plan day (or else the due day) moves to the next occurrence; the due day and the
      // reminder keep their distance to it, the reminder on the same local wall-clock time.
      const anchor = source.plannedDate || source.dueDate || nowDate;
      const shift = templateOffset(advance(anchor), anchor);
      plannedDate = source.plannedDate ? addDays(source.plannedDate, shift) : source.dueDate ? null : addDays(anchor, shift);
      dueDate = source.dueDate ? addDays(source.dueDate, shift) : null;
      const reminder = source.reminderAt ? new Date(source.reminderAt) : null;
      if (reminder && !Number.isNaN(reminder.getTime())) reminder.setDate(reminder.getDate() + shift);
      reminderAt = reminder && !Number.isNaN(reminder.getTime()) ? reminder.toISOString() : null;
    } else {
      plannedDate = source.plannedDate ? advance(source.plannedDate) : null;
      dueDate = source.dueDate ? advance(source.dueDate) : null;
      if (!plannedDate && !dueDate) plannedDate = advance(nowDate);
      reminderAt=source.reminderAt?advanceIsoTimestamp(source.reminderAt,recurrence):null;
      if(reminderAt && recurrence.skipNext)reminderAt=advanceIsoTimestamp(reminderAt,recurrence);
    }
    if(!shouldGenerateRecurrence(recurrence,plannedDate || dueDate))return null;
    const id = String(newId || `task_${Date.now().toString(36)}`);
    return {
      ...templateCopy(source),
      id,
      plannedDate,
      dueDate,
      reminderAt,
      reminderFiredAt: null,
      plannedMonth: null,
      // R77: the next occurrence is Dailo's own, not the calendar event the first task came from.
      ...(task.icsUid != null || source.icsUid != null ? { icsUid: null } : {}),
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

  // A task reminder counts as fired only up to the moment it fired for (audit R-3): the fired marker is
  // device-local, so a reminder moved later on another device must fire again here.
  function taskReminderFired(task) {
    const fired = task?.reminderFiredAt ? new Date(task.reminderFiredAt).getTime() : NaN;
    const moment = reminderInstant(task?.reminderAt);
    return Number.isFinite(fired) && (moment === null || fired >= moment);
  }

  function isReminderDue(task, nowIso) {
    if (!task || task.isCompleted || !task.reminderAt || taskReminderFired(task)) return false;
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

  // Redesign R13 (S5): "Poslednjih 7 dana" on the weekly review — completed tasks per day for today and the six days
  // before, the previous 7 days' total, tasks created in the window, and this week's habits so far (planned days and
  // how many were done; a weekly-target habit counts its target and at most the target as done). Null when nothing
  // is planned.
  function weeklyReviewStats(state, habitLogs = [], today = dateOnly(), weekStartsOn = 'monday') {
    const tasks = state?.tasks || [];
    const completedOn = date => tasks.filter(task => task && task.isCompleted && localDateOf(task.completedAt) === date).length;
    const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6)).map(date => ({ date, completed: completedOn(date) }));
    const previousTotal = Array.from({ length: 7 }, (_, index) => completedOn(addDays(today, index - 13))).reduce((sum, count) => sum + count, 0);
    const first = days[0].date;
    const added = tasks.filter(task => { const created = localDateOf(task?.createdAt); return created && created >= first && created <= today; }).length;
    const weekStart = weekStartFor(today, weekStartsOn);
    const weekDays = [];
    for (let date = weekStart; date && date <= today; date = addDays(date, 1)) weekDays.push(date);
    let planned = 0, done = 0;
    for (const habit of (state?.habits || []).filter(item => item && item.status === 'active')) {
      const logs = (habitLogs || []).filter(log => log && log.habitId === habit.id);
      const doneDays = weekDays.filter(date => habitStatusForDate(habit, logs, date, date).status === 'done').length;
      if (habit.frequencyType === 'timesPerWeek') {
        const target = habitTargetFor(habit, weekStart);
        planned += target; done += Math.min(doneDays, target);
      } else {
        const scheduled = weekDays.filter(date => habitScheduledOn(habit, date));
        planned += scheduled.length;
        done += scheduled.filter(date => habitStatusForDate(habit, logs, date, date).status === 'done').length;
      }
    }
    return { days, total: days.reduce((sum, day) => sum + day.completed, 0), previousTotal, added, habitsPercent: planned ? Math.round(done / planned * 100) : null };
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
    state.tasks = state.tasks.map(task => ({
      ...task, durationMinutes: positiveIntegerOrNull(task.durationMinutes),
      // R67: only a stored bad month is cleared; older tasks keep no field, so sync has nothing new to send.
      ...(task.plannedMonth != null && normalizePlannedMonth(task.plannedMonth) !== task.plannedMonth ? { plannedMonth: null } : {}),
      // R77: likewise only a stored bad calendar UID is cleared.
      ...(task.icsUid != null && !validIcsUid(task.icsUid) ? { icsUid: null } : {}),
    }));
    state.goals = state.goals.map(goal => ({
      ...goal,
      // R29: the first starter examples saved 'linkedTasks' here, which backups refuse; it reads as a percentage anyway.
      ...(goal.progressType != null && !['percentage', 'numeric'].includes(goal.progressType) ? { progressType: 'percentage' } : {}),
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
        // R85: only a stored bad duration is cleared; older habits keep no field.
        ...(habit.durationMinutes != null && habitDurationOrNull(habit.durationMinutes) === null ? { durationMinutes: null } : {}),
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

  // R38: a goal's progress can come from its milestones: the share of them that are completed.
  function milestoneProgress(goal) {
    const milestones = Array.isArray(goal?.milestones) ? goal.milestones.filter(Boolean) : [];
    return { done: milestones.filter(item => item.isCompleted === true).length, total: milestones.length };
  }

  function goalProgressFraction(goal) {
    if (goal?.progressMode === 'milestones') { const { done, total } = milestoneProgress(goal); return total ? done / total : 0; }
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

  // R85: a habit's duration, whole minutes from 1 to 1440, or null.
  function habitDurationOrNull(value) {
    return Number.isInteger(value) && value >= 1 && value <= 1440 ? value : null;
  }
  // R85: the habits planned that day (with days of their own, not "X puta nedeljno") and not done yet add their
  // duration; habitMinutes says how much of the load is theirs.
  function dayLoad(tasks, date, habits = [], logs = []) {
    const open = (tasks || []).filter(task => task && !task.isCompleted && task.plannedDate === date);
    const durations = open.map(task => positiveIntegerOrNull(task.durationMinutes));
    const done = new Set((logs || []).filter(log => log && log.date === date && log.status === 'done').map(log => log.habitId));
    const habitDurations = (habits || []).filter(habit => habit && habit.frequencyType !== 'timesPerWeek' && !done.has(habit.id) && habitScheduledOn(habit, date))
      .map(habit => habitDurationOrNull(habit.durationMinutes)).filter(Boolean);
    const habitMinutes = habitDurations.reduce((total, minutes) => total + minutes, 0);
    return { minutes: durations.reduce((total, minutes) => total + (minutes || 0), 0) + habitMinutes, withDuration: durations.filter(Boolean).length + habitDurations.length, withoutDuration: durations.filter(minutes => !minutes).length, ...(habitMinutes ? { habitMinutes } : {}) };
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
    // R31: overlapping blocks sit side by side; each gets a lane within its group of overlaps.
    let group = [], groupEnd = -1;
    const closeGroup = () => { const lanes = Math.max(1, ...group.map(block => block.lane + 1)); for (const block of group) block.lanes = lanes; group = []; };
    for (const block of withConflicts) {
      if (group.length && block.startMinutes >= groupEnd) closeGroup();
      const taken = new Set(group.filter(other => other.endMinutes > block.startMinutes).map(other => other.lane));
      let lane = 0;
      while (taken.has(lane)) lane += 1;
      block.lane = lane; group.push(block); groupEnd = Math.max(groupEnd, block.endMinutes);
    }
    if (group.length) closeGroup();
    const unscheduled = planned.filter(task => !task.isCompleted && !normalizeTime(task.plannedTime))
      .sort((a, b) => byOrder('todayOrder')(a, b) || String(a.title).localeCompare(String(b.title)));
    // R31: the hours run from 8 to 21 and grow only to fit the blocks.
    const earliest = blocks.length ? Math.floor(blocks[0].startMinutes / 60) : 8;
    const latest = blocks.length ? Math.ceil(Math.max(...blocks.map(block => block.endMinutes)) / 60) : 21;
    return { blocks: withConflicts, unscheduled, range: { startHour: Math.min(8, earliest), endHour: Math.min(24, Math.max(21, latest)) } };
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
    if (source.progressMode === 'milestones') {
      const { done, total } = milestoneProgress(source);
      return { current: done, target: total, percent: total ? done / total * 100 : 0 };
    }
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

  // Habit week rule (M11, "only from the change on"): habit functions accept 'monday'/'sunday' or
  // { weekStartsOn, history }, where history entries { before, weekStartsOn } say which week start applied to
  // dates before `before`. Only habit periods use it; the Calendar and the weekly review follow the current start.
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Boolean(parseDateOnly(value)) && dateOnly(parseDateOnly(value)) === value;
  function weekStartHistory(settings) {
    return (Array.isArray(settings?.weekStartHistory) ? settings.weekStartHistory : [])
      .filter(entry => entry && validDate(entry.before) && ['monday', 'sunday'].includes(entry.weekStartsOn))
      .map(entry => ({ ...entry })).sort((a, b) => a.before.localeCompare(b.before));
  }
  function habitWeekRule(settings) {
    return { weekStartsOn: weekStartKey(settings?.weekStartsOn), history: weekStartHistory(settings) };
  }
  // The start of the week of the change, counted with the old week start, becomes the boundary. A change back
  // within seven days removes the previous change instead of adding one.
  function recordWeekStartChange(settings, next, today = dateOnly()) {
    const history = weekStartHistory(settings);
    const previous = weekStartKey(settings?.weekStartsOn), target = weekStartKey(next);
    if (previous === target) return history;
    const last = history.at(-1);
    if (last && validDate(last.changedOn) && daysBetween(last.changedOn, today) < 7) {
      history.pop();
      if (last.weekStartsOn === target) return history;
    }
    const before = weekStartFor(today, previous);
    if (!history.some(entry => entry.before === before)) history.push({ before, weekStartsOn: previous, changedOn: today });
    return history.slice(-52);
  }
  // The week that contains a change is cut at the boundary: a piece of four or more days stays its own week,
  // a shorter piece joins the next week. Completed weeks keep their boundaries.
  function habitWeekStartFor(date, rule) {
    const { weekStartsOn, history } = typeof rule === 'object' && rule ? { weekStartsOn: weekStartKey(rule.weekStartsOn), history: Array.isArray(rule.history) ? rule.history : [] } : { weekStartsOn: weekStartKey(rule), history: [] };
    let from = null;
    let start = weekStartsOn;
    for (const entry of history) {
      if (date < entry.before) { start = entry.weekStartsOn; break; }
      from = entry.before;
    }
    const key = weekStartFor(date, start);
    if (from && key < from && daysBetween(from, addDays(key, 7)) < 4) return addDays(key, 7);
    return key;
  }

  function habitPeriodKey(habit, date, weekStartsOn = 'monday') {
    if (!parseDateOnly(date)) return null;
    return habit?.frequencyType === 'timesPerWeek' ? habitWeekStartFor(date, weekStartsOn) : date;
  }

  // Weekly targets (M11): targetHistory entries { before, timesPerWeek } keep the target of the weeks before a change.
  const weeklyTarget = value => Math.min(7, Math.max(1, Math.floor(Number(value) || 1)));
  function habitTargetFor(habit, periodKey) {
    if (habit?.frequencyType !== 'timesPerWeek') return 1;
    const history = (Array.isArray(habit.targetHistory) ? habit.targetHistory : []).filter(entry => entry && validDate(entry.before)).sort((a, b) => a.before.localeCompare(b.before));
    if (periodKey) for (const entry of history) if (periodKey < entry.before) return weeklyTarget(entry.timesPerWeek);
    return weeklyTarget(habit.timesPerWeek);
  }
  function recordHabitTargetChange(habit, next, weekStart) {
    const history = (Array.isArray(habit?.targetHistory) ? habit.targetHistory : []).map(entry => ({ ...entry }));
    const previous = Number(habit?.timesPerWeek);
    if (habit?.frequencyType !== 'timesPerWeek' || next?.frequencyType !== 'timesPerWeek' || !Number.isInteger(previous) || previous === Number(next.timesPerWeek) || !validDate(weekStart)) return history;
    if (!history.some(entry => entry.before === weekStart)) history.push({ before: weekStart, timesPerWeek: weeklyTarget(previous) });
    return history.sort((a, b) => a.before.localeCompare(b.before)).slice(-104);
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
      // R31: a skipped day of a numeric habit stays skipped; otherwise the value decides.
      // R61: `logged` tells a recorded day from one nobody touched (a yes/no habit's "not done" is a logged missed day).
      if (habit?.trackingType === 'numeric' && log.status !== 'skipped') return { ...numericHabitState(habit, log.value), logged: true };
      return { status: log.status, value: log.value ?? null, percent: log.status === 'done' ? 100 : 0, logged: true };
    }
    if (!habitScheduledOn(habit, date, { historical: true })) return { status: 'unscheduled', value: null, percent: 0 };
    return { status: date < today ? 'missed' : 'pending', value: null, percent: 0 };
  }

  // Redesign R8a (H2–H4, H7): one habit on one day for the Habits screen. 'future' and 'unscheduled' days are
  // inactive; 'open' is today, or a weekly-target day without a check-in (such a habit never misses one day).
  // `planned` says whether the day counts in that day's share: a weekly-target habit counts when it is checked
  // in, or today while its week's target is still open. Skipped days never count.
  function habitDayState(habit, logs, date, today = dateOnly(), weekRule = 'monday') {
    if (!parseDateOnly(date) || date > today) return { state: 'future', planned: false, value: null };
    const status = habitStatusForDate(habit, logs, date, today);
    if (status.status === 'unscheduled') return { state: 'unscheduled', planned: false, value: null };
    if (status.status === 'skipped') return { state: 'skipped', planned: false, value: status.value };
    if (status.status === 'done') return { state: 'done', planned: true, value: status.value };
    // R61: a yes/no habit marked "not done" is missed even today, and `marked` sets it apart from an untouched day.
    if (habit?.trackingType !== 'numeric' && status.logged && status.status === 'missed') return { state: 'missed', planned: habit?.frequencyType !== 'timesPerWeek', value: null, marked: true };
    if (habit?.frequencyType === 'timesPerWeek') {
      const week = habitPeriodKey(habit, date, weekRule);
      const done = new Set((logs || []).filter(log => log && log.date <= today && (!habit.id || log.habitId === habit.id) && habitPeriodKey(habit, log.date, weekRule) === week && habitStatusForDate(habit, logs, log.date, today).status === 'done').map(log => log.date)).size;
      return { state: 'open', planned: date === today && done < habitTargetFor(habit, week), value: status.value };
    }
    return { state: date === today ? 'open' : 'missed', planned: true, value: status.value };
  }

  // The share of a day's planned habits that are done; percent is null when nothing was planned that day.
  function habitDayPercent(habits, logsByHabit, date, today = dateOnly(), weekRule = 'monday') {
    let done = 0; let planned = 0;
    for (const habit of habits || []) {
      const day = habitDayState(habit, logsByHabit?.[habit.id] || [], date, today, weekRule);
      if (!day.planned) continue;
      planned += 1;
      if (day.state === 'done') done += 1;
    }
    return { done, planned, percent: planned ? Math.round(done / planned * 100) : null };
  }

  // A habit's week (H7): the done days against the plan, which is the weekly target or the scheduled days of the
  // whole week without the skipped ones, so the bar fills during the week.
  function habitWeekProgress(habit, logs, weekStart, today = dateOnly(), weekRule = 'monday') {
    let done = 0; let scheduled = 0;
    for (let index = 0; index < 7; index += 1) {
      const date = addDays(weekStart, index);
      const status = date <= today ? habitStatusForDate(habit, logs, date, today).status : null;
      if (status === 'done') done += 1;
      if (status !== 'skipped' && habitScheduledOn(habit, date, { historical: true })) scheduled += 1;
    }
    const planned = habit?.frequencyType === 'timesPerWeek' ? habitTargetFor(habit, habitPeriodKey(habit, weekStart, weekRule)) : scheduled;
    return { done, planned };
  }

  function habitCompletionForDates(habit, logs, dates, today = dateOnly(), weekStartsOn = 'monday') {
    const recordedDates = new Set((logs || []).filter(log => log && log.date <= today && (!habit?.id || log.habitId === habit.id)).map(log => log.date));
    const eligible = [...new Set((dates || []).filter(date => typeof date === 'string' && date && date <= today && (habitScheduledOn(habit, date, { historical: true }) || recordedDates.has(date))))];
    if (!eligible.length) return 0;
    const statusFor = date => habitStatusForDate(habit, logs || [], date, today);
    if (habit?.frequencyType === 'timesPerWeek') {
      const periods = new Map();
      for (const date of eligible) {
        const key = habitPeriodKey(habit, date, weekStartsOn);
        if (!periods.has(key)) periods.set(key, []);
        periods.get(key).push(date);
      }
      let score = 0;
      for (const [key, periodDates] of periods) {
        const target = habitTargetFor(habit, key);
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
      const successful = habit?.frequencyType === 'timesPerWeek' ? done >= habitTargetFor(habit, period.key) : done > 0;
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
      currentPeriodTarget: habit?.trackingType === 'numeric' && habit?.frequencyType !== 'timesPerWeek' ? Math.max(0, safeNumber(habit.targetValue)) : habitTargetFor(habit, currentKey),
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
    const visibleWeeklyPeriods = habitScheduleDates(habit, today, weekStartsOn, relevantLogs)
      .filter(period => visiblePeriodKeys.has(period.key));
    const weeklySeries = visibleWeeklyPeriods
      .map(({ key, dates: periodDates }) => {
        const completed = periodDates.filter(date => statusFor(date).status === 'done').length;
        const target = habitTargetFor({ ...habit, frequencyType: 'timesPerWeek' }, key);
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

  // R54: a habit's last year as 53 weeks (columns, oldest first) of 7 days in the week rule's order, ending with this
  // week. A day is done, partial (a numeric value below the target), skipped, missed, open, unscheduled or future.
  // `percent` is the share done of the planned days up to today (skipped ones left out), null when none was planned;
  // `months` marks the columns where a month begins.
  function habitYear(habit, logs, today = dateOnly(), weekRule = 'monday') {
    const start = addDays(habitPeriodKey({ frequencyType: 'timesPerWeek' }, today, weekRule), -52 * 7);
    const weeks = [];
    const months = [];
    const planned = [];
    let done = 0;
    for (let column = 0; column < 53; column += 1) {
      const days = [];
      for (let row = 0; row < 7; row += 1) {
        const date = addDays(start, column * 7 + row);
        const day = habitDayState(habit, logs, date, today, weekRule);
        let state = day.state;
        if (state === 'done') done += 1;
        if (!['future', 'unscheduled', 'skipped'].includes(state)) planned.push(date);
        if (habit?.trackingType === 'numeric' && ['missed', 'open'].includes(state) && Number(day.value) > 0) state = 'partial';
        if (date.endsWith('-01')) months.push({ column, month: date.slice(5, 7) });
        days.push({ date, state });
      }
      weeks.push(days);
    }
    return { start, weeks, months, done, percent: planned.length ? habitCompletionForDates(habit, logs, planned, today, weekRule) : null };
  }

  // M11: once a day is checked in (or skipped), that day's reminders stay silent; a numeric habit below its
  // target still reminds. Weekly habits are silenced by the week's target instead.
  function habitDayClosed(habit, logs, date) {
    if (habit?.frequencyType === 'timesPerWeek') return false;
    const day = habitStatusForDate(habit, logs || [], date, date);
    // R61: a yes/no habit marked "not done" closes the day too; a numeric one below its target still reminds.
    return day.status === 'done' || day.status === 'skipped' || (habit?.trackingType !== 'numeric' && day.logged === true && day.status === 'missed');
  }

  function habitReminderActive(habit, logs, now, weekStartsOn = 'monday') {
    if (!habit || habit.status !== 'active' || !(habit.reminders || []).some(reminder => reminder?.enabled && normalizeTime(reminder.time))) return false;
    const timestamp = new Date(now); if (Number.isNaN(timestamp.getTime())) return false;
    const today = dateOnly(timestamp);
    if (!habitScheduledOn(habit, today)) return false;
    if (habitDayClosed(habit, logs, today)) return false;
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
  // R24: text shared to Dailo from another app (Android "Podeli", the web app's share target) as a Quick Add draft:
  // the subject or title (else the first line) names the task; the other lines and a link not already shown are
  // the notes. A bare link is named by its site.
  function sharedTextDraft({ text = '', subject = '', title = '', url = '' } = {}) {
    const clean = value => String(value || '').replace(/\r\n?/g, '\n').trim();
    const lines = clean(text).split('\n').map(line => line.trim()).filter(Boolean);
    const link = clean(url);
    const onlyLink = value => /^https?:\/\/\S+$/i.test(value);
    const site = value => { try { return new URL(value).hostname.replace(/^www\./, ''); } catch (_) { return value; } };
    let name = clean(subject) || clean(title);
    let notes = lines;
    if (!name && lines.length) {
      if (onlyLink(lines[0])) name = site(lines[0]);
      else { name = lines[0]; notes = lines.slice(1); }
    }
    if (link && !notes.includes(link) && !name.includes(link)) notes = [...notes, link];
    return { title: name.replace(/\s+/g, ' ').slice(0, 200).trim(), notes: notes.join('\n') };
  }

  // R37 (D): how many active habits have no record of a day they were planned on (skipped days are records).
  function habitsMissedOn(habits, logsByHabit, date, today = dateOnly(), weekRule = 'monday') {
    return (habits || []).filter(habit => habit?.status === 'active' && habitDayState(habit, logsByHabit?.[habit.id] || [], date, today, weekRule).state === 'missed').length;
  }

  // R37 (F): the coming dates of open repeating tasks, for the calendar only (nothing is stored): { date: [{ task,
  // date }] } from `from` to `to`. The task's own date is not repeated, and a paused or ended rule shows nothing.
  function calendarRepeats(tasks, from, to, limit = 400) {
    const byDate = {};
    let total = 0;
    for (const task of tasks || []) {
      if (!task || task.isCompleted || task.isInbox) continue;
      const rule = normalizeRecurrenceV3(task.recurrenceBaseline?.recurrence || task.recurrence);
      const anchor = task.plannedDate || task.dueDate;
      // R88: a rule that counts from completion has no known future dates.
      if (!rule || rule.status !== 'active' || !anchor || rule.afterCompletion) continue;
      const after = addDays(anchor, 1);
      const skipped = rule.skipNext ? upcomingRecurrenceDates(anchor, rule, 1, after)[0] : null;
      for (const date of upcomingRecurrenceDates(anchor, rule, 62, from > after ? from : after)) {
        if (date === skipped) continue;
        if (date > to) break;
        if (date < from) continue;
        (byDate[date] ||= []).push({ task, date });
        if (++total >= limit) return byDate;
      }
    }
    return Object.fromEntries(Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)));
  }

  // R36 (G): "Vikend" in the date sheet: the coming Saturday, or today on a Saturday.
  function weekendDate(date) {
    const day = parseDateOnly(date)?.getDay();
    if (day == null) return null;
    return addDays(date, day === 0 ? 6 : 6 - day);
  }

  // R35 (H): a shared link becomes a resource: the page title (or the one line shared with it, or the site) is its
  // name, the link its link and any other shared text its description. Text without an http(s) link returns null and
  // stays a task (sharedTextDraft).
  function sharedResourceDraft({ text = '', subject = '', title = '', url = '' } = {}) {
    const clean = value => String(value || '').replace(/\r\n?/g, '\n').trim();
    const found = clean(url) || (clean(text).match(/https?:\/\/[^\s<>"]+/i) || [])[0] || '';
    let link;
    try { link = new URL(found); } catch (_) { return null; }
    if (!['http:', 'https:'].includes(link.protocol)) return null;
    const rest = clean(text).split('\n').map(line => line.split(found).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    let name = clean(subject) || clean(title);
    if (!name && rest.length === 1 && rest[0].length <= 120) name = rest.shift();
    if (!name) name = link.hostname.replace(/^www\./, '');
    return { title: name.replace(/\s+/g, ' ').slice(0, 120).trim(), linkUrls: [found], description: rest.join('\n') };
  }

  // R35 (B): a note becomes a task: its name is the title, list lines ("- ", "* ", "• ", "[ ] ", "[x] ", "1. ")
  // become subtasks ("[x]" ones already done) and the other lines stay as the task's notes.
  function noteTaskDraft(note) {
    const subtasks = [];
    const rest = [];
    for (const line of String(note?.body || '').replace(/\r\n?/g, '\n').split('\n')) {
      const item = line.match(/^\s*(?:[-*•]\s+(\[[ xX]?\]\s*)?|(\[[ xX]?\])\s+|\d+[.)]\s+)(.*\S)\s*$/);
      if (item) subtasks.push({ title: item[3].trim().slice(0, 500), isCompleted: /x/i.test(item[1] || item[2] || '') });
      else rest.push(line);
    }
    return { title: String(note?.title || '').trim().slice(0, 500), notes: rest.join('\n').replace(/^\n+|\n+$/g, '').replace(/\n{3,}/g, '\n\n'), subtasks };
  }

  function notificationPlan(state, now, { days = 14, limit = 60, logs = {}, plannedFired = {} } = {}) {
    const start = new Date(now).getTime();
    if (!state || !Number.isFinite(start)) return [];
    const end = start + days * 86400000;
    const list = [];
    const add = (kind, item, moment, title, date = null) => {
      const time = reminderInstant(moment.replace(/^(snooze|planned):/, ''));
      if (time === null || time <= start || time > end) return;
      list.push({ key: notificationKey(kind, item.id, moment), kind, id: item.id, at: new Date(time).toISOString(), title, route: `${kind}/${encodeURIComponent(item.id)}`, date });
    };
    const planned = plannedTimeReminders(state.settings);
    for (const task of state.tasks || []) {
      if (!task.isCompleted && task.reminderAt && !taskReminderFired(task)) add('task', task, task.reminderAt, task.title, task.dueDate || null);
      // R18 (c): a planned time reminds under its own key, so it never clashes with a set reminder.
      const moment = planned ? plannedReminderMoment(task) : null;
      if (moment && plannedFired[task.id] !== moment) add('task', task, `planned:${moment}`, task.title, task.dueDate || null);
    }
    // R18 (b): the journal at its reminder time each day; today drops out once it has an entry with text or a mood.
    const journalTime = journalNotifications(state.settings) ? journalReminderTime(state.settings) : null;
    if (journalTime) {
      const firstDay = dateOnly(new Date(start));
      for (let offset = 0; offset <= days; offset += 1) {
        const date = addDays(firstDay, offset);
        const entry = offset === 0 ? journalEntryFor(state, date) : null;
        if (entry && (String(entry.text || '').trim() || entry.mood)) continue;
        const moment = combineDateTime(date, journalTime);
        if (moment) add('journal', { id: journalEntryId(date) }, moment, '', date);
      }
    }
    for (const goal of state.goals || []) {
      if (goal.status !== 'active') continue;
      const fired = new Set(Array.isArray(goal.reminderFiredMoments) ? goal.reminderFiredMoments : []);
      for (const moment of goalReminderMoments(goal)) if (!fired.has(moment)) add('goal', goal, moment, goal.title, goal.targetDate);
    }
    const weekRule = habitWeekRule(state.settings);
    const today = dateOnly(new Date(start));
    for (const habit of state.habits || []) {
      if (habit.status !== 'active') continue;
      let quietWeek = null;
      if (habit.frequencyType === 'timesPerWeek') {
        const metrics = deriveHabitMetrics(habit, logs[habit.id] || [], today, weekRule);
        if (metrics.currentPeriodCount >= metrics.currentPeriodTarget) quietWeek = habitPeriodKey(habit, today, weekRule);
      }
      const todayClosed = habitDayClosed(habit, logs[habit.id] || [], today);
      const silent = date => !habitScheduledOn(habit, date) || (date === today && todayClosed) || (quietWeek && habitPeriodKey(habit, date, weekRule) === quietWeek);
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

  // Records that first arrive through sync (audit R-3): their past reminder moments are marked as handled on this
  // device, so a new device does not replay old reminders. Records this device already had are left as they are.
  function settleArrivedReminders(previous, next, now) {
    const at = new Date(now).getTime();
    if (!next || !Number.isFinite(at)) return next;
    const known = type => new Set((previous?.[type] || []).map(item => item?.id));
    const past = moment => { const time = reminderInstant(moment); return time !== null && time <= at; };
    const today = dateOnly(new Date(at));
    const tasks = known('tasks'), goals = known('goals'), habits = known('habits');
    return {
      ...next,
      tasks: (next.tasks || []).map(task => (!tasks.has(task.id) && task.reminderAt && !task.reminderFiredAt && past(task.reminderAt) ? { ...task, reminderFiredAt: new Date(at).toISOString() } : task)),
      goals: (next.goals || []).map(goal => (goals.has(goal.id) ? goal : { ...goal, reminderFiredMoments: [...new Set([...(goal.reminderFiredMoments || []), ...goalReminderMoments(goal).filter(past)])] })),
      habits: (next.habits || []).map(habit => (habits.has(habit.id) ? habit : { ...habit, reminderFiredMoments: [...new Set([...(habit.reminderFiredMoments || []), ...(habit.reminders || []).filter(item => item?.enabled !== false && normalizeTime(item.time)).map(item => combineDateTime(today, item.time)).filter(past)])] })),
    };
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
    // R30: Serbian writes an hour as "18h", "u 18h" or "u 18". After "u" any hour is a time; a bare "Nh" is a
    // time from 9 to 23, while shorter ones and "24h" stay durations.
    const hour = last.match(/^(\d{1,2})(h?)$/);
    if (hour && (before === 'u' || before === 'at' || (hour[2] && Number(hour[1]) >= 9 && Number(hour[1]) <= 23))) {
      const value = Number(hour[1]) <= 23 ? normalizeTime(`${hour[1].padStart(2, '0')}:00`) : null;
      if (!value) return INVALID;
      return { slot: 'plannedTime', value, consumed: before === 'u' || before === 'at' ? 2 : 1 };
    }
    const time = last.match(/^(\d{1,2}):(\d{2})$/);
    if (time) {
      if (before === 'do') return { stop: true };
      const value = normalizeTime(`${time[1].padStart(2, '0')}:${time[2]}`);
      if (!value) return INVALID;
      return { slot: 'plannedTime', value, consumed: before === 'u' || before === 'at' ? 2 : 1 };
    }
    const duration = quickDuration(words);
    // R30: "za 30 min" is a duration too; the "za" goes with it.
    if (duration && lower[n - 1 - duration.consumed] === 'za') duration.consumed += 1;
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

  // Colors reach style attributes (audit S-4): only #rgb and #rrggbb are accepted.
  function safeColor(value, fallback) {
    return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : fallback;
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
    // A note needs only a title (redesign R10b, decided 2026-10-09); a resource still needs a link, image or file.
    if (type === 'resource' && !linkUrls.length && !attachmentIds.length) errors.push('source');
    return { valid: !errors.length, errors, normalized: { ...source, type, title, linkUrls, attachmentIds } };
  }

  function effectiveTaskArea(task, projects) {
    if (!task || typeof task !== 'object') return null;
    if (!task.projectId) return task.areaId || null;
    const project = (projects || []).find(item => item && item.id === task.projectId);
    return project && project.areaId ? project.areaId : null;
  }

  // R12a: the journal — one entry per day; the id is the day so two devices meet in one record.
  const isJournalDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dateOnly(parseDateOnly(value)) === value;
  function journalEntryId(date) {
    return `journal_${date}`;
  }
  function normalizeJournalEntry(item) {
    return { ...item, text: typeof item.text === 'string' ? item.text : '', mood: Number.isInteger(item.mood) && item.mood >= 1 && item.mood <= 5 ? item.mood : null };
  }
  function journalEntryFor(state, date) {
    return (state?.journal || []).find(item => item.date === date) || null;
  }
  // R26 (G): "Na današnji dan" — entries with text or a mood from the same day of an earlier month or year, newest
  // first, with how many months ago they were.
  function journalOnThisDay(state, date, limit = 6) {
    const [year, month, day] = String(date || '').split('-').map(Number);
    if (!year || !month || !day) return [];
    return (state?.journal || [])
      .filter(item => item.date < date && (item.text?.trim() || item.mood) && Number(item.date.slice(8, 10)) === day)
      .map(item => ({ entry: item, months: (year - Number(item.date.slice(0, 4))) * 12 + (month - Number(item.date.slice(5, 7))) }))
      .filter(item => item.months > 0)
      .sort((a, b) => b.entry.date.localeCompare(a.entry.date))
      .slice(0, limit);
  }

  // The read-only summary of a day in its journal entry (J2): tasks completed that day, and the habits planned that
  // day (weekly-target habits left out) with how many were done.
  function journalDaySummary(state, habitLogs, date) {
    const completed = (state?.tasks || []).filter(task => task.isCompleted && localDateOf(task.completedAt) === date).length;
    const due = (state?.habits || []).filter(habit => habit.status === 'active' && habit.frequencyType !== 'timesPerWeek' && habitScheduledOn(habit, date));
    const habitsDone = due.filter(habit => habitStatusForDate(habit, habitLogs || [], date, date).status === 'done').length;
    return { completed, habitsDone, habitsDue: due.length };
  }
  // R18: the reminder settings — the hour Dailo proposes, reminders at a task's planned time, and the journal as a
  // phone notification. Missing values mean the defaults, so older data needs no migration.
  function defaultReminderTime(settings) {
    return normalizeTime(settings?.defaultReminderTime) || '09:00';
  }
  function plannedTimeReminders(settings) {
    return settings?.plannedTimeReminders === true;
  }
  function journalNotifications(settings) {
    return settings?.journalNotifications === true;
  }
  // An open task with a planned date and time and no reminder of its own reminds at its planned moment.
  function plannedReminderMoment(task) {
    if (!task || task.isCompleted || task.reminderAt) return null;
    return combineDateTime(task.plannedDate, normalizeTime(task.plannedTime));
  }
  // In the open app a planned reminder shows once, and only within two hours of its moment.
  function plannedReminderDue(task, now, firedMoment) {
    const moment = plannedReminderMoment(task);
    if (!moment || firedMoment === moment) return null;
    const at = reminderInstant(moment), current = new Date(now).getTime();
    return at !== null && at <= current && current - at < 2 * 3600000 ? moment : null;
  }

  // When the evening journal notice appears (J6): a local time, or null when it is off; 20:00 when unset.
  function journalReminderTime(settings) {
    const value = settings?.journalReminderTime;
    if (value === null) return null;
    return normalizeTime(value) || '20:00';
  }

  function collectionIsValid(state, key) {
    return Array.isArray(state[key]);
  }

  function invalidV3Collection(input) {
    return ['tasks', 'projects', 'tags', 'areas', 'goals', 'habits', 'notes', 'resources', 'templates', 'savedViews', 'journal']
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
    for (const key of ['tasks', 'projects', 'tags', 'areas', 'goals', 'habits', 'notes', 'resources', 'templates', 'savedViews', 'journal']) {
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
    state = { notes: [], resources: [], journal: [], ...state };
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
    // R12a: one journal entry per day, its id taken from the day.
    if (!Array.isArray(state.journal) || state.journal.some(item => !item || typeof item !== 'object' || !isJournalDate(item.date) || item.id !== journalEntryId(item.date)
      || typeof item.text !== 'string' || !(item.mood === null || Number.isInteger(item.mood) && item.mood >= 1 && item.mood <= 5)
      || !isIsoTimestamp(item.createdAt) || !isIsoTimestamp(item.updatedAt))
      || new Set(state.journal.map(item => item.date)).size !== state.journal.length) return { ok: false, reason: 'invalid-journal' };
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
    state.journal = Array.isArray(state.journal) ? state.journal.map(item => (item && typeof item === 'object' ? normalizeJournalEntry(item) : item)) : [];
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

  // R52: the calendar as an .ics file (RFC 5545), docs/superpowers/specs/2026-10-12-r52-ics.md. Export writes the open
  // tasks' plans (timed in UTC, or all-day) and deadlines on other days; import reads events back as dated drafts.
  const icsDay = value => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && parseDateOnly(value) && dateOnly(parseDateOnly(value)) === value ? value : null);
  const icsUtc = instant => instant.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const icsText = text => String(text).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const icsUnescape = text => String(text).replace(/\\([\\;,nN])/g, (_, char) => (char === 'n' || char === 'N' ? '\n' : char));
  // Lines are folded at 75 octets; a continuation line starts with one space.
  function icsFold(line) {
    const parts = [];
    let current = '';
    let size = 0;
    for (const char of line) {
      const bytes = new TextEncoder().encode(char).length;
      if (size + bytes > (parts.length ? 74 : 75)) { parts.push(current); current = ''; size = 0; }
      current += char;
      size += bytes;
    }
    parts.push(current);
    return parts.join('\r\n ');
  }

  function calendarIcs(tasks, { now = new Date(), dueLabel = 'Due' } = {}) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dailo//Dailo//SR', 'CALSCALE:GREGORIAN'];
    const stamp = icsUtc(now);
    const event = (uid, summary, notes, date, time, minutes) => {
      lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`);
      if (time) {
        const [hours, mins] = time.split(':').map(Number);
        const start = parseDateOnly(date);
        start.setHours(hours, mins, 0, 0);
        lines.push(`DTSTART:${icsUtc(start)}`, `DTEND:${icsUtc(new Date(start.getTime() + minutes * 60000))}`);
      } else lines.push(`DTSTART;VALUE=DATE:${date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(date, 1).replace(/-/g, '')}`);
      lines.push(`SUMMARY:${icsText(summary)}`);
      if (notes) lines.push(`DESCRIPTION:${icsText(notes)}`);
      lines.push('END:VEVENT');
    };
    for (const task of tasks || []) {
      if (!task || task.isCompleted) continue;
      const title = String(task.title || '').trim();
      const notes = String(task.notes || '').trim();
      const planned = icsDay(task.plannedDate);
      const due = icsDay(task.dueDate);
      if (planned) event(`${task.id}-plan@dailo`, title, notes, planned, normalizeTime(task.plannedTime), positiveIntegerOrNull(task.durationMinutes) || 30);
      if (due && due !== planned) event(`${task.id}-due@dailo`, `${dueLabel}: ${title}`, notes, due, normalizeTime(task.dueTime), 30);
    }
    lines.push('END:VCALENDAR');
    return `${lines.map(icsFold).join('\r\n')}\r\n`;
  }

  // The offset of a time zone at an instant, in milliseconds (wall clock there minus UTC).
  function zoneOffset(instant, timeZone) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(instant)).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant;
  }

  function icsMoment(property) {
    const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(String(property?.value || '').trim());
    if (!match) return null;
    const [, year, month, day, hour, minute, second, utc] = match;
    const date = icsDay(`${year}-${month}-${day}`);
    if (!date) return null;
    if (property.params.VALUE === 'DATE' || hour === undefined) return { date, time: null, allDay: true, instant: parseDateOnly(date).getTime() };
    const fields = [Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)];
    let instant;
    if (utc) instant = Date.UTC(...fields);
    else if (property.params.TZID && (() => { try { new Intl.DateTimeFormat('en-US', { timeZone: property.params.TZID }); return true; } catch (_) { return false; } })()) {
      // The wall time in that zone: guess, then correct by the offset at the result (twice covers the DST edges).
      const wall = Date.UTC(...fields);
      instant = wall - zoneOffset(wall, property.params.TZID);
      instant = wall - zoneOffset(instant, property.params.TZID);
    } else instant = new Date(...fields).getTime(); // floating time, or a zone this device does not know: local
    const local = new Date(instant);
    return { date: dateOnly(local), time: `${pad(local.getHours())}:${pad(local.getMinutes())}`, allDay: false, instant };
  }

  function icsDurationMinutes(value) {
    const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(value || '').trim());
    if (!match || match[1] === '-') return null;
    const [, , weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0] = match;
    return Number(weeks) * 10080 + Number(days) * 1440 + Number(hours) * 60 + Number(minutes) + Math.round(Number(seconds) / 60);
  }

  function parseIcsEvents(text) {
    const lines = String(text || '').replace(/\r\n|\r/g, '\n').split('\n').reduce((out, line) => {
      if (/^[ \t]/.test(line) && out.length) out[out.length - 1] += line.slice(1);
      else out.push(line);
      return out;
    }, []);
    const events = [];
    let props = null;
    for (const line of lines) {
      if (line.trim().toUpperCase() === 'BEGIN:VEVENT') { props = {}; continue; }
      if (line.trim().toUpperCase() === 'END:VEVENT') {
        const event = props && icsEvent(props);
        if (event) events.push(event);
        props = null;
        continue;
      }
      if (!props) continue;
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const [name, ...params] = line.slice(0, colon).split(';');
      const key = name.trim().toUpperCase();
      if (!(key in props)) props[key] = { value: line.slice(colon + 1), params: Object.fromEntries(params.map(part => { const [param, ...value] = part.split('='); return [param.trim().toUpperCase(), value.join('=').replace(/^"|"$/g, '')]; })) };
    }
    return events;
  }

  function icsEvent(props) {
    if (String(props.STATUS?.value || '').trim().toUpperCase() === 'CANCELLED') return null;
    const start = icsMoment(props.DTSTART);
    if (!start) return null;
    let durationMinutes = null;
    if (!start.allDay) {
      const end = props.DTEND ? icsMoment(props.DTEND) : null;
      const span = end && !end.allDay ? Math.round((end.instant - start.instant) / 60000) : props.DURATION ? icsDurationMinutes(props.DURATION.value) : null;
      durationMinutes = span > 0 ? span : null;
    }
    // R77: one changed occurrence of a series shares the series UID; its RECURRENCE-ID tells it apart.
    const recurrenceId = String(props['RECURRENCE-ID']?.value || '').trim();
    return { uid: icsUnescape(props.UID?.value || ''), summary: icsUnescape(props.SUMMARY?.value || ''), description: icsUnescape(props.DESCRIPTION?.value || ''), date: start.date, time: start.time, durationMinutes, allDay: start.allDay, recurring: Boolean(props.RRULE || props.RDATE), ...(recurrenceId ? { recurrenceId } : {}) };
  }

  // R77: the calendar UID a task made from an event keeps (task.icsUid): text of 1–500 characters, no control characters.
  function validIcsUid(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 500 && !/[\u0000-\u001f\u007f]/.test(value);
  }

  // Which events become tasks: from today on, not repeating (Dailo's own repeat rule is set by hand), not the same
  // title, day and time as an open task (or an earlier event in the file), and at most `limit` per file.
  // R77: nor an event imported before — its UID is on a task, open or completed — nor one of Dailo's own exported
  // events (`<task id>-plan@dailo`, `<task id>-due@dailo`) whose task is here; a draft keeps the event's UID.
  function icsImportTasks(events, tasks, today, limit = 500) {
    const key = (title, date, time) => `${String(title || '').trim().toLocaleLowerCase()}|${date}|${time || ''}`;
    const seen = new Set((tasks || []).filter(task => task && !task.isCompleted && task.plannedDate).map(task => key(task.title, task.plannedDate, task.plannedTime)));
    const taskIds = new Set((tasks || []).map(task => task?.id).filter(Boolean));
    const uids = new Set((tasks || []).map(task => task?.icsUid).filter(validIcsUid));
    const uidOf = event => {
      const uid = event.uid && event.recurrenceId ? `${event.uid}#${event.recurrenceId}` : event.uid;
      return validIcsUid(uid) ? uid : null;
    };
    const drafts = [];
    let past = 0;
    let recurring = 0;
    let duplicates = 0;
    let overLimit = 0;
    for (const event of events || []) {
      if (event.recurring) { recurring += 1; continue; }
      if (event.date < today) { past += 1; continue; }
      const title = String(event.summary || '').trim();
      const id = key(title, event.date, event.time);
      const uid = uidOf(event);
      const own = /^(.+)-(?:plan|due)@dailo$/.exec(String(event.uid || ''));
      if (uid && uids.has(uid) || own && taskIds.has(own[1]) || seen.has(id)) { duplicates += 1; continue; }
      if (drafts.length >= limit) { overLimit += 1; continue; }
      seen.add(id);
      if (uid) uids.add(uid);
      const minutes = Number.isInteger(event.durationMinutes) && event.durationMinutes > 0 && event.durationMinutes <= 1440 ? event.durationMinutes : null;
      drafts.push({ title, notes: String(event.description || '').trim(), plannedDate: event.date, plannedTime: event.time || null, durationMinutes: minutes, ...(uid ? { icsUid: uid } : {}) });
    }
    return { drafts, past, recurring, duplicates, overLimit };
  }

  // R53: Serbian Cyrillic to Latin; speech recognition may answer in Cyrillic while the app is written in Latin.
  const CYRILLIC_LATIN = { А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Ђ: 'Đ', Е: 'E', Ж: 'Ž', З: 'Z', И: 'I', Ј: 'J', К: 'K', Л: 'L', Љ: 'Lj', М: 'M', Н: 'N', Њ: 'Nj', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', Ћ: 'Ć', У: 'U', Ф: 'F', Х: 'H', Ц: 'C', Ч: 'Č', Џ: 'Dž', Ш: 'Š' };
  function cyrillicToLatin(text) {
    return String(text ?? '').replace(/[\u0400-\u04FF]/g, char => {
      if (CYRILLIC_LATIN[char]) return CYRILLIC_LATIN[char];
      const upper = CYRILLIC_LATIN[char.toUpperCase()];
      return upper ? upper.toLowerCase() : char;
    });
  }

  return {
    dateOnly,
    parseDateOnly,
    localDateOf,
    cyrillicToLatin,
    habitYear,
    calendarIcs,
    parseIcsEvents,
    icsImportTasks,
    validIcsUid,
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
    normalizePlannedMonth,
    monthKey,
    addMonths,
    upcomingMonth,
    deriveRoughMonths,
    deriveCalendarDay,
    deriveCalendarWeek,
    deriveCalendarMonthSummary,
    calendarTimeBlocks,
    calendarDayItems,
    habitDayState,
    habitDayClosed,
    habitDayPercent,
    habitWeekProgress,
    nextRecurrenceDate,
    firstRecurrenceDate,
    upcomingRecurrenceDates,
    recurrenceDayShift,
    journalEntryId,
    journalOnThisDay,
    journalEntryFor,
    journalReminderTime,
    defaultReminderTime,
    plannedTimeReminders,
    journalNotifications,
    plannedReminderMoment,
    plannedReminderDue,
    journalDaySummary,
    weeklyReviewStats,
    normalizeRecurrence,
    normalizeRecurrenceV3,
    shouldGenerateRecurrence,
    splitRecurrenceForFuture,
    makeUuid,
    weekStartKey,
    weekStartFor,
    buildNextRecurringTask,
    isReminderDue,
    taskReminderFired,
    settleArrivedReminders,
    safeColor,
    reminderInstant,
    notificationKey,
    notificationPlan,
    sharedTextDraft,
    sharedResourceDraft,
    weekendDate,
    habitsMissedOn,
    calendarRepeats,
    noteTaskDraft,
    widgetSnapshot,
    habitsWidgetSnapshot,
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
    habitDurationOrNull,
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
    goalTaskSet,
    goalProgressSummary,
    goalProgressHistory,
    isGoalOverdue,
    goalReminderMoments,
    goalReminderDueMoments,
    overdueMilestones,
    habitScheduledOn,
    habitPeriodKey,
    habitWeekRule,
    recordWeekStartChange,
    habitTargetFor,
    recordHabitTargetChange,
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
