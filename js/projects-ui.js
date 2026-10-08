(function () {
  'use strict';
  const I18n = window.TodoI18n;
  const { tr, trn, msg } = I18n;

  function renderProjects(ctx) {
    const { pageHeader, sortedProjects, esc } = ctx;
    return pageHeader(tr('Projects'), tr('Active projects'), { add: false, actionHtml: `<button class="btn btn-primary" data-action="new-project">${tr('New project')}</button>` }) + sortedProjects().map(project => `<button class="sidebar-action" data-route="project/${esc(project.id)}"><i class="ph ph-folder"></i><span>${esc(project.name)}</span></button>`).join('');
  }

  function renderProject(ctx, projectId) {
    const { state, getProject, projectTasks, pageHeader, emptyState, esc, renderProjectTaskRow } = ctx;
    const project = getProject(projectId);
    if (!project) return '';
    const openTasks = projectTasks(projectId, false);
    const completed = projectTasks(projectId, true);
    const expanded = Boolean(state.ui.projectCompletedExpanded[projectId]);
    let html = pageHeader(project.name, trn(openTasks.length, '{count} open task', '{count} open tasks'), { contextProjectId: projectId, projectMenu: projectId });
    html += `<div style="display:flex;align-items:center;gap:8px;margin-top:-20px;margin-bottom:26px;color:var(--text-muted);font-size:12px"><span class="project-dot" style="--project-color:${esc(project.color)}"></span> ${tr('Project')}</div>`;
    if (openTasks.length) html += `<div class="task-list" data-list-context="project:${esc(projectId)}">${openTasks.map(task => renderProjectTaskRow(task, projectId, { draggable: true })).join('')}</div>`;
    else html += emptyState(tr('No open tasks.'), tr('Add a task to keep this project moving.'), tr('Add task'), 'quick-add', { projectId });
    html += `<button class="inline-add" type="button" data-action="quick-add" data-project-id="${esc(projectId)}"><i class="ph ph-plus"></i> ${tr('Add task')}</button>`;
    if (completed.length) {
      html += `<section class="section"><button class="collapsible-trigger" type="button" data-action="toggle-project-completed" data-project-id="${esc(projectId)}" aria-expanded="${expanded}"><span class="left"><i class="ph ph-check-circle"></i> ${tr('Completed')}</span><span>${completed.length} <i class="ph ph-caret-${expanded ? 'up' : 'down'}"></i></span></button>`;
      if (expanded) html += `<div class="task-list">${completed.map(task => renderProjectTaskRow(task, projectId, { completed: true })).join('')}</div>`;
      html += '</section>';
    }
    return html;
  }

  function renderArchivedProjects(ctx) {
    const { allProjects, projectTasks, pageHeader, emptyState, esc } = ctx;
    const projects = allProjects().filter(project => project.isArchived);
    let html = pageHeader(tr('Archived Projects'), trn(projects.length, '{count} archived project', '{count} archived projects'), { add: false });
    if (!projects.length) return html + emptyState(tr('No archived projects.'), tr('Archived projects stay available here until you restore them.'));
    html += `<div class="archived-project-list">${projects.map(project => {
      const openCount = projectTasks(project.id, false).length;
      return `<div class="archived-project-row"><div class="archived-project-main"><span class="project-dot" style="--project-color:${esc(project.color)}"></span><span><strong>${esc(project.name)}</strong><small>${trn(openCount, '{count} open task', '{count} open tasks')}</small></span></div><div class="archived-project-actions"><button class="btn btn-ghost" type="button" data-route="project/${esc(project.id)}">${tr('View')}</button><button class="btn btn-secondary" type="button" data-action="restore-project" data-project-id="${esc(project.id)}">${tr('Restore')}</button></div></div>`;
    }).join('')}</div>`;
    return html;
  }

  function renderProjectModal(ctx) {
    const { modalState, modalFrame, PROJECT_COLORS, esc } = ctx;
    const editing = Boolean(modalState.projectId);
    const draft = modalState.draft;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${editing ? tr('Edit project') : tr('New project')}</h2><button class="btn-icon" type="button" data-action="close-modal"><i class="ph ph-x"></i></button></div><label class="field-label" for="project-name">${tr('Name')}</label><input id="project-name" class="input ${modalState.error ? 'is-error' : ''}" type="text" maxlength="100" value="${esc(draft.name)}" placeholder="${tr('Project name')}" />${modalState.error ? `<div class="validation">${esc(modalState.error)}</div>` : ''}<div style="height:18px"></div><span class="field-label">${tr('Color')}</span><div class="color-grid">${PROJECT_COLORS.map(color => `<button class="color-swatch ${color === draft.color ? 'is-selected' : ''}" type="button" data-action="select-project-color" data-color="${color}" style="--swatch:${color}" aria-label="${tr('Select project color')}"></button>`).join('')}</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Cancel')}</button><button class="btn btn-primary" type="button" data-action="save-project">${editing ? tr('Save changes') : tr('Create project')}</button></div></div></div>`, 'quick');
  }

  function openProjectMenu(ctx, anchor, projectId) {
    const { getProject, esc, openPopover, templateMenuEntry } = ctx;
    const project = getProject(projectId);
    if (!project) return;
    const archiveAction = project.isArchived
      ? `<button class="popover-option" type="button" data-pop-action="restore-project" data-project-id="${esc(projectId)}"><i class="ph ph-arrow-counter-clockwise"></i>${tr('Restore project')}</button>`
      : `<button class="popover-option" type="button" data-pop-action="archive-project" data-project-id="${esc(projectId)}"><i class="ph ph-archive"></i>${tr('Archive project')}</button>`;
    const html = `<button class="popover-option" type="button" data-pop-action="edit-project" data-project-id="${esc(projectId)}"><i class="ph ph-pencil-simple"></i>${tr('Rename / color')}</button>${archiveAction}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="delete-project" data-project-id="${esc(projectId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>${tr('Delete project')}</button>`;
    openPopover(anchor, templateMenuEntry('project', projectId) + html, { type: 'project-menu', projectId });
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
