(function () {
  'use strict';
  const { tr, trn, msg } = window.TodoI18n;

  // Redesign R2 (T3, G6): the Today row. Checkbox, title, "time · project" (or area), and on the right the
  // priority flag (high red, medium amber) and the due label. The ⋯ menu stays until R3 moves it to the window.
  function renderTodayTaskRow(task, listContext, options, ctx) {
    const esc = ctx.esc;
    const project = ctx.getProject(task.projectId);
    const place = options.hidePlace ? '' : project ? project.name : ctx.getArea?.(task.areaId)?.name;
    const flag = ['high', 'medium'].includes(task.priority) ? `<i class="ph ph-flag task-flag task-flag--${task.priority}" role="img" aria-label="${tr('{priority} priority', { priority: task.priority === 'high' ? tr('High') : tr('Medium') })}"></i>` : '';
    const due = task.isCompleted ? '' : ctx.todayDueLabel(task.dueDate, ctx.Core.dateOnly());
    // R14 (T3): the flag and the due label lead the meta line under the title; the checkbox closes the row on the right.
    // R11d: Redovne obaveze passes its own meta line (place and repeat sentence); R20: its date leads that line.
    const meta = options.metaText != null ? [options.metaLead, esc(options.metaText)].filter(Boolean).join(' · ') : flag + [due, ...[task.plannedTime, place].filter(Boolean).map(esc)].filter(Boolean).join(' · ');
    const draggable = options.draggable && !task.isCompleted;
    const chip = (action, label) => `<button class="quick-chip" type="button" data-action="${action}" data-task-id="${esc(task.id)}">${label}</button>`;
    // Redesign R6 (I5): an Inbox task is sorted with Danas, Sutra, Kad stignem or Projekat….
    const addToday = options.inbox ? `<div class="quick-actions">${chip('inbox-today', tr('Today'))}${chip('inbox-tomorrow', tr('Tomorrow'))}${chip('inbox-anytime', tr('Anytime'))}${chip('inbox-project', tr('Project…'))}</div>`
      : options.addToday ? `<div class="quick-actions">${chip('inbox-today', `+ ${tr('Today')}`)}</div>` : '';
    return `<article class="task-row task-row--today ${task.isCompleted ? 'is-completed' : ''}" data-task-row-compact data-task-id="${esc(task.id)}" data-list-context="${esc(listContext)}" ${draggable ? 'draggable="true"' : ''}>
      <div class="task-main-wrap"><div class="task-main" data-action="open-task" data-task-id="${esc(task.id)}" role="button" tabindex="0"><div class="task-title">${esc(task.title)}</div>${meta ? `<div class="task-meta">${meta}</div>` : ''}</div>${addToday}</div>
      <div class="task-actions" data-task-compact-actions><button class="btn-icon" type="button" data-action="task-menu" data-task-id="${esc(task.id)}" aria-label="${tr('Task actions')}"><i class="ph ph-dots-three"></i></button></div>
      <button class="complete-control ${task.isCompleted ? 'is-completed' : ''}" type="button" data-action="toggle-complete" data-inline-today-complete data-task-id="${esc(task.id)}" aria-label="${task.isCompleted ? tr('Mark incomplete') : tr('Complete task')}">${task.isCompleted ? '<i class="ph ph-check"></i>' : ''}</button>
    </article>`;
  }

  function renderTaskRow(task, listContext, options, ctx) {
    // R34: every list draws the compact row of the redesign (R2); the older row is gone.
    return renderTodayTaskRow(task, listContext, options, ctx);
  }

  // R17: the title, ×, then the round check on the right, like task rows.
  function subtaskRow(task, subtask, ctx) {
    return `<div class="subtask-row ${subtask.isCompleted ? 'is-completed' : ''}" draggable="true" data-subtask-id="${ctx.esc(subtask.id)}" data-parent-task-id="${ctx.esc(task.id)}"><span class="subtask-title" data-action="edit-subtask" data-task-id="${ctx.esc(task.id)}" data-subtask-id="${ctx.esc(subtask.id)}" tabindex="0">${ctx.esc(subtask.title)}</span><button class="btn-icon" type="button" data-action="delete-subtask" data-task-id="${ctx.esc(task.id)}" data-subtask-id="${ctx.esc(subtask.id)}" aria-label="${tr('Delete subtask')}"><i class="ph ph-x"></i></button><button class="complete-control ${subtask.isCompleted ? 'is-completed' : ''}" type="button" data-action="toggle-subtask" data-task-id="${ctx.esc(task.id)}" data-subtask-id="${ctx.esc(subtask.id)}" aria-label="${subtask.isCompleted ? tr('Mark subtask incomplete') : tr('Complete subtask')}">${subtask.isCompleted ? '<i class="ph ph-check"></i>' : ''}</button></div>`;
  }

  // Redesign R3 (D1–D4, E1): the task window. The title and the project link on top, then Planiranje and
  // Organizacija rows that open their sheets (every change saves at once), subtasks, notes, attachments and the
  // folded "Više opcija". One large button at the bottom completes or reopens the task.
  function renderTaskModal(ctx) {
    const { modalState, getTask, getProject, getArea, state, Core, esc, relativeDateLabel, tagSummary, priorityLabel, formatReminder, recurrenceLabel, renderAttachmentsSection, clampOrder, modalFrame, durationLabel } = ctx;
    const task = getTask(modalState.taskId);
    if (!task) return '';
    const project = getProject(task.projectId);
    const projectArea = project ? getArea(project.areaId) : null;
    const completedCount = task.subtasks.filter(s => s.isCompleted).length;
    const today = Core.dateOnly();
    const when = (date, time) => (date ? esc(`${relativeDateLabel(date)}${time ? ` · ${time}` : ''}`) : '');
    const dueClass = task.dueDate && !task.isCompleted ? (task.dueDate < today ? ' is-overdue' : task.dueDate === today ? ' is-today' : '') : '';
    const row = (action, icon, label, value, extra = '') => `<button class="task-window-row" type="button" data-action="${action}" data-task-id="${esc(task.id)}"><i class="ph ${icon}" aria-hidden="true"></i><span class="task-window-row-label">${label}</span><span class="task-window-row-value${value ? ` is-set${extra}` : ''}">${value || tr('Not set')}</span><i class="ph ph-caret-right task-window-row-caret" aria-hidden="true"></i></button>`;
    const priority = task.priority && task.priority !== 'none' ? `<i class="ph ph-flag task-flag task-flag--${esc(task.priority)}" aria-hidden="true"></i>${esc(priorityLabel(task.priority))}` : '';
    return modalFrame(`<div class="modal-inner task-window">
      <div class="modal-header task-window-header"><span id="task-modal-title" class="task-window-kind">${task.isInbox ? tr('Task in Inbox') : tr('Task')}</span><div class="task-window-actions"><button class="btn-icon" type="button" data-action="task-menu" data-task-id="${esc(task.id)}" aria-label="${tr('Task actions')}"><i class="ph ph-dots-three"></i></button><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div></div>
      ${modalState.error ? `<div class="validation task-modal-error">${esc(modalState.error)}</div>` : ''}
      <textarea id="detail-title" class="modal-task-title task-window-title" rows="1" maxlength="500" data-autogrow aria-label="${tr('Task title')}">${esc(modalState.titleDraft)}</textarea>
      <button class="task-window-project" type="button" data-action="task-project-picker" data-task-id="${esc(task.id)}"><i class="ph ph-folder-simple" aria-hidden="true"></i>${project ? esc(project.name) : tr('No project')}</button>
      <h3 class="task-window-group">${tr('Planning')}</h3>
      <div class="task-window-card">${row('task-plan-picker', 'ph-calendar-check', tr('Planned'), when(task.plannedDate, task.plannedTime))}${row('task-due-picker', 'ph-hourglass-medium', tr('Due date'), when(task.dueDate, task.dueTime), dueClass)}${row('task-reminder-picker', 'ph-bell', tr('Reminder'), task.reminderAt ? esc(formatReminder(task.reminderAt)) : '')}${row('task-repeat-picker', 'ph-arrows-clockwise', tr('Repeat'), task.recurrence ? esc(recurrenceLabel(task.recurrence)) : '')}${row('task-duration-picker', 'ph-timer', tr('Duration'), task.durationMinutes ? esc(durationLabel(task.durationMinutes)) : '')}</div>
      <h3 class="task-window-group">${tr('Organization')}</h3>
      <div class="task-window-card">${row('task-tags-picker', 'ph-tag', tr('Tags'), tagSummary(task.tagIds) || '')}${row('task-priority-picker', 'ph-flag', tr('Priority'), priority)}</div>
      <h3 class="task-window-group">${tr('Subtasks')} · ${completedCount}/${task.subtasks.length}</h3>
      <div class="task-window-card"><div class="subtask-list" data-subtask-list="${esc(task.id)}">${[...task.subtasks].sort((a,b)=>clampOrder(a.order)-clampOrder(b.order)).map(s => subtaskRow(task, s, ctx)).join('')}</div><div class="add-subtask-input"><input id="detail-subtask" class="input" type="text" placeholder="${tr('Add subtask...')}" data-task-id="${esc(task.id)}" /></div></div>
      <label class="task-window-group" for="detail-notes">${tr('Notes')}</label><textarea id="detail-notes" class="detail-notes" placeholder="${tr('Add notes...')}">${esc(modalState.notesDraft)}</textarea>
      <div class="task-window-attachments">${renderAttachmentsSection({ ownerType: 'task', ownerId: task.id })}</div>
      <!-- R33 (finding 22): Oblast and Ciljevi are rows with sheets, like the rest of the window. -->
      <details class="task-window-more"><summary><span>${tr('More options')}</span><span class="task-window-more-meta">${tr('Area, goals')}</span><i class="ph ph-caret-right task-window-more-caret" aria-hidden="true"></i></summary>
        <div class="task-window-card">${project ? `<div class="task-window-row is-static"><i class="ph ph-squares-four" aria-hidden="true"></i><span class="task-window-row-label">${tr('Area')}</span><span class="task-window-row-value is-set">${projectArea ? esc(projectArea.name) : tr('Inherited from project')}</span></div>` : row('task-area-picker', 'ph-squares-four', tr('Area'), esc(getArea(task.areaId)?.name || ''))}${row('task-goals-picker', 'ph-target', tr('Goals'), (task.goalIds || []).length ? esc(trn(task.goalIds.length, '{count} linked', '{count} linked')) : '')}</div>
      </details>
      <div class="task-window-footer"><button class="btn ${task.isCompleted ? 'btn-secondary' : 'btn-primary'} task-complete-button" type="button" data-action="toggle-complete" data-task-id="${esc(task.id)}">${task.isCompleted ? tr('Reopen task') : tr('Complete task')}</button></div>
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
  });
})();
