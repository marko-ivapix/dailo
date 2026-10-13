(function () {
  'use strict';
  const I18n = window.TodoI18n;
  const { tr, trn, msg } = I18n;

  // UI only: Calendar state and operations are supplied by app.js per call.
  // Redesign R7 (C1–C9): Nedelja, Mesec and Predstojeće; a selected day with "Lista / Raspored". No habits (C2),
  // no filter (C7), no Day Detail window; the tasks come through ctx.listTasks(), so archived projects stay out (S10).
  const VIEWS = ['week', 'month', 'upcoming'];
  const UPCOMING_DAYS = 21;
  const WEEKDAYS = [msg('Sun'), msg('Mon'), msg('Tue'), msg('Wed'), msg('Thu'), msg('Fri'), msg('Sat')];

  function minutesLabel(minutes) {
    const value = Math.max(0, Math.floor(Number(minutes) || 0));
    return `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }

  function capitalized(text) {
    return text.charAt(0).toLocaleUpperCase(I18n.locale()) + text.slice(1);
  }

  function listed(ctx) {
    return { ...ctx.state, tasks: ctx.listTasks() };
  }

  function viewSwitch(view) {
    const labels = { week: tr('Week'), month: tr('Month'), upcoming: tr('Upcoming') };
    return `<div class="view-tabs calendar-view-switch" role="group" aria-label="${tr('Calendar view')}">${VIEWS.map(mode => `<button class="btn${view === mode ? ' is-selected' : ''}" type="button" data-action="calendar-view" data-view="${mode}" aria-pressed="${view === mode}">${labels[mode]}</button>`).join('')}</div>`;
  }

  function periodBar(ctx, label, unit) {
    const previous = unit === 'month' ? tr('Previous month') : tr('Previous week');
    const next = unit === 'month' ? tr('Next month') : tr('Next week');
    // R47d (K8): a wide screen has "Danas" next to the arrows (CSS); the phone keeps C1 without it.
    return `<div class="calendar-period-bar"><h2 class="calendar-period">${ctx.esc(label)}</h2><span class="calendar-arrows"><button class="btn btn-secondary calendar-today" type="button" data-action="calendar-today">${tr('Today')}</button><button class="btn-icon" type="button" data-action="calendar-prev" aria-label="${previous}"><i class="ph ph-caret-left"></i></button><button class="btn-icon" type="button" data-action="calendar-next" aria-label="${next}"><i class="ph ph-caret-right"></i></button></span></div>`;
  }

  // The day button speaks its date and count, since the dot is only visual (C5).
  function dayLabel(ctx, date, items) {
    return ctx.esc(items.count ? `${ctx.formatDate(date, 'full')}, ${trn(items.count, '{count} planned', '{count} planned')}` : ctx.formatDate(date, 'full'));
  }

  // R37 (F): a day with only coming repeats gets a hollow dot.
  function dot(items, repeats = []) {
    return `<i class="calendar-dot${items.count ? '' : repeats.length ? ' is-repeat' : ' is-empty'}" aria-hidden="true"></i>`;
  }

  // R37 (F): the coming dates of repeating tasks, shown and never stored; a row opens the task that repeats.
  function repeatRows(ctx, date, repeats) {
    return (repeats[date] || []).map(({ task }) => `<button class="today-row calendar-repeat-row" type="button" data-action="open-task" data-task-id="${ctx.esc(task.id)}"><i class="ph ph-arrows-clockwise calendar-repeat-icon" aria-hidden="true"></i><span class="today-row-main"><span class="task-title">${ctx.esc(task.title)}</span><span class="task-meta">${ctx.esc([tr('Repeats'), task.plannedTime].filter(Boolean).join(' · '))}</span></span></button>`).join('');
  }

  // Wide screens show each week day as a column of cards; a task card drags to another day (C3).
  function cards(ctx, items) {
    const task = item => `<button class="calendar-card" type="button" draggable="true" data-calendar-drag="task" data-calendar-item-id="${ctx.esc(item.id)}" data-action="open-task" data-task-id="${ctx.esc(item.id)}">${item.plannedTime && items.timed.includes(item) ? `<b>${ctx.esc(item.plannedTime)}${item.durationMinutes ? ` · ${ctx.esc(ctx.durationLabel(item.durationMinutes))}` : ''}</b>` : ''}${ctx.esc(item.title)}</button>`;
    const deadline = ({ goal, milestone }) => `<button class="calendar-card is-deadline" type="button" data-route="goal/${ctx.esc(goal.id)}"><i class="ph ph-target" aria-hidden="true"></i>${ctx.esc(milestone ? milestone.title : goal.title)}</button>`;
    return `<div class="calendar-cards">${[...items.timed.map(task), ...items.deadlines.map(deadline), ...items.untimed.map(task)].join('')}</div>`;
  }

  // R47d (K8): wide screens give each week day a thin bar of its planned time against the daily capacity.
  function dayLoadBar(ctx, date) {
    const capacity = ctx.Core.dailyCapacityMinutes(ctx.state.settings);
    const load = ctx.Core.dayLoad(ctx.listTasks(), date);
    if (!capacity || !load.minutes) return '';
    const percent = Math.min(100, Math.round(load.minutes / capacity * 100));
    return `<span class="calendar-load${load.minutes > capacity ? ' is-over' : ''}" title="${ctx.esc(tr('Planned {planned} of {capacity}', { planned: ctx.durationLabel(load.minutes), capacity: ctx.durationLabel(capacity) }))}" aria-hidden="true"><span style="width:${percent}%"></span></span>`;
  }

  // R47d (K8): on a wide screen a month day lists up to three titles in the day list's order, then "+N još".
  function monthTitles(ctx, items) {
    const titles = [...items.timed.map(task => task.title), ...items.deadlines.map(({ goal, milestone }) => (milestone ? milestone.title : goal.title)), ...items.untimed.map(task => task.title)];
    if (!titles.length) return '';
    const more = titles.length - 3;
    return `<small class="calendar-month-titles">${titles.slice(0, 3).map(title => `<span class="calendar-month-title">${ctx.esc(title)}</span>`).join('')}${more > 0 ? `<span class="calendar-month-more">${ctx.esc(tr('+{count} more', { count: more }))}</span>` : ''}</small>`;
  }

  function renderWeek(ctx, selected) {
    const { state, Core } = ctx;
    const source = listed(ctx);
    const today = Core.dateOnly();
    const weekStart = Core.weekStartFor(selected, Core.weekStartKey(state.settings.weekStartsOn)); // the Calendar follows the current week start
    const days = Array.from({ length: 7 }, (_, index) => Core.addDays(weekStart, index));
    const first = ctx.parseLocalDate(days[0]);
    const last = ctx.parseLocalDate(days[6]);
    const format = new Intl.DateTimeFormat(I18n.locale(), { day: 'numeric', month: 'short', year: 'numeric' });
    const label = typeof format.formatRange === 'function' ? format.formatRange(first, last) : `${ctx.formatDate(days[0])} – ${ctx.formatDate(days[6])}`;
    const weekday = new Intl.DateTimeFormat(I18n.locale(), { weekday: 'short' });
    const strip = days.map(date => {
      const items = Core.calendarDayItems(source, date);
      const classes = `${date === today ? ' is-today' : ''}${date === selected ? ' is-selected' : ''}`;
      // R47d (K8): the load bar and, from today on, "+ Dodaj" for that day (both only on a wide screen).
      const add = date >= today ? `<button class="calendar-day-add" type="button" data-action="quick-add" data-date="${date}" aria-label="${ctx.esc(tr('Add a task for {date}', { date: ctx.formatDate(date, 'full') }))}"><i class="ph ph-plus" aria-hidden="true"></i> ${tr('Add')}</button>` : '';
      return `<section class="calendar-strip-day${classes}" data-calendar-date="${date}"><button class="calendar-strip-heading" type="button" data-action="calendar-pick" data-date="${date}" aria-pressed="${date === selected}" aria-label="${dayLabel(ctx, date, items)}"><span class="calendar-strip-weekday">${ctx.esc(capitalized(weekday.format(ctx.parseLocalDate(date))))}</span><strong>${ctx.parseLocalDate(date).getDate()}</strong>${dot(items)}</button>${dayLoadBar(ctx, date)}${cards(ctx, items)}${add}</section>`;
    }).join('');
    return `${periodBar(ctx, label, 'week')}<div class="calendar-strip">${strip}</div>`;
  }

  function renderMonth(ctx, selected) {
    const { state, Core } = ctx;
    const source = listed(ctx);
    const today = Core.dateOnly();
    const first = ctx.parseLocalDate(`${selected.slice(0, 7)}-01`);
    const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const firstWeekday = Core.weekStartKey(state.settings.weekStartsOn) === 'sunday' ? 0 : 1;
    const offset = (first.getDay() - firstWeekday + 7) % 7;
    const label = capitalized(new Intl.DateTimeFormat(I18n.locale(), { month: 'long', year: 'numeric' }).format(first));
    const names = Array.from({ length: 7 }, (_, index) => `<span class="calendar-grid-weekday">${tr(WEEKDAYS[(firstWeekday + index) % 7])}</span>`).join('');
    const blanks = '<span class="calendar-grid-blank" aria-hidden="true"></span>'.repeat(offset);
    const repeats = Core.calendarRepeats(source.tasks, Core.addDays(today, 1), Core.addDays(Core.dateOnly(first), length - 1));
    const cells = Array.from({ length }, (_, index) => {
      const date = Core.addDays(Core.dateOnly(first), index);
      const items = Core.calendarDayItems(source, date);
      const classes = `${date === today ? ' is-today' : ''}${date === selected ? ' is-selected' : ''}`;
      return `<button class="calendar-month-cell${classes}" type="button" data-action="calendar-pick" data-date="${date}" aria-pressed="${date === selected}" aria-label="${dayLabel(ctx, date, items)}"><span>${index + 1}</span>${dot(items, repeats[date])}${monthTitles(ctx, items)}</button>`;
    }).join('');
    return `${periodBar(ctx, label, 'month')}<div class="calendar-month-grid">${names}${blanks}${cells}</div>`;
  }

  // The Today rows (C4): timed tasks by time, then the deadlines with the target icon, then the untimed tasks.
  function dayRows(ctx, items) {
    return [...items.timed.map(task => ctx.calendarTaskRow(task)), ...items.deadlines.map(item => ctx.deadlineRow(item)), ...items.untimed.map(task => ctx.calendarTaskRow(task))].join('');
  }

  function emptyDay(past = false) {
    return `<p class="today-empty">${past ? tr('Nothing open on this day.') : tr('No tasks for this day. “+” adds a task for this day.')}</p>`;
  }

  // R31 (finding 15): a past day also shows what was completed on it, folded.
  function pastDayDone(ctx, date) {
    const done = ctx.listTasks().filter(task => task.isCompleted && task.completedAt && ctx.Core.localDateOf(String(task.completedAt)) === date);
    if (!done.length) return '';
    const open = ctx.state.ui.calendarDoneExpanded === true;
    return `<section class="section calendar-day-done">${ctx.foldButton('toggle-calendar-done', tr('Completed this day'), done.length, open)}${open ? `<div class="task-list today-card" data-list-context="calendar">${done.map(task => ctx.calendarTaskRow(task)).join('')}</div>` : ''}</section>`;
  }

  function renderDayPanel(ctx, date) {
    const mode = ctx.state.ui.calendarDayMode === 'schedule' ? 'schedule' : 'list';
    const labels = { list: tr('List'), schedule: tr('Schedule') };
    const head = `<div class="calendar-day-head"><h2 class="calendar-day-title">${ctx.esc(ctx.formatDate(date, 'full'))}</h2><div class="view-tabs calendar-day-mode" role="group" aria-label="${tr('Day view')}">${['list', 'schedule'].map(key => `<button class="btn${mode === key ? ' is-selected' : ''}" type="button" data-action="calendar-day-mode" data-mode="${key}" aria-pressed="${mode === key}">${labels[key]}</button>`).join('')}</div></div>`;
    let body;
    if (mode === 'schedule') body = renderDayView(ctx, date);
    else {
      const source = listed(ctx);
      const items = ctx.Core.calendarDayItems(source, date);
      const repeats = date > ctx.Core.dateOnly() ? ctx.Core.calendarRepeats(source.tasks, date, date) : {};
      const rows = dayRows(ctx, items) + repeatRows(ctx, date, repeats);
      body = rows ? `<div class="task-list today-card" data-list-context="calendar">${rows}</div>` : `<div class="today-card">${emptyDay(date < ctx.Core.dateOnly())}</div>`;
    }
    if (date < ctx.Core.dateOnly()) body += pastDayDone(ctx, date);
    return `<section class="calendar-day-panel" data-calendar-day="${date}">${head}${body}</section>`;
  }

  // Predstojeće (C9): the next 21 days from tomorrow, grouped by day; it replaced the separate Upcoming screen.
  function renderUpcomingDays(ctx) {
    const { Core } = ctx;
    const source = listed(ctx);
    const today = Core.dateOnly();
    const weekday = new Intl.DateTimeFormat(I18n.locale(), { weekday: 'long' });
    const repeats = Core.calendarRepeats(source.tasks, Core.addDays(today, 1), Core.addDays(today, UPCOMING_DAYS));
    let html = '';
    for (let offset = 1; offset <= UPCOMING_DAYS; offset += 1) {
      const date = Core.addDays(today, offset);
      const items = Core.calendarDayItems(source, date);
      if (!items.count && !repeats[date]) continue;
      const label = offset === 1 ? tr('Tomorrow') : capitalized(weekday.format(ctx.parseLocalDate(date)));
      html += `<section class="calendar-upcoming-day" data-upcoming-date="${date}"><h2 class="section-label calendar-upcoming-label">${ctx.esc(label)} <span>· ${ctx.esc(ctx.formatDate(date))}</span></h2><div class="task-list today-card" data-list-context="calendar">${dayRows(ctx, items)}${repeatRows(ctx, date, repeats)}</div></section>`;
    }
    // R67: then the tasks with only a rough month, under each month.
    for (const group of Core.deriveRoughMonths(source.tasks, today, Core.addDays(today, UPCOMING_DAYS))) {
      html += `<section class="calendar-upcoming-day" data-upcoming-month="${group.month}"><h2 class="section-label calendar-upcoming-label">${ctx.esc(capitalized(ctx.plannedMonthLabel(group.month)))} <span>· ${tr('approximately')}</span></h2><div class="task-list today-card" data-list-context="calendar">${group.items.map(task => ctx.calendarTaskRow(task)).join('')}</div></section>`;
    }
    // R17: the usual empty state.
    return html || ctx.emptyState(tr('Nothing in the coming days'), tr('Planned tasks, due dates and deadlines of the next three weeks appear here.'));
  }

  function renderCalendar(ctx, routeView = null) {
    const view = routeView || (VIEWS.includes(ctx.state.ui.calendarView) ? ctx.state.ui.calendarView : 'week');
    const html = ctx.pageHeader(tr('Calendar'), '', { add: false }) + viewSwitch(view);
    if (view === 'upcoming') return html + renderUpcomingDays(ctx);
    const date = ctx.calendarDate();
    return html + (view === 'month' ? renderMonth(ctx, date) : renderWeek(ctx, date)) + renderDayPanel(ctx, date);
  }

  // Raspored (C6), the V1.12 day view: capacity, tasks without a time and an hour grid. Rows and the unscheduled
  // list reuse the calendar drag (data-calendar-drag / data-calendar-time) and the time input handler (data-task-time).
  function renderDayView(ctx, date) {
    const { state, Core, esc } = ctx;
    const tasks = ctx.listTasks();
    const schedule = Core.daySchedule(tasks, date);
    // R31 (finding 10): Raspored also lists the day's deadlines that Lista shows (tasks due that day, goals, milestones).
    const items = Core.calendarDayItems(listed(ctx), date);
    const dueTasks = items.untimed.filter(task => !task.plannedDate);
    const dueRows = [...items.deadlines.map(item => ctx.deadlineRow(item)), ...dueTasks.map(task => ctx.calendarTaskRow(task))];
    const load = Core.dayLoad(tasks, date);
    const capacity = Core.dailyCapacityMinutes(state.settings);
    let html = '<div class="day-view">';
    if (capacity && load.withDuration) {
      const over = load.minutes > capacity;
      const percent = Math.min(100, Math.round(load.minutes / capacity * 100));
      html += `<div class="day-capacity${over ? ' is-over' : ''}" data-day-capacity role="status"><span>${esc(tr('Planned {planned} of {capacity}', { planned: ctx.durationLabel(load.minutes), capacity: ctx.durationLabel(capacity) }))}</span><span class="day-capacity-bar" aria-hidden="true"><span style="width:${percent}%"></span></span>${over ? `<strong>${esc(tr('Over capacity by {over}', { over: ctx.durationLabel(load.minutes - capacity) }))}</strong>` : ''}</div>`;
    }
    if (!schedule.blocks.length && !schedule.unscheduled.length && !dueRows.length) return `${html}${emptyDay(date < Core.dateOnly())}</div>`;
    if (dueRows.length) html += `<section class="section day-deadlines"><div class="section-header"><h2 class="section-label">${tr('Due this day')}</h2><span class="section-count">${dueRows.length}</span></div><div class="task-list today-card" data-list-context="calendar">${dueRows.join('')}</div></section>`;
    if (!schedule.blocks.length && !schedule.unscheduled.length) return `${html}</div>`;
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
      return `<button class="${classes}" type="button" draggable="true" data-calendar-drag="task" data-calendar-item-id="${esc(block.task.id)}" data-action="open-task" data-task-id="${esc(block.task.id)}" style="top:calc(var(--hour-height) * ${top});height:calc(var(--hour-height) * ${height});--lane:${block.lane};--lanes:${block.lanes}"><strong>${esc(block.task.title)}</strong><span>${minutesLabel(block.startMinutes)}–${minutesLabel(block.endMinutes)}</span></button>`;
    }).join('');
    // R31: today has a line at the current time.
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nowLine = date === Core.dateOnly() && nowMinutes >= startHour * 60 && nowMinutes < endHour * 60 ? `<span class="day-grid-now" style="top:calc(var(--hour-height) * ${(nowMinutes - startHour * 60) / 60})" aria-hidden="true"></span>` : '';
    return `${html}<div class="day-grid" data-calendar-date="${esc(date)}"><div class="day-grid-rows">${rows}</div><div class="day-grid-blocks">${blocks}</div>${nowLine}</div></div>`;
  }

  window.TodoDomainModules?.register({
    name: 'calendar',
    renderRoute(route, ctx) {
      if (route.type === 'calendar') return renderCalendar(ctx);
      if (route.type === 'upcoming') return renderCalendar(ctx, 'upcoming'); // the old route (sidebar, U, Weekly review)
      return undefined;
    },
    handleAction(action, event, ctx) {
      const element = event?.target?.closest?.('[data-action]');
      if (!element) return false;
      if (action === 'calendar-view') {
        ctx.state.ui.calendarView = VIEWS.includes(element.dataset.view) ? element.dataset.view : 'week';
        if (ctx.currentRoute().type === 'upcoming') { ctx.saveState(); ctx.navigate('calendar'); } else ctx.saveAndRender();
      } else if (action === 'calendar-prev') ctx.navigateCalendar(-1);
      else if (action === 'calendar-next') ctx.navigateCalendar(1);
      else if (action === 'calendar-pick') {
        if (ctx.Core.parseDateOnly(element.dataset.date)) { ctx.state.ui.calendarDate = element.dataset.date; ctx.saveAndRender(); }
      } else if (action === 'calendar-day-mode') { ctx.state.ui.calendarDayMode = element.dataset.mode === 'schedule' ? 'schedule' : 'list'; ctx.saveAndRender(); }
      else if (action === 'toggle-calendar-done') { ctx.state.ui.calendarDoneExpanded = ctx.state.ui.calendarDoneExpanded !== true; ctx.saveAndRender(); }
      else return false;
      return true;
    }
  });
})();
