(function () {
  'use strict';
  const { tr, trn, msg } = window.TodoI18n;

  const roomProjects = state => (state.projects || []).filter(project => project.isCleaningRoom && !project.isArchived);
  // The sample Area is created with a translated name; an existing English "Home" Area is still reused.
  const isHomeArea = area => [msg('Home'), tr('Home')].some(name => area.name.toLowerCase() === name.toLowerCase());
  const localDateTimeIso = value => { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString(); };

  // Redesign R11d (S4): "Redovne obaveze" — everything that repeats. Groups are the cleaning rooms (projects
  // with isCleaningRoom); then the projects with repeating tasks, then "Bez grupe".
  const groupsOf = ctx => ctx.allProjects().filter(project => project.isCleaningRoom);
  const taskDate = task => task.dueDate || task.plannedDate || null;
  function repeatingTasks(ctx) {
    const { state, taskRecurrence, getProject } = ctx;
    return state.tasks.filter(task => {
      const rule = taskRecurrence(task), project = task.projectId ? getProject(task.projectId) : null;
      return rule && !task.isInbox && !project?.isArchived && (task.isCompleted || rule.status !== 'ended');
    });
  }
  function recurringSections(ctx) {
    const tasks = repeatingTasks(ctx);
    const groups = groupsOf(ctx).filter(group => !group.isArchived).map(group => ({ key: group.id, kind: 'group', project: group, list: tasks.filter(task => task.projectId === group.id) }));
    const projects = ctx.sortedProjects().filter(project => !project.isCleaningRoom).map(project => ({ key: project.id, kind: 'project', project, list: tasks.filter(task => task.projectId === project.id) })).filter(section => section.list.length);
    const rest = tasks.filter(task => !task.projectId || !ctx.getProject(task.projectId));
    return [...groups, ...projects, ...(rest.length ? [{ key: 'none', kind: 'rest', list: rest }] : [])];
  }
  const byDate = (a, b) => String(taskDate(a) || '9999').localeCompare(String(taskDate(b) || '9999')) || String(a.title).localeCompare(String(b.title)) || String(a.id).localeCompare(String(b.id));

  function renderList(ctx) {
    const { state, pageHeader, esc, Core, relativeDateLabel, formatDate } = ctx;
    const ui = state.ui || (state.ui = {});
    ui.cleaningCompletedExpanded ||= {};
    const today = Core.dateOnly(), all = recurringSections(ctx), groups = all.filter(section => section.kind === 'group');
    const open = all.flatMap(section => section.list).filter(task => !task.isCompleted);
    const late = open.filter(task => taskDate(task) && taskDate(task) < today).length;
    const archived = groupsOf(ctx).filter(group => group.isArchived);
    const addGroup = `<button class="quick-chip cleaning-add-group" type="button" data-action="new-cleaning-group">+ ${tr('Group')}</button>`;
    const summary = `${trn(open.length, '{count} task repeats', '{count} tasks repeat')}${late ? ` · ${trn(late, '{count} late', '{count} late')}` : ''}`;
    if (!open.length && !groups.length && !archived.length) {
      const example = (preset, label) => `<button class="quick-chip" type="button" data-action="add-cleaning-examples" data-cleaning-preset="${preset}">${tr(label)}</button>`;
      return pageHeader(tr('Recurring tasks'), '', { add: false }) + `<div class="empty-state"><h3>${tr('No recurring tasks yet')}</h3><p>${tr('Make a group (home, car, garden…), then add chores that repeat.')}</p><div class="sheet-chips cleaning-chips">${example('apartment', msg('Example: apartment'))}${example('house', msg('Example: house'))}${addGroup}</div></div>`;
    }
    const projectsShown = all.some(section => section.kind === 'project');
    let filter = ui.cleaningRoomFilter || 'all';
    if (filter !== 'all' && !(filter === 'projects' ? projectsShown : groups.some(section => section.key === filter))) filter = 'all';
    const chip = (value, label) => `<button class="quick-chip${filter === value ? ' is-selected' : ''}" type="button" data-action="cleaning-filter" data-value="${esc(value)}" aria-pressed="${filter === value}">${esc(label)}</button>`;
    let html = pageHeader(tr('Recurring tasks'), summary, { add: false });
    html += `<div class="sheet-chips cleaning-chips">${chip('all', tr('All'))}${groups.map(section => chip(section.key, section.project.name)).join('')}${projectsShown ? chip('projects', tr('From projects')) : ''}${addGroup}</div>`;
    const when = task => {
      const date = taskDate(task);
      if (!date) return `<span class="task-due">${tr('No date')}</span>`;
      if (date < today) return `<span class="task-due is-overdue">${esc(tr('Overdue · {date}', { date: formatDate(date) }))}</span>`;
      if (date === today) return `<span class="task-due is-today">${tr('Today')}</span>`;
      if (date === Core.addDays(today, 1)) return `<span class="task-due">${tr('Tomorrow')}</span>`;
      return `<span class="task-due">${esc(formatDate(date))}</span>`;
    };
    const row = (task, place = false) => {
      const where = place ? (ctx.getProject(task.projectId)?.name || tr('No group')) : '';
      const metaText = task.isCompleted ? tr('Completed {date}', { date: relativeDateLabel(Core.localDateOf(task.completedAt)) }) : [where, ctx.recurrenceLabel(ctx.taskRecurrence(task))].filter(Boolean).join(' · ');
      return ctx.renderChoreRow(task, { metaText, sideHtml: task.isCompleted ? '' : when(task) });
    };
    const head = (key, title, count, tools = '') => `<section class="cleaning-section" data-cleaning-section="${esc(key)}"><div class="cleaning-section-head"><h2 class="cleaning-section-title">${title}<span class="cleaning-section-count"> · ${count}</span></h2>${tools}</div>`;
    // "Ove nedelje" (S4): what is late or comes within 7 days, from every group and project.
    const soon = open.filter(task => taskDate(task) && taskDate(task) <= Core.addDays(today, 7)).sort(byDate);
    if (filter === 'all' && soon.length) html += `${head('week', tr('This week'), soon.length)}<div class="today-card">${soon.map(task => row(task, true)).join('')}</div></section>`;
    const shown = all.filter(section => filter === 'all' || (filter === 'projects' ? section.kind === 'project' : section.key === filter));
    for (const section of shown) {
      const openList = section.list.filter(task => !task.isCompleted).sort(byDate);
      const done = section.list.filter(task => task.isCompleted).sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
      const title = section.kind === 'project' ? `<button class="cleaning-project-link" type="button" data-route="project/${esc(section.key)}"><span class="project-dot" style="--project-color:${esc(section.project.color)}" aria-hidden="true"></span>${esc(section.project.name)}</button>` : esc(section.kind === 'group' ? section.project.name : tr('No group'));
      const tools = section.kind === 'group' ? `<button class="btn-icon" type="button" data-action="cleaning-group-menu" data-project-id="${esc(section.key)}" aria-label="${tr('Group actions')}"><i class="ph ph-dots-three"></i></button>` : section.kind === 'project' ? `<span class="cleaning-section-kind">${tr('project')}</span>` : '';
      const add = section.kind === 'group' ? `<button class="inline-add cleaning-add" type="button" data-action="new-cleaning-chore" data-project-id="${esc(section.key)}"><i class="ph ph-plus"></i> ${tr('Add a chore')}</button>` : '';
      const expanded = Boolean(ui.cleaningCompletedExpanded[section.key]);
      html += head(section.key, title, openList.length, tools);
      if (openList.length || add) html += `<div class="today-card">${openList.map(task => row(task)).join('')}${add}</div>`;
      if (done.length) html += `<button class="collapsible-trigger cleaning-done-toggle" type="button" data-action="toggle-cleaning-completed" data-project-id="${esc(section.key)}" aria-expanded="${expanded}"><span class="left">${tr('Completed')} · ${done.length}</span><i class="ph ph-caret-${expanded ? 'up' : 'down'}" aria-hidden="true"></i></button>${expanded ? `<div class="today-card">${done.map(task => row(task)).join('')}</div>` : ''}`;
      html += '</section>';
    }
    // Archived groups fold at the bottom with "Vrati", like archived areas (S1).
    if (archived.length) {
      const openFold = ui.cleaningArchivedOpen === true;
      const count = group => ctx.state.tasks.filter(task => task.projectId === group.id && !task.isCompleted).length;
      html += `<button class="collapsible-trigger" type="button" data-action="cleaning-archived-fold" aria-expanded="${openFold}"><span class="left">${tr('Archived groups')} · ${archived.length}</span><i class="ph ph-caret-${openFold ? 'up' : 'down'}" aria-hidden="true"></i></button>`;
      if (openFold) html += `<div class="today-card">${archived.map(group => `<div class="cleaning-archived-row"><span class="cleaning-archived-name">${esc(group.name)}<small>${esc(trn(count(group), '{count} chore', '{count} chores'))}</small></span><button class="btn btn-secondary" type="button" data-action="restore-cleaning-group" data-project-id="${esc(group.id)}">${tr('Restore')}</button></div>`).join('')}</div>`;
    }
    return `${html}<p class="sheet-note cleaning-note">${tr('Everything that repeats is here: chores from groups, repeating tasks from projects and the rest. The repeat is set in the task window.')}</p>`;
  }

  // Groups (S4): "+ Grupa" and the group's ⋯ — rename, archive and delete (its chores move to "Bez grupe"), each with Undo.
  function groupSheetHtml(ctx, group, name, error = '') {
    const { esc } = ctx;
    return `<div class="popover-title">${group ? tr('Rename group') : tr('New group')}</div><label class="sheet-field"><input id="cleaning-group-name" class="input" maxlength="80" value="${esc(name)}" placeholder="${tr('Home, bathroom, car, garden…')}" aria-label="${tr('Group name')}"></label>${error ? `<p class="validation" role="alert">${esc(error)}</p>` : ''}<div class="sheet-footer"><span></span><button class="btn btn-primary" type="button" data-pop-action="cleaning-group-save" data-project-id="${esc(group?.id || '')}">${group ? tr('Save') : tr('Create group')}</button></div>`;
  }
  function homeArea(ctx) {
    let home = (ctx.state.areas || []).find(isHomeArea);
    if (!home) { const now = ctx.nowIso(); home = { id: ctx.uid('area'), name: tr('Home'), color: '#4da3ff', icon: 'ph-house', status: 'active', isPinned: false, createdAt: now, updatedAt: now }; ctx.state.areas.push(home); }
    return home;
  }
  function saveGroup(ctx, groupId) {
    const group = groupId ? ctx.getProject(groupId) : null;
    const name = String(ctx.$('#cleaning-group-name')?.value || '').trim();
    const error = !name ? tr('Group needs a name.') : groupsOf(ctx).some(item => item.id !== groupId && item.name.toLowerCase() === name.toLowerCase()) ? tr('That group already exists.') : '';
    if (error) { ctx.refreshSheet(groupSheetHtml(ctx, group, name, error), '#cleaning-group-name'); return; }
    const now = ctx.nowIso();
    if (group) {
      const previous = group.name;
      group.name = name; group.updatedAt = now;
      ctx.closePopover(); ctx.saveAndRender();
      ctx.setUndo(msg('Group renamed'), () => { const current = ctx.getProject(groupId); if (!current) return; current.name = previous; current.updatedAt = ctx.nowIso(); ctx.saveAndRender(); });
      return;
    }
    ctx.state.projects.push({ id: ctx.uid('project'), name, color: '#4da3ff', order: ctx.state.projects.length, areaId: homeArea(ctx).id, goalIds: [], isArchived: false, archivedAt: null, isCleaningRoom: true, createdAt: now, updatedAt: now });
    ctx.closePopover(); ctx.saveAndRender();
    ctx.setToastMessage(tr('Group “{name}” created', { name }));
  }
  function setGroupArchived(ctx, groupId, archived) {
    const group = ctx.getProject(groupId); if (!group?.isCleaningRoom) return;
    const previous = { isArchived: group.isArchived, archivedAt: group.archivedAt ?? null };
    Object.assign(group, { isArchived: archived, archivedAt: archived ? ctx.nowIso() : null, updatedAt: ctx.nowIso() });
    if (archived && ctx.state.ui?.cleaningRoomFilter === groupId) ctx.state.ui.cleaningRoomFilter = 'all';
    ctx.closePopover(); ctx.saveAndRender();
    ctx.setUndo(archived ? tr('Group “{name}” archived', { name: group.name }) : tr('Group “{name}” restored', { name: group.name }), () => { const current = ctx.getProject(groupId); if (!current) return; Object.assign(current, previous, { updatedAt: ctx.nowIso() }); ctx.saveAndRender(); });
  }
  function deleteGroup(ctx, groupId) {
    const { state } = ctx;
    const group = ctx.getProject(groupId); if (!group?.isCleaningRoom) return;
    const copy = value => JSON.parse(JSON.stringify(value));
    const tasks = state.tasks.filter(task => task.projectId === groupId);
    const goals = (state.goals || []).filter(goal => (goal.projectLinks || []).some(link => link.projectId === groupId));
    const resources = (state.resources || []).filter(resource => (resource.relatedProjectIds || []).includes(groupId));
    const before = { index: state.projects.indexOf(group), group: copy(group), tasks: tasks.map(copy), goals: goals.map(copy), resources: resources.map(copy), filter: state.ui?.cleaningRoomFilter };
    state.projects.splice(before.index, 1);
    const now = ctx.nowIso();
    for (const task of tasks) Object.assign(task, { projectId: null, areaId: group.areaId || null, updatedAt: now });
    for (const goal of goals) goal.projectLinks = goal.projectLinks.filter(link => link.projectId !== groupId);
    for (const resource of resources) resource.relatedProjectIds = resource.relatedProjectIds.filter(id => id !== groupId);
    if (state.ui?.cleaningRoomFilter === groupId) state.ui.cleaningRoomFilter = 'all';
    ctx.saveAndRender();
    ctx.setUndo(trn(tasks.length, 'Group deleted · {count} chore in “No group”', 'Group deleted · {count} chores in “No group”'), () => {
      if (ctx.getProject(groupId)) return;
      state.projects.splice(Math.min(before.index, state.projects.length), 0, before.group);
      const put = (collection, copies) => { for (const item of copies) { const index = state[collection].findIndex(current => current.id === item.id); if (index >= 0) state[collection][index] = item; } };
      put('tasks', before.tasks); put('goals', before.goals); put('resources', before.resources);
      if (before.filter !== undefined) state.ui.cleaningRoomFilter = before.filter;
      ctx.saveAndRender();
    });
  }
  function handleGroupAction(action, el, ctx) {
    const groupId = el?.dataset?.projectId || '';
    const group = groupId ? ctx.getProject(groupId) : null;
    const option = (pop, label, note = '', danger = false) => `<button class="popover-option sheet-option${danger ? ' is-danger' : ''}" type="button" data-pop-action="${pop}" data-project-id="${ctx.esc(groupId)}"><span class="sheet-option-label">${label}${note ? `<small>${note}</small>` : ''}</span></button>`;
    if (action === 'new-cleaning-group') ctx.openPopover(el, groupSheetHtml(ctx, null, ''), { type: 'cleaning-group' });
    else if (action === 'cleaning-group-menu' && group) ctx.openPopover(el, `<div class="popover-title">${ctx.esc(group.name)}</div><div class="sheet-card">${option('cleaning-group-rename', tr('Rename'))}${option('cleaning-group-archive', tr('Archive group'), tr('The group and its chores step aside until you restore it.'))}${option('cleaning-group-delete', tr('Delete group'), tr('Its chores stay, in “No group”.'), true)}</div>`, { type: 'cleaning-group-menu' });
    else if (action === 'cleaning-group-rename' && group) ctx.refreshSheet(groupSheetHtml(ctx, group, group.name), '#cleaning-group-name');
    else if (action === 'cleaning-group-save') saveGroup(ctx, groupId || null);
    else if (action === 'cleaning-group-archive') setGroupArchived(ctx, groupId, true);
    else if (action === 'restore-cleaning-group') setGroupArchived(ctx, groupId, false);
    else if (action === 'cleaning-group-delete' && group) { ctx.closePopover(); ctx.openConfirm({ title: msg('Delete group?'), message: msg('Its chores stay, in “No group”.'), confirmLabel: msg('Delete group'), onConfirm: () => deleteGroup(ctx, groupId) }); }
    else return false;
    return true;
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
    const rooms = roomProjects(state);
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${tr('Schedule cleaning chore')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label">${tr('Chore')}<input id="cleaning-chore-title" class="input" maxlength="120" value="${esc(d.title)}" placeholder="${tr('Vacuum, wipe dust, check boiler…')}"></label><label class="field-label">${tr('Room')}<select id="cleaning-chore-project" class="input">${rooms.map(room => `<option value="${esc(room.id)}" ${room.id === d.projectId ? 'selected' : ''}>${esc(room.name)}</option>`).join('')}</select></label><div class="goal-form-grid"><label class="field-label">${tr('First date')}<input id="cleaning-chore-date" class="input" type="date" value="${esc(d.plannedDate)}"></label><label class="field-label">${tr('Time')}<input id="cleaning-chore-time" class="input" type="time" value="${esc(d.plannedTime)}"></label></div><div class="goal-form-grid"><label class="field-label">${tr('Repeat')}<select id="cleaning-chore-frequency" class="input"><option value="daily" ${d.frequency === 'daily' ? 'selected' : ''}>${tr('Daily')}</option><option value="weekly" ${d.frequency === 'weekly' ? 'selected' : ''}>${tr('Weekly')}</option><option value="monthly" ${d.frequency === 'monthly' ? 'selected' : ''}>${tr('Monthly')}</option></select></label><label class="field-label">${tr('Every')}<input id="cleaning-chore-interval" class="input" type="number" min="1" step="1" value="${esc(d.interval)}"></label></div><label class="field-label">${tr('Reminder')}<input id="cleaning-chore-reminder" class="input" type="datetime-local" value="${esc(d.reminder)}"></label>${d.error ? `<p class="validation" role="alert">${esc(d.error)}</p>` : ''}</div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Cancel')}</button><button class="btn btn-primary" type="button" data-action="save-cleaning-chore">${tr('Schedule chore')}</button></div></div>`, 'quick');
  }

  function openModal(ctx, type, projectId = null) {
    ctx.setModalState({ type, draft: { title: '', projectId: projectId || roomProjects(ctx.state)[0]?.id || '', plannedDate: ctx.Core.dateOnly(), plannedTime: '', frequency: 'weekly', interval: 1, reminder: '', error: '' } });
    ctx.renderModal();
    requestAnimationFrame(() => ctx.$('#cleaning-chore-title')?.focus());
  }

  function value(ctx, selector) { return ctx.$(selector)?.value || ''; }

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
      if (route.type === 'modal' && route.modalType === 'cleaning-chore') return renderModal(ctx);
    },
    handleAction(action, event, ctx) {
      const el = event?.target.closest('[data-action], [data-pop-action]');
      if (!el) return false;
      if (handleGroupAction(action, el, ctx)) return true;
      if (action === 'new-cleaning-chore') openModal(ctx, 'cleaning-chore', el.dataset.projectId || null);
      else if (action === 'save-cleaning-chore') saveChore(ctx);
      else if (action === 'add-cleaning-examples') addExamples(ctx, el.dataset.cleaningPreset || 'apartment');
      else if (action === 'cleaning-filter') { (ctx.state.ui ||= {}).cleaningRoomFilter = el.dataset.value || 'all'; ctx.saveAndRender(); }
      else if (action === 'cleaning-archived-fold') { (ctx.state.ui ||= {}).cleaningArchivedOpen = ctx.state.ui.cleaningArchivedOpen !== true; ctx.saveAndRender(); }
      else if (action === 'toggle-cleaning-completed') { const ui = ctx.state.ui || (ctx.state.ui = {}); ui.cleaningCompletedExpanded ||= {}; const id = el.dataset.projectId; ui.cleaningCompletedExpanded[id] = !ui.cleaningCompletedExpanded[id]; ctx.saveAndRender(); }
      else return false;
      return true;
    },
  });
})();
