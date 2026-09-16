(function () {
  'use strict';

  const Core = window.TodoCore;
  const Attachments = window.TodoAttachments;
  const Backup = window.TodoBackup;
  const TemplatesUI = window.TodoTemplatesUI;
  const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
  const MAX_ATTACHMENTS_PER_TASK = 10;
  const STORAGE_KEY = 'todoAppData';
  const VERSION = 2;
  const PROJECT_COLORS = ['#5362FF', '#30CBAD', '#A879FF', '#4CC9F0', '#F5B942', '#FF8A5B', '#F06A8A', '#8FD14F'];
  const DATE_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const SHORT_DATE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const WEEKDAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
  const DATE_TIME_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  let state = null;
  let recovery = null;
  let storageError = false;
  let modalState = null;
  let popoverEl = null;
  let undoState = null;
  let undoTimer = null;
  let textSaveTimer = null;
  let lastToday = Core.dateOnly();
  let dragState = null;
  let modalReturnFocus = null;
  let activeTemplateType = 'task';

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
      settings: { weekStartsOn: 'monday' },
      ui: {
        sidebarCollapsed: false,
        suggestionsExpanded: false,
        todayCompletedExpanded: false,
        projectCompletedExpanded: {},
        completedProjectFilter: '',
        completedPeriod: 0,
      },
    };
  }

  function createSampleState() {
    const today = Core.dateOnly();
    const state = createEmptyState();
    const ts = nowIso();
    const projects = [
      { id: 'project_client', name: 'Client Website', color: PROJECT_COLORS[0], order: 0, createdAt: ts, updatedAt: ts },
      { id: 'project_portfolio', name: 'Portfolio', color: PROJECT_COLORS[2], order: 1, createdAt: ts, updatedAt: ts },
      { id: 'project_personal', name: 'Personal', color: PROJECT_COLORS[1], order: 2, createdAt: ts, updatedAt: ts },
    ];
    const mkTask = (id, title, extras = {}) => ({
      id,
      title,
      notes: '',
      projectId: null,
      plannedDate: null,
      dueDate: null,
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
    const migrated = Core.migrateStateV2(input);
    if (!migrated.ok) throw new Error(migrated.reason || 'invalid-state');
    const next = migrated.state;
    next.settings = next.settings || { weekStartsOn: 'monday' };
    next.ui = next.ui || {};
    next.ui.sidebarCollapsed = Boolean(next.ui.sidebarCollapsed);
    next.ui.suggestionsExpanded = Boolean(next.ui.suggestionsExpanded);
    next.ui.todayCompletedExpanded = Boolean(next.ui.todayCompletedExpanded);
    next.ui.projectCompletedExpanded = next.ui.projectCompletedExpanded || {};
    next.ui.completedProjectFilter = next.ui.completedProjectFilter || '';
    next.ui.completedPeriod = Number(next.ui.completedPeriod) || 0;
    next.ui.selectedTagId = next.ui.selectedTagId || '';
    next.tags = (next.tags || []).map((tag, i) => ({
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
      subtasks: (t.subtasks || []).map((s, i) => ({ id: s.id || uid('sub'), title: s.title || '', isCompleted: Boolean(s.isCompleted), order: Number.isFinite(s.order) ? s.order : i })),
    }));
    next.projects = next.projects.map((p, i) => ({ color: PROJECT_COLORS[i % PROJECT_COLORS.length], order: i, createdAt: nowIso(), updatedAt: nowIso(), isArchived: false, archivedAt: null, ...p }));
    return next;
  }

  function loadState() {
    recovery = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        state = createSampleState();
        saveState();
        return;
      }
      const parsed = JSON.parse(raw);
      const migration = Core.migrateStateV2(parsed);
      if (!migration.ok) {
        recovery = migration.reason;
        state = null;
        return;
      }
      state = normalizeState(migration.state);
      if (migration.migrated) saveState();
    } catch (error) {
      console.error(error);
      recovery = error && error.message === 'unsupported-version' ? 'unsupported-version' : 'corrupted-data';
      state = null;
    }
  }

  function saveState() {
    if (!state) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

  function currentRoute() {
    const hash = location.hash.replace(/^#/, '') || 'today';
    if (['today', 'inbox', 'upcoming', 'anytime', 'tags', 'templates', 'archived', 'completed', 'settings'].includes(hash)) return { type: hash };
    if (hash.startsWith('project/')) {
      const id = decodeURIComponent(hash.slice('project/'.length));
      if (getProject(id)) return { type: 'project', id };
      return { type: 'today' };
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
          <div class="task-context-drop tomorrow-drop-target" data-drop-plan="tomorrow" aria-label="Drop task to plan for tomorrow"><i class="ph ph-arrow-bend-down-right"></i><span>Tomorrow</span></div>
        </nav>

        <section class="sidebar-section">
          <div class="sidebar-section-title">Projects</div>
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
        </section>

        <section class="sidebar-section sidebar-tags-section">
          <div class="sidebar-section-title">Tags</div>
          <button class="sidebar-action ${route.type === 'tags' ? 'is-active' : ''}" type="button" data-route="tags" title="Tags"><i class="ph ph-tag"></i><span>Tags</span></button>
        </section>

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
    const warning = storageError ? `<div class="global-warning"><i class="ph ph-warning-circle"></i> Changes couldn't be saved locally. Refreshing may cause data loss.</div>` : '';
    let content = '';
    if (route.type === 'today') content = renderToday();
    else if (route.type === 'inbox') content = renderInbox();
    else if (route.type === 'upcoming') content = renderUpcoming();
    else if (route.type === 'anytime') content = renderAnytime();
    else if (route.type === 'tags') content = renderTags();
    else if (route.type === 'templates') content = renderTemplates();
    else if (route.type === 'archived') content = renderArchivedProjects();
    else if (route.type === 'project') content = renderProject(route.id);
    else if (route.type === 'completed') content = renderCompleted();
    else if (route.type === 'settings') content = renderSettings();
    else content = renderToday();
    main.innerHTML = `${warning}<div class="content">${content}</div>`;
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

  function renderToday() {
    const today = Core.dateOnly();
    const sections = Core.deriveTodaySections(state.tasks, today);
    const total = sections.today.length;
    let html = pageHeader('Today', `${formatPageToday(today)}${total ? ` · ${total} ${total === 1 ? 'task' : 'tasks'}` : ''}`, { contextToday: true });

    if (sections.overdue.length) {
      html += `<section class="section"><div class="section-header"><h2 class="section-label danger">Overdue</h2><span class="section-count">${sections.overdue.length}</span></div><div class="task-list">${sections.overdue.map(t => taskRow(t, 'today', { overdue: true })).join('')}</div></section>`;
    }

    html += `<section class="section"><div class="section-header"><h2 class="section-label">Today</h2><span class="section-count">${sections.today.length}</span></div>`;
    if (sections.today.length) html += `<div class="task-list" data-list-context="today">${sections.today.map(t => taskRow(t, 'today', { draggable: true })).join('')}</div>`;
    else html += emptyState('Nothing planned for today.', sections.suggestions.length ? `${sections.suggestions.length} suggestions available.` : 'Add a task when you are ready.', 'Add task', 'quick-add', { today: true });
    html += `<button class="inline-add" type="button" data-action="quick-add" data-today="true"><i class="ph ph-plus"></i> Add task</button></section>`;

    if (sections.suggestions.length) {
      const open = state.ui.suggestionsExpanded;
      html += `<section class="section"><button class="collapsible-trigger" type="button" data-action="toggle-suggestions" aria-expanded="${open}"><span class="left"><i class="ph ph-sparkle"></i> Suggested for today</span><span>${sections.suggestions.length} <i class="ph ph-caret-${open ? 'up' : 'down'}"></i></span></button>`;
      if (open) {
        html += `<div class="task-list">${sections.suggestions.map(item => taskRow(item.task, 'suggestion', { suggestionReason: item.reason })).join('')}</div><button class="btn btn-ghost" type="button" data-action="add-all-suggestions"><i class="ph ph-plus-circle"></i> Add all to Today</button>`;
      }
      html += `</section>`;
    }

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

  function renderTemplates() {
    if (!TemplatesUI) return emptyState('Templates unavailable', 'Reload the prototype to load the Templates interface.');
    return TemplatesUI.renderTemplates(state.templates || [], activeTemplateType);
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
    const groups = Core.deriveUpcoming(state.tasks, today);
    let html = pageHeader('Upcoming', 'Planned work and upcoming deadlines', {});
    if (!groups.length) return html + emptyState('Nothing scheduled.', 'Tasks you plan or set a due date for will appear here.');
    for (const group of groups) {
      const d = parseLocalDate(group.date);
      const rel = relativeDateLabel(group.date, today);
      const dayName = [today, Core.addDays(today, 1)].includes(group.date) ? rel : WEEKDAY_FMT.format(d);
      html += `<section class="upcoming-group"><div class="group-date"><strong>${esc(dayName)}</strong><span>${esc(formatDate(group.date))}</span></div><div class="task-list">${group.items.map(item => taskRow(item.task, 'upcoming', { upcomingReason: item.displayReason })).join('')}</div></section>`;
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
    const unsupported = recovery === 'unsupported-version';
    return `<div class="recovery"><div class="recovery-card"><h1>${unsupported ? 'This data is from a newer version.' : "We couldn't load your local data."}</h1><p>${unsupported ? "The prototype can't safely read this saved format." : 'Your saved data appears to be invalid. Nothing has been overwritten.'}</p><div class="recovery-actions"><button class="btn btn-secondary" type="button" data-action="retry-load">Retry</button><button class="btn btn-danger" type="button" data-action="recovery-reset">Reset local data</button></div></div></div>`;
  }

  function openQuickAdd(context = {}) {
    closePopover();
    const defaults = {
      projectId: context.projectId || null,
      plannedDate: context.today ? Core.dateOnly() : null,
      processed: Boolean(context.anytime),
    };
    modalState = {
      type: 'quick',
      defaults,
      draft: {
        title: '', notes: '', projectId: defaults.projectId, plannedDate: defaults.plannedDate, parsedPlanDate: null, explicitPlan: Boolean(defaults.plannedDate),
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

  function openProjectModal(projectId = null) {
    closePopover();
    const project = projectId ? getProject(projectId) : null;
    modalState = {
      type: 'project', projectId,
      draft: { name: project?.name || '', color: project?.color || nextProjectColor() },
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

  function openConfirm(config) {
    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closePopover();
    modalState = { type: 'confirm', ...config };
    renderModal();
  }

  function closeModal() {
    flushTaskDraft();
    const returnTarget = modalReturnFocus;
    modalReturnFocus = null;
    modalState = null;
    $('#modal-root').innerHTML = '';
    if (returnTarget?.isConnected) requestAnimationFrame(() => returnTarget.focus());
  }

  function renderModal() {
    const root = $('#modal-root');
    if (!modalState) { root.innerHTML = ''; return; }
    if (modalState.type === 'quick') root.innerHTML = renderQuickModal();
    else if (modalState.type === 'task') root.innerHTML = renderTaskModal();
    else if (modalState.type === 'search') root.innerHTML = renderSearchModal();
    else if (modalState.type === 'project') root.innerHTML = renderProjectModal();
    else if (modalState.type === 'tag') root.innerHTML = renderTagModal();
    else if (modalState.type === 'confirm') root.innerHTML = renderConfirmModal();
    else if (modalState.type === 'duplicate') root.innerHTML = renderDuplicateModal();
    else if (modalState.type === 'import-backup') root.innerHTML = renderImportBackupModal();
    if (modalState?.type === 'confirm') requestAnimationFrame(() => root.querySelector('.modal button, .modal [href], .modal input, .modal select, .modal textarea, .modal [tabindex]:not([tabindex="-1"])')?.focus());
  }

  function modalFrame(content, cls = '') {
    return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal ${cls}" role="dialog" aria-modal="true">${content}</section></div>`;
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
        <button class="property-row" type="button" data-action="task-tags-picker" data-task-id="${esc(task.id)}"><span class="property-key">Tags</span><span class="property-value">${tagSummary(task.tagIds) || 'No tags'}</span></button>
        <button class="property-row" type="button" data-action="task-priority-picker" data-task-id="${esc(task.id)}"><span class="property-key">Priority</span><span class="property-value priority-value">${priorityIcon(task.priority)}${esc(priorityLabel(task.priority))}</span></button>
        <button class="property-row" type="button" data-action="task-reminder-picker" data-task-id="${esc(task.id)}"><span class="property-key">Reminder</span><span class="property-value">${task.reminderAt ? esc(formatReminder(task.reminderAt)) : 'No reminder'}</span></button>
        <button class="property-row" type="button" data-action="task-repeat-picker" data-task-id="${esc(task.id)}"><span class="property-key">Repeat</span><span class="property-value">${esc(recurrenceLabel(task.recurrence))}</span></button>
      </div>
      <div class="detail-section"><div class="detail-heading"><span>Subtasks</span><span>${completedCount} / ${task.subtasks.length}</span></div><div class="subtask-list" data-subtask-list="${esc(task.id)}">${[...task.subtasks].sort((a,b)=>clampOrder(a.order)-clampOrder(b.order)).map(s => subtaskRow(task, s)).join('')}</div><div class="add-subtask-input"><span></span><input id="detail-subtask" class="input" type="text" placeholder="Add subtask..." data-task-id="${esc(task.id)}" /></div></div>
      <div class="detail-section attachments-section"><div class="detail-heading"><span>Attachments</span><span>${(task.attachmentIds || []).length} / ${MAX_ATTACHMENTS_PER_TASK}</span></div><label class="attachment-drop-zone" data-task-id="${esc(task.id)}"><i class="ph ph-paperclip"></i><span><strong>Drop files here</strong><small>or choose files · max 10 MB each</small></span><span class="btn btn-secondary attachment-add-button">Add attachment</span><input id="attachment-input" type="file" multiple hidden data-task-id="${esc(task.id)}" /></label>${modalState.attachmentMessage ? `<div class="attachment-message" role="status">${esc(modalState.attachmentMessage)}</div>` : ''}<div class="attachment-list">${(modalState.attachmentRecords || []).map(renderAttachmentRow).join('')}</div></div>
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

  async function loadTaskAttachments(taskId) {
    if (!Attachments) return;
    const task = getTask(taskId); if (!task) return;
    try {
      const records = await Attachments.getMany(task.attachmentIds || []);
      if (modalState?.type === 'task' && modalState.taskId === taskId) { modalState.attachmentRecords = records.filter(r => !r.pendingDeleteUntil); renderModal(); }
    } catch (error) {
      console.error(error);
      if (modalState?.type === 'task' && modalState.taskId === taskId) { modalState.attachmentMessage = 'Attachments are unavailable in this browser.'; renderModal(); }
    }
  }

  async function addAttachments(taskId, files) {
    const task = getTask(taskId); if (!task || !Attachments) return;
    const incoming = [...(files || [])];
    const remaining = Math.max(0, MAX_ATTACHMENTS_PER_TASK - (task.attachmentIds || []).length);
    const valid = [];
    let tooLarge = 0;
    for (const file of incoming) {
      if (file.size > MAX_ATTACHMENT_BYTES) { tooLarge++; continue; }
      if (valid.length < remaining) valid.push(file);
    }
    const countRejected = Math.max(0, incoming.length - tooLarge - valid.length);
    let added = 0;
    for (const file of valid) {
      const id = uid('att'); const ts = nowIso();
      const record = { id, taskId, fileName: file.name || 'attachment', mimeType: file.type || 'application/octet-stream', size: file.size, blob: file, createdAt: ts, updatedAt: ts, pendingDeleteUntil: null };
      try {
        await Attachments.put(record);
        task.attachmentIds = [...(task.attachmentIds || []), id];
        task.updatedAt = nowIso();
        added++;
      } catch (error) { console.error(error); }
    }
    saveState();
    if (modalState?.type === 'task' && modalState.taskId === taskId) {
      const parts = [];
      if (added) parts.push(`${added} ${added === 1 ? 'file' : 'files'} added.`);
      if (tooLarge) parts.push(`${tooLarge} ${tooLarge === 1 ? 'file is' : 'files are'} larger than 10 MB.`);
      if (countRejected) parts.push(`${countRejected} couldn't be added because the limit is 10.`);
      modalState.attachmentMessage = parts.join(' ');
      await loadTaskAttachments(taskId);
    }
    render();
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
    const task = state.tasks.find(t => (t.attachmentIds || []).includes(attachmentId)); if (!task) return;
    const index = task.attachmentIds.indexOf(attachmentId);
    task.attachmentIds.splice(index, 1); task.updatedAt = nowIso();
    const until = new Date(Date.now() + 6500).toISOString();
    try { await Attachments.markPending([attachmentId], until); } catch (error) { console.error(error); task.attachmentIds.splice(index, 0, attachmentId); return; }
    saveState(); closePopover(); await loadTaskAttachments(task.id); render();
    setUndo('Attachment deleted', async () => { const t=getTask(task.id); if(!t)return; await Attachments.restorePending([attachmentId]); t.attachmentIds.splice(Math.min(index,t.attachmentIds.length),0,attachmentId); t.updatedAt=nowIso(); saveState(); render(); if(modalState?.taskId===task.id) await loadTaskAttachments(task.id); }, () => Attachments.deleteMany([attachmentId]));
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
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><div><h2 class="modal-title">${esc(modalState.title)}</h2>${modalState.message ? `<p class="page-subtitle" style="margin-top:10px;max-width:380px">${esc(modalState.message)}</p>` : ''}</div><button class="btn-icon" type="button" data-action="close-modal"><i class="ph ph-x"></i></button></div><div class="modal-footer" style="border:0;padding-top:0"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-danger" type="button" data-action="confirm-action">${esc(modalState.confirmLabel || 'Delete')}</button></div></div></div>`, 'confirm-modal');
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
    const ids = new Set(task.tagIds || []); ids.has(tagId) ? ids.delete(tagId) : ids.add(tagId); task.tagIds = [...ids]; task.updatedAt = nowIso(); saveState(); closePopover(); render(); renderModal();
  }

  function setPriority(targetType, taskId, value) {
    const priority = ['none','low','medium','high'].includes(value) ? value : 'none';
    if (targetType === 'quick') { modalState.draft.priority = priority; closePopover(); renderModal(); return; }
    const task = getTask(taskId); if (!task) return; task.priority = priority; task.updatedAt = nowIso(); saveState(); closePopover(); render(); renderModal();
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
    const html = `<div class="popover-title">Repeat</div>${option('Does not repeat', '')}${option('Every day', 'daily')}${option('Every week', 'weekly')}${option('Every month', 'monthly')}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="show-custom-repeat" ${attrs}><i class="ph ph-sliders-horizontal"></i>Custom interval...</button>`;
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
  }

  function setReminder(targetType, taskId, value) {
    const reminderAt = value || null;
    if (targetType === 'quick') {
      modalState.draft.reminderAt = reminderAt;
      modalState.draft.reminderFiredAt = null;
      closePopover(); renderModal(); return;
    }
    const task = getTask(taskId); if (!task) return;
    task.reminderAt = reminderAt; task.reminderFiredAt = null; task.updatedAt = nowIso();
    saveState(); closePopover(); render();
    if (modalState?.type === 'task' && modalState.taskId === taskId) renderModal();
  }

  function setRecurrence(targetType, taskId, recurrence) {
    const value = recurrence && recurrence.frequency ? { frequency: recurrence.frequency, interval: Math.max(1, Number(recurrence.interval) || 1) } : null;
    if (targetType === 'quick') {
      modalState.draft.recurrence = value;
      closePopover(); renderModal(); return;
    }
    const task = getTask(taskId); if (!task) return;
    task.recurrence = value; task.updatedAt = nowIso();
    saveState(); closePopover(); render();
    if (modalState?.type === 'task' && modalState.taskId === taskId) renderModal();
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
    openPopover(anchor, html, { type: 'task-menu', taskId });
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
    openPopover(anchor, html, { type: 'project-menu', projectId });
  }

  function openMoreMenu(anchor) {
    const route = currentRoute();
    const html = `<button class="popover-option ${route.type === 'anytime' ? 'is-selected' : ''}" type="button" data-route="anytime"><i class="ph ph-infinity"></i>Anytime</button><button class="popover-option ${route.type === 'templates' ? 'is-selected' : ''}" type="button" data-route="templates"><i class="ph ph-bookmark-simple"></i>Templates</button><button class="popover-option ${route.type === 'archived' ? 'is-selected' : ''}" type="button" data-route="archived"><i class="ph ph-archive"></i>Archived Projects</button><div class="popover-separator"></div><button class="popover-option ${route.type === 'completed' ? 'is-selected' : ''}" type="button" data-route="completed"><i class="ph ph-check-circle"></i>Completed</button><button class="popover-option ${route.type === 'settings' ? 'is-selected' : ''}" type="button" data-route="settings"><i class="ph ph-gear"></i>Settings</button>`;
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
    if (popoverEl) popoverEl.remove();
    popoverEl = null;
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
    const task = getTask(taskId);
    if (!task) return;
    Object.assign(task, changes, { updatedAt: nowIso() });
    saveState();
    if (rerender) render();
  }

  function setProject(targetType, taskId, projectId) {
    if (targetType === 'quick') {
      modalState.draft.projectId = projectId || null;
      if (projectId) modalState.draft.isInbox = false;
      closePopover();
      renderModal();
      return;
    }
    const task = getTask(taskId);
    if (!task) return;
    task.projectId = projectId || null;
    if (projectId) task.isInbox = false;
    task.updatedAt = nowIso();
    saveState(); closePopover(); render();
    if (modalState?.type === 'task' && modalState.taskId === taskId) renderModal();
  }

  function setPlan(targetType, taskId, date) {
    if (targetType === 'quick') {
      modalState.draft.plannedDate = date || null;
      modalState.draft.explicitPlan = true; modalState.draft.parsedPlanDate = null;
      closePopover(); renderModal(); return;
    }
    const task = getTask(taskId); if (!task) return;
    task.plannedDate = date || null;
    if (date) task.isInbox = false;
    task.updatedAt = nowIso();
    saveState(); closePopover(); render();
    if (modalState?.type === 'task' && modalState.taskId === taskId) renderModal();
  }

  function setDue(targetType, taskId, date) {
    if (targetType === 'quick') {
      modalState.draft.dueDate = date || null;
      closePopover(); renderModal(); return;
    }
    const task = getTask(taskId); if (!task) return;
    task.dueDate = date || null;
    task.updatedAt = nowIso();
    saveState(); closePopover(); render();
    if (modalState?.type === 'task' && modalState.taskId === taskId) renderModal();
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
      id: uid('task'), title, notes: d.notes || '', projectId: d.projectId || null,
      plannedDate: resolvedPlan || null, dueDate: d.dueDate || null,
      reminderAt: d.reminderAt || null, reminderFiredAt: null, recurrence: d.recurrence || null, tagIds: [...(d.tagIds || [])], priority: d.priority || 'none', attachmentIds: [], isInbox,
      isCompleted: false, completedAt: null,
      subtasks: d.subtasks.map((s, i) => ({ ...s, order: i })),
      todayOrder: resolvedPlan === Core.dateOnly() ? nextOrder('today') : null,
      projectOrder: d.projectId ? nextOrder(`project:${d.projectId}`) : null,
      inboxOrder: isInbox ? nextOrder('inbox', true) : null,
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    state.tasks.push(task);
    saveState();
    if (keepOpen) {
      const defaults = modalState.defaults;
      modalState = { type: 'quick', defaults, draft: { title: '', notes: '', projectId: defaults.projectId, plannedDate: defaults.plannedDate, parsedPlanDate: null, explicitPlan: Boolean(defaults.plannedDate), dueDate: null, reminderAt: null, reminderFiredAt: null, recurrence: null, tagIds: [], priority: 'none', subtasks: [], moreOpen: false }, error: '' };
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
    const previous = { isCompleted: task.isCompleted, completedAt: task.completedAt };
    if (task.isCompleted) {
      task.isCompleted = false; task.completedAt = null;
      task.updatedAt = nowIso(); saveState(); render(); if (modalState?.type === 'task') renderModal();
      return;
    }
    const completedAt = nowIso();
    task.isCompleted = true; task.completedAt = completedAt; task.updatedAt = completedAt;
    let generatedId = null;
    if (task.recurrence) {
      const next = Core.buildNextRecurringTask(task, completedAt, uid('task'));
      if (next) {
        generatedId = next.id;
        if (next.projectId) next.projectOrder = nextOrder(`project:${next.projectId}`);
        if (next.plannedDate === Core.dateOnly()) next.todayOrder = nextOrder('today');
        state.tasks.push(next);
      }
    }
    saveState();
    setUndo('Task completed', () => {
      const current = getTask(taskId); if (!current) return;
      current.isCompleted = previous.isCompleted; current.completedAt = previous.completedAt; current.updatedAt = nowIso();
      if (generatedId) state.tasks = state.tasks.filter(item => item.id !== generatedId);
      saveState(); render();
    });
    render(); if (modalState?.type === 'task') renderModal();
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
      state.tasks.push(copy); saveState(); closeModal(); closePopover(); render();
      setUndo('Task duplicated', async () => { state.tasks = state.tasks.filter(t=>t.id!==copy.id); if(createdIds.length) await Attachments.deleteMany(createdIds); saveState(); render(); });
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
    const index = state.tasks.findIndex(t => t.id === taskId); if (index < 0) return;
    const [removed] = state.tasks.splice(index, 1);
    const attachmentIds = [...(removed.attachmentIds || [])];
    const until = new Date(Date.now() + 6500).toISOString();
    if (attachmentIds.length) { try { await Attachments.markPending(attachmentIds, until); } catch (error) { state.tasks.splice(index,0,removed); return; } }
    closeModal(); saveState(); render();
    setUndo('Task deleted', async () => { state.tasks.splice(Math.min(index, state.tasks.length), 0, removed); if (attachmentIds.length) await Attachments.restorePending(attachmentIds); saveState(); render(); }, attachmentIds.length ? () => Attachments.deleteMany(attachmentIds) : null);
  }

  function setUndo(message, undoFn, finalizer = null) {
    if (undoTimer) clearTimeout(undoTimer);
    if (undoState?.finalizer) Promise.resolve(undoState.finalizer()).catch(console.error);
    undoState = { message, undoFn, finalizer };
    renderToast();
    undoTimer = setTimeout(() => { const final = undoState?.finalizer; undoState = null; renderToast(); if (final) Promise.resolve(final()).catch(console.error); }, 6500);
  }

  function renderToast() {
    const root = $('#toast-root');
    if (!undoState) { root.innerHTML = ''; return; }
    root.innerHTML = `<div class="toast"><i class="ph-fill ph-check-circle toast-icon"></i><span class="toast-message">${esc(undoState.message)}</span><button class="toast-action" type="button" data-action="undo">Undo</button></div>`;
  }

  function doUndo() {
    if (!undoState) return;
    const fn = undoState.undoFn;
    undoState = null; clearTimeout(undoTimer); undoTimer = null; renderToast(); fn();
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
    const prev = { plannedDate: task.plannedDate, isInbox: task.isInbox, todayOrder: task.todayOrder };
    task.plannedDate = Core.dateOnly(); task.isInbox = false; task.todayOrder = nextOrder('today'); task.updatedAt = nowIso(); saveState(); render();
    setUndo('Task moved to Today', () => { const t = getTask(taskId); if (!t) return; Object.assign(t, prev, { updatedAt: nowIso() }); saveState(); render(); });
  }

  function moveTaskToTomorrow(taskId) {
    const task = getTask(taskId); if (!task) return;
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
    const tag = getTag(tagId); if (!tag) return;
    const used = state.tasks.filter(task => Array.isArray(task.tagIds) && task.tagIds.includes(tagId)).length;
    const perform = () => {
      state.tags = state.tags.filter(t => t.id !== tagId);
      state.tasks.forEach(task => { task.tagIds = (task.tagIds || []).filter(id => id !== tagId); });
      if (state.ui.selectedTagId === tagId) state.ui.selectedTagId = state.tags[0]?.id || '';
      saveState(); closeModal(); render();
    };
    closePopover();
    if (used) openConfirm({ title: `Delete “${tag.name}”?`, message: `This tag is used by ${used} ${used === 1 ? 'task' : 'tasks'}. Tasks will not be deleted.`, confirmLabel: 'Delete tag', onConfirm: perform });
    else perform();
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
      state.projects.push({ id: uid('project'), name, color: modalState.draft.color, order: nextProjectOrder(), isArchived: false, archivedAt: null, createdAt: nowIso(), updatedAt: nowIso() });
    }
    saveState(); closeModal(); render();
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
    const project = getProject(projectId); if (!project) return;
    const associated = state.tasks.filter(t => t.projectId === projectId);
    const execute = () => {
      const projectIndex = state.projects.findIndex(p => p.id === projectId);
      const removedProject = state.projects[projectIndex];
      const removedTasks = state.tasks.filter(t => t.projectId === projectId);
      state.projects.splice(projectIndex, 1);
      state.tasks = state.tasks.filter(t => t.projectId !== projectId);
      saveState(); closeModal(); navigate('today'); render();
      setUndo('Project deleted', () => { state.projects.splice(Math.min(projectIndex, state.projects.length), 0, removedProject); state.tasks.push(...removedTasks); saveState(); render(); });
    };
    if (associated.length) {
      openConfirm({ title: `Delete “${project.name}”?`, message: `This project contains ${associated.length} ${associated.length === 1 ? 'task' : 'tasks'}. All tasks in this project will also be deleted.`, confirmLabel: 'Delete project', onConfirm: execute });
    } else execute();
  }

  function toggleSubtask(taskId, subtaskId) {
    const task = getTask(taskId); const sub = task?.subtasks.find(s => s.id === subtaskId); if (!sub) return;
    sub.isCompleted = !sub.isCompleted; task.updatedAt = nowIso(); saveState(); renderModal(); render();
  }

  function deleteSubtask(taskId, subtaskId) {
    const task = getTask(taskId); if (!task) return;
    task.subtasks = task.subtasks.filter(s => s.id !== subtaskId); task.updatedAt = nowIso(); saveState(); renderModal(); render();
  }

  function editSubtask(taskId, subtaskId) {
    const task = getTask(taskId); const sub = task?.subtasks.find(s => s.id === subtaskId); if (!sub) return;
    const row = document.querySelector(`[data-parent-task-id="${CSS.escape(taskId)}"][data-subtask-id="${CSS.escape(subtaskId)}"]`);
    const title = row?.querySelector('.subtask-title'); if (!title) return;
    const input = document.createElement('input');
    input.className = 'input'; input.style.minHeight = '34px'; input.value = sub.title;
    title.replaceWith(input); input.focus(); input.select();
    const finish = save => {
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
    task.subtasks.push({ id: uid('sub'), title, isCompleted: false, order: orders.length ? Math.max(...orders) + 1 : 0 });
    task.updatedAt = nowIso(); saveState(); renderModal(); render();
    requestAnimationFrame(() => $('#detail-subtask')?.focus());
  }

  function flushTaskDraft() {
    if (modalState?.type !== 'task') return;
    const task = getTask(modalState.taskId); if (!task) return;
    const titleInput = $('#detail-title'); if (titleInput) modalState.titleDraft = titleInput.value;
    const notes = $('#detail-notes'); if (notes) modalState.notesDraft = notes.value;
    const title = String(modalState.titleDraft || '').trim();
    if (title) task.title = title;
    task.notes = modalState.notesDraft || '';
    task.updatedAt = nowIso();
    saveState();
  }

  async function exportBackupAction() {
    if (!Backup || !Attachments) { setToastMessage('Backup is unavailable in this browser'); return; }
    setToastMessage('Preparing backup...');
    try {
      const blob = await Backup.exportBackup(state, Attachments, nowIso());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `todo-backup-${Core.dateOnly()}.zip`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 1000);
      setToastMessage('Backup exported');
    } catch (error) { console.error(error); setToastMessage('Backup could not be created'); }
  }

  function chooseImportBackup() {
    const input = $('#backup-import-input'); if (input) input.click();
  }

  async function inspectImportBackup(file) {
    if (!file || !Backup) return;
    setToastMessage('Validating backup...');
    try {
      const validated = await Backup.inspectBackup(file);
      modalState = { type: 'import-backup', validated };
      renderModal();
    } catch (error) { console.error(error); setToastMessage('This backup is invalid or incomplete'); }
  }

  async function restoreImportedBackup() {
    if (modalState?.type !== 'import-backup') return;
    const validated = modalState.validated;
    try {
      await Backup.restoreBackup(validated, {
        attachmentApi: Attachments,
        readState: async () => state,
        writeState: async next => { state = normalizeState(next); if (!saveState()) throw new Error('Could not save restored state'); }
      });
      closeModal(); recovery = null; location.hash = '#today'; render(); setToastMessage('Backup restored');
    } catch (error) { console.error(error); setToastMessage('Backup restore failed. Existing data was kept.'); }
  }

  function clearCompleted() {
    const completed = state.tasks.filter(t => t.isCompleted);
    const count = completed.length;
    if (!count) { setToastMessage('No completed tasks to clear'); return; }
    openConfirm({ title: 'Delete all completed tasks?', message: `${count} completed ${count === 1 ? 'task' : 'tasks'} and their attachments will be permanently deleted. This cannot be undone.`, confirmLabel: 'Delete completed', onConfirm: async () => {
      const ids = completed.flatMap(t => t.attachmentIds || []);
      try { if (ids.length) await Attachments.deleteMany(ids); } catch (error) { console.error(error); setToastMessage('Completed attachments could not be cleared'); return; }
      state.tasks = state.tasks.filter(t => !t.isCompleted); saveState(); closeModal(); render();
    } });
  }

  function resetApp() {
    openConfirm({ title: 'Reset all app data?', message: 'All tasks, projects, tags, attachments and settings stored by this prototype will be deleted. This cannot be undone.', confirmLabel: 'Reset app', onConfirm: async () => {
      try { if (Attachments) await Attachments.clearAll(); } catch (error) { console.error(error); setToastMessage('Attachments could not be cleared'); return; }
      state = createEmptyState(); recovery = null; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); closeModal(); location.hash = '#today'; render();
    } });
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
    if (!state) return;
    const now = nowIso();
    const due = state.tasks.filter(task => Core.isReminderDue(task, now));
    if (!due.length) return;
    for (const task of due) {
      task.reminderFiredAt = now;
      task.updatedAt = now;
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(task.title, { body: task.dueDate ? `Due ${relativeDateLabel(task.dueDate)}` : 'Task reminder' }); } catch (_) { /* in-app reminder remains */ }
      }
    }
    saveState();
    if (due.length === 1) setToastMessage(`Reminder: ${due[0].title}`);
    else setToastMessage(`${due.length} task reminders are due`);
  }

  function setToastMessage(message) {
    const root = $('#toast-root');
    root.innerHTML = `<div class="toast"><i class="ph ph-info toast-icon" style="color:var(--info)"></i><span class="toast-message">${esc(message)}</span></div>`;
    setTimeout(() => { if (!undoState) root.innerHTML = ''; }, 3000);
  }

  function showTaskProjectPicker(taskId, anchor) { openProjectPicker(anchor, { type: 'task', taskId }); }
  function showTaskPlanPicker(taskId, anchor) { openPlanPicker(anchor, { type: 'task', taskId }); }
  function showTaskDuePicker(taskId, anchor) { openDuePicker(anchor, { type: 'task', taskId }); }
  function showTaskReminderPicker(taskId, anchor) { openReminderPicker(anchor, { type: 'task', taskId }); }
  function showTaskRepeatPicker(taskId, anchor) { openRepeatPicker(anchor, { type: 'task', taskId }); }

  function handleClick(event) {
    const routeEl = event.target.closest('[data-route]');
    if (routeEl) { event.preventDefault(); navigate(routeEl.dataset.route); return; }

    const pop = event.target.closest('[data-pop-action]');
    if (pop) { handlePopoverAction(pop); return; }

    const el = event.target.closest('[data-action]');
    if (!el) {
      if (popoverEl && !event.target.closest('.popover')) closePopover();
      return;
    }
    const action = el.dataset.action;
    if (action === 'toggle-sidebar') { state.ui.sidebarCollapsed = !state.ui.sidebarCollapsed; saveAndRender(); }
    else if (action === 'quick-add') openQuickAdd({ projectId: el.dataset.projectId || null, today: el.dataset.today === 'true', anytime: el.dataset.anytime === 'true' });
    else if (action === 'open-task') openTaskDetail(el.dataset.taskId);
    else if (action === 'toggle-complete') toggleComplete(el.dataset.taskId);
    else if (action === 'open-search') openSearch();
    else if (action === 'new-project') openProjectModal();
    else if (action === 'new-tag') openTagModal();
    else if (action === 'select-template-type') { activeTemplateType = el.dataset.templateType; render(); }
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
    else if (action === 'enable-notifications') enableBrowserNotifications();
    else if (action === 'export-backup') exportBackupAction();
    else if (action === 'import-backup') chooseImportBackup();
    else if (action === 'restore-backup') restoreImportedBackup();
    else if (action === 'clear-completed') clearCompleted();
    else if (action === 'reset-app') resetApp();
    else if (action === 'retry-load') { loadState(); render(); }
    else if (action === 'recovery-reset') { if(Attachments) Attachments.clearAll().catch(console.error); localStorage.removeItem(STORAGE_KEY); recovery = null; state = createEmptyState(); saveState(); location.hash = '#today'; render(); }
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
    else if (action === 'custom-repeat-apply') { const interval = Math.max(1, Number($('#repeat-interval', popoverEl)?.value) || 1); const frequency = $('#repeat-frequency', popoverEl)?.value || 'weekly'; setRecurrence(button.dataset.targetType, button.dataset.taskId, { frequency, interval }); }
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
      const project = { id: uid('project'), name, color: button.dataset.color || nextProjectColor(), order: nextProjectOrder(), isArchived: false, archivedAt: null, createdAt: nowIso(), updatedAt: nowIso() };
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
  }

  function handleInput(event) {
    if (modalState?.type === 'quick') {
      if (event.target.id === 'quick-title') { modalState.draft.title = event.target.value; modalState.error = ''; if (!modalState.draft.explicitPlan) { const parsed=Core.parseQuickPlanPhrase(event.target.value, Core.dateOnly()); modalState.draft.parsedPlanDate=parsed.plannedDate; const b=document.querySelector('[data-action="quick-plan-picker"]'); if(b) b.innerHTML=`<i class="ph ph-calendar-check"></i>${parsed.plannedDate ? esc(relativeDateLabel(parsed.plannedDate)) : 'Plan for'}`; } }
      else if (event.target.id === 'quick-notes') modalState.draft.notes = event.target.value;
    }
    if (modalState?.type === 'task') {
      const task = getTask(modalState.taskId);
      if (!task) return;
      if (event.target.id === 'detail-title') { modalState.titleDraft = event.target.value; modalState.error = ''; }
      else if (event.target.id === 'detail-notes') { modalState.notesDraft = event.target.value; task.notes = event.target.value; task.updatedAt = nowIso(); scheduleTextSave(); }
    }
    if (modalState?.type === 'search' && event.target.id === 'search-query') {
      modalState.query = event.target.value;
      const results = $('#search-results'); if (results) results.innerHTML = searchResultsHtml(modalState.query);
    }
    if (modalState?.type === 'project' && event.target.id === 'project-name') { modalState.draft.name = event.target.value; modalState.error = ''; }
    if (modalState?.type === 'tag' && event.target.id === 'tag-name') { modalState.draft.name = event.target.value; modalState.error = ''; }
  }

  function handleChange(event) {
    if (event.target.id === 'attachment-input') { addAttachments(event.target.dataset.taskId, event.target.files); event.target.value=''; return; }
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
    if (modalState?.type === 'task' && event.target.id === 'detail-title') {
      const task = getTask(modalState.taskId); if (!task) return;
      const title = String(event.target.value || '').trim();
      if (!title) { modalState.error = 'Task needs a title.'; modalState.titleDraft = task.title; renderModal(); return; }
      task.title = title; modalState.titleDraft = title; task.updatedAt = nowIso(); saveState(); render();
    }
  }

  function handleKeydown(event) {
    const target = event.target;
    const typing = target && (target.matches('input, textarea, select') || target.isContentEditable);

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

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && !typing) {
      event.preventDefault(); openSearch(); return;
    }

    if (!typing && !modalState && !popoverEl && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === '/') { event.preventDefault(); openSearch(); return; }
      if (key === 't') { event.preventDefault(); navigate('today'); return; }
      if (key === 'i') { event.preventDefault(); navigate('inbox'); return; }
      if (key === 'u') { event.preventDefault(); navigate('upcoming'); return; }
    }

    if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'n') {
      event.preventDefault(); openQuickAdd(); return;
    }

    if (modalState?.type === 'quick' && target?.id === 'quick-title' && event.key === 'Enter') {
      event.preventDefault(); createTask(event.shiftKey); return;
    }

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
    if (dropZone && event.dataTransfer?.files?.length) { event.preventDefault(); dropZone.classList.remove('is-dragover'); addAttachments(dropZone.dataset.taskId, event.dataTransfer.files); return; }
    if (!dragState) return;
    event.preventDefault();
    if (dragState.type === 'project') {
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
    const prev = { plannedDate: task.plannedDate, isInbox: task.isInbox, todayOrder: task.todayOrder, projectId: task.projectId, projectOrder: task.projectOrder };
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
      task.projectId = projectId; task.isInbox = false; task.projectOrder = nextOrder(`project:${projectId}`); message = 'Task moved to project';
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
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try { const parsed = JSON.parse(event.newValue); const migrated = Core.migrateStateV2(parsed); if (migrated.ok) { state = normalizeState(migrated.state); recovery = null; render(); } } catch (_) { /* keep current tab data */ }
    });
    window.addEventListener('pagehide', () => { flushTaskDraft(); flushTextSave(); saveState(); });
    window.addEventListener('resize', closePopover);
    window.addEventListener('focus', checkReminders);
  }

  function init() {
    loadState();
    attachEvents();
    if (!location.hash) location.hash = '#today';
    else render();
    checkReminders();
    if (Attachments) Attachments.cleanupExpired(nowIso()).catch(console.error);
    setInterval(() => {
      const next = Core.dateOnly();
      if (next !== lastToday) { lastToday = next; render(); }
      checkReminders();
    }, 30000);
  }

  window.TodoApp = { init, get state() { return state; }, render, openQuickAdd, openSearch };
  init();
})();
