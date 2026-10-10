(function () {
  'use strict';
  const { tr, trn, msg } = window.TodoI18n;

  // Redesign R2 (T3, G6): the Today row. Checkbox, title, "time · project" (or area), and on the right the
  // priority flag (high red, medium amber) and the due label. The ⋯ menu stays until R3 moves it to the window.
  function renderTodayTaskRow(task, listContext, options, ctx) {
    const esc = ctx.esc;
    const project = ctx.getProject(task.projectId);
    const place = project ? project.name : ctx.getArea?.(task.areaId)?.name;
    const meta = [task.plannedTime, place].filter(Boolean).join(' · ');
    const flag = ['high', 'medium'].includes(task.priority) ? `<i class="ph ph-flag task-flag task-flag--${task.priority}" role="img" aria-label="${tr('{priority} priority', { priority: task.priority === 'high' ? tr('High') : tr('Medium') })}"></i>` : '';
    const due = task.isCompleted ? '' : ctx.todayDueLabel(task.dueDate, ctx.Core.dateOnly());
    const draggable = options.draggable && !task.isCompleted;
    const addToday = options.addToday ? `<div class="quick-actions"><button class="quick-chip" type="button" data-action="inbox-today" data-task-id="${esc(task.id)}">+ ${tr('Today')}</button></div>` : '';
    return `<article class="task-row task-row--today ${task.isCompleted ? 'is-completed' : ''}" data-task-row-compact data-task-id="${esc(task.id)}" data-list-context="${esc(listContext)}" ${draggable ? 'draggable="true"' : ''}>
      <button class="complete-control ${task.isCompleted ? 'is-completed' : ''}" type="button" data-action="toggle-complete" data-inline-today-complete data-task-id="${esc(task.id)}" aria-label="${task.isCompleted ? tr('Mark incomplete') : tr('Complete task')}">${task.isCompleted ? '<i class="ph ph-check"></i>' : ''}</button>
      <div class="task-main" data-action="open-task" data-task-id="${esc(task.id)}" role="button" tabindex="0"><div class="task-title">${esc(task.title)}</div>${meta ? `<div class="task-meta">${esc(meta)}</div>` : ''}${addToday}</div>
      <span class="task-side">${flag}${due}</span>
      <div class="task-actions" data-task-compact-actions><button class="btn-icon" type="button" data-action="task-menu" data-task-id="${esc(task.id)}" aria-label="${tr('Task actions')}"><i class="ph ph-dots-three"></i></button></div>
    </article>`;
  }

  function renderTaskRow(task, listContext, options, ctx) {
    if (options?.today) return renderTodayTaskRow(task, listContext, options, ctx);
    const project = ctx.getProject(task.projectId);
    const today = ctx.Core.dateOnly();
    const meta = [];
    if (project) meta.push(`<span class="task-meta-project"><span class="project-dot" style="--project-color:${ctx.esc(project.color)}"></span>${ctx.esc(project.name)}</span>`);
    if (task.dueDate) {
      let cls = '';
      let label = tr('Due {date}', { date: ctx.relativeDateLabel(task.dueDate, today) });
      if (!task.isCompleted && task.dueDate < today) { cls = 'danger'; label = tr('Overdue · {date}', { date: ctx.relativeDateLabel(task.dueDate, today) }); }
      else if (task.dueDate === today) cls = 'warning';
      meta.push(`<span class="${cls}">${ctx.esc(label)}</span>`);
    }
    if (task.isImportant) meta.push(`<span class="warning"><i class="ph ph-warning-circle"></i> ${tr('Important')}</span>`);
    if (task.isUrgent) meta.push(`<span class="danger"><i class="ph ph-lightning"></i> ${tr('Urgent')}</span>`);
    if (task.durationMinutes) meta.push(`<span>${tr('{minutes} min', { minutes: ctx.esc(task.durationMinutes) })}</span>`);
    if (options.upcomingReason === 'planned' && task.plannedDate) meta.push(`<span>${tr('Planned {date}', { date: ctx.esc(ctx.relativeDateLabel(task.plannedDate, today)) })}</span>`);
    if (options.suggestionReason === 'missed-plan') meta.push(`<span>${tr('Missed {date}', { date: ctx.esc(ctx.relativeDateLabel(task.plannedDate, today)) })}</span>`);
    if (task.isCompleted && task.completedAt) meta.push(`<span class="success">${tr('Completed {date}', { date: ctx.esc(ctx.relativeDateLabel(ctx.Core.localDateOf(String(task.completedAt)), today)) })}</span>`);
    const combinedMeta = meta.map((m, i) => `${i ? '<span class="separator">·</span>' : ''}${m}`).join('');
    const draggable = options.draggable && !task.isCompleted;
    const rowClass = `task-row ${task.isCompleted ? 'is-completed' : ''}`;
    return `<article class="${rowClass}" data-task-row-compact data-task-id="${ctx.esc(task.id)}" data-list-context="${ctx.esc(listContext)}" ${draggable ? 'draggable="true"' : ''}>
      <button class="complete-control ${task.isCompleted ? 'is-completed' : ''}" type="button" data-action="toggle-complete" ${listContext === 'today' || listContext === 'focus' ? 'data-inline-today-complete' : ''} data-task-id="${ctx.esc(task.id)}" aria-label="${task.isCompleted ? tr('Mark incomplete') : tr('Complete task')}">${task.isCompleted ? '<i class="ph ph-check"></i>' : ''}</button>
      <div class="task-main" data-action="open-task" data-task-id="${ctx.esc(task.id)}" role="button" tabindex="0">
        <div class="task-title">${ctx.esc(task.title)}</div>
        ${combinedMeta ? `<div class="task-meta">${combinedMeta}</div>` : ''}
        ${options.inbox || options.upcoming || options.overdue ? `<div class="quick-actions">${options.inbox || options.overdue ? `<button class="quick-chip" type="button" data-action="inbox-today" data-task-id="${ctx.esc(task.id)}">${tr('Today')}</button>` : ''}${options.inbox || options.upcoming ? `<button class="quick-chip" type="button" data-action="inbox-tomorrow" data-task-id="${ctx.esc(task.id)}">${options.upcoming ? tr('Snooze 1 day') : tr('Tomorrow')}</button>` : ''}${options.inbox ? `<button class="quick-chip" type="button" data-action="inbox-anytime" data-task-id="${ctx.esc(task.id)}">${tr('Anytime')}</button><button class="quick-chip" type="button" data-action="task-project-picker" data-task-id="${ctx.esc(task.id)}">${tr('Project')}</button><button class="quick-chip" type="button" data-action="task-due-picker" data-task-id="${ctx.esc(task.id)}">${tr('Date')}</button>` : ''}</div>` : ''}
      </div>
      <div class="task-actions" data-task-compact-actions>${(listContext === 'today' || listContext === 'focus') && !task.isCompleted ? `<button class="btn-icon" type="button" data-action="toggle-focus-task" data-task-id="${ctx.esc(task.id)}" aria-label="${ctx.state.settings.focusTaskIds.includes(task.id) ? tr('Remove from daily focus') : tr('Add to daily focus')}" aria-pressed="${ctx.state.settings.focusTaskIds.includes(task.id)}"><i class="ph ph-crosshair"></i></button><button class="btn-icon" type="button" data-action="task-plan-picker" data-task-id="${ctx.esc(task.id)}" aria-label="${tr('Plan task')}"><i class="ph ph-calendar-check"></i></button>` : ''}<button class="btn-icon" type="button" data-action="task-menu" data-task-id="${ctx.esc(task.id)}" aria-label="${tr('Task actions')}"><i class="ph ph-dots-three"></i></button></div>
    </article>`;
  }

  function subtaskRow(task, subtask, ctx) {
    return `<div class="subtask-row ${subtask.isCompleted ? 'is-completed' : ''}" draggable="true" data-subtask-id="${ctx.esc(subtask.id)}" data-parent-task-id="${ctx.esc(task.id)}"><button class="complete-control ${subtask.isCompleted ? 'is-completed' : ''}" type="button" data-action="toggle-subtask" data-task-id="${ctx.esc(task.id)}" data-subtask-id="${ctx.esc(subtask.id)}" aria-label="${subtask.isCompleted ? tr('Mark subtask incomplete') : tr('Complete subtask')}">${subtask.isCompleted ? '<i class="ph ph-check"></i>' : ''}</button><span class="subtask-title" data-action="edit-subtask" data-task-id="${ctx.esc(task.id)}" data-subtask-id="${ctx.esc(subtask.id)}" tabindex="0">${ctx.esc(subtask.title)}</span><button class="btn-icon" type="button" data-action="delete-subtask" data-task-id="${ctx.esc(task.id)}" data-subtask-id="${ctx.esc(subtask.id)}" aria-label="${tr('Delete subtask')}"><i class="ph ph-x"></i></button></div>`;
  }

  function renderTaskModal(ctx) {
    const { modalState, getTask, getProject, getArea, state, Core, esc, relativeDateLabel, tagSummary, priorityIcon, priorityLabel, formatReminder, recurrenceLabel, renderAttachmentsSection, clampOrder, modalFrame } = ctx;
    const task = getTask(modalState.taskId);
    if (!task) return '';
    const project = getProject(task.projectId);
    const projectArea = project ? getArea(project.areaId) : null;
    const taskArea = projectArea || getArea(task.areaId);
    const goalOptions = (state.goals || []).filter(goal => goal.status !== 'archived' || (task.goalIds || []).includes(goal.id));
    const completedCount = task.subtasks.filter(s => s.isCompleted).length;
    const today = Core.dateOnly();
    const dueClass = task.dueDate && !task.isCompleted && task.dueDate < today ? 'danger' : (task.dueDate === today ? 'warning' : '');
    const quickProject = project ? `<span class="project-dot" style="--project-color:${esc(project.color)}"></span>${esc(project.name)}` : tr('Project');
    const quickPlan = task.plannedDate ? esc(relativeDateLabel(task.plannedDate)) : tr('Plan for');
    const quickDue = task.dueDate ? tr('Due {date}', { date: esc(relativeDateLabel(task.dueDate)) }) : tr('Due date');
    return modalFrame(`<div class="modal-inner">
      <span id="task-modal-title" class="sr-only">${tr('Edit task')}</span>
      <div class="modal-header"><div class="modal-task-title-wrap"><button class="complete-control ${task.isCompleted ? 'is-completed' : ''}" type="button" data-action="toggle-complete" data-task-id="${esc(task.id)}" aria-label="${task.isCompleted ? tr('Mark incomplete') : tr('Complete task')}">${task.isCompleted ? '<i class="ph ph-check"></i>' : ''}</button><input id="detail-title" class="modal-task-title" type="text" maxlength="500" value="${esc(modalState.titleDraft)}" aria-label="${tr('Task title')}" /></div><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div>
      ${modalState.error ? `<div class="validation task-modal-error">${esc(modalState.error)}</div>` : ''}
      <div class="task-quick-properties" aria-label="${tr('Task essentials')}"><button class="property-chip" type="button" data-action="task-project-picker" data-task-id="${esc(task.id)}"><i class="ph ph-folder-simple"></i>${quickProject}</button><button class="property-chip" type="button" data-action="task-plan-picker" data-task-id="${esc(task.id)}"><i class="ph ph-calendar-check"></i>${quickPlan}</button><button class="property-chip" type="button" data-action="task-due-picker" data-task-id="${esc(task.id)}"><i class="ph ph-flag"></i>${quickDue}</button><button class="property-chip" type="button" data-action="task-tags-picker" data-task-id="${esc(task.id)}"><i class="ph ph-tag"></i>${tagSummary(task.tagIds) || tr('Tags')}</button></div>
      <div class="detail-section task-notes-field"><label class="detail-heading" for="detail-notes"><span>${tr('Notes')}</span></label><textarea id="detail-notes" class="detail-notes" placeholder="${tr('Add notes...')}">${esc(modalState.notesDraft)}</textarea></div>
      <details class="detail-section detail-disclosure task-properties-disclosure">
        <summary class="detail-heading task-properties-summary"><span>${tr('Task properties')}</span><span class="detail-summary-meta">${task.isImportant || task.isUrgent ? tr('Priority flags') : tr('Optional')}</span><i class="ph ph-caret-right task-properties-caret" aria-hidden="true"></i></summary>
        <div class="task-properties-content">
          <label class="property-row" for="detail-duration-minutes"><span class="property-key">${tr('Duration (minutes)')}</span><input id="detail-duration-minutes" class="input task-time-input" type="number" min="1" step="1" value="${esc(task.durationMinutes || '')}" data-task-duration data-task-id="${esc(task.id)}"></label>
          <button class="property-row" type="button" data-action="toggle-focus-task" data-task-id="${esc(task.id)}" ${task.isCompleted ? 'disabled' : ''} aria-pressed="${state.settings.focusTaskIds.includes(task.id)}"><span class="property-key">${tr('Daily focus')}</span><span class="property-value">${state.settings.focusTaskIds.includes(task.id) ? tr('Remove from focus') : tr('Add to focus (max 3)')}</span></button>
          <div class="task-property-group task-property-group--organization"><div class="task-property-group-label">${tr('Organization')}</div><label class="property-row" for="detail-area"><span class="property-key">${tr('Area')}</span>${project ? `<span class="property-value">${projectArea ? esc(projectArea.name) : tr('Inherited from project')}</span>` : `<select id="detail-area" class="input task-property-select" data-task-area="${esc(task.id)}"><option value="">${tr('No area')}</option>${(state.areas || []).filter(area => area.status === 'active' || area.id === task.areaId).map(area => `<option value="${esc(area.id)}" ${area.id === task.areaId ? 'selected' : ''}>${esc(area.name)}</option>`).join('')}</select>`}</label><details class="task-goals-disclosure"><summary class="property-row"><span class="property-key">${tr('Goals')}</span><span class="property-value">${(task.goalIds || []).length ? trn(task.goalIds.length, '{count} linked', '{count} linked') : tr('No goals')}</span></summary><div class="task-goal-options">${goalOptions.length ? goalOptions.map(goal => `<label><input type="checkbox" data-task-goal="${esc(task.id)}" value="${esc(goal.id)}" ${(task.goalIds || []).includes(goal.id) ? 'checked' : ''}>${esc(goal.title)}</label>`).join('') : `<span class="area-empty-copy">${tr('No Goals yet.')}</span>`}</div></details><button class="property-row" type="button" data-action="task-tags-picker" data-task-id="${esc(task.id)}"><span class="property-key">${tr('Tags')}</span><span class="property-value">${tagSummary(task.tagIds) || tr('No tags')}</span></button></div>
          <div class="task-property-group task-property-group--focus"><div class="task-property-group-label">${tr('Focus')}</div><button class="property-row" type="button" data-action="task-priority-picker" data-task-id="${esc(task.id)}"><span class="property-key">${tr('Priority')}</span><span class="property-value priority-value">${priorityIcon(task.priority)}${esc(priorityLabel(task.priority))}</span></button><label class="property-row task-flag-row"><span class="property-key">${tr('Important')}</span><input type="checkbox" data-task-flag="isImportant" data-task-id="${esc(task.id)}" ${task.isImportant ? 'checked' : ''} aria-label="${tr('Mark task important')}"></label><label class="property-row task-flag-row"><span class="property-key">${tr('Urgent')}</span><input type="checkbox" data-task-flag="isUrgent" data-task-id="${esc(task.id)}" ${task.isUrgent ? 'checked' : ''} aria-label="${tr('Mark task urgent')}"></label><button class="property-row" type="button" data-action="open-focus-task" data-task-id="${esc(task.id)}"><span class="property-key">${tr('Focus')}</span><span class="property-value"><span class="btn btn-secondary task-focus-chip"><i class="ph ph-crosshair"></i> ${tr('Start focus')}</span></span></button><button class="property-row" type="button" data-action="task-reminder-picker" data-task-id="${esc(task.id)}"><span class="property-key">${tr('Reminder')}</span><span class="property-value">${task.reminderAt ? esc(formatReminder(task.reminderAt)) : tr('No reminder')}</span></button><button class="property-row" type="button" data-action="task-repeat-picker" data-task-id="${esc(task.id)}"><span class="property-key">${tr('Repeat')}</span><span class="property-value">${esc(recurrenceLabel(task.recurrence))}</span></button></div>
        </div>
      </details>
      <details class="detail-section detail-disclosure task-schedule-disclosure">
        <summary class="detail-heading task-properties-summary"><span>${tr('Schedule')}</span><span class="detail-summary-meta">${task.plannedDate || task.dueDate ? tr('Scheduled') : tr('Optional')}</span><i class="ph ph-caret-right task-properties-caret" aria-hidden="true"></i></summary>
        <div class="task-properties-content"><div class="task-property-group task-property-group--schedule"><button class="property-row" type="button" data-action="task-plan-picker" data-task-id="${esc(task.id)}"><span class="property-key">${tr('Plan for')}</span><span class="property-value">${task.plannedDate ? esc(relativeDateLabel(task.plannedDate)) : tr('Not planned')}</span></button><button class="property-row" type="button" data-action="task-due-picker" data-task-id="${esc(task.id)}"><span class="property-key">${tr('Due date')}</span><span class="property-value"><span class="${dueClass}">${task.dueDate ? esc(relativeDateLabel(task.dueDate)) : tr('No due date')}</span></span></button><label class="property-row" for="detail-planned-time"><span class="property-key">${tr('Planned time')}</span><input id="detail-planned-time" class="input task-time-input" type="time" value="${esc(task.plannedTime || '')}" data-task-time="plannedTime" data-task-id="${esc(task.id)}"></label><label class="property-row" for="detail-due-time"><span class="property-key">${tr('Due time')}</span><input id="detail-due-time" class="input task-time-input" type="time" value="${esc(task.dueTime || '')}" data-task-time="dueTime" data-task-id="${esc(task.id)}"></label></div></div>
      </details>
      <details class="detail-section detail-disclosure task-links-notes-disclosure">
        <summary class="detail-heading task-properties-summary"><span>${esc(tr('Links & notes'))}</span><span class="detail-summary-meta">${(task.attachmentIds || []).length ? tr('Files added') : tr('Optional')}</span><i class="ph ph-caret-right task-properties-caret" aria-hidden="true"></i></summary>
        <div class="task-links-notes-content">${renderAttachmentsSection({ ownerType: 'task', ownerId: task.id })}</div>
      </details>
      <div class="detail-section"><div class="detail-heading"><span>${tr('Subtasks')}</span><span>${completedCount} / ${task.subtasks.length}</span></div><div class="subtask-list" data-subtask-list="${esc(task.id)}">${[...task.subtasks].sort((a,b)=>clampOrder(a.order)-clampOrder(b.order)).map(s => subtaskRow(task, s, ctx)).join('')}</div><div class="add-subtask-input"><span></span><input id="detail-subtask" class="input" type="text" placeholder="${tr('Add subtask...')}" data-task-id="${esc(task.id)}" /></div></div>
      <div class="detail-section" style="padding-bottom:0"><button class="danger-link" type="button" data-action="delete-task" data-task-id="${esc(task.id)}"><i class="ph ph-trash"></i> ${tr('Delete task')}</button></div>
    </div>`, 'task-detail-modal', 'aria-labelledby="task-modal-title"');
  }

  window.TodoDomainModules?.register({
    name: 'tasks',
    renderTaskRow(task, listContext, options, ctx) {
      return renderTaskRow(task, listContext, options, ctx);
    },
    renderRoute(route, ctx) {
      if (route.type === 'modal' && route.modalType === 'task') return renderTaskModal(ctx);
    },
    handleInput(event, ctx) {
      if (ctx.modalState?.type !== 'task') return false;
      const input = event.target;
      if (input.matches('[data-task-area]') && event.type === 'change') {
        const task = ctx.getTask(input.dataset.taskArea);
        if (!task || task.projectId) return true;
        task.areaId = input.value || null;
        task.updatedAt = ctx.nowIso();
        ctx.saveAndRender();
        return true;
      }
      if (input.matches('[data-task-goal]') && event.type === 'change') {
        const task = ctx.getTask(input.dataset.taskGoal);
        if (!task) return true;
        const selected = [...ctx.$$('[data-task-goal]:checked')].map(item => item.value);
        const previous = new Set(task.goalIds || []);
        task.goalIds = selected;
        for (const goal of ctx.state.goals || []) {
          const ids = new Set(goal.taskIds || []);
          if (selected.includes(goal.id) && !ids.has(task.id)) ids.add(task.id);
          else if (!selected.includes(goal.id) && previous.has(goal.id)) ids.delete(task.id);
          goal.taskIds = [...ids];
        }
        task.updatedAt = ctx.nowIso();
        ctx.saveAndRender();
        return true;
      }
      return false;
    }
  });
})();
