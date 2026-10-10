(function () {
  'use strict';
  const I18n = window.TodoI18n;
  const { tr, trn, msg } = I18n;

  // UI only: live state, persistence, metrics and overlay ownership remain in app.js.
  // Routine labels are translation keys; the daily routine reads "Daytime" so it never shares a
  // key with the "Daily" frequency.
  const ROUTINES = Object.freeze({ morning: msg('Morning'), daily: msg('Daytime'), night: msg('Night') });
  const ROUTINE_ICONS = Object.freeze({ morning: 'ph-sun', daily: 'ph-sun-horizon', night: 'ph-moon' });
  // Persisted habit and day statuses stay English enums; only their display is translated.
  const STATUS_LABELS = Object.freeze({ active: msg('Active'), paused: msg('Paused'), archived: msg('Archived'), done: msg('Done'), missed: msg('Missed'), skipped: msg('Skipped'), pending: msg('Pending'), unscheduled: msg('Unscheduled') });
  const statusLabel = status => (Object.prototype.hasOwnProperty.call(STATUS_LABELS, status) ? tr(STATUS_LABELS[status]) : status);
  const routineLabel = routine => (ROUTINES[routine || 'daily'] ? tr(ROUTINES[routine || 'daily']) : '');

  // Redesign R8b: Svaki dan, Radnim danima, Vikendom or the days; Jednom / N puta nedeljno; Svaki drugi dan / Na svaka N dana.
  const WEEKDAY_KEYS = [msg('Sun'), msg('Mon'), msg('Tue'), msg('Wed'), msg('Thu'), msg('Fri'), msg('Sat')];
  function habitFrequencyLabel(ctx, habit) {
    if (habit.frequencyType === 'weekdays') {
      const days = [...new Set((habit.weekdays || []).map(Number))].filter(day => day >= 0 && day <= 6);
      const key = [...days].sort().join();
      if (days.length === 7) return tr('Daily');
      if (key === '1,2,3,4,5') return tr('On workdays');
      if (key === '0,6') return tr('On weekends');
      const sundayFirst = ctx.Core.weekStartKey(ctx.state?.settings?.weekStartsOn) === 'sunday';
      const order = day => (sundayFirst ? day : (day + 6) % 7);
      return tr('Weekdays {days}', { days: days.sort((a, b) => order(a) - order(b)).map(day => tr(WEEKDAY_KEYS[day])).join(', ') });
    }
    if (habit.frequencyType === 'timesPerWeek') return Number(habit.timesPerWeek) === 1 ? tr('Once a week') : trn(habit.timesPerWeek || 1, '{count} time/week', '{count} times/week');
    if (habit.frequencyType === 'everyNDays') return Number(habit.everyNDays) === 2 ? tr('Every other day') : trn(habit.everyNDays || 1, 'Once every {count} day', 'Once every {count} days');
    return tr('Daily');
  }

  // Redesign R10a (S2): a compact row with the frequency that opens the habit details window.
  function renderHabitListRow(ctx, habit) {
    const { esc } = ctx;
    return `<div class="today-row area-habit-row"><button class="today-row-main" type="button" data-route="habit/${esc(habit.id)}"><span class="task-title">${esc(habit.name)}</span><span class="task-meta">${esc(habitFrequencyLabel(ctx, habit))}</span></button></div>`;
  }

  function habitProgressLabel(ctx, habit, metrics = ctx.habitMetrics(habit)) {
    // A numeric target describes one check-in; X/week is a separate weekly
    // target and must remain visible when both are configured.
    if (habit.frequencyType === 'timesPerWeek') return tr('{count} / {target} this week', { count: metrics.currentPeriodCount || 0, target: metrics.currentPeriodTarget || habit.timesPerWeek || 1 });
    if (habit.trackingType === 'numeric') return `${metrics.currentPeriodCount || 0} / ${habit.targetValue || 0}${habit.unit ? ` ${habit.unit}` : ''}`;
    return metrics.currentPeriodCount ? tr('Done') : tr('Not checked in');
  }

  function renderHabitRow(ctx, habit, todayStatus = null) {
    const { habitMetrics, esc } = ctx;
    const metrics = habitMetrics(habit);
    const actions = !todayStatus ? '' : habit.trackingType === 'numeric'
      ? `${(habit.quickValues || []).map(value => `<button class="btn btn-secondary" type="button" data-action="habit-quick-add" data-habit-id="${esc(habit.id)}" data-value="${esc(value)}">+${esc(value)}</button>`).join('')}<button class="btn btn-ghost" type="button" data-route="habit/${esc(habit.id)}">${tr('Edit total')}</button>`
      : `<button class="btn btn-secondary" type="button" data-action="habit-checkin" data-habit-id="${esc(habit.id)}">${todayStatus.status === 'done' ? tr('Mark not done') : tr('Check in')}</button><button class="btn btn-ghost" type="button" data-action="habit-skip" data-habit-id="${esc(habit.id)}">${tr('Skip today')}</button>`;
    const menu = `<button class="btn-icon" type="button" data-action="habit-menu" data-habit-id="${esc(habit.id)}" aria-label="${tr('Habit actions')}"><i class="ph ph-dots-three"></i></button>`;
    const status = todayStatus?.status || habit.status;
    return `<article class="habit-row habit-row--${esc(status)}"${todayStatus ? ' style="grid-template-columns:minmax(0,1fr) auto"' : ''}><button class="habit-open" type="button" data-route="habit/${esc(habit.id)}"><span><strong>${esc(habit.name)}</strong><small class="habit-row-meta"><span>${esc(routineLabel(habit.routine))}</span><span>${esc(habitFrequencyLabel(ctx, habit))}</span><span class="habit-status habit-status--${esc(status)}">${esc(statusLabel(status))}</span></small></span><span class="habit-progress">${esc(habitProgressLabel(ctx, habit, metrics))}</span></button>${todayStatus ? `<div class="habit-checkin-controls">${actions}${menu}</div>` : menu}</article>`;
  }

  // Redesign R2 (T5, H6): the compact Today row. A round check (a tap checks in; numeric habits open the value
  // sheet), the name (opens the menu, as does a long press on the check) and the week or the value on the right.
  const number = value => Number(value || 0).toLocaleString(I18n.locale(), { maximumFractionDigits: 2 });
  function habitCircle(state, fraction) {
    if (state === 'done') return '<svg class="habit-circle is-done" viewBox="0 0 28 28" aria-hidden="true"><circle class="habit-circle-fill" cx="14" cy="14" r="12.5"/><path class="habit-circle-tick" d="M8.5 14.5l3.5 3.5 7.5-8"/></svg>';
    if (state === 'skipped') return '<svg class="habit-circle is-skipped" viewBox="0 0 28 28" aria-hidden="true"><circle class="habit-circle-dashed" cx="14" cy="14" r="11"/></svg>';
    const arc = fraction > 0 ? `<circle class="habit-circle-arc" cx="14" cy="14" r="11" stroke-dasharray="${(fraction * 69.115).toFixed(1)} 69.1" transform="rotate(-90 14 14)"/>` : '';
    return `<svg class="habit-circle" viewBox="0 0 28 28" aria-hidden="true"><circle class="habit-circle-track" cx="14" cy="14" r="11"/>${arc}</svg>`;
  }

  // Redesign R8a (H2): the Habits screen's Dan reuses this row for any day (`options.date`), with a line under the
  // name (`options.meta`); `options.count: false` leaves out the weekly count when the line already has it.
  function renderHabitTodayRow(ctx, habit, todayStatus = {}, options = {}) {
    const { esc, habitMetrics } = ctx;
    const date = options.date && options.date !== ctx.Core.dateOnly() ? options.date : null;
    const dateAttr = date ? ` data-date="${esc(date)}"` : '';
    const status = todayStatus?.status || 'pending';
    const numeric = habit.trackingType === 'numeric';
    let fraction = 0; let right = '';
    if (numeric) {
      const target = Number(habit.targetValue) || 0;
      fraction = target > 0 ? Math.min(1, Number(todayStatus?.value || 0) / target) : 0;
      right = `${number(todayStatus?.value)} / ${number(target)}${habit.unit ? ` ${habit.unit}` : ''}`;
    } else if (habit.frequencyType === 'timesPerWeek') {
      const metrics = habitMetrics(habit);
      fraction = metrics.currentPeriodTarget > 0 ? Math.min(1, metrics.currentPeriodCount / metrics.currentPeriodTarget) : 0;
      right = tr('{count}/{target} weekly', { count: metrics.currentPeriodCount, target: metrics.currentPeriodTarget });
    }
    const check = numeric
      ? `<button class="habit-check" type="button" data-action="habit-today-toggle" data-habit-id="${esc(habit.id)}"${dateAttr} data-long-press="habit-today-menu" aria-label="${esc(tr('Enter value: {habit}', { habit: habit.name }))}">`
      : `<button class="habit-check" type="button" data-action="habit-today-toggle" data-habit-id="${esc(habit.id)}"${dateAttr} data-long-press="habit-today-menu" aria-pressed="${status === 'done'}" aria-label="${esc(habit.name)}">`;
    const meta = options.meta ? `<span class="task-meta">${esc(options.meta)}</span>` : '';
    const count = right && !(options.count === false && !numeric) ? `<span class="task-side habit-today-count">${esc(right)}</span>` : '';
    // R14b (T5 amended): like a task row, the name comes first and the circle closes the row on the right.
    const main = `<button class="today-row-main" type="button" data-action="habit-today-menu" data-habit-id="${esc(habit.id)}"${dateAttr} aria-haspopup="dialog"><span class="task-title">${esc(habit.name)}</span>${meta}</button>`;
    return `<article class="today-row habit-today-row${status === 'done' ? ' is-done' : ''}${status === 'skipped' ? ' is-skipped' : ''}" data-habit-id="${esc(habit.id)}">${main}${count}${check}${habitCircle(status, fraction)}</button></article>`;
  }

  function openTodayHabitMenu(ctx, anchor, habitId, date = ctx.Core.dateOnly()) {
    const { getHabit, esc, openPopover, state, Core } = ctx;
    const habit = getHabit(habitId); if (!habit) return;
    const other = date !== Core.dateOnly();
    const dateAttr = other ? ` data-date="${esc(date)}"` : '';
    const skipped = state.habitLogCache?.[habitId]?.find(log => log.date === date)?.status === 'skipped';
    const value = habit.trackingType === 'numeric' ? `<button class="popover-option" type="button" data-pop-action="habit-today-value" data-habit-id="${esc(habitId)}"${dateAttr}><i class="ph ph-pencil-simple"></i>${tr('Enter value')}</button>` : '';
    const skip = habit.trackingType === 'numeric' ? '' : `<button class="popover-option" type="button" data-pop-action="habit-today-skip" data-habit-id="${esc(habitId)}"${dateAttr}><i class="ph ph-arrow-bend-up-right"></i>${skipped ? tr('Undo skip') : other ? tr('Skip') : tr('Skip today')}</button>`;
    const details = `<button class="popover-option" type="button" data-pop-action="habit-today-details" data-habit-id="${esc(habitId)}"><i class="ph ph-chart-line-up"></i>${tr('Habit details')}</button>`;
    openPopover(anchor, `<div class="popover-title">${esc(habit.name)}</div>${other ? `<p class="sheet-subtitle">${esc(ctx.formatDate(date, 'full'))}</p>` : ''}${value}${skip}${details}`, { type: 'habit-today-menu', habitId });
  }

  // H6: the value sheet with the quick values, the day's total and "Primeni".
  function renderHabitValueModal(ctx) {
    const { modalState, getHabit, esc, modalFrame } = ctx;
    const habit = getHabit(modalState.habitId);
    if (!habit) return '';
    const unit = habit.unit ? ` ${esc(habit.unit)}` : '';
    const chips = (habit.quickValues || []).map(value => `<button class="quick-chip" type="button" data-action="habit-value-add" data-value="${esc(value)}">+${esc(number(value))}${unit}</button>`).join('');
    const day = modalState.date && modalState.date !== ctx.Core.dateOnly() ? `<p class="sheet-subtitle">${esc(ctx.formatDate(modalState.date, 'full'))}</p>` : '';
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${esc(habit.name)}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div>${day}<p class="habit-value-summary"><strong class="habit-value-total">${esc(number(modalState.total))}</strong> / ${esc(number(habit.targetValue))}${unit}</p>${chips ? `<div class="quick-actions">${chips}</div>` : ''}<label class="field-label" for="habit-value-total">${tr('Total for the day')}</label><input id="habit-value-total" class="input" type="number" min="0" step="any" value="${esc(modalState.total)}"><div class="modal-footer"><div class="modal-footer-actions"><button class="btn btn-primary" type="button" data-action="habit-value-apply">${tr('Apply')}</button></div></div></div>`, 'habit-value-modal');
  }

  function shiftMonth(monthKey, amount) {
    const date = new Date(`${monthKey}-01T12:00:00`);
    date.setMonth(date.getMonth() + amount);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  // Redesign R8a (H1–H7): the Habits screen. The rings, Dan, Nedelja and the bars cover this habit week
  // (Core.habitWeekRule); the chart covers one calendar month (`ui.habitTrackerMonth`).
  const ROUTINE_ORDER = ['morning', 'daily', 'night'];
  const routineOf = habit => (ROUTINE_ORDER.includes(habit.routine) ? habit.routine : 'daily');
  const CELL_LABELS = Object.freeze({ done: msg('Done'), missed: msg('Missed'), skipped: msg('Skipped'), open: msg('Not checked in'), unscheduled: msg('Not scheduled'), future: msg('Future') });

  function habitsWeek(ctx) {
    const today = ctx.Core.dateOnly();
    const rule = ctx.Core.habitWeekRule(ctx.state.settings);
    const start = ctx.Core.habitPeriodKey({ frequencyType: 'timesPerWeek' }, today, rule);
    return { today, rule, start, days: Array.from({ length: 7 }, (_, index) => ctx.Core.addDays(start, index)) };
  }

  function ringSvg(percent) {
    const track = '<circle class="habit-ring-track" cx="22" cy="22" r="18"/>';
    if (percent === null) return `<svg class="habit-ring-svg" viewBox="0 0 44 44" aria-hidden="true">${track}<text class="habit-ring-none" x="22" y="26" text-anchor="middle">–</text></svg>`;
    const arc = percent > 0 ? `<circle class="habit-ring-arc" cx="22" cy="22" r="18" stroke-dasharray="${(percent / 100 * 113.1).toFixed(1)} 113.1" transform="rotate(-90 22 22)"/>` : '';
    const inside = percent === 100 ? '<path class="habit-ring-check" d="M17.5 22.3l3 3 6-6.3"/>' : `<text x="22" y="26" text-anchor="middle">${percent}<tspan class="habit-ring-pc">%</tspan></text>`;
    return `<svg class="habit-ring-svg" viewBox="0 0 44 44" aria-hidden="true">${track}${arc}${inside}</svg>`;
  }

  // H4: this week's rings; a tap opens that day in Dan, future days are inactive.
  function habitRings(ctx, active, week, selected) {
    const { Core, esc, state } = ctx;
    const weekday = new Intl.DateTimeFormat(I18n.locale(), { weekday: 'short' });
    const rings = week.days.map(date => {
      const future = date > week.today;
      const share = future ? { percent: null } : Core.habitDayPercent(active, state.habitLogCache || {}, date, week.today, week.rule);
      const isSelected = date === selected;
      const label = `${ctx.formatDate(date, 'full')}, ${share.percent === null ? tr('no data') : `${share.percent}%`}`;
      const name = weekday.format(ctx.Core.parseDateOnly(date));
      return `<button class="habit-ring${date === week.today ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}" type="button" data-action="habits-ring" data-date="${date}"${future ? ' disabled' : ''} aria-label="${esc(label)}"${isSelected ? ' aria-current="date"' : ''}><span class="habit-ring-weekday">${esc(name.charAt(0).toLocaleUpperCase(I18n.locale()) + name.slice(1))}</span>${ringSvg(share.percent)}<span class="habit-ring-date">${Number(date.slice(8))}</span></button>`;
    }).join('');
    return `<div class="habit-rings" role="group" aria-label="${tr('This week, done of planned')}">${rings}</div>`;
  }

  function dayMeta(ctx, habit, day, date, today) {
    const frequency = habitFrequencyLabel(ctx, habit);
    const lower = text => text.toLocaleLowerCase(I18n.locale());
    if (day.state === 'skipped') return `${frequency} · ${lower(tr('Skipped'))}`;
    const metrics = ctx.habitMetrics(habit);
    if (habit.frequencyType === 'timesPerWeek') return `${frequency} · ${tr('{count} / {target} this week', { count: metrics.currentPeriodCount || 0, target: metrics.currentPeriodTarget || habit.timesPerWeek || 1 })}`;
    if (date !== today) return day.state === 'missed' ? `${frequency} · ${lower(tr('Missed'))}` : frequency;
    return `${frequency} · ${trn(metrics.currentStreak || 0, 'streak {count} day', 'streak {count} days')}`;
  }

  // H2: the selected day's habits by routine, the done ones last in each group.
  function renderHabitsDay(ctx, active, week, date) {
    const { Core, esc, state } = ctx;
    let html = date !== week.today ? `<h2 class="habits-day-title">${esc(ctx.formatDate(date, 'full'))}</h2>` : '';
    let shown = 0;
    for (const routine of ROUTINE_ORDER) {
      const entries = active.filter(habit => routineOf(habit) === routine)
        .map(habit => ({ habit, day: Core.habitDayState(habit, state.habitLogCache?.[habit.id] || [], date, week.today, week.rule) }))
        .filter(entry => !['unscheduled', 'future'].includes(entry.day.state));
      if (!entries.length) continue;
      shown += entries.length;
      const sorted = [...entries.filter(entry => entry.day.state !== 'done'), ...entries.filter(entry => entry.day.state === 'done')];
      const rows = sorted.map(({ habit, day }) => renderHabitTodayRow(ctx, habit, { status: day.state === 'done' ? 'done' : day.state === 'skipped' ? 'skipped' : 'pending', value: day.value }, { date, meta: dayMeta(ctx, habit, day, date, week.today), count: false })).join('');
      html += `<section class="section habits-routine habits-routine--${routine}"><div class="section-header"><h2 class="section-label"><i class="ph ${ROUTINE_ICONS[routine]}" aria-hidden="true"></i> ${esc(routineLabel(routine))}</h2><span class="section-count">${entries.length}</span></div><div class="habit-list today-card">${rows}</div></section>`;
    }
    return shown ? html : `${html}<p class="today-empty">${tr('No habits planned for this day.')}</p>`;
  }

  const TICK = '<svg class="habit-cell-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  // H3: the week as a table; a cell records a day like a tap in Dan.
  function renderHabitsWeek(ctx, active, week) {
    const { Core, esc, state } = ctx;
    const range = new Intl.DateTimeFormat(I18n.locale(), { day: 'numeric', month: 'long' });
    const first = Core.parseDateOnly(week.days[0]); const last = Core.parseDateOnly(week.days[6]);
    const title = typeof range.formatRange === 'function' ? range.formatRange(first, last) : `${ctx.formatDate(week.days[0])} – ${ctx.formatDate(week.days[6])}`;
    const weekday = new Intl.DateTimeFormat(I18n.locale(), { weekday: 'short' });
    const head = week.days.map(date => `<th scope="col"${date === week.today ? ' class="is-today"' : ''}>${esc(weekday.format(Core.parseDateOnly(date)))}<br>${Number(date.slice(8))}</th>`).join('');
    let body = '';
    for (const routine of ROUTINE_ORDER) {
      const habits = active.filter(habit => routineOf(habit) === routine);
      if (!habits.length) continue;
      body += `<tr class="habits-week-group"><th scope="rowgroup" colspan="8">${esc(routineLabel(routine))}</th></tr>`;
      body += habits.map(habit => `<tr><th scope="row" class="habits-week-name">${esc(habit.name)}</th>${week.days.map(date => {
        const day = Core.habitDayState(habit, state.habitLogCache?.[habit.id] || [], date, week.today, week.rule);
        const inactive = ['unscheduled', 'future'].includes(day.state);
        const label = `${habit.name}, ${ctx.formatDate(date, 'full')}: ${tr(CELL_LABELS[day.state])}`;
        const pressed = habit.trackingType === 'numeric' ? '' : ` aria-pressed="${day.state === 'done'}"`;
        return `<td><button class="habit-cell is-${day.state}${date === week.today ? ' is-today' : ''}" type="button" data-action="habit-today-toggle" data-habit-id="${esc(habit.id)}" data-date="${date}"${inactive ? ' disabled' : ''} aria-label="${esc(label)}"${pressed}>${day.state === 'done' ? TICK : ''}</button></td>`;
      }).join('')}</tr>`).join('');
    }
    const legend = ['done', 'missed', 'skipped', 'unscheduled'].map(key => `<span><i class="habit-cell-swatch is-${key}" aria-hidden="true"></i>${tr(CELL_LABELS[key])}</span>`).join('');
    return `<h2 class="section-label habits-week-title">${esc(title)}</h2><div class="habits-week-scroll"><table class="habits-week-table"><thead><tr><th scope="col"><span class="sr-only">${tr('Habit')}</span></th>${head}</tr></thead><tbody>${body}</tbody></table></div><div class="habits-legend">${legend}</div>`;
  }

  // H7: each active habit's week, done days against the week's plan.
  function habitBars(ctx, active, week) {
    const { Core, esc, state } = ctx;
    return active.map(habit => {
      const { done, planned } = Core.habitWeekProgress(habit, state.habitLogCache?.[habit.id] || [], week.start, week.today, week.rule);
      const percent = planned ? Math.min(100, Math.round(done / planned * 100)) : 0;
      const count = percent === 100 ? '<svg class="habits-bar-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : `${done}/${planned}`;
      return `<div class="habits-bar"><span class="habits-bar-name">${esc(habit.name)}</span><span class="habits-bar-count">${count}</span><span class="habits-bar-track" role="img" aria-label="${esc(tr('{name}: {done} of {planned}', { name: habit.name, done, planned }))}"><i style="width:${percent}%"></i></span></div>`;
    }).join('');
  }

  // H4: the daily share for one calendar month; only today is labelled, a tap shows any day's value.
  function habitChart(ctx, active, week) {
    const { Core, esc, state } = ctx;
    const current = week.today.slice(0, 7);
    const month = /^\d{4}-\d{2}$/.test(state.ui.habitTrackerMonth || '') && state.ui.habitTrackerMonth <= current ? state.ui.habitTrackerMonth : current;
    const first = Core.parseDateOnly(`${month}-01`);
    const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const dates = Array.from({ length }, (_, index) => Core.addDays(`${month}-01`, index));
    const values = dates.filter(date => date <= week.today).map(date => Core.habitDayPercent(active, state.habitLogCache || {}, date, week.today, week.rule).percent);
    const numbers = values.filter(value => value !== null);
    const average = numbers.length ? Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length) : null;
    const W = 320, H = 150, L = 30, R = 10, T = 10, B = 22;
    const x = index => L + index * (W - L - R) / Math.max(1, length - 1);
    const y = value => T + (100 - value) / 100 * (H - T - B);
    const label = capitalized(new Intl.DateTimeFormat(I18n.locale(), { month: 'long', year: 'numeric' }).format(first));
    const earliest = active.map(habit => String(habit.startDate || habit.createdAt || week.today).slice(0, 7)).sort()[0] || current;
    const grid = [0, 50, 100].map(value => `<line class="habits-chart-grid" x1="${L}" x2="${W - R}" y1="${y(value)}" y2="${y(value)}"/><text class="habits-chart-axis" x="${L - 6}" y="${y(value) + 3}" text-anchor="end">${value}%</text>`).join('');
    const ticks = [0, 7, 14, 21, length - 1].map(index => `<text class="habits-chart-axis" x="${x(index).toFixed(1)}" y="${H - 6}" text-anchor="${index === length - 1 ? 'end' : index ? 'middle' : 'start'}">${esc(ctx.formatDate(dates[index]))}</text>`).join('');
    const points = values.map((value, index) => (value === null ? null : `${x(index).toFixed(1)},${y(value).toFixed(1)}`)).filter(Boolean).join(' ');
    const line = points ? `<polyline class="habits-chart-line" points="${points}"/>` : '';
    const marker = (index, cls, text) => `<circle class="habits-chart-dot" cx="${x(index).toFixed(1)}" cy="${y(values[index]).toFixed(1)}" r="4.5"/><text class="${cls}" x="${Math.min(W - R, x(index) + 8).toFixed(1)}" y="${Math.max(T + 8, y(values[index]) - 10).toFixed(1)}" text-anchor="${x(index) > W - 80 ? 'end' : 'start'}">${esc(text)}</text>`;
    const todayIndex = dates.indexOf(week.today);
    const today = todayIndex >= 0 && values[todayIndex] !== null ? marker(todayIndex, 'habits-chart-today', tr('today {percent}%', { percent: values[todayIndex] })) : '';
    const pickIndex = dates.indexOf(state.ui.habitChartDay);
    const pick = pickIndex >= 0 && pickIndex < values.length && values[pickIndex] !== null ? `<line class="habits-chart-cross" x1="${x(pickIndex).toFixed(1)}" x2="${x(pickIndex).toFixed(1)}" y1="${T}" y2="${y(0)}"/>${marker(pickIndex, 'habits-chart-pick', `${ctx.formatDate(dates[pickIndex])}: ${values[pickIndex]}%`)}` : '';
    const step = (W - L - R) / Math.max(1, length - 1);
    const hits = values.map((value, index) => `<rect class="habits-chart-hit" x="${Math.max(0, x(index) - step / 2).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}" data-action="habit-chart-day" data-date="${dates[index]}"/>`).join('');
    const table = `<table class="sr-only"><caption>${esc(label)}</caption>${values.map((value, index) => `<tr><th scope="row">${esc(ctx.formatDate(dates[index]))}</th><td>${value === null ? tr('no data') : `${value}%`}</td></tr>`).join('')}</table>`;
    return `<div class="today-card habits-chart"><div class="habits-chart-head"><div><strong>${average === null ? '–' : `${average}%`}</strong> <span>${tr('average')}</span></div><div class="habits-chart-month"><button class="btn-icon" type="button" data-action="habit-chart-month" data-shift="-1" aria-label="${tr('Previous month')}"${month <= earliest ? ' disabled' : ''}><i class="ph ph-caret-left"></i></button><span>${esc(label)}</span><button class="btn-icon" type="button" data-action="habit-chart-month" data-shift="1" aria-label="${tr('Next month')}"${month >= current ? ' disabled' : ''}><i class="ph ph-caret-right"></i></button></div></div><svg class="habits-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tr('Share of habits done per day, {month}', { month: label }))}">${grid}${ticks}${line}${pick}${today}${hits}</svg>${table}</div>`;
  }

  function capitalized(text) {
    return text.charAt(0).toLocaleUpperCase(I18n.locale()) + text.slice(1);
  }

  // H5: paused and archived habits fold at the bottom.
  function habitFold(ctx, key, label, habits, action, actionLabel) {
    if (!habits.length) return '';
    const { esc, state } = ctx;
    const open = state.ui[key === 'paused' ? 'habitsPausedOpen' : 'habitsArchivedOpen'] === true;
    const rows = open ? `<div class="today-card">${habits.map(habit => `<div class="today-row habits-fold-row"><button class="today-row-main" type="button" data-route="habit/${esc(habit.id)}"><span class="task-title">${esc(habit.name)}</span><span class="task-meta">${esc(habitFrequencyLabel(ctx, habit))}</span></button><button class="quick-chip" type="button" data-action="${action}" data-habit-id="${esc(habit.id)}">${actionLabel}</button></div>`).join('')}</div>` : '';
    return `<section class="habits-fold"><button class="collapsible-trigger" type="button" data-action="habits-fold" data-fold="${key}" aria-expanded="${open}"><span class="left"><i class="ph ph-caret-${open ? 'up' : 'down'}" aria-hidden="true"></i> ${label} · ${habits.length}</span></button>${rows}</section>`;
  }

  function renderHabits(ctx) {
    const { state, pageHeader, emptyState, Core } = ctx;
    const habits = state.habits || [];
    const active = ROUTINE_ORDER.flatMap(routine => habits.filter(habit => habit.status === 'active' && routineOf(habit) === routine));
    const week = habitsWeek(ctx);
    const todayShare = Core.habitDayPercent(active, state.habitLogCache || {}, week.today, week.today, week.rule);
    let html = pageHeader(tr('Habits'), active.length ? tr('{done} of {total} today', { done: todayShare.done, total: todayShare.planned }) : '', { add: false });
    if (!habits.length) return html + emptyState(tr('No habits yet.'), tr('Track a repeatable behavior without turning it into a task.'), tr('New habit'), 'new-habit');
    if (active.length) {
      const view = state.ui.habitsView === 'week' ? 'week' : 'day';
      const day = Core.parseDateOnly(state.ui.habitsDay) && state.ui.habitsDay <= week.today ? state.ui.habitsDay : week.today;
      html += habitRings(ctx, active, week, view === 'day' ? day : null);
      html += `<div class="view-tabs habits-view-switch" role="group" aria-label="${tr('Habit view')}">${[['day', tr('Day')], ['week', tr('Week')]].map(([key, label]) => `<button class="btn${view === key ? ' is-selected' : ''}" type="button" data-action="habits-view" data-view="${key}" aria-pressed="${view === key}">${label}</button>`).join('')}</div>`;
      html += view === 'day' ? renderHabitsDay(ctx, active, week, day) : renderHabitsWeek(ctx, active, week);
      html += `<section class="section habits-progress"><div class="section-header"><h2 class="section-label">${tr('Progress')}</h2></div><div class="today-card habits-bars"><p class="habits-bars-title">${tr('By habit · this week')}</p>${habitBars(ctx, active, week)}</div>${habitChart(ctx, active, week)}</section>`;
    } else html += `<p class="today-empty">${tr('No active habits.')}</p>`;
    html += habitFold(ctx, 'paused', tr('Paused habits'), habits.filter(habit => habit.status === 'paused'), 'resume-habit', tr('Resume'));
    html += habitFold(ctx, 'archived', tr('Archived habits'), habits.filter(habit => habit.status === 'archived'), 'restore-habit', tr('Restore'));
    return html;
  }

  // Redesign R8b (N1–N6): the new habit window. The draft lives in ctx.modalState.draft; the rows open small sheets
  // over the window that write the draft back with "Primeni", or at once for a single choice.
  const plainNumber = value => Number(value || 0).toLocaleString(I18n.locale(), { maximumFractionDigits: 2, useGrouping: false });
  function suggestedQuickValues(target) {
    const value = Number(target) || 0;
    if (!(value > 0)) return [];
    return [...new Set((value <= 5 ? [8, 4, 2] : [4, 2, 1]).map(part => Math.round(value / part * 100) / 100))].filter(item => item > 0);
  }
  function draftQuickValues(d) {
    const values = Array.isArray(d.quickValues) ? d.quickValues : String(d.quickValues || '').split(',').map(value => Number(value.trim())).filter(value => Number.isFinite(value) && value > 0);
    return d.quickValuesSet || values.length ? values : suggestedQuickValues(d.targetValue);
  }
  function activeReminderTimes(ctx, d) {
    return [...new Set((d.reminders || []).filter(item => item && item.enabled !== false).map(item => ctx.Core.normalizeTime(item.time)).filter(Boolean))].sort();
  }
  function habitWindowRow(ctx, action, icon, label, value, empty = tr('Not set')) {
    return `<button class="task-window-row" type="button" data-action="${action}"><i class="ph ${icon}" aria-hidden="true"></i><span class="task-window-row-label">${label}</span><span class="task-window-row-value${value ? ' is-set' : ''}">${ctx.esc(value || empty)}</span><i class="ph ph-caret-right task-window-row-caret" aria-hidden="true"></i></button>`;
  }
  function habitSegment(action, label, options, current) {
    return `<div class="view-tabs habit-window-seg" role="group" aria-label="${label}">${options.map(([value, text]) => `<button class="btn${current === value ? ' is-selected' : ''}" type="button" data-action="${action}" data-value="${value}" aria-pressed="${current === value}">${text}</button>`).join('')}</div>`;
  }
  // The targets as the app counts them: a blank minimum is the target, a blank ideal is the minimum.
  function targetsLabel(ctx, d) {
    if (!d.minimumTarget && !d.idealTarget) return '';
    const target = ctx.Core.getHabitTargetStatus(d, 0);
    return tr('Minimum {minimum} · ideal {ideal}', { minimum: plainNumber(target.minimumTarget), ideal: plainNumber(target.idealTarget) });
  }
  function habitEndLabel(ctx, d) {
    const weekly = d.frequencyType === 'timesPerWeek';
    const count = Number(d.successfulPeriodsTarget);
    if (d.endType === 'date' && d.endDate) return tr('Until {date}', { date: ctx.formatDate(d.endDate) });
    if (d.endType === 'successfulPeriods' && count > 0) return weekly ? trn(count, 'After {count} successful week', 'After {count} successful weeks') : trn(count, 'After {count} successful day', 'After {count} successful days');
    return tr('Never');
  }

  function renderHabitModal(ctx) {
    const { state, esc, modalFrame, Core } = ctx;
    const d = ctx.modalState.draft; const editing = Boolean(ctx.modalState.habitId);
    const numeric = d.trackingType === 'numeric';
    const weekly = d.frequencyType === 'timesPerWeek';
    const error = ctx.modalState.error;
    const area = (state.areas || []).find(item => item.id === d.areaId)?.name || '';
    const targets = targetsLabel(ctx, d);
    const goals = (state.goals || []).filter(goal => (d.goalIds || []).includes(goal.id)).map(goal => goal.title).join(', ');
    const open = d.moreOpen === true;
    const more = open ? `<div class="habit-window-card">${habitWindowRow(ctx, 'habit-draft-start', 'ph-calendar-blank', tr('Start'), !d.startDate || d.startDate === Core.dateOnly() ? tr('Today') : ctx.relativeDateLabel(d.startDate))}${habitWindowRow(ctx, 'habit-draft-end', 'ph-flag-checkered', tr('End'), habitEndLabel(ctx, d))}${numeric || weekly ? habitWindowRow(ctx, 'habit-draft-targets', 'ph-gauge', tr('Minimum and ideal'), targets, tr('Same as the target')) : ''}${numeric ? habitWindowRow(ctx, 'habit-draft-quick', 'ph-lightning', tr('Quick values'), draftQuickValues(d).map(value => `+${plainNumber(value)}`).join('  ')) : ''}${habitWindowRow(ctx, 'habit-draft-goals', 'ph-target', tr('Linked goals'), goals, tr('None'))}</div><p class="sheet-note">${tr('“Continuation” and “Grace days” are in the habit details.')}</p>` : '';
    const tracking = `${habitSegment('habit-draft-tracking', tr('Tracking'), [['checkbox', tr('Checkbox')], ['numeric', tr('Numeric')]], numeric ? 'numeric' : 'checkbox')}${numeric ? `<div class="habit-window-target"><label for="habit-target-value">${tr('Target')}</label><input id="habit-target-value" class="input" type="number" min="0" step="any" value="${esc(d.targetValue)}"><input id="habit-unit" class="input" maxlength="20" value="${esc(d.unit)}" placeholder="${tr('unit')}" aria-label="${tr('Unit')}"><span>${tr('per day')}</span></div>` : ''}`;
    const card = `<div class="habit-window-card">${habitWindowRow(ctx, 'habit-draft-area', 'ph-squares-four', tr('Area'), area, tr('No area (optional)'))}<div class="habit-window-block"><span class="habit-window-label"><i class="ph ph-clock" aria-hidden="true"></i>${tr('Routine')}</span>${habitSegment('habit-draft-routine', tr('Routine'), [['morning', tr('Morning')], ['daily', tr('Daytime')], ['night', tr('Night')]], ROUTINE_ORDER.includes(d.routine) ? d.routine : 'daily')}</div><div class="habit-window-block"><span class="habit-window-label"><i class="ph ph-check-square" aria-hidden="true"></i>${tr('Tracking')}</span>${tracking}</div>${habitWindowRow(ctx, 'habit-draft-frequency', 'ph-repeat', tr('Frequency'), habitFrequencyLabel(ctx, d))}${habitWindowRow(ctx, 'habit-draft-reminders', 'ph-bell', tr('Reminder'), activeReminderTimes(ctx, d).join(', '))}</div>`;
    return modalFrame(`<div class="modal-inner quick-sheet habit-window"><div class="modal-header"><h2 class="modal-title">${editing ? tr('Edit habit') : tr('New habit')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><input id="habit-name" class="quick-title-input${error ? ' is-error' : ''}" type="text" maxlength="120" autocomplete="off" placeholder="${tr('What do you want to practice?')}" value="${esc(d.name)}" aria-label="${tr('Habit name')}">${error ? `<div class="validation" role="alert">${esc(error)}</div>` : ''}${card}<button class="habit-window-more" type="button" data-action="toggle-habit-more" aria-expanded="${open}"><strong>${tr('More settings')}</strong><span>${open ? tr('Hide') : tr('Start, end, goals')} <i class="ph ph-caret-${open ? 'up' : 'down'}" aria-hidden="true"></i></span></button>${more}<div class="quick-sheet-footer"><span></span><button class="btn btn-primary habit-window-save" type="button" data-action="save-habit">${editing ? tr('Save changes') : tr('Create habit')}</button></div></div>`, 'quick');
  }

  // Redesign R8c (S13): the habit details window over the current screen. The settings rows open the R8b sheets on a
  // fresh draft of the habit; an applied sheet saves at once (commitHabitDetails).
  const CONTINUATION_LABELS = Object.freeze({ automatic: msg('Repeat automatically'), askEachPeriod: msg('Ask each period'), onePeriod: msg('One period only') });
  function habitRecovery(ctx, habit, metrics) {
    const { Core } = ctx;
    const today = Core.dateOnly();
    const target = Core.getHabitTargetStatus(habit, metrics);
    const periods = (metrics.periods || []).filter(period => period.key <= today);
    const currentIndex = periods.findIndex(period => period.isCurrent);
    let missedDays = 0;
    for (let i = currentIndex - 1; i >= 0; i--) {
      const period = periods[i];
      if (period.skipped || Core.getHabitTargetStatus(habit, { currentPeriodCount: period.progressValue }).minimumMet) break;
      missedDays += period.dates.length;
    }
    const graceDays = Math.max(0, Number(habit.graceDays) || 0);
    if (!missedDays) return tr('No recent missed period to recover from.');
    return `${target.minimumMet ? trn(missedDays, 'Recovered after {count} missed day.', 'Recovered after {count} missed days.') : trn(missedDays, 'Resume after {count} missed day.', 'Resume after {count} missed days.')} ${missedDays <= graceDays ? trn(graceDays, 'Within your {count}-day grace allowance.', 'Within your {count}-day grace allowance.') : trn(graceDays, 'Beyond your {count}-day grace allowance; start again today.', 'Beyond your {count}-day grace allowance; start again today.')}`;
  }

  function renderHabitDetails(ctx) {
    const { state, Core, esc, modalFrame, getHabit } = ctx;
    const habit = getHabit(ctx.modalState.habitId);
    if (!habit) return '';
    const week = habitsWeek(ctx);
    const logs = state.habitLogCache?.[habit.id] || [];
    const metrics = ctx.habitMetrics(habit);
    const active = habit.status === 'active';
    const numeric = habit.trackingType === 'numeric';
    const weekly = habit.frequencyType === 'timesPerWeek';
    const id = esc(habit.id);
    const frequency = habitFrequencyLabel(ctx, habit);
    let html = `<div class="modal-header task-window-header"><span class="task-window-kind">${tr('Habit')}</span><div class="task-window-actions"><button class="btn-icon" type="button" data-action="habit-details-menu" data-habit-id="${id}" aria-label="${tr('Habit actions')}"><i class="ph ph-dots-three"></i></button><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div></div><h2 class="habit-details-title">${esc(habit.name)}</h2><p class="habit-details-meta">${esc([frequency, routineLabel(habit.routine), statusLabel(habit.status)].join(' · '))}</p>`;
    const today = Core.habitDayState(habit, logs, week.today, week.today, week.rule);
    if (active) {
      const skip = !numeric && !['done', 'unscheduled'].includes(today.state) ? `<button class="btn btn-ghost" type="button" data-action="habit-today-skip" data-habit-id="${id}">${today.state === 'skipped' ? tr('Undo skip') : tr('Skip today')}</button>` : '';
      html += `<div class="today-card habit-details-today">${renderHabitTodayRow(ctx, habit, { status: today.state === 'done' ? 'done' : today.state === 'skipped' ? 'skipped' : 'pending', value: today.value })}</div><div class="habit-details-today-line"><span>${esc(tr('Today: {status}', { status: tr(CELL_LABELS[today.state]) }))}</span>${skip}</div>`;
    } else html += `<p class="sheet-note">${tr('Paused and archived habits preserve history but cannot be checked in.')}</p>`;
    const progress = Core.habitWeekProgress(habit, logs, week.start, week.today, week.rule);
    const streak = count => (weekly ? trn(count, '{count} week', '{count} weeks') : trn(count, '{count} day', '{count} days'));
    const tile = (value, label) => `<div class="habit-details-tile"><strong>${esc(value)}</strong><span>${label}</span></div>`;
    html += `<div class="habit-details-tiles">${tile(streak(Number(metrics.currentStreak) || 0), tr('Current streak'))}${tile(streak(Number(metrics.longestStreak) || 0), tr('Longest streak'))}${tile(String(Number(metrics.totalCheckins) || 0), tr('Total check-ins'))}${tile(`${progress.planned ? Math.min(100, Math.round(progress.done / progress.planned * 100)) : 0}%`, tr('Done this week'))}</div>`;
    // The month calendar: a tap records today or a past day like a tap in Dan.
    const current = week.today.slice(0, 7);
    const month = /^\d{4}-\d{2}$/.test(ctx.modalState.month || '') && ctx.modalState.month <= current ? ctx.modalState.month : current;
    const first = Core.parseDateOnly(`${month}-01`);
    const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const firstDay = Core.weekStartKey(state.settings?.weekStartsOn) === 'sunday' ? 0 : 1;
    const lead = (first.getDay() - firstDay + 7) % 7;
    const names = Array.from({ length: 7 }, (_, index) => `<span class="habit-details-weekday">${tr(WEEKDAY_KEYS[(firstDay + index) % 7])}</span>`).join('');
    const cells = Array.from({ length }, (_, index) => {
      const date = Core.addDays(`${month}-01`, index);
      const day = Core.habitDayState(habit, logs, date, week.today, week.rule);
      const inactive = ['future', 'unscheduled'].includes(day.state) || (date === week.today && !active);
      return `<button class="habit-cell is-${day.state}${date === week.today ? ' is-today' : ''}" type="button" data-action="habit-today-toggle" data-habit-id="${id}" data-date="${date}"${inactive ? ' disabled' : ''} aria-label="${esc(`${ctx.formatDate(date, 'full')}: ${tr(CELL_LABELS[day.state])}`)}"${numeric ? '' : ` aria-pressed="${day.state === 'done'}"`}>${index + 1}</button>`;
    }).join('');
    const label = capitalized(new Intl.DateTimeFormat(I18n.locale(), { month: 'long', year: 'numeric' }).format(first));
    html += `<div class="habit-details-month"><div class="habit-details-month-head"><button class="btn-icon" type="button" data-action="habit-details-month" data-shift="-1" aria-label="${tr('Previous month')}"><i class="ph ph-caret-left"></i></button><span>${esc(label)}</span><button class="btn-icon" type="button" data-action="habit-details-month" data-shift="1" aria-label="${tr('Next month')}"${month >= current ? ' disabled' : ''}><i class="ph ph-caret-right"></i></button></div><div class="habit-details-calendar">${names}${'<span aria-hidden="true"></span>'.repeat(lead)}${cells}</div><p class="sheet-note">${tr('A tap on a past day changes the history.')}</p></div>`;
    // Uvid: the week, the period target and the recovery line.
    let targetLine = '';
    let targetAttr = '';
    if (numeric || weekly) {
      const target = Core.getHabitTargetStatus(habit, metrics);
      targetAttr = ` data-habit-target-status="${esc(target.status)}"`;
      targetLine = `<p>${esc(tr('{current} / {minimum} minimum · {ideal} ideal', { current: plainNumber(target.current), minimum: plainNumber(target.minimumTarget), ideal: plainNumber(target.idealTarget) }))} · ${esc(target.idealMet ? tr('Ideal target met') : target.minimumMet ? tr('Minimum target met') : tr('Working toward minimum'))}</p>`;
    }
    html += `<h3 class="habit-details-label">${tr('Insight')}</h3><div class="today-card habit-details-insight"${targetAttr}><p>${esc(tr('This week: {done} of {planned}', { done: progress.done, planned: progress.planned }))}</p>${targetLine}<p class="task-meta" data-habit-recovery>${esc(habitRecovery(ctx, habit, metrics))}</p></div>`;
    // Podešavanja
    const row = (action, icon, title, value, empty) => habitWindowRow(ctx, action, icon, title, value, empty);
    const area = (state.areas || []).find(item => item.id === habit.areaId)?.name || '';
    const goals = (state.goals || []).filter(goal => (habit.goalIds || []).includes(goal.id)).map(goal => goal.title).join(', ');
    const targets = targetsLabel(ctx, habit);
    const grace = Math.max(0, Number(habit.graceDays) || 0);
    const rows = [
      row('habit-details-name', 'ph-text-aa', tr('Name'), habit.name),
      row('habit-draft-area', 'ph-squares-four', tr('Area'), area, tr('No area')),
      row('habit-details-routine', 'ph-clock', tr('Routine'), routineLabel(habit.routine)),
      row('habit-details-tracking', 'ph-check-square', tr('Tracking'), numeric ? `${tr('Numeric')} · ${plainNumber(habit.targetValue)}${habit.unit ? ` ${habit.unit}` : ''}` : tr('Checkbox')),
      numeric ? row('habit-draft-quick', 'ph-lightning', tr('Quick values'), draftQuickValues(habit).map(value => `+${plainNumber(value)}`).join('  ')) : '',
      row('habit-draft-frequency', 'ph-repeat', tr('Frequency'), frequency),
      row('habit-draft-reminders', 'ph-bell', tr('Reminders'), activeReminderTimes(ctx, habit).join(', ')),
      numeric || weekly ? row('habit-draft-targets', 'ph-gauge', tr('Minimum and ideal'), targets, tr('Same as the target')) : '',
      row('habit-details-grace', 'ph-shield-check', tr('Grace days'), grace ? trn(grace, '{count} day', '{count} days') : tr('No grace days')),
      row('habit-details-continuation', 'ph-arrows-clockwise', tr('Continuation'), tr(CONTINUATION_LABELS[habit.continuation] || CONTINUATION_LABELS.automatic)),
      row('habit-draft-end', 'ph-flag-checkered', tr('End'), habitEndLabel(ctx, habit)),
      row('habit-draft-goals', 'ph-target', tr('Linked goals'), goals, tr('None')),
    ].join('');
    html += `<h3 class="habit-details-label">${tr('Settings')}</h3><div class="habit-window-card">${rows}</div>`;
    const [status, statusText] = active ? ['paused', tr('Pause habit')] : habit.status === 'paused' ? ['active', tr('Resume habit')] : ['active', tr('Restore habit')];
    html += `<div class="quick-sheet-footer"><span></span><button class="btn btn-secondary habit-details-status" type="button" data-action="habit-details-status" data-habit-id="${id}" data-status="${status}">${statusText}</button></div>`;
    return modalFrame(`<div class="modal-inner quick-sheet habit-details">${html}</div>`, 'quick');
  }

  // A details sheet saves at once. A new weekly target applies from this week on (M11).
  function commitHabitDetails(ctx) {
    const { getHabit, Core, state, nowIso, saveState, syncHabitGoalLinks, captureGoalProgress, evaluateGoalProgressChanges, refreshHabitMetrics, render } = ctx;
    const habit = getHabit(ctx.modalState?.habitId); const d = ctx.modalState?.draft;
    if (!habit || !d) return;
    const numeric = d.trackingType === 'numeric';
    const fields = {
      name: String(d.name || '').trim() || habit.name, areaId: d.areaId || null, routine: d.routine, trackingType: d.trackingType, targetValue: d.targetValue, unit: d.unit,
      quickValues: numeric ? draftQuickValues(d) : (habit.quickValues || []), frequencyType: d.frequencyType, weekdays: d.weekdays, timesPerWeek: d.timesPerWeek, everyNDays: d.everyNDays,
      startDate: d.startDate, reminders: d.reminders, minimumTarget: d.minimumTarget ?? null, idealTarget: d.idealTarget ?? null, graceDays: d.graceDays, continuation: d.continuation,
      endType: d.endType, endDate: d.endType === 'date' ? d.endDate : null, successfulPeriodsTarget: d.endType === 'successfulPeriods' ? Number(d.successfulPeriodsTarget) : null,
    };
    habit.targetHistory = Core.recordHabitTargetChange(habit, fields, Core.habitPeriodKey({ frequencyType: 'timesPerWeek' }, Core.dateOnly(), Core.habitWeekRule(state.settings)));
    const goalsChanged = JSON.stringify([...(habit.goalIds || [])].sort()) !== JSON.stringify([...(d.goalIds || [])].sort());
    const before = goalsChanged ? captureGoalProgress() : null;
    Object.assign(habit, fields, { updatedAt: nowIso() });
    if (goalsChanged) syncHabitGoalLinks(habit, d.goalIds || []);
    ctx.modalState.draft = null;
    saveState();
    refreshHabitMetrics().then(() => { render(); if (ctx.modalState?.type === 'habit-details') ctx.renderModal(); if (before) evaluateGoalProgressChanges(before); }).catch(console.error);
  }

  function choiceSheetHtml(ctx, title, action, options, current) {
    return `<div class="popover-title">${title}</div>${sheetSubtitle(ctx)}<div class="sheet-card" role="radiogroup" aria-label="${title}">${options.map(([value, label]) => radioOption(action, value, label, current === value)).join('')}</div>`;
  }
  function nameSheetHtml(ctx) {
    return `<div class="popover-title">${tr('Name')}</div><label class="sheet-field"><span>${tr('Name')}</span><input id="habit-rename" class="input" maxlength="120" value="${ctx.esc(sheet.name)}" data-sheet-focus></label>${sheet.error ? `<p class="validation" role="alert">${ctx.esc(sheet.error)}</p>` : ''}${applyFooter('habit-name-apply')}`;
  }
  function trackingSheetHtml(ctx) {
    const numeric = sheet.type === 'numeric';
    const choice = sheet.history ? `<p class="sheet-note">${tr('Tracking cannot change while this Habit has history.')}</p>` : `<div class="sheet-card" role="radiogroup" aria-label="${tr('Tracking')}">${[['checkbox', tr('Checkbox')], ['numeric', tr('Numeric')]].map(([value, label]) => radioOption('habit-tracking-type', value, label, sheet.type === value)).join('')}</div>`;
    const target = numeric ? `<div class="habit-window-target"><label for="habit-tracking-target">${tr('Target')}</label><input id="habit-tracking-target" class="input" type="number" min="0" step="any" value="${ctx.esc(sheet.target)}"><input id="habit-tracking-unit" class="input" maxlength="20" value="${ctx.esc(sheet.unit)}" placeholder="${tr('unit')}" aria-label="${tr('Unit')}"><span>${tr('per day')}</span></div>` : '';
    return `<div class="popover-title">${tr('Tracking')}</div>${sheetSubtitle(ctx)}${choice}${target}${sheet.error ? `<p class="validation" role="alert">${ctx.esc(sheet.error)}</p>` : ''}${applyFooter('habit-tracking-apply')}`;
  }
  function graceSheetHtml(ctx) {
    return `<div class="popover-title">${tr('Grace days')}</div>${sheetSubtitle(ctx)}<label class="sheet-field"><i class="ph ph-shield-check" aria-hidden="true"></i><span>${tr('Grace days')}</span><input id="habit-grace" class="input" type="number" min="0" step="1" value="${ctx.esc(sheet.value)}"></label><p class="sheet-note">${tr('Grace describes recovery; recorded check-ins and streaks stay unchanged.')}</p>${sheet.error ? `<p class="validation" role="alert">${ctx.esc(sheet.error)}</p>` : ''}${applyFooter('habit-grace-apply')}`;
  }
  function readTrackingInputs(ctx) {
    sheet.target = ctx.$('#habit-tracking-target')?.value ?? sheet.target;
    sheet.unit = ctx.$('#habit-tracking-unit')?.value ?? sheet.unit;
  }

  // The details' own sheets (name, routine, tracking, grace days, continuation); true when handled.
  function handleHabitDetailsSheet(action, el, ctx, d) {
    const closeAndRender = () => { sheet = null; ctx.closePopover(); ctx.renderModal(); };
    if (action === 'habit-details-name') { sheet = { kind: 'name', name: d.name, error: '' }; showSheet(ctx, el, nameSheetHtml(ctx), 'habit-name'); return true; }
    if (action === 'habit-name-apply' && sheet?.kind === 'name') {
      sheet.name = String(ctx.$('#habit-rename')?.value ?? sheet.name);
      if (!sheet.name.trim()) { sheet.error = tr('Habit needs a name.'); ctx.refreshSheet(nameSheetHtml(ctx)); return true; }
      d.name = sheet.name.trim(); closeAndRender(); return true;
    }
    if (action === 'habit-details-routine') { sheet = { kind: 'routine' }; showSheet(ctx, el, choiceSheetHtml(ctx, tr('Routine'), 'habit-details-set-routine', [['morning', tr('Morning')], ['daily', tr('Daytime')], ['night', tr('Night')]], routineOf(d)), 'habit-routine'); return true; }
    if (action === 'habit-details-set-routine') { if (ROUTINE_ORDER.includes(el.dataset.value)) d.routine = el.dataset.value; closeAndRender(); return true; }
    if (action === 'habit-details-tracking') {
      sheet = { kind: 'tracking', type: d.trackingType === 'numeric' ? 'numeric' : 'checkbox', target: d.targetValue, unit: d.unit || '', history: (ctx.state.habitLogCache?.[ctx.modalState.habitId] || []).length > 0, error: '' };
      showSheet(ctx, el, trackingSheetHtml(ctx), 'habit-tracking'); return true;
    }
    if (action === 'habit-tracking-type' && sheet?.kind === 'tracking' && !sheet.history) { readTrackingInputs(ctx); sheet.type = el.dataset.value === 'numeric' ? 'numeric' : 'checkbox'; sheet.error = ''; ctx.refreshSheet(trackingSheetHtml(ctx)); return true; }
    if (action === 'habit-tracking-apply' && sheet?.kind === 'tracking') {
      readTrackingInputs(ctx);
      const target = Number(sheet.target);
      if (sheet.type === 'numeric' && !(Number.isFinite(target) && target > 0)) { sheet.error = tr('Numeric habits need a target above zero.'); ctx.refreshSheet(trackingSheetHtml(ctx)); return true; }
      if (sheet.type !== d.trackingType) { d.minimumTarget = null; d.idealTarget = null; }
      d.trackingType = sheet.type;
      if (sheet.type === 'numeric') { d.targetValue = target; d.unit = String(sheet.unit).trim(); }
      closeAndRender(); return true;
    }
    if (action === 'habit-details-grace') { sheet = { kind: 'grace', value: Number(d.graceDays) || 0, error: '' }; showSheet(ctx, el, graceSheetHtml(ctx), 'habit-grace'); return true; }
    if (action === 'habit-grace-apply' && sheet?.kind === 'grace') {
      sheet.value = ctx.$('#habit-grace')?.value ?? sheet.value;
      const value = Number(sheet.value);
      if (!Number.isInteger(value) || value < 0) { sheet.error = tr('Enter zero or more whole days.'); ctx.refreshSheet(graceSheetHtml(ctx)); return true; }
      d.graceDays = value; closeAndRender(); return true;
    }
    if (action === 'habit-details-continuation') { sheet = { kind: 'continuation' }; showSheet(ctx, el, choiceSheetHtml(ctx, tr('Continuation'), 'habit-details-set-continuation', Object.entries(CONTINUATION_LABELS).map(([value, label]) => [value, tr(label)]), d.continuation || 'automatic'), 'habit-continuation'); return true; }
    if (action === 'habit-details-set-continuation') { if (CONTINUATION_LABELS[el.dataset.value]) d.continuation = el.dataset.value; closeAndRender(); return true; }
    return false;
  }

  // --- The sheets over the window (one at a time) ---------------------------------------------------------
  let sheet = null;
  const sheetSubtitle = ctx => `<p class="sheet-subtitle">${ctx.esc(ctx.modalState?.draft?.name?.trim() || tr('New habit'))}</p>`;
  const radioOption = (action, value, label, on) => `<button class="popover-option sheet-option${on ? ' is-selected' : ''}" type="button" role="radio" aria-checked="${on}" data-pop-action="${action}" data-value="${value}"><span class="sheet-radio${on ? ' is-on' : ''}" aria-hidden="true"></span><span class="sheet-option-label">${label}</span></button>`;
  const applyFooter = (action, left = '<span></span>', disabled = false) => `<div class="sheet-footer">${left}<button class="btn btn-primary" type="button" data-pop-action="${action}"${disabled ? ' disabled' : ''}>${tr('Apply')}</button></div>`;
  function showSheet(ctx, anchor, html, type) {
    if (anchor) ctx.openPopover(anchor, html, { type }); else ctx.refreshSheet(html);
  }
  function syncDraftInputs(ctx) {
    if (ctx.modalState?.type === 'habit') readHabitDraft(ctx);
  }

  function openHabitAreaSheet(ctx, anchor) {
    const d = ctx.modalState.draft;
    const areas = (ctx.state.areas || []).filter(area => area.status !== 'archived' || area.id === d.areaId);
    const option = (id, label) => `<button class="popover-option sheet-option${(d.areaId || '') === id ? ' is-selected' : ''}" type="button" data-pop-action="habit-draft-set-area" data-area-id="${ctx.esc(id)}"><span class="sheet-option-label">${ctx.esc(label)}</span><span class="sheet-radio${(d.areaId || '') === id ? ' is-on' : ''}" aria-hidden="true"></span></button>`;
    ctx.openPopover(anchor, `<div class="popover-title">${tr('Area')}</div>${sheetSubtitle(ctx)}<div class="sheet-card">${option('', tr('No area'))}${areas.map(area => option(area.id, area.name)).join('')}</div>`, { type: 'habit-area' });
  }

  // N6: Svaki dan, Određeni dani, X puta nedeljno, Na svakih N dana; one "Primeni", X closes without a change.
  const stepper = (key, value, min, max) => `<span class="habit-stepper"><button class="btn-icon" type="button" data-pop-action="habit-freq-step" data-key="${key}" data-step="-1"${value <= min ? ' disabled' : ''} aria-label="${tr('Decrease')}"><i class="ph ph-minus"></i></button><span class="habit-stepper-value" aria-live="polite">${value}</span><button class="btn-icon" type="button" data-pop-action="habit-freq-step" data-key="${key}" data-step="1"${value >= max ? ' disabled' : ''} aria-label="${tr('Increase')}"><i class="ph ph-plus"></i></button></span>`;
  const STEPS = { timesPerWeek: [1, 7], everyNDays: [2, 30] };
  function nextHabitDates(ctx, start, every) {
    const today = ctx.Core.dateOnly();
    let date = ctx.Core.parseDateOnly(start) ? start : today;
    while (date < today) date = ctx.Core.addDays(date, every);
    return [date, ctx.Core.addDays(date, every), ctx.Core.addDays(date, every * 2)];
  }
  function frequencySheetHtml(ctx) {
    const f = sheet;
    const types = [['daily', tr('Daily')], ['weekdays', tr('Selected weekdays')], ['timesPerWeek', tr('X times per week')], ['everyNDays', tr('Every N days')]];
    let extra = '';
    if (f.type === 'weekdays') {
      const first = ctx.Core.weekStartKey(ctx.state.settings?.weekStartsOn) === 'sunday' ? 0 : 1;
      const days = Array.from({ length: 7 }, (_, index) => (first + index) % 7);
      extra = `<div class="habit-weekdays">${days.map(day => { const on = f.weekdays.includes(day); return `<button class="habit-weekday${on ? ' is-on' : ''}" type="button" data-pop-action="habit-freq-day" data-day="${day}" aria-pressed="${on}">${tr(WEEKDAY_KEYS[day])}</button>`; }).join('')}</div><p class="sheet-note">${f.weekdays.length ? ctx.esc(habitFrequencyLabel(ctx, { frequencyType: 'weekdays', weekdays: f.weekdays })) : tr('Choose at least one day.')}</p>`;
    } else if (f.type === 'timesPerWeek') {
      extra = `<div class="sheet-field habit-stepper-field"><span>${tr('Successful days a week')}</span>${stepper('timesPerWeek', f.timesPerWeek, ...STEPS.timesPerWeek)}</div><p class="sheet-note">${tr('One check-in a day, on any day of the week. You can go past the weekly target.')}</p>`;
    } else if (f.type === 'everyNDays') {
      const next = nextHabitDates(ctx, f.startDate, f.everyNDays).map(date => ctx.esc(ctx.formatDate(date))).join(' · ');
      extra = `<div class="sheet-field habit-stepper-field"><span>${ctx.esc(habitFrequencyLabel(ctx, { frequencyType: 'everyNDays', everyNDays: f.everyNDays }))}</span>${stepper('everyNDays', f.everyNDays, ...STEPS.everyNDays)}</div><label class="sheet-field"><i class="ph ph-calendar-blank" aria-hidden="true"></i><span>${tr('Starts')}</span><input id="habit-freq-start" class="input" type="date" value="${ctx.esc(f.startDate)}"></label><p class="sheet-note"><strong>${tr('Next days:')}</strong> ${next}</p>`;
    }
    return `<div class="popover-title">${tr('Frequency')}</div>${sheetSubtitle(ctx)}<div class="sheet-card" role="radiogroup" aria-label="${tr('Frequency')}">${types.map(([value, label]) => radioOption('habit-freq-type', value, label, f.type === value)).join('')}</div>${extra}${applyFooter('habit-freq-apply', '<span></span>', f.type === 'weekdays' && !f.weekdays.length)}`;
  }
  function openFrequencySheet(ctx, anchor) {
    const d = ctx.modalState.draft;
    const clamp = (value, [min, max], fallback) => Math.min(max, Math.max(min, Math.floor(Number(value) || fallback)));
    sheet = { kind: 'frequency', type: d.frequencyType || 'daily', weekdays: (d.weekdays || []).length ? [...d.weekdays].map(Number) : [1, 2, 3, 4, 5], timesPerWeek: clamp(d.timesPerWeek, STEPS.timesPerWeek, 4), everyNDays: clamp(d.everyNDays, STEPS.everyNDays, 2), startDate: d.startDate || ctx.Core.dateOnly() };
    showSheet(ctx, anchor, frequencySheetHtml(ctx), 'habit-frequency');
  }
  function applyFrequencySheet(ctx) {
    const f = sheet; const d = ctx.modalState?.draft;
    if (f?.kind !== 'frequency' || !d || (f.type === 'weekdays' && !f.weekdays.length)) return;
    if ((d.frequencyType === 'timesPerWeek') !== (f.type === 'timesPerWeek')) { d.minimumTarget = null; d.idealTarget = null; }
    Object.assign(d, { frequencyType: f.type, weekdays: [...f.weekdays].sort((a, b) => a - b), timesPerWeek: f.timesPerWeek, everyNDays: f.everyNDays });
    if (f.type === 'everyNDays' && ctx.Core.parseDateOnly(f.startDate)) d.startDate = f.startDate;
    sheet = null; ctx.closePopover(); ctx.renderModal();
  }

  function reminderSheetHtml(ctx) {
    const many = sheet.times.length > 1;
    const rows = sheet.times.map((time, index) => { const label = many ? tr('Time {number}', { number: index + 1 }) : tr('Time'); return `<div class="sheet-field habit-reminder-time"><i class="ph ph-bell" aria-hidden="true"></i><span>${label}</span><input class="input" type="time" value="${ctx.esc(time)}" data-habit-reminder-index="${index}" aria-label="${label}">${many ? `<button class="btn-icon" type="button" data-pop-action="habit-reminder-remove" data-index="${index}" aria-label="${tr('Remove time')}"><i class="ph ph-x"></i></button>` : ''}</div>`; }).join('');
    return `<div class="popover-title">${tr('Reminder')}</div>${sheetSubtitle(ctx)}${rows}<button class="btn btn-ghost habit-reminder-add" type="button" data-pop-action="habit-reminder-add"><i class="ph ph-plus" aria-hidden="true"></i> ${tr('Add time')}</button><p class="sheet-note">${tr('The reminder comes only on days when the habit is planned.')}</p><div class="sheet-footer"><button class="btn btn-ghost" type="button" data-pop-action="habit-reminder-clear">${tr('No reminder')}</button><button class="btn btn-primary" type="button" data-pop-action="habit-reminder-apply">${tr('Apply')}</button></div>`;
  }
  // Disabled reminder records stay; an unchanged time keeps its record.
  function setDraftReminders(ctx, times) {
    const d = ctx.modalState.draft;
    const disabled = (d.reminders || []).filter(item => item?.enabled === false);
    const byTime = new Map((d.reminders || []).filter(item => item?.enabled !== false).map(item => [item.time, item]));
    d.reminders = [...disabled, ...times.map(time => ({ ...(byTime.get(time) || {}), id: byTime.get(time)?.id || ctx.uid('habit-reminder'), time, enabled: true }))];
  }

  function endSheetHtml(ctx) {
    const d = ctx.modalState.draft;
    const weekly = d.frequencyType === 'timesPerWeek';
    const types = [['never', tr('Never')], ['date', tr('On date')], ['successfulPeriods', weekly ? tr('After successful weeks') : tr('After successful days')]];
    const extra = sheet.type === 'date' ? `<label class="sheet-field"><i class="ph ph-calendar-blank" aria-hidden="true"></i><span>${tr('End date')}</span><input id="habit-end-date" class="input" type="date" min="${ctx.esc(d.startDate || ctx.Core.dateOnly())}" value="${ctx.esc(sheet.date)}"></label>`
      : sheet.type === 'successfulPeriods' ? `<label class="sheet-field"><i class="ph ph-hash" aria-hidden="true"></i><span>${weekly ? tr('Number of weeks') : tr('Number of days')}</span><input id="habit-end-count" class="input" type="number" min="1" step="1" value="${ctx.esc(sheet.count)}"></label>` : '';
    return `<div class="popover-title">${tr('End')}</div>${sheetSubtitle(ctx)}<div class="sheet-card" role="radiogroup" aria-label="${tr('End')}">${types.map(([value, label]) => radioOption('habit-end-type', value, label, sheet.type === value)).join('')}</div>${extra}${sheet.error ? `<p class="validation" role="alert">${ctx.esc(sheet.error)}</p>` : ''}${applyFooter('habit-end-apply')}`;
  }
  function readEndInputs(ctx) {
    sheet.date = ctx.$('#habit-end-date')?.value ?? sheet.date;
    sheet.count = ctx.$('#habit-end-count')?.value ?? sheet.count;
  }
  function applyEndSheet(ctx) {
    const d = ctx.modalState.draft;
    readEndInputs(ctx);
    const count = Number(sheet.count);
    sheet.error = sheet.type === 'date' && !sheet.date ? tr('Choose an end date.') : sheet.type === 'date' && sheet.date < (d.startDate || ctx.Core.dateOnly()) ? tr('The end date cannot be before the start.') : sheet.type === 'successfulPeriods' && !(Number.isInteger(count) && count >= 1) ? tr('Successful periods must be a positive whole number.') : '';
    if (sheet.error) { ctx.refreshSheet(endSheetHtml(ctx)); return; }
    Object.assign(d, { endType: sheet.type, endDate: sheet.type === 'date' ? sheet.date : '', successfulPeriodsTarget: sheet.type === 'successfulPeriods' ? count : '' });
    sheet = null; ctx.closePopover(); ctx.renderModal();
  }

  // Minimalna i idealna: blank is the target; whole numbers except for a numeric daily target.
  function targetsSheetHtml(ctx) {
    const d = ctx.modalState.draft;
    const weekly = d.frequencyType === 'timesPerWeek';
    const fractional = d.trackingType === 'numeric' && !weekly;
    const target = plainNumber(weekly ? d.timesPerWeek : d.targetValue);
    const field = (id, label, value) => `<label class="sheet-field"><span>${label}</span><input id="${id}" class="input" type="number" min="${fractional ? 0 : 1}" step="${fractional ? 'any' : '1'}" value="${ctx.esc(value ?? '')}" placeholder="${ctx.esc(target)}"></label>`;
    return `<div class="popover-title">${tr('Minimum and ideal')}</div>${sheetSubtitle(ctx)}${field('habit-minimum', tr('Minimum'), sheet.minimum)}${field('habit-ideal', tr('Ideal'), sheet.ideal)}<p class="sheet-note">${weekly ? tr('Check-ins per week. A blank minimum is the target; a blank ideal is the minimum.') : tr('Per day. A blank minimum is the target; a blank ideal is the minimum.')}</p>${sheet.error ? `<p class="validation" role="alert">${ctx.esc(sheet.error)}</p>` : ''}${applyFooter('habit-targets-apply')}`;
  }
  function applyTargetsSheet(ctx) {
    const d = ctx.modalState.draft;
    const fractional = d.trackingType === 'numeric' && d.frequencyType !== 'timesPerWeek';
    sheet.minimum = ctx.$('#habit-minimum')?.value ?? sheet.minimum ?? '';
    sheet.ideal = ctx.$('#habit-ideal')?.value ?? sheet.ideal ?? '';
    const parse = value => (String(value ?? '').trim() === '' ? null : Number(value));
    const minimum = parse(sheet.minimum); const ideal = parse(sheet.ideal);
    const invalid = [minimum, ideal].some(value => value !== null && (!Number.isFinite(value) || value <= 0 || (!fractional && !Number.isInteger(value))));
    sheet.error = invalid ? (fractional ? tr('Enter a number above zero, or leave blank.') : tr('Enter a whole number above zero, or leave blank.')) : minimum !== null && ideal !== null && minimum > ideal ? tr('Ideal target must be at least the minimum target.') : '';
    if (sheet.error) { ctx.refreshSheet(targetsSheetHtml(ctx)); return; }
    Object.assign(d, { minimumTarget: minimum, idealTarget: ideal });
    sheet = null; ctx.closePopover(); ctx.renderModal();
  }

  function quickSheetHtml(ctx) {
    const values = draftQuickValues(ctx.modalState.draft).map(plainNumber).join(' ');
    return `<div class="popover-title">${tr('Quick values')}</div>${sheetSubtitle(ctx)}<label class="sheet-field"><i class="ph ph-lightning" aria-hidden="true"></i><span>${tr('Quick values')}</span><input id="habit-quick-values" class="input" inputmode="decimal" value="${ctx.esc(values)}"></label><p class="sheet-note">${tr('Separate with spaces. They appear in the value sheet.')}</p>${applyFooter('habit-quick-apply', `<button class="btn btn-ghost" type="button" data-pop-action="habit-quick-suggest">${tr('Suggest')}</button>`)}`;
  }

  function goalsSheetHtml(ctx) {
    const goals = (ctx.state.goals || []).filter(goal => goal.status !== 'archived');
    const options = goals.map(goal => { const on = sheet.ids.has(goal.id); return `<button class="popover-option sheet-option${on ? ' is-selected' : ''}" type="button" data-pop-action="habit-goal-toggle" data-goal-id="${ctx.esc(goal.id)}" aria-pressed="${on}"><i class="ph ph-target" aria-hidden="true"></i><span class="sheet-option-label">${ctx.esc(goal.title)}</span><span class="sheet-check${on ? ' is-on' : ''}" aria-hidden="true">${on ? '<i class="ph ph-check"></i>' : ''}</span></button>`; }).join('');
    return `<div class="popover-title">${tr('Linked goals')}</div>${sheetSubtitle(ctx)}<div class="sheet-card">${options || `<div class="popover-empty">${tr('No Goals yet.')}</div>`}</div>${applyFooter('habit-goals-apply')}`;
  }

  // The window's own actions and its sheets; true when handled. In the details window (R8c) an opener starts from a
  // fresh draft of the habit, and a change to the draft saves at once.
  const DETAIL_OPENERS = new Set(['habit-details-name', 'habit-draft-area', 'habit-details-routine', 'habit-details-tracking', 'habit-draft-quick', 'habit-draft-frequency', 'habit-draft-reminders', 'habit-draft-targets', 'habit-details-grace', 'habit-details-continuation', 'habit-draft-end', 'habit-draft-goals']);
  function handleHabitWindowAction(action, el, ctx) {
    const details = ctx.modalState?.type === 'habit-details';
    if (details && DETAIL_OPENERS.has(action)) {
      const habit = ctx.getHabit(ctx.modalState.habitId);
      if (!habit) return true;
      ctx.modalState.draft = ctx.habitDraft(habit);
    }
    const d = ctx.modalState?.type === 'habit' || details ? ctx.modalState.draft : null;
    if (!d) return false;
    if (!details) return handleHabitDraftAction(action, el, ctx, d);
    const before = JSON.stringify(d);
    const handled = handleHabitDetailsSheet(action, el, ctx, d) || handleHabitDraftAction(action, el, ctx, d);
    if (handled && ctx.modalState?.draft === d && JSON.stringify(d) !== before) commitHabitDetails(ctx);
    return handled;
  }
  function handleHabitDraftAction(action, el, ctx, d) {
    const focusSame = selector => requestAnimationFrame(() => ctx.$(selector)?.focus?.());
    if (action === 'habit-draft-routine' || action === 'habit-draft-tracking') {
      const value = el.dataset.value;
      syncDraftInputs(ctx);
      if (action === 'habit-draft-routine') { if (!ROUTINE_ORDER.includes(value)) return true; d.routine = value; }
      else {
        if (!['checkbox', 'numeric'].includes(value)) return true;
        if (d.trackingType !== value) { d.trackingType = value; d.minimumTarget = null; d.idealTarget = null; }
      }
      ctx.renderModal(); focusSame(`[data-action="${action}"][data-value="${value}"]`); return true;
    }
    if (action === 'habit-draft-area') { syncDraftInputs(ctx); openHabitAreaSheet(ctx, el); return true; }
    if (action === 'habit-draft-set-area') { d.areaId = (ctx.state.areas || []).some(area => area.id === el.dataset.areaId) ? el.dataset.areaId : null; ctx.closePopover(); ctx.renderModal(); return true; }
    if (action === 'habit-draft-frequency') { syncDraftInputs(ctx); openFrequencySheet(ctx, el); return true; }
    if (action === 'habit-freq-type' && sheet?.kind === 'frequency') { sheet.type = ['daily', 'weekdays', 'timesPerWeek', 'everyNDays'].includes(el.dataset.value) ? el.dataset.value : 'daily'; ctx.refreshSheet(frequencySheetHtml(ctx)); return true; }
    if (action === 'habit-freq-day' && sheet?.kind === 'frequency') { const day = Number(el.dataset.day); sheet.weekdays = sheet.weekdays.includes(day) ? sheet.weekdays.filter(item => item !== day) : [...sheet.weekdays, day]; ctx.refreshSheet(frequencySheetHtml(ctx)); return true; }
    if (action === 'habit-freq-step' && sheet?.kind === 'frequency' && STEPS[el.dataset.key]) { const [min, max] = STEPS[el.dataset.key]; sheet[el.dataset.key] = Math.min(max, Math.max(min, sheet[el.dataset.key] + Number(el.dataset.step || 0))); ctx.refreshSheet(frequencySheetHtml(ctx)); return true; }
    if (action === 'habit-freq-apply') { applyFrequencySheet(ctx); return true; }
    if (action === 'habit-draft-reminders') { syncDraftInputs(ctx); const times = activeReminderTimes(ctx, d); sheet = { kind: 'reminders', times: times.length ? times : ['09:00'] }; showSheet(ctx, el, reminderSheetHtml(ctx), 'habit-reminders'); return true; }
    if (action === 'habit-reminder-add' && sheet?.kind === 'reminders') { sheet.times.push('18:00'); ctx.refreshSheet(reminderSheetHtml(ctx)); return true; }
    if (action === 'habit-reminder-remove' && sheet?.kind === 'reminders') { sheet.times.splice(Number(el.dataset.index), 1); if (!sheet.times.length) sheet.times.push('09:00'); ctx.refreshSheet(reminderSheetHtml(ctx)); return true; }
    if (action === 'habit-reminder-clear') { setDraftReminders(ctx, []); sheet = null; ctx.closePopover(); ctx.renderModal(); return true; }
    if (action === 'habit-reminder-apply' && sheet?.kind === 'reminders') { setDraftReminders(ctx, [...new Set(sheet.times.map(time => ctx.Core.normalizeTime(time)).filter(Boolean))].sort()); sheet = null; ctx.closePopover(); ctx.renderModal(); return true; }
    if (action === 'habit-draft-start') { syncDraftInputs(ctx); ctx.openHabitStartSheet(el); return true; }
    if (action === 'habit-draft-end') { syncDraftInputs(ctx); sheet = { kind: 'end', type: ['never', 'date', 'successfulPeriods'].includes(d.endType) ? d.endType : 'never', date: d.endDate || '', count: Number(d.successfulPeriodsTarget) || 30, error: '' }; showSheet(ctx, el, endSheetHtml(ctx), 'habit-end'); return true; }
    if (action === 'habit-end-type' && sheet?.kind === 'end') { readEndInputs(ctx); sheet.type = el.dataset.value; sheet.error = ''; ctx.refreshSheet(endSheetHtml(ctx)); return true; }
    if (action === 'habit-end-apply' && sheet?.kind === 'end') { applyEndSheet(ctx); return true; }
    if (action === 'habit-draft-targets') { syncDraftInputs(ctx); sheet = { kind: 'targets', minimum: d.minimumTarget, ideal: d.idealTarget, error: '' }; showSheet(ctx, el, targetsSheetHtml(ctx), 'habit-targets'); return true; }
    if (action === 'habit-targets-apply' && sheet?.kind === 'targets') { applyTargetsSheet(ctx); return true; }
    if (action === 'habit-draft-quick') { syncDraftInputs(ctx); sheet = { kind: 'quick' }; showSheet(ctx, el, quickSheetHtml(ctx), 'habit-quick'); return true; }
    if (action === 'habit-quick-apply') {
      const values = String(ctx.$('#habit-quick-values')?.value ?? '').split(/[\s;+]+/).map(value => Number(value.replace(',', '.'))).filter(value => Number.isFinite(value) && value > 0);
      d.quickValues = [...new Set(values)]; d.quickValuesSet = true; sheet = null; ctx.closePopover(); ctx.renderModal(); return true;
    }
    if (action === 'habit-quick-suggest') { d.quickValues = []; d.quickValuesSet = false; sheet = null; ctx.closePopover(); ctx.renderModal(); return true; }
    if (action === 'habit-draft-goals') { syncDraftInputs(ctx); sheet = { kind: 'goals', ids: new Set(d.goalIds || []) }; showSheet(ctx, el, goalsSheetHtml(ctx), 'habit-goals'); return true; }
    if (action === 'habit-goal-toggle' && sheet?.kind === 'goals') { const id = el.dataset.goalId; if (sheet.ids.has(id)) sheet.ids.delete(id); else sheet.ids.add(id); ctx.refreshSheet(goalsSheetHtml(ctx)); return true; }
    if (action === 'habit-goals-apply' && sheet?.kind === 'goals') { d.goalIds = [...sheet.ids].filter(id => (ctx.state.goals || []).some(goal => goal.id === id)); sheet = null; ctx.closePopover(); ctx.renderModal(); return true; }
    return false;
  }

  function renderHabitFinishedModal(ctx) {
    const { getHabit, modalFrame, esc } = ctx;
    const habit = getHabit(ctx.modalState.habitId);
    const boundary = ctx.modalState.boundary || 'end';
    const ask = boundary === 'ask'; const onePeriod = boundary === 'onePeriod';
    const title = ask ? tr('Continue habit?') : onePeriod ? tr('Habit period finished') : tr('Habit finished');
    const name = habit?.name || tr('This habit');
    const copy = ask ? tr('{name} completed its period. Continue, pause, or archive it.', { name }) : onePeriod ? tr('{name} was set to one period. Convert it to a repeating habit or archive it.', { name }) : tr('{name} reached its end condition. Archive it or continue tracking.', { name });
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${esc(title)}</h2><button class="btn-icon" type="button" data-action="continue-habit" aria-label="${tr('Close dialog')}"><i class="ph ph-x"></i></button></div><p class="dialog-copy">${esc(copy)}</p><div class="modal-footer"><span></span><div class="modal-footer-actions">${ask ? '<button class="btn btn-ghost" type="button" data-action="pause-habit" data-habit-id="' + esc(habit?.id || '') + '">' + tr('Pause') + '</button>' : ''}<button class="btn btn-ghost" type="button" data-action="continue-habit" data-habit-id="${esc(habit?.id || '')}" data-boundary="${esc(boundary)}">${onePeriod ? tr('Convert to repeating') : tr('Continue habit')}</button><button class="btn btn-primary" type="button" data-action="archive-habit" data-habit-id="${esc(habit?.id || '')}">${tr('Archive')}</button></div></div></div>`, 'small-modal');
  }

  // R8c: the details window's ⋯ has the template, snooze, archive or restore and delete; its rows and footer do the rest.
  function openHabitMenu(ctx, anchor, habitId, options = {}) {
    const { getHabit, esc, openPopover, templateMenuEntry, Core } = ctx;
    const habit = getHabit(habitId); if (!habit) return;
    // After 21:00 there is no "tonight" left (audit H-2).
    const tonight = Core.snoozeTarget('tonight', new Date()) ? `<button class="popover-option" type="button" data-pop-action="snooze-habit" data-habit-id="${esc(habitId)}" data-snooze="tonight"><i class="ph ph-moon"></i>${tr('Snooze tonight')}</button>` : '';
    const lifecycle = habit.status === 'archived'
      ? `<button class="popover-option" type="button" data-pop-action="restore-habit" data-habit-id="${esc(habitId)}"><i class="ph ph-arrow-counter-clockwise"></i>${tr('Restore habit')}</button>`
      : `<button class="popover-option" type="button" data-pop-action="${habit.status === 'paused' ? 'resume-habit' : 'pause-habit'}" data-habit-id="${esc(habitId)}"><i class="ph ph-pause"></i>${habit.status === 'paused' ? tr('Resume habit') : tr('Pause habit')}</button>`;
    const archive = habit.status !== 'archived' ? `<button class="popover-option" type="button" data-pop-action="archive-habit" data-habit-id="${esc(habitId)}"><i class="ph ph-archive"></i>${tr('Archive habit')}</button>` : '';
    const restore = `<button class="popover-option" type="button" data-pop-action="restore-habit" data-habit-id="${esc(habitId)}"><i class="ph ph-arrow-counter-clockwise"></i>${tr('Restore habit')}</button>`;
    const top = options.details ? (habit.status === 'archived' ? restore : archive) : `<button class="popover-option" type="button" data-pop-action="edit-habit" data-habit-id="${esc(habitId)}"><i class="ph ph-pencil-simple"></i>${tr('Edit habit')}</button>${lifecycle}${archive}`;
    const html = `${top}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="snooze-habit" data-habit-id="${esc(habitId)}" data-snooze="15m"><i class="ph ph-clock"></i>${tr('Snooze 15 min')}</button><button class="popover-option" type="button" data-pop-action="snooze-habit" data-habit-id="${esc(habitId)}" data-snooze="1h"><i class="ph ph-clock"></i>${tr('Snooze 1 hour')}</button>${tonight}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="delete-habit" data-habit-id="${esc(habitId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>${tr('Delete habit')}</button>`;
    openPopover(anchor, templateMenuEntry('habit',habitId)+html, { type: 'habit-menu', habitId });
  }

  // The window keeps everything in the draft; only the name, the target and the unit are typed in place.
  function readHabitDraft(ctx) {
    const { $ } = ctx;
    const d = ctx.modalState.draft;
    const name = $('#habit-name'); if (name) d.name = name.value;
    const target = $('#habit-target-value'); if (target) d.targetValue = Number(target.value);
    const unit = $('#habit-unit'); if (unit) d.unit = String(unit.value).trim();
    if (typeof d.quickValues === 'string') d.quickValues = d.quickValues.split(',').map(value => Number(value.trim())).filter(value => Number.isFinite(value) && value > 0);
    return d;
  }

  function saveHabitModal(ctx) {
    const { renderModal, nowIso, getHabit, uid, captureGoalProgress, syncHabitGoalLinks, state, saveState, closeModal, refreshHabitMetrics, render, evaluateGoalProgressChanges, Core } = ctx;
    if (ctx.modalState?.type !== 'habit') return;
    const d = readHabitDraft(ctx);
    if (!String(d.name).trim()) { ctx.modalState.error = tr('Habit needs a name.'); renderModal(); return; }
    if (d.trackingType === 'numeric' && !(d.targetValue > 0)) { ctx.modalState.error = tr('Numeric habits need a target above zero.'); renderModal(); return; }
    if (d.frequencyType === 'weekdays' && !d.weekdays.length) { ctx.modalState.error = tr('Select at least one weekday.'); renderModal(); return; }
    if (d.frequencyType === 'timesPerWeek' && (!Number.isInteger(d.timesPerWeek) || d.timesPerWeek < 1 || d.timesPerWeek > 7)) { ctx.modalState.error = tr('Times per week must be a positive whole number up to 7.'); renderModal(); return; }
    if (d.frequencyType === 'everyNDays' && (!Number.isInteger(d.everyNDays) || d.everyNDays < 1)) { ctx.modalState.error = tr('Every N days must be a positive whole number.'); renderModal(); return; }
    if (d.endType === 'date' && !d.endDate) { ctx.modalState.error = tr('Choose an end date.'); renderModal(); return; }
    if (d.endType === 'successfulPeriods' && (!Number.isInteger(d.successfulPeriodsTarget) || d.successfulPeriodsTarget < 1)) { ctx.modalState.error = tr('Successful periods must be a positive whole number.'); renderModal(); return; }
    const { moreOpen, quickValuesSet, ...draftFields } = d;
    const fields = { ...draftFields, name: String(d.name).trim(), quickValues: d.trackingType === 'numeric' ? draftQuickValues(d) : (d.quickValues || []), reminders: d.reminders, updatedAt: nowIso() };
    const existingId = ctx.modalState.habitId;
    const habit = existingId ? getHabit(existingId) : { id: uid('habit'), goalIds: [], status: 'active', reminderFiredMoments: [], isInbox: Boolean(ctx.modalState.templateContext?.inbox), createdAt: nowIso() };
    // A new weekly target applies from this week on; earlier weeks keep theirs (M11).
    if (existingId) fields.targetHistory = Core.recordHabitTargetChange(habit, fields, Core.habitPeriodKey({ frequencyType: 'timesPerWeek' }, Core.dateOnly(), Core.habitWeekRule(state.settings)));
    Object.assign(habit, fields);
    const before=ctx.modalState.templateInstance?captureGoalProgress():null;
    syncHabitGoalLinks(habit, d.goalIds,ctx.modalState.templateInstance?.goalLinks);
    if (!existingId) state.habits.push(habit);
    saveState(); closeModal(); refreshHabitMetrics().then(()=>{render();if(before)evaluateGoalProgressChanges(before);});
    if (!existingId) ctx.setToastMessage(tr('Habit created')); // R8b: a new habit stays on the current screen

  }

  async function addStarterExamples(ctx) {
    const { state, Core, uid, nowIso, habitDraft, areaDefaults, PROJECT_COLORS, saveState, render, setToastMessage, refreshHabitMetrics } = ctx;
    const normalizeName = value => Core.normalizeTagName(value).toLocaleLowerCase();
    const samplePrefix = 'workspace-starter-v1';
    // Sample titles are created in the UI language; sampleKey markers stay stable so a later run
    // still recognizes examples added in another language, and name matching uses the same tr().
    const areas = [
      ['family-friends', tr('Family & Friends')], ['work', tr('Work')], ['personal-growth', tr('Personal Growth')],
      ['home', tr('Home')], ['travel', tr('Travel')], ['health', tr('Health')], ['career', tr('Career')], ['finance', tr('Finance')]
    ];
    const habits = [
      ['morning', 'cold-shower', tr('Cold shower')], ['morning', 'wim-hof-breathing', tr('Wim Hof breathing')],
      ['morning', '10-minute-workout', tr('10-minute workout')], ['morning', 'beard-balm', tr('Beard balm')],
      ['daily', 'no-nut', tr('No-nut')], ['daily', 'training', tr('Training four times per week')],
      ['daily', 'sleep-before-midnight', tr('Sleep before midnight')], ['daily', 'sleep-7-8-hours', tr('Sleep 7–8 hours')],
      ['daily', 'program-30-minutes', tr('Program 30 minutes')], ['daily', 'read-learn-30-minutes', tr('Read/learn 30 minutes')],
      ['night', 'beard-balm', tr('Beard balm')], ['night', 'tomorrow-tasks', tr("Enter tomorrow's tasks")]
    ];
    const addedAreas = [], addedHabits = [], addedProjects = [], addedTasks = [], addedGoals = [], addedNotes = [], addedResources = [], addedTags = [];
    const timestamp = nowIso(), today = Core.dateOnly();
    const hasSampleOrName = (collection, sampleKey, name, field = 'name') => collection.some(item => item.sampleKey === sampleKey || normalizeName(item[field]) === normalizeName(name));
    const byName = (collection, name, field = 'name') => collection.find(item => normalizeName(item[field]) === normalizeName(name));
    for (const [key, name] of areas) {
      const sampleKey = 'area-routines-v1:area:' + key;
      if (hasSampleOrName(state.areas, sampleKey, name)) continue;
      addedAreas.push({ id: uid('area'), sampleKey, name, ...areaDefaults, status: 'active', isPinned: false, createdAt: timestamp, updatedAt: timestamp });
    }
    for (const [routine, key, name] of habits) {
      const sampleKey = 'area-routines-v1:habit:' + routine + ':' + key;
      if (state.habits.some(habit => habit.sampleKey === sampleKey || normalizeName(habit.name) === normalizeName(name))) continue;
      addedHabits.push({
        ...habitDraft(), id: uid('habit'), sampleKey, name, routine, status: 'active',
        areaId: null, goalIds: [], quickValues: [], reminders: [], reminderFiredMoments: [],
        frequencyType: key === 'training' ? 'timesPerWeek' : 'daily',
        timesPerWeek: key === 'training' ? 4 : null, weekdays: [], everyNDays: null,
        endDate: null, successfulPeriodsTarget: null, createdAt: timestamp, updatedAt: timestamp
      });
    }
    const allAreas = [...state.areas, ...addedAreas];
    const workArea = byName(allAreas, tr('Work'));
    const healthArea = byName(allAreas, tr('Health'));
    const homeArea = byName(allAreas, tr('Home'));
    const travelArea = byName(allAreas, tr('Travel'));
    const careerArea = byName(allAreas, tr('Career'));
    const financeArea = byName(allAreas, tr('Finance'));
    const personalGrowthArea = byName(allAreas, tr('Personal Growth'));
    const familyArea = byName(allAreas, tr('Family & Friends'));
    const tagSeeds = [
      ['focus', tr('Focus'), '#4da3ff'], ['health', tr('Health'), '#6bd39b'], ['home', tr('Home'), '#f2b66d'],
      ['review', tr('Review'), '#b69cff'], ['errands', tr('Errands'), '#f07b72'], ['planning', tr('Planning'), '#59c6c9']
    ];
    for (const [key, name, color] of tagSeeds) {
      const sampleKey = `${samplePrefix}:tag:${key}`;
      if (hasSampleOrName(state.tags, sampleKey, name)) continue;
      addedTags.push({ id: uid('tag'), sampleKey, name, color, createdAt: timestamp, updatedAt: timestamp });
    }
    const allTags = [...state.tags, ...addedTags];
    const tagId = name => byName(allTags, name)?.id || null;
    const projects = [
      ['weekly-plan', tr('Plan your week'), workArea?.id || null, false],
      ['health-baseline', tr('Health baseline'), healthArea?.id || null, false],
      ['family-weekend', tr('Family weekend'), familyArea?.id || null, false],
      ['home-reset', tr('Home reset'), homeArea?.id || null, false],
      ['travel-planning', tr('Travel planning'), travelArea?.id || null, false],
      ['career-portfolio', tr('Career portfolio'), careerArea?.id || null, false],
      ['finance-review', tr('Monthly finance review'), financeArea?.id || null, false],
      ['reading-path', tr('Reading and learning path'), personalGrowthArea?.id || null, false],
      ['cleaning-living-room', tr('Living Room'), homeArea?.id || null, true],
      ['cleaning-bathroom', tr('Bathroom'), homeArea?.id || null, true],
      ['cleaning-kitchen', tr('Kitchen'), homeArea?.id || null, true],
    ];
    for (const [key, name, areaId, isCleaningRoom] of projects) {
      const sampleKey = `${samplePrefix}:project:${key}`;
      if (hasSampleOrName(state.projects, sampleKey, name)) continue;
      addedProjects.push({ id: uid('project'), sampleKey, ...(isCleaningRoom ? { cleaningSampleKey: `cleaning:starter:${key.replace('cleaning-', '')}` } : {}), name, color: PROJECT_COLORS[addedProjects.length % PROJECT_COLORS.length], areaId, goalIds: [], order: state.projects.length + addedProjects.length, isArchived: false, archivedAt: null, isCleaningRoom, createdAt: timestamp, updatedAt: timestamp });
    }
    const allProjects = [...state.projects, ...addedProjects];
    const weeklyPlan = byName(allProjects, tr('Plan your week'));
    const tasks = [
      ['today-priority', tr('Choose today’s priority'), { projectId: weeklyPlan?.id || null, plannedDate: today, todayOrder: 0, tagNames: [tr('Focus'), tr('Planning')] }],
      ['overdue-follow-up', tr('Follow up on an overdue commitment'), { projectId: weeklyPlan?.id || null, dueDate: Core.addDays(today, -1), tagNames: [tr('Review')] }],
      ['due-soon-review', tr('Review this week’s plan'), { projectId: weeklyPlan?.id || null, dueDate: Core.addDays(today, 2), tagNames: [tr('Review'), tr('Planning')] }],
      ['family-dinner', tr('Plan family dinner'), { projectId: byName(allProjects, tr('Family weekend'))?.id || null, plannedDate: Core.addDays(today, 3), tagNames: [tr('Planning')] }],
      ['book-doctor', tr('Book annual health check'), { projectId: byName(allProjects, tr('Health baseline'))?.id || null, dueDate: Core.addDays(today, 5), tagNames: [tr('Health')] }],
      ['update-portfolio', tr('Update portfolio homepage'), { projectId: byName(allProjects, tr('Career portfolio'))?.id || null, plannedDate: Core.addDays(today, 1), tagNames: [tr('Focus')] }],
      ['review-subscriptions', tr('Review monthly subscriptions'), { projectId: byName(allProjects, tr('Monthly finance review'))?.id || null, plannedDate: Core.addDays(today, 6), tagNames: [tr('Review')] }],
      ['choose-destination', tr('Choose a travel destination'), { projectId: byName(allProjects, tr('Travel planning'))?.id || null, dueDate: Core.addDays(today, 10), tagNames: [tr('Planning')] }],
      ['vacuum-living-room', tr('Vacuum'), { projectId: byName(allProjects, tr('Living Room'))?.id || null, plannedDate: today, dueDate: today, tagNames: [tr('Home')], cleaning: ['vacuum-living-room', 'weekly', 1] }],
      ['dust-living-room', tr('Dust surfaces'), { projectId: byName(allProjects, tr('Living Room'))?.id || null, plannedDate: today, dueDate: today, tagNames: [tr('Home')], cleaning: ['dust-living-room', 'weekly', 1] }],
      ['clean-bathroom', tr('Clean bathroom'), { projectId: byName(allProjects, tr('Bathroom'))?.id || null, plannedDate: today, dueDate: today, tagNames: [tr('Home')], cleaning: ['clean-bathroom', 'weekly', 1] }],
      ['check-boiler', tr('Check boiler'), { projectId: byName(allProjects, tr('Bathroom'))?.id || null, plannedDate: today, dueDate: today, tagNames: [tr('Home'), tr('Review')], cleaning: ['check-boiler', 'monthly', 3] }],
      ['wipe-counters', tr('Wipe counters'), { projectId: byName(allProjects, tr('Kitchen'))?.id || null, plannedDate: today, dueDate: today, tagNames: [tr('Home')], cleaning: ['wipe-counters', 'weekly', 1] }],
    ];
    for (const [key, title, extra] of tasks) {
      const sampleKey = `${samplePrefix}:task:${key}`;
      if (hasSampleOrName(state.tasks, sampleKey, title, 'title')) continue;
      const projectId = extra.projectId && allProjects.some(project => project.id === extra.projectId) ? extra.projectId : null;
      const id = uid('task'), cleaning = extra.cleaning;
      addedTasks.push({ id, sampleKey, ...(cleaning ? { cleaningSampleKey: `cleaning:starter:${cleaning[0]}` } : {}), title, notes: '', projectId, areaId: projectId ? null : workArea?.id || null, goalIds: [], plannedDate: extra.plannedDate || null, plannedTime: null, dueDate: extra.dueDate || null, dueTime: null, reminderAt: null, reminderFiredAt: null, recurrence: cleaning ? Core.normalizeRecurrenceV3({ frequency: cleaning[1], interval: cleaning[2], endType: 'never', seriesId: id }) : null, tagIds: (extra.tagNames || []).map(tagId).filter(Boolean), priority: 'none', attachmentIds: [], isInbox: !(projectId || extra.plannedDate), isCompleted: false, completedAt: null, subtasks: [], todayOrder: extra.todayOrder ?? null, projectOrder: projectId ? addedTasks.filter(task => task.projectId === projectId).length : null, inboxOrder: null, createdAt: timestamp, updatedAt: timestamp });
    }
    const allHabits = [...state.habits, ...addedHabits];
    const linkedProject = byName(allProjects, tr('Plan your week'));
    const linkedTask = [...state.tasks, ...addedTasks].find(task => task.sampleKey === `${samplePrefix}:task:today-priority`);
    const linkedHabit = [...state.habits, ...addedHabits].find(habit => habit.sampleKey === 'area-routines-v1:habit:daily:program-30-minutes');
    const goalName = tr('Build a sustainable weekly rhythm'), goalKey = `${samplePrefix}:goal:weekly-rhythm`;
    if (!hasSampleOrName(state.goals, goalKey, goalName, 'title')) {
      const goal = { id: uid('goal'), sampleKey: goalKey, title: goalName, areaId: workArea?.id || null, horizon: 'short', status: 'active', progressMode: 'linkedTasks', progressType: 'percentage', currentValue: 0, targetValue: 100, unit: '', targetDate: Core.addDays(today, 14), projectLinks: linkedProject ? [{ projectId: linkedProject.id, contributionMode: 'allTasks', selectedTaskIds: [] }] : [], taskIds: linkedTask ? [linkedTask.id] : [], habitLinks: linkedHabit ? [{ habitId: linkedHabit.id, metric: 'totalCheckins', target: 7 }] : [], milestones: [], reminders: { sevenDaysBefore: false, threeDaysBefore: false, oneDayBefore: false, onTargetDate: false, time: '09:00' }, reminderFiredMoments: [], createdAt: timestamp, updatedAt: timestamp, completedAt: null };
      addedGoals.push(goal);
      if (linkedProject) linkedProject.goalIds.push(goal.id);
      if (linkedTask) linkedTask.goalIds.push(goal.id);
      if (linkedHabit) linkedHabit.goalIds.push(goal.id);
    }
    const allGoals = [...state.goals, ...addedGoals];
    const extraGoalSeeds = [
      ['health-baseline', tr('Complete my health baseline'), healthArea?.id || null, 'mid', 'linkedTasks', byName(allProjects, tr('Health baseline'))],
      ['travel-plan', tr('Plan a restorative trip'), travelArea?.id || null, 'long', 'manual', byName(allProjects, tr('Travel planning'))],
    ];
    for (const [key, title, areaId, horizon, progressMode, project] of extraGoalSeeds) {
      const goalKey = `${samplePrefix}:goal:${key}`;
      if (hasSampleOrName(state.goals, goalKey, title, 'title')) continue;
      const goal = { id: uid('goal'), sampleKey: goalKey, title, areaId, horizon, status: 'active', progressMode, progressType: progressMode === 'manual' ? 'percentage' : 'linkedTasks', currentValue: 0, targetValue: 100, unit: '', targetDate: Core.addDays(today, horizon === 'long' ? 90 : 30), projectLinks: project ? [{ projectId: project.id, contributionMode: 'allTasks', selectedTaskIds: [] }] : [], taskIds: [], habitLinks: [], milestones: [], reminders: { sevenDaysBefore: false, threeDaysBefore: false, oneDayBefore: false, onTargetDate: false, time: '09:00' }, reminderFiredMoments: [], createdAt: timestamp, updatedAt: timestamp, completedAt: null };
      addedGoals.push(goal);
      if (project) project.goalIds = [...new Set([...(project.goalIds || []), goal.id])];
    }
    const noteName = tr('Weekly planning notes'), noteKey = `${samplePrefix}:note:weekly-planning`;
    if (!hasSampleOrName(state.notes, noteKey, noteName, 'title')) addedNotes.push({ id: uid('note'), sampleKey: noteKey, title: noteName, body: tr('Use this note to capture decisions, loose ends, and a short review for next week.'), areaId: workArea?.id || null, linkUrls: [], attachmentIds: [], createdAt: timestamp, updatedAt: timestamp });
    const resourceName = tr('Starter workspace guide'), resourceKey = `${samplePrefix}:resource:workspace-guide`;
    const weeklyRhythmGoal = byName(allGoals, goalName, 'title');
    const programHabit = byName(allHabits, tr('Program 30 minutes'));
    if (!hasSampleOrName(state.resources, resourceKey, resourceName, 'title')) addedResources.push({ id: uid('resource'), sampleKey: resourceKey, title: resourceName, description: tr('A lightweight reference connected to the starter workspace. Edit or delete it whenever you are ready.'), areaId: workArea?.id || null, linkUrls: ['https://todoist.com/productivity-methods/weekly-planning'], attachmentIds: [], relatedTaskIds: linkedTask ? [linkedTask.id] : [], relatedProjectIds: weeklyPlan ? [weeklyPlan.id] : [], relatedGoalIds: weeklyRhythmGoal ? [weeklyRhythmGoal.id] : [], relatedHabitIds: programHabit ? [programHabit.id] : [], createdAt: timestamp, updatedAt: timestamp });
    const additions = [[state.areas, addedAreas], [state.tags, addedTags], [state.habits, addedHabits], [state.projects, addedProjects], [state.tasks, addedTasks], [state.goals, addedGoals], [state.notes, addedNotes], [state.resources, addedResources]];
    if (!additions.some(([, records]) => records.length)) { setToastMessage(tr('Starter examples already present.')); return; }
    for (const [collection, records] of additions) collection.push(...records);
    if (!saveState()) {
      // Only this invocation's new object references are removed; existing edits stay intact.
      for (const [collection, records] of additions) {
        for (const record of records) { const index = collection.indexOf(record); if (index !== -1) collection.splice(index, 1); }
      }
      render(); setToastMessage(tr('Could not save starter examples locally. Free up browser storage and try again.')); return;
    }
    try {
      await refreshHabitMetrics();
      if (ctx.state !== state) return;
      render(); setToastMessage(tr('Added {areas} Areas, {projects} Projects, {tasks} Tasks, {goals} Goals, {habits} Habits, {tags} Tags, {notes} Notes and {resources} Resources. All examples are editable.', { areas: addedAreas.length, projects: addedProjects.length, tasks: addedTasks.length, goals: addedGoals.length, habits: addedHabits.length, tags: addedTags.length, notes: addedNotes.length, resources: addedResources.length }));
    } catch (error) {
      console.error(error);
      if (ctx.state !== state) return;
      render(); setToastMessage(tr('Examples saved, but Habit metrics could not refresh. Reload to retry.'));
    }
  }

  function handleAction(action, event, ctx) {
    const { $, state, Core, getHabit, habitMetrics, openHabitModal, renderModal, setHabitLog, nowIso, saveState, closeModal, refreshHabitMetrics, render, updateHabitStatus, closePopover, snoozeHabit, requestDeleteEntity, saveAndRender } = ctx;
    if (action === 'read-habit-draft') { readHabitDraft(ctx); return true; }
    if (action === 'add-starter-examples') { addStarterExamples(ctx); return true; }
    const el = event?.target.closest('[data-action], [data-pop-action]');
    if (!el) return false;
    if (handleHabitWindowAction(action, el, ctx)) return true;
    const today = Core.dateOnly();
    // Redesign R8a: the row and cell actions take the day from data-date (Dan and Nedelja), else today.
    const date = Core.parseDateOnly(el.dataset.date) ? el.dataset.date : today;
    const dayLog = id => state.habitLogCache?.[id]?.find(log => log.date === date);
    if (action === 'habit-today-toggle') {
      const habit = getHabit(el.dataset.habitId); if (!habit || date > today) return true;
      if (habit.trackingType === 'numeric') ctx.openHabitValue(habit.id, date);
      else setHabitLog(habit.id, date, dayLog(habit.id)?.status === 'done' ? 'missed' : 'done');
      return true;
    }
    if (action === 'habit-today-menu') { openTodayHabitMenu(ctx, el, el.dataset.habitId, date); return true; }
    if (action === 'habit-today-skip') { closePopover(); setHabitLog(el.dataset.habitId, date, dayLog(el.dataset.habitId)?.status === 'skipped' ? 'missed' : 'skipped'); return true; }
    if (action === 'habit-today-value') { closePopover(); ctx.openHabitValue(el.dataset.habitId, date); return true; }
    if (action === 'habits-view') { state.ui.habitsView = el.dataset.view === 'week' ? 'week' : 'day'; if (state.ui.habitsView === 'day') state.ui.habitsDay = today; saveAndRender(); return true; }
    if (action === 'habits-ring') {
      if (Core.parseDateOnly(el.dataset.date) && el.dataset.date <= today) { state.ui.habitsDay = el.dataset.date; state.ui.habitsView = 'day'; saveAndRender(); }
      return true;
    }
    if (action === 'habit-chart-day') { state.ui.habitChartDay = state.ui.habitChartDay === el.dataset.date ? null : el.dataset.date; saveAndRender(); return true; }
    if (action === 'habit-chart-month') {
      const month = shiftMonth(/^\d{4}-\d{2}$/.test(state.ui.habitTrackerMonth || '') ? state.ui.habitTrackerMonth : today.slice(0, 7), Number(el.dataset.shift) || 0);
      state.ui.habitTrackerMonth = month > today.slice(0, 7) ? today.slice(0, 7) : month;
      state.ui.habitChartDay = null; saveAndRender(); return true;
    }
    if (action === 'habits-fold') { const key = el.dataset.fold === 'archived' ? 'habitsArchivedOpen' : 'habitsPausedOpen'; state.ui[key] = !state.ui[key]; saveAndRender(); return true; }
    if (action === 'habit-today-details') { closePopover(); ctx.openHabitDetails(el.dataset.habitId); return true; }
    if (action === 'habit-details-menu') { openHabitMenu(ctx, el, el.dataset.habitId, { details: true }); return true; }
    if (action === 'habit-details-status') { updateHabitStatus(el.dataset.habitId, el.dataset.status === 'paused' ? 'paused' : 'active'); ctx.closeModal(); return true; }
    if (action === 'habit-details-month') {
      const current = today.slice(0, 7);
      const month = shiftMonth(/^\d{4}-\d{2}$/.test(ctx.modalState?.month || '') ? ctx.modalState.month : current, Number(el.dataset.shift) || 0);
      if (ctx.modalState?.type === 'habit-details') { ctx.modalState.month = month > current ? current : month; ctx.renderModal(); }
      return true;
    }
    if (action === 'habit-value-add') {
      const total = Number(ctx.modalState?.total || 0) + Number(el.dataset.value || 0);
      ctx.modalState.total = Math.round(total * 1000) / 1000; ctx.renderModal(); return true;
    }
    if (action === 'habit-value-apply') {
      const { habitId, date } = ctx.modalState || {};
      const total = Math.max(0, Number(ctx.$('#habit-value-total')?.value) || 0);
      if (habitId) setHabitLog(habitId, date, 'done', total).then(saved => { if (saved === true && ctx.modalState?.type === 'habit-value') ctx.closeModal(); }).catch(console.error);
      return true;
    }
    if (action === 'new-habit') openHabitModal(null, { inbox: Boolean(event?.target?.closest?.('#mobile-quick-add-menu')) });
    else if (action === 'edit-habit') { closePopover(); openHabitModal(el.dataset.habitId); }
    else if (action === 'habit-menu') openHabitMenu(ctx, el, el.dataset.habitId);
    else if (action === 'save-habit') saveHabitModal(ctx);
    else if (action === 'toggle-habit-more') { readHabitDraft(ctx); ctx.modalState.draft.moreOpen = !ctx.modalState.draft.moreOpen; renderModal(); requestAnimationFrame(() => $('[data-action="toggle-habit-more"]')?.focus?.()); }
    else if (action === 'habit-checkin') { const habit = getHabit(el.dataset.habitId); const existing = state.habitLogCache?.[habit?.id]?.find(log => log.date === Core.dateOnly()); setHabitLog(el.dataset.habitId, Core.dateOnly(), existing?.status === 'done' ? 'missed' : 'done'); }
    else if (action === 'habit-skip') setHabitLog(el.dataset.habitId, Core.dateOnly(), 'skipped');
    else if (action === 'habit-quick-add') { const habit = getHabit(el.dataset.habitId); const existing = state.habitLogCache?.[habit?.id]?.find(log => log.date === Core.dateOnly()); setHabitLog(el.dataset.habitId, Core.dateOnly(), 'done', Number(existing?.value || 0) + Number(el.dataset.value || 0)); }
    else if (action === 'continue-habit') { const habit = getHabit(el.dataset.habitId || ctx.modalState?.habitId); if (habit) { const boundary = el.dataset.boundary || ctx.modalState?.boundary; const prior = habitMetrics(habit).periods?.filter(period => !period.isCurrent).at(-1); habit.lastContinuationPeriod = prior?.key || Core.habitPeriodKey(habit, Core.dateOnly(), Core.habitWeekRule(state.settings)); if (boundary === 'onePeriod') habit.continuation = 'automatic'; if (boundary === 'end') { habit.endType = 'never'; habit.endDate = null; habit.successfulPeriodsTarget = null; } habit.updatedAt = nowIso(); saveState(); } closeModal(); refreshHabitMetrics().then(render); }
    else if (action === 'pause-habit') updateHabitStatus(el.dataset.habitId || ctx.modalState?.habitId, 'paused');
    else if (action === 'archive-habit') { updateHabitStatus(el.dataset.habitId, 'archived'); if (ctx.modalState?.type === 'habit-details') ctx.closeModal(); }
    else if (action === 'resume-habit' || action === 'restore-habit') { updateHabitStatus(el.dataset.habitId, 'active'); if (ctx.modalState?.type === 'habit-details') ctx.closeModal(); }
    else if (action === 'delete-habit') { closePopover(); requestDeleteEntity('habit', el.dataset.habitId); }
    else if (action === 'snooze-habit') { snoozeHabit(el.dataset.habitId, el.dataset.snooze); closePopover(); }
    else return false;
    return true;
  }

  function handleInput(event, ctx) {
    const target = event.target;
    if (!['input', 'change'].includes(event.type)) return false;
    // R8b: the window's typed fields and the live inputs of its sheets.
    if (ctx.modalState?.type === 'habit' && ['habit-name', 'habit-target-value', 'habit-unit'].includes(target.id)) { readHabitDraft(ctx); return true; }
    if (target.id === 'habit-freq-start' && sheet?.kind === 'frequency') { if (ctx.Core.parseDateOnly(target.value)) { sheet.startDate = target.value; ctx.refreshSheet(frequencySheetHtml(ctx)); } return true; }
    if (target.matches?.('[data-habit-reminder-index]') && sheet?.kind === 'reminders') { sheet.times[Number(target.dataset.habitReminderIndex)] = target.value; return true; }
    return false;
  }

  window.TodoDomainModules.register({
    name: 'habits',
    renderRoute(route, ctx) {
      if (route.type === 'habits') return renderHabits(ctx);
      if (route.type === 'habit') return renderHabits(ctx); // R8c: app.js opens the details window on top
      if (route.type === 'habit-row') return renderHabitRow(ctx, route.habit, route.todayStatus);
      if (route.type === 'habit-list-row') return renderHabitListRow(ctx, route.habit);
      if (route.type === 'habit-today-row') return renderHabitTodayRow(ctx, route.habit, route.todayStatus);
      if (route.type !== 'modal') return false;
      const renderers = { habit: renderHabitModal, 'habit-details': renderHabitDetails, 'habit-finished': renderHabitFinishedModal, 'habit-value': renderHabitValueModal };
      return renderers[route.modalType]?.(ctx);
    },
    handleAction,
    handleInput
  });
})();
