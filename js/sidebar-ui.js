(function () {
  'use strict';
  const I18n = window.TodoI18n;
  const { tr } = I18n;

  // Redesign R47a (K1), a module since R56: on a wide screen the sidebar replaces the bottom bar and "Još" (CSS shows it
  // from 1024 px on): the brand and sync state, Pretraga, the main screens with Danas's count and the Inbox badge,
  // Zakačeno, Projekti by area, the groups of "Još" (they fold, remembered on this device) and, at the bottom,
  // Podešavanja and Nalog. app.js asks for the markup (renderRoute 'sidebar') and puts it in #desktop-sidebar.
  const MAIN_SCREENS = ['today', 'inbox', 'tasks', 'calendar', 'habits'];
  const FOLDABLE = ['planning', 'library', 'archives'];

  function sidebarHtml(ctx) {
    const { state, Core, esc } = ctx;
    const route = ctx.currentRoute();
    const active = (location.hash || '#today').replace(/^#/, '');
    const folds = readSidebarFolds();
    const collapsed = document.documentElement.dataset.sidebar === 'collapsed';
    const isActive = target => target === active || (MAIN_SCREENS.includes(target) && ctx.bottomNavRoute(route) === target);
    const sidebarItem = (target, icon, label, count = '', badge = false, color = '') => {
      const on = isActive(target);
      // R65: a project's folder sits on the project's color.
      const glyph = `<i class="ph ${esc(icon)}" aria-hidden="true"></i>`;
      const mark = color ? `<span class="sidebar-project-icon${lightColor(color) ? ' is-light' : ''}" style="--project-color:${esc(color)}">${glyph}</span>` : glyph;
      return `<button class="sidebar-item${on ? ' is-active' : ''}" type="button" data-route="${esc(target)}"${on ? ' aria-current="page"' : ''} title="${esc(label)}">${mark}<span class="sidebar-label">${esc(label)}</span>${count ? `<span class="sidebar-count${badge ? ' is-badge' : ''}">${esc(count)}</span>` : ''}</button>`;
    };
    // A folded group still shows the screen that is open.
    const sidebarGroup = (key, title, items, foldable = true) => {
      if (!items.length) return '';
      const open = !foldable || folds[key] !== true;
      const head = foldable ? `<button class="sidebar-group-title" type="button" data-action="sidebar-fold" data-group="${key}" aria-expanded="${open}"><span class="sidebar-label">${title}</span><i class="ph ph-caret-${open ? 'down' : 'right'}" aria-hidden="true"></i></button>` : `<h2 class="sidebar-group-title"><span class="sidebar-label">${title}</span></h2>`;
      return `<section class="sidebar-group${key === 'projects' ? ' is-projects' : ''}">${head}${(open ? items : items.filter(item => item.includes('is-active'))).join('')}</section>`;
    };
    const sections = Core.deriveTodaySections(ctx.listTasks(), Core.dateOnly());
    const todayCount = sections.overdue.length + sections.today.length || '';
    const inboxCount = ctx.activeInboxRecords('all').length || '';
    const sync = ctx.syncView();
    const syncLine = !sync.configured ? tr('Data is on this device only') : !sync.signedIn ? tr('Not signed in') : sync.running ? tr('Syncing…')
      : sync.lastSyncAt ? tr('Synced {time}', { time: new Date(sync.lastSyncAt).toLocaleTimeString(I18n.locale(), { hour: '2-digit', minute: '2-digit' }) }) : sync.email;
    const pinned = [
      ...ctx.sortedAreas().filter(area => area.status !== 'archived' && area.isPinned).map(area => sidebarItem(`area/${encodeURIComponent(area.id)}`, area.icon || 'ph-squares-four', area.name)),
      ...(state.savedViews || []).filter(view => view.isPinned).map(view => sidebarItem(`saved-view/${encodeURIComponent(view.id)}`, 'ph-funnel', view.name)),
      ...(state.notes || []).filter(note => note.favorite).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 4).map(note => sidebarItem(`note/${encodeURIComponent(note.id)}`, 'ph-note', note.title)),
    ];
    const projectItems = sidebarProjectGroups(ctx).flatMap(group => [`<p class="sidebar-subtitle">${esc(group.title)}</p>`, ...group.projects.map(project => sidebarItem(`project/${encodeURIComponent(project.id)}`, 'ph-folder', project.name, project.open || '', false, Core.safeColor(project.color, '#5362FF')))]);
    return `<div class="sidebar-top"><span class="sidebar-brand"><img src="icons/icon.svg" alt="" width="28" height="28" /><span class="sidebar-label">Dailo</span></span><button class="btn-icon sidebar-collapse" type="button" data-action="toggle-sidebar" aria-label="${collapsed ? tr('Unfold the sidebar') : tr('Fold the sidebar')}" aria-expanded="${!collapsed}"><i class="ph ph-sidebar-simple" aria-hidden="true"></i></button></div>`
      + `<p class="sidebar-sync">${esc(syncLine)}</p>`
      + `<button class="sidebar-item" type="button" data-action="open-search" title="${tr('Search')}"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><span class="sidebar-label">${tr('Search')}</span><kbd class="sidebar-key">/</kbd></button>`
      + `<nav class="sidebar-nav" aria-label="${tr('Main screens')}">${sidebarItem('today', 'ph-sun', tr('Today'), todayCount)}<div class="sidebar-drop" data-sidebar-drop="tomorrow"><i class="ph ph-arrow-bend-down-right" aria-hidden="true"></i><span class="sidebar-label">${tr('Drag here for tomorrow')}</span></div>${sidebarItem('inbox', 'ph-tray', tr('Inbox'), inboxCount, true)}${sidebarItem('tasks', 'ph-list-checks', tr('Tasks'))}${sidebarItem('calendar', 'ph-calendar-blank', tr('Calendar'))}${sidebarItem('habits', 'ph-repeat', tr('Habits'))}</nav>`
      + sidebarGroup('pinned', tr('Pinned'), pinned, false)
      + sidebarGroup('projects', tr('Projects'), projectItems, false)
      + sidebarGroup('planning', tr('Planning'), [sidebarItem('goals', 'ph-target', tr('Goals')), sidebarItem('areas', 'ph-squares-four', tr('Areas')), sidebarItem('cleaning', 'ph-arrows-clockwise', tr('Recurring tasks')), sidebarItem('review', 'ph-clipboard-text', tr('Weekly review'))])
      + sidebarGroup('library', tr('Library'), [sidebarItem('notes', 'ph-note', tr('Notes')), sidebarItem('journal', 'ph-book-open', tr('Journal')), sidebarItem('resources', 'ph-link', tr('Resources')), sidebarItem('tags', 'ph-tag', tr('Tags')), sidebarItem('templates', 'ph-copy', tr('Templates')), sidebarItem('saved-views', 'ph-funnel', tr('Saved Views'))])
      + sidebarGroup('archives', tr('Archives'), [sidebarItem('completed', 'ph-check-circle', tr('Completed tasks')), sidebarItem('archived', 'ph-archive', tr('Archived Projects'))])
      + `<div class="sidebar-bottom">${sidebarItem('settings', 'ph-gear', tr('Settings'))}${sidebarItem('account', 'ph-user-circle', tr('Account'))}</div>`;
  }

  // The sidebar's projects, grouped by area in the areas' order and then those without one, with open counts.
  function sidebarProjectGroups(ctx) {
    const projects = ctx.sortedProjects().filter(project => !project.isCleaningRoom);
    const entry = project => ({ id: project.id, name: project.name, color: project.color, open: ctx.projectTasks(project.id).filter(task => !task.isCompleted).length });
    const areas = ctx.sortedAreas();
    const groups = areas.map(area => ({ title: area.name, projects: projects.filter(project => project.areaId === area.id).map(entry) })).filter(group => group.projects.length);
    const known = new Set(areas.map(area => area.id));
    const loose = projects.filter(project => !project.areaId || !known.has(project.areaId)).map(entry);
    return loose.length ? [...groups, { title: tr('Without area'), projects: loose }] : groups;
  }

  // R65: on a light color a dark folder reads better than a white one (relative luminance above 0.19, where the
  // contrast with dark ink passes the contrast with white).
  function lightColor(color) {
    const hex = color.length === 4 ? color.replace(/[0-9a-f]/gi, digit => digit + digit) : color;
    const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.19;
  }

  function readSidebarFolds() {
    try {
      const value = JSON.parse(localStorage.getItem('dailoSidebarFolds') || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }

  function toggleSidebarFold(ctx, group) {
    if (!FOLDABLE.includes(group)) return;
    const folds = readSidebarFolds();
    folds[group] = !folds[group];
    try { localStorage.setItem('dailoSidebarFolds', JSON.stringify(folds)); } catch (_) { /* this session only */ }
    ctx.renderSidebar();
  }

  // The sidebar folds to a strip of icons (the button at its top, or "["); the choice is remembered on this device.
  function toggleSidebar(ctx) {
    const collapsed = document.documentElement.dataset.sidebar !== 'collapsed';
    if (collapsed) document.documentElement.dataset.sidebar = 'collapsed';
    else delete document.documentElement.dataset.sidebar;
    try { localStorage.setItem('dailoSidebar', collapsed ? 'collapsed' : 'open'); } catch (_) { /* this session only */ }
    ctx.renderSidebar();
  }

  window.TodoDomainModules?.register({
    name: 'sidebar',
    renderRoute(route, ctx) {
      if (route.type === 'sidebar') return sidebarHtml(ctx);
      return undefined;
    },
    handleAction(action, event, ctx) {
      if (action === 'toggle-sidebar') { toggleSidebar(ctx); return true; }
      if (action === 'sidebar-fold') { toggleSidebarFold(ctx, event?.target?.closest?.('[data-group]')?.dataset.group); return true; }
      return false;
    },
  });
})();
