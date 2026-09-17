(function () {
  'use strict';

  const PROJECT_COLORS = ['#5362FF', '#30CBAD', '#A879FF', '#4CC9F0', '#F5B942', '#FF8A5B', '#F06A8A', '#8FD14F'];
  let modal = null;

  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

  function context() {
    return window.TodoAppContext || window.TodoApp?.context || window.TodoApp || {};
  }

  function getState() {
    return context().state || { areas: [], projects: [], tasks: [] };
  }

  function call(name, ...args) {
    const fn = context()[name];
    return typeof fn === 'function' ? fn(...args) : undefined;
  }

  function nowIso() {
    return call('nowIso') || new Date().toISOString();
  }

  function uid(prefix) {
    return call('uid', prefix) || `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function getArea(value) {
    const found = call('getArea', value);
    if (found) return found;
    const areas = getState().areas || [];
    return areas.find(area => area.id === value || String(area.name || '').trim().toLocaleLowerCase() === String(value || '').trim().toLocaleLowerCase()) || null;
  }

  function saveAndRender() {
    call('saveState');
    call('render');
  }

  function pageHeader(title, subtitle, options) {
    return call('pageHeader', title, subtitle, options) || `<header class="page-header"><div><h1 class="page-title">${esc(title)}</h1><p class="page-subtitle">${esc(subtitle || '')}</p></div></header>`;
  }

  function modalFrame(content, cls) {
    return call('modalFrame', content, cls) || `<div class="modal-backdrop" data-action="cleaning-modal-backdrop"><section class="modal ${cls || ''}" role="dialog" aria-modal="true">${content}</section></div>`;
  }

  function renderCleaning() {
    const state = getState();
    const projects = (state.projects || []).filter(project => project.isCleaningRoom && !project.isArchived);
    let html = pageHeader('Cleaning', `${projects.length} ${projects.length === 1 ? 'room' : 'rooms'}`, {
      add: false,
      actionHtml: '<button class="btn btn-primary" type="button" data-action="new-cleaning-room"><i class="ph ph-plus"></i> New room</button>',
    });
    if (!projects.length) return `${html}<div class="empty-state"><h3>No cleaning rooms yet.</h3><p>Create a room to start adding recurring chores.</p><button class="btn btn-primary" type="button" data-action="new-cleaning-room"><i class="ph ph-plus"></i> New room</button></div>`;

    html += '<div class="cleaning-room-list">';
    for (const project of projects) {
      const tasks = (state.tasks || []).filter(task => task.projectId === project.id && !task.isCompleted);
      const area = project.areaId ? getArea(project.areaId) : null;
      html += `<section class="settings-card cleaning-room" data-cleaning-room-id="${esc(project.id)}">
        <div class="section-header"><div><h2 class="selected-tag-title"><span class="project-dot" style="--project-color:${esc(project.color || PROJECT_COLORS[0])}"></span>${esc(project.name)}</h2><p class="page-subtitle">${area ? `${esc(area.name)} · ` : ''}${tasks.length} active ${tasks.length === 1 ? 'chore' : 'chores'}</p></div><button class="btn btn-secondary" type="button" data-action="new-cleaning-chore" data-project-id="${esc(project.id)}"><i class="ph ph-plus"></i> New chore</button></div>`;
      if (tasks.length) {
        html += '<div class="task-list cleaning-chore-list">';
        for (const task of tasks) {
          const recurrence = task.recurrence || {};
          const interval = Math.max(1, Number(recurrence.interval) || 1);
          const unit = recurrence.frequency === 'weekly' ? 'week' : recurrence.frequency === 'monthly' ? 'month' : 'day';
          const cadence = `Every ${interval} ${unit}${interval === 1 ? '' : 's'}`;
          html += `<div class="task-row cleaning-chore-row" data-task-id="${esc(task.id)}"><span class="complete-control" aria-hidden="true"></span><div class="task-main"><div class="task-title">${esc(task.title)}</div><div class="task-meta"><span>${esc(cadence)}</span>${task.plannedDate ? `<span class="separator">·</span><span>Planned ${esc(task.plannedDate)}</span>` : ''}${task.reminderAt ? '<span class="separator">·</span><span>Reminder set</span>' : ''}</div></div></div>`;
        }
        html += '</div>';
      } else {
        html += '<div class="empty-state cleaning-room-empty"><p>No chores in this room yet.</p></div>';
      }
      html += '</section>';
    }
    return `${html}</div>`;
  }

  function ensureHomeArea() {
    const state = getState();
    state.areas = Array.isArray(state.areas) ? state.areas : [];
    const existing = state.areas.find(area => String(area.name || '').trim().toLocaleLowerCase() === 'home') || getArea('Home');
    if (existing) return existing;
    const timestamp = nowIso();
    const area = { id: uid('area'), name: 'Home', color: '#30CBAD', icon: 'house', isArchived: false, archivedAt: null, createdAt: timestamp, updatedAt: timestamp };
    state.areas.push(area);
    return area;
  }

  function openModal(type, projectId = null) {
    modal = type === 'room'
      ? { type, draft: { name: '' }, error: '' }
      : { type, projectId, draft: { title: '', frequency: 'weekly', interval: 1, plannedDate: '', reminderAt: '' }, error: '' };
    renderModal();
    requestAnimationFrame(() => document.querySelector(type === 'room' ? '#cleaning-room-name' : '#cleaning-chore-title')?.focus());
  }

  function openCleaningRoomModal() { openModal('room'); }
  function openCleaningChoreModal(projectId) { if (projectId) openModal('chore', projectId); }

  function closeModal() {
    modal = null;
    const root = document.querySelector('#modal-root');
    if (root) root.innerHTML = '';
  }

  function renderModal() {
    const root = document.querySelector('#modal-root');
    if (!root || !modal) return;
    if (modal.type === 'room') {
      const content = `<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">New cleaning room</h2><button class="btn-icon" type="button" data-action="close-cleaning-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><label class="field-label" for="cleaning-room-name">Room name</label><input id="cleaning-room-name" class="input ${modal.error ? 'is-error' : ''}" type="text" maxlength="100" value="${esc(modal.draft.name)}" placeholder="e.g. Kitchen" />${modal.error ? `<div class="validation">${esc(modal.error)}</div>` : ''}<div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-cleaning-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-cleaning-room">Create room</button></div></div></div>`;
      root.innerHTML = modalFrame(content, 'small-modal');
      return;
    }
    const d = modal.draft;
    const content = `<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">New recurring chore</h2><button class="btn-icon" type="button" data-action="close-cleaning-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label" for="cleaning-chore-title">Chore title</label><input id="cleaning-chore-title" class="input ${modal.error ? 'is-error' : ''}" type="text" maxlength="200" value="${esc(d.title)}" placeholder="e.g. Wipe kitchen counters" />${modal.error ? `<div class="validation">${esc(modal.error)}</div>` : ''}<div class="quick-advanced-grid"><label class="field-label" for="cleaning-frequency">Cadence</label><div style="display:flex;gap:8px"><select id="cleaning-frequency" class="filter-select"><option value="daily" ${d.frequency === 'daily' ? 'selected' : ''}>Daily</option><option value="weekly" ${d.frequency === 'weekly' ? 'selected' : ''}>Weekly</option><option value="monthly" ${d.frequency === 'monthly' ? 'selected' : ''}>Monthly</option></select><input id="cleaning-interval" class="input" type="number" min="1" max="365" value="${esc(d.interval)}" aria-label="Cadence interval" /></div></div><label class="field-label" for="cleaning-planned-date">Planned date</label><input id="cleaning-planned-date" class="date-native" type="date" value="${esc(d.plannedDate)}" /><label class="field-label" for="cleaning-reminder">Reminder (optional)</label><input id="cleaning-reminder" class="date-native" type="datetime-local" value="${esc(d.reminderAt)}" /></div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-cleaning-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-cleaning-chore">Create chore</button></div></div></div>`;
    root.innerHTML = modalFrame(content, 'small-modal');
  }

  function saveCleaningRoom() {
    if (!modal || modal.type !== 'room') return;
    const state = getState();
    const name = String(modal.draft.name || '').trim();
    if (!name) { modal.error = 'Room needs a name.'; renderModal(); return; }
    const home = ensureHomeArea();
    const timestamp = nowIso();
    const projects = Array.isArray(state.projects) ? state.projects : (state.projects = []);
    const order = projects.reduce((max, project) => Math.max(max, Number(project.order) || 0), -1) + 1;
    projects.push({ id: uid('project'), name, color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length], order, areaId: home.id, isCleaningRoom: true, isArchived: false, archivedAt: null, createdAt: timestamp, updatedAt: timestamp });
    closeModal();
    saveAndRender();
  }

  function saveCleaningChore() {
    if (!modal || modal.type !== 'chore') return;
    const state = getState();
    const room = (state.projects || []).find(project => project.id === modal.projectId && project.isCleaningRoom);
    const d = modal.draft;
    const title = String(d.title || '').trim();
    if (!room) { closeModal(); return; }
    if (!title) { modal.error = 'Chore needs a title.'; renderModal(); return; }
    const tasks = Array.isArray(state.tasks) ? state.tasks : (state.tasks = []);
    const timestamp = nowIso();
    const reminderAt = d.reminderAt ? (() => { const value = new Date(d.reminderAt); return Number.isNaN(value.getTime()) ? null : value.toISOString(); })() : null;
    const interval = Math.max(1, Math.floor(Number(d.interval) || 1));
    const projectTasks = tasks.filter(task => task.projectId === room.id);
    tasks.push({ id: uid('task'), title, notes: '', projectId: room.id, areaId: null, plannedDate: d.plannedDate || null, dueDate: null, reminderAt, reminderFiredAt: null, recurrence: { frequency: ['daily', 'weekly', 'monthly'].includes(d.frequency) ? d.frequency : 'weekly', interval }, tagIds: [], priority: 'none', attachmentIds: [], isInbox: false, isCompleted: false, completedAt: null, subtasks: [], todayOrder: null, projectOrder: projectTasks.length, inboxOrder: null, createdAt: timestamp, updatedAt: timestamp });
    closeModal();
    saveAndRender();
  }

  function handleAction(action, element) {
    if (action === 'new-cleaning-room') { openCleaningRoomModal(); return true; }
    if (action === 'new-cleaning-chore') { openCleaningChoreModal(element?.dataset.projectId); return true; }
    if (action === 'save-cleaning-room') { saveCleaningRoom(); return true; }
    if (action === 'save-cleaning-chore') { saveCleaningChore(); return true; }
    if (action === 'close-cleaning-modal' || action === 'cleaning-modal-backdrop') { closeModal(); return true; }
    return false;
  }

  function handleInput(event) {
    if (!modal) return false;
    const id = event.target.id;
    if (modal.type === 'room' && id === 'cleaning-room-name') modal.draft.name = event.target.value;
    if (modal.type === 'chore') {
      if (id === 'cleaning-chore-title') modal.draft.title = event.target.value;
      else if (id === 'cleaning-frequency') modal.draft.frequency = event.target.value;
      else if (id === 'cleaning-interval') modal.draft.interval = event.target.value;
      else if (id === 'cleaning-planned-date') modal.draft.plannedDate = event.target.value;
      else if (id === 'cleaning-reminder') modal.draft.reminderAt = event.target.value;
    }
    return id.startsWith('cleaning-');
  }

  const handleChange = handleInput;

  function handleKeydown(event) {
    if (!modal) return false;
    if (event.key === 'Escape') { closeModal(); return true; }
    if (event.key === 'Enter' && event.target.id === 'cleaning-room-name') { event.preventDefault(); saveCleaningRoom(); return true; }
    if (event.key === 'Enter' && event.target.id === 'cleaning-chore-title') { event.preventDefault(); saveCleaningChore(); return true; }
    return false;
  }

  window.TodoCleaningUI = Object.freeze({
    render: renderCleaning,
    renderCleaning,
    openCleaningRoomModal,
    openCleaningChoreModal,
    closeModal,
    renderModal,
    handleAction,
    handleInput,
    handleChange,
    handleKeydown,
  });
}());
