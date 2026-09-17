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
  let focusTimerInterval = null;
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
  let taskSwipeState = null;
  let suppressTaskSwipeClick = false;
  let modalReturnFocus = null;
  let goalPropertyEditor = null;
  let habitPropertyEditor = null;
  let createdGoalFocusId = null;
  const knowledgeAttachmentCache = new Map();

  function captureModalReturnFocus() {
    const active = document.activeElement;
    modalReturnFocus = active instanceof HTMLElement && active.isConnected ? active : null;
  }

  function restoreModalReturnFocus(target, fallback = null) {
    requestAnimationFrame(() => {
      if (modalState || $('#modal-root .modal') || popoverEl?.isConnected) return;
      (target?.isConnected ? target : fallback?.isConnected ? fallback : null)?.focus();
    });
  }

  function setMobileQuickAddOpen(open) {
    const root = $('#mobile-quick-add');
    const toggle = $('#mobile-quick-add-toggle');
    const menu = $('#mobile-quick-add-menu');
    if (!root || !toggle || !menu) return;
    root.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close quick add menu' : 'Open quick add menu');
    menu.hidden = !open;
  }

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

  function reportStorageFailure(error) {
    console.error(error);
    storageError = true;
    render();
  }

  function saveState() {
    if (!state || globalOperation) return false;
    try {
      const persisted = { ...state };
      delete persisted.habitLogCache;
      delete persisted.habitMetrics;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      return true;
    } catch (error) {
      reportStorageFailure(error);
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

  function domainContext() {
    return {
      // Live accessors preserve source/modal checks across asynchronous attachment work.
      get state() { return state; },
      get modalState() { return modalState; },
      get undoHold() { return undoHold; },
      setModalState(value) { modalState = value; },
      get goalPropertyEditor() { return goalPropertyEditor; },
      set goalPropertyEditor(value) { goalPropertyEditor = value; },
      get habitPropertyEditor() { return habitPropertyEditor; },
      set habitPropertyEditor(value) { habitPropertyEditor = value; },
      get popoverEl() { return popoverEl; },
      getHabit, habitMetrics, habitDraft, openHabitModal, refreshHabitMetrics,
      setHabitLog, updateHabitStatus, snoozeHabit, syncHabitGoalLinks,
      areaDefaults: { color: PROJECT_COLORS[0], icon: AREA_ICONS[0] },
      setCreatedGoalFocusId(value) { createdGoalFocusId = value; },
      Core, getTask, getGoal, getProject, allProjects, sortedProjects, projectTasks, goalProgressLabel, goalStatusLabel, relativeDateLabel, formatReminder, recurrenceLabel, priorityLabel, priorityIcon, tagSummary, clampOrder, emptyState,
      render, restoreGoalFocus, captureGoalProgress, evaluateGoalProgressChanges,
      putGoalHistory, goalDraft, openGoalModal, openPopover, templateMenuEntry, syncGoalLinks,
      maybePromptGoalReached, updateGoalStatus, saveAndRender,
      $, $$, esc, PROJECT_COLORS, AREA_ICONS, knowledgeCollection, getArea, sortedAreas, attachmentOwner,
      pageHeader, modalFrame, renderMain, renderModal, currentRoute,
      knowledgeAttachmentCache, readOwnerAttachments, renderAttachmentRow,
      renderAttachmentsSection, loadOwnerAttachments, addAttachments,
      closePopover, flushTextSave, goalFocusTarget, closeModal,
      openGoalHistory,
      nowIso, uid, copyTemplate, saveState, navigate, setToastMessage, requestDeleteEntity, openConfirm, setUndo,
      calendarDate, calendarLogs, parseLocalDate, formatDate,
      openCalendarDetail, navigateCalendar, openPlanPicker, calendarHabitAction, openCalendarValue, openCalendarGoalProgress,
      templateTypes: TEMPLATE_TYPES, templateLabel, openTemplateEditorFromSource, saveTemplateRecord, duplicateTemplateRecord,
      captureModalReturnFocus,
      renderProjectTaskRow(task, projectId, options = {}) {
        return taskRow(task, options.completed ? 'completed' : `project:${projectId}`, options);
      },
      toggleProjectCompleted(projectId) {
        state.ui.projectCompletedExpanded[projectId] = !state.ui.projectCompletedExpanded[projectId];
        saveAndRender();
      },
      openProjectModal, saveProjectModal, archiveProject, restoreProject, deleteProject,
      openQuickAdd, openGoalModal, openHabitModal,
      renderAreaTaskRow(task, areaId) { return taskRow(task, `area:${areaId}`); },
      renderGoalRow, renderHabitRow,
      renderAreaKnowledge(areaId) { return callDomainHook('renderRoute', { type: 'area-knowledge', id: areaId }) || ''; },
      renderSavedViewItem(view, item, today) {
        return view.type === 'tasks' ? taskRow(item, 'saved-view') : view.type === 'goals' ? renderGoalRow(item) : renderHabitRow(item, item.status === 'active' ? Core.habitStatusForDate(item, state.habitLogCache?.[item.id] || [], today, today) : null);
      },
      saveSavedViewDraft(id, draft) {
        const existing = state.savedViews.find(view => view.id === id);
        const view = { ...draft, name: draft.name.trim(), id: existing?.id || uid('view'), createdAt: existing?.createdAt || nowIso(), updatedAt: nowIso() };
        if (existing) state.savedViews.splice(state.savedViews.indexOf(existing), 1, view); else state.savedViews.push(view);
        saveState(); closeModal(); render();
      },
      duplicateSavedView(id) {
        const source = state.savedViews.find(view => view.id === id);
        if (!source) return;
        const view = copyTemplate(source); view.id = uid('view'); view.name += ' copy'; view.createdAt = view.updatedAt = nowIso(); state.savedViews.push(view); saveAndRender();
      },
      toggleSavedViewPin(id) {
        const view = state.savedViews.find(item => item.id === id);
        if (!view) return;
        view.isPinned = !view.isPinned; view.updatedAt = nowIso(); saveAndRender();
      },
      shortcutLabels: SHORTCUT_LABELS,
      shortcutError: () => shortcutError,
      notificationButtonLabel() {
        return typeof Notification === 'undefined' ? 'Unavailable' : (Notification.permission === 'granted' ? 'Enabled' : Notification.permission === 'denied' ? 'Blocked' : 'Enable');
      },
      saveShortcut,
      disableShortcut,
      resetShortcuts
    };
  }

  function callDomainHook(hook, ...args) {
    for (const adapter of window.TodoDomainModules?.getAdapters() || []) {
      if (typeof adapter[hook] !== 'function') continue;
      const result = adapter[hook](...args, domainContext());
      if (result !== undefined && result !== false) return result;
    }
  }

  function currentRoute() {
    const hash = location.hash.replace(/^#/, '') || 'today';
    if (['today', 'inbox', 'upcoming', 'calendar', 'anytime', 'tags', 'areas', 'notes', 'resources', 'goals', 'habits', 'templates', 'projects', 'cleaning', 'saved-views', 'archived', 'completed', 'settings'].includes(hash)) return { type: hash };
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
          ${link('areas','ph-squares-four','Areas')}${link('notes','ph-note','Notes')}${link('resources','ph-link','Resources')}${link('tags','ph-tag','Tags')}${link('cleaning','ph-broom','Cleaning')}`)}
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
    let content = callDomainHook('renderRoute', route);
    if (content === undefined) {
      if (route.type === 'today') content = renderToday();
      else if (route.type === 'inbox') content = renderInbox();
      else if (route.type === 'upcoming') content = renderUpcoming();
      else if (route.type === 'anytime') content = renderAnytime();
      else if (route.type === 'tags') content = renderTags();
      else if (route.type === 'completed') content = renderCompleted();
      else content = renderToday();
    }
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

  function openCalendarDetail(date) {
    if (!Core.parseDateOnly(date)) return;
    state.ui.calendarDate = date; saveState(); render();
    calendarReturnDate = date;
    modalReturnFocus = $(`[data-action="calendar-detail"][data-date="${date}"]`) || $('[data-action="calendar-add"]');
    modalState = { type: 'calendar-day', date }; renderModal();
    requestAnimationFrame(() => $('.calendar-day-detail [data-action="close-modal"]')?.focus());
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

  function openCalendarGoalProgress(goalId) {
    const goal = getGoal(goalId); if (!goal) return;
    if (goal.progressMode !== 'manual') { navigate(`goal/${goalId}`); return; }
    // This panel is launched from Day Detail too, so Esc should return there.
    modalState = { type: 'calendar-progress', goalId, previous: modalState, returnFocus: goalFocusTarget() }; renderModal();
    requestAnimationFrame(() => $('#goal-current-value')?.focus());
  }

  function renderToday() {
    const today = Core.dateOnly();
    const sections = Core.deriveTodayV3(state, Object.values(state.habitLogCache || {}).flat(), today);
    const total = sections.today.length;
    const goalCount = sections.goals.length + sections.overdueGoals.length;
    const overdueCount = sections.overdue.length + sections.overdueMilestones.length + sections.overdueGoals.length;
    const contextCounts = [
      total && `${total} ${total === 1 ? 'task' : 'tasks'} planned`,
      sections.habits.length && `${sections.habits.length} ${sections.habits.length === 1 ? 'routine' : 'routines'}`,
      goalCount && `${goalCount} ${goalCount === 1 ? 'goal' : 'goals'}`,
      overdueCount && `${overdueCount} overdue`,
    ].filter(Boolean).join(' · ');
    let html = pageHeader('Today', '', { contextToday: true, actionHtml: '<button class="btn btn-secondary" type="button" data-action="open-focus"><i class="ph ph-crosshair"></i> Focus</button>' });
    html += `<div class="today-context" data-today-context="true"><span class="today-context-date"><i class="ph ph-calendar-blank"></i>${esc(formatPageToday(today))}</span>${contextCounts ? `<span class="today-context-summary">${esc(contextCounts)}</span>` : ''}</div>`;
    html += `<section class="today-actions" data-today-actions="true" aria-labelledby="today-actions-heading"><div class="section-header"><h2 class="section-label" id="today-actions-heading">Daily actions</h2></div><div class="today-actions-grid"><button class="today-action" type="button" data-route="inbox"><i class="ph ph-tray"></i><span>Inbox</span></button><button class="today-action" type="button" data-action="quick-add" data-today="true"><i class="ph ph-plus-circle"></i><span>Quick Add</span></button><button class="today-action" type="button" data-action="open-focus"><i class="ph ph-crosshair"></i><span>Focus</span></button><button class="today-action" type="button" data-route="calendar"><i class="ph ph-calendar"></i><span>Calendar</span></button><button class="today-action" type="button" data-action="add-starter-examples"><i class="ph ph-sparkle"></i><span>Populate workspace</span></button></div></section>`;

    if (sections.overdue.length) {
      html += `<section class="section today-section today-section--overdue" data-today-section="overdue-tasks"><div class="section-header"><h2 class="section-label danger">Overdue Tasks</h2><span class="section-count">${sections.overdue.length}</span></div><div class="task-list">${sections.overdue.map(t => taskRow(t, 'today', { overdue: true })).join('')}</div></section>`;
    }

    if (sections.today.length || sections.suggestions.length) {
      html += `<section class="section today-section today-section--tasks" data-today-section="tasks"><div class="section-header"><h2 class="section-label">Tasks</h2><span class="section-count">${sections.today.length}</span></div>`;
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
    if (sections.habits.length) html += `<section class="section today-section today-section--habits" data-today-section="habits"><div class="section-header"><h2 class="section-label">Habits</h2><span class="section-count">${sections.habits.length}</span></div><div class="habit-list">${sections.habits.map(item => renderHabitRow(item.habit, item.status)).join('')}</div></section>`;
    if (sections.overdueMilestones.length) html += `<section class="section today-section today-section--overdue" data-today-section="overdue-milestones"><div class="section-header"><h2 class="section-label danger">Overdue Milestones</h2><span class="section-count">${sections.overdueMilestones.length}</span></div><div class="milestone-list">${sections.overdueMilestones.map(({ goal, milestone }) => `<div class="milestone-row"><button class="task-check" type="button" data-action="toggle-milestone" data-goal-id="${esc(goal.id)}" data-milestone-id="${esc(milestone.id)}" aria-label="Complete milestone"><i class="ph ph-circle"></i></button><button class="btn btn-ghost" type="button" data-route="goal/${esc(goal.id)}">${esc(milestone.title)} · ${esc(goal.title)}</button><small>${esc(relativeDateLabel(milestone.date))}</small></div>`).join('')}</div></section>`;
    for (const [label, goals, danger] of [['Overdue Goals', sections.overdueGoals, true], ['Goals', sections.goals, false]]) {
      if (goals.length) html += `<section class="section today-section today-section--${danger ? 'overdue' : 'goals'}" data-today-section="${danger ? 'overdue-goals' : 'goals'}"><div class="section-header"><h2 class="section-label${danger ? ' danger' : ''}">${label}</h2><span class="section-count">${goals.length}</span></div><div class="goal-list">${goals.map(renderGoalRow).join('')}</div></section>`;
    }
    if (!sections.today.length && !sections.overdue.length && !sections.habits.length && !sections.overdueMilestones.length && !sections.overdueGoals.length && !sections.goals.length && !sections.completed.length && !sections.suggestions.length) html += emptyState('Nothing planned for today.', 'Add a task when you are ready.', 'Add task', 'quick-add', { today: true });

    if (sections.completed.length) {
      const open = state.ui.todayCompletedExpanded;
      html += `<section class="section today-section today-section--completed" data-today-section="completed"><button class="collapsible-trigger" type="button" data-action="toggle-today-completed" aria-expanded="${open}"><span class="left"><i class="ph ph-check-circle"></i> Completed</span><span>${sections.completed.length} <i class="ph ph-caret-${open ? 'up' : 'down'}"></i></span></button>`;
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

  function renderGoalRow(goal) {
    return callDomainHook('renderRoute', { type: 'goal-row', goal }) || '';
  }

  function readGoalDraft() {
    callDomainHook('handleAction', 'read-goal-draft', null);
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

  function habitMetrics(habit) {
    return state.habitMetrics?.[habit.id] || { currentStreak: 0, longestStreak: 0, totalCheckins: 0, completionRate: 0, currentPeriodCount: 0, currentPeriodTarget: habit.frequencyType === 'timesPerWeek' ? Number(habit.timesPerWeek || 1) : 1 };
  }

  function renderHabitRow(habit, todayStatus = null) {
    return callDomainHook('renderRoute', { type: 'habit-row', habit, todayStatus }) || '';
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

  function emptyState(title, text, cta, action, data = {}) {
    const attrs = Object.entries(data).map(([key, value]) => `data-${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${esc(value)}"`).join(' ');
    return `<div class="empty-state"><h3>${esc(title)}</h3><p>${esc(text)}</p>${cta ? `<button class="btn btn-primary" type="button" data-action="${esc(action)}" ${attrs}><i class="ph ph-plus"></i>${esc(cta)}</button>` : ''}</div>`;
  }

  function taskRow(task, context, options = {}) {
    return callDomainHook('renderTaskRow', task, context, options) || '';
  }

  function renderRecovery() {
    if (recovery === 'global-recovery') return '<div class="recovery"><div class="recovery-card"><h1>Recovery is required.</h1><p>An interrupted global operation retained its internal recovery copy. Use Retry recovery below before continuing.</p></div></div>';
    if (recovery === 'migration-loading') return '<div class="recovery"><div class="recovery-card"><h1>Preparing your local data…</h1><p>Please wait while local storage is checked.</p></div></div>';
    if (recovery === 'migration-error') return '<div class="recovery"><div class="recovery-card"><h1>Local data migration could not finish.</h1><p>Your saved data and original files have not been overwritten. Check available storage and close other app tabs, then retry.</p><div class="recovery-actions"><button class="btn btn-secondary" type="button" data-action="retry-load">Retry</button></div></div></div>';
    const unsupported = recovery === 'unsupported-version';
    return `<div class="recovery"><div class="recovery-card"><h1>${unsupported ? 'This data is from a newer version.' : "We couldn't load your local data."}</h1><p>${unsupported ? "The prototype can't safely read this saved format." : 'Your saved data appears to be invalid. Nothing has been overwritten.'}</p><div class="recovery-actions"><button class="btn btn-secondary" type="button" data-action="retry-load">Retry</button><button class="btn btn-danger" type="button" data-action="recovery-reset">Reset local data</button></div></div></div>`;
  }

  function openQuickAdd(context = {}) {
    captureModalReturnFocus();
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
    const task = getTask(taskId);
    if (!task) return;
    if (modalState?.type === 'focus') stopFocusTimer();
    captureModalReturnFocus();
    closePopover();
    modalState = { type: 'task', taskId, titleDraft: task.title, notesDraft: task.notes || '', error: '', attachmentRecords: [], attachmentMessage: '' };
    renderModal();
    requestAnimationFrame(() => $('#detail-title')?.focus());
    loadTaskAttachments(taskId);
  }

  function focusableTasks() {
    const sections = Core.deriveTodaySections(state.tasks, Core.dateOnly());
    return [...sections.overdue, ...sections.today];
  }

  function createFocusTimer() {
    return { elapsedMs: 0, startedAt: Date.now(), isRunning: true };
  }

  function focusElapsedMs(timer = modalState?.timer) {
    if (!timer) return 0;
    return timer.elapsedMs + (timer.isRunning ? Date.now() - timer.startedAt : 0);
  }

  function formatFocusElapsed(elapsedMs) {
    const seconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function refreshFocusTimer() {
    if (modalState?.type !== 'focus') return;
    const timer = modalState.timer;
    const elapsed = $('#focus-elapsed');
    const toggle = $('[data-action="focus-toggle-timer"]');
    if (elapsed) elapsed.textContent = formatFocusElapsed(focusElapsedMs(timer));
    if (toggle) toggle.textContent = timer.isRunning ? 'Pause' : 'Resume';
  }

  function startFocusTimer() {
    clearInterval(focusTimerInterval);
    focusTimerInterval = window.setInterval(refreshFocusTimer, 1000);
  }

  function stopFocusTimer() {
    clearInterval(focusTimerInterval);
    focusTimerInterval = null;
  }

  function toggleFocusTimer() {
    const timer = modalState?.type === 'focus' ? modalState.timer : null;
    if (!timer) return;
    if (timer.isRunning) {
      timer.elapsedMs = focusElapsedMs(timer);
      timer.isRunning = false;
    } else {
      timer.startedAt = Date.now();
      timer.isRunning = true;
    }
    refreshFocusTimer();
  }

  function resetFocusTimer() {
    const timer = modalState?.type === 'focus' ? modalState.timer : null;
    if (!timer) return;
    timer.elapsedMs = 0;
    if (timer.isRunning) timer.startedAt = Date.now();
    refreshFocusTimer();
  }

  function openFocusMode(taskId = null) {
    const task = taskId ? getTask(taskId) : focusableTasks()[0];
    if (!task || task.isCompleted) { setToastMessage('No open overdue or Today tasks to focus on'); return; }
    captureModalReturnFocus();
    closePopover();
    modalState = { type: 'focus', taskId: task.id, timer: createFocusTimer() };
    renderModal();
    startFocusTimer();
    requestAnimationFrame(() => $('[data-action="focus-complete"]')?.focus());
  }

  function focusNextTask(currentTaskId = modalState?.taskId) {
    stopFocusTimer();
    const tasks = focusableTasks();
    if (!tasks.length) { closeModal(); setToastMessage('All overdue and Today tasks are complete'); return; }
    const currentIndex = tasks.findIndex(task => task.id === currentTaskId);
    modalState = { type: 'focus', taskId: (tasks[currentIndex + 1] || tasks[0]).id, timer: createFocusTimer() };
    renderModal();
    startFocusTimer();
    requestAnimationFrame(() => $('[data-action="focus-complete"]')?.focus());
  }

  function completeFocusTask(taskId) {
    stopFocusTimer();
    toggleComplete(taskId);
    focusNextTask(taskId);
  }

  function openSearch() {
    captureModalReturnFocus();
    closePopover();
    modalState = { type: 'search', query: '' };
    renderModal();
    requestAnimationFrame(() => $('#search-query')?.focus());
  }

  function openProjectModal(projectId = null, context = {}) {
    captureModalReturnFocus();
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
    captureModalReturnFocus();
    closePopover();
    const tag = tagId ? getTag(tagId) : null;
    modalState = { type: 'tag', tagId, draft: { name: tag?.name || '', color: tag?.color || PROJECT_COLORS[(state.tags || []).length % PROJECT_COLORS.length] }, error: '' };
    renderModal();
    requestAnimationFrame(() => $('#tag-name')?.focus());
  }

  function openAreaLinkedModal(kind, areaId) {
    captureModalReturnFocus();
    const label = kind === 'goal' ? 'Goal' : 'Habit';
    modalState = { type: 'area-linked', kind, areaId, draft: { name: '' }, error: '' };
    renderModal();
    requestAnimationFrame(() => $('#area-linked-name')?.focus());
  }

  function goalDraft(goal = null, areaId = null) {
    return {
      title: goal?.title || '', areaId: goal?.areaId || areaId || null, status: goal?.status || 'active',
      horizon: ['short', 'mid', 'long'].includes(goal?.horizon) ? goal.horizon : 'short',
      progressMode: goal?.progressMode || 'manual', progressType: goal?.progressType || 'percentage',
      currentValue: goal?.currentValue ?? 0, targetValue: goal?.targetValue ?? 100, unit: goal?.unit || '', targetDate: goal?.targetDate || '',
      projectLinks: copyTemplate(goal?.projectLinks || []), taskIds: [...(goal?.taskIds || [])], habitLinks: copyTemplate(goal?.habitLinks || []),
      milestones: copyTemplate(goal?.milestones || []), reminders: { sevenDaysBefore: false, threeDaysBefore: false, oneDayBefore: false, onTargetDate: false, time: '09:00', ...goal?.reminders },
    };
  }

  function openGoalModal(goalId = null, context = {}) {
    const returnFocus = goalFocusTarget();
    captureModalReturnFocus();
    closePopover();
    const goal = goalId ? getGoal(goalId) : null;
    modalState = { type: 'goal', goalId, draft: goalDraft(goal, context.areaId), error: '', returnFocus };
    modalState.templateContext = context;
    if (!goal && context.targetDate) modalState.draft.targetDate = context.targetDate;
    renderModal(); requestAnimationFrame(() => $('#goal-title')?.focus());
  }

  function habitDraft(habit = null, areaId = null) {
    return { name: habit?.name || '', areaId: habit?.areaId || areaId || null, routine: habit?.routine || 'daily', goalIds: [...(habit?.goalIds || [])], trackingType: habit?.trackingType || 'checkbox', targetValue: habit?.targetValue ?? 1, unit: habit?.unit || '', quickValues: (habit?.quickValues || []).join(','), frequencyType: habit?.frequencyType || 'daily', weekdays: habit?.weekdays || [1, 2, 3, 4, 5], timesPerWeek: habit?.timesPerWeek || 4, everyNDays: habit?.everyNDays || 2, startDate: habit?.startDate || Core.dateOnly(), continuation: habit?.continuation || 'automatic', endType: habit?.endType || 'never', endDate: habit?.endDate || '', successfulPeriodsTarget: habit?.successfulPeriodsTarget || '', reminders: (habit?.reminders || []).map(item => ({ ...item })) };
  }

  function openHabitModal(habitId = null, context = {}) {
    captureModalReturnFocus();
    closePopover(); const habit = habitId ? getHabit(habitId) : null;
    modalState = { type: 'habit', habitId, draft: habitDraft(habit, context.areaId), error: '' };
    modalState.templateContext = context;
    if (!habit && context.startDate) modalState.draft.startDate = context.startDate;
    renderModal(); requestAnimationFrame(() => $('#habit-name')?.focus());
  }

  function openConfirm(config) {
    captureModalReturnFocus();
    closePopover();
    modalState = { type: 'confirm', ...config };
    renderModal();
  }

  function closeModal() {
    if (modalState?.type === 'focus') stopFocusTimer();
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
    if (returnTarget || returnDate) restoreModalReturnFocus(returnTarget, returnDate && $(`[data-action="calendar-detail"][data-date="${returnDate}"]`));
  }

  function renderModal() {
    const root = $('#modal-root');
    if (!modalState) { root.innerHTML = ''; return; }
    const domainContent = callDomainHook('renderRoute', { type: 'modal', modalType: modalState.type });
    if (domainContent !== undefined) root.innerHTML = domainContent;
    else if (modalState.type === 'quick') root.innerHTML = renderQuickModal();
    else if (modalState.type === 'search') root.innerHTML = renderSearchModal();
    else if (modalState.type === 'tag') root.innerHTML = renderTagModal();
    else if (modalState.type === 'area-linked') root.innerHTML = renderAreaLinkedModal();
    else if (modalState.type === 'confirm') root.innerHTML = renderConfirmModal();
    else if (modalState.type === 'duplicate') root.innerHTML = renderDuplicateModal();
    else if (modalState.type === 'focus') root.innerHTML = renderFocusModal();
    else if (modalState.type === 'import-backup') root.innerHTML = renderImportBackupModal();
    else if (modalState.type === 'template-picker') root.innerHTML = renderTemplatePicker();
    else if (modalState.type === 'recurrence-scope') root.innerHTML = renderRecurrenceScope();
    if (['quick','project','habit','goal'].includes(modalState.type) && !modalState.taskId && !modalState.projectId && !modalState.habitId && !modalState.goalId) {
      $('.modal-inner',root)?.insertAdjacentHTML('afterbegin','<button class="btn btn-ghost" type="button" data-action="from-template"><i class="ph ph-copy"></i> From template</button>');
    }
    if (['confirm','recurrence-scope'].includes(modalState?.type)) requestAnimationFrame(() => root.querySelector('.modal button, .modal [href], .modal input, .modal select, .modal textarea, .modal [tabindex]:not([tabindex="-1"])')?.focus());
    if (['goal', 'goal-source', 'goal-links', 'goal-reminders', 'goal-history', 'milestone', 'habit-settings'].includes(modalState?.type)) requestAnimationFrame(() => ([...root.querySelectorAll('input, select, textarea')].find(el => el.offsetParent !== null) || root.querySelector('.modal-footer [data-action="close-modal"]'))?.focus());
  }

  function modalFrame(content, cls = '') {
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal ${cls}" role="dialog" aria-modal="true">${content}</section></div>`;
  }

  function renderFocusModal() {
    const task = getTask(modalState.taskId);
    if (!task || task.isCompleted) {
      const next = focusableTasks()[0];
      if (next) { modalState = { type: 'focus', taskId: next.id, timer: createFocusTimer() }; startFocusTimer(); return renderFocusModal(); }
      return modalFrame('<div class="modal-inner focus-modal"><div class="modal-header"><div><p class="focus-kicker">Focus mode</p><h2 class="modal-title">Nothing left to focus on</h2></div></div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-primary" type="button" data-action="close-modal">Exit</button></div></div></div>', 'focus-modal');
    }
    const today = Core.dateOnly();
    const project = getProject(task.projectId);
    const metadata = [];
    if (project) metadata.push(`<span><span class="project-dot" style="--project-color:${esc(project.color)}"></span>${esc(project.name)}</span>`);
    if (task.dueDate) metadata.push(`<span class="${task.dueDate < today ? 'danger' : task.dueDate === today ? 'warning' : ''}">${esc(task.dueDate < today ? `Overdue · ${relativeDateLabel(task.dueDate, today)}` : `Due ${relativeDateLabel(task.dueDate, today)}`)}</span>`);
    if (task.plannedDate) metadata.push(`<span>Planned ${esc(relativeDateLabel(task.plannedDate, today))}</span>`);
    if (task.priority && task.priority !== 'none') metadata.push(`<span>${priorityIcon(task.priority)}${esc(priorityLabel(task.priority))} priority</span>`);
    const subtasks = [...(task.subtasks || [])].sort((a, b) => clampOrder(a.order) - clampOrder(b.order));
    const completed = subtasks.filter(subtask => subtask.isCompleted).length;
    return modalFrame(`<div class="modal-inner focus-modal">
      <div class="modal-header"><div><p class="focus-kicker">Focus mode</p><h2 class="modal-title">${esc(task.title)}</h2></div><button class="btn-icon" type="button" data-action="close-modal" aria-label="Exit focus mode"><i class="ph ph-x"></i></button></div>
      ${metadata.length ? `<div class="focus-meta">${metadata.join('<span class="separator">·</span>')}</div>` : ''}
      <div class="focus-timer" aria-live="off"><span class="focus-timer-label">Elapsed</span><strong id="focus-elapsed">${formatFocusElapsed(focusElapsedMs())}</strong><div class="focus-timer-actions"><button class="btn btn-secondary" type="button" data-action="focus-toggle-timer">${modalState.timer?.isRunning ? 'Pause' : 'Resume'}</button><button class="btn btn-ghost" type="button" data-action="focus-reset-timer">Reset</button></div></div>
      ${task.notes ? `<p class="focus-notes">${esc(task.notes)}</p>` : ''}
      ${subtasks.length ? `<section class="focus-subtasks"><div class="detail-heading"><span>Subtasks</span><span>${completed} / ${subtasks.length}</span></div><div class="subtask-list">${subtasks.map(subtask => `<div class="subtask-row ${subtask.isCompleted ? 'is-completed' : ''}"><span class="complete-control ${subtask.isCompleted ? 'is-completed' : ''}">${subtask.isCompleted ? '<i class="ph ph-check"></i>' : ''}</span><span class="subtask-title">${esc(subtask.title)}</span></div>`).join('')}</div></section>` : ''}
      <div class="modal-footer"><button class="btn btn-ghost" type="button" data-action="close-modal">Exit</button><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="focus-next" data-task-id="${esc(task.id)}">Next task</button><button class="btn btn-secondary" type="button" data-action="focus-open-details" data-task-id="${esc(task.id)}">Open details</button><button class="btn btn-secondary" type="button" data-action="focus-tomorrow" data-task-id="${esc(task.id)}">Tomorrow</button><button class="btn btn-primary" type="button" data-action="focus-complete" data-task-id="${esc(task.id)}"><i class="ph ph-check"></i> Complete</button></div></div>
    </div>`, 'focus-modal');
  }

  const TEMPLATE_TYPES = ['task','project','habit','goal'];
  function saveShortcut(command) {
    const raw=$(`[data-shortcut="${command}"]`).value,value=Core.normalizeShortcut(raw);
    shortcutError='';
    if(!value)shortcutError='Use a letter or digit with optional Ctrl/Cmd, Alt and Shift, or choose Disable.';
    else {const conflict=Object.keys(SHORTCUT_DEFAULTS).find(key=>key!==command && Core.normalizeShortcut(state.settings.shortcuts[key])===value);if(conflict)shortcutError=`Already assigned to ${SHORTCUT_LABELS[conflict]}. Choose another shortcut.`;}
    if(shortcutError){render();return;}
    state.settings.shortcuts[command]=value;saveAndRender();
  }
  function disableShortcut(command) { state.settings.shortcuts[command]=null; shortcutError=''; saveAndRender(); }
  function resetShortcuts() { state.settings.shortcuts={...SHORTCUT_DEFAULTS}; shortcutError=''; saveAndRender(); }
  const copyTemplate = value => JSON.parse(JSON.stringify(value));
  const templateLabel = type => type[0].toUpperCase() + type.slice(1);
  function openTemplateEditorFromSource(type, id) {
    const source = type === 'task' ? getTask(id) : type === 'project' ? getProject(id) : type === 'habit' ? getHabit(id) : getGoal(id);
    const adapter = window.TodoDomainModules?.getAdapters().find(item => item.name === 'templates');
    if (source) adapter?.handleAction('open-template-editor', { templateType: type, snapshot: Core.templateFromEntity(type, source, state, Core.dateOnly()) }, domainContext());
  }

  function saveTemplateRecord(id, draft) {
    const existing = id ? state.templates.find(template => template.id === id) : null;
    if (id && !existing) return null;
    const record = { ...copyTemplate(draft), name: draft.name.trim(), id: id || uid('template'), createdAt: existing?.createdAt || nowIso(), updatedAt: nowIso() };
    if (existing) state.templates.splice(state.templates.indexOf(existing), 1, record); else state.templates.push(record);
    modalState.savedTemplateId = record.id;
    state.ui.templateType = draft.type; saveState(); closeModal(); render();
    return record;
  }

  function duplicateTemplateRecord(id) {
    const source = state.templates.find(template => template.id === id);
    if (!source) return;
    const record = copyTemplate(source); record.id = uid('template'); record.name += ' copy'; record.createdAt = record.updatedAt = nowIso(); state.templates.push(record); saveAndRender();
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

  function renderAttachmentRow(record, owner) {
    return `<div class="attachment-row" data-attachment-id="${esc(record.id)}"><i class="ph ph-file attachment-file-icon"></i><div class="attachment-main"><strong title="${esc(record.fileName)}">${esc(record.fileName)}</strong><small>${esc(fileTypeLabel(record))} · ${esc(formatBytes(record.size))}</small></div><button class="btn-icon" type="button" data-action="attachment-menu" data-attachment-id="${esc(record.id)}" data-owner-type="${esc(owner.ownerType)}" data-owner-id="${esc(owner.ownerId)}" aria-label="Attachment actions"><i class="ph ph-dots-three"></i></button></div>`;
  }

  function renderAttachmentsSection(owner) {
    const item = attachmentOwner(owner)?.item;
    const count = item ? item.attachmentIds.length : modalState.pendingFiles.length;
    const attrs = `data-owner-type="${esc(owner.ownerType)}" data-owner-id="${esc(owner.ownerId || '')}"${owner.ownerType === 'task' ? ` data-task-id="${esc(owner.ownerId)}"` : ''}`;
    const imageControl = owner.ownerType === 'task' ? `<button class="btn btn-secondary" type="button" data-action="attachment-image-picker"><i class="ph ph-image" aria-hidden="true"></i>Add image</button><input id="attachment-image-input" type="file" accept="image/*" multiple hidden ${attrs}>` : '';
    return `<div class="detail-section attachments-section"><div class="detail-heading"><span>Attachments</span><span>${count} / ${MAX_ATTACHMENTS_PER_TASK}</span></div><label class="attachment-drop-zone" ${attrs}><i class="ph ph-paperclip"></i><span><strong>Drop files here</strong><small>or choose files · max 10 MB each</small></span><span class="btn btn-secondary attachment-add-button">Add attachment</span><input id="attachment-input" type="file" multiple hidden ${attrs}></label>${imageControl}${modalState.attachmentMessage ? `<div class="attachment-message" role="status">${esc(modalState.attachmentMessage)}</div>` : ''}<div class="attachment-list">${(modalState.attachmentRecords || []).map(record => renderAttachmentRow(record, owner)).join('')}</div></div>`;
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
    if (modalState?.type === 'knowledge') callDomainHook('handleAction', 'read-knowledge-draft', null);
    if (modalState?.type === 'knowledge' && !dataset.ownerId) {
      const { valid, tooLarge, countRejected } = selectAttachmentFiles(files, modalState.pendingFiles.length);
      modalState.pendingFiles.push(...valid);
      modalState.attachmentMessage = attachmentMessages(valid.length, tooLarge, countRejected).join(' ');
      renderModal(); return;
    }
    addAttachments({ ownerType: dataset.ownerType || 'task', ownerId: dataset.ownerId || dataset.taskId }, files);
  }

  function openAttachmentMenu(anchor, attachmentId) {
    const html = `<button class="popover-option" type="button" data-pop-action="attachment-open" data-attachment-id="${esc(attachmentId)}"><i class="ph ph-arrow-square-out"></i>Open</button><button class="popover-option" type="button" data-pop-action="attachment-download" data-attachment-id="${esc(attachmentId)}"><i class="ph ph-download-simple"></i>Download</button><div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="attachment-delete" data-attachment-id="${esc(attachmentId)}" data-owner-type="${esc(anchor.dataset.ownerType)}" data-owner-id="${esc(anchor.dataset.ownerId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>Delete</button>`;
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

  async function deleteAttachment(attachmentId, descriptor) {
    const owner = attachmentOwner(descriptor), located = locateDeleteEntity('attachment', attachmentId);
    if (!owner || located?.parent !== owner.item || located.ownerType !== owner.type) {
      setToastMessage('Attachment owner changed. Reopen the current item.'); return;
    }
    requestDeleteEntity('attachment', attachmentId);
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

  function renderTagModal() {
    const editing = Boolean(modalState.tagId);
    const d = modalState.draft;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><div><h2 class="dialog-title">${editing ? 'Edit tag' : 'New tag'}</h2></div><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label" for="tag-name">Name</label><input id="tag-name" class="input ${modalState.error ? 'is-error' : ''}" type="text" maxlength="80" value="${esc(d.name)}" placeholder="Tag name" />${modalState.error ? `<div class="validation">${esc(modalState.error)}</div>` : ''}<div class="field-label">Color</div><div class="color-grid">${PROJECT_COLORS.map(c => `<button class="color-swatch ${c === d.color ? 'is-selected' : ''}" type="button" data-action="select-tag-color" data-color="${c}" style="--swatch:${c}" aria-label="Select color"></button>`).join('')}</div></div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-tag">${editing ? 'Save' : 'Create'}</button></div></div></div>`, 'small-modal');
  }

  function renderAreaLinkedModal() {
    const label = modalState.kind === 'goal' ? 'Goal' : 'Habit';
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">New ${label}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><label class="field-label" for="area-linked-name">Name</label><input id="area-linked-name" class="input ${modalState.error ? 'is-error' : ''}" type="text" maxlength="100" value="${esc(modalState.draft.name)}" placeholder="${label} name" />${modalState.error ? `<div class="validation">${esc(modalState.error)}</div>` : ''}<div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-area-linked">Create ${label.toLowerCase()}</button></div></div></div>`, 'quick');
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
    const html = `${todayAction}<button class="popover-option" type="button" data-pop-action="task-move-tomorrow" data-task-id="${esc(taskId)}"><i class="ph ph-arrow-right"></i>Move to Tomorrow</button><button class="popover-option" type="button" data-pop-action="task-move-anytime" data-task-id="${esc(taskId)}"><i class="ph ph-infinity"></i>Move to Anytime</button><button class="popover-option" type="button" data-pop-action="task-open-plan" data-task-id="${esc(taskId)}"><i class="ph ph-calendar-check"></i>Plan for...</button><button class="popover-option" type="button" data-pop-action="task-open-due" data-task-id="${esc(taskId)}"><i class="ph ph-flag"></i>Change due date</button><button class="popover-option" type="button" data-pop-action="task-open-project" data-task-id="${esc(taskId)}"><i class="ph ph-folder-simple"></i>Move to project</button><button class="popover-option" type="button" data-pop-action="task-duplicate" data-task-id="${esc(taskId)}"><i class="ph ph-copy"></i>Duplicate</button><div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="task-delete" data-task-id="${esc(taskId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>Delete</button>`;
    openPopover(anchor, templateMenuEntry('task',taskId)+html, { type: 'task-menu', taskId });
  }

  function openTagMenu(anchor, tagId) {
    const tag = getTag(tagId); if (!tag) return;
    const html = `<button class="popover-option" type="button" data-pop-action="edit-tag" data-tag-id="${esc(tagId)}"><i class="ph ph-pencil-simple"></i>Edit tag</button><button class="popover-option" type="button" data-pop-action="delete-tag" data-tag-id="${esc(tagId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>Delete tag</button>`;
    openPopover(anchor, html, { type: 'tag-menu', tagId });
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
    const parsed = parseQuickAddTitle(d.title, !d.explicitPlan);
    const title = String(parsed.title || '').trim();
    const resolvedPlan = d.explicitPlan ? d.plannedDate : (parsed.plannedDate || d.plannedDate);
    if (!title) {
      modalState.error = 'Task needs a title.';
      renderModal(); requestAnimationFrame(() => $('#quick-title')?.focus()); return;
    }
    const isInbox = modalState.defaults.processed ? false : !(d.projectId || resolvedPlan);
    const task = {
      id: uid('task'), title, notes: d.notes || '', projectId: d.projectId || null, areaId: d.projectId ? null : (d.areaId || null), goalIds: [...(d.goalIds || [])], plannedTime: d.plannedTime || null, dueTime: d.dueTime || null,
      plannedDate: resolvedPlan || null, dueDate: d.dueDate || null,
      reminderAt: d.reminderAt || null, reminderFiredAt: null, recurrence: d.recurrence || null, tagIds: [...new Set([...(d.tagIds || []), ...parsed.tagIds])], priority: parsed.priority || d.priority || 'none', attachmentIds: [], isInbox,
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

  function parseQuickAddTitle(rawTitle, parsePlan = true) {
    const original = String(rawTitle || '');
    const tagIds = [];
    let priority = null;
    const tokenFree = original.replace(/(^|\s)(#[^\s#]+|!(?:high|medium|low))(?=\s|$)/gi, (match, prefix, token) => {
      if (token[0] === '#') {
        const name = token.slice(1).toLocaleLowerCase();
        const tag = (state.tags || []).find(item => Core.normalizeTagName(item.name).toLocaleLowerCase() === name);
        if (!tag) return match;
        tagIds.push(tag.id);
      } else {
        priority = token.slice(1).toLocaleLowerCase();
      }
      return prefix;
    });
    const parsedPlan = parsePlan ? Core.parseQuickPlanPhrase(tokenFree, Core.dateOnly()) : { title: tokenFree, plannedDate: null };
    const title = (parsedPlan.plannedDate ? parsedPlan.title : tokenFree).replace(/\s{2,}/g, ' ').trim();
    return { title, plannedDate: parsedPlan.plannedDate, tagIds: [...new Set(tagIds)], priority };
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
      note: 'This Note will be removed. Its files are retained through the Undo window. Undo restores the Note and files.',
      resource: 'This Resource and its relations will be removed. Its files are retained through the Undo window. Undo restores them.',
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
    for (const resource of state.resources) {
      if (removedTasks.size) arrayEffect('resources', resource, 'relatedTaskIds', id => removedTasks.has(id));
      const field = { project: 'relatedProjectIds', goal: 'relatedGoalIds', habit: 'relatedHabitIds' }[type];
      if (field) arrayEffect('resources', resource, field, id => id === identity);
    }
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
    if (new Set(attachmentIds).size !== attachmentIds.length) throw new Error('An attachment ID is reused.');
    snapshot.fileOwners = attachmentIds.map(id => {
      const owners = TodoStorage.attachmentOwners(state).filter(owner => (owner.item.attachmentIds || []).includes(id));
      if (owners.length !== 1) throw new Error('Attachment owner changed.');
      return { id, ...owners[0] };
    });
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
    if (compareBefore) for (const [collection, field] of Object.entries({ tasks: 'relatedTaskIds', projects: 'relatedProjectIds', goals: 'relatedGoalIds', habits: 'relatedHabitIds' })) {
      const removed = new Set(snapshot.entries.filter(entry => entry.collection === collection && !entry.field).map(entry => entry.entity.id));
      if (!removed.size) continue;
      for (const resource of state.resources) if ((resource[field] || []).some(id => removed.has(id))
        && !snapshot.effects.some(effect => effect.owner === resource && effect.field === field))
        throw new Error('Resource relations changed. Reopen confirmation.');
    }
    if (snapshot.attachmentOwner && !state[snapshot.attachmentOwnerCollection].includes(snapshot.attachmentOwner)) throw new Error('Attachment owner changed.');
    for (const captured of snapshot.fileOwners) {
      const owners = TodoStorage.attachmentOwners(state).filter(owner => (owner.item.attachmentIds || []).includes(captured.id));
      const record = snapshot.attachments.find(item => item.id === captured.id);
      if (owners.length !== 1 || owners[0].item !== captured.item || owners[0].type !== captured.type
        || owners[0].item.attachmentIds.filter(id => id === captured.id).length !== 1
        || !TodoStorage.attachmentBelongsTo(record, owners[0]) || !(record.blob instanceof Blob) || record.size !== record.blob.size)
        throw new Error('Attachment owner or stored file changed.');
    }
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
      if (snapshot.attachments.length) await Attachments.markPending(snapshot.attachments.map(record => record.id), new Date(snapshot.deadline).toISOString(), snapshot.token, snapshot.attachments, () => validateDeleteSnapshot(snapshot));
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
        await TodoStorage.restoreDeleteRecords(owned, expected, () => validateDeleteSnapshot(snapshot, false));
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
        await TodoStorage.restoreDeleteRecords(snapshot, expected, () => validateDeleteSnapshot(snapshot, false));
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
      if (['notes', 'resources'].includes(entry.collection)) {
        const exists = (collection, id) => state[collection].some(item => item.id === id)
          || snapshot.entries.some(other => other.collection === collection && !other.field && other.entity.id === id);
        if (entry.entity.areaId && !exists('areas', entry.entity.areaId)) throw new Error('The Area no longer exists. Restore it before retrying Undo.');
        if (entry.collection === 'resources') for (const [field, collection] of Object.entries({ relatedTaskIds: 'tasks', relatedProjectIds: 'projects', relatedGoalIds: 'goals', relatedHabitIds: 'habits' }))
          if (entry.entity[field].some(id => !exists(collection, id))) throw new Error('A related item no longer exists. Restore it before retrying Undo.');
      }
    }
    if (snapshot.attachmentOwner && !state[snapshot.attachmentOwnerCollection].includes(snapshot.attachmentOwner)) throw new Error('Attachment owner changed.');
    if (snapshot.attachmentOwner && snapshot.attachmentOwner.attachmentIds?.includes(snapshot.identity)) throw new Error('The attachment ID is now in use.');
    const referenced = new Set(TodoStorage.attachmentOwners(state).flatMap(owner => owner.item.attachmentIds || []));
    if (snapshot.attachments.some(record => referenced.has(record.id))) throw new Error('The attachment ID is now in use by an owner.');
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
    const validate = record => {
      if (undoHold || snapshot.source !== state || snapshot.generation !== undoGeneration
        || TodoStorage.attachmentOwners(state).some(owner => (owner.item.attachmentIds || []).includes(record.id)))
        throw new Error('File ownership changed. Retained files were kept.');
    };
    for (const expected of snapshot.pendingAttachments)
      if (!(await sameStoredAttachment(await Attachments.get(expected.id), expected))) continue;
      else await Attachments.deletePending([expected], nowIso(), validate);
    snapshot.finalized = true;
    return true;
  }

  function undoDomain() {
    return JSON.stringify(Object.fromEntries(['tasks','projects','tags','areas','goals','habits','notes','resources','templates','savedViews'].map(name => [name, state?.[name]])));
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

  function moveTaskToAnytime(taskId) {
    const task = getTask(taskId); if (!task) return;
    if(taskRecurrence(task)){requestTaskEdit(taskId,{plannedDate:null,isInbox:false,todayOrder:null});return;}
    const prev = { plannedDate: task.plannedDate, isInbox: task.isInbox, todayOrder: task.todayOrder };
    task.plannedDate = null; task.isInbox = false; task.todayOrder = null; task.updatedAt = nowIso();
    saveState(); render();
    setUndo('Task moved to Anytime', () => { const current = getTask(taskId); if (!current) return; Object.assign(current, prev, { updatedAt: nowIso() }); saveState(); render(); });
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
    if (!TodoStorage?.goalHistory) return Promise.resolve();
    return TodoStorage.goalHistory.put({ id: uid('goal-history'), goalId, type, data, createdAt: nowIso() }).catch(reportStorageFailure);
  }

  function openGoalHistory(goalId, trigger) {
    if (!getGoal(goalId)) return;
    closePopover();
    modalState = { type: 'goal-history', goalId, events: null, error: '', returnFocus: goalFocusTarget(trigger) };
    renderModal();
    TodoStorage.goalHistory.listByGoal(goalId).then(events => {
      if (modalState?.type !== 'goal-history' || modalState.goalId !== goalId) return;
      modalState.events = events;
      renderModal();
    }).catch(error => {
      if (modalState?.type !== 'goal-history' || modalState.goalId !== goalId) return;
      modalState.error = error?.message || 'Goal history could not be loaded.';
      renderModal();
    });
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
      saveState(); render(); return putGoalHistory(goalId, 'statusChanged', { from: status, to: previous.status });
    });
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
    callDomainHook('handleAction', 'read-habit-draft', null);
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
    try {
      await TodoStorage.habitLogs.put(record);
      await refreshHabitMetrics();
    } catch (error) {
      reportStorageFailure(error);
      return null;
    }
    habit.updatedAt = nowIso(); saveState(); evaluateGoalProgressChanges(before); await evaluateHabitBoundaries(); render(); return true;
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

  function deleteMilestone(goalId, milestoneId) {
    requestDeleteEntity('milestone', { parentId: goalId, id: milestoneId });
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

  async function deleteGoal(goalId) {
    requestDeleteEntity('goal', goalId);
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
      const summary = reason === 'restore' ? ` ${op.validated.state.tasks.length} tasks, ${op.validated.state.projects.length} projects, ${op.validated.state.goals.length} Goals, ${op.validated.state.habits.length} Habits, ${op.validated.state.notes.length} Notes, ${op.validated.state.resources.length} Resources, ${op.validated.attachmentRecords.length} files, ${op.validated.habitLogs.length} logs and ${op.validated.goalHistory.length} history events will be restored.` : '';
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
    const mobileQuickAdd = event.target.closest('#mobile-quick-add');
    if (!mobileQuickAdd) setMobileQuickAddOpen(false);

    const routeEl = event.target.closest('[data-route]');
    if (routeEl) { event.preventDefault(); navigate(routeEl.dataset.route); return; }

    const areaTab = event.target.closest('[data-tab]');
    if (areaTab) {
      if (callDomainHook('handleAction', 'area-tab', event) !== undefined) return;
      state.ui.areaTab = areaTab.dataset.tab; saveAndRender(); return;
    }
    const goalTab = event.target.closest('[data-goal-tab]');
    if (goalTab && callDomainHook('handleAction', 'goal-tab', event) !== undefined) return;
    const habitTab = event.target.closest('[data-habit-tab]');
    if (habitTab && callDomainHook('handleAction', 'habit-tab', event) !== undefined) return;
    const templateTab=event.target.closest('[data-template-type]');
    if(templateTab){if(callDomainHook('handleAction','template-type',event)!==undefined)return;state.ui.templateType=templateTab.dataset.templateType;saveAndRender();return;}

    const pop = event.target.closest('[data-pop-action]');
    if (pop) { if (callDomainHook('handleAction', pop.dataset.popAction, event) === undefined) handlePopoverAction(pop); return; }
    const goalProperty = event.target.closest('[data-goal-property]');
    if (goalProperty && callDomainHook('handleAction', 'goal-property', event) !== undefined) return;
    const habitProperty = event.target.closest('[data-habit-property]');
    if (habitProperty && callDomainHook('handleAction', 'habit-property', event) !== undefined) return;

    const el = event.target.closest('[data-action]');
    if (!el) {
      if (popoverEl && !event.target.closest('.popover')) closePopover();
      return;
    }
    const action = el.dataset.action;
    if (action === 'toggle-mobile-quick-add') { setMobileQuickAddOpen(el.getAttribute('aria-expanded') !== 'true'); return; }
    if (el.closest('#mobile-quick-add-menu')) {
      setMobileQuickAddOpen(false);
      $('#mobile-quick-add-toggle')?.focus();
    }
    if (callDomainHook('handleAction', action, event) !== undefined) return;
    if(action==='recurrence-scope'){applyRecurrenceScope(el.dataset.scope);return;}
    if(action==='from-template')openTemplatePicker();
    else if(action==='toggle-sidebar-section'){const key=el.dataset.section;state.ui.sidebarSections[key]=!state.ui.sidebarSections[key];saveAndRender();}
    else if(action==='more-route'){closePopover();navigate(el.dataset.moreRoute);}
    else if(action==='choose-template')chooseTemplate(el.dataset.templateId);
    else if(action==='template-picker-back'){if(modalState.previous?.type==='goal')closeModal();else{modalState=modalState.previous;renderModal();}}
    else if(action==='use-template'){const template=state.templates.find(t=>t.id===el.dataset.templateId);if(template){if(template.type==='task')openQuickAdd();else if(template.type==='project')openProjectModal();else if(template.type==='habit')openHabitModal();else openGoalModal();openTemplatePicker();chooseTemplate(template.id);}}
    else if (action === 'toggle-sidebar') { state.ui.sidebarCollapsed = !state.ui.sidebarCollapsed; saveAndRender(); }
    else if (action === 'quick-add') openQuickAdd({ projectId: el.dataset.projectId || null, areaId: el.dataset.areaId || null, today: el.dataset.today === 'true', anytime: el.dataset.anytime === 'true' });
    else if (action === 'open-task') openTaskDetail(el.dataset.taskId);
    else if (action === 'open-focus') openFocusMode();
    else if (action === 'focus-complete') completeFocusTask(el.dataset.taskId);
    else if (action === 'focus-toggle-timer') toggleFocusTimer();
    else if (action === 'focus-reset-timer') resetFocusTimer();
    else if (action === 'focus-tomorrow') { moveTaskToTomorrow(el.dataset.taskId); if (modalState?.type === 'focus') focusNextTask(el.dataset.taskId); }
    else if (action === 'focus-open-details') openTaskDetail(el.dataset.taskId);
    else if (action === 'focus-next') focusNextTask(el.dataset.taskId);
    else if (action === 'toggle-complete') toggleComplete(el.dataset.taskId);
    else if (action === 'open-search') openSearch();
    else if (action === 'delete-draft-goal-milestone') deleteDraftGoalMilestone(el.dataset.milestoneId);
    else if (action === 'delete-milestone') deleteMilestone(el.dataset.goalId, el.dataset.milestoneId);
    else if (action === 'save-area-linked') saveAreaLinkedModal();
    else if (action === 'new-tag') openTagModal();
    else if (action === 'select-tag') { state.ui.selectedTagId = el.dataset.tagId; saveAndRender(); }
    else if (action === 'tag-menu') openTagMenu(el, el.dataset.tagId);
    else if (action === 'more-menu') openMoreMenu(el);
    else if (action === 'task-menu') openTaskMenu(el, el.dataset.taskId);
    else if (action === 'attachment-menu') openAttachmentMenu(el, el.dataset.attachmentId);
    else if (action === 'attachment-image-picker') $('#attachment-image-input')?.click();
    else if (action === 'toggle-suggestions') { state.ui.suggestionsExpanded = !state.ui.suggestionsExpanded; saveAndRender(); }
    else if (action === 'toggle-today-completed') { state.ui.todayCompletedExpanded = !state.ui.todayCompletedExpanded; saveAndRender(); }
    else if (action === 'add-all-suggestions') addAllSuggestions();
    else if (action === 'inbox-today') addTaskToToday(el.dataset.taskId);
    else if (action === 'inbox-anytime') moveTaskToAnytime(el.dataset.taskId);
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
    else if (action === 'select-tag-color') { modalState.draft.color = el.dataset.color; renderModal(); }
    else if (action === 'save-tag') saveTagModal();
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
    if (action === 'set-project') setProject(button.dataset.targetType, button.dataset.taskId, button.dataset.projectId);
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
    else if (action === 'task-move-anytime') { closePopover(); moveTaskToAnytime(button.dataset.taskId); }
    else if (action === 'task-open-plan') { const taskId=button.dataset.taskId; closePopover(); const anchor=document.querySelector(`[data-action="task-menu"][data-task-id="${CSS.escape(taskId)}"]`) || button; openPlanPicker(anchor,{type:'task',taskId}); }
    else if (action === 'task-duplicate') startDuplicate(button.dataset.taskId);
    else if (action === 'attachment-open') openAttachment(button.dataset.attachmentId, false);
    else if (action === 'attachment-download') openAttachment(button.dataset.attachmentId, true);
    else if (action === 'attachment-delete') deleteAttachment(button.dataset.attachmentId, { ownerType: button.dataset.ownerType, ownerId: button.dataset.ownerId });
    else if (action === 'task-open-project') { const taskId = button.dataset.taskId; closePopover(); const anchor = document.querySelector(`[data-action="task-menu"][data-task-id="${CSS.escape(taskId)}"]`) || button; openProjectPicker(anchor, { type: 'task', taskId }); }
    else if (action === 'task-open-due') { const taskId = button.dataset.taskId; closePopover(); const anchor = document.querySelector(`[data-action="task-menu"][data-task-id="${CSS.escape(taskId)}"]`) || button; openDuePicker(anchor, { type: 'task', taskId }); }
    else if (action === 'task-delete') { const id = button.dataset.taskId; closePopover(); deleteTask(id); }
    else if (action === 'edit-tag') { const id = button.dataset.tagId; closePopover(); openTagModal(id); }
    else if (action === 'delete-tag') deleteTag(button.dataset.tagId);
    else if (action === 'delete-goal') { const id = button.dataset.goalId; closePopover(); deleteGoal(id); }
  }

  function handleInput(event) {
    if (globalOperation) return;
    if (callDomainHook('handleInput', event) !== undefined) return;
    if (modalState?.type === 'quick') {
      if (event.target.id === 'quick-title') { modalState.draft.title = event.target.value; modalState.error = ''; if (!modalState.draft.explicitPlan) { const parsed=parseQuickAddTitle(event.target.value); modalState.draft.parsedPlanDate=parsed.plannedDate; const b=document.querySelector('[data-action="quick-plan-picker"]'); if(b) b.innerHTML=`<i class="ph ph-calendar-check"></i>${parsed.plannedDate ? esc(relativeDateLabel(parsed.plannedDate)) : 'Plan for'}`; } }
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
    if (modalState?.type === 'tag' && event.target.id === 'tag-name') { modalState.draft.name = event.target.value; modalState.error = ''; }
  }

  function handleChange(event) {
    if (globalOperation) return;
    if (callDomainHook('handleInput', event) !== undefined) return;
    if (event.target.matches('[data-task-time]')) { updateTask(event.target.dataset.taskId, { [event.target.dataset.taskTime]: Core.normalizeTime(event.target.value) }, false); render(); return; }
    if (['attachment-input', 'attachment-image-input'].includes(event.target.id)) { receiveAttachmentFiles(event.target.dataset, [...event.target.files]); event.target.value=''; return; }
    if (event.target.id === 'backup-import-input') { const file=event.target.files?.[0]; event.target.value=''; if(file) inspectImportBackup(file); return; }
    if (event.target.id === 'completed-project-filter') {
      state.ui.completedProjectFilter = event.target.value || '';
      saveAndRender();
    } else if (event.target.id === 'completed-period-filter') {
      state.ui.completedPeriod = Number(event.target.value) || 0;
      saveAndRender();
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
      if (callDomainHook('handleInput', event) !== undefined) return;
    }
    if (habitPropertyEditor && !modalState && !popoverEl && (event.key === 'Escape' || (event.key === 'Enter' && typing && !event.isComposing))) {
      if (callDomainHook('handleInput', event) !== undefined) return;
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
      if ($('#mobile-quick-add-toggle')?.getAttribute('aria-expanded') === 'true') { event.preventDefault(); setMobileQuickAddOpen(false); $('#mobile-quick-add-toggle')?.focus(); return; }
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
    if (callDomainHook('handleInput', event) !== undefined) return;

    if (modalState?.type === 'quick' && target?.id === 'quick-subtask' && event.key === 'Enter') {
      event.preventDefault(); syncQuickDraftFromDom(); const title = target.value.trim(); if (!title) { target.blur(); return; }
      modalState.draft.subtasks.push({ id: uid('sub'), title, isCompleted: false, order: modalState.draft.subtasks.length }); renderModal(); requestAnimationFrame(() => $('#quick-subtask')?.focus()); return;
    }

    if (modalState?.type === 'task' && target?.id === 'detail-title' && event.key === 'Enter') { event.preventDefault(); target.blur(); return; }
    if (modalState?.type === 'task' && target?.id === 'detail-subtask' && event.key === 'Enter') { event.preventDefault(); addDetailSubtask(target.dataset.taskId, target.value); return; }
  }

  function handleDblKeyActivation(event) {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.task-main')) {
      event.preventDefault(); openTaskDetail(event.target.dataset.taskId);
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.subtask-title')) {
      event.preventDefault(); editSubtask(event.target.dataset.taskId, event.target.dataset.subtaskId);
    }
  }

  function resetTaskSwipe(row, originalStyle) {
    if (!row) return;
    row.style.background = originalStyle.background;
    row.style.borderColor = originalStyle.borderColor;
    row.style.touchAction = originalStyle.touchAction;
  }

  function handleTaskSwipeStart(event) {
    if (window.innerWidth > 700 || event.pointerType === 'mouse' || !event.isPrimary || event.button !== 0) return;
    const row = event.target.closest('.task-row');
    if (!row || row.classList.contains('is-completed') || event.target.closest('button, input, textarea, select, [contenteditable]')) return;
    taskSwipeState = {
      row,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      distance: 0,
      swiping: false,
      originalStyle: { background: row.style.background, borderColor: row.style.borderColor, touchAction: row.style.touchAction }
    };
    row.style.touchAction = 'pan-y';
    row.setPointerCapture?.(event.pointerId);
  }

  function handleTaskSwipeMove(event) {
    const swipe = taskSwipeState;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    const horizontal = event.clientX - swipe.startX;
    const vertical = event.clientY - swipe.startY;
    if (Math.abs(vertical) > Math.abs(horizontal) && Math.abs(vertical) > 8) {
      resetTaskSwipe(swipe.row, swipe.originalStyle);
      taskSwipeState = null;
      return;
    }
    if (horizontal <= 0 || Math.abs(horizontal) <= Math.abs(vertical)) return;
    event.preventDefault();
    swipe.distance = horizontal;
    swipe.swiping = true;
    const progress = Math.min(1, horizontal / 96);
    swipe.row.style.background = `rgba(48, 203, 173, ${0.14 + progress * 0.22})`;
    swipe.row.style.borderColor = `rgba(48, 203, 173, ${0.3 + progress * 0.5})`;
  }

  function finishTaskSwipe(event) {
    const swipe = taskSwipeState;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    taskSwipeState = null;
    swipe.row.releasePointerCapture?.(event.pointerId);
    resetTaskSwipe(swipe.row, swipe.originalStyle);
    if (!swipe.swiping) return;
    suppressTaskSwipeClick = true;
    setTimeout(() => { suppressTaskSwipeClick = false; }, 0);
    if (event.type !== 'pointercancel' && swipe.distance >= 96) toggleComplete(swipe.row.dataset.taskId);
  }

  function handleTaskSwipeClick(event) {
    if (!suppressTaskSwipeClick) return;
    suppressTaskSwipeClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
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
    document.addEventListener('pointerdown', handleTaskSwipeStart);
    document.addEventListener('pointermove', handleTaskSwipeMove, { passive: false });
    document.addEventListener('pointerup', finishTaskSwipe);
    document.addEventListener('pointercancel', finishTaskSwipe);
    document.addEventListener('click', handleTaskSwipeClick, true);
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
          const protectedIds = [...TodoStorage.attachmentOwners(state).flatMap(owner => owner.item.attachmentIds || []), ...[...failedDeleteSnapshots].flatMap(snapshot => snapshot.attachments.map(record => record.id)), ...[...undoWork]
            .flatMap(work => (work.snapshot?.pendingAttachments || []).map(record => record.id))];
          await Attachments.cleanupExpired(nowIso(), protectedIds, record => {
            if (undoHold || localStorage.getItem(STORAGE_KEY) !== committedSource || !state
              || TodoStorage.attachmentOwners(state).some(owner => (owner.item.attachmentIds || []).includes(record.id))
              || [...failedDeleteSnapshots].some(snapshot => snapshot.attachments.some(file => file.id === record.id))
              || [...undoWork].some(work => work.snapshot?.attachments.some(file => file.id === record.id)))
              throw new Error('File ownership changed during cleanup.');
          }).catch(() => setToastMessage('File cleanup failed. Retained files were kept.'));
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
