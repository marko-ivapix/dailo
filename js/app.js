(function () {
  'use strict';

  const I18n = window.TodoI18n;
  const { tr, trn, trMessage, msg } = I18n;
  const Core = window.TodoCore;
  const TodoStorage = window.TodoStorage;
  const Attachments = window.TodoAttachments;
  const Backup = window.TodoBackup;
  const Release = window.DailoRelease || { APP_VERSION: '', REPORT_EMAIL: '', problemReportMailto: () => null };
  // Optional sync (V2.0-a): on only when js/sync-config.js has the project URL and public key.
  const Sync = window.DailoSync || null;
  const syncConfig = window.DailoSyncConfig || {};
  const syncClient = Sync?.isConfigured(syncConfig) ? Sync.createClient({ url: syncConfig.url, anonKey: syncConfig.anonKey }) : null;
  const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
  const MAX_ATTACHMENTS_PER_TASK = 10;
  const STORAGE_KEY = 'todoAppData';
  const VERSION = 3;
  const PROJECT_COLORS = ['#5362FF', '#30CBAD', '#A879FF', '#4CC9F0', '#F5B942', '#FF8A5B', '#F06A8A', '#8FD14F'];
  const AREA_ICONS = ['ph-briefcase', 'ph-house', 'ph-heart', 'ph-chart-line-up', 'ph-graduation-cap', 'ph-palette', 'ph-plant', 'ph-airplane'];
  const DATE_FMT = new Intl.DateTimeFormat(I18n.locale(), { weekday: 'long', month: 'long', day: 'numeric' });
  const SHORT_DATE_FMT = new Intl.DateTimeFormat(I18n.locale(), { month: 'short', day: 'numeric' });
  const WEEKDAY_FMT = new Intl.DateTimeFormat(I18n.locale(), { weekday: 'long' });
  const SHORTCUT_DEFAULTS = { newTask:'N', search:'Ctrl/Cmd+F', today:'T', inbox:'I', upcoming:'U', calendar:'C', goals:'G', habits:'H', templates:'Shift+T' };
  const SHORTCUT_LABELS = {newTask:msg('New task'),search:msg('Search'),today:msg('Today'),inbox:msg('Inbox'),upcoming:msg('Upcoming'),calendar:msg('Calendar'),goals:msg('Goals'),habits:msg('Habits'),templates:msg('Templates')};
  const INBOX_FILTERS = [['all', msg('All')], ['tasks', msg('Tasks')], ['goals', msg('Goals')], ['habits', msg('Habits')], ['notes', msg('Notes')], ['resources', msg('Resources')]];
  let shortcutError = '';
  const DATE_TIME_FMT = new Intl.DateTimeFormat(I18n.locale(), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  let state = null;
  let recovery = null;
  let startupPromise = null;
  const startupQueue = [];
  let storageError = false;
  let automaticSnapshotError = null;
  let automaticSnapshotTimer = null;
  let storagePersistence = { state: 'unknown' };
  let storagePersistenceRequested = false;
  let waitingServiceWorker = null;
  let appUpdateRequested = false;
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
  let staleDataNotice = null;
  let canonicalRaw = null;
  let textSaveTimer = null;
  let lastToday = Core.dateOnly();
  let dragState = null;
  let taskSwipeState = null;
  let suppressTaskSwipeClick = false;
  let modalReturnFocus = null;
  let popoverReturnFocus = null;
  const knowledgeAttachmentCache = new Map();
  let syncMeta = null;
  let syncUi = { step: 'email', email: '', busy: false, error: '' };
  let syncTimer = null;
  let syncRunning = false;
  let applyingSync = false;

  function captureModalReturnFocus() {
    const active = document.activeElement;
    modalReturnFocus = active instanceof HTMLElement && active.isConnected ? active : null;
  }

  function restoreModalReturnFocus(target) {
    requestAnimationFrame(() => {
      if (modalState || $('#modal-root .modal') || popoverEl?.isConnected) return;
      if (target?.isConnected) target.focus();
    });
  }

  // R9c–R10d (K12): on Ciljevi, Beleške, Resursi, Oznake, Šabloni and Sačuvani prikazi the floating "+" adds what belongs
  // there and its label says what;
  // elsewhere it opens the menu.
  const QUICK_ADD_DIRECT = Object.freeze({ '#goals': [msg('New goal'), () => openGoalModal()], '#notes': [msg('New note'), () => openKnowledgeWindow('note')], '#resources': [msg('New resource'), () => openKnowledgeWindow('resource')], '#tags': [msg('New tag'), () => openTagModal()], '#templates': [msg('New template'), () => callDomainHook('handleAction', 'new-template', { target: $('#mobile-quick-add-toggle') })], '#saved-views': [msg('New saved view'), () => callDomainHook('handleAction', 'new-saved-view', { target: $('#mobile-quick-add-toggle') })] });
  const quickAddDirect = () => QUICK_ADD_DIRECT[location.hash] || null;
  function syncQuickAddToggle() {
    const toggle = $('#mobile-quick-add-toggle');
    if (toggle && (quickAddDirect() || !toggle.hasAttribute('aria-expanded'))) setMobileQuickAddOpen(false);
  }

  function setMobileQuickAddOpen(open) {
    const root = $('#mobile-quick-add');
    const toggle = $('#mobile-quick-add-toggle');
    const menu = $('#mobile-quick-add-menu');
    if (!root || !toggle || !menu) return;
    const direct = !open && quickAddDirect();
    root.classList.toggle('is-open', open);
    if (direct) toggle.removeAttribute('aria-expanded');
    else toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', direct ? tr(direct[0]) : open ? tr('Close quick add menu') : tr('Open quick add menu'));
    menu.hidden = !open;
  }

  // Goal panels retain a logical trigger because rendering replaces its node.
  function goalFocusTarget(element = document.activeElement) {
    if (!(element instanceof HTMLElement)) return null;
    const keys = ['action', 'goalProperty', 'goalId', 'milestoneId', 'habitProperty', 'habitId', 'areaId', 'ownerType', 'ownerId', 'date'];
    const attrs = keys.filter(key => element.dataset[key] !== undefined).map(key => `[data-${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${cssEscape(element.dataset[key])}"]`).join('');
    return { element, selector: attrs || (element.id ? '#' + cssEscape(element.id) : '') };
  }

  function restoreGoalFocus(target) {
    if (!target) return;
    requestAnimationFrame(() => {
      const trigger = target.element?.isConnected ? target.element : target.selector && $(target.selector);
      const modal = $('#modal-root .modal');
      // A new decision may now be the highest overlay; never focus behind it.
      const control = modal ? (modal.contains(trigger) ? trigger : [...modal.querySelectorAll('input, select, textarea')].find(el => el.offsetParent !== null) || modal.querySelector('.modal-footer button, button')) : trigger || $('#main');
      control?.focus();
    });
  }
  let calendarOpen = false;
  let habitsOpen = false;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const nowIso = () => new Date().toISOString();
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const clampOrder = value => Number.isFinite(value) ? value : 999999;

  function parseLocalDate(value) {
    return Core.parseDateOnly(value);
  }

  // CSS.escape with a fallback for WebViews and jsdom that lack it (selectors for focus return and lookups).
  const cssEscape = value => (globalThis.CSS?.escape ? globalThis.CSS.escape(value) : String(value).replace(/["\\\]#.:]/g, '\\$&'));

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
    if (value === today) return tr('Today');
    if (value === Core.addDays(today, 1)) return tr('Tomorrow');
    if (value === Core.addDays(today, -1)) return tr('Yesterday');
    return formatDate(value);
  }

  function formatReminder(value) {
    if (!value) return tr('No reminder');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return tr('No reminder');
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

  // Redesign R11b (S15): the repeat editor's choices and the sentence for a rule. Weeks start on Monday.
  const REPEAT_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const REPEAT_SHORT_DAYS = [msg('Sun'), msg('Mon'), msg('Tue'), msg('Wed'), msg('Thu'), msg('Fri'), msg('Sat')];
  const REPEAT_ON_DAYS = [msg('on Sundays'), msg('on Mondays'), msg('on Tuesdays'), msg('on Wednesdays'), msg('on Thursdays'), msg('on Fridays'), msg('on Saturdays')];
  const REPEAT_NTH = [[1, msg('First')], [2, msg('Second')], [3, msg('Third')], [4, msg('Fourth')], ['last', msg('Last')]];
  // Serbian ordinals agree with the weekday, so each pair is its own phrase.
  const REPEAT_NTH_WEEKDAY = {
    1: [msg('the first Sunday'), msg('the first Monday'), msg('the first Tuesday'), msg('the first Wednesday'), msg('the first Thursday'), msg('the first Friday'), msg('the first Saturday')],
    2: [msg('the second Sunday'), msg('the second Monday'), msg('the second Tuesday'), msg('the second Wednesday'), msg('the second Thursday'), msg('the second Friday'), msg('the second Saturday')],
    3: [msg('the third Sunday'), msg('the third Monday'), msg('the third Tuesday'), msg('the third Wednesday'), msg('the third Thursday'), msg('the third Friday'), msg('the third Saturday')],
    4: [msg('the fourth Sunday'), msg('the fourth Monday'), msg('the fourth Tuesday'), msg('the fourth Wednesday'), msg('the fourth Thursday'), msg('the fourth Friday'), msg('the fourth Saturday')],
    last: [msg('the last Sunday'), msg('the last Monday'), msg('the last Tuesday'), msg('the last Wednesday'), msg('the last Thursday'), msg('the last Friday'), msg('the last Saturday')],
  };
  const REPEAT_PRESETS = [[msg('Every day'), { frequency: 'daily', interval: 1 }], [msg('Every week'), { frequency: 'weekly', interval: 1 }], [msg('Every month'), { frequency: 'monthly', interval: 1 }], [msg('Every 3 months'), { frequency: 'monthly', interval: 3 }], [msg('Every year'), { frequency: 'yearly', interval: 1 }]];
  const REPEAT_FREQUENCIES = [['daily', msg('Day by day')], ['weekly', msg('Weekly')], ['monthly', msg('Monthly')], ['yearly', msg('Yearly')]];
  const REPEAT_DATE_FMT = new Intl.DateTimeFormat(I18n.locale(), { weekday: 'short', month: 'short', day: 'numeric' });

  function repeatList(items) {
    return items.length > 1 ? tr('{list} and {last}', { list: items.slice(0, -1).join(', '), last: items[items.length - 1] }) : items[0] || '';
  }

  function recurrenceLabel(recurrence) {
    if (!recurrence) return tr('Does not repeat');
    const interval = Math.max(1, Number(recurrence.interval) || 1);
    const cap = text => text.charAt(0).toUpperCase() + text.slice(1);
    let text;
    // Interval 1 has its own wording: Serbian plural "one" also covers 21, 31 …
    if (recurrence.frequency === 'daily') text = interval === 1 ? tr('Every day') : trn(interval, 'Every {count} day', 'Every {count} days');
    else if (recurrence.frequency === 'weekly' && recurrence.weekdays?.length) {
      const days = REPEAT_DAY_ORDER.filter(day => recurrence.weekdays.includes(day));
      const names = days.join() === '1,2,3,4,5' ? tr('on weekdays') : days.join() === '6,0' ? tr('on weekends') : repeatList(days.map(day => tr(REPEAT_ON_DAYS[day])));
      text = interval === 1 ? cap(names) : trn(interval, 'Every {count} week, {days}', 'Every {count} weeks, {days}', { days: names });
    } else if (recurrence.frequency === 'weekly') text = interval === 1 ? tr('Every week') : trn(interval, 'Every {count} week', 'Every {count} weeks');
    else if (recurrence.frequency === 'monthly' && recurrence.monthMode === 'weekday') {
      const which = tr(REPEAT_NTH_WEEKDAY[recurrence.weekOfMonth]?.[recurrence.weekday] || '');
      text = interval === 1 ? cap(tr('{which} of every month', { which })) : trn(interval, 'Every {count} month, {which}', 'Every {count} months, {which}', { which });
    } else if (recurrence.frequency === 'monthly' && recurrence.monthMode === 'day' && recurrence.monthDay === 'last') {
      text = interval === 1 ? tr('Every month on the last day') : trn(interval, 'Every {count} month, on the last day', 'Every {count} months, on the last day');
    } else if (recurrence.frequency === 'monthly' && recurrence.monthMode === 'day') {
      text = interval === 1 ? tr('Every month on day {day}', { day: recurrence.monthDay }) : trn(interval, 'Every {count} month, on day {day}', 'Every {count} months, on day {day}', { day: recurrence.monthDay });
    } else if (recurrence.frequency === 'yearly') text = interval === 1 ? tr('Every year') : trn(interval, 'Every {count} year', 'Every {count} years');
    else text = interval === 1 ? tr('Every month') : trn(interval, 'Every {count} month', 'Every {count} months');
    if (recurrence.endType === 'date' && recurrence.endDate) text += ` · ${tr('until {date}', { date: formatDate(recurrence.endDate) })}`;
    else if (recurrence.endType === 'afterOccurrences' && recurrence.endAfterOccurrences) text += ` · ${trn(recurrence.endAfterOccurrences, '{count} time', '{count} times')}`;
    // R11c (S14): a paused or ended repeat says so.
    if (recurrence.status === 'paused') text += ` · ${tr('paused')}`;
    else if (recurrence.status === 'ended') text += ` · ${tr('ended')}`;
    return text;
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
      settings: { ...Core.normalizeV16Settings({}), shortcuts: { ...SHORTCUT_DEFAULTS } },
      ui: {
        suggestionsExpanded: false,
        todayCompletedExpanded: false,
        projectCompletedExpanded: {},
        completedProjectFilter: '',
        completedPeriod: 0,
        inboxFilter: 'all',
        calendarView: 'week',
        calendarDayMode: 'list',
        calendarVisibility: { tasks: true, habits: true, goals: true, milestones: true },
        habitTrackerMonth: Core.dateOnly().slice(0, 7),
      },
    };
  }

  function createSampleState() {
    const today = Core.dateOnly();
    const state = createEmptyState();
    const ts = nowIso();
    const projects = [
      { id: 'project_client', name: tr('Client Website'), color: PROJECT_COLORS[0], order: 0, areaId: null, goalIds: [], isArchived: false, createdAt: ts, updatedAt: ts },
      { id: 'project_portfolio', name: tr('Portfolio'), color: PROJECT_COLORS[2], order: 1, areaId: null, goalIds: [], isArchived: false, createdAt: ts, updatedAt: ts },
      { id: 'project_personal', name: tr('Personal'), color: PROJECT_COLORS[1], order: 2, areaId: null, goalIds: [], isArchived: false, createdAt: ts, updatedAt: ts },
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
      isImportant: false,
      isUrgent: false,
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
      mkTask('task_homepage', tr('Finish homepage'), {
        projectId: 'project_client', plannedDate: today, dueDate: Core.addDays(today, 3), todayOrder: 0, projectOrder: 0,
        notes: tr('Finish responsive pass before sending the preview link.'),
        subtasks: [
          { id: 'sub_mobile', title: tr('Test responsive layout'), isCompleted: false, order: 0 },
          { id: 'sub_form', title: tr('Check contact form'), isCompleted: true, order: 1 },
          { id: 'sub_link', title: tr('Send preview link'), isCompleted: false, order: 2 },
        ],
      }),
      mkTask('task_invoice', tr('Send client invoice'), { projectId: 'project_client', dueDate: Core.addDays(today, -1), projectOrder: 1 }),
      mkTask('task_groceries', tr('Buy groceries'), { projectId: 'project_personal', plannedDate: today, todayOrder: 1, projectOrder: 0 }),
      mkTask('task_plugin', tr('Check plugin update'), { isInbox: true, dueDate: Core.addDays(today, 2), inboxOrder: 0 }),
      mkTask('task_accountant', tr('Call accountant'), { isInbox: true, inboxOrder: 1 }),
      mkTask('task_copy', tr('Review portfolio copy'), { projectId: 'project_portfolio', plannedDate: Core.addDays(today, -1), dueDate: Core.addDays(today, 2), projectOrder: 0 }),
      mkTask('task_hosting', tr('Renew hosting'), { projectId: 'project_personal', dueDate: Core.addDays(today, 1), projectOrder: 1 }),
      mkTask('task_portfolio', tr('Update portfolio case study'), { projectId: 'project_portfolio', plannedDate: Core.addDays(today, 3), dueDate: Core.addDays(today, 7), projectOrder: 1 }),
      mkTask('task_done_today', tr('Reply to client feedback'), { projectId: 'project_client', isCompleted: true, completedAt: new Date().toISOString(), projectOrder: 2 }),
      mkTask('task_done_yesterday', tr('Create homepage wireframe'), { projectId: 'project_client', isCompleted: true, completedAt: new Date(Date.now() - 86400000).toISOString(), projectOrder: 3 }),
    ];
    return state;
  }

  function normalizeState(input) {
    const migrated = Core.migrateStateV3(input);
    if (!migrated.ok) throw new Error(migrated.reason || 'invalid-state');
    const next = Core.migrateStateV16(migrated.state).state;
    next.settings = Core.normalizeV16Settings(next.settings);
    next.ui = next.ui || {};
    next.settings.shortcuts = Object.fromEntries(Object.entries(SHORTCUT_DEFAULTS).map(([key,value])=>[key,Object.hasOwn(next.settings.shortcuts || {},key) ? Core.normalizeShortcut(next.settings.shortcuts[key]) : value]));
    next.ui.suggestionsExpanded = Boolean(next.ui.suggestionsExpanded);
    next.ui.todayCompletedExpanded = Boolean(next.ui.todayCompletedExpanded);
    next.ui.projectCompletedExpanded = next.ui.projectCompletedExpanded || {};
    next.ui.completedProjectFilter = next.ui.completedProjectFilter || '';
    next.ui.completedPeriod = Number(next.ui.completedPeriod) || 0;
    next.ui.inboxFilter = INBOX_FILTERS.some(([value]) => value === next.ui.inboxFilter) ? next.ui.inboxFilter : 'all';
    // Redesign R7 (C1, C6): Nedelja, Mesec or Predstojeće; a stored V1.12 "day" view is the week on its Raspored.
    if (next.ui.calendarView === 'day') next.ui.calendarDayMode = 'schedule';
    next.ui.calendarView = ['week', 'month', 'upcoming'].includes(next.ui.calendarView) ? next.ui.calendarView : 'week';
    next.ui.calendarDayMode = next.ui.calendarDayMode === 'schedule' ? 'schedule' : 'list';
    next.ui.tasksView = next.ui.tasksView === 'projects' ? 'projects' : 'anytime';
    next.ui.todayExpanded = Object.fromEntries(['overdue', 'today', 'habits'].map(key => [key, next.ui.todayExpanded?.[key] === true]));
    next.ui.calendarVisibility = Object.fromEntries(['tasks', 'habits', 'goals', 'milestones'].map(type => [type, next.ui.calendarVisibility?.[type] !== false]));
    const habitMonth = String(next.ui.habitTrackerMonth || '');
    next.ui.habitTrackerMonth = /^\d{4}-\d{2}$/.test(habitMonth) && Core.parseDateOnly(`${habitMonth}-01`) ? habitMonth : Core.dateOnly().slice(0, 7);
    next.tags = (next.tags || []).map((tag, i) => ({
      ...tag,
      id: tag.id || uid('tag'),
      name: Core.normalizeTagName(tag.name),
      color: Core.safeColor(tag.color, PROJECT_COLORS[i % PROJECT_COLORS.length]),
      createdAt: tag.createdAt || nowIso(),
      updatedAt: tag.updatedAt || nowIso(),
    }));
    next.tasks = next.tasks.map(t => ({
      notes: '', projectId: null, plannedDate: null, dueDate: null, reminderAt: null,
      reminderFiredAt: null, recurrence: null, tagIds: [], priority: 'none', attachmentIds: [], isInbox: false,
      isImportant: false, isUrgent: false, isCompleted: false, completedAt: null, subtasks: [], todayOrder: null,
      projectOrder: null, inboxOrder: null, createdAt: nowIso(), updatedAt: nowIso(), ...t,
      tagIds: Array.isArray(t.tagIds) ? t.tagIds : [],
      priority: ['none', 'low', 'medium', 'high'].includes(t.priority) ? t.priority : 'none',
      isImportant: Boolean(t.isImportant),
      isUrgent: Boolean(t.isUrgent),
      attachmentIds: Array.isArray(t.attachmentIds) ? t.attachmentIds : [],
      subtasks: (t.subtasks || []).map((s, i) => ({ ...s, id: s.id || uid('sub'), title: s.title || '', isCompleted: Boolean(s.isCompleted), order: Number.isFinite(s.order) ? s.order : i })),
    }));
    next.projects = next.projects.map((p, i) => ({ order: i, createdAt: nowIso(), updatedAt: nowIso(), isArchived: false, archivedAt: null, ...p, color: Core.safeColor(p.color, PROJECT_COLORS[i % PROJECT_COLORS.length]) }));
    next.areas = (next.areas || []).map((area, i) => ({
      name: '', color: PROJECT_COLORS[i % PROJECT_COLORS.length], icon: AREA_ICONS[0], status: 'active', isPinned: false,
      createdAt: nowIso(), updatedAt: nowIso(), ...area,
      color: Core.safeColor(area.color, PROJECT_COLORS[i % PROJECT_COLORS.length]),
      name: Core.normalizeTagName(area.name),
      status: area.status === 'archived' ? 'archived' : 'active',
      isPinned: Boolean(area.isPinned),
    }));
    for (const key of ['notes', 'resources']) next[key] = next[key].map(item => ({
      ...item, tagIds: Array.isArray(item.tagIds) ? [...new Set(item.tagIds.filter(id => typeof id === 'string'))] : [], createdAt: item.createdAt || nowIso(), updatedAt: item.updatedAt || nowIso(),
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
    next.templates = (next.templates || []).map(template => {
      const data = { ...(template.data || {}) };
      if (template.type === 'task') {
        const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(data.scheduleDate || '')) && Core.parseDateOnly(data.scheduleDate);
        const validDate = parsedDate && Core.dateOnly(parsedDate) === data.scheduleDate;
        data.scheduleEnabled = data.scheduleEnabled === true && Boolean(validDate);
        data.scheduleDate = validDate ? data.scheduleDate : null;
        data.scheduleGeneratedOn = validDate && /^\d{4}-\d{2}-\d{2}$/.test(String(data.scheduleGeneratedOn || '')) ? data.scheduleGeneratedOn : null;
      }
      return { ...template, data };
    });
    next.habitMetrics = next.habitMetrics || {};
    return Core.normalizeState(next);
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
        globalNotice(tr('An interrupted operation needs recovery. {operationError} {rollbackError} Recovery copy retained. Retry recovery.', { operationError: trMessage(interrupted.operationError), rollbackError: trMessage(interrupted.rollbackError) }), () => rollbackGlobalOperation(op, new Error(interrupted.operationError || msg('Interrupted operation'))));
        return;
      }
      function finishLoadedState(loadedSource) {
        if (!retained.length) return loadedSource;
        // Status belongs to the validated state just loaded, including when
        // cleanup finishes asynchronously after another tab has changed it.
        const statusSource = { ...captureStatusSource(), raw: loadedSource };
        updateBackupStatus({ snapshotAvailable: true, validationResult: msg('Recovery copy retained; cleanup is required') }, statusSource);
        globalNotice(tr('A temporary recovery copy remains after a completed or canceled operation. Retry cleanup.'), async () => {
          const cleanupSource = captureStatusSource();
          await TodoStorage.recoverySnapshots.deleteMany(retained.map(item => item.id));
          updateBackupStatus({ snapshotAvailable: false, validationResult: msg('Recovery copy removed') }, cleanupSource);
          if (globalOperation?.reason === 'cleanup') globalOperation = null;
          globalRecoveryNotice = null; renderToast();
        });
        return statusSource.raw;
      }
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
          throw new Error(msg('Local data keeps changing in another tab; retry migration.'));
        }
        recovery = null;
        state = normalizeState(createSampleState());
        saveState();
        rememberSample();
        return finishLoadedState(localStorage.getItem(STORAGE_KEY));
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
        throw new Error(msg('Local data keeps changing in another tab; retry migration.'));
      }
      let committedSource = sourceAtStart;
      const focusSelectionChanged = JSON.stringify(parsed.settings?.focusTaskIds) !== JSON.stringify(prepared.settings.focusTaskIds);
      const v16SettingsChanged = JSON.stringify(parsed.settings || {}) !== JSON.stringify(prepared.settings || {});
      if (migration.migrated || focusSelectionChanged || v16SettingsChanged) {
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
        throw new Error(msg('Local data keeps changing in another tab; retry migration.'));
      }
      recovery = null;
      state = prepared;
      return finishLoadedState(committedSource);
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

  function scheduleAutomaticSnapshot() {
    clearTimeout(automaticSnapshotTimer);
    automaticSnapshotTimer = setTimeout(async () => {
      automaticSnapshotTimer = null;
      if (!state || recovery || globalOperation || undoHold) return;
      const previousError = automaticSnapshotError;
      try { await TodoStorage.createAutomaticSnapshot(state); automaticSnapshotError = null; }
      catch (error) { automaticSnapshotError = error.message; }
      if (state && !globalOperation && previousError !== automaticSnapshotError) render();
    }, 1000);
  }

  function saveState() {
    if (!state || globalOperation) return false;
    try {
      const persisted = Core.normalizeState(state);
      state.settings.focusTaskIds = persisted.settings.focusTaskIds;
      delete persisted.habitLogCache;
      delete persisted.habitMetrics;
      const writer = typeof TodoStorage !== 'undefined' && (TodoStorage.writeCanonicalStateSync || TodoStorage.writeCanonicalState);
      const expectedRaw = typeof canonicalRaw === 'undefined' ? null : canonicalRaw;
      if (writer) canonicalRaw = writer(persisted, expectedRaw);
      else {
        const canRead = typeof localStorage.getItem === 'function';
        const before = canRead ? localStorage.getItem(STORAGE_KEY) : null;
        if (expectedRaw !== null && before !== expectedRaw) throw new Error(msg('Canonical data changed in another tab; refresh before saving.'));
        const raw = JSON.stringify(persisted);
        if (canRead && localStorage.getItem(STORAGE_KEY) !== before) throw new Error(msg('Canonical data changed in another tab; refresh before saving.'));
        localStorage.setItem(STORAGE_KEY, raw);
        if (typeof canonicalRaw !== 'undefined') canonicalRaw = raw;
      }
      storageError = false;
      if (globalThis.DailoPlatform?.isNative) scheduleDurableMirror();
      if (globalThis.DailoPlatform?.isNative) scheduleNotificationPlan();
      scheduleAutomaticSnapshot();
      scheduleSync();
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
    textSaveTimer = setTimeout(() => { textSaveTimer = null; saveState(); }, 220);
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
      get popoverEl() { return popoverEl; },
      getHabit, habitMetrics, habitDraft, openHabitModal, refreshHabitMetrics,
      setHabitLog, updateHabitStatus, snoozeHabit, syncHabitGoalLinks,
      areaDefaults: { color: PROJECT_COLORS[0], icon: AREA_ICONS[0] },
      Core, getTask, getGoal, getProject, allProjects, sortedProjects, projectTasks, goalProgressLabel, goalStatusLabel, relativeDateLabel, formatReminder, recurrenceLabel, taskRecurrence, priorityLabel, priorityIcon, tagSummary, clampOrder, emptyState,
      render, restoreGoalFocus, captureGoalProgress, evaluateGoalProgressChanges,
      putGoalHistory, goalDraft, openGoalModal, openPopover, templateMenuEntry, syncGoalLinks,
      maybePromptGoalReached, updateGoalStatus, saveAndRender,
      $, $$, esc, PROJECT_COLORS, AREA_ICONS, knowledgeCollection, getArea, sortedAreas, attachmentOwner,
      pageHeader, modalFrame, renderMain, renderModal, currentRoute,
      knowledgeAttachmentCache, readOwnerAttachments, renderAttachmentRow,
      renderAttachmentsSection, loadOwnerAttachments, addAttachments,
      closePopover, flushTextSave, scheduleTextSave, goalFocusTarget, closeModal,
      openGoalHistory,
      nowIso, uid, copyTemplate, saveState, navigate, setToastMessage, requestDeleteEntity, openConfirm, setUndo,
      calendarDate, parseLocalDate, formatDate, navigateCalendar, openPlanPicker, listTasks, deadlineRow,
      refreshSheet, openHabitDetails, openGoalDetails,
      openHabitStartSheet(anchor) { openDateSheet(anchor, { type: 'habit' }, 'start'); },
      calendarTaskRow(task) { return taskRow(task, 'calendar', { today: true }); },
      templateTypes: TEMPLATE_TYPES, templateLabel, openTemplateEditorFromSource, saveTemplateRecord, duplicateTemplateRecord, useTemplate,
      captureModalReturnFocus,
      durationLabel,
      todayDueLabel, openHabitValue,
      looseTasks(completed) { return listTasks().filter(task => !task.projectId && !task.isInbox && Boolean(task.isCompleted) === completed); },
      goalPercent(goal) { return Math.round(Core.computeGoalProgress(goal, state, state.habitMetrics || {}).percent); },
      syncView,
      reviewTaskRow(task, context, options = {}) {
        return taskRow(task, context, options);
      },
      renderProjectTaskRow(task, projectId, options = {}) {
        return taskRow(task, options.completed ? 'completed' : `project:${projectId}`, options);
      },
      toggleProjectCompleted(projectId) {
        state.ui.projectCompletedExpanded[projectId] = !state.ui.projectCompletedExpanded[projectId];
        saveAndRender();
      },
      openProjectModal, saveProjectModal, archiveProject, restoreProject, deleteProject,
      openQuickAdd, openGoalModal, openHabitModal,
      renderAreaTaskRow(task, areaId) { return taskRow(task, `area:${areaId}`, { today: true }); },
      renderChoreRow(task, options = {}) { return taskRow(task, 'cleaning', { today: true, metaText: options.metaText, sideHtml: options.sideHtml }); },
      renderGoalListRow(goal) { return callDomainHook('renderRoute', { type: 'goal-list-row', goal }) || ''; },
      renderHabitListRow(habit) { return callDomainHook('renderRoute', { type: 'habit-list-row', habit }) || ''; },
      projectOverviewRow(project) { return projectOverviewRow(project, listTasks()); },
      renderGoalRow, renderHabitRow,
      renderSavedViewItem(view, item, today) {
        // R10d (S8): the rows of their screens — Today rows, Ciljevi rows and compact habit rows.
        return view.type === 'tasks' ? taskRow(item, 'saved-view', { today: true }) : view.type === 'goals' ? callDomainHook('renderRoute', { type: 'goal-list-row', goal: item }) || '' : callDomainHook('renderRoute', { type: 'habit-list-row', habit: item }) || '';
      },
      saveSavedViewDraft(id, draft) {
        const existing = state.savedViews.find(view => view.id === id);
        const view = { ...draft, name: draft.name.trim(), id: existing?.id || uid('view'), createdAt: existing?.createdAt || nowIso(), updatedAt: nowIso() };
        if (existing) state.savedViews.splice(state.savedViews.indexOf(existing), 1, view); else state.savedViews.push(view);
        saveState(); closeModal(); render(); setToastMessage(tr('View saved'));
      },
      duplicateSavedView(id) {
        const source = state.savedViews.find(view => view.id === id);
        if (!source) return;
        const view = copyTemplate(source); view.id = uid('view'); view.name = tr('{name} (copy)', { name: source.name }); view.isPinned = false; view.createdAt = view.updatedAt = nowIso(); state.savedViews.push(view); saveAndRender();
        setToastMessage(tr('View duplicated'));
      },
      toggleSavedViewPin(id) {
        const view = state.savedViews.find(item => item.id === id);
        if (!view) return;
        view.isPinned = !view.isPinned; view.updatedAt = nowIso(); saveAndRender();
      },
      shortcutLabels: SHORTCUT_LABELS,
      release: Release,
      environmentInfo() {
        return { userAgent: navigator.userAgent || '', standalone: navigator.standalone === true || Boolean(window.matchMedia?.('(display-mode: standalone)').matches), persistence: storagePersistence.state };
      },
      storagePersistence: () => storagePersistence,
      shortcutError: () => shortcutError,
      // Native app: the notification permission and (Android) exact-alarm state; null on the web.
      notificationSettings: () => (globalThis.DailoPlatform?.isNative ? { permission: notificationPermission, exact: exactAlarmState } : null),
      notificationButtonLabel() {
        return typeof Notification === 'undefined' ? tr('Unavailable') : (Notification.permission === 'granted' ? tr('Enabled') : Notification.permission === 'denied' ? tr('Blocked') : tr('Enable'));
      },
      saveShortcut,
      disableShortcut,
      resetShortcuts,
      savePersonalization
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
    if (['today', 'inbox', 'tasks', 'more', 'upcoming', 'calendar', 'anytime', 'tags', 'areas', 'notes', 'resources', 'goals', 'habits', 'templates', 'projects', 'cleaning', 'saved-views', 'archived', 'completed', 'review', 'settings'].includes(hash)) return { type: hash };
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
    if (hash.startsWith('tag/')) {
      const id = decodeURIComponent(hash.slice('tag/'.length));
      return getTag(id) ? { type: 'tag', id } : { type: 'tags' };
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
    // Redesign R8c (S13): a habit's details open as a window over the current screen.
    const habitRoute = /^#?habit\/(.+)$/.exec(route);
    if (habitRoute) { openHabitDetails(decodeURIComponent(habitRoute[1])); return; }
    // Redesign R9b (GO5): so does a goal.
    const goalRoute = /^#?goal\/(.+)$/.exec(route);
    if (goalRoute) { openGoalDetails(decodeURIComponent(goalRoute[1])); return; }
    // Redesign R10b (S3): so do a note and a resource.
    const knowledgeRoute = /^#?(note|resource)\/(.+)$/.exec(route);
    if (knowledgeRoute) { openKnowledgeWindow(knowledgeRoute[1], decodeURIComponent(knowledgeRoute[2])); return; }
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

  // Inbox remains task-first. Other entity types are opt-in via isInbox so the
  // filters can grow without turning every unassigned object into a capture.
  function inboxRecordsForState(source, filter = 'all') {
    const tasks = (source.tasks || []).filter(Core.isInboxActive).sort((a, b) => clampOrder(a.inboxOrder) - clampOrder(b.inboxOrder) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).map(item => ({ type: 'task', item }));
    const records = {
      goals: (source.goals || []).filter(item => item.isInbox === true && item.status !== 'archived').map(item => ({ type: 'goal', item })),
      habits: (source.habits || []).filter(item => item.isInbox === true && item.status !== 'archived').map(item => ({ type: 'habit', item })),
      notes: (source.notes || []).filter(item => item.isInbox === true).map(item => ({ type: 'note', item })),
      resources: (source.resources || []).filter(item => item.isInbox === true).map(item => ({ type: 'resource', item })),
    };
    if (filter === 'tasks') return tasks;
    if (records[filter]) return records[filter];
    // Keep the user's Inbox order for tasks; other opt-in records follow them.
    return [...tasks, ...records.goals, ...records.habits, ...records.notes, ...records.resources];
  }

  function activeInboxRecords(filter = 'all') {
    return inboxRecordsForState(state, filter);
  }

  function removeInboxRecordFromState(source, type, id, timestamp) {
    const collection = type === 'note' ? 'notes' : type === 'resource' ? 'resources' : `${type}s`;
    const item = source?.[collection]?.find(candidate => candidate.id === id);
    if (!item || item.isInbox !== true) return false;
    item.isInbox = false;
    item.updatedAt = timestamp;
    return true;
  }

  function inboxItem(type, id) {
    const collection = type === 'note' ? 'notes' : type === 'resource' ? 'resources' : `${type}s`;
    return (state[collection] || []).find(item => item.id === id) || null;
  }

  // Redesign R6 (I5, I6): "Razvrstano" only takes the item out of Inbox, with Undo.
  function removeInboxRecord(type, id) {
    if (!removeInboxRecordFromState(state, type, id, nowIso())) return;
    saveAndRender(); renderModal();
    setUndo(msg('Sorted'), () => { const item = inboxItem(type, id); if (!item) return; item.isInbox = true; item.updatedAt = nowIso(); saveState(); render(); renderModal(); });
  }

  // Redesign R6 (I5): "Oblast…" sorts a note, resource, goal or habit into an area, with Undo.
  function openInboxAreaSheet(anchor, type, id) {
    const item = inboxItem(type, id);
    if (!item) return;
    const areas = sortedAreas().filter(area => area.status !== 'archived');
    const options = areas.map(area => `<button class="popover-option sheet-option${item.areaId === area.id ? ' is-selected' : ''}" type="button" data-pop-action="inbox-set-area" data-inbox-type="${esc(type)}" data-inbox-id="${esc(id)}" data-area-id="${esc(area.id)}"><span class="sheet-option-label">${esc(area.name)}</span><span class="sheet-radio${item.areaId === area.id ? ' is-on' : ''}" aria-hidden="true"></span></button>`).join('');
    openPopover(anchor, `<div class="popover-title">${tr('Area')}</div><p class="sheet-subtitle">${esc(item.title || item.name || '')}</p><div class="sheet-card">${options || `<div class="popover-empty">${tr('No areas yet.')}</div>`}</div><p class="sheet-note">${tr('A tap sorts the item into the area.')}</p>`, { type: 'inbox-area' });
  }
  function setInboxArea(type, id, areaId) {
    const item = inboxItem(type, id);
    const area = getArea(areaId);
    if (!item || !area) return;
    const previous = { areaId: item.areaId ?? null, isInbox: item.isInbox };
    item.areaId = area.id; item.isInbox = false; item.updatedAt = nowIso();
    closePopover(); saveState(); render(); renderModal();
    setUndo(msg('Moved to area'), () => { const current = inboxItem(type, id); if (!current) return; Object.assign(current, previous, { updatedAt: nowIso() }); saveState(); render(); renderModal(); });
  }

  function inboxGroupForDate(value, today = Core.dateOnly()) {
    const raw = String(value || '');
    // Date-only values already represent a calendar day. Timestamps need to
    // be converted through the user's local timezone before grouping.
    const dateOnlyValue = /^\d{4}-\d{2}-\d{2}$/.test(raw);
    const parsedValue = dateOnlyValue ? null : new Date(value);
    const date = parsedValue && !Number.isNaN(parsedValue.getTime()) ? Core.dateOnly(parsedValue) : raw.slice(0, 10);
    if (date === today) return msg('Today');
    if (date === Core.addDays(today, -1)) return msg('Yesterday');
    const parsed = Core.parseDateOnly(today);
    const mondayOffset = (parsed.getDay() + 6) % 7;
    const startOfWeek = Core.addDays(today, -mondayOffset);
    if (date >= startOfWeek && date <= today) return msg('This week');
    return msg('Earlier');
  }

  // Redesign R6 (I5): a task is a Today row with Danas / Sutra / Kad stignem / Projekat…; another item has its
  // icon, title and type with Otvori / Oblast… / Razvrstano.
  function renderInboxRecord(record) {
    if (record.type === 'task') return taskRow(record.item, 'inbox', { today: true, inbox: true, draggable: true });
    const item = record.item;
    const label = { goal: msg('Goal'), habit: msg('Habit'), note: msg('Note'), resource: msg('Resource') }[record.type] || msg('Item');
    const icon = record.type === 'goal' ? 'ph-target' : record.type === 'habit' ? 'ph-repeat' : record.type === 'note' ? 'ph-note' : 'ph-link';
    const attrs = `data-inbox-type="${esc(record.type)}" data-inbox-id="${esc(item.id)}"`;
    return `<article class="today-row inbox-item-row" ${attrs}><span class="inbox-item-icon" aria-hidden="true"><i class="ph ${icon}"></i></span><button class="today-row-main" type="button" data-route="${esc(record.type)}/${esc(item.id)}"><span class="task-title">${esc(item.title || item.name || tr(label))}</span><span class="task-meta">${tr(label)}</span></button><div class="quick-actions inbox-item-chips"><button class="quick-chip" type="button" data-route="${esc(record.type)}/${esc(item.id)}">${tr('Open details')}</button><button class="quick-chip" type="button" data-action="inbox-area" ${attrs}>${tr('Area…')}</button><button class="quick-chip" type="button" data-action="inbox-remove" ${attrs}>${tr('Sorted')}</button></div></article>`;
  }


  function projectTasks(projectId, completed = false) {
    return state.tasks
      .filter(t => t.projectId === projectId && Boolean(t.isCompleted) === completed)
      .sort(completed
        ? (a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || ''))
        : (a, b) => clampOrder(a.projectOrder) - clampOrder(b.projectOrder) || b.createdAt.localeCompare(a.createdAt));
  }

  // Focus survives a re-render (audit A-2): the focused control in the main view or bottom navigation is
  // found again by its id or data attributes. A route change names the page and moves focus to its heading.
  const FOCUS_KEYS = ['action', 'route', 'taskId', 'projectId', 'goalId', 'habitId', 'areaId', 'tagId', 'ownerType', 'ownerId', 'date', 'goalProperty', 'habitProperty', 'milestoneId', 'section', 'filter', 'value'];
  function focusDescriptor(element) {
    const region = element instanceof HTMLElement && element !== document.body ? element.closest('#main, #mobile-bottom-nav') : null;
    if (!region) return null;
    // Rendering must never fail on focus bookkeeping, so a missing CSS.escape (old WebViews, jsdom) has a fallback.
    const escape = value => (globalThis.CSS?.escape ? globalThis.CSS.escape(value) : String(value).replace(/["\\\]#.:]/g, '\\$&'));
    if (element.id) return `#${escape(element.id)}`;
    const attrs = FOCUS_KEYS.filter(key => element.dataset[key] !== undefined).map(key => `[data-${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${escape(element.dataset[key])}"]`).join('');
    // Searched within its own region: the same data attributes can appear in another part of the page.
    return attrs ? `#${region.id} ${element.tagName.toLowerCase()}${attrs}` : null;
  }
  let renderedRoute = null;
  function render() {
    const focused = focusDescriptor(document.activeElement);
    renderView();
    const route = location.hash || '#today';
    const routeChanged = renderedRoute !== null && route !== renderedRoute;
    renderedRoute = route;
    announceRoute(routeChanged);
    if (!routeChanged && focused && (!document.activeElement || document.activeElement === document.body)) $(focused)?.focus({ preventScroll: true });
  }
  function announceRoute(moveFocus) {
    const heading = $('#main .page-title');
    const name = heading?.textContent?.trim();
    document.title = name ? `${name} · Dailo` : 'Dailo';
    if (moveFocus && !modalState && heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
  }

  function renderView() {
    const app = $('#app');
    if (!app) return;
    if (recovery) {
      $('#main').innerHTML = renderRecovery();
      renderMobileBottomNav();
      return;
    }
    renderMain();
    renderMobileBottomNav();
  }

  // Redesign R1 (G1, M4): six bottom items; every other route lights up the item it lives under.
  const BOTTOM_NAV_PARENT = { anytime: 'tasks', projects: 'tasks', project: 'tasks', upcoming: 'calendar', habit: 'habits' };
  function bottomNavRoute(route) {
    if (['today', 'inbox', 'tasks', 'calendar', 'habits', 'more'].includes(route.type)) return route.type;
    return BOTTOM_NAV_PARENT[route.type] || 'more';
  }

  function renderMobileBottomNav() {
    const nav = $('#mobile-bottom-nav');
    if (!nav) return;
    nav.hidden = Boolean(recovery);
    if (recovery || !state) return;
    const route = currentRoute();
    const moduleRoute = bottomNavRoute(route);
    nav.querySelectorAll('[data-route]').forEach(button => {
      const active = button.dataset.route === moduleRoute;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const badge = $('#mobile-inbox-badge');
    const count = activeInboxRecords('all').length;
    if (badge) { badge.textContent = count > 99 ? '99+' : String(count); badge.hidden = count === 0; }
  }

  function navItem(route, icon, label, active, badge = '', attrs = '') {
    return `<button class="nav-item ${active ? 'is-active' : ''}" type="button" data-route="${route}" ${attrs} title="${label}">
      <i class="ph ${icon}"></i><span class="nav-label">${label}</span>${badge ? `<span class="nav-badge">${badge}</span>` : ''}
    </button>`;
  }

  function storageWarningHtml() {
    if (storageError) return `<div class="global-warning" role="alert">${tr("Changes couldn't be saved locally. Refreshing may cause data loss.")} <button class="btn btn-secondary" data-action="retry-save">${tr('Retry save')}</button></div>`;
    if (automaticSnapshotError) return `<div class="global-warning" role="alert">${tr('Automatic snapshot failed: {error}. Your last saved app data remains available.', { error: esc(trMessage(automaticSnapshotError)) })} <button class="btn btn-secondary" data-action="retry-snapshot">${tr('Retry snapshot')}</button></div>`;
    return '';
  }

  function renderMain() {
    const comfortable = state.settings.compactDensity === false;
    document.documentElement.style.setProperty('--content-gutter', comfortable ? '24px' : '20px');
    document.documentElement.style.setProperty('--control-height', comfortable ? '38px' : '32px');
    document.documentElement.style.setProperty('--task-min-height', comfortable ? '52px' : '44px');
    const route = currentRoute();
    enterCalendarRoute(route);
    enterHabitsRoute(route);
    const main = $('#main');
    const warning = storageWarningHtml();
    let content = callDomainHook('renderRoute', route);
    if (content === undefined) {
      if (route.type === 'today') content = renderToday();
      else if (route.type === 'more') content = renderMoreScreen();
      else if (route.type === 'tasks') content = renderTasksScreen();
      else if (route.type === 'inbox') content = renderInbox();
      else if (route.type === 'anytime') content = renderAnytime();
      else if (route.type === 'tags') content = renderTags();
      else if (route.type === 'tag') content = renderTag(route.id);
      else if (route.type === 'completed') content = renderCompleted();
      else content = renderToday();
    }
    main.innerHTML = `${warning}<div class="content ${route.type === 'calendar' && state.ui.calendarView !== 'upcoming' ? 'calendar-content' : ''}">${content}</div>`;
    // An old #habit/<id> address shows the Habits screen with the details window on top (R8c).
    if (route.type === 'habit') { history.replaceState(null, '', '#habits'); openHabitDetails(route.id); }
    // An old #goal/<id> address shows Ciljevi with the goal window on top (R9b).
    if (route.type === 'goal') { history.replaceState(null, '', '#goals'); openGoalDetails(route.id); }
    if (['note', 'resource'].includes(route.type)) { history.replaceState(null, '', route.type === 'note' ? '#notes' : '#resources'); openKnowledgeWindow(route.type, route.id); }
    syncQuickAddToggle(); // after the redirects above
  }

  function pageHeader(title, subtitle, options = {}) {
    const addButton = options.add !== false ? `<button class="btn btn-primary" type="button" data-action="quick-add" ${options.contextProjectId ? `data-project-id="${esc(options.contextProjectId)}"` : ''} ${options.contextToday ? 'data-today="true"' : ''} ${options.contextAnytime ? 'data-anytime="true"' : ''}><i class="ph ph-plus"></i> ${tr('Add task')}</button>` : '';
    const projectMenu = options.projectMenu ? `<button class="btn-icon" type="button" data-action="project-menu" data-project-id="${esc(options.projectMenu)}" aria-label="${tr('Project menu')}"><i class="ph ph-dots-three"></i></button>` : '';
    const actionHtml = options.actionHtml || '';
    return `<header class="page-header">
      <div>${options.eyebrow ? `<p class="page-eyebrow">${esc(options.eyebrow)}</p>` : ''}<h1 class="page-title">${esc(title)}</h1>${subtitle ? `<p class="page-subtitle">${esc(subtitle)}</p>` : ''}</div>
      <div class="page-actions">
        <button class="btn-icon page-search" type="button" data-action="open-search" aria-label="${tr('Search')}"><i class="ph ph-magnifying-glass" aria-hidden="true"></i></button>
        ${actionHtml}${projectMenu}${addButton}
      </div>
    </header>`;
  }

  function calendarDate() {
    return Core.parseDateOnly(state.ui.calendarDate) ? state.ui.calendarDate : Core.dateOnly();
  }

  // Redesign R7 (C1): with no "Danas" button, the Calendar starts on today whenever it is opened from another screen.
  function enterCalendarRoute(route) {
    const open = ['calendar', 'upcoming'].includes(route.type);
    if (open && !calendarOpen) state.ui.calendarDate = Core.dateOnly();
    calendarOpen = open;
  }

  // Redesign R8a (H1, H4): the Habits screen opens on Dan, today and this month whenever it is opened from another screen.
  function enterHabitsRoute(route) {
    const open = route.type === 'habits';
    if (open && !habitsOpen) Object.assign(state.ui, { habitsView: 'day', habitsDay: Core.dateOnly(), habitTrackerMonth: Core.dateOnly().slice(0, 7), habitChartDay: null });
    habitsOpen = open;
  }

  // Arrows move a week, or a month; a month selects today when it holds today, otherwise its first day.
  function navigateCalendar(direction) {
    const date = calendarDate();
    if (state.ui.calendarView === 'month') {
      const current = parseLocalDate(date);
      const first = Core.dateOnly(new Date(current.getFullYear(), current.getMonth() + direction, 1));
      const today = Core.dateOnly();
      state.ui.calendarDate = today.slice(0, 7) === first.slice(0, 7) ? today : first;
    } else state.ui.calendarDate = Core.addDays(date, direction * 7);
    saveAndRender();
  }

  // Durations as "45 min", "2 h" or "1 h 30 min" (V1.12).
  function durationLabel(minutes) {
    const value = Math.max(0, Math.round(Number(minutes) || 0));
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    if (hours && rest) return tr('{hours} h {minutes} min', { hours, minutes: rest });
    return hours ? tr('{hours} h', { hours }) : tr('{minutes} min', { minutes: rest });
  }

  // Redesign R2 (T7): at most 3 late, 5 planned and 5 habit rows until the section is opened in place.
  const TODAY_LIMITS = { overdue: 3, today: 5, habits: 5 };
  function todayLimited(key, rows) {
    const open = state.ui.todayExpanded?.[key] === true;
    const max = TODAY_LIMITS[key];
    const more = rows.length > max ? `<button class="today-more" type="button" data-action="today-expand" data-today-key="${key}" aria-expanded="${open}">${open ? tr('Show less') : tr('Show {count} more', { count: rows.length - max })}</button>` : '';
    return (open ? rows : rows.slice(0, max)).join('') + more;
  }

  // Redesign R2 (G6): an overdue date red, due today amber, later dates gray.
  function todayDueLabel(date, today = Core.dateOnly()) {
    if (!date) return '';
    const cls = date < today ? ' is-overdue' : date === today ? ' is-today' : '';
    const text = date === today ? tr('Due today') : date === Core.addDays(today, 1) ? tr('Due tomorrow') : tr('Due {date}', { date: formatDate(date) });
    return `<span class="task-due${cls}">${esc(text)}</span>`;
  }

  // Redesign R2 (T2a): a goal or milestone deadline as a row with the target icon; it opens the goal.
  function deadlineRow({ goal, milestone }, today = Core.dateOnly()) {
    const meta = milestone ? tr('Milestone · {goal}', { goal: goal.title }) : tr('Goal · {percent}%', { percent: Math.round(Core.computeGoalProgress(goal, state, state.habitMetrics || {}).percent) });
    return `<article class="today-row deadline-row" data-goal-id="${esc(goal.id)}"><span class="deadline-icon" aria-hidden="true"><i class="ph ph-target"></i></span><button class="today-row-main" type="button" data-route="goal/${esc(goal.id)}"><span class="task-title">${esc(milestone ? milestone.title : goal.title)}</span><span class="task-meta">${esc(meta)}</span></button><span class="task-side">${todayDueLabel(milestone ? milestone.date : goal.targetDate, today)}</span></article>`;
  }

  // Redesign R2 (T1–T7): the date above "Danas", notices while they apply, then Zakasnelo, Planirano danas,
  // Navike and a folded Završeno. Focus, review, actions, the summary strip and capacity left Today (T2a).
  function renderToday() {
    const today = Core.dateOnly();
    const sections = Core.deriveTodayV3({ ...state, tasks: listTasks() }, Object.values(state.habitLogCache || {}).flat(), today);
    let html = pageHeader(tr('Today'), '', { add: false, eyebrow: formatPageToday(today) });
    if (globalThis.DailoPlatform?.isNative) html += transferNotice();
    html += backupReminderNotice();
    html += weeklyReviewNotice();
    const section = (key, label, count, body, danger = false) => `<section class="section today-section today-section--${key}" data-today-section="${key}"><div class="section-header"><h2 class="section-label${danger ? ' danger' : ''}">${label}</h2><span class="section-count">${count}</span></div>${body}</section>`;
    const overdueRows = [
      ...sections.overdue.map(task => taskRow(task, 'today', { today: true })),
      ...sections.overdueGoals.map(goal => deadlineRow({ goal }, today)),
      ...sections.overdueMilestones.map(item => deadlineRow(item, today)),
    ];
    if (overdueRows.length) html += section('overdue', tr('Past due'), overdueRows.length, `<div class="task-list today-card">${todayLimited('overdue', overdueRows)}</div>`, true);
    const plannedRows = [
      ...sections.today.map(task => taskRow(task, 'today', { today: true, draggable: true })),
      ...sections.goals.map(goal => deadlineRow({ goal }, today)),
      ...sections.milestones.map(item => deadlineRow(item, today)),
    ];
    html += section('today', tr('Planned today'), plannedRows.length, `<div class="task-list today-card" data-list-context="today">${plannedRows.length ? todayLimited('today', plannedRows) : `<p class="today-empty">${tr('Nothing planned. “+” adds a task for today.')}</p>`}</div><button class="inline-add" type="button" data-action="quick-add" data-today="true"><i class="ph ph-plus"></i> ${tr('Add task')}</button>`);
    // Done habits move to the bottom (T5).
    const habits = [...sections.habits.filter(item => item.status.status !== 'done'), ...sections.habits.filter(item => item.status.status === 'done')];
    if (habits.length) html += section('habits', tr('Habits'), `${habits.length - sections.habits.filter(item => item.status.status !== 'done').length}/${habits.length}`, `<div class="habit-list today-card">${todayLimited('habits', habits.map(item => renderHabitTodayRow(item.habit, item.status)))}</div>`);
    if (sections.completed.length) {
      const open = state.ui.todayCompletedExpanded === true;
      html += `<section class="section today-section today-section--completed" data-today-section="completed"><button class="collapsible-trigger" type="button" data-action="toggle-today-completed" aria-expanded="${open}"><span class="left"><i class="ph ph-check-circle"></i> ${tr('Completed')}</span><span>${sections.completed.length} <i class="ph ph-caret-${open ? 'up' : 'down'}"></i></span></button>`;
      if (open) html += `<div class="task-list today-card">${sections.completed.map(task => taskRow(task, 'completed', { today: true })).join('')}</div>`;
      html += `</section>`;
    }
    return html;
  }

  // Redesign R6 (I1–I6): the waiting count, "Razvrstaj redom", filters only for the types present, the capture groups.
  function renderInbox() {
    const all = activeInboxRecords('all');
    const present = INBOX_FILTERS.filter(([value]) => value !== 'all' && activeInboxRecords(value).length);
    const filter = present.some(([value]) => value === state.ui.inboxFilter) ? state.ui.inboxFilter : 'all';
    const records = activeInboxRecords(filter);
    let html = pageHeader(tr('Inbox'), all.length ? trn(all.length, '{count} item waiting to be organized', '{count} items waiting to be organized') : tr('Nothing is waiting'), {});
    if (!all.length) return html + `<div class="empty-state inbox-empty"><i class="ph ph-check-circle" aria-hidden="true"></i><h3>${tr('Inbox is empty')}</h3><p>${tr('Everything is sorted.')}</p></div>`;
    html += `<button class="inbox-triage-button" type="button" data-action="inbox-triage"><i class="ph ph-stack" aria-hidden="true"></i><span><strong>${tr('Sort one by one')}</strong> · ${tr('one at a time')}</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>`;
    if (present.length > 1) html += `<div class="inbox-filter-tabs" role="tablist" aria-label="${tr('Filter Inbox')}">${[INBOX_FILTERS[0], ...present].map(([value, label]) => `<button class="inbox-filter-tab ${filter === value ? 'is-active' : ''}" type="button" role="tab" aria-selected="${filter === value}" data-action="inbox-filter" data-inbox-filter="${value}">${tr(label)}<span class="inbox-filter-count">${value === 'all' ? all.length : activeInboxRecords(value).length}</span></button>`).join('')}</div>`;
    const groups = new Map();
    for (const record of records) {
      const group = inboxGroupForDate(record.item.createdAt);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(record);
    }
    const order = [msg('Today'), msg('Yesterday'), msg('This week'), msg('Earlier')];
    for (const label of order) {
      const items = groups.get(label);
      if (!items?.length) continue;
      html += `<section class="inbox-group" aria-labelledby="inbox-group-${label.replace(/ /g, '-').toLowerCase()}"><div class="inbox-group-label" id="inbox-group-${label.replace(/ /g, '-').toLowerCase()}"><strong>${tr(label)}</strong><span>${items.length}</span></div><div class="inbox-group-items today-card" data-list-context="inbox">${items.map(renderInboxRecord).join('')}</div></section>`;
    }
    return html;
  }

  // Redesign R6 (I2): "Razvrstaj redom" — one item at a time, in the current filter's order.
  function openInboxTriage() {
    const present = INBOX_FILTERS.filter(([value]) => value !== 'all' && activeInboxRecords(value).length);
    const filter = present.some(([value]) => value === state.ui.inboxFilter) ? state.ui.inboxFilter : 'all';
    captureModalReturnFocus();
    modalState = { type: 'inbox-triage', queue: activeInboxRecords(filter).map(record => [record.type, record.item.id]), index: 0 };
    renderModal();
    requestAnimationFrame(() => $('#modal-root .inbox-triage-actions button')?.focus());
  }
  function inboxTriageOpen(type, id) {
    const item = inboxItem(type, id);
    return Boolean(item && item.isInbox === true && !item.isCompleted);
  }
  function renderInboxTriage() {
    const queue = modalState.queue || [];
    const open = queue.filter(([type, id]) => inboxTriageOpen(type, id));
    const header = `<div class="modal-header"><h2 class="modal-title">${tr('Sorting')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div>`;
    if (!open.length) return modalFrame(`<div class="modal-inner">${header}<div class="empty-state inbox-empty"><i class="ph ph-check-circle" aria-hidden="true"></i><h3>${tr('Finished')}</h3><p>${activeInboxRecords('all').length ? tr('This list is sorted.') : tr('Inbox is empty.')}</p></div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-secondary" type="button" data-action="close-modal">${tr('Close')}</button></div></div></div>`, 'quick inbox-triage-modal');
    if (modalState.index >= open.length) modalState.index = 0;
    const [type, id] = open[modalState.index];
    const item = inboxItem(type, id);
    const label = { task: msg('Task'), goal: msg('Goal'), habit: msg('Habit'), note: msg('Note'), resource: msg('Resource') }[type];
    const added = tr(inboxGroupForDate(item.createdAt)).toLocaleLowerCase(I18n.locale());
    const attrs = `data-inbox-type="${esc(type)}" data-inbox-id="${esc(id)}"`;
    const button = (action, text, extra = '', primary = false) => `<button class="btn ${primary ? 'btn-primary' : 'btn-secondary'}" type="button" data-action="${action}" ${extra}>${text}</button>`;
    const actions = type === 'task'
      ? ['inbox-today', 'inbox-tomorrow', 'inbox-anytime', 'inbox-project'].map((action, index) => button(action, [tr('Today'), tr('Tomorrow'), tr('Anytime'), tr('Project…')][index], `data-task-id="${esc(id)}"`)).join('')
      : button('inbox-triage-open', tr('Open details'), attrs) + button('inbox-area', tr('Area…'), attrs) + button('inbox-remove', tr('Sorted'), attrs, true);
    const due = type === 'task' && item.dueDate ? `<p class="inbox-triage-due">${todayDueLabel(item.dueDate)}</p>` : '';
    return modalFrame(`<div class="modal-inner">${header}<div class="inbox-triage-card"><p class="inbox-triage-meta">${esc(tr('{type} · added {when}', { type: tr(label), when: added }))}</p><p class="inbox-triage-title">${esc(item.title || item.name || '')}</p>${due}</div><div class="inbox-triage-actions">${actions}</div><div class="inbox-triage-footer"><span>${esc(tr('{current} of {total}', { current: queue.length - open.length + 1, total: queue.length }))}</span><button class="btn btn-ghost" type="button" data-action="inbox-triage-skip">${tr('Skip')}</button></div></div>`, 'quick inbox-triage-modal');
  }


  // Redesign R1 (M4): "Još" lists every screen that is not in the bottom bar, in cards.
  function moreRow(route, icon, label, value = '', sub = '') {
    return `<button class="mobile-more-route more-row" type="button" data-route="${esc(route)}"><i class="ph ${icon}" aria-hidden="true"></i><span class="more-row-label">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${value !== '' ? `<span class="more-row-value">${esc(String(value))}</span>` : ''}<i class="ph ph-caret-right more-row-caret" aria-hidden="true"></i></button>`;
  }
  // R11d (S4): an open task whose repeat is active or paused, outside Inbox and archived projects or groups.
  function isOpenRepeating(task) {
    const rule = taskRecurrence(task);
    return Boolean(rule && rule.status !== 'ended' && !task.isCompleted && !task.isInbox && !getProject(task.projectId)?.isArchived);
  }
  function renderMoreScreen() {
    const card = (title, rows) => `<section class="more-group">${title ? `<h2 class="more-group-title">${title}</h2>` : ''}<div class="more-card">${rows.join('')}</div></section>`;
    const pinned = [
      ...sortedAreas().filter(area => area.status !== 'archived' && area.isPinned).map(area => moreRow(`area/${encodeURIComponent(area.id)}`, area.icon || 'ph-squares-four', area.name, '', tr('Area'))),
      ...(state.savedViews || []).filter(view => view.isPinned).map(view => moreRow(`saved-view/${encodeURIComponent(view.id)}`, 'ph-funnel', view.name, '', tr('Saved view'))),
    ];
    const count = list => (list || []).length;
    const sync = syncView();
    const syncText = sync.configured && sync.signedIn ? (sync.lastSyncAt ? tr('Last synced {time}', { time: formatReminder(sync.lastSyncAt) }) : tr('Sync is on')) : tr('Data is on this device only');
    let html = pageHeader(tr('More'), '', { add: false });
    if (pinned.length) html += card(tr('Pinned'), pinned);
    html += card(tr('Planning'), [
      moreRow('goals', 'ph-target', tr('Goals'), count((state.goals || []).filter(goal => goal.status === 'active'))),
      moreRow('areas', 'ph-squares-four', tr('Areas'), count((state.areas || []).filter(area => area.status !== 'archived'))),
      moreRow('cleaning', 'ph-arrows-clockwise', tr('Recurring tasks'), count(state.tasks.filter(isOpenRepeating))),
      moreRow('review', 'ph-clipboard-text', tr('Weekly review')),
    ]);
    html += card(tr('Library'), [
      moreRow('notes', 'ph-note', tr('Notes'), count(state.notes)),
      moreRow('resources', 'ph-link', tr('Resources'), count(state.resources)),
      moreRow('tags', 'ph-tag', tr('Tags'), count(state.tags)),
      moreRow('templates', 'ph-copy', tr('Templates'), count(state.templates)),
      moreRow('saved-views', 'ph-funnel', tr('Saved Views'), count(state.savedViews)),
    ]);
    html += card(tr('Archives'), [
      moreRow('completed', 'ph-check-circle', tr('Completed'), count(state.tasks.filter(task => task.isCompleted))),
      moreRow('archived', 'ph-archive', tr('Archived Projects'), count(state.projects.filter(project => project.isArchived && !project.isCleaningRoom))),
    ]);
    html += card('', [moreRow('settings', 'ph-gear', tr('Settings'), '', syncText)]);
    return html;
  }

  // Redesign R5 (S10): the tasks lists show, without the tasks of archived projects. Search keeps every task.
  function listTasks() {
    const archived = new Set((state.projects || []).filter(project => project.isArchived).map(project => project.id));
    return (state.tasks || []).filter(task => !archived.has(task.projectId));
  }

  // Redesign R5 (Z6): a project row with its open count, the nearest due date and a bar of the done share.
  function projectOverviewRow(project, tasks) {
    const all = tasks.filter(task => task.projectId === project.id);
    const open = all.filter(task => !task.isCompleted);
    const percent = all.length ? Math.round((all.length - open.length) / all.length * 100) : 0;
    const next = open.filter(task => task.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    return `<button class="project-row" type="button" data-route="project/${esc(project.id)}"><span class="project-dot" style="--project-color:${esc(project.color)}" aria-hidden="true"></span><span class="project-row-main"><span class="task-title">${esc(project.name)}</span><span class="task-meta">${esc(trn(open.length, '{count} open', '{count} open'))}${next ? ` · ${todayDueLabel(next.dueDate)}` : ''}</span><span class="project-row-bar" aria-hidden="true"><i style="width:${percent}%;background:${esc(project.color)}"></i></span></span><i class="ph ph-caret-right" aria-hidden="true"></i></button>`;
  }

  // Redesign R1 + R5 (Z1–Z6): the summary, the suggestions, and "Kad stignem" by project or the projects by area.
  function renderTasksScreen() {
    const view = state.ui.tasksView === 'projects' ? 'projects' : 'anytime';
    const tasks = listTasks();
    // R11d (S4): groups of Redovne obaveze stay out of Zadaci → Projekti.
    const projects = sortedProjects().filter(project => !project.isCleaningRoom);
    const later = Core.deriveAnytime(tasks);
    const open = tasks.filter(task => !task.isCompleted && !task.isInbox).length;
    const summary = `${trn(open, '{count} open task', '{count} open tasks')} · ${trn(projects.length, '{count} project', '{count} projects')}`;
    const tab = (key, label) => `<button class="btn ${view === key ? 'is-selected' : ''}" type="button" data-action="tasks-view" data-view="${key}" aria-pressed="${view === key}">${label}</button>`;
    const group = (label, count, rows, color = '') => `<section class="section tasks-group"><div class="section-header"><h2 class="section-label tasks-group-label">${color ? `<span class="project-dot" style="--project-color:${esc(color)}" aria-hidden="true"></span>` : ''}${esc(label)}</h2><span class="section-count">${count}</span></div>${rows}</section>`;
    let html = pageHeader(tr('Tasks'), summary, { add: false });
    // Redesign R2 (T2a, Z2): the suggestions that left Today, folded, with "+ Danas" per row.
    const suggestions = Core.deriveTodaySections(tasks, Core.dateOnly()).suggestions;
    if (suggestions.length) {
      const open = state.ui.suggestionsExpanded === true;
      html += `<section class="tasks-suggestions" data-tasks-suggestions><button class="collapsible-trigger" type="button" data-action="toggle-suggestions" aria-expanded="${open}"><span class="left"><i class="ph ph-sparkle"></i> ${tr('Suggested for today')}</span><span>${suggestions.length} <i class="ph ph-caret-${open ? 'up' : 'down'}"></i></span></button>`;
      if (open) html += `<div class="task-list today-card">${suggestions.map(item => taskRow(item.task, 'suggestion', { today: true, addToday: true, suggestionReason: item.reason })).join('')}</div><button class="btn btn-ghost" type="button" data-action="add-all-suggestions"><i class="ph ph-plus-circle"></i> ${tr('Add all to Today')}</button>`;
      html += `</section>`;
    }
    html += `<div class="view-tabs tasks-view-switch" role="group" aria-label="${tr('Tasks')}">${tab('anytime', `${tr('Anytime')} · ${later.length}`)}${tab('projects', tr('Projects'))}</div>`;
    if (view === 'projects') {
      const loose = tasks.filter(task => !task.projectId && !task.isInbox && !task.isCompleted).length;
      html += `<div class="more-card"><button class="project-row" type="button" data-route="project/none"><i class="ph ph-tray project-row-icon" aria-hidden="true"></i><span class="project-row-main"><span class="task-title">${tr('No project')}</span><span class="task-meta">${esc(trn(loose, '{count} open', '{count} open'))}</span></span><i class="ph ph-caret-right" aria-hidden="true"></i></button></div>`;
      const areas = sortedAreas().filter(area => area.status !== 'archived');
      for (const area of areas) {
        const list = projects.filter(project => project.areaId === area.id);
        if (list.length) html += group(area.name, list.length, `<div class="more-card">${list.map(project => projectOverviewRow(project, tasks)).join('')}</div>`);
      }
      const unassigned = projects.filter(project => !areas.some(area => area.id === project.areaId));
      if (unassigned.length) html += group(tr('No area'), unassigned.length, `<div class="more-card">${unassigned.map(project => projectOverviewRow(project, tasks)).join('')}</div>`);
      html += `<button class="inline-add" type="button" data-action="new-project"><i class="ph ph-plus"></i> ${tr('New project')}</button>`;
      return html;
    }
    html += `<p class="tasks-note">${tr('Sorted tasks without a planned day, by project.')}</p>`;
    if (!later.length) return html + emptyState(tr('Nothing waiting in Anytime.'), tr('Processed tasks without a planned date will appear here.'), tr('Add task'), 'quick-add', { anytime: true });
    const loose = later.filter(task => !task.projectId);
    if (loose.length) html += group(tr('No project'), loose.length, `<div class="task-list today-card">${loose.map(task => taskRow(task, 'anytime', { today: true })).join('')}</div>`);
    for (const project of projects) {
      const rows = later.filter(task => task.projectId === project.id);
      if (rows.length) html += group(project.name, rows.length, `<div class="task-list today-card">${rows.map(task => taskRow(task, 'anytime', { today: true, hidePlace: true })).join('')}</div>`, project.color);
    }
    html += `<button class="inline-add" type="button" data-action="quick-add" data-anytime="true"><i class="ph ph-plus"></i> ${tr('Add task')}</button>`;
    return html;
  }

  function renderAnytime() {
    const tasks = Core.deriveAnytime(state.tasks);
    let html = pageHeader(tr('Anytime'), trn(tasks.length, '{count} active task without a plan date', '{count} active tasks without a plan date'), { contextAnytime: true });
    if (!tasks.length) return html + emptyState(tr('Nothing waiting in Anytime.'), tr('Processed tasks without a planned date will appear here.'), tr('Add task'), 'quick-add', { anytime: true });
    html += `<div class="task-list">${tasks.map(t => taskRow(t, 'anytime')).join('')}</div>`;
    html += `<button class="inline-add" type="button" data-action="quick-add" data-anytime="true"><i class="ph ph-plus"></i> ${tr('Add task')}</button>`;
    return html;
  }

  // Redesign R10c (S6): Oznake lists the tags with what uses them; a tag opens its own screen with its active tasks
  // and, new, the notes and resources that carry it.
  function tagLibrary(tagId) {
    return [...(state.notes || []).map(item => ['note', item]), ...(state.resources || []).map(item => ['resource', item])]
      .filter(([, item]) => (item.tagIds || []).includes(tagId))
      .sort((a, b) => String(b[1].updatedAt || '').localeCompare(String(a[1].updatedAt || '')));
  }

  function libraryRow([type, item]) {
    return `<div class="today-row area-library-row"><button class="today-row-main" type="button" data-route="${type}/${esc(item.id)}"><span class="task-title"><i class="ph ${type === 'note' ? 'ph-note' : 'ph-link'}" aria-hidden="true"></i> ${esc(item.title)}</span><span class="task-meta">${type === 'note' ? tr('Note') : tr('Resource')}</span></button></div>`;
  }

  function tagUsage(tag) {
    const tasks = Core.tasksForTag(listTasks(), tag.id).length, library = tagLibrary(tag.id).length;
    return [tasks ? trn(tasks, '{count} task', '{count} tasks') : '', library ? trn(library, '{count} in the library', '{count} in the library') : ''].filter(Boolean).join(' · ') || tr('Not in use');
  }

  function renderTags() {
    const tags = [...(state.tags || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const html = pageHeader(tr('Tags'), trn(tags.length, '{count} tag', '{count} tags'), { add: false });
    if (!tags.length) return html + emptyState(tr('No tags yet.'), tr('Create a global tag and reuse it across tasks.'), tr('New tag'), 'new-tag');
    return `${html}<div class="today-card tags-list">${tags.map(tag => `<button class="tag-list-row" type="button" data-route="tag/${esc(tag.id)}"><span class="tag-dot" style="--tag-color:${esc(tag.color)}" aria-hidden="true"></span><span class="tag-list-main"><span class="task-title">${esc(tag.name)}</span><span class="task-meta">${esc(tagUsage(tag))}</span></span><i class="ph ph-caret-right" aria-hidden="true"></i></button>`).join('')}<button class="inline-add" type="button" data-action="new-tag"><i class="ph ph-plus" aria-hidden="true"></i> ${tr('New tag')}</button></div>`;
  }

  function renderTag(tagId) {
    const tag = getTag(tagId);
    if (!tag) return renderTags();
    const tasks = Core.tasksForTag(listTasks(), tag.id), library = tagLibrary(tag.id);
    let html = pageHeader(tag.name, trn(tasks.length, '{count} active task', '{count} active tasks'), { add: false, actionHtml: `<button class="btn-icon" type="button" data-action="tag-menu" data-tag-id="${esc(tag.id)}" aria-label="${tr('Tag actions')}"><i class="ph ph-dots-three"></i></button>` });
    html += tasks.length ? `<div class="task-list today-card">${tasks.map(task => taskRow(task, 'tags', { today: true })).join('')}</div>` : emptyState(tr('No active tasks with this tag.'), tr('Assign it with #tag in Quick Add or in the task window.'));
    if (library.length) html += `<section class="section tag-library"><div class="section-header"><h2 class="section-label">${tr('In the library')} · ${library.length}</h2></div><div class="today-card">${library.map(libraryRow).join('')}</div></section>`;
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
    if (goal.progressMode === 'linkedTasks') return tr('{current} / {target} tasks', { current: progress.current, target: progress.target });
    return `${Math.round(progress.percent)}%`;
  }

  function goalStatusLabel(goal, today = Core.dateOnly()) {
    if (Core.isGoalOverdue(goal, today)) return tr('Overdue');
    const labels = { active: msg('Active'), paused: msg('Paused'), completed: msg('Completed'), archived: msg('Archived') };
    return labels[goal.status] ? tr(labels[goal.status]) : goal.status[0].toUpperCase() + goal.status.slice(1);
  }

  function habitMetrics(habit) {
    return state.habitMetrics?.[habit.id] || { currentStreak: 0, longestStreak: 0, totalCheckins: 0, completionRate: 0, currentPeriodCount: 0, currentPeriodTarget: habit.frequencyType === 'timesPerWeek' ? Number(habit.timesPerWeek || 1) : 1 };
  }

  function renderHabitRow(habit, todayStatus = null) {
    return callDomainHook('renderRoute', { type: 'habit-row', habit, todayStatus }) || '';
  }

  function renderHabitTodayRow(habit, todayStatus) {
    return callDomainHook('renderRoute', { type: 'habit-today-row', habit, todayStatus }) || '';
  }

  // Redesign R2 (H6): a numeric habit's value sheet for today; since R8a also for a past day of the Habits screen.
  function openHabitValue(habitId, date = Core.dateOnly()) {
    const habit = getHabit(habitId);
    const today = Core.dateOnly();
    if (!habit || !Core.parseDateOnly(date) || date > today || (date === today && habit.status !== 'active')) return;
    const existing = state.habitLogCache?.[habitId]?.find(log => log.date === date);
    // From the details window the sheet returns there when it closes (R8c).
    const previous = modalState?.type === 'habit-details' ? modalState : null;
    if (!previous) captureModalReturnFocus();
    modalState = { type: 'habit-value', habitId, date, total: Number(existing?.value || 0) };
    if (previous) modalState.previous = previous;
    renderModal();
    requestAnimationFrame(() => $('#habit-value-total')?.focus());
  }

  // Redesign R10e (S9, M6): project and period chips, groups by completion day with Today rows (the round check restores
  // a task with Undo), and "Obriši završene zadatke" at the bottom.
  function renderCompleted() {
    const projectId = state.ui.completedProjectFilter || null;
    const periodDays = Number(state.ui.completedPeriod) || 0;
    const tasks = Core.filterCompleted(state.tasks, { projectId, periodDays }, nowIso());
    let html = pageHeader(tr('Completed tasks'), trn(tasks.length, '{count} task', '{count} tasks'), { add: false });
    const project = allProjects().find(item => item.id === projectId);
    const period = (days, label) => `<button class="quick-chip${periodDays === days ? ' is-selected' : ''}" type="button" data-action="completed-period" data-value="${days}" aria-pressed="${periodDays === days}">${label}</button>`;
    html += `<div class="sheet-chips completed-chips"><button class="quick-chip${project ? ' is-selected' : ''}" type="button" data-action="completed-project">${esc(project?.name || tr('All projects'))} <i class="ph ph-caret-down" aria-hidden="true"></i></button>${period(0, tr('All time'))}${period(7, tr('7 days'))}${period(30, tr('30 days'))}</div>`;
    const clear = state.tasks.some(task => task.isCompleted) ? `<div class="today-card completed-clear"><button class="completed-clear-row" type="button" data-action="clear-completed"><i class="ph ph-trash" aria-hidden="true"></i><span class="completed-clear-main"><span class="task-title">${tr('Clear completed tasks')}</span><span class="task-meta">${tr('Permanently delete all completed tasks and their attachments.')}</span></span></button></div>` : '';
    if (!tasks.length) return html + emptyState(tr('No completed tasks match these filters.'), tr('Try a different project or time period.')) + clear;
    const groups = new Map();
    for (const task of tasks) {
      const date = Core.localDateOf(String(task.completedAt || '')) || 'unknown';
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(task);
    }
    for (const [date, items] of groups) {
      const label = relativeDateLabel(date);
      const heading = [label, [tr('Today'), tr('Yesterday')].includes(label) ? formatDate(date) : '', items.length].filter(part => part !== '').join(' · ');
      html += `<section class="section completed-group"><div class="section-header"><h2 class="section-label">${esc(heading)}</h2></div><div class="task-list today-card">${items.map(task => taskRow(task, 'completed', { today: true })).join('')}</div></section>`;
    }
    return html + clear;
  }

  function openCompletedProjectSheet(anchor) {
    const current = state.ui.completedProjectFilter || '';
    const options = [['', tr('All projects')], ...allProjects().map(project => [project.id, project.isArchived ? tr('{name} (archived)', { name: project.name }) : project.name])];
    openPopover(anchor, `<div class="popover-title">${tr('Project')}</div><div class="sheet-card" role="radiogroup" aria-label="${tr('Project')}">${options.map(([value, label]) => `<button class="popover-option sheet-option${current === value ? ' is-selected' : ''}" type="button" role="radio" aria-checked="${current === value}" data-pop-action="completed-set-project" data-value="${esc(value)}"><span class="sheet-option-label">${esc(label)}</span><span class="sheet-radio${current === value ? ' is-on' : ''}" aria-hidden="true"></span></button>`).join('')}</div>`, { type: 'completed-project' });
  }

  function emptyState(title, text, cta, action, data = {}) {
    const attrs = Object.entries(data).map(([key, value]) => `data-${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${esc(value)}"`).join(' ');
    return `<div class="empty-state v17-empty-state"><h3>${esc(title)}</h3><p>${esc(text)}</p>${cta ? `<button class="btn btn-primary" type="button" data-action="${esc(action)}" ${attrs}><i class="ph ph-plus"></i>${esc(cta)}</button>` : ''}</div>`;
  }

  function taskRow(task, context, options = {}) {
    return callDomainHook('renderTaskRow', task, context, options) || '';
  }

  function renderRecovery() {
    if (recovery === 'global-recovery') return `<div class="recovery"><div class="recovery-card"><h1>${tr('Recovery is required.')}</h1><p>${tr('An interrupted global operation retained its internal recovery copy. Use Retry recovery below before continuing.')}</p></div></div>`;
    if (recovery === 'migration-loading') return `<div class="recovery recovery--loading" role="status" aria-busy="true"><div class="recovery-card"><span class="recovery-spinner" aria-hidden="true"></span><h1>${tr('Preparing your local data…')}</h1><p>${tr('Please wait while local storage is checked.')}</p></div></div>`;
    if (recovery === 'migration-error') return `<div class="recovery"><div class="recovery-card"><h1>${tr('Local data migration could not finish.')}</h1><p>${tr('Your saved data and original files have not been overwritten. Check available storage and close other app tabs, then retry.')}</p><div class="recovery-actions"><button class="btn btn-secondary" type="button" data-action="retry-load">${tr('Retry')}</button></div></div></div>`;
    const unsupported = recovery === 'unsupported-version';
    return `<div class="recovery"><div class="recovery-card"><h1>${unsupported ? tr('This data is from a newer version.') : tr("We couldn't load your local data.")}</h1><p>${unsupported ? tr("Dailo can't safely read this saved format.") : tr('Your saved data appears to be invalid. Nothing has been overwritten.')}</p><div class="recovery-actions"><button class="btn btn-secondary" type="button" data-action="retry-load">${tr('Retry')}</button><button class="btn btn-danger" type="button" data-action="recovery-reset">${tr('Reset local data')}</button></div></div></div>`;
  }

  function openQuickAdd(context = {}) {
    captureModalReturnFocus();
    closePopover();
    const defaults = {
      projectId: context.projectId || null,
      areaId: context.areaId || null,
      plannedDate: context.plannedDate || context.day || (context.today ? Core.dateOnly() : null),
      explicitPlan: Boolean(context.plannedDate),
      processed: Boolean(context.anytime),
    };
    modalState = {
      type: 'quick',
      templateContext: context,
      defaults,
      draft: {
        title: '', notes: '', projectId: defaults.projectId, areaId: defaults.areaId, plannedDate: defaults.plannedDate, parsedPlanDate: null, explicitPlan: defaults.explicitPlan,
        dueDate: null, plannedTime: null, dueTime: null, explicitPlannedTime: false, reminderAt: null, reminderFiredAt: null, recurrence: null, tagIds: [], priority: 'none', subtasks: [],
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
    if (toggle) toggle.textContent = timer.isRunning ? tr('Pause') : tr('Resume');
    $('#modal-root .focus-ring')?.classList.toggle('is-running', timer.isRunning);
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
    if (!task || task.isCompleted) { setToastMessage(tr('No open overdue or Today tasks to focus on')); return; }
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
    if (!tasks.length) { closeModal(); setToastMessage(tr('All overdue and Today tasks are complete')); return; }
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

  // Redesign R9c (GO7): the window only creates; a goal is edited in its window (R9b).
  function openGoalModal(context = {}) {
    const returnFocus = goalFocusTarget();
    captureModalReturnFocus();
    closePopover();
    modalState = { type: 'goal', draft: goalDraft(null, context.areaId), error: '', returnFocus };
    modalState.templateContext = context;
    if (context.targetDate) modalState.draft.targetDate = context.targetDate;
    renderModal(); requestAnimationFrame(() => $('#goal-title')?.focus());
  }

  function habitDraft(habit = null, areaId = null) {
    return { name: habit?.name || '', areaId: habit?.areaId || areaId || null, routine: habit?.routine || 'daily', goalIds: [...(habit?.goalIds || [])], trackingType: habit?.trackingType || 'checkbox', targetValue: habit?.targetValue ?? 1, minimumTarget: habit?.minimumTarget ?? null, idealTarget: habit?.idealTarget ?? null, graceDays: habit?.graceDays ?? 0, unit: habit?.unit || '', quickValues: (habit?.quickValues || []).join(','), frequencyType: habit?.frequencyType || 'daily', weekdays: habit?.weekdays || [1, 2, 3, 4, 5], timesPerWeek: habit?.timesPerWeek || 4, everyNDays: habit?.everyNDays || 2, startDate: habit?.startDate || Core.dateOnly(), continuation: habit?.continuation || 'automatic', endType: habit?.endType || 'never', endDate: habit?.endDate || '', successfulPeriodsTarget: habit?.successfulPeriodsTarget || '', reminders: (habit?.reminders || []).map(item => ({ ...item })) };
  }

  function openHabitModal(habitId = null, context = {}) {
    captureModalReturnFocus();
    closePopover(); const habit = habitId ? getHabit(habitId) : null;
    modalState = { type: 'habit', habitId, draft: habitDraft(habit, context.areaId), error: '' };
    modalState.templateContext = context;
    if (!habit && context.startDate) modalState.draft.startDate = context.startDate;
    renderModal(); requestAnimationFrame(() => $('#habit-name')?.focus());
  }

  // Redesign R8c (S13): a habit's details open as a window over the current screen.
  function openHabitDetails(habitId) {
    if (!getHabit(habitId)) return;
    closePopover();
    if (modalState?.type !== 'habit-details') captureModalReturnFocus();
    modalState = { type: 'habit-details', habitId, month: Core.dateOnly().slice(0, 7), draft: null };
    renderModal();
    requestAnimationFrame(() => $('#modal-root [data-action="close-modal"]')?.focus());
  }

  // Redesign R10b (S3): a note or a resource opens as a window like the task window; without an id it is a new one.
  function openKnowledgeWindow(type, id = null) {
    if (modalState?.type !== 'knowledge') captureModalReturnFocus();
    callDomainHook('handleAction', 'open-knowledge', { ownerType: type, ownerId: id });
  }

  // Redesign R9b (GO5): a goal opens as a window like the task window.
  function openGoalDetails(goalId) {
    if (!getGoal(goalId)) return;
    closePopover();
    if (modalState?.type !== 'goal-details') captureModalReturnFocus();
    modalState = { type: 'goal-details', goalId, showAllTasks: false };
    renderModal();
    requestAnimationFrame(() => $('#modal-root [data-action="close-modal"]')?.focus());
  }

  function openConfirm(config) {
    captureModalReturnFocus();
    closePopover();
    modalState = { type: 'confirm', ...config };
    renderModal();
  }

  function closeModal() {
    if (modalState?.type === 'focus') stopFocusTimer();
    if (modalState?.type === 'habit-value' && modalState.previous) { modalState = modalState.previous; renderModal(); return; }
    if (modalState?.previous?.type === 'goal') {
      const target = modalState.returnFocus; modalState = modalState.previous; renderModal(); restoreGoalFocus(target); return;
    }
    // Source, reminders, links, milestone and history windows return to the goal window (R9b).
    if (modalState?.returnTo) restoreGoalFocus(modalState.returnFocus);
    if (modalState?.returnTo) { const back = modalState.returnTo; modalState = back; renderModal(); return; }
    if(modalState?.type==='recurrence-scope'){cancelRecurrenceScope();return;}
    if(modalState?.type==='template-picker'){modalState=modalState.previous;renderModal();return;}
    if(modalState?.onCancel){const cancel=modalState.onCancel;cancel();return;}
    if(flushTaskDraft(()=>closeModal()))return;
    const goalReturn = modalState?.returnFocus;
    const returnTarget = modalReturnFocus;
    modalReturnFocus = null;
    modalState = null;
    $('#modal-root').innerHTML = '';
    restoreGoalFocus(goalReturn);
    if (returnTarget) restoreModalReturnFocus(returnTarget);
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
    else if (modalState.type === 'local-snapshots') root.innerHTML = renderLocalSnapshotsModal();
    else if (modalState.type === 'template-picker') root.innerHTML = renderTemplatePicker();
    else if (modalState.type === 'recurrence-scope') root.innerHTML = renderRecurrenceScope();
    else if (modalState.type === 'sync-choice') root.innerHTML = renderSyncChoice();
    else if (modalState.type === 'inbox-triage') root.innerHTML = renderInboxTriage();
    if (['project','habit','goal'].includes(modalState.type) && !modalState.taskId && !modalState.projectId && !modalState.habitId && !modalState.goalId) {
      $('.modal-inner',root)?.insertAdjacentHTML('afterbegin',`<button class="btn btn-ghost" type="button" data-action="from-template"><i class="ph ph-copy"></i> ${tr('From template')}</button>`);
    }
    if (['confirm','recurrence-scope'].includes(modalState?.type)) requestAnimationFrame(() => root.querySelector('.modal button, .modal [href], .modal input, .modal select, .modal textarea, .modal [tabindex]:not([tabindex="-1"])')?.focus());
    if (['goal', 'goal-source', 'goal-links', 'goal-reminders', 'goal-history', 'milestone'].includes(modalState?.type)) requestAnimationFrame(() => ([...root.querySelectorAll('input, select, textarea')].find(el => el.offsetParent !== null) || root.querySelector('.modal-footer [data-action="close-modal"]'))?.focus());
  }

  function modalFrame(content, cls = '', dialogAttrs = '') {
    const frameClass = cls ? ` modal-backdrop-${cls}` : '';
    let dialogContent = content;
    let accessibleName = dialogAttrs;
    if (!accessibleName) {
      if (/<h[12][^>]*>/.test(dialogContent)) {
        dialogContent = dialogContent.replace(/<h[12](?![^>]*\bid=)([^>]*)>/, '<h2 id="dialog-title"$1>');
        accessibleName = 'aria-labelledby="dialog-title"';
      } else accessibleName = `aria-label="${tr('Dailo dialog')}"`;
    }
    return `<div class="modal-backdrop${frameClass}" data-action="modal-backdrop"><section class="modal ${cls}" role="dialog" aria-modal="true" ${accessibleName}>${dialogContent}</section></div>`;
  }

  // Redesign R10f (S12): a tall window with the title, one meta line, the ring, tickable subtasks, the notes and the
  // footer (Sutra / Sledeći / Detalji, then "Završi zadatak").
  function renderFocusModal() {
    const head = `<div class="modal-header task-window-header"><span class="task-window-kind">${tr('Focus')}</span><div class="task-window-actions"><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Exit focus mode')}"><i class="ph ph-x"></i></button></div></div>`;
    const task = getTask(modalState.taskId);
    if (!task || task.isCompleted) {
      const next = focusableTasks()[0];
      if (next) { modalState = { type: 'focus', taskId: next.id, timer: createFocusTimer() }; startFocusTimer(); return renderFocusModal(); }
      return modalFrame(`<div class="modal-inner quick-sheet focus-window">${head}<h2 class="focus-title">${tr('Nothing left to focus on')}</h2><div class="quick-sheet-footer"><span></span><button class="btn btn-primary habit-window-save" type="button" data-action="close-modal">${tr('Exit')}</button></div></div>`, 'quick');
    }
    const today = Core.dateOnly();
    const project = getProject(task.projectId);
    const meta = [
      project?.name || '',
      task.dueDate ? (task.dueDate < today ? tr('Overdue · {date}', { date: relativeDateLabel(task.dueDate, today) }) : tr('Due {date}', { date: relativeDateLabel(task.dueDate, today) })) : '',
      task.plannedDate ? tr('Planned {date}', { date: relativeDateLabel(task.plannedDate, today) }) : '',
      task.priority && task.priority !== 'none' ? tr('{priority} priority', { priority: priorityLabel(task.priority) }) : '',
    ].filter(Boolean);
    const subtasks = [...(task.subtasks || [])].sort((a, b) => clampOrder(a.order) - clampOrder(b.order));
    const completed = subtasks.filter(subtask => subtask.isCompleted).length;
    const running = Boolean(modalState.timer?.isRunning);
    const id = esc(task.id);
    let html = `${head}<h2 class="focus-title">${esc(task.title)}</h2>${meta.length ? `<p class="focus-meta-line">${esc(meta.join(' · '))}</p>` : ''}`;
    html += `<div class="focus-ring${running ? ' is-running' : ''}" aria-live="off"><span class="focus-timer-label">${tr('Elapsed')}</span><strong id="focus-elapsed">${formatFocusElapsed(focusElapsedMs())}</strong></div><div class="focus-timer-actions"><button class="btn btn-secondary" type="button" data-action="focus-toggle-timer">${running ? tr('Pause') : tr('Resume')}</button><button class="btn btn-ghost" type="button" data-action="focus-reset-timer">${tr('Reset')}</button></div>`;
    if (subtasks.length) html += `<h3 class="goal-details-label">${tr('Subtasks')} · ${completed}/${subtasks.length}</h3><div class="today-card focus-subtasks">${subtasks.map(subtask => `<button class="focus-subtask${subtask.isCompleted ? ' is-done' : ''}" type="button" data-action="toggle-subtask" data-task-id="${id}" data-subtask-id="${esc(subtask.id)}" aria-pressed="${Boolean(subtask.isCompleted)}"><span class="complete-control${subtask.isCompleted ? ' is-completed' : ''}" aria-hidden="true">${subtask.isCompleted ? '<i class="ph ph-check"></i>' : ''}</span><span class="subtask-title">${esc(subtask.title)}</span></button>`).join('')}</div>`;
    if (task.notes) html += `<h3 class="goal-details-label">${tr('Notes')}</h3><p class="focus-notes">${esc(task.notes)}</p>`;
    html += `<div class="quick-sheet-footer focus-footer"><div class="focus-footer-row"><button class="btn btn-secondary" type="button" data-action="focus-tomorrow" data-task-id="${id}">${tr('Tomorrow')}</button><button class="btn btn-secondary" type="button" data-action="focus-next" data-task-id="${id}">${tr('Next')}</button><button class="btn btn-secondary" type="button" data-action="focus-open-details" data-task-id="${id}">${tr('Details')}</button></div><button class="btn btn-primary habit-window-save" type="button" data-action="focus-complete" data-task-id="${id}"><i class="ph ph-check"></i> ${tr('Complete task')}</button></div>`;
    return modalFrame(`<div class="modal-inner quick-sheet focus-window">${html}</div>`, 'quick');
  }

  const TEMPLATE_TYPES = ['task','project','habit','goal'];
  function saveShortcut(command) {
    const raw=$(`[data-shortcut="${command}"]`).value,value=Core.normalizeShortcut(raw);
    shortcutError='';
    if(!value)shortcutError=tr('Use a letter or digit with optional Ctrl/Cmd, Alt and Shift, or choose Disable.');
    else {const conflict=Object.keys(SHORTCUT_DEFAULTS).find(key=>key!==command && Core.normalizeShortcut(state.settings.shortcuts[key])===value);if(conflict)shortcutError=tr('Already assigned to {command}. Choose another shortcut.', { command: tr(SHORTCUT_LABELS[conflict]) });}
    if(shortcutError){render();return;}
    state.settings.shortcuts[command]=value;saveAndRender();
  }
  function disableShortcut(command) { state.settings.shortcuts[command]=null; shortcutError=''; saveAndRender(); }
  function resetShortcuts() { state.settings.shortcuts={...SHORTCUT_DEFAULTS}; shortcutError=''; saveAndRender(); }
  function savePersonalization() {
    state.settings = Core.normalizeV16Settings({
      ...state.settings,
      // Habit weeks before a week-start change keep their boundaries (M11).
      weekStartHistory: Core.recordWeekStartChange(state.settings, $('#preference-week-start')?.value, Core.dateOnly()),
      compactDensity: $('#preference-density')?.checked,
      weekStartsOn: $('#preference-week-start')?.value,
    });
    saveAndRender();
  }
  const copyTemplate = value => JSON.parse(JSON.stringify(value));
  const TYPE_LABELS = { task: msg('Task'), project: msg('Project'), habit: msg('Habit'), goal: msg('Goal'), note: msg('Note'), resource: msg('Resource'), area: msg('Area'), tag: msg('Tag'), template: msg('Template') };
  const templateLabel = type => (TYPE_LABELS[type] ? tr(TYPE_LABELS[type]) : type[0].toUpperCase() + type.slice(1));
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
    if (saveState()) runScheduledTaskTemplates();
    closeModal(); render();
    return record;
  }

  function duplicateTemplateRecord(id) {
    const source = state.templates.find(template => template.id === id);
    if (!source) return;
    const record = copyTemplate(source); record.id = uid('template'); record.name = tr('{name} (copy)', { name: source.name }); record.createdAt = record.updatedAt = nowIso(); state.templates.push(record); saveAndRender();
    setToastMessage(tr('Template duplicated'));
  }

  // "Upotrebi šablon" opens the usual new-item window, already filled; the user still saves it.
  function useTemplate(id) {
    const template = state.templates.find(item => item.id === id); if (!template) return;
    if (template.type === 'task') { openQuickAdd(); applyQuickTemplate(template.id); renderModal(); return; }
    if (template.type === 'project') openProjectModal(); else if (template.type === 'habit') openHabitModal(); else openGoalModal();
    openTemplatePicker(); chooseTemplate(template.id);
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
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${tr({ task: msg('From task template'), project: msg('From project template'), habit: msg('From habit template'), goal: msg('From goal template') }[modalState.kind] || msg('From template'))}</h2><button class="btn-icon" data-action="template-picker-back" aria-label="${tr('Back')}"><i class="ph ph-x"></i></button></div>${rows.length?rows.map(t=>`<button class="btn btn-secondary template-choice" data-action="choose-template" data-template-id="${esc(t.id)}">${esc(t.name)}</button>`).join(''):`<p class="area-empty-copy">${tr('No templates of this type yet.')}</p>`}</div>`,'quick');
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
      modalState.draft={...modalState.draft,...item,explicitPlan:true,parsedPlanDate:null};
    } else if(template.type==='project')modalState.draft={...item};
    else if(template.type==='habit')modalState.draft=habitDraft(item);
    else modalState.draft=goalDraft(item);
    modalState.templateInstance=out;renderModal();
  }
  function runScheduledTaskTemplates({ duringStartup = false } = {}) {
    if (!state || globalOperation || recovery || (startupPromise && !duringStartup)) return 0;
    const today = Core.dateOnly();
    const scheduled = { ...state, templates: copyTemplate(state.templates) };
    const tasks = Core.instantiateScheduledTaskTemplates(scheduled, today, { makeId: uid, nowIso: nowIso() });
    if (!tasks.length) return 0;
    const before = { tasks: state.tasks, goals: state.goals, templates: state.templates };
    state.tasks = [...state.tasks]; state.goals = copyTemplate(state.goals); state.templates = scheduled.templates;
    for (const task of tasks) {
      task.todayOrder = task.plannedDate === today ? nextOrder('today') : null;
      task.projectOrder = task.projectId ? nextOrder(`project:${task.projectId}`) : null;
      task.inboxOrder = task.isInbox ? nextOrder('inbox', true) : null;
      state.tasks.push(task);
      syncTemplateEntityGoalLinks('task', task);
    }
    if (!saveState()) { Object.assign(state, before); return 0; }
    return tasks.length;
  }
  function templateMenuEntry(type,id) {
    return `<button class="popover-option" type="button" data-pop-action="save-template" data-template-source-type="${type}" data-template-source-id="${esc(id)}"><i class="ph ph-copy"></i>${tr('Save as template')}</button>`;
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

  // What the title will set, shown under it while typing (V1.10). Empty when nothing is recognized.
  function quickParsePreview(parsed) {
    const item = (icon, text) => `<span class="quick-parse-item"><i class="ph ${icon}" aria-hidden="true"></i>${esc(text)}</span>`;
    const items = [];
    if (parsed.plannedDate) items.push(item('ph-calendar-check', parsed.plannedTime ? `${relativeDateLabel(parsed.plannedDate)} ${parsed.plannedTime}` : relativeDateLabel(parsed.plannedDate)));
    else if (parsed.plannedTime) items.push(item('ph-clock', parsed.plannedTime));
    if (parsed.dueDate) items.push(item('ph-flag', tr('Due {date}', { date: relativeDateLabel(parsed.dueDate) })));
    if (parsed.durationMinutes) items.push(item('ph-timer', tr('{minutes} min', { minutes: parsed.durationMinutes })));
    const project = parsed.projectId && getProject(parsed.projectId);
    if (project) items.push(item('ph-folder-simple', project.name));
    const area = !project && parsed.areaId && getArea(parsed.areaId);
    if (area) items.push(item('ph-squares-four', area.name));
    for (const tag of (parsed.tagIds || []).map(getTag).filter(Boolean)) items.push(item('ph-hash', tag.name));
    if (parsed.priority) items.push(item('ph-arrow-fat-up', priorityLabel(parsed.priority)));
    return items.length ? `<div class="quick-parse-preview" data-quick-preview role="group" aria-label="${tr('Recognized in title')}">${items.join('')}</div>` : '';
  }

  // Redesign R4 (Q1, Q2, S7): Quick Add as a bottom sheet. The title, the Smart Quick Add preview, the date and
  // place selectors, the template chip, "Više opcija" (saves and opens the task window) and "Dodaj zadatak".
  function renderQuickModal() {
    const d = modalState.draft;
    const parsed = parseQuickAddTitle(d.title, !d.explicitPlan);
    const plan = d.explicitPlan ? d.plannedDate : (parsed.plannedDate || d.plannedDate);
    const time = d.explicitPlannedTime ? d.plannedTime : (d.plannedTime || parsed.plannedTime);
    return modalFrame(`<div class="modal-inner quick-sheet">
      <div class="modal-header"><h2 class="modal-title">${tr('New task')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div>
      <input id="quick-title" class="quick-title-input${modalState.error ? ' is-error' : ''}" type="text" maxlength="500" autocomplete="off" placeholder="${tr('What needs to be done?')}" value="${esc(d.title)}" aria-label="${tr('Task title')}" />
      ${modalState.error ? `<div class="validation">${esc(modalState.error)}</div>` : ''}
      <div class="quick-parse-slot" data-quick-preview-slot aria-live="polite">${quickParsePreview(parsed)}</div>
      <div class="quick-selectors"><button class="quick-selector" type="button" data-action="quick-plan-picker"><i class="ph ph-calendar-check" aria-hidden="true"></i><span data-quick-plan-label>${esc(quickPlanLabel(plan, time))}</span><i class="ph ph-caret-right" aria-hidden="true"></i></button><button class="quick-selector" type="button" data-action="quick-project-picker"><i class="ph ph-folder-simple" aria-hidden="true"></i><span data-quick-place-label>${esc(quickPlace(d, parsed).label)}</span><i class="ph ph-caret-right" aria-hidden="true"></i></button></div>
      ${quickTemplateRow()}
      <button class="quick-more-options" type="button" data-action="quick-more-options"><span>${tr('More options')}</span><span class="quick-more-meta">${tr('Due date, reminder, tags')}</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>
      <div class="quick-sheet-footer"><span class="shortcut-hint">${tr('↵ Add · ⇧↵ Add another')}</span><button class="btn btn-primary quick-add-button" type="button" data-action="create-task">${tr('Add task')}</button></div>
    </div>`, 'quick');
  }

  function quickPlanLabel(plan, time) {
    return plan ? `${relativeDateLabel(plan)}${time ? ` · ${time}` : ''}` : tr('No date');
  }

  // Where a Quick Add task goes: its project, "Bez projekta" (it skips Inbox) or Inbox. A picked place wins over a
  // parsed +project; a task with a date and no project is never in Inbox.
  function quickPlace(d, parsed = parseQuickAddTitle(d.title, !d.explicitPlan)) {
    const projectId = d.placePicked ? (d.projectId || null) : (d.projectId || parsed.projectId || null);
    const plan = d.explicitPlan ? d.plannedDate : (parsed.plannedDate || d.plannedDate);
    const processed = d.processed ?? Boolean(modalState?.defaults?.processed);
    const isInbox = !projectId && !processed && !plan;
    return { projectId, isInbox, label: projectId ? (getProject(projectId)?.name || tr('No project')) : isInbox ? tr('Inbox') : tr('No project') };
  }

  // S7: the "Iz šablona" chip, shown only when task templates exist.
  function quickTemplateRow() {
    const templates = (state.templates || []).filter(template => template.type === 'task');
    if (!templates.length) return '';
    const chosen = modalState.quickTemplate && templates.find(template => template.id === modalState.quickTemplate.id);
    if (!chosen) return `<div class="quick-template-row"><button class="quick-chip" type="button" data-action="quick-template"><i class="ph ph-copy" aria-hidden="true"></i>${tr('From template')}</button></div>`;
    return `<div class="quick-template-row"><button class="quick-chip is-selected" type="button" data-action="quick-template"><i class="ph ph-copy" aria-hidden="true"></i>${esc(tr('Template: {name}', { name: chosen.name }))}</button><button class="quick-chip" type="button" data-action="quick-template-clear" aria-label="${tr('Remove template')}"><i class="ph ph-x" aria-hidden="true"></i></button></div><p class="quick-template-summary">${esc(quickTemplateSummary(chosen))}</p>`;
  }

  function quickTemplateSummary(template) {
    const item = Core.instantiateTemplate(template, Core.dateOnly(), { state, makeId: () => 'preview', nowIso: nowIso() }).task;
    return [item.plannedDate && relativeDateLabel(item.plannedDate), item.dueDate && tr('Due {date}', { date: relativeDateLabel(item.dueDate) }), item.subtasks.length && trn(item.subtasks.length, '{count} subtask', '{count} subtasks'), ...(item.tagIds || []).map(getTag).filter(Boolean).map(tag => `#${tag.name}`)].filter(Boolean).join(' · ') || item.title || template.name;
  }

  function openQuickTemplatePicker(anchor) {
    const templates = (state.templates || []).filter(template => template.type === 'task');
    const current = modalState?.quickTemplate?.id;
    const html = `<div class="popover-title">${tr('Task template')}</div><div class="sheet-card">${templates.map(template => `<button class="popover-option sheet-option${template.id === current ? ' is-selected' : ''}" type="button" data-pop-action="quick-template-pick" data-template-id="${esc(template.id)}"><i class="ph ph-copy" aria-hidden="true"></i><span class="sheet-option-label">${esc(template.name)}<small>${esc(quickTemplateSummary(template))}</small></span><span class="sheet-radio${template.id === current ? ' is-on' : ''}" aria-hidden="true"></span></button>`).join('')}</div>`;
    openPopover(anchor, html, { type: 'quick-template' });
  }

  // S7: a template fills what the draft does not have yet. A typed title, a picked date and a picked place win;
  // the due date moves with the plan. ✕ restores what the template replaced.
  const QUICK_TEMPLATE_FIELDS = ['plannedDate', 'plannedTime', 'dueDate', 'dueTime', 'subtasks', 'tagIds', 'priority', 'notes', 'durationMinutes', 'reminderAt', 'recurrence', 'goalIds', 'projectId', 'areaId'];
  function applyQuickTemplate(id) {
    const template = (state.templates || []).find(item => item.id === id && item.type === 'task');
    if (!template || modalState?.type !== 'quick') return;
    syncQuickDraftFromDom();
    if (modalState.quickTemplate) clearQuickTemplate();
    const d = modalState.draft;
    const offset = Number.isInteger(template.data?.plannedOffsetDays) ? template.data.plannedOffsetDays : 0;
    const context = d.explicitPlan && d.plannedDate ? Core.addDays(d.plannedDate, -offset) : (modalState.templateContext?.plannedDate || Core.dateOnly());
    const out = Core.instantiateTemplate(template, context, { state, makeId: uid, nowIso: nowIso() });
    const item = out.task;
    const before = copyTemplate(Object.fromEntries([...QUICK_TEMPLATE_FIELDS, 'title'].map(key => [key, d[key] ?? null])));
    if (!String(d.title || '').trim()) d.title = item.title || '';
    if (!d.explicitPlan && item.plannedDate) { d.plannedDate = item.plannedDate; if (!d.plannedTime) d.plannedTime = item.plannedTime || null; }
    if (!d.dueDate) { d.dueDate = item.dueDate || null; d.dueTime = d.dueTime || item.dueTime || null; }
    if (!d.subtasks?.length) d.subtasks = item.subtasks || [];
    d.tagIds = [...new Set([...(d.tagIds || []), ...(item.tagIds || [])])];
    if (!d.priority || d.priority === 'none') d.priority = item.priority || 'none';
    for (const key of ['notes', 'durationMinutes', 'reminderAt', 'recurrence']) if (!d[key]) d[key] = item[key] ?? d[key] ?? null;
    d.goalIds = [...new Set([...(d.goalIds || []), ...(item.goalIds || [])])];
    if (!d.placePicked && !d.projectId && item.projectId) { d.projectId = item.projectId; d.areaId = null; }
    else if (!d.projectId && !d.areaId && item.areaId) d.areaId = item.areaId;
    modalState.quickTemplate = { id, title: item.title || '', before };
    modalState.templateInstance = out;
  }
  function clearQuickTemplate() {
    const applied = modalState?.quickTemplate;
    if (!applied) return;
    syncQuickDraftFromDom();
    const d = modalState.draft;
    const title = d.title === applied.title ? applied.before.title : d.title;
    for (const key of QUICK_TEMPLATE_FIELDS) {
      if ((key === 'plannedDate' || key === 'plannedTime') && d.explicitPlan) continue;
      if ((key === 'projectId' || key === 'areaId') && d.placePicked) continue;
      d[key] = applied.before[key];
    }
    d.title = title || '';
    modalState.quickTemplate = null;
    modalState.templateInstance = null;
  }

  function priorityLabel(value) {
    return value === 'high' ? tr('High') : value === 'medium' ? tr('Medium') : value === 'low' ? tr('Low') : tr('None');
  }

  function priorityIcon(value) {
    if (!value || value === 'none') return '';
    return `<i class="ph ph-flag priority-flag priority-${esc(value)}" title="${esc(tr('{priority} priority', { priority: priorityLabel(value) }))}" aria-label="${esc(tr('{priority} priority', { priority: priorityLabel(value) }))}"></i>`;
  }

  function tagSummary(tagIds, limit = 3) {
    const tags = (tagIds || []).map(getTag).filter(Boolean).slice(0, limit);
    return tags.map(tag => `<span class="tag-inline"><span class="tag-dot" style="--tag-color:${esc(tag.color)}"></span>${esc(tag.name)}</span>`).join(' ');
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    const number = (value, digits) => new Intl.NumberFormat(I18n.locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${number(n / 1024, n < 10240 ? 1 : 0)} KB`;
    return `${number(n / (1024 * 1024), 1)} MB`;
  }

  function fileTypeLabel(record) {
    const name = String(record.fileName || 'file');
    const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : '';
    return ext || String(record.mimeType || tr('File')).split('/').pop().toUpperCase() || tr('File').toUpperCase();
  }

  function renderAttachmentRow(record, owner) {
    return `<div class="attachment-row" data-attachment-id="${esc(record.id)}"><i class="ph ph-file attachment-file-icon"></i><div class="attachment-main"><strong title="${esc(record.fileName)}">${esc(record.fileName)}</strong><small>${esc(fileTypeLabel(record))} · ${esc(formatBytes(record.size))}</small></div><button class="btn-icon" type="button" data-action="attachment-menu" data-attachment-id="${esc(record.id)}" data-owner-type="${esc(owner.ownerType)}" data-owner-id="${esc(owner.ownerId)}" aria-label="${tr('Attachment actions')}"><i class="ph ph-dots-three"></i></button></div>`;
  }

  function renderAttachmentsSection(owner) {
    const item = attachmentOwner(owner)?.item;
    const count = item ? item.attachmentIds.length : modalState.pendingFiles.length;
    const attrs = `data-owner-type="${esc(owner.ownerType)}" data-owner-id="${esc(owner.ownerId || '')}"${owner.ownerType === 'task' ? ` data-task-id="${esc(owner.ownerId)}"` : ''}`;
    const imageControl = owner.ownerType === 'task' ? `<button class="btn btn-secondary" type="button" data-action="attachment-image-picker"><i class="ph ph-image" aria-hidden="true"></i>${tr('Add image')}</button><input id="attachment-image-input" type="file" accept="image/*" multiple hidden ${attrs}>` : '';
    return `<div class="detail-section attachments-section"><div class="detail-heading"><span>${tr('Attachments')}</span><span>${count} / ${MAX_ATTACHMENTS_PER_TASK}</span></div><label class="attachment-drop-zone" ${attrs}><i class="ph ph-paperclip"></i><span><strong>${tr('Drop files here')}</strong><small>${tr('or choose files · max 10 MB each')}</small></span><span class="btn btn-secondary attachment-add-button">${tr('Add attachment')}</span><input id="attachment-input" type="file" multiple hidden ${attrs}></label>${imageControl}${modalState.attachmentMessage ? `<div class="attachment-message" role="status">${esc(modalState.attachmentMessage)}</div>` : ''}<div class="attachment-list">${(modalState.attachmentRecords || []).map(record => renderAttachmentRow(record, owner)).join('')}</div></div>`;
  }

  async function readOwnerAttachments(owner) {
    const records = await Attachments.getMany(owner.item.attachmentIds || []);
    const scoped = owner.type === 'task'
      ? { tasks: [owner.item], notes: [], resources: [] }
      : TodoStorage.knowledgeAttachmentSnapshot({ ...owner.item, type: owner.type });
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
      if (source === state && attachmentModalMatches(owner)) { modalState.attachmentMessage = tr('Attachments are unavailable in this browser.'); renderModal(); }
    }
  }

  async function addAttachments(descriptor, files) {
    const owner = attachmentOwner(descriptor); if (!owner || !Attachments || undoHold) return { message: tr('Attachments are unavailable in this browser.'), added: 0, failed: 1 };
    const task = owner.item, source = state;
    const { valid, tooLarge, countRejected } = selectAttachmentFiles(files, task.attachmentIds.length);
    let added = 0, failed = 0;
    for (const file of valid) {
      const id = uid('att'); const ts = nowIso();
      const identity = owner.type === 'task' ? { taskId: task.id } : { ownerType: owner.type, ownerId: task.id };
      const record = { id, ...identity, fileName: file.name || 'attachment', mimeType: file.type || 'application/octet-stream', size: file.size, blob: file, createdAt: ts, updatedAt: ts, pendingDeleteUntil: null };
      try {
        if (source !== state || attachmentOwner({ ownerType: owner.type, ownerId: task.id })?.item !== task || undoHold || task.attachmentIds.length >= MAX_ATTACHMENTS_PER_TASK) throw new Error(msg('Attachment owner changed. Reopen the item.'));
        const stored = await Attachments.putOwned(record, () => {
          if (source !== state || attachmentOwner({ ownerType: owner.type, ownerId: task.id })?.item !== task || undoHold || task.attachmentIds.length >= MAX_ATTACHMENTS_PER_TASK)
            throw new Error(msg('Attachment owner changed. Reopen the item.'));
        });
        if (!stored.added) throw stored.error || new Error(msg('Attachment could not be stored.'));
        task.attachmentIds = [...(task.attachmentIds || []), id];
        task.updatedAt = nowIso();
        added++;
      } catch (error) { failed++; console.error(error); }
    }
    if (source === state && !descriptor.deferSave) saveState();
    knowledgeAttachmentCache.delete(owner.type + ':' + task.id);
    const parts = attachmentMessages(added, tooLarge, countRejected);
    if (failed) parts.push(tr('Attachments are unavailable in this browser.'));
    if (attachmentModalMatches(owner)) {
      modalState.attachmentMessage = parts.join(' ');
      await loadOwnerAttachments({ ownerType: owner.type, ownerId: task.id });
    }
    if (state) render();
    return { message: parts.join(' '), added, failed };
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
    if (added) parts.push(trn(added, '{count} file added.', '{count} files added.'));
    if (tooLarge) parts.push(trn(tooLarge, '{count} file is larger than 10 MB.', '{count} files are larger than 10 MB.'));
    if (countRejected) parts.push(trn(countRejected, "{count} couldn't be added because the limit is 10.", "{count} couldn't be added because the limit is 10."));
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
    const html = `<button class="popover-option" type="button" data-pop-action="attachment-open" data-attachment-id="${esc(attachmentId)}"><i class="ph ph-arrow-square-out"></i>${tr('Open file')}</button><button class="popover-option" type="button" data-pop-action="attachment-download" data-attachment-id="${esc(attachmentId)}"><i class="ph ph-download-simple"></i>${tr('Download')}</button><div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="attachment-delete" data-attachment-id="${esc(attachmentId)}" data-owner-type="${esc(anchor.dataset.ownerType)}" data-owner-id="${esc(anchor.dataset.ownerId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>${tr('Delete')}</button>`;
    openPopover(anchor, html, { type: 'attachment-menu', attachmentId });
  }

  async function openAttachment(attachmentId, download = false) {
    const record = await Attachments?.get(attachmentId); if (!record) return;
    // A WebView cannot open or download a blob: the app hands the file to the share sheet (audit P-2).
    const platform = globalThis.DailoPlatform;
    if (platform?.isNative) {
      closePopover();
      try { await platform.files.openFile(record.blob, record.fileName); }
      catch (error) { console.error(error); setToastMessage(tr('The file could not be opened')); }
      return;
    }
    // Only types that cannot run script in the app's origin open inline; the rest is downloaded (audit S-1).
    if (!download && !Core.attachmentOpensInline(record.blob?.type || record.mimeType)) download = true;
    const url = URL.createObjectURL(record.blob);
    if (download) { const a=document.createElement('a'); a.href=url; a.download=record.fileName; document.body.appendChild(a); a.click(); a.remove(); }
    else { try { window.open(url, '_blank', 'noopener'); } catch (_) {} }
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    closePopover();
  }

  async function deleteAttachment(attachmentId, descriptor) {
    const owner = attachmentOwner(descriptor), located = locateDeleteEntity('attachment', attachmentId);
    if (!owner || located?.parent !== owner.item || located.ownerType !== owner.type) {
      setToastMessage(tr('Attachment owner changed. Reopen the current item.')); return;
    }
    requestDeleteEntity('attachment', attachmentId);
  }

  // Redesign R10f (S11): a full-height window with the field on top; scope, ranking and grouping are unchanged.
  function renderSearchModal() {
    return modalFrame(`<div class="modal-inner quick-sheet search-window"><div class="modal-header"><h2 class="modal-title">${tr('Search')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close Search')}"><i class="ph ph-x"></i></button></div><label class="search-box"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><input id="search-query" class="search-input" type="search" autocomplete="off" placeholder="${tr('Search tasks and projects...')}" value="${esc(modalState.query || '')}" aria-label="${tr('Search')}"></label><div id="search-results" class="search-results">${searchResultsHtml(modalState.query || '')}</div></div>`, 'quick');
  }

  // Search (M11, approved 2026-10-09): results are rebuilt after a short pause in typing, and at most this many
  // are rendered, in the unchanged order of Core.searchItems.
  const SEARCH_DEBOUNCE_MS = 120;
  const SEARCH_TASK_LIMIT = 50;
  const SEARCH_PROJECT_LIMIT = 20;

  let searchTimer = null;
  function scheduleSearchResults() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchTimer = null;
      const results = modalState?.type === 'search' ? $('#search-results') : null;
      if (results) results.innerHTML = searchResultsHtml(modalState.query);
    }, SEARCH_DEBOUNCE_MS);
  }

  function searchResultsHtml(query) {
    if (!String(query).trim()) return `<div class="empty-state" style="border:0;padding:38px 12px"><h3>${tr('Search tasks and projects')}</h3><p>${tr('Type a task title, note or project name.')}</p></div>`;
    const result = Core.searchItems(state.tasks, state.projects, query);
    if (!result.tasks.length && !result.projects.length) return `<div class="empty-state" style="border:0;padding:38px 12px"><h3>${tr('No results for “{query}”', { query: esc(query) })}</h3></div>`;
    let html = '';
    if (result.tasks.length) {
      html += `<h3 class="search-section-title">${tr('Tasks')} · ${result.tasks.length}</h3><div class="today-card search-list">${result.tasks.slice(0, SEARCH_TASK_LIMIT).map(({ task }) => searchTaskResult(task)).join('')}</div>${searchMoreNote(result.tasks.length, SEARCH_TASK_LIMIT)}`;
    }
    if (result.projects.length) {
      html += `<h3 class="search-section-title">${tr('Projects')} · ${result.projects.length}</h3><div class="today-card search-list">${result.projects.slice(0, SEARCH_PROJECT_LIMIT).map(project => `<button class="search-result" type="button" data-route="project/${esc(project.id)}"><span class="search-result-icon"><span class="project-dot" style="--project-color:${esc(project.color)}"></span></span><span><span class="search-result-title">${esc(project.name)}</span><span class="search-result-meta">${tr('Project')}${project.isArchived ? ` · ${tr('archived')}` : ''}</span></span></button>`).join('')}</div>${searchMoreNote(result.projects.length, SEARCH_PROJECT_LIMIT)}`;
    }
    return html;
  }

  function searchMoreNote(count, limit) {
    return count > limit ? `<p class="search-more-note">${tr('Showing {shown} of {count}. Type more to narrow the results.', { shown: limit, count })}</p>` : '';
  }

  function searchTaskResult(task) {
    const project = getProject(task.projectId);
    const parts = [];
    if (project) parts.push(project.name);
    if (task.isCompleted && task.completedAt) parts.push(tr('Completed {date}', { date: relativeDateLabel(Core.localDateOf(String(task.completedAt))) }));
    else if (task.plannedDate === Core.dateOnly()) parts.push(tr('Today'));
    if (task.dueDate) parts.push(tr('Due {date}', { date: relativeDateLabel(task.dueDate) }));
    return `<button class="search-result" type="button" data-action="open-task" data-task-id="${esc(task.id)}"><span class="search-result-icon">${task.isCompleted ? '<i class="ph-fill ph-check-circle" style="color:var(--success)"></i>' : '<i class="ph ph-circle"></i>'}</span><span><span class="search-result-title">${esc(task.title)}</span><span class="search-result-meta">${esc(parts.join(' · ') || tr('Task'))}</span></span></button>`;
  }

  // R10c: a sheet like the area window, with one big button.
  function renderTagModal() {
    const editing = Boolean(modalState.tagId);
    const d = modalState.draft;
    return modalFrame(`<div class="modal-inner quick-sheet tag-window"><div class="modal-header"><h2 class="modal-title">${editing ? tr('Edit tag') : tr('New tag')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><input id="tag-name" class="quick-title-input${modalState.error ? ' is-error' : ''}" type="text" maxlength="80" autocomplete="off" placeholder="${tr('Tag name')}" value="${esc(d.name)}" aria-label="${tr('Tag name')}">${modalState.error ? `<div class="validation" role="alert">${esc(modalState.error)}</div>` : ''}<span class="habit-window-label">${tr('Color')}</span><div class="color-grid">${PROJECT_COLORS.map(c => `<button class="color-swatch${c === d.color ? ' is-selected' : ''}" type="button" data-action="select-tag-color" data-color="${c}" style="--swatch:${c}" aria-label="${tr('Select color')}" aria-pressed="${c === d.color}"></button>`).join('')}</div><div class="quick-sheet-footer"><span></span><button class="btn btn-primary habit-window-save" type="button" data-action="save-tag">${editing ? tr('Save changes') : tr('Create tag')}</button></div></div>`, 'quick');
  }

  function renderAreaLinkedModal() {
    const goal = modalState.kind === 'goal';
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${goal ? tr('New goal') : tr('New habit')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><label class="field-label" for="area-linked-name">${tr('Name')}</label><input id="area-linked-name" class="input ${modalState.error ? 'is-error' : ''}" type="text" maxlength="100" value="${esc(modalState.draft.name)}" placeholder="${goal ? tr('Goal name') : tr('Habit name')}" />${modalState.error ? `<div class="validation">${esc(modalState.error)}</div>` : ''}<div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Cancel')}</button><button class="btn btn-primary" type="button" data-action="save-area-linked">${goal ? tr('Create goal') : tr('Create habit')}</button></div></div></div>`, 'quick');
  }

  function renderDuplicateModal() {
    const task = getTask(modalState.taskId); if (!task) return '';
    const count = (task.attachmentIds || []).length;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="dialog-title">${tr('Duplicate task')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close Duplicate task')}"><i class="ph ph-x"></i></button></div><p class="dialog-copy">${trn(count, 'This task has {count} attachment. Copy attachments too?', 'This task has {count} attachments. Copy attachments too?')}</p><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Cancel')}</button><button class="btn btn-secondary" type="button" data-action="duplicate-without-files" data-task-id="${esc(task.id)}">${tr('Without files')}</button><button class="btn btn-primary" type="button" data-action="duplicate-with-files" data-task-id="${esc(task.id)}">${tr('Copy files')}</button></div></div></div>`, 'small-modal');
  }

  function renderConfirmModal() {
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><div><h2 class="modal-title">${esc(tr(modalState.title))}</h2>${modalState.message ? `<p class="page-subtitle" style="margin-top:10px;max-width:380px">${esc(tr(modalState.message))}</p>` : ''}</div><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close dialog')}"><i class="ph ph-x"></i></button></div>${modalState.phrase ? `<label>${tr('Type {word} to continue', { word: esc(modalState.phrase) })}<input id="global-confirm-phrase" class="input" autocomplete="off" /></label>` : ''}<div class="modal-footer" style="border:0;padding-top:0"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Cancel')}</button><button class="btn btn-danger" type="button" data-action="confirm-action">${esc(tr(modalState.confirmLabel || msg('Delete')))}</button></div></div></div>`, 'confirm-modal');
  }

  function nextProjectColor() {
    return PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length];
  }

  // Redesign R3 (E8): projects grouped by area with "Oblast: …", a search field and "+ Novi projekat".
  // A tap applies the choice (E3).
  function openProjectPicker(anchor, target) {
    const source = target.type === 'quick' ? modalState?.draft : getTask(target.taskId);
    const currentId = source?.projectId || null;
    const attrs = `data-target-type="${target.type}"${target.taskId ? ` data-task-id="${esc(target.taskId)}"` : ''}`;
    const projects = sortedProjects();
    const activeAreas = sortedAreas().filter(area => area.status !== 'archived');
    const ordered = [...activeAreas.flatMap(area => projects.filter(project => project.areaId === area.id)), ...projects.filter(project => !activeAreas.some(area => area.id === project.areaId))];
    const option = project => {
      const area = getArea(project.areaId);
      return `<button class="popover-option sheet-option${project.id === currentId ? ' is-selected' : ''}" type="button" data-sheet-item data-search="${esc(project.name.toLowerCase())}" data-pop-action="set-project" data-project-id="${esc(project.id)}" ${attrs}><span class="project-dot" style="--project-color:${esc(project.color)}"></span><span class="sheet-option-label">${esc(project.name)}${area ? `<small>${esc(tr('Area: {area}', { area: area.name }))}</small>` : ''}</span><span class="sheet-radio${project.id === currentId ? ' is-on' : ''}" aria-hidden="true"></span></button>`;
    };
    // Redesign R4: in Quick Add the sheet asks where the task goes, with Inbox and "Bez projekta" on top.
    const quick = target.type === 'quick';
    const inbox = quick && !currentId && !(source?.processed ?? Boolean(modalState?.defaults?.processed));
    const none = !currentId && !inbox;
    const noneRow = `<button class="popover-option sheet-option${none ? ' is-selected' : ''}" type="button" ${quick ? 'data-pop-action="quick-place" data-place="none"' : `data-pop-action="set-project" data-project-id="" ${attrs}`}><span class="sheet-option-label">${tr('No project')}</span><span class="sheet-radio${none ? ' is-on' : ''}" aria-hidden="true"></span></button>`;
    const inboxRow = quick ? `<button class="popover-option sheet-option${inbox ? ' is-selected' : ''}" type="button" data-pop-action="quick-place" data-place="inbox"><i class="ph ph-tray" aria-hidden="true"></i><span class="sheet-option-label">${tr('Inbox')}<small>${tr('Sort it later')}</small></span><span class="sheet-radio${inbox ? ' is-on' : ''}" aria-hidden="true"></span></button>` : '';
    const html = `<div class="popover-title">${quick ? tr('Where does the task go') : tr('Project')}</div>${source?.title ? `<p class="sheet-subtitle">${esc(source.title)}</p>` : ''}<label class="sheet-search"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><input class="input" type="search" data-sheet-search placeholder="${tr('Search projects')}" aria-label="${tr('Search projects')}"></label><div class="sheet-card">${inboxRow}${noneRow}${ordered.map(option).join('')}<button class="popover-option sheet-option sheet-add" type="button" data-pop-action="inline-new-project" ${attrs}><i class="ph ph-plus" aria-hidden="true"></i>${tr('New project')}</button></div><p class="sheet-note">${tr("The task takes its project's area. A tap applies the choice.")}</p>`;
    openPopover(anchor, html, { type: 'project', target });
  }

  // Redesign R3 (E4): one date sheet for Planirano and Rok, in the task window and in Quick Add.
  let dateSheet = null, reminderSheet = null, tagSheet = null;
  function nextMonday(today) {
    const weekday = parseLocalDate(today).getDay();
    return Core.addDays(today, ((8 - weekday) % 7) || 7);
  }
  function monthGrid(selected, view, today = Core.dateOnly()) {
    const sundayFirst = Core.weekStartKey(state.settings.weekStartsOn) === 'sunday';
    const first = new Date(view.y, view.m, 1, 12);
    const count = new Date(view.y, view.m + 1, 0).getDate();
    const lead = (first.getDay() - (sundayFirst ? 0 : 1) + 7) % 7;
    const weekday = new Intl.DateTimeFormat(I18n.locale(), { weekday: 'short' });
    const names = Array.from({ length: 7 }, (_, index) => weekday.format(new Date(2026, 0, 4 + index + (sundayFirst ? 0 : 1), 12)));
    const title = new Intl.DateTimeFormat(I18n.locale(), { month: 'long', year: 'numeric' }).format(first);
    let html = `<div class="sheet-calendar"><div class="sheet-calendar-head"><button class="btn-icon" type="button" data-pop-action="date-sheet-month" data-step="-1" aria-label="${tr('Previous month')}"><i class="ph ph-caret-left"></i></button><span class="sheet-calendar-title">${esc(title)}</span><button class="btn-icon" type="button" data-pop-action="date-sheet-month" data-step="1" aria-label="${tr('Next month')}"><i class="ph ph-caret-right"></i></button></div><div class="sheet-calendar-grid">${names.map(name => `<span class="sheet-calendar-weekday">${esc(name)}</span>`).join('')}${'<span></span>'.repeat(lead)}`;
    for (let dayNumber = 1; dayNumber <= count; dayNumber += 1) {
      const date = Core.dateOnly(new Date(view.y, view.m, dayNumber, 12));
      html += `<button class="sheet-calendar-day${date === selected ? ' is-selected' : ''}${date === today ? ' is-today' : ''}" type="button" data-pop-action="date-sheet-pick" data-date="${date}" aria-pressed="${date === selected}" aria-label="${esc(formatDate(date, 'full'))}">${dayNumber}</button>`;
    }
    return `${html}</div></div>`;
  }
  function openDateSheet(anchor, target, kind) {
    // R8b: a habit's "Početak" (target.type === 'habit', kind 'start') uses the same sheet on the habit window's draft.
    const source = target.type === 'quick' || target.type === 'habit' ? modalState?.draft : getTask(target.taskId);
    if (!source) return;
    // In Quick Add the sheet starts from the effective plan: the parsed date until one is picked.
    const plan = target.type === 'quick' && !source.explicitPlan ? (source.parsedPlanDate || source.plannedDate) : source.plannedDate;
    const date = (kind === 'plan' ? plan : kind === 'start' ? source.startDate : source.dueDate) || null;
    const base = parseLocalDate(date || Core.dateOnly());
    const sheet = { target, kind, date, time: kind === 'start' ? null : (kind === 'plan' ? source.plannedTime : source.dueTime) || null, view: { y: base.getFullYear(), m: base.getMonth() } };
    dateSheet = sheet;
    openPopover(anchor, dateSheetHtml(), { type: 'date-sheet', target });
    dateSheet = sheet; // openPopover closes the previous sheet first, which clears the sheet state
  }
  function dateSheetHtml() {
    const { target, kind, date, time, view } = dateSheet;
    const source = target.type === 'quick' || target.type === 'habit' ? modalState?.draft : getTask(target.taskId);
    const today = Core.dateOnly();
    const quick = [[tr('Today'), today], [tr('Tomorrow'), Core.addDays(today, 1)], [tr('Start of next week'), nextMonday(today)]];
    const chips = `<div class="sheet-chips">${quick.map(([label, value]) => `<button class="quick-chip${date === value ? ' is-selected' : ''}" type="button" data-pop-action="date-sheet-pick" data-date="${value}" aria-pressed="${date === value}">${esc(label)}</button>`).join('')}</div>`;
    if (kind === 'start') return `<div class="popover-title">${tr('Start')}</div><p class="sheet-subtitle">${esc(source?.name?.trim() || tr('New habit'))}</p>${chips}${monthGrid(date, view, today)}<div class="sheet-footer"><span></span><button class="btn btn-primary" type="button" data-pop-action="date-sheet-apply">${tr('Apply')}</button></div>`;
    const otherDate = kind === 'plan' ? source?.dueDate : source?.plannedDate;
    const otherTime = kind === 'plan' ? source?.dueTime : source?.plannedTime;
    const other = otherDate ? `${relativeDateLabel(otherDate)}${otherTime ? ` · ${otherTime}` : ''}` : '';
    const note = kind === 'plan' ? (other ? tr('The due date stays: {date}', { date: other }) : tr('No due date is set.')) : (other ? tr('The planned date stays: {date}', { date: other }) : tr('No planned date is set.'));
    return `<div class="popover-title">${kind === 'plan' ? tr('Planned') : tr('Due date')}</div>${source?.title ? `<p class="sheet-subtitle">${esc(source.title)}</p>` : ''}${chips}${monthGrid(date, view, today)}<label class="sheet-field"><i class="ph ph-clock" aria-hidden="true"></i><span>${tr('Time')}</span><input id="date-sheet-time" class="input" type="time" value="${esc(time || '')}"></label><p class="sheet-note">${esc(note)}</p><div class="sheet-footer"><button class="btn btn-ghost" type="button" data-pop-action="date-sheet-clear">${tr('Remove date')}</button><button class="btn btn-primary" type="button" data-pop-action="date-sheet-apply">${tr('Apply')}</button></div>`;
  }
  function applyDateSheet(clear) {
    if (!dateSheet) return;
    const { target, kind } = dateSheet;
    if (target.type === 'habit') { modalState.draft.startDate = dateSheet.date || Core.dateOnly(); closePopover(); renderModal(); return; }
    const date = clear ? null : dateSheet.date;
    const time = date ? Core.normalizeTime($('#date-sheet-time', popoverEl)?.value ?? dateSheet.time) : null;
    if (target.type === 'quick') {
      const draft = modalState.draft;
      if (kind === 'plan') Object.assign(draft, { plannedDate: date, plannedTime: time, explicitPlan: true, parsedPlanDate: null, explicitPlannedTime: Boolean(time) });
      else Object.assign(draft, { dueDate: date, dueTime: time });
      closePopover(); renderModal(); return;
    }
    closePopover();
    requestTaskEdit(target.taskId, kind === 'plan' ? { plannedDate: date, plannedTime: time, ...(date ? { isInbox: false } : {}) } : { dueDate: date, dueTime: time });
  }

  function openPlanPicker(anchor, target) {
    openDateSheet(anchor, target, 'plan');
  }

  function openDuePicker(anchor, target) {
    openDateSheet(anchor, target, 'due');
  }

  // Redesign R3 (E9): several tags at once, saved together with "Primeni".
  function openTagPicker(anchor, target) {
    const selected = target.type === 'quick' ? (modalState.draft.tagIds || []) : (getTask(target.taskId)?.tagIds || []);
    const sheet = { target, ids: new Set(selected) };
    tagSheet = sheet;
    openPopover(anchor, tagSheetHtml(), { type: 'tag-picker', target });
    tagSheet = sheet;
  }
  function tagSheetHtml() {
    const { target, ids } = tagSheet;
    const attrs = `data-target-type="${target.type}"${target.taskId ? ` data-task-id="${esc(target.taskId)}"` : ''}`;
    const source = target.type === 'quick' ? modalState?.draft : getTask(target.taskId);
    const tags = [...(state.tags || [])].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const options = tags.map(tag => { const on = ids.has(tag.id); return `<button class="popover-option sheet-option${on ? ' is-selected' : ''}" type="button" data-sheet-item data-search="${esc(String(tag.name).toLowerCase())}" data-pop-action="tag-sheet-toggle" data-tag-id="${esc(tag.id)}" aria-pressed="${on}"><span class="tag-dot" style="--tag-color:${esc(tag.color)}"></span><span class="sheet-option-label">${esc(tag.name)}</span><span class="sheet-check${on ? ' is-on' : ''}" aria-hidden="true">${on ? '<i class="ph ph-check"></i>' : ''}</span></button>`; }).join('');
    return `<div class="popover-title">${tr('Tags')}</div>${source?.title ? `<p class="sheet-subtitle">${esc(source.title)}</p>` : ''}<label class="sheet-search"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><input class="input" type="search" data-sheet-search placeholder="${tr('Search tags')}" aria-label="${tr('Search tags')}"></label><div class="sheet-card">${options || `<div class="popover-empty">${tr('No tags yet')}</div>`}<button class="popover-option sheet-option sheet-add" type="button" data-pop-action="inline-new-tag" ${attrs}><i class="ph ph-plus" aria-hidden="true"></i>${tr('New tag')}</button></div><div class="sheet-footer"><span></span><button class="btn btn-primary" type="button" data-pop-action="tag-sheet-apply">${tr('Apply')}</button></div>`;
  }
  function toggleTagSheet(button) {
    if (!tagSheet) return;
    const id = button.dataset.tagId;
    const on = !tagSheet.ids.has(id);
    if (on) tagSheet.ids.add(id); else tagSheet.ids.delete(id);
    button.classList.toggle('is-selected', on);
    button.setAttribute('aria-pressed', String(on));
    const check = button.querySelector('.sheet-check');
    if (check) { check.classList.toggle('is-on', on); check.innerHTML = on ? '<i class="ph ph-check"></i>' : ''; }
  }
  function applyTagSheet() {
    if (!tagSheet) return;
    const { target } = tagSheet;
    const tagIds = [...tagSheet.ids].filter(id => getTag(id));
    if (target.type === 'quick') { modalState.draft.tagIds = tagIds; closePopover(); renderModal(); return; }
    closePopover();
    requestTaskEdit(target.taskId, { tagIds });
  }

  // Redesign R3 (E5): Bez, Nizak, Srednji, Visok with flags; a tap applies (E3).
  function openPriorityPicker(anchor, target) {
    const source = target.type === 'quick' ? modalState?.draft : getTask(target.taskId);
    const current = source?.priority || 'none';
    const attrs = `data-target-type="${target.type}"${target.taskId ? ` data-task-id="${esc(target.taskId)}"` : ''}`;
    const label = value => (value === 'none' ? tr('No priority') : priorityLabel(value));
    const html = `<div class="popover-title">${tr('Priority')}</div>${source?.title ? `<p class="sheet-subtitle">${esc(source.title)}</p>` : ''}<div class="sheet-card">${['none', 'low', 'medium', 'high'].map(value => `<button class="popover-option sheet-option${current === value ? ' is-selected' : ''}" type="button" data-pop-action="set-priority" data-priority="${value}" ${attrs}><i class="ph ph-flag task-flag task-flag--${value}" aria-hidden="true"></i><span class="sheet-option-label">${esc(label(value))}</span><span class="sheet-radio${current === value ? ' is-on' : ''}" aria-hidden="true"></span></button>`).join('')}</div><p class="sheet-note">${tr('Priority does not change the order.')}</p>`;
    openPopover(anchor, html, { type: 'priority-picker' });
  }

  // Redesign R3: the task's duration. A chip applies at once; another number applies with "Primeni".
  function openTaskDurationPicker(anchor, taskId) {
    const task = getTask(taskId);
    if (!task) return;
    const current = task.durationMinutes || null;
    const chip = minutes => `<button class="quick-chip${current === minutes ? ' is-selected' : ''}" type="button" data-pop-action="set-task-duration" data-task-id="${esc(taskId)}" data-minutes="${minutes}" aria-pressed="${current === minutes}">${esc(durationLabel(minutes))}</button>`;
    const html = `<div class="popover-title">${tr('Duration')}</div><p class="sheet-subtitle">${esc(task.title)}</p><div class="sheet-chips">${[15, 30, 45, 60, 90, 120].map(chip).join('')}</div><label class="sheet-field"><i class="ph ph-timer" aria-hidden="true"></i><span>${tr('Other duration (min)')}</span><input id="task-duration-custom" class="input" type="number" min="1" max="1440" step="1" value="${esc(current || '')}"></label><p class="sheet-note">${tr('A tap sets the duration at once. Durations show in the Calendar day view.')}</p><div class="sheet-footer">${current ? `<button class="btn btn-ghost" type="button" data-pop-action="set-task-duration" data-task-id="${esc(taskId)}" data-minutes="">${tr('Remove duration')}</button>` : '<span></span>'}<button class="btn btn-primary" type="button" data-pop-action="set-task-duration-custom" data-task-id="${esc(taskId)}">${tr('Apply')}</button></div>`;
    openPopover(anchor, html, { type: 'task-duration', taskId });
  }
  function setTaskDuration(taskId, value) {
    const minutes = Number(value);
    closePopover();
    requestTaskEdit(taskId, { durationMinutes: Number.isInteger(minutes) && minutes > 0 && minutes <= 1440 ? minutes : null });
  }

  // Redesign R5 (Z7): the project's area applies at once; its tasks follow the project's area.
  function openProjectAreaSheet(anchor, projectId) {
    const project = getProject(projectId);
    if (!project) return;
    const option = (areaId, label) => `<button class="popover-option sheet-option${(project.areaId || '') === areaId ? ' is-selected' : ''}" type="button" data-pop-action="set-project-area" data-project-id="${esc(projectId)}" data-area-id="${esc(areaId)}"><span class="sheet-option-label">${esc(label)}</span><span class="sheet-radio${(project.areaId || '') === areaId ? ' is-on' : ''}" aria-hidden="true"></span></button>`;
    const areas = sortedAreas().filter(area => area.status !== 'archived' || area.id === project.areaId);
    openPopover(anchor, `<div class="popover-title">${tr('Area')}</div><p class="sheet-subtitle">${esc(project.name)}</p><div class="sheet-card">${option('', tr('No area'))}${areas.map(area => option(area.id, area.name)).join('')}</div><p class="sheet-note">${tr("Tasks take their project's area.")}</p>`, { type: 'project-area', projectId });
  }
  function setProjectArea(projectId, areaId) {
    const project = getProject(projectId);
    if (!project) return;
    project.areaId = (state.areas || []).some(area => area.id === areaId) ? areaId : null;
    project.updatedAt = nowIso();
    closePopover(); saveState(); render();
  }

  // Redesign R5 (Z7): the project's goals, chosen together with "Primeni"; a new link counts all its tasks.
  let projectGoalSheet = null;
  function openProjectGoalsSheet(anchor, projectId) {
    const project = getProject(projectId);
    if (!project) return;
    const goals = (state.goals || []).filter(goal => goal.status !== 'archived');
    const sheet = { projectId, ids: new Set(goals.filter(goal => (goal.projectLinks || []).some(link => link.projectId === projectId)).map(goal => goal.id)) };
    const options = goals.map(goal => { const on = sheet.ids.has(goal.id); return `<button class="popover-option sheet-option${on ? ' is-selected' : ''}" type="button" data-pop-action="project-goal-toggle" data-goal-id="${esc(goal.id)}" aria-pressed="${on}"><i class="ph ph-target" aria-hidden="true"></i><span class="sheet-option-label">${esc(goal.title)}</span><span class="sheet-check${on ? ' is-on' : ''}" aria-hidden="true">${on ? '<i class="ph ph-check"></i>' : ''}</span></button>`; }).join('');
    openPopover(anchor, `<div class="popover-title">${tr('Linked goals')}</div><p class="sheet-subtitle">${esc(project.name)}</p><div class="sheet-card">${options || `<div class="popover-empty">${tr('No Goals yet.')}</div>`}</div><div class="sheet-footer"><span></span><button class="btn btn-primary" type="button" data-pop-action="project-goals-apply">${tr('Apply')}</button></div>`, { type: 'project-goals', projectId });
    projectGoalSheet = sheet;
  }
  function applyProjectGoals() {
    const sheet = projectGoalSheet;
    if (!sheet) return;
    const before = captureGoalProgress();
    for (const goal of (state.goals || []).filter(item => item.status !== 'archived')) {
      const links = goal.projectLinks || [];
      const linked = links.some(link => link.projectId === sheet.projectId);
      const wanted = sheet.ids.has(goal.id);
      if (linked === wanted) continue;
      syncGoalLinks(goal, wanted ? [...links, { projectId: sheet.projectId, contributionMode: 'allTasks', selectedTaskIds: [] }] : links.filter(link => link.projectId !== sheet.projectId), goal.taskIds || [], goal.habitLinks || []);
      goal.updatedAt = nowIso();
      putGoalHistory(goal.id, wanted ? 'projectLinked' : 'projectUnlinked', { projectId: sheet.projectId });
    }
    closePopover(); saveState(); evaluateGoalProgressChanges(before); render();
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

  function setPopoverContent(html) {
    if (!popoverEl) return;
    popoverEl.innerHTML = html;
    decorateSheet(popoverEl);
    const title = popoverEl.querySelector('.popover-title');
    if (title) {
      title.id = title.id || `popover-title-${Date.now().toString(36)}`;
      popoverEl.setAttribute('role', 'dialog');
      popoverEl.setAttribute('aria-labelledby', title.id);
    }
    requestAnimationFrame(() => (popoverEl && sheetInitialFocus(popoverEl))?.focus());
  }

  function popoverFocusTarget(anchor) {
    if (!(anchor instanceof HTMLElement)) return null;
    const keys = ['action', 'popAction', 'taskId', 'targetType', 'dateKind', 'areaId', 'goalId', 'habitId', 'tagId'];
    const attrs = keys.filter(key => anchor.dataset[key] !== undefined)
      .map(key => `[data-${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${cssEscape(anchor.dataset[key])}"]`).join('');
    return { element: anchor, selector: attrs || (anchor.id ? '#' + cssEscape(anchor.id) : ''), modalScoped: Boolean(anchor.closest('.modal')) };
  }

  function inlineNewTag(button) {
    const targetType = button.dataset.targetType; const taskId = button.dataset.taskId || ''; const color = PROJECT_COLORS[(state.tags || []).length % PROJECT_COLORS.length];
    if (!popoverEl) return;
    setPopoverContent(`<div class="popover-title">${tr('New tag')}</div><div class="popover-inline-form"><input id="inline-tag-name" class="input" type="text" maxlength="80" placeholder="${tr('Tag name')}" /><div class="color-grid">${PROJECT_COLORS.map(c=>`<button class="color-swatch ${c===color?'is-selected':''}" type="button" data-pop-action="inline-select-tag-color" data-color="${c}" aria-label="${tr('Select color')}" style="--swatch:${c}"></button>`).join('')}</div><div id="inline-tag-error" class="validation" hidden></div><div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-ghost" type="button" data-pop-action="inline-tag-cancel">${tr('Cancel')}</button><button class="btn btn-primary" type="button" data-pop-action="inline-tag-create" data-target-type="${targetType}" ${taskId ? `data-task-id="${esc(taskId)}"` : ''} data-color="${color}">${tr('Create')}</button></div></div>`);
    requestAnimationFrame(()=>$('#inline-tag-name',popoverEl)?.focus());
  }

  // Redesign R3 (E6): quick choices from the planned time (or, without one, later today and tomorrow morning),
  // the date and time, the sentence, the task's dates, "Ukloni podsetnik" and "Primeni".
  function openReminderPicker(anchor, target) {
    const task = target.type === 'quick' ? modalState.draft : getTask(target.taskId);
    if (!task) return;
    const pad = value => String(value).padStart(2, '0');
    const parts = instant => { const date = new Date(instant); return { date: Core.dateOnly(date), time: `${pad(date.getHours())}:${pad(date.getMinutes())}` }; };
    let presets;
    if (task.plannedDate && task.plannedTime) {
      const base = new Date(`${task.plannedDate}T${task.plannedTime}:00`).getTime();
      presets = [[tr('At the planned time'), parts(base)], [tr('15 min before'), parts(base - 15 * 60000)], [tr('1 h before'), parts(base - 3600000)], [tr('Day before at 9:00'), { date: Core.addDays(task.plannedDate, -1), time: '09:00' }]];
    } else {
      const later = Core.laterToday(new Date()); // null late in the evening: the option is not offered (audit H-2)
      presets = [...(later ? [[tr('Later today'), parts(later)]] : []), [tr('Tomorrow morning'), { date: Core.addDays(Core.dateOnly(), 1), time: '09:00' }]];
    }
    const current = task.reminderAt ? parts(task.reminderAt) : null;
    const sheet = { target, presets, date: current?.date || task.plannedDate || Core.dateOnly(), time: current?.time || task.plannedTime || '09:00' };
    reminderSheet = sheet;
    openPopover(anchor, reminderSheetHtml(), { type: 'reminder', target });
    reminderSheet = sheet;
  }
  function reminderSheetHtml() {
    const { target, presets, date, time } = reminderSheet;
    const task = target.type === 'quick' ? modalState?.draft : getTask(target.taskId);
    const when = (day, at) => (day ? `${relativeDateLabel(day)}${at ? ` · ${at}` : ''}` : '—');
    const chips = presets.map(([label, value]) => `<button class="quick-chip${value.date === date && value.time === time ? ' is-selected' : ''}" type="button" data-pop-action="reminder-preset" data-date="${value.date}" data-time="${value.time}" aria-pressed="${value.date === date && value.time === time}">${esc(label)}</button>`).join('');
    return `<div class="popover-title">${tr('Reminder')}</div>${task?.title ? `<p class="sheet-subtitle">${esc(task.title)}</p>` : ''}<div class="sheet-chips">${chips}</div>${task?.plannedDate && task?.plannedTime ? '' : `<p class="sheet-note">${tr('Quick choices for the planned time appear when the task has one.')}</p>`}<label class="sheet-field"><i class="ph ph-calendar-blank" aria-hidden="true"></i><span>${tr('Date')}</span><input id="reminder-date" class="input" type="date" value="${esc(date)}"></label><label class="sheet-field"><i class="ph ph-clock" aria-hidden="true"></i><span>${tr('Time')}</span><input id="reminder-time" class="input" type="time" value="${esc(time)}"></label><p class="sheet-summary" data-reminder-summary>${esc(tr('Remind me {date} at {time}', { date: relativeDateLabel(date), time }))}</p><h3 class="sheet-group-title">${tr('Task dates')}</h3><div class="sheet-card"><div class="sheet-option"><i class="ph ph-calendar-check" aria-hidden="true"></i><span class="sheet-option-label">${tr('Planned')}</span><span class="sheet-option-value">${esc(when(task?.plannedDate, task?.plannedTime))}</span></div><div class="sheet-option"><i class="ph ph-hourglass-medium" aria-hidden="true"></i><span class="sheet-option-label">${tr('Due date')}</span><span class="sheet-option-value">${esc(when(task?.dueDate, task?.dueTime))}</span></div></div><div class="sheet-footer">${task?.reminderAt ? `<button class="btn btn-ghost" type="button" data-pop-action="reminder-clear">${tr('Clear reminder')}</button>` : '<span></span>'}<button class="btn btn-primary" type="button" data-pop-action="reminder-apply">${tr('Apply')}</button></div>`;
  }
  function applyReminderSheet() {
    if (!reminderSheet) return;
    const date = $('#reminder-date', popoverEl)?.value || reminderSheet.date;
    const time = Core.normalizeTime($('#reminder-time', popoverEl)?.value || reminderSheet.time);
    const value = date && time ? fromLocalDateTimeValue(`${date}T${time}`) : null;
    if (value) setReminder(reminderSheet.target.type, reminderSheet.target.taskId, value);
  }

  // Redesign R11b (S15, E7): one repeat editor for the task window and drafts. It keeps every choice while
  // the frequency changes and writes the R11a rule only on "Primeni".
  let repeatSheet = null;
  function repeatSource(target) {
    return target.type === 'task' ? getTask(target.taskId) : modalState?.draft;
  }
  function repeatEditorState(target, source) {
    const start = source.plannedDate || source.parsedPlanDate || source.dueDate || Core.dateOnly();
    const date = parseLocalDate(start);
    const rule = Core.normalizeRecurrenceV3(source.recurrence);
    const nth = Math.ceil(date.getDate() / 7);
    const sheet = {
      target, start, frequency: rule?.frequency || 'weekly', interval: rule?.interval || 1,
      weekdays: rule?.weekdays ? [...rule.weekdays] : [date.getDay()],
      monthMode: rule?.monthMode || 'day', monthDay: rule?.monthDay ?? date.getDate(),
      weekOfMonth: rule?.weekOfMonth ?? (nth > 4 ? 'last' : nth), weekday: rule?.weekday ?? date.getDay(),
      endType: rule?.endType || 'never', endDate: rule?.endDate || Core.addDays(start, 90), endAfterOccurrences: rule?.endAfterOccurrences || 10,
      occurrencesCreated: rule?.occurrencesCreated || 0, status: rule?.status || 'active', error: '',
    };
    sheet.initial = rule ? repeatRuleFromSheet(sheet) : null;
    return sheet;
  }
  function repeatRuleFromSheet(sheet) {
    const rule = { frequency: sheet.frequency, interval: sheet.interval };
    if (sheet.frequency === 'weekly') rule.weekdays = [...sheet.weekdays];
    if (sheet.frequency === 'monthly') Object.assign(rule, sheet.monthMode === 'weekday' ? { monthMode: 'weekday', weekOfMonth: sheet.weekOfMonth, weekday: sheet.weekday } : { monthMode: 'day', monthDay: sheet.monthDay });
    return { ...rule, endType: sheet.endType, endDate: sheet.endType === 'date' ? sheet.endDate : null, endAfterOccurrences: sheet.endType === 'afterOccurrences' ? Number(sheet.endAfterOccurrences) : null };
  }
  function repeatPresetOn(sheet, index) {
    const preset = REPEAT_PRESETS[index][1], date = parseLocalDate(sheet.start);
    if (sheet.frequency !== preset.frequency || sheet.interval !== preset.interval) return false;
    if (preset.frequency === 'weekly') return sheet.weekdays.length === 1 && sheet.weekdays[0] === date.getDay();
    if (preset.frequency === 'monthly') return sheet.monthMode === 'day' && sheet.monthDay === date.getDate();
    return true;
  }
  function openRepeatPicker(anchor, target) {
    const source = repeatSource(target);
    if (!source) return;
    const sheet = repeatEditorState(target, source);
    repeatSheet = sheet;
    openPopover(anchor, repeatSheetHtml(), { type: 'repeat', target });
    repeatSheet = sheet; // openPopover closes the previous sheet first, which clears the sheet state
  }
  function repeatSheetHtml() {
    const s = repeatSheet, source = repeatSource(s.target);
    const rule = repeatRuleFromSheet(s), date = parseLocalDate(s.start);
    const pressed = on => `${on ? ' is-selected' : ''}" type="button"`;
    const radio = (action, value, label, on, extra = '') => `<button class="popover-option sheet-option${on ? ' is-selected' : ''}" type="button" role="radio" aria-checked="${on}" data-pop-action="${action}" data-value="${value}"><span class="sheet-radio${on ? ' is-on' : ''}" aria-hidden="true"></span><span class="sheet-option-label">${label}</span>${extra}</button>`;
    const dayButtons = (action, isOn) => `<div class="habit-weekdays">${REPEAT_DAY_ORDER.map(day => `<button class="habit-weekday${isOn(day) ? ' is-on' : ''}" type="button" data-pop-action="${action}" data-day="${day}" aria-pressed="${isOn(day)}">${tr(REPEAT_SHORT_DAYS[day])}</button>`).join('')}</div>`;
    const chips = REPEAT_PRESETS.map(([label], index) => { const on = repeatPresetOn(s, index); return `<button class="quick-chip${pressed(on)} data-pop-action="repeat-preset" data-preset="${index}" aria-pressed="${on}">${tr(label)}</button>`; }).join('');
    const segment = REPEAT_FREQUENCIES.map(([value, label]) => `<button class="btn${pressed(s.frequency === value)} data-pop-action="repeat-frequency" data-value="${value}" aria-pressed="${s.frequency === value}">${tr(label)}</button>`).join('');
    const n = s.interval;
    const unit = { daily: trn(n, 'day', 'days'), weekly: trn(n, 'week', 'weeks'), monthly: trn(n, 'month', 'months'), yearly: trn(n, 'year', 'years') }[s.frequency];
    const stepper = `<div class="sheet-field habit-stepper-field"><span>${tr('Interval')}</span><span class="habit-stepper"><button class="btn-icon" type="button" data-pop-action="repeat-step" data-step="-1"${n <= 1 ? ' disabled' : ''} aria-label="${tr('Decrease')}"><i class="ph ph-minus"></i></button><span class="habit-stepper-value" aria-live="polite">${n}</span><button class="btn-icon" type="button" data-pop-action="repeat-step" data-step="1"${n >= 99 ? ' disabled' : ''} aria-label="${tr('Increase')}"><i class="ph ph-plus"></i></button><span class="repeat-unit">${esc(unit)}</span></span></div>`;
    let extra = '';
    if (s.frequency === 'weekly') extra = `<h3 class="sheet-group-title">${tr('Days')}</h3>${dayButtons('repeat-day', day => s.weekdays.includes(day))}`;
    if (s.frequency === 'monthly') {
      const which = tr(REPEAT_NTH_WEEKDAY[s.weekOfMonth][s.weekday]);
      extra = `<div class="sheet-card" role="radiogroup" aria-label="${tr('Monthly')}">${radio('repeat-month-mode', 'day', tr('Day of the month'), s.monthMode === 'day', `<span class="sheet-option-value">${s.monthDay === 'last' ? tr('last') : `${s.monthDay}.`}</span>`)}${radio('repeat-month-mode', 'weekday', tr('Day of the week'), s.monthMode === 'weekday', `<span class="sheet-option-value">${esc(which)}</span>`)}</div>`;
      if (s.monthMode === 'day') {
        extra += `<div class="repeat-month-days">${Array.from({ length: 31 }, (_, index) => { const on = s.monthDay === index + 1; return `<button class="sheet-calendar-day${pressed(on)} data-pop-action="repeat-month-day" data-value="${index + 1}" aria-pressed="${on}">${index + 1}</button>`; }).join('')}<button class="quick-chip repeat-last-day${pressed(s.monthDay === 'last')} data-pop-action="repeat-month-day" data-value="last" aria-pressed="${s.monthDay === 'last'}">${tr('Last day')}</button></div>`;
        if (typeof s.monthDay === 'number' && s.monthDay > 28) extra += `<p class="sheet-note">${tr('In shorter months it falls on the last day.')}</p>`;
      } else {
        extra += `<div class="sheet-chips">${REPEAT_NTH.map(([value, label]) => `<button class="quick-chip${pressed(s.weekOfMonth === value)} data-pop-action="repeat-nth" data-value="${value}" aria-pressed="${s.weekOfMonth === value}">${tr(label)}</button>`).join('')}</div>${dayButtons('repeat-nth-day', day => s.weekday === day)}`;
      }
    }
    if (s.frequency === 'yearly') extra = `<p class="sheet-note">${esc(tr('The date is the day of the first time: {date}.', { date: formatDate(s.start) }))}</p>`;
    const dates = Core.upcomingRecurrenceDates(s.start, { ...rule, occurrencesCreated: s.occurrencesCreated }, 3, Core.dateOnly());
    const next = dates.length ? tr('Next times: {dates}', { dates: dates.map(value => REPEAT_DATE_FMT.format(parseLocalDate(value))).join(' · ') }) : tr('No more repeats.');
    const end = `<h3 class="sheet-group-title">${tr('End')}</h3><div class="sheet-card" role="radiogroup" aria-label="${tr('End')}">${radio('repeat-end', 'never', tr('Never'), s.endType === 'never')}${radio('repeat-end', 'date', tr('On date'), s.endType === 'date')}${radio('repeat-end', 'afterOccurrences', tr('After a number of times'), s.endType === 'afterOccurrences')}</div>`
      + (s.endType === 'date' ? `<label class="sheet-field"><i class="ph ph-calendar-blank" aria-hidden="true"></i><span>${tr('End date')}</span><input id="repeat-end-date" class="input" type="date" min="${esc(s.start)}" value="${esc(s.endDate)}"></label>` : '')
      + (s.endType === 'afterOccurrences' ? `<label class="sheet-field"><i class="ph ph-hash" aria-hidden="true"></i><span>${tr('Number of times')}</span><input id="repeat-end-count" class="input" type="number" min="1" step="1" value="${esc(s.endAfterOccurrences)}"></label>` : '')
      + (s.error ? `<p class="validation" role="alert">${esc(s.error)}</p>` : '');
    // R11c (S14): the controls of an active or paused repeat; each says what it did and offers Undo.
    const operational = s.target.type === 'task' ? taskRecurrence(source) : null;
    const attrs = `data-task-id="${esc(s.target.taskId)}" data-target-type="task"`;
    const control = (action, label, note, danger = false) => `<button class="popover-option sheet-option${danger ? ' is-danger' : ''}" type="button" data-pop-action="${action}" ${attrs}><span class="sheet-option-label">${label}<small>${note}</small></span></button>`;
    const paused = operational?.status === 'paused', skipping = Boolean(operational && taskRecurrence(recurrenceSkipTarget(source))?.skipNext);
    const controls = operational && operational.status !== 'ended' ? `<h3 class="sheet-group-title">${tr('This repeat')}</h3><div class="sheet-card">${control('skip-recurrence', skipping ? tr('Skip is scheduled · cancel') : tr('Skip next occurrence'), skipping ? tr('The next task is made for the repeat after it.') : tr('When you complete this one, the next repeat is skipped.'))}${control(paused ? 'resume-recurrence' : 'pause-recurrence', paused ? tr('Resume recurrence') : tr('Pause recurrence'), paused ? tr('Completing makes the next task again.') : tr('While paused, completing makes no next one.'))}${control('end-recurrence', tr('End recurrence'), tr('This task stays; no more are made.'), true)}</div>` : '';
    const clear = operational ? '<span></span>' : `<button class="btn btn-ghost" type="button" data-pop-action="repeat-clear">${tr('Does not repeat')}</button>`;
    return `<div class="popover-title">${tr('Repeat')}</div>${source?.title ? `<p class="sheet-subtitle">${esc(source.title)}</p>` : ''}<div class="sheet-chips">${chips}</div><div class="view-tabs habit-window-seg repeat-frequency" role="group" aria-label="${tr('Frequency')}">${segment}</div>${stepper}${extra}<p class="sheet-summary" data-repeat-summary>${esc(recurrenceLabel({ ...rule, status: s.status }))}</p><p class="sheet-note">${esc(next)}</p>${end}${controls}<div class="sheet-footer">${clear}<button class="btn btn-primary" type="button" data-pop-action="repeat-apply">${tr('Apply')}</button></div>`;
  }
  function readRepeatInputs() {
    const date = $('#repeat-end-date', popoverEl), count = $('#repeat-end-count', popoverEl);
    if (date) repeatSheet.endDate = date.value;
    if (count) repeatSheet.endAfterOccurrences = count.value;
  }
  function handleRepeatAction(action, button) {
    const s = repeatSheet;
    if (!s) return false;
    readRepeatInputs();
    s.error = '';
    const data = button.dataset, date = parseLocalDate(s.start);
    if (action === 'repeat-apply') { applyRepeatSheet(); return true; }
    if (action === 'repeat-clear') {
      if (s.target.type === 'task') closePopover(); else setRecurrence(s.target.type, null, null);
      return true;
    }
    if (action === 'repeat-preset') {
      const preset = REPEAT_PRESETS[Number(data.preset)]?.[1];
      if (!preset) return true;
      Object.assign(s, preset);
      if (preset.frequency === 'weekly') s.weekdays = [date.getDay()];
      if (preset.frequency === 'monthly') Object.assign(s, { monthMode: 'day', monthDay: date.getDate() });
    } else if (action === 'repeat-frequency') Object.assign(s, { frequency: data.value, interval: 1 });
    else if (action === 'repeat-step') s.interval = Math.min(99, Math.max(1, s.interval + Number(data.step)));
    else if (action === 'repeat-day') {
      const day = Number(data.day);
      if (!s.weekdays.includes(day)) s.weekdays = [...s.weekdays, day].sort((a, b) => a - b);
      else if (s.weekdays.length > 1) s.weekdays = s.weekdays.filter(item => item !== day);
    } else if (action === 'repeat-month-mode') s.monthMode = data.value === 'weekday' ? 'weekday' : 'day';
    else if (action === 'repeat-month-day') s.monthDay = data.value === 'last' ? 'last' : Number(data.value);
    else if (action === 'repeat-nth') s.weekOfMonth = data.value === 'last' ? 'last' : Number(data.value);
    else if (action === 'repeat-nth-day') s.weekday = Number(data.day);
    else if (action === 'repeat-end') s.endType = data.value;
    else return false;
    const key = ['value', 'day', 'preset', 'step'].find(name => data[name] != null);
    refreshSheet(repeatSheetHtml(), `[data-pop-action="${action}"]${key ? `[data-${key}="${cssEscape(data[key])}"]` : ''}`);
    return true;
  }
  function applyRepeatSheet() {
    const s = repeatSheet;
    const endDate = Core.parseDateOnly(s.endDate);
    const valid = s.endType === 'date' ? Boolean(endDate) && Core.dateOnly(endDate) === s.endDate
      : s.endType === 'afterOccurrences' ? Number.isInteger(Number(s.endAfterOccurrences)) && Number(s.endAfterOccurrences) >= 1 : true;
    if (!valid) {
      s.error = tr('Choose a valid end date or number of times.');
      refreshSheet(repeatSheetHtml(), s.endType === 'date' ? '#repeat-end-date' : '#repeat-end-count');
      return;
    }
    const rule = repeatRuleFromSheet(s);
    if (s.target.type !== 'task') { setRecurrence(s.target.type, null, rule); return; }
    // An ended repeat starts again with "Primeni" (R11c); an unchanged active or paused one only closes.
    if (s.status === 'ended') rule.status = 'active';
    else if (JSON.stringify(rule) === JSON.stringify(s.initial)) { closePopover(); return; }
    setRecurrence('task', s.target.taskId, rule);
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



  function openTaskMenu(anchor, taskId) {
    const task = getTask(taskId); if (!task) return;
    const today = Core.dateOnly();
    const todayAction = task.plannedDate === today ? '' : `<button class="popover-option" type="button" data-pop-action="task-add-today" data-task-id="${esc(taskId)}"><i class="ph ph-sun"></i>${tr('Add to Today')}</button>`;
    const focus = task.isCompleted ? '' : `<button class="popover-option" type="button" data-pop-action="task-start-focus" data-task-id="${esc(taskId)}"><i class="ph ph-timer"></i>${tr('Start focus')}</button>`;
    const html = `${focus}${todayAction}<button class="popover-option" type="button" data-pop-action="task-move-tomorrow" data-task-id="${esc(taskId)}"><i class="ph ph-arrow-right"></i>${tr('Move to Tomorrow')}</button><button class="popover-option" type="button" data-pop-action="task-move-anytime" data-task-id="${esc(taskId)}"><i class="ph ph-infinity"></i>${tr('Move to Anytime')}</button><button class="popover-option" type="button" data-pop-action="task-open-plan" data-task-id="${esc(taskId)}"><i class="ph ph-calendar-check"></i>${tr('Plan for...')}</button><button class="popover-option" type="button" data-pop-action="task-open-due" data-task-id="${esc(taskId)}"><i class="ph ph-flag"></i>${tr('Change due date')}</button><button class="popover-option" type="button" data-pop-action="task-open-project" data-task-id="${esc(taskId)}"><i class="ph ph-folder-simple"></i>${tr('Move to project')}</button><button class="popover-option" type="button" data-pop-action="task-duplicate" data-task-id="${esc(taskId)}"><i class="ph ph-copy"></i>${tr('Duplicate')}</button><div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="task-delete" data-task-id="${esc(taskId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>${tr('Delete')}</button>`;
    openPopover(anchor, templateMenuEntry('task',taskId)+html, { type: 'task-menu', taskId });
  }

  function openTagMenu(anchor, tagId) {
    const tag = getTag(tagId); if (!tag) return;
    const html = `<button class="popover-option" type="button" data-pop-action="edit-tag" data-tag-id="${esc(tagId)}"><i class="ph ph-pencil-simple"></i>${tr('Edit tag')}</button><button class="popover-option" type="button" data-pop-action="delete-tag" data-tag-id="${esc(tagId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>${tr('Delete tag')}</button>`;
    openPopover(anchor, html, { type: 'tag-menu', tagId });
  }

  // Redesign R3 (E2): every popover is a bottom sheet over a dimmed backdrop, with a grabber, its title and X.
  function decorateSheet(el) {
    const header = document.createElement('div');
    header.className = 'sheet-header';
    header.innerHTML = '<span class="sheet-grabber" aria-hidden="true"></span>';
    const title = el.querySelector(':scope > .popover-title');
    if (title) header.appendChild(title);
    header.insertAdjacentHTML('beforeend', `<button class="btn-icon sheet-close" type="button" data-pop-action="close-sheet" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button>`);
    el.prepend(header);
  }

  function sheetInitialFocus(el) {
    return el.querySelector('[data-sheet-focus]') || el.querySelector('.popover-option.is-selected, .quick-chip.is-selected') || el.querySelector('.popover-option')
      || [...el.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].find(node => !node.matches('.sheet-close, [data-sheet-search]')) || el.querySelector('.sheet-close');
  }

  // Replaces a sheet's content in place and keeps the focus on the control that was used.
  function refreshSheet(html, focusSelector) {
    if (!popoverEl) return;
    popoverEl.innerHTML = html;
    decorateSheet(popoverEl);
    requestAnimationFrame(() => ((focusSelector && popoverEl?.querySelector(focusSelector)) || (popoverEl && sheetInitialFocus(popoverEl)))?.focus());
  }

  function openPopover(anchor, html, meta = {}) {
    closePopover();
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    const el = document.createElement('div');
    el.className = 'popover popover--sheet';
    el.dataset.popoverType = meta.type || '';
    el.innerHTML = html;
    el.setAttribute('role', 'dialog');
    const title = el.querySelector('.popover-title');
    if (title) {
      title.id = title.id || `popover-title-${Date.now().toString(36)}`;
      el.setAttribute('aria-labelledby', title.id);
    } else el.setAttribute('aria-label', tr('Menu'));
    popoverReturnFocus = popoverFocusTarget(anchor);
    el.returnFocus = popoverReturnFocus;
    el.setAttribute('aria-modal', 'true');
    decorateSheet(el);
    el.backdrop = backdrop;
    document.body.appendChild(backdrop);
    document.body.appendChild(el);
    popoverEl = el;
    requestAnimationFrame(() => sheetInitialFocus(el)?.focus());
  }

  function closePopover() {
    const target = popoverEl?.goalReturnFocus;
    const returnFocus = popoverEl?.returnFocus || popoverReturnFocus;
    if (popoverEl) { popoverEl.backdrop?.remove(); popoverEl.remove(); }
    popoverEl = null;
    dateSheet = null; reminderSheet = null; tagSheet = null; projectGoalSheet = null; repeatSheet = null;
    popoverReturnFocus = null;
    restoreGoalFocus(target);
    if (!target && returnFocus) requestAnimationFrame(() => {
      const activeModal = $('#modal-root .modal');
      const focusRoot = returnFocus?.modalScoped ? (activeModal || document) : document;
      const opener = returnFocus?.element;
      const openerIsActive = opener?.isConnected && (!returnFocus?.modalScoped || !activeModal || activeModal.contains(opener));
      const candidate = openerIsActive ? opener : returnFocus?.selector && focusRoot?.querySelector(returnFocus.selector);
      const visible = candidate && (candidate.offsetParent !== null || candidate.getClientRects?.().length);
      const fallback = [...(focusRoot?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])]
        .find(element => element.offsetParent !== null || element.getClientRects?.().length);
      (visible ? candidate : fallback)?.focus();
    });
  }

  function trapPopoverFocus(event) {
    if (!popoverEl) return;
    const focusable = [...popoverEl.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent !== null || el === document.activeElement);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (!popoverEl.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  }


  function inlineNewProject(button) {
    const targetType = button.dataset.targetType;
    const taskId = button.dataset.taskId || '';
    if (!popoverEl) return;
    const color = nextProjectColor();
    setPopoverContent(`<div class="popover-title">${tr('New project')}</div><div class="popover-inline-form"><input id="inline-project-name" class="input" type="text" maxlength="100" placeholder="${tr('Project name')}" /><div class="color-grid">${PROJECT_COLORS.map(c => `<button class="color-swatch ${c === color ? 'is-selected' : ''}" type="button" data-pop-action="inline-select-color" data-color="${c}" aria-label="${tr('Select color')}" style="--swatch:${c}"></button>`).join('')}</div><div id="inline-project-error" class="validation" hidden>${tr('Project needs a name.')}</div><div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-ghost" type="button" data-pop-action="inline-project-cancel">${tr('Cancel')}</button><button class="btn btn-primary" type="button" data-pop-action="inline-project-create" data-target-type="${targetType}" ${taskId ? `data-task-id="${esc(taskId)}"` : ''} data-color="${color}">${tr('Create')}</button></div></div>`);
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
    const task=getTask(modalState.taskId);
    const option=(scope,label,note)=>`<button class="popover-option sheet-option" type="button" data-action="recurrence-scope" data-scope="${scope}"><span class="sheet-option-label">${label}<small>${note}</small></span><i class="ph ph-caret-right" aria-hidden="true"></i></button>`;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${tr('Apply the change')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Cancel')}"><i class="ph ph-x"></i></button></div>${task?.title?`<p class="sheet-subtitle">${esc(task.title)}</p>`:''}<div class="sheet-card">${option('occurrence',tr('This occurrence'),tr('The next repeats stay as they were.'))}${option('future',tr('This and future'),tr('The change applies from this repeat on.'))}</div></div>`,'small-modal');
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
    const snapshot=snapshotTasks(state.tasks.filter(item=>item.id===task.id || taskRecurrence(task)?.seriesId && taskRecurrence(item)?.seriesId===taskRecurrence(task).seriesId));
    if(scope==='occurrence') {
      if(!task.recurrenceBaseline){task.recurrenceBaseline=copyTemplate(task);delete task.recurrenceBaseline.recurrenceBaseline;}
      const scoped=copyTemplate(changes);
      if(Object.hasOwn(scoped,'recurrence'))scoped.recurrence=Core.normalizeRecurrenceV3(scoped.recurrence?{...(task.recurrence || taskRecurrence(task)),...scoped.recurrence}:null);
      Object.assign(task,scoped,{updatedAt:nowIso()});
    } else {
      const original=copyTemplate(task),oldSeries=taskRecurrence(task)?.seriesId;
      const effective=task.plannedDate || task.dueDate || Core.dateOnly();
      // R11c (S14): "Ovo i buduća" moves the rule's day along from its old day (the baseline's when there is one).
      const anchor=task.plannedDate?'plannedDate':'dueDate',ruleDay=(task.recurrenceBaseline || task)[anchor];
      if(changes[anchor] && ruleDay) {
        const shifted=Core.recurrenceDayShift(changes.recurrence?{...taskRecurrence(task),...changes.recurrence}:taskRecurrence(task),ruleDay,changes[anchor]);
        if(Object.keys(shifted).length)changes.recurrence={...(changes.recurrence || {}),...shifted};
      }
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
    setUndo(scope==='occurrence'?msg('Saved · only this one'):msg('Saved · this and future ones'),()=>{
      restoreTasks(snapshot);
      const restored=getTask(pending.taskId);
      if(modalState?.type==='task' && restored){modalState.titleDraft=restored.title;modalState.notesDraft=restored.notes || '';}
      saveState();render();renderModal();
    });
    pending.after?.();
  }
  function requestTaskEdit(taskId,changes,after=null) {
    const task = getTask(taskId);
    if (!task || modalState?.type==='recurrence-scope') return false;
    changes={...taskDraftChanges(task),...changes};
    changes=Object.fromEntries(Object.entries(changes).filter(([key,value])=>JSON.stringify(key==='recurrence' && value?Core.normalizeRecurrenceV3({...task.recurrence,...value}):value)!==JSON.stringify(task[key])));
    if(!Object.keys(changes).length){after?.();return false;}
    // R11c (S14): only a change of a date, the reminder or the repeat asks "Samo ovo / Ovo i buduća".
    if(taskRecurrence(task) && Object.keys(changes).some(key=>['plannedDate','plannedTime','dueDate','dueTime','reminderAt','recurrence'].includes(key))) {
      const focusSelector=document.activeElement?.id?`#${document.activeElement.id}`:'#detail-title';
      closePopover();modalState={type:'recurrence-scope',taskId,changes:copyTemplate(changes),previous:modalState,after,focusSelector};renderModal();return true;
    }
    Object.assign(task,copyTemplate(changes),{updatedAt:nowIso()});
    // Other fields save at once; an occurrence changed with "Samo ovo" passes them on to the next one too.
    if(task.recurrenceBaseline)for(const [key,value] of Object.entries(changes))if(!['todayOrder','projectOrder','inboxOrder','reminderFiredAt'].includes(key))task.recurrenceBaseline[key]=copyTemplate(value);
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
    const pending=recurrencePendingSiblings(task,rule);
    const skipTarget=pending.find(s=>!s.recurrenceSuccessorId) || task;
    // R11c (S14): tapping "Preskoči sledeći put" again cancels the scheduled skip.
    const update=action==='skip-recurrence'?{skipNext:!taskRecurrence(skipTarget)?.skipNext}:{status:action==='pause-recurrence'?'paused':action==='resume-recurrence'?'active':'ended'};
    for(const item of action==='skip-recurrence'?[skipTarget]:[task,...pending.filter(s=>s.id!==taskId)]){
      if(item.recurrence)Object.assign(item.recurrence,update);
      if(item.recurrenceBaseline?.recurrence)Object.assign(item.recurrenceBaseline.recurrence,update);
      item.updatedAt=nowIso();
    }
    if(action==='resume-recurrence' && task.isCompleted)generateRecurringSuccessor(task,nowIso());
    task.updatedAt=nowIso();closePopover();saveState();render();renderModal();
  }
  function recurrencePendingSiblings(task,rule) {
    const effective=task.plannedDate || task.dueDate || Core.dateOnly();
    return state.tasks.filter(sibling=>!sibling.isCompleted && taskRecurrence(sibling)?.seriesId===rule.seriesId && (sibling.id===task.id || (sibling.plannedDate || sibling.dueDate)>=effective && (sibling.plannedDate || sibling.dueDate)>=Core.dateOnly())).sort((a,b)=>(a.plannedDate || a.dueDate || '').localeCompare(b.plannedDate || b.dueDate || '') || a.id.localeCompare(b.id));
  }
  // The series' earliest pending occurrence without a successor carries the skip (V1.3).
  function recurrenceSkipTarget(task) {
    const rule=taskRecurrence(task);
    return rule ? recurrencePendingSiblings(task,rule).find(s=>!s.recurrenceSuccessorId) || task : null;
  }
  // Copies of the tasks an action may change, and of the ids that existed, for Undo.
  function snapshotTasks(items) {
    return { copies: items.map(item => copyTemplate(item)), ids: new Set(state.tasks.map(item => item.id)) };
  }
  function restoreTasks(snapshot) {
    const copies = new Map(snapshot.copies.map(item => [item.id, item]));
    const added = state.tasks.filter(item => !snapshot.ids.has(item.id)).map(item => item.id);
    state.tasks = state.tasks.filter(item => snapshot.ids.has(item.id)).map(item => (copies.has(item.id) ? copyTemplate(copies.get(item.id)) : item));
    added.forEach(removeCloneGoalLinks);
  }
  // R11c (S14): the repeat controls say what they did and offer "Poništi" for the whole series.
  function controlRecurrence(taskId,action) {
    const task=getTask(taskId),rule=taskRecurrence(task);if(!rule)return;
    const snapshot=snapshotTasks(state.tasks.filter(item=>item.id===taskId || taskRecurrence(item)?.seriesId===rule.seriesId));
    manageRecurrence(taskId,action);
    const skipping=Boolean(taskRecurrence(recurrenceSkipTarget(getTask(taskId)))?.skipNext);
    const message=action==='skip-recurrence'?(skipping?msg('The next repeat will be skipped'):msg('Skip cancelled')):action==='pause-recurrence'?msg('Repeat paused'):action==='resume-recurrence'?msg('Repeat resumed'):msg('Repeat ended');
    setUndo(message,()=>{restoreTasks(snapshot);saveState();render();renderModal();});
  }

  function setProject(targetType, taskId, projectId) {
    if (targetType === 'quick') {
      modalState.draft.projectId = projectId || null;
      modalState.draft.placePicked = true;
      if (projectId) modalState.draft.areaId = null;
      if (projectId) modalState.draft.isInbox = false;
      closePopover();
      renderModal();
      return;
    }
    const task = getTask(taskId);
    if (!task) return;
    // Redesign R6 (I6): moving a task out of Inbox into a project can be undone.
    const previous = { projectId: task.projectId ?? null, areaId: task.areaId ?? null, isInbox: task.isInbox };
    closePopover();
    const asked = requestTaskEdit(taskId,{projectId:projectId || null,areaId:null,...(projectId?{isInbox:false}:{})});
    if (!asked && previous.isInbox && projectId) setUndo(msg('Task moved to project'), () => { const current = getTask(taskId); if (!current) return; Object.assign(current, previous, { updatedAt: nowIso() }); saveState(); render(); renderModal(); });
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

  function createTask(keepOpen = false, openWindow = false) {
    if (!modalState || modalState.type !== 'quick') return;
    syncQuickDraftFromDom();
    const d = modalState.draft;
    const parsed = parseQuickAddTitle(d.title, !d.explicitPlan);
    const title = String(parsed.title || '').trim();
    const resolvedPlan = d.explicitPlan ? d.plannedDate : (parsed.plannedDate || d.plannedDate);
    if (!title) {
      modalState.error = tr('Task needs a title.');
      renderModal(); requestAnimationFrame(() => $('#quick-title')?.focus()); return;
    }
    // Picker values win over parsed ones; a project wins over an Area; a picked place wins over +project (R4).
    const { projectId, isInbox } = quickPlace(d, parsed);
    const task = {
      id: uid('task'), title, notes: d.notes || '', projectId, areaId: projectId ? null : (d.areaId || parsed.areaId || null), goalIds: [...(d.goalIds || [])], plannedTime: d.explicitPlannedTime ? d.plannedTime : (d.plannedTime || parsed.plannedTime || null), dueTime: d.dueTime || null, durationMinutes: d.durationMinutes || parsed.durationMinutes || null,
      plannedDate: resolvedPlan || null, dueDate: d.dueDate || parsed.dueDate || null,
      reminderAt: d.reminderAt || null, reminderFiredAt: null, recurrence: d.recurrence || null, tagIds: [...new Set([...(d.tagIds || []), ...parsed.tagIds])], priority: parsed.priority || d.priority || 'none', attachmentIds: [], isInbox,
      isImportant: false, isUrgent: false, isCompleted: false, completedAt: null,
      subtasks: d.subtasks.map((s, i) => ({ ...s, order: i })),
      todayOrder: resolvedPlan === Core.dateOnly() ? nextOrder('today') : null,
      projectOrder: projectId ? nextOrder(`project:${projectId}`) : null,
      inboxOrder: isInbox ? nextOrder('inbox', true) : null,
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    if(task.recurrence)task.recurrence={...Core.normalizeRecurrenceV3(task.recurrence),seriesId:task.id};
    state.tasks.push(task);
    if(modalState.templateInstance)syncTemplateEntityGoalLinks('task',task);
    saveState();
    if (keepOpen) {
      const defaults = modalState.defaults;
      modalState = { type: 'quick', templateContext: modalState.templateContext, defaults, draft: { title: '', notes: '', projectId: defaults.projectId, areaId: defaults.areaId, plannedDate: defaults.plannedDate, parsedPlanDate: null, explicitPlan: Boolean(defaults.explicitPlan), dueDate: null, plannedTime: null, dueTime: null, explicitPlannedTime: false, reminderAt: null, reminderFiredAt: null, recurrence: null, tagIds: [], priority: 'none', subtasks: [] }, error: '' };
      render(); renderModal(); requestAnimationFrame(() => $('#quick-title')?.focus());
    } else {
      closeModal(); render();
      if (openWindow) openTaskDetail(task.id);
    }
  }

  function syncQuickDraftFromDom() {
    if (modalState?.type !== 'quick') return;
    const title = $('#quick-title'); if (title) modalState.draft.title = title.value;
  }

  function parseQuickAddTitle(rawTitle, parsePlan = true) {
    return Core.parseQuickAdd(rawTitle, { today: Core.dateOnly(), tags: state.tags || [], projects: state.projects || [], areas: state.areas || [], parsePlan });
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
      setUndo(msg('Task restored'), () => {
        const current = getTask(taskId); if (!current || current.isCompleted) return;
        Object.assign(current, { isCompleted: true, completedAt: previous.completedAt, updatedAt: nowIso() });
        saveState(); render();
      });
      return;
    }
    const completedAt = nowIso();
    task.isCompleted = true; task.completedAt = completedAt; task.updatedAt = completedAt;
    const generatedId=taskRecurrence(task)?generateRecurringSuccessor(task,completedAt):null;
    saveState();
    // R11c (S14): the message says when the next occurrence comes.
    const next = generatedId ? getTask(generatedId) : null;
    const nextDate = next?.plannedDate || next?.dueDate;
    setUndo(nextDate ? tr('Task completed · next {date}', { date: REPEAT_DATE_FMT.format(parseLocalDate(nextDate)) }) : msg('Task completed'), () => {
      const current = getTask(taskId); if (!current) return;
      Object.assign(current,copyTemplate(previous),{updatedAt:nowIso()});
      if (generatedId) {state.tasks = state.tasks.filter(item => item.id !== generatedId);removeCloneGoalLinks(generatedId);}
      saveState(); render(); if (modalState?.type === 'goal-details') renderModal();
    });
    render(); if (['task', 'goal-details'].includes(modalState?.type)) renderModal(); evaluateGoalProgressChanges(goalProgressBefore);
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
      setUndo(msg('Task duplicated'), async () => { state.tasks = state.tasks.filter(t=>t.id!==copy.id);removeCloneGoalLinks(copy.id); if(createdIds.length) await Attachments.deleteMany(createdIds); saveState(); render(); });
    } catch (error) {
      if (createdIds.length) await Attachments.deleteMany(createdIds);
      setToastMessage(tr('Task could not be duplicated'));
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
    if (!located) { setToastMessage(tr('Delete unavailable. Reopen the current item and try again.')); return; }
    if (type === 'clear-completed' && !state.tasks.some(task => task.isCompleted)) { setToastMessage(tr('No completed tasks to clear')); return; }
    // Whole messages per type: Serbian cannot splice a lowercase type name into a sentence.
    const deletedMessages = { task: msg('Task deleted'), subtask: msg('Subtask deleted'), project: msg('Project deleted'), tag: msg('Tag deleted'), area: msg('Area deleted'), goal: msg('Goal deleted'), habit: msg('Habit deleted'), note: msg('Note deleted'), resource: msg('Resource deleted'), milestone: msg('Milestone deleted'), attachment: msg('Attachment deleted'), template: msg('Template deleted'), 'saved-view': msg('Saved view deleted'), 'clear-completed': msg('Completed tasks deleted') };
    const confirmLabels = { task: msg('Delete task'), subtask: msg('Delete subtask'), project: msg('Delete project'), tag: msg('Delete tag'), area: msg('Delete area'), goal: msg('Delete goal'), habit: msg('Delete habit'), note: msg('Delete note'), resource: msg('Delete resource'), milestone: msg('Delete milestone'), attachment: msg('Delete attachment'), template: msg('Delete template'), 'saved-view': msg('Delete saved view'), 'clear-completed': msg('Delete completed') };
    const deletedMessage = deletedMessages[type] || msg('Item deleted');
    const projectTaskCount = state.tasks.filter(task => task.projectId === identity).length;
    const completedTaskCount = state.tasks.filter(task => task.isCompleted).length;
    const messages = {
      task: msg('This task, its subtasks and attachment references will be removed.'),
      subtask: msg('This subtask will be removed from its task.'),
      project: trn(projectTaskCount, 'This project contains {count} task. All tasks in this project, their subtasks and attachments will also be deleted.', 'This project contains {count} tasks. All tasks in this project, their subtasks and attachments will also be deleted.'),
      tag: msg('Tasks will remain. Their assignments to this tag will be removed.'),
      area: msg('Linked objects will remain. Their Area assignments will be removed.'),
      goal: msg('Projects, tasks and habits will remain. Their Goal links, milestones and Goal history will be removed.'),
      habit: msg('Its check-ins, history and reminders will be removed. Goals will remain.'),
      note: msg('This Note will be removed. Its files are retained through the Undo window. Undo restores the Note and files.'),
      resource: msg('This Resource and its relations will be removed. Its files are retained through the Undo window. Undo restores them.'),
      milestone: msg('This milestone will be removed from its Goal.'),
      attachment: msg('This attachment will be removed from its owner.'),
      template: msg('Items created from this template will remain.'),
      'saved-view': msg('Matching items will remain.'),
      'clear-completed': trn(completedTaskCount, '{count} completed task and its attachments will be removed. Undo restores them.', '{count} completed tasks and their attachments will be removed. Undo restores them.')
    };
    let dialog;
    openConfirm({ title: type === 'clear-completed' ? msg('Delete all completed tasks?') : type === 'attachment' ? msg('Delete this attachment?') : tr('Delete “{name}”?', { name: located.entity.name || located.entity.title }),
      message: messages[type], confirmLabel: confirmLabels[type] || msg('Delete'),
      onConfirm: () => {
        if (dialog.busy) return;
        dialog.busy = true;
        const operation = (async () => {
          try {
            const current = locateDeleteEntity(type, identity);
            if (undoHold || source !== state || modalState !== dialog || !current || current.entity !== located.entity || current.parent !== located.parent)
              throw new Error(msg('The item or its owner changed. Reopen the current item.'));
            const snapshot = await buildDeleteSnapshot(type, identity);
            if (modalState !== dialog) throw new Error(msg('Delete cancelled.'));
            await applyDeleteSnapshot(snapshot);
            closeModal(); render();
            const fallback = { project: 'today', area: 'areas', goal: 'goals', habit: 'habits', note: 'notes', resource: 'resources', 'saved-view': 'saved-views' }[type];
            if (fallback && currentRoute().id === (typeof identity === 'object' ? identity.id : identity)) navigate(fallback);
            setUndo(deletedMessage, () => restoreDeleteSnapshot(snapshot), () => finalizeDeleteSnapshot(snapshot), snapshot);
          } catch (error) {
            if (modalState === dialog) closeModal();
            render(); setToastMessage(tr('Delete failed. {error}', { error: trMessage(error.message) }));
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
    if (!located) throw new Error(msg('The item no longer exists.'));
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
    if (new Set(attachmentIds).size !== attachmentIds.length) throw new Error(msg('An attachment ID is reused.'));
    snapshot.fileOwners = attachmentIds.map(id => {
      const owners = TodoStorage.attachmentOwners(state).filter(owner => (owner.item.attachmentIds || []).includes(id));
      if (owners.length !== 1) throw new Error(msg('Attachment owner changed.'));
      return { id, ...owners[0] };
    });
    snapshot.attachments = await Attachments.getMany(attachmentIds);
    for (const id of attachmentIds) {
      const record = snapshot.attachments.find(record => record.id === id), owners = TodoStorage.attachmentOwners(state).filter(owner => (owner.item.attachmentIds || []).includes(id));
      if (!record || owners.length !== 1 || !TodoStorage.attachmentBelongsTo(record, owners[0]) || record.pendingDeleteUntil) throw new Error(msg('Attachment owner or stored file changed.'));
    }
    if (type === 'habit') snapshot.habitLogs = await TodoStorage.habitLogs.listByHabit(identity);
    if (type === 'goal') snapshot.goalHistory = await TodoStorage.goalHistory.listByGoal(identity);
    validateDeleteSnapshot(snapshot);
    return snapshot;
  }

  function validateDeleteSnapshot(snapshot, compareBefore = true) {
    if (undoHold || snapshot.source !== state || snapshot.generation !== undoGeneration) throw new Error(msg('The data source changed. Reopen the item.'));
    if (compareBefore && ['project','clear-completed'].includes(snapshot.type)) {
      const current = state.tasks.filter(task => snapshot.type === 'project' ? task.projectId === snapshot.identity : task.isCompleted);
      const captured = snapshot.entries.filter(entry => entry.collection === 'tasks' && !entry.field);
      if (current.length !== captured.length || current.some(task => !captured.some(entry => entry.source === task))) throw new Error(msg('The task deletion scope changed. Reopen confirmation.'));
    }
    for (const entry of snapshot.entries) if (!deleteEntryArray(entry)?.includes(entry.source)
      || (compareBefore && JSON.stringify(entry.source) !== JSON.stringify(entry.entity))) throw new Error(msg('The item or parent changed.'));
    for (const effect of snapshot.effects) if (!state[effect.collection].includes(effect.owner)
      || (effect.link && !(effect.owner.projectLinks || []).includes(effect.link))) throw new Error(msg('A linked owner changed.'));
    if (compareBefore) for (const effect of snapshot.effects)
      if (JSON.stringify((effect.link || effect.owner)[effect.field] || (effect.scalar ? null : [])) !== JSON.stringify(effect.before)) throw new Error(msg('A linked assignment changed.'));
    if (compareBefore) for (const [collection, field] of Object.entries({ tasks: 'relatedTaskIds', projects: 'relatedProjectIds', goals: 'relatedGoalIds', habits: 'relatedHabitIds' })) {
      const removed = new Set(snapshot.entries.filter(entry => entry.collection === collection && !entry.field).map(entry => entry.entity.id));
      if (!removed.size) continue;
      for (const resource of state.resources) if ((resource[field] || []).some(id => removed.has(id))
        && !snapshot.effects.some(effect => effect.owner === resource && effect.field === field))
        throw new Error(msg('Resource relations changed. Reopen confirmation.'));
    }
    if (snapshot.attachmentOwner && !state[snapshot.attachmentOwnerCollection].includes(snapshot.attachmentOwner)) throw new Error(msg('Attachment owner changed.'));
    for (const captured of snapshot.fileOwners) {
      const owners = TodoStorage.attachmentOwners(state).filter(owner => (owner.item.attachmentIds || []).includes(captured.id));
      const record = snapshot.attachments.find(item => item.id === captured.id);
      if (owners.length !== 1 || owners[0].item !== captured.item || owners[0].type !== captured.type
        || owners[0].item.attachmentIds.filter(id => id === captured.id).length !== 1
        || !TodoStorage.attachmentBelongsTo(record, owners[0]) || !(record.blob instanceof Blob) || record.size !== record.blob.size)
        throw new Error(msg('Attachment owner or stored file changed.'));
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
      if (!array) throw new Error(msg('The parent changed.'));
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
      if (snapshot.pendingAttachments.length !== snapshot.attachments.length) throw new Error(msg('Prepared files are missing.'));
      for (const original of snapshot.attachments) {
        const actual = snapshot.pendingAttachments.find(record => record.id === original.id);
        const normalized = { ...actual, pendingDeleteUntil: original.pendingDeleteUntil, updatedAt: original.updatedAt };
        if (Object.hasOwn(original, 'pendingDeleteToken')) normalized.pendingDeleteToken = original.pendingDeleteToken; else delete normalized.pendingDeleteToken;
        if (actual.pendingDeleteToken !== snapshot.token || actual.pendingDeleteUntil !== new Date(snapshot.deadline).toISOString()
          || !(await sameStoredAttachment(normalized, original))) throw new Error(msg('Prepared file ownership or bytes changed.'));
      }
      validateDeleteSnapshot(snapshot);
      rollback = mutateDeleteMetadata(snapshot, false);
      if (!saveState()) throw new Error(msg('Local metadata could not be saved.'));
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
        snapshot.recoveryError = tr('{error} Recovery failed: {rollbackError}', { error: trMessage(error.message), rollbackError: trMessage(rollbackError.message) });
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
          renderToast(); setToastMessage(tr('Undo recovery verified. Original item, files and history restored.'));
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
            || !(await sameStoredAttachment(normalized, original))) throw new Error(msg('Retained file ownership changed; recovery was not applied.'));
          expected.push(actual);
        }
        for (const name of ['habitLogs','goalHistory']) for (const original of snapshot[name]) {
          const actual = await TodoStorage[name].get(original.id);
          if (actual && JSON.stringify(actual) !== JSON.stringify(original)) throw new Error(msg('Retained history ownership changed; recovery was not applied.'));
        }
        validateDeleteSnapshot(snapshot, false);
        await TodoStorage.restoreDeleteRecords(snapshot, expected, () => validateDeleteSnapshot(snapshot, false));
        for (const original of snapshot.attachments) if (!(await sameStoredAttachment(await Attachments.get(original.id), original))) throw new Error(msg('Restored file verification failed; snapshot retained.'));
        for (const name of ['habitLogs','goalHistory']) for (const original of snapshot[name])
          if (JSON.stringify(await TodoStorage[name].get(original.id)) !== JSON.stringify(original)) throw new Error(msg('Restored history verification failed; snapshot retained.'));
        failedDeleteSnapshots.delete(snapshot);
        if (snapshot.type === 'habit') await refreshHabitMetrics();
        renderToast(); render(); setToastMessage(tr('Delete recovery verified. Original files and history restored.'));
      } catch (error) { setToastMessage(tr('Recovery failed. {error}', { error: trMessage(error.message) })); }
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
    if (snapshot.source !== state || snapshot.generation !== undoGeneration) throw new Error(msg('The data source changed.'));
    for (const entry of snapshot.entries) {
      const array = deleteEntryArray(entry);
      if (!array || array.some(item => item.id === entry.entity.id)) throw new Error(msg('The item ID or parent is now in use.'));
      if (entry.collection === 'tasks' && !entry.field && entry.entity.projectId
        && !snapshot.entries.some(parent => parent.collection === 'projects' && parent.entity.id === entry.entity.projectId)
        && !state.projects.includes(entry.projectParent)) throw new Error(msg('The Task Project parent changed.'));
      if (['notes', 'resources'].includes(entry.collection)) {
        const exists = (collection, id) => state[collection].some(item => item.id === id)
          || snapshot.entries.some(other => other.collection === collection && !other.field && other.entity.id === id);
        if (entry.entity.areaId && !exists('areas', entry.entity.areaId)) throw new Error(msg('The Area no longer exists. Restore it before retrying Undo.'));
        if (entry.collection === 'resources') for (const [field, collection] of Object.entries({ relatedTaskIds: 'tasks', relatedProjectIds: 'projects', relatedGoalIds: 'goals', relatedHabitIds: 'habits' }))
          if (entry.entity[field].some(id => !exists(collection, id))) throw new Error(msg('A related item no longer exists. Restore it before retrying Undo.'));
      }
    }
    if (snapshot.attachmentOwner && !state[snapshot.attachmentOwnerCollection].includes(snapshot.attachmentOwner)) throw new Error(msg('Attachment owner changed.'));
    if (snapshot.attachmentOwner && snapshot.attachmentOwner.attachmentIds?.includes(snapshot.identity)) throw new Error(msg('The attachment ID is now in use.'));
    const referenced = new Set(TodoStorage.attachmentOwners(state).flatMap(owner => owner.item.attachmentIds || []));
    if (snapshot.attachments.some(record => referenced.has(record.id))) throw new Error(msg('The attachment ID is now in use by an owner.'));
    for (const effect of snapshot.effects) if (!state[effect.collection].includes(effect.owner)
      || (effect.link && !effect.owner.projectLinks?.includes(effect.link))) throw new Error(msg('A linked owner changed.'));
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
      if (!matches) throw new Error(msg('Retained file ownership changed; owner or bytes no longer match.'));
      expected.push(actual);
    }
    for (const name of ['habitLogs','goalHistory']) {
      history[name] = [];
      for (const original of snapshot[name]) {
        const actual = await TodoStorage[name].get(original.id); validate();
        if (actual && (snapshot.recoveryKind !== 'undo' || JSON.stringify(actual) !== JSON.stringify(original))) throw new Error(msg('Retained history ownership changed.'));
        history[name].push([original.id, actual || null]);
      }
    }
    validate();
    try {
      await TodoStorage.restoreDeleteRecords(snapshot, expected, validate, history);
      snapshot.undoNativePhase = 'originals-restored';
      validate();
      const rollback = mutateDeleteMetadata(snapshot, true);
      if (!saveState()) { rollback(); throw new Error(msg('Local metadata could not be saved.')); }
    } catch (error) {
      if (snapshot.undoNativePhase === 'originals-restored') {
        try { await reapplyDeleteRecords(snapshot); }
        catch (compensationError) {
          snapshot.recoveryKind = 'undo';
          snapshot.recoveryError = tr('Undo failed: {error} Compensation failed: {compensationError}', { error: trMessage(error.message), compensationError: trMessage(compensationError.message) });
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
      // A finalizer that already passed ownership checks may finish while a
      // global safety hold waits for it. New finalizers never start during a
      // hold; rejecting this in-flight one would strand recovery unnecessarily.
      if (snapshot.source !== state || snapshot.generation !== undoGeneration
        || TodoStorage.attachmentOwners(state).some(owner => (owner.item.attachmentIds || []).includes(record.id)))
        throw new Error(msg('File ownership changed. Retained files were kept.'));
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
      if (undoHold) throw new Error(msg('Normal Undo is already held.'));
      if (failedDeleteSnapshots.size || [...undoWork].some(work => work.snapshot && work.failedUndoError)) throw new Error(msg('Retry Undo or delete recovery before starting a global operation.'));
      const token = { generation: undoGeneration, visible: undoState, source: state };
      undoHold = token; undoState = null;
      for (const work of undoWork) clearTimeout(work.timer);
      renderToast();
      try {
        await Promise.all([...deleteOperations, ...[...undoWork].map(work => work.busy).filter(Boolean)]);
        if (failedDeleteSnapshots.size || [...undoWork].some(work => work.snapshot && work.failedUndoError)) throw new Error(msg('Retry Undo or delete recovery before starting a global operation.'));
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
          renderToast(); setToastMessage(tr('Safety preparation failed. Normal Undo and retained files were kept.'));
        }
        throw error;
      }
    },
    // Resume is ONLY for explicitly verified rollback/cancel, never automatic hydration.
    async resume(token) {
      if (undoHold !== token || token.generation !== undoGeneration) throw new Error(msg('Invalid Undo hold token.'));
      if (undoDomain() !== token.domain) throw new Error(msg('The restored metadata does not match the held domain.'));
      for (const expected of token.attachments) if (expected && !(await sameStoredAttachment(await Attachments.get(expected.id), expected)))
        throw new Error(msg('The restored files do not match held ownership and bytes.'));
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
      if (undoHold !== token || token.generation !== undoGeneration) throw new Error(msg('Invalid Undo hold token.'));
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
    snapshot.recoveryError ||= `${msg('Undo failed')}: ${error}`;
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
    catch (_) { setToastMessage(tr('File cleanup failed. Retained files will be retried.')); work.timer = setTimeout(() => expireUndo(work), 30000); }
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
    const status = $('#global-status');
    if (status) status.textContent = toastMessage || globalRecoveryNotice?.message || '';
    const undo = undoState ? `<div class="toast"><i class="ph-fill ph-check-circle toast-icon"></i><span class="toast-message">${esc(tr(undoState.message))}</span><button class="toast-action" type="button" data-action="undo">${tr('Undo')}</button></div>` : '';
    const info = toastMessage ? `<div class="toast"><i class="ph ph-info toast-icon" style="color:var(--info)"></i><span class="toast-message">${esc(toastMessage)}</span></div>` : '';
    const failed = [...failedDeleteSnapshots][0];
    const recoveryNotice = failed && !undoHold ? `<div class="toast" role="alert"><i class="ph ph-warning toast-icon"></i><span class="toast-message">${esc(trMessage(failed.recoveryError))} · ${tr('Snapshot retained')}</span><button class="toast-action" type="button" data-action="retry-delete-recovery">${tr('Retry recovery')}</button></div>` : '';
    const globalNotice = globalRecoveryNotice ? `<div class="toast" role="alert"><span class="toast-message">${esc(globalRecoveryNotice.message)}</span><button class="toast-action" data-action="retry-global-recovery">${tr('Retry')}</button></div>` : '';
    const staleNotice = staleDataNotice ? `<div class="toast" role="alert"><i class="ph ph-arrows-clockwise toast-icon"></i><span class="toast-message">${tr('This workspace changed in another tab. Refresh to load the latest data.')}</span><button class="toast-action" type="button" data-action="refresh-stale-data">${tr('Refresh')}</button></div>` : '';
    const updateNotice = waitingServiceWorker ? `<div class="toast" role="status"><i class="ph ph-arrow-circle-up toast-icon"></i><span class="toast-message">${tr('A new version of Dailo is available.')}</span><button class="toast-action" type="button" data-action="apply-app-update">${tr('Refresh')}</button></div>` : '';
    root.innerHTML = undo + info + recoveryNotice + globalNotice + staleNotice + updateNotice;
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
        setToastMessage(tr('Undo failed. Snapshot retained; use Retry recovery.'));
      } else setToastMessage(tr('Undo failed. Your recovery snapshot is retained; retry Undo.'));
    }
    finally { work.busy = null; if (undoWork.has(work)) armUndo(work); }
  }

  function addAllSuggestions() {
    const sections = Core.deriveTodaySections(listTasks(), Core.dateOnly());
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
    setUndo(msg('Task moved to Today'), () => { const t = getTask(taskId); if (!t) return; Object.assign(t, prev, { updatedAt: nowIso() }); saveState(); render(); });
  }

  function moveTaskToTomorrow(taskId) {
    const task = getTask(taskId); if (!task) return;
    if(taskRecurrence(task)){requestTaskEdit(taskId,{plannedDate:Core.addDays(Core.dateOnly(),1),isInbox:false,todayOrder:null});return;}
    const prev = { plannedDate: task.plannedDate, isInbox: task.isInbox, todayOrder: task.todayOrder };
    task.plannedDate = Core.addDays(Core.dateOnly(), 1); task.isInbox = false; task.todayOrder = null; task.updatedAt = nowIso();
    saveState(); render();
    setUndo(msg('Task moved to Tomorrow'), () => { const current = getTask(taskId); if (!current) return; Object.assign(current, prev, { updatedAt: nowIso() }); saveState(); render(); });
  }

  function moveTaskToAnytime(taskId) {
    const task = getTask(taskId); if (!task) return;
    if(taskRecurrence(task)){requestTaskEdit(taskId,{plannedDate:null,isInbox:false,todayOrder:null});return;}
    const prev = { plannedDate: task.plannedDate, isInbox: task.isInbox, todayOrder: task.todayOrder };
    task.plannedDate = null; task.isInbox = false; task.todayOrder = null; task.updatedAt = nowIso();
    saveState(); render();
    setUndo(msg('Task moved to Anytime'), () => { const current = getTask(taskId); if (!current) return; Object.assign(current, prev, { updatedAt: nowIso() }); saveState(); render(); });
  }

  function nextProjectOrder() {
    const orders = state.projects.map(p => p.order).filter(Number.isFinite);
    return orders.length ? Math.max(...orders) + 1 : 0;
  }

  function saveTagModal() {
    if (modalState?.type !== 'tag') return;
    const name = Core.normalizeTagName(modalState.draft.name);
    const valid = Core.validateTagName(state.tags || [], name, modalState.tagId || null);
    if (!valid.ok) { modalState.error = valid.reason === 'duplicate-tag' ? tr('A tag with this name already exists.') : tr('Tag needs a name.'); renderModal(); requestAnimationFrame(() => $('#tag-name')?.focus()); return; }
    if (modalState.tagId) {
      const tag = getTag(modalState.tagId); if (!tag) return;
      tag.name = name; tag.color = modalState.draft.color; tag.updatedAt = nowIso();
    } else {
      const tag = { id: uid('tag'), name, color: modalState.draft.color, createdAt: nowIso(), updatedAt: nowIso() };
      state.tags.push(tag);
    }
    const created = !modalState.tagId;
    saveState(); closeModal(); render();
    if (created) setToastMessage(tr('Tag “{name}” created', { name })); // R10c: a new tag stays on the current screen
  }

  function deleteTag(tagId) {
    requestDeleteEntity('tag', tagId);
  }

  function saveProjectModal() {
    const nameInput = $('#project-name');
    if (nameInput) modalState.draft.name = nameInput.value;
    const name = String(modalState.draft.name || '').trim();
    if (!name) { modalState.error = tr('Project needs a name.'); renderModal(); requestAnimationFrame(() => $('#project-name')?.focus()); return; }
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
    if (!name) { modalState.error = modalState.kind === 'goal' ? tr('Goal needs a name.') : tr('Habit needs a name.'); renderModal(); return; }
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
    modalState = { type: 'goal-history', goalId, events: null, error: '', returnFocus: goalFocusTarget(trigger), returnTo: modalState?.type === 'goal-details' ? modalState : null };
    renderModal();
    TodoStorage.goalHistory.listByGoal(goalId).then(events => {
      if (modalState?.type !== 'goal-history' || modalState.goalId !== goalId) return;
      modalState.events = events;
      renderModal();
    }).catch(error => {
      if (modalState?.type !== 'goal-history' || modalState.goalId !== goalId) return;
      modalState.error = trMessage(error?.message || msg('Goal history could not be loaded.'));
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
    setUndo(status === 'completed' ? msg('Goal completed') : status === 'paused' ? msg('Goal paused') : msg('Goal restored'), () => {
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
    state.habitMetrics = Object.fromEntries((state.habits || []).map(habit => [habit.id, Core.deriveHabitMetrics(habit, byHabit[habit.id] || [], Core.dateOnly(), Core.habitWeekRule(state.settings))]));
    if (globalThis.DailoPlatform?.isNative) scheduleNotificationPlan();
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

  async function setHabitLog(habitId, date, requestedStatus = 'done', requestedValue = null, options = {}) {
    const habit = getHabit(habitId); const today = Core.dateOnly();
    const existing = (state.habitLogCache?.[habitId] || []).find(log => log.date === date);
    // Historical corrections remain valid after a pause/archive. Only today's
    // live check-in is controlled by the current lifecycle state.
    const allowHistoricalBackfill = Boolean(options.allowHistoricalBackfill && date < today);
    if (!habit || !date || date > today || (date === today && habit.status !== 'active') || !(Core.habitScheduledOn(habit, date, { historical: true }) || existing || allowHistoricalBackfill)) return false;
    const before = captureGoalProgress();
    let status = requestedStatus; let value = requestedValue;
    if (habit.trackingType === 'numeric') { const numeric = Core.numericHabitState(habit, requestedValue); status = numeric.status; value = numeric.value; }
    const record = { id: `${habitId}:${date}`, habitId, date, status: ['done', 'skipped', 'missed'].includes(status) ? status : 'done', value: value ?? null, createdAt: existing?.createdAt || nowIso(), updatedAt: nowIso() };
    const previousUpdatedAt = habit.updatedAt;
    habit.updatedAt = nowIso();
    // Establish canonical ownership before touching the growing IndexedDB
    // store. A stale tab must not leave a check-in behind when metadata save
    // is rejected.
    if (!saveState()) { habit.updatedAt = previousUpdatedAt; return null; }
    const ownsCanonical = () => localStorage.getItem(STORAGE_KEY) === canonicalRaw;
    if (!ownsCanonical()) {
      habit.updatedAt = previousUpdatedAt;
      reportStorageFailure(new Error(msg('Canonical data changed in another tab; refresh before checking in.')));
      return null;
    }
    try {
      const putHabitLog = TodoStorage.habitLogs.putIfCurrent || TodoStorage.habitLogs.put;
      await putHabitLog.call(TodoStorage.habitLogs, record, existing || null);
      if (!ownsCanonical()) throw new Error(msg('Canonical data changed in another tab during Habit check-in.'));
      await refreshHabitMetrics();
    } catch (error) {
      let rollbackError = null;
      try {
        // Roll back with the same native compare-and-set used for the forward
        // write. A competing tab can write between any separate read and
        // mutation, so never overwrite or delete a record we do not own.
        if (existing && TodoStorage.habitLogs.putIfCurrent) await TodoStorage.habitLogs.putIfCurrent(existing, record);
        else if (!existing && TodoStorage.habitLogs.deleteIfCurrent) await TodoStorage.habitLogs.deleteIfCurrent(record.id, record);
        else {
          const current = await TodoStorage.habitLogs.get(record.id);
          const stillOurRecord = current && ['id', 'habitId', 'date', 'status', 'value', 'createdAt', 'updatedAt']
            .every(field => Object.is(current[field] ?? null, record[field] ?? null));
          if (stillOurRecord) {
            if (existing) await TodoStorage.habitLogs.put(existing);
            else await TodoStorage.habitLogs.deleteMany([record.id]);
          }
        }
      } catch (failure) { rollbackError = failure; }
      habit.updatedAt = previousUpdatedAt;
      if (ownsCanonical() && !saveState() && !rollbackError) rollbackError = new Error(msg('Habit metadata rollback was rejected.'));
      try { await refreshHabitMetrics(); } catch (failure) { rollbackError ||= failure; }
      reportStorageFailure(rollbackError ? new AggregateError([error, rollbackError], msg('Habit check-in failed and rollback needs attention.')) : error);
      return null;
    }
    evaluateGoalProgressChanges(before); await evaluateHabitBoundaries(); render(); if (modalState?.type === 'habit-details') renderModal(); return true;
  }

  async function evaluateHabitBoundaries() {
    if (!state || globalOperation || modalState?.type === 'habit-finished') return;
    const today = Core.dateOnly(); const weekStartsOn = Core.habitWeekRule(state.settings);
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
    setUndo(status === 'paused' ? msg('Habit paused') : status === 'archived' ? msg('Habit archived') : msg('Habit restored'), () => { const current = getHabit(habitId); if (!current) return; Object.assign(current, snapshot); current.updatedAt = nowIso(); saveState(); return refreshHabitMetrics().then(render); });
  }

  async function deleteHabit(habitId) {
    requestDeleteEntity('habit', habitId);
  }

  function snoozeHabit(habitId, kind) {
    const habit = getHabit(habitId); if (!habit) return;
    const next = Core.snoozeTarget(kind, new Date()); if (!next) return;
    habit.snoozedUntil = next; habit.pendingSnoozeAt = next; habit.updatedAt = nowIso(); saveState(); setToastMessage(tr('Habit snoozed until {time}', { time: formatReminder(habit.snoozedUntil) }));
  }

  function deleteMilestone(goalId, milestoneId) {
    requestDeleteEntity('milestone', { parentId: goalId, id: milestoneId });
  }

  function deleteDraftGoalMilestone(id) {
    if (modalState?.type !== 'goal') return;
    readGoalDraft(); const editor = modalState; const index = editor.draft.milestones.findIndex(m => m.id === id); if (index < 0) return;
    const milestone = copyTemplate(editor.draft.milestones[index]); const target = goalFocusTarget();
    const back = () => { modalState = editor; renderModal(); restoreGoalFocus(target); };
    openConfirm({ title: msg('Delete milestone?'), message: msg('This removes the milestone from this Goal draft.'), onCancel: back, onConfirm: () => {
      editor.draft.milestones.splice(index, 1); back(); setUndo(msg('Milestone deleted'), () => {
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
    setUndo(msg('Project archived'), () => { const current = getProject(projectId); if (!current) return; Object.assign(current, previous, { updatedAt: nowIso() }); saveState(); render(); });
  }

  function restoreProject(projectId) {
    const project = getProject(projectId); if (!project) return;
    const previous = { isArchived: project.isArchived, archivedAt: project.archivedAt };
    project.isArchived = false; project.archivedAt = null; project.updatedAt = nowIso();
    saveState(); closePopover(); render();
    setUndo(msg('Project restored'), () => { const current = getProject(projectId); if (!current) return; Object.assign(current, previous, { updatedAt: nowIso() }); saveState(); render(); });
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
    const row = document.querySelector(`[data-parent-task-id="${cssEscape(taskId)}"][data-subtask-id="${cssEscape(subtaskId)}"]`);
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
    if(taskRecurrence(task)){requestTaskEdit(taskId,{subtasks:[...task.subtasks,{id:uid('sub'),title,isCompleted:false,order:orders.length?Math.max(...orders)+1:0}]});requestAnimationFrame(() => $('#detail-subtask')?.focus());return;}
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

  // Optional sync (V2.0-a). The session, shadow and cursor stay on this device under their own key, never in state or backups.
  const SYNC_META_KEY = 'dailoSync';
  const SYNC_DEFERRED = 'sync-deferred';

  function loadSyncMeta() {
    try {
      const value = JSON.parse(localStorage.getItem(SYNC_META_KEY) || 'null');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }

  function saveSyncMeta() {
    try { localStorage.setItem(SYNC_META_KEY, JSON.stringify(syncMeta || {})); } catch (error) { console.error(error); }
  }

  function syncView() {
    const meta = syncMeta || loadSyncMeta();
    return { configured: Boolean(syncClient), signedIn: Boolean(meta.session?.accessToken), ...syncUi, email: meta.session?.user?.email || syncUi.email,
      running: syncRunning, lastSyncAt: meta.lastSyncAt || null, lastError: meta.lastError || '' };
  }

  function editingText() {
    const active = document.activeElement;
    return Boolean(active?.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), textarea, select, [contenteditable="true"]'));
  }

  // Pulled data is applied only when nothing on screen holds unsaved or reversible work.
  function syncWaiting() {
    return Boolean(modalState || undoState || undoHold || textSaveTimer || dragState || editingText());
  }

  function refreshSyncCard() {
    if (currentRoute().type === 'settings' && !editingText()) render();
  }

  function scheduleSync(delay = 3000) {
    if (!syncClient || applyingSync) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncTimer = null; runSync().catch(console.error); }, delay);
  }

  async function runSync(mode = null) {
    if (!syncClient || syncRunning) return;
    const meta = loadSyncMeta();
    syncMeta = meta;
    if (!meta.session?.accessToken) return;
    if (!state || recovery || globalOperation || startupPromise || storageError || staleDataNotice) return;
    if (syncWaiting()) { scheduleSync(15000); return; }
    syncRunning = true;
    refreshSyncCard();
    let result;
    try {
      result = await Sync.syncOnce({
        client: syncClient, meta, mode,
        readLocal: async () => { const habitLogs = await TodoStorage.habitLogs.listAll(); return { state, habitLogs }; },
        writeLocal: applySyncResult,
      });
      if (result.status === 'error' && result.error === SYNC_DEFERRED) { meta.lastError = null; scheduleSync(15000); }
      else if (result.status === 'error' && result.code === 401) delete meta.session;
    } finally {
      syncRunning = false;
      // A sign-out during the round replaced the record; never bring the old one back.
      if (syncMeta === meta) saveSyncMeta();
    }
    if (result.status === 'choose' && syncMeta === meta) {
      // Only the first-run examples are here: the account's data replaces them without the question (audit M9),
      // after the same recovery copy the question takes. If that copy fails, the question is asked as before.
      if (untouchedSample() && await TodoStorage.createAutomaticSnapshot(state, new Date(), { force: true }).then(() => true, () => false)) {
        setToastMessage(tr('Loading your account data in place of the examples.'));
        return runSync('server');
      }
      openSyncChoice();
    }
    refreshSyncCard();
  }

  async function applySyncResult(result) {
    if (syncWaiting() || globalOperation || recovery) throw new Error(SYNC_DEFERRED);
    const previous = state;
    applyingSync = true;
    try {
      // Records new to this device do not replay their past reminders here (audit R-3).
      state = normalizeState(Core.settleArrivedReminders(previous, Core.pruneDanglingReferences(result.state), nowIso()));
      if (!saveState()) { state = previous; throw new Error(msg('Changes could not be saved locally. Try again.')); }
    } finally { applyingSync = false; }
    if (result.habitLogDeletes.length) await TodoStorage.habitLogs.deleteMany(result.habitLogDeletes);
    for (const log of result.habitLogPuts) await TodoStorage.habitLogs.put(log);
    await refreshHabitMetrics();
    render();
  }

  // A reset or a restored backup is a new starting point: the next sync asks again (or takes the account data
  // on an empty device) instead of pushing deletions for everything that is gone.
  function forgetSyncShadow() {
    const meta = loadSyncMeta();
    if (!meta.shadow) return;
    delete meta.shadow;
    delete meta.cursor;
    syncMeta = meta;
    saveSyncMeta();
  }

  async function requestSyncCode() {
    if (!syncClient || syncUi.busy) return;
    const email = String($('#sync-email')?.value ?? syncUi.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { syncUi = { ...syncUi, email, error: msg('Enter a valid e-mail address.') }; render(); return; }
    syncUi = { ...syncUi, email, busy: true, error: '' };
    render();
    try {
      await syncClient.requestCode(email);
      syncUi = { step: 'code', email, busy: false, error: '' };
    } catch (error) {
      syncUi = { ...syncUi, busy: false, error: error.status === 429 ? msg('Too many requests. Wait a minute and try again.') : error.message };
    }
    render();
    if (syncUi.step === 'code') requestAnimationFrame(() => $('#sync-code')?.focus());
  }

  async function verifySyncCode() {
    if (!syncClient || syncUi.busy) return;
    const code = String($('#sync-code')?.value || '').replace(/\s+/g, '');
    if (!/^\d{6,10}$/.test(code)) { syncUi = { ...syncUi, error: msg('Enter the code from the e-mail.') }; render(); return; }
    syncUi = { ...syncUi, busy: true, error: '' };
    render();
    let session;
    try { session = await syncClient.verifyCode(syncUi.email, code); }
    catch (error) {
      syncUi = { ...syncUi, busy: false, error: error.status >= 400 && error.status < 500 ? msg('The code is wrong or has expired.') : error.message };
      render();
      return;
    }
    // The shadow describes one account; another account on this device starts again with the first-sync choice.
    const previous = loadSyncMeta();
    syncMeta = previous.userId === session.user.id ? { ...previous, session, lastError: null } : { userId: session.user.id, session };
    saveSyncMeta();
    syncUi = { step: 'email', email: '', busy: false, error: '' };
    render();
    await runSync();
  }

  async function signOutSync() {
    const meta = loadSyncMeta();
    clearTimeout(syncTimer);
    syncMeta = {};
    try { localStorage.removeItem(SYNC_META_KEY); } catch (error) { console.error(error); }
    syncUi = { step: 'email', email: '', busy: false, error: '' };
    render();
    if (meta.session && syncClient) await syncClient.signOut(meta.session);
  }

  function deleteSyncAccount() {
    const word = 'OBRIŠI';
    const plain = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
    openConfirm({ title: msg('Delete your sync account?'), message: msg('This deletes your account and all synced data on the server. Data on this device stays.'),
      phrase: word, confirmLabel: msg('Delete account'),
      onConfirm: async () => {
        if (plain($('#global-confirm-phrase')?.value) !== plain(word)) { setToastMessage(tr('Type {word} exactly to continue.', { word })); return; }
        modalState = null; renderModal();
        try { await syncClient.deleteAccount(await syncClient.ensureSession(loadSyncMeta().session)); }
        catch (error) { setToastMessage(tr('The account could not be deleted: {error}', { error: trMessage(error.message) })); return; }
        clearTimeout(syncTimer);
        syncMeta = {};
        try { localStorage.removeItem(SYNC_META_KEY); } catch (error) { console.error(error); }
        render();
        setToastMessage(tr('The account and its synced data were deleted. Data on this device stays.'));
      } });
  }

  // First sync on a device when both the device and the account have data.
  function openSyncChoice() {
    if (modalState) return; // The next sync asks again.
    captureModalReturnFocus(); closePopover();
    modalState = { type: 'sync-choice', onCancel: async () => { modalState = null; renderModal(); await signOutSync(); } };
    renderModal();
  }

  function renderSyncChoice() {
    const option = (mode, title, copy) => `<button class="sync-choice-option" type="button" data-action="sync-choose" data-mode="${mode}"><strong>${title}</strong><span>${copy}</span></button>`;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${tr('Data on this device and in your account')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close dialog')}"><i class="ph ph-x"></i></button></div>
      <p class="dialog-copy">${tr('This device and your account both have data. Choose what to keep. A local recovery copy is made first.')}</p>
      ${option('merge', tr('Merge'), tr('Keep everything. When an item was changed in both places, the newer change wins.'))}
      ${option('server', tr('Keep the account data'), tr('This device gets the data from your account. Items that exist only on this device are removed.'))}
      ${option('device', tr('Keep this device’s data'), tr('Your account gets the data from this device. Items that exist only in the account are removed.'))}
      <div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Cancel and sign out')}</button></div></div></div>`);
  }

  async function chooseSyncMode(mode) {
    if (!['merge', 'server', 'device'].includes(mode) || modalState?.type !== 'sync-choice') return;
    modalState = null; renderModal();
    try { await TodoStorage.createAutomaticSnapshot(state, new Date(), { force: true }); }
    catch (error) { setToastMessage(tr('Sync did not start because the recovery copy failed: {error}', { error: trMessage(error.message) })); return; }
    await runSync(mode);
  }

  function startSync() {
    if (!syncClient) return;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(500); });
    window.addEventListener('online', () => scheduleSync(500));
    setInterval(() => scheduleSync(0), 5 * 60 * 1000);
    scheduleSync(1000);
  }

  // Moving data into the app (audit M9). The first-run examples are fingerprinted (device-local, outside state,
  // sync and backups); while the device still holds only them, the app offers to import a backup from the web
  // version or to sign in, and a first sync takes the account's data instead of asking how to combine.
  function rememberSample() {
    if (!state || typeof Sync?.recordFingerprint !== 'function') return;
    try { localStorage.setItem('dailoSample', JSON.stringify(Sync.recordFingerprint(state))); } catch (_) { /* the question is then asked as before */ }
  }
  function untouchedSample() {
    if (!state || typeof Sync?.untouchedSample !== 'function') return false;
    let fingerprint = null;
    try { fingerprint = JSON.parse(localStorage.getItem('dailoSample') || 'null'); } catch (_) { return false; }
    return Sync.untouchedSample(state, Object.values(state.habitLogCache || {}).flat(), fingerprint);
  }
  function transferNotice() {
    if (!globalThis.DailoPlatform?.isNative) return '';
    try { if (localStorage.getItem('dailoTransferDismissed')) return ''; } catch (_) { return ''; }
    if (!untouchedSample()) return '';
    const signIn = syncClient && !loadSyncMeta().session?.accessToken ? `<button class="btn btn-secondary" type="button" data-route="settings">${tr('Sign in')}</button>` : '';
    return `<section class="backup-reminder" data-transfer-notice role="status" aria-label="${tr('Data from the web version')}"><i class="ph ph-arrows-left-right backup-reminder-icon" aria-hidden="true"></i><div class="backup-reminder-copy"><strong>${tr('Do you have data in the web version?')}</strong><span>${tr('Export a backup there (Settings → Data) and import it here, or sign in if you use sync. Your data then replaces these examples.')}</span></div><div class="backup-reminder-actions"><button class="btn btn-primary" type="button" data-action="import-backup">${tr('Import backup')}</button><input id="backup-import-input" type="file" accept=".zip,application/zip" hidden />${signIn}<button class="btn btn-ghost" type="button" data-action="dismiss-transfer-notice">${tr('Not needed')}</button></div></section>`;
  }
  function dismissTransferNotice() {
    try { localStorage.setItem('dailoTransferDismissed', nowIso()); } catch (_) { /* shown again next time */ }
  }

  // Weekly review prompt (V1.11): on the last three days of the week until the review is recorded.
  function weeklyReviewNotice() {
    if (!Core.weeklyReviewDue(state.settings, Core.dateOnly(), state.settings.weekStartsOn)) return '';
    return `<section class="weekly-review-notice" data-weekly-review-notice role="status" aria-label="${tr('Weekly review')}"><i class="ph ph-clipboard-text weekly-review-notice-icon" aria-hidden="true"></i><div class="backup-reminder-copy"><strong>${tr('Time for the weekly review')}</strong><span>${tr('A few minutes to empty the Inbox, catch up on overdue tasks and look at the week ahead.')}</span></div><button class="btn btn-primary" type="button" data-route="review">${tr('Start review')}</button></section>`;
  }

  function completeWeeklyReview() {
    state.settings.weeklyReviews = Core.recordWeeklyReview(state.settings, { today: Core.dateOnly(), now: nowIso(), weekStartsOn: state.settings.weekStartsOn });
    saveState();
    setToastMessage(msg('Weekly review completed.'));
    render();
  }

  // Today notice when the last ZIP export is older than the reminder interval (V1.9).
  function backupReminderNotice() {
    let snoozedUntil = null;
    try { snoozedUntil = localStorage.getItem('todoAppBackupReminderSnoozedUntil'); } catch (error) { snoozedUntil = null; }
    const lastExport = state.settings.backupStatus?.lastExport || null;
    const due = Core.backupReminderDue({ lastExport, reminderDays: Core.backupReminderDays(state.settings), snoozedUntil, oldestCreatedAt: Core.oldestCreatedAt(state), now: nowIso() });
    if (!due) return '';
    const last = lastExport && !Number.isNaN(Date.parse(lastExport)) ? tr('Last backup: {date}.', { date: new Date(lastExport).toLocaleDateString(I18n.locale()) }) : tr('No backup yet.');
    return `<section class="backup-reminder" data-backup-reminder role="status" aria-label="${tr('Backup reminder')}"><i class="ph ph-shield-check backup-reminder-icon" aria-hidden="true"></i><div class="backup-reminder-copy"><strong>${tr('Back up your data')}</strong><span>${esc(last)} ${tr('Dailo keeps everything only on this device.')}</span></div><div class="backup-reminder-actions"><button class="btn btn-primary" type="button" data-action="export-backup">${tr('Export backup')}</button><button class="btn btn-ghost" type="button" data-action="snooze-backup-reminder">${tr('Remind me tomorrow')}</button></div></section>`;
  }

  function snoozeBackupReminder() {
    try { localStorage.setItem('todoAppBackupReminderSnoozedUntil', new Date(Date.parse(nowIso()) + 86400000).toISOString()); } catch (error) { /* private mode: the notice simply returns */ }
  }

  // Asks the browser to keep Dailo's storage only when request is true (after user activity).
  async function refreshStoragePersistence(request = false) {
    // The native app keeps its data in its own container; the browser persistence question does not apply (audit P-7).
    const appStorage = globalThis.DailoPlatform?.storage.status();
    if (appStorage) return appStorage;
    const storage = typeof navigator === 'undefined' ? null : navigator.storage;
    if (!storage || typeof storage.persisted !== 'function') return { state: 'unsupported' };
    try {
      let granted = await storage.persisted();
      if (!granted && request && typeof storage.persist === 'function') granted = await storage.persist();
      const estimate = typeof storage.estimate === 'function' ? await storage.estimate().catch(() => null) : null;
      return { state: granted ? 'granted' : 'denied', usage: estimate?.usage ?? null, quota: estimate?.quota ?? null };
    } catch (error) {
      return { state: 'unknown' };
    }
  }

  // Offline shell (V1.9). Service workers need HTTPS or localhost.
  function registerServiceWorker() {
    // The native app ships its files inside the binary: no service worker there, and a stale one is removed (audit P-1).
    if (globalThis.DailoPlatform && !globalThis.DailoPlatform.allowsServiceWorker) {
      navigator.serviceWorker?.getRegistrations?.().then(list => list.forEach(registration => registration.unregister())).catch(() => {});
      return;
    }
    const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!secure || typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    // Without a controller this is the first install, which activates on its own: nothing to offer.
    const offer = worker => { if (worker && navigator.serviceWorker.controller) { waitingServiceWorker = worker; renderToast(); } };
    navigator.serviceWorker.register('sw.js').then(registration => {
      offer(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offer(worker); });
      });
    }).catch(error => console.error(error));
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (appUpdateRequested) { appUpdateRequested = false; location.reload(); } });
  }

  // Runs only from the "Refresh" button, so the page never reloads while the user is editing.
  function applyAppUpdate() {
    if (!waitingServiceWorker) return;
    appUpdateRequested = true;
    flushTextSave();
    waitingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
  }

  function updateStoragePersistence(request = false) {
    return refreshStoragePersistence(request).then(status => {
      storagePersistence = status;
      if (currentRoute().type === 'settings' && !modalState) render();
      return status;
    });
  }

  async function exportBackupAction() {
    const source = captureStatusSource();
    const snapshotAvailable = await hasRetainedRecoverySnapshot(source?.source?.settings?.backupStatus?.snapshotAvailable === true);
    if (!Backup || !Attachments) { updateBackupStatus({ snapshotAvailable, validationResult: msg('Export failed: backup is unavailable') }, source); setToastMessage(tr('Backup is unavailable in this browser')); return; }
    setToastMessage(tr('Preparing backup...'));
    try {
      const blob = await Backup.exportBackupV3(state, TodoStorage, nowIso());
      // In the app the share sheet can be cancelled; only a delivered file counts as an export (audit P-2).
      if (await downloadBackup(blob) === 'cancelled') {
        updateBackupStatus({ snapshotAvailable: await hasRetainedRecoverySnapshot(snapshotAvailable), validationResult: msg('Export cancelled') }, source);
        setToastMessage(tr('Backup was not saved')); return;
      }
      updateBackupStatus({ lastExport: nowIso(), snapshotAvailable: await hasRetainedRecoverySnapshot(snapshotAvailable), validationResult: msg('Export verified') }, source);
      setToastMessage(tr('Backup exported'));
    } catch (error) { console.error(error); updateBackupStatus({ snapshotAvailable: await hasRetainedRecoverySnapshot(snapshotAvailable), validationResult: `${msg('Export failed')}: ${error.message}` }, source); setToastMessage(tr('Backup could not be created')); }
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

  async function openLocalSnapshots() {
    captureModalReturnFocus(); closePopover();
    const dialog = { type: 'local-snapshots', loading: true, snapshots: [], error: null };
    modalState = dialog; renderModal();
    try { dialog.snapshots = (await TodoStorage.recoverySnapshots.listAll()).filter(item => item.reason === 'automatic' || item.selective)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
    catch (error) { dialog.error = tr('Snapshots could not be loaded: {error}', { error: trMessage(error.message) }); }
    dialog.loading = false;
    if (modalState === dialog) { renderModal(); requestAnimationFrame(() => $('#modal-root button')?.focus()); }
  }

  function renderLocalSnapshotsModal() {
    const dialog = modalState;
    const collections = { tasks: msg('Tasks'), projects: msg('Projects'), areas: msg('Areas'), tags: msg('Tags'), goals: msg('Goals'), habits: msg('Habits'), notes: msg('Notes'), resources: msg('Resources'), templates: msg('Templates'), savedViews: msg('Saved Views') };
    let body = dialog.loading ? `<p role="status">${tr('Loading local snapshots…')}</p>` : dialog.error ? `<p role="alert">${esc(tr(dialog.error))}</p><button class="btn btn-secondary" data-action="open-local-snapshots">${tr('Retry')}</button>` : !dialog.snapshots.length ? `<p>${tr('No automatic snapshots yet. A snapshot is created after a successful save, at most once every five minutes.')}</p>` : dialog.snapshots.map(snapshot => `<details class="snapshot-group"><summary>${esc(new Date(snapshot.createdAt).toLocaleString(I18n.locale()))}${snapshot.selective ? ` · ${tr('Before selective restore')}` : ''}</summary>${Object.entries(collections).map(([collection, label]) => {
      const items = snapshot.appData?.[collection] || [];
      return items.length ? `<details><summary>${tr(label)} · ${items.length}</summary>${items.map(item => `<div class="snapshot-entity"><span>${esc(item.title || item.name)}</span><button class="btn btn-secondary" type="button" data-action="restore-snapshot-entity" data-snapshot-id="${esc(snapshot.id)}" data-collection="${collection}" data-entity-id="${esc(item.id)}">${tr('Restore')}</button></div>`).join('')}</details>` : '';
    }).join('')}</details>`).join('');
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${tr('Local snapshots')}</h2><button class="btn-icon" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><p class="area-empty-copy">${tr('Five recent automatic copies are kept on this device. Restore one item and its files and history. Linked items must still exist. A safety ZIP and typing RESTORE protect the replacement.')}</p>${body}</div>`, 'quick');
  }

  // Returns 'downloaded' on the web; in the app the file goes through the share sheet: 'shared' or 'cancelled'.
  function downloadBackup(blob) {
    const fileName = `todo-backup-${Core.dateOnly()}.zip`;
    const platform = globalThis.DailoPlatform;
    if (platform?.isNative) return platform.files.saveFile(blob, fileName, tr('Dailo backup'));
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = fileName;
    try { document.body.appendChild(anchor); anchor.click(); }
    finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    return 'downloaded';
  }

  function compactState(value) {
    const copy = { ...value }; delete copy.habitLogCache; delete copy.habitMetrics;
    return JSON.stringify(copy);
  }

  function captureStatusSource() {
    return state ? { source: state, stateText: compactState(state), raw: canonicalRaw } : null;
  }

  async function hasRetainedRecoverySnapshot(fallback = false) {
    try { return (await TodoStorage.recoverySnapshots.listAll()).some(snapshot => ['reset', 'restore'].includes(snapshot.reason)); }
    catch (_) { return fallback; }
  }

  function updateBackupStatus(patch, op = null) {
    const expectedRaw = op?.raw ?? canonicalRaw;
    if (!state || localStorage.getItem(STORAGE_KEY) !== expectedRaw
      || (op && (state !== op.source || compactState(state) !== op.stateText))) return false;
    state.settings ||= {};
    state.settings.backupStatus = { lastExport: null, lastImport: null, snapshotAvailable: false, validationResult: msg('Not yet validated'), ...(state.settings.backupStatus || {}), ...patch };
    try {
      const persisted = Core.normalizeState(state);
      delete persisted.habitLogCache; delete persisted.habitMetrics;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      canonicalRaw = localStorage.getItem(STORAGE_KEY);
      if (op && state === op.source) { op.raw = canonicalRaw; op.stateText = compactState(state); }
      return true;
    } catch (error) { console.error(error); return false; }
  }

  function assertGlobalSource(op) {
    if (globalOperation !== op || state !== op.source || compactState(state) !== op.stateText || localStorage.getItem(STORAGE_KEY) !== op.raw)
      throw new Error(msg('Source changed. Cancel and retry with a fresh safety backup.'));
  }

  function globalNotice(message, retry) {
    globalRecoveryNotice = { message: trMessage(message), retry }; renderToast();
  }

  async function cleanupGlobalSnapshot(op) {
    if (op.snapshotId) await TodoStorage.recoverySnapshots.deleteMany([op.snapshotId]);
  }

  async function markGlobalSnapshot(op, phase, details = {}) {
    const snapshot = await TodoStorage.recoverySnapshots.get(op.snapshotId);
    if (!snapshot) throw new Error(msg('Recovery copy is missing.'));
    await TodoStorage.recoverySnapshots.put({ ...snapshot, ...details, phase });
  }

  async function syncGlobalSnapshotStatus(op) {
    const snapshot = await TodoStorage.recoverySnapshots.get(op.snapshotId);
    if (!snapshot) throw new Error(msg('Recovery copy is missing.'));
    await TodoStorage.recoverySnapshots.put({ ...snapshot, appData: structuredClone(state), rawAppData: localStorage.getItem(STORAGE_KEY) });
  }

  async function abandonGlobalOperation(op, message = msg('Operation canceled. Existing data was kept.'), statusPatch = null) {
    if (op.busy) return;
    op.busy = true;
    const returnFocus = modalReturnFocus;
    modalState = null; renderModal();
    let cleanupError = null;
    try { if (op.token) await deleteLifecycle.resume(op.token); }
    catch (error) {
      op.busy = false;
      globalNotice(tr('{message} Normal Undo could not resume: {error}. Retry recovery after resolving the changed source.', { message: tr(message), error: trMessage(error.message) }), () => abandonGlobalOperation(op, message));
      return;
    }
    try { await cleanupGlobalSnapshot(op); } catch (error) { cleanupError = error; }
    globalOperation = null;
    if (returnFocus?.isConnected) returnFocus.focus();
    if (cleanupError) {
      const retained = `${msg('Recovery copy retained')}: ${cleanupError.message}`;
      updateBackupStatus({ snapshotAvailable: true, validationResult: retained }, op);
      globalNotice(tr('{message} Temporary backup cleanup failed: {error}. Retry cleanup.', { message: tr(message), error: trMessage(cleanupError.message) }), async () => {
        try {
          await cleanupGlobalSnapshot(op);
          updateBackupStatus({ snapshotAvailable: false, validationResult: msg('Backup validation canceled; recovery copy removed') }, op);
          globalRecoveryNotice = null; renderToast();
        } catch (error) {
          updateBackupStatus({ snapshotAvailable: true, validationResult: `${msg('Recovery copy retained')}: ${error.message}` }, op);
          throw error;
        }
      });
    } else {
      updateBackupStatus(statusPatch || { snapshotAvailable: false, validationResult: msg('Backup validation canceled; recovery copy removed') }, op);
      setToastMessage(message);
    }
  }

  async function undoSelectiveRestore(op) {
    if (!op.undoOperation) {
      if (globalOperation || compactState(state) !== op.committedText || localStorage.getItem(STORAGE_KEY) !== op.committedRaw) {
        op.keepRecovery = true;
        throw new Error(msg('Data changed after restore. Use Local snapshots to restore the desired entity; the safety copy is retained.'));
      }
      op.undoOperation = { reason: 'restore', busy: true };
    }
    globalOperation = op.undoOperation;
    op.keepRecovery = true;
    try {
      await markGlobalSnapshot(op, 'mutating');
      const restored = await TodoStorage.restoreRecoverySnapshot(op.snapshotId);
      await markGlobalSnapshot(op, 'rolled-back');
      state = normalizeState(restored); canonicalRaw = localStorage.getItem(STORAGE_KEY); recovery = null; globalOperation = null;
      globalRecoveryNotice = null; render();
    } catch (error) {
      await markGlobalSnapshot(op, 'rollback-failed', { rollbackError: error.message }).catch(() => {});
      globalNotice(tr('Undo recovery needs attention: {error}. Safety copy retained.', { error: trMessage(error.message) }), () => undoSelectiveRestore(op));
      throw error;
    }
    try { await cleanupGlobalSnapshot(op); }
    catch (error) { globalNotice(tr('Undo is verified. Safety-copy cleanup failed: {error}. Retry cleanup.', { error: trMessage(error.message) }), async () => { await cleanupGlobalSnapshot(op); globalRecoveryNotice = null; renderToast(); }); }
    refreshHabitMetrics().then(render).catch(error => setToastMessage(error.message));
  }

  async function beginGlobalOperation(reason, file = null, selection = null) {
    if (globalOperation) return;
    await (startupPromise || Promise.resolve());
    if (!state || recovery) { globalNotice(tr('Safety backup cannot represent this unreadable saved data. Nothing was changed. Use Retry after repairing or recovering the original local data.'), () => startReady()); return; }
    flushTextSave();
    const op = { reason, source: state, busy: false, selective: selection };
    globalOperation = op;
    try {
      op.token = await deleteLifecycle.hold();
      op.raw = canonicalRaw; op.stateText = compactState(state);
      assertGlobalSource(op);
      op.payload = await TodoStorage.captureUserData(); assertGlobalSource(op);
      const frozenStorage = { attachments: { getMany: async ids => op.payload.attachments.filter(record => ids.includes(record.id)) },
        habitLogs: { listAll: async () => op.payload.habitLogs }, goalHistory: { listAll: async () => op.payload.goalHistory } };
      const blob = await Backup.exportBackupV3(JSON.parse(op.stateText), frozenStorage, nowIso());
      assertGlobalSource(op);
      if (!(await TodoStorage.sameUserData(await TodoStorage.captureUserData(), op.payload))) throw new Error(msg('Stored data changed during export. Retry.'));
      assertGlobalSource(op);
      if (await downloadBackup(blob) === 'cancelled') throw new Error(msg('The safety ZIP was not saved.'));
      op.snapshotId = await TodoStorage.createRecoverySnapshot(reason, state, TodoStorage);
      const snapshot = await TodoStorage.recoverySnapshots.get(op.snapshotId);
      assertGlobalSource(op);
      if (snapshot.rawAppData !== op.raw || !(await TodoStorage.sameUserData(snapshot, op.payload))) throw new Error(msg('Source changed during snapshot. Retry.'));
      op.validated = selection ? Backup.prepareSelectiveRestore({ state: JSON.parse(op.stateText), attachmentRecords: op.payload.attachments, habitLogs: op.payload.habitLogs, goalHistory: op.payload.goalHistory }, selection.snapshot, selection.collection, selection.id)
        : reason === 'restore' ? structuredClone(await Backup.inspectBackupV3(file))
        : { state: createEmptyState(), attachmentRecords: [], habitLogs: [], goalHistory: [] };
      op.validated.state = JSON.parse(compactState(normalizeState(op.validated.state)));
      assertGlobalSource(op);
      updateBackupStatus({ snapshotAvailable: true, validationResult: reason === 'restore' ? msg('Backup validated and recovery copy ready') : msg('Recovery copy ready') }, op);
      await syncGlobalSnapshotStatus(op);
      assertGlobalSource(op);
      if (selection) await markGlobalSnapshot(op, 'prepared', { selective: true });
      const selectedItem = selection && op.validated.state[selection.collection].find(item => item.id === selection.id);
      const summary = selection ? tr('Restore “{name}” and its owned files/history. Other records stay current. Undo is available until further data changes.', { name: selectedItem.title || selectedItem.name })
        : reason === 'restore' ? tr('{tasks} tasks, {projects} projects, {goals} Goals, {habits} Habits, {notes} Notes, {resources} Resources, {files} files, {logs} logs and {events} history events will be restored.', { tasks: op.validated.state.tasks.length, projects: op.validated.state.projects.length, goals: op.validated.state.goals.length, habits: op.validated.state.habits.length, notes: op.validated.state.notes.length, resources: op.validated.state.resources.length, files: op.validated.attachmentRecords.length, logs: op.validated.habitLogs.length, events: op.validated.goalHistory.length }) : '';
      openConfirm({ title: reason === 'reset' ? msg('Reset all app data?') : selection ? msg('Restore selected entity?') : msg('Restore backup?'), message: [tr('A safety ZIP was downloaded and an internal recovery copy was created.'), summary].filter(Boolean).join(' '),
        phrase: reason.toUpperCase(), confirmLabel: reason === 'reset' ? msg('Reset app') : msg('Restore backup'),
        onConfirm: () => commitGlobalOperation(op), onCancel: () => abandonGlobalOperation(op) });
    } catch (error) { await abandonGlobalOperation(op, tr('Safety preparation failed: {error}. Nothing was replaced. Retry the operation.', { error: trMessage(error.message) }), { snapshotAvailable: false, validationResult: `${msg('Recovery preparation failed')}: ${error.message}` }); }
  }

  async function verifyGlobalReplacement(op) {
    const next = op.validated;
    if (localStorage.getItem(STORAGE_KEY) !== JSON.stringify(next.state)
      || !Core.validateStateV3(next.state).ok
      || !(await TodoStorage.sameUserData(await TodoStorage.captureUserData(), { attachments: next.attachmentRecords, habitLogs: next.habitLogs, goalHistory: next.goalHistory }))
      || localStorage.getItem(STORAGE_KEY) !== JSON.stringify(next.state) || globalOperation !== op
      || state !== op.source || compactState(state) !== op.stateText)
      throw new Error(msg('Replacement verification failed.'));
  }

  async function rollbackGlobalOperation(op, cause) {
    if (op.recovering) return;
    op.recovering = true;
    let statusSource = captureStatusSource();
    try {
      const source = state, sourceText = compactState(state);
      const restored = await TodoStorage.restoreRecoverySnapshot(op.snapshotId);
      // Keep both editing and ordinary Undo held until the verified rollback has
      // a durable safe classification. A denied phase write must stay retryable.
      await markGlobalSnapshot(op, 'rolled-back');
      const verified = await TodoStorage.verifyRecoverySnapshot(op.snapshotId);
      if (globalOperation !== op || state !== source || compactState(state) !== sourceText) throw new Error(msg('Recovery source changed during verification. Retry recovery.'));
      state = normalizeState(restored); canonicalRaw = localStorage.getItem(STORAGE_KEY); recovery = null;
      const resumedSource = state, resumedText = compactState(state);
      statusSource = captureStatusSource();
      if (op.token) await deleteLifecycle.resume(op.token);
      // Resume also awaits Blob reads and already-due finalizers. Those may
      // legitimately remove expired files, but cannot change metadata ownership.
      if (localStorage.getItem(STORAGE_KEY) !== verified.rawAppData || globalOperation !== op
        || state !== resumedSource || compactState(state) !== resumedText)
        throw new Error(msg('Recovery ownership changed during final Undo resume. Resolve the source and retry recovery.'));
      globalRecoveryNotice = null;
      globalOperation = null; modalState = null; renderModal(); render();
      updateBackupStatus({ snapshotAvailable: true, validationResult: op.reason === 'restore' ? msg('Import failed; original data restored and verified') : msg('Reset failed; original data restored and verified') }, statusSource);
      try {
        await cleanupGlobalSnapshot(op);
        updateBackupStatus({ snapshotAvailable: false, validationResult: op.reason === 'restore' ? msg('Import failed; original data restored and verified') : msg('Reset failed; original data restored and verified') }, statusSource);
        setToastMessage(tr('{error}. Original data was restored and verified.', { error: trMessage(cause.message) }));
      }
      catch (cleanupError) { globalNotice(tr('{error}. Original data was restored. Cleanup failed: {cleanupError}. Retry cleanup.', { error: trMessage(cause.message), cleanupError: trMessage(cleanupError.message) }), async () => { await cleanupGlobalSnapshot(op); updateBackupStatus({ snapshotAvailable: false, validationResult: op.reason === 'restore' ? msg('Import failed; original data restored and verified') : msg('Reset failed; original data restored and verified') }, statusSource); globalRecoveryNotice = null; renderToast(); }); }
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
      updateBackupStatus({ snapshotAvailable: true, validationResult: op.reason === 'restore' ? msg('Import failed; recovery is required') : msg('Reset failed; recovery is required') }, statusSource);
      globalNotice(tr('Operation failed: {error}. Recovery also failed: {rollbackError}. The recovery snapshot is retained. Retry recovery.', { error: trMessage(cause.message), rollbackError: trMessage(rollbackError.message) }), () => rollbackGlobalOperation(op, cause));
    } finally { op.recovering = false; }
  }

  async function commitGlobalOperation(op) {
    if (globalOperation !== op || op.busy) return;
    if ($('#global-confirm-phrase')?.value !== op.reason.toUpperCase()) { setToastMessage(tr('Type {word} exactly to continue.', { word: op.reason.toUpperCase() })); return; }
    op.busy = true;
    let mutationStarted = false;
    try {
      assertGlobalSource(op);
      if (!(await TodoStorage.sameUserData(await TodoStorage.captureUserData(), op.payload))) throw new Error(msg('Stored data changed during confirmation. Retry.'));
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
      state = normalizeState(op.validated.state); canonicalRaw = localStorage.getItem(STORAGE_KEY); recovery = null; modalState = null;
      if (!op.selective) forgetSyncShadow();
      if (globalThis.DailoPlatform?.isNative) scheduleDurableMirror();
      const committedSource = captureStatusSource();
      globalOperation = phaseError ? op : null; renderModal(); location.hash = '#today'; render();
      try {
        if (phaseError) throw phaseError;
        if (op.selective) {
          op.committedText = compactState(state); op.committedRaw = canonicalRaw;
          setUndo(msg('Selected entity restored'), () => undoSelectiveRestore(op), () => op.keepRecovery ? true : cleanupGlobalSnapshot(op));
        } else {
          await cleanupGlobalSnapshot(op);
          updateBackupStatus({ lastImport: op.reason === 'restore' ? nowIso() : state.settings.backupStatus?.lastImport || null, snapshotAvailable: false, validationResult: op.reason === 'restore' ? msg('Import restored and verified') : msg('Reset verified') }, committedSource);
          setToastMessage(op.reason === 'reset' ? tr('App data reset and verified.') : tr('Backup restored and verified.'));
        }
      }
      catch (error) { updateBackupStatus({ snapshotAvailable: true, validationResult: `${msg('Replacement verified; recovery cleanup failed')}: ${error.message}` }, committedSource); globalNotice(tr('New data is verified. Recovery copy cleanup failed: {error}. Retry cleanup.', { error: trMessage(error.message) }), async () => { await markGlobalSnapshot(op, 'committed'); await cleanupGlobalSnapshot(op); updateBackupStatus({ lastImport: op.reason === 'restore' ? nowIso() : state.settings.backupStatus?.lastImport || null, snapshotAvailable: false, validationResult: op.reason === 'restore' ? msg('Import restored and verified') : msg('Reset verified') }, committedSource); if (globalOperation === op) globalOperation = null; globalRecoveryNotice = null; renderToast(); }); }
      refreshHabitMetrics().then(render).catch(error => setToastMessage(tr('History display could not refresh: {error}. Reload to retry.', { error: trMessage(error.message) })));
    } catch (error) {
      op.busy = false;
      if (mutationStarted) await rollbackGlobalOperation(op, error);
      else await abandonGlobalOperation(op, tr('Operation stopped: {error}. Nothing was replaced.', { error: trMessage(error.message) }));
    }
  }

  // Native reminders (audit R-1, M6): the upcoming reminders are scheduled as phone notifications, so they arrive
  // while Dailo is closed. The plan is rebuilt after saves and habit check-ins, at start and on resume; the platform
  // keeps unchanged notifications and cancels only stale ones. NOTIFIED_KEY (device-local, outside state, sync and
  // backups) records which moments the phone was asked to show, so the in-app checker records those without a
  // second toast. Call sites check isNative inline, like the other platform hooks.
  const NOTIFIED_KEY = 'dailoNotified';
  function readNotified() {
    try { const value = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}'); return value && typeof value === 'object' ? value : {}; } catch (_) { return {}; }
  }
  function phoneShownKeys() {
    if (!globalThis.DailoPlatform?.isNative || notificationPermission !== 'granted') return new Set();
    const now = Date.parse(nowIso());
    return new Set(Object.entries(readNotified()).filter(([, at]) => Date.parse(at) <= now).map(([key]) => key));
  }
  // Moments already past were still scheduled when they arrived; future ones are replaced by the new plan, so a
  // reminder that dropped out of the plan is never treated as shown.
  function rememberNotified(items) {
    const now = Date.parse(nowIso()), cutoff = now - 3 * 86400000;
    const past = Object.entries(readNotified()).filter(([, at]) => { const time = Date.parse(at); return time <= now && time >= cutoff; });
    try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(Object.fromEntries([...past, ...items.map(item => [item.key, item.at])]))); } catch (_) { /* the checker then toasts as well */ }
  }
  function notificationBody(item) {
    const day = Core.localDateOf(item.at);
    if (item.kind === 'task') return item.date ? tr('Due {date}', { date: relativeDateLabel(item.date, day) }) : tr('Task reminder');
    if (item.kind === 'goal') return item.date ? tr('Goal target {date}', { date: relativeDateLabel(item.date, day) }) : tr('Goal reminder');
    return tr('Habit reminder');
  }
  function scheduleNotificationPlan(delay = 2000) {
    if (!globalThis.DailoPlatform?.isNative) return;
    clearTimeout(notificationTimer);
    notificationTimer = setTimeout(() => { reconcileNotifications().catch(console.error); }, delay);
  }
  // ask: false (the pause flush) never shows the system question while the app leaves the screen.
  async function reconcileNotifications({ ask = true } = {}) {
    clearTimeout(notificationTimer); notificationTimer = null;
    const platform = globalThis.DailoPlatform;
    if (!platform?.isNative || !state || globalOperation || recovery) return;
    const items = Core.notificationPlan(state, nowIso(), { logs: state.habitLogCache || {} }).map(item => ({ ...item, body: notificationBody(item) }));
    let result = await platform.notifications.reconcile(items);
    // The system question is asked once, when there is first something to notify about; later from Settings.
    if (ask && result.status === 'permission' && result.permission === 'prompt' && items.length && !localStorage.getItem('dailoNotifyAsked')) {
      try { localStorage.setItem('dailoNotifyAsked', nowIso()); } catch (_) { /* asked again next time */ }
      if (await platform.notifications.requestPermission() === 'granted') result = await platform.notifications.reconcile(items);
    }
    const changed = (result.permission && result.permission !== notificationPermission) || (result.exact !== undefined && result.exact !== exactAlarmState);
    if (result.permission) notificationPermission = result.permission;
    if (result.exact !== undefined) exactAlarmState = result.exact;
    if (result.status === 'ok') rememberNotified(items);
    if (changed && currentRoute().type === 'settings') render();
  }
  let notificationTimer = null, notificationPermission = null, exactAlarmState = null;

  // A tapped notification opens its task, goal or habit. An open dialog keeps its draft: the tap then only
  // brings Dailo to the front.
  function openNotificationTarget(extra) {
    const [kind, ...rest] = String(extra?.route || '').split('/');
    const id = decodeURIComponent(rest.join('/'));
    if (!state || globalOperation || recovery || modalState || !id) return;
    if (kind === 'task') { if (getTask(id)) openTaskDetail(id); return; }
    if ((kind === 'goal' && getGoal(id)) || (kind === 'habit' && getHabit(id))) navigate(`#${kind}/${encodeURIComponent(id)}`);
  }

  async function allowExactAlarms() {
    try { exactAlarmState = await globalThis.DailoPlatform.notifications.allowExactAlarms(); } catch (error) { console.error(error); }
    scheduleNotificationPlan(0);
    render();
  }

  async function enableBrowserNotifications() {
    const platform = globalThis.DailoPlatform;
    if (platform?.isNative) {
      try {
        notificationPermission = await platform.notifications.requestPermission();
        setToastMessage(notificationPermission === 'granted' ? tr('Reminders will arrive as notifications') : tr('Notifications are off for Dailo. Turn them on in the phone settings.'));
      } catch (_) { setToastMessage(tr('Notifications could not be enabled')); }
      scheduleNotificationPlan(0);
      render();
      return;
    }
    if (typeof Notification === 'undefined') { setToastMessage(tr('Browser notifications are unavailable')); return; }
    if (Notification.permission === 'granted') { setToastMessage(tr('Browser notifications are already enabled')); return; }
    if (Notification.permission === 'denied') { setToastMessage(tr('Browser notifications are blocked in browser settings')); return; }
    try {
      const permission = await Notification.requestPermission();
      setToastMessage(permission === 'granted' ? tr('Browser notifications enabled') : tr('Notification permission was not granted'));
      render();
    } catch (_) {
      setToastMessage(tr('Browser notifications could not be enabled'));
    }
  }

  function checkReminders() {
    if (!state || globalOperation) return;
    const now = nowIso();
    const dueTasks = state.tasks.filter(task => Core.isReminderDue(task, now));
    const dueGoals = state.goals.flatMap(goal => Core.goalReminderDueMoments(goal, now).map(moment => ({ goal, moment })));
    const today = Core.dateOnly(new Date(now));
    const dueHabits = state.habits.flatMap(habit => {
      if (!Core.habitReminderActive(habit, state.habitLogCache?.[habit.id] || [], now, Core.habitWeekRule(state.settings))) return [];
      const nowTime = new Date(now).getTime(); const pending = habit.pendingSnoozeAt && new Date(habit.pendingSnoozeAt).getTime();
      // A snooze is a distinct notification, not merely a suppression of the
      // original moment. Lifecycle and weekly-target suppression apply first.
      if (pending && pending <= nowTime) return [{ habit, moment: `snooze:${habit.pendingSnoozeAt}`, snooze: true }];
      if (habit.snoozedUntil && new Date(habit.snoozedUntil).getTime() > nowTime) return [];
      const fired = new Set(habit.reminderFiredMoments || []);
      return (habit.reminders || []).filter(reminder => reminder.enabled && Core.normalizeTime(reminder.time)).map(reminder => ({ habit, moment: Core.combineDateTime(today, reminder.time) })).filter(item => item.moment && !fired.has(item.moment) && new Date(item.moment).getTime() <= new Date(now).getTime());
    });
    if (!dueTasks.length && !dueGoals.length && !dueHabits.length) return;
    // On the phone a reminder the system already showed as a notification is only recorded here (audit M6).
    const shown = phoneShownKeys();
    const unseen = [
      ...dueTasks.filter(task => !shown.has(Core.notificationKey('task', task.id, task.reminderAt))).map(task => task.title),
      ...dueGoals.filter(({ goal, moment }) => !shown.has(Core.notificationKey('goal', goal.id, moment))).map(({ goal }) => goal.title),
      ...dueHabits.filter(({ habit, moment }) => !shown.has(Core.notificationKey('habit', habit.id, moment))).map(({ habit }) => habit.name),
    ];
    // Fired markers are device-local and not an edit: no updatedAt bump, so nothing is pushed (audit R-3).
    for (const task of dueTasks) {
      task.reminderFiredAt = now;
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(task.title, { body: task.dueDate ? tr('Due {date}', { date: relativeDateLabel(task.dueDate) }) : tr('Task reminder') }); } catch (_) { /* in-app reminder remains */ }
      }
    }
    for (const { goal, moment } of dueGoals) {
      goal.reminderFiredMoments = [...new Set([...(goal.reminderFiredMoments || []), moment])];
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(goal.title, { body: goal.targetDate ? tr('Goal target {date}', { date: relativeDateLabel(goal.targetDate) }) : tr('Goal reminder') }); } catch (_) { /* in-app reminder remains */ }
      }
    }
    for (const { habit, moment, snooze } of dueHabits) {
      habit.reminderFiredMoments = [...new Set([...(habit.reminderFiredMoments || []), moment])];
      if (snooze) { habit.pendingSnoozeAt = null; habit.snoozedUntil = null; habit.updatedAt = now; }
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(habit.name, { body: tr('Habit reminder') }); } catch (_) { /* in-app reminder remains */ }
      }
    }
    saveState();
    if (unseen.length === 1) setToastMessage(tr('Reminder: {title}', { title: unseen[0] }));
    else if (unseen.length) setToastMessage(trn(unseen.length, '{count} reminder is due', '{count} reminders are due'));
  }

  // Messages are English catalog keys or already translated text; tr() leaves the latter unchanged.
  function setToastMessage(message) {
    clearTimeout(toastMessageTimer);
    toastMessage = message == null ? message : trMessage(message);
    renderToast();
    // Information has its own lifetime; it must never replace/finalize Undo.
    toastMessageTimer = setTimeout(() => {
      toastMessage = null;
      toastMessageTimer = null;
      renderToast();
    }, 3000);
  }

  // Redesign R5 (Z7, S10): the floating "+" adds a task for the screen it is on; null on an archived project.
  function routeQuickAddContext() {
    const route = currentRoute();
    if (route.type === 'today') return { today: true };
    if (route.type === 'project' && route.id === 'none') return { anytime: true };
    if (route.type === 'project') return getProject(route.id)?.isArchived ? null : { projectId: route.id };
    if (route.type === 'tasks' && state.ui.tasksView !== 'projects') return { anytime: true };
    if (route.type === 'calendar' && state.ui.calendarView !== 'upcoming') return { day: calendarDate() }; // R7 (C8)
    return {};
  }

  function showTaskProjectPicker(taskId, anchor) { openProjectPicker(anchor, { type: 'task', taskId }); }
  function showTaskPlanPicker(taskId, anchor) { openPlanPicker(anchor, { type: 'task', taskId }); }
  function showTaskDuePicker(taskId, anchor) { openDuePicker(anchor, { type: 'task', taskId }); }
  function showTaskReminderPicker(taskId, anchor) { openReminderPicker(anchor, { type: 'task', taskId }); }
  function showTaskRepeatPicker(taskId, anchor) { openRepeatPicker(anchor, { type: 'task', taskId }); }

  function handleClick(event) {
    if (!storagePersistenceRequested && state && !startupPromise) { storagePersistenceRequested = true; updateStoragePersistence(true).catch(console.error); }
    if (event.target.closest('[data-action="refresh-stale-data"]')) {
      const notice = staleDataNotice;
      staleDataNotice = null;
      renderToast();
      if (!notice) return;
      const latest = localStorage.getItem(STORAGE_KEY);
      if (latest !== notice.raw && latest !== notice.source) {
        staleDataNotice = { raw: latest, source: latest };
        renderToast();
        return;
      }
      startReady({ raw: notice.raw, source: latest || notice.source, synthetic: true });
      return;
    }
    if (event.target.closest('[data-action="retry-global-recovery"]')) {
      Promise.resolve(globalRecoveryNotice?.retry()).catch(error => globalNotice(tr('Retry failed: {error}. Recovery copy retained. Retry again.', { error: trMessage(error.message) }), globalRecoveryNotice.retry)); return;
    }
    if (globalOperation && !event.target.closest('#modal-root [data-action="confirm-action"], #modal-root [data-action="close-modal"]')) return;
    const mobileQuickAdd = event.target.closest('#mobile-quick-add');
    if (!mobileQuickAdd) setMobileQuickAddOpen(false);


    const routeEl = event.target.closest('[data-route]');
    if (routeEl) { event.preventDefault(); navigate(routeEl.dataset.route); return; }


    const pop = event.target.closest('[data-pop-action]');
    if (pop) { if (callDomainHook('handleAction', pop.dataset.popAction, event) === undefined) handlePopoverAction(pop); return; }

    const el = event.target.closest('[data-action]');
    if (!el) {
      if (popoverEl && !event.target.closest('.popover')) closePopover();
      return;
    }
    const action = el.dataset.action;
    if (action === 'toggle-mobile-quick-add') { const direct = quickAddDirect(); if (direct) { direct[1](); return; } setMobileQuickAddOpen(el.getAttribute('aria-expanded') !== 'true'); return; }
    if (el.closest('#mobile-quick-add-menu')) {
      setMobileQuickAddOpen(false);
      $('#mobile-quick-add-toggle')?.focus();
    }
    if (callDomainHook('handleAction', action, event) !== undefined) return;
    if(action==='recurrence-scope'){applyRecurrenceScope(el.dataset.scope);return;}
    if(action==='from-template')openTemplatePicker();
    else if(action==='more-route'){closePopover();navigate(el.dataset.moreRoute);}
    else if(action==='choose-template')chooseTemplate(el.dataset.templateId);
    else if(action==='template-picker-back'){if(modalState.previous?.type==='goal')closeModal();else{modalState=modalState.previous;renderModal();}}
    else if(action==='use-template')useTemplate(el.dataset.templateId);
    else if (action === 'quick-add') { const context = el.closest('#mobile-quick-add-menu') ? routeQuickAddContext() : { projectId: el.dataset.projectId || null, areaId: el.dataset.areaId || null, today: el.dataset.today === 'true', anytime: el.dataset.anytime === 'true' }; if (context) openQuickAdd(context); else setToastMessage(tr('Restore the project to add tasks.')); }
    else if (action === 'open-task') openTaskDetail(el.dataset.taskId);
    else if (action === 'toggle-focus-task') {
      const task = getTask(el.dataset.taskId); if (!task || task.isCompleted) return;
      const ids = Core.selectFocusTasks(state.tasks, state.settings.focusTaskIds);
      if (ids.includes(task.id)) state.settings.focusTaskIds = ids.filter(id => id !== task.id);
      else if (ids.length < 3) state.settings.focusTaskIds = [...ids, task.id];
      else { setToastMessage(tr('Daily focus has room for three tasks. Remove one first.')); return; }
      saveAndRender(); if (modalState?.type === 'task') renderModal();
    }
    else if (action === 'open-focus') openFocusMode();
    else if (action === 'open-focus-task') openFocusMode(el.dataset.taskId);
    else if (action === 'focus-complete') completeFocusTask(el.dataset.taskId);
    else if (action === 'focus-toggle-timer') toggleFocusTimer();
    else if (action === 'focus-reset-timer') resetFocusTimer();
    else if (action === 'focus-tomorrow') { moveTaskToTomorrow(el.dataset.taskId); if (modalState?.type === 'focus') focusNextTask(el.dataset.taskId); }
    else if (action === 'focus-open-details') openTaskDetail(el.dataset.taskId);
    else if (action === 'focus-next') focusNextTask(el.dataset.taskId);
    else if (action === 'toggle-complete') toggleComplete(el.dataset.taskId);
    else if (action === 'open-search') openSearch();
    else if (action === 'tasks-view') { state.ui.tasksView = el.dataset.view === 'projects' ? 'projects' : 'anytime'; saveAndRender(); }
    else if (action === 'delete-draft-goal-milestone') deleteDraftGoalMilestone(el.dataset.milestoneId);
    else if (action === 'delete-milestone') deleteMilestone(el.dataset.goalId, el.dataset.milestoneId);
    else if (action === 'save-area-linked') saveAreaLinkedModal();
    else if (action === 'new-tag') openTagModal();
    else if (action === 'tag-menu') openTagMenu(el, el.dataset.tagId);
    else if (action === 'task-menu') openTaskMenu(el, el.dataset.taskId);
    else if (action === 'attachment-menu') openAttachmentMenu(el, el.dataset.attachmentId);
    else if (action === 'attachment-image-picker') $('#attachment-image-input')?.click();
    else if (action === 'toggle-suggestions') { state.ui.suggestionsExpanded = !state.ui.suggestionsExpanded; saveAndRender(); }
    else if (action === 'toggle-today-completed') { state.ui.todayCompletedExpanded = !state.ui.todayCompletedExpanded; saveAndRender(); }
    else if (action === 'today-expand') { const key = el.dataset.todayKey; if (Object.hasOwn(TODAY_LIMITS, key)) { state.ui.todayExpanded = { ...state.ui.todayExpanded, [key]: !state.ui.todayExpanded?.[key] }; saveAndRender(); } }
    else if (action === 'add-all-suggestions') addAllSuggestions();
    else if (action === 'inbox-filter') { state.ui.inboxFilter = INBOX_FILTERS.some(([value]) => value === el.dataset.inboxFilter) ? el.dataset.inboxFilter : 'all'; saveAndRender(); }
    else if (action === 'inbox-remove') removeInboxRecord(el.dataset.inboxType, el.dataset.inboxId);
    else if (action === 'inbox-area') openInboxAreaSheet(el, el.dataset.inboxType, el.dataset.inboxId);
    else if (action === 'inbox-project') openProjectPicker(el, { type: 'task', taskId: el.dataset.taskId });
    else if (action === 'inbox-triage') openInboxTriage();
    else if (action === 'inbox-triage-skip') { modalState.index += 1; renderModal(); }
    else if (action === 'inbox-triage-open') { const route = `${el.dataset.inboxType}/${el.dataset.inboxId}`; closeModal(); navigate(route); }
    else if (action === 'inbox-today') { addTaskToToday(el.dataset.taskId); if (modalState?.type === 'inbox-triage') renderModal(); }
    else if (action === 'inbox-tomorrow') { moveTaskToTomorrow(el.dataset.taskId); if (modalState?.type === 'inbox-triage') renderModal(); }
    else if (action === 'inbox-anytime') { moveTaskToAnytime(el.dataset.taskId); if (modalState?.type === 'inbox-triage') renderModal(); }
    else if (action === 'task-project-picker') showTaskProjectPicker(el.dataset.taskId, el);
    else if (action === 'task-plan-picker') showTaskPlanPicker(el.dataset.taskId, el);
    else if (action === 'task-due-picker') showTaskDuePicker(el.dataset.taskId, el);
    else if (action === 'task-reminder-picker') showTaskReminderPicker(el.dataset.taskId, el);
    else if (action === 'task-repeat-picker') showTaskRepeatPicker(el.dataset.taskId, el);
    else if (action === 'task-tags-picker') openTagPicker(el, { type: 'task', taskId: el.dataset.taskId });
    else if (action === 'task-priority-picker') openPriorityPicker(el, { type: 'task', taskId: el.dataset.taskId });
    else if (action === 'task-duration-picker') openTaskDurationPicker(el, el.dataset.taskId);
    else if (action === 'quick-project-picker') openProjectPicker(el, { type: 'quick' });
    else if (action === 'quick-plan-picker') openPlanPicker(el, { type: 'quick' });
    else if (action === 'quick-due-picker') openDuePicker(el, { type: 'quick' });
    else if (action === 'quick-reminder-picker') openReminderPicker(el, { type: 'quick' });
    else if (action === 'quick-repeat-picker') openRepeatPicker(el, { type: 'quick' });
    else if (action === 'quick-tags-picker') openTagPicker(el, { type: 'quick' });
    else if (action === 'quick-priority-picker') openPriorityPicker(el, { type: 'quick' });
    else if (action === 'quick-template') openQuickTemplatePicker(el);
    else if (action === 'quick-template-clear') { clearQuickTemplate(); renderModal(); requestAnimationFrame(() => $('[data-action="quick-template"]')?.focus()); }
    else if (action === 'quick-more-options') createTask(false, true);
    else if (action === 'create-task') createTask(false);
    else if (action === 'close-modal') closeModal();
    else if (action === 'modal-backdrop' && event.target === el) closeModal();
    else if (action === 'toggle-subtask') toggleSubtask(el.dataset.taskId, el.dataset.subtaskId);
    else if (action === 'delete-subtask') deleteSubtask(el.dataset.taskId, el.dataset.subtaskId);
    else if (action === 'edit-subtask') editSubtask(el.dataset.taskId, el.dataset.subtaskId);
    else if (action === 'delete-task') deleteTask(el.dataset.taskId);
    else if (action === 'duplicate-without-files') duplicateTask(el.dataset.taskId, false);
    else if (action === 'duplicate-with-files') duplicateTask(el.dataset.taskId, true);
    else if (action === 'select-tag-color') { modalState.draft.color = el.dataset.color; renderModal(); }
    else if (action === 'save-tag') saveTagModal();
    else if (action === 'confirm-action') { const fn = modalState.onConfirm; if (typeof fn === 'function') fn(); }
    else if (action === 'sync-request-code') requestSyncCode();
    else if (action === 'sync-verify-code') verifySyncCode();
    else if (action === 'sync-change-email') { syncUi = { step: 'email', email: syncUi.email, busy: false, error: '' }; render(); }
    else if (action === 'sync-now') runSync().catch(console.error);
    else if (action === 'sync-sign-out') signOutSync();
    else if (action === 'sync-delete-account') deleteSyncAccount();
    else if (action === 'sync-choose') chooseSyncMode(el.dataset.mode);
    else if (action === 'undo') doUndo();
    else if (action === 'retry-delete-recovery') retryFailedDeleteRecovery();
    else if (action === 'enable-notifications') enableBrowserNotifications();
    else if (action === 'allow-exact-alarms') allowExactAlarms();
    else if (action === 'export-backup') exportBackupAction();
    else if (action === 'snooze-backup-reminder') { snoozeBackupReminder(); render(); }
    else if (action === 'dismiss-transfer-notice') { dismissTransferNotice(); render(); }
    else if (action === 'complete-weekly-review') completeWeeklyReview();
    else if (action === 'apply-app-update') applyAppUpdate();
    else if (action === 'request-storage-persistence') updateStoragePersistence(true).catch(console.error);
    else if (action === 'import-backup') chooseImportBackup();
    else if (action === 'restore-backup') restoreImportedBackup();
    else if (action === 'clear-completed') clearCompleted();
    else if (action === 'completed-project') openCompletedProjectSheet(el);
    else if (action === 'completed-period') { state.ui.completedPeriod = [0, 7, 30].includes(Number(el.dataset.value)) ? Number(el.dataset.value) : 0; saveAndRender(); }
    else if (action === 'reset-app') resetApp();
    else if (action === 'retry-load') { startReady(); }
    else if (action === 'retry-save') { saveAndRender(); }
    else if (action === 'retry-snapshot') { scheduleAutomaticSnapshot(); }
    else if (action === 'open-local-snapshots') { openLocalSnapshots(); }
    else if (action === 'restore-snapshot-entity') {
      const snapshot = modalState?.snapshots?.find(item => item.id === el.dataset.snapshotId);
      if (snapshot) beginGlobalOperation('restore', null, { snapshot, collection: el.dataset.collection, id: el.dataset.entityId });
    }
    else if (action === 'recovery-reset') resetApp();
  }

  function handlePopoverAction(button) {
    const action = button.dataset.popAction;
    if (action?.startsWith('repeat-') && handleRepeatAction(action, button)) return;
    if (action === 'close-sheet') closePopover();
    else if (action === 'quick-place' && modalState?.type === 'quick') { const inbox = button.dataset.place === 'inbox'; Object.assign(modalState.draft, { projectId: null, processed: !inbox, placePicked: true }); closePopover(); renderModal(); }
    else if (action === 'quick-template-pick') { const id = button.dataset.templateId; closePopover(); applyQuickTemplate(id); renderModal(); requestAnimationFrame(() => $('#quick-title')?.focus()); }
    else if (action === 'date-sheet-pick' && dateSheet) {
      dateSheet.time = $('#date-sheet-time', popoverEl)?.value ?? dateSheet.time;
      dateSheet.date = button.dataset.date;
      const picked = parseLocalDate(dateSheet.date);
      dateSheet.view = { y: picked.getFullYear(), m: picked.getMonth() };
      refreshSheet(dateSheetHtml(), `.sheet-calendar-day[data-date="${dateSheet.date}"]`);
    }
    else if (action === 'date-sheet-month' && dateSheet) {
      dateSheet.time = $('#date-sheet-time', popoverEl)?.value ?? dateSheet.time;
      const month = new Date(dateSheet.view.y, dateSheet.view.m + Number(button.dataset.step || 0), 1);
      dateSheet.view = { y: month.getFullYear(), m: month.getMonth() };
      refreshSheet(dateSheetHtml(), `[data-pop-action="date-sheet-month"][data-step="${Number(button.dataset.step) < 0 ? -1 : 1}"]`);
    }
    else if (action === 'date-sheet-apply') applyDateSheet(false);
    else if (action === 'date-sheet-clear') applyDateSheet(true);
    else if (action === 'reminder-preset' && reminderSheet) { Object.assign(reminderSheet, { date: button.dataset.date, time: button.dataset.time }); refreshSheet(reminderSheetHtml(), `[data-pop-action="reminder-preset"][data-date="${button.dataset.date}"][data-time="${button.dataset.time}"]`); }
    else if (action === 'reminder-apply') applyReminderSheet();
    else if (action === 'reminder-clear' && reminderSheet) setReminder(reminderSheet.target.type, reminderSheet.target.taskId, '');
    else if (action === 'tag-sheet-toggle') toggleTagSheet(button);
    else if (action === 'tag-sheet-apply') applyTagSheet();
    else if (action === 'set-task-duration') setTaskDuration(button.dataset.taskId, button.dataset.minutes);
    else if (action === 'set-task-duration-custom') setTaskDuration(button.dataset.taskId, $('#task-duration-custom', popoverEl)?.value);
    else if (action === 'task-start-focus') { const id = button.dataset.taskId; closePopover(); openFocusMode(id); }
    else if (action === 'completed-set-project') { state.ui.completedProjectFilter = getProject(button.dataset.value) ? button.dataset.value : ''; closePopover(); saveAndRender(); }
    else if (action === 'project-area') openProjectAreaSheet(button, button.dataset.projectId);
    else if (action === 'set-project-area') setProjectArea(button.dataset.projectId, button.dataset.areaId);
    else if (action === 'project-goals') openProjectGoalsSheet(button, button.dataset.projectId);
    else if (action === 'project-goal-toggle' && projectGoalSheet) { const id = button.dataset.goalId; const on = !projectGoalSheet.ids.has(id); if (on) projectGoalSheet.ids.add(id); else projectGoalSheet.ids.delete(id); button.classList.toggle('is-selected', on); button.setAttribute('aria-pressed', String(on)); const check = button.querySelector('.sheet-check'); if (check) { check.classList.toggle('is-on', on); check.innerHTML = on ? '<i class="ph ph-check"></i>' : ''; } }
    else if (action === 'project-goals-apply') applyProjectGoals();
    else if (action === 'inbox-set-area') setInboxArea(button.dataset.inboxType, button.dataset.inboxId, button.dataset.areaId);
    else if (action === 'set-project') setProject(button.dataset.targetType, button.dataset.taskId, button.dataset.projectId);
    else if (action === 'toggle-tag') toggleTag(button.dataset.targetType, button.dataset.taskId, button.dataset.tagId);
    else if (action === 'set-priority') setPriority(button.dataset.targetType, button.dataset.taskId, button.dataset.priority);
    else if (action === 'set-plan') setPlan(button.dataset.targetType, button.dataset.taskId, button.dataset.date);
    else if (action === 'set-due') setDue(button.dataset.targetType, button.dataset.taskId, button.dataset.date);
    else if (action === 'set-reminder') setReminder(button.dataset.targetType, button.dataset.taskId, button.dataset.reminder);
    else if (['pause-recurrence','resume-recurrence','skip-recurrence','end-recurrence'].includes(action)) controlRecurrence(button.dataset.taskId,action);
    else if (action === 'inline-new-tag') inlineNewTag(button);
    else if (action === 'inline-select-tag-color') { $$('.color-swatch', popoverEl).forEach(s => s.classList.toggle('is-selected', s === button)); const create = $('[data-pop-action="inline-tag-create"]', popoverEl); if (create) create.dataset.color = button.dataset.color; }
    else if (action === 'inline-tag-cancel') closePopover();
    else if (action === 'inline-tag-create') { const name = Core.normalizeTagName($('#inline-tag-name',popoverEl)?.value); const valid=Core.validateTagName(state.tags||[],name); if(!valid.ok){const er=$('#inline-tag-error',popoverEl); if(er){er.hidden=false;er.textContent=valid.reason==='duplicate-tag'?tr('A tag with this name already exists.'):tr('Tag needs a name.');} return;} const tag={id:uid('tag'),name,color:button.dataset.color||PROJECT_COLORS[0],createdAt:nowIso(),updatedAt:nowIso()}; state.tags.push(tag); saveState(); if (tagSheet) { tagSheet.ids.add(tag.id); refreshSheet(tagSheetHtml(), `[data-tag-id="${cssEscape(tag.id)}"]`); } else toggleTag(button.dataset.targetType, button.dataset.taskId, tag.id); render(); }
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
    else if (action === 'task-open-plan') { const taskId=button.dataset.taskId; closePopover(); const anchor=document.querySelector(`[data-action="task-menu"][data-task-id="${cssEscape(taskId)}"]`) || button; openPlanPicker(anchor,{type:'task',taskId}); }
    else if (action === 'task-duplicate') startDuplicate(button.dataset.taskId);
    else if (action === 'attachment-open') openAttachment(button.dataset.attachmentId, false);
    else if (action === 'attachment-download') openAttachment(button.dataset.attachmentId, true);
    else if (action === 'attachment-delete') deleteAttachment(button.dataset.attachmentId, { ownerType: button.dataset.ownerType, ownerId: button.dataset.ownerId });
    else if (action === 'task-open-project') { const taskId = button.dataset.taskId; closePopover(); const anchor = document.querySelector(`[data-action="task-menu"][data-task-id="${cssEscape(taskId)}"]`) || button; openProjectPicker(anchor, { type: 'task', taskId }); }
    else if (action === 'task-open-due') { const taskId = button.dataset.taskId; closePopover(); const anchor = document.querySelector(`[data-action="task-menu"][data-task-id="${cssEscape(taskId)}"]`) || button; openDuePicker(anchor, { type: 'task', taskId }); }
    else if (action === 'task-delete') { const id = button.dataset.taskId; closePopover(); deleteTask(id); }
    else if (action === 'edit-tag') { const id = button.dataset.tagId; closePopover(); openTagModal(id); }
    else if (action === 'delete-tag') deleteTag(button.dataset.tagId);
    else if (action === 'delete-goal') { const id = button.dataset.goalId; closePopover(); deleteGoal(id); }
  }

  function handleInput(event) {
    if (globalOperation) return;
    // Redesign R3 (E8, E9): the search field of a sheet filters its rows.
    if (event.target.matches?.('[data-sheet-search]')) {
      const query = event.target.value.trim().toLowerCase();
      popoverEl?.querySelectorAll('[data-sheet-item]').forEach(item => { item.hidden = Boolean(query) && !String(item.dataset.search || '').includes(query); });
      return;
    }
    if (reminderSheet && ['reminder-date', 'reminder-time'].includes(event.target.id)) {
      if (event.target.value) reminderSheet[event.target.id === 'reminder-date' ? 'date' : 'time'] = event.target.value;
      const summary = popoverEl?.querySelector('[data-reminder-summary]');
      if (summary) summary.textContent = tr('Remind me {date} at {time}', { date: relativeDateLabel(reminderSheet.date), time: reminderSheet.time });
      return;
    }
    if (callDomainHook('handleInput', event) !== undefined) return;
    if (modalState?.type === 'quick') {
      if (event.target.id === 'quick-title') {
        const d = modalState.draft; d.title = event.target.value; modalState.error = '';
        const parsed = parseQuickAddTitle(event.target.value, !d.explicitPlan);
        const slot = document.querySelector('[data-quick-preview-slot]'); if (slot) slot.innerHTML = quickParsePreview(parsed);
        if (!d.explicitPlan) d.parsedPlanDate = parsed.plannedDate;
        // Redesign R4: the selectors follow the title without redrawing the field.
        const planLabel = document.querySelector('[data-quick-plan-label]'); if (planLabel) planLabel.textContent = quickPlanLabel(d.explicitPlan ? d.plannedDate : (parsed.plannedDate || d.plannedDate), d.explicitPlannedTime ? d.plannedTime : (d.plannedTime || parsed.plannedTime));
        const placeLabel = document.querySelector('[data-quick-place-label]'); if (placeLabel) placeLabel.textContent = quickPlace(modalState.draft, parsed).label;
      }
    }
    if (modalState?.type === 'task') {
      const task = getTask(modalState.taskId);
      if (!task) return;
      if (event.target.id === 'detail-title') { modalState.titleDraft = event.target.value; modalState.error = ''; }
      else if (event.target.id === 'detail-notes') { modalState.notesDraft = event.target.value;if(!taskRecurrence(task)){task.notes=event.target.value;task.updatedAt=nowIso();scheduleTextSave();} }
    }
    if (modalState?.type === 'search' && event.target.id === 'search-query') {
      modalState.query = event.target.value;
      scheduleSearchResults();
    }
    if (modalState?.type === 'tag' && event.target.id === 'tag-name') { modalState.draft.name = event.target.value; modalState.error = ''; }
  }

  function handleChange(event) {
    if (globalOperation) return;
    if (event.target.matches('[data-task-duration]')) {
      const value = Number(event.target.value);
      updateTask(event.target.dataset.taskId, { durationMinutes: Number.isInteger(value) && value > 0 ? value : null }, false);
      render(); return;
    }
    if (callDomainHook('handleInput', event) !== undefined) return;
    if (event.target.matches('[data-task-time]')) { updateTask(event.target.dataset.taskId, { [event.target.dataset.taskTime]: Core.normalizeTime(event.target.value) }, false); render(); return; }
    if (event.target.matches('[data-task-flag]')) { const task = getTask(event.target.dataset.taskId); const field = event.target.dataset.taskFlag; if (task && ['isImportant', 'isUrgent'].includes(field)) { task[field] = event.target.checked; task.updatedAt = nowIso(); saveState(); render(); } return; }
    if (['attachment-input', 'attachment-image-input'].includes(event.target.id)) { receiveAttachmentFiles(event.target.dataset, [...event.target.files]); event.target.value=''; return; }
    // R10g (M5): the week start and density apply at once; the week-start history is kept (M11).
    if (['preference-week-start', 'preference-density'].includes(event.target.id)) { savePersonalization(); return; }
    if (event.target.id === 'daily-capacity') { const minutes = Number(event.target.value); if (Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440) { state.settings.dailyCapacityMinutes = minutes; saveAndRender(); } return; }
    if (event.target.id === 'backup-reminder-days') { const days = Number(event.target.value); if (Number.isInteger(days) && days >= 0 && days <= 90) { state.settings.backupReminderDays = days; saveAndRender(); } return; }
    if (event.target.id === 'backup-import-input') { const file=event.target.files?.[0]; event.target.value=''; if(file) inspectImportBackup(file); return; }
  }

  function handleBlur(event) {
    if (modalState?.type === 'task' && ['detail-title','detail-notes'].includes(event.target.id)) {
      const task = getTask(modalState.taskId); if (!task) return;
      if(event.target.id==='detail-notes'){if(taskRecurrence(task))requestTaskEdit(task.id,taskDraftChanges(task));return;}
      const title = String(event.target.value || '').trim();
      if (!title) { modalState.error = tr('Task needs a title.'); modalState.titleDraft = task.title; renderModal(); return; }
      if(!taskRecurrence(task)){task.title=title;modalState.titleDraft=title;task.updatedAt=nowIso();saveState();render();return;}
      requestTaskEdit(task.id,{title});
    }
  }

  function handleKeydown(event) {
    if (globalOperation && !['Escape','Tab'].includes(event.key)) return;
    const target = event.target;
    const typing = target && (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]') || target.isContentEditable);
    if (popoverEl && event.key === 'Tab') { trapPopoverFocus(event); return; }

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
      if(command){event.preventDefault();if(command==='newTask'){const direct=quickAddDirect();if(direct)direct[1]();else openQuickAdd();}else if(command==='search')openSearch();else navigate(command);return;}
      // Preserve the existing convenient Search alias, without bypassing suppression.
      if(state.settings.shortcuts.search !== null && event.key==='/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey){event.preventDefault();openSearch();return;}
    }

    if (modalState?.type === 'quick' && target?.id === 'quick-title' && event.key === 'Enter') {
      event.preventDefault(); createTask(event.shiftKey); return;
    }
    if (callDomainHook('handleInput', event) !== undefined) return;


    if (modalState?.type === 'task' && ['detail-title', 'detail-duration-minutes'].includes(target?.id) && event.key === 'Enter') { event.preventDefault(); target.blur(); return; }
    if (modalState?.type === 'task' && target?.id === 'detail-subtask' && event.key === 'Enter') { event.preventDefault(); addDetailSubtask(target.dataset.taskId, target.value); return; }
    if (['sync-email', 'sync-code'].includes(target?.id) && event.key === 'Enter' && !event.isComposing) { event.preventDefault(); if (target.id === 'sync-email') requestSyncCode(); else verifySyncCode(); return; }
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
    const calendarTarget = event.target.closest('[data-calendar-time], [data-calendar-date]');
    if (calendarTarget && ['calendar-task'].includes(dragState.type)) { event.preventDefault(); calendarTarget.classList.add('is-drop-target'); return; }
    if (dragState.type.startsWith('calendar-')) return;
    if (dragState.type === 'project') {
      const target = event.target.closest('.project-item[draggable="true"]'); if (!target || target.dataset.projectId === dragState.id) return; event.preventDefault(); return;
    }
    if (dragState.type === 'subtask') {
      const target = event.target.closest('.subtask-row[draggable="true"]'); if (!target || target.dataset.parentTaskId !== dragState.parentId || target.dataset.subtaskId === dragState.id) return; event.preventDefault(); target.classList.add('is-drop-target'); return;
    }
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
      const target = event.target.closest('[data-calendar-time], [data-calendar-date]');
      if (target) {
        const date = target.closest('[data-calendar-date]')?.dataset.calendarDate;
        const time = Core.normalizeTime(target.dataset.calendarTime);
        if (Core.parseDateOnly(date) && dragState.type === 'calendar-task') updateTask(dragState.id, { plannedDate: date, ...(time ? { plannedTime: time } : {}) });
      }
    } else if (dragState.type === 'project') {
      const target = event.target.closest('.project-item[draggable="true"]'); if (target) reorderProjects(dragState.id, target.dataset.projectId);
    } else if (dragState.type === 'subtask') {
      const target = event.target.closest('.subtask-row[draggable="true"]'); if (target && target.dataset.parentTaskId === dragState.parentId) reorderSubtasks(dragState.parentId, dragState.id, target.dataset.subtaskId);
    } else {
      const target = event.target.closest('.task-row[draggable="true"]'); if (target && target.dataset.listContext === dragState.context) reorderTasks(dragState.context, dragState.id, target.dataset.taskId);
    }
    cleanupDrag();
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

  // Redesign R2 (T5): a long press on an element with data-long-press runs that action (the habit menu on
  // Today), and the click that follows the press is swallowed. The menu is also reachable by a tap or keyboard.
  let longPressTimer = null, longPressFired = false;
  function handleLongPressStart(event) {
    if (!event.isPrimary || event.button > 0) return;
    const el = event.target.closest?.('[data-long-press]');
    if (!el) return;
    clearTimeout(longPressTimer); longPressFired = false;
    longPressTimer = setTimeout(() => { longPressTimer = null; longPressFired = true; callDomainHook('handleAction', el.dataset.longPress, { target: el }); }, 500);
  }
  function cancelLongPress() {
    clearTimeout(longPressTimer); longPressTimer = null;
  }
  function handleLongPressClick(event) {
    if (!longPressFired) return;
    longPressFired = false; event.preventDefault(); event.stopPropagation();
  }

  function attachEvents() {
    document.addEventListener('pointerdown', handleLongPressStart);
    document.addEventListener('pointerup', cancelLongPress);
    document.addEventListener('pointercancel', cancelLongPress);
    document.addEventListener('pointermove', event => { if (longPressTimer && (Math.abs(event.movementX) > 4 || Math.abs(event.movementY) > 4)) cancelLongPress(); });
    document.addEventListener('click', handleLongPressClick, true);
    document.addEventListener('contextmenu', event => { if (event.target.closest?.('[data-long-press]')) event.preventDefault(); });
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
    // The first-sync choice stays open across a route change: closing it would run its cancel, which signs out (audit P-3).
    window.addEventListener('hashchange', () => { closePopover(); if (modalState?.type !== 'sync-choice') closeModal(); render(); });
    window.addEventListener('storage', event => {
      if (globalOperation) return;
      if (event.key !== STORAGE_KEY) return;
      try {
        const source = localStorage.getItem(STORAGE_KEY);
        const validReplacement = event.newValue && Core.migrateStateV3(JSON.parse(event.newValue)).ok;
        const validRemoval = event.newValue === null && canonicalRaw !== null;
        if ((validReplacement || validRemoval) && event.newValue !== canonicalRaw) {
          staleDataNotice = { raw: event.newValue, source: canonicalRaw ?? source };
          renderToast();
        }
      } catch (_) { /* keep current tab data for malformed external state */ }
    });
    if (globalThis.DailoPlatform) globalThis.DailoPlatform.lifecycle.onPause(flushPendingWork);
    else window.addEventListener('pagehide', flushPendingWork);
    window.addEventListener('resize', closePopoverOnWidthChange);
    window.addEventListener('focus', checkReminders);
  }

  // Only a width change (rotation, window resize) closes popovers: the phone keyboard and the browser bars change
  // only the height, and a popover with a text field must stay open while the keyboard appears (audit P-5).
  let popoverWidth = window.innerWidth;
  function closePopoverOnWidthChange() {
    if (window.innerWidth === popoverWidth) return;
    popoverWidth = window.innerWidth;
    closePopover();
  }

  // Native durable mirror (audit M5): the canonical metadata text is also kept as a file in the app's Library
  // directory, so a WebView store the system cleared can be restored at start. Habit logs, goal history and files
  // stay in IndexedDB (and sync); the web has no mirror. Call sites check isNative inline, like the other platform hooks.
  let mirrorTimer = null;
  function scheduleDurableMirror(delay = 1000) {
    if (!globalThis.DailoPlatform?.isNative) return;
    clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(writeDurableMirror, delay);
  }
  function writeDurableMirror() {
    clearTimeout(mirrorTimer);
    mirrorTimer = null;
    const text = localStorage.getItem(STORAGE_KEY);
    if (text && globalThis.DailoPlatform?.isNative) globalThis.DailoPlatform.durable.write(text).catch(console.error);
  }
  // Only fills a missing store; the normal start-up load then validates and migrates the text as usual.
  async function restoreDurableMirror() {
    const platform = globalThis.DailoPlatform;
    if (!platform?.isNative || localStorage.getItem(STORAGE_KEY) !== null) return false;
    const text = await platform.durable.read();
    if (!text) return false;
    localStorage.setItem(STORAGE_KEY, text);
    return true;
  }

  // Typing and drafts are saved when the page is hidden or the app goes to the background: iOS can end a
  // backgrounded app without `pagehide` (audit P-4).
  // A recurring task's draft would open the "this or future" question, so only an unloading page flushes it.
  function flushPendingWork(reason = 'pagehide') {
    if (globalOperation || !state) return;
    const draftTask = modalState?.type === 'task' ? getTask(modalState.taskId) : null;
    if (reason === 'pagehide' || !draftTask || !taskRecurrence(draftTask)) flushTaskDraft();
    flushTextSave(); saveState();
    // The app may be swiped away next: write the mirror and hand reminders to the phone now, not after the save timer.
    if (globalThis.DailoPlatform?.isNative) { writeDurableMirror(); reconcileNotifications({ ask: false }).catch(console.error); }
  }

  // Back in the foreground: a new day, due reminders and a sync round, without waiting for the 30-second timer.
  function resumeApp() {
    if (globalOperation || startupPromise || recovery || !state) return;
    checkDateAndReminders();
    scheduleSync(500);
    if (globalThis.DailoPlatform?.isNative) scheduleNotificationPlan(500);
  }

  function checkDateAndReminders() {
    const next = Core.dateOnly();
    if (next !== lastToday) {
      lastToday = next;
      refreshHabitDateBoundary().catch(console.error);
    } else checkReminders();
  }

  // Android Back works like Escape: it closes the top sheet, menu, popover, inline editor or dialog and reports
  // whether anything closed; otherwise the platform goes to the previous screen or minimizes (audit P-3, M4).
  // A reset or restore that is already running is never interrupted.
  const overlaySnapshot = () => [$('#mobile-quick-add-toggle')?.getAttribute('aria-expanded'), popoverEl, modalState, document.activeElement];
  function handleBackButton() {
    if (globalOperation?.busy) return true;
    const before = overlaySnapshot();
    const target = document.activeElement || document.body; // an element: the key handler reads target.closest
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    const after = overlaySnapshot();
    return before.some((value, index) => value !== after[index]);
  }

  // Native integration (audit M3): resume, Back, links that leave the app, leftovers of an interrupted share.
  function startPlatform() {
    const platform = globalThis.DailoPlatform;
    if (!platform) return;
    platform.lifecycle.onResume(resumeApp);
    platform.backButton.setHandler(handleBackButton);
    platform.links.interceptExternalLinks(document, { onlinePages: { 'uputstvo.html': Release.GUIDE_URL } });
    platform.files.cleanupSharedFiles().catch(console.error);
    platform.notifications.onOpen(openNotificationTarget);
    scheduleNotificationPlan(0);
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
        canonicalRaw = committedSource;
        if (globalThis.DailoPlatform?.isNative) scheduleDurableMirror();
        runScheduledTaskTemplates({ duringStartup: true });
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
              throw new Error(msg('File ownership changed during cleanup.'));
          }).catch(() => setToastMessage(tr('File cleanup failed. Retained files were kept.')));
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
    // Quick Add is an explicit disclosure: never restore it open on reload or route changes.
    if (typeof setMobileQuickAddOpen === 'function') setMobileQuickAddOpen(false);
    let restored = false;
    try { restored = await restoreDurableMirror(); } catch (error) { console.error(error); }
    await startReady();
    if (restored && state) setToastMessage(tr('Your data was restored from the copy Dailo keeps on this device.'));
    scheduleAutomaticSnapshot();
    startSync();
    updateStoragePersistence(false).catch(console.error);
    registerServiceWorker();
    startPlatform();
    // replace, not assign: the first screen must not leave an extra step for Back.
    if (!location.hash) location.replace('#today');
    setInterval(() => {
      if (globalOperation || startupPromise || recovery || !state) return;
      if (runScheduledTaskTemplates()) render();
      checkDateAndReminders();
    }, 30000);
  }

  window.TodoApp = { init, handleBackButton, get ready() { return startupPromise || Promise.resolve(); }, get state() { return state; }, deleteLifecycle, render, openQuickAdd, openSearch, checkReminders, captureGoalProgress, evaluateGoalProgressChanges, setHabitLog, refreshHabitMetrics, refreshHabitDateBoundary, evaluateHabitBoundaries, snoozeHabit };
  init();
})();
