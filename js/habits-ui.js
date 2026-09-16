(function () {
  'use strict';

  // UI only: live state, persistence, metrics and overlay ownership remain in app.js.
  const ROUTINES = Object.freeze({ morning: 'Morning', daily: 'Daily', night: 'Night' });

  function routineOptions(value) {
    return Object.entries(ROUTINES).map(([key, label]) => `<option value="${key}" ${(value || 'daily') === key ? 'selected' : ''}>${label}</option>`).join('');
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
    const value = field === 'targetValue' ? Number(editor.value) : field === 'areaId' ? editor.value || null : field === 'quickValues' ? String(editor.value).split(',').map(item => Number(item.trim())).filter(item => Number.isFinite(item) && item > 0) : String(editor.value).trim();
    const hasHistory = (state.habitLogCache?.[habit.id] || []).length > 0;
    const error = field === 'name' && !value ? 'Habit needs a name.' : field === 'targetValue' && habit.trackingType === 'numeric' && (!Number.isFinite(value) || value <= 0) ? 'Numeric habits need a target above zero.' : field === 'trackingType' && value !== habit.trackingType && hasHistory ? 'Tracking cannot change while this Habit has history.' : '';
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
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (panel === 'frequency') return `<label class="field-label">Frequency<select id="habit-panel-frequency" class="input"><option value="daily" ${d.frequencyType === 'daily' ? 'selected' : ''}>Daily</option><option value="weekdays" ${d.frequencyType === 'weekdays' ? 'selected' : ''}>Selected weekdays</option><option value="timesPerWeek" ${d.frequencyType === 'timesPerWeek' ? 'selected' : ''}>X times per week</option><option value="everyNDays" ${d.frequencyType === 'everyNDays' ? 'selected' : ''}>Every N days</option></select></label><div class="habit-frequency-fields"><label class="field-label">X per week<input id="habit-panel-times" class="input" type="number" min="1" max="7" step="1" value="${esc(d.timesPerWeek)}"></label><label class="field-label">Every N days<input id="habit-panel-every" class="input" type="number" min="1" step="1" value="${esc(d.everyNDays)}"></label><div class="field-label">Weekdays<div class="weekday-picker">${weekdays.map((label, day) => `<label><input type="checkbox" data-habit-panel-weekday="${day}" ${d.weekdays.includes(day) ? 'checked' : ''}>${label}</label>`).join('')}</div></div></div>`;
    if (panel === 'reminders') return `<label class="field-label">Reminder times (comma separated)<input id="habit-panel-reminders" class="input" value="${esc((d.reminders || []).filter(item => item.enabled).map(item => item.time).join(','))}" placeholder="09:00, 18:00"></label><p class="area-empty-copy">Disabled reminder records stay intact.</p>`;
    if (panel === 'continuation') return `<label class="field-label">Continuation<select id="habit-panel-continuation" class="input"><option value="automatic" ${d.continuation === 'automatic' ? 'selected' : ''}>Repeat automatically</option><option value="askEachPeriod" ${d.continuation === 'askEachPeriod' ? 'selected' : ''}>Ask each period</option><option value="onePeriod" ${d.continuation === 'onePeriod' ? 'selected' : ''}>One period only</option></select></label>`;
    if (panel === 'end') return `<label class="field-label">End condition<select id="habit-panel-end-type" class="input"><option value="never" ${d.endType === 'never' ? 'selected' : ''}>Never</option><option value="date" ${d.endType === 'date' ? 'selected' : ''}>On date</option><option value="successfulPeriods" ${d.endType === 'successfulPeriods' ? 'selected' : ''}>After successful periods</option></select></label><label class="field-label">End date<input id="habit-panel-end-date" class="input" type="date" value="${esc(d.endDate)}"></label><label class="field-label">Successful periods<input id="habit-panel-successful-periods" class="input" type="number" min="1" step="1" value="${esc(d.successfulPeriodsTarget)}"></label>`;
    if (panel === 'goals') return `<div class="link-picker"><h3>Linked Goals</h3>${state.goals.map(goal => `<label><input type="checkbox" data-habit-panel-goal="${esc(goal.id)}" ${d.goalIds.includes(goal.id) ? 'checked' : ''}>${esc(goal.title)}</label>`).join('') || '<span class="area-empty-copy">No Goals yet.</span>'}</div>`;
    return `<label class="field-label">Date<input id="habit-panel-history-date" class="input" type="date" max="${esc(Core.dateOnly())}" value="${esc(d.historyDate)}"></label>${d.trackingType === 'numeric' ? `<label class="field-label">Total<input id="habit-panel-history-value" class="input" type="number" step="any" value="${esc(d.historyValue)}"></label>` : `<label class="field-label">Status<select id="habit-panel-history-status" class="input"><option value="done" ${d.historyStatus === 'done' ? 'selected' : ''}>Done</option><option value="skipped" ${d.historyStatus === 'skipped' ? 'selected' : ''}>Skipped</option><option value="missed" ${d.historyStatus === 'missed' ? 'selected' : ''}>Missed</option></select></label>`}`;
  }

  function renderHabitSettingsModal(ctx) {
    const { modalFrame, esc } = ctx;
    const names = { frequency: 'Frequency', reminders: 'Reminders', continuation: 'Continuation', end: 'End condition', goals: 'Linked Goals', history: 'Edit history' };
    const d = ctx.modalState.draft; const name = names[ctx.modalState.panel] || 'Habit settings';
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${name}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><div class="form-stack">${habitSettingsFields(ctx, d, ctx.modalState.panel)}${ctx.modalState.error ? `<p class="validation" role="alert">${esc(ctx.modalState.error)}</p>` : ''}</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-habit-settings">Save ${name.toLowerCase()}</button></div></div></div>`, 'small-modal');
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
      if ((d.frequencyType === 'timesPerWeek' && (!Number.isInteger(d.timesPerWeek) || d.timesPerWeek < 1 || d.timesPerWeek > 7)) || (d.frequencyType === 'everyNDays' && (!Number.isInteger(d.everyNDays) || d.everyNDays < 1)) || (d.frequencyType === 'weekdays' && !d.weekdays.length)) { editor.error = 'Use a positive whole-number schedule and select weekdays when needed.'; renderModal(); return; }
      Object.assign(habit, { frequencyType: d.frequencyType, timesPerWeek: d.timesPerWeek, everyNDays: d.everyNDays, weekdays: d.weekdays });
    } else if (panel === 'reminders') {
      const oldByTime = new Map((habit.reminders || []).map(item => [item.time, item])); const disabled = (habit.reminders || []).filter(item => item.enabled === false);
      const enabled = String($('#habit-panel-reminders')?.value || '').split(',').map(value => Core.normalizeTime(value.trim())).filter(Boolean).map(time => ({ ...(oldByTime.get(time) || {}), id: oldByTime.get(time)?.id || uid('habit-reminder'), time, enabled: oldByTime.get(time)?.enabled !== false }));
      habit.reminders = [...disabled, ...enabled.filter(item => !disabled.some(disabledItem => disabledItem.id === item.id))];
    } else if (panel === 'continuation') habit.continuation = $('#habit-panel-continuation')?.value || habit.continuation;
    else if (panel === 'end') {
      const endType = $('#habit-panel-end-type')?.value || 'never'; const endDate = $('#habit-panel-end-date')?.value || null; const periods = $('#habit-panel-successful-periods')?.value;
      if (endType === 'date' && !endDate) { editor.error = 'Choose an end date.'; renderModal(); return; }
      if (endType === 'successfulPeriods' && (!Number.isInteger(Number(periods)) || Number(periods) < 1)) { editor.error = 'Successful periods must be a positive whole number.'; renderModal(); return; }
      Object.assign(habit, { endType, endDate: endType === 'date' ? endDate : null, successfulPeriodsTarget: endType === 'successfulPeriods' ? Number(periods) : null });
    } else if (panel === 'goals') {
      syncHabitGoalLinks(habit, $$('[data-habit-panel-goal]').filter(input => input.checked).map(input => input.dataset.habitPanelGoal));
    } else {
      const date = $('#habit-panel-history-date')?.value; const value = habit.trackingType === 'numeric' ? Number($('#habit-panel-history-value')?.value || 0) : null; const status = habit.trackingType === 'numeric' ? 'done' : $('#habit-panel-history-status')?.value || 'missed';
      if (!date || date > Core.dateOnly()) { editor.error = 'Choose an eligible past date.'; renderModal(); return; }
      const target = editor.returnFocus; const saved = await setHabitLog(habit.id, date, status, value);
      if (saved === null) return;
      if (!saved) { editor.error = 'That date is not scheduled for this Habit.'; renderModal(); return; }
      if (ctx.modalState === editor) { closeModal(); restoreGoalFocus(target); } return;
    }
    habit.updatedAt = nowIso(); saveState(); const target = editor.returnFocus; closeModal(); await refreshHabitMetrics(); render(); restoreGoalFocus(target);
  }

  function habitFrequencyLabel(ctx, habit) {
    if (habit.frequencyType === 'weekdays') return `Weekdays ${(habit.weekdays || []).map(day => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]).join(', ')}`;
    if (habit.frequencyType === 'timesPerWeek') return `${habit.timesPerWeek || 1} times/week`;
    if (habit.frequencyType === 'everyNDays') return `Every ${habit.everyNDays || 1} days`;
    return 'Daily';
  }

  function habitProgressLabel(ctx, habit, metrics = ctx.habitMetrics(habit)) {
    // A numeric target describes one check-in; X/week is a separate weekly
    // target and must remain visible when both are configured.
    if (habit.frequencyType === 'timesPerWeek') return `${metrics.currentPeriodCount || 0} / ${metrics.currentPeriodTarget || habit.timesPerWeek || 1} this week`;
    if (habit.trackingType === 'numeric') return `${metrics.currentPeriodCount || 0} / ${habit.targetValue || 0}${habit.unit ? ` ${habit.unit}` : ''}`;
    return metrics.currentPeriodCount ? 'Done' : 'Not checked in';
  }

  function renderHabitRow(ctx, habit, todayStatus = null) {
    const { habitMetrics, esc } = ctx;
    const metrics = habitMetrics(habit);
    const actions = !todayStatus ? '' : habit.trackingType === 'numeric'
      ? `${(habit.quickValues || []).map(value => `<button class="btn btn-secondary" type="button" data-action="habit-quick-add" data-habit-id="${esc(habit.id)}" data-value="${esc(value)}">+${esc(value)}</button>`).join('')}<button class="btn btn-ghost" type="button" data-route="habit/${esc(habit.id)}">Edit total</button>`
      : `<button class="btn btn-secondary" type="button" data-action="habit-checkin" data-habit-id="${esc(habit.id)}">${todayStatus.status === 'done' ? 'Mark not done' : 'Check in'}</button><button class="btn btn-ghost" type="button" data-action="habit-skip" data-habit-id="${esc(habit.id)}">Skip today</button>`;
    const menu = `<button class="btn-icon" type="button" data-action="habit-menu" data-habit-id="${esc(habit.id)}" aria-label="Habit actions"><i class="ph ph-dots-three"></i></button>`;
    const status = todayStatus?.status || habit.status;
    return `<article class="habit-row habit-row--${esc(status)}"${todayStatus ? ' style="grid-template-columns:minmax(0,1fr) auto"' : ''}><button class="habit-open" type="button" data-route="habit/${esc(habit.id)}"><span><strong>${esc(habit.name)}</strong><small class="habit-row-meta"><span>${esc(ROUTINES[habit.routine || 'daily'])}</span><span>${esc(habitFrequencyLabel(ctx, habit))}</span><span class="habit-status habit-status--${esc(status)}">${esc(status)}</span></small></span><span class="habit-progress">${esc(habitProgressLabel(ctx, habit, metrics))}</span></button>${todayStatus ? `<div class="habit-checkin-controls">${actions}${menu}</div>` : menu}</article>`;
  }

  function renderHabitSection(ctx, label, habits) {
    return `<section class="section"><div class="section-header"><h2 class="section-label">${ctx.esc(label)}</h2><span class="section-count">${habits.length}</span></div>${habits.length ? `<div class="habit-list">${habits.map(habit => renderHabitRow(ctx, habit)).join('')}</div>` : '<p class="area-empty-copy">No active habits in this routine.</p>'}</section>`;
  }

  function renderHabits(ctx) {
    const { state, pageHeader, emptyState } = ctx;
    const tab = state.ui.habitTab || 'active';
    const habits = (state.habits || []).filter(habit => tab === 'all' || (tab === 'archived' ? habit.status === 'archived' : habit.status !== 'archived'));
    let html = pageHeader('Habits', `${habits.filter(habit => habit.status === 'active').length} active habits`, { add: false, actionHtml: '<button class="btn btn-primary" type="button" data-action="new-habit"><i class="ph ph-plus"></i> New habit</button>' });
    html += `<div class="area-tabs"><button type="button" data-habit-tab="active" class="${tab === 'active' ? 'is-active' : ''}">Active</button><button type="button" data-habit-tab="all" class="${tab === 'all' ? 'is-active' : ''}">All</button><button type="button" data-habit-tab="archived" class="${tab === 'archived' ? 'is-active' : ''}">Archived</button></div>`;
    if (!habits.length) return html + emptyState('No habits yet.', 'Track a repeatable behavior without turning it into a task.', 'New habit', 'new-habit');
    if (tab !== 'active') return html + `<div class="habit-list">${habits.map(habit => renderHabitRow(ctx, habit)).join('')}</div>`;
    for (const [routine, label] of Object.entries(ROUTINES)) {
      html += renderHabitSection(ctx, label, habits.filter(habit => habit.status === 'active' && (habit.routine || 'daily') === routine));
    }
    const paused = habits.filter(habit => habit.status === 'paused');
    return html + (paused.length ? renderHabitSection(ctx, 'Paused', paused) : '');
  }

  function heatmapHtml(ctx, habit, logs) {
    const { Core, esc } = ctx;
    const today = Core.dateOnly();
    const current = new Date(`${today}T12:00:00`);
    const year = current.getFullYear(); const month = current.getMonth();
    const count = new Date(year, month + 1, 0).getDate();
    const dates = Array.from({ length: count }, (_, index) => `${year}-${String(month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`);
    return `<p class="area-empty-copy">${esc(current.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</p><div class="habit-heatmap" aria-label="Monthly heatmap">${dates.map(date => { const status = Core.habitStatusForDate(habit, logs, date, today); return `<span class="heatmap-day is-${esc(status.status)}" style="--heat-intensity:${Math.max(0, Math.min(1, Number(status.percent || 0) / 100))}" title="${esc(date)}"></span>`; }).join('')}</div>`;
  }

  function renderHabit(ctx, habitId) {
    const { getHabit, habitMetrics, state, Core, pageHeader, esc } = ctx;
    const habit = getHabit(habitId); if (!habit) return renderHabits(ctx);
    const metrics = habitMetrics(habit); const logs = state.habitLogCache?.[habit.id] || [];
    const today = Core.dateOnly(); const todayStatus = Core.habitStatusForDate(habit, logs, today, today);
    const todayLog = logs.find(log => log.date === today);
    const history = [...logs].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    let html = pageHeader(habit.name, `${habitFrequencyLabel(ctx, habit)} · ${habit.status}`, { add: false, actionHtml: `<button class="btn btn-secondary" type="button" data-action="edit-habit" data-habit-id="${esc(habit.id)}"><i class="ph ph-pencil-simple"></i> Edit</button><button class="btn-icon" type="button" data-action="habit-menu" data-habit-id="${esc(habit.id)}" aria-label="Habit actions"><i class="ph ph-dots-three"></i></button>` });
    html += `<div class="form-stack goal-properties habit-properties">${[['name','Name'],['areaId','Area'],['routine','Routine'],['trackingType','Tracking'],['targetValue','Target value'],['unit','Unit'],['quickValues','Quick values']].map(([field,label]) => renderHabitProperty(ctx, habit, field, label)).join('')}<div class="goal-detail-actions"><button class="btn btn-secondary" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="frequency">Frequency</button><button class="btn btn-secondary" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="reminders">Reminders</button><button class="btn btn-secondary" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="continuation">Continuation</button><button class="btn btn-secondary" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="end">End condition</button><button class="btn btn-secondary" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="goals">Linked Goals</button></div></div>`;
    html += `<section class="habit-detail-card"><div class="habit-detail-context"><span class="habit-status habit-status--${esc(habit.status)}">${esc(habit.status)}</span><span>${esc(habitFrequencyLabel(ctx, habit))}</span><span>Today: ${esc(todayStatus.status)}</span></div><div class="habit-summary"><strong>${esc(habitProgressLabel(ctx, habit, metrics))}</strong><span>Current period</span></div><div class="habit-metric-grid"><div><strong>${metrics.currentStreak}</strong><span>Current streak</span></div><div><strong>${metrics.longestStreak}</strong><span>Longest streak</span></div><div><strong>${metrics.totalCheckins}</strong><span>Total check-ins</span></div><div><strong>${Math.round(metrics.completionRate)}%</strong><span>Completion rate</span></div></div>${habit.status === 'active' ? (habit.trackingType === 'numeric' ? `<div class="habit-checkin-controls">${(habit.quickValues || []).map(value => `<button class="btn btn-secondary" type="button" data-action="habit-quick-add" data-habit-id="${esc(habit.id)}" data-value="${esc(value)}">+${esc(value)}</button>`).join('')}<label class="field-label">Daily total<input id="habit-direct-total" class="input" type="number" step="any" value="${esc(todayLog?.value || 0)}" /></label><button class="btn btn-primary" type="button" data-action="save-habit-total" data-habit-id="${esc(habit.id)}">Save total</button></div>` : `<div class="habit-checkin-controls"><button class="btn btn-primary" type="button" data-action="habit-checkin" data-habit-id="${esc(habit.id)}">${todayStatus.status === 'done' ? 'Mark not done' : 'Check in'}</button><button class="btn btn-ghost" type="button" data-action="habit-skip" data-habit-id="${esc(habit.id)}">Skip today</button></div>`) : '<p class="area-empty-copy">Paused and archived habits preserve history but cannot be checked in.</p>'}</section>`;
    html += `<section class="section"><div class="section-header"><h2 class="section-label">Monthly heatmap</h2></div>${heatmapHtml(ctx, habit, logs)}</section>`;
    const historyEditor = `<div class="habit-history-row"><input id="habit-history-date" class="input" type="date" max="${esc(today)}" value="${esc(today)}">${habit.trackingType === 'numeric' ? `<input id="habit-history-new-value" class="input" type="number" step="any" value="0">` : `<select id="habit-history-new-status" class="input"><option value="done">Done</option><option value="skipped">Skipped</option><option value="missed">Missed</option></select>`}<button class="btn btn-ghost" type="button" data-action="save-habit-history-date" data-habit-id="${esc(habit.id)}">Save date</button></div>`;
    html += `<section class="section"><div class="section-header"><h2 class="section-label">History</h2><button class="btn btn-ghost" type="button" data-action="edit-habit-settings" data-habit-id="${esc(habit.id)}" data-habit-panel="history">Edit history</button></div>${historyEditor}${history.length ? `<div class="habit-history">${history.map(log => `<div class="habit-history-row"><span>${esc(log.date)}</span>${habit.trackingType === 'numeric' ? `<input class="input" type="number" step="any" value="${esc(log.value ?? 0)}" data-habit-history-value data-habit-date="${esc(log.date)}">` : `<select class="input" data-habit-history-status data-habit-date="${esc(log.date)}"><option value="done" ${log.status === 'done' ? 'selected' : ''}>Done</option><option value="skipped" ${log.status === 'skipped' ? 'selected' : ''}>Skipped</option><option value="missed" ${log.status === 'missed' ? 'selected' : ''}>Missed</option></select>`}<button class="btn btn-ghost" type="button" data-action="save-habit-history" data-habit-id="${esc(habit.id)}" data-habit-date="${esc(log.date)}">Save</button></div>`).join('')}</div>` : '<p class="area-empty-copy">No history yet. Choose any eligible past date to add a correction.</p>'}</section>`;
    return html;
  }

  function renderHabitProperty(ctx, habit, field, label) {
    const { getArea, state, esc } = ctx;
    const editor = ctx.habitPropertyEditor?.habit === habit && ctx.habitPropertyEditor.field === field ? ctx.habitPropertyEditor : null;
    const value = field === 'routine' ? ROUTINES[habit.routine || 'daily'] : field === 'areaId' ? getArea(habit.areaId)?.name || 'No area' : field === 'quickValues' ? (habit.quickValues || []).join(', ') : habit[field] ?? '';
    if (!editor) return `<div class="goal-property"><span class="field-label">${label}</span><button class="btn btn-ghost" type="button" data-habit-property="${field}" data-habit-id="${esc(habit.id)}">${esc(value || (field === 'unit' || field === 'quickValues' ? 'Not set' : 'No area'))}</button></div>`;
    const id = 'habit-detail-' + field;
    const input = field === 'routine' ? `<select id="${id}" class="input">${routineOptions(editor.value)}</select>` : field === 'areaId' ? `<select id="${id}" class="input"><option value="">No area</option>${state.areas.filter(a => a.status === 'active' || a.id === habit.areaId).map(a => `<option value="${esc(a.id)}" ${a.id === editor.value ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : field === 'trackingType' ? `<select id="${id}" class="input"><option value="checkbox" ${editor.value === 'checkbox' ? 'selected' : ''}>Checkbox</option><option value="numeric" ${editor.value === 'numeric' ? 'selected' : ''}>Numeric</option></select>` : `<input id="${id}" class="input" type="${field === 'targetValue' ? 'number' : 'text'}" ${field === 'targetValue' ? 'step="any"' : field === 'name' ? 'maxlength="120"' : ''} value="${esc(editor.value)}" ${editor.error ? 'aria-invalid="true" aria-describedby="habit-property-error"' : ''}>`;
    return `<div class="goal-property-editor"><label class="field-label" for="${id}">${label}</label>${input}${editor.error ? `<p id="habit-property-error" class="validation" role="alert">${esc(editor.error)}</p>` : ''}<div class="goal-detail-actions"><button class="btn btn-secondary" type="button" data-action="save-habit-property">Save ${label.toLowerCase()}</button><button class="btn btn-ghost" type="button" data-action="cancel-habit-property">Cancel</button></div></div>`;
  }

  function renderHabitModal(ctx) {
    const { state, esc, modalFrame } = ctx;
    const d = ctx.modalState.draft; const editing = Boolean(ctx.modalState.habitId);
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const goalLinks = state.goals.map(goal => `<label><input type="checkbox" data-habit-goal="${esc(goal.id)}" ${d.goalIds.includes(goal.id) ? 'checked' : ''}> ${esc(goal.title)}</label>`).join('') || '<span class="area-empty-copy">No Goals yet.</span>';
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${editing ? 'Edit habit' : 'New habit'}</h2><button class="btn-icon" type="button" data-action="close-modal"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label">Name<input id="habit-name" class="input" maxlength="120" value="${esc(d.name)}" placeholder="What do you want to practice?" /></label><label class="field-label">Area<select id="habit-area" class="input"><option value="">No area</option>${state.areas.filter(area => area.status === 'active' || area.id === d.areaId).map(area => `<option value="${esc(area.id)}" ${area.id === d.areaId ? 'selected' : ''}>${esc(area.name)}</option>`).join('')}</select></label><label class="field-label">Routine<select id="habit-routine" class="input">${routineOptions(d.routine)}</select></label><div class="goal-form-grid"><label class="field-label">Tracking<select id="habit-tracking" class="input"><option value="checkbox" ${d.trackingType === 'checkbox' ? 'selected' : ''}>Checkbox</option><option value="numeric" ${d.trackingType === 'numeric' ? 'selected' : ''}>Numeric</option></select></label><label class="field-label">Frequency<select id="habit-frequency" class="input"><option value="daily" ${d.frequencyType === 'daily' ? 'selected' : ''}>Daily</option><option value="weekdays" ${d.frequencyType === 'weekdays' ? 'selected' : ''}>Selected weekdays</option><option value="timesPerWeek" ${d.frequencyType === 'timesPerWeek' ? 'selected' : ''}>X times per week</option><option value="everyNDays" ${d.frequencyType === 'everyNDays' ? 'selected' : ''}>Every N days</option></select></label></div><div class="habit-frequency-fields"><label class="field-label">Target<input id="habit-target-value" class="input" type="number" min="0" step="any" value="${esc(d.targetValue)}" /></label><label class="field-label">Unit<input id="habit-unit" class="input" value="${esc(d.unit)}" placeholder="L, pages..." /></label><label class="field-label">X per week<input id="habit-times-per-week" class="input" type="number" min="1" max="7" value="${esc(d.timesPerWeek)}" /></label><label class="field-label">Every N days<input id="habit-every-n-days" class="input" type="number" min="1" value="${esc(d.everyNDays)}" /></label><div class="field-label">Weekdays<div class="weekday-picker">${weekdays.map((label, day) => `<label><input type="checkbox" data-habit-weekday="${day}" ${d.weekdays.includes(day) ? 'checked' : ''}>${label}</label>`).join('')}</div></div></div><button class="btn btn-ghost" type="button" data-action="toggle-habit-more" aria-expanded="${Boolean(d.moreOpen)}" aria-controls="habit-more">More</button>${d.moreOpen ? `<div id="habit-more" class="form-stack"><label class="field-label">Start date<input id="habit-start-date" class="input" type="date" value="${esc(d.startDate)}" /></label><label class="field-label">Continuation<select id="habit-continuation" class="input"><option value="automatic" ${d.continuation === 'automatic' ? 'selected' : ''}>Repeat automatically</option><option value="askEachPeriod" ${d.continuation === 'askEachPeriod' ? 'selected' : ''}>Ask each period</option><option value="onePeriod" ${d.continuation === 'onePeriod' ? 'selected' : ''}>One period only</option></select></label><label class="field-label">End condition<select id="habit-end-type" class="input"><option value="never" ${d.endType === 'never' ? 'selected' : ''}>Never</option><option value="date" ${d.endType === 'date' ? 'selected' : ''}>On date</option><option value="successfulPeriods" ${d.endType === 'successfulPeriods' ? 'selected' : ''}>After successful periods</option></select></label><label class="field-label">End date<input id="habit-end-date" class="input" type="date" value="${esc(d.endDate)}" /></label><label class="field-label">Successful periods<input id="habit-successful-periods" class="input" type="number" min="1" value="${esc(d.successfulPeriodsTarget)}" /></label><label class="field-label">Quick values (comma separated)<input id="habit-quick-values" class="input" value="${esc(d.quickValues)}" placeholder="0.25, 0.5" /></label><label class="field-label">Reminder times (comma separated)<input id="habit-reminders" class="input" value="${esc(d.reminders.filter(item => item.enabled).map(item => item.time).join(','))}" placeholder="09:00, 18:00" /></label><div class="link-picker"><h3>Linked Goals</h3>${goalLinks}</div></div>` : ''}${ctx.modalState.error ? `<p class="validation">${esc(ctx.modalState.error)}</p>` : ''}</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-habit">${editing ? 'Save changes' : 'Create habit'}</button></div></div></div>`, 'quick');
  }

  function renderHabitFinishedModal(ctx) {
    const { getHabit, modalFrame, esc } = ctx;
    const habit = getHabit(ctx.modalState.habitId);
    const boundary = ctx.modalState.boundary || 'end';
    const ask = boundary === 'ask'; const onePeriod = boundary === 'onePeriod';
    const title = ask ? 'Continue habit?' : onePeriod ? 'Habit period finished' : 'Habit finished';
    const copy = ask ? `${habit?.name || 'This habit'} completed its period. Continue, pause, or archive it.` : onePeriod ? `${habit?.name || 'This habit'} was set to one period. Convert it to a repeating habit or archive it.` : `${habit?.name || 'This habit'} reached its end condition. Archive it or continue tracking.`;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${esc(title)}</h2><button class="btn-icon" type="button" data-action="continue-habit"><i class="ph ph-x"></i></button></div><p class="dialog-copy">${esc(copy)}</p><div class="modal-footer"><span></span><div class="modal-footer-actions">${ask ? '<button class="btn btn-ghost" type="button" data-action="pause-habit" data-habit-id="' + esc(habit?.id || '') + '">Pause</button>' : ''}<button class="btn btn-ghost" type="button" data-action="continue-habit" data-habit-id="${esc(habit?.id || '')}" data-boundary="${esc(boundary)}">${onePeriod ? 'Convert to repeating' : 'Continue habit'}</button><button class="btn btn-primary" type="button" data-action="archive-habit" data-habit-id="${esc(habit?.id || '')}">Archive</button></div></div></div>`, 'small-modal');
  }

  function openHabitMenu(ctx, anchor, habitId) {
    const { getHabit, esc, openPopover, templateMenuEntry } = ctx;
    const habit = getHabit(habitId); if (!habit) return;
    const lifecycle = habit.status === 'archived'
      ? `<button class="popover-option" type="button" data-pop-action="restore-habit" data-habit-id="${esc(habitId)}"><i class="ph ph-arrow-counter-clockwise"></i>Restore habit</button>`
      : `<button class="popover-option" type="button" data-pop-action="${habit.status === 'paused' ? 'resume-habit' : 'pause-habit'}" data-habit-id="${esc(habitId)}"><i class="ph ph-pause"></i>${habit.status === 'paused' ? 'Resume habit' : 'Pause habit'}</button>`;
    const archive = habit.status !== 'archived' ? `<button class="popover-option" type="button" data-pop-action="archive-habit" data-habit-id="${esc(habitId)}"><i class="ph ph-archive"></i>Archive habit</button>` : '';
    const html = `<button class="popover-option" type="button" data-pop-action="edit-habit" data-habit-id="${esc(habitId)}"><i class="ph ph-pencil-simple"></i>Edit habit</button>${lifecycle}${archive}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="snooze-habit" data-habit-id="${esc(habitId)}" data-snooze="15m"><i class="ph ph-clock"></i>Snooze 15 min</button><button class="popover-option" type="button" data-pop-action="snooze-habit" data-habit-id="${esc(habitId)}" data-snooze="1h"><i class="ph ph-clock"></i>Snooze 1 hour</button><button class="popover-option" type="button" data-pop-action="snooze-habit" data-habit-id="${esc(habitId)}" data-snooze="tonight"><i class="ph ph-moon"></i>Snooze tonight</button><div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="delete-habit" data-habit-id="${esc(habitId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>Delete habit</button>`;
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
    if (!String(d.name).trim()) { ctx.modalState.error = 'Habit needs a name.'; renderModal(); return; }
    if (d.trackingType === 'numeric' && !(d.targetValue > 0)) { ctx.modalState.error = 'Numeric habits need a target above zero.'; renderModal(); return; }
    if (d.frequencyType === 'weekdays' && !d.weekdays.length) { ctx.modalState.error = 'Select at least one weekday.'; renderModal(); return; }
    if (d.frequencyType === 'timesPerWeek' && (!Number.isInteger(d.timesPerWeek) || d.timesPerWeek < 1 || d.timesPerWeek > 7)) { ctx.modalState.error = 'Times per week must be a positive whole number up to 7.'; renderModal(); return; }
    if (d.frequencyType === 'everyNDays' && (!Number.isInteger(d.everyNDays) || d.everyNDays < 1)) { ctx.modalState.error = 'Every N days must be a positive whole number.'; renderModal(); return; }
    if (d.endType === 'date' && !d.endDate) { ctx.modalState.error = 'Choose an end date.'; renderModal(); return; }
    if (d.endType === 'successfulPeriods' && (!Number.isInteger(d.successfulPeriodsTarget) || d.successfulPeriodsTarget < 1)) { ctx.modalState.error = 'Successful periods must be a positive whole number.'; renderModal(); return; }
    const fields = { ...d, name: String(d.name).trim(), quickValues: d.quickValues, reminders: d.reminders, updatedAt: nowIso() };
    const existingId = ctx.modalState.habitId;
    const habit = existingId ? getHabit(existingId) : { id: uid('habit'), goalIds: [], status: 'active', reminderFiredMoments: [], createdAt: nowIso() };
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
    const areas = [
      ['family-friends', 'Family & Friends'], ['work', 'Work'], ['personal-growth', 'Personal Growth'],
      ['home', 'Home'], ['travel', 'Travel'], ['health', 'Health'], ['career', 'Career'], ['finance', 'Finance']
    ];
    const habits = [
      ['morning', 'cold-shower', 'Cold shower'], ['morning', 'wim-hof-breathing', 'Wim Hof breathing'],
      ['morning', '10-minute-workout', '10-minute workout'], ['morning', 'beard-balm', 'Beard balm'],
      ['daily', 'no-nut', 'No-nut'], ['daily', 'training', 'Training four times per week'],
      ['daily', 'sleep-before-midnight', 'Sleep before midnight'], ['daily', 'sleep-7-8-hours', 'Sleep 7–8 hours'],
      ['daily', 'program-30-minutes', 'Program 30 minutes'], ['daily', 'read-learn-30-minutes', 'Read/learn 30 minutes'],
      ['night', 'beard-balm', 'Beard balm'], ['night', 'tomorrow-tasks', "Enter tomorrow's tasks"]
    ];
    const addedAreas = [], addedHabits = [], addedProjects = [], addedTasks = [], addedGoals = [], addedNotes = [], addedResources = [];
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
    const workArea = byName(allAreas, 'Work');
    const healthArea = byName(allAreas, 'Health');
    const projects = [
      ['weekly-plan', 'Plan your week', workArea?.id || null],
      ['health-baseline', 'Health baseline', healthArea?.id || null],
    ];
    for (const [key, name, areaId] of projects) {
      const sampleKey = `${samplePrefix}:project:${key}`;
      if (hasSampleOrName(state.projects, sampleKey, name)) continue;
      addedProjects.push({ id: uid('project'), sampleKey, name, color: PROJECT_COLORS[addedProjects.length % PROJECT_COLORS.length], areaId, goalIds: [], order: state.projects.length + addedProjects.length, isArchived: false, archivedAt: null, createdAt: timestamp, updatedAt: timestamp });
    }
    const allProjects = [...state.projects, ...addedProjects];
    const weeklyPlan = byName(allProjects, 'Plan your week');
    const tasks = [
      ['today-priority', 'Choose today’s priority', { projectId: weeklyPlan?.id || null, plannedDate: today, todayOrder: 0 }],
      ['overdue-follow-up', 'Follow up on an overdue commitment', { projectId: weeklyPlan?.id || null, dueDate: Core.addDays(today, -1) }],
      ['due-soon-review', 'Review this week’s plan', { projectId: weeklyPlan?.id || null, dueDate: Core.addDays(today, 2) }],
    ];
    for (const [key, title, extra] of tasks) {
      const sampleKey = `${samplePrefix}:task:${key}`;
      if (hasSampleOrName(state.tasks, sampleKey, title, 'title')) continue;
      const projectId = extra.projectId && allProjects.some(project => project.id === extra.projectId) ? extra.projectId : null;
      addedTasks.push({ id: uid('task'), sampleKey, title, notes: '', projectId, areaId: projectId ? null : workArea?.id || null, goalIds: [], plannedDate: extra.plannedDate || null, plannedTime: null, dueDate: extra.dueDate || null, dueTime: null, reminderAt: null, reminderFiredAt: null, recurrence: null, tagIds: [], priority: 'none', attachmentIds: [], isInbox: !(projectId || extra.plannedDate), isCompleted: false, completedAt: null, subtasks: [], todayOrder: extra.todayOrder ?? null, projectOrder: projectId ? addedTasks.filter(task => task.projectId === projectId).length : null, inboxOrder: null, createdAt: timestamp, updatedAt: timestamp });
    }
    const allHabits = [...state.habits, ...addedHabits];
    const linkedProject = addedProjects[0];
    const linkedTask = addedTasks.find(task => task.sampleKey === `${samplePrefix}:task:today-priority`);
    const linkedHabit = addedHabits.find(habit => habit.sampleKey === 'area-routines-v1:habit:daily:program-30-minutes');
    const goalName = 'Build a sustainable weekly rhythm', goalKey = `${samplePrefix}:goal:weekly-rhythm`;
    if (!hasSampleOrName(state.goals, goalKey, goalName, 'title')) {
      const goal = { id: uid('goal'), sampleKey: goalKey, title: goalName, areaId: workArea?.id || null, horizon: 'short', status: 'active', progressMode: 'linkedTasks', progressType: 'percentage', currentValue: 0, targetValue: 100, unit: '', targetDate: Core.addDays(today, 14), projectLinks: linkedProject ? [{ projectId: linkedProject.id, contributionMode: 'allTasks', selectedTaskIds: [] }] : [], taskIds: linkedTask ? [linkedTask.id] : [], habitLinks: linkedHabit ? [{ habitId: linkedHabit.id, metric: 'totalCheckins', target: 7 }] : [], milestones: [], reminders: { sevenDaysBefore: false, threeDaysBefore: false, oneDayBefore: false, onTargetDate: false, time: '09:00' }, reminderFiredMoments: [], createdAt: timestamp, updatedAt: timestamp, completedAt: null };
      addedGoals.push(goal);
      if (linkedProject) linkedProject.goalIds.push(goal.id);
      if (linkedTask) linkedTask.goalIds.push(goal.id);
      if (linkedHabit) linkedHabit.goalIds.push(goal.id);
    }
    const allGoals = [...state.goals, ...addedGoals];
    const noteName = 'Weekly planning notes', noteKey = `${samplePrefix}:note:weekly-planning`;
    if (!hasSampleOrName(state.notes, noteKey, noteName, 'title')) addedNotes.push({ id: uid('note'), sampleKey: noteKey, title: noteName, body: 'Use this note to capture decisions, loose ends, and a short review for next week.', areaId: workArea?.id || null, linkUrls: [], attachmentIds: [], createdAt: timestamp, updatedAt: timestamp });
    const resourceName = 'Starter workspace guide', resourceKey = `${samplePrefix}:resource:workspace-guide`;
    const weeklyRhythmGoal = byName(allGoals, goalName, 'title');
    const programHabit = byName(allHabits, 'Program 30 minutes');
    if (!hasSampleOrName(state.resources, resourceKey, resourceName, 'title')) addedResources.push({ id: uid('resource'), sampleKey: resourceKey, title: resourceName, description: 'A lightweight reference connected to the starter workspace. Edit or delete it whenever you are ready.', areaId: workArea?.id || null, linkUrls: ['https://todoist.com/productivity-methods/weekly-planning'], attachmentIds: [], relatedTaskIds: linkedTask ? [linkedTask.id] : [], relatedProjectIds: weeklyPlan ? [weeklyPlan.id] : [], relatedGoalIds: weeklyRhythmGoal ? [weeklyRhythmGoal.id] : [], relatedHabitIds: programHabit ? [programHabit.id] : [], createdAt: timestamp, updatedAt: timestamp });
    const additions = [[state.areas, addedAreas], [state.habits, addedHabits], [state.projects, addedProjects], [state.tasks, addedTasks], [state.goals, addedGoals], [state.notes, addedNotes], [state.resources, addedResources]];
    if (!additions.some(([, records]) => records.length)) { setToastMessage('Starter examples already present.'); return; }
    for (const [collection, records] of additions) collection.push(...records);
    if (!saveState()) {
      // Only this invocation's new object references are removed; existing edits stay intact.
      for (const [collection, records] of additions) {
        for (const record of records) { const index = collection.indexOf(record); if (index !== -1) collection.splice(index, 1); }
      }
      render(); setToastMessage('Could not save starter examples locally. Free up browser storage and try again.'); return;
    }
    try {
      await refreshHabitMetrics();
      if (ctx.state !== state) return;
      render(); setToastMessage(`Added ${addedAreas.length} Areas, ${addedProjects.length} Projects, ${addedTasks.length} Tasks, ${addedGoals.length} Goals, ${addedHabits.length} Habits, ${addedNotes.length} Notes and ${addedResources.length} Resources. All examples are editable.`);
    } catch (error) {
      console.error(error);
      if (ctx.state !== state) return;
      render(); setToastMessage('Examples saved, but Habit metrics could not refresh. Reload to retry.');
    }
  }

  function handleAction(action, event, ctx) {
    const { $, state, Core, getHabit, habitMetrics, openHabitModal, renderModal, setHabitLog, nowIso, saveState, closeModal, refreshHabitMetrics, render, updateHabitStatus, closePopover, snoozeHabit, requestDeleteEntity, saveAndRender } = ctx;
    if (action === 'read-habit-draft') { readHabitDraft(ctx); return true; }
    if (action === 'add-starter-examples') { addStarterExamples(ctx); return true; }
    if (action === 'habit-tab') { state.ui.habitTab = event.target.closest('[data-habit-tab]').dataset.habitTab; saveAndRender(); return true; }
    if (action === 'habit-property') { openHabitProperty(ctx, event.target.closest('[data-habit-property]')); return true; }
    const el = event?.target.closest('[data-action], [data-pop-action]');
    if (!el) return false;
    if (action === 'edit-habit-settings') openHabitSettings(ctx, el);
    else if (action === 'save-habit-settings') saveHabitSettings(ctx);
    else if (action === 'save-habit-property') saveHabitProperty(ctx);
    else if (action === 'cancel-habit-property') cancelHabitProperty(ctx);
    else if (action === 'new-habit') openHabitModal();
    else if (action === 'edit-habit') { closePopover(); openHabitModal(el.dataset.habitId); }
    else if (action === 'habit-menu') openHabitMenu(ctx, el, el.dataset.habitId);
    else if (action === 'save-habit') saveHabitModal(ctx);
    else if (action === 'toggle-habit-more') { readHabitDraft(ctx); ctx.modalState.draft.moreOpen = !ctx.modalState.draft.moreOpen; renderModal(); requestAnimationFrame(() => $('[data-action="toggle-habit-more"]')?.focus()); }
    else if (action === 'habit-checkin') { const habit = getHabit(el.dataset.habitId); const existing = state.habitLogCache?.[habit?.id]?.find(log => log.date === Core.dateOnly()); setHabitLog(el.dataset.habitId, Core.dateOnly(), existing?.status === 'done' ? 'missed' : 'done'); }
    else if (action === 'habit-skip') setHabitLog(el.dataset.habitId, Core.dateOnly(), 'skipped');
    else if (action === 'habit-quick-add') { const habit = getHabit(el.dataset.habitId); const existing = state.habitLogCache?.[habit?.id]?.find(log => log.date === Core.dateOnly()); setHabitLog(el.dataset.habitId, Core.dateOnly(), 'done', Number(existing?.value || 0) + Number(el.dataset.value || 0)); }
    else if (action === 'save-habit-total') setHabitLog(el.dataset.habitId, Core.dateOnly(), 'done', Number($('#habit-direct-total')?.value || 0));
    else if (action === 'save-habit-history') { const habit = getHabit(el.dataset.habitId); const date = el.dataset.habitDate; const value = habit?.trackingType === 'numeric' ? Number($(`[data-habit-history-value][data-habit-date="${CSS.escape(date)}"]`)?.value || 0) : null; const status = habit?.trackingType === 'numeric' ? 'done' : $(`[data-habit-history-status][data-habit-date="${CSS.escape(date)}"]`)?.value || 'missed'; setHabitLog(el.dataset.habitId, date, status, value); }
    else if (action === 'save-habit-history-date') { const habit = getHabit(el.dataset.habitId); const date = $('#habit-history-date')?.value; const value = habit?.trackingType === 'numeric' ? Number($('#habit-history-new-value')?.value || 0) : null; const status = habit?.trackingType === 'numeric' ? 'done' : $('#habit-history-new-status')?.value || 'missed'; setHabitLog(el.dataset.habitId, date, status, value); }
    else if (action === 'continue-habit') { const habit = getHabit(el.dataset.habitId || ctx.modalState?.habitId); if (habit) { const boundary = el.dataset.boundary || ctx.modalState?.boundary; const prior = habitMetrics(habit).periods?.filter(period => !period.isCurrent).at(-1); habit.lastContinuationPeriod = prior?.key || Core.habitPeriodKey(habit, Core.dateOnly(), state.settings.weekStartsOn || 'monday'); if (boundary === 'onePeriod') habit.continuation = 'automatic'; if (boundary === 'end') { habit.endType = 'never'; habit.endDate = null; habit.successfulPeriodsTarget = null; } habit.updatedAt = nowIso(); saveState(); } closeModal(); refreshHabitMetrics().then(render); }
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
