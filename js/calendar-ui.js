(function () {
  'use strict';

  // UI only: Calendar state and operations are supplied by app.js per call.
  function calendarItem(ctx, entry, detail = false, date = ctx.calendarDate()) {
    const { task, habit, goal, milestone } = entry;
    const id = task?.id || habit?.id || milestone?.id || goal?.id;
    const title = task?.title || habit?.name || milestone?.title || goal?.title;
    const completed = task ? task.isCompleted : milestone ? milestone.isCompleted : goal?.status === 'completed';
    const open = task ? `data-action="open-task" data-task-id="${ctx.esc(id)}"` : `data-route="${habit ? 'habit' : 'goal'}/${ctx.esc(habit ? id : goal.id)}"`;
    const metadata = task ? [entry.kind.includes('planned') ? `Planned${task.plannedTime ? ` ${task.plannedTime}` : ''}` : '', entry.kind.includes('due') ? `Due${task.dueTime ? ` ${task.dueTime}` : ''}` : '', task.isCompleted ? 'Completed' : ''].filter(Boolean).join(' · ')
      : habit ? `${habit.trackingType === 'numeric' ? `${entry.status.value || 0} / ${habit.targetValue} ${habit.unit || ''} · ` : ''}${entry.status.status}`
      : milestone ? `Milestone · ${goal.title}${milestone.isCompleted ? ' · Completed' : ''}` : `Goal · ${ctx.goalStatusLabel(goal)} · ${ctx.goalProgressLabel(goal)}`;
    let actions = '';
    if (detail && task) actions = `<button class="quick-chip" type="button" data-action="toggle-complete" data-task-id="${ctx.esc(id)}">${task.isCompleted ? 'Reopen' : 'Complete'}</button><button class="quick-chip" type="button" data-action="calendar-task-move" data-task-id="${ctx.esc(id)}">Move</button>`;
    if (detail && habit) {
      const disabled = date > ctx.Core.dateOnly() ? 'disabled' : '';
      actions = habit.trackingType === 'numeric' ? (habit.quickValues || []).map(value => `<button class="quick-chip" type="button" data-action="calendar-habit-add" data-habit-id="${ctx.esc(id)}" data-date="${date}" data-value="${value}" ${disabled}>+${value}</button>`).join('') + `<button class="quick-chip" type="button" data-action="calendar-habit-edit" data-habit-id="${ctx.esc(id)}" data-date="${date}" ${disabled}>Edit value</button>` : `<button class="quick-chip" type="button" data-action="calendar-habit-checkin" data-habit-id="${ctx.esc(id)}" data-date="${date}" ${disabled}>${entry.status.status === 'done' ? 'Undo check-in' : 'Check in'}</button>`;
    }
    if (detail && goal && !milestone) actions = `<button class="quick-chip" type="button" data-action="calendar-goal-progress" data-goal-id="${ctx.esc(id)}">Update progress</button>`;
    if (detail && milestone) actions = `<button class="quick-chip" type="button" data-action="toggle-milestone" data-goal-id="${ctx.esc(goal.id)}" data-milestone-id="${ctx.esc(id)}">${milestone.isCompleted ? 'Reopen' : 'Complete'}</button>`;
    return `<article class="calendar-item calendar-${entry.type} ${completed ? 'is-completed' : ''} ${detail ? 'calendar-item--detail' : ''}" data-calendar-item-id="${ctx.esc(id)}" data-calendar-type="${entry.type}" ${!detail && (task || (!milestone && goal)) ? `draggable="true" data-calendar-drag="${entry.type}"` : ''}><button class="calendar-item-open" type="button" ${open}><span class="calendar-item-type">${entry.type === 'task' ? 'Task' : entry.type === 'habit' ? 'Habit' : entry.type === 'milestone' ? 'Milestone' : 'Goal'}</span><strong>${ctx.esc(title)}</strong><small>${ctx.esc(metadata)}</small></button>${detail ? `<div class="calendar-quick-actions">${actions}<button class="quick-chip" type="button" ${open}>${milestone ? 'Open Goal' : 'Open'}</button></div>` : ''}</article>`;
  }

  function calendarCounts(counts) {
    return Object.entries(counts).filter(([, count]) => count).map(([type, count]) => `${count} ${count === 1 ? type.slice(0, -1) : type}`).join(' · ');
  }

  function renderCalendar(ctx) {
    const { state, Core, calendarDate, calendarLogs, parseLocalDate, formatDate, pageHeader, esc } = ctx;
    const date = calendarDate(); const view = state.ui.calendarView === 'month' ? 'month' : 'week';
    const visibility = { tasks: true, habits: true, goals: true, milestones: true, ...(state.ui.calendarVisibility || {}) };
    const weekStart = Core.habitPeriodKey({ frequencyType: 'timesPerWeek' }, date, state.settings.weekStartsOn || 'monday');
    const month = date.slice(0, 7);
    const period = view === 'month' ? new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(parseLocalDate(`${month}-01`)) : `${formatDate(weekStart)} – ${formatDate(Core.addDays(weekStart, 6))}, ${parseLocalDate(date).getFullYear()}`;
    let html = pageHeader('Calendar', 'Plan tasks, goals and habits by date.', { add: false, actionHtml: `<button class="btn btn-primary" type="button" data-action="calendar-add" data-date="${date}"><i class="ph ph-plus"></i> Add</button>` });
    html += `<div class="calendar-toolbar"><div class="calendar-navigation"><button class="btn-icon" type="button" data-action="calendar-prev" aria-label="Previous ${view}"><i class="ph ph-caret-left"></i></button><h2 class="calendar-period">${esc(period)}</h2><button class="btn-icon" type="button" data-action="calendar-next" aria-label="Next ${view}"><i class="ph ph-caret-right"></i></button><button class="btn btn-ghost" type="button" data-action="calendar-today">Today</button></div><div class="list-tabs" aria-label="Calendar view">${['week', 'month'].map(mode => `<button class="btn btn-ghost ${view === mode ? 'is-active' : ''}" type="button" data-action="calendar-view" data-view="${mode}" aria-pressed="${view === mode}">${mode === 'week' ? 'Week' : 'Month'}</button>`).join('')}</div></div><div class="calendar-visibility" aria-label="Show calendar types"><span>Show</span>${Object.entries(visibility).map(([type, visible]) => `<label><input type="checkbox" data-calendar-visibility="${type}" ${visible ? 'checked' : ''}>${type[0].toUpperCase() + type.slice(1)}</label>`).join('')}</div>`;
    if (view === 'week') {
      const days = Core.deriveCalendarWeek(state, calendarLogs(), weekStart);
      html += `<div class="calendar-scroll"><div class="calendar-week">${days.map(day => `<section class="calendar-day ${day.date === Core.dateOnly() ? 'is-today' : ''} ${day.date === date ? 'is-selected' : ''}" data-calendar-date="${day.date}"><button class="calendar-day-heading" type="button" data-action="calendar-detail" data-date="${day.date}"><span>${new Intl.DateTimeFormat('en', { weekday: 'short' }).format(parseLocalDate(day.date))}</span><strong>${parseLocalDate(day.date).getDate()}</strong></button><div class="calendar-region-label">All day</div><div class="calendar-all-day">${day.allDay.map(entry => calendarItem(ctx, entry, false, day.date)).join('')}</div><div class="calendar-region-label">Timed</div><div class="calendar-timed">${day.timed.map(entry => calendarItem(ctx, entry, false, day.date)).join('')}</div></section>`).join('')}</div></div>`;
    } else {
      const days = Core.deriveCalendarMonthSummary(state, calendarLogs(), month);
      const startDay = parseLocalDate(days[0].date).getDay(); const firstWeekday = state.settings.weekStartsOn === 'sunday' ? 0 : 1;
      const offset = (startDay - firstWeekday + 7) % 7;
      html += `<div class="calendar-month">${Array.from({ length: 7 }, (_, i) => `<div class="calendar-weekday">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][(firstWeekday + i) % 7]}</div>`).join('')}${Array.from({ length: offset }, () => '<div class="calendar-month-blank" aria-hidden="true"></div>').join('')}${days.map(day => `<button class="calendar-month-day ${day.date === Core.dateOnly() ? 'is-today' : ''} ${day.date === date ? 'is-selected' : ''}" type="button" data-calendar-date="${day.date}" data-action="calendar-detail" data-date="${day.date}"><strong>${parseLocalDate(day.date).getDate()}</strong><span class="calendar-counts">${esc(calendarCounts(day.counts))}</span></button>`).join('')}</div>`;
    }
    return html;
  }

  function renderCalendarDetail(ctx) {
    const { modalState, state, Core, calendarLogs, formatDate, esc, modalFrame } = ctx;
    const date = modalState.date; const day = Core.deriveCalendarDay(state, calendarLogs(), date);
    const allDay = day.allDay.map(entry => calendarItem(ctx, entry, true, date)).join('');
    const timed = day.timed.map(entry => calendarItem(ctx, entry, true, date)).join('');
    return modalFrame(`<div class="modal-inner calendar-day-detail" data-detail-date="${date}"><div class="modal-header"><h2 class="modal-title">Day Detail · ${date}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><p class="page-subtitle">${esc(formatDate(date, 'full'))}</p><div class="calendar-detail-items">${allDay ? `<section class="calendar-detail-section"><h3>All day</h3>${allDay}</section>` : ''}${timed ? `<section class="calendar-detail-section"><h3>Timed</h3>${timed}</section>` : ''}${!allDay && !timed ? '<p class="area-empty-copy">No visible items for this date.</p>' : ''}</div><div class="calendar-creation">${['task', 'goal', 'habit'].map(type => `<button class="btn btn-secondary" type="button" data-action="calendar-new-${type}" data-date="${date}"><i class="ph ph-plus"></i> ${type[0].toUpperCase() + type.slice(1)}</button>`).join('')}</div></div>`);
  }

  function renderCalendarValue(ctx) {
    const { modalState, state, getHabit, esc, modalFrame } = ctx;
    const { habitId, date } = modalState;
    const value = state.habitLogCache?.[habitId]?.find(log => log.date === date)?.value || 0;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">Edit value · ${esc(getHabit(habitId)?.name)}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><label class="field-label">${date}<input class="input" id="calendar-habit-value" type="number" min="0" step="any" value="${value}"></label><button class="btn btn-primary" type="button" data-action="calendar-save-habit-value" data-habit-id="${esc(habitId)}" data-date="${date}">Save value</button></div>`);
  }

  function renderCalendarGoalProgress(ctx) {
    const { modalState, getGoal, esc, modalFrame } = ctx;
    const goal = getGoal(modalState.goalId);
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">Update progress · ${esc(goal.title)}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><label class="field-label">${goal.progressType === 'numeric' ? 'Current value' : 'Progress percentage'}<input id="goal-current-value" class="input" type="number" value="${goal.currentValue}"></label><button class="btn btn-primary" type="button" data-action="save-goal-progress" data-goal-id="${esc(goal.id)}">Update progress</button></div>`);
  }

  window.TodoDomainModules?.register({
    name: 'calendar',
    renderRoute(route, ctx) {
      if (route.type === 'calendar') return renderCalendar(ctx);
      if (route.type !== 'modal') return undefined;
      if (route.modalType === 'calendar-day') return renderCalendarDetail(ctx);
      if (route.modalType === 'calendar-value') return renderCalendarValue(ctx);
      if (route.modalType === 'calendar-progress') return renderCalendarGoalProgress(ctx);
    },
    handleAction(action, event, ctx) {
      const element = event?.target?.closest?.('[data-action]');
      if (!element) return false;
      if (action === 'calendar-view') { ctx.state.ui.calendarView = element.dataset.view === 'month' ? 'month' : 'week'; ctx.saveAndRender(); }
      else if (action === 'calendar-prev') ctx.navigateCalendar(-1);
      else if (action === 'calendar-next') ctx.navigateCalendar(1);
      else if (action === 'calendar-today') { ctx.state.ui.calendarDate = ctx.Core.dateOnly(); ctx.saveAndRender(); }
      else if (action === 'calendar-detail' || action === 'calendar-add') ctx.openCalendarDetail(element.dataset.date);
      else if (action === 'calendar-new-task') ctx.openQuickAdd({ plannedDate: element.dataset.date });
      else if (action === 'calendar-new-goal') ctx.openGoalModal(null, { targetDate: element.dataset.date });
      else if (action === 'calendar-new-habit') ctx.openHabitModal(null, { startDate: element.dataset.date });
      else if (action === 'calendar-task-move') ctx.openPlanPicker(element, { type: 'task', taskId: element.dataset.taskId });
      else if (action === 'calendar-habit-checkin') ctx.calendarHabitAction(element, 'check').catch(console.error);
      else if (action === 'calendar-habit-add') ctx.calendarHabitAction(element, 'add').catch(console.error);
      else if (action === 'calendar-habit-edit') ctx.openCalendarValue(element.dataset.habitId, element.dataset.date);
      else if (action === 'calendar-save-habit-value') {
        const date = element.dataset.date;
        ctx.setHabitLog(element.dataset.habitId, date, 'done', Number(ctx.$('#calendar-habit-value')?.value || 0)).then(saved => { if (saved && ctx.modalState?.type === 'calendar-value') ctx.openCalendarDetail(date); }).catch(console.error);
      } else if (action === 'calendar-goal-progress') ctx.openCalendarGoalProgress(element.dataset.goalId);
      else return false;
      return true;
    },
    handleInput(event, ctx) {
      if (!event.target.matches('[data-calendar-visibility]')) return false;
      ctx.state.ui.calendarVisibility = { tasks: true, habits: true, goals: true, milestones: true, ...(ctx.state.ui.calendarVisibility || {}), [event.target.dataset.calendarVisibility]: event.target.checked };
      ctx.saveAndRender();
      return true;
    }
  });
})();
