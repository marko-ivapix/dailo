(function () {
  'use strict';
  const { tr, trn } = window.TodoI18n;

  // Redesign R10a (S1, S2): the counts an area shows; "otvorenih" are the open, sorted tasks it lists.
  function areaContents(ctx, areaId) {
    const { state, Core, listTasks } = ctx;
    const projects = (state.projects || []).filter(project => project.areaId === areaId && !project.isArchived);
    const tasks = listTasks().filter(task => !task.isCompleted && !task.isInbox && Core.effectiveTaskArea(task, state.projects || []) === areaId);
    const goals = (state.goals || []).filter(goal => goal.areaId === areaId && goal.status === 'active');
    const habits = (state.habits || []).filter(habit => habit.areaId === areaId && habit.status === 'active');
    const library = [...(state.notes || []).map(item => ['note', item]), ...(state.resources || []).map(item => ['resource', item])]
      .filter(([, item]) => item.areaId === areaId)
      .sort((a, b) => String(b[1].updatedAt || b[1].createdAt || '').localeCompare(String(a[1].updatedAt || a[1].createdAt || '')));
    return { projects, tasks, goals, habits, library };
  }
  function areaSummaryLine(contents) {
    return [
      contents.projects.length ? trn(contents.projects.length, '{count} project', '{count} projects') : '',
      trn(contents.tasks.length, '{count} open', '{count} open'),
      contents.goals.length ? trn(contents.goals.length, '{count} goal', '{count} goals') : '',
    ].filter(Boolean).join(' · ');
  }

  function areaIcon(ctx, area, cls = '') {
    const { esc, AREA_ICONS, PROJECT_COLORS } = ctx;
    return `<i class="ph ${esc(area.icon || AREA_ICONS[0])}${cls ? ` ${cls}` : ''}" style="color:${esc(area.color || PROJECT_COLORS[0])}" aria-hidden="true"></i>`;
  }

  function renderAreas(ctx) {
    const { state, sortedAreas, pageHeader, emptyState, esc } = ctx;
    const all = sortedAreas();
    const active = all.filter(area => area.status !== 'archived');
    const archived = all.filter(area => area.status === 'archived');
    const html = pageHeader(tr('Areas'), trn(active.length, '{count} active area', '{count} active areas'), { add: false });
    if (!all.length) return html + emptyState(tr('No areas yet.'), tr('Areas organize projects, standalone tasks, goals and habits.'), tr('New area'), 'new-area');
    const rows = active.map(area => {
      const meta = [areaSummaryLine(areaContents(ctx, area.id)), area.isPinned ? tr('pinned') : ''].filter(Boolean).join(' · ');
      return `<button class="area-list-row" type="button" data-route="area/${esc(area.id)}">${areaIcon(ctx, area, 'area-list-icon')}<span class="area-list-main"><span class="task-title">${esc(area.name)}</span><span class="task-meta">${esc(meta)}</span></span><i class="ph ph-caret-right" aria-hidden="true"></i></button>`;
    }).join('');
    const open = state.ui.areasArchivedOpen === true;
    const fold = archived.length ? `<section class="areas-fold"><button class="collapsible-trigger" type="button" data-action="areas-fold" aria-expanded="${open}"><span class="left"><i class="ph ph-caret-${open ? 'up' : 'down'}" aria-hidden="true"></i> ${tr('Archived areas')} · ${archived.length}</span></button>${open ? `<div class="today-card">${archived.map(area => `<div class="today-row goals-fold-row"><button class="today-row-main" type="button" data-route="area/${esc(area.id)}"><span class="task-title">${esc(area.name)}</span></button><button class="quick-chip" type="button" data-action="restore-area" data-area-id="${esc(area.id)}">${tr('Restore')}</button></div>`).join('')}</div>` : ''}</section>` : '';
    return `${html}<div class="today-card areas-list">${rows}<button class="inline-add" type="button" data-action="new-area"><i class="ph ph-plus" aria-hidden="true"></i> ${tr('New area')}</button></div>${fold}`;
  }

  let tasksOpenFor = null;
  function renderArea(ctx, areaId) {
    const { getArea, pageHeader, esc, renderAreaTaskRow, projectOverviewRow, renderGoalListRow, renderHabitListRow } = ctx;
    const area = getArea(areaId);
    if (!area) return renderAreas(ctx);
    const contents = areaContents(ctx, areaId);
    const { projects, tasks, goals, habits, library } = contents;
    const id = esc(area.id);
    const summary = [area.status === 'archived' ? tr('Archived area') : '', areaSummaryLine(contents), trn(library.length, '{count} in the library', '{count} in the library')].filter(Boolean).join(' · ');
    let html = pageHeader(area.name, summary, { add: false, actionHtml: `<button class="btn-icon" type="button" data-action="area-menu" data-area-id="${id}" aria-label="${tr('Area actions')}"><i class="ph ph-dots-three"></i></button>` });
    if (!projects.length && !tasks.length && !goals.length && !habits.length && !library.length) html += `<p class="area-empty-hint">${tr('This area is empty. Add a project, task, goal, habit or note with “+”.')}</p>`;
    const section = (label, count, action, body, extra = '') => `<section class="section area-section"><div class="section-header"><h2 class="section-label">${label} · ${count}</h2><button class="btn-icon area-section-add" type="button" data-action="${action}" data-area-id="${id}"${extra} aria-label="${esc(tr('Add: {name}', { name: label }))}"><i class="ph ph-plus" aria-hidden="true"></i></button></div>${count ? body : ''}</section>`;
    const all = tasksOpenFor === area.id;
    const shown = all ? tasks : tasks.slice(0, 5);
    const more = tasks.length > 5 ? `<button class="today-more" type="button" data-action="area-all-tasks" data-area-id="${id}" aria-expanded="${all}">${all ? tr('Show less') : tr('Show {count} more', { count: tasks.length - 5 })}</button>` : '';
    const libraryRow = ([type, item]) => `<div class="today-row area-library-row"><button class="today-row-main" type="button" data-route="${type}/${esc(item.id)}"><span class="task-title"><i class="ph ${type === 'note' ? 'ph-note' : 'ph-link'}" aria-hidden="true"></i> ${esc(item.title)}</span><span class="task-meta">${type === 'note' ? tr('Note') : tr('Resource')}</span></button></div>`;
    html += section(tr('Projects'), projects.length, 'area-new-project', `<div class="more-card">${projects.map(project => projectOverviewRow(project)).join('')}</div>`);
    html += section(tr('Tasks'), tasks.length, 'area-new-task', `<div class="task-list today-card">${shown.map(task => renderAreaTaskRow(task, area.id)).join('')}${more}</div>`);
    html += section(tr('Goals'), goals.length, 'area-new-goal', `<div class="today-card goals-list">${goals.map(goal => renderGoalListRow(goal)).join('')}</div>`);
    html += section(tr('Habits'), habits.length, 'area-new-habit', `<div class="today-card">${habits.map(habit => renderHabitListRow(habit)).join('')}</div>`);
    html += section(tr('Notes and resources'), library.length, 'new-knowledge', `<div class="today-card">${library.map(libraryRow).join('')}</div>`, ' data-owner-type="note"');
    return html;
  }

  function renderAreaModal(ctx) {
    const { modalState, modalFrame, PROJECT_COLORS, AREA_ICONS, esc } = ctx;
    const editing = Boolean(modalState.areaId), d = modalState.draft;
    return modalFrame(`<div class="modal-inner quick-sheet area-window"><div class="modal-header"><h2 class="modal-title">${editing ? tr('Edit area') : tr('New area')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><input id="area-name" class="quick-title-input${modalState.error ? ' is-error' : ''}" type="text" maxlength="100" autocomplete="off" placeholder="${tr('Area name')}" value="${esc(d.name)}" aria-label="${tr('Area name')}">${modalState.error ? `<div class="validation" role="alert">${esc(modalState.error)}</div>` : ''}<span class="habit-window-label">${tr('Color')}</span><div class="color-grid">${PROJECT_COLORS.map(color => `<button class="color-swatch ${color === d.color ? 'is-selected' : ''}" type="button" data-action="select-area-color" data-color="${color}" style="--swatch:${color}" aria-label="${tr('Select area color')}" aria-pressed="${color === d.color}"></button>`).join('')}</div><span class="habit-window-label">${tr('Icon')}</span><div class="area-icon-grid">${AREA_ICONS.map(icon => `<button class="area-icon-choice ${icon === d.icon ? 'is-selected' : ''}" type="button" data-action="select-area-icon" data-icon="${icon}" aria-label="${tr('Select area icon')}" aria-pressed="${icon === d.icon}"><i class="ph ${icon}"></i></button>`).join('')}</div><div class="quick-sheet-footer"><span></span><button class="btn btn-primary habit-window-save" type="button" data-action="save-area">${editing ? tr('Save changes') : tr('Create area')}</button></div></div>`, 'quick');
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
      modalState.error = valid.reason === 'duplicate-area' ? tr('An area with this name already exists.') : tr('Area needs a name.');
      renderModal(); requestAnimationFrame(() => $('#area-name')?.focus()); return;
    }
    if (modalState.areaId) {
      const area = getArea(modalState.areaId); if (!area) return;
      area.name = name; area.color = modalState.draft.color; area.icon = modalState.draft.icon; area.updatedAt = nowIso();
    } else {
      state.areas.push({ id: uid('area'), name, color: modalState.draft.color, icon: modalState.draft.icon, status: 'active', isPinned: false, createdAt: nowIso(), updatedAt: nowIso() });
    }
    const created = !modalState.areaId;
    saveState(); closeModal(); render();
    if (created) ctx.setToastMessage(tr('Area “{name}” created', { name })); // R10a: a new area stays on the current screen
  }

  function openAreaMenu(ctx, anchor, areaId) {
    const { getArea, esc, openPopover } = ctx;
    const area = getArea(areaId); if (!area) return;
    const archiveAction = area.status === 'archived'
      ? `<button class="popover-option" type="button" data-pop-action="restore-area" data-area-id="${esc(areaId)}"><i class="ph ph-arrow-counter-clockwise"></i>${tr('Restore area')}</button>`
      : `<button class="popover-option" type="button" data-pop-action="archive-area" data-area-id="${esc(areaId)}"><i class="ph ph-archive"></i>${tr('Archive area')}</button>`;
    const pinAction = area.status === 'active'
      ? `<button class="popover-option" type="button" data-pop-action="${area.isPinned ? 'unpin-area' : 'pin-area'}" data-area-id="${esc(areaId)}"><i class="ph ${area.isPinned ? 'ph-push-pin-slash' : 'ph-push-pin'}"></i>${area.isPinned ? tr('Unpin from “More”') : tr('Pin to “More”')}</button>`
      : '';
    const html = `<button class="popover-option" type="button" data-pop-action="edit-area" data-area-id="${esc(areaId)}"><i class="ph ph-pencil-simple"></i>${tr('Edit area')}</button>${pinAction}${archiveAction}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="delete-area" data-area-id="${esc(areaId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>${tr('Delete area')}</button>`;
    openPopover(anchor, html, { type: 'area-menu', areaId });
  }

  function archiveArea(ctx, areaId) {
    const { getArea, nowIso, saveState, closePopover, currentRoute, navigate, render, setUndo } = ctx;
    const area = getArea(areaId); if (!area || area.status === 'archived') return;
    const previous = { status: area.status, isPinned: area.isPinned, updatedAt: area.updatedAt };
    area.status = 'archived'; area.isPinned = false; area.updatedAt = nowIso();
    saveState(); closePopover();
    if (currentRoute().type === 'area' && currentRoute().id === areaId) navigate('areas'); else render();
    setUndo(tr('Area archived'), () => { const current = getArea(areaId); if (!current) return; Object.assign(current, previous, { updatedAt: nowIso() }); saveState(); render(); });
  }

  function restoreArea(ctx, areaId) {
    const { getArea, nowIso, saveState, closePopover, render, setToastMessage } = ctx;
    const area = getArea(areaId); if (!area) return;
    area.status = 'active'; area.updatedAt = nowIso(); saveState(); closePopover(); render(); setToastMessage(tr('Area restored'));
  }

  function toggleAreaPin(ctx, areaId) {
    const { getArea, nowIso, saveState, closePopover, render } = ctx;
    const area = getArea(areaId); if (!area || area.status === 'archived') return;
    area.isPinned = !area.isPinned; area.updatedAt = nowIso(); saveState(); closePopover(); render();
  }

  function handleAction(action, event, ctx) {
    const element = event?.target.closest('[data-action], [data-pop-action]');
    if (!element) return false;
    const areaId = element.dataset.areaId;
    if (action === 'new-area') openAreaModal(ctx);
    else if (action === 'area-menu') openAreaMenu(ctx, element, areaId);
    else if (action === 'area-new-task') ctx.openQuickAdd({ areaId, anytime: true });
    else if (action === 'area-new-project') ctx.openProjectModal(null, { areaId });
    else if (action === 'area-new-goal') ctx.openGoalModal({ areaId });
    else if (action === 'area-new-habit') ctx.openHabitModal(null, { areaId });
    else if (action === 'select-area-color' && ctx.modalState?.type === 'area') { ctx.modalState.draft.color = element.dataset.color; ctx.renderModal(); }
    else if (action === 'select-area-icon' && ctx.modalState?.type === 'area') { ctx.modalState.draft.icon = element.dataset.icon; ctx.renderModal(); }
    else if (action === 'save-area' && ctx.modalState?.type === 'area') saveAreaModal(ctx);
    else if (action === 'areas-fold') { ctx.state.ui.areasArchivedOpen = !ctx.state.ui.areasArchivedOpen; ctx.saveAndRender(); }
    else if (action === 'area-all-tasks') { tasksOpenFor = tasksOpenFor === areaId ? null : areaId; ctx.render(); }
    else if (action === 'edit-area' && element.dataset.popAction) { ctx.closePopover(); openAreaModal(ctx, areaId); }
    else if (action === 'archive-area' && element.dataset.popAction) archiveArea(ctx, areaId);
    else if (action === 'restore-area') restoreArea(ctx, areaId);
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
