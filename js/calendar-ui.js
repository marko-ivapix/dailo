(function () {
  'use strict';
  const I18n = window.TodoI18n;
  const { tr, trn, msg } = I18n;

  // UI only: Calendar state and operations are supplied by app.js per call.
  function minutesLabel(minutes) {
    const value = Math.max(0, Math.floor(Number(minutes) || 0));
    return `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }

  function calendarItem(ctx, entry, detail = false, date = ctx.calendarDate(), block = null) {
    const { task, habit, goal, milestone } = entry;
    const id = task?.id || habit?.id || milestone?.id || goal?.id;
    const title = task?.title || habit?.name || milestone?.title || goal?.title;
    const completed = task ? task.isCompleted : milestone ? milestone.isCompleted : goal?.status === 'completed';
    const open = task ? `data-action="open-task" data-task-id="${ctx.esc(id)}"` : `data-route="${habit ? 'habit' : 'goal'}/${ctx.esc(habit ? id : goal.id)}"`;
    const habitStatusLabels = { done: msg('Done'), skipped: msg('Skipped'), missed: msg('Missed'), pending: msg('Pending'), unscheduled: msg('Unscheduled') };
    const metadata = task ? [block ? `${minutesLabel(block.startMinutes)}–${minutesLabel(block.endMinutes)}` : '', entry.kind.includes('planned') ? (task.plannedTime ? tr('Plan · {time}', { time: task.plannedTime }) : tr('Plan')) : '', entry.kind.includes('due') ? (task.dueTime ? tr('Due · {time}', { time: task.dueTime }) : tr('Due')) : '', block?.conflict ? tr('Time conflict') : '', task.isCompleted ? tr('Completed') : ''].filter(Boolean)
      : habit ? [tr('Scheduled'), habit.trackingType === 'numeric' ? `${entry.status.value || 0} / ${habit.targetValue} ${habit.unit || ''}` : (habitStatusLabels[entry.status.status] ? tr(habitStatusLabels[entry.status.status]) : entry.status.status)]
      : milestone ? [tr('Milestone'), goal.title, milestone.isCompleted ? tr('Completed') : tr('Open')] : [tr('Goal target'), ctx.goalProgressLabel(goal), ctx.goalStatusLabel(goal)];
    let actions = '';
    if (detail && task) actions = `<button class="quick-chip" type="button" data-action="toggle-complete" data-task-id="${ctx.esc(id)}">${task.isCompleted ? tr('Reopen') : tr('Complete task')}</button><button class="quick-chip" type="button" data-action="calendar-task-move" data-task-id="${ctx.esc(id)}">${tr('Move')}</button>`;
    if (detail && habit) {
      const disabled = date > ctx.Core.dateOnly() ? 'disabled' : '';
      actions = habit.trackingType === 'numeric' ? (habit.quickValues || []).map(value => `<button class="quick-chip" type="button" data-action="calendar-habit-add" data-habit-id="${ctx.esc(id)}" data-date="${date}" data-value="${value}" ${disabled}>+${value}</button>`).join('') + `<button class="quick-chip" type="button" data-action="calendar-habit-edit" data-habit-id="${ctx.esc(id)}" data-date="${date}" ${disabled}>${tr('Edit value')}</button>` : `<button class="quick-chip" type="button" data-action="calendar-habit-checkin" data-habit-id="${ctx.esc(id)}" data-date="${date}" ${disabled}>${entry.status.status === 'done' ? tr('Undo check-in') : tr('Check in')}</button>`;
    }
    if (detail && goal && !milestone) actions = `<button class="quick-chip" type="button" data-action="calendar-goal-progress" data-goal-id="${ctx.esc(id)}">${tr('Update progress')}</button>`;
    if (detail && milestone) actions = `<button class="quick-chip" type="button" data-action="toggle-milestone" data-goal-id="${ctx.esc(goal.id)}" data-milestone-id="${ctx.esc(id)}">${milestone.isCompleted ? tr('Reopen') : tr('Complete milestone')}</button>`;
    return `<article class="calendar-item calendar-${entry.type} ${block ? 'calendar-timed-block' : ''} ${block?.conflict ? 'has-conflict' : ''} ${completed ? 'is-completed' : ''} ${detail ? 'calendar-item--detail' : ''}" data-calendar-item-id="${ctx.esc(id)}" data-calendar-type="${entry.type}" ${block ? `data-calendar-time="${minutesLabel(block.startMinutes)}"` : ''} ${!detail && task ? 'draggable="true" data-calendar-drag="task"' : ''}><button class="calendar-item-open" type="button" ${open}><span class="calendar-item-type">${entry.type === 'task' ? tr('Task') : entry.type === 'habit' ? tr('Habit') : entry.type === 'milestone' ? tr('Milestone') : tr('Goal')}</span><strong>${ctx.esc(title)}</strong><span class="calendar-item-meta">${metadata.map(value => `<span>${ctx.esc(value)}</span>`).join('')}</span></button>${detail ? `<div class="calendar-quick-actions">${actions}<button class="quick-chip" type="button" ${open}>${task ? tr('Open task') : habit ? tr('Open habit') : tr('Open goal')}</button></div>` : ''}</article>`;
  }

  function timedEntries(ctx, day) {
    const blocksByTaskId = new Map(ctx.Core.getTimedTaskBlocks(day.tasks.map(entry => entry.task), day.date).map(block => [block.taskId, block]));
    const timeBlocks = ctx.Core.calendarTimeBlocks(ctx.state, day.date);
    const blockedIds = new Set(timeBlocks.map(entry => entry.task.id));
    const planned = timeBlocks.map(entry => calendarItem(ctx, entry, false, day.date, blocksByTaskId.get(entry.task.id)));
    const other = day.timed.filter(entry => entry.type !== 'task' || !blockedIds.has(entry.task.id)).map(entry => calendarItem(ctx, entry, false, day.date));
    return planned.concat(other).join('');
  }

  function calendarCounts(counts) {
    const labels = {
      tasks: count => trn(count, '{count} task', '{count} tasks', { count: `<b>${count}</b>` }),
      habits: count => trn(count, '{count} habit', '{count} habits', { count: `<b>${count}</b>` }),
      goals: count => trn(count, '{count} goal', '{count} goals', { count: `<b>${count}</b>` }),
      milestones: count => trn(count, '{count} milestone', '{count} milestones', { count: `<b>${count}</b>` }),
    };
    return Object.entries(counts).filter(([, count]) => count).map(([type, count]) => `<span class="calendar-count calendar-count--${type}">${labels[type](count)}</span>`).join('');
  }

  function calendarCountTotal(counts) {
    return Object.values(counts).reduce((total, count) => total + count, 0);
  }

  function renderCalendar(ctx) {
    const { state, Core, calendarDate, calendarLogs, parseLocalDate, formatDate, pageHeader, esc } = ctx;
    const date = calendarDate(); const view = ['day', 'month'].includes(state.ui.calendarView) ? state.ui.calendarView : 'week';
    const visibility = { tasks: true, habits: true, goals: true, milestones: true, ...(state.ui.calendarVisibility || {}) };
    const weekStart = Core.weekStartFor(date, Core.weekStartKey(state.settings.weekStartsOn)); // the Calendar follows the current week start
    const month = date.slice(0, 7);
    const period = view === 'month' ? new Intl.DateTimeFormat(I18n.locale(), { month: 'long', year: 'numeric' }).format(parseLocalDate(`${month}-01`))
      : view === 'day' ? new Intl.DateTimeFormat(I18n.locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(parseLocalDate(date))
      : `${formatDate(weekStart)} – ${formatDate(Core.addDays(weekStart, 6))}, ${parseLocalDate(date).getFullYear()}`;
    const typeLabels = { tasks: tr('Tasks'), habits: tr('Habits'), goals: tr('Goals'), milestones: tr('Milestones') };
    let html = pageHeader(tr('Calendar'), tr('Plan tasks, goals and habits by date.'), { add: false, actionHtml: `<button class="btn btn-primary" type="button" data-action="calendar-add" data-date="${date}"><i class="ph ph-plus"></i> ${tr('Add')}</button>` });
    html += `<div class="calendar-toolbar"><div class="calendar-navigation"><button class="btn-icon" type="button" data-action="calendar-prev" aria-label="${view === 'month' ? tr('Previous month') : view === 'day' ? tr('Previous day') : tr('Previous week')}"><i class="ph ph-caret-left"></i></button><h2 class="calendar-period">${esc(period)}</h2><button class="btn-icon" type="button" data-action="calendar-next" aria-label="${view === 'month' ? tr('Next month') : view === 'day' ? tr('Next day') : tr('Next week')}"><i class="ph ph-caret-right"></i></button><button class="btn btn-ghost" type="button" data-action="calendar-today">${tr('Today')}</button></div><div class="list-tabs" aria-label="${tr('Calendar view')}">${['day', 'week', 'month'].map(mode => `<button class="btn btn-ghost ${view === mode ? 'is-active' : ''}" type="button" data-action="calendar-view" data-view="${mode}" aria-pressed="${view === mode}">${{ day: tr('Day'), week: tr('Week'), month: tr('Month') }[mode]}</button>`).join('')}</div></div><div class="calendar-visibility" aria-label="${tr('Show calendar types')}"><span>${tr('Show')}</span>${Object.entries(visibility).map(([type, visible]) => `<label><input type="checkbox" data-calendar-visibility="${type}" ${visible ? 'checked' : ''}>${esc(typeLabels[type] || type)}</label>`).join('')}</div>`;
    if (view === 'day') html += renderDayView(ctx, date, visibility);
    else if (view === 'week') {
      const days = Core.deriveCalendarWeek(state, calendarLogs(), weekStart);
      const counts = days.reduce((summary, day) => { for (const entry of [...day.allDay, ...day.timed]) summary[entry.type === 'task' ? 'tasks' : `${entry.type}s`] += 1; return summary; }, { tasks: 0, habits: 0, goals: 0, milestones: 0 });
      html += `<div class="calendar-summary v17-sticky-context"><strong>${trn(calendarCountTotal(counts), '{count} planned in this view', '{count} planned in this view')}</strong><div>${calendarCounts(counts)}</div><span class="calendar-legend"><i class="calendar-legend-dot calendar-legend-dot--tasks"></i> ${tr('Tasks')} <i class="calendar-legend-dot calendar-legend-dot--habits"></i> ${tr('Habits')} <i class="calendar-legend-dot calendar-legend-dot--goals"></i> ${tr('Goals')} <i class="calendar-legend-dot calendar-legend-dot--milestones"></i> ${tr('Milestones')}</span></div>`;
      html += `<div class="calendar-scroll"><div class="calendar-week">${days.map(day => { const count = day.allDay.length + day.timed.length; return `<section class="calendar-day ${day.date === Core.dateOnly() ? 'is-today' : ''} ${day.date === date ? 'is-selected' : ''}" data-calendar-date="${day.date}"><button class="calendar-day-heading" type="button" data-action="calendar-detail" data-date="${day.date}"><span>${new Intl.DateTimeFormat(I18n.locale(), { weekday: 'short' }).format(parseLocalDate(day.date))}</span><strong>${parseLocalDate(day.date).getDate()}</strong><em>${count ? trn(count, '{count} planned', '{count} planned') : tr('Free')}</em></button><div class="calendar-region-label">${tr('All day')}</div><div class="calendar-all-day">${day.allDay.map(entry => calendarItem(ctx, entry, false, day.date)).join('')}</div><div class="calendar-region-label">${tr('Timed')}</div><div class="calendar-timed">${timedEntries(ctx, day)}</div></section>`; }).join('')}</div></div>`;
    } else {
      const days = Core.deriveCalendarMonthSummary(state, calendarLogs(), month);
      const counts = days.reduce((summary, day) => { for (const [type, count] of Object.entries(day.counts)) summary[type] += count; return summary; }, { tasks: 0, habits: 0, goals: 0, milestones: 0 });
      html += `<div class="calendar-summary v17-sticky-context"><strong>${trn(calendarCountTotal(counts), '{count} planned this month', '{count} planned this month')}</strong><div>${calendarCounts(counts)}</div><span class="calendar-legend"><i class="calendar-legend-dot calendar-legend-dot--tasks"></i> ${tr('Tasks')} <i class="calendar-legend-dot calendar-legend-dot--habits"></i> ${tr('Habits')} <i class="calendar-legend-dot calendar-legend-dot--goals"></i> ${tr('Goals')} <i class="calendar-legend-dot calendar-legend-dot--milestones"></i> ${tr('Milestones')}</span></div>`;
      const startDay = parseLocalDate(days[0].date).getDay(); const firstWeekday = Core.weekStartKey(state.settings.weekStartsOn) === 'sunday' ? 0 : 1;
      const offset = (startDay - firstWeekday + 7) % 7;
      html += `<div class="calendar-month">${Array.from({ length: 7 }, (_, i) => `<div class="calendar-weekday">${tr([msg('Sun'), msg('Mon'), msg('Tue'), msg('Wed'), msg('Thu'), msg('Fri'), msg('Sat')][(firstWeekday + i) % 7])}</div>`).join('')}${Array.from({ length: offset }, () => '<div class="calendar-month-blank" aria-hidden="true"></div>').join('')}${days.map(day => { const total = calendarCountTotal(day.counts); return `<button class="calendar-month-day ${day.date === Core.dateOnly() ? 'is-today' : ''} ${day.date === date ? 'is-selected' : ''}" type="button" data-calendar-date="${day.date}" data-action="calendar-detail" data-date="${day.date}"><strong>${parseLocalDate(day.date).getDate()}</strong>${total ? `<span class="calendar-month-total">${trn(total, '{count} planned', '{count} planned')}</span><span class="calendar-counts">${calendarCounts(day.counts)}</span>` : ''}</button>`; }).join('')}</div>`;
    }
    return html;
  }

  // Day view (V1.12): capacity, tasks without a time and an hour grid. Rows and the unscheduled list reuse the calendar drag
  // (data-calendar-drag / data-calendar-time) and the task time input handler (data-task-time).
  function renderDayView(ctx, date, visibility) {
    const { state, Core, esc } = ctx;
    const tasks = visibility.tasks === false ? [] : state.tasks || [];
    const schedule = Core.daySchedule(tasks, date);
    const load = Core.dayLoad(tasks, date);
    const capacity = Core.dailyCapacityMinutes(state.settings);
    let html = '<div class="day-view">';
    if (capacity && load.withDuration) {
      const over = load.minutes > capacity;
      const percent = Math.min(100, Math.round(load.minutes / capacity * 100));
      html += `<div class="day-capacity${over ? ' is-over' : ''}" data-day-capacity role="status"><span>${esc(tr('Planned {planned} of {capacity}', { planned: ctx.durationLabel(load.minutes), capacity: ctx.durationLabel(capacity) }))}</span><span class="day-capacity-bar" aria-hidden="true"><span style="width:${percent}%"></span></span>${over ? `<strong>${esc(tr('Over capacity by {over}', { over: ctx.durationLabel(load.minutes - capacity) }))}</strong>` : ''}</div>`;
    }
    if (!schedule.blocks.length && !schedule.unscheduled.length) {
      return `${html}<p class="area-empty-copy">${tr('No tasks planned for this day.')}</p><button class="btn btn-secondary" type="button" data-action="calendar-new-task" data-date="${esc(date)}"><i class="ph ph-plus"></i> ${tr('Add task')}</button></div>`;
    }
    if (schedule.unscheduled.length) {
      html += `<section class="section day-unscheduled" data-calendar-date="${esc(date)}"><div class="section-header"><h2 class="section-label">${tr('No time yet')}</h2><span class="section-count">${schedule.unscheduled.length}</span></div>${schedule.unscheduled.map(task => `<div class="day-unscheduled-item" draggable="true" data-calendar-drag="task" data-calendar-item-id="${esc(task.id)}"><button class="day-unscheduled-title" type="button" data-action="open-task" data-task-id="${esc(task.id)}">${esc(task.title)}</button><input class="input task-time-input" type="time" data-task-time="plannedTime" data-task-id="${esc(task.id)}" aria-label="${esc(tr('Time for {title}', { title: task.title }))}"></div>`).join('')}</section>`;
    }
    const { startHour, endHour } = schedule.range;
    const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
    const rows = hours.map(hour => `<div class="day-grid-hour" data-calendar-time="${String(hour).padStart(2, '0')}:00"><span class="day-grid-label">${String(hour).padStart(2, '0')}:00</span></div>`).join('');
    const blocks = schedule.blocks.map(block => {
      const classes = ['day-grid-block', block.conflict ? 'has-conflict' : '', block.estimated ? 'is-estimated' : '', block.task.isCompleted ? 'is-completed' : ''].filter(Boolean).join(' ');
      const top = (block.startMinutes - startHour * 60) / 60;
      const height = block.durationMinutes / 60;
      return `<button class="${classes}" type="button" draggable="true" data-calendar-drag="task" data-calendar-item-id="${esc(block.task.id)}" data-action="open-task" data-task-id="${esc(block.task.id)}" style="top:calc(var(--hour-height) * ${top});height:calc(var(--hour-height) * ${height})"><strong>${esc(block.task.title)}</strong><span>${minutesLabel(block.startMinutes)}–${minutesLabel(block.endMinutes)}</span></button>`;
    }).join('');
    return `${html}<div class="day-grid" data-calendar-date="${esc(date)}"><div class="day-grid-rows">${rows}</div><div class="day-grid-blocks">${blocks}</div></div></div>`;
  }

  function renderCalendarDetail(ctx) {
    const { modalState, state, Core, calendarLogs, formatDate, esc, modalFrame } = ctx;
    const date = modalState.date; const day = Core.deriveCalendarDay(state, calendarLogs(), date);
    const allDay = day.allDay.map(entry => calendarItem(ctx, entry, true, date)).join('');
    const blocksByTaskId = new Map(Core.getTimedTaskBlocks(day.tasks.map(entry => entry.task), date).map(block => [block.taskId, block]));
    const timeBlocks = Core.calendarTimeBlocks(state, date);
    const blockedIds = new Set(timeBlocks.map(entry => entry.task.id));
    const timed = timeBlocks.map(entry => calendarItem(ctx, entry, true, date, blocksByTaskId.get(entry.task.id))).concat(day.timed.filter(entry => entry.type !== 'task' || !blockedIds.has(entry.task.id)).map(entry => calendarItem(ctx, entry, true, date))).join('');
    const conflicts = [...blocksByTaskId.values()].filter(block => block.conflict).map(block => `${minutesLabel(block.startMinutes)}–${minutesLabel(block.endMinutes)}`).filter((value, index, values) => values.indexOf(value) === index);
    const counts = { tasks: day.tasks.length, habits: day.habits.length, goals: day.goals.length, milestones: day.milestones.length };
    const total = calendarCountTotal(counts);
    return modalFrame(`<div class="modal-inner calendar-day-detail v17-day-detail" data-detail-date="${date}"><div class="modal-header"><h2 class="modal-title">${tr('Day detail')} · ${date}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><p class="page-subtitle">${esc(formatDate(date, 'full'))}</p>${total ? `<div class="calendar-detail-summary v17-sticky-context"><strong>${trn(total, '{count} planned', '{count} planned')}</strong><span>${calendarCounts(counts)}</span></div>` : ''}${conflicts.length ? `<p class="calendar-conflict-note" role="status"><i class="ph ph-warning"></i> ${tr('Time overlap: {times}', { times: esc(conflicts.join(', ')) })}</p>` : ''}<div class="calendar-detail-items">${timed ? `<section class="calendar-detail-section"><h3>${tr('Timed plan')} · ${day.timed.length}</h3>${timed}</section>` : ''}${allDay ? `<section class="calendar-detail-section"><h3>${tr('All day')} · ${day.allDay.length}</h3>${allDay}</section>` : ''}${!allDay && !timed ? `<p class="area-empty-copy v17-empty-state">${tr('No visible items for this date.')}</p>` : ''}</div><div class="calendar-creation">${['task', 'goal', 'habit'].map(type => `<button class="btn btn-secondary" type="button" data-action="calendar-new-${type}" data-date="${date}"><i class="ph ph-plus"></i> ${type === 'task' ? tr('Task') : type === 'goal' ? tr('Goal') : tr('Habit')}</button>`).join('')}</div></div>`);
  }

  function renderCalendarValue(ctx) {
    const { modalState, state, getHabit, esc, modalFrame } = ctx;
    const { habitId, date } = modalState;
    const value = state.habitLogCache?.[habitId]?.find(log => log.date === date)?.value || 0;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${tr('Edit value')} · ${esc(getHabit(habitId)?.name)}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><label class="field-label">${date}<input class="input" id="calendar-habit-value" type="number" min="0" step="any" value="${value}"></label><button class="btn btn-primary" type="button" data-action="calendar-save-habit-value" data-habit-id="${esc(habitId)}" data-date="${date}">${tr('Save value')}</button></div>`);
  }

  function renderCalendarGoalProgress(ctx) {
    const { modalState, getGoal, esc, modalFrame } = ctx;
    const goal = getGoal(modalState.goalId);
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${tr('Update progress')} · ${esc(goal.title)}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><label class="field-label">${goal.progressType === 'numeric' ? tr('Current value') : tr('Progress percentage')}<input id="goal-current-value" class="input" type="number" value="${goal.currentValue}"></label><button class="btn btn-primary" type="button" data-action="save-goal-progress" data-goal-id="${esc(goal.id)}">${tr('Update progress')}</button></div>`);
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
      if (action === 'calendar-view') { ctx.state.ui.calendarView = ['day', 'month'].includes(element.dataset.view) ? element.dataset.view : 'week'; ctx.saveAndRender(); }
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
