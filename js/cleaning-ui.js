(function () {
  'use strict';
  const { tr, msg } = window.TodoI18n;

  const roomProjects = state => (state.projects || []).filter(project => project.isCleaningRoom && !project.isArchived);
  // The sample Area is created with a translated name; an existing English "Home" Area is still reused.
  const isHomeArea = area => [msg('Home'), tr('Home')].some(name => area.name.toLowerCase() === name.toLowerCase());
  const localDateTimeIso = value => { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); };

  function renderList(ctx) {
    const { state, pageHeader, esc, Core, relativeDateLabel } = ctx;
    const ui = state.ui || (state.ui = {});
    ui.cleaningCompletedExpanded ||= {};
    const allRooms = roomProjects(state);
    let selectedRoom = ui.cleaningRoomFilter || 'all';
    let rooms = selectedRoom === 'all' ? allRooms : allRooms.filter(room => room.id === selectedRoom);
    if (selectedRoom !== 'all' && !rooms.length) { selectedRoom = 'all'; rooms = allRooms; ui.cleaningRoomFilter = 'all'; }
    const roomOptions = `<label class="cleaning-filter"><span>${tr('Room')}</span><select class="input" data-cleaning-room-filter><option value="all">${tr('All rooms')}</option>${allRooms.map(room => `<option value="${esc(room.id)}" ${room.id === selectedRoom ? 'selected' : ''}>${esc(room.name)}</option>`).join('')}</select></label>`;
    const today = Core.dateOnly();
    const taskMeta = task => {
      const date = task.dueDate || task.plannedDate;
      const dateLabel = date ? relativeDateLabel(date) : tr('No date');
      const status = task.isCompleted ? `${tr('Completed')}${task.completedAt ? ` · ${relativeDateLabel(task.completedAt.slice(0, 10))}` : ''}` : date && date < today ? tr('Overdue') : dateLabel;
      return `${status}${!task.isCompleted && date && date < today ? ` · ${dateLabel}` : ''} · ${ctx.recurrenceLabel(task.recurrence)}`;
    };
    const choreRow = (task, completed) => `<div class="cleaning-chore-row${completed ? ' is-completed' : ''}${!completed && (task.dueDate || task.plannedDate) < today ? ' is-overdue' : ''}"><span class="cleaning-chore-title"><i class="ph ${completed ? 'ph-check-circle' : 'ph-broom'}"></i>${esc(task.title)}</span><span class="cleaning-chore-meta">${esc(taskMeta(task))}</span><button class="btn-icon" type="button" data-action="open-task" data-task-id="${esc(task.id)}" aria-label="${tr('Open chore')}"><i class="ph ph-arrow-up-right"></i></button></div>`;
    const cards = rooms.map(room => {
      const tasks = state.tasks.filter(task => task.projectId === room.id).sort((a, b) => String(a.dueDate || a.plannedDate || '9999').localeCompare(String(b.dueDate || b.plannedDate || '9999')));
      const openTasks = tasks.filter(task => !task.isCompleted), completedTasks = tasks.filter(task => task.isCompleted);
      const completedOpen = Boolean(ui.cleaningCompletedExpanded[room.id]);
      return `<article class="cleaning-room-card"><div class="cleaning-room-head"><div><span class="cleaning-room-kicker"><i class="ph ph-house"></i> ${tr('Home')}</span><h2><button class="cleaning-room-link" type="button" data-route="project/${esc(room.id)}">${esc(room.name)}</button></h2></div><div class="cleaning-room-actions"><button class="btn-icon" type="button" data-action="project-menu" data-project-id="${esc(room.id)}" aria-label="${tr('Room actions')}"><i class="ph ph-dots-three"></i></button><button class="btn btn-secondary" type="button" data-action="new-cleaning-chore" data-project-id="${esc(room.id)}"><i class="ph ph-plus"></i> ${tr('Add chore')}</button></div></div><div class="cleaning-chore-list">${openTasks.length ? openTasks.map(task => choreRow(task, false)).join('') : `<p class="area-empty-copy">${tr('No open chores in this room.')}</p>`}</div>${completedTasks.length ? `<div class="cleaning-completed"><button class="cleaning-completed-toggle" type="button" data-action="toggle-cleaning-completed" data-project-id="${esc(room.id)}" aria-expanded="${completedOpen}"><i class="ph ${completedOpen ? 'ph-caret-down' : 'ph-caret-right'}"></i> ${tr('Completed ({count})', { count: completedTasks.length })}</button>${completedOpen ? `<div class="cleaning-chore-list">${completedTasks.map(task => choreRow(task, true)).join('')}</div>` : ''}</div>` : ''}</article>`;
    }).join('');
    const empty = allRooms.length && !rooms.length ? `<div class="empty-state"><h3>${tr('No room selected.')}</h3><p>${tr('Choose another room or show all rooms.')}</p></div>` : `<div class="empty-state"><h3>${tr('No cleaning rooms yet.')}</h3><p>${tr('Create a room, then add recurring chores such as vacuuming or checking the boiler.')}</p><div class="modal-footer-actions" style="justify-content:center"><button class="btn btn-primary" type="button" data-action="new-cleaning-room"><i class="ph ph-plus"></i> ${tr('Add first room')}</button></div></div>`;
    const presets = `<button class="btn btn-ghost" type="button" data-action="add-cleaning-examples" data-cleaning-preset="apartment"><i class="ph ph-sparkle"></i> ${tr('Apartment preset')}</button><button class="btn btn-ghost" type="button" data-action="add-cleaning-examples" data-cleaning-preset="house"><i class="ph ph-house"></i> ${tr('House preset')}</button>`;
    return pageHeader(tr('Cleaning Schedule'), tr('Room-by-room chores and home maintenance.'), { add: false, actionHtml: `${roomOptions}${presets}<button class="btn btn-secondary" type="button" data-action="new-cleaning-room"><i class="ph ph-plus"></i> ${tr('New room')}</button><button class="btn btn-primary" type="button" data-action="new-cleaning-chore"><i class="ph ph-broom"></i> ${tr('Schedule chore')}</button>` }) + `<section class="cleaning-grid">${cards || empty}</section>`;
  }

  function addExamples(ctx, preset = 'apartment') {
    const now = ctx.nowIso(), today = ctx.Core.dateOnly();
    let home = (ctx.state.areas || []).find(isHomeArea);
    if (!home) { home = { id: ctx.uid('area'), name: tr('Home'), color: '#4da3ff', icon: 'ph-house', status: 'active', isPinned: false, createdAt: now, updatedAt: now }; ctx.state.areas.push(home); }
    const ensureRoom = (name, key, legacyKey) => {
      let room = (ctx.state.projects || []).find(project => project.cleaningSampleKey === key || (legacyKey && project.cleaningSampleKey === legacyKey));
      if (!room) { room = { id: ctx.uid('project'), name, color: '#4da3ff', order: ctx.state.projects.length, areaId: home.id, goalIds: [], isArchived: false, isCleaningRoom: true, cleaningSampleKey: key, createdAt: now, updatedAt: now }; ctx.state.projects.push(room); }
      return room;
    };
    const chores = preset === 'house' ? [
      ['living-room', msg('Living Room'), msg('Vacuum'), 'weekly', 1], ['living-room', msg('Living Room'), msg('Dust surfaces'), 'weekly', 1],
      ['bathroom', msg('Bathroom'), msg('Clean bathroom'), 'weekly', 1], ['bathroom', msg('Bathroom'), msg('Check boiler'), 'monthly', 3],
      ['bedroom', msg('Bedroom'), msg('Change bedding'), 'weekly', 1], ['hallway', msg('Hallway'), msg('Vacuum hallway'), 'weekly', 1], ['garden', msg('Garden'), msg('Check outdoor lights'), 'monthly', 1],
    ] : [
      ['living-room', msg('Living Room'), msg('Vacuum'), 'weekly', 1], ['living-room', msg('Living Room'), msg('Dust surfaces'), 'weekly', 1],
      ['bathroom', msg('Bathroom'), msg('Clean bathroom'), 'weekly', 1], ['bathroom', msg('Bathroom'), msg('Check boiler'), 'monthly', 3],
      ['kitchen', msg('Kitchen'), msg('Wipe counters'), 'weekly', 1], ['kitchen', msg('Kitchen'), msg('Clean fridge'), 'monthly', 1],
    ];
    for (const [roomKey, roomName, chore, frequency, interval] of chores) {
      // Stable sample keys use the English source; the names created for the user are translated.
      const slug = chore.toLowerCase().replaceAll(' ', '-');
      const room = ensureRoom(tr(roomName), `cleaning:${preset}:${roomKey}`, `cleaning:${roomKey}`);
      const key = `cleaning:${preset}:${roomKey}:${slug}`, legacyKey = `cleaning:${roomKey}:${slug}`;
      if (ctx.state.tasks.some(task => task.cleaningSampleKey === key || task.cleaningSampleKey === legacyKey)) continue;
      const id = ctx.uid('task');
      ctx.state.tasks.push({ id, title: tr(chore), notes: '', projectId: room.id, areaId: null, goalIds: [], plannedDate: today, plannedTime: null, dueDate: today, dueTime: null, reminderAt: null, reminderFiredAt: null, recurrence: ctx.Core.normalizeRecurrenceV3({ frequency, interval, endType: 'never', seriesId: id }), tagIds: [], priority: 'none', attachmentIds: [], isInbox: false, isCompleted: false, completedAt: null, subtasks: [], todayOrder: null, projectOrder: null, inboxOrder: null, cleaningSampleKey: key, createdAt: now, updatedAt: now });
    }
    ctx.saveState(); ctx.navigate('cleaning');
  }

  function renderModal(ctx) {
    const { modalState, state, esc, modalFrame } = ctx;
    const d = modalState.draft;
    if (modalState.type === 'cleaning-room') return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${tr('New cleaning room')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><label class="field-label">${tr('Room name')}<input id="cleaning-room-name" class="input" maxlength="80" value="${esc(d.name)}" placeholder="${tr('Living room, Bathroom…')}"></label>${d.error ? `<p class="validation" role="alert">${esc(d.error)}</p>` : ''}<div class="modal-footer"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Cancel')}</button><button class="btn btn-primary" type="button" data-action="save-cleaning-room">${tr('Create room')}</button></div></div>`, 'small-modal');
    const rooms = roomProjects(state);
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${tr('Schedule cleaning chore')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label">${tr('Chore')}<input id="cleaning-chore-title" class="input" maxlength="120" value="${esc(d.title)}" placeholder="${tr('Vacuum, wipe dust, check boiler…')}"></label><label class="field-label">${tr('Room')}<select id="cleaning-chore-project" class="input">${rooms.map(room => `<option value="${esc(room.id)}" ${room.id === d.projectId ? 'selected' : ''}>${esc(room.name)}</option>`).join('')}</select></label><div class="goal-form-grid"><label class="field-label">${tr('First date')}<input id="cleaning-chore-date" class="input" type="date" value="${esc(d.plannedDate)}"></label><label class="field-label">${tr('Time')}<input id="cleaning-chore-time" class="input" type="time" value="${esc(d.plannedTime)}"></label></div><div class="goal-form-grid"><label class="field-label">${tr('Repeat')}<select id="cleaning-chore-frequency" class="input"><option value="daily" ${d.frequency === 'daily' ? 'selected' : ''}>${tr('Daily')}</option><option value="weekly" ${d.frequency === 'weekly' ? 'selected' : ''}>${tr('Weekly')}</option><option value="monthly" ${d.frequency === 'monthly' ? 'selected' : ''}>${tr('Monthly')}</option></select></label><label class="field-label">${tr('Every')}<input id="cleaning-chore-interval" class="input" type="number" min="1" step="1" value="${esc(d.interval)}"></label></div><label class="field-label">${tr('Reminder')}<input id="cleaning-chore-reminder" class="input" type="datetime-local" value="${esc(d.reminder)}"></label>${d.error ? `<p class="validation" role="alert">${esc(d.error)}</p>` : ''}</div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Cancel')}</button><button class="btn btn-primary" type="button" data-action="save-cleaning-chore">${tr('Schedule chore')}</button></div></div>`, 'quick');
  }

  function openModal(ctx, type, projectId = null) {
    ctx.setModalState({ type, draft: type === 'cleaning-room' ? { name: '', error: '' } : { title: '', projectId: projectId || roomProjects(ctx.state)[0]?.id || '', plannedDate: ctx.Core.dateOnly(), plannedTime: '', frequency: 'weekly', interval: 1, reminder: '', error: '' } });
    ctx.renderModal();
    requestAnimationFrame(() => ctx.$(type === 'cleaning-room' ? '#cleaning-room-name' : '#cleaning-chore-title')?.focus());
  }

  function value(ctx, selector) { return ctx.$(selector)?.value || ''; }

  function saveRoom(ctx) {
    const name = value(ctx, '#cleaning-room-name').trim();
    if (!name) { ctx.modalState.draft.error = tr('Room needs a name.'); ctx.renderModal(); return; }
    const now = ctx.nowIso();
    let home = (ctx.state.areas || []).find(isHomeArea);
    if (!home) { home = { id: ctx.uid('area'), name: tr('Home'), color: '#4da3ff', icon: 'ph-house', status: 'active', isPinned: false, createdAt: now, updatedAt: now }; ctx.state.areas.push(home); }
    if ((ctx.state.projects || []).some(project => project.isCleaningRoom && project.name.toLowerCase() === name.toLowerCase())) { ctx.modalState.draft.error = tr('That cleaning room already exists.'); ctx.renderModal(); return; }
    ctx.state.projects.push({ id: ctx.uid('project'), name, color: '#4da3ff', order: ctx.state.projects.length, areaId: home.id, goalIds: [], isArchived: false, isCleaningRoom: true, createdAt: now, updatedAt: now });
    ctx.saveState(); ctx.closeModal(); ctx.navigate('cleaning');
  }

  function saveChore(ctx) {
    const d = ctx.modalState.draft, chore = value(ctx, '#cleaning-chore-title').trim(), projectId = value(ctx, '#cleaning-chore-project');
    const date = value(ctx, '#cleaning-chore-date'), interval = Number(value(ctx, '#cleaning-chore-interval'));
    if (!chore || !projectId || !date || !Number.isInteger(interval) || interval < 1) { d.error = tr('Add a chore, room, first date and a positive interval.'); ctx.renderModal(); return; }
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
      else if (action === 'add-cleaning-examples') addExamples(ctx, el.dataset.cleaningPreset || 'apartment');
      else if (action === 'toggle-cleaning-completed') { const ui = ctx.state.ui || (ctx.state.ui = {}); ui.cleaningCompletedExpanded ||= {}; const id = el.dataset.projectId; ui.cleaningCompletedExpanded[id] = !ui.cleaningCompletedExpanded[id]; ctx.saveAndRender(); }
      else return false;
      return true;
    },
    handleInput(event, ctx) {
      if (!event.target.matches('[data-cleaning-room-filter]')) return false;
      ctx.state.ui.cleaningRoomFilter = event.target.value || 'all';
      ctx.saveAndRender();
      return true;
    }
  });
})();
