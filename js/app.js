(function () {
  'use strict';

  const Core = window.TodoCore;
  const TodoStorage = window.TodoStorage;
  const Attachments = window.TodoAttachments;
  const Backup = window.TodoBackup;
  const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
  const MAX_ATTACHMENTS_PER_TASK = 10;
  const STORAGE_KEY = 'todoAppData';
  const VERSION = 3;
  const PROJECT_COLORS = ['#5362FF', '#30CBAD', '#A879FF', '#4CC9F0', '#F5B942', '#FF8A5B', '#F06A8A', '#8FD14F'];
  const AREA_ICONS = ['ph-briefcase', 'ph-house', 'ph-heart', 'ph-chart-line-up', 'ph-graduation-cap', 'ph-palette', 'ph-plant', 'ph-airplane'];
  const DATE_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const SHORT_DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
  const SHORTCUT_DEFAULTS = { newTask:'N', search:'Ctrl/Cmd+F', today:'T', inbox:'I', upcoming:'U', calendar:'C', goals:'G', habits:'H', templates:'Shift+T' };
  const SHORTCUT_LABELS = {newTask:'New task',search:'Search',today:'Today',inbox:'Inbox',upcoming:'Upcoming',calendar:'Calendar',goals:'Goals',habits:'Habits',templates:'Templates'};
  let shortcutError = '';
  const DATE_TIME_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  let state = null;
  let recovery = null;
  let startupPromise = null;
  const startupQueue = [];
  let storageError = false;
  let globalOperation = null;
  let globalRecoveryNotice = null;
  let modalState = null;
  let popoverEl = null;
  let undoState = null;
  const undoWork = new Set();
  const deleteOperations = new Set();
  const failedDeleteSnapshots = new Set();
  let undoGeneration = 0;
  let undoHold = null;
  let toastMessage = null;
  let toastMessageTimer = null;
  let textSaveTimer = null;
  let lastToday = Core.dateOnly();
  let dragState = null;
  let modalReturnFocus = null;
  let goalPropertyEditor = null;
  let habitPropertyEditor = null;
  let createdGoalFocusId = null;
  const knowledgeAttachmentCache = new Map();

  // Goal panels retain a logical trigger because rendering replaces its node.
  function goalFocusTarget(element = document.activeElement) {
    if (!(element instanceof HTMLElement)) return null;
    const keys = ['action', 'goalProperty', 'goalId', 'milestoneId', 'habitProperty', 'habitId', 'areaId', 'ownerType', 'ownerId', 'date'];
    const attrs = keys.filter(key => element.dataset[key] !== undefined).map(key => `[data-${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${CSS.escape(element.dataset[key])}"]`).join('');
    return { element, selector: attrs || (element.id ? '#' + CSS.escape(element.id) : '') };
  }

  function restoreGoalFocus(target) {
    if (!target) return;
    requestAnimationFrame(() => {
      const trigger = target.element?.isConnected ? target.element : target.selector && $(target.selector);
      const modal = $('#modal-root .modal');
      // A new decision may now be the highest overlay; never focus behind it.
      const control = modal ? (modal.contains(trigger) ? trigger : [...modal.querySelectorAll('input, select, textarea')].find(el => el.offsetParent !== null) || modal.querySelector('.modal-footer button, button')) : trigger || $('#main [data-goal-property="title"]') || $('#main [data-habit-property="name"]') || $('#main');
      control?.focus();
    });
  }
  let calendarReturnDate = null;
  const calendarHabitQueues = new Map();

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const nowIso = () => new Date().toISOString();
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const clampOrder = value => Number.isFinite(value) ? value : 999999;

  function parseLocalDate(value) {
    return Core.parseDateOnly(value);
  }

  function formatDate(value, mode = 'short') {
    const date = parseLocalDate(value);
    if (!date) return '';
    return mode === 'full' ? DATE_FMT.format(date) : SHORT_DATE_FMT.format(date);
  }

  function formatPageToday(today) {
    return DATE_FMT.format(parseLocalDate(today));
  }

  function relativeDateLabel(value, today = Core.dateOnly()) {
    if (!value) return '';
    if (value === today) return 'Today';
    if (value === Core.addDays(today, 1)) return 'Tomorrow';
    if (value === Core.addDays(today, -1)) return 'Yesterday';
    return formatDate(value);
  }

  function formatReminder(value) {
    if (!value) return 'No reminder';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'No reminder';
    return DATE_TIME_FMT.format(date);
  }

  function toLocalDateTimeValue(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function fromLocalDateTimeValue(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function recurrenceLabel(recurrence) {
    if (!recurrence) return 'Does not repeat';
    const interval = Math.max(1, Number(recurrence.interval) || 1);
    const unit = recurrence.frequency === 'daily' ? 'day' : recurrence.frequency === 'weekly' ? 'week' : 'month';
    if (interval === 1) return `Every ${unit}`;
    return `Every ${interval} ${unit}s`;
  }

  function createEmptyState() {
    return {
      version: VERSION,
      tasks: [],
      projects: [],
      tags: [],
      areas: [],
      goals: [],
      habits: [],
      notes: [],
      resources: [],
      templates: [],
      savedViews: [],
      settings: { weekStartsOn: 'monday', shortcuts: { ...SHORTCUT_DEFAULTS } },
      ui: {
        sidebarCollapsed: false,
        sidebarSections: {},
        suggestionsExpanded: false,
        todayCompletedExpanded: false,
        projectCompletedExpanded: {},
        completedProjectFilter: '',
        completedPeriod: 0,
        calendarView: 'week',
        calendarVisibility: { tasks: true, habits: true, goals: true, milestones: true },
      },
    };
  }

  function createSampleState() {
    const today = Core.dateOnly();
    const state = createEmptyState();
    const ts = nowIso();
    const projects = [
      { id: 'project_client', name: 'Client Website', color: PROJECT_COLORS[0], order: 0, areaId: null, goalIds: [], isArchived: false, createdAt: ts, updatedAt: ts },
      { id: 'project_portfolio', name: 'Portfolio', color: PROJECT_COLORS[2], order: 1, areaId: null, goalIds: [], isArchived: false, createdAt: ts, updatedAt: ts },
      { id: 'project_personal', name: 'Personal', color: PROJECT_COLORS[1], order: 2, areaId: null, goalIds: [], isArchived: false, createdAt: ts, updatedAt: ts },
    ];
    const mkTask = (id, title, extras = {}) => ({
      id,
      title,
      notes: '',
      projectId: null, areaId: null, goalIds: [],
      plannedDate: null, plannedTime: null,
      dueDate: null, dueTime: null,
      reminderAt: null,
      reminderFiredAt: null,
      recurrence: null,
      tagIds: [],
      priority: 'none',
      attachmentIds: [],
      isInbox: false,
      isCompleted: false,
      completedAt: null,
      subtasks: [],
      todayOrder: null,
      projectOrder: null,
      inboxOrder: null,
      createdAt: ts,
      updatedAt: ts,
      ...extras,
    });
    state.projects = projects;
    state.tasks = [
      mkTask('task_homepage', 'Finish homepage', {
        projectId: 'project_client', plannedDate: today, dueDate: Core.addDays(today, 3), todayOrder: 0, projectOrder: 0,
        notes: 'Finish responsive pass before sending the preview link.',
        subtasks: [
          { id: 'sub_mobile', title: 'Test responsive layout', isCompleted: false, order: 0 },
          { id: 'sub_form', title: 'Check contact form', isCompleted: true, order: 1 },
          { id: 'sub_link', title: 'Send preview link', isCompleted: false, order: 2 },
        ],
      }),
      mkTask('task_invoice', 'Send client invoice', { projectId: 'project_client', dueDate: Core.addDays(today, -1), projectOrder: 1 }),
      mkTask('task_groceries', 'Buy groceries', { projectId: 'project_personal', plannedDate: today, todayOrder: 1, projectOrder: 0 }),
      mkTask('task_plugin', 'Check plugin update', { isInbox: true, dueDate: Core.addDays(today, 2), inboxOrder: 0 }),
      mkTask('task_accountant', 'Call accountant', { isInbox: true, inboxOrder: 1 }),
      mkTask('task_copy', 'Review portfolio copy', { projectId: 'project_portfolio', plannedDate: Core.addDays(today, -1), dueDate: Core.addDays(today, 2), projectOrder: 0 }),
      mkTask('task_hosting', 'Renew hosting', { projectId: 'project_personal', dueDate: Core.addDays(today, 1), projectOrder: 1 }),
      mkTask('task_portfolio', 'Update portfolio case study', { projectId: 'project_portfolio', plannedDate: Core.addDays(today, 3), dueDate: Core.addDays(today, 7), projectOrder: 1 }),
      mkTask('task_done_today', 'Reply to client feedback', { projectId: 'project_client', isCompleted: true, completedAt: new Date().toISOString(), projectOrder: 2 }),
      mkTask('task_done_yesterday', 'Create homepage wireframe', { projectId: 'project_client', isCompleted: true, completedAt: new Date(Date.now() - 86400000).toISOString(), projectOrder: 3 }),
    ];
    return state;
  }

  function normalizeState(input) {
    const migrated = Core.migrateStateV3(input);
    if (!migrated.ok) throw new Error(migrated.reason || 'invalid-state');
    const next = migrated.state;
    next.settings = next.settings || { weekStartsOn: 'monday' };
    next.ui = next.ui || {};
    next.ui.sidebarSections = next.ui.sidebarSections || {};
    next.settings.shortcuts = Object.fromEntries(Object.entries(SHORTCUT_DEFAULTS).map(([key,value])=>[key,Object.hasOwn(next.settings.shortcuts || {},key) ? Core.normalizeShortcut(next.settings.shortcuts[key]) : value]));
    next.ui.sidebarCollapsed = Boolean(next.ui.sidebarCollapsed);
    next.ui.suggestionsExpanded = Boolean(next.ui.suggestionsExpanded);
    next.ui.todayCompletedExpanded = Boolean(next.ui.todayCompletedExpanded);
    next.ui.projectCompletedExpanded = next.ui.projectCompletedExpanded || {};
    next.ui.completedProjectFilter = next.ui.completedProjectFilter || '';
    next.ui.completedPeriod = Number(next.ui.completedPeriod) || 0;
    next.ui.selectedTagId = next.ui.selectedTagId || '';
    next.ui.areaTab = ['all', 'active', 'archived'].includes(next.ui.areaTab) ? next.ui.areaTab : 'all';
    next.ui.calendarView = next.ui.calendarView === 'month' ? 'month' : 'week';
    next.ui.calendarVisibility = Object.fromEntries(['tasks', 'habits', 'goals', 'milestones'].map(type => [type, next.ui.calendarVisibility?.[type] !== false]));
    next.tags = (next.tags || []).map((tag, i) => ({
      ...tag,
      id: tag.id || uid('tag'),
      name: Core.normalizeTagName(tag.name),
      color: tag.color || PROJECT_COLORS[i % PROJECT_COLORS.length],
      createdAt: tag.createdAt || nowIso(),
      updatedAt: tag.updatedAt || nowIso(),
    }));
    next.tasks = next.tasks.map(t => ({
      notes: '', projectId: null, plannedDate: null, dueDate: null, reminderAt: null,
      reminderFiredAt: null, recurrence: null, tagIds: [], priority: 'none', attachmentIds: [], isInbox: false,
      isCompleted: false, completedAt: null, subtasks: [], todayOrder: null,
      projectOrder: null, inboxOrder: null, createdAt: nowIso(), updatedAt: nowIso(), ...t,
      tagIds: Array.isArray(t.tagIds) ? t.tagIds : [],
      priority: ['none', 'low', 'medium', 'high'].includes(t.priority) ? t.priority : 'none',
      attachmentIds: Array.isArray(t.attachmentIds) ? t.attachmentIds : [],
      subtasks: (t.subtasks || []).map((s, i) => ({ ...s, id: s.id || uid('sub'), title: s.title || '', isCompleted: Boolean(s.isCompleted), order: Number.isFinite(s.order) ? s.order : i })),
    }));
    next.projects = next.projects.map((p, i) => ({ color: PROJECT_COLORS[i % PROJECT_COLORS.length], order: i, createdAt: nowIso(), updatedAt: nowIso(), isArchived: false, archivedAt: null, ...p }));
    next.areas = (next.areas || []).map((area, i) => ({
      name: '', color: PROJECT_COLORS[i % PROJECT_COLORS.length], icon: AREA_ICONS[0], status: 'active', isPinned: false,
      createdAt: nowIso(), updatedAt: nowIso(), ...area,
      name: Core.normalizeTagName(area.name),
      status: area.status === 'archived' ? 'archived' : 'active',
      isPinned: Boolean(area.isPinned),
    }));
    for (const key of ['notes', 'resources']) next[key] = next[key].map(item => ({
      ...item, createdAt: item.createdAt || nowIso(), updatedAt: item.updatedAt || nowIso(),
    }));
    next.goals = (next.goals || []).map(goal => ({
      title: '', areaId: null, horizon: 'short', status: 'active', progressMode: 'manual', progressType: 'percentage',
      currentValue: 0, targetValue: 100, unit: '', targetDate: null, projectLinks: [], taskIds: [], habitLinks: [], milestones: [],
      reminders: { sevenDaysBefore: false, threeDaysBefore: false, oneDayBefore: false, onTargetDate: false, time: '09:00' },
      reminderFiredMoments: [], createdAt: nowIso(), updatedAt: nowIso(), completedAt: null, ...goal,
      title: String(goal.title || goal.name || '').trim(),
      areaId: goal.areaId || null,
      status: ['active', 'paused', 'completed', 'archived'].includes(goal.status) ? goal.status : 'active',
      progressMode: ['manual', 'linkedTasks', 'linkedHabits'].includes(goal.progressMode) ? goal.progressMode : 'manual',
      progressType: goal.progressType === 'numeric' ? 'numeric' : 'percentage',
      projectLinks: Array.isArray(goal.projectLinks) ? goal.projectLinks : [], taskIds: Array.isArray(goal.taskIds) ? goal.taskIds : [],
      habitLinks: Array.isArray(goal.habitLinks) ? goal.habitLinks : [], milestones: Array.isArray(goal.milestones) ? goal.milestones : [],
      reminderFiredMoments: Array.isArray(goal.reminderFiredMoments) ? goal.reminderFiredMoments : [],
      reminders: { sevenDaysBefore: false, threeDaysBefore: false, oneDayBefore: false, onTargetDate: false, time: '09:00', ...(goal.reminders || {}) },
    }));
    next.habits = (next.habits || []).map(habit => ({
      name: '', areaId: null, routine: 'daily', goalIds: [], status: 'active', trackingType: 'checkbox', targetValue: null, unit: null,
      quickValues: [], frequencyType: 'daily', weekdays: [], timesPerWeek: null, everyNDays: null, startDate: Core.dateOnly(),
      continuation: 'automatic', endType: 'never', endDate: null, successfulPeriodsTarget: null, reminders: [], reminderFiredMoments: [],
      createdAt: nowIso(), updatedAt: nowIso(), ...habit,
      name: String(habit.name || habit.title || '').trim(), areaId: habit.areaId || null,
      goalIds: Array.isArray(habit.goalIds) ? habit.goalIds : [], quickValues: Array.isArray(habit.quickValues) ? habit.quickValues.map(Number).filter(Number.isFinite) : [],
      weekdays: Array.isArray(habit.weekdays) ? habit.weekdays.map(Number).filter(day => day >= 0 && day <= 6) : [],
      reminders: Array.isArray(habit.reminders) ? habit.reminders.map(item => ({ id: item.id || uid('habit-reminder'), time: Core.normalizeTime(item.time) || '09:00', enabled: item.enabled !== false })) : [],
      reminderFiredMoments: Array.isArray(habit.reminderFiredMoments) ? habit.reminderFiredMoments : [],
      status: ['active', 'paused', 'archived'].includes(habit.status) ? habit.status : 'active',
      trackingType: habit.trackingType === 'numeric' ? 'numeric' : 'checkbox',
      frequencyType: ['daily', 'weekdays', 'timesPerWeek', 'everyNDays'].includes(habit.frequencyType) ? habit.frequencyType : 'daily',
    }));
    next.habitMetrics = next.habitMetrics || {};
    return next;
  }

  async function loadState(incoming, sourceRetries = 0) {
    recovery = 'migration-loading';
    state = null;
    let preparingStorage = false;
    try {
      preparingStorage = true;
      await TodoStorage.open();
      const retained = (await TodoStorage.recoverySnapshots.listAll()).filter(item => ['reset','restore'].includes(item.reason));
      // A crash or failed housekeeping write can leave a fully committed domain
      // tagged as mutating. Verify its exact destination afresh before choosing
      // cleanup; never roll verified new data back because cleanup failed.
      for (const item of retained.filter(item => item.phase === 'mutating' && item.destination)) {
        if (localStorage.getItem(STORAGE_KEY) === item.destination.rawAppData
          && Core.validateStateV3(JSON.parse(item.destination.rawAppData)).ok
          && await TodoStorage.sameUserData(await TodoStorage.captureUserData(), item.destination)
          && localStorage.getItem(STORAGE_KEY) === item.destination.rawAppData) {
          item.phase = 'committed';
          try { await TodoStorage.recoverySnapshots.put(item); }
          catch (_) { globalOperation = { reason: 'cleanup', busy: true }; }
        }
      }
      const interrupted = retained.find(item => ['mutating','rollback-failed'].includes(item.phase));
      if (interrupted) {
        const op = { snapshotId: interrupted.id, reason: interrupted.reason, token: null };
        globalOperation = op; recovery = 'global-recovery';
        globalNotice(`An interrupted operation needs recovery. ${interrupted.operationError || ''} ${interrupted.rollbackError || ''} Recovery copy retained. Retry recovery.`, () => rollbackGlobalOperation(op, new Error(interrupted.operationError || 'Interrupted operation')));
        return;
      }
      if (retained.length) globalNotice('A temporary recovery copy remains after a completed or canceled operation. Retry cleanup.', async () => {
        await TodoStorage.recoverySnapshots.deleteMany(retained.map(item => item.id));
        if (globalOperation?.reason === 'cleanup') globalOperation = null;
        globalRecoveryNotice = null; renderToast();
      });
      preparingStorage = false;
      const sourceAtStart = localStorage.getItem(STORAGE_KEY);
      // Real events must still identify the current source. Synthetic events deliberately
      // override an unchanged source (the established test/embedding newValue contract).
      const currentIncoming = incoming && incoming.source === sourceAtStart
        && (incoming.synthetic || incoming.raw === sourceAtStart);
      const raw = currentIncoming ? incoming.raw : sourceAtStart;
      if (!raw) {
        preparingStorage = true;
        await TodoStorage.open();
        if (localStorage.getItem(STORAGE_KEY) !== sourceAtStart) {
          if (sourceRetries < 3) return loadState(undefined, sourceRetries + 1);
          throw new Error('Local data keeps changing in another tab; retry migration.');
        }
        recovery = null;
        state = createSampleState();
        saveState();
        return localStorage.getItem(STORAGE_KEY);
      }
      const parsed = JSON.parse(raw);
      const migration = Core.migrateStateV3(parsed);
      if (!migration.ok) {
        recovery = migration.reason;
        state = null;
        return;
      }
      const prepared = normalizeState(migration.state);
      preparingStorage = true;
      const snapshotId = await TodoStorage.prepareMigration(raw, prepared, migration.migrated);
      const validation = Core.validateStateV3(prepared);
      if (!validation.ok) throw new Error(validation.reason);
      if (localStorage.getItem(STORAGE_KEY) !== sourceAtStart) {
        if (sourceRetries < 3) return loadState(undefined, sourceRetries + 1);
        throw new Error('Local data keeps changing in another tab; retry migration.');
      }
      let committedSource = sourceAtStart;
      if (migration.migrated) {
        const persisted = { ...prepared };
        delete persisted.habitLogCache;
        delete persisted.habitMetrics;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
        committedSource = localStorage.getItem(STORAGE_KEY);
      }
      // Snapshot removal is post-commit housekeeping, not part of migration success.
      try { await TodoStorage.finishMigration(snapshotId); }
      catch (error) { console.warn('Migration complete; safety snapshot cleanup will retry on reload.', error); }
      if (localStorage.getItem(STORAGE_KEY) !== committedSource) {
        if (sourceRetries < 3) return loadState(undefined, sourceRetries + 1);
        throw new Error('Local data keeps changing in another tab; retry migration.');
      }
      recovery = null;
      state = prepared;
      return committedSource;
    } catch (error) {
      console.error(error);
      recovery = preparingStorage ? 'migration-error' : error && error.message === 'unsupported-version' ? 'unsupported-version' : 'corrupted-data';
      state = null;
    }
  }

  function saveState() {
    if (!state || globalOperation) return false;
    try {
      const persisted = { ...state };
      delete persisted.habitLogCache;
      delete persisted.habitMetrics;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      storageError = false;
      return true;
    } catch (error) {
      console.error(error);
      storageError = true;
      return false;
    }
  }

  function saveAndRender() {
    saveState();
    render();
  }

  function scheduleTextSave() {
    clearTimeout(textSaveTimer);
    textSaveTimer = setTimeout(() => saveState(), 220);
  }

  function flushTextSave() {
    if (textSaveTimer) {
      clearTimeout(textSaveTimer);
      textSaveTimer = null;
      saveState();
    }
  }

  function getProject(id) {
    return state?.projects.find(p => p.id === id) || null;
  }

  function getTask(id) {
    return state?.tasks.find(t => t.id === id) || null;
  }

  function getTag(id) {
    return state?.tags?.find(t => t.id === id) || null;
  }

  function getArea(id) {
    return state?.areas?.find(area => area.id === id) || null;
  }

  function getGoal(id) {
    return state?.goals?.find(goal => goal.id === id) || null;
  }

  function getHabit(id) {
    return state?.habits?.find(habit => habit.id === id) || null;
  }

  function attachmentOwner(owner) {
    if (!state) return null;
    const descriptor = typeof owner === 'string' ? { ownerType: 'task', ownerId: owner } : owner;
    return TodoStorage.attachmentOwners(state).find(candidate => candidate.type === descriptor?.ownerType && candidate.item.id === descriptor.ownerId) || null;
  }

  const knowledgeCollection = type => type === 'note' ? 'notes' : 'resources';
  const knowledgeLabel = type => type === 'note' ? 'Note' : 'Resource';
  const knowledgeIcon = type => type === 'note' ? 'ph-note' : 'ph-link';

  function currentRoute() {
    const hash = location.hash.replace(/^#/, '') || 'today';
    if (['today', 'inbox', 'upcoming', 'calendar', 'anytime', 'tags', 'areas', 'notes', 'resources', 'goals', 'habits', 'templates', 'projects', 'saved-views', 'archived', 'completed', 'settings'].includes(hash)) return { type: hash };
    for (const type of ['note', 'resource']) if (hash.startsWith(type + '/')) {
      const id = decodeURIComponent(hash.slice(type.length + 1));
      return attachmentOwner({ ownerType: type, ownerId: id }) ? { type, id } : { type: knowledgeCollection(type) };
    }
    if (hash.startsWith('saved-view/')) return {type:'saved-view',id:decodeURIComponent(hash.slice('saved-view/'.length))};
    if (hash.startsWith('project/')) {
      const id = decodeURIComponent(hash.slice('project/'.length));
      if (getProject(id)) return { type: 'project', id };
      return { type: 'today' };
    }
    if (hash.startsWith('area/')) {
      const id = decodeURIComponent(hash.slice('area/'.length));
      if (getArea(id)) return { type: 'area', id };
      return { type: 'areas' };
    }
    if (hash.startsWith('goal/')) {
      const id = decodeURIComponent(hash.slice('goal/'.length));
      if (getGoal(id)) return { type: 'goal', id };
      return { type: 'goals' };
    }
    if (hash.startsWith('habit/')) {
      const id = decodeURIComponent(hash.slice('habit/'.length));
      if (getHabit(id)) return { type: 'habit', id };
      return { type: 'habits' };
    }
    return { type: 'today' };
  }

  function navigate(route) {
    closePopover();
    closeModal();
    const target = route.startsWith('#') ? route : `#${route}`;
    if (location.hash === target) render();
    else location.hash = target;
  }

  function allProjects() {
    return [...state.projects].sort((a, b) => clampOrder(a.order) - clampOrder(b.order) || a.name.localeCompare(b.name));
  }

  function sortedProjects() {
    return allProjects().filter(project => !project.isArchived);
  }

  function sortedAreas() {
    return [...(state.areas || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  function activeInboxTasks() {
    return state.tasks.filter(Core.isInboxActive).sort((a, b) => clampOrder(a.inboxOrder) - clampOrder(b.inboxOrder) || b.createdAt.localeCompare(a.createdAt));
  }

  function projectTasks(projectId, completed = false) {
    return state.tasks
      .filter(t => t.projectId === projectId && Boolean(t.isCompleted) === completed)
      .sort(completed
        ? (a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || ''))
        : (a, b) => clampOrder(a.projectOrder) - clampOrder(b.projectOrder) || b.createdAt.localeCompare(a.createdAt));
  }

  function render() {
    const app = $('#app');
    if (!app) return;
    if (recovery) {
      app.classList.remove('is-collapsed');
      $('#sidebar').innerHTML = '';
      $('#main').innerHTML = renderRecovery();
      return;
    }
    app.classList.toggle('is-collapsed', Boolean(state.ui.sidebarCollapsed));
    renderSidebar();
    renderMain();
  }

  function renderSidebar() {
    const route = currentRoute();
    const inboxCount = activeInboxTasks().length;
    const collapsed = state.ui.sidebarCollapsed;
    const projects = sortedProjects();
    const pinnedAreas = sortedAreas().filter(area => area.status === 'active' && area.isPinned);
    const moduleRoute = {project:'projects',area:'areas',note:'notes',resource:'resources',goal:'goals',habit:'habits','saved-view':'saved-views'}[route.type];
    const link = (path,icon,label) => navItem(path,icon,label,route.type === path || moduleRoute === path || path.startsWith(route.type+'/') && route.id === path.split('/')[1]);
    const group = (key,label,body) => `<section class="sidebar-section" data-sidebar-section="${key}"><button class="sidebar-section-title sidebar-section-toggle" type="button" data-action="toggle-sidebar-section" data-section="${key}" aria-expanded="${!state.ui.sidebarSections[key]}" aria-controls="sidebar-${key}" title="${label}"><span>${label}</span><i class="ph ${state.ui.sidebarSections[key]?'ph-caret-right':'ph-caret-down'}"></i></button><div class="sidebar-section-body" id="sidebar-${key}" ${state.ui.sidebarSections[key]?'hidden':''}>${body}</div></section>`;
    $('#sidebar').innerHTML = `
      <div class="sidebar-header">
        <div class="brand" title="To Do prototype">
          <span class="brand-mark" aria-hidden="true"></span>
          <span class="brand-name">To Do</span>
        </div>
        <button class="btn-icon sidebar-collapse" type="button" data-action="toggle-sidebar" aria-label="${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}" title="${collapsed ? 'Expand sidebar' : 'Collapse sidebar'}">
          <i class="ph ph-sidebar-simple"></i>
        </button>
      </div>
      <div class="sidebar-scroll">
        <nav class="nav-group" aria-label="Task views">
          ${navItem('today', 'ph-sun', 'Today', route.type === 'today', '', 'data-drop-plan="today"')}
          ${navItem('inbox', 'ph-tray', 'Inbox', route.type === 'inbox', inboxCount || '')}
          ${navItem('upcoming', 'ph-calendar-dots', 'Upcoming', route.type === 'upcoming')}
          ${navItem('calendar', 'ph-calendar-blank', 'Calendar', route.type === 'calendar')}
          <div class="task-context-drop tomorrow-drop-target" data-drop-plan="tomorrow" aria-label="Drop task to plan for tomorrow"><i class="ph ph-arrow-bend-down-right"></i><span>Tomorrow</span></div>
        </nav>

        ${group('work','WORK',`
          ${link('projects','ph-folder','Projects')}
          <div class="projects-list" data-drop-context="projects">
            ${projects.map(project => `
              <button class="project-item ${route.type === 'project' && route.id === project.id ? 'is-active' : ''}" type="button" data-route="project/${esc(project.id)}" data-project-id="${esc(project.id)}" data-drop-project-id="${esc(project.id)}" draggable="true" title="${esc(project.name)}">
                <span class="project-dot" style="--project-color:${esc(project.color)}"></span>
                <span class="project-name">${esc(project.name)}</span>
              </button>`).join('')}
          </div>
          <button class="sidebar-action sidebar-new-project" type="button" data-action="new-project" title="New project">
            <i class="ph ph-plus"></i><span>New project</span>
          </button>
          ${link('areas','ph-squares-four','Areas')}${link('notes','ph-note','Notes')}${link('resources','ph-link','Resources')}${link('tags','ph-tag','Tags')}`)}
        ${group('progress','PROGRESS',link('goals','ph-target','Goals')+link('habits','ph-repeat','Habits'))}
        ${group('tools','TOOLS',link('templates','ph-copy','Templates')+link('saved-views','ph-funnel','Saved Views'))}
        ${group('pinned-areas','PINNED AREAS',`<div class="pinned-areas-list">${pinnedAreas.map(area => `<button class="sidebar-action pinned-area ${route.type === 'area' && route.id === area.id ? 'is-active' : ''}" type="button" data-route="area/${esc(area.id)}" title="${esc(area.name)}"><i class="ph ${esc(area.icon)}" style="color:${esc(area.color)}"></i><span>${esc(area.name)}</span></button>`).join('')}</div>`)}
        ${group('pinned-views','PINNED VIEWS',state.savedViews.filter(v=>v.isPinned).map(v=>link('saved-view/'+esc(v.id),'ph-funnel',esc(v.name))).join(''))}
        ${group('more','MORE',link('completed','ph-check-circle','Completed')+link('archived','ph-archive','Archived Projects')+link('settings','ph-gear','Settings'))}

        <div class="sidebar-footer">
          <button class="sidebar-action" type="button" data-action="open-search" title="Search">
            <i class="ph ph-magnifying-glass"></i><span>Search</span>
          </button>
          <button class="sidebar-action" type="button" data-action="more-menu" title="More">
            <i class="ph ph-dots-three-outline"></i><span>More</span>
          </button>
        </div>
      </div>`;
  }

  function navItem(route, icon, label, active, badge = '', attrs = '') {
    return `<button class="nav-item ${active ? 'is-active' : ''}" type="button" data-route="${route}" ${attrs} title="${label}">
      <i class="ph ${icon}"></i><span class="nav-label">${label}</span>${badge ? `<span class="nav-badge">${badge}</span>` : ''}
    </button>`;
  }

  function renderMain() {
    const route = currentRoute();
    const main = $('#main');
    const warning = storageError ? `<div class="global-warning" role="alert"><i class="ph ph-warning-circle"></i> Changes couldn't be saved locally. Refreshing may cause data loss.</div>` : '';
    let content = '';
    if (route.type === 'templates') content = renderTemplates();
    else if (route.type === 'saved-views') content = renderSavedViews();
    else if (route.type === 'saved-view') content = renderSavedView(route.id);
    else if (route.type === 'projects') content = renderProjects();
    else if (route.type === 'today') content = renderToday();
    else if (route.type === 'inbox') content = renderInbox();
    else if (route.type === 'upcoming') content = renderUpcoming();
    else if (route.type === 'calendar') content = renderCalendar();
    else if (route.type === 'anytime') content = renderAnytime();
    else if (route.type === 'tags') content = renderTags();
    else if (route.type === 'areas') content = renderAreas();
    else if (route.type === 'area') content = renderArea(route.id);
    else if (route.type === 'notes' || route.type === 'resources') content = renderKnowledgeList(route.type === 'notes' ? 'note' : 'resource');
    else if (route.type === 'note' || route.type === 'resource') content = renderKnowledgeDetail(route.type, route.id);
    else if (route.type === 'goals') content = renderGoals();
    else if (route.type === 'goal') content = renderGoal(route.id);
    else if (route.type === 'habits') content = renderHabits();
    else if (route.type === 'habit') content = renderHabit(route.id);
    else if (route.type === 'archived') content = renderArchivedProjects();
    else if (route.type === 'project') content = renderProject(route.id);
    else if (route.type === 'completed') content = renderCompleted();
    else if (route.type === 'settings') content = renderSettings();
    else content = renderToday();
    main.innerHTML = `${warning}<div class="content ${route.type === 'calendar' ? 'calendar-content' : ''}">${content}</div>`;
    if (createdGoalFocusId && route.type === 'goal' && route.id === createdGoalFocusId) {
      createdGoalFocusId = null;
      restoreGoalFocus(goalFocusTarget(main.querySelector('[data-goal-property="title"]')));
    }
  }

  function pageHeader(title, subtitle, options = {}) {
    const addButton = options.add !== false ? `<button class="btn btn-primary" type="button" data-action="quick-add" ${options.contextProjectId ? `data-project-id="${esc(options.contextProjectId)}"` : ''} ${options.contextToday ? 'data-today="true"' : ''} ${options.contextAnytime ? 'data-anytime="true"' : ''}><i class="ph ph-plus"></i> Add task</button>` : '';
    const projectMenu = options.projectMenu ? `<button class="btn-icon" type="button" data-action="project-menu" data-project-id="${esc(options.projectMenu)}" aria-label="Project menu"><i class="ph ph-dots-three"></i></button>` : '';
    const actionHtml = options.actionHtml || '';
    return `<header class="page-header">
      <div><h1 class="page-title">${esc(title)}</h1>${subtitle ? `<p class="page-subtitle">${esc(subtitle)}</p>` : ''}</div>
      <div class="page-actions">
        <button class="btn btn-secondary" type="button" data-action="open-search"><i class="ph ph-magnifying-glass"></i> Search</button>
        ${actionHtml}${projectMenu}${addButton}
      </div>
    </header>`;
  }

  function calendarLogs() {
    return Object.values(state.habitLogCache || {}).flat();
  }

  function calendarDate() {
    return Core.parseDateOnly(state.ui.calendarDate) ? state.ui.calendarDate : Core.dateOnly();
  }

  function calendarItem(entry, detail = false, date = calendarDate()) {
    const { task, habit, goal, milestone } = entry;
    const id = task?.id || habit?.id || milestone?.id || goal?.id;
    const title = task?.title || habit?.name || milestone?.title || goal?.title;
    const completed = task ? task.isCompleted : milestone ? milestone.isCompleted : goal?.status === 'completed';
    const open = task ? `data-action="open-task" data-task-id="${esc(id)}"` : `data-route="${habit ? 'habit' : 'goal'}/${esc(habit ? id : goal.id)}"`;
    const metadata = task ? [entry.kind.includes('planned') ? `Planned${task.plannedTime ? ` ${task.plannedTime}` : ''}` : '', entry.kind.includes('due') ? `Due${task.dueTime ? ` ${task.dueTime}` : ''}` : '', task.isCompleted ? 'Completed' : ''].filter(Boolean).join(' · ')
      : habit ? `${habit.trackingType === 'numeric' ? `${entry.status.value || 0} / ${habit.targetValue} ${habit.unit || ''} · ` : ''}${entry.status.status}`
      : milestone ? `Milestone · ${goal.title}${milestone.isCompleted ? ' · Completed' : ''}` : `Goal · ${goalStatusLabel(goal)} · ${goalProgressLabel(goal)}`;
    let actions = '';
    if (detail && task) actions = `<button class="quick-chip" type="button" data-action="toggle-complete" data-task-id="${esc(id)}">${task.isCompleted ? 'Reopen' : 'Complete'}</button><button class="quick-chip" type="button" data-action="calendar-task-move" data-task-id="${esc(id)}">Move</button>`;
    if (detail && habit) {
      const disabled = date > Core.dateOnly() ? 'disabled' : '';
      actions = habit.trackingType === 'numeric' ? (habit.quickValues || []).map(value => `<button class="quick-chip" type="button" data-action="calendar-habit-add" data-habit-id="${esc(id)}" data-date="${date}" data-value="${value}" ${disabled}>+${value}</button>`).join('') + `<button class="quick-chip" type="button" data-action="calendar-habit-edit" data-habit-id="${esc(id)}" data-date="${date}" ${disabled}>Edit value</button>` : `<button class="quick-chip" type="button" data-action="calendar-habit-checkin" data-habit-id="${esc(id)}" data-date="${date}" ${disabled}>${entry.status.status === 'done' ? 'Undo check-in' : 'Check in'}</button>`;
    }
    if (detail && goal && !milestone) actions = `<button class="quick-chip" type="button" data-action="calendar-goal-progress" data-goal-id="${esc(id)}">Update progress</button>`;
    if (detail && milestone) actions = `<button class="quick-chip" type="button" data-action="toggle-milestone" data-goal-id="${esc(goal.id)}" data-milestone-id="${esc(id)}">${milestone.isCompleted ? 'Reopen' : 'Complete'}</button>`;
    return `<article class="calendar-item calendar-${entry.type} ${completed ? 'is-completed' : ''}" data-calendar-item-id="${esc(id)}" data-calendar-type="${entry.type}" ${!detail && (task || (!milestone && goal)) ? `draggable="true" data-calendar-drag="${entry.type}"` : ''}><button class="calendar-item-open" type="button" ${open}><strong>${esc(title)}</strong><small>${esc(metadata)}</small></button>${detail ? `<div class="calendar-quick-actions">${actions}<button class="quick-chip" type="button" ${open}>${milestone ? 'Open Goal' : 'Open'}</button></div>` : ''}</article>`;
  }

  function calendarCounts(counts) {
    return Object.entries(counts).filter(([, count]) => count).map(([type, count]) => `${count} ${count === 1 ? type.slice(0, -1) : type}`).join(' · ');
  }

  function renderCalendar() {
    const date = calendarDate(); const view = state.ui.calendarView === 'month' ? 'month' : 'week';
    const visibility = { tasks: true, habits: true, goals: true, milestones: true, ...(state.ui.calendarVisibility || {}) };
    const weekStart = Core.habitPeriodKey({ frequencyType: 'timesPerWeek' }, date, state.settings.weekStartsOn || 'monday');
    const month = date.slice(0, 7);
    const period = view === 'month' ? new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(parseLocalDate(`${month}-01`)) : `${formatDate(weekStart)} – ${formatDate(Core.addDays(weekStart, 6))}, ${parseLocalDate(date).getFullYear()}`;
    let html = pageHeader('Calendar', 'Plan tasks, goals and habits by date.', { add: false, actionHtml: `<button class="btn btn-primary" type="button" data-action="calendar-add" data-date="${date}"><i class="ph ph-plus"></i> Add</button>` });
    html += `<div class="calendar-toolbar"><div class="calendar-navigation"><button class="btn-icon" type="button" data-action="calendar-prev" aria-label="Previous ${view}"><i class="ph ph-caret-left"></i></button><h2 class="calendar-period">${esc(period)}</h2><button class="btn-icon" type="button" data-action="calendar-next" aria-label="Next ${view}"><i class="ph ph-caret-right"></i></button><button class="btn btn-ghost" type="button" data-action="calendar-today">Today</button></div><div class="list-tabs" aria-label="Calendar view">${['week', 'month'].map(mode => `<button class="btn btn-ghost ${view === mode ? 'is-active' : ''}" type="button" data-action="calendar-view" data-view="${mode}" aria-pressed="${view === mode}">${mode === 'week' ? 'Week' : 'Month'}</button>`).join('')}</div></div><div class="calendar-visibility" aria-label="Show calendar types"><span>Show</span>${Object.entries(visibility).map(([type, visible]) => `<label><input type="checkbox" data-calendar-visibility="${type}" ${visible ? 'checked' : ''}>${type[0].toUpperCase() + type.slice(1)}</label>`).join('')}</div>`;
    if (view === 'week') {
      const days = Core.deriveCalendarWeek(state, calendarLogs(), weekStart);
      html += `<div class="calendar-scroll"><div class="calendar-week">${days.map(day => `<section class="calendar-day ${day.date === Core.dateOnly() ? 'is-today' : ''} ${day.date === date ? 'is-selected' : ''}" data-calendar-date="${day.date}"><button class="calendar-day-heading" type="button" data-action="calendar-detail" data-date="${day.date}"><span>${new Intl.DateTimeFormat('en', { weekday: 'short' }).format(parseLocalDate(day.date))}</span><strong>${parseLocalDate(day.date).getDate()}</strong></button><div class="calendar-region-label">All day</div><div class="calendar-all-day">${day.allDay.map(entry => calendarItem(entry, false, day.date)).join('')}</div><div class="calendar-region-label">Timed</div><div class="calendar-timed">${day.timed.map(entry => calendarItem(entry, false, day.date)).join('')}</div></section>`).join('')}</div></div>`;
    } else {
      const days = Core.deriveCalendarMonthSummary(state, calendarLogs(), month);
      const startDay = parseLocalDate(days[0].date).getDay(); const firstWeekday = state.settings.weekStartsOn === 'sunday' ? 0 : 1;
      const offset = (startDay - firstWeekday + 7) % 7;
      html += `<div class="calendar-month">${Array.from({ length: 7 }, (_, i) => `<div class="calendar-weekday">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][(firstWeekday + i) % 7]}</div>`).join('')}${Array.from({ length: offset }, () => '<div class="calendar-month-blank" aria-hidden="true"></div>').join('')}${days.map(day => `<button class="calendar-month-day ${day.date === Core.dateOnly() ? 'is-today' : ''} ${day.date === date ? 'is-selected' : ''}" type="button" data-calendar-date="${day.date}" data-action="calendar-detail" data-date="${day.date}"><strong>${parseLocalDate(day.date).getDate()}</strong><span class="calendar-counts">${esc(calendarCounts(day.counts))}</span></button>`).join('')}</div>`;
    }
    return html;
  }

  function openCalendarDetail(date) {
    if (!Core.parseDateOnly(date)) return;
    state.ui.calendarDate = date; saveState(); render();
    calendarReturnDate = date;
    modalReturnFocus = $(`[data-action="calendar-detail"][data-date="${date}"]`) || $('[data-action="calendar-add"]');
    modalState = { type: 'calendar-day', date }; renderModal();
    requestAnimationFrame(() => $('.calendar-day-detail [data-action="close-modal"]')?.focus());
  }

  function renderCalendarDetail() {
    const date = modalState.date; const day = Core.deriveCalendarDay(state, calendarLogs(), date);
    return modalFrame(`<div class="modal-inner calendar-day-detail" data-detail-date="${date}"><div class="modal-header"><h2 class="modal-title">Day Detail · ${date}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><p class="page-subtitle">${esc(formatDate(date, 'full'))}</p><div class="calendar-detail-items">${[...day.allDay, ...day.timed].map(entry => calendarItem(entry, true, date)).join('') || '<p class="area-empty-copy">No visible items for this date.</p>'}</div><div class="calendar-creation">${['task', 'goal', 'habit'].map(type => `<button class="btn btn-secondary" type="button" data-action="calendar-new-${type}" data-date="${date}"><i class="ph ph-plus"></i> ${type[0].toUpperCase() + type.slice(1)}</button>`).join('')}</div></div>`);
  }

  function navigateCalendar(direction) {
    const date = parseLocalDate(calendarDate());
    state.ui.calendarDate = state.ui.calendarView === 'month' ? Core.dateOnly(new Date(date.getFullYear(), date.getMonth() + direction, 1)) : Core.addDays(calendarDate(), direction * 7);
    saveAndRender();
  }

  function calendarHabitAction(el, mode) {
    const id = el.dataset.habitId; const date = el.dataset.date;
    const increment = Number(el.dataset.value);
    const key = JSON.stringify([id, date]);
    const previous = calendarHabitQueues.get(key) || Promise.resolve();
    // Read the refreshed total only when this accepted activation starts.
    // A failed predecessor must release later activations, not poison them.
    const operation = previous.catch(() => {}).then(async () => {
      const existing = state.habitLogCache?.[id]?.find(log => log.date === date);
      const value = mode === 'add' ? Number(existing?.value || 0) + increment : null;
      await setHabitLog(id, date, mode === 'check' && existing?.status === 'done' ? 'missed' : 'done', value);
      if (modalState?.type === 'calendar-day' && modalState.date === date) renderModal();
    });
    calendarHabitQueues.set(key, operation);
    const release = () => { if (calendarHabitQueues.get(key) === operation) calendarHabitQueues.delete(key); };
    operation.then(release, release);
    return operation;
  }

  function openCalendarValue(habitId, date) {
    if (date > Core.dateOnly()) return;
    // Keep the Day Detail usable as the keyboard return point for its quick edit.
    modalState = { type: 'calendar-value', habitId, date, previous: modalState, returnFocus: goalFocusTarget() }; renderModal();
    requestAnimationFrame(() => $('#calendar-habit-value')?.focus());
  }

  function renderCalendarValue() {
    const { habitId, date } = modalState;
    const value = state.habitLogCache?.[habitId]?.find(log => log.date === date)?.value || 0;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">Edit value · ${esc(getHabit(habitId)?.name)}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><label class="field-label">${date}<input class="input" id="calendar-habit-value" type="number" min="0" step="any" value="${value}"></label><button class="btn btn-primary" type="button" data-action="calendar-save-habit-value" data-habit-id="${esc(habitId)}" data-date="${date}">Save value</button></div>`);
  }

  function openCalendarGoalProgress(goalId) {
    const goal = getGoal(goalId); if (!goal) return;
    if (goal.progressMode !== 'manual') { navigate(`goal/${goalId}`); return; }
    // This panel is launched from Day Detail too, so Esc should return there.
    modalState = { type: 'calendar-progress', goalId, previous: modalState, returnFocus: goalFocusTarget() }; renderModal();
    requestAnimationFrame(() => $('#goal-current-value')?.focus());
  }

  function renderCalendarGoalProgress() {
    const goal = getGoal(modalState.goalId);
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">Update progress · ${esc(goal.title)}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><label class="field-label">${goal.progressType === 'numeric' ? 'Current value' : 'Progress percentage'}<input id="goal-current-value" class="input" type="number" value="${goal.currentValue}"></label><button class="btn btn-primary" type="button" data-action="save-goal-progress" data-goal-id="${esc(goal.id)}">Update progress</button></div>`);
  }

  function renderToday() {
    const today = Core.dateOnly();
    const sections = Core.deriveTodayV3(state, Object.values(state.habitLogCache || {}).flat(), today);
    const total = sections.today.length;
    let html = pageHeader('Today', `${formatPageToday(today)}${total ? ` · ${total} ${total === 1 ? 'task' : 'tasks'}` : ''}`, { contextToday: true });

    if (sections.overdue.length) {
      html += `<section class="section"><div class="section-header"><h2 class="section-label danger">Overdue Tasks</h2><span class="section-count">${sections.overdue.length}</span></div><div class="task-list">${sections.overdue.map(t => taskRow(t, 'today', { overdue: true })).join('')}</div></section>`;
    }

    if (sections.today.length || sections.suggestions.length) {
      html += `<section class="section"><div class="section-header"><h2 class="section-label">Tasks</h2><span class="section-count">${sections.today.length}</span></div>`;
      if (sections.today.length) html += `<div class="task-list" data-list-context="today">${sections.today.map(t => taskRow(t, 'today', { draggable: true })).join('')}</div>`;
      html += `<button class="inline-add" type="button" data-action="quick-add" data-today="true"><i class="ph ph-plus"></i> Add task</button>`;
      if (sections.suggestions.length) {
        const open = state.ui.suggestionsExpanded;
        html += `<div><button class="collapsible-trigger" type="button" data-action="toggle-suggestions" aria-expanded="${open}"><span class="left"><i class="ph ph-sparkle"></i> Suggested for today</span><span>${sections.suggestions.length} <i class="ph ph-caret-${open ? 'up' : 'down'}"></i></span></button>`;
        if (open) html += `<div class="task-list">${sections.suggestions.map(item => taskRow(item.task, 'suggestion', { suggestionReason: item.reason })).join('')}</div><button class="btn btn-ghost" type="button" data-action="add-all-suggestions"><i class="ph ph-plus-circle"></i> Add all to Today</button>`;
        html += `</div>`;
      }
      html += `</section>`;
    }
    if (sections.habits.length) html += `<section class="section"><div class="section-header"><h2 class="section-label">Habits</h2><span class="section-count">${sections.habits.length}</span></div><div class="habit-list">${sections.habits.map(item => renderHabitRow(item.habit, item.status)).join('')}</div></section>`;
    if (sections.overdueMilestones.length) html += `<section class="section"><div class="section-header"><h2 class="section-label danger">Overdue Milestones</h2><span class="section-count">${sections.overdueMilestones.length}</span></div><div class="milestone-list">${sections.overdueMilestones.map(({ goal, milestone }) => `<div class="milestone-row"><button class="task-check" type="button" data-action="toggle-milestone" data-goal-id="${esc(goal.id)}" data-milestone-id="${esc(milestone.id)}" aria-label="Complete milestone"><i class="ph ph-circle"></i></button><button class="btn btn-ghost" type="button" data-route="goal/${esc(goal.id)}">${esc(milestone.title)} · ${esc(goal.title)}</button><small>${esc(relativeDateLabel(milestone.date))}</small></div>`).join('')}</div></section>`;
    for (const [label, goals, danger] of [['Overdue Goals', sections.overdueGoals, true], ['Goals', sections.goals, false]]) {
      if (goals.length) html += `<section class="section"><div class="section-header"><h2 class="section-label${danger ? ' danger' : ''}">${label}</h2><span class="section-count">${goals.length}</span></div><div class="goal-list">${goals.map(renderGoalRow).join('')}</div></section>`;
    }
    if (!sections.today.length && !sections.overdue.length && !sections.habits.length && !sections.overdueMilestones.length && !sections.overdueGoals.length && !sections.goals.length && !sections.completed.length && !sections.suggestions.length) html += emptyState('Nothing planned for today.', 'Add a task when you are ready.', 'Add task', 'quick-add', { today: true });

    if (sections.completed.length) {
      const open = state.ui.todayCompletedExpanded;
      html += `<section class="section"><button class="collapsible-trigger" type="button" data-action="toggle-today-completed" aria-expanded="${open}"><span class="left"><i class="ph ph-check-circle"></i> Completed</span><span>${sections.completed.length} <i class="ph ph-caret-${open ? 'up' : 'down'}"></i></span></button>`;
      if (open) html += `<div class="task-list">${sections.completed.map(t => taskRow(t, 'completed')).join('')}</div>`;
      html += `</section>`;
    }
    return html;
  }

  function renderInbox() {
    const tasks = activeInboxTasks();
    let html = pageHeader('Inbox', `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} waiting to be organized`, {});
    if (!tasks.length) return html + emptyState('Inbox zero.', 'Everything has been organized.');
    html += `<div class="task-list" data-list-context="inbox">${tasks.map(t => taskRow(t, 'inbox', { draggable: true, inbox: true })).join('')}</div>`;
    return html;
  }

  function renderAnytime() {
    const tasks = Core.deriveAnytime(state.tasks);
    let html = pageHeader('Anytime', `${tasks.length} active ${tasks.length === 1 ? 'task' : 'tasks'} without a plan date`, { contextAnytime: true });
    if (!tasks.length) return html + emptyState('Nothing waiting in Anytime.', 'Processed tasks without a planned date will appear here.', 'Add task', 'quick-add', { anytime: true });
    html += `<div class="task-list">${tasks.map(t => taskRow(t, 'anytime')).join('')}</div>`;
    html += `<button class="inline-add" type="button" data-action="quick-add" data-anytime="true"><i class="ph ph-plus"></i> Add task</button>`;
    return html;
  }

  function renderTags() {
    const tags = [...(state.tags || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const selected = getTag(state.ui.selectedTagId) || tags[0] || null;
    if (selected && state.ui.selectedTagId !== selected.id) state.ui.selectedTagId = selected.id;
    let html = pageHeader('Tags', `${tags.length} global ${tags.length === 1 ? 'tag' : 'tags'}`, { add: false, actionHtml: '<button class="btn btn-primary" type="button" data-action="new-tag"><i class="ph ph-plus"></i> New tag</button>' });
    if (!tags.length) return html + emptyState('No tags yet.', 'Create a global tag and reuse it across tasks.', 'New tag', 'new-tag');
    html += `<div class="tags-layout"><div class="tag-list">${tags.map(tag => {
      const count = Core.tasksForTag(state.tasks, tag.id).length;
      return `<div class="tag-row ${selected?.id === tag.id ? 'is-selected' : ''}" data-tag-id="${esc(tag.id)}"><button class="tag-select" type="button" data-action="select-tag" data-tag-id="${esc(tag.id)}"><span class="tag-dot" style="--tag-color:${esc(tag.color)}"></span><span class="tag-name">${esc(tag.name)}</span><span class="tag-count">${count} ${count === 1 ? 'task' : 'tasks'}</span></button><button class="btn-icon" type="button" data-action="tag-menu" data-tag-id="${esc(tag.id)}" aria-label="Tag actions"><i class="ph ph-dots-three"></i></button></div>`;
    }).join('')}</div>`;
    if (selected) {
      const tasks = Core.tasksForTag(state.tasks, selected.id);
      html += `<section class="selected-tag-section"><div class="section-header"><div><h2 class="selected-tag-title"><span class="tag-dot" style="--tag-color:${esc(selected.color)}"></span>${esc(selected.name)}</h2><p class="page-subtitle">${tasks.length} active ${tasks.length === 1 ? 'task' : 'tasks'}</p></div></div>${tasks.length ? `<div class="task-list">${tasks.map(t => taskRow(t, 'tags')).join('')}</div>` : emptyState('No active tasks with this tag.', 'Assign this tag from Quick Add or Task Detail.')}</section>`;
    }
    html += '</div>';
    return html;
  }

  function areaSummaryCards(summary, areaId) {
    return `<div class="area-summary" aria-label="Area summary"><div><strong>${summary.projects}</strong><span>Projects</span></div><div><strong>${summary.openTasks}</strong><span>Open tasks</span></div><div><strong>${summary.activeGoals}</strong><span>Active goals</span></div><div><strong>${summary.activeHabits}</strong><span>Active habits</span></div><div><strong>${state.notes.filter(item => item.areaId === areaId).length}</strong><span>Notes</span></div><div><strong>${state.resources.filter(item => item.areaId === areaId).length}</strong><span>Resources</span></div></div>`;
  }

  function areaIcon(area) {
    return `<i class="ph ${esc(area.icon || AREA_ICONS[0])}" style="color:${esc(area.color || PROJECT_COLORS[0])}"></i>`;
  }

  function renderAreas() {
    const tab = state.ui.areaTab || 'all';
    const all = sortedAreas();
    const areas = all.filter(area => tab === 'all' || area.status === tab);
    const actions = `<button class="btn btn-primary" type="button" data-action="new-area"><i class="ph ph-plus"></i> New area</button>`;
    let html = pageHeader('Areas', `${all.filter(area => area.status === 'active').length} active ${all.filter(area => area.status === 'active').length === 1 ? 'area' : 'areas'}`, { add: false, actionHtml: actions });
    html += `<div class="area-tabs" role="tablist"><button type="button" data-tab="all" class="${tab === 'all' ? 'is-active' : ''}">All</button><button type="button" data-tab="active" class="${tab === 'active' ? 'is-active' : ''}">Active</button><button type="button" data-tab="archived" class="${tab === 'archived' ? 'is-active' : ''}">Archived</button></div>`;
    if (!areas.length) return html + emptyState(tab === 'archived' ? 'No archived areas.' : 'No areas yet.', tab === 'archived' ? 'Archived areas can be restored here.' : 'Areas organize projects, standalone tasks, goals and habits.', tab === 'archived' ? '' : 'New area', tab === 'archived' ? '' : 'new-area');
    html += `<div class="area-list">${areas.map(area => {
      const summary = Core.areaSummary(area.id, state);
      const notes = state.notes.filter(item => item.areaId === area.id).length;
      const resources = state.resources.filter(item => item.areaId === area.id).length;
      return `<article class="area-row" data-area-id="${esc(area.id)}"><button class="area-open" type="button" data-route="area/${esc(area.id)}">${areaIcon(area)}<span><strong>${esc(area.name)}</strong><small>${summary.projects} projects · ${summary.openTasks} open tasks · ${summary.activeGoals} active goals · ${summary.activeHabits} active habits · ${notes} notes · ${resources} resources</small></span></button><div class="area-row-actions">${area.isPinned && area.status === 'active' ? '<i class="ph ph-push-pin" aria-label="Pinned"></i>' : ''}<button class="btn-icon" type="button" data-action="area-menu" data-area-id="${esc(area.id)}" aria-label="Area actions"><i class="ph ph-dots-three"></i></button></div></article>`;
    }).join('')}</div>`;
    return html;
  }

  function renderArea(areaId) {
    const area = getArea(areaId);
    if (!area) return renderAreas();
    const summary = Core.areaSummary(areaId, state);
    const projects = (state.projects || []).filter(project => project.areaId === areaId);
    const tasks = (state.tasks || []).filter(task => !task.projectId && task.areaId === areaId);
    const goals = (state.goals || []).filter(goal => goal.areaId === areaId);
    const habits = (state.habits || []).filter(habit => habit.areaId === areaId);
    let html = pageHeader(area.name, area.status === 'archived' ? 'Archived area' : 'Organize the work that belongs together', { add: false, actionHtml: `<button class="btn-icon" type="button" data-action="area-menu" data-area-id="${esc(area.id)}" aria-label="Area actions"><i class="ph ph-dots-three"></i></button>` });
    html += `<div class="area-detail-label">${areaIcon(area)} <span>Area</span></div>${areaSummaryCards(summary, areaId)}`;
    html += `<section class="section area-detail-section"><div class="section-header"><h2 class="section-label">Projects</h2><span class="section-count">${projects.length}</span></div>${projects.length ? `<div class="area-object-list">${projects.map(project => `<button class="area-object" type="button" data-route="project/${esc(project.id)}"><span class="project-dot" style="--project-color:${esc(project.color)}"></span>${esc(project.name)}</button>`).join('')}</div>` : '<p class="area-empty-copy">No projects in this Area.</p>'}<button class="inline-add" type="button" data-action="area-new-project" data-area-id="${esc(area.id)}"><i class="ph ph-plus"></i> New project</button></section>`;
    html += `<section class="section area-detail-section"><div class="section-header"><h2 class="section-label">Standalone Tasks</h2><span class="section-count">${tasks.filter(task => !task.isCompleted).length}</span></div>${tasks.length ? `<div class="task-list">${tasks.map(task => taskRow(task, `area:${area.id}`)).join('')}</div>` : '<p class="area-empty-copy">No standalone tasks in this Area.</p>'}<button class="inline-add" type="button" data-action="area-new-task" data-area-id="${esc(area.id)}"><i class="ph ph-plus"></i> New task</button></section>`;
    html += `<section class="section area-detail-section"><div class="section-header"><h2 class="section-label">Goals</h2><span class="section-count">${goals.length}</span></div>${goals.length ? `<div class="area-object-list">${goals.map(goal => `<button class="area-object" type="button" data-route="goal/${esc(goal.id)}"><i class="ph ph-target"></i>${esc(goal.title || 'Untitled goal')}</button>`).join('')}</div>` : '<p class="area-empty-copy">No goals in this Area.</p>'}<button class="inline-add" type="button" data-action="area-new-goal" data-area-id="${esc(area.id)}"><i class="ph ph-plus"></i> New goal</button></section>`;
    html += `<section class="section area-detail-section"><div class="section-header"><h2 class="section-label">Habits</h2><span class="section-count">${habits.length}</span></div>${habits.length ? `<div class="area-object-list">${habits.map(habit => `<button class="area-object" type="button" data-route="habit/${esc(habit.id)}"><i class="ph ph-repeat"></i>${esc(habit.name || habit.title || 'Untitled habit')}</button>`).join('')}</div>` : '<p class="area-empty-copy">No habits in this Area.</p>'}<button class="inline-add" type="button" data-action="area-new-habit" data-area-id="${esc(area.id)}"><i class="ph ph-plus"></i> New habit</button></section>`;
    for (const type of ['note', 'resource']) {
      const items = state[knowledgeCollection(type)].filter(item => item.areaId === areaId);
      html += `<section class="section area-detail-section"><div class="section-header"><h2 class="section-label">${knowledgeCollection(type) === 'notes' ? 'Notes' : 'Resources'}</h2><span class="section-count">${items.length}</span></div>${items.length ? items.map(item => renderKnowledgeRow(type, item)).join('') : `<p class="area-empty-copy">No ${knowledgeCollection(type)} in this Area.</p>`}<button class="inline-add" type="button" data-action="new-knowledge" data-owner-type="${type}" data-area-id="${esc(areaId)}"><i class="ph ph-plus"></i> New ${type}</button></section>`;
    }
    return html;
  }

  function renderKnowledgeRow(type, item) {
    return `<article class="goal-row"><button class="goal-open" type="button" data-route="${type}/${esc(item.id)}"><strong><i class="ph ${knowledgeIcon(type)}"></i> ${esc(item.title)}</strong><small>${esc(getArea(item.areaId)?.name || 'No area')} · ${item.linkUrls.length} links · ${item.attachmentIds.length} files</small></button><button class="btn-icon" type="button" data-action="edit-knowledge" data-owner-type="${type}" data-owner-id="${esc(item.id)}" aria-label="Edit ${type}"><i class="ph ph-pencil-simple"></i></button></article>`;
  }

  function renderKnowledgeList(type) {
    const items = [...state[knowledgeCollection(type)]].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return pageHeader(type === 'note' ? 'Notes' : 'Resources', `${items.length} ${knowledgeCollection(type)}`, { add: false, actionHtml: `<button class="btn btn-primary" type="button" data-action="new-knowledge" data-owner-type="${type}"><i class="ph ph-plus"></i> New ${type}</button>` }) + `<section class="section">${items.length ? items.map(item => renderKnowledgeRow(type, item)).join('') : `<p class="area-empty-copy">No ${knowledgeCollection(type)} yet.</p>`}</section>`;
  }

  function knowledgeLinks(urls) {
    return urls.map(url => {
      let safe = false;
      try { safe = ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol); } catch (_) {}
      return safe ? `<a class="area-object knowledge-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><i class="ph ph-arrow-square-out"></i><span>${esc(url)}</span></a>` : `<span class="area-object knowledge-link"><i class="ph ph-link"></i><span>${esc(url)}</span></span>`;
    }).join('');
  }

  function renderKnowledgeDetail(type, id) {
    const owner = attachmentOwner({ ownerType: type, ownerId: id });
    if (!owner) return renderKnowledgeList(type);
    const item = owner.item, key = type + ':' + id, signature = JSON.stringify(item.attachmentIds);
    let cached = knowledgeAttachmentCache.get(key);
    if (!cached || cached.item !== item || cached.signature !== signature) {
      cached = { item, signature, records: [], message: item.attachmentIds.length ? 'Loading attachments…' : '' };
      knowledgeAttachmentCache.set(key, cached);
      readOwnerAttachments(owner).then(records => { cached.records = records; cached.message = ''; }).catch(error => { console.error(error); cached.message = 'Attachments are unavailable in this browser.'; }).finally(() => {
        if (knowledgeAttachmentCache.get(key) === cached && state && currentRoute().type === type && currentRoute().id === id) renderMain();
      });
    }
    let html = pageHeader(item.title, `${knowledgeLabel(type)} · ${getArea(item.areaId)?.name || 'No area'}`, { add: false, actionHtml: `<button class="btn btn-secondary" type="button" data-action="edit-knowledge" data-owner-type="${type}" data-owner-id="${esc(id)}"><i class="ph ph-pencil-simple"></i> Edit</button>` });
    html += `<section class="section"><div class="knowledge-body">${esc(type === 'note' ? item.body : item.description) || '<span class="area-empty-copy">No text yet.</span>'}</div></section><section class="section"><div class="section-header"><h2 class="section-label">Links</h2><span class="section-count">${item.linkUrls.length}</span></div><div class="area-object-list">${knowledgeLinks(item.linkUrls) || '<p class="area-empty-copy">No links.</p>'}</div></section>`;
    if (type === 'resource') for (const [field, label, collection, route] of [['relatedTaskIds', 'Tasks', 'tasks', null], ['relatedProjectIds', 'Projects', 'projects', 'project'], ['relatedGoalIds', 'Goals', 'goals', 'goal'], ['relatedHabitIds', 'Habits', 'habits', 'habit']]) {
      const related = state[collection].filter(candidate => item[field].includes(candidate.id));
      html += `<section class="section"><div class="section-header"><h2 class="section-label">Related ${label}</h2><span class="section-count">${related.length}</span></div><div class="area-object-list">${related.map(candidate => `<button class="area-object" type="button" ${route ? `data-route="${route}/${esc(candidate.id)}"` : `data-action="open-task" data-task-id="${esc(candidate.id)}"`}>${esc(candidate.title || candidate.name)}</button>`).join('') || '<p class="area-empty-copy">No relations.</p>'}</div></section>`;
    }
    return html + `<section class="section"><div class="section-header"><h2 class="section-label">Attachments</h2><span class="section-count">${item.attachmentIds.length}</span></div>${cached.message ? `<p class="attachment-message" role="status">${esc(cached.message)}</p>` : ''}<div class="attachment-list">${cached.records.map(renderAttachmentRow).join('')}</div></section><button class="danger-link" type="button" data-action="delete-knowledge" data-owner-type="${type}" data-owner-id="${esc(id)}"><i class="ph ph-trash"></i> Delete ${type}</button>`;
  }

  function goalProgressLabel(goal) {
    const progress = Core.computeGoalProgress(goal, state, state.habitMetrics || {});
    if (goal.progressMode === 'manual' && goal.progressType === 'numeric') return `${progress.current} / ${progress.target}${goal.unit ? ` ${esc(goal.unit)}` : ''}`;
    if (goal.progressMode === 'linkedTasks') return `${progress.current} / ${progress.target} tasks`;
    return `${Math.round(progress.percent)}%`;
  }

  function goalStatusLabel(goal, today = Core.dateOnly()) {
    if (Core.isGoalOverdue(goal, today)) return 'Overdue';
    return goal.status[0].toUpperCase() + goal.status.slice(1);
  }

  function renderGoalRow(goal) {
    const progress = Core.computeGoalProgress(goal, state, state.habitMetrics || {});
    return `<article class="goal-row" data-goal-id="${esc(goal.id)}"><button class="goal-open" type="button" data-route="goal/${esc(goal.id)}"><span class="goal-row-top"><strong>${esc(goal.title)}</strong><small class="goal-status ${Core.isGoalOverdue(goal, Core.dateOnly()) ? 'is-overdue' : ''}">${esc(goalStatusLabel(goal))}</small></span><span class="goal-progress"><span style="width:${Math.max(0, Math.min(100, progress.percent))}%"></span></span><small>${goalProgressLabel(goal)}${goal.targetDate ? ` · ${esc(relativeDateLabel(goal.targetDate))}` : ''}</small></button><button class="btn-icon" type="button" data-action="goal-menu" data-goal-id="${esc(goal.id)}" aria-label="Goal actions"><i class="ph ph-dots-three"></i></button></article>`;
  }

  function renderGoals() {
    const tab = state.ui.goalTab || 'active';
    const goals = [...(state.goals || [])].filter(goal => tab === 'all' || (tab === 'archived' ? goal.status === 'archived' : goal.status !== 'archived')).sort((a, b) => String(a.targetDate || '9999-12-31').localeCompare(String(b.targetDate || '9999-12-31')) || a.title.localeCompare(b.title));
    let html = pageHeader('Goals', `${goals.length} ${tab === 'archived' ? 'archived' : 'visible'} goals`, { add: false, actionHtml: '<button class="btn btn-primary" type="button" data-action="new-goal"><i class="ph ph-plus"></i> New goal</button>' });
    html += `<div class="area-tabs"><button type="button" data-goal-tab="active" class="${tab === 'active' ? 'is-active' : ''}">Active</button><button type="button" data-goal-tab="all" class="${tab === 'all' ? 'is-active' : ''}">All</button><button type="button" data-goal-tab="archived" class="${tab === 'archived' ? 'is-active' : ''}">Archived</button></div>`;
    return html + (goals.length ? `<div class="goal-list">${goals.map(renderGoalRow).join('')}</div>` : emptyState('No goals here yet.', 'Create a goal to track a meaningful outcome.', 'New goal', 'new-goal'));
  }

  function renderGoal(goalId) {
    const goal = getGoal(goalId); if (!goal) return renderGoals();
    const progress = Core.computeGoalProgress(goal, state, state.habitMetrics || {});
    const milestones = [...goal.milestones].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const links = goal.projectLinks || [];
    const statusAction = goal.status === 'paused' ? 'resume-goal' : goal.status === 'active' ? 'pause-goal' : goal.status === 'completed' ? 'restore-goal' : 'restore-goal';
    const statusText = goal.status === 'paused' ? 'Resume' : goal.status === 'active' ? 'Pause' : 'Restore';
    let html = pageHeader(goal.title, goalStatusLabel(goal), { add: false, actionHtml: `<button class="btn btn-secondary" type="button" data-action="edit-goal" data-goal-id="${esc(goal.id)}"><i class="ph ph-pencil-simple"></i> Edit</button><button class="btn-icon" type="button" data-action="goal-menu" data-goal-id="${esc(goal.id)}" aria-label="Goal actions"><i class="ph ph-dots-three"></i></button>` });
    html += `<div class="form-stack goal-properties">${[['title','Title'],['areaId','Area'],['targetValue','Target value'],['unit','Unit'],['targetDate','Target date']].map(([field,label]) => renderGoalProperty(goal, field, label)).join('')}<div class="goal-detail-actions"><button class="btn btn-secondary" type="button" data-action="edit-goal-source" data-goal-id="${esc(goal.id)}">Progress source</button><button class="btn btn-secondary" type="button" data-action="goal-status-menu" data-goal-id="${esc(goal.id)}">Status: ${esc(goalStatusLabel(goal))}</button></div></div>`;
    html += `<section class="goal-detail-card"><div class="goal-progress-large"><strong>${esc(goalProgressLabel(goal))}</strong><span class="goal-progress"><span style="width:${Math.max(0, Math.min(100, progress.percent))}%"></span></span></div>${goal.progressMode === 'manual' ? `<label class="field-label" for="goal-current-value">${goal.progressType === 'numeric' ? 'Current value' : 'Progress percentage'}<input id="goal-current-value" class="input" type="number" value="${esc(goal.currentValue)}" data-goal-id="${esc(goal.id)}" /></label><button class="btn btn-secondary" type="button" data-action="save-goal-progress" data-goal-id="${esc(goal.id)}">Update progress</button>` : `<p class="area-empty-copy">Progress is calculated from ${goal.progressMode === 'linkedTasks' ? 'linked tasks' : 'linked habits'}.</p>`}<div class="goal-detail-actions"><button class="btn btn-ghost" type="button" data-action="${statusAction}" data-goal-id="${esc(goal.id)}">${statusText}</button>${goal.status !== 'completed' && goal.status !== 'archived' ? `<button class="btn btn-secondary" type="button" data-action="complete-goal" data-goal-id="${esc(goal.id)}">Mark completed</button>` : ''}</div></section>`;
    html += `<section class="section"><div class="section-header"><h2 class="section-label">Links</h2><button class="btn btn-ghost" type="button" data-action="edit-goal-links" data-goal-id="${esc(goal.id)}">Manage links</button></div><p class="area-empty-copy">${links.length} project links · ${(goal.taskIds || []).length} direct task links · ${(goal.habitLinks || []).length} habit links</p></section>`;
    html += `<section class="section"><div class="section-header"><h2 class="section-label">Milestones</h2><button class="btn btn-ghost" type="button" data-action="new-milestone" data-goal-id="${esc(goal.id)}">Add milestone</button></div>${milestones.length ? `<div class="milestone-list">${milestones.map(milestone => `<div class="milestone-row ${!milestone.isCompleted && milestone.date && milestone.date < Core.dateOnly() ? 'is-overdue' : ''}"><button class="check-toggle ${milestone.isCompleted ? 'is-checked' : ''}" type="button" data-action="toggle-milestone" data-goal-id="${esc(goal.id)}" data-milestone-id="${esc(milestone.id)}"><i class="ph ${milestone.isCompleted ? 'ph-check' : 'ph-circle'}"></i></button><span><strong>${esc(milestone.title)}</strong><small>${milestone.date ? esc(relativeDateLabel(milestone.date)) : 'No date'}</small></span><button class="btn-icon" type="button" data-action="edit-milestone" data-goal-id="${esc(goal.id)}" data-milestone-id="${esc(milestone.id)}" aria-label="Edit milestone"><i class="ph ph-pencil-simple"></i></button><button class="btn-icon" type="button" data-action="delete-milestone" data-goal-id="${esc(goal.id)}" data-milestone-id="${esc(milestone.id)}" aria-label="Delete milestone"><i class="ph ph-trash"></i></button></div>`).join('')}</div>` : '<p class="area-empty-copy">No milestones yet.</p>'}</section>`;
    html += `<section class="section"><div class="section-header"><h2 class="section-label">Reminders</h2><button class="btn btn-ghost" type="button" data-action="edit-goal-reminders" data-goal-id="${esc(goal.id)}">Edit reminders</button></div><p class="area-empty-copy">${Core.goalReminderMoments(goal).length ? `${Core.goalReminderMoments(goal).length} reminder points at ${esc(goal.reminders.time)}` : 'No reminders enabled.'}</p></section>`;
    return html;
  }

  function renderGoalProperty(goal, field, label) {
    const editor = goalPropertyEditor?.goal === goal && goalPropertyEditor.field === field ? goalPropertyEditor : null;
    const value = field === 'areaId' ? getArea(goal.areaId)?.name || 'No area' : goal[field] ?? '';
    if (!editor) return `<div class="goal-property"><span class="field-label">${label}</span><button class="btn btn-ghost" type="button" data-goal-property="${field}" data-goal-id="${esc(goal.id)}">${esc(value || (field === 'targetDate' ? 'No date' : 'Not set'))}</button></div>`;
    const id = 'goal-detail-' + field;
    const input = field === 'areaId' ? `<select id="${id}" class="input"><option value="">No area</option>${state.areas.filter(a => a.status === 'active' || a.id === goal.areaId).map(a => `<option value="${esc(a.id)}" ${a.id === editor.value ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : `<input id="${id}" class="input" type="${field === 'targetValue' ? 'number' : field === 'targetDate' ? 'date' : 'text'}" ${field === 'targetValue' ? 'step="any"' : field === 'title' ? 'maxlength="120"' : field === 'unit' ? 'maxlength="40"' : ''} value="${esc(editor.value)}" ${editor.error ? 'aria-invalid="true" aria-describedby="goal-property-error"' : ''} />`;
    return `<div class="goal-property-editor"><label class="field-label" for="${id}">${label}</label>${input}${editor.error ? `<p id="goal-property-error" class="validation" role="alert">${esc(editor.error)}</p>` : ''}<div class="goal-detail-actions"><button class="btn btn-secondary" type="button" data-action="save-goal-property">Save ${label.toLowerCase()}</button><button class="btn btn-ghost" type="button" data-action="cancel-goal-property">Cancel</button></div></div>`;
  }

  function openGoalProperty(element) {
    const goal = getGoal(element.dataset.goalId); if (!goal) return;
    goalPropertyEditor = { goal, field: element.dataset.goalProperty, value: goal[element.dataset.goalProperty] ?? '', returnFocus: goalFocusTarget(element) };
    render(); requestAnimationFrame(() => $('#goal-detail-' + goalPropertyEditor?.field)?.focus());
  }

  function cancelGoalProperty() {
    const target = goalPropertyEditor?.returnFocus; goalPropertyEditor = null; render(); restoreGoalFocus(target);
  }

  function saveGoalProperty() {
    const editor = goalPropertyEditor;
    if (!editor || getGoal(editor.goal.id) !== editor.goal) { cancelGoalProperty(); return; }
    const { goal, field } = editor; editor.value = $('#goal-detail-' + field)?.value ?? editor.value;
    const value = field === 'targetValue' ? Number(editor.value) : field === 'areaId' || field === 'targetDate' ? editor.value || null : String(editor.value).trim();
    const error = field === 'title' && !value ? 'Goal needs a title.' : field === 'targetValue' && (!Number.isFinite(value) || value <= 0) ? 'Enter a target above zero.' : '';
    if (error) { editor.error = error; render(); requestAnimationFrame(() => $('#goal-detail-' + field)?.focus()); return; }
    const before = captureGoalProgress([goal.id]); const old = goal[field];
    if (old !== value) { goal[field] = value; goal.updatedAt = nowIso(); if (field === 'targetDate') putGoalHistory(goal.id, 'targetDateChanged', { from: old, to: value }); saveState(); }
    const target = editor.returnFocus; goalPropertyEditor = null; render(); restoreGoalFocus(target); evaluateGoalProgressChanges(before);
  }

  function openHabitProperty(element) {
    const habit = getHabit(element.dataset.habitId); if (!habit) return;
    const field = element.dataset.habitProperty;
    habitPropertyEditor = { habit, field, value: field === 'quickValues' ? (habit.quickValues || []).join(', ') : habit[field] ?? '', returnFocus: goalFocusTarget(element) };
    render(); requestAnimationFrame(() => $('#habit-detail-' + habitPropertyEditor?.field)?.focus());
  }

  function cancelHabitProperty() {
    const target = habitPropertyEditor?.returnFocus; habitPropertyEditor = null; render(); restoreGoalFocus(target);
  }

  function saveHabitProperty() {
    const editor = habitPropertyEditor;
    if (!editor || getHabit(editor.habit.id) !== editor.habit) { cancelHabitProperty(); return; }
    const { habit, field } = editor; editor.value = $('#habit-detail-' + field)?.value ?? editor.value;
    const value = field === 'targetValue' ? Number(editor.value) : field === 'areaId' ? editor.value || null : field === 'quickValues' ? String(editor.value).split(',').map(item => Number(item.trim())).filter(item => Number.isFinite(item) && item > 0) : String(editor.value).trim();
    const hasHistory = (state.habitLogCache?.[habit.id] || []).length > 0;
    const error = field === 'name' && !value ? 'Habit needs a name.' : field === 'targetValue' && habit.trackingType === 'numeric' && (!Number.isFinite(value) || value <= 0) ? 'Numeric habits need a target above zero.' : field === 'trackingType' && value !== habit.trackingType && hasHistory ? 'Tracking cannot change while this Habit has history.' : '';
    if (error) { editor.error = error; render(); requestAnimationFrame(() => $('#habit-detail-' + field)?.focus()); return; }
    const old = habit[field];
    if (JSON.stringify(old) !== JSON.stringify(value)) { habit[field] = value; habit.updatedAt = nowIso(); saveState(); }
    const target = editor.returnFocus; habitPropertyEditor = null; render(); restoreGoalFocus(target);
  }

  function openHabitSettings(element) {
    const habit = getHabit(element.dataset.habitId); if (!habit) return;
    const logs = state.habitLogCache?.[habit.id] || []; const today = Core.dateOnly(); const todayLog = logs.find(log => log.date === today);
    modalState = { type: 'habit-settings', panel: element.dataset.habitPanel, habitId: habit.id, source: habit, draft: { ...habitDraft(habit), historyDate: today, historyValue: todayLog?.value ?? 0, historyStatus: todayLog?.status || 'done' }, returnFocus: goalFocusTarget(element), error: '' };
    renderModal();
  }

  function habitSettingsFields(d, panel) {
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (panel === 'frequency') return `<label class="field-label">Frequency<select id="habit-panel-frequency" class="input"><option value="daily" ${d.frequencyType === 'daily' ? 'selected' : ''}>Daily</option><option value="weekdays" ${d.frequencyType === 'weekdays' ? 'selected' : ''}>Selected weekdays</option><option value="timesPerWeek" ${d.frequencyType === 'timesPerWeek' ? 'selected' : ''}>X times per week</option><option value="everyNDays" ${d.frequencyType === 'everyNDays' ? 'selected' : ''}>Every N days</option></select></label><div class="habit-frequency-fields"><label class="field-label">X per week<input id="habit-panel-times" class="input" type="number" min="1" max="7" step="1" value="${esc(d.timesPerWeek)}"></label><label class="field-label">Every N days<input id="habit-panel-every" class="input" type="number" min="1" step="1" value="${esc(d.everyNDays)}"></label><div class="field-label">Weekdays<div class="weekday-picker">${weekdays.map((label, day) => `<label><input type="checkbox" data-habit-panel-weekday="${day}" ${d.weekdays.includes(day) ? 'checked' : ''}>${label}</label>`).join('')}</div></div></div>`;
    if (panel === 'reminders') return `<label class="field-label">Reminder times (comma separated)<input id="habit-panel-reminders" class="input" value="${esc((d.reminders || []).filter(item => item.enabled).map(item => item.time).join(','))}" placeholder="09:00, 18:00"></label><p class="area-empty-copy">Disabled reminder records stay intact.</p>`;
    if (panel === 'continuation') return `<label class="field-label">Continuation<select id="habit-panel-continuation" class="input"><option value="automatic" ${d.continuation === 'automatic' ? 'selected' : ''}>Repeat automatically</option><option value="askEachPeriod" ${d.continuation === 'askEachPeriod' ? 'selected' : ''}>Ask each period</option><option value="onePeriod" ${d.continuation === 'onePeriod' ? 'selected' : ''}>One period only</option></select></label>`;
    if (panel === 'end') return `<label class="field-label">End condition<select id="habit-panel-end-type" class="input"><option value="never" ${d.endType === 'never' ? 'selected' : ''}>Never</option><option value="date" ${d.endType === 'date' ? 'selected' : ''}>On date</option><option value="successfulPeriods" ${d.endType === 'successfulPeriods' ? 'selected' : ''}>After successful periods</option></select></label><label class="field-label">End date<input id="habit-panel-end-date" class="input" type="date" value="${esc(d.endDate)}"></label><label class="field-label">Successful periods<input id="habit-panel-successful-periods" class="input" type="number" min="1" step="1" value="${esc(d.successfulPeriodsTarget)}"></label>`;
    if (panel === 'goals') return `<div class="link-picker"><h3>Linked Goals</h3>${state.goals.map(goal => `<label><input type="checkbox" data-habit-panel-goal="${esc(goal.id)}" ${d.goalIds.includes(goal.id) ? 'checked' : ''}>${esc(goal.title)}</label>`).join('') || '<span class="area-empty-copy">No Goals yet.</span>'}</div>`;
    return `<label class="field-label">Date<input id="habit-panel-history-date" class="input" type="date" max="${esc(Core.dateOnly())}" value="${esc(d.historyDate)}"></label>${d.trackingType === 'numeric' ? `<label class="field-label">Total<input id="habit-panel-history-value" class="input" type="number" step="any" value="${esc(d.historyValue)}"></label>` : `<label class="field-label">Status<select id="habit-panel-history-status" class="input"><option value="done" ${d.historyStatus === 'done' ? 'selected' : ''}>Done</option><option value="skipped" ${d.historyStatus === 'skipped' ? 'selected' : ''}>Skipped</option><option value="missed" ${d.historyStatus === 'missed' ? 'selected' : ''}>Missed</option></select></label>`}`;
  }

  function renderHabitSettingsModal() {
    const names = { frequency: 'Frequency', reminders: 'Reminders', continuation: 'Continuation', end: 'End condition', goals: 'Linked Goals', history: 'Edit history' };
    const d = modalState.draft; const name = names[modalState.panel] || 'Habit settings';
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${name}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><div class="form-stack">${habitSettingsFields(d, modalState.panel)}${modalState.error ? `<p class="validation" role="alert">${esc(modalState.error)}</p>` : ''}</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-habit-settings">Save ${name.toLowerCase()}</button></div></div></div>`, 'small-modal');
  }

  async function saveHabitSettings() {
    if (modalState?.type !== 'habit-settings') return;
    const editor = modalState; const habit = getHabit(editor.habitId);
    if (!habit || habit !== editor.source) { closeModal(); return; }
    const d = editor.draft; const panel = editor.panel;
    if (panel === 'frequency') {
      d.frequencyType = $('#habit-panel-frequency')?.value || d.frequencyType;
      d.timesPerWeek = Number($('#habit-panel-times')?.value); d.everyNDays = Number($('#habit-panel-every')?.value); d.weekdays = $$('[data-habit-panel-weekday]').filter(input => input.checked).map(input => Number(input.dataset.habitPanelWeekday));
      if ((d.frequencyType === 'timesPerWeek' && (!Number.isInteger(d.timesPerWeek) || d.timesPerWeek < 1 || d.timesPerWeek > 7)) || (d.frequencyType === 'everyNDays' && (!Number.isInteger(d.everyNDays) || d.everyNDays < 1)) || (d.frequencyType === 'weekdays' && !d.weekdays.length)) { editor.error = 'Use a positive whole-number schedule and select weekdays when needed.'; renderModal(); return; }
      Object.assign(habit, { frequencyType: d.frequencyType, timesPerWeek: d.timesPerWeek, everyNDays: d.everyNDays, weekdays: d.weekdays });
    } else if (panel === 'reminders') {
      const oldByTime = new Map((habit.reminders || []).map(item => [item.time, item])); const disabled = (habit.reminders || []).filter(item => item.enabled === false);
      const enabled = String($('#habit-panel-reminders')?.value || '').split(',').map(value => Core.normalizeTime(value.trim())).filter(Boolean).map(time => ({ ...(oldByTime.get(time) || {}), id: oldByTime.get(time)?.id || uid('habit-reminder'), time, enabled: oldByTime.get(time)?.enabled !== false }));
      habit.reminders = [...disabled, ...enabled.filter(item => !disabled.some(disabledItem => disabledItem.id === item.id))];
    } else if (panel === 'continuation') habit.continuation = $('#habit-panel-continuation')?.value || habit.continuation;
    else if (panel === 'end') {
      const endType = $('#habit-panel-end-type')?.value || 'never'; const endDate = $('#habit-panel-end-date')?.value || null; const periods = $('#habit-panel-successful-periods')?.value;
      if (endType === 'date' && !endDate) { editor.error = 'Choose an end date.'; renderModal(); return; }
      if (endType === 'successfulPeriods' && (!Number.isInteger(Number(periods)) || Number(periods) < 1)) { editor.error = 'Successful periods must be a positive whole number.'; renderModal(); return; }
      Object.assign(habit, { endType, endDate: endType === 'date' ? endDate : null, successfulPeriodsTarget: endType === 'successfulPeriods' ? Number(periods) : null });
    } else if (panel === 'goals') {
      syncHabitGoalLinks(habit, $$('[data-habit-panel-goal]').filter(input => input.checked).map(input => input.dataset.habitPanelGoal));
    } else {
      const date = $('#habit-panel-history-date')?.value; const value = habit.trackingType === 'numeric' ? Number($('#habit-panel-history-value')?.value || 0) : null; const status = habit.trackingType === 'numeric' ? 'done' : $('#habit-panel-history-status')?.value || 'missed';
      if (!date || date > Core.dateOnly()) { editor.error = 'Choose an eligible past date.'; renderModal(); return; }
      const target = editor.returnFocus; const saved = await setHabitLog(habit.id, date, status, value);
      if (!saved) { editor.error = 'That date is not scheduled for this Habit.'; renderModal(); return; }
      if (modalState === editor) { modalState = null; $('#modal-root').innerHTML = ''; restoreGoalFocus(target); } return;
    }
    habit.updatedAt = nowIso(); saveState(); const target = editor.returnFocus; closeModal(); await refreshHabitMetrics(); render(); restoreGoalFocus(target);
  }

  function openGoalSourceModal(goalId) {
    const goal = getGoal(goalId); if (!goal) return;
    modalState = { type: 'goal-source', goalId, source: goal, draft: goalDraft(goal), returnFocus: goalFocusTarget(), error: '' }; renderModal();
  }

  function saveGoalSource() {
    if (modalState?.type !== 'goal-source') return;
    const goal = getGoal(modalState.goalId); if (!goal || goal !== modalState.source) { closeModal(); return; }
    readGoalDraft(); const d = modalState.draft;
    if (d.progressMode === 'manual' && d.progressType === 'numeric' && !(Number.isFinite(d.targetValue) && d.targetValue > 0)) { modalState.error = 'Numeric goals need a target above zero.'; renderModal(); return; }
    const before = captureGoalProgress([goal.id]);
    goal.progressMode = d.progressMode; goal.progressType = d.progressType; goal.updatedAt = nowIso(); saveState(); closeModal(); render(); evaluateGoalProgressChanges(before);
  }

  function openGoalStatusMenu(anchor, goalId) {
    const goal = getGoal(goalId); if (!goal) return;
    const choices = [['active','resume-goal','Active'],['paused','pause-goal','Paused'],['completed','complete-goal','Completed'],['archived','archive-goal','Archived']];
    openPopover(anchor, choices.map(([status,action,label]) => `<button class="popover-option" type="button" data-pop-action="${action}" data-goal-id="${esc(goalId)}" ${goal.status === status ? 'disabled' : ''}>${label}</button>`).join(''), { type: 'goal-status' });
    popoverEl.goalReturnFocus = goalFocusTarget(anchor); popoverEl.querySelector('button:not([disabled])')?.focus();
  }

  function habitFrequencyLabel(habit) {
    if (habit.frequencyType === 'weekdays') return `Weekdays ${(habit.weekdays || []).map(day => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]).join(', ')}`;
    if (habit.frequencyType === 'timesPerWeek') return `${habit.timesPerWeek || 1} times/week`;
    if (habit.frequencyType === 'everyNDays') return `Every ${habit.everyNDays || 1} days`;
    return 'Daily';
  }

  function habitMetrics(habit) {
    return state.habitMetrics?.[habit.id] || { currentStreak: 0, longestStreak: 0, totalCheckins: 0, completionRate: 0, currentPeriodCount: 0, currentPeriodTarget: habit.frequencyType === 'timesPerWeek' ? Number(habit.timesPerWeek || 1) : 1 };
  }

  function habitProgressLabel(habit, metrics = habitMetrics(habit)) {
    // A numeric target describes one check-in; X/week is a separate weekly
    // target and must remain visible when both are configured.
    if (habit.frequencyType === 'timesPerWeek') return `${metrics.currentPeriodCount || 0} / ${metrics.currentPeriodTarget || habit.timesPerWeek || 1} this week`;
    if (habit.trackingType === 'numeric') return `${metrics.currentPeriodCount || 0} / ${habit.targetValue || 0}${habit.unit ? ` ${habit.unit}` : ''}`;
    return metrics.currentPeriodCount ? 'Done' : 'Not checked in';
  }

  function renderHabitRow(habit, todayStatus = null) {
    const metrics = habitMetrics(habit);
    const actions = !todayStatus ? '' : habit.trackingType === 'numeric'
      ? `${(habit.quickValues || []).map(value => `<button class="btn btn-secondary" type="button" data-action="habit-quick-add" data-habit-id="${esc(habit.id)}" data-value="${esc(value)}">+${esc(value)}</button>`).join('')}<button class="btn btn-ghost" type="button" data-route="habit/${esc(habit.id)}">Edit total</button>`
      : `<button class="btn btn-secondary" type="button" data-action="habit-checkin" data-habit-id="${esc(habit.id)}">${todayStatus.status === 'done' ? 'Mark not done' : 'Check in'}</button><button class="btn btn-ghost" type="button" data-action="habit-skip" data-habit-id="${esc(habit.id)}">Skip today</button>`;
    const menu = `<button class="btn-icon" type="button" data-action="habit-menu" data-habit-id="${esc(habit.id)}" aria-label="Habit actions"><i class="ph ph-dots-three"></i></button>`;
    return `<article class="habit-row"${todayStatus ? ' style="grid-template-columns:minmax(0,1fr) auto"' : ''}><button class="habit-open" type="button" data-route="habit/${esc(habit.id)}"><span><strong>${esc(habit.name)}</strong><small>${esc(habitFrequencyLabel(habit))} · ${esc(todayStatus?.status || habit.status)}</small></span><span class="habit-progress">${esc(habitProgressLabel(habit, metrics))}</span></button>${todayStatus ? `<div class="habit-checkin-controls">${actions}${menu}</div>` : menu}</article>`;
  }

  function renderHabits() {
    const tab = state.ui.habitTab || 'active';
    const habits = (state.habits || []).filter(habit => tab === 'all' || (tab === 'archived' ? habit.status === 'archived' : habit.status !== 'archived'));
    let html = pageHeader('Habits', `${habits.filter(habit => habit.status === 'active').length} active habits`, { add: false, actionHtml: '<button class="btn btn-primary" type="button" data-action="new-habit"><i class="ph ph-plus"></i> New habit</button>' });
    html += `<div class="area-tabs"><button type="button" data-habit-tab="active" class="${tab === 'active' ? 'is-active' : ''}">Active</button><button type="button" data-habit-tab="all" class="${tab === 'all' ? 'is-active' : ''}">All</button><button type="button" data-habit-tab="archived" class="${tab === 'archived' ? 'is-active' : ''}">Archived</button></div>`;
    return html + (habits.length ? `<div class="habit-list">${habits.map(habit => renderHabitRow(habit)).join('')}</div>` : emptyState('No habits yet.', 'Track a repeatable behavior without turning it into a task.', 'New habit', 'new-habit'));
  }

  function heatmapHtml(habit, logs) {
    const today = Core.dateOnly();
    const current = new Date(`${today}T12:00:00`);
    const year = current.getFullYear(); const month = current.getMonth();
    const count = new Date(year, month + 1, 0).getDate();
    const dates = Array.from({ length: count }, (_, index) => `${year}-${String(month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`);
    return `<p class="area-empty-copy">${esc(current.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</p><div class="habit-heatmap" aria-label="Monthly heatmap">${dates.map(date => { const status = Core.habitStatusForDate(habit, logs, date, today); return `<span class="heatmap-day is-${esc(status.status)}" style="--heat-intensity:${Math.max(0, Math.min(1, Number(status.percent || 0) / 100))}" title="${esc(date)}"></span>`; }).join('')}</div>`;
  }

  function renderHabit(habitId) {
    const habit = getHabit(habitId); if (!habit) return renderHabits();
    const metrics = habitMetrics(habit); const logs = state.habitLogCache?.[habit.id] || [];
    const today = Core.dateOnly(); const todayStatus = Core.habitStatusForDate(habit, logs, today, today);
    const todayLog = logs.find(log => log.date === today);
    const history = [...logs].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    let html = pageHeader(habit.name, `${habitFrequencyLabel(habit)} · ${habit.status}`, { add: false, actionHtml: `<button class="btn btn-secondary" type="button" data-action="edit-habit" data-habit-id="${esc(habit.id)}"><i class="ph ph-pencil-simple"></i> Edit</button><button class="btn-icon" type="button" data-action="habit-menu" data-habit-id="${esc(habit.id)}" aria-label="Habit actions"><i class="ph ph-dots-three"></i></button>` });
    html += `<div class="form-stack goal-properties habit-properties">${[['name','Name'],['areaId','Area'],['trackingType','Tracking'],['targetValue','Target value'],['unit','Unit'],['quickValues','Quick values']].map(([field,label]) => renderHabitProperty(habit, field, label)).join('')}<div class="goal-detail-actions"><button class="btn btn-secondary" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="frequency">Frequency</button><button class="btn btn-secondary" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="reminders">Reminders</button><button class="btn btn-secondary" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="continuation">Continuation</button><button class="btn btn-secondary" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="end">End condition</button><button class="btn btn-secondary" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="goals">Linked Goals</button></div></div>`;
    html += `<section class="habit-detail-card"><div class="habit-summary"><strong>${esc(habitProgressLabel(habit, metrics))}</strong><span>Current period</span></div><div class="habit-metric-grid"><div><strong>${metrics.currentStreak}</strong><span>Current streak</span></div><div><strong>${metrics.longestStreak}</strong><span>Longest streak</span></div><div><strong>${metrics.totalCheckins}</strong><span>Total check-ins</span></div><div><strong>${Math.round(metrics.completionRate)}%</strong><span>Completion rate</span></div></div>${habit.status === 'active' ? (habit.trackingType === 'numeric' ? `<div class="habit-checkin-controls">${(habit.quickValues || []).map(value => `<button class="btn btn-secondary" type="button" data-action="habit-quick-add" data-habit-id="${esc(habit.id)}" data-value="${esc(value)}">+${esc(value)}</button>`).join('')}<label class="field-label">Daily total<input id="habit-direct-total" class="input" type="number" step="any" value="${esc(todayLog?.value || 0)}" /></label><button class="btn btn-primary" type="button" data-action="save-habit-total" data-habit-id="${esc(habit.id)}">Save total</button></div>` : `<div class="habit-checkin-controls"><button class="btn btn-primary" type="button" data-action="habit-checkin" data-habit-id="${esc(habit.id)}">${todayStatus.status === 'done' ? 'Mark not done' : 'Check in'}</button><button class="btn btn-ghost" type="button" data-action="habit-skip" data-habit-id="${esc(habit.id)}">Skip today</button></div>`) : '<p class="area-empty-copy">Paused and archived habits preserve history but cannot be checked in.</p>'}</section>`;
    html += `<section class="section"><div class="section-header"><h2 class="section-label">Monthly heatmap</h2></div>${heatmapHtml(habit, logs)}</section>`;
    const historyEditor = `<div class="habit-history-row"><input id="habit-history-date" class="input" type="date" max="${esc(today)}" value="${esc(today)}">${habit.trackingType === 'numeric' ? `<input id="habit-history-new-value" class="input" type="number" step="any" value="0">` : `<select id="habit-history-new-status" class="input"><option value="done">Done</option><option value="skipped">Skipped</option><option value="missed">Missed</option></select>`}<button class="btn btn-ghost" type="button" data-action="save-habit-history-date" data-habit-id="${esc(habit.id)}">Save date</button></div>`;
    html += `<section class="section"><div class="section-header"><h2 class="section-label">History</h2><button class="btn btn-ghost" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="history">Edit history</button></div>${historyEditor}${history.length ? `<div class="habit-history">${history.map(log => `<div class="habit-history-row"><span>${esc(log.date)}</span>${habit.trackingType === 'numeric' ? `<input class="input" type="number" step="any" value="${esc(log.value ?? 0)}" data-habit-history-value data-habit-date="${esc(log.date)}">` : `<select class="input" data-habit-history-status data-habit-date="${esc(log.date)}"><option value="done" ${log.status === 'done' ? 'selected' : ''}>Done</option><option value="skipped" ${log.status === 'skipped' ? 'selected' : ''}>Skipped</option><option value="missed" ${log.status === 'missed' ? 'selected' : ''}>Missed</option></select>`}<button class="btn btn-ghost" type="button" data-action="save-habit-history" data-habit-id="${esc(habit.id)}" data-habit-date="${esc(log.date)}">Save</button></div>`).join('')}</div>` : '<p class="area-empty-copy">No history yet. Choose any eligible past date to add a correction.</p>'}</section>`;
    return html;
  }

  function renderHabitProperty(habit, field, label) {
    const editor = habitPropertyEditor?.habit === habit && habitPropertyEditor.field === field ? habitPropertyEditor : null;
    const value = field === 'areaId' ? getArea(habit.areaId)?.name || 'No area' : field === 'quickValues' ? (habit.quickValues || []).join(', ') : habit[field] ?? '';
    if (!editor) return `<div class="goal-property"><span class="field-label">${label}</span><button class="btn btn-ghost" type="button" data-habit-property="${field}" data-habit-id="${esc(habit.id)}">${esc(value || (field === 'unit' || field === 'quickValues' ? 'Not set' : 'No area'))}</button></div>`;
    const id = 'habit-detail-' + field;
    const input = field === 'areaId' ? `<select id="${id}" class="input"><option value="">No area</option>${state.areas.filter(a => a.status === 'active' || a.id === habit.areaId).map(a => `<option value="${esc(a.id)}" ${a.id === editor.value ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : field === 'trackingType' ? `<select id="${id}" class="input"><option value="checkbox" ${editor.value === 'checkbox' ? 'selected' : ''}>Checkbox</option><option value="numeric" ${editor.value === 'numeric' ? 'selected' : ''}>Numeric</option></select>` : `<input id="${id}" class="input" type="${field === 'targetValue' ? 'number' : 'text'}" ${field === 'targetValue' ? 'step="any"' : field === 'name' ? 'maxlength="120"' : ''} value="${esc(editor.value)}" ${editor.error ? 'aria-invalid="true" aria-describedby="habit-property-error"' : ''}>`;
    return `<div class="goal-property-editor"><label class="field-label" for="${id}">${label}</label>${input}${editor.error ? `<p id="habit-property-error" class="validation" role="alert">${esc(editor.error)}</p>` : ''}<div class="goal-detail-actions"><button class="btn btn-secondary" type="button" data-action="save-habit-property">Save ${label.toLowerCase()}</button><button class="btn btn-ghost" type="button" data-action="cancel-habit-property">Cancel</button></div></div>`;
  }

  function renderArchivedProjects() {
    const projects = allProjects().filter(project => project.isArchived);
    let html = pageHeader('Archived Projects', `${projects.length} archived ${projects.length === 1 ? 'project' : 'projects'}`, { add: false });
    if (!projects.length) return html + emptyState('No archived projects.', 'Archived projects stay available here until you restore them.');
    html += `<div class="archived-project-list">${projects.map(project => {
      const openCount = projectTasks(project.id, false).length;
      return `<div class="archived-project-row"><div class="archived-project-main"><span class="project-dot" style="--project-color:${esc(project.color)}"></span><span><strong>${esc(project.name)}</strong><small>${openCount} open ${openCount === 1 ? 'task' : 'tasks'}</small></span></div><div class="archived-project-actions"><button class="btn btn-ghost" type="button" data-route="project/${esc(project.id)}">View</button><button class="btn btn-secondary" type="button" data-action="restore-project" data-project-id="${esc(project.id)}">Restore</button></div></div>`;
    }).join('')}</div>`;
    return html;
  }

  function renderUpcoming() {
    const today = Core.dateOnly();
    const groups = Core.deriveUpcomingV3(state, today);
    let html = pageHeader('Upcoming', 'Planned work and upcoming deadlines', {});
    if (!groups.length) return html + emptyState('Nothing scheduled.', 'Tasks you plan or set a due date for will appear here.');
    for (const group of groups) {
      const d = parseLocalDate(group.date);
      const rel = relativeDateLabel(group.date, today);
      const dayName = [today, Core.addDays(today, 1)].includes(group.date) ? rel : WEEKDAY_FMT.format(d);
      html += `<section class="upcoming-group"><div class="group-date"><strong>${esc(dayName)}</strong><span>${esc(formatDate(group.date))}</span></div>${group.items.length ? `<div class="task-list">${group.items.map(item => taskRow(item.task, 'upcoming', { upcomingReason: item.displayReason })).join('')}</div>` : ''}${group.goals.length ? `<div><h2 class="section-label">Goals</h2><div class="goal-list">${group.goals.map(renderGoalRow).join('')}</div></div>` : ''}</section>`;
    }
    return html;
  }

  function renderProject(projectId) {
    const project = getProject(projectId);
    if (!project) return renderToday();
    const openTasks = projectTasks(projectId, false);
    const completed = projectTasks(projectId, true);
    const expanded = Boolean(state.ui.projectCompletedExpanded[projectId]);
    let html = pageHeader(project.name, `${openTasks.length} open ${openTasks.length === 1 ? 'task' : 'tasks'}`, { contextProjectId: projectId, projectMenu: projectId });
    html += `<div style="display:flex;align-items:center;gap:8px;margin-top:-20px;margin-bottom:26px;color:var(--text-muted);font-size:12px"><span class="project-dot" style="--project-color:${esc(project.color)}"></span> Project</div>`;
    if (openTasks.length) html += `<div class="task-list" data-list-context="project:${esc(projectId)}">${openTasks.map(t => taskRow(t, `project:${projectId}`, { draggable: true })).join('')}</div>`;
    else html += emptyState('No open tasks.', 'Add a task to keep this project moving.', 'Add task', 'quick-add', { projectId });
    html += `<button class="inline-add" type="button" data-action="quick-add" data-project-id="${esc(projectId)}"><i class="ph ph-plus"></i> Add task</button>`;
    if (completed.length) {
      html += `<section class="section"><button class="collapsible-trigger" type="button" data-action="toggle-project-completed" data-project-id="${esc(projectId)}" aria-expanded="${expanded}"><span class="left"><i class="ph ph-check-circle"></i> Completed</span><span>${completed.length} <i class="ph ph-caret-${expanded ? 'up' : 'down'}"></i></span></button>`;
      if (expanded) html += `<div class="task-list">${completed.map(t => taskRow(t, 'completed')).join('')}</div>`;
      html += `</section>`;
    }
    return html;
  }

  function renderCompleted() {
    const projectId = state.ui.completedProjectFilter || null;
    const periodDays = Number(state.ui.completedPeriod) || 0;
    const tasks = Core.filterCompleted(state.tasks, { projectId, periodDays }, nowIso());
    let html = pageHeader('Completed', 'A simple history of finished work', { add: false });
    const projectOptions = allProjects().map(project => `<option value="${esc(project.id)}" ${project.id === projectId ? 'selected' : ''}>${esc(project.name)}${project.isArchived ? ' (Archived)' : ''}</option>`).join('');
    html += `<div class="filter-bar"><label>Project<select id="completed-project-filter" class="filter-select"><option value="">All projects</option>${projectOptions}</select></label><label>Period<select id="completed-period-filter" class="filter-select"><option value="0" ${periodDays === 0 ? 'selected' : ''}>All time</option><option value="7" ${periodDays === 7 ? 'selected' : ''}>Last 7 days</option><option value="30" ${periodDays === 30 ? 'selected' : ''}>Last 30 days</option></select></label></div>`;
    if (!tasks.length) return html + emptyState('No completed tasks match these filters.', 'Try a different project or time period.');
    const groups = new Map();
    for (const task of tasks) {
      const date = String(task.completedAt || '').slice(0, 10) || 'unknown';
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(task);
    }
    for (const [date, items] of groups) {
      const label = relativeDateLabel(date);
      html += `<section class="upcoming-group"><div class="group-date"><strong>${esc(label)}</strong>${['Today','Yesterday'].includes(label) ? `<span>${esc(formatDate(date))}</span>` : ''}</div><div class="task-list">${items.map(t => taskRow(t, 'completed')).join('')}</div></section>`;
    }
    return html;
  }

  function renderSettings() {
    return `${pageHeader('Settings', 'Prototype preferences and local data', { add: false })}
      <section class="settings-card">
        <h2>General</h2>
        <div class="settings-row">
          <div class="settings-label"><strong>Week starts on</strong><span>Used for date grouping and future calendar behavior.</span></div>
          <button class="btn btn-secondary" type="button" disabled aria-disabled="true">Monday</button>
        </div>
        <div class="settings-row">
          <div class="settings-label"><strong>Theme</strong><span>Dark is the approved MVP theme.</span></div>
          <button class="btn btn-secondary" type="button" disabled aria-disabled="true">Dark</button>
        </div>
      </section>
      <section class="settings-card">
        <h2>Keyboard shortcuts</h2>
        <p class="area-empty-copy">Use a letter or digit with optional Ctrl/Cmd, Alt and Shift. Leave disabled commands unassigned.</p>
        ${shortcutError?`<p class="validation" role="alert">${esc(shortcutError)}</p>`:''}
        ${Object.entries(SHORTCUT_LABELS).map(([key,label])=>`<div class="settings-row shortcut-row"><label class="settings-label" for="shortcut-${key}"><strong>${label}</strong></label><input class="input shortcut-input" id="shortcut-${key}" data-shortcut="${key}" aria-label="${label} shortcut" placeholder="Disabled" value="${esc(state.settings.shortcuts[key] || '')}" /><button class="btn btn-secondary" data-action="save-shortcut" data-command="${key}">Save</button><button class="btn btn-ghost" data-action="disable-shortcut" data-command="${key}">Disable</button></div>`).join('')}
        <button class="btn btn-secondary" data-action="reset-shortcuts">Reset to defaults</button>
      </section>
      <section class="settings-card">
        <h2>Notifications</h2>
        <div class="settings-row"><div class="settings-label"><strong>Browser reminders</strong><span>In-app reminders always work while the prototype is open. Browser notifications are optional.</span></div><button class="btn btn-secondary" type="button" data-action="enable-notifications">${typeof Notification === 'undefined' ? 'Unavailable' : (Notification.permission === 'granted' ? 'Enabled' : Notification.permission === 'denied' ? 'Blocked' : 'Enable')}</button></div>
      </section>
      <section class="settings-card">
        <h2>Data</h2>
        <div class="settings-row"><div class="settings-label"><strong>Export backup</strong><span>Download tasks, projects, tags, settings and attachment files in one ZIP.</span></div><button class="btn btn-secondary" type="button" data-action="export-backup">Export backup</button></div>
        <div class="settings-row"><div class="settings-label"><strong>Import backup</strong><span>Replace all current app data from a previously exported ZIP backup.</span></div><div><button class="btn btn-secondary" type="button" data-action="import-backup">Import backup</button><input id="backup-import-input" type="file" accept=".zip,application/zip" hidden /></div></div>
        <div class="settings-row"><div class="settings-label"><strong>Clear completed tasks</strong><span>Permanently delete all completed tasks and their attachments.</span></div><button class="btn btn-secondary" type="button" data-action="clear-completed">Clear</button></div>
        <div class="settings-row"><div class="settings-label"><strong>Reset app data</strong><span>Delete tasks, projects, tags, attachments and preferences stored by this prototype.</span></div><button class="btn btn-ghost" type="button" data-action="reset-app" style="color:var(--danger)">Reset</button></div>
      </section>`;
  }

  function emptyState(title, text, cta, action, data = {}) {
    const attrs = Object.entries(data).map(([key, value]) => `data-${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${esc(value)}"`).join(' ');
    return `<div class="empty-state"><h3>${esc(title)}</h3><p>${esc(text)}</p>${cta ? `<button class="btn btn-primary" type="button" data-action="${esc(action)}" ${attrs}><i class="ph ph-plus"></i>${esc(cta)}</button>` : ''}</div>`;
  }

  function taskRow(task, context, options = {}) {
    const project = getProject(task.projectId);
    const today = Core.dateOnly();
    const meta = [];
    if (project) meta.push(`<span style="display:inline-flex;align-items:center;gap:6px"><span class="project-dot" style="--project-color:${esc(project.color)}"></span>${esc(project.name)}</span>`);
    if (task.dueDate) {
      let cls = '';
      let label = `Due ${relativeDateLabel(task.dueDate, today)}`;
      if (!task.isCompleted && task.dueDate < today) { cls = 'danger'; label = `Overdue · ${relativeDateLabel(task.dueDate, today)}`; }
      else if (task.dueDate === today) cls = 'warning';
      meta.push(`<span class="${cls}">${esc(label)}</span>`);
    }
    if (options.upcomingReason === 'planned' && task.plannedDate) meta.push(`<span>Planned ${esc(relativeDateLabel(task.plannedDate, today))}</span>`);
    if (options.suggestionReason === 'missed-plan') meta.push(`<span>Missed ${esc(relativeDateLabel(task.plannedDate, today))}</span>`);
    if (task.isCompleted && task.completedAt) meta.push(`<span class="success">Completed ${esc(relativeDateLabel(String(task.completedAt).slice(0,10), today))}</span>`);
    const combinedMeta = meta.map((m, i) => `${i ? '<span class="separator">·</span>' : ''}${m}`).join('');
    const draggable = options.draggable && !task.isCompleted;
    const rowClass = `task-row ${task.isCompleted ? 'is-completed' : ''}`;
    return `<article class="${rowClass}" data-task-id="${esc(task.id)}" data-list-context="${esc(context)}" ${draggable ? 'draggable="true"' : ''}>
      <button class="complete-control ${task.isCompleted ? 'is-completed' : ''}" type="button" data-action="toggle-complete" data-task-id="${esc(task.id)}" aria-label="${task.isCompleted ? 'Mark incomplete' : 'Complete task'}">${task.isCompleted ? '<i class="ph ph-check"></i>' : ''}</button>
      <div class="task-main" data-action="open-task" data-task-id="${esc(task.id)}" role="button" tabindex="0">
        <div class="task-title">${esc(task.title)}</div>
        ${combinedMeta ? `<div class="task-meta">${combinedMeta}</div>` : ''}
        ${options.inbox ? `<div class="quick-actions"><button class="quick-chip" type="button" data-action="inbox-today" data-task-id="${esc(task.id)}">Today</button><button class="quick-chip" type="button" data-action="task-project-picker" data-task-id="${esc(task.id)}">Project</button><button class="quick-chip" type="button" data-action="task-due-picker" data-task-id="${esc(task.id)}">Date</button></div>` : ''}
      </div>
      <div class="task-actions"><button class="btn-icon" type="button" data-action="task-menu" data-task-id="${esc(task.id)}" aria-label="Task actions"><i class="ph ph-dots-three"></i></button></div>
    </article>`;
  }

  function renderRecovery() {
    if (recovery === 'global-recovery') return '<div class="recovery"><div class="recovery-card"><h1>Recovery is required.</h1><p>An interrupted global operation retained its internal recovery copy. Use Retry recovery below before continuing.</p></div></div>';
    if (recovery === 'migration-loading') return '<div class="recovery"><div class="recovery-card"><h1>Preparing your local data…</h1><p>Please wait while local storage is checked.</p></div></div>';
    if (recovery === 'migration-error') return '<div class="recovery"><div class="recovery-card"><h1>Local data migration could not finish.</h1><p>Your saved data and original files have not been overwritten. Check available storage and close other app tabs, then retry.</p><div class="recovery-actions"><button class="btn btn-secondary" type="button" data-action="retry-load">Retry</button></div></div></div>';
    const unsupported = recovery === 'unsupported-version';
    return `<div class="recovery"><div class="recovery-card"><h1>${unsupported ? 'This data is from a newer version.' : "We couldn't load your local data."}</h1><p>${unsupported ? "The prototype can't safely read this saved format." : 'Your saved data appears to be invalid. Nothing has been overwritten.'}</p><div class="recovery-actions"><button class="btn btn-secondary" type="button" data-action="retry-load">Retry</button><button class="btn btn-danger" type="button" data-action="recovery-reset">Reset local data</button></div></div></div>`;
  }

  function openQuickAdd(context = {}) {
    closePopover();
    const defaults = {
      projectId: context.projectId || null,
      areaId: context.areaId || null,
      plannedDate: context.plannedDate || (context.today ? Core.dateOnly() : null),
      processed: Boolean(context.anytime),
    };
    modalState = {
      type: 'quick',
      templateContext: context,
      defaults,
      draft: {
        title: '', notes: '', projectId: defaults.projectId, areaId: defaults.areaId, plannedDate: defaults.plannedDate, parsedPlanDate: null, explicitPlan: Boolean(defaults.plannedDate),
        dueDate: null, reminderAt: null, reminderFiredAt: null, recurrence: null, tagIds: [], priority: 'none', subtasks: [], moreOpen: false,
      },
      error: '',
    };
    renderModal();
    requestAnimationFrame(() => $('#quick-title')?.focus());
  }

  function openTaskDetail(taskId) {
    closePopover();
    const task = getTask(taskId);
    if (!task) return;
    modalState = { type: 'task', taskId, titleDraft: task.title, notesDraft: task.notes || '', error: '', attachmentRecords: [], attachmentMessage: '' };
    renderModal();
    loadTaskAttachments(taskId);
  }

  function openSearch() {
    closePopover();
    modalState = { type: 'search', query: '' };
    renderModal();
    requestAnimationFrame(() => $('#search-query')?.focus());
  }

  function openProjectModal(projectId = null, context = {}) {
    closePopover();
    const project = projectId ? getProject(projectId) : null;
    modalState = {
      type: 'project', projectId, templateContext: context,
      draft: { name: project?.name || '', color: project?.color || nextProjectColor(), areaId: project?.areaId || context.areaId || null },
      error: '',
    };
    renderModal();
    requestAnimationFrame(() => $('#project-name')?.focus());
  }


  function openTagModal(tagId = null) {
    closePopover();
    const tag = tagId ? getTag(tagId) : null;
    modalState = { type: 'tag', tagId, draft: { name: tag?.name || '', color: tag?.color || PROJECT_COLORS[(state.tags || []).length % PROJECT_COLORS.length] }, error: '' };
    renderModal();
    requestAnimationFrame(() => $('#tag-name')?.focus());
  }

  function openAreaModal(areaId = null) {
    closePopover();
    const area = areaId ? getArea(areaId) : null;
    modalState = { type: 'area', areaId, draft: { name: area?.name || '', color: area?.color || PROJECT_COLORS[(state.areas || []).length % PROJECT_COLORS.length], icon: area?.icon || AREA_ICONS[0] }, error: '' };
    renderModal();
    requestAnimationFrame(() => $('#area-name')?.focus());
  }

  function openAreaLinkedModal(kind, areaId) {
    const label = kind === 'goal' ? 'Goal' : 'Habit';
    modalState = { type: 'area-linked', kind, areaId, draft: { name: '' }, error: '' };
    renderModal();
    requestAnimationFrame(() => $('#area-linked-name')?.focus());
  }

  function goalDraft(goal = null, areaId = null) {
    return {
      title: goal?.title || '', areaId: goal?.areaId || areaId || null, status: goal?.status || 'active',
      progressMode: goal?.progressMode || 'manual', progressType: goal?.progressType || 'percentage',
      currentValue: goal?.currentValue ?? 0, targetValue: goal?.targetValue ?? 100, unit: goal?.unit || '', targetDate: goal?.targetDate || '',
      projectLinks: copyTemplate(goal?.projectLinks || []), taskIds: [...(goal?.taskIds || [])], habitLinks: copyTemplate(goal?.habitLinks || []),
      milestones: copyTemplate(goal?.milestones || []), reminders: { sevenDaysBefore: false, threeDaysBefore: false, oneDayBefore: false, onTargetDate: false, time: '09:00', ...goal?.reminders },
    };
  }

  function openGoalModal(goalId = null, context = {}) {
    const returnFocus = goalFocusTarget();
    closePopover();
    const goal = goalId ? getGoal(goalId) : null;
    modalState = { type: 'goal', goalId, draft: goalDraft(goal, context.areaId), error: '', returnFocus };
    modalState.templateContext = context;
    if (!goal && context.targetDate) modalState.draft.targetDate = context.targetDate;
    renderModal(); requestAnimationFrame(() => $('#goal-title')?.focus());
  }

  function habitDraft(habit = null, areaId = null) {
    return { name: habit?.name || '', areaId: habit?.areaId || areaId || null, goalIds: [...(habit?.goalIds || [])], trackingType: habit?.trackingType || 'checkbox', targetValue: habit?.targetValue ?? 1, unit: habit?.unit || '', quickValues: (habit?.quickValues || []).join(','), frequencyType: habit?.frequencyType || 'daily', weekdays: habit?.weekdays || [1, 2, 3, 4, 5], timesPerWeek: habit?.timesPerWeek || 4, everyNDays: habit?.everyNDays || 2, startDate: habit?.startDate || Core.dateOnly(), continuation: habit?.continuation || 'automatic', endType: habit?.endType || 'never', endDate: habit?.endDate || '', successfulPeriodsTarget: habit?.successfulPeriodsTarget || '', reminders: (habit?.reminders || []).map(item => ({ ...item })) };
  }

  function openHabitModal(habitId = null, context = {}) {
    closePopover(); const habit = habitId ? getHabit(habitId) : null;
    modalState = { type: 'habit', habitId, draft: habitDraft(habit, context.areaId), error: '' };
    modalState.templateContext = context;
    if (!habit && context.startDate) modalState.draft.startDate = context.startDate;
    renderModal(); requestAnimationFrame(() => $('#habit-name')?.focus());
  }

  function openMilestoneModal(goalId, milestoneId = null) {
    const previous = modalState?.type === 'goal' ? modalState : null;
    if (previous) readGoalDraft();
    const milestone = milestoneId ? (previous?.draft || getGoal(goalId))?.milestones.find(item => item.id === milestoneId) : null;
    modalState = { type: 'milestone', goalId, milestoneId, previous, returnFocus: goalFocusTarget(), draft: { title: milestone?.title || '', date: milestone?.date || '' }, error: '' };
    renderModal(); requestAnimationFrame(() => $('#milestone-title')?.focus());
  }

  function openGoalLinksModal(goalId) {
    const previous = modalState?.type === 'goal' ? modalState : null;
    if (previous) readGoalDraft();
    const goal = previous?.draft || getGoal(goalId); if (!goal) return;
    modalState = { type: 'goal-links', goalId, previous, returnFocus: goalFocusTarget(), draft: { taskIds: [...(goal.taskIds || [])], projectLinks: copyTemplate(goal.projectLinks || []), habitLinks: copyTemplate(goal.habitLinks || []) } };
    renderModal();
  }

  function openKnowledgeModal(type, id = null, areaId = null) {
    if (!['note', 'resource'].includes(type)) return;
    const owner = id && attachmentOwner({ ownerType: type, ownerId: id });
    if (id && !owner) return;
    closePopover(); flushTextSave();
    const item = owner?.item;
    modalState = { type: 'knowledge', ownerType: type, ownerId: id, source: item || null, returnFocus: goalFocusTarget(), error: '', attachmentRecords: [], attachmentMessage: '', pendingFiles: [],
      draft: { title: item?.title || '', text: (type === 'note' ? item?.body : item?.description) || '', areaId: item?.areaId || areaId || null, linkUrls: [...(item?.linkUrls || [])], linkDraft: '',
        relatedTaskIds: [...(item?.relatedTaskIds || [])], relatedProjectIds: [...(item?.relatedProjectIds || [])], relatedGoalIds: [...(item?.relatedGoalIds || [])], relatedHabitIds: [...(item?.relatedHabitIds || [])] } };
    renderModal(); requestAnimationFrame(() => $('#knowledge-title')?.focus());
    if (id) loadOwnerAttachments({ ownerType: type, ownerId: id });
  }

  function readKnowledgeDraft() {
    if (modalState?.type !== 'knowledge') return;
    const d = modalState.draft;
    d.title = $('#knowledge-title')?.value ?? d.title;
    d.text = $('#knowledge-text')?.value ?? d.text;
    d.areaId = $('#knowledge-area')?.value || null;
    d.linkDraft = $('#knowledge-link')?.value ?? d.linkDraft;
    if (modalState.ownerType === 'resource') for (const field of ['relatedTaskIds', 'relatedProjectIds', 'relatedGoalIds', 'relatedHabitIds'])
      d[field] = $$(`[data-knowledge-relation="${field}"]:checked`).map(input => input.value);
  }

  function addKnowledgeLink() {
    readKnowledgeDraft();
    const d = modalState.draft, value = d.linkDraft.trim();
    if (!value || d.linkUrls.includes(value)) { modalState.error = value ? 'This link has already been added.' : 'Enter a link before adding it.'; renderModal(); requestAnimationFrame(() => $('#knowledge-link')?.focus()); return false; }
    d.linkUrls.push(value); d.linkDraft = ''; modalState.error = '';
    renderModal(); requestAnimationFrame(() => $('#knowledge-link')?.focus()); return true;
  }

  async function saveKnowledge() {
    if (!state || undoHold || modalState?.type !== 'knowledge' || modalState.busy) return;
    readKnowledgeDraft();
    const dialog = modalState, type = dialog.ownerType, d = dialog.draft;
    if (!d.title.trim()) { dialog.error = `${knowledgeLabel(type)} needs a title.`; renderModal(); return; }
    if (d.linkDraft.trim() && !addKnowledgeLink()) return;
    if (d.areaId && !getArea(d.areaId)) { dialog.error = 'The selected Area no longer exists.'; renderModal(); return; }
    if (dialog.ownerId && attachmentOwner({ ownerType: type, ownerId: dialog.ownerId })?.item !== dialog.source) { dialog.error = 'The item changed. Reopen it before saving.'; renderModal(); return; }
    const ts = nowIso(), item = dialog.source || { id: uid(type), createdAt: ts, attachmentIds: [] }, previous = copyTemplate(item);
    Object.assign(item, { title: d.title.trim(), areaId: d.areaId, linkUrls: [...d.linkUrls], updatedAt: ts, [type === 'note' ? 'body' : 'description']: d.text });
    if (type === 'resource') for (const [field, collection] of [['relatedTaskIds', 'tasks'], ['relatedProjectIds', 'projects'], ['relatedGoalIds', 'goals'], ['relatedHabitIds', 'habits']]) {
      if (d[field].some(id => !state[collection].some(candidate => candidate.id === id))) { Object.assign(item, previous); dialog.error = 'A related item changed. Reopen this Resource before saving.'; renderModal(); return; }
      item[field] = [...d[field]];
    }
    if (!dialog.source) state[knowledgeCollection(type)].push(item);
    if (!saveState()) {
      if (dialog.source) Object.assign(item, previous); else state[knowledgeCollection(type)].splice(state[knowledgeCollection(type)].indexOf(item), 1);
      dialog.error = 'Changes could not be saved locally. Try again.'; renderModal(); return;
    }
    dialog.busy = true;
    dialog.ownerId = item.id; dialog.source = item;
    const fileMessage = dialog.pendingFiles.length ? await addAttachments({ ownerType: type, ownerId: item.id }, dialog.pendingFiles) : '';
    if (modalState === dialog) { closeModal(); navigate(type + '/' + item.id); }
    if (fileMessage) setToastMessage(fileMessage);
  }

  function openGoalRemindersModal(goalId) {
    const previous = modalState?.type === 'goal' ? modalState : null;
    if (previous) readGoalDraft();
    const goal = previous?.draft || getGoal(goalId); if (!goal) return;
    modalState = { type: 'goal-reminders', goalId, previous, returnFocus: goalFocusTarget(), draft: { ...goal.reminders } };
    renderModal();
  }

  function openConfirm(config) {
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closePopover();
    modalState = { type: 'confirm', ...config };
    renderModal();
  }

  function closeModal() {
    if (modalState?.previous?.type === 'goal' || (modalState?.previous && ['calendar-value', 'calendar-progress'].includes(modalState.type))) {
      const target = modalState.returnFocus; modalState = modalState.previous; renderModal(); restoreGoalFocus(target); return;
    }
    if(modalState?.type==='recurrence-scope'){cancelRecurrenceScope();return;}
    if(modalState?.type==='template-picker'){modalState=modalState.previous;renderModal();return;}
    if(modalState?.onCancel){const cancel=modalState.onCancel;cancel();return;}
    if(flushTaskDraft(()=>closeModal()))return;
    const goalReturn = modalState?.returnFocus;
    const returnTarget = modalReturnFocus;
    const returnDate = calendarReturnDate;
    modalReturnFocus = null;
    calendarReturnDate = null;
    modalState = null;
    $('#modal-root').innerHTML = '';
    restoreGoalFocus(goalReturn);
    if (returnTarget || returnDate) requestAnimationFrame(() => {
      const target = returnTarget?.isConnected ? returnTarget : returnDate && $(`[data-action="calendar-detail"][data-date="${returnDate}"]`);
      target?.focus();
    });
  }

  function renderModal() {
    const root = $('#modal-root');
    if (!modalState) { root.innerHTML = ''; return; }
    if (modalState.type === 'quick') root.innerHTML = renderQuickModal();
    else if (modalState.type === 'task') root.innerHTML = renderTaskModal();
    else if (modalState.type === 'search') root.innerHTML = renderSearchModal();
    else if (modalState.type === 'project') root.innerHTML = renderProjectModal();
    else if (modalState.type === 'tag') root.innerHTML = renderTagModal();
    else if (modalState.type === 'area') root.innerHTML = renderAreaModal();
    else if (modalState.type === 'area-linked') root.innerHTML = renderAreaLinkedModal();
    else if (modalState.type === 'knowledge') root.innerHTML = renderKnowledgeModal();
    else if (modalState.type === 'goal') root.innerHTML = renderGoalModal();
    else if (modalState.type === 'goal-source') root.innerHTML = renderGoalSourceModal();
    else if (modalState.type === 'habit') root.innerHTML = renderHabitModal();
    else if (modalState.type === 'habit-settings') root.innerHTML = renderHabitSettingsModal();
    else if (modalState.type === 'calendar-day') root.innerHTML = renderCalendarDetail();
    else if (modalState.type === 'calendar-value') root.innerHTML = renderCalendarValue();
    else if (modalState.type === 'calendar-progress') root.innerHTML = renderCalendarGoalProgress();
    else if (modalState.type === 'milestone') root.innerHTML = renderMilestoneModal();
    else if (modalState.type === 'goal-links') root.innerHTML = renderGoalLinksModal();
    else if (modalState.type === 'goal-reminders') root.innerHTML = renderGoalRemindersModal();
    else if (modalState.type === 'goal-reached') root.innerHTML = renderGoalReachedModal();
    else if (modalState.type === 'habit-finished') root.innerHTML = renderHabitFinishedModal();
    else if (modalState.type === 'confirm') root.innerHTML = renderConfirmModal();
    else if (modalState.type === 'duplicate') root.innerHTML = renderDuplicateModal();
    else if (modalState.type === 'import-backup') root.innerHTML = renderImportBackupModal();
    else if (modalState.type === 'template') root.innerHTML = renderTemplateModal();
    else if (modalState.type === 'template-picker') root.innerHTML = renderTemplatePicker();
    else if (modalState.type === 'saved-view') root.innerHTML = renderSavedViewModal();
    else if (modalState.type === 'recurrence-scope') root.innerHTML = renderRecurrenceScope();
    if (['quick','project','habit','goal'].includes(modalState.type) && !modalState.taskId && !modalState.projectId && !modalState.habitId && !modalState.goalId) {
      $('.modal-inner',root)?.insertAdjacentHTML('afterbegin','<button class="btn btn-ghost" type="button" data-action="from-template"><i class="ph ph-copy"></i> From template</button>');
    }
    if (['confirm','recurrence-scope'].includes(modalState?.type)) requestAnimationFrame(() => root.querySelector('.modal button, .modal [href], .modal input, .modal select, .modal textarea, .modal [tabindex]:not([tabindex="-1"])')?.focus());
    if (['goal', 'goal-source', 'goal-links', 'goal-reminders', 'milestone', 'habit-settings'].includes(modalState?.type)) requestAnimationFrame(() => ([...root.querySelectorAll('input, select, textarea')].find(el => el.offsetParent !== null) || root.querySelector('.modal-footer [data-action="close-modal"]'))?.focus());
  }

  function modalFrame(content, cls = '') {
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal ${cls}" role="dialog" aria-modal="true">${content}</section></div>`;
  }

  const TEMPLATE_TYPES = ['task','project','habit','goal'];
  const SAVED_VIEW_TYPES = ['tasks','goals','habits'];
  const SAVED_FILTER_KEYS = {tasks:['areaId','projectId','tagId','priority','plannedDate','dueDate','completion'],goals:['areaId','status','targetDate'],habits:['areaId','status','trackingType','frequencyType']};
  function renderProjects() {
    return pageHeader('Projects','Active projects',{add:false,actionHtml:'<button class="btn btn-primary" data-action="new-project">New project</button>'}) + sortedProjects().map(p=>`<button class="sidebar-action" data-route="project/${esc(p.id)}"><i class="ph ph-folder"></i><span>${esc(p.name)}</span></button>`).join('');
  }
  function savedViewActions(view) {
    return `<div class="modal-footer-actions">${[['edit-saved-view','ph-pencil-simple','Edit view'],['duplicate-saved-view','ph-copy','Duplicate view'],['pin-saved-view','ph-push-pin',view.isPinned?'Unpin view':'Pin view'],['delete-saved-view','ph-trash','Delete view']].map(([action,icon,label])=>`<button class="btn-icon" type="button" data-action="${action}" data-saved-view-id="${esc(view.id)}" aria-label="${label}" title="${label}"><i class="ph ${icon}"></i></button>`).join('')}</div>`;
  }
  function renderSavedViews() {
    return pageHeader('Saved Views','Reusable filters for one object type.',{add:false,actionHtml:'<button class="btn btn-primary" data-action="new-saved-view"><i class="ph ph-plus"></i> New saved view</button>'}) + `<section class="section">${state.savedViews.length?state.savedViews.map(view=>`<article class="goal-row" data-saved-view-row="${esc(view.id)}"><button class="goal-open" type="button" data-route="saved-view/${esc(view.id)}"><strong>${esc(view.name)}</strong><small>${esc(templateLabel(view.type))}${view.isPinned?' · Pinned':''}</small></button>${savedViewActions(view)}</article>`).join(''):'<p class="area-empty-copy">No saved views yet. Create a filter you can return to.</p>'}</section>`;
  }
  function renderSavedView(id) {
    const view=state.savedViews.find(v=>v.id===id);
    if(!view)return pageHeader('Saved View not found','This view may have been deleted.',{add:false});
    const today=Core.dateOnly(),rows=Core.applySavedView(view,state,today);
    const renderRow=item=>view.type==='tasks'?taskRow(item,'saved-view'):view.type==='goals'?renderGoalRow(item):renderHabitRow(item,item.status==='active'?Core.habitStatusForDate(item,state.habitLogCache?.[item.id] || [],today,today):null);
    return pageHeader(view.name,`${rows.length} ${view.type}`,{add:false,actionHtml:savedViewActions(view)}) + `<section class="section" data-saved-results="${esc(id)}">${rows.length?rows.map(renderRow).join(''):'<p class="area-empty-copy">No matching items. Adjust this view’s filters to change the results.</p>'}</section>`;
  }
  function openSavedViewModal(id=null) {
    closePopover();modalReturnFocus=document.activeElement;
    const view=state.savedViews.find(v=>v.id===id);
    modalState={type:'saved-view',savedViewId:id,draft:view?copyTemplate(view):{name:'',type:'tasks',filters:{},isPinned:false},error:''};
    renderModal();requestAnimationFrame(()=>$('#saved-view-name')?.focus());
  }
  function readSavedViewDraft() {
    const draft=modalState.draft;draft.name=$('#saved-view-name').value;draft.isPinned=$('#saved-view-pinned').checked;
    draft.filters=Object.fromEntries($$('[data-saved-filter]').filter(e=>e.value).map(e=>[e.dataset.savedFilter,e.value]));
  }
  function renderSavedViewModal() {
    const {draft,error}=modalState;
    const choices={areaId:state.areas.map(a=>[a.id,a.name]),projectId:state.projects.map(p=>[p.id,p.name]),tagId:state.tags.map(t=>[t.id,t.name]),priority:['none','low','medium','high'].map(v=>[v,templateLabel(v)]),completion:[['open','Open'],['completed','Completed']],status:(draft.type==='goals'?['active','paused','completed','archived']:['active','paused','archived']).map(v=>[v,templateLabel(v)]),trackingType:[['checkbox','Checkbox'],['numeric','Numeric']],frequencyType:[['daily','Daily'],['weekdays','Selected weekdays'],['timesPerWeek','X times per week'],['everyNDays','Every N days']]};
    const labels={areaId:'Area',projectId:'Project',tagId:'Tag',priority:'Priority',completion:'Completion',plannedDate:'Planned date (exact day)',dueDate:'Due date (exact day)',targetDate:'Target date (exact day)',status:'Status',trackingType:'Tracking',frequencyType:'Frequency'};
    const fields=SAVED_FILTER_KEYS[draft.type].map(key=>{
      let opts=choices[key];const value=draft.filters[key] || '';
      if(opts && value && !opts.some(([v])=>v===value))opts=[...opts,[value,'Missing reference']];
      return `<label class="field-label">${labels[key]}${opts?`<select class="input" data-saved-filter="${key}"><option value="">Any</option>${opts.map(([v,label])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(label)}</option>`).join('')}</select>`:`<input class="input" type="date" data-saved-filter="${key}" value="${esc(value)}" />`}</label>`;
    }).join('');
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${modalState.savedViewId?'Edit':'New'} saved view</h2><button class="btn-icon" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><label class="field-label" for="saved-view-name">Name</label><input class="input" id="saved-view-name" value="${esc(draft.name)}" /><label class="field-label" for="saved-view-type">Object type</label><select class="input" id="saved-view-type">${SAVED_VIEW_TYPES.map(v=>`<option value="${v}" ${v===draft.type?'selected':''}>${templateLabel(v)}</option>`).join('')}</select><div class="template-fields">${fields}</div><label class="field-label"><input id="saved-view-pinned" type="checkbox" ${draft.isPinned?'checked':''} /> Pin to sidebar</label>${error?`<p class="validation" role="alert">${esc(error)}</p>`:''}<div class="modal-footer"><button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-saved-view">Save view</button></div></div>`,'quick');
  }
  function saveSavedView() {
    readSavedViewDraft();const draft=modalState.draft;
    if(!draft.name.trim()){modalState.error='Give this view a name.';renderModal();return;}
    const existing=state.savedViews.find(v=>v.id===modalState.savedViewId);
    const view={...draft,name:draft.name.trim(),id:existing?.id || uid('view'),createdAt:existing?.createdAt || nowIso(),updatedAt:nowIso()};
    if(existing)state.savedViews.splice(state.savedViews.indexOf(existing),1,view);else state.savedViews.push(view);
    saveState();closeModal();render();
  }
  function deleteSavedView(id) {
    requestDeleteEntity('saved-view', id);
  }
  function saveShortcut(command) {
    const raw=$(`[data-shortcut="${command}"]`).value,value=Core.normalizeShortcut(raw);
    shortcutError='';
    if(!value)shortcutError='Use a letter or digit with optional Ctrl/Cmd, Alt and Shift, or choose Disable.';
    else {const conflict=Object.keys(SHORTCUT_DEFAULTS).find(key=>key!==command && Core.normalizeShortcut(state.settings.shortcuts[key])===value);if(conflict)shortcutError=`Already assigned to ${SHORTCUT_LABELS[conflict]}. Choose another shortcut.`;}
    if(shortcutError){render();return;}
    state.settings.shortcuts[command]=value;saveAndRender();
  }
  const copyTemplate = value => JSON.parse(JSON.stringify(value));
  const templateLabel = type => type[0].toUpperCase() + type.slice(1);
  function renderTemplates() {
    const type = TEMPLATE_TYPES.includes(state.ui.templateType) ? state.ui.templateType : 'task';
    const rows = state.templates.filter(t => t.type === type);
    return pageHeader('Templates','Reusable snapshots with relative dates.',{add:false,actionHtml:'<button class="btn btn-primary" type="button" data-action="new-template"><i class="ph ph-plus"></i> New template</button>'}) + `<div class="view-tabs">${TEMPLATE_TYPES.map(t=>`<button class="btn ${t===type?'btn-secondary':'btn-ghost'}" type="button" data-template-type="${t}">${templateLabel(t)}</button>`).join('')}</div><section class="section">${rows.length ? rows.map(t=>`<article class="goal-row" data-template-row="${esc(t.id)}"><div class="goal-open"><strong>${esc(t.name)}</strong><small>${esc(t.data.title || t.data.name || '')}</small></div><div class="modal-footer-actions"><button class="btn-icon" data-action="use-template" data-template-id="${esc(t.id)}" aria-label="Use template"><i class="ph ph-plus"></i></button><button class="btn-icon" data-action="edit-template" data-template-id="${esc(t.id)}" aria-label="Edit template"><i class="ph ph-pencil-simple"></i></button><button class="btn-icon" data-action="duplicate-template" data-template-id="${esc(t.id)}" aria-label="Duplicate template"><i class="ph ph-copy"></i></button><button class="btn-icon" data-action="delete-template" data-template-id="${esc(t.id)}" aria-label="Delete template"><i class="ph ph-trash"></i></button></div></article>`).join('') : '<p class="area-empty-copy">No templates yet. Create one or save an existing item as a template.</p>'}</section>`;
  }
  function openTemplateModal(templateId = null, type = state.ui.templateType || 'task', snapshot = null) {
    closePopover();
    const existing = state.templates.find(t=>t.id===templateId);
    const empty = type === 'task' ? {title:'',subtasks:[]} : type === 'project' ? {name:'',tasks:[]} : type === 'goal' ? {title:'',milestones:[],targetValue:100} : {name:'',targetValue:1,reminders:[]};
    const draft = existing ? copyTemplate(existing) : {name:'',...(snapshot || Core.templateFromEntity(type,empty,{},Core.dateOnly()))};
    modalState = {type:'template',templateId,draft,error:''};
    renderModal(); requestAnimationFrame(()=>$('#template-name')?.focus());
  }
  function templateField(data,key,label,kind='text',options=null,prefix='') {
    const path = `${prefix}${key}`;
    const value = data[key];
    const attrs = `class="input" data-template-field="${path}" data-template-kind="${kind}"`;
    let input;
    if (options) input = `<select ${attrs} ${kind==='ids'||kind==='indices'?'multiple':''}>${options.map(([v,l])=>`<option value="${esc(v)}" ${kind==='ids'||kind==='indices'?(value || []).includes(v)?'selected':'':String(value ?? '')===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
    else if (kind==='boolean') input = `<input ${attrs} type="checkbox" ${value?'checked':''}>`;
    else if (kind==='notes') input = `<textarea ${attrs}>${esc(value || '')}</textarea>`;
    else input = `<input ${attrs} type="${['number','time','color'].includes(kind)?kind:'text'}" ${kind==='number'?'step="any"':''} value="${esc(Array.isArray(value)?value.join(','):value ?? '')}">`;
    return `<label class="field-label">${label}${input}</label>`;
  }
  function templateFields(type,d,prefix='') {
    const f=(key,label,kind,opts)=>templateField(d,key,label,kind,opts,prefix);
    const choices=key=>[['','None'],...state[key].map(x=>[x.id,x.name || x.title])];
    let html=f(type==='task'||type==='goal'?'title':'name',type==='task'||type==='goal'?'Title':'Name')+f('areaId','Area','text',choices('areas'));
    if (type!=='goal') html+=f('goalIds','Goal links (select multiple)','ids',state.goals.map(g=>[g.id,g.title]));
    if(type==='task') {
      html+=f('notes','Notes','notes')+f('projectId','Project','text',choices('projects'))+f('tagIds','Tags (select multiple)','ids',state.tags.map(t=>[t.id,t.name]))+f('priority','Priority','text',[['none','None'],['low','Low'],['medium','Medium'],['high','High']])+f('plannedOffsetDays','Planned day offset (blank = none)','number')+f('plannedTime','Planned time','time')+f('dueOffsetDays','Due day offset (blank = none)','number')+f('dueTime','Due time','time')+f('reminderOffsetDays','Reminder day offset (blank = none)','number')+f('reminderTime','Reminder local time','time');
      const recurrence=d.recurrence || {};
      html+=templateField(recurrence,'frequency','Repeat','text',[['','Does not repeat'],['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']],`${prefix}recurrence.`)+templateField(recurrence,'interval','Repeat interval','number',null,`${prefix}recurrence.`);
      html+=templateField(recurrence,'endType','Repeat end condition','text',[['never','Never'],['date','On relative date'],['afterOccurrences','After N occurrences']],`${prefix}recurrence.`)+templateField(recurrence,'endOffsetDays','Repeat end day offset','number',null,`${prefix}recurrence.`)+templateField(recurrence,'endAfterOccurrences','Repeat total occurrences','number',null,`${prefix}recurrence.`);
      html+=templateRows('subtasks',d.subtasks || [],prefix,'subtask');
    } else if(type==='project') html+=f('color','Color','color')+templateRows('tasks',d.tasks || [],prefix,'task');
    else if(type==='habit') {
      html+=f('trackingType','Tracking','text',[['checkbox','Checkbox'],['numeric','Numeric']])+f('targetValue','Target','number')+f('unit','Unit')+f('quickValues','Quick values (comma separated)','numbers')+f('frequencyType','Frequency','text',[['daily','Daily'],['weekdays','Selected weekdays'],['timesPerWeek','X times per week'],['everyNDays','Every N days']])+f('weekdays','Weekdays (0 = Sun, 1 = Mon … 6 = Sat)','numbers')+f('timesPerWeek','Times per week','number')+f('everyNDays','Every N days','number')+f('continuation','Continuation','text',[['automatic','Repeat automatically'],['askEachPeriod','Ask each period'],['onePeriod','One period only']])+f('endType','End condition','text',[['never','Never'],['date','On relative date'],['successfulPeriods','After successful periods']])+f('endOffsetDays','End day offset (blank = none)','number')+f('successfulPeriodsTarget','Successful periods','number')+templateRows('reminders',d.reminders || [],prefix,'reminder');
    } else {
      html+=f('progressMode','Progress source','text',[['manual','Manual'],['linkedTasks','Linked tasks'],['linkedHabits','Linked habits']])+f('progressType','Progress type','text',[['percentage','Percentage'],['numeric','Numeric target']])+f('targetValue','Target value','number')+f('unit','Unit')+f('targetOffsetDays','Target day offset (blank = none)','number')+templateRows('milestones',d.milestones || [],prefix,'milestone');
      const r=d.reminders || {};
      html+=['sevenDaysBefore','threeDaysBefore','oneDayBefore','onTargetDate'].map((key,i)=>templateField(r,key,['7 days before','3 days before','1 day before','On target date'][i],'boolean',null,`${prefix}reminders.`)).join('')+templateField(r,'time','Reminder time','time',null,`${prefix}reminders.`);
    }
    if(type==='project' || type==='habit') {
      d.goalLinkConfigs=(d.goalIds || []).map(goalId=>(d.goalLinkConfigs || []).find(c=>c.goalId===goalId) || (type==='project'?{goalId,contributionMode:'allTasks',selectedTaskIndices:[]}:{goalId,metric:'totalCheckins',target:type==='habit' && d.trackingType==='numeric'?d.targetValue || 1:1}));
      html+=d.goalLinkConfigs.map((c,i)=>`<fieldset class="template-rows"><legend>${esc(getGoal(c.goalId)?.title || 'Linked Goal')}</legend>${type==='project'?templateField(c,'contributionMode','Project contribution','text',[['allTasks','All predefined tasks'],['selectedTasks','Selected predefined tasks']],`${prefix}goalLinkConfigs.${i}.`)+templateField(c,'selectedTaskIndices','Contributing tasks (select multiple)','indices',(d.tasks || []).map((t,index)=>[index,t.title || `Task ${index+1}`]),`${prefix}goalLinkConfigs.${i}.`):templateField(c,'metric','Habit metric','text',[['totalCheckins','Check-ins'],['streak','Streak'],['successfulPeriods','Successful periods']],`${prefix}goalLinkConfigs.${i}.`)+templateField(c,'target','Goal contribution target','number',null,`${prefix}goalLinkConfigs.${i}.`)}</fieldset>`).join('');
    }
    return html;
  }
  function templateRows(key,rows,prefix,kind) {
    const path=prefix+key;
    return `<fieldset class="template-rows"><legend>${templateLabel(key)}</legend>${rows.map((row,i)=>`<div class="template-row">${kind==='task'?templateFields('task',row,`${path}.${i}.`):kind==='reminder'?templateField(row,'time','Time','time',null,`${path}.${i}.`)+templateField(row,'enabled','Enabled','boolean',null,`${path}.${i}.`):templateField(row,'title','Title','text',null,`${path}.${i}.`)+(kind==='milestone'?templateField(row,'dateOffsetDays','Day offset (blank = none)','number',null,`${path}.${i}.`):'')}<button class="btn btn-ghost" type="button" data-action="template-remove-row" data-path="${path}" data-index="${i}">Remove ${kind}</button></div>`).join('')}<button class="btn btn-ghost" type="button" data-action="template-add-row" data-path="${path}" data-kind="${kind}">Add ${kind}</button></fieldset>`;
  }
  function renderTemplateModal() {
    const d=modalState.draft;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${modalState.templateId?'Edit':'New'} ${templateLabel(d.type)} template</h2><button class="btn-icon" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label">Template name<input id="template-name" class="input" value="${esc(d.name)}"></label><p class="area-empty-copy">Day offsets are relative to the day you create an item. Use 0 for Today; negative values are allowed.</p>${templateFields(d.type,d.data)}${modalState.error?`<p class="validation" role="alert">${esc(modalState.error)}</p>`:''}</div><div class="modal-footer"><span></span><button class="btn btn-primary" type="button" data-action="save-template">Save template</button></div></div>`,'quick');
  }
  function templatePath(data,path,create=false) {
    const keys=path.split('.'),last=keys.pop();let parent=data;
    for(const key of keys) { if(parent[key]==null && create) parent[key]={}; parent=parent[key]; }
    return {parent,last};
  }
  function readTemplateDraft() {
    if(modalState?.type!=='template') return;
    modalState.draft.name=$('#template-name')?.value || '';
    $$('[data-template-field]').forEach(input=>{
      const {parent,last}=templatePath(modalState.draft.data,input.dataset.templateField,true);
      const kind=input.dataset.templateKind;
      parent[last]=kind==='boolean'?input.checked:kind==='number'?(input.value===''?null:Number(input.value)):kind==='numbers'?input.value.split(',').filter(v=>v.trim()).map(Number):kind==='ids'||kind==='indices'?[...input.selectedOptions].map(o=>kind==='indices'?Number(o.value):o.value):input.value || null;
    });
  }
  function saveTemplate() {
    readTemplateDraft(); const d=modalState.draft;
    if(!d.name.trim() || !String(d.data.title || d.data.name || '').trim()) {modalState.error='Template and item need a name.';renderModal();return;}
    const problem = templateDataProblem(d.type,d.data);
    if(problem){modalState.error=problem;renderModal();return;}
    const id=modalState.templateId;
    const record={...copyTemplate(d),name:d.name.trim(),id:id || uid('template'),createdAt:id?state.templates.find(t=>t.id===id).createdAt:nowIso(),updatedAt:nowIso()};
    if(id) state.templates[state.templates.findIndex(t=>t.id===id)]=record;else state.templates.push(record);
    modalState.savedTemplateId=record.id;
    state.ui.templateType=d.type;saveState();closeModal();render();
  }
  function templateDataProblem(type,d) {
    const relativeProblem = value => value && typeof value==='object' && Object.entries(value).some(([key,item])=>key.endsWith('OffsetDays') ? item!==null && !Number.isInteger(item) : typeof item==='object' && relativeProblem(item));
    if(relativeProblem(d))return 'Day offsets must be whole numbers.';
    if(type==='task' && d.recurrence?.frequency && (!Number.isInteger(d.recurrence.interval) || d.recurrence.interval<1 || d.recurrence.endType==='afterOccurrences' && (!Number.isInteger(d.recurrence.endAfterOccurrences) || d.recurrence.endAfterOccurrences<1)))return 'Repeat interval and occurrence count must be positive whole numbers.';
    if(type==='task' && d.recurrence?.frequency && d.recurrence.endType==='date' && !Number.isInteger(d.recurrence.endOffsetDays))return 'Provide a whole-number repeat end day offset.';
    if(type==='task' && (d.subtasks || []).some(s=>!String(s.title || '').trim())) return 'Subtasks need a title.';
    if(type==='project') {for(const t of d.tasks || []){if(!String(t.title || '').trim())return 'Predefined tasks need a title.';const error=templateDataProblem('task',t);if(error)return error;}}
    if(type==='goal' && (d.milestones || []).some(m=>!String(m.title || '').trim()))return 'Milestones need a title.';
    if((type==='habit' && d.trackingType==='numeric' || type==='goal' && d.progressType==='numeric') && !(d.targetValue>0))return 'Numeric targets must be above zero.';
    if(type==='habit' && d.frequencyType==='weekdays' && (!(d.weekdays || []).length || d.weekdays.some(n=>!Number.isInteger(n)||n<0||n>6)))return 'Select valid weekdays from 0 to 6.';
    if(type==='habit' && d.frequencyType==='timesPerWeek' && (!Number.isInteger(d.timesPerWeek)||d.timesPerWeek<1||d.timesPerWeek>7))return 'Times per week must be a positive whole number up to 7.';
    if(type==='habit' && d.frequencyType==='everyNDays' && (!Number.isInteger(d.everyNDays)||d.everyNDays<1))return 'Every N days must be a positive whole number.';
    if(type==='habit' && d.endType==='successfulPeriods' && (!Number.isInteger(d.successfulPeriodsTarget)||d.successfulPeriodsTarget<1))return 'Successful periods must be a positive whole number.';
    if(type==='habit' && d.endType==='date' && !Number.isInteger(d.endOffsetDays))return 'Provide a whole-number end day offset.';
    if(type==='habit' && (d.goalLinkConfigs || []).some(c=>!(c.target>0)))return 'Goal contribution targets must be above zero.';
    return null;
  }
  function deleteTemplate(id) {
    requestDeleteEntity('template', id);
  }
  function editTemplateRow(button,remove=false) {
    readTemplateDraft();const editor=modalState;const {parent,last}=templatePath(editor.draft.data,button.dataset.path,true);parent[last] ||= [];
    if(!remove){const kind=button.dataset.kind;parent[last].push(kind==='task'?Core.templateFromEntity('task',{title:'',subtasks:[]}).data:kind==='reminder'?{time:'09:00',enabled:true}:{title:'',dateOffsetDays:null,isCompleted:false,completedAt:null});renderModal();return;}
    const index=Number(button.dataset.index),snapshot=copyTemplate(parent[last][index]);
    const removedSelections=button.dataset.path==='tasks'?(editor.draft.data.goalLinkConfigs || []).filter(c=>(c.selectedTaskIndices || []).includes(index)).map(c=>c.goalId):[];
    const adjustSelections=(data,inserting=false)=>{
      if(button.dataset.path!=='tasks')return;
      for(const c of data.goalLinkConfigs || []) {
        c.selectedTaskIndices=(c.selectedTaskIndices || []).filter(i=>inserting || i!==index).map(i=>inserting?(i>=index?i+1:i):(i>index?i-1:i));
        if(inserting && removedSelections.includes(c.goalId))c.selectedTaskIndices.push(index);
        c.selectedTaskIndices.sort((a,b)=>a-b);
      }
    };
    const focusPath=$('[data-template-field]:focus')?.dataset.templateField;
    const restoreEditor=()=>{modalState=editor;renderModal();requestAnimationFrame(()=>$(`[data-template-field="${focusPath || button.dataset.path+'.'+index+'.title'}"]`)?.focus());};
    openConfirm({title:'Remove template row?',message:'This changes only the template draft.',onConfirm:()=>{parent[last].splice(index,1);adjustSelections(editor.draft.data);restoreEditor();setUndo('Template row removed',()=>{
      if(modalState===editor)readTemplateDraft();
      parent[last].splice(Math.min(index,parent[last].length),0,copyTemplate(snapshot));
      adjustSelections(editor.draft.data,true);
      const saved=state.templates.find(t=>t.id===editor.savedTemplateId);
      if(saved){const target=templatePath(saved.data,button.dataset.path,true);target.parent[target.last] ||= [];target.parent[target.last].splice(Math.min(index,target.parent[target.last].length),0,copyTemplate(snapshot));adjustSelections(saved.data,true);saved.updatedAt=nowIso();saveAndRender();}
      if(modalState===editor)restoreEditor();
    });},onCancel:restoreEditor});
  }
  function openTemplatePicker() {
    if(modalState.type==='quick')syncQuickDraftFromDom();
    if(modalState.type==='habit')readHabitDraft();
    if(modalState.type==='goal') readGoalDraft();
    const previous=modalState;const type=previous.type==='quick'?'task':previous.type;
    modalState={type:'template-picker',kind:type,previous,returnFocus:previous.type === 'goal' ? goalFocusTarget() : null};renderModal();
    if (previous.type === 'goal') requestAnimationFrame(() => $('#modal-root [data-action="choose-template"], #modal-root [data-action="template-picker-back"]')?.focus());
  }
  function renderTemplatePicker() {
    const rows=state.templates.filter(t=>t.type===modalState.kind);
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">From ${templateLabel(modalState.kind)} template</h2><button class="btn-icon" data-action="template-picker-back" aria-label="Back"><i class="ph ph-x"></i></button></div>${rows.length?rows.map(t=>`<button class="btn btn-secondary template-choice" data-action="choose-template" data-template-id="${esc(t.id)}">${esc(t.name)}</button>`).join(''):'<p class="area-empty-copy">No templates of this type yet.</p>'}</div>`,'quick');
  }
  function chooseTemplate(id) {
    const template=state.templates.find(t=>t.id===id); if(!template)return;
    const previous=modalState.previous;const context=previous.templateContext || {};
    const contextDate=context.plannedDate || context.targetDate || context.startDate || Core.dateOnly();
    const out=Core.instantiateTemplate(template,contextDate,{state,makeId:uid,nowIso:nowIso()});
    modalState=previous;
    const item=out[template.type];
    if(context.areaId && getArea(context.areaId))item.areaId=context.areaId;
    if(template.type==='task') {
      if(context.projectId && getProject(context.projectId))item.projectId=context.projectId;
      if(item.projectId)item.areaId=null;
      modalState.draft={...modalState.draft,...item,explicitPlan:true,parsedPlanDate:null,moreOpen:false};
    } else if(template.type==='project')modalState.draft={...item};
    else if(template.type==='habit')modalState.draft=habitDraft(item);
    else modalState.draft=goalDraft(item);
    modalState.templateInstance=out;renderModal();
  }
  function templateMenuEntry(type,id) {
    return `<button class="popover-option" type="button" data-pop-action="save-template" data-template-source-type="${type}" data-template-source-id="${esc(id)}"><i class="ph ph-copy"></i>Save as template</button>`;
  }
  function syncTemplateEntityGoalLinks(kind,item,configs=[]) {
    for(const id of item.goalIds || []) {
      const goal=getGoal(id);if(!goal)continue;
      if(kind==='task' && !(goal.taskIds || []).includes(item.id))goal.taskIds=[...(goal.taskIds || []),item.id];
      if(kind==='project' && !(goal.projectLinks || []).some(l=>l.projectId===item.id)) {
        const config=configs.find(c=>c.goalId===id);
        goal.projectLinks=[...(goal.projectLinks || []),{projectId:item.id,contributionMode:config?.contributionMode || 'allTasks',selectedTaskIds:[...(config?.selectedTaskIds || [])]}];
      }
    }
  }

  function renderQuickModal() {
    const d = modalState.draft;
    const project = getProject(d.projectId);
    const effectivePlan = d.explicitPlan ? d.plannedDate : (d.parsedPlanDate || d.plannedDate);
    const assignedTags = (d.tagIds || []).map(getTag).filter(Boolean);
    return modalFrame(`<div class="modal-inner">
      <input id="quick-title" class="quick-title-input ${modalState.error ? 'is-error' : ''}" type="text" maxlength="500" autocomplete="off" placeholder="What needs to be done?" value="${esc(d.title)}" aria-label="Task title" />
      ${modalState.error ? `<div class="validation">${esc(modalState.error)}</div>` : ''}
      <div class="quick-properties">
        <button class="property-chip" type="button" data-action="quick-project-picker"><i class="ph ph-folder-simple"></i>${project ? `<span class="project-dot" style="--project-color:${esc(project.color)}"></span>${esc(project.name)}` : 'Project'}</button>
        <button class="property-chip" type="button" data-action="quick-plan-picker"><i class="ph ph-calendar-check"></i>${effectivePlan ? esc(relativeDateLabel(effectivePlan)) : 'Plan for'}</button>
        <button class="property-chip" type="button" data-action="quick-due-picker"><i class="ph ph-flag"></i>${d.dueDate ? `Due ${esc(relativeDateLabel(d.dueDate))}` : 'Due date'}</button>
        <button class="property-chip" type="button" data-action="quick-reminder-picker"><i class="ph ph-bell"></i>${d.reminderAt ? esc(formatReminder(d.reminderAt)) : 'Reminder'}</button>
        <button class="property-chip" type="button" data-action="quick-repeat-picker"><i class="ph ph-arrows-clockwise"></i>${d.recurrence ? esc(recurrenceLabel(d.recurrence)) : 'Repeat'}</button>
      </div>
      <button class="btn btn-ghost quick-more" type="button" data-action="toggle-quick-more"><i class="ph ph-caret-${d.moreOpen ? 'up' : 'down'}"></i> More</button>
      ${d.moreOpen ? `<div class="quick-extra"><div><label class="field-label" for="quick-notes">Notes</label><textarea id="quick-notes" class="textarea" placeholder="Add notes...">${esc(d.notes)}</textarea></div><div class="quick-advanced-grid"><button class="property-row compact-property" type="button" data-action="quick-tags-picker"><span class="property-key">Tags</span><span class="property-value">${assignedTags.length ? assignedTags.map(t => `<span class="tag-inline"><span class="tag-dot" style="--tag-color:${esc(t.color)}"></span>${esc(t.name)}</span>`).join(' ') : 'No tags'}</span></button><button class="property-row compact-property" type="button" data-action="quick-priority-picker"><span class="property-key">Priority</span><span class="property-value">${esc(priorityLabel(d.priority))}</span></button></div><div><div class="detail-heading"><span>Subtasks</span><span>${d.subtasks.length}</span></div><div class="subtask-list">${d.subtasks.map(s => quickDraftSubtaskRow(s)).join('')}</div><div class="add-subtask-input"><span></span><input id="quick-subtask" class="input" type="text" placeholder="Add subtask..." /></div></div></div>` : ''}
      <div class="modal-footer"><span class="shortcut-hint">↵ Add · ⇧↵ Add another</span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="create-task">Add task</button></div></div>
    </div>`, 'quick');
  }

  function quickDraftSubtaskRow(subtask) {
    return `<div class="subtask-row"><button class="complete-control ${subtask.isCompleted ? 'is-completed' : ''}" type="button" data-action="quick-toggle-subtask" data-subtask-id="${esc(subtask.id)}">${subtask.isCompleted ? '<i class="ph ph-check"></i>' : ''}</button><span class="subtask-title">${esc(subtask.title)}</span><button class="btn-icon" type="button" data-action="quick-delete-subtask" data-subtask-id="${esc(subtask.id)}"><i class="ph ph-x"></i></button></div>`;
  }

  function priorityLabel(value) {
    return value === 'high' ? 'High' : value === 'medium' ? 'Medium' : value === 'low' ? 'Low' : 'None';
  }

  function priorityIcon(value) {
    if (!value || value === 'none') return '';
    return `<i class="ph ph-flag priority-flag priority-${esc(value)}" title="${esc(priorityLabel(value))} priority" aria-label="${esc(priorityLabel(value))} priority"></i>`;
  }

  function tagSummary(tagIds, limit = 3) {
    const tags = (tagIds || []).map(getTag).filter(Boolean).slice(0, limit);
    return tags.map(tag => `<span class="tag-inline"><span class="tag-dot" style="--tag-color:${esc(tag.color)}"></span>${esc(tag.name)}</span>`).join(' ');
  }

  function renderTaskModal() {
    const task = getTask(modalState.taskId);
    if (!task) return '';
    const project = getProject(task.projectId);
    const completedCount = task.subtasks.filter(s => s.isCompleted).length;
    const today = Core.dateOnly();
    const dueClass = task.dueDate && !task.isCompleted && task.dueDate < today ? 'danger' : (task.dueDate === today ? 'warning' : '');
    return modalFrame(`<div class="modal-inner">
      <div class="modal-header"><div class="modal-task-title-wrap"><button class="complete-control ${task.isCompleted ? 'is-completed' : ''}" type="button" data-action="toggle-complete" data-task-id="${esc(task.id)}">${task.isCompleted ? '<i class="ph ph-check"></i>' : ''}</button><input id="detail-title" class="modal-task-title" type="text" maxlength="500" value="${esc(modalState.titleDraft)}" aria-label="Task title" /></div><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div>
      ${modalState.error ? `<div class="validation" style="margin:-8px 0 8px 36px">${esc(modalState.error)}</div>` : ''}
      <div class="detail-section"><textarea id="detail-notes" class="detail-notes" placeholder="Add notes...">${esc(modalState.notesDraft)}</textarea></div>
      <div class="detail-section detail-properties">
        <button class="property-row" type="button" data-action="task-project-picker" data-task-id="${esc(task.id)}"><span class="property-key">Project</span><span class="property-value">${project ? `<span style="display:inline-flex;align-items:center;gap:7px"><span class="project-dot" style="--project-color:${esc(project.color)}"></span>${esc(project.name)}</span>` : 'No project'}</span></button>
        <button class="property-row" type="button" data-action="task-plan-picker" data-task-id="${esc(task.id)}"><span class="property-key">Plan for</span><span class="property-value">${task.plannedDate ? esc(relativeDateLabel(task.plannedDate)) : 'Not planned'}</span></button>
        <button class="property-row" type="button" data-action="task-due-picker" data-task-id="${esc(task.id)}"><span class="property-key">Due date</span><span class="property-value"><span class="${dueClass}">${task.dueDate ? esc(relativeDateLabel(task.dueDate)) : 'No due date'}</span></span></button>
        <label class="property-row" for="detail-planned-time"><span class="property-key">Planned time</span><input id="detail-planned-time" class="input task-time-input" type="time" value="${esc(task.plannedTime || '')}" data-task-time="plannedTime" data-task-id="${esc(task.id)}"></label>
        <label class="property-row" for="detail-due-time"><span class="property-key">Due time</span><input id="detail-due-time" class="input task-time-input" type="time" value="${esc(task.dueTime || '')}" data-task-time="dueTime" data-task-id="${esc(task.id)}"></label>
        <button class="property-row" type="button" data-action="task-tags-picker" data-task-id="${esc(task.id)}"><span class="property-key">Tags</span><span class="property-value">${tagSummary(task.tagIds) || 'No tags'}</span></button>
        <button class="property-row" type="button" data-action="task-priority-picker" data-task-id="${esc(task.id)}"><span class="property-key">Priority</span><span class="property-value priority-value">${priorityIcon(task.priority)}${esc(priorityLabel(task.priority))}</span></button>
        <button class="property-row" type="button" data-action="task-reminder-picker" data-task-id="${esc(task.id)}"><span class="property-key">Reminder</span><span class="property-value">${task.reminderAt ? esc(formatReminder(task.reminderAt)) : 'No reminder'}</span></button>
        <button class="property-row" type="button" data-action="task-repeat-picker" data-task-id="${esc(task.id)}"><span class="property-key">Repeat</span><span class="property-value">${esc(recurrenceLabel(task.recurrence))}</span></button>
      </div>
      <div class="detail-section"><div class="detail-heading"><span>Subtasks</span><span>${completedCount} / ${task.subtasks.length}</span></div><div class="subtask-list" data-subtask-list="${esc(task.id)}">${[...task.subtasks].sort((a,b)=>clampOrder(a.order)-clampOrder(b.order)).map(s => subtaskRow(task, s)).join('')}</div><div class="add-subtask-input"><span></span><input id="detail-subtask" class="input" type="text" placeholder="Add subtask..." data-task-id="${esc(task.id)}" /></div></div>
      ${renderAttachmentsSection({ ownerType: 'task', ownerId: task.id })}
      <div class="detail-section" style="padding-bottom:0"><button class="danger-link" type="button" data-action="delete-task" data-task-id="${esc(task.id)}"><i class="ph ph-trash"></i> Delete task</button></div>
    </div>`);
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fileTypeLabel(record) {
    const name = String(record.fileName || 'file');
    const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : '';
    return ext || String(record.mimeType || 'File').split('/').pop().toUpperCase() || 'FILE';
  }

  function renderAttachmentRow(record) {
    return `<div class="attachment-row" data-attachment-id="${esc(record.id)}"><i class="ph ph-file attachment-file-icon"></i><div class="attachment-main"><strong title="${esc(record.fileName)}">${esc(record.fileName)}</strong><small>${esc(fileTypeLabel(record))} · ${esc(formatBytes(record.size))}</small></div><button class="btn-icon" type="button" data-action="attachment-menu" data-attachment-id="${esc(record.id)}" aria-label="Attachment actions"><i class="ph ph-dots-three"></i></button></div>`;
  }

  function renderAttachmentsSection(owner) {
    const item = attachmentOwner(owner)?.item;
    const count = item ? item.attachmentIds.length : modalState.pendingFiles.length;
    const attrs = `data-owner-type="${esc(owner.ownerType)}" data-owner-id="${esc(owner.ownerId || '')}"${owner.ownerType === 'task' ? ` data-task-id="${esc(owner.ownerId)}"` : ''}`;
    return `<div class="detail-section attachments-section"><div class="detail-heading"><span>Attachments</span><span>${count} / ${MAX_ATTACHMENTS_PER_TASK}</span></div><label class="attachment-drop-zone" ${attrs}><i class="ph ph-paperclip"></i><span><strong>Drop files here</strong><small>or choose files · max 10 MB each</small></span><span class="btn btn-secondary attachment-add-button">Add attachment</span><input id="attachment-input" type="file" multiple hidden ${attrs}></label>${modalState.attachmentMessage ? `<div class="attachment-message" role="status">${esc(modalState.attachmentMessage)}</div>` : ''}<div class="attachment-list">${(modalState.attachmentRecords || []).map(renderAttachmentRow).join('')}</div></div>`;
  }

  async function readOwnerAttachments(owner) {
    const records = await Attachments.getMany(owner.item.attachmentIds || []);
    const scoped = { tasks: [], notes: [], resources: [], [owner.type === 'task' ? 'tasks' : knowledgeCollection(owner.type)]: [owner.item] };
    TodoStorage.verifyAttachmentReferences(scoped, records);
    return records.filter(record => TodoStorage.attachmentBelongsTo(record, owner) && !record.pendingDeleteUntil);
  }

  function attachmentModalMatches(owner) {
    return owner.type === 'task' ? modalState?.type === 'task' && modalState.taskId === owner.item.id : modalState?.type === 'knowledge' && modalState.ownerType === owner.type && modalState.ownerId === owner.item.id;
  }

  async function loadTaskAttachments(taskId) {
    return loadOwnerAttachments({ ownerType: 'task', ownerId: taskId });
  }

  async function loadOwnerAttachments(descriptor) {
    if (!Attachments) return;
    const owner = attachmentOwner(descriptor), source = state; if (!owner) return;
    try {
      const records = await readOwnerAttachments(owner);
      if (source === state && attachmentOwner(descriptor)?.item === owner.item && attachmentModalMatches(owner)) { modalState.attachmentRecords = records; renderModal(); }
    } catch (error) {
      console.error(error);
      if (source === state && attachmentModalMatches(owner)) { modalState.attachmentMessage = 'Attachments are unavailable in this browser.'; renderModal(); }
    }
  }

  async function addAttachments(descriptor, files) {
    const owner = attachmentOwner(descriptor); if (!owner || !Attachments || undoHold) return;
    const task = owner.item, source = state;
    const { valid, tooLarge, countRejected } = selectAttachmentFiles(files, task.attachmentIds.length);
    let added = 0, failed = 0;
    for (const file of valid) {
      const id = uid('att'); const ts = nowIso();
      const identity = owner.type === 'task' ? { taskId: task.id } : { ownerType: owner.type, ownerId: task.id };
      const record = { id, ...identity, fileName: file.name || 'attachment', mimeType: file.type || 'application/octet-stream', size: file.size, blob: file, createdAt: ts, updatedAt: ts, pendingDeleteUntil: null };
      try {
        if (source !== state || attachmentOwner({ ownerType: owner.type, ownerId: task.id })?.item !== task || undoHold || task.attachmentIds.length >= MAX_ATTACHMENTS_PER_TASK) throw new Error('Attachment owner changed. Reopen the item.');
        await Attachments.put(record);
        if (source !== state || attachmentOwner({ ownerType: owner.type, ownerId: task.id })?.item !== task || undoHold || task.attachmentIds.length >= MAX_ATTACHMENTS_PER_TASK) throw new Error('Attachment owner changed. Reopen the item.');
        task.attachmentIds = [...(task.attachmentIds || []), id];
        task.updatedAt = nowIso();
        added++;
      } catch (error) { failed++; console.error(error); }
    }
    if (source === state) saveState();
    knowledgeAttachmentCache.delete(owner.type + ':' + task.id);
    const parts = attachmentMessages(added, tooLarge, countRejected);
    if (failed) parts.push('Attachments are unavailable in this browser.');
    if (attachmentModalMatches(owner)) {
      modalState.attachmentMessage = parts.join(' ');
      await loadOwnerAttachments({ ownerType: owner.type, ownerId: task.id });
    }
    if (state) render();
    return parts.join(' ');
  }

  function selectAttachmentFiles(files, count) {
    const incoming = [...(files || [])], remaining = Math.max(0, MAX_ATTACHMENTS_PER_TASK - count), valid = [];
    let tooLarge = 0;
    for (const file of incoming) {
      if (file.size > MAX_ATTACHMENT_BYTES) { tooLarge++; continue; }
      if (valid.length < remaining) valid.push(file);
    }
    return { valid, tooLarge, countRejected: Math.max(0, incoming.length - tooLarge - valid.length) };
  }

  function attachmentMessages(added, tooLarge, countRejected) {
    const parts = [];
    if (added) parts.push(`${added} ${added === 1 ? 'file' : 'files'} added.`);
    if (tooLarge) parts.push(`${tooLarge} ${tooLarge === 1 ? 'file is' : 'files are'} larger than 10 MB.`);
    if (countRejected) parts.push(`${countRejected} couldn't be added because the limit is 10.`);
    return parts;
  }

  function receiveAttachmentFiles(dataset, files) {
    if (modalState?.type === 'knowledge') readKnowledgeDraft();
    if (modalState?.type === 'knowledge' && !dataset.ownerId) {
      const { valid, tooLarge, countRejected } = selectAttachmentFiles(files, modalState.pendingFiles.length);
      modalState.pendingFiles.push(...valid);
      modalState.attachmentMessage = attachmentMessages(valid.length, tooLarge, countRejected).join(' ');
      renderModal(); return;
    }
    addAttachments({ ownerType: dataset.ownerType || 'task', ownerId: dataset.ownerId || dataset.taskId }, files);
  }

  function openAttachmentMenu(anchor, attachmentId) {
    const html = `<button class="popover-option" type="button" data-pop-action="attachment-open" data-attachment-id="${esc(attachmentId)}"><i class="ph ph-arrow-square-out"></i>Open</button><button class="popover-option" type="button" data-pop-action="attachment-download" data-attachment-id="${esc(attachmentId)}"><i class="ph ph-download-simple"></i>Download</button><div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="attachment-delete" data-attachment-id="${esc(attachmentId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>Delete</button>`;
    openPopover(anchor, html, { type: 'attachment-menu', attachmentId });
  }

  async function openAttachment(attachmentId, download = false) {
    const record = await Attachments?.get(attachmentId); if (!record) return;
    const url = URL.createObjectURL(record.blob);
    if (download) { const a=document.createElement('a'); a.href=url; a.download=record.fileName; document.body.appendChild(a); a.click(); a.remove(); }
    else { try { window.open(url, '_blank', 'noopener'); } catch (_) {} }
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    closePopover();
  }

  async function deleteAttachment(attachmentId) {
    requestDeleteEntity('attachment', attachmentId);
  }

  function subtaskRow(task, subtask) {
    return `<div class="subtask-row ${subtask.isCompleted ? 'is-completed' : ''}" draggable="true" data-subtask-id="${esc(subtask.id)}" data-parent-task-id="${esc(task.id)}"><button class="complete-control ${subtask.isCompleted ? 'is-completed' : ''}" type="button" data-action="toggle-subtask" data-task-id="${esc(task.id)}" data-subtask-id="${esc(subtask.id)}">${subtask.isCompleted ? '<i class="ph ph-check"></i>' : ''}</button><span class="subtask-title" data-action="edit-subtask" data-task-id="${esc(task.id)}" data-subtask-id="${esc(subtask.id)}" tabindex="0">${esc(subtask.title)}</span><button class="btn-icon" type="button" data-action="delete-subtask" data-task-id="${esc(task.id)}" data-subtask-id="${esc(subtask.id)}"><i class="ph ph-x"></i></button></div>`;
  }

  function renderSearchModal() {
    return modalFrame(`<div class="modal-inner"><div class="search-box"><i class="ph ph-magnifying-glass"></i><input id="search-query" class="search-input" type="search" autocomplete="off" placeholder="Search tasks and projects..." value="${esc(modalState.query || '')}" /><button class="btn-icon" type="button" data-action="close-modal"><i class="ph ph-x"></i></button></div><div id="search-results" class="search-results">${searchResultsHtml(modalState.query || '')}</div></div>`, 'search-modal');
  }

  function searchResultsHtml(query) {
    if (!String(query).trim()) return `<div class="empty-state" style="border:0;padding:38px 12px"><h3>Search tasks and projects</h3><p>Type a task title, note or project name.</p></div>`;
    const result = Core.searchItems(state.tasks, state.projects, query);
    if (!result.tasks.length && !result.projects.length) return `<div class="empty-state" style="border:0;padding:38px 12px"><h3>No results for “${esc(query)}”</h3></div>`;
    let html = '';
    if (result.tasks.length) {
      html += `<div class="search-section-title">Tasks</div>${result.tasks.map(({ task }) => searchTaskResult(task)).join('')}`;
    }
    if (result.projects.length) {
      html += `<div class="search-section-title">Projects</div>${result.projects.map(project => `<button class="search-result" type="button" data-route="project/${esc(project.id)}"><span class="search-result-icon"><span class="project-dot" style="--project-color:${esc(project.color)}"></span></span><span><span class="search-result-title">${esc(project.name)}</span><span class="search-result-meta">Project</span></span></button>`).join('')}`;
    }
    return html;
  }

  function searchTaskResult(task) {
    const project = getProject(task.projectId);
    const parts = [];
    if (project) parts.push(project.name);
    if (task.isCompleted && task.completedAt) parts.push(`Completed ${relativeDateLabel(String(task.completedAt).slice(0,10))}`);
    else if (task.plannedDate === Core.dateOnly()) parts.push('Today');
    if (task.dueDate) parts.push(`Due ${relativeDateLabel(task.dueDate)}`);
    return `<button class="search-result" type="button" data-action="open-task" data-task-id="${esc(task.id)}"><span class="search-result-icon">${task.isCompleted ? '<i class="ph-fill ph-check-circle" style="color:var(--success)"></i>' : '<i class="ph ph-circle"></i>'}</span><span><span class="search-result-title">${esc(task.title)}</span><span class="search-result-meta">${esc(parts.join(' · ') || 'Task')}</span></span></button>`;
  }

  function renderProjectModal() {
    const editing = Boolean(modalState.projectId);
    const d = modalState.draft;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${editing ? 'Edit project' : 'New project'}</h2><button class="btn-icon" type="button" data-action="close-modal"><i class="ph ph-x"></i></button></div><label class="field-label" for="project-name">Name</label><input id="project-name" class="input ${modalState.error ? 'is-error' : ''}" type="text" maxlength="100" value="${esc(d.name)}" placeholder="Project name" />${modalState.error ? `<div class="validation">${esc(modalState.error)}</div>` : ''}<div style="height:18px"></div><span class="field-label">Color</span><div class="color-grid">${PROJECT_COLORS.map(color => `<button class="color-swatch ${color === d.color ? 'is-selected' : ''}" type="button" data-action="select-project-color" data-color="${color}" style="--swatch:${color}" aria-label="Select project color"></button>`).join('')}</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-project">${editing ? 'Save changes' : 'Create project'}</button></div></div></div>`, 'quick');
  }

  function renderTagModal() {
    const editing = Boolean(modalState.tagId);
    const d = modalState.draft;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><div><h2 class="dialog-title">${editing ? 'Edit tag' : 'New tag'}</h2></div><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label" for="tag-name">Name</label><input id="tag-name" class="input ${modalState.error ? 'is-error' : ''}" type="text" maxlength="80" value="${esc(d.name)}" placeholder="Tag name" />${modalState.error ? `<div class="validation">${esc(modalState.error)}</div>` : ''}<div class="field-label">Color</div><div class="color-grid">${PROJECT_COLORS.map(c => `<button class="color-swatch ${c === d.color ? 'is-selected' : ''}" type="button" data-action="select-tag-color" data-color="${c}" style="--swatch:${c}" aria-label="Select color"></button>`).join('')}</div></div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-tag">${editing ? 'Save' : 'Create'}</button></div></div></div>`, 'small-modal');
  }

  function renderAreaModal() {
    const editing = Boolean(modalState.areaId);
    const d = modalState.draft;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${editing ? 'Edit area' : 'New area'}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><label class="field-label" for="area-name">Name</label><input id="area-name" class="input ${modalState.error ? 'is-error' : ''}" type="text" maxlength="100" value="${esc(d.name)}" placeholder="Area name" />${modalState.error ? `<div class="validation">${esc(modalState.error)}</div>` : ''}<div style="height:18px"></div><span class="field-label">Color</span><div class="color-grid">${PROJECT_COLORS.map(color => `<button class="color-swatch ${color === d.color ? 'is-selected' : ''}" type="button" data-action="select-area-color" data-color="${color}" style="--swatch:${color}" aria-label="Select area color"></button>`).join('')}</div><div style="height:18px"></div><span class="field-label">Icon</span><div class="area-icon-grid">${AREA_ICONS.map(icon => `<button class="area-icon-choice ${icon === d.icon ? 'is-selected' : ''}" type="button" data-action="select-area-icon" data-icon="${icon}" aria-label="Select area icon"><i class="ph ${icon}"></i></button>`).join('')}</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-area">${editing ? 'Save changes' : 'Create area'}</button></div></div></div>`, 'quick');
  }

  function renderAreaLinkedModal() {
    const label = modalState.kind === 'goal' ? 'Goal' : 'Habit';
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">New ${label}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><label class="field-label" for="area-linked-name">Name</label><input id="area-linked-name" class="input ${modalState.error ? 'is-error' : ''}" type="text" maxlength="100" value="${esc(modalState.draft.name)}" placeholder="${label} name" />${modalState.error ? `<div class="validation">${esc(modalState.error)}</div>` : ''}<div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-area-linked">Create ${label.toLowerCase()}</button></div></div></div>`, 'quick');
  }

  function renderKnowledgeModal() {
    const type = modalState.ownerType, d = modalState.draft;
    const relations = type === 'resource' ? [['relatedTaskIds', 'Tasks', 'tasks'], ['relatedProjectIds', 'Projects', 'projects'], ['relatedGoalIds', 'Goals', 'goals'], ['relatedHabitIds', 'Habits', 'habits']].map(([field, label, collection]) => `<details><summary class="field-label">Related ${label} · ${d[field].length}</summary><div class="form-stack">${state[collection].map(item => `<label><input type="checkbox" data-knowledge-relation="${field}" value="${esc(item.id)}" ${d[field].includes(item.id) ? 'checked' : ''}> ${esc(item.title || item.name)}</label>`).join('') || '<p class="area-empty-copy">No items.</p>'}</div></details>`).join('') : '';
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${modalState.ownerId ? 'Edit' : 'New'} ${type}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label">Title<input id="knowledge-title" class="input" maxlength="120" value="${esc(d.title)}"></label><label class="field-label">Area<select id="knowledge-area" class="input"><option value="">No area</option>${state.areas.filter(area => area.status === 'active' || area.id === d.areaId).map(area => `<option value="${esc(area.id)}" ${area.id === d.areaId ? 'selected' : ''}>${esc(area.name)}</option>`).join('')}</select></label><label class="field-label">${type === 'note' ? 'Body' : 'Description'}<textarea id="knowledge-text" class="input" rows="6">${esc(d.text)}</textarea></label><div class="field-label">Links</div>${d.linkUrls.map((url, index) => `<div class="attachment-row"><span class="attachment-main knowledge-link">${esc(url)}</span><button class="btn-icon" type="button" data-action="remove-knowledge-link" data-link-index="${index}" aria-label="Remove link"><i class="ph ph-x"></i></button></div>`).join('')}<label class="field-label" for="knowledge-link">Add link</label><input id="knowledge-link" class="input" type="text" value="${esc(d.linkDraft)}" placeholder="https://…"><button class="btn btn-secondary" type="button" data-action="add-knowledge-link">Add link</button>${relations}${renderAttachmentsSection({ ownerType: type, ownerId: modalState.ownerId })}${!modalState.ownerId && modalState.pendingFiles.length ? `<p class="area-empty-copy">${modalState.pendingFiles.map(file => esc(file.name)).join(' · ')} · files are added when you save.</p>` : ''}${modalState.error ? `<p class="validation" role="alert">${esc(modalState.error)}</p>` : ''}</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-knowledge" ${modalState.busy ? 'disabled' : ''}>${modalState.ownerId ? 'Save changes' : 'Create ' + type}</button></div></div></div>`, 'quick');
  }

  function renderGoalModal() {
    const d = modalState.draft; const editing = Boolean(modalState.goalId);
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${editing ? 'Edit goal' : 'New goal'}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label">Title<input id="goal-title" class="input" maxlength="120" value="${esc(d.title)}" placeholder="What do you want to achieve?" /></label><label class="field-label">Area<select id="goal-area" class="input"><option value="">No area</option>${state.areas.filter(area => area.status === 'active' || area.id === d.areaId).map(area => `<option value="${esc(area.id)}" ${area.id === d.areaId ? 'selected' : ''}>${esc(area.name)}</option>`).join('')}</select></label>${goalSourceFields(d)}<label class="field-label">Target date<input id="goal-target-date" class="input" type="date" value="${esc(d.targetDate)}" /></label><button class="btn btn-ghost" type="button" data-action="toggle-goal-more" aria-expanded="${Boolean(d.moreOpen)}" aria-controls="goal-more">More</button>${d.moreOpen ? `<div id="goal-more" class="form-stack"><div class="section-header"><h3 class="section-label">Milestones</h3><button class="btn btn-ghost" type="button" data-action="draft-goal-milestone">Add milestone</button></div>${d.milestones.map(m => `<div class="milestone-row goal-draft-milestone"><span><strong>${esc(m.title)}</strong><small>${esc(m.date || 'No date')}</small></span><button class="btn-icon" type="button" data-action="draft-goal-milestone" data-milestone-id="${esc(m.id)}" aria-label="Edit milestone"><i class="ph ph-pencil-simple"></i></button><button class="btn-icon" type="button" data-action="delete-draft-goal-milestone" data-milestone-id="${esc(m.id)}" aria-label="Delete milestone"><i class="ph ph-trash"></i></button></div>`).join('')}<button class="btn btn-secondary" type="button" data-action="draft-goal-reminders">Reminders</button><button class="btn btn-secondary" type="button" data-action="draft-goal-links">Linked Projects${d.progressMode === 'linkedTasks' ? ' / Tasks' : d.progressMode === 'linkedHabits' ? ' / Habits' : ''}</button><p class="area-empty-copy">${d.projectLinks.length} project links · ${d.taskIds.length} task links · ${d.habitLinks.length} habit links</p></div>` : ''}${modalState.error ? `<p class="validation" role="alert">${esc(modalState.error)}</p>` : ''}</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-goal">${editing ? 'Save changes' : 'Create goal'}</button></div></div></div>`, 'quick');
  }

  function goalSourceFields(d, includeValues = true) {
    return `<label class="field-label">Progress source<select id="goal-progress-mode" class="input">${[['manual','Manual'],['linkedTasks','Linked tasks'],['linkedHabits','Linked habits']].map(([v,l]) => `<option value="${v}" ${d.progressMode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><div class="goal-modal-manual ${d.progressMode === 'manual' ? '' : 'is-hidden'}"><label class="field-label">Type<select id="goal-progress-type" class="input"><option value="percentage" ${d.progressType === 'percentage' ? 'selected' : ''}>Percentage</option><option value="numeric" ${d.progressType === 'numeric' ? 'selected' : ''}>Numeric target</option></select></label>${includeValues ? `<div class="goal-form-grid"><label class="field-label">Current<input id="goal-current" class="input" type="number" step="any" value="${esc(d.currentValue)}" /></label><label class="field-label">Target<input id="goal-target" class="input" type="number" step="any" value="${esc(d.targetValue)}" /></label></div><label class="field-label">Unit<input id="goal-unit" class="input" maxlength="40" value="${esc(d.unit)}" /></label>` : ''}</div>`;
  }

  function renderGoalSourceModal() {
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">Goal progress source</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><div class="form-stack">${goalSourceFields(modalState.draft, false)}<p class="area-empty-copy">Only the selected source contributes. Existing links and manual values are retained.</p>${modalState.error ? `<p class="validation" role="alert">${esc(modalState.error)}</p>` : ''}</div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-goal-source">Save source</button></div></div>`, 'small-modal');
  }

  function renderHabitModal() {
    const d = modalState.draft; const editing = Boolean(modalState.habitId);
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const goalLinks = state.goals.map(goal => `<label><input type="checkbox" data-habit-goal="${esc(goal.id)}" ${d.goalIds.includes(goal.id) ? 'checked' : ''}> ${esc(goal.title)}</label>`).join('') || '<span class="area-empty-copy">No Goals yet.</span>';
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${editing ? 'Edit habit' : 'New habit'}</h2><button class="btn-icon" type="button" data-action="close-modal"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label">Name<input id="habit-name" class="input" maxlength="120" value="${esc(d.name)}" placeholder="What do you want to practice?" /></label><label class="field-label">Area<select id="habit-area" class="input"><option value="">No area</option>${state.areas.filter(area => area.status === 'active' || area.id === d.areaId).map(area => `<option value="${esc(area.id)}" ${area.id === d.areaId ? 'selected' : ''}>${esc(area.name)}</option>`).join('')}</select></label><div class="goal-form-grid"><label class="field-label">Tracking<select id="habit-tracking" class="input"><option value="checkbox" ${d.trackingType === 'checkbox' ? 'selected' : ''}>Checkbox</option><option value="numeric" ${d.trackingType === 'numeric' ? 'selected' : ''}>Numeric</option></select></label><label class="field-label">Frequency<select id="habit-frequency" class="input"><option value="daily" ${d.frequencyType === 'daily' ? 'selected' : ''}>Daily</option><option value="weekdays" ${d.frequencyType === 'weekdays' ? 'selected' : ''}>Selected weekdays</option><option value="timesPerWeek" ${d.frequencyType === 'timesPerWeek' ? 'selected' : ''}>X times per week</option><option value="everyNDays" ${d.frequencyType === 'everyNDays' ? 'selected' : ''}>Every N days</option></select></label></div><div class="habit-frequency-fields"><label class="field-label">Target<input id="habit-target-value" class="input" type="number" min="0" step="any" value="${esc(d.targetValue)}" /></label><label class="field-label">Unit<input id="habit-unit" class="input" value="${esc(d.unit)}" placeholder="L, pages..." /></label><label class="field-label">X per week<input id="habit-times-per-week" class="input" type="number" min="1" max="7" value="${esc(d.timesPerWeek)}" /></label><label class="field-label">Every N days<input id="habit-every-n-days" class="input" type="number" min="1" value="${esc(d.everyNDays)}" /></label><div class="field-label">Weekdays<div class="weekday-picker">${weekdays.map((label, day) => `<label><input type="checkbox" data-habit-weekday="${day}" ${d.weekdays.includes(day) ? 'checked' : ''}>${label}</label>`).join('')}</div></div></div><button class="btn btn-ghost" type="button" data-action="toggle-habit-more" aria-expanded="${Boolean(d.moreOpen)}" aria-controls="habit-more">More</button>${d.moreOpen ? `<div id="habit-more" class="form-stack"><label class="field-label">Start date<input id="habit-start-date" class="input" type="date" value="${esc(d.startDate)}" /></label><label class="field-label">Continuation<select id="habit-continuation" class="input"><option value="automatic" ${d.continuation === 'automatic' ? 'selected' : ''}>Repeat automatically</option><option value="askEachPeriod" ${d.continuation === 'askEachPeriod' ? 'selected' : ''}>Ask each period</option><option value="onePeriod" ${d.continuation === 'onePeriod' ? 'selected' : ''}>One period only</option></select></label><label class="field-label">End condition<select id="habit-end-type" class="input"><option value="never" ${d.endType === 'never' ? 'selected' : ''}>Never</option><option value="date" ${d.endType === 'date' ? 'selected' : ''}>On date</option><option value="successfulPeriods" ${d.endType === 'successfulPeriods' ? 'selected' : ''}>After successful periods</option></select></label><label class="field-label">End date<input id="habit-end-date" class="input" type="date" value="${esc(d.endDate)}" /></label><label class="field-label">Successful periods<input id="habit-successful-periods" class="input" type="number" min="1" value="${esc(d.successfulPeriodsTarget)}" /></label><label class="field-label">Quick values (comma separated)<input id="habit-quick-values" class="input" value="${esc(d.quickValues)}" placeholder="0.25, 0.5" /></label><label class="field-label">Reminder times (comma separated)<input id="habit-reminders" class="input" value="${esc(d.reminders.filter(item => item.enabled).map(item => item.time).join(','))}" placeholder="09:00, 18:00" /></label><div class="link-picker"><h3>Linked Goals</h3>${goalLinks}</div></div>` : ''}${modalState.error ? `<p class="validation">${esc(modalState.error)}</p>` : ''}</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-habit">${editing ? 'Save changes' : 'Create habit'}</button></div></div></div>`, 'quick');
  }

  function renderMilestoneModal() {
    const d = modalState.draft;
    const editing = Boolean(modalState.milestoneId);
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${editing ? 'Edit milestone' : 'New milestone'}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label">Title<input id="milestone-title" class="input" maxlength="120" value="${esc(d.title)}" /></label><label class="field-label">Date<input id="milestone-date" class="input" type="date" value="${esc(d.date)}" /></label>${modalState.error ? `<p class="validation" role="alert">${esc(modalState.error)}</p>` : ''}</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-milestone">${editing ? 'Save milestone' : 'Add milestone'}</button></div></div></div>`, 'small-modal');
  }

  function renderGoalLinksModal() {
    const d = modalState.draft;
    const projectIds = new Set(d.projectLinks.map(link => link.projectId));
    const taskIds = new Set(d.taskIds);
    const habitIds = new Set(d.habitLinks.map(link => link.habitId));
    const projects = state.projects.map(project => {
      const link = d.projectLinks.find(item => item.projectId === project.id) || d.projectDrafts?.[project.id];
      const mode = d.projectModes?.[project.id] || link?.contributionMode || 'allTasks';
      const selected = new Set(link?.selectedTaskIds || []);
      const projectTasks = state.tasks.filter(task => task.projectId === project.id);
      const picker = mode === 'selectedTasks' ? `<div class="project-task-picker" data-project-task-picker="${esc(project.id)}">${projectTasks.length ? projectTasks.map(task => `<label><input type="checkbox" data-goal-project-task="${esc(project.id)}:${esc(task.id)}" ${selected.has(task.id) ? 'checked' : ''}> ${esc(task.title)}</label>`).join('') : '<small>No tasks in this Project.</small>'}</div>` : '';
      return `<div class="goal-project-link"><label><input type="checkbox" data-goal-link-project="${esc(project.id)}" ${projectIds.has(project.id) ? 'checked' : ''}> ${esc(project.name)} <select data-goal-project-mode="${esc(project.id)}"><option value="allTasks" ${mode === 'allTasks' ? 'selected' : ''}>All tasks</option><option value="selectedTasks" ${mode === 'selectedTasks' ? 'selected' : ''}>Selected tasks</option></select></label>${picker}</div>`;
    }).join('') || '<p>No projects yet.</p>';
    const source = modalState.previous?.draft.progressMode;
    const tasks = !source || source === 'linkedTasks' ? `<h3>Tasks</h3>${state.tasks.map(task => `<label><input type="checkbox" data-goal-link-task="${esc(task.id)}" ${taskIds.has(task.id) ? 'checked' : ''}> ${esc(task.title)}</label>`).join('') || '<p>No tasks yet.</p>'}` : '';
    const habits = !source || source === 'linkedHabits' ? `<h3>Habits</h3>${state.habits.map(habit => { const link = d.habitLinks.find(item => item.habitId === habit.id) || d.habitDrafts?.[habit.id]; return `<label><input type="checkbox" data-goal-link-habit="${esc(habit.id)}" ${habitIds.has(habit.id) ? 'checked' : ''}> ${esc(habit.name || habit.title)} <select aria-label="${esc(habit.name)} metric" data-goal-habit-metric="${esc(habit.id)}"><option value="totalCheckins" ${(link?.metric || 'totalCheckins') === 'totalCheckins' ? 'selected' : ''}>Check-ins</option><option value="streak" ${link?.metric === 'streak' ? 'selected' : ''}>Streak</option><option value="successfulPeriods" ${link?.metric === 'successfulPeriods' ? 'selected' : ''}>Periods</option></select><input aria-label="${esc(habit.name)} target" type="number" min="0" step="any" value="${esc(link?.target ?? 1)}" data-goal-habit-target="${esc(habit.id)}"></label>`; }).join('') || '<p>Habits will be available after you create them.</p>'}` : '';
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">Goal links</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><div class="link-picker"><h3>Projects</h3>${projects}${tasks}${habits}</div>${modalState.error ? `<p class="validation" role="alert">${esc(modalState.error)}</p>` : ''}<div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-goal-links">Save links</button></div></div></div>`, 'quick');
  }

  function renderGoalRemindersModal() {
    const d = modalState.draft;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">Goal reminders</h2><button class="btn-icon" type="button" data-action="close-modal"><i class="ph ph-x"></i></button></div><div class="link-picker"><label><input id="goal-reminder-7" type="checkbox" ${d.sevenDaysBefore ? 'checked' : ''}> 7 days before</label><label><input id="goal-reminder-3" type="checkbox" ${d.threeDaysBefore ? 'checked' : ''}> 3 days before</label><label><input id="goal-reminder-1" type="checkbox" ${d.oneDayBefore ? 'checked' : ''}> 1 day before</label><label><input id="goal-reminder-date" type="checkbox" ${d.onTargetDate ? 'checked' : ''}> On target date</label><label class="field-label">Shared reminder time<input id="goal-reminder-time" class="input" type="time" value="${esc(d.time || '09:00')}" /></label></div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-goal-reminders">Save reminders</button></div></div></div>`, 'small-modal');
  }

  function renderGoalReachedModal() {
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">Goal reached</h2><button class="btn-icon" type="button" data-action="keep-goal-active"><i class="ph ph-x"></i></button></div><p class="dialog-copy">This goal has reached 100%. Keep tracking it or mark it as completed.</p><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="keep-goal-active">Keep active</button><button class="btn btn-primary" type="button" data-action="complete-goal" data-goal-id="${esc(modalState.goalId)}">Mark completed</button></div></div></div>`, 'small-modal');
  }

  function renderHabitFinishedModal() {
    const habit = getHabit(modalState.habitId);
    const boundary = modalState.boundary || 'end';
    const ask = boundary === 'ask'; const onePeriod = boundary === 'onePeriod';
    const title = ask ? 'Continue habit?' : onePeriod ? 'Habit period finished' : 'Habit finished';
    const copy = ask ? `${habit?.name || 'This habit'} completed its period. Continue, pause, or archive it.` : onePeriod ? `${habit?.name || 'This habit'} was set to one period. Convert it to a repeating habit or archive it.` : `${habit?.name || 'This habit'} reached its end condition. Archive it or continue tracking.`;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${esc(title)}</h2><button class="btn-icon" type="button" data-action="continue-habit"><i class="ph ph-x"></i></button></div><p class="dialog-copy">${esc(copy)}</p><div class="modal-footer"><span></span><div class="modal-footer-actions">${ask ? '<button class="btn btn-ghost" type="button" data-action="pause-habit" data-habit-id="' + esc(habit?.id || '') + '">Pause</button>' : ''}<button class="btn btn-ghost" type="button" data-action="continue-habit" data-habit-id="${esc(habit?.id || '')}" data-boundary="${esc(boundary)}">${onePeriod ? 'Convert to repeating' : 'Continue habit'}</button><button class="btn btn-primary" type="button" data-action="archive-habit" data-habit-id="${esc(habit?.id || '')}">Archive</button></div></div></div>`, 'small-modal');
  }

  function renderDuplicateModal() {
    const task = getTask(modalState.taskId); if (!task) return '';
    const count = (task.attachmentIds || []).length;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="dialog-title">Duplicate task</h2><button class="btn-icon" type="button" data-action="close-modal"><i class="ph ph-x"></i></button></div><p class="dialog-copy">This task has ${count} ${count === 1 ? 'attachment' : 'attachments'}. Copy attachments too?</p><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-secondary" type="button" data-action="duplicate-without-files" data-task-id="${esc(task.id)}">Without files</button><button class="btn btn-primary" type="button" data-action="duplicate-with-files" data-task-id="${esc(task.id)}">Copy files</button></div></div></div>`, 'small-modal');
  }

  function renderImportBackupModal() {
    const v = modalState.validated;
    const sum = v.summary;
    let date = sum.exportedAt;
    try { date = new Intl.DateTimeFormat(undefined, { dateStyle:'medium', timeStyle:'short' }).format(new Date(sum.exportedAt)); } catch (_) {}
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="dialog-title">Restore backup?</h2><button class="btn-icon" type="button" data-action="close-modal"><i class="ph ph-x"></i></button></div><p class="dialog-copy">Backup created ${esc(date)}</p><div class="backup-summary"><div><span>Tasks</span><strong>${sum.tasks}</strong></div><div><span>Projects</span><strong>${sum.projects}</strong></div><div><span>Tags</span><strong>${sum.tags}</strong></div><div><span>Attachments</span><strong>${sum.attachments} · ${esc(formatBytes(sum.totalSize))}</strong></div></div><div class="backup-warning"><i class="ph ph-warning"></i>This will replace all current app data. Restore has no Undo.</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-danger" type="button" data-action="restore-backup">Restore backup</button></div></div></div>`, 'small-modal');
  }

  function renderConfirmModal() {
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><div><h2 class="modal-title">${esc(modalState.title)}</h2>${modalState.message ? `<p class="page-subtitle" style="margin-top:10px;max-width:380px">${esc(modalState.message)}</p>` : ''}</div><button class="btn-icon" type="button" data-action="close-modal"><i class="ph ph-x"></i></button></div>${modalState.phrase ? `<label>Type ${esc(modalState.phrase)} to continue<input id="global-confirm-phrase" class="input" autocomplete="off" /></label>` : ''}<div class="modal-footer" style="border:0;padding-top:0"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-danger" type="button" data-action="confirm-action">${esc(modalState.confirmLabel || 'Delete')}</button></div></div></div>`, 'confirm-modal');
  }

  function nextProjectColor() {
    return PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length];
  }

  function openProjectPicker(anchor, target) {
    const currentId = target.type === 'quick' ? modalState?.draft.projectId : getTask(target.taskId)?.projectId;
    const projects = sortedProjects();
    const html = `<div class="popover-title">Project</div><button class="popover-option ${!currentId ? 'is-selected' : ''}" type="button" data-pop-action="set-project" data-project-id="" data-target-type="${target.type}" ${target.taskId ? `data-task-id="${esc(target.taskId)}"` : ''}><i class="ph ph-minus-circle"></i>No project${!currentId ? '<i class="ph ph-check spacer"></i>' : ''}</button>${projects.map(p => `<button class="popover-option ${p.id === currentId ? 'is-selected' : ''}" type="button" data-pop-action="set-project" data-project-id="${esc(p.id)}" data-target-type="${target.type}" ${target.taskId ? `data-task-id="${esc(target.taskId)}"` : ''}><span class="project-dot" style="--project-color:${esc(p.color)}"></span>${esc(p.name)}${p.id === currentId ? '<i class="ph ph-check spacer"></i>' : ''}</button>`).join('')}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="inline-new-project" data-target-type="${target.type}" ${target.taskId ? `data-task-id="${esc(target.taskId)}"` : ''}><i class="ph ph-plus"></i>New project</button>`;
    openPopover(anchor, html, { type: 'project', target });
  }

  function openPlanPicker(anchor, target) {
    const task = target.type === 'quick' ? modalState.draft : getTask(target.taskId);
    const today = Core.dateOnly();
    const html = `<div class="popover-title">Plan for</div>${dateOption('Today', today, task.plannedDate, 'set-plan', target)}${dateOption('Tomorrow', Core.addDays(today,1), task.plannedDate, 'set-plan', target)}<button class="popover-option" type="button" data-pop-action="show-custom-date" data-date-kind="plan" data-target-type="${target.type}" ${target.taskId ? `data-task-id="${esc(target.taskId)}"` : ''}><i class="ph ph-calendar-blank"></i>Pick a date...</button>${task.plannedDate ? `<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="set-plan" data-date="" data-target-type="${target.type}" ${target.taskId ? `data-task-id="${esc(target.taskId)}"` : ''}><i class="ph ph-x"></i>Remove plan</button>` : ''}`;
    openPopover(anchor, html, { type: 'plan', target });
  }

  function openDuePicker(anchor, target) {
    const task = target.type === 'quick' ? modalState.draft : getTask(target.taskId);
    const today = Core.dateOnly();
    const weekend = nextWeekend(today);
    const html = `<div class="popover-title">Due date</div>${dateOption('Today', today, task.dueDate, 'set-due', target)}${dateOption('Tomorrow', Core.addDays(today,1), task.dueDate, 'set-due', target)}${dateOption('This weekend', weekend, task.dueDate, 'set-due', target)}<button class="popover-option" type="button" data-pop-action="show-custom-date" data-date-kind="due" data-target-type="${target.type}" ${target.taskId ? `data-task-id="${esc(target.taskId)}"` : ''}><i class="ph ph-calendar-blank"></i>Pick a date...</button>${task.dueDate ? `<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="set-due" data-date="" data-target-type="${target.type}" ${target.taskId ? `data-task-id="${esc(target.taskId)}"` : ''}><i class="ph ph-x"></i>Clear due date</button>` : ''}`;
    openPopover(anchor, html, { type: 'due', target });
  }

  function openTagPicker(anchor, target) {
    const selected = target.type === 'quick' ? (modalState.draft.tagIds || []) : (getTask(target.taskId)?.tagIds || []);
    const options = (state.tags || []).map(tag => `<button class="popover-option ${selected.includes(tag.id) ? 'is-selected' : ''}" type="button" data-pop-action="toggle-tag" data-tag-id="${esc(tag.id)}" data-target-type="${target.type}" ${target.taskId ? `data-task-id="${esc(target.taskId)}"` : ''}><span class="tag-dot" style="--tag-color:${esc(tag.color)}"></span>${esc(tag.name)}${selected.includes(tag.id) ? '<i class="ph ph-check spacer"></i>' : ''}</button>`).join('');
    const html = `<div class="popover-title">Tags</div>${options || '<div class="popover-empty">No tags yet</div>'}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="inline-new-tag" data-target-type="${target.type}" ${target.taskId ? `data-task-id="${esc(target.taskId)}"` : ''}><i class="ph ph-plus"></i>New tag</button>`;
    openPopover(anchor, html, { type: 'tag-picker' });
  }

  function openPriorityPicker(anchor, target) {
    const current = target.type === 'quick' ? (modalState.draft.priority || 'none') : (getTask(target.taskId)?.priority || 'none');
    const html = `<div class="popover-title">Priority</div>${['none','low','medium','high'].map(value => `<button class="popover-option ${current === value ? 'is-selected' : ''}" type="button" data-pop-action="set-priority" data-priority="${value}" data-target-type="${target.type}" ${target.taskId ? `data-task-id="${esc(target.taskId)}"` : ''}>${value === 'none' ? '<i class="ph ph-minus"></i>' : priorityIcon(value)}${esc(priorityLabel(value))}${current === value ? '<i class="ph ph-check spacer"></i>' : ''}</button>`).join('')}`;
    openPopover(anchor, html, { type: 'priority-picker' });
  }

  function toggleTag(targetType, taskId, tagId) {
    if (!getTag(tagId)) return;
    if (targetType === 'quick') {
      const ids = new Set(modalState.draft.tagIds || []); ids.has(tagId) ? ids.delete(tagId) : ids.add(tagId); modalState.draft.tagIds = [...ids];
      closePopover(); renderModal(); return;
    }
    const task = getTask(taskId); if (!task) return;
    const ids = new Set(task.tagIds || []); ids.has(tagId) ? ids.delete(tagId) : ids.add(tagId); closePopover();requestTaskEdit(taskId,{tagIds:[...ids]});
  }

  function setPriority(targetType, taskId, value) {
    const priority = ['none','low','medium','high'].includes(value) ? value : 'none';
    if (targetType === 'quick') { modalState.draft.priority = priority; closePopover(); renderModal(); return; }
    const task = getTask(taskId); if (!task) return;closePopover();requestTaskEdit(taskId,{priority});
  }

  function inlineNewTag(button) {
    const targetType = button.dataset.targetType; const taskId = button.dataset.taskId || ''; const color = PROJECT_COLORS[(state.tags || []).length % PROJECT_COLORS.length];
    if (!popoverEl) return;
    popoverEl.innerHTML = `<div class="popover-title">New tag</div><div class="popover-inline-form"><input id="inline-tag-name" class="input" type="text" maxlength="80" placeholder="Tag name" /><div class="color-grid">${PROJECT_COLORS.map(c=>`<button class="color-swatch ${c===color?'is-selected':''}" type="button" data-pop-action="inline-select-tag-color" data-color="${c}" style="--swatch:${c}"></button>`).join('')}</div><div id="inline-tag-error" class="validation" hidden></div><div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-ghost" type="button" data-pop-action="inline-tag-cancel">Cancel</button><button class="btn btn-primary" type="button" data-pop-action="inline-tag-create" data-target-type="${targetType}" ${taskId ? `data-task-id="${esc(taskId)}"` : ''} data-color="${color}">Create</button></div></div>`;
    requestAnimationFrame(()=>$('#inline-tag-name',popoverEl)?.focus());
  }

  function openReminderPicker(anchor, target) {
    const task = target.type === 'quick' ? modalState.draft : getTask(target.taskId);
    if (!task) return;
    const later = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const targetAttrs = `data-target-type="${target.type}" ${target.taskId ? `data-task-id="${esc(target.taskId)}"` : ''}`;
    const html = `<div class="popover-title">Reminder</div><button class="popover-option" type="button" data-pop-action="set-reminder" data-reminder="${esc(later)}" ${targetAttrs}><i class="ph ph-clock"></i>Later today</button><button class="popover-option" type="button" data-pop-action="set-reminder" data-reminder="${esc(tomorrow.toISOString())}" ${targetAttrs}><i class="ph ph-sun-horizon"></i>Tomorrow morning</button><button class="popover-option" type="button" data-pop-action="show-custom-reminder" ${targetAttrs}><i class="ph ph-calendar-blank"></i>Custom date & time...</button>${task.reminderAt ? `<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="set-reminder" data-reminder="" ${targetAttrs}><i class="ph ph-x"></i>Clear reminder</button>` : ''}`;
    openPopover(anchor, html, { type: 'reminder', target });
  }

  function openRepeatPicker(anchor, target) {
    const task = target.type === 'quick' ? modalState.draft : getTask(target.taskId);
    if (!task) return;
    const current = task.recurrence;
    const attrs = `${target.taskId ? `data-task-id="${esc(target.taskId)}"` : ''} data-target-type="${target.type}"`;
    const option = (label, frequency) => `<button class="popover-option ${current?.frequency === frequency && Number(current?.interval || 1) === 1 ? 'is-selected' : ''}" type="button" data-pop-action="set-repeat" data-frequency="${frequency || ''}" data-interval="1" ${attrs}>${label}${current?.frequency === frequency && Number(current?.interval || 1) === 1 ? '<i class="ph ph-check spacer"></i>' : ''}</button>`;
    const operational=taskRecurrence(task);
    const management=operational && target.type!=='quick' ? `<div class="popover-separator"></div><p class="popover-empty">Controls apply to this and pending recurrence. Skip affects the next generated occurrence, not already-created tasks.</p><button class="popover-option" data-pop-action="${operational.status==='paused'?'resume-recurrence':'pause-recurrence'}" ${attrs}>${operational.status==='paused'?'Resume recurrence':'Pause recurrence'}</button><button class="popover-option" data-pop-action="skip-recurrence" ${attrs}>Skip next occurrence${operational.skipNext?' (scheduled)':''}</button><button class="popover-option" data-pop-action="end-recurrence" ${attrs}>End recurrence</button>`:'';
    const html = `<div class="popover-title">Repeat</div>${option('Does not repeat', '')}${option('Every day', 'daily')}${option('Every week', 'weekly')}${option('Every month', 'monthly')}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="show-custom-repeat" ${attrs}><i class="ph ph-sliders-horizontal"></i>${current?'Edit recurrence / End on date / End after N occurrences':'Custom interval...'}</button>${management}`;
    openPopover(anchor, html, { type: 'repeat', target });
  }

  function showCustomReminder(button) {
    if (!popoverEl) return;
    const targetType = button.dataset.targetType;
    const taskId = button.dataset.taskId || '';
    const source = targetType === 'quick' ? modalState.draft : getTask(taskId);
    const value = toLocalDateTimeValue(source?.reminderAt || new Date(Date.now() + 60 * 60 * 1000).toISOString());
    popoverEl.innerHTML = `<div class="popover-title">Reminder</div><div class="popover-inline-form"><input id="custom-reminder-input" class="date-native" type="datetime-local" value="${esc(value)}" /><div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-ghost" type="button" data-pop-action="custom-reminder-cancel">Cancel</button><button class="btn btn-primary" type="button" data-pop-action="custom-reminder-apply" data-target-type="${targetType}" ${taskId ? `data-task-id="${esc(taskId)}"` : ''}>Apply</button></div></div>`;
  }

  function showCustomRepeat(button) {
    if (!popoverEl) return;
    const targetType = button.dataset.targetType;
    const taskId = button.dataset.taskId || '';
    const source = targetType === 'quick' ? modalState.draft : getTask(taskId);
    const current = source?.recurrence || { frequency: 'weekly', interval: 2 };
    popoverEl.innerHTML = `<div class="popover-title">Custom repeat</div><div class="popover-inline-form"><label class="field-label" for="repeat-interval">Repeat every</label><div class="repeat-custom-row"><input id="repeat-interval" class="input" type="number" min="1" max="99" value="${Math.max(1, Number(current.interval) || 1)}" /><select id="repeat-frequency" class="input"><option value="daily" ${current.frequency === 'daily' ? 'selected' : ''}>days</option><option value="weekly" ${current.frequency === 'weekly' ? 'selected' : ''}>weeks</option><option value="monthly" ${current.frequency === 'monthly' ? 'selected' : ''}>months</option></select></div><div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-ghost" type="button" data-pop-action="custom-repeat-cancel">Cancel</button><button class="btn btn-primary" type="button" data-pop-action="custom-repeat-apply" data-target-type="${targetType}" ${taskId ? `data-task-id="${esc(taskId)}"` : ''}>Apply</button></div></div>`;
    $('.repeat-custom-row',popoverEl).insertAdjacentHTML('afterend',`<label class="field-label">End condition<select id="repeat-end-type" class="input"><option value="never" ${!current.endType || current.endType==='never'?'selected':''}>Never</option><option value="date" ${current.endType==='date'?'selected':''}>End on date</option><option value="afterOccurrences" ${current.endType==='afterOccurrences'?'selected':''}>End after N occurrences (including initial)</option></select></label><label class="field-label">End date<input id="repeat-end-date" class="input" type="date" value="${esc(current.endDate || '')}"></label><label class="field-label">Total occurrences<input id="repeat-end-count" class="input" type="number" min="1" step="1" value="${esc(current.endAfterOccurrences || '')}"></label><p class="validation" role="alert" id="repeat-error" hidden></p>`);
  }

  function setReminder(targetType, taskId, value) {
    const reminderAt = value || null;
    if (targetType === 'quick') {
      modalState.draft.reminderAt = reminderAt;
      modalState.draft.reminderFiredAt = null;
      closePopover(); renderModal(); return;
    }
    const task = getTask(taskId); if (!task) return;
    closePopover();requestTaskEdit(taskId,{reminderAt,reminderFiredAt:null});
  }

  function setRecurrence(targetType, taskId, recurrence) {
    const source=targetType==='quick'?modalState.draft:getTask(taskId);
    const value=Core.normalizeRecurrenceV3(recurrence?{...source?.recurrence,...recurrence}:null);
    if (targetType === 'quick') {
      modalState.draft.recurrence = value;
      closePopover(); renderModal(); return;
    }
    const task = getTask(taskId); if (!task) return;
    closePopover();requestTaskEdit(taskId,{recurrence:taskRecurrence(task)?recurrence:value?{...value,seriesId:value.seriesId || taskId}:null});
  }

  function dateOption(label, date, current, action, target) {
    return `<button class="popover-option ${date === current ? 'is-selected' : ''}" type="button" data-pop-action="${action}" data-date="${date}" data-target-type="${target.type}" ${target.taskId ? `data-task-id="${esc(target.taskId)}"` : ''}>${esc(label)}${date === current ? '<i class="ph ph-check spacer"></i>' : ''}</button>`;
  }

  function nextWeekend(today) {
    const date = parseLocalDate(today);
    const day = date.getDay();
    const daysToSat = (6 - day + 7) % 7 || 7;
    return Core.addDays(today, daysToSat);
  }

  function openTaskMenu(anchor, taskId) {
    const task = getTask(taskId); if (!task) return;
    const today = Core.dateOnly();
    const todayAction = task.plannedDate === today ? '' : `<button class="popover-option" type="button" data-pop-action="task-add-today" data-task-id="${esc(taskId)}"><i class="ph ph-sun"></i>Add to Today</button>`;
    const html = `${todayAction}<button class="popover-option" type="button" data-pop-action="task-move-tomorrow" data-task-id="${esc(taskId)}"><i class="ph ph-arrow-right"></i>Move to Tomorrow</button><button class="popover-option" type="button" data-pop-action="task-open-plan" data-task-id="${esc(taskId)}"><i class="ph ph-calendar-check"></i>Plan for...</button><button class="popover-option" type="button" data-pop-action="task-open-due" data-task-id="${esc(taskId)}"><i class="ph ph-flag"></i>Change due date</button><button class="popover-option" type="button" data-pop-action="task-open-project" data-task-id="${esc(taskId)}"><i class="ph ph-folder-simple"></i>Move to project</button><button class="popover-option" type="button" data-pop-action="task-duplicate" data-task-id="${esc(taskId)}"><i class="ph ph-copy"></i>Duplicate</button><div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="task-delete" data-task-id="${esc(taskId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>Delete</button>`;
    openPopover(anchor, templateMenuEntry('task',taskId)+html, { type: 'task-menu', taskId });
  }

  function openTagMenu(anchor, tagId) {
    const tag = getTag(tagId); if (!tag) return;
    const html = `<button class="popover-option" type="button" data-pop-action="edit-tag" data-tag-id="${esc(tagId)}"><i class="ph ph-pencil-simple"></i>Edit tag</button><button class="popover-option" type="button" data-pop-action="delete-tag" data-tag-id="${esc(tagId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>Delete tag</button>`;
    openPopover(anchor, html, { type: 'tag-menu', tagId });
  }

  function openProjectMenu(anchor, projectId) {
    const project = getProject(projectId);
    if (!project) return;
    const archiveAction = project.isArchived
      ? `<button class="popover-option" type="button" data-pop-action="restore-project" data-project-id="${esc(projectId)}"><i class="ph ph-arrow-counter-clockwise"></i>Restore project</button>`
      : `<button class="popover-option" type="button" data-pop-action="archive-project" data-project-id="${esc(projectId)}"><i class="ph ph-archive"></i>Archive project</button>`;
    const html = `<button class="popover-option" type="button" data-pop-action="edit-project" data-project-id="${esc(projectId)}"><i class="ph ph-pencil-simple"></i>Rename / color</button>${archiveAction}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="delete-project" data-project-id="${esc(projectId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>Delete project</button>`;
    openPopover(anchor, templateMenuEntry('project',projectId)+html, { type: 'project-menu', projectId });
  }

  function openAreaMenu(anchor, areaId) {
    const area = getArea(areaId); if (!area) return;
    const archiveAction = area.status === 'archived'
      ? `<button class="popover-option" type="button" data-pop-action="restore-area" data-area-id="${esc(areaId)}"><i class="ph ph-arrow-counter-clockwise"></i>Restore area</button>`
      : `<button class="popover-option" type="button" data-pop-action="archive-area" data-area-id="${esc(areaId)}"><i class="ph ph-archive"></i>Archive area</button>`;
    const pinAction = area.status === 'active'
      ? `<button class="popover-option" type="button" data-pop-action="${area.isPinned ? 'unpin-area' : 'pin-area'}" data-area-id="${esc(areaId)}"><i class="ph ${area.isPinned ? 'ph-push-pin-slash' : 'ph-push-pin'}"></i>${area.isPinned ? 'Unpin from sidebar' : 'Pin to sidebar'}</button>`
      : '';
    const html = `<button class="popover-option" type="button" data-pop-action="edit-area" data-area-id="${esc(areaId)}"><i class="ph ph-pencil-simple"></i>Edit area</button>${pinAction}${archiveAction}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="delete-area" data-area-id="${esc(areaId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>Delete area</button>`;
    openPopover(anchor, html, { type: 'area-menu', areaId });
  }

  function openGoalMenu(anchor, goalId) {
    const goal = getGoal(goalId); if (!goal) return;
    const lifecycle = goal.status === 'archived' ? '<button class="popover-option" type="button" data-pop-action="restore-goal" data-goal-id="' + esc(goalId) + '"><i class="ph ph-arrow-counter-clockwise"></i>Restore goal</button>' : `<button class="popover-option" type="button" data-pop-action="${goal.status === 'paused' ? 'resume-goal' : 'pause-goal'}" data-goal-id="${esc(goalId)}"><i class="ph ph-pause"></i>${goal.status === 'paused' ? 'Resume goal' : 'Pause goal'}</button>`;
    const html = `<button class="popover-option" type="button" data-pop-action="edit-goal" data-goal-id="${esc(goalId)}"><i class="ph ph-pencil-simple"></i>Edit goal</button>${lifecycle}${goal.status !== 'completed' && goal.status !== 'archived' ? `<button class="popover-option" type="button" data-pop-action="complete-goal" data-goal-id="${esc(goalId)}"><i class="ph ph-check-circle"></i>Mark completed</button>` : ''}${goal.status !== 'archived' ? `<button class="popover-option" type="button" data-pop-action="archive-goal" data-goal-id="${esc(goalId)}"><i class="ph ph-archive"></i>Archive goal</button>` : ''}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="delete-goal" data-goal-id="${esc(goalId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>Delete goal</button>`;
    openPopover(anchor, templateMenuEntry('goal',goalId)+html, { type: 'goal-menu', goalId });
  }

  function openHabitMenu(anchor, habitId) {
    const habit = getHabit(habitId); if (!habit) return;
    const lifecycle = habit.status === 'archived'
      ? `<button class="popover-option" type="button" data-pop-action="restore-habit" data-habit-id="${esc(habitId)}"><i class="ph ph-arrow-counter-clockwise"></i>Restore habit</button>`
      : `<button class="popover-option" type="button" data-pop-action="${habit.status === 'paused' ? 'resume-habit' : 'pause-habit'}" data-habit-id="${esc(habitId)}"><i class="ph ph-pause"></i>${habit.status === 'paused' ? 'Resume habit' : 'Pause habit'}</button>`;
    const archive = habit.status !== 'archived' ? `<button class="popover-option" type="button" data-pop-action="archive-habit" data-habit-id="${esc(habitId)}"><i class="ph ph-archive"></i>Archive habit</button>` : '';
    const html = `<button class="popover-option" type="button" data-pop-action="edit-habit" data-habit-id="${esc(habitId)}"><i class="ph ph-pencil-simple"></i>Edit habit</button>${lifecycle}${archive}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="snooze-habit" data-habit-id="${esc(habitId)}" data-snooze="15m"><i class="ph ph-clock"></i>Snooze 15 min</button><button class="popover-option" type="button" data-pop-action="snooze-habit" data-habit-id="${esc(habitId)}" data-snooze="1h"><i class="ph ph-clock"></i>Snooze 1 hour</button><button class="popover-option" type="button" data-pop-action="snooze-habit" data-habit-id="${esc(habitId)}" data-snooze="tonight"><i class="ph ph-moon"></i>Snooze tonight</button><div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="delete-habit" data-habit-id="${esc(habitId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>Delete habit</button>`;
    openPopover(anchor, templateMenuEntry('habit',habitId)+html, { type: 'habit-menu', habitId });
  }

  function openMoreMenu(anchor) {
    const route = currentRoute();
    const html = `<button class="popover-option ${route.type === 'anytime' ? 'is-selected' : ''}" type="button" data-route="anytime"><i class="ph ph-infinity"></i>Anytime</button><button class="popover-option ${route.type === 'archived' ? 'is-selected' : ''}" type="button" data-action="more-route" data-more-route="archived"><i class="ph ph-archive"></i>Archived Projects</button><div class="popover-separator"></div><button class="popover-option ${route.type === 'completed' ? 'is-selected' : ''}" type="button" data-action="more-route" data-more-route="completed"><i class="ph ph-check-circle"></i>Completed</button><button class="popover-option ${route.type === 'settings' ? 'is-selected' : ''}" type="button" data-action="more-route" data-more-route="settings"><i class="ph ph-gear"></i>Settings</button>`;
    openPopover(anchor, html, { type: 'more' });
  }

  function openPopover(anchor, html, meta = {}) {
    closePopover();
    const rect = anchor.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'popover';
    el.dataset.popoverType = meta.type || '';
    el.innerHTML = html;
    document.body.appendChild(el);
    const width = el.offsetWidth || 300;
    const height = el.offsetHeight || 260;
    let left = Math.min(rect.left, window.innerWidth - width - 12);
    left = Math.max(12, left);
    let top = rect.bottom + 6;
    if (top + height > window.innerHeight - 12) top = Math.max(12, rect.top - height - 6);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    popoverEl = el;
  }

  function closePopover() {
    const target = popoverEl?.goalReturnFocus;
    if (popoverEl) popoverEl.remove();
    popoverEl = null;
    restoreGoalFocus(target);
  }

  function showCustomDate(popButton) {
    const kind = popButton.dataset.dateKind;
    const targetType = popButton.dataset.targetType;
    const taskId = popButton.dataset.taskId || '';
    if (!popoverEl) return;
    popoverEl.innerHTML = `<div class="popover-title">${kind === 'plan' ? 'Plan for' : 'Due date'}</div><div class="popover-inline-form"><input id="custom-date-input" class="date-native" type="date" /><div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-ghost" type="button" data-pop-action="custom-date-cancel">Cancel</button><button class="btn btn-primary" type="button" data-pop-action="custom-date-apply" data-date-kind="${kind}" data-target-type="${targetType}" ${taskId ? `data-task-id="${esc(taskId)}"` : ''}>Apply</button></div></div>`;
    requestAnimationFrame(() => $('#custom-date-input', popoverEl)?.focus());
  }

  function inlineNewProject(button) {
    const targetType = button.dataset.targetType;
    const taskId = button.dataset.taskId || '';
    if (!popoverEl) return;
    const color = nextProjectColor();
    popoverEl.innerHTML = `<div class="popover-title">New project</div><div class="popover-inline-form"><input id="inline-project-name" class="input" type="text" maxlength="100" placeholder="Project name" /><div class="color-grid">${PROJECT_COLORS.map(c => `<button class="color-swatch ${c === color ? 'is-selected' : ''}" type="button" data-pop-action="inline-select-color" data-color="${c}" style="--swatch:${c}"></button>`).join('')}</div><div id="inline-project-error" class="validation" hidden>Project needs a name.</div><div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-ghost" type="button" data-pop-action="inline-project-cancel">Cancel</button><button class="btn btn-primary" type="button" data-pop-action="inline-project-create" data-target-type="${targetType}" ${taskId ? `data-task-id="${esc(taskId)}"` : ''} data-color="${color}">Create</button></div></div>`;
    requestAnimationFrame(() => $('#inline-project-name', popoverEl)?.focus());
  }

  function updateTask(taskId, changes, rerender = true) {
    const task=getTask(taskId);if(!task)return;
    if(!taskRecurrence(task)){Object.assign(task,changes,{updatedAt:nowIso()});saveState();if(rerender)render();return;}
    return requestTaskEdit(taskId,changes,()=>{if(rerender)render();});
  }

  function taskDraftChanges(task) {
    if(modalState?.type!=='task' || modalState.taskId!==task.id)return {};
    const title=String($('#detail-title')?.value ?? modalState.titleDraft ?? task.title).trim();
    const notes=$('#detail-notes')?.value ?? modalState.notesDraft ?? task.notes;
    return {...(title && title!==task.title?{title}:{}),...(notes!==task.notes?{notes}:{})};
  }
  function taskRecurrence(task) {return task?.recurrenceBaseline?.recurrence || task?.recurrence;}
  function renderRecurrenceScope() {
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">Edit recurring task</h2><button class="btn-icon" data-action="close-modal" aria-label="Cancel"><i class="ph ph-x"></i></button></div><p class="dialog-copy">Apply these changes to this occurrence only, or this and pending future occurrences? Past and completed siblings stay unchanged.</p><div class="modal-footer"><button class="btn btn-secondary" data-action="recurrence-scope" data-scope="occurrence">This occurrence</button><button class="btn btn-primary" data-action="recurrence-scope" data-scope="future">This and future</button></div></div>`,'small-modal');
  }
  function cancelRecurrenceScope() {
    const pending=modalState;if(pending?.type!=='recurrence-scope')return;
    modalState=pending.previous;
    if(modalState?.type==='task'){const task=getTask(pending.taskId);modalState.titleDraft=task.title;modalState.notesDraft=task.notes || '';}
    renderModal();requestAnimationFrame(()=>$(pending.focusSelector || '#detail-title')?.focus());
  }
  function applyRecurrenceScope(scope) {
    const pending=modalState;if(pending?.type!=='recurrence-scope')return;
    const task=getTask(pending.taskId);if(!task){cancelRecurrenceScope();return;}
    const changes=pending.changes;
    if(scope==='occurrence') {
      if(!task.recurrenceBaseline){task.recurrenceBaseline=copyTemplate(task);delete task.recurrenceBaseline.recurrenceBaseline;}
      const scoped=copyTemplate(changes);
      if(Object.hasOwn(scoped,'recurrence'))scoped.recurrence=Core.normalizeRecurrenceV3(scoped.recurrence?{...(task.recurrence || taskRecurrence(task)),...scoped.recurrence}:null);
      Object.assign(task,scoped,{updatedAt:nowIso()});
    } else {
      const original=copyTemplate(task),oldSeries=taskRecurrence(task)?.seriesId;
      const effective=task.plannedDate || task.dueDate || Core.dateOnly();
      const branch=Core.splitRecurrenceForFuture(task,changes,effective);
      const dayDelta=(before,after)=>Math.round((Date.parse(after+'T12:00:00Z')-Date.parse(before+'T12:00:00Z'))/86400000);
      for(const sibling of state.tasks) {
        const date=sibling.plannedDate || sibling.dueDate;
        if(sibling.id!==task.id && (!oldSeries || taskRecurrence(sibling)?.seriesId!==oldSeries || sibling.isCompleted || !date || date<effective || date<Core.dateOnly()))continue;
        const scoped=copyTemplate(changes);
        if(sibling.id!==task.id) {
          for(const key of ['plannedDate','dueDate'])if(Object.hasOwn(changes,key) && changes[key])scoped[key]=Core.addDays(sibling[key] || date,dayDelta(original[key] && sibling[key]?original[key]:effective,changes[key]));
          if(Object.hasOwn(changes,'reminderAt') && changes.reminderAt) {
            const after=new Date(changes.reminderAt),both=original.reminderAt && sibling.reminderAt;
            const before=both?Core.dateOnly(new Date(original.reminderAt)):effective,own=both?Core.dateOnly(new Date(sibling.reminderAt)):date;
            scoped.reminderAt=Core.combineDateTime(Core.addDays(own,dayDelta(before,Core.dateOnly(after))),`${String(after.getHours()).padStart(2,'0')}:${String(after.getMinutes()).padStart(2,'0')}`);
          }
        }
        const siblingBranch=sibling.id===task.id?branch:Core.splitRecurrenceForFuture(sibling,scoped,effective);
        const rule=branch.recurrence?{...branch.recurrence,occurrencesCreated:taskRecurrence(sibling)?.occurrencesCreated || 0}:null;
        if(siblingBranch.recurrenceBaseline)siblingBranch.recurrenceBaseline.recurrence=copyTemplate(rule);
        Object.assign(sibling,scoped,{recurrence:rule,recurrenceBaseline:siblingBranch.recurrenceBaseline,updatedAt:nowIso()});
      }
    }
    modalState=pending.previous;
    if(modalState?.type==='task'){modalState.titleDraft=task.title;modalState.notesDraft=task.notes || '';}
    saveState();render();renderModal();
    pending.after?.();
  }
  function requestTaskEdit(taskId,changes,after=null) {
    const task = getTask(taskId);
    if (!task || modalState?.type==='recurrence-scope') return false;
    changes={...taskDraftChanges(task),...changes};
    changes=Object.fromEntries(Object.entries(changes).filter(([key,value])=>JSON.stringify(key==='recurrence' && value?Core.normalizeRecurrenceV3({...task.recurrence,...value}):value)!==JSON.stringify(task[key])));
    if(!Object.keys(changes).length){after?.();return false;}
    if(taskRecurrence(task)) {
      const focusSelector=document.activeElement?.id?`#${document.activeElement.id}`:'#detail-title';
      closePopover();modalState={type:'recurrence-scope',taskId,changes:copyTemplate(changes),previous:modalState,after,focusSelector};renderModal();return true;
    }
    Object.assign(task,copyTemplate(changes),{updatedAt:nowIso()});
    if(modalState?.type==='task'){modalState.titleDraft=task.title;modalState.notesDraft=task.notes || '';}
    saveState();render();renderModal();after?.();return false;
  }
  function removeCloneGoalLinks(id) {
    for(const goal of state.goals)goal.taskIds=(goal.taskIds || []).filter(taskId=>taskId!==id);
  }
  function generateRecurringSuccessor(task,ts) {
    if(task.recurrenceSuccessorId)return null;
    const next=Core.buildNextRecurringTask(task,ts,uid('task'));if(!next)return null;
    next.projectId=getProject(next.projectId)?.id || null;
    next.areaId=next.projectId?null:getArea(next.areaId)?.id || null;
    next.goalIds=(next.goalIds || []).filter(id=>getGoal(id));
    next.tagIds=(next.tagIds || []).filter(id=>getTag(id));
    task.recurrenceSuccessorId=next.id;
    const runtime={occurrencesCreated:next.recurrence.occurrencesCreated,skipNext:false};
    if(task.recurrence)Object.assign(task.recurrence,runtime);
    if(task.recurrenceBaseline?.recurrence)Object.assign(task.recurrenceBaseline.recurrence,runtime);
    if(next.projectId)next.projectOrder=nextOrder(`project:${next.projectId}`);
    if(next.plannedDate===Core.dateOnly())next.todayOrder=nextOrder('today');
    state.tasks.push(next);syncTemplateEntityGoalLinks('task',next);return next.id;
  }
  function manageRecurrence(taskId,action) {
    const task=getTask(taskId),rule=taskRecurrence(task);if(!rule)return;
    const effective=task.plannedDate || task.dueDate || Core.dateOnly();
    const pending=state.tasks.filter(sibling=>!sibling.isCompleted && taskRecurrence(sibling)?.seriesId===rule.seriesId && (sibling.id===taskId || (sibling.plannedDate || sibling.dueDate)>=effective && (sibling.plannedDate || sibling.dueDate)>=Core.dateOnly())).sort((a,b)=>(a.plannedDate || a.dueDate || '').localeCompare(b.plannedDate || b.dueDate || '') || a.id.localeCompare(b.id));
    const update=action==='skip-recurrence'?{skipNext:true}:{status:action==='pause-recurrence'?'paused':action==='resume-recurrence'?'active':'ended'};
    for(const item of action==='skip-recurrence'?[pending.find(s=>!s.recurrenceSuccessorId) || task]:[task,...pending.filter(s=>s.id!==taskId)]){
      if(item.recurrence)Object.assign(item.recurrence,update);
      if(item.recurrenceBaseline?.recurrence)Object.assign(item.recurrenceBaseline.recurrence,update);
      item.updatedAt=nowIso();
    }
    if(action==='resume-recurrence' && task.isCompleted)generateRecurringSuccessor(task,nowIso());
    task.updatedAt=nowIso();closePopover();saveState();render();renderModal();
  }

  function setProject(targetType, taskId, projectId) {
    if (targetType === 'quick') {
      modalState.draft.projectId = projectId || null;
      if (projectId) modalState.draft.areaId = null;
      if (projectId) modalState.draft.isInbox = false;
      closePopover();
      renderModal();
      return;
    }
    const task = getTask(taskId);
    if (!task) return;
    closePopover();requestTaskEdit(taskId,{projectId:projectId || null,areaId:null,...(projectId?{isInbox:false}:{})});
  }

  function setPlan(targetType, taskId, date) {
    if (targetType === 'quick') {
      modalState.draft.plannedDate = date || null;
      modalState.draft.explicitPlan = true; modalState.draft.parsedPlanDate = null;
      closePopover(); renderModal(); return;
    }
    const task = getTask(taskId); if (!task) return;
    closePopover();requestTaskEdit(taskId,{plannedDate:date || null,...(date?{isInbox:false}:{})});
  }

  function setDue(targetType, taskId, date) {
    if (targetType === 'quick') {
      modalState.draft.dueDate = date || null;
      closePopover(); renderModal(); return;
    }
    const task = getTask(taskId); if (!task) return;
    closePopover();requestTaskEdit(taskId,{dueDate:date || null});
  }

  function createTask(keepOpen = false) {
    if (!modalState || modalState.type !== 'quick') return;
    syncQuickDraftFromDom();
    const d = modalState.draft;
    const parsed = !d.explicitPlan ? Core.parseQuickPlanPhrase(String(d.title || ''), Core.dateOnly()) : { title: String(d.title || ''), plannedDate: null };
    const title = String((!d.explicitPlan && parsed.plannedDate ? parsed.title : d.title) || '').trim();
    const resolvedPlan = d.explicitPlan ? d.plannedDate : (parsed.plannedDate || d.plannedDate);
    if (!title) {
      modalState.error = 'Task needs a title.';
      renderModal(); requestAnimationFrame(() => $('#quick-title')?.focus()); return;
    }
    const isInbox = modalState.defaults.processed ? false : !(d.projectId || resolvedPlan);
    const task = {
      id: uid('task'), title, notes: d.notes || '', projectId: d.projectId || null, areaId: d.projectId ? null : (d.areaId || null), goalIds: [...(d.goalIds || [])], plannedTime: d.plannedTime || null, dueTime: d.dueTime || null,
      plannedDate: resolvedPlan || null, dueDate: d.dueDate || null,
      reminderAt: d.reminderAt || null, reminderFiredAt: null, recurrence: d.recurrence || null, tagIds: [...(d.tagIds || [])], priority: d.priority || 'none', attachmentIds: [], isInbox,
      isCompleted: false, completedAt: null,
      subtasks: d.subtasks.map((s, i) => ({ ...s, order: i })),
      todayOrder: resolvedPlan === Core.dateOnly() ? nextOrder('today') : null,
      projectOrder: d.projectId ? nextOrder(`project:${d.projectId}`) : null,
      inboxOrder: isInbox ? nextOrder('inbox', true) : null,
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    if(task.recurrence)task.recurrence={...Core.normalizeRecurrenceV3(task.recurrence),seriesId:task.id};
    state.tasks.push(task);
    if(modalState.templateInstance)syncTemplateEntityGoalLinks('task',task);
    saveState();
    if (keepOpen) {
      const defaults = modalState.defaults;
      modalState = { type: 'quick', defaults, draft: { title: '', notes: '', projectId: defaults.projectId, areaId: defaults.areaId, plannedDate: defaults.plannedDate, parsedPlanDate: null, explicitPlan: Boolean(defaults.plannedDate), dueDate: null, reminderAt: null, reminderFiredAt: null, recurrence: null, tagIds: [], priority: 'none', subtasks: [], moreOpen: false }, error: '' };
      render(); renderModal(); requestAnimationFrame(() => $('#quick-title')?.focus());
    } else {
      closeModal(); render();
    }
  }

  function syncQuickDraftFromDom() {
    if (modalState?.type !== 'quick') return;
    const title = $('#quick-title'); if (title) modalState.draft.title = title.value;
    const notes = $('#quick-notes'); if (notes) modalState.draft.notes = notes.value;
  }

  function nextOrder(context, atTop = false) {
    let values = [];
    if (context === 'today') values = state.tasks.filter(t => !t.isCompleted && t.plannedDate === Core.dateOnly()).map(t => t.todayOrder).filter(Number.isFinite);
    else if (context === 'inbox') values = state.tasks.filter(Core.isInboxActive).map(t => t.inboxOrder).filter(Number.isFinite);
    else if (context.startsWith('project:')) {
      const id = context.split(':')[1];
      values = state.tasks.filter(t => !t.isCompleted && t.projectId === id).map(t => t.projectOrder).filter(Number.isFinite);
    }
    if (!values.length) return 0;
    return atTop ? Math.min(...values) - 1 : Math.max(...values) + 1;
  }

  function toggleComplete(taskId) {
    const task = getTask(taskId); if (!task) return;
    const goalProgressBefore = captureGoalProgress();
    const previous = { isCompleted: task.isCompleted, completedAt: task.completedAt,recurrence:copyTemplate(task.recurrence || null),recurrenceBaseline:copyTemplate(task.recurrenceBaseline || null),recurrenceSuccessorId:task.recurrenceSuccessorId || null };
    if (task.isCompleted) {
      task.isCompleted = false; task.completedAt = null;
      task.updatedAt = nowIso(); saveState(); render(); if (modalState?.type === 'task') renderModal();
      return;
    }
    const completedAt = nowIso();
    task.isCompleted = true; task.completedAt = completedAt; task.updatedAt = completedAt;
    const generatedId=taskRecurrence(task)?generateRecurringSuccessor(task,completedAt):null;
    saveState();
    setUndo('Task completed', () => {
      const current = getTask(taskId); if (!current) return;
      Object.assign(current,copyTemplate(previous),{updatedAt:nowIso()});
      if (generatedId) {state.tasks = state.tasks.filter(item => item.id !== generatedId);removeCloneGoalLinks(generatedId);}
      saveState(); render();
    });
    render(); if (['task', 'calendar-day'].includes(modalState?.type)) renderModal(); evaluateGoalProgressChanges(goalProgressBefore);
  }

  async function duplicateTask(taskId, copyFiles = false) {
    const source = getTask(taskId); if (!source) return;
    const copy = Core.cloneTaskForDuplicate(source, uid('task'), nowIso());
    if (copy.projectId) copy.projectOrder = nextOrder(`project:${copy.projectId}`);
    if (copy.plannedDate === Core.dateOnly()) copy.todayOrder = nextOrder('today');
    const createdIds = [];
    try {
      if (copyFiles) {
        const records = await Attachments.getMany(source.attachmentIds || []);
        for (const record of records) {
          const id = uid('att');
          await Attachments.put({ ...record, id, taskId: copy.id, createdAt: nowIso(), updatedAt: nowIso(), pendingDeleteUntil: null });
          createdIds.push(id);
        }
        copy.attachmentIds = createdIds;
      }
      state.tasks.push(copy);syncTemplateEntityGoalLinks('task',copy); saveState(); closeModal(); closePopover(); render();
      setUndo('Task duplicated', async () => { state.tasks = state.tasks.filter(t=>t.id!==copy.id);removeCloneGoalLinks(copy.id); if(createdIds.length) await Attachments.deleteMany(createdIds); saveState(); render(); });
    } catch (error) {
      if (createdIds.length) await Attachments.deleteMany(createdIds);
      setToastMessage('Task could not be duplicated');
    }
  }

  function startDuplicate(taskId) {
    const task=getTask(taskId); if(!task)return;
    closePopover();
    if ((task.attachmentIds || []).length) { modalState={type:'duplicate',taskId}; renderModal(); }
    else duplicateTask(taskId, false);
  }

  async function deleteTask(taskId) {
    requestDeleteEntity('task', taskId);
  }

  const DELETE_COLLECTIONS = { task: 'tasks', project: 'projects', tag: 'tags', area: 'areas',
    goal: 'goals', habit: 'habits', note: 'notes', resource: 'resources', template: 'templates', 'saved-view': 'savedViews' };

  function locateDeleteEntity(type, identity) {
    const id = typeof identity === 'object' && identity ? identity.id : identity;
    if (type === 'clear-completed') return { entity: state, array: state.tasks };
    if (type === 'attachment') {
      const owners = TodoStorage.attachmentOwners(state).filter(owner => (owner.item.attachmentIds || []).includes(id));
      return owners.length === 1 ? { entity: owners[0].item, parent: owners[0].item, ownerType: owners[0].type, collection: owners[0].type === 'task' ? 'tasks' : knowledgeCollection(owners[0].type), array: owners[0].item.attachmentIds, id } : null;
    }
    const collection = type === 'subtask' ? 'tasks' : type === 'milestone' ? 'goals' : DELETE_COLLECTIONS[type];
    const parent = identity?.parentId ? state[collection]?.find(item => item.id === identity.parentId) : null;
    const field = type === 'subtask' ? 'subtasks' : type === 'milestone' ? 'milestones' : null;
    const array = field ? parent?.[field] : state[collection];
    const entity = array?.find(item => item.id === id);
    return entity ? { entity, parent, array, collection, field, id } : null;
  }

  function requestDeleteEntity(type, identity) {
    if (!state || undoHold) return;
    flushTextSave();
    const source = state, located = locateDeleteEntity(type, identity);
    if (!located) { setToastMessage('Delete unavailable. Reopen the current item and try again.'); return; }
    if (type === 'clear-completed' && !state.tasks.some(task => task.isCompleted)) { setToastMessage('No completed tasks to clear'); return; }
    const label = type === 'saved-view' ? 'Saved view' : type === 'clear-completed' ? 'Completed tasks' : templateLabel(type);
    const messages = {
      task: 'This task, its subtasks and attachment references will be removed.',
      subtask: 'This subtask will be removed from its task.',
      project: `This project contains ${state.tasks.filter(task => task.projectId === identity).length} tasks. All tasks in this project, their subtasks and attachments will also be deleted.`,
      tag: 'Tasks will remain. Their assignments to this tag will be removed.',
      area: 'Linked objects will remain. Their Area assignments will be removed.',
      goal: 'Projects, tasks and habits will remain. Their Goal links, milestones and Goal history will be removed.',
      habit: 'Its check-ins, history and reminders will be removed. Goals will remain.',
      note: 'This Note and its attachment references will be removed. Undo restores them.',
      resource: 'This Resource, its relations and attachment references will be removed. Undo restores them.',
      milestone: 'This milestone will be removed from its Goal.',
      attachment: 'This attachment will be removed from its owner.',
      template: 'Items created from this template will remain.',
      'saved-view': 'Matching items will remain.',
      'clear-completed': `${state.tasks.filter(task => task.isCompleted).length} completed tasks and their attachments will be removed. Undo restores them.`
    };
    let dialog;
    openConfirm({ title: type === 'clear-completed' ? 'Delete all completed tasks?' : `Delete “${type === 'attachment' ? 'attachment' : located.entity.name || located.entity.title}”?`,
      message: messages[type], confirmLabel: type === 'clear-completed' ? 'Delete completed' : `Delete ${label.toLowerCase()}`,
      onConfirm: () => {
        if (dialog.busy) return;
        dialog.busy = true;
        const operation = (async () => {
          try {
            const current = locateDeleteEntity(type, identity);
            if (undoHold || source !== state || modalState !== dialog || !current || current.entity !== located.entity || current.parent !== located.parent)
              throw new Error('The item or its owner changed. Reopen the current item.');
            const snapshot = await buildDeleteSnapshot(type, identity);
            if (modalState !== dialog) throw new Error('Delete cancelled.');
            await applyDeleteSnapshot(snapshot);
            closeModal(); render();
            const fallback = { project: 'today', area: 'areas', goal: 'goals', habit: 'habits', note: 'notes', resource: 'resources', 'saved-view': 'saved-views' }[type];
            if (fallback && currentRoute().id === (typeof identity === 'object' ? identity.id : identity)) navigate(fallback);
            setUndo(`${label} deleted`, () => restoreDeleteSnapshot(snapshot), () => finalizeDeleteSnapshot(snapshot), snapshot);
          } catch (error) {
            if (modalState === dialog) closeModal();
            render(); setToastMessage(`Delete failed. ${error.message}`);
          }
        })();
        deleteOperations.add(operation);
        operation.finally(() => deleteOperations.delete(operation));
      } });
    dialog = modalState;
  }

  function deleteEntryArray(entry) {
    return entry.field ? state[entry.collection].find(item => item === entry.parent)?.[entry.field] : state[entry.collection];
  }

  async function buildDeleteSnapshot(type, identity) {
    const located = locateDeleteEntity(type, identity);
    if (!located) throw new Error('The item no longer exists.');
    const snapshot = { type, identity, source: state, generation: undoGeneration, token: uid('delete'),
      deadline: Date.now() + 6500, eligibilityDeadline: performance.now() + 6500, entries: [], effects: [], attachments: [], pendingAttachments: [], habitLogs: [], goalHistory: [], applied: false, restored: false, finalized: false };
    const capture = (collection, entity, parent = null, field = null) => {
      const array = field ? parent[field] : state[collection];
      snapshot.entries.push({ collection, parent, field, source: entity, entity: copyTemplate(entity), index: array.indexOf(entity),
        projectParent: collection === 'tasks' && !field && entity.projectId ? getProject(entity.projectId) : null });
    };
    if (type === 'subtask' || type === 'milestone') capture(located.collection, located.entity, located.parent, located.field);
    else if (type === 'clear-completed') state.tasks.filter(task => task.isCompleted).forEach(task => capture('tasks', task));
    else if (type !== 'attachment') {
      capture(located.collection, located.entity);
      if (type === 'project') state.tasks.filter(task => task.projectId === identity).forEach(task => capture('tasks', task));
    }
    const removedTasks = new Set(snapshot.entries.filter(entry => entry.collection === 'tasks' && !entry.field).map(entry => entry.entity.id));
    const arrayEffect = (collection, owner, field, predicate, link = null) => {
      const target = link || owner, before = target[field] || [], removed = before.filter(predicate);
      if (removed.length) snapshot.effects.push({ collection, owner, field, link, before: copyTemplate(before), removed: copyTemplate(removed) });
    };
    for (const goal of state.goals) {
      if (removedTasks.size) {
        arrayEffect('goals', goal, 'taskIds', id => removedTasks.has(id));
        for (const link of goal.projectLinks || []) if (!(type === 'project' && link.projectId === identity))
          arrayEffect('goals', goal, 'selectedTaskIds', id => removedTasks.has(id), link);
      }
      if (type === 'project') arrayEffect('goals', goal, 'projectLinks', link => link.projectId === identity);
      if (type === 'habit') arrayEffect('goals', goal, 'habitLinks', link => link.habitId === identity);
    }
    if (type === 'tag') for (const task of state.tasks) arrayEffect('tasks', task, 'tagIds', id => id === identity);
    if (type === 'goal') for (const collection of ['tasks', 'projects', 'habits'])
      for (const owner of state[collection]) arrayEffect(collection, owner, 'goalIds', id => id === identity);
    if (type === 'area') for (const collection of ['tasks', 'projects', 'goals', 'habits', 'notes', 'resources'])
      for (const owner of state[collection]) if (owner.areaId === identity)
        snapshot.effects.push({ collection, owner, field: 'areaId', scalar: true, before: owner.areaId, after: null });
    if (type === 'attachment') {
      snapshot.attachmentOwner = located.parent;
      snapshot.attachmentOwnerType = located.ownerType;
      snapshot.attachmentOwnerCollection = located.collection;
      arrayEffect(located.collection, located.parent, 'attachmentIds', id => id === identity);
    }
    const attachmentIds = type === 'attachment' ? [identity] : snapshot.entries.filter(entry => ['tasks', 'notes', 'resources'].includes(entry.collection) && !entry.field).flatMap(entry => entry.entity.attachmentIds || []);
    snapshot.attachments = await Attachments.getMany(attachmentIds);
    for (const id of attachmentIds) {
      const record = snapshot.attachments.find(record => record.id === id), owners = TodoStorage.attachmentOwners(state).filter(owner => (owner.item.attachmentIds || []).includes(id));
      if (!record || owners.length !== 1 || !TodoStorage.attachmentBelongsTo(record, owners[0]) || record.pendingDeleteUntil) throw new Error('Attachment owner or stored file changed.');
    }
    if (type === 'habit') snapshot.habitLogs = await TodoStorage.habitLogs.listByHabit(identity);
    if (type === 'goal') snapshot.goalHistory = await TodoStorage.goalHistory.listByGoal(identity);
    snapshot.selectedTagId = state.ui.selectedTagId;
    validateDeleteSnapshot(snapshot);
    return snapshot;
  }

  function validateDeleteSnapshot(snapshot, compareBefore = true) {
    if (undoHold || snapshot.source !== state || snapshot.generation !== undoGeneration) throw new Error('The data source changed. Reopen the item.');
    if (compareBefore && ['project','clear-completed'].includes(snapshot.type)) {
      const current = state.tasks.filter(task => snapshot.type === 'project' ? task.projectId === snapshot.identity : task.isCompleted);
      const captured = snapshot.entries.filter(entry => entry.collection === 'tasks' && !entry.field);
      if (current.length !== captured.length || current.some(task => !captured.some(entry => entry.source === task))) throw new Error('The task deletion scope changed. Reopen confirmation.');
    }
    for (const entry of snapshot.entries) if (!deleteEntryArray(entry)?.includes(entry.source)
      || (compareBefore && JSON.stringify(entry.source) !== JSON.stringify(entry.entity))) throw new Error('The item or parent changed.');
    for (const effect of snapshot.effects) if (!state[effect.collection].includes(effect.owner)
      || (effect.link && !(effect.owner.projectLinks || []).includes(effect.link))) throw new Error('A linked owner changed.');
    if (compareBefore) for (const effect of snapshot.effects)
      if (JSON.stringify((effect.link || effect.owner)[effect.field] || (effect.scalar ? null : [])) !== JSON.stringify(effect.before)) throw new Error('A linked assignment changed.');
    if (snapshot.attachmentOwner && !state[snapshot.attachmentOwnerCollection].includes(snapshot.attachmentOwner)) throw new Error('Attachment owner changed.');
  }

  function inverseArray(current, before, removed) {
    const key = value => typeof value === 'object' ? value.id || value.projectId || value.habitId : value;
    const result = [...current];
    for (const value of removed) {
      if (result.some(item => key(item) === key(value))) continue;
      const index = before.findIndex(item => key(item) === key(value));
      const next = before.slice(index + 1).find(item => result.some(actual => key(actual) === key(item)));
      const previous = [...before.slice(0, index)].reverse().find(item => result.some(actual => key(actual) === key(item)));
      const position = next ? result.findIndex(item => key(item) === key(next)) : previous ? result.findIndex(item => key(item) === key(previous)) + 1 : Math.min(index, result.length);
      result.splice(position, 0, typeof value === 'object' ? copyTemplate(value) : value);
    }
    return result;
  }

  function mutateDeleteMetadata(snapshot, restore) {
    const rollback = [];
    for (const entry of snapshot.entries) {
      const array = deleteEntryArray(entry);
      if (!array) throw new Error('The parent changed.');
      rollback.push(() => array.splice(0, array.length, ...entry.previous));
      entry.previous = [...array];
      if (restore) array.splice(Math.min(entry.index, array.length), 0, copyTemplate(entry.entity));
      else array.splice(array.indexOf(entry.source), 1);
    }
    for (const effect of snapshot.effects) {
      if (!state[effect.collection].includes(effect.owner) || (effect.link && !effect.owner.projectLinks?.includes(effect.link))) continue;
      const target = effect.link || effect.owner, current = target[effect.field];
      rollback.push(() => { target[effect.field] = current; });
      if (effect.scalar) { if (!restore || current === effect.after) target[effect.field] = restore ? effect.before : effect.after; }
      else target[effect.field] = restore ? inverseArray(current || [], effect.before, effect.removed)
        : (current || []).filter(value => !effect.removed.some(removed => JSON.stringify(removed) === JSON.stringify(value)));
    }
    const selection = state.ui.selectedTagId;
    rollback.push(() => { state.ui.selectedTagId = selection; });
    if (snapshot.type === 'tag') {
      if (!restore && selection === snapshot.identity) { snapshot.afterSelectedTagId = state.tags[0]?.id || ''; state.ui.selectedTagId = snapshot.afterSelectedTagId; }
      if (restore && selection === snapshot.afterSelectedTagId) state.ui.selectedTagId = snapshot.selectedTagId;
    }
    return () => rollback.reverse().forEach(fn => fn());
  }

  async function applyDeleteSnapshot(snapshot) {
    validateDeleteSnapshot(snapshot);
    let rollback;
    try {
      if (snapshot.attachments.length) await Attachments.markPending(snapshot.attachments.map(record => record.id), new Date(snapshot.deadline).toISOString(), snapshot.token, snapshot.attachments);
      if (snapshot.habitLogs.length) await TodoStorage.habitLogs.deleteMany(snapshot.habitLogs.map(record => record.id));
      if (snapshot.goalHistory.length) await TodoStorage.goalHistory.deleteMany(snapshot.goalHistory.map(record => record.id));
      snapshot.pendingAttachments = await Attachments.getMany(snapshot.attachments.map(record => record.id));
      if (snapshot.pendingAttachments.length !== snapshot.attachments.length) throw new Error('Prepared files are missing.');
      for (const original of snapshot.attachments) {
        const actual = snapshot.pendingAttachments.find(record => record.id === original.id);
        const normalized = { ...actual, pendingDeleteUntil: original.pendingDeleteUntil, updatedAt: original.updatedAt };
        if (Object.hasOwn(original, 'pendingDeleteToken')) normalized.pendingDeleteToken = original.pendingDeleteToken; else delete normalized.pendingDeleteToken;
        if (actual.pendingDeleteToken !== snapshot.token || actual.pendingDeleteUntil !== new Date(snapshot.deadline).toISOString()
          || !(await sameStoredAttachment(normalized, original))) throw new Error('Prepared file ownership or bytes changed.');
      }
      validateDeleteSnapshot(snapshot);
      rollback = mutateDeleteMetadata(snapshot, false);
      if (!saveState()) throw new Error('Local metadata could not be saved.');
      snapshot.applied = true;
      if (snapshot.type === 'habit') {
        delete state.habitLogCache?.[snapshot.identity]; delete state.habitMetrics?.[snapshot.identity];
      }
    } catch (error) {
      rollback?.();
      try {
        const owned = { ...snapshot, attachments: [] }, expected = [];
        for (const original of snapshot.attachments) {
          const actual = await Attachments.get(original.id);
          if (await sameStoredAttachment(actual, original)) continue;
          if (actual?.pendingDeleteToken !== snapshot.token || actual.pendingDeleteUntil !== new Date(snapshot.deadline).toISOString()) continue;
          const normalized = { ...actual, pendingDeleteUntil: original.pendingDeleteUntil, updatedAt: original.updatedAt };
          if (Object.hasOwn(original, 'pendingDeleteToken')) normalized.pendingDeleteToken = original.pendingDeleteToken; else delete normalized.pendingDeleteToken;
          if (!(await sameStoredAttachment(normalized, original))) continue;
          owned.attachments.push(original); expected.push(actual);
        }
        await TodoStorage.restoreDeleteRecords(owned, expected);
      }
      catch (rollbackError) {
        snapshot.recoveryError = `${error.message} Recovery failed: ${rollbackError.message}`;
        failedDeleteSnapshots.add(snapshot);
        throw new Error(`${snapshot.recoveryError}. Full snapshot retained; retry recovery when storage is available.`);
      }
      throw error;
    }
  }

  async function retryFailedDeleteRecovery() {
    if (undoHold) return;
    const snapshot = [...failedDeleteSnapshots][0];
    if (!snapshot || snapshot.recoveryBusy) return;
    snapshot.recoveryBusy = true;
    const operation = (async () => {
      try {
        if (snapshot.recoveryKind === 'undo') {
          await restoreDeleteSnapshot(snapshot);
          failedDeleteSnapshots.delete(snapshot);
          renderToast(); setToastMessage('Undo recovery verified. Original item, files and history restored.');
          return;
        }
        validateDeleteSnapshot(snapshot, false);
        const expected = [];
        for (const original of snapshot.attachments) {
          const actual = await Attachments.get(original.id);
          const owners = TodoStorage.attachmentOwners(state).filter(owner => owner.item.attachmentIds.includes(original.id));
          const owner = owners.length === 1 && TodoStorage.attachmentBelongsTo(original, owners[0]) ? owners[0].item : null;
          const normalized = actual && { ...actual, pendingDeleteUntil: original.pendingDeleteUntil, updatedAt: original.updatedAt };
          if (normalized) { if (Object.hasOwn(original, 'pendingDeleteToken')) normalized.pendingDeleteToken = original.pendingDeleteToken; else delete normalized.pendingDeleteToken; }
          if (!owner || !(owner.attachmentIds || []).includes(original.id) || !actual
            || (actual.pendingDeleteUntil && (actual.pendingDeleteToken !== snapshot.token || actual.pendingDeleteUntil !== new Date(snapshot.deadline).toISOString()))
            || !(await sameStoredAttachment(normalized, original))) throw new Error('Retained file ownership changed; recovery was not applied.');
          expected.push(actual);
        }
        for (const name of ['habitLogs','goalHistory']) for (const original of snapshot[name]) {
          const actual = await TodoStorage[name].get(original.id);
          if (actual && JSON.stringify(actual) !== JSON.stringify(original)) throw new Error('Retained history ownership changed; recovery was not applied.');
        }
        validateDeleteSnapshot(snapshot, false);
        await TodoStorage.restoreDeleteRecords(snapshot, expected);
        for (const original of snapshot.attachments) if (!(await sameStoredAttachment(await Attachments.get(original.id), original))) throw new Error('Restored file verification failed; snapshot retained.');
        for (const name of ['habitLogs','goalHistory']) for (const original of snapshot[name])
          if (JSON.stringify(await TodoStorage[name].get(original.id)) !== JSON.stringify(original)) throw new Error('Restored history verification failed; snapshot retained.');
        failedDeleteSnapshots.delete(snapshot);
        if (snapshot.type === 'habit') await refreshHabitMetrics();
        renderToast(); render(); setToastMessage('Delete recovery verified. Original files and history restored.');
      } catch (error) { setToastMessage(`Recovery failed. ${error.message}`); }
      finally { snapshot.recoveryBusy = false; }
    })();
    deleteOperations.add(operation);
    operation.finally(() => deleteOperations.delete(operation));
    await operation;
  }

  async function sameStoredAttachment(actual, expected) {
    return Attachments.sameRecord(actual, expected);
  }

  function validateRestoreMetadata(snapshot) {
    if (snapshot.source !== state || snapshot.generation !== undoGeneration) throw new Error('The data source changed.');
    for (const entry of snapshot.entries) {
      const array = deleteEntryArray(entry);
      if (!array || array.some(item => item.id === entry.entity.id)) throw new Error('The item ID or parent is now in use.');
      if (entry.collection === 'tasks' && !entry.field && entry.entity.projectId
        && !snapshot.entries.some(parent => parent.collection === 'projects' && parent.entity.id === entry.entity.projectId)
        && !state.projects.includes(entry.projectParent)) throw new Error('The Task Project parent changed.');
    }
    if (snapshot.attachmentOwner && !state[snapshot.attachmentOwnerCollection].includes(snapshot.attachmentOwner)) throw new Error('Attachment owner changed.');
    if (snapshot.attachmentOwner && snapshot.attachmentOwner.attachmentIds?.includes(snapshot.identity)) throw new Error('The attachment ID is now in use.');
    for (const effect of snapshot.effects) if (!state[effect.collection].includes(effect.owner)
      || (effect.link && !effect.owner.projectLinks?.includes(effect.link))) throw new Error('A linked owner changed.');
  }

  async function restoreDeleteSnapshot(snapshot) {
    if (snapshot.restored) return;
    const validate = () => validateRestoreMetadata(snapshot);
    validate();
    const expected = [], history = {};
    for (const pending of snapshot.pendingAttachments) {
      const actual = await Attachments.get(pending.id); validate();
      let matches = await sameStoredAttachment(actual, pending); validate();
      if (!matches && snapshot.recoveryKind === 'undo') {
        matches = await sameStoredAttachment(actual, snapshot.attachments.find(record => record.id === pending.id)); validate();
      }
      if (!matches) throw new Error('Retained file ownership changed; owner or bytes no longer match.');
      expected.push(actual);
    }
    for (const name of ['habitLogs','goalHistory']) {
      history[name] = [];
      for (const original of snapshot[name]) {
        const actual = await TodoStorage[name].get(original.id); validate();
        if (actual && (snapshot.recoveryKind !== 'undo' || JSON.stringify(actual) !== JSON.stringify(original))) throw new Error('Retained history ownership changed.');
        history[name].push([original.id, actual || null]);
      }
    }
    validate();
    try {
      await TodoStorage.restoreDeleteRecords(snapshot, expected, validate, history);
      snapshot.undoNativePhase = 'originals-restored';
      validate();
      const rollback = mutateDeleteMetadata(snapshot, true);
      if (!saveState()) { rollback(); throw new Error('Local metadata could not be saved.'); }
    } catch (error) {
      if (snapshot.undoNativePhase === 'originals-restored') {
        try { await reapplyDeleteRecords(snapshot); }
        catch (compensationError) {
          snapshot.recoveryKind = 'undo';
          snapshot.recoveryError = `Undo failed: ${error.message} Compensation failed: ${compensationError.message}`;
          failedDeleteSnapshots.add(snapshot);
          throw new Error(snapshot.recoveryError);
        }
      }
      throw error;
    }
    snapshot.restored = true;
    if (snapshot.type === 'habit') await refreshHabitMetrics();
    render();
    if (modalState?.type === 'task') await loadTaskAttachments(modalState.taskId);
    else if (modalState?.type === 'knowledge' && modalState.ownerId) await loadOwnerAttachments({ ownerType: modalState.ownerType, ownerId: modalState.ownerId });
  }

  async function reapplyDeleteRecords(snapshot) {
    // Compensation is a single owned transaction, including growing-store deletes.
    // Expected originals are the exact records written by the completed native Undo.
    await TodoStorage.restoreDeleteRecords({ attachments: snapshot.pendingAttachments,
      deleteRecords: { habitLogs: snapshot.habitLogs, goalHistory: snapshot.goalHistory } }, snapshot.attachments,
      () => validateRestoreMetadata(snapshot));
    snapshot.undoNativePhase = 'pending';
  }

  async function finalizeDeleteSnapshot(snapshot) {
    if (snapshot.restored || snapshot.finalized || undoHold || snapshot.source !== state || snapshot.generation !== undoGeneration) return true;
    if (performance.now() < snapshot.eligibilityDeadline || (snapshot.attachments.length && Date.now() < snapshot.deadline)) return false;
    for (const expected of snapshot.pendingAttachments)
      if (!(await sameStoredAttachment(await Attachments.get(expected.id), expected))) continue;
      else await Attachments.deletePending([expected], nowIso());
    snapshot.finalized = true;
    return true;
  }

  function undoDomain() {
    return JSON.stringify(Object.fromEntries(['tasks','projects','tags','areas','goals','habits','templates','savedViews'].map(name => [name, state?.[name]])));
  }

  const deleteLifecycle = {
    // Hold takes effect synchronously; callers MUST await its token before capture/export.
    async hold() {
      if (undoHold) throw new Error('Normal Undo is already held.');
      if (failedDeleteSnapshots.size || [...undoWork].some(work => work.snapshot && work.failedUndoError)) throw new Error('Retry Undo or delete recovery before starting a global operation.');
      const token = { generation: undoGeneration, visible: undoState, source: state };
      undoHold = token; undoState = null;
      for (const work of undoWork) clearTimeout(work.timer);
      renderToast();
      try {
        await Promise.all([...deleteOperations, ...[...undoWork].map(work => work.busy).filter(Boolean)]);
        if (failedDeleteSnapshots.size || [...undoWork].some(work => work.snapshot && work.failedUndoError)) throw new Error('Retry Undo or delete recovery before starting a global operation.');
        token.domain = undoDomain(); token.attachments = [];
        for (const work of undoWork) for (const record of work.snapshot?.pendingAttachments || [])
          token.attachments.push(await Attachments.get(record.id));
        return token;
      } catch (error) {
        // No token escaped and no global mutation was authorized: restore the
        // same-source eligibility, never trap the user's only recovery closure.
        if (undoHold === token) {
          undoHold = null;
          undoState = token.source === state && undoWork.has(token.visible) && performance.now() < token.visible.deadline ? token.visible : null;
          for (const work of undoWork) armUndo(work);
          renderToast(); setToastMessage('Safety preparation failed. Normal Undo and retained files were kept.');
        }
        throw error;
      }
    },
    // Resume is ONLY for explicitly verified rollback/cancel, never automatic hydration.
    async resume(token) {
      if (undoHold !== token || token.generation !== undoGeneration) throw new Error('Invalid Undo hold token.');
      if (undoDomain() !== token.domain) throw new Error('The restored metadata does not match the held domain.');
      for (const expected of token.attachments) if (expected && !(await sameStoredAttachment(await Attachments.get(expected.id), expected)))
        throw new Error('The restored files do not match held ownership and bytes.');
      for (const work of undoWork) if (work.snapshot) {
        const snapshot = work.snapshot;
        snapshot.source = state;
        for (const entry of snapshot.entries) {
          if (entry.parent) entry.parent = state[entry.collection].find(item => item.id === entry.parent.id);
          if (entry.collection === 'tasks' && !entry.field && entry.entity.projectId) entry.projectParent = getProject(entry.entity.projectId);
        }
        for (const effect of snapshot.effects) {
          effect.owner = state[effect.collection].find(item => item.id === effect.owner.id);
          if (effect.link) effect.link = effect.owner?.projectLinks?.find(link => link.projectId === effect.link.projectId);
        }
        if (snapshot.attachmentOwner) snapshot.attachmentOwner = state[snapshot.attachmentOwnerCollection].find(item => item.id === snapshot.attachmentOwner.id);
      }
      undoHold = null;
      undoState = token.visible && undoWork.has(token.visible) && performance.now() < token.visible.deadline ? token.visible : null;
      renderToast();
      for (const work of [...undoWork]) { if (performance.now() >= work.deadline) await expireUndo(work); else armUndo(work); }
    },
    retire(token) {
      if (undoHold !== token || token.generation !== undoGeneration) throw new Error('Invalid Undo hold token.');
      undoGeneration++;
      for (const work of undoWork) clearTimeout(work.timer);
      undoWork.clear(); failedDeleteSnapshots.clear(); undoState = null; undoHold = null; renderToast();
    }
  };

  function armUndo(work) {
    clearTimeout(work.timer);
    if (undoHold || work.generation !== undoGeneration) return;
    work.timer = setTimeout(() => expireUndo(work), Math.max(0, work.deadline - performance.now()));
  }

  function retainFailedUndo(work, error) {
    const snapshot = work.snapshot;
    snapshot.recoveryKind = 'undo';
    snapshot.recoveryError ||= `Undo failed: ${error}`;
    failedDeleteSnapshots.add(snapshot);
    clearTimeout(work.timer);
    if (undoState === work) undoState = null;
    undoWork.delete(work);
    renderToast();
  }

  async function expireUndo(work) {
    if (undoHold || work.generation !== undoGeneration || work.busy) return;
    if (performance.now() < work.deadline) { armUndo(work); return; }
    if (work.snapshot && work.failedUndoError) { retainFailedUndo(work, work.failedUndoError); return; }
    if (undoState === work) { undoState = null; renderToast(); }
    work.busy = Promise.resolve().then(() => work.finalizer?.());
    try {
      const finished = await work.busy;
      if (finished === false) work.timer = setTimeout(() => expireUndo(work), Math.max(1, work.snapshot.deadline - Date.now()));
      else undoWork.delete(work);
    }
    catch (_) { setToastMessage('File cleanup failed. Retained files will be retried.'); work.timer = setTimeout(() => expireUndo(work), 30000); }
    finally { work.busy = null; }
  }

  function setUndo(message, undoFn, finalizer = null, snapshot = null) {
    if (undoHold) return; // Global replacement has exclusive normal-Undo ownership.
    if (snapshot) snapshot.eligibilityDeadline = performance.now() + 6500;
    const work = { message, undoFn, finalizer, snapshot, generation: undoGeneration,
      deadline: snapshot?.eligibilityDeadline || performance.now() + 6500, timer: null, busy: null };
    if (undoState && !undoState.finalizer && !undoState.busy) { clearTimeout(undoState.timer); undoWork.delete(undoState); }
    undoWork.add(work); undoState = work; armUndo(work); renderToast();
  }

  function renderToast() {
    const root = $('#toast-root');
    const undo = undoState ? `<div class="toast"><i class="ph-fill ph-check-circle toast-icon"></i><span class="toast-message">${esc(undoState.message)}</span><button class="toast-action" type="button" data-action="undo">Undo</button></div>` : '';
    const info = toastMessage ? `<div class="toast"><i class="ph ph-info toast-icon" style="color:var(--info)"></i><span class="toast-message">${esc(toastMessage)}</span></div>` : '';
    const failed = [...failedDeleteSnapshots][0];
    const recoveryNotice = failed && !undoHold ? `<div class="toast" role="alert"><i class="ph ph-warning toast-icon"></i><span class="toast-message">${esc(failed.recoveryError)} · Snapshot retained</span><button class="toast-action" type="button" data-action="retry-delete-recovery">Retry recovery</button></div>` : '';
    const globalNotice = globalRecoveryNotice ? `<div class="toast" role="alert"><span class="toast-message">${esc(globalRecoveryNotice.message)}</span><button class="toast-action" data-action="retry-global-recovery">Retry</button></div>` : '';
    root.innerHTML = undo + info + recoveryNotice + globalNotice;
  }

  async function doUndo() {
    const work = undoState;
    if (!work || work.busy || undoHold || work.generation !== undoGeneration) return;
    if (performance.now() >= work.deadline) { expireUndo(work); return; }
    clearTimeout(work.timer);
    work.busy = Promise.resolve().then(() => work.undoFn());
    try {
      await work.busy;
      if (undoState === work) undoState = null;
      undoWork.delete(work); renderToast();
    } catch (error) {
      work.failedUndoError = error.message;
      if (work.snapshot && (failedDeleteSnapshots.has(work.snapshot) || performance.now() >= work.deadline)) {
        retainFailedUndo(work, error.message);
        setToastMessage('Undo failed. Snapshot retained; use Retry recovery.');
      } else setToastMessage('Undo failed. Your recovery snapshot is retained; retry Undo.');
    }
    finally { work.busy = null; if (undoWork.has(work)) armUndo(work); }
  }

  function addAllSuggestions() {
    const sections = Core.deriveTodaySections(state.tasks, Core.dateOnly());
    let order = nextOrder('today');
    for (const { task } of sections.suggestions) {
      task.plannedDate = Core.dateOnly(); task.isInbox = false; task.todayOrder = order++; task.updatedAt = nowIso();
    }
    saveAndRender();
  }

  function addTaskToToday(taskId) {
    const task = getTask(taskId); if (!task) return;
    if(taskRecurrence(task)){requestTaskEdit(taskId,{plannedDate:Core.dateOnly(),isInbox:false,todayOrder:nextOrder('today')});return;}
    const prev = { plannedDate: task.plannedDate, isInbox: task.isInbox, todayOrder: task.todayOrder };
    task.plannedDate = Core.dateOnly(); task.isInbox = false; task.todayOrder = nextOrder('today'); task.updatedAt = nowIso(); saveState(); render();
    setUndo('Task moved to Today', () => { const t = getTask(taskId); if (!t) return; Object.assign(t, prev, { updatedAt: nowIso() }); saveState(); render(); });
  }

  function moveTaskToTomorrow(taskId) {
    const task = getTask(taskId); if (!task) return;
    if(taskRecurrence(task)){requestTaskEdit(taskId,{plannedDate:Core.addDays(Core.dateOnly(),1),isInbox:false,todayOrder:null});return;}
    const prev = { plannedDate: task.plannedDate, isInbox: task.isInbox, todayOrder: task.todayOrder };
    task.plannedDate = Core.addDays(Core.dateOnly(), 1); task.isInbox = false; task.todayOrder = null; task.updatedAt = nowIso();
    saveState(); render();
    setUndo('Task moved to Tomorrow', () => { const current = getTask(taskId); if (!current) return; Object.assign(current, prev, { updatedAt: nowIso() }); saveState(); render(); });
  }

  function nextProjectOrder() {
    const orders = state.projects.map(p => p.order).filter(Number.isFinite);
    return orders.length ? Math.max(...orders) + 1 : 0;
  }

  function saveTagModal() {
    if (modalState?.type !== 'tag') return;
    const name = Core.normalizeTagName(modalState.draft.name);
    const valid = Core.validateTagName(state.tags || [], name, modalState.tagId || null);
    if (!valid.ok) { modalState.error = valid.reason === 'duplicate-tag' ? 'A tag with this name already exists.' : 'Tag needs a name.'; renderModal(); return; }
    if (modalState.tagId) {
      const tag = getTag(modalState.tagId); if (!tag) return;
      tag.name = name; tag.color = modalState.draft.color; tag.updatedAt = nowIso();
    } else {
      const tag = { id: uid('tag'), name, color: modalState.draft.color, createdAt: nowIso(), updatedAt: nowIso() };
      state.tags.push(tag); state.ui.selectedTagId = tag.id;
    }
    saveState(); closeModal(); render();
  }

  function deleteTag(tagId) {
    requestDeleteEntity('tag', tagId);
  }

  function saveProjectModal() {
    const nameInput = $('#project-name');
    if (nameInput) modalState.draft.name = nameInput.value;
    const name = String(modalState.draft.name || '').trim();
    if (!name) { modalState.error = 'Project needs a name.'; renderModal(); requestAnimationFrame(() => $('#project-name')?.focus()); return; }
    if (modalState.projectId) {
      const project = getProject(modalState.projectId); if (!project) return;
      project.name = name; project.color = modalState.draft.color; project.updatedAt = nowIso();
    } else {
      const project={ id: uid('project'), name, color: modalState.draft.color, areaId: modalState.draft.areaId || null, goalIds: [...(modalState.draft.goalIds || [])], order: nextProjectOrder(), isArchived: false, archivedAt: null, createdAt: nowIso(), updatedAt: nowIso() };
      state.projects.push(project);
      if(modalState.templateInstance) {
        const before=captureGoalProgress();
        for(const child of modalState.templateInstance.tasks || []) {
          child.projectId=project.id;child.areaId=null;child.projectOrder=nextOrder(`project:${project.id}`);child.todayOrder=child.plannedDate===Core.dateOnly()?nextOrder('today'):null;child.isInbox=false;child.inboxOrder=null;
          state.tasks.push(child);syncTemplateEntityGoalLinks('task',child);
        }
        syncTemplateEntityGoalLinks('project',project,modalState.templateInstance.goalLinks);
        saveState();closeModal();render();evaluateGoalProgressChanges(before);return;
      }
    }
    saveState(); closeModal(); render();
  }

  function saveAreaModal() {
    if (modalState?.type !== 'area') return;
    const input = $('#area-name');
    if (input) modalState.draft.name = input.value;
    const name = Core.normalizeTagName(modalState.draft.name);
    const valid = Core.validateAreaName(state.areas || [], name, modalState.areaId || null);
    if (!valid.ok) {
      modalState.error = valid.reason === 'duplicate-area' ? 'An area with this name already exists.' : 'Area needs a name.';
      renderModal(); requestAnimationFrame(() => $('#area-name')?.focus()); return;
    }
    if (modalState.areaId) {
      const area = getArea(modalState.areaId); if (!area) return;
      area.name = name; area.color = modalState.draft.color; area.icon = modalState.draft.icon; area.updatedAt = nowIso();
    } else {
      state.areas.push({ id: uid('area'), name, color: modalState.draft.color, icon: modalState.draft.icon, status: 'active', isPinned: false, createdAt: nowIso(), updatedAt: nowIso() });
    }
    saveState(); closeModal(); render();
  }

  function saveAreaLinkedModal() {
    if (modalState?.type !== 'area-linked') return;
    const input = $('#area-linked-name');
    const name = String(input?.value || modalState.draft.name || '').trim();
    if (!name) { modalState.error = `${modalState.kind === 'goal' ? 'Goal' : 'Habit'} needs a name.`; renderModal(); return; }
    const item = { id: uid(modalState.kind), name, areaId: modalState.areaId, status: 'active', createdAt: nowIso(), updatedAt: nowIso() };
    if (modalState.kind === 'goal') {
      state.goals.push({ ...goalDraft(null, modalState.areaId), ...item, title: name, projectLinks: [], taskIds: [], habitLinks: [], milestones: [], reminders: { sevenDaysBefore: false, threeDaysBefore: false, oneDayBefore: false, onTargetDate: false, time: '09:00' }, completedAt: null });
      putGoalHistory(item.id, 'created');
    } else state.habits.push({ ...habitDraft(null, modalState.areaId), ...item, goalIds: [], reminderFiredMoments: [] });
    saveState(); closeModal(); refreshHabitMetrics().then(render);
  }

  function putGoalHistory(goalId, type, data = {}) {
    if (!TodoStorage?.goalHistory) return;
    TodoStorage.goalHistory.put({ id: uid('goal-history'), goalId, type, data, createdAt: nowIso() }).catch(console.error);
  }

  function syncGoalLinks(goal, projectLinks, taskIds, habitLinks) {
    const oldProjectIds = new Set((goal.projectLinks || []).map(link => link.projectId));
    const newProjectIds = new Set(projectLinks.map(link => link.projectId));
    state.projects.forEach(project => {
      const ids = new Set(project.goalIds || []);
      if (newProjectIds.has(project.id)) ids.add(goal.id); else if (oldProjectIds.has(project.id)) ids.delete(goal.id);
      project.goalIds = [...ids];
    });
    state.tasks.forEach(task => {
      const ids = new Set(task.goalIds || []);
      if (taskIds.includes(task.id)) ids.add(goal.id); else if ((goal.taskIds || []).includes(task.id)) ids.delete(goal.id);
      task.goalIds = [...ids];
    });
    state.habits.forEach(habit => {
      const ids = new Set(habit.goalIds || []);
      if (habitLinks.some(link => link.habitId === habit.id)) ids.add(goal.id); else if ((goal.habitLinks || []).some(link => link.habitId === habit.id)) ids.delete(goal.id);
      habit.goalIds = [...ids];
    });
    goal.projectLinks = projectLinks; goal.taskIds = taskIds; goal.habitLinks = habitLinks;
  }

  function readGoalDraft() {
    const d = modalState.draft;
    for (const [field, id] of Object.entries({title:'goal-title',areaId:'goal-area',progressMode:'goal-progress-mode',progressType:'goal-progress-type',currentValue:'goal-current',targetValue:'goal-target',unit:'goal-unit',targetDate:'goal-target-date'})) {
      const input = $('#' + id); if (!input) continue;
      d[field] = ['currentValue','targetValue'].includes(field) ? Number(input.value) : ['areaId','targetDate'].includes(field) ? input.value || null : input.value;
    }
    return d;
  }

  function saveGoalModal() {
    if (modalState?.type !== 'goal') return;
    const d = readGoalDraft();
    if (!String(d.title).trim()) { modalState.error = 'Goal needs a title.'; renderModal(); return; }
    if (d.progressMode === 'manual' && d.progressType === 'numeric' && !(Number.isFinite(d.targetValue) && d.targetValue > 0)) { modalState.error = 'Numeric goals need a target above zero.'; renderModal(); return; }
    const { moreOpen, ...fields } = d;
    if (modalState.goalId) {
      const goal = getGoal(modalState.goalId); if (!goal) return;
      const oldProgress = Core.computeGoalProgress(goal, state, state.habitMetrics || {}).percent;
      const oldDate = goal.targetDate;
      const oldProjects = new Set(goal.projectLinks.map(link => link.projectId));
      syncGoalLinks(goal, d.projectLinks, d.taskIds, d.habitLinks);
      Object.assign(goal, { ...fields, title: d.title.trim(), updatedAt: nowIso() });
      d.projectLinks.forEach(link => { if (!oldProjects.has(link.projectId)) putGoalHistory(goal.id, 'projectLinked', { projectId: link.projectId }); });
      oldProjects.forEach(projectId => { if (!d.projectLinks.some(link => link.projectId === projectId)) putGoalHistory(goal.id, 'projectUnlinked', { projectId }); });
      const nextProgress = Core.computeGoalProgress(goal, state, state.habitMetrics || {}).percent;
      if (nextProgress !== oldProgress) putGoalHistory(goal.id, 'progressChanged', { from: oldProgress, to: nextProgress });
      if (oldDate !== goal.targetDate) putGoalHistory(goal.id, 'targetDateChanged', { from: oldDate, to: goal.targetDate });
      modalState.savedGoalSource = goal;
      saveState(); closeModal(); render(); maybePromptGoalReached(goal, oldProgress);
    } else {
      const goal = { ...(modalState.templateInstance?.goal || {}), id: uid('goal'), ...fields, title: d.title.trim(), createdAt: nowIso(), updatedAt: nowIso(), completedAt: null };
      modalState.savedGoalSource = goal;
      state.goals.push(goal); syncGoalLinks(goal, d.projectLinks, d.taskIds, d.habitLinks); putGoalHistory(goal.id, 'created'); saveState(); closeModal(); createdGoalFocusId = goal.id; navigate(`goal/${goal.id}`);
    }
  }

  function maybePromptGoalReached(goal, previousPercent) {
    const percent = Core.computeGoalProgress(goal, state, state.habitMetrics || {}).percent;
    if (goal.status === 'active' && previousPercent < 100 && percent >= 100) {
      modalState = { type: 'goal-reached', goalId: goal.id }; renderModal();
    }
  }

  function captureGoalProgress(goalIds = null) {
    const ids = goalIds ? new Set(goalIds) : null;
    return new Map((state.goals || []).filter(goal => !ids || ids.has(goal.id)).map(goal => [goal.id, Core.computeGoalProgress(goal, state, state.habitMetrics || {}).percent]));
  }

  function evaluateGoalProgressChanges(before) {
    for (const goal of state.goals || []) {
      if (!before?.has(goal.id)) continue;
      const previous = before.get(goal.id);
      const current = Core.computeGoalProgress(goal, state, state.habitMetrics || {}).percent;
      if (current !== previous) putGoalHistory(goal.id, 'progressChanged', { from: previous, to: current });
      if (goal.status === 'active' && previous < 100 && current >= 100) {
        maybePromptGoalReached(goal, previous);
        return goal;
      }
    }
    return null;
  }

  function updateGoalStatus(goalId, status) {
    const goal = getGoal(goalId); if (!goal || goal.status === status) return;
    const previous = { status: goal.status, completedAt: goal.completedAt };
    goal.status = status; goal.completedAt = status === 'completed' ? nowIso() : null; goal.updatedAt = nowIso();
    putGoalHistory(goal.id, 'statusChanged', { from: previous.status, to: status }); saveState(); closePopover(); closeModal(); render();
    setUndo(`Goal ${status === 'completed' ? 'completed' : status === 'paused' ? 'paused' : 'restored'}`, () => {
      const current = getGoal(goalId); if (!current) return;
      Object.assign(current, previous, { updatedAt: nowIso() });
      const history = TodoStorage.goalHistory.put({ id: uid('goal-history'), goalId, type: 'statusChanged', data: { from: status, to: previous.status }, createdAt: nowIso() });
      saveState(); render(); return history;
    });
  }

  function saveGoalProgress(goalId) {
    const goal = getGoal(goalId); if (!goal || goal.progressMode !== 'manual') return;
    const before = Core.computeGoalProgress(goal, state, state.habitMetrics || {}).percent;
    goal.currentValue = Number($('#goal-current-value')?.value || 0); goal.updatedAt = nowIso();
    const after = Core.computeGoalProgress(goal, state, state.habitMetrics || {}).percent;
    if (after !== before) putGoalHistory(goalId, 'progressChanged', { from: before, to: after });
    saveState(); render(); maybePromptGoalReached(goal, before);
  }

  async function refreshHabitMetrics() {
    if (!state || !TodoStorage?.habitLogs) return;
    const logs = await TodoStorage.habitLogs.listAll();
    const byHabit = {};
    for (const log of logs) (byHabit[log.habitId] ||= []).push(log);
    state.habitLogCache = byHabit;
    state.habitMetrics = Object.fromEntries((state.habits || []).map(habit => [habit.id, Core.deriveHabitMetrics(habit, byHabit[habit.id] || [], Core.dateOnly(), state.settings.weekStartsOn || 'monday')]));
  }

  function readHabitDraft() {
    const d = modalState.draft;
    d.name = $('#habit-name')?.value || d.name; d.areaId = $('#habit-area')?.value || null; d.trackingType = $('#habit-tracking')?.value || 'checkbox'; d.frequencyType = $('#habit-frequency')?.value || 'daily';
    d.targetValue = Number($('#habit-target-value')?.value ?? d.targetValue); d.unit = $('#habit-unit')?.value || ''; d.timesPerWeek = Number($('#habit-times-per-week')?.value ?? d.timesPerWeek); d.everyNDays = Number($('#habit-every-n-days')?.value ?? d.everyNDays);
    d.weekdays = $$('[data-habit-weekday]').filter(input => input.checked).map(input => Number(input.dataset.habitWeekday));
    const startDate = $('#habit-start-date'); const continuation = $('#habit-continuation'); const endType = $('#habit-end-type'); const endDate = $('#habit-end-date'); const successfulPeriods = $('#habit-successful-periods'); const quickValues = $('#habit-quick-values'); const reminders = $('#habit-reminders'); const goalControls = $$('[data-habit-goal]');
    if (startDate) d.startDate = startDate.value || d.startDate || Core.dateOnly();
    if (continuation) d.continuation = continuation.value || d.continuation;
    if (endType) d.endType = endType.value || d.endType;
    if (endDate) d.endDate = endDate.value || null;
    if (successfulPeriods) d.successfulPeriodsTarget = successfulPeriods.value === '' ? null : Number(successfulPeriods.value);
    if (quickValues) d.quickValues = String(quickValues.value ?? '').split(',').map(value => Number(value.trim())).filter(value => Number.isFinite(value) && value > 0);
    else if (typeof d.quickValues === 'string') d.quickValues = d.quickValues.split(',').map(value => Number(value.trim())).filter(value => Number.isFinite(value) && value > 0);
    if (reminders) {
      const oldByTime = new Map((d.reminders || []).map(item => [item.time, item]));
      const disabled = (d.reminders || []).filter(item => item?.enabled === false);
      const enabled = String(reminders.value || '').split(',').map(value => Core.normalizeTime(value.trim())).filter(Boolean).map(time => ({ ...(oldByTime.get(time) || {}), id: oldByTime.get(time)?.id || uid('habit-reminder'), time, enabled: oldByTime.get(time)?.enabled !== false }));
      d.reminders = [...disabled, ...enabled.filter(item => !disabled.some(disabledItem => disabledItem.id === item.id))];
    }
    if (goalControls.length) d.goalIds = goalControls.filter(input => input.checked).map(input => input.dataset.habitGoal);
    return d;
  }

  function saveHabitModal() {
    if (modalState?.type !== 'habit') return;
    const d = readHabitDraft();
    if (!String(d.name).trim()) { modalState.error = 'Habit needs a name.'; renderModal(); return; }
    if (d.trackingType === 'numeric' && !(d.targetValue > 0)) { modalState.error = 'Numeric habits need a target above zero.'; renderModal(); return; }
    if (d.frequencyType === 'weekdays' && !d.weekdays.length) { modalState.error = 'Select at least one weekday.'; renderModal(); return; }
    if (d.frequencyType === 'timesPerWeek' && (!Number.isInteger(d.timesPerWeek) || d.timesPerWeek < 1 || d.timesPerWeek > 7)) { modalState.error = 'Times per week must be a positive whole number up to 7.'; renderModal(); return; }
    if (d.frequencyType === 'everyNDays' && (!Number.isInteger(d.everyNDays) || d.everyNDays < 1)) { modalState.error = 'Every N days must be a positive whole number.'; renderModal(); return; }
    if (d.endType === 'date' && !d.endDate) { modalState.error = 'Choose an end date.'; renderModal(); return; }
    if (d.endType === 'successfulPeriods' && (!Number.isInteger(d.successfulPeriodsTarget) || d.successfulPeriodsTarget < 1)) { modalState.error = 'Successful periods must be a positive whole number.'; renderModal(); return; }
    const fields = { ...d, name: String(d.name).trim(), quickValues: d.quickValues, reminders: d.reminders, updatedAt: nowIso() };
    const existingId = modalState.habitId;
    const habit = existingId ? getHabit(existingId) : { id: uid('habit'), goalIds: [], status: 'active', reminderFiredMoments: [], createdAt: nowIso() };
    Object.assign(habit, fields);
    const before=modalState.templateInstance?captureGoalProgress():null;
    syncHabitGoalLinks(habit, d.goalIds,modalState.templateInstance?.goalLinks);
    if (!existingId) state.habits.push(habit);
    saveState(); closeModal(); refreshHabitMetrics().then(()=>{render();if(before)evaluateGoalProgressChanges(before);});
    if (!existingId) navigate(`habit/${habit.id}`);
  }

  function syncHabitGoalLinks(habit, goalIds,configs=[]) {
    const selected = new Set(goalIds || []);
    for (const goal of state.goals || []) {
      const links = (goal.habitLinks || []).filter(link => link.habitId !== habit.id);
      if (selected.has(goal.id)) {
        const config=configs.find(c=>c.goalId===goal.id);
        links.push((goal.habitLinks || []).find(link => link.habitId === habit.id) || { habitId: habit.id, metric: config?.metric || 'totalCheckins', target: config?.target || (habit.trackingType === 'numeric' ? Math.max(1, Number(habit.targetValue) || 1) : 1) });
      }
      goal.habitLinks = links;
    }
    habit.goalIds = [...selected];
  }

  async function setHabitLog(habitId, date, requestedStatus = 'done', requestedValue = null) {
    const habit = getHabit(habitId); const today = Core.dateOnly();
    const existing = (state.habitLogCache?.[habitId] || []).find(log => log.date === date);
    // Historical corrections remain valid after a pause/archive. Only today's
    // live check-in is controlled by the current lifecycle state.
    if (!habit || !date || date > today || (date === today && habit.status !== 'active') || !(Core.habitScheduledOn(habit, date, { historical: true }) || existing)) return false;
    const before = captureGoalProgress();
    let status = requestedStatus; let value = requestedValue;
    if (habit.trackingType === 'numeric') { const numeric = Core.numericHabitState(habit, requestedValue); status = numeric.status; value = numeric.value; }
    const record = { id: `${habitId}:${date}`, habitId, date, status: ['done', 'skipped', 'missed'].includes(status) ? status : 'done', value: value ?? null, createdAt: existing?.createdAt || nowIso(), updatedAt: nowIso() };
    await TodoStorage.habitLogs.put(record);
    await refreshHabitMetrics(); habit.updatedAt = nowIso(); saveState(); evaluateGoalProgressChanges(before); await evaluateHabitBoundaries(); render(); return true;
  }

  async function evaluateHabitBoundaries() {
    if (!state || globalOperation || modalState?.type === 'habit-finished') return;
    const today = Core.dateOnly(); const weekStartsOn = state.settings.weekStartsOn || 'monday';
    for (const habit of state.habits || []) {
      if (habit.status !== 'active') continue;
      const metrics = habitMetrics(habit);
      const ended = (habit.endType === 'date' && habit.endDate && today > habit.endDate)
        || (habit.endType === 'successfulPeriods' && metrics.successfulPeriods >= Number(habit.successfulPeriodsTarget || Infinity));
      const prior = metrics.periods?.filter(period => !period.isCurrent).at(-1);
      const continued = prior && habit.lastContinuationPeriod !== prior.key;
      const boundary = ended ? 'end' : habit.continuation === 'onePeriod' && prior ? 'onePeriod' : habit.continuation === 'askEachPeriod' && continued ? 'ask' : null;
      if (boundary) { modalState = { type: 'habit-finished', habitId: habit.id, boundary }; renderModal(); return; }
    }
  }

  async function refreshHabitDateBoundary() {
    await refreshHabitMetrics();
    await evaluateHabitBoundaries();
    render();
    checkReminders();
  }

  function updateHabitStatus(habitId, status) {
    const habit = getHabit(habitId); if (!habit || habit.status === status) return;
    const snapshot = JSON.parse(JSON.stringify(habit)); const today = Core.dateOnly();
    if (status === 'paused' && habit.status === 'active') habit.pauseStartedAt = today;
    if (status === 'active' && habit.pauseStartedAt) {
      const startDate = habit.pauseStartedAt || today; const endDate = Core.addDays(today, -1);
      if (startDate <= endDate) habit.pauseIntervals = [...(habit.pauseIntervals || []), { startDate, endDate }];
      habit.pauseStartedAt = null;
    }
    habit.status = status; habit.updatedAt = nowIso(); saveState(); closePopover(); if (modalState?.type === 'habit-finished') closeModal(); refreshHabitMetrics().then(render);
    setUndo(`Habit ${status === 'paused' ? 'paused' : status === 'archived' ? 'archived' : 'restored'}`, () => { const current = getHabit(habitId); if (!current) return; Object.assign(current, snapshot); current.updatedAt = nowIso(); saveState(); return refreshHabitMetrics().then(render); });
  }

  async function deleteHabit(habitId) {
    requestDeleteEntity('habit', habitId);
  }

  function snoozeHabit(habitId, kind) {
    const habit = getHabit(habitId); if (!habit) return;
    const now = new Date(); const next = new Date(now);
    if (kind === '15m') next.setMinutes(next.getMinutes() + 15); else if (kind === '1h') next.setHours(next.getHours() + 1); else { next.setHours(now.getHours() >= 19 ? 21 : 19, 0, 0, 0); }
    habit.snoozedUntil = next.toISOString(); habit.pendingSnoozeAt = next.toISOString(); habit.updatedAt = nowIso(); saveState(); setToastMessage(`Habit snoozed until ${formatReminder(habit.snoozedUntil)}`);
  }

  function saveMilestoneModal() {
    if (modalState?.type !== 'milestone') return;
    const goal = modalState.previous?.draft || getGoal(modalState.goalId); if (!goal) return;
    modalState.draft = { title: $('#milestone-title')?.value || '', date: $('#milestone-date')?.value || '' };
    const title = String(modalState.draft.title).trim(); if (!title) { modalState.error = 'Milestone needs a title.'; renderModal(); return; }
    const existing = modalState.milestoneId ? goal.milestones.find(item => item.id === modalState.milestoneId) : null;
    if (existing) Object.assign(existing, { title, date: $('#milestone-date')?.value || null });
    else goal.milestones.push({ id: uid('milestone'), title, date: $('#milestone-date')?.value || null, isCompleted: false, completedAt: null, order: goal.milestones.length });
    if (modalState.previous) { closeModal(); return; }
    goal.updatedAt = nowIso();
    saveState(); closeModal(); render();
  }

  function toggleMilestone(goalId, milestoneId) {
    const goal = getGoal(goalId); const milestone = goal?.milestones.find(item => item.id === milestoneId); if (!milestone) return;
    milestone.isCompleted = !milestone.isCompleted; milestone.completedAt = milestone.isCompleted ? nowIso() : null; goal.updatedAt = nowIso(); saveState(); render(); if (modalState?.type === 'calendar-day') renderModal();
  }

  function deleteMilestone(goalId, milestoneId) {
    requestDeleteEntity('milestone', { parentId: goalId, id: milestoneId });
  }

  function readGoalLinkDraft() {
    const d = modalState.draft;
    const projects = $$('[data-goal-link-project]');
    d.projectModes ||= {}; d.projectDrafts ||= {};
    $$('[data-goal-project-mode]').forEach(input => { d.projectModes[input.dataset.goalProjectMode] = input.value; });
    projects.forEach(input => {
      const projectId = input.dataset.goalLinkProject;
      const old = d.projectLinks.find(link => link.projectId === projectId) || d.projectDrafts[projectId];
      const picker = $(`[data-project-task-picker="${CSS.escape(projectId)}"]`);
      const selectedTaskIds = picker ? $$('[data-goal-project-task]', picker).filter(i => i.checked).map(i => i.dataset.goalProjectTask.slice(projectId.length + 1)) : [...(old?.selectedTaskIds || [])];
      d.projectDrafts[projectId] = { ...old, projectId, contributionMode: d.projectModes[projectId] || 'allTasks', selectedTaskIds };
    });
    if (projects.length) d.projectLinks = projects.filter(input => input.checked).map(input => d.projectDrafts[input.dataset.goalLinkProject]);
    const tasks = $$('[data-goal-link-task]');
    if (tasks.length) d.taskIds = tasks.filter(input => input.checked).map(input => input.dataset.goalLinkTask);
    const habits = $$('[data-goal-link-habit]');
    d.habitDrafts ||= {};
    habits.forEach(input => {
      const id = input.dataset.goalLinkHabit; const old = d.habitLinks.find(link => link.habitId === id) || d.habitDrafts[id];
      d.habitDrafts[id] = { ...old, habitId: id, metric: $(`[data-goal-habit-metric="${CSS.escape(id)}"]`)?.value || 'totalCheckins', target: Number($(`[data-goal-habit-target="${CSS.escape(id)}"]`)?.value ?? old?.target ?? 1) };
    });
    if (habits.length) d.habitLinks = habits.filter(input => input.checked).map(input => d.habitDrafts[input.dataset.goalLinkHabit]);
    return d;
  }

  function deleteDraftGoalMilestone(id) {
    if (modalState?.type !== 'goal') return;
    readGoalDraft(); const editor = modalState; const index = editor.draft.milestones.findIndex(m => m.id === id); if (index < 0) return;
    const milestone = copyTemplate(editor.draft.milestones[index]); const target = goalFocusTarget();
    const back = () => { modalState = editor; renderModal(); restoreGoalFocus(target); };
    openConfirm({ title: 'Delete milestone?', message: 'This removes the milestone from this Goal draft.', onCancel: back, onConfirm: () => {
      editor.draft.milestones.splice(index, 1); back(); setUndo('Milestone deleted', () => {
        editor.draft.milestones.splice(Math.min(index, editor.draft.milestones.length), 0, copyTemplate(milestone));
        const saved = editor.savedGoalSource;
        if (saved && getGoal(saved.id) === saved) { if (!saved.milestones.some(m => m.id === id)) saved.milestones.splice(Math.min(index, saved.milestones.length), 0, copyTemplate(milestone)); saveState(); render(); }
        if (modalState === editor) { readGoalDraft(); renderModal(); }
      });
    } });
  }

  function saveGoalLinks() {
    if (modalState?.type !== 'goal-links') return;
    const d = readGoalLinkDraft();
    if (d.habitLinks.some(link => !Number.isFinite(link.target) || link.target <= 0)) { modalState.error = 'Enter a Habit target above zero.'; renderModal(); return; }
    if (modalState.previous) { Object.assign(modalState.previous.draft, { projectLinks: d.projectLinks, taskIds: d.taskIds, habitLinks: d.habitLinks }); closeModal(); return; }
    const goal = getGoal(modalState.goalId); if (!goal) return;
    const progressBefore = captureGoalProgress();
    const oldProjects = new Set((goal.projectLinks || []).map(link => link.projectId));
    const { projectLinks, taskIds, habitLinks } = d;
    syncGoalLinks(goal, projectLinks, taskIds, habitLinks); goal.updatedAt = nowIso();
    projectLinks.forEach(link => { if (!oldProjects.has(link.projectId)) putGoalHistory(goal.id, 'projectLinked', { projectId: link.projectId }); });
    oldProjects.forEach(projectId => { if (!projectLinks.some(link => link.projectId === projectId)) putGoalHistory(goal.id, 'projectUnlinked', { projectId }); });
    saveState(); closeModal(); render(); evaluateGoalProgressChanges(progressBefore);
  }

  function saveGoalReminders() {
    if (modalState?.type !== 'goal-reminders') return;
    const goal = modalState.previous?.draft || getGoal(modalState.goalId); if (!goal) return;
    goal.reminders = { ...modalState.draft, sevenDaysBefore: Boolean($('#goal-reminder-7')?.checked), threeDaysBefore: Boolean($('#goal-reminder-3')?.checked), oneDayBefore: Boolean($('#goal-reminder-1')?.checked), onTargetDate: Boolean($('#goal-reminder-date')?.checked), time: Core.normalizeTime($('#goal-reminder-time')?.value) || '09:00' };
    if (modalState.previous) { closeModal(); return; }
    goal.updatedAt = nowIso(); saveState(); closeModal(); render();
  }

  async function deleteGoal(goalId) {
    requestDeleteEntity('goal', goalId);
  }

  function archiveArea(areaId) {
    const area = getArea(areaId); if (!area || area.status === 'archived') return;
    const previous = { status: area.status, isPinned: area.isPinned, updatedAt: area.updatedAt };
    area.status = 'archived'; area.isPinned = false; area.updatedAt = nowIso();
    saveState(); closePopover();
    if (currentRoute().type === 'area' && currentRoute().id === areaId) navigate('areas'); else render();
    setUndo('Area archived', () => { const current = getArea(areaId); if (!current) return; Object.assign(current, previous, { updatedAt: nowIso() }); saveState(); render(); });
  }

  function restoreArea(areaId) {
    const area = getArea(areaId); if (!area) return;
    area.status = 'active'; area.updatedAt = nowIso(); saveState(); closePopover(); render(); setToastMessage('Area restored');
  }

  function toggleAreaPin(areaId) {
    const area = getArea(areaId); if (!area || area.status === 'archived') return;
    area.isPinned = !area.isPinned; area.updatedAt = nowIso(); saveState(); closePopover(); render();
  }

  function deleteArea(areaId) {
    requestDeleteEntity('area', areaId);
  }

  function archiveProject(projectId) {
    const project = getProject(projectId); if (!project || project.isArchived) return;
    const previous = { isArchived: project.isArchived, archivedAt: project.archivedAt };
    project.isArchived = true; project.archivedAt = nowIso(); project.updatedAt = nowIso();
    saveState();
    closePopover();
    if (currentRoute().type === 'project' && currentRoute().id === projectId) navigate('today');
    else render();
    setUndo('Project archived', () => { const current = getProject(projectId); if (!current) return; Object.assign(current, previous, { updatedAt: nowIso() }); saveState(); render(); });
  }

  function restoreProject(projectId) {
    const project = getProject(projectId); if (!project) return;
    project.isArchived = false; project.archivedAt = null; project.updatedAt = nowIso();
    saveState(); closePopover(); render();
    setToastMessage('Project restored');
  }

  function deleteProject(projectId) {
    requestDeleteEntity('project', projectId);
  }

  function toggleSubtask(taskId, subtaskId) {
    const task = getTask(taskId); const sub = task?.subtasks.find(s => s.id === subtaskId); if (!sub) return;
    sub.isCompleted = !sub.isCompleted; task.updatedAt = nowIso(); saveState(); renderModal(); render();
  }

  function deleteSubtask(taskId, subtaskId) {
    requestDeleteEntity('subtask', { parentId: taskId, id: subtaskId });
  }

  function editSubtask(taskId, subtaskId) {
    const task = getTask(taskId); const sub = task?.subtasks.find(s => s.id === subtaskId); if (!sub) return;
    const row = document.querySelector(`[data-parent-task-id="${CSS.escape(taskId)}"][data-subtask-id="${CSS.escape(subtaskId)}"]`);
    const title = row?.querySelector('.subtask-title'); if (!title) return;
    const input = document.createElement('input');
    input.className = 'input'; input.style.minHeight = '34px'; input.value = sub.title;
    title.replaceWith(input); input.focus(); input.select();
    const finish = save => {
      if (save && input.value.trim() && taskRecurrence(task)) {requestTaskEdit(taskId,{subtasks:task.subtasks.map(s=>s.id===subtaskId?{...s,title:input.value.trim()}:s)});return;}
      if (save && input.value.trim()) { sub.title = input.value.trim(); task.updatedAt = nowIso(); saveState(); }
      renderModal(); render();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true), { once: true });
  }

  function addDetailSubtask(taskId, value) {
    const title = String(value || '').trim(); if (!title) return;
    const task = getTask(taskId); if (!task) return;
    const orders = task.subtasks.map(s => s.order).filter(Number.isFinite);
    if(taskRecurrence(task)){requestTaskEdit(taskId,{subtasks:[...task.subtasks,{id:uid('sub'),title,isCompleted:false,order:orders.length?Math.max(...orders)+1:0}]});return;}
    task.subtasks.push({ id: uid('sub'), title, isCompleted: false, order: orders.length ? Math.max(...orders) + 1 : 0 });
    task.updatedAt = nowIso(); saveState(); renderModal(); render();
    requestAnimationFrame(() => $('#detail-subtask')?.focus());
  }

  function flushTaskDraft(after=null) {
    if (modalState?.type !== 'task') return;
    const task = getTask(modalState.taskId); if (!task) return;
    const changes=taskDraftChanges(task);if(!Object.keys(changes).length)return false;
    if(!taskRecurrence(task)){Object.assign(task,changes,{updatedAt:nowIso()});saveState();return false;}
    return requestTaskEdit(task.id,changes,after);
  }

  async function exportBackupAction() {
    if (!Backup || !Attachments) { setToastMessage('Backup is unavailable in this browser'); return; }
    setToastMessage('Preparing backup...');
    try {
      const blob = await Backup.exportBackupV3(state, TodoStorage, nowIso());
      downloadBackup(blob);
      setToastMessage('Backup exported');
    } catch (error) { console.error(error); setToastMessage('Backup could not be created'); }
  }

  function chooseImportBackup() {
    const input = $('#backup-import-input'); if (input) input.click();
  }

  async function inspectImportBackup(file) {
    if (file) await beginGlobalOperation('restore', file);
  }

  async function restoreImportedBackup() {
    if (globalOperation?.reason === 'restore') await commitGlobalOperation(globalOperation);
  }

  function clearCompleted() {
    requestDeleteEntity('clear-completed', null);
  }

  function resetApp() {
    return beginGlobalOperation('reset');
  }

  function downloadBackup(blob) {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `todo-backup-${Core.dateOnly()}.zip`;
    try { document.body.appendChild(anchor); anchor.click(); }
    finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }

  function compactState(value) {
    const copy = { ...value }; delete copy.habitLogCache; delete copy.habitMetrics;
    return JSON.stringify(copy);
  }

  function assertGlobalSource(op) {
    if (globalOperation !== op || state !== op.source || compactState(state) !== op.stateText || localStorage.getItem(STORAGE_KEY) !== op.raw)
      throw new Error('Source changed. Cancel and retry with a fresh safety backup.');
  }

  function globalNotice(message, retry) {
    globalRecoveryNotice = { message, retry }; renderToast();
  }

  async function cleanupGlobalSnapshot(op) {
    if (op.snapshotId) await TodoStorage.recoverySnapshots.deleteMany([op.snapshotId]);
  }

  async function markGlobalSnapshot(op, phase, details = {}) {
    const snapshot = await TodoStorage.recoverySnapshots.get(op.snapshotId);
    if (!snapshot) throw new Error('Recovery copy is missing.');
    await TodoStorage.recoverySnapshots.put({ ...snapshot, ...details, phase });
  }

  async function abandonGlobalOperation(op, message = 'Operation canceled. Existing data was kept.') {
    if (op.busy) return;
    op.busy = true;
    const returnFocus = modalReturnFocus;
    modalState = null; renderModal();
    let cleanupError = null;
    try { if (op.token) await deleteLifecycle.resume(op.token); }
    catch (error) {
      op.busy = false;
      globalNotice(`${message} Normal Undo could not resume: ${error.message}. Retry recovery after resolving the changed source.`, () => abandonGlobalOperation(op, message));
      return;
    }
    try { await cleanupGlobalSnapshot(op); } catch (error) { cleanupError = error; }
    globalOperation = null;
    if (returnFocus?.isConnected) returnFocus.focus();
    if (cleanupError) globalNotice(`${message} Temporary backup cleanup failed: ${cleanupError.message}. Retry cleanup.`, async () => {
      await cleanupGlobalSnapshot(op); globalRecoveryNotice = null; renderToast();
    });
    else setToastMessage(message);
  }

  async function beginGlobalOperation(reason, file = null) {
    if (globalOperation) return;
    await (startupPromise || Promise.resolve());
    if (!state || recovery) { globalNotice('Safety backup cannot represent this unreadable saved data. Nothing was changed. Use Retry after repairing or recovering the original local data.', () => startReady()); return; }
    flushTextSave();
    const op = { reason, source: state, busy: false };
    globalOperation = op;
    try {
      op.token = await deleteLifecycle.hold();
      op.raw = localStorage.getItem(STORAGE_KEY); op.stateText = compactState(state);
      op.payload = await TodoStorage.captureUserData(); assertGlobalSource(op);
      const frozenStorage = { attachments: { getMany: async ids => op.payload.attachments.filter(record => ids.includes(record.id)) },
        habitLogs: { listAll: async () => op.payload.habitLogs }, goalHistory: { listAll: async () => op.payload.goalHistory } };
      const blob = await Backup.exportBackupV3(JSON.parse(op.stateText), frozenStorage, nowIso());
      assertGlobalSource(op);
      if (!(await TodoStorage.sameUserData(await TodoStorage.captureUserData(), op.payload))) throw new Error('Stored data changed during export. Retry.');
      assertGlobalSource(op); downloadBackup(blob);
      op.snapshotId = await TodoStorage.createRecoverySnapshot(reason, state, TodoStorage);
      const snapshot = await TodoStorage.recoverySnapshots.get(op.snapshotId);
      assertGlobalSource(op);
      if (snapshot.rawAppData !== op.raw || !(await TodoStorage.sameUserData(snapshot, op.payload))) throw new Error('Source changed during snapshot. Retry.');
      op.validated = reason === 'restore' ? structuredClone(await Backup.inspectBackupV3(file))
        : { state: createEmptyState(), attachmentRecords: [], habitLogs: [], goalHistory: [] };
      op.validated.state = JSON.parse(compactState(normalizeState(op.validated.state)));
      assertGlobalSource(op);
      const summary = reason === 'restore' ? ` ${op.validated.state.tasks.length} tasks, ${op.validated.state.projects.length} projects, ${op.validated.state.goals.length} Goals, ${op.validated.state.habits.length} Habits, ${op.validated.attachmentRecords.length} files, ${op.validated.habitLogs.length} logs and ${op.validated.goalHistory.length} history events will be restored.` : '';
      openConfirm({ title: reason === 'reset' ? 'Reset all app data?' : 'Restore backup?', message: 'A safety ZIP was downloaded and an internal recovery copy was created.' + summary,
        phrase: reason.toUpperCase(), confirmLabel: reason === 'reset' ? 'Reset app' : 'Restore backup',
        onConfirm: () => commitGlobalOperation(op), onCancel: () => abandonGlobalOperation(op) });
    } catch (error) { await abandonGlobalOperation(op, `Safety preparation failed: ${error.message}. Nothing was replaced. Retry the operation.`); }
  }

  async function verifyGlobalReplacement(op) {
    const next = op.validated;
    if (localStorage.getItem(STORAGE_KEY) !== JSON.stringify(next.state)
      || !Core.validateStateV3(next.state).ok
      || !(await TodoStorage.sameUserData(await TodoStorage.captureUserData(), { attachments: next.attachmentRecords, habitLogs: next.habitLogs, goalHistory: next.goalHistory }))
      || localStorage.getItem(STORAGE_KEY) !== JSON.stringify(next.state) || globalOperation !== op
      || state !== op.source || compactState(state) !== op.stateText)
      throw new Error('Replacement verification failed.');
  }

  async function rollbackGlobalOperation(op, cause) {
    if (op.recovering) return;
    op.recovering = true;
    try {
      const source = state, sourceText = compactState(state);
      const restored = await TodoStorage.restoreRecoverySnapshot(op.snapshotId);
      // Keep both editing and ordinary Undo held until the verified rollback has
      // a durable safe classification. A denied phase write must stay retryable.
      await markGlobalSnapshot(op, 'rolled-back');
      const verified = await TodoStorage.verifyRecoverySnapshot(op.snapshotId);
      if (globalOperation !== op || state !== source || compactState(state) !== sourceText) throw new Error('Recovery source changed during verification. Retry recovery.');
      state = normalizeState(restored); recovery = null;
      const resumedSource = state, resumedText = compactState(state);
      if (op.token) await deleteLifecycle.resume(op.token);
      // Resume also awaits Blob reads and already-due finalizers. Those may
      // legitimately remove expired files, but cannot change metadata ownership.
      if (localStorage.getItem(STORAGE_KEY) !== verified.rawAppData || globalOperation !== op
        || state !== resumedSource || compactState(state) !== resumedText)
        throw new Error('Recovery ownership changed during final Undo resume. Resolve the source and retry recovery.');
      globalRecoveryNotice = null;
      globalOperation = null; modalState = null; renderModal(); render();
      try { await cleanupGlobalSnapshot(op); setToastMessage(`${cause.message}. Original data was restored and verified.`); }
      catch (cleanupError) { globalNotice(`${cause.message}. Original data was restored. Cleanup failed: ${cleanupError.message}. Retry cleanup.`, async () => { await cleanupGlobalSnapshot(op); globalRecoveryNotice = null; renderToast(); }); }
    } catch (rollbackError) {
      // Resume may already have released its token. Re-hold the remaining work
      // synchronously before any bookkeeping await, keeping its original deadlines.
      if (op.token && !undoHold && op.token.generation === undoGeneration) {
        undoHold = op.token; undoState = null;
        for (const work of undoWork) clearTimeout(work.timer);
      }
      op.busy = false; modalState = null; renderModal();
      try { await markGlobalSnapshot(op, 'rollback-failed', { operationError: cause.message, rollbackError: rollbackError.message }); }
      catch (_) { /* The original full recovery payload remains; mutating phase is already durable. */ }
      globalNotice(`Operation failed: ${cause.message}. Recovery also failed: ${rollbackError.message}. The recovery snapshot is retained. Retry recovery.`, () => rollbackGlobalOperation(op, cause));
    } finally { op.recovering = false; }
  }

  async function commitGlobalOperation(op) {
    if (globalOperation !== op || op.busy) return;
    if ($('#global-confirm-phrase')?.value !== op.reason.toUpperCase()) { setToastMessage(`Type ${op.reason.toUpperCase()} exactly to continue.`); return; }
    op.busy = true;
    let mutationStarted = false;
    try {
      assertGlobalSource(op);
      if (!(await TodoStorage.sameUserData(await TodoStorage.captureUserData(), op.payload))) throw new Error('Stored data changed during confirmation. Retry.');
      assertGlobalSource(op);
      await markGlobalSnapshot(op, 'mutating', { destination: { rawAppData: JSON.stringify(op.validated.state),
        attachments: op.validated.attachmentRecords, habitLogs: op.validated.habitLogs, goalHistory: op.validated.goalHistory } });
      assertGlobalSource(op);
      const guard = () => assertGlobalSource(op);
      guard.onCommit = () => { mutationStarted = true; };
      await TodoStorage.replaceAllValidatedBackup(op.validated, op.payload, guard);
      mutationStarted = true;
      await verifyGlobalReplacement(op);
      // Successful verification is the commit boundary. Housekeeping may fail
      // afterward without rolling the verified new domain back.
      let phaseError = null;
      try { await markGlobalSnapshot(op, 'committed'); } catch (error) { phaseError = error; }
      await verifyGlobalReplacement(op);
      deleteLifecycle.retire(op.token);
      state = normalizeState(op.validated.state); recovery = null; modalState = null;
      globalOperation = phaseError ? op : null; renderModal(); location.hash = '#today'; render();
      try { if (phaseError) throw phaseError; await cleanupGlobalSnapshot(op); setToastMessage(op.reason === 'reset' ? 'App data reset and verified.' : 'Backup restored and verified.'); }
      catch (error) { globalNotice(`New data is verified. Recovery copy cleanup failed: ${error.message}. Retry cleanup.`, async () => { await markGlobalSnapshot(op, 'committed'); await cleanupGlobalSnapshot(op); if (globalOperation === op) globalOperation = null; globalRecoveryNotice = null; renderToast(); }); }
      refreshHabitMetrics().then(render).catch(error => setToastMessage(`History display could not refresh: ${error.message}. Reload to retry.`));
    } catch (error) {
      op.busy = false;
      if (mutationStarted) await rollbackGlobalOperation(op, error);
      else await abandonGlobalOperation(op, `Operation stopped: ${error.message}. Nothing was replaced.`);
    }
  }

  async function enableBrowserNotifications() {
    if (typeof Notification === 'undefined') { setToastMessage('Browser notifications are unavailable'); return; }
    if (Notification.permission === 'granted') { setToastMessage('Browser notifications are already enabled'); return; }
    if (Notification.permission === 'denied') { setToastMessage('Browser notifications are blocked in browser settings'); return; }
    try {
      const permission = await Notification.requestPermission();
      setToastMessage(permission === 'granted' ? 'Browser notifications enabled' : 'Notification permission was not granted');
      render();
    } catch (_) {
      setToastMessage('Browser notifications could not be enabled');
    }
  }

  function checkReminders() {
    if (!state || globalOperation) return;
    const now = nowIso();
    const dueTasks = state.tasks.filter(task => Core.isReminderDue(task, now));
    const dueGoals = state.goals.flatMap(goal => Core.goalReminderDueMoments(goal, now).map(moment => ({ goal, moment })));
    const today = Core.dateOnly(new Date(now));
    const dueHabits = state.habits.flatMap(habit => {
      if (!Core.habitReminderActive(habit, state.habitLogCache?.[habit.id] || [], now, state.settings.weekStartsOn || 'monday')) return [];
      const nowTime = new Date(now).getTime(); const pending = habit.pendingSnoozeAt && new Date(habit.pendingSnoozeAt).getTime();
      // A snooze is a distinct notification, not merely a suppression of the
      // original moment. Lifecycle and weekly-target suppression apply first.
      if (pending && pending <= nowTime) return [{ habit, moment: `snooze:${habit.pendingSnoozeAt}`, snooze: true }];
      if (habit.snoozedUntil && new Date(habit.snoozedUntil).getTime() > nowTime) return [];
      const fired = new Set(habit.reminderFiredMoments || []);
      return (habit.reminders || []).filter(reminder => reminder.enabled && Core.normalizeTime(reminder.time)).map(reminder => ({ habit, moment: Core.combineDateTime(today, reminder.time) })).filter(item => item.moment && !fired.has(item.moment) && new Date(item.moment).getTime() <= new Date(now).getTime());
    });
    if (!dueTasks.length && !dueGoals.length && !dueHabits.length) return;
    for (const task of dueTasks) {
      task.reminderFiredAt = now;
      task.updatedAt = now;
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(task.title, { body: task.dueDate ? `Due ${relativeDateLabel(task.dueDate)}` : 'Task reminder' }); } catch (_) { /* in-app reminder remains */ }
      }
    }
    for (const { goal, moment } of dueGoals) {
      goal.reminderFiredMoments = [...new Set([...(goal.reminderFiredMoments || []), moment])];
      goal.updatedAt = now;
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(goal.title, { body: goal.targetDate ? `Goal target ${relativeDateLabel(goal.targetDate)}` : 'Goal reminder' }); } catch (_) { /* in-app reminder remains */ }
      }
    }
    for (const { habit, moment, snooze } of dueHabits) {
      habit.reminderFiredMoments = [...new Set([...(habit.reminderFiredMoments || []), moment])];
      if (snooze) { habit.pendingSnoozeAt = null; habit.snoozedUntil = null; }
      habit.updatedAt = now;
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(habit.name, { body: 'Habit reminder' }); } catch (_) { /* in-app reminder remains */ }
      }
    }
    saveState();
    const total = dueTasks.length + dueGoals.length + dueHabits.length;
    if (total === 1) setToastMessage(`Reminder: ${dueTasks[0]?.title || dueGoals[0]?.goal.title || dueHabits[0].habit.name}`);
    else setToastMessage(`${total} reminders are due`);
  }

  function setToastMessage(message) {
    clearTimeout(toastMessageTimer);
    toastMessage = message;
    renderToast();
    // Information has its own lifetime; it must never replace/finalize Undo.
    toastMessageTimer = setTimeout(() => {
      toastMessage = null;
      toastMessageTimer = null;
      renderToast();
    }, 3000);
  }

  function showTaskProjectPicker(taskId, anchor) { openProjectPicker(anchor, { type: 'task', taskId }); }
  function showTaskPlanPicker(taskId, anchor) { openPlanPicker(anchor, { type: 'task', taskId }); }
  function showTaskDuePicker(taskId, anchor) { openDuePicker(anchor, { type: 'task', taskId }); }
  function showTaskReminderPicker(taskId, anchor) { openReminderPicker(anchor, { type: 'task', taskId }); }
  function showTaskRepeatPicker(taskId, anchor) { openRepeatPicker(anchor, { type: 'task', taskId }); }

  function handleClick(event) {
    if (event.target.closest('[data-action="retry-global-recovery"]')) {
      Promise.resolve(globalRecoveryNotice?.retry()).catch(error => globalNotice(`Retry failed: ${error.message}. Recovery copy retained. Retry again.`, globalRecoveryNotice.retry)); return;
    }
    if (globalOperation && !event.target.closest('#modal-root [data-action="confirm-action"], #modal-root [data-action="close-modal"]')) return;
    const routeEl = event.target.closest('[data-route]');
    if (routeEl) { event.preventDefault(); navigate(routeEl.dataset.route); return; }

    const areaTab = event.target.closest('[data-tab]');
    if (areaTab) { state.ui.areaTab = areaTab.dataset.tab; saveAndRender(); return; }
    const goalTab = event.target.closest('[data-goal-tab]');
    if (goalTab) { state.ui.goalTab = goalTab.dataset.goalTab; saveAndRender(); return; }
    const habitTab = event.target.closest('[data-habit-tab]');
    if (habitTab) { state.ui.habitTab = habitTab.dataset.habitTab; saveAndRender(); return; }
    const templateTab=event.target.closest('[data-template-type]');
    if(templateTab){state.ui.templateType=templateTab.dataset.templateType;saveAndRender();return;}

    const pop = event.target.closest('[data-pop-action]');
    if (pop) { handlePopoverAction(pop); return; }
    const goalProperty = event.target.closest('[data-goal-property]');
    if (goalProperty) { openGoalProperty(goalProperty); return; }
    const habitProperty = event.target.closest('[data-habit-property]');
    if (habitProperty) { openHabitProperty(habitProperty); return; }

    const el = event.target.closest('[data-action]');
    if (!el) {
      if (popoverEl && !event.target.closest('.popover')) closePopover();
      return;
    }
    const action = el.dataset.action;
    if(action==='recurrence-scope'){applyRecurrenceScope(el.dataset.scope);return;}
    if(action==='from-template')openTemplatePicker();
    else if(action==='new-saved-view')openSavedViewModal();
    else if(action==='edit-saved-view')openSavedViewModal(el.dataset.savedViewId);
    else if(action==='save-saved-view')saveSavedView();
    else if(action==='delete-saved-view')deleteSavedView(el.dataset.savedViewId);
    else if(action==='duplicate-saved-view'){const source=state.savedViews.find(v=>v.id===el.dataset.savedViewId);if(source){const view=copyTemplate(source);view.id=uid('view');view.name+=' copy';view.createdAt=view.updatedAt=nowIso();state.savedViews.push(view);saveAndRender();}}
    else if(action==='pin-saved-view'){const view=state.savedViews.find(v=>v.id===el.dataset.savedViewId);if(view){view.isPinned=!view.isPinned;view.updatedAt=nowIso();saveAndRender();}}
    else if(action==='toggle-sidebar-section'){const key=el.dataset.section;state.ui.sidebarSections[key]=!state.ui.sidebarSections[key];saveAndRender();}
    else if(action==='save-shortcut')saveShortcut(el.dataset.command);
    else if(action==='disable-shortcut'){state.settings.shortcuts[el.dataset.command]=null;shortcutError='';saveAndRender();}
    else if(action==='reset-shortcuts'){state.settings.shortcuts={...SHORTCUT_DEFAULTS};shortcutError='';saveAndRender();}
    else if(action==='more-route'){closePopover();navigate(el.dataset.moreRoute);}
    else if(action==='choose-template')chooseTemplate(el.dataset.templateId);
    else if(action==='template-picker-back'){if(modalState.previous?.type==='goal')closeModal();else{modalState=modalState.previous;renderModal();}}
    else if(action==='new-template')openTemplateModal();
    else if(action==='edit-template')openTemplateModal(el.dataset.templateId);
    else if(action==='save-template')saveTemplate();
    else if(action==='delete-template')deleteTemplate(el.dataset.templateId);
    else if(action==='duplicate-template'){const record=copyTemplate(state.templates.find(t=>t.id===el.dataset.templateId));record.id=uid('template');record.name+=' copy';record.createdAt=record.updatedAt=nowIso();state.templates.push(record);saveAndRender();}
    else if(action==='use-template'){const template=state.templates.find(t=>t.id===el.dataset.templateId);if(template){if(template.type==='task')openQuickAdd();else if(template.type==='project')openProjectModal();else if(template.type==='habit')openHabitModal();else openGoalModal();openTemplatePicker();chooseTemplate(template.id);}}
    else if(action==='template-add-row' || action==='template-remove-row')editTemplateRow(el,action==='template-remove-row');
    else if (action === 'toggle-sidebar') { state.ui.sidebarCollapsed = !state.ui.sidebarCollapsed; saveAndRender(); }
    else if (action === 'calendar-view') { state.ui.calendarView = el.dataset.view === 'month' ? 'month' : 'week'; saveAndRender(); }
    else if (action === 'calendar-prev') navigateCalendar(-1);
    else if (action === 'calendar-next') navigateCalendar(1);
    else if (action === 'calendar-today') { state.ui.calendarDate = Core.dateOnly(); saveAndRender(); }
    else if (action === 'calendar-detail' || action === 'calendar-add') openCalendarDetail(el.dataset.date);
    else if (action === 'calendar-new-task') openQuickAdd({ plannedDate: el.dataset.date });
    else if (action === 'calendar-new-goal') openGoalModal(null, { targetDate: el.dataset.date });
    else if (action === 'calendar-new-habit') openHabitModal(null, { startDate: el.dataset.date });
    else if (action === 'calendar-task-move') openPlanPicker(el, { type: 'task', taskId: el.dataset.taskId });
    else if (action === 'calendar-habit-checkin') calendarHabitAction(el, 'check').catch(console.error);
    else if (action === 'calendar-habit-add') calendarHabitAction(el, 'add').catch(console.error);
    else if (action === 'calendar-habit-edit') openCalendarValue(el.dataset.habitId, el.dataset.date);
    else if (action === 'calendar-save-habit-value') {
      const date = el.dataset.date;
      setHabitLog(el.dataset.habitId, date, 'done', Number($('#calendar-habit-value')?.value || 0)).then(saved => { if (saved && modalState?.type === 'calendar-value') openCalendarDetail(date); }).catch(console.error);
    }
    else if (action === 'calendar-goal-progress') openCalendarGoalProgress(el.dataset.goalId);
    else if (action === 'quick-add') openQuickAdd({ projectId: el.dataset.projectId || null, areaId: el.dataset.areaId || null, today: el.dataset.today === 'true', anytime: el.dataset.anytime === 'true' });
    else if (action === 'open-task') openTaskDetail(el.dataset.taskId);
    else if (action === 'toggle-complete') toggleComplete(el.dataset.taskId);
    else if (action === 'open-search') openSearch();
    else if (action === 'new-project') openProjectModal();
    else if (action === 'new-area') openAreaModal();
    else if (action === 'new-goal') openGoalModal();
    else if (action === 'toggle-goal-more') { readGoalDraft(); modalState.draft.moreOpen = !modalState.draft.moreOpen; renderModal(); requestAnimationFrame(() => $('[data-action="toggle-goal-more"]')?.focus()); }
    else if (action === 'draft-goal-links') openGoalLinksModal();
    else if (action === 'draft-goal-reminders') openGoalRemindersModal();
    else if (action === 'draft-goal-milestone') openMilestoneModal(null, el.dataset.milestoneId);
    else if (action === 'delete-draft-goal-milestone') deleteDraftGoalMilestone(el.dataset.milestoneId);
    else if (action === 'edit-goal-source') openGoalSourceModal(el.dataset.goalId);
    else if (action === 'save-goal-source') saveGoalSource();
    else if (action === 'save-goal-property') saveGoalProperty();
    else if (action === 'cancel-goal-property') cancelGoalProperty();
    else if (action === 'goal-status-menu') openGoalStatusMenu(el, el.dataset.goalId);
    else if (action === 'edit-habit-settings') openHabitSettings(el);
    else if (action === 'save-habit-settings') saveHabitSettings();
    else if (action === 'save-habit-property') saveHabitProperty();
    else if (action === 'cancel-habit-property') cancelHabitProperty();
    else if (action === 'new-habit') openHabitModal();
    else if (action === 'edit-habit') openHabitModal(el.dataset.habitId);
    else if (action === 'habit-menu') openHabitMenu(el, el.dataset.habitId);
    else if (action === 'save-habit') saveHabitModal();
    else if (action === 'toggle-habit-more') { readHabitDraft(); modalState.draft.moreOpen = !modalState.draft.moreOpen; renderModal(); requestAnimationFrame(() => $('[data-action="toggle-habit-more"]')?.focus()); }
    else if (action === 'habit-checkin') { const habit = getHabit(el.dataset.habitId); const existing = state.habitLogCache?.[habit?.id]?.find(log => log.date === Core.dateOnly()); setHabitLog(el.dataset.habitId, Core.dateOnly(), existing?.status === 'done' ? 'missed' : 'done'); }
    else if (action === 'habit-skip') setHabitLog(el.dataset.habitId, Core.dateOnly(), 'skipped');
    else if (action === 'habit-quick-add') { const habit = getHabit(el.dataset.habitId); const existing = state.habitLogCache?.[habit?.id]?.find(log => log.date === Core.dateOnly()); setHabitLog(el.dataset.habitId, Core.dateOnly(), 'done', Number(existing?.value || 0) + Number(el.dataset.value || 0)); }
    else if (action === 'save-habit-total') setHabitLog(el.dataset.habitId, Core.dateOnly(), 'done', Number($('#habit-direct-total')?.value || 0));
    else if (action === 'save-habit-history') { const habit = getHabit(el.dataset.habitId); const date = el.dataset.habitDate; const value = habit?.trackingType === 'numeric' ? Number($(`[data-habit-history-value][data-habit-date="${CSS.escape(date)}"]`)?.value || 0) : null; const status = habit?.trackingType === 'numeric' ? 'done' : $(`[data-habit-history-status][data-habit-date="${CSS.escape(date)}"]`)?.value || 'missed'; setHabitLog(el.dataset.habitId, date, status, value); }
    else if (action === 'save-habit-history-date') { const habit = getHabit(el.dataset.habitId); const date = $('#habit-history-date')?.value; const value = habit?.trackingType === 'numeric' ? Number($('#habit-history-new-value')?.value || 0) : null; const status = habit?.trackingType === 'numeric' ? 'done' : $('#habit-history-new-status')?.value || 'missed'; setHabitLog(el.dataset.habitId, date, status, value); }
    else if (action === 'continue-habit') { const habit = getHabit(el.dataset.habitId || modalState?.habitId); if (habit) { const boundary = el.dataset.boundary || modalState?.boundary; const prior = habitMetrics(habit).periods?.filter(period => !period.isCurrent).at(-1); habit.lastContinuationPeriod = prior?.key || Core.habitPeriodKey(habit, Core.dateOnly(), state.settings.weekStartsOn || 'monday'); if (boundary === 'onePeriod') habit.continuation = 'automatic'; if (boundary === 'end') { habit.endType = 'never'; habit.endDate = null; habit.successfulPeriodsTarget = null; } habit.updatedAt = nowIso(); saveState(); } closeModal(); refreshHabitMetrics().then(render); }
    else if (action === 'pause-habit') updateHabitStatus(el.dataset.habitId || modalState?.habitId, 'paused');
    else if (action === 'archive-habit') updateHabitStatus(el.dataset.habitId, 'archived');
    else if (action === 'edit-goal') openGoalModal(el.dataset.goalId);
    else if (action === 'goal-menu') openGoalMenu(el, el.dataset.goalId);
    else if (action === 'save-goal') saveGoalModal();
    else if (action === 'save-goal-progress') saveGoalProgress(el.dataset.goalId);
    else if (action === 'pause-goal') updateGoalStatus(el.dataset.goalId, 'paused');
    else if (action === 'resume-goal' || action === 'restore-goal') updateGoalStatus(el.dataset.goalId, 'active');
    else if (action === 'complete-goal') updateGoalStatus(el.dataset.goalId, 'completed');
    else if (action === 'archive-goal') updateGoalStatus(el.dataset.goalId, 'archived');
    else if (action === 'keep-goal-active') { closeModal(); render(); }
    else if (action === 'edit-goal-links') openGoalLinksModal(el.dataset.goalId);
    else if (action === 'save-goal-links') saveGoalLinks();
    else if (action === 'new-milestone') openMilestoneModal(el.dataset.goalId);
    else if (action === 'edit-milestone') openMilestoneModal(el.dataset.goalId, el.dataset.milestoneId);
    else if (action === 'save-milestone') saveMilestoneModal();
    else if (action === 'toggle-milestone') toggleMilestone(el.dataset.goalId, el.dataset.milestoneId);
    else if (action === 'delete-milestone') deleteMilestone(el.dataset.goalId, el.dataset.milestoneId);
    else if (action === 'edit-goal-reminders') openGoalRemindersModal(el.dataset.goalId);
    else if (action === 'save-goal-reminders') saveGoalReminders();
    else if (action === 'area-menu') openAreaMenu(el, el.dataset.areaId);
    else if (action === 'area-new-task') openQuickAdd({ areaId: el.dataset.areaId, anytime: true });
    else if (action === 'area-new-project') openProjectModal(null, { areaId: el.dataset.areaId });
    else if (action === 'area-new-goal') openGoalModal(null, { areaId: el.dataset.areaId });
    else if (action === 'area-new-habit') openAreaLinkedModal('habit', el.dataset.areaId);
    else if (action === 'new-knowledge') openKnowledgeModal(el.dataset.ownerType, null, el.dataset.areaId);
    else if (action === 'edit-knowledge') openKnowledgeModal(el.dataset.ownerType, el.dataset.ownerId);
    else if (action === 'save-knowledge') saveKnowledge();
    else if (action === 'add-knowledge-link') addKnowledgeLink();
    else if (action === 'remove-knowledge-link') { readKnowledgeDraft(); modalState.draft.linkUrls.splice(Number(el.dataset.linkIndex), 1); modalState.error = ''; renderModal(); }
    else if (action === 'delete-knowledge') requestDeleteEntity(el.dataset.ownerType, el.dataset.ownerId);
    else if (action === 'select-area-color') { modalState.draft.color = el.dataset.color; renderModal(); }
    else if (action === 'select-area-icon') { modalState.draft.icon = el.dataset.icon; renderModal(); }
    else if (action === 'save-area') saveAreaModal();
    else if (action === 'save-area-linked') saveAreaLinkedModal();
    else if (action === 'area-tab') { state.ui.areaTab = el.dataset.tab; saveAndRender(); }
    else if (action === 'new-tag') openTagModal();
    else if (action === 'select-tag') { state.ui.selectedTagId = el.dataset.tagId; saveAndRender(); }
    else if (action === 'tag-menu') openTagMenu(el, el.dataset.tagId);
    else if (action === 'more-menu') openMoreMenu(el);
    else if (action === 'project-menu') openProjectMenu(el, el.dataset.projectId);
    else if (action === 'task-menu') openTaskMenu(el, el.dataset.taskId);
    else if (action === 'attachment-menu') openAttachmentMenu(el, el.dataset.attachmentId);
    else if (action === 'toggle-suggestions') { state.ui.suggestionsExpanded = !state.ui.suggestionsExpanded; saveAndRender(); }
    else if (action === 'toggle-today-completed') { state.ui.todayCompletedExpanded = !state.ui.todayCompletedExpanded; saveAndRender(); }
    else if (action === 'toggle-project-completed') { const id = el.dataset.projectId; state.ui.projectCompletedExpanded[id] = !state.ui.projectCompletedExpanded[id]; saveAndRender(); }
    else if (action === 'add-all-suggestions') addAllSuggestions();
    else if (action === 'inbox-today') addTaskToToday(el.dataset.taskId);
    else if (action === 'task-project-picker') showTaskProjectPicker(el.dataset.taskId, el);
    else if (action === 'task-plan-picker') showTaskPlanPicker(el.dataset.taskId, el);
    else if (action === 'task-due-picker') showTaskDuePicker(el.dataset.taskId, el);
    else if (action === 'task-reminder-picker') showTaskReminderPicker(el.dataset.taskId, el);
    else if (action === 'task-repeat-picker') showTaskRepeatPicker(el.dataset.taskId, el);
    else if (action === 'task-tags-picker') openTagPicker(el, { type: 'task', taskId: el.dataset.taskId });
    else if (action === 'task-priority-picker') openPriorityPicker(el, { type: 'task', taskId: el.dataset.taskId });
    else if (action === 'quick-project-picker') openProjectPicker(el, { type: 'quick' });
    else if (action === 'quick-plan-picker') openPlanPicker(el, { type: 'quick' });
    else if (action === 'quick-due-picker') openDuePicker(el, { type: 'quick' });
    else if (action === 'quick-reminder-picker') openReminderPicker(el, { type: 'quick' });
    else if (action === 'quick-repeat-picker') openRepeatPicker(el, { type: 'quick' });
    else if (action === 'quick-tags-picker') openTagPicker(el, { type: 'quick' });
    else if (action === 'quick-priority-picker') openPriorityPicker(el, { type: 'quick' });
    else if (action === 'toggle-quick-more') { syncQuickDraftFromDom(); modalState.draft.moreOpen = !modalState.draft.moreOpen; renderModal(); requestAnimationFrame(()=>$('#quick-title')?.focus()); }
    else if (action === 'create-task') createTask(false);
    else if (action === 'close-modal') closeModal();
    else if (action === 'modal-backdrop' && event.target === el) closeModal();
    else if (action === 'quick-toggle-subtask') { const s = modalState.draft.subtasks.find(x => x.id === el.dataset.subtaskId); if (s) { syncQuickDraftFromDom(); s.isCompleted = !s.isCompleted; renderModal(); } }
    else if (action === 'quick-delete-subtask') { syncQuickDraftFromDom(); modalState.draft.subtasks = modalState.draft.subtasks.filter(x => x.id !== el.dataset.subtaskId); renderModal(); }
    else if (action === 'toggle-subtask') toggleSubtask(el.dataset.taskId, el.dataset.subtaskId);
    else if (action === 'delete-subtask') deleteSubtask(el.dataset.taskId, el.dataset.subtaskId);
    else if (action === 'edit-subtask') editSubtask(el.dataset.taskId, el.dataset.subtaskId);
    else if (action === 'delete-task') deleteTask(el.dataset.taskId);
    else if (action === 'duplicate-without-files') duplicateTask(el.dataset.taskId, false);
    else if (action === 'duplicate-with-files') duplicateTask(el.dataset.taskId, true);
    else if (action === 'select-project-color') { modalState.draft.color = el.dataset.color; renderModal(); }
    else if (action === 'select-tag-color') { modalState.draft.color = el.dataset.color; renderModal(); }
    else if (action === 'save-tag') saveTagModal();
    else if (action === 'save-project') saveProjectModal();
    else if (action === 'restore-project') restoreProject(el.dataset.projectId);
    else if (action === 'confirm-action') { const fn = modalState.onConfirm; if (typeof fn === 'function') fn(); }
    else if (action === 'undo') doUndo();
    else if (action === 'retry-delete-recovery') retryFailedDeleteRecovery();
    else if (action === 'enable-notifications') enableBrowserNotifications();
    else if (action === 'export-backup') exportBackupAction();
    else if (action === 'import-backup') chooseImportBackup();
    else if (action === 'restore-backup') restoreImportedBackup();
    else if (action === 'clear-completed') clearCompleted();
    else if (action === 'reset-app') resetApp();
    else if (action === 'retry-load') { startReady(); }
    else if (action === 'recovery-reset') resetApp();
  }

  function handlePopoverAction(button) {
    const action = button.dataset.popAction;
    if(action==='save-template') {
      const type=button.dataset.templateSourceType,id=button.dataset.templateSourceId;
      const source=type==='task'?getTask(id):type==='project'?getProject(id):type==='habit'?getHabit(id):getGoal(id);
      if(source)openTemplateModal(null,type,Core.templateFromEntity(type,source,state,Core.dateOnly()));
    }
    else if (action === 'set-project') setProject(button.dataset.targetType, button.dataset.taskId, button.dataset.projectId);
    else if (action === 'toggle-tag') toggleTag(button.dataset.targetType, button.dataset.taskId, button.dataset.tagId);
    else if (action === 'set-priority') setPriority(button.dataset.targetType, button.dataset.taskId, button.dataset.priority);
    else if (action === 'set-plan') setPlan(button.dataset.targetType, button.dataset.taskId, button.dataset.date);
    else if (action === 'set-due') setDue(button.dataset.targetType, button.dataset.taskId, button.dataset.date);
    else if (action === 'set-reminder') setReminder(button.dataset.targetType, button.dataset.taskId, button.dataset.reminder);
    else if (action === 'set-repeat') setRecurrence(button.dataset.targetType, button.dataset.taskId, button.dataset.frequency ? { frequency: button.dataset.frequency, interval: Number(button.dataset.interval) || 1 } : null);
    else if (action === 'show-custom-reminder') showCustomReminder(button);
    else if (action === 'show-custom-repeat') showCustomRepeat(button);
    else if (action === 'custom-reminder-cancel' || action === 'custom-repeat-cancel') closePopover();
    else if (action === 'custom-reminder-apply') { const value = fromLocalDateTimeValue($('#custom-reminder-input', popoverEl)?.value); if (value) setReminder(button.dataset.targetType, button.dataset.taskId, value); }
    else if (['pause-recurrence','resume-recurrence','skip-recurrence','end-recurrence'].includes(action)) manageRecurrence(button.dataset.taskId,action);
    else if (action === 'custom-repeat-apply') {
      const interval=Number($('#repeat-interval',popoverEl)?.value),frequency=$('#repeat-frequency',popoverEl)?.value || 'weekly',endType=$('#repeat-end-type',popoverEl)?.value || 'never',endDate=$('#repeat-end-date',popoverEl)?.value || null,endAfterOccurrences=Number($('#repeat-end-count',popoverEl)?.value) || null;
      if(!Number.isInteger(interval) || interval<1 || endType==='afterOccurrences' && (!Number.isInteger(endAfterOccurrences) || endAfterOccurrences<1) || endType==='date' && !endDate){const error=$('#repeat-error',popoverEl);error.hidden=false;error.textContent='Provide a positive whole-number interval/count and a valid end date.';return;}
      setRecurrence(button.dataset.targetType,button.dataset.taskId,{frequency,interval,endType,endDate,endAfterOccurrences});
    }
    else if (action === 'show-custom-date') showCustomDate(button);
    else if (action === 'custom-date-cancel') closePopover();
    else if (action === 'custom-date-apply') { const value = $('#custom-date-input', popoverEl)?.value; if (!value) return; if (button.dataset.dateKind === 'plan') setPlan(button.dataset.targetType, button.dataset.taskId, value); else setDue(button.dataset.targetType, button.dataset.taskId, value); }
    else if (action === 'inline-new-tag') inlineNewTag(button);
    else if (action === 'inline-select-tag-color') { $$('.color-swatch', popoverEl).forEach(s => s.classList.toggle('is-selected', s === button)); const create = $('[data-pop-action="inline-tag-create"]', popoverEl); if (create) create.dataset.color = button.dataset.color; }
    else if (action === 'inline-tag-cancel') closePopover();
    else if (action === 'inline-tag-create') { const name = Core.normalizeTagName($('#inline-tag-name',popoverEl)?.value); const valid=Core.validateTagName(state.tags||[],name); if(!valid.ok){const er=$('#inline-tag-error',popoverEl); if(er){er.hidden=false;er.textContent=valid.reason==='duplicate-tag'?'A tag with this name already exists.':'Tag needs a name.';} return;} const tag={id:uid('tag'),name,color:button.dataset.color||PROJECT_COLORS[0],createdAt:nowIso(),updatedAt:nowIso()}; state.tags.push(tag); saveState(); toggleTag(button.dataset.targetType, button.dataset.taskId, tag.id); render(); }
    else if (action === 'inline-new-project') inlineNewProject(button);
    else if (action === 'inline-select-color') { $$('.color-swatch', popoverEl).forEach(s => s.classList.toggle('is-selected', s === button)); const create = $('[data-pop-action="inline-project-create"]', popoverEl); if (create) create.dataset.color = button.dataset.color; }
    else if (action === 'inline-project-cancel') closePopover();
    else if (action === 'inline-project-create') {
      const name = String($('#inline-project-name', popoverEl)?.value || '').trim();
      if (!name) { const er = $('#inline-project-error', popoverEl); if (er) er.hidden = false; return; }
      const project = { id: uid('project'), name, color: button.dataset.color || nextProjectColor(), areaId: null, goalIds: [], order: nextProjectOrder(), isArchived: false, archivedAt: null, createdAt: nowIso(), updatedAt: nowIso() };
      state.projects.push(project); saveState();
      setProject(button.dataset.targetType, button.dataset.taskId, project.id);
      render();
    }
    else if (action === 'task-add-today') { closePopover(); addTaskToToday(button.dataset.taskId); }
    else if (action === 'task-move-tomorrow') { closePopover(); moveTaskToTomorrow(button.dataset.taskId); }
    else if (action === 'task-open-plan') { const taskId=button.dataset.taskId; closePopover(); const anchor=document.querySelector(`[data-action="task-menu"][data-task-id="${CSS.escape(taskId)}"]`) || button; openPlanPicker(anchor,{type:'task',taskId}); }
    else if (action === 'task-duplicate') startDuplicate(button.dataset.taskId);
    else if (action === 'attachment-open') openAttachment(button.dataset.attachmentId, false);
    else if (action === 'attachment-download') openAttachment(button.dataset.attachmentId, true);
    else if (action === 'attachment-delete') deleteAttachment(button.dataset.attachmentId);
    else if (action === 'task-open-project') { const taskId = button.dataset.taskId; closePopover(); const anchor = document.querySelector(`[data-action="task-menu"][data-task-id="${CSS.escape(taskId)}"]`) || button; openProjectPicker(anchor, { type: 'task', taskId }); }
    else if (action === 'task-open-due') { const taskId = button.dataset.taskId; closePopover(); const anchor = document.querySelector(`[data-action="task-menu"][data-task-id="${CSS.escape(taskId)}"]`) || button; openDuePicker(anchor, { type: 'task', taskId }); }
    else if (action === 'task-delete') { const id = button.dataset.taskId; closePopover(); deleteTask(id); }
    else if (action === 'edit-tag') { const id = button.dataset.tagId; closePopover(); openTagModal(id); }
    else if (action === 'delete-tag') deleteTag(button.dataset.tagId);
    else if (action === 'edit-project') { const id = button.dataset.projectId; closePopover(); openProjectModal(id); }
    else if (action === 'archive-project') archiveProject(button.dataset.projectId);
    else if (action === 'restore-project') restoreProject(button.dataset.projectId);
    else if (action === 'delete-project') { const id = button.dataset.projectId; closePopover(); deleteProject(id); }
    else if (action === 'edit-area') { const id = button.dataset.areaId; closePopover(); openAreaModal(id); }
    else if (action === 'archive-area') archiveArea(button.dataset.areaId);
    else if (action === 'restore-area') restoreArea(button.dataset.areaId);
    else if (action === 'pin-area' || action === 'unpin-area') toggleAreaPin(button.dataset.areaId);
    else if (action === 'delete-area') { const id = button.dataset.areaId; closePopover(); deleteArea(id); }
    else if (action === 'edit-goal') { const id = button.dataset.goalId; closePopover(); openGoalModal(id); }
    else if (action === 'pause-goal') updateGoalStatus(button.dataset.goalId, 'paused');
    else if (action === 'resume-goal' || action === 'restore-goal') updateGoalStatus(button.dataset.goalId, 'active');
    else if (action === 'complete-goal') updateGoalStatus(button.dataset.goalId, 'completed');
    else if (action === 'archive-goal') updateGoalStatus(button.dataset.goalId, 'archived');
    else if (action === 'delete-goal') { const id = button.dataset.goalId; closePopover(); deleteGoal(id); }
    else if (action === 'edit-habit') { const id = button.dataset.habitId; closePopover(); openHabitModal(id); }
    else if (action === 'pause-habit') updateHabitStatus(button.dataset.habitId, 'paused');
    else if (action === 'resume-habit' || action === 'restore-habit') updateHabitStatus(button.dataset.habitId, 'active');
    else if (action === 'archive-habit') updateHabitStatus(button.dataset.habitId, 'archived');
    else if (action === 'delete-habit') { const id = button.dataset.habitId; closePopover(); deleteHabit(id); }
    else if (action === 'snooze-habit') { snoozeHabit(button.dataset.habitId, button.dataset.snooze); closePopover(); }
  }

  function handleInput(event) {
    if (globalOperation) return;
    if (modalState?.type === 'knowledge' && event.target.id.startsWith('knowledge-')) readKnowledgeDraft();
    if (goalPropertyEditor && event.target.id === 'goal-detail-' + goalPropertyEditor.field) goalPropertyEditor.value = event.target.value;
    if (habitPropertyEditor && event.target.id === 'habit-detail-' + habitPropertyEditor.field) habitPropertyEditor.value = event.target.value;
    if (['goal', 'goal-source'].includes(modalState?.type) && event.target.id.startsWith('goal-')) readGoalDraft();
    if (modalState?.type === 'quick') {
      if (event.target.id === 'quick-title') { modalState.draft.title = event.target.value; modalState.error = ''; if (!modalState.draft.explicitPlan) { const parsed=Core.parseQuickPlanPhrase(event.target.value, Core.dateOnly()); modalState.draft.parsedPlanDate=parsed.plannedDate; const b=document.querySelector('[data-action="quick-plan-picker"]'); if(b) b.innerHTML=`<i class="ph ph-calendar-check"></i>${parsed.plannedDate ? esc(relativeDateLabel(parsed.plannedDate)) : 'Plan for'}`; } }
      else if (event.target.id === 'quick-notes') modalState.draft.notes = event.target.value;
    }
    if (modalState?.type === 'task') {
      const task = getTask(modalState.taskId);
      if (!task) return;
      if (event.target.id === 'detail-title') { modalState.titleDraft = event.target.value; modalState.error = ''; }
      else if (event.target.id === 'detail-notes') { modalState.notesDraft = event.target.value;if(!taskRecurrence(task)){task.notes=event.target.value;task.updatedAt=nowIso();scheduleTextSave();} }
    }
    if (modalState?.type === 'search' && event.target.id === 'search-query') {
      modalState.query = event.target.value;
      const results = $('#search-results'); if (results) results.innerHTML = searchResultsHtml(modalState.query);
    }
    if (modalState?.type === 'project' && event.target.id === 'project-name') { modalState.draft.name = event.target.value; modalState.error = ''; }
    if (modalState?.type === 'tag' && event.target.id === 'tag-name') { modalState.draft.name = event.target.value; modalState.error = ''; }
  }

  function handleChange(event) {
    if (globalOperation) return;
    if (modalState?.type === 'knowledge' && (event.target.id.startsWith('knowledge-') || event.target.dataset.knowledgeRelation)) readKnowledgeDraft();
    if (goalPropertyEditor && event.target.id === 'goal-detail-' + goalPropertyEditor.field) goalPropertyEditor.value = event.target.value;
    if (habitPropertyEditor && event.target.id === 'habit-detail-' + habitPropertyEditor.field) habitPropertyEditor.value = event.target.value;
    if (['goal','goal-source'].includes(modalState?.type) && ['goal-progress-mode','goal-progress-type'].includes(event.target.id)) {
      const id = event.target.id; readGoalDraft(); renderModal(); requestAnimationFrame(() => $('#' + id)?.focus()); return;
    }
    if (modalState?.type === 'saved-view' && event.target.id === 'saved-view-type') {
      readSavedViewDraft();
      const draft = modalState.draft;
      draft.type = event.target.value;
      draft.filters = Object.fromEntries(Object.entries(draft.filters).filter(([key]) => SAVED_FILTER_KEYS[draft.type].includes(key)));
      const statuses = draft.type === 'goals' ? ['active','paused','completed','archived'] : ['active','paused','archived'];
      if (draft.filters.status && !statuses.includes(draft.filters.status)) delete draft.filters.status;
      modalState.error = '';
      renderModal();
      $('#saved-view-type')?.focus();
      return;
    }
    if(modalState?.type==='template' && event.target.dataset.templateField?.endsWith('goalIds')){readTemplateDraft();renderModal();return;}
    if (event.target.matches('[data-calendar-visibility]')) { state.ui.calendarVisibility = { tasks: true, habits: true, goals: true, milestones: true, ...(state.ui.calendarVisibility || {}), [event.target.dataset.calendarVisibility]: event.target.checked }; saveAndRender(); return; }
    if (event.target.matches('[data-task-time]')) { updateTask(event.target.dataset.taskId, { [event.target.dataset.taskTime]: Core.normalizeTime(event.target.value) }, false); render(); return; }
    if (event.target.id === 'attachment-input') { receiveAttachmentFiles(event.target.dataset, [...event.target.files]); event.target.value=''; return; }
    if (event.target.id === 'backup-import-input') { const file=event.target.files?.[0]; event.target.value=''; if(file) inspectImportBackup(file); return; }
    if (event.target.id === 'completed-project-filter') {
      state.ui.completedProjectFilter = event.target.value || '';
      saveAndRender();
    } else if (event.target.id === 'completed-period-filter') {
      state.ui.completedPeriod = Number(event.target.value) || 0;
      saveAndRender();
    } else if (modalState?.type === 'goal-links' && event.target.matches('[data-goal-project-mode]')) {
      const projectId = event.target.dataset.goalProjectMode; readGoalLinkDraft(); renderModal();
      requestAnimationFrame(() => $(`[data-goal-project-mode="${CSS.escape(projectId)}"]`)?.focus());
    }
  }

  function handleBlur(event) {
    if (modalState?.type === 'task' && ['detail-title','detail-notes'].includes(event.target.id)) {
      const task = getTask(modalState.taskId); if (!task) return;
      if(event.target.id==='detail-notes'){if(taskRecurrence(task))requestTaskEdit(task.id,taskDraftChanges(task));return;}
      const title = String(event.target.value || '').trim();
      if (!title) { modalState.error = 'Task needs a title.'; modalState.titleDraft = task.title; renderModal(); return; }
      if(!taskRecurrence(task)){task.title=title;modalState.titleDraft=title;task.updatedAt=nowIso();saveState();render();return;}
      requestTaskEdit(task.id,{title});
    }
  }

  function handleKeydown(event) {
    if (globalOperation && !['Escape','Tab'].includes(event.key)) return;
    const target = event.target;
    const typing = target && (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]') || target.isContentEditable);
    if (goalPropertyEditor && !modalState && !popoverEl && (event.key === 'Escape' || (event.key === 'Enter' && typing && !event.isComposing))) {
      event.preventDefault(); if (event.key === 'Escape') cancelGoalProperty(); else saveGoalProperty(); return;
    }
    if (habitPropertyEditor && !modalState && !popoverEl && (event.key === 'Escape' || (event.key === 'Enter' && typing && !event.isComposing))) {
      event.preventDefault(); if (event.key === 'Escape') cancelHabitProperty(); else saveHabitProperty(); return;
    }
    if (popoverEl?.dataset.popoverType === 'goal-status' && event.key === 'Tab') {
      const controls = [...popoverEl.querySelectorAll('button:not([disabled])')];
      const first = controls[0], last = controls.at(-1);
      if (!popoverEl.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last) || (event.shiftKey && document.activeElement === first)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      return;
    }

    if (modalState && event.key === 'Tab') {
      const modal = $('#modal-root .modal');
      if (modal) {
        const focusable = [...modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent !== null || el === document.activeElement);
        if (focusable.length) {
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (!modal.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); return; }
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); return; }
        }
      }
    }

    if (event.key === 'Escape') {
      if (popoverEl) { event.preventDefault(); closePopover(); return; }
      if (modalState?.type === 'task' && typing) {
        event.preventDefault();
        if (target?.id === 'detail-title') {
          const task = getTask(modalState.taskId);
          if (task) { modalState.titleDraft = task.title; target.value = task.title; modalState.error = ''; }
        }
        target.blur();
        return;
      }
      if (modalState) { event.preventDefault(); closeModal(); return; }
    }

    if (!typing && !modalState && !popoverEl && !event.repeat && !event.isComposing) {
      // Alt/Option can turn a letter into a glyph (for example Y → ¥).
      const physicalKey = /^Key[A-Z]$/.test(event.code || '') ? event.code.slice(3) : /^Digit[0-9]$/.test(event.code || '') ? event.code.slice(5) : event.key;
      const combination=Core.normalizeShortcut([event.ctrlKey || event.metaKey?'Ctrl/Cmd':null,event.altKey?'Alt':null,event.shiftKey?'Shift':null,physicalKey].filter(Boolean).join('+'));
      const command=Object.keys(SHORTCUT_DEFAULTS).find(key=>combination && state.settings.shortcuts[key]===combination);
      if(command){event.preventDefault();if(command==='newTask')openQuickAdd();else if(command==='search')openSearch();else navigate(command);return;}
      // Preserve the existing convenient Search alias, without bypassing suppression.
      if(state.settings.shortcuts.search !== null && event.key==='/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey){event.preventDefault();openSearch();return;}
    }

    if (modalState?.type === 'quick' && target?.id === 'quick-title' && event.key === 'Enter') {
      event.preventDefault(); createTask(event.shiftKey); return;
    }
    if (modalState?.type === 'knowledge' && target?.id === 'knowledge-link' && event.key === 'Enter') { event.preventDefault(); addKnowledgeLink(); return; }

    if (modalState?.type === 'quick' && target?.id === 'quick-subtask' && event.key === 'Enter') {
      event.preventDefault(); syncQuickDraftFromDom(); const title = target.value.trim(); if (!title) { target.blur(); return; }
      modalState.draft.subtasks.push({ id: uid('sub'), title, isCompleted: false, order: modalState.draft.subtasks.length }); renderModal(); requestAnimationFrame(() => $('#quick-subtask')?.focus()); return;
    }

    if (modalState?.type === 'task' && target?.id === 'detail-title' && event.key === 'Enter') { event.preventDefault(); target.blur(); return; }
    if (modalState?.type === 'task' && target?.id === 'detail-subtask' && event.key === 'Enter') { event.preventDefault(); addDetailSubtask(target.dataset.taskId, target.value); return; }
    if (modalState?.type === 'project' && target?.id === 'project-name' && event.key === 'Enter') { event.preventDefault(); saveProjectModal(); return; }
  }

  function handleDblKeyActivation(event) {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.task-main')) {
      event.preventDefault(); openTaskDetail(event.target.dataset.taskId);
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.subtask-title')) {
      event.preventDefault(); editSubtask(event.target.dataset.taskId, event.target.dataset.subtaskId);
    }
  }

  function handleDragStart(event) {
    const calendar = event.target.closest('[data-calendar-drag][draggable="true"]');
    if (calendar) { dragState = { type: `calendar-${calendar.dataset.calendarDrag}`, id: calendar.dataset.calendarItemId }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', dragState.id); calendar.classList.add('is-dragging'); return; }
    const project = event.target.closest('.project-item[draggable="true"]');
    if (project) { dragState = { type: 'project', id: project.dataset.projectId }; event.dataTransfer.effectAllowed = 'move'; return; }
    const sub = event.target.closest('.subtask-row[draggable="true"]');
    if (sub) { dragState = { type: 'subtask', id: sub.dataset.subtaskId, parentId: sub.dataset.parentTaskId }; event.dataTransfer.effectAllowed = 'move'; sub.classList.add('is-dragging'); return; }
    const row = event.target.closest('.task-row[draggable="true"]');
    if (row) { dragState = { type: 'task', id: row.dataset.taskId, context: row.dataset.listContext }; event.dataTransfer.effectAllowed = 'move'; row.classList.add('is-dragging'); document.body.classList.add('task-drag-active'); }
  }

  function handleDragOver(event) {
    const dropZone = event.target.closest?.('.attachment-drop-zone');
    if (dropZone && event.dataTransfer?.types?.includes('Files')) { event.preventDefault(); dropZone.classList.add('is-dragover'); return; }
    if (!dragState) return;
    const calendarTarget = event.target.closest('[data-calendar-date]');
    if (calendarTarget && ['calendar-task', 'calendar-goal'].includes(dragState.type)) { event.preventDefault(); calendarTarget.classList.add('is-drop-target'); return; }
    if (dragState.type.startsWith('calendar-')) return;
    if (dragState.type === 'project') {
      const target = event.target.closest('.project-item[draggable="true"]'); if (!target || target.dataset.projectId === dragState.id) return; event.preventDefault(); return;
    }
    if (dragState.type === 'subtask') {
      const target = event.target.closest('.subtask-row[draggable="true"]'); if (!target || target.dataset.parentTaskId !== dragState.parentId || target.dataset.subtaskId === dragState.id) return; event.preventDefault(); target.classList.add('is-drop-target'); return;
    }
    const contextTarget = event.target.closest('[data-drop-plan], [data-drop-project-id]');
    if (contextTarget) { event.preventDefault(); contextTarget.classList.add('is-drop-target'); return; }
    const target = event.target.closest('.task-row[draggable="true"]');
    if (!target || target.dataset.listContext !== dragState.context || target.dataset.taskId === dragState.id) return;
    event.preventDefault(); target.classList.add('is-drop-target');
  }

  function handleDragLeave(event) {
    const dz=event.target.closest?.('.attachment-drop-zone'); if(dz) dz.classList.remove('is-dragover');
    event.target.closest('.is-drop-target')?.classList.remove('is-drop-target');
  }

  function handleDrop(event) {
    const dropZone = event.target.closest?.('.attachment-drop-zone');
    if (dropZone && event.dataTransfer?.files?.length) { event.preventDefault(); dropZone.classList.remove('is-dragover'); receiveAttachmentFiles(dropZone.dataset, [...event.dataTransfer.files]); return; }
    if (!dragState) return;
    event.preventDefault();
    if (dragState.type.startsWith('calendar-')) {
      const target = event.target.closest('[data-calendar-date]');
      if (target) {
        const date = target.dataset.calendarDate;
        if (Core.parseDateOnly(date) && dragState.type === 'calendar-task') updateTask(dragState.id, { plannedDate: date });
        else if (Core.parseDateOnly(date) && dragState.type === 'calendar-goal') {
          const goal = getGoal(dragState.id);
          if (goal && goal.targetDate !== date) {
            const from = goal.targetDate; goal.targetDate = date; goal.updatedAt = nowIso();
            putGoalHistory(goal.id, 'targetDateChanged', { from, to: date }); saveAndRender();
          }
        }
      }
    } else if (dragState.type === 'project') {
      const target = event.target.closest('.project-item[draggable="true"]'); if (target) reorderProjects(dragState.id, target.dataset.projectId);
    } else if (dragState.type === 'subtask') {
      const target = event.target.closest('.subtask-row[draggable="true"]'); if (target && target.dataset.parentTaskId === dragState.parentId) reorderSubtasks(dragState.parentId, dragState.id, target.dataset.subtaskId);
    } else {
      const contextTarget = event.target.closest('[data-drop-plan], [data-drop-project-id]');
      if (contextTarget) moveTaskByDrop(dragState.id, contextTarget);
      else {
        const target = event.target.closest('.task-row[draggable="true"]'); if (target && target.dataset.listContext === dragState.context) reorderTasks(dragState.context, dragState.id, target.dataset.taskId);
      }
    }
    cleanupDrag();
  }

  function moveTaskByDrop(taskId, target) {
    const task = getTask(taskId); if (!task || !target) return;
    if(taskRecurrence(task)){
      if(target.dataset.dropPlan==='today')requestTaskEdit(taskId,{plannedDate:Core.dateOnly(),isInbox:false,todayOrder:nextOrder('today')});
      else if(target.dataset.dropPlan==='tomorrow')requestTaskEdit(taskId,{plannedDate:Core.addDays(Core.dateOnly(),1),isInbox:false,todayOrder:null});
      else if(target.dataset.dropProjectId && getProject(target.dataset.dropProjectId))requestTaskEdit(taskId,{projectId:target.dataset.dropProjectId,areaId:null,isInbox:false,projectOrder:nextOrder(`project:${target.dataset.dropProjectId}`)});
      return;
    }
    const prev = { plannedDate: task.plannedDate, isInbox: task.isInbox, todayOrder: task.todayOrder, projectId: task.projectId, areaId: task.areaId, projectOrder: task.projectOrder };
    let message = '';
    if (target.dataset.dropPlan === 'today') {
      if (task.plannedDate === Core.dateOnly() && !task.isInbox) return;
      task.plannedDate = Core.dateOnly(); task.isInbox = false; task.todayOrder = nextOrder('today'); message = 'Task moved to Today';
    } else if (target.dataset.dropPlan === 'tomorrow') {
      const tomorrow = Core.addDays(Core.dateOnly(), 1);
      if (task.plannedDate === tomorrow && !task.isInbox) return;
      task.plannedDate = tomorrow; task.isInbox = false; task.todayOrder = null; message = 'Task moved to Tomorrow';
    } else if (target.dataset.dropProjectId) {
      const projectId = target.dataset.dropProjectId;
      if (!getProject(projectId) || (task.projectId === projectId && !task.isInbox)) return;
      task.projectId = projectId; task.areaId = null; task.isInbox = false; task.projectOrder = nextOrder(`project:${projectId}`); message = 'Task moved to project';
    } else return;
    task.updatedAt = nowIso(); saveState(); render();
    setUndo(message, () => { const current = getTask(taskId); if (!current) return; Object.assign(current, prev, { updatedAt: nowIso() }); saveState(); render(); });
  }

  function handleDragEnd() { cleanupDrag(); }
  function cleanupDrag() { $$('.is-dragging, .is-drop-target').forEach(el => el.classList.remove('is-dragging', 'is-drop-target')); document.body.classList.remove('task-drag-active'); dragState = null; }

  function reorderTasks(context, sourceId, targetId) {
    let items;
    let field;
    if (context === 'today') { items = Core.deriveTodaySections(state.tasks, Core.dateOnly()).today; field = 'todayOrder'; }
    else if (context === 'inbox') { items = activeInboxTasks(); field = 'inboxOrder'; }
    else if (context.startsWith('project:')) { const id = context.split(':')[1]; items = projectTasks(id, false); field = 'projectOrder'; }
    else return;
    const ids = items.map(t => t.id); const from = ids.indexOf(sourceId); const to = ids.indexOf(targetId); if (from < 0 || to < 0) return;
    const [moved] = ids.splice(from, 1); ids.splice(to, 0, moved);
    ids.forEach((id, index) => { const t = getTask(id); if (t) t[field] = index; });
    saveAndRender();
  }

  function reorderProjects(sourceId, targetId) {
    const ids = sortedProjects().map(p => p.id); const from = ids.indexOf(sourceId); const to = ids.indexOf(targetId); if (from < 0 || to < 0) return;
    const [moved] = ids.splice(from,1); ids.splice(to,0,moved); ids.forEach((id,i)=>{ const p=getProject(id); if(p)p.order=i; }); saveAndRender();
  }

  function reorderSubtasks(taskId, sourceId, targetId) {
    const task = getTask(taskId); if (!task) return;
    const ordered = [...task.subtasks].sort((a,b)=>clampOrder(a.order)-clampOrder(b.order));
    const ids = ordered.map(s=>s.id); const from=ids.indexOf(sourceId); const to=ids.indexOf(targetId); if(from<0||to<0)return;
    const [moved]=ids.splice(from,1); ids.splice(to,0,moved); ids.forEach((id,i)=>{ const s=task.subtasks.find(x=>x.id===id); if(s)s.order=i; }); task.updatedAt=nowIso(); saveState(); renderModal(); render();
  }

  function attachEvents() {
    document.addEventListener('click', handleClick);
    document.addEventListener('input', handleInput);
    document.addEventListener('change', handleChange);
    document.addEventListener('blur', handleBlur, true);
    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('keydown', handleDblKeyActivation);
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragend', handleDragEnd);
    window.addEventListener('hashchange', () => { closePopover(); closeModal(); render(); });
    window.addEventListener('storage', event => {
      if (globalOperation) return;
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const source = localStorage.getItem(STORAGE_KEY);
        if (Core.migrateStateV3(JSON.parse(event.newValue)).ok) {
          startReady({ raw: event.newValue, source, synthetic: !event.isTrusted });
        }
      } catch (_) { /* keep current tab data for malformed external state */ }
    });
    window.addEventListener('pagehide', () => { if (!globalOperation) { flushTaskDraft(); flushTextSave(); saveState(); } });
    window.addEventListener('resize', closePopover);
    window.addEventListener('focus', checkReminders);
  }

  async function drainReady(resolve, reject) {
    let failure = null;
    try {
      while (startupQueue.length) {
        const loading = loadState(startupQueue.shift());
        render();
        const committedSource = await loading;
        render();
        if (!state) continue;
        try { await refreshHabitMetrics(); await evaluateHabitBoundaries(); } catch (error) { console.error(error); }
        // Hydration yields too: do not let reminders save an obsolete exposed state.
        if (localStorage.getItem(STORAGE_KEY) !== committedSource) {
          state = null;
          recovery = 'migration-loading';
          startupQueue.unshift(undefined);
          continue;
        }
        render();
        checkReminders();
        if (Attachments && !undoHold) {
          const protectedIds = [...state.tasks.flatMap(task => task.attachmentIds || []), ...[...failedDeleteSnapshots].flatMap(snapshot => snapshot.attachments.map(record => record.id)), ...[...undoWork].filter(work => performance.now() < work.deadline)
            .flatMap(work => (work.snapshot?.pendingAttachments || []).map(record => record.id))];
          await Attachments.cleanupExpired(nowIso(), protectedIds).catch(() => setToastMessage('File cleanup failed. Retained files were kept.'));
        }
      }
    } catch (error) { failure = error; }
    // Clear and settle atomically, without a detached then/finally interval losing new work.
    startupPromise = null;
    if (failure) reject(failure);
    else resolve();
  }

  function startReady(incoming) {
    if (startupPromise && incoming === undefined) return startupPromise;
    startupQueue.push(incoming);
    if (startupPromise) return startupPromise;
    let resolve, reject;
    const published = new Promise((done, fail) => { resolve = done; reject = fail; });
    startupPromise = published;
    drainReady(resolve, reject);
    return published;
  }

  async function init() {
    attachEvents();
    await startReady();
    if (!location.hash) location.hash = '#today';
    setInterval(() => {
      if (globalOperation) return;
      const next = Core.dateOnly();
      if (next !== lastToday) {
        lastToday = next;
        refreshHabitDateBoundary().catch(console.error);
      } else checkReminders();
    }, 30000);
  }

  window.TodoApp = { init, get ready() { return startupPromise || Promise.resolve(); }, get state() { return state; }, deleteLifecycle, render, openQuickAdd, openSearch, checkReminders, captureGoalProgress, evaluateGoalProgressChanges, setHabitLog, refreshHabitMetrics, refreshHabitDateBoundary, evaluateHabitBoundaries, snoozeHabit };
  init();
})();
