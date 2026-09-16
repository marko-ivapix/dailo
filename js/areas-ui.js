(function () {
  'use strict';

  function areaSummaryCards(ctx, summary, areaId) {
    const { state } = ctx;
    return `<div class="area-summary" aria-label="Area summary"><div><strong>${summary.projects}</strong><span>Projects</span></div><div><strong>${summary.openTasks}</strong><span>Open tasks</span></div><div><strong>${summary.activeGoals}</strong><span>Active goals</span></div><div><strong>${summary.activeHabits}</strong><span>Active habits</span></div><div><strong>${state.notes.filter(item => item.areaId === areaId).length}</strong><span>Notes</span></div><div><strong>${state.resources.filter(item => item.areaId === areaId).length}</strong><span>Resources</span></div></div>`;
  }

  function areaIcon(ctx, area) {
    const { esc, AREA_ICONS, PROJECT_COLORS } = ctx;
    return `<i class="ph ${esc(area.icon || AREA_ICONS[0])}" style="color:${esc(area.color || PROJECT_COLORS[0])}"></i>`;
  }

  function renderAreas(ctx) {
    const { state, sortedAreas, Core, pageHeader, emptyState, esc } = ctx;
    const tab = state.ui.areaTab || 'all';
    const all = sortedAreas();
    const areas = all.filter(area => tab === 'all' || area.status === tab);
    const actions = '<button class="btn btn-primary" type="button" data-action="new-area"><i class="ph ph-plus"></i> New area</button>';
    let html = pageHeader('Areas', `${all.filter(area => area.status === 'active').length} active ${all.filter(area => area.status === 'active').length === 1 ? 'area' : 'areas'}`, { add: false, actionHtml: actions });
    html += `<div class="area-tabs" role="tablist"><button type="button" data-tab="all" class="${tab === 'all' ? 'is-active' : ''}">All</button><button type="button" data-tab="active" class="${tab === 'active' ? 'is-active' : ''}">Active</button><button type="button" data-tab="archived" class="${tab === 'archived' ? 'is-active' : ''}">Archived</button></div>`;
    if (!areas.length) return html + emptyState(tab === 'archived' ? 'No archived areas.' : 'No areas yet.', tab === 'archived' ? 'Archived areas can be restored here.' : 'Areas organize projects, standalone tasks, goals and habits.', tab === 'archived' ? '' : 'New area', tab === 'archived' ? '' : 'new-area');
    html += `<div class="area-list">${areas.map(area => {
      const summary = Core.areaSummary(area.id, state);
      const notes = state.notes.filter(item => item.areaId === area.id).length;
      const resources = state.resources.filter(item => item.areaId === area.id).length;
      return `<article class="area-row" data-area-id="${esc(area.id)}"><button class="area-open" type="button" data-route="area/${esc(area.id)}">${areaIcon(ctx, area)}<span><strong>${esc(area.name)}</strong><small>${summary.projects} projects · ${summary.openTasks} open tasks · ${summary.activeGoals} active goals · ${summary.activeHabits} active habits · ${notes} notes · ${resources} resources</small></span></button><div class="area-row-actions">${area.isPinned && area.status === 'active' ? '<i class="ph ph-push-pin" aria-label="Pinned"></i>' : ''}<button class="btn-icon" type="button" data-action="area-menu" data-area-id="${esc(area.id)}" aria-label="Area actions"><i class="ph ph-dots-three"></i></button></div></article>`;
    }).join('')}</div>`;
    return html;
  }

  function renderArea(ctx, areaId) {
    const { state, Core, getArea, pageHeader, esc, renderAreaTaskRow, renderAreaKnowledge } = ctx;
    const area = getArea(areaId);
    if (!area) return renderAreas(ctx);
    const summary = Core.areaSummary(areaId, state);
    const projects = (state.projects || []).filter(project => project.areaId === areaId);
    const tasks = (state.tasks || []).filter(task => !task.projectId && task.areaId === areaId);
    const goals = (state.goals || []).filter(goal => goal.areaId === areaId);
    const habits = (state.habits || []).filter(habit => habit.areaId === areaId);
    let html = pageHeader(area.name, area.status === 'archived' ? 'Archived area' : 'Organize the work that belongs together', { add: false, actionHtml: `<button class="btn-icon" type="button" data-action="area-menu" data-area-id="${esc(area.id)}" aria-label="Area actions"><i class="ph ph-dots-three"></i></button>` });
    html += `<div class="area-detail-label">${areaIcon(ctx, area)} <span>Area</span></div>${areaSummaryCards(ctx, summary, areaId)}`;
    html += `<section class="section area-detail-section"><div class="section-header"><h2 class="section-label">Projects</h2><span class="section-count">${projects.length}</span></div>${projects.length ? `<div class="area-object-list">${projects.map(project => `<button class="area-object" type="button" data-route="project/${esc(project.id)}"><span class="project-dot" style="--project-color:${esc(project.color)}"></span>${esc(project.name)}</button>`).join('')}</div>` : '<p class="area-empty-copy">No projects in this Area.</p>'}<button class="inline-add" type="button" data-action="area-new-project" data-area-id="${esc(area.id)}"><i class="ph ph-plus"></i> New project</button></section>`;
    html += `<section class="section area-detail-section"><div class="section-header"><h2 class="section-label">Standalone Tasks</h2><span class="section-count">${tasks.filter(task => !task.isCompleted).length}</span></div>${tasks.length ? `<div class="task-list">${tasks.map(task => renderAreaTaskRow(task, area.id)).join('')}</div>` : '<p class="area-empty-copy">No standalone tasks in this Area.</p>'}<button class="inline-add" type="button" data-action="area-new-task" data-area-id="${esc(area.id)}"><i class="ph ph-plus"></i> New task</button></section>`;
    html += `<section class="section area-detail-section"><div class="section-header"><h2 class="section-label">Goals</h2><span class="section-count">${goals.length}</span></div>${goals.length ? `<div class="area-object-list">${goals.map(goal => `<button class="area-object" type="button" data-route="goal/${esc(goal.id)}"><i class="ph ph-target"></i>${esc(goal.title || 'Untitled goal')}</button>`).join('')}</div>` : '<p class="area-empty-copy">No goals in this Area.</p>'}<button class="inline-add" type="button" data-action="area-new-goal" data-area-id="${esc(area.id)}"><i class="ph ph-plus"></i> New goal</button></section>`;
    html += `<section class="section area-detail-section"><div class="section-header"><h2 class="section-label">Habits</h2><span class="section-count">${habits.length}</span></div>${habits.length ? `<div class="area-object-list">${habits.map(habit => `<button class="area-object" type="button" data-route="habit/${esc(habit.id)}"><i class="ph ph-repeat"></i>${esc(habit.name || habit.title || 'Untitled habit')}</button>`).join('')}</div>` : '<p class="area-empty-copy">No habits in this Area.</p>'}<button class="inline-add" type="button" data-action="area-new-habit" data-area-id="${esc(area.id)}"><i class="ph ph-plus"></i> New habit</button></section>`;
    return html + renderAreaKnowledge(areaId);
  }

  function renderAreaModal(ctx) {
    const { modalState, modalFrame, PROJECT_COLORS, AREA_ICONS, esc } = ctx;
    const editing = Boolean(modalState.areaId), d = modalState.draft;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${editing ? 'Edit area' : 'New area'}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><label class="field-label" for="area-name">Name</label><input id="area-name" class="input ${modalState.error ? 'is-error' : ''}" type="text" maxlength="100" value="${esc(d.name)}" placeholder="Area name" />${modalState.error ? `<div class="validation">${esc(modalState.error)}</div>` : ''}<div style="height:18px"></div><span class="field-label">Color</span><div class="color-grid">${PROJECT_COLORS.map(color => `<button class="color-swatch ${color === d.color ? 'is-selected' : ''}" type="button" data-action="select-area-color" data-color="${color}" style="--swatch:${color}" aria-label="Select area color"></button>`).join('')}</div><div style="height:18px"></div><span class="field-label">Icon</span><div class="area-icon-grid">${AREA_ICONS.map(icon => `<button class="area-icon-choice ${icon === d.icon ? 'is-selected' : ''}" type="button" data-action="select-area-icon" data-icon="${icon}" aria-label="Select area icon"><i class="ph ${icon}"></i></button>`).join('')}</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-area">${editing ? 'Save changes' : 'Create area'}</button></div></div></div>`, 'quick');
  }

  function openAreaModal(ctx, areaId = null) {
    const { getArea, state, PROJECT_COLORS, AREA_ICONS, closePopover, captureModalReturnFocus, setModalState, renderModal, $ } = ctx;
    captureModalReturnFocus();
    closePopover();
    const area = areaId ? getArea(areaId) : null;
    setModalState({ type: 'area', areaId, draft: { name: area?.name || '', color: area?.color || PROJECT_COLORS[(state.areas || []).length % PROJECT_COLORS.length], icon: area?.icon || AREA_ICONS[0] }, error: '' });
    renderModal();
    requestAnimationFrame(() => $('#area-name')?.focus());
  }

  function saveAreaModal(ctx) {
    const { modalState, $, Core, state, getArea, nowIso, uid, saveState, closeModal, render, renderModal } = ctx;
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

  function openAreaMenu(ctx, anchor, areaId) {
    const { getArea, esc, openPopover } = ctx;
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

  function archiveArea(ctx, areaId) {
    const { getArea, nowIso, saveState, closePopover, currentRoute, navigate, render, setUndo } = ctx;
    const area = getArea(areaId); if (!area || area.status === 'archived') return;
    const previous = { status: area.status, isPinned: area.isPinned, updatedAt: area.updatedAt };
    area.status = 'archived'; area.isPinned = false; area.updatedAt = nowIso();
    saveState(); closePopover();
    if (currentRoute().type === 'area' && currentRoute().id === areaId) navigate('areas'); else render();
    setUndo('Area archived', () => { const current = getArea(areaId); if (!current) return; Object.assign(current, previous, { updatedAt: nowIso() }); saveState(); render(); });
  }

  function restoreArea(ctx, areaId) {
    const { getArea, nowIso, saveState, closePopover, render, setToastMessage } = ctx;
    const area = getArea(areaId); if (!area) return;
    area.status = 'active'; area.updatedAt = nowIso(); saveState(); closePopover(); render(); setToastMessage('Area restored');
  }

  function toggleAreaPin(ctx, areaId) {
    const { getArea, nowIso, saveState, closePopover, render } = ctx;
    const area = getArea(areaId); if (!area || area.status === 'archived') return;
    area.isPinned = !area.isPinned; area.updatedAt = nowIso(); saveState(); closePopover(); render();
  }

  function handleAction(action, event, ctx) {
    const element = event?.target.closest('[data-action], [data-pop-action], [data-tab]');
    if (!element) return false;
    const areaId = element.dataset.areaId;
    if (action === 'new-area') openAreaModal(ctx);
    else if (action === 'area-menu') openAreaMenu(ctx, element, areaId);
    else if (action === 'area-new-task') ctx.openQuickAdd({ areaId, anytime: true });
    else if (action === 'area-new-project') ctx.openProjectModal(null, { areaId });
    else if (action === 'area-new-goal') ctx.openGoalModal(null, { areaId });
    else if (action === 'area-new-habit') ctx.openHabitModal(null, { areaId });
    else if (action === 'select-area-color' && ctx.modalState?.type === 'area') { ctx.modalState.draft.color = element.dataset.color; ctx.renderModal(); }
    else if (action === 'select-area-icon' && ctx.modalState?.type === 'area') { ctx.modalState.draft.icon = element.dataset.icon; ctx.renderModal(); }
    else if (action === 'save-area' && ctx.modalState?.type === 'area') saveAreaModal(ctx);
    else if (action === 'area-tab') { ctx.state.ui.areaTab = element.dataset.tab; ctx.saveAndRender(); }
    else if (action === 'edit-area' && element.dataset.popAction) { ctx.closePopover(); openAreaModal(ctx, areaId); }
    else if (action === 'archive-area' && element.dataset.popAction) archiveArea(ctx, areaId);
    else if (action === 'restore-area' && element.dataset.popAction) restoreArea(ctx, areaId);
    else if ((action === 'pin-area' || action === 'unpin-area') && element.dataset.popAction) toggleAreaPin(ctx, areaId);
    else if (action === 'delete-area' && element.dataset.popAction) { ctx.closePopover(); ctx.requestDeleteEntity('area', areaId); }
    else return false;
    return true;
  }

  function handleInput(event, ctx) {
    if (ctx.modalState?.type !== 'area' || event.target.id !== 'area-name') return false;
    if (event.type === 'input') { ctx.modalState.draft.name = event.target.value; ctx.modalState.error = ''; return true; }
    if (event.type === 'keydown' && event.key === 'Enter') { event.preventDefault(); saveAreaModal(ctx); return true; }
    return false;
  }

  window.TodoDomainModules?.register({
    name: 'areas',
    renderRoute(route, ctx) {
      if (route.type === 'areas') return renderAreas(ctx);
      if (route.type === 'area') return renderArea(ctx, route.id);
      if (route.type === 'modal' && route.modalType === 'area') return renderAreaModal(ctx);
    },
    handleAction,
    handleInput
  });
})();
