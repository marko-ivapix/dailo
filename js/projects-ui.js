(function () {
  'use strict';
  const I18n = window.TodoI18n;
  const { tr, trn, msg } = I18n;

  function renderProjects(ctx) {
    const { pageHeader, sortedProjects, esc } = ctx;
    return pageHeader(tr('Projects'), tr('Active projects'), { add: false, actionHtml: `<button class="btn btn-primary" data-action="new-project">${tr('New project')}</button>` }) + sortedProjects().map(project => `<button class="sidebar-action" data-route="project/${esc(project.id)}"><i class="ph ph-folder"></i><span>${esc(project.name)}</span></button>`).join('');
  }

  // Redesign R5 (Z7, S10): "‹ Zadaci" and ⋯, the name with its color, area · counts, the linked goal, the open tasks
  // in Today rows, "+ Dodaj zadatak" and the done tasks folded. An archived project is read-only until restored.
  function renderProject(ctx, projectId) {
    const { state, getProject, getArea, projectTasks, esc, renderProjectTaskRow } = ctx;
    if (projectId === 'none') return renderLooseTasks(ctx);
    const project = getProject(projectId);
    if (!project) return '';
    const archived = Boolean(project.isArchived);
    const area = getArea(project.areaId);
    const openTasks = projectTasks(projectId, false);
    const completed = projectTasks(projectId, true);
    const goal = (state.goals || []).find(item => item.status !== 'archived' && (item.projectLinks || []).some(link => link.projectId === projectId));
    const summary = [area?.name, trn(openTasks.length, '{count} open', '{count} open'), completed.length ? trn(completed.length, '{count} done', '{count} done') : ''].filter(Boolean).join(' · ');
    // R17: "‹ Zadaci" above the usual header (color dot, name, summary, search and the project's ⋯).
    let html = backLink() + ctx.pageHeader(project.name, summary, { add: false, projectMenu: projectId, color: project.color });
    if (archived) html += `<section class="weekly-review-notice project-archived-notice" role="status"><i class="ph ph-archive weekly-review-notice-icon" aria-hidden="true"></i><div class="backup-reminder-copy"><strong>${tr('Archived project')}</strong><span>${tr('Its tasks stay out of every list until you restore it.')}</span></div><div class="backup-reminder-actions"><button class="btn btn-secondary" type="button" data-action="restore-project" data-project-id="${esc(projectId)}">${tr('Restore')}</button></div></section>`;
    if (goal) html += `<button class="project-goal-link" type="button" data-route="goal/${esc(goal.id)}"><i class="ph ph-target" aria-hidden="true"></i>${esc(tr('Goal: {goal}', { goal: goal.title }))} · ${ctx.goalPercent(goal)}%</button>`;
    if (openTasks.length) html += `<div class="task-list today-card" data-list-context="project:${esc(projectId)}">${openTasks.map(task => renderProjectTaskRow(task, projectId, { draggable: !archived, today: true, hidePlace: true })).join('')}</div>`;
    else if (!archived) html += `<p class="today-empty">${tr('No open tasks.')}</p>`;
    if (!archived) html += `<button class="inline-add" type="button" data-action="quick-add" data-project-id="${esc(projectId)}"><i class="ph ph-plus"></i> ${tr('Add task')}</button>`;
    html += completedSection(ctx, projectId, completed, task => renderProjectTaskRow(task, projectId, { completed: true, today: true, hidePlace: true }));
    return html;
  }

  const backLink = () => `<div class="screen-topbar"><button class="screen-back" type="button" data-route="tasks"><i class="ph ph-caret-left" aria-hidden="true"></i>${tr('Tasks')}</button></div>`;

  function completedSection(ctx, key, completed, row) {
    if (!completed.length) return '';
    const expanded = Boolean(ctx.state.ui.projectCompletedExpanded?.[key]);
    return `<section class="section"><button class="collapsible-trigger" type="button" data-action="toggle-project-completed" data-project-id="${ctx.esc(key)}" aria-expanded="${expanded}"><span class="left"><i class="ph ph-check-circle"></i> ${tr('Completed')}</span><span>${completed.length} <i class="ph ph-caret-${expanded ? 'up' : 'down'}"></i></span></button>${expanded ? `<div class="task-list today-card">${completed.map(row).join('')}</div>` : ''}</section>`;
  }

  // Redesign R5 (Z6): sorted tasks that belong to no project ("Bez projekta").
  function renderLooseTasks(ctx) {
    const { esc, taskRow } = ctx;
    const open = ctx.looseTasks(false);
    const completed = ctx.looseTasks(true);
    let html = backLink() + ctx.pageHeader(tr('No project'), trn(open.length, '{count} open', '{count} open'), { add: false });
    html += open.length ? `<div class="task-list today-card">${open.map(task => taskRow(task, 'anytime', { today: true })).join('')}</div>` : `<p class="today-empty">${tr('No sorted tasks without a project.')}</p>`;
    html += `<button class="inline-add" type="button" data-action="quick-add" data-anytime="true"><i class="ph ph-plus"></i> ${tr('Add task')}</button>`;
    html += completedSection(ctx, 'none', completed, task => taskRow(task, 'completed', { today: true }));
    return html + `<p class="tasks-note">${tr('Sorted tasks that belong to no project.')}</p>`;
  }

  // Redesign R10e (S10): one card; a row opens the read-only project and "Vrati" restores it (with Undo).
  function renderArchivedProjects(ctx) {
    const { allProjects, projectTasks, pageHeader, emptyState, esc, getArea } = ctx;
    // R11d (S4): archived groups fold on Redovne obaveze instead.
    const projects = allProjects().filter(project => project.isArchived && !project.isCleaningRoom);
    const html = pageHeader(tr('Archived Projects'), trn(projects.length, '{count} archived project', '{count} archived projects'), { add: false });
    if (!projects.length) return html + emptyState(tr('No archived projects.'), tr('Archived projects stay here until you restore them.'));
    return `${html}<div class="today-card archived-list">${projects.map(project => {
      const meta = [getArea(project.areaId)?.name, trn(projectTasks(project.id, false).length, '{count} open', '{count} open')].filter(Boolean).join(' · ');
      return `<div class="today-row archived-project-item"><span class="project-dot" style="--project-color:${esc(project.color)}" aria-hidden="true"></span><button class="today-row-main" type="button" data-route="project/${esc(project.id)}"><span class="task-title">${esc(project.name)}</span><span class="task-meta">${esc(meta)}</span></button><button class="quick-chip" type="button" data-action="restore-project" data-project-id="${esc(project.id)}">${tr('Restore')}</button></div>`;
    }).join('')}</div>`;
  }

  // R17: a sheet like "Nova oblast" — the big name field, the colors and one big button.
  function renderProjectModal(ctx) {
    const { modalState, modalFrame, PROJECT_COLORS, esc } = ctx;
    const editing = Boolean(modalState.projectId);
    const draft = modalState.draft;
    return modalFrame(`<div class="modal-inner quick-sheet project-window"><div class="modal-header"><h2 class="modal-title">${editing ? tr('Edit project') : tr('New project')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close dialog')}"><i class="ph ph-x"></i></button></div><input id="project-name" class="quick-title-input${modalState.error ? ' is-error' : ''}" type="text" maxlength="100" autocomplete="off" placeholder="${tr('Project name')}" value="${esc(draft.name)}" aria-label="${tr('Project name')}">${modalState.error ? `<div class="validation" role="alert">${esc(modalState.error)}</div>` : ''}<span class="habit-window-label">${tr('Color')}</span><div class="color-grid">${PROJECT_COLORS.map(color => `<button class="color-swatch ${color === draft.color ? 'is-selected' : ''}" type="button" data-action="select-project-color" data-color="${color}" style="--swatch:${color}" aria-label="${tr('Select project color')}" aria-pressed="${color === draft.color}"></button>`).join('')}</div><div class="quick-sheet-footer"><span></span><button class="btn btn-primary habit-window-save" type="button" data-action="save-project">${editing ? tr('Save changes') : tr('Create project')}</button></div></div>`, 'quick');
  }

  function openProjectMenu(ctx, anchor, projectId) {
    const { getProject, esc, openPopover, templateMenuEntry } = ctx;
    const project = getProject(projectId);
    if (!project) return;
    const archiveAction = project.isArchived
      ? `<button class="popover-option" type="button" data-pop-action="restore-project" data-project-id="${esc(projectId)}"><i class="ph ph-arrow-counter-clockwise"></i>${tr('Restore project')}</button>`
      : `<button class="popover-option" type="button" data-pop-action="archive-project" data-project-id="${esc(projectId)}"><i class="ph ph-archive"></i>${tr('Archive project')}</button>`;
    // Redesign R5 (Z7): Preimenuj i boja, Oblast, Povezani ciljevi, Sačuvaj kao šablon, Arhiviraj / Vrati, Obriši.
    const html = `<div class="popover-title">${esc(project.name)}</div><button class="popover-option" type="button" data-pop-action="edit-project" data-project-id="${esc(projectId)}"><i class="ph ph-pencil-simple"></i>${tr('Rename / color')}</button><button class="popover-option" type="button" data-pop-action="project-area" data-project-id="${esc(projectId)}"><i class="ph ph-squares-four"></i>${tr('Area')}</button><button class="popover-option" type="button" data-pop-action="project-goals" data-project-id="${esc(projectId)}"><i class="ph ph-target"></i>${tr('Linked goals')}</button>${templateMenuEntry('project', projectId)}${archiveAction}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="delete-project" data-project-id="${esc(projectId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>${tr('Delete project')}</button>`;
    openPopover(anchor, html, { type: 'project-menu', projectId });
  }

  function handleAction(action, event, ctx) {
    const element = event?.target.closest('[data-action], [data-pop-action]');
    if (!element) return false;
    const projectId = element.dataset.projectId;
    if (action === 'new-project') ctx.openProjectModal();
    else if (action === 'project-menu') openProjectMenu(ctx, element, projectId);
    else if (action === 'toggle-project-completed') ctx.toggleProjectCompleted(projectId);
    else if (action === 'select-project-color' && ctx.modalState?.type === 'project') { ctx.modalState.draft.color = element.dataset.color; ctx.renderModal(); }
    else if (action === 'save-project' && ctx.modalState?.type === 'project') ctx.saveProjectModal();
    else if (action === 'restore-project') {
      if (element.dataset.popAction) ctx.closePopover();
      ctx.restoreProject(projectId);
    } else if (action === 'edit-project' && element.dataset.popAction) { ctx.closePopover(); ctx.openProjectModal(projectId); }
    else if (action === 'archive-project' && element.dataset.popAction) ctx.archiveProject(projectId);
    else if (action === 'delete-project' && element.dataset.popAction) { ctx.closePopover(); ctx.deleteProject(projectId); }
    else return false;
    return true;
  }

  function handleInput(event, ctx) {
    if (ctx.modalState?.type !== 'project' || event.target.id !== 'project-name') return false;
    if (event.type === 'keydown' && event.key === 'Enter') { event.preventDefault(); ctx.saveProjectModal(); return true; }
    if (event.type === 'input') { ctx.modalState.draft.name = event.target.value; ctx.modalState.error = ''; return true; }
    return false;
  }

  window.TodoDomainModules?.register({
    name: 'projects',
    renderRoute(route, ctx) {
      if (route.type === 'projects') return renderProjects(ctx);
      if (route.type === 'project') return renderProject(ctx, route.id);
      if (route.type === 'archived') return renderArchivedProjects(ctx);
      if (route.type === 'modal' && route.modalType === 'project') return renderProjectModal(ctx);
    },
    handleAction,
    handleInput
  });
})();
