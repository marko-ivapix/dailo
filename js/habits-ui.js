(function () {
  'use strict';
  const I18n = window.TodoI18n;
  const { tr, trn, msg } = I18n;

  // UI only: live state, persistence, metrics and overlay ownership remain in app.js.
  // Routine labels are translation keys; the daily routine reads "Daytime" so it never shares a
  // key with the "Daily" frequency.
  const ROUTINES = Object.freeze({ morning: msg('Morning'), daily: msg('Daytime'), night: msg('Night') });
  const ROUTINE_DETAILS = Object.freeze({
    morning: { icon: 'ph-sun', copy: msg('Start-of-day practices.') },
    daily: { icon: 'ph-check-square', copy: msg('Flexible routines to complete during the day.') },
    night: { icon: 'ph-moon', copy: msg('Wind-down practices for the end of the day.') }
  });
  // Persisted habit and day statuses stay English enums; only their display is translated.
  const STATUS_LABELS = Object.freeze({ active: msg('Active'), paused: msg('Paused'), archived: msg('Archived'), done: msg('Done'), missed: msg('Missed'), skipped: msg('Skipped'), pending: msg('Pending'), unscheduled: msg('Unscheduled') });
  const statusLabel = status => (Object.prototype.hasOwnProperty.call(STATUS_LABELS, status) ? tr(STATUS_LABELS[status]) : status);
  const routineLabel = routine => (ROUTINES[routine || 'daily'] ? tr(ROUTINES[routine || 'daily']) : '');

  function routineOptions(value) {
    return Object.entries(ROUTINES).map(([key, label]) => `<option value="${key}" ${(value || 'daily') === key ? 'selected' : ''}>${tr(label)}</option>`).join('');
  }

  function openHabitProperty(ctx, element) {
    const { getHabit, render, $, goalFocusTarget } = ctx;
    const habit = getHabit(element.dataset.habitId); if (!habit) return;
    const field = element.dataset.habitProperty;
    ctx.habitPropertyEditor = { habit, field, value: field === 'quickValues' ? (habit.quickValues || []).join(', ') : habit[field] ?? '', returnFocus: goalFocusTarget(element) };
    render(); requestAnimationFrame(() => $('#habit-detail-' + ctx.habitPropertyEditor?.field)?.focus());
  }

  function cancelHabitProperty(ctx) {
    const { render, restoreGoalFocus } = ctx;
    const target = ctx.habitPropertyEditor?.returnFocus; ctx.habitPropertyEditor = null; render(); restoreGoalFocus(target);
  }

  function saveHabitProperty(ctx) {
    const { getHabit, $, state, render, nowIso, saveState, restoreGoalFocus } = ctx;
    const editor = ctx.habitPropertyEditor;
    if (!editor || getHabit(editor.habit.id) !== editor.habit) { cancelHabitProperty(ctx); return; }
    const { habit, field } = editor; editor.value = $('#habit-detail-' + field)?.value ?? editor.value;
    const targetField = ['minimumTarget', 'idealTarget'].includes(field);
    const value = targetField ? (String(editor.value).trim() === '' ? null : Number(editor.value)) : ['targetValue', 'graceDays'].includes(field) ? Number(editor.value) : field === 'areaId' ? editor.value || null : field === 'quickValues' ? String(editor.value).split(',').map(item => Number(item.trim())).filter(item => Number.isFinite(item) && item > 0) : String(editor.value).trim();
    const fractionalTarget = habit.trackingType === 'numeric' && habit.frequencyType !== 'timesPerWeek';
    const invalidTarget = targetField && value !== null && (!Number.isFinite(value) || value <= 0 || !fractionalTarget && !Number.isInteger(value));
    const minimum = field === 'minimumTarget' ? value : habit.minimumTarget;
    const ideal = field === 'idealTarget' ? value : habit.idealTarget;
    const targetError = invalidTarget ? (fractionalTarget ? tr('Enter a number above zero, or leave blank.') : tr('Enter a whole number above zero, or leave blank.')) : field === 'graceDays' && (!Number.isInteger(value) || value < 0) ? tr('Enter zero or more whole days.') : targetField && minimum && ideal && minimum > ideal ? tr('Ideal target must be at least the minimum target.') : '';
    if (targetError) { editor.error = targetError; render(); requestAnimationFrame(() => $('#habit-detail-' + field)?.focus()); return; }
    const hasHistory = (state.habitLogCache?.[habit.id] || []).length > 0;
    const error = field === 'name' && !value ? tr('Habit needs a name.') : field === 'targetValue' && habit.trackingType === 'numeric' && (!Number.isFinite(value) || value <= 0) ? tr('Numeric habits need a target above zero.') : field === 'trackingType' && value !== habit.trackingType && hasHistory ? tr('Tracking cannot change while this Habit has history.') : '';
    if (error) { editor.error = error; render(); requestAnimationFrame(() => $('#habit-detail-' + field)?.focus()); return; }
    const old = habit[field];
    if (JSON.stringify(old) !== JSON.stringify(value)) { habit[field] = value; habit.updatedAt = nowIso(); saveState(); }
    const target = editor.returnFocus; ctx.habitPropertyEditor = null; render(); restoreGoalFocus(target);
  }

  function openHabitSettings(ctx, element) {
    const { getHabit, state, Core, habitDraft, goalFocusTarget, renderModal } = ctx;
    const habit = getHabit(element.dataset.habitId); if (!habit) return;
    const logs = state.habitLogCache?.[habit.id] || []; const today = Core.dateOnly(); const todayLog = logs.find(log => log.date === today);
    ctx.setModalState({ type: 'habit-settings', panel: element.dataset.habitPanel, habitId: habit.id, source: habit, draft: { ...habitDraft(habit), historyDate: today, historyValue: todayLog?.value ?? 0, historyStatus: todayLog?.status || 'done' }, returnFocus: goalFocusTarget(element), error: '' });
    renderModal();
  }

  function habitSettingsFields(ctx, d, panel) {
    const { esc, state, Core } = ctx;
    const weekdays = [msg('Sun'), msg('Mon'), msg('Tue'), msg('Wed'), msg('Thu'), msg('Fri'), msg('Sat')];
    if (panel === 'frequency') return `<label class="field-label">${tr('Frequency')}<select id="habit-panel-frequency" class="input"><option value="daily" ${d.frequencyType === 'daily' ? 'selected' : ''}>${tr('Daily')}</option><option value="weekdays" ${d.frequencyType === 'weekdays' ? 'selected' : ''}>${tr('Selected weekdays')}</option><option value="timesPerWeek" ${d.frequencyType === 'timesPerWeek' ? 'selected' : ''}>${tr('X times per week')}</option><option value="everyNDays" ${d.frequencyType === 'everyNDays' ? 'selected' : ''}>${tr('Every N days')}</option></select></label><div class="habit-frequency-fields"><label class="field-label">${tr('X per week')}<input id="habit-panel-times" class="input" type="number" min="1" max="7" step="1" value="${esc(d.timesPerWeek)}"></label><label class="field-label">${tr('Every N days')}<input id="habit-panel-every" class="input" type="number" min="1" step="1" value="${esc(d.everyNDays)}"></label><div class="field-label">${tr('Weekdays')}<div class="weekday-picker">${weekdays.map((label, day) => `<label><input type="checkbox" data-habit-panel-weekday="${day}" ${d.weekdays.includes(day) ? 'checked' : ''}>${tr(label)}</label>`).join('')}</div></div></div>`;
    if (panel === 'reminders') return `<label class="field-label">${tr('Reminder times (comma separated)')}<input id="habit-panel-reminders" class="input" value="${esc((d.reminders || []).filter(item => item.enabled).map(item => item.time).join(','))}" placeholder="09:00, 18:00"></label><p class="area-empty-copy">${tr('Disabled reminder records stay intact.')}</p>`;
    if (panel === 'continuation') return `<label class="field-label">${tr('Continuation')}<select id="habit-panel-continuation" class="input"><option value="automatic" ${d.continuation === 'automatic' ? 'selected' : ''}>${tr('Repeat automatically')}</option><option value="askEachPeriod" ${d.continuation === 'askEachPeriod' ? 'selected' : ''}>${tr('Ask each period')}</option><option value="onePeriod" ${d.continuation === 'onePeriod' ? 'selected' : ''}>${tr('One period only')}</option></select></label>`;
    if (panel === 'end') return `<label class="field-label">${tr('End condition')}<select id="habit-panel-end-type" class="input"><option value="never" ${d.endType === 'never' ? 'selected' : ''}>${tr('Never')}</option><option value="date" ${d.endType === 'date' ? 'selected' : ''}>${tr('On date')}</option><option value="successfulPeriods" ${d.endType === 'successfulPeriods' ? 'selected' : ''}>${tr('After successful periods')}</option></select></label><label class="field-label">${tr('End date')}<input id="habit-panel-end-date" class="input" type="date" value="${esc(d.endDate)}"></label><label class="field-label">${tr('Successful periods')}<input id="habit-panel-successful-periods" class="input" type="number" min="1" step="1" value="${esc(d.successfulPeriodsTarget)}"></label>`;
    if (panel === 'goals') return `<div class="link-picker"><h3>${tr('Linked Goals')}</h3>${state.goals.map(goal => `<label><input type="checkbox" data-habit-panel-goal="${esc(goal.id)}" ${d.goalIds.includes(goal.id) ? 'checked' : ''}>${esc(goal.title)}</label>`).join('') || `<span class="area-empty-copy">${tr('No Goals yet.')}</span>`}</div>`;
    return `<label class="field-label">${tr('Date')}<input id="habit-panel-history-date" class="input" type="date" max="${esc(Core.dateOnly())}" value="${esc(d.historyDate)}"></label>${d.trackingType === 'numeric' ? `<label class="field-label">${tr('Total')}<input id="habit-panel-history-value" class="input" type="number" step="any" value="${esc(d.historyValue)}"></label>` : `<label class="field-label">${tr('Status')}<select id="habit-panel-history-status" class="input"><option value="done" ${d.historyStatus === 'done' ? 'selected' : ''}>${tr('Done')}</option><option value="skipped" ${d.historyStatus === 'skipped' ? 'selected' : ''}>${tr('Skipped')}</option><option value="missed" ${d.historyStatus === 'missed' ? 'selected' : ''}>${tr('Missed')}</option></select></label>`}`;
  }

  function renderHabitSettingsModal(ctx) {
    const { modalFrame, esc } = ctx;
    const names = { frequency: msg('Frequency'), reminders: msg('Reminders'), continuation: msg('Continuation'), end: msg('End condition'), goals: msg('Linked Goals'), history: msg('Edit history') };
    const saveLabels = { frequency: msg('Save frequency'), reminders: msg('Save reminders'), continuation: msg('Save continuation'), end: msg('Save end condition'), goals: msg('Save linked goals'), history: msg('Save edit history') };
    const d = ctx.modalState.draft; const name = tr(names[ctx.modalState.panel] || msg('Habit settings')); const saveLabel = tr(saveLabels[ctx.modalState.panel] || msg('Save habit settings'));
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${name}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><div class="form-stack">${habitSettingsFields(ctx, d, ctx.modalState.panel)}${ctx.modalState.error ? `<p class="validation" role="alert">${esc(ctx.modalState.error)}</p>` : ''}</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Cancel')}</button><button class="btn btn-primary" type="button" data-action="save-habit-settings">${saveLabel}</button></div></div></div>`, 'small-modal');
  }

  async function saveHabitSettings(ctx) {
    const { getHabit, closeModal, $, $$, renderModal, Core, uid, syncHabitGoalLinks, setHabitLog, restoreGoalFocus, nowIso, saveState, refreshHabitMetrics, render } = ctx;
    if (ctx.modalState?.type !== 'habit-settings') return;
    const editor = ctx.modalState; const habit = getHabit(editor.habitId);
    if (!habit || habit !== editor.source) { closeModal(); return; }
    const d = editor.draft; const panel = editor.panel;
    if (panel === 'frequency') {
      d.frequencyType = $('#habit-panel-frequency')?.value || d.frequencyType;
      d.timesPerWeek = Number($('#habit-panel-times')?.value); d.everyNDays = Number($('#habit-panel-every')?.value); d.weekdays = $$('[data-habit-panel-weekday]').filter(input => input.checked).map(input => Number(input.dataset.habitPanelWeekday));
      if ((d.frequencyType === 'timesPerWeek' && (!Number.isInteger(d.timesPerWeek) || d.timesPerWeek < 1 || d.timesPerWeek > 7)) || (d.frequencyType === 'everyNDays' && (!Number.isInteger(d.everyNDays) || d.everyNDays < 1)) || (d.frequencyType === 'weekdays' && !d.weekdays.length)) { editor.error = tr('Use a positive whole-number schedule and select weekdays when needed.'); renderModal(); return; }
      Object.assign(habit, { frequencyType: d.frequencyType, timesPerWeek: d.timesPerWeek, everyNDays: d.everyNDays, weekdays: d.weekdays });
    } else if (panel === 'reminders') {
      const oldByTime = new Map((habit.reminders || []).map(item => [item.time, item])); const disabled = (habit.reminders || []).filter(item => item.enabled === false);
      const enabled = String($('#habit-panel-reminders')?.value || '').split(',').map(value => Core.normalizeTime(value.trim())).filter(Boolean).map(time => ({ ...(oldByTime.get(time) || {}), id: oldByTime.get(time)?.id || uid('habit-reminder'), time, enabled: oldByTime.get(time)?.enabled !== false }));
      habit.reminders = [...disabled, ...enabled.filter(item => !disabled.some(disabledItem => disabledItem.id === item.id))];
    } else if (panel === 'continuation') habit.continuation = $('#habit-panel-continuation')?.value || habit.continuation;
    else if (panel === 'end') {
      const endType = $('#habit-panel-end-type')?.value || 'never'; const endDate = $('#habit-panel-end-date')?.value || null; const periods = $('#habit-panel-successful-periods')?.value;
      if (endType === 'date' && !endDate) { editor.error = tr('Choose an end date.'); renderModal(); return; }
      if (endType === 'successfulPeriods' && (!Number.isInteger(Number(periods)) || Number(periods) < 1)) { editor.error = tr('Successful periods must be a positive whole number.'); renderModal(); return; }
      Object.assign(habit, { endType, endDate: endType === 'date' ? endDate : null, successfulPeriodsTarget: endType === 'successfulPeriods' ? Number(periods) : null });
    } else if (panel === 'goals') {
      syncHabitGoalLinks(habit, $$('[data-habit-panel-goal]').filter(input => input.checked).map(input => input.dataset.habitPanelGoal));
    } else {
      const date = $('#habit-panel-history-date')?.value; const value = habit.trackingType === 'numeric' ? Number($('#habit-panel-history-value')?.value || 0) : null; const status = habit.trackingType === 'numeric' ? 'done' : $('#habit-panel-history-status')?.value || 'missed';
      if (!date || date > Core.dateOnly()) { editor.error = tr('Choose an eligible past date.'); renderModal(); return; }
      const target = editor.returnFocus; const saved = await setHabitLog(habit.id, date, status, value);
      if (saved === null) return;
      if (!saved) { editor.error = tr('That date is not scheduled for this Habit.'); renderModal(); return; }
      if (ctx.modalState === editor) { closeModal(); restoreGoalFocus(target); } return;
    }
    habit.updatedAt = nowIso(); saveState(); const target = editor.returnFocus; closeModal(); await refreshHabitMetrics(); render(); restoreGoalFocus(target);
  }

  function habitFrequencyLabel(ctx, habit) {
    if (habit.frequencyType === 'weekdays') return tr('Weekdays {days}', { days: (habit.weekdays || []).map(day => tr([msg('Sun'), msg('Mon'), msg('Tue'), msg('Wed'), msg('Thu'), msg('Fri'), msg('Sat')][day] || '')).join(', ') });
    if (habit.frequencyType === 'timesPerWeek') return trn(habit.timesPerWeek || 1, '{count} time/week', '{count} times/week');
    if (habit.frequencyType === 'everyNDays') return trn(habit.everyNDays || 1, 'Every {count} day', 'Every {count} days');
    return tr('Daily');
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

  function renderHabitSection(ctx, label, habits, group = {}) {
    const icon = group.icon ? `<i class="ph ${group.icon}" aria-hidden="true"></i>` : '';
    const copy = group.copy ? `<p>${ctx.esc(group.copy)}</p>` : '';
    const groupClass = group.className ? ` ${group.className}` : '';
    return `<section class="section habit-group${groupClass}"><div class="section-header habit-group-header"><div class="habit-group-heading">${icon}<div><h2 class="section-label">${ctx.esc(label)}</h2>${copy}</div></div><span class="section-count">${habits.length}</span></div>${habits.length ? `<div class="habit-list">${habits.map(habit => renderHabitRow(ctx, habit)).join('')}</div>` : `<p class="area-empty-copy">${tr('No active habits in this routine.')}</p>`}</section>`;
  }

  function trackerDates(ctx) {
    const today = ctx.Core.dateOnly();
    const monthKey = /^\d{4}-\d{2}$/.test(ctx.state.ui.habitTrackerMonth || '') ? ctx.state.ui.habitTrackerMonth : today.slice(0, 7);
    const current = new Date(`${monthKey}-01T12:00:00`); const year = current.getFullYear(); const month = current.getMonth();
    const monthName = current.toLocaleDateString(I18n.locale(), { month: 'long', year: 'numeric' });
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: 31 }, (_, index) => {
      const day = index + 1; const valid = day <= daysInMonth;
      const date = valid ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
      const parsed = valid ? new Date(`${date}T12:00:00`) : null;
      return { date, day, valid, future: Boolean(date && date > today), weekday: parsed ? parsed.toLocaleDateString(I18n.locale(), { weekday: 'short' }).slice(0, 2) : '', week: Math.floor(index / 7) + 1, monthName };
    });
  }

  function shiftMonth(monthKey, amount) {
    const date = new Date(`${monthKey}-01T12:00:00`);
    date.setMonth(date.getMonth() + amount);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function trackerCompletion(ctx, habit, dates) {
    const logs = ctx.state.habitLogCache?.[habit.id] || [];
    const today = ctx.Core.dateOnly();
    return ctx.Core.habitCompletionForDates(habit, logs, dates.filter(entry => entry.valid && entry.date).map(entry => entry.date), today, ctx.Core.weekStartKey(ctx.state.settings.weekStartsOn));
  }

  function renderHabitDashboard(ctx, habits) {
    const { Core, esc, habitMetrics } = ctx;
    const dates = trackerDates(ctx); const today = Core.dateOnly();
    const active = habits.filter(habit => habit.status === 'active');
    const todayDone = active.filter(habit => {
      const status = Core.habitStatusForDate(habit, ctx.state.habitLogCache?.[habit.id] || [], today, today);
      return status.status === 'done';
    }).length;
    const completions = active.map(habit => trackerCompletion(ctx, habit, dates));
    const average = completions.length ? Math.round(completions.reduce((sum, value) => sum + value, 0) / completions.length) : 0;
    const monthDone = active.reduce((total, habit) => total + dates.filter(entry => entry.valid && !entry.future).reduce((count, entry) => { const status = Core.habitStatusForDate(habit, ctx.state.habitLogCache?.[habit.id] || [], entry.date, today); return count + (status.status === 'done' ? 1 : 0); }, 0), 0);
    const bestStreak = active.reduce((best, habit) => Math.max(best, Number(habitMetrics(habit).currentStreak || 0)), 0);
    const weeks = Array.from({ length: 5 }, (_, week) => {
      const slice = dates.slice(week * 7, week * 7 + 7);
      const values = active.map(habit => trackerCompletion(ctx, habit, slice));
      return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    });
    const weekBar = weeks.map((value, index) => `<div class="habit-trend-bar-wrap"><span class="habit-trend-value">${value}%</span><span class="habit-trend-bar" style="--habit-bar-height:${Math.max(6, value)}%" aria-label="${tr('Week {number}: {percent}%', { number: index + 1, percent: value })}"></span><small>${tr('W{number}', { number: index + 1 })}</small></div>`).join('');
    const weeksHead = Array.from({ length: 5 }, (_, index) => `<span style="grid-column:${2 + index * 7} / span ${index === 4 ? 3 : 7}">${tr('Week {number}', { number: index + 1 })}</span>`).join('');
    const daysHead = dates.map(entry => `<span class="${entry.valid ? '' : 'is-outside-month'}" title="${esc(entry.date || tr('Outside this month'))}">${entry.valid ? entry.weekday : '—'}<b>${entry.day}</b></span>`).join('');
    const rows = active.map(habit => {
      const logs = ctx.state.habitLogCache?.[habit.id] || [];
      const cells = dates.map(entry => {
        const status = entry.valid ? Core.habitStatusForDate(habit, logs, entry.date, today) : { status: 'outside-month', percent: 0 };
        const percent = Math.round(Number(status.percent || (status.status === 'done' ? 100 : 0)));
        const canToggle = Boolean(entry.valid && !entry.future && habit.status === 'active');
        const nextStatus = status.status === 'done' ? 'missed' : 'done';
        const label = entry.valid ? `${habit.name} ${entry.date}: ${statusLabel(status.status)}` : tr('{name}: outside this month', { name: habit.name });
        return `<button class="habit-day-cell is-${esc(status.status)}${entry.future ? ' is-future' : ''}" type="button" ${canToggle ? `data-action="habit-grid-toggle" data-habit-id="${esc(habit.id)}" data-habit-date="${esc(entry.date)}"` : 'disabled'} style="--habit-cell-fill:${Math.max(0, Math.min(100, percent))}%" title="${esc(label)}" aria-label="${esc(label)}" aria-pressed="${status.status === 'done'}"></button>`;
      }).join('');
      return `<div class="habit-tracker-row"><button class="habit-tracker-name" type="button" data-route="habit/${esc(habit.id)}"><i class="ph ${ROUTINE_DETAILS[habit.routine || 'daily'].icon}"></i><span><strong>${esc(habit.name)}</strong><small>${esc(routineLabel(habit.routine))}</small></span></button><div class="habit-tracker-cells">${cells}</div><strong class="habit-tracker-percent">${trackerCompletion(ctx, habit, dates)}%</strong></div>`;
    }).join('');
    const breakdown = active.map(habit => `<div class="habit-analysis-bar"><span>${esc(habit.name)}</span><div><i style="--habit-bar-width:${trackerCompletion(ctx, habit, dates)}%"></i></div><strong>${trackerCompletion(ctx, habit, dates)}%</strong></div>`).join('');
    const monthKey = dates[0].date?.slice(0, 7) || ctx.state.ui.habitTrackerMonth;
    const currentMonth = today.slice(0, 7);
    const focusCount = monthKey === currentMonth ? `${todayDone}/${active.length}` : `${monthDone}`;
    const focusLabel = monthKey === currentMonth ? tr('today') : trn(monthDone, 'month check-in', 'month check-ins');
    const checkedLabel = monthKey === currentMonth ? tr('Checked today') : tr('Month check-ins');
    return `<section class="habit-dashboard"><div class="habit-dashboard-head"><div><h2>${tr('Consistency')}</h2><p>${esc(dates[0].monthName)} · ${monthKey === currentMonth ? tr('click any past day to update it') : monthKey < currentMonth ? tr('historical month · click any day to update it') : tr('future month · check-ins unlock as days arrive')}</p></div><div class="habit-dashboard-head-actions"><div class="habit-month-navigation" aria-label="${tr('Habit tracker month')}"><button class="btn-icon" type="button" data-action="habit-month-shift" data-month-shift="-1" aria-label="${tr('Previous month')}"><i class="ph ph-caret-left"></i></button><strong>${esc(dates[0].monthName)}</strong><button class="btn-icon" type="button" data-action="habit-month-shift" data-month-shift="1" aria-label="${tr('Next month')}"><i class="ph ph-caret-right"></i></button>${monthKey !== currentMonth ? `<button class="btn btn-ghost" type="button" data-action="habit-month-today">${tr('Today')}</button>` : ''}</div><div class="habit-dashboard-summary"><span><strong>${focusCount}</strong> ${focusLabel}</span><span><strong>${average}%</strong> ${tr('month average')}</span><span><strong>${bestStreak}</strong> ${trn(bestStreak, 'day streak', 'day streak')}</span></div></div></div><div class="habit-dashboard-legend" aria-label="${tr('Habit tracker legend')}"><span><i class="habit-legend-swatch is-done"></i> ${tr('Done')}</span><span><i class="habit-legend-swatch is-missed"></i> ${tr('Missed')}</span><span><i class="habit-legend-swatch is-skipped"></i> ${tr('Skipped')}</span><span><i class="habit-legend-swatch is-future"></i> ${tr('Future')}</span></div><div class="habit-dashboard-body"><div class="habit-tracker-scroll"><div class="habit-tracker-canvas"><div class="habit-tracker-weekbar"><span></span>${weeksHead}<span></span></div><div class="habit-tracker-daybar"><span>${tr('Habit')}</span>${daysHead}<span>%</span></div>${rows}</div></div><aside class="habit-analysis"><div class="habit-analysis-head"><h3>${tr('Analysis')}</h3><span>${esc(dates[0].monthName)}</span></div><div class="habit-trend" aria-label="${tr('Weekly habit completion')}">${weekBar}</div><dl class="habit-analysis-list"><div><dt>${tr('Active habits')}</dt><dd>${active.length}</dd></div><div><dt>${checkedLabel}</dt><dd>${monthKey === currentMonth ? todayDone : monthDone}</dd></div><div><dt>${tr('Best current streak')}</dt><dd>${trn(bestStreak, '{count} day', '{count} days')}</dd></div></dl><div class="habit-analysis-breakdown">${breakdown}</div></aside></div></section>`;
  }

  function renderHabits(ctx) {
    const { state, pageHeader, emptyState } = ctx;
    const tab = state.ui.habitTab || 'active';
    const habits = (state.habits || []).filter(habit => tab === 'all' || (tab === 'archived' ? habit.status === 'archived' : habit.status !== 'archived'));
    let html = pageHeader(tr('Habits'), trn(habits.filter(habit => habit.status === 'active').length, '{count} active habit', '{count} active habits'), { add: false, actionHtml: `<button class="btn btn-primary" type="button" data-action="new-habit"><i class="ph ph-plus"></i> ${tr('New habit')}</button>` });
    html += `<div class="area-tabs"><button type="button" data-habit-tab="active" class="${tab === 'active' ? 'is-active' : ''}">${tr('Active')}</button><button type="button" data-habit-tab="all" class="${tab === 'all' ? 'is-active' : ''}">${tr('All')}</button><button type="button" data-habit-tab="archived" class="${tab === 'archived' ? 'is-active' : ''}">${tr('Archived')}</button></div>`;
    if (!habits.length) return html + emptyState(tr('No habits yet.'), tr('Track a repeatable behavior without turning it into a task.'), tr('New habit'), 'new-habit');
    if (tab !== 'active') return html + `<div class="habit-list">${habits.map(habit => renderHabitRow(ctx, habit)).join('')}</div>`;
    const activeHabits = habits.filter(habit => habit.status === 'active');
    if (activeHabits.length) html += renderHabitDashboard(ctx, activeHabits);
    for (const [routine, label] of Object.entries(ROUTINES)) {
      html += renderHabitSection(ctx, tr(label), habits.filter(habit => habit.status === 'active' && (habit.routine || 'daily') === routine), { ...ROUTINE_DETAILS[routine], copy: tr(ROUTINE_DETAILS[routine].copy), className: `habit-group--${routine}` });
    }
    const paused = habits.filter(habit => habit.status === 'paused');
    return html + (paused.length ? renderHabitSection(ctx, tr('Paused'), paused, { icon: 'ph-pause', copy: tr('Paused habits keep their history and settings.'), className: 'habit-group--paused' }) : '');
  }

  function heatmapHtml(ctx, habit, logs) {
    const { Core, esc } = ctx;
    const today = Core.dateOnly();
    const current = new Date(`${today}T12:00:00`);
    const year = current.getFullYear(); const month = current.getMonth();
    const count = new Date(year, month + 1, 0).getDate();
    const dates = Array.from({ length: count }, (_, index) => `${year}-${String(month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`);
    return `<p class="area-empty-copy">${esc(current.toLocaleDateString(I18n.locale(), { month: 'long', year: 'numeric' }))}</p><div class="habit-heatmap" aria-label="${tr('Monthly heatmap')}">${dates.map(date => { const status = Core.habitStatusForDate(habit, logs, date, today); return `<span class="heatmap-day is-${esc(status.status)}" style="--heat-intensity:${Math.max(0, Math.min(1, Number(status.percent || 0) / 100))}" title="${esc(date)}"></span>`; }).join('')}</div>`;
  }

  function renderHabitAnalytics(ctx, habit, logs) {
    const { Core, esc, state } = ctx;
    const today = Core.dateOnly();
    const current = new Date(`${today}T12:00:00`);
    const days = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
    const dates = Array.from({ length: days }, (_, index) => `${today.slice(0, 8)}${String(index + 1).padStart(2, '0')}`);
    const analytics = Core.habitAnalytics(habit, logs, { today, dates, weekStartsOn: Core.weekStartKey(state.settings.weekStartsOn) });
    const chart = habit.frequencyType === 'timesPerWeek'
      ? analytics.weeklySeries.map((point, index) => ({ label: tr('W{number}', { number: index + 1 }), ...point }))
      : analytics.monthlySeries.slice(-7).map(point => ({ label: point.date.slice(-2), ...point }));
    return `<section class="habit-analytics" data-habit-analytics><div class="habit-analytics-summary"><span><strong>${analytics.completionPercent}%</strong> ${tr('completion')}</span><span><strong>${analytics.checkedToday ? tr('Yes') : tr('No')}</strong> ${tr('checked today')}</span><span><strong>${analytics.currentStreak}</strong> ${tr('current streak')}</span><span><strong>${analytics.bestStreak}</strong> ${tr('best streak')}</span></div><div class="habit-analytics-chart" data-habit-analytics-chart aria-label="${tr('Recent completion chart')}">${chart.map(point => `<span title="${esc(point.label)}: ${esc(point.percent)}%"><i style="--habit-bar-height:${Math.max(5, point.percent)}%"></i><small>${esc(point.label)}</small></span>`).join('') || `<small>${tr('No eligible days yet.')}</small>`}</div><div class="habit-analytics-heatmap" data-habit-analytics-heatmap aria-label="${tr('Eligible monthly activity')}">${analytics.monthlySeries.map(point => `<i class="is-${esc(point.status)}" style="--heat-intensity:${Math.max(0, Math.min(1, point.percent / 100))}" title="${esc(point.date)}: ${esc(statusLabel(point.status))}"></i>`).join('') || `<small>${tr('No eligible days yet.')}</small>`}</div></section>`;
  }

  function renderHabitInsights(ctx, habit, metrics) {
    const { Core, esc } = ctx;
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
    const recovery = missedDays ? `${target.minimumMet ? trn(missedDays, 'Recovered after {count} missed day.', 'Recovered after {count} missed days.') : trn(missedDays, 'Resume after {count} missed day.', 'Resume after {count} missed days.')} ${missedDays <= graceDays ? trn(graceDays, 'Within your {count}-day grace allowance.', 'Within your {count}-day grace allowance.') : trn(graceDays, 'Beyond your {count}-day grace allowance; start again today.', 'Beyond your {count}-day grace allowance; start again today.')}` : tr('No recent missed period to recover from.');
    const summary = (label, days, key) => {
      const since = Core.addDays(today, 1 - days);
      const included = periods.filter(period => period.dates.at(-1) >= since);
      const statuses = included.map(period => Core.getHabitTargetStatus(habit, { currentPeriodCount: period.progressValue }));
      const minimum = statuses.filter(status => status.minimumMet).length;
      const ideal = statuses.filter(status => status.idealMet).length;
      return `<section class="insight-card" data-habit-insight="${key}"><h3>${label}</h3><strong>${tr('{minimum} minimum · {ideal} ideal', { minimum, ideal })}</strong><p>${trn(included.length, '{count} scheduled period in the last {days} days, through today.', '{count} scheduled periods in the last {days} days, through today.', { days })}</p></section>`;
    };
    return `<section class="habit-insights" data-habit-insights><div class="insight-card" data-habit-target-status="${target.status}"><h2>${tr('Target progress')}</h2><strong>${tr('{current} / {minimum} minimum · {ideal} ideal', { current: esc(target.current), minimum: esc(target.minimumTarget), ideal: esc(target.idealTarget) })}</strong><p>${target.idealMet ? tr('Ideal target met') : target.minimumMet ? tr('Minimum target met') : tr('Working toward minimum')}</p><p data-habit-recovery>${esc(recovery)}</p></div><div class="insight-grid">${summary(tr('Weekly insight'), 7, 'week')}${summary(tr('Monthly insight'), 30, 'month')}</div></section>`;
  }

  function renderHabit(ctx, habitId) {
    const { getHabit, habitMetrics, state, Core, pageHeader, esc } = ctx;
    const habit = getHabit(habitId); if (!habit) return renderHabits(ctx);
    const metrics = habitMetrics(habit); const logs = state.habitLogCache?.[habit.id] || [];
    const today = Core.dateOnly(); const todayStatus = Core.habitStatusForDate(habit, logs, today, today);
    const todayLog = logs.find(log => log.date === today);
    const history = [...logs].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    let html = pageHeader(habit.name, `${habitFrequencyLabel(ctx, habit)} · ${statusLabel(habit.status)}`, { add: false, actionHtml: `<button class="btn btn-secondary" type="button" data-action="edit-habit" data-habit-id="${esc(habit.id)}"><i class="ph ph-pencil-simple"></i> ${tr('Edit')}</button><button class="btn-icon" type="button" data-action="habit-menu" data-habit-id="${esc(habit.id)}" aria-label="${tr('Habit actions')}"><i class="ph ph-dots-three"></i></button>` });
    html += `<div class="form-stack goal-properties habit-target-properties">${[['minimumTarget', tr('Minimum target')], ['idealTarget', tr('Ideal target')], ['graceDays', tr('Grace days')]].map(([field, label]) => renderHabitProperty(ctx, habit, field, label)).join('')}<p class="area-empty-copy">${habit.frequencyType === 'timesPerWeek' ? tr('Targets apply to each scheduled period (completed check-ins per week).') : habit.trackingType === 'numeric' ? tr('Targets apply to each scheduled period ({unit}).', { unit: esc(habit.unit || tr('units')) }) : tr('Targets apply to each scheduled period (check-ins).')} ${tr('Grace describes recovery; recorded check-ins and streaks stay unchanged.')}</p></div>`;
    html += renderHabitInsights(ctx, habit, metrics);
    html += `<div class="form-stack goal-properties habit-properties">${[['name',tr('Name')],['areaId',tr('Area')],['routine',tr('Routine')],['trackingType',tr('Tracking')],['targetValue',tr('Target value')],['unit',tr('Unit')],['quickValues',tr('Quick values')]].map(([field,label]) => renderHabitProperty(ctx, habit, field, label)).join('')}<div class="goal-detail-actions"><button class="btn btn-secondary" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="frequency">${tr('Frequency')}</button><button class="btn btn-secondary" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="reminders">${tr('Reminders')}</button><button class="btn btn-secondary" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="continuation">${tr('Continuation')}</button><button class="btn btn-secondary" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="end">${tr('End condition')}</button><button class="btn btn-secondary" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="goals">${tr('Linked Goals')}</button></div></div>`;
    html += `<section class="habit-detail-card"><div class="habit-detail-context"><span class="habit-status habit-status--${esc(habit.status)}">${esc(statusLabel(habit.status))}</span><span>${esc(habitFrequencyLabel(ctx, habit))}</span><span>${tr('Today: {status}', { status: esc(statusLabel(todayStatus.status)) })}</span></div><div class="habit-summary"><strong>${esc(habitProgressLabel(ctx, habit, metrics))}</strong><span>${tr('Current period')}</span></div><div class="habit-metric-grid"><div><strong>${metrics.currentStreak}</strong><span>${tr('Current streak')}</span></div><div><strong>${metrics.longestStreak}</strong><span>${tr('Longest streak')}</span></div><div><strong>${metrics.totalCheckins}</strong><span>${tr('Total check-ins')}</span></div><div><strong>${Math.round(metrics.completionRate)}%</strong><span>${tr('Completion rate')}</span></div></div>${habit.status === 'active' ? (habit.trackingType === 'numeric' ? `<div class="habit-checkin-controls">${(habit.quickValues || []).map(value => `<button class="btn btn-secondary" type="button" data-action="habit-quick-add" data-habit-id="${esc(habit.id)}" data-value="${esc(value)}">+${esc(value)}</button>`).join('')}<label class="field-label">${tr('Daily total')}<input id="habit-direct-total" class="input" type="number" step="any" value="${esc(todayLog?.value || 0)}" /></label><button class="btn btn-primary" type="button" data-action="save-habit-total" data-habit-id="${esc(habit.id)}">${tr('Save total')}</button></div>` : `<div class="habit-checkin-controls"><button class="btn btn-primary" type="button" data-action="habit-checkin" data-habit-id="${esc(habit.id)}">${todayStatus.status === 'done' ? tr('Mark not done') : tr('Check in')}</button><button class="btn btn-ghost" type="button" data-action="habit-skip" data-habit-id="${esc(habit.id)}">${tr('Skip today')}</button></div>`) : `<p class="area-empty-copy">${tr('Paused and archived habits preserve history but cannot be checked in.')}</p>`}</section>`;
    html += renderHabitAnalytics(ctx, habit, logs);
    html += `<section class="section"><div class="section-header"><h2 class="section-label">${tr('Monthly heatmap')}</h2></div>${heatmapHtml(ctx, habit, logs)}</section>`;
    const historyEditor = `<div class="habit-history-row"><input id="habit-history-date" class="input" type="date" max="${esc(today)}" value="${esc(today)}">${habit.trackingType === 'numeric' ? `<input id="habit-history-new-value" class="input" type="number" step="any" value="0">` : `<select id="habit-history-new-status" class="input"><option value="done">${tr('Done')}</option><option value="skipped">${tr('Skipped')}</option><option value="missed">${tr('Missed')}</option></select>`}<button class="btn btn-ghost" type="button" data-action="save-habit-history-date" data-habit-id="${esc(habit.id)}">${tr('Save date')}</button></div>`;
    html += `<section class="section"><div class="section-header"><h2 class="section-label">${tr('History')}</h2><button class="btn btn-ghost" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="history">${tr('Edit history')}</button></div>${historyEditor}${history.length ? `<div class="habit-history">${history.map(log => `<div class="habit-history-row"><span>${esc(log.date)}</span>${habit.trackingType === 'numeric' ? `<input class="input" type="number" step="any" value="${esc(log.value ?? 0)}" data-habit-history-value data-habit-date="${esc(log.date)}">` : `<select class="input" data-habit-history-status data-habit-date="${esc(log.date)}"><option value="done" ${log.status === 'done' ? 'selected' : ''}>${tr('Done')}</option><option value="skipped" ${log.status === 'skipped' ? 'selected' : ''}>${tr('Skipped')}</option><option value="missed" ${log.status === 'missed' ? 'selected' : ''}>${tr('Missed')}</option></select>`}<button class="btn btn-ghost" type="button" data-action="save-habit-history" data-habit-id="${esc(habit.id)}" data-habit-date="${esc(log.date)}">${tr('Save')}</button></div>`).join('')}</div>` : `<p class="area-empty-copy">${tr('No history yet. Choose any eligible past date to add a correction.')}</p>`}</section>`;
    return html;
  }

  function renderHabitProperty(ctx, habit, field, label) {
    const { getArea, state, esc } = ctx;
    const editor = ctx.habitPropertyEditor?.habit === habit && ctx.habitPropertyEditor.field === field ? ctx.habitPropertyEditor : null;
    const value = field === 'routine' ? routineLabel(habit.routine) : field === 'areaId' ? getArea(habit.areaId)?.name || tr('No area') : field === 'quickValues' ? (habit.quickValues || []).join(', ') : field === 'trackingType' && habit.trackingType ? (habit.trackingType === 'numeric' ? tr('Numeric') : tr('Checkbox')) : habit[field] ?? '';
    if (!editor) return `<div class="goal-property"><span class="field-label">${label}</span><button class="btn btn-ghost" type="button" data-habit-property="${field}" data-habit-id="${esc(habit.id)}">${esc(value === 0 ? 0 : value || (field === 'areaId' ? tr('No area') : tr('Not set')))}</button></div>`;
    const saveLabels = { minimumTarget: msg('Save minimum target'), idealTarget: msg('Save ideal target'), graceDays: msg('Save grace days'), name: msg('Save name'), areaId: msg('Save area'), routine: msg('Save routine'), trackingType: msg('Save tracking'), targetValue: msg('Save target value'), unit: msg('Save unit'), quickValues: msg('Save quick values') };
    const saveLabel = tr(saveLabels[field] || msg('Save'));
    const id = 'habit-detail-' + field;
    const fractionalTarget = field !== 'graceDays' && habit.trackingType === 'numeric' && habit.frequencyType !== 'timesPerWeek';
    if (['minimumTarget', 'idealTarget', 'graceDays'].includes(field)) return `<div class="goal-property-editor"><label class="field-label" for="${id}">${label}</label><input id="${id}" class="input" type="number" min="${field === 'graceDays' || fractionalTarget ? 0 : 1}" step="${fractionalTarget ? 'any' : '1'}" value="${esc(editor.value)}" ${editor.error ? 'aria-invalid="true" aria-describedby="habit-property-error"' : ''}>${editor.error ? `<p id="habit-property-error" class="validation" role="alert">${esc(editor.error)}</p>` : ''}<div class="goal-detail-actions"><button class="btn btn-secondary" type="button" data-action="save-habit-property">${saveLabel}</button><button class="btn btn-ghost" type="button" data-action="cancel-habit-property">${tr('Cancel')}</button></div></div>`;
    const input = field === 'routine' ? `<select id="${id}" class="input">${routineOptions(editor.value)}</select>` : field === 'areaId' ? `<select id="${id}" class="input"><option value="">${tr('No area')}</option>${state.areas.filter(a => a.status === 'active' || a.id === habit.areaId).map(a => `<option value="${esc(a.id)}" ${a.id === editor.value ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : field === 'trackingType' ? `<select id="${id}" class="input"><option value="checkbox" ${editor.value === 'checkbox' ? 'selected' : ''}>${tr('Checkbox')}</option><option value="numeric" ${editor.value === 'numeric' ? 'selected' : ''}>${tr('Numeric')}</option></select>` : `<input id="${id}" class="input" type="${field === 'targetValue' ? 'number' : 'text'}" ${field === 'targetValue' ? 'step="any"' : field === 'name' ? 'maxlength="120"' : ''} value="${esc(editor.value)}" ${editor.error ? 'aria-invalid="true" aria-describedby="habit-property-error"' : ''}>`;
    return `<div class="goal-property-editor"><label class="field-label" for="${id}">${label}</label>${input}${editor.error ? `<p id="habit-property-error" class="validation" role="alert">${esc(editor.error)}</p>` : ''}<div class="goal-detail-actions"><button class="btn btn-secondary" type="button" data-action="save-habit-property">${saveLabel}</button><button class="btn btn-ghost" type="button" data-action="cancel-habit-property">${tr('Cancel')}</button></div></div>`;
  }

  function renderHabitModal(ctx) {
    const { state, esc, modalFrame } = ctx;
    const d = ctx.modalState.draft; const editing = Boolean(ctx.modalState.habitId);
    const weekdays = [msg('Sun'), msg('Mon'), msg('Tue'), msg('Wed'), msg('Thu'), msg('Fri'), msg('Sat')];
    const goalLinks = state.goals.map(goal => `<label><input type="checkbox" data-habit-goal="${esc(goal.id)}" ${d.goalIds.includes(goal.id) ? 'checked' : ''}> ${esc(goal.title)}</label>`).join('') || `<span class="area-empty-copy">${tr('No Goals yet.')}</span>`;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${editing ? tr('Edit habit') : tr('New habit')}</h2><button class="btn-icon" type="button" data-action="close-modal"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label">${tr('Name')}<input id="habit-name" class="input" maxlength="120" value="${esc(d.name)}" placeholder="${tr('What do you want to practice?')}" /></label><label class="field-label">${tr('Area')}<select id="habit-area" class="input"><option value="">${tr('No area')}</option>${state.areas.filter(area => area.status === 'active' || area.id === d.areaId).map(area => `<option value="${esc(area.id)}" ${area.id === d.areaId ? 'selected' : ''}>${esc(area.name)}</option>`).join('')}</select></label><label class="field-label">${tr('Routine')}<select id="habit-routine" class="input">${routineOptions(d.routine)}</select></label><div class="goal-form-grid"><label class="field-label">${tr('Tracking')}<select id="habit-tracking" class="input"><option value="checkbox" ${d.trackingType === 'checkbox' ? 'selected' : ''}>${tr('Checkbox')}</option><option value="numeric" ${d.trackingType === 'numeric' ? 'selected' : ''}>${tr('Numeric')}</option></select></label><label class="field-label">${tr('Frequency')}<select id="habit-frequency" class="input"><option value="daily" ${d.frequencyType === 'daily' ? 'selected' : ''}>${tr('Daily')}</option><option value="weekdays" ${d.frequencyType === 'weekdays' ? 'selected' : ''}>${tr('Selected weekdays')}</option><option value="timesPerWeek" ${d.frequencyType === 'timesPerWeek' ? 'selected' : ''}>${tr('X times per week')}</option><option value="everyNDays" ${d.frequencyType === 'everyNDays' ? 'selected' : ''}>${tr('Every N days')}</option></select></label></div><div class="habit-frequency-fields"><label class="field-label">${tr('Target')}<input id="habit-target-value" class="input" type="number" min="0" step="any" value="${esc(d.targetValue)}" /></label><label class="field-label">${tr('Unit')}<input id="habit-unit" class="input" value="${esc(d.unit)}" placeholder="${tr('L, pages...')}" /></label><label class="field-label">${tr('X per week')}<input id="habit-times-per-week" class="input" type="number" min="1" max="7" value="${esc(d.timesPerWeek)}" /></label><label class="field-label">${tr('Every N days')}<input id="habit-every-n-days" class="input" type="number" min="1" value="${esc(d.everyNDays)}" /></label><div class="field-label">${tr('Weekdays')}<div class="weekday-picker">${weekdays.map((label, day) => `<label><input type="checkbox" data-habit-weekday="${day}" ${d.weekdays.includes(day) ? 'checked' : ''}>${tr(label)}</label>`).join('')}</div></div></div><button class="btn btn-ghost" type="button" data-action="toggle-habit-more" aria-expanded="${Boolean(d.moreOpen)}" aria-controls="habit-more">${tr('More')}</button>${d.moreOpen ? `<div id="habit-more" class="form-stack"><label class="field-label">${tr('Start date')}<input id="habit-start-date" class="input" type="date" value="${esc(d.startDate)}" /></label><label class="field-label">${tr('Continuation')}<select id="habit-continuation" class="input"><option value="automatic" ${d.continuation === 'automatic' ? 'selected' : ''}>${tr('Repeat automatically')}</option><option value="askEachPeriod" ${d.continuation === 'askEachPeriod' ? 'selected' : ''}>${tr('Ask each period')}</option><option value="onePeriod" ${d.continuation === 'onePeriod' ? 'selected' : ''}>${tr('One period only')}</option></select></label><label class="field-label">${tr('End condition')}<select id="habit-end-type" class="input"><option value="never" ${d.endType === 'never' ? 'selected' : ''}>${tr('Never')}</option><option value="date" ${d.endType === 'date' ? 'selected' : ''}>${tr('On date')}</option><option value="successfulPeriods" ${d.endType === 'successfulPeriods' ? 'selected' : ''}>${tr('After successful periods')}</option></select></label><label class="field-label">${tr('End date')}<input id="habit-end-date" class="input" type="date" value="${esc(d.endDate)}" /></label><label class="field-label">${tr('Successful periods')}<input id="habit-successful-periods" class="input" type="number" min="1" value="${esc(d.successfulPeriodsTarget)}" /></label><label class="field-label">${tr('Quick values (comma separated)')}<input id="habit-quick-values" class="input" value="${esc(d.quickValues)}" placeholder="0.25, 0.5" /></label><label class="field-label">${tr('Reminder times (comma separated)')}<input id="habit-reminders" class="input" value="${esc(d.reminders.filter(item => item.enabled).map(item => item.time).join(','))}" placeholder="09:00, 18:00" /></label><div class="link-picker"><h3>${tr('Linked Goals')}</h3>${goalLinks}</div></div>` : ''}${ctx.modalState.error ? `<p class="validation">${esc(ctx.modalState.error)}</p>` : ''}</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Cancel')}</button><button class="btn btn-primary" type="button" data-action="save-habit">${editing ? tr('Save changes') : tr('Create habit')}</button></div></div></div>`, 'quick');
  }

  function renderHabitFinishedModal(ctx) {
    const { getHabit, modalFrame, esc } = ctx;
    const habit = getHabit(ctx.modalState.habitId);
    const boundary = ctx.modalState.boundary || 'end';
    const ask = boundary === 'ask'; const onePeriod = boundary === 'onePeriod';
    const title = ask ? tr('Continue habit?') : onePeriod ? tr('Habit period finished') : tr('Habit finished');
    const name = habit?.name || tr('This habit');
    const copy = ask ? tr('{name} completed its period. Continue, pause, or archive it.', { name }) : onePeriod ? tr('{name} was set to one period. Convert it to a repeating habit or archive it.', { name }) : tr('{name} reached its end condition. Archive it or continue tracking.', { name });
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${esc(title)}</h2><button class="btn-icon" type="button" data-action="continue-habit"><i class="ph ph-x"></i></button></div><p class="dialog-copy">${esc(copy)}</p><div class="modal-footer"><span></span><div class="modal-footer-actions">${ask ? '<button class="btn btn-ghost" type="button" data-action="pause-habit" data-habit-id="' + esc(habit?.id || '') + '">' + tr('Pause') + '</button>' : ''}<button class="btn btn-ghost" type="button" data-action="continue-habit" data-habit-id="${esc(habit?.id || '')}" data-boundary="${esc(boundary)}">${onePeriod ? tr('Convert to repeating') : tr('Continue habit')}</button><button class="btn btn-primary" type="button" data-action="archive-habit" data-habit-id="${esc(habit?.id || '')}">${tr('Archive')}</button></div></div></div>`, 'small-modal');
  }

  function openHabitMenu(ctx, anchor, habitId) {
    const { getHabit, esc, openPopover, templateMenuEntry, Core } = ctx;
    const habit = getHabit(habitId); if (!habit) return;
    // After 21:00 there is no "tonight" left (audit H-2).
    const tonight = Core.snoozeTarget('tonight', new Date()) ? `<button class="popover-option" type="button" data-pop-action="snooze-habit" data-habit-id="${esc(habitId)}" data-snooze="tonight"><i class="ph ph-moon"></i>${tr('Snooze tonight')}</button>` : '';
    const lifecycle = habit.status === 'archived'
      ? `<button class="popover-option" type="button" data-pop-action="restore-habit" data-habit-id="${esc(habitId)}"><i class="ph ph-arrow-counter-clockwise"></i>${tr('Restore habit')}</button>`
      : `<button class="popover-option" type="button" data-pop-action="${habit.status === 'paused' ? 'resume-habit' : 'pause-habit'}" data-habit-id="${esc(habitId)}"><i class="ph ph-pause"></i>${habit.status === 'paused' ? tr('Resume habit') : tr('Pause habit')}</button>`;
    const archive = habit.status !== 'archived' ? `<button class="popover-option" type="button" data-pop-action="archive-habit" data-habit-id="${esc(habitId)}"><i class="ph ph-archive"></i>${tr('Archive habit')}</button>` : '';
    const html = `<button class="popover-option" type="button" data-pop-action="edit-habit" data-habit-id="${esc(habitId)}"><i class="ph ph-pencil-simple"></i>${tr('Edit habit')}</button>${lifecycle}${archive}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="snooze-habit" data-habit-id="${esc(habitId)}" data-snooze="15m"><i class="ph ph-clock"></i>${tr('Snooze 15 min')}</button><button class="popover-option" type="button" data-pop-action="snooze-habit" data-habit-id="${esc(habitId)}" data-snooze="1h"><i class="ph ph-clock"></i>${tr('Snooze 1 hour')}</button>${tonight}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="delete-habit" data-habit-id="${esc(habitId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>${tr('Delete habit')}</button>`;
    openPopover(anchor, templateMenuEntry('habit',habitId)+html, { type: 'habit-menu', habitId });
  }

  function readHabitDraft(ctx) {
    const { $, $$, Core, uid } = ctx;
    const d = ctx.modalState.draft;
    d.routine = $('#habit-routine')?.value || d.routine || 'daily';
    d.name = $('#habit-name')?.value || d.name; d.areaId = $('#habit-area')?.value || null; d.trackingType = $('#habit-tracking')?.value || 'checkbox'; d.frequencyType = $('#habit-frequency')?.value || 'daily';
    d.targetValue = Number($('#habit-target-value')?.value ?? d.targetValue); d.unit = $('#habit-unit')?.value || ''; d.timesPerWeek = Number($('#habit-times-per-week')?.value ?? d.timesPerWeek); d.everyNDays = Number($('#habit-every-n-days')?.value ?? d.everyNDays);
    d.weekdays = $$('[data-habit-weekday]').filter(input => input.checked).map(input => Number(input.dataset.habitWeekday));
    const startDate = $('#habit-start-date'); const continuation = $('#habit-continuation'); const endType = $('#habit-end-type'); const endDate = $('#habit-end-date'); const successfulPeriods = $('#habit-successful-periods'); const quickValues = $('#habit-quick-values'); const reminders = $('#habit-reminders'); const goalControls = $$('[data-habit-goal]');
    if (startDate) d.startDate = startDate.value || d.startDate || Core.dateOnly();
    if (continuation) d.continuation = continuation.value || d.continuation;
    if (endType) d.endType = endType.value || d.endType;
    if (endDate) d.endDate = endDate.value || null;
    if (successfulPeriods) d.successfulPeriodsTarget = successfulPeriods.value === '' ? null : Number(successfulPeriods.value);
    if (quickValues) d.quickValues = String(quickValues.value ?? '').split(',').map(value => Number(value.trim())).filter(value => Number.isFinite(value) && value > 0);
    else if (typeof d.quickValues === 'string') d.quickValues = d.quickValues.split(',').map(value => Number(value.trim())).filter(value => Number.isFinite(value) && value > 0);
    if (reminders) {
      const oldByTime = new Map((d.reminders || []).map(item => [item.time, item]));
      const disabled = (d.reminders || []).filter(item => item?.enabled === false);
      const enabled = String(reminders.value || '').split(',').map(value => Core.normalizeTime(value.trim())).filter(Boolean).map(time => ({ ...(oldByTime.get(time) || {}), id: oldByTime.get(time)?.id || uid('habit-reminder'), time, enabled: oldByTime.get(time)?.enabled !== false }));
      d.reminders = [...disabled, ...enabled.filter(item => !disabled.some(disabledItem => disabledItem.id === item.id))];
    }
    if (goalControls.length) d.goalIds = goalControls.filter(input => input.checked).map(input => input.dataset.habitGoal);
    return d;
  }

  function saveHabitModal(ctx) {
    const { renderModal, nowIso, getHabit, uid, captureGoalProgress, syncHabitGoalLinks, state, saveState, closeModal, refreshHabitMetrics, render, evaluateGoalProgressChanges, navigate } = ctx;
    if (ctx.modalState?.type !== 'habit') return;
    const d = readHabitDraft(ctx);
    if (!String(d.name).trim()) { ctx.modalState.error = tr('Habit needs a name.'); renderModal(); return; }
    if (d.trackingType === 'numeric' && !(d.targetValue > 0)) { ctx.modalState.error = tr('Numeric habits need a target above zero.'); renderModal(); return; }
    if (d.frequencyType === 'weekdays' && !d.weekdays.length) { ctx.modalState.error = tr('Select at least one weekday.'); renderModal(); return; }
    if (d.frequencyType === 'timesPerWeek' && (!Number.isInteger(d.timesPerWeek) || d.timesPerWeek < 1 || d.timesPerWeek > 7)) { ctx.modalState.error = tr('Times per week must be a positive whole number up to 7.'); renderModal(); return; }
    if (d.frequencyType === 'everyNDays' && (!Number.isInteger(d.everyNDays) || d.everyNDays < 1)) { ctx.modalState.error = tr('Every N days must be a positive whole number.'); renderModal(); return; }
    if (d.endType === 'date' && !d.endDate) { ctx.modalState.error = tr('Choose an end date.'); renderModal(); return; }
    if (d.endType === 'successfulPeriods' && (!Number.isInteger(d.successfulPeriodsTarget) || d.successfulPeriodsTarget < 1)) { ctx.modalState.error = tr('Successful periods must be a positive whole number.'); renderModal(); return; }
    const fields = { ...d, name: String(d.name).trim(), quickValues: d.quickValues, reminders: d.reminders, updatedAt: nowIso() };
    const existingId = ctx.modalState.habitId;
    const habit = existingId ? getHabit(existingId) : { id: uid('habit'), goalIds: [], status: 'active', reminderFiredMoments: [], isInbox: Boolean(ctx.modalState.templateContext?.inbox), createdAt: nowIso() };
    Object.assign(habit, fields);
    const before=ctx.modalState.templateInstance?captureGoalProgress():null;
    syncHabitGoalLinks(habit, d.goalIds,ctx.modalState.templateInstance?.goalLinks);
    if (!existingId) state.habits.push(habit);
    saveState(); closeModal(); refreshHabitMetrics().then(()=>{render();if(before)evaluateGoalProgressChanges(before);});
    if (!existingId) navigate(`habit/${habit.id}`);
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
    if (action === 'habit-tab') { state.ui.habitTab = event.target.closest('[data-habit-tab]').dataset.habitTab; saveAndRender(); return true; }
    if (action === 'habit-month-shift') { const monthShift = event.target.closest('[data-month-shift]')?.dataset.monthShift || 0; state.ui.habitTrackerMonth = shiftMonth(state.ui.habitTrackerMonth || Core.dateOnly().slice(0, 7), Number(monthShift)); saveAndRender(); return true; }
    if (action === 'habit-month-today') { state.ui.habitTrackerMonth = Core.dateOnly().slice(0, 7); saveAndRender(); return true; }
    if (action === 'habit-property') { openHabitProperty(ctx, event.target.closest('[data-habit-property]')); return true; }
    const el = event?.target.closest('[data-action], [data-pop-action]');
    if (!el) return false;
    if (action === 'edit-habit-settings') openHabitSettings(ctx, el);
    else if (action === 'save-habit-settings') saveHabitSettings(ctx);
    else if (action === 'save-habit-property') saveHabitProperty(ctx);
    else if (action === 'cancel-habit-property') cancelHabitProperty(ctx);
    else if (action === 'new-habit') openHabitModal(null, { inbox: Boolean(event?.target?.closest?.('#mobile-quick-add-menu')) });
    else if (action === 'edit-habit') { closePopover(); openHabitModal(el.dataset.habitId); }
    else if (action === 'habit-menu') openHabitMenu(ctx, el, el.dataset.habitId);
    else if (action === 'save-habit') saveHabitModal(ctx);
    else if (action === 'toggle-habit-more') { readHabitDraft(ctx); ctx.modalState.draft.moreOpen = !ctx.modalState.draft.moreOpen; renderModal(); requestAnimationFrame(() => $('[data-action="toggle-habit-more"]')?.focus()); }
    else if (action === 'habit-checkin') { const habit = getHabit(el.dataset.habitId); const existing = state.habitLogCache?.[habit?.id]?.find(log => log.date === Core.dateOnly()); setHabitLog(el.dataset.habitId, Core.dateOnly(), existing?.status === 'done' ? 'missed' : 'done'); }
    else if (action === 'habit-grid-toggle') { const habit = getHabit(el.dataset.habitId); const date = el.dataset.habitDate; if (!habit || !date || date > Core.dateOnly() || habit.status !== 'active') return true; const existing = state.habitLogCache?.[habit.id]?.find(log => log.date === date); const done = existing?.status !== 'done'; const value = habit.trackingType === 'numeric' ? (done ? Number(habit.targetValue || 1) : 0) : null; setHabitLog(habit.id, date, done ? 'done' : 'missed', value, { allowHistoricalBackfill: true }); }
    else if (action === 'habit-skip') setHabitLog(el.dataset.habitId, Core.dateOnly(), 'skipped');
    else if (action === 'habit-quick-add') { const habit = getHabit(el.dataset.habitId); const existing = state.habitLogCache?.[habit?.id]?.find(log => log.date === Core.dateOnly()); setHabitLog(el.dataset.habitId, Core.dateOnly(), 'done', Number(existing?.value || 0) + Number(el.dataset.value || 0)); }
    else if (action === 'save-habit-total') setHabitLog(el.dataset.habitId, Core.dateOnly(), 'done', Number($('#habit-direct-total')?.value || 0));
    else if (action === 'save-habit-history') { const habit = getHabit(el.dataset.habitId); const date = el.dataset.habitDate; const value = habit?.trackingType === 'numeric' ? Number($(`[data-habit-history-value][data-habit-date="${CSS.escape(date)}"]`)?.value || 0) : null; const status = habit?.trackingType === 'numeric' ? 'done' : $(`[data-habit-history-status][data-habit-date="${CSS.escape(date)}"]`)?.value || 'missed'; setHabitLog(el.dataset.habitId, date, status, value); }
    else if (action === 'save-habit-history-date') { const habit = getHabit(el.dataset.habitId); const date = $('#habit-history-date')?.value; const value = habit?.trackingType === 'numeric' ? Number($('#habit-history-new-value')?.value || 0) : null; const status = habit?.trackingType === 'numeric' ? 'done' : $('#habit-history-new-status')?.value || 'missed'; setHabitLog(el.dataset.habitId, date, status, value); }
    else if (action === 'continue-habit') { const habit = getHabit(el.dataset.habitId || ctx.modalState?.habitId); if (habit) { const boundary = el.dataset.boundary || ctx.modalState?.boundary; const prior = habitMetrics(habit).periods?.filter(period => !period.isCurrent).at(-1); habit.lastContinuationPeriod = prior?.key || Core.habitPeriodKey(habit, Core.dateOnly(), Core.weekStartKey(state.settings.weekStartsOn)); if (boundary === 'onePeriod') habit.continuation = 'automatic'; if (boundary === 'end') { habit.endType = 'never'; habit.endDate = null; habit.successfulPeriodsTarget = null; } habit.updatedAt = nowIso(); saveState(); } closeModal(); refreshHabitMetrics().then(render); }
    else if (action === 'pause-habit') updateHabitStatus(el.dataset.habitId || ctx.modalState?.habitId, 'paused');
    else if (action === 'archive-habit') updateHabitStatus(el.dataset.habitId, 'archived');
    else if (action === 'resume-habit' || action === 'restore-habit') updateHabitStatus(el.dataset.habitId, 'active');
    else if (action === 'delete-habit') { closePopover(); requestDeleteEntity('habit', el.dataset.habitId); }
    else if (action === 'snooze-habit') { snoozeHabit(el.dataset.habitId, el.dataset.snooze); closePopover(); }
    else return false;
    return true;
  }

  function handleInput(event, ctx) {
    const target = event.target;
    if (event.type === 'keydown') {
      const typing = target && (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]') || target.isContentEditable);
      if (ctx.habitPropertyEditor && !ctx.modalState && !ctx.popoverEl && (event.key === 'Escape' || (event.key === 'Enter' && typing && !event.isComposing))) {
        event.preventDefault();
        if (event.key === 'Escape') cancelHabitProperty(ctx); else saveHabitProperty(ctx);
        return true;
      }
      return false;
    }
    if (!['input', 'change'].includes(event.type)) return false;
    if (ctx.habitPropertyEditor && target.id === 'habit-detail-' + ctx.habitPropertyEditor.field) {
      ctx.habitPropertyEditor.value = target.value; return true;
    }
    if (ctx.modalState?.type === 'habit' && target.id === 'habit-routine') {
      ctx.modalState.draft.routine = target.value; return true;
    }
    return false;
  }

  window.TodoDomainModules.register({
    name: 'habits',
    renderRoute(route, ctx) {
      if (route.type === 'habits') return renderHabits(ctx);
      if (route.type === 'habit') return renderHabit(ctx, route.id);
      if (route.type === 'habit-row') return renderHabitRow(ctx, route.habit, route.todayStatus);
      if (route.type !== 'modal') return false;
      const renderers = { habit: renderHabitModal, 'habit-settings': renderHabitSettingsModal, 'habit-finished': renderHabitFinishedModal };
      return renderers[route.modalType]?.(ctx);
    },
    handleAction,
    handleInput
  });
})();
