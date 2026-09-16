(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TodoCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const pad = n => String(n).padStart(2, '0');

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
    const recurrence = normalizeRecurrence(task && task.recurrence);
    if (!task || !recurrence) return null;
    const now = new Date(nowIso);
    const nowDate = Number.isNaN(now.getTime()) ? dateOnly() : dateOnly(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    let plannedDate = task.plannedDate ? nextRecurrenceDate(task.plannedDate, recurrence) : null;
    const dueDate = task.dueDate ? nextRecurrenceDate(task.dueDate, recurrence) : null;
    if (!plannedDate && !dueDate) plannedDate = nextRecurrenceDate(nowDate, recurrence);
    const id = String(newId || `task_${Date.now().toString(36)}`);
    return {
      ...task,
      id,
      plannedDate,
      dueDate,
      reminderAt: task.reminderAt ? advanceIsoTimestamp(task.reminderAt, recurrence) : null,
      reminderFiredAt: null,
      recurrence,
      attachmentIds: [],
      isInbox: false,
      isCompleted: false,
      completedAt: null,
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

  function tasksForTag(tasks, tagId) {
    return (tasks || []).filter(task => !task.isCompleted && Array.isArray(task.tagIds) && task.tagIds.includes(tagId));
  }

  function parseQuickPlanPhrase(rawTitle, today) {
    const original = String(rawTitle || '');
    const trimmed = original.trim();
    if (!trimmed) return { title: original, plannedDate: null };
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
    return ['areas', 'goals', 'habits', 'templates', 'savedViews']
      .find(key => Object.hasOwn(input, key) && !Array.isArray(input[key]));
  }

  function isNullableEntityId(value) {
    return value === null || typeof value === 'string' && value.trim();
  }

  function invalidExplicitV3Field(input) {
    if (Array.isArray(input.tasks)) {
      for (const task of input.tasks) {
        if (!task || typeof task !== 'object') continue;
        if (Object.hasOwn(task, 'areaId') && !isNullableEntityId(task.areaId)) return 'invalid-task-area-id';
        if (Object.hasOwn(task, 'goalIds') && !Array.isArray(task.goalIds)) return 'invalid-task-goal-ids';
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
    const collections = ['tasks', 'projects', 'tags', 'areas', 'goals', 'habits', 'templates', 'savedViews'];
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
    state.tasks = state.tasks.map(task => ({
      ...task,
      areaId: task.areaId || null,
      goalIds: Array.isArray(task.goalIds) ? task.goalIds : [],
      plannedTime: normalizeTime(task.plannedTime),
      dueTime: normalizeTime(task.dueTime),
    }));
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
    isOverdue,
    isInboxActive,
    deriveTodaySections,
    deriveAnytime,
    deriveUpcoming,
    nextRecurrenceDate,
    buildNextRecurringTask,
    isReminderDue,
    filterCompleted,
    searchItems,
    validateState,
    migrateStateV2,
    migrateStateV3,
    validateStateV3,
    effectiveTaskArea,
    normalizeTime,
    combineDateTime,
    normalizeTagName,
    validateTagName,
    tasksForTag,
    parseQuickPlanPhrase,
    cloneTaskForDuplicate,
  };
});
