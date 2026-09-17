(function () {
  'use strict';

  const title = value => value ? value[0].toUpperCase() + value.slice(1) : '';
  const roomProjects = state => (state.projects || []).filter(project => project.isCleaningRoom && !project.isArchived);
  const localDateTimeIso = value => { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); };

  function renderList(ctx) {
    const { state, pageHeader, esc, Core, relativeDateLabel } = ctx;
    const rooms = roomProjects(state);
    const cards = rooms.map(room => {
      const tasks = state.tasks.filter(task => task.projectId === room.id && !task.isCompleted).sort((a, b) => String(a.plannedDate || '9999').localeCompare(String(b.plannedDate || '9999')));
      return `<article class="cleaning-room-card"><div class="cleaning-room-head"><div><span class="cleaning-room-kicker"><i class="ph ph-house"></i> Home</span><h2>${esc(room.name)}</h2></div><button class="btn btn-secondary" type="button" data-action="new-cleaning-chore" data-project-id="${esc(room.id)}"><i class="ph ph-plus"></i> Add chore</button></div><div class="cleaning-chore-list">${tasks.length ? tasks.map(task => `<div class="cleaning-chore-row"><span class="cleaning-chore-title"><i class="ph ph-broom"></i>${esc(task.title)}</span><span class="cleaning-chore-meta">${task.plannedDate ? esc(relativeDateLabel(task.plannedDate)) : 'No date'} · ${esc(ctx.recurrenceLabel(task.recurrence))}</span><button class="btn-icon" type="button" data-action="open-task" data-task-id="${esc(task.id)}" aria-label="Open chore"><i class="ph ph-arrow-up-right"></i></button></div>`).join('') : '<p class="area-empty-copy">No open chores in this room.</p>'}</div></article>`;
    }).join('');
    return pageHeader('Cleaning Schedule', 'Room-by-room chores and home maintenance.', { add: false, actionHtml: '<button class="btn btn-secondary" type="button" data-action="new-cleaning-room"><i class="ph ph-plus"></i> New room</button><button class="btn btn-primary" type="button" data-action="new-cleaning-chore"><i class="ph ph-broom"></i> Schedule chore</button>' }) + `<section class="cleaning-grid">${cards || '<div class="empty-state"><h3>No cleaning rooms yet.</h3><p>Create a room, then add recurring chores such as vacuuming or checking the boiler.</p><button class="btn btn-primary" type="button" data-action="new-cleaning-room"><i class="ph ph-plus"></i> Add first room</button></div>'}</section>`;
  }

  function renderModal(ctx) {
    const { modalState, state, esc, modalFrame } = ctx;
    const d = modalState.draft;
    if (modalState.type === 'cleaning-room') return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">New cleaning room</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><label class="field-label">Room name<input id="cleaning-room-name" class="input" maxlength="80" value="${esc(d.name)}" placeholder="Living room, Bathroom…"></label>${d.error ? `<p class="validation" role="alert">${esc(d.error)}</p>` : ''}<div class="modal-footer"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-cleaning-room">Create room</button></div></div>`, 'small-modal');
    const rooms = roomProjects(state);
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">Schedule cleaning chore</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label">Chore<input id="cleaning-chore-title" class="input" maxlength="120" value="${esc(d.title)}" placeholder="Vacuum, wipe dust, check boiler…"></label><label class="field-label">Room<select id="cleaning-chore-project" class="input">${rooms.map(room => `<option value="${esc(room.id)}" ${room.id === d.projectId ? 'selected' : ''}>${esc(room.name)}</option>`).join('')}</select></label><div class="goal-form-grid"><label class="field-label">First date<input id="cleaning-chore-date" class="input" type="date" value="${esc(d.plannedDate)}"></label><label class="field-label">Time<input id="cleaning-chore-time" class="input" type="time" value="${esc(d.plannedTime)}"></label></div><div class="goal-form-grid"><label class="field-label">Repeat<select id="cleaning-chore-frequency" class="input"><option value="daily" ${d.frequency === 'daily' ? 'selected' : ''}>Daily</option><option value="weekly" ${d.frequency === 'weekly' ? 'selected' : ''}>Weekly</option><option value="monthly" ${d.frequency === 'monthly' ? 'selected' : ''}>Monthly</option></select></label><label class="field-label">Every<input id="cleaning-chore-interval" class="input" type="number" min="1" step="1" value="${esc(d.interval)}"></label></div><label class="field-label">Reminder<input id="cleaning-chore-reminder" class="input" type="datetime-local" value="${esc(d.reminder)}"></label>${d.error ? `<p class="validation" role="alert">${esc(d.error)}</p>` : ''}</div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-cleaning-chore">Schedule chore</button></div></div>`, 'quick');
  }

  function openModal(ctx, type, projectId = null) {
    ctx.setModalState({ type, draft: type === 'cleaning-room' ? { name: '', error: '' } : { title: '', projectId: projectId || roomProjects(ctx.state)[0]?.id || '', plannedDate: ctx.Core.dateOnly(), plannedTime: '', frequency: 'weekly', interval: 1, reminder: '', error: '' } });
    ctx.renderModal();
    requestAnimationFrame(() => ctx.$(type === 'cleaning-room' ? '#cleaning-room-name' : '#cleaning-chore-title')?.focus());
  }

  function value(ctx, selector) { return ctx.$(selector)?.value || ''; }

  function saveRoom(ctx) {
    const name = value(ctx, '#cleaning-room-name').trim();
    if (!name) { ctx.modalState.draft.error = 'Room needs a name.'; ctx.renderModal(); return; }
    const now = ctx.nowIso();
    let home = (ctx.state.areas || []).find(area => area.name.toLowerCase() === 'home');
    if (!home) { home = { id: ctx.uid('area'), name: 'Home', color: '#4da3ff', icon: 'ph-house', status: 'active', isPinned: false, createdAt: now, updatedAt: now }; ctx.state.areas.push(home); }
    if ((ctx.state.projects || []).some(project => project.isCleaningRoom && project.name.toLowerCase() === name.toLowerCase())) { ctx.modalState.draft.error = 'That cleaning room already exists.'; ctx.renderModal(); return; }
    ctx.state.projects.push({ id: ctx.uid('project'), name, color: '#4da3ff', order: ctx.state.projects.length, areaId: home.id, goalIds: [], isArchived: false, isCleaningRoom: true, createdAt: now, updatedAt: now });
    ctx.saveState(); ctx.closeModal(); ctx.navigate('cleaning');
  }

  function saveChore(ctx) {
    const d = ctx.modalState.draft, chore = value(ctx, '#cleaning-chore-title').trim(), projectId = value(ctx, '#cleaning-chore-project');
    const date = value(ctx, '#cleaning-chore-date'), interval = Number(value(ctx, '#cleaning-chore-interval'));
    if (!chore || !projectId || !date || !Number.isInteger(interval) || interval < 1) { d.error = 'Add a chore, room, first date and a positive interval.'; ctx.renderModal(); return; }
    const now = ctx.nowIso(), id = ctx.uid('task');
    const recurrence = ctx.Core.normalizeRecurrenceV3({ frequency: value(ctx, '#cleaning-chore-frequency') || 'weekly', interval, endType: 'never', endDate: null, endAfterOccurrences: null, seriesId: id });
    ctx.state.tasks.push({ id, title: chore, notes: '', projectId, areaId: null, goalIds: [], plannedDate: date, plannedTime: value(ctx, '#cleaning-chore-time') || null, dueDate: date, dueTime: null, reminderAt: localDateTimeIso(value(ctx, '#cleaning-chore-reminder')), reminderFiredAt: null, recurrence, tagIds: [], priority: 'none', attachmentIds: [], isInbox: false, isCompleted: false, completedAt: null, subtasks: [], todayOrder: null, projectOrder: null, inboxOrder: null, createdAt: now, updatedAt: now });
    ctx.saveState(); ctx.closeModal(); ctx.navigate('cleaning');
  }

  window.TodoDomainModules?.register({
    name: 'cleaning',
    renderRoute(route, ctx) {
      if (route.type === 'cleaning') return renderList(ctx);
      if (route.type === 'modal' && (route.modalType === 'cleaning-room' || route.modalType === 'cleaning-chore')) return renderModal(ctx);
    },
    handleAction(action, event, ctx) {
      const el = event?.target.closest('[data-action]');
      if (!el) return false;
      if (action === 'new-cleaning-room') openModal(ctx, 'cleaning-room');
      else if (action === 'new-cleaning-chore') openModal(ctx, 'cleaning-chore', el.dataset.projectId || null);
      else if (action === 'save-cleaning-room') saveRoom(ctx);
      else if (action === 'save-cleaning-chore') saveChore(ctx);
      else return false;
      return true;
    }
  });
})();
