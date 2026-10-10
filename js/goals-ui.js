(function () {
  'use strict';

  const I18n = window.TodoI18n;
  const { tr, trn, msg } = I18n;

  // UI only: live app state and persistence/overlay helpers arrive per invocation.
  const HORIZONS = Object.freeze({ short: msg('Short-term'), mid: msg('Mid-term'), long: msg('Long-term') });
  const HABIT_METRICS = Object.freeze({ totalCheckins: msg('Check-ins'), streak: msg('Streak'), successfulPeriods: msg('Periods') });


  function normalizeHorizon(value) {
    return Object.hasOwn(HORIZONS, value) ? value : 'short';
  }

  function horizonOptions(value) {
    return Object.entries(HORIZONS).map(([key, label]) => `<option value="${key}" ${normalizeHorizon(value) === key ? 'selected' : ''}>${tr(label)}</option>`).join('');
  }

  function renderGoalRow(ctx, goal) {
    const { state, Core, esc, goalProgressLabel, goalStatusLabel, relativeDateLabel } = ctx;
    const progress = Core.goalProgressSummary(goal, state, state.habitMetrics || {});
    const overdue = Core.isGoalOverdue(goal, Core.dateOnly());
    const target = goal.targetDate ? `<small class="goal-target ${overdue ? 'is-overdue' : ''}"><i class="ph ph-calendar"></i>${esc(relativeDateLabel(goal.targetDate))}</small>` : `<small class="goal-target is-undated">${tr('No target date')}</small>`;
    return `<article class="goal-row ${overdue ? 'is-overdue' : ''}" data-goal-id="${esc(goal.id)}"><button class="goal-open" type="button" data-route="goal/${esc(goal.id)}"><span class="goal-row-top"><strong>${esc(goal.title)}</strong><small class="goal-status goal-status--${esc(goal.status)} ${overdue ? 'is-overdue' : ''}">${esc(goalStatusLabel(goal))}</small></span><span class="goal-progress"><span style="width:${Math.max(0, Math.min(100, progress.percent))}%"></span></span><span class="goal-row-meta"><small class="goal-progress-label">${esc(goalProgressLabel(goal))}</small>${target}</span></button><button class="btn-icon" type="button" data-action="goal-menu" data-goal-id="${esc(goal.id)}" aria-label="${tr('Goal actions')}"><i class="ph ph-dots-three"></i></button></article>`;
  }

  // Redesign R9a (GO1–GO4): the Goals list. Health follows the shown percentage: complete at 100%, overdue once the
  // target date has passed, at risk within seven days below 75%.
  const HORIZON_ICONS = Object.freeze({ short: 'ph-flag', mid: 'ph-path', long: 'ph-mountains' });
  const plainNumber = value => Number(value || 0).toLocaleString(I18n.locale(), { maximumFractionDigits: 2 });
  function goalPercent(ctx, goal) {
    return Math.round(Math.max(0, Math.min(100, ctx.Core.computeGoalProgress(goal, ctx.state, ctx.state.habitMetrics || {}).percent)));
  }
  function goalTone(ctx, goal, percent) {
    const today = ctx.Core.dateOnly();
    if (goal.status === 'completed' || percent >= 100) return 'complete';
    if (goal.status === 'active' && goal.targetDate && goal.targetDate < today) return 'overdue';
    if (goal.status === 'active' && goal.targetDate && goal.targetDate <= ctx.Core.addDays(today, 7) && percent < 75) return 'risk';
    return 'ok';
  }
  function goalMeta(ctx, goal) {
    const progress = ctx.Core.computeGoalProgress(goal, ctx.state, ctx.state.habitMetrics || {});
    if (goal.progressMode === 'linkedTasks') return tr('{current} of {target} tasks', { current: progress.current, target: progress.target });
    if (goal.progressMode === 'linkedHabits') return trn((goal.habitLinks || []).filter(link => link?.habitId).length, '{count} habit', '{count} habits');
    if (goal.progressType === 'numeric') return `${tr('{current} of {target}', { current: plainNumber(progress.current), target: plainNumber(progress.target) })}${goal.unit ? ` ${goal.unit}` : ''}`;
    return tr('Manual');
  }
  function renderGoalListRow(ctx, goal) {
    const { esc } = ctx;
    const percent = goalPercent(ctx, goal);
    const tone = goalTone(ctx, goal, percent);
    const date = goal.targetDate ? ctx.formatDate(goal.targetDate) : '';
    const side = !goal.targetDate ? `<span class="goal-list-date">${tr('No date')}</span>`
      : tone === 'overdue' ? `<span class="goal-list-date is-overdue">${esc(tr('Overdue · {date}', { date }))}</span>`
      : tone === 'risk' ? `<span class="goal-list-date is-risk">${esc(tr('At risk · {date}', { date }))}</span>`
      : `<span class="goal-list-date">${esc(date)}</span>`;
    return `<button class="goal-list-row" type="button" data-route="goal/${esc(goal.id)}"><span class="goal-list-top"><span class="task-title">${esc(goal.title)}</span><span class="goal-list-percent">${percent}%</span></span><span class="goal-list-bar is-${tone}" aria-hidden="true"><i style="width:${percent}%"></i></span><span class="goal-list-meta"><span>${esc(goalMeta(ctx, goal))}</span>${side}</span></button>`;
  }
  function goalFold(ctx, key, label, goals, action, actionLabel, meta) {
    if (!goals.length) return '';
    const { esc, state } = ctx;
    const open = state.ui[{ done: 'goalsDoneOpen', paused: 'goalsPausedOpen', archived: 'goalsArchivedOpen' }[key]] === true;
    const rows = open ? `<div class="today-card">${goals.map(goal => `<div class="today-row goals-fold-row"><button class="today-row-main" type="button" data-route="goal/${esc(goal.id)}"><span class="task-title">${esc(goal.title)}</span><span class="task-meta">${esc(meta(goal))}</span></button>${action ? `<button class="quick-chip" type="button" data-action="${action}" data-goal-id="${esc(goal.id)}">${actionLabel}</button>` : ''}</div>`).join('')}</div>` : '';
    return `<section class="goals-fold"><button class="collapsible-trigger" type="button" data-action="goals-fold" data-fold="${key}" aria-expanded="${open}"><span class="left"><i class="ph ph-caret-${open ? 'up' : 'down'}" aria-hidden="true"></i> ${label} · ${goals.length}</span></button>${rows}</section>`;
  }

  function renderGoals(ctx) {
    const { state, Core, esc, pageHeader, emptyState } = ctx;
    const goals = [...(state.goals || [])];
    let html = pageHeader(tr('Goals'), '', { add: false });
    if (!goals.length) return html + emptyState(tr('No goals here yet.'), tr('Create a goal to track a meaningful outcome.'), tr('New goal'), 'new-goal');
    const byDate = (a, b) => String(a.targetDate || '9999-12-31').localeCompare(String(b.targetDate || '9999-12-31')) || String(a.title).localeCompare(String(b.title));
    const active = goals.filter(goal => goal.status === 'active').sort(byDate);
    const tones = active.map(goal => goalTone(ctx, goal, goalPercent(ctx, goal)));
    const risk = tones.filter(tone => tone === 'risk').length;
    const late = tones.filter(tone => tone === 'overdue').length;
    html += `<p class="goals-summary">${esc(trn(active.length, '{count} active', '{count} active'))}${risk ? ` · <span class="is-risk">${esc(trn(risk, '{count} at risk', '{count} at risk'))}</span>` : ''}${late ? ` · <span class="is-overdue">${esc(trn(late, '{count} overdue', '{count} overdue'))}</span>` : ''}</p>`;
    const group = state.ui.goalGroup === 'date' ? 'date' : 'horizon';
    html += `<div class="view-tabs goals-group-switch" role="group" aria-label="${tr('Group goals')}">${[['horizon', tr('Horizon')], ['date', tr('Due date')]].map(([key, label]) => `<button class="btn${group === key ? ' is-selected' : ''}" type="button" data-action="goals-group" data-view="${key}" aria-pressed="${group === key}">${label}</button>`).join('')}</div>`;
    let groups;
    if (group === 'horizon') groups = Object.keys(HORIZONS).map(key => ({ key, icon: HORIZON_ICONS[key], label: tr(HORIZONS[key]), goals: active.filter(goal => normalizeHorizon(goal.horizon) === key) }));
    else {
      const months = new Map();
      for (const goal of active) {
        const key = goal.targetDate ? goal.targetDate.slice(0, 7) : 'none';
        if (!months.has(key)) months.set(key, []);
        months.get(key).push(goal);
      }
      const label = key => { const name = new Intl.DateTimeFormat(I18n.locale(), { month: 'long', year: 'numeric' }).format(Core.parseDateOnly(`${key}-01`)); return name.charAt(0).toLocaleUpperCase(I18n.locale()) + name.slice(1); };
      groups = [...months].sort(([a], [b]) => (a === 'none') - (b === 'none') || a.localeCompare(b)).map(([key, items]) => ({ key, icon: key === 'none' ? 'ph-calendar-x' : 'ph-calendar-blank', label: key === 'none' ? tr('No date') : label(key), goals: items }));
    }
    html += groups.filter(item => item.goals.length).map(item => `<section class="section goals-group" data-goal-group="${esc(item.key)}"><div class="section-header"><h2 class="section-label"><i class="ph ${item.icon}" aria-hidden="true"></i> ${esc(item.label)}</h2><span class="section-count">${item.goals.length}</span></div><div class="today-card goals-list">${item.goals.map(goal => renderGoalListRow(ctx, goal)).join('')}</div></section>`).join('');
    if (!active.length) html += `<p class="today-empty">${tr('No active goals.')}</p>`;
    html += goalFold(ctx, 'done', tr('Achieved goals'), goals.filter(goal => goal.status === 'completed'), '', '', goal => (goal.completedAt ? tr('Achieved {date}', { date: ctx.formatDate(Core.localDateOf(String(goal.completedAt))) }) : goalMeta(ctx, goal)));
    html += goalFold(ctx, 'paused', tr('Paused goals'), goals.filter(goal => goal.status === 'paused'), 'resume-goal', tr('Resume'), goal => goalMeta(ctx, goal));
    html += goalFold(ctx, 'archived', tr('Archived goals'), goals.filter(goal => goal.status === 'archived'), 'restore-goal', tr('Restore'), goal => goalMeta(ctx, goal));
    return html;
  }

  function renderGoal(ctx, goalId) {
    const { state, Core, esc, getGoal, goalProgressLabel, goalStatusLabel, relativeDateLabel, pageHeader } = ctx;
    const goal = getGoal(goalId); if (!goal) return renderGoals(ctx);
    const progress = Core.goalProgressSummary(goal, state, state.habitMetrics || {});
    // Linked modes use their derived percentage for health, never stale manual values.
    const health = Core.getGoalHealth({ ...goal, progressMode: 'manual', progressType: 'percentage', currentValue: progress.percent }, Core.parseDateOnly(Core.dateOnly()));
    const milestones = [...goal.milestones].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    const links = goal.projectLinks || [];
    const linkedProjects = links.map(link => state.projects.find(project => project.id === link.projectId)).filter(Boolean);
    const linkedTasks = state.tasks.filter(task => (goal.taskIds || []).includes(task.id));
    const linkedHabits = (goal.habitLinks || []).map(link => state.habits.find(habit => habit.id === link.habitId)).filter(Boolean);
    const statusAction = goal.status === 'paused' ? 'resume-goal' : goal.status === 'active' ? 'pause-goal' : goal.status === 'completed' ? 'restore-goal' : 'restore-goal';
    const statusText = goal.status === 'paused' ? tr('Resume') : goal.status === 'active' ? tr('Pause') : tr('Restore');
    let html = pageHeader(goal.title, goalStatusLabel(goal), { add: false, actionHtml: `<button class="btn btn-secondary" type="button" data-action="edit-goal" data-goal-id="${esc(goal.id)}"><i class="ph ph-pencil-simple"></i> ${tr('Edit')}</button><button class="btn-icon" type="button" data-action="goal-menu" data-goal-id="${esc(goal.id)}" aria-label="${tr('Goal actions')}"><i class="ph ph-dots-three"></i></button>` });
    html += `<section class="insight-card" data-goal-health="${health}"><h2>${tr('Goal health')}</h2><strong>${tr({ 'on-track': msg('On track'), 'at-risk': msg('At risk'), overdue: msg('Overdue'), complete: msg('Achieved') }[health])}</strong><p>${health === 'at-risk' ? tr('Target is within seven days and progress is below 75%.') : health === 'overdue' ? tr('The target date has passed.') : health === 'complete' ? tr('Target reached. Your Goal status remains your choice.') : tr('Progress and target date are on track.')}</p></section>`;
    if (goal.progressMode === 'linkedTasks') {
      html += `<section class="insight-card" data-goal-contributions="tasks"><h2>${tr('Task contribution')}</h2><strong>${trn(progress.target, '{current} of {count} task completed', '{current} of {count} tasks completed', { current: progress.current })}</strong><p>${tr('Direct and Project tasks count once each. Subtasks are not separate contributions.')}</p></section>`;
    } else if (goal.progressMode === 'linkedHabits') {
      html += `<section class="insight-card" data-goal-contributions="habits"><h2>${tr('Habit contributions')}</h2>${(goal.habitLinks || []).map(link => {
        const habit = state.habits.find(item => item.id === link.habitId);
        const actual = Number(state.habitMetrics?.[link.habitId]?.[link.metric]) || 0;
        const percent = link.target > 0 ? Math.max(0, Math.min(100, actual / link.target * 100)) : 0;
        return `<p><strong>${esc(habit?.name || tr('Unavailable habit'))}</strong> · ${esc(actual)} / ${esc(link.target)} ${esc(HABIT_METRICS[link.metric] ? tr(HABIT_METRICS[link.metric]) : link.metric)} · ${Math.round(percent)}%</p>`;
      }).join('') || `<p>${tr('No linked Habits yet.')}</p>`}<p>${tr('Each linked Habit has equal weight; its contribution is capped at 100%.')}</p></section>`;
    }
    html += `<div class="form-stack goal-properties">${[['title',msg('Title')],['areaId',msg('Area')],['horizon',msg('Horizon')],['targetValue',msg('Target value')],['unit',msg('Unit')],['targetDate',msg('Target date')]].map(([field,label]) => renderGoalProperty(ctx, goal, field, label)).join('')}<div class="goal-detail-actions"><button class="btn btn-secondary" type="button" data-action="edit-goal-source" data-goal-id="${esc(goal.id)}">${tr('Progress source')}</button><button class="btn btn-secondary" type="button" data-action="goal-status-menu" data-goal-id="${esc(goal.id)}">${tr('Status: {status}', { status: esc(goalStatusLabel(goal)) })}</button></div></div>`;
    const linkedWork = goal.progressMode === 'linkedTasks' ? trn(progress.linkedTasks.open, '{count} open task', '{count} open tasks') : goal.progressMode === 'linkedHabits' ? trn(progress.linkedHabits.remaining, '{count} Habit remaining', '{count} Habits remaining') : goal.unit ? `${progress.remaining} ${goal.unit}` : tr('{value} remaining', { value: progress.remaining });
    html += `<section class="goal-detail-card"><div class="goal-detail-context"><span class="goal-status goal-status--${esc(goal.status)} ${Core.isGoalOverdue(goal, Core.dateOnly()) ? 'is-overdue' : ''}">${esc(goalStatusLabel(goal))}</span><span class="goal-target ${Core.isGoalOverdue(goal, Core.dateOnly()) ? 'is-overdue' : ''}"><i class="ph ph-calendar"></i>${goal.targetDate ? esc(relativeDateLabel(goal.targetDate)) : tr('No target date')}</span><button class="btn btn-ghost goal-history-link" type="button" data-action="open-goal-history" data-goal-id="${esc(goal.id)}"><i class="ph ph-clock-counter-clockwise"></i> ${tr('History')}</button></div><div class="goal-progress-large"><strong>${esc(goalProgressLabel(goal))}</strong><span class="goal-progress"><span style="width:${Math.max(0, Math.min(100, progress.percent))}%"></span></span></div><details class="goal-progress-history"><summary>${tr('Progress summary')}</summary><p>${esc(linkedWork)} · ${tr('{percent}% complete', { percent: Math.round(progress.percent) })}</p></details>${goal.progressMode === 'manual' ? `<label class="field-label" for="goal-current-value">${goal.progressType === 'numeric' ? tr('Current value') : tr('Progress percentage')}<input id="goal-current-value" class="input" type="number" value="${esc(goal.currentValue)}" data-goal-id="${esc(goal.id)}" /></label><button class="btn btn-secondary" type="button" data-action="save-goal-progress" data-goal-id="${esc(goal.id)}">${tr('Update progress')}</button>` : `<p class="area-empty-copy">${goal.progressMode === 'linkedTasks' ? tr('Progress is calculated from linked tasks.') : tr('Progress is calculated from linked habits.')}</p>`}<div class="goal-detail-actions"><button class="btn btn-ghost" type="button" data-action="${statusAction}" data-goal-id="${esc(goal.id)}">${statusText}</button>${goal.status !== 'completed' && goal.status !== 'archived' ? `<button class="btn btn-secondary" type="button" data-action="complete-goal" data-goal-id="${esc(goal.id)}">${tr('Mark completed')}</button>` : ''}</div></section>`;
    const linkRows = [...linkedProjects.map(project => `<button class="goal-link-chip" type="button" data-route="project/${esc(project.id)}"><i class="ph ph-cube"></i>${esc(project.name)}<small>${tr('Project')}</small></button>`), ...linkedTasks.map(task => `<button class="goal-link-chip" type="button" data-action="open-task" data-task-id="${esc(task.id)}"><i class="ph ph-check-square"></i>${esc(task.title)}<small>${tr('Task')}</small></button>`), ...linkedHabits.map(habit => `<button class="goal-link-chip" type="button" data-route="habit/${esc(habit.id)}"><i class="ph ph-repeat"></i>${esc(habit.name)}<small>${tr('Habit')}</small></button>`)].join('');
    const directTaskLinks = (goal.taskIds || []).length; const habitLinkCount = (goal.habitLinks || []).length;
    html += `<section class="section"><div class="section-header"><h2 class="section-label">${tr('Linked work')}</h2><button class="btn btn-ghost" type="button" data-action="edit-goal-links" data-goal-id="${esc(goal.id)}">${tr('Manage links')}</button></div><p class="area-empty-copy">${trn(links.length, '{count} project link', '{count} project links')} · ${trn(directTaskLinks, '{count} direct task link', '{count} direct task links')} · ${trn(habitLinkCount, '{count} habit link', '{count} habit links')}</p>${linkRows ? `<div class="goal-link-list">${linkRows}</div>` : ''}</section>`;
    html += `<section class="section"><div class="section-header"><h2 class="section-label">${tr('Milestones')}</h2><button class="btn btn-ghost" type="button" data-action="new-milestone" data-goal-id="${esc(goal.id)}">${tr('Add milestone')}</button></div>${milestones.length ? `<div class="milestone-list">${milestones.map(milestone => `<div class="milestone-row ${!milestone.isCompleted && milestone.date && milestone.date < Core.dateOnly() ? 'is-overdue' : ''}"><button class="check-toggle ${milestone.isCompleted ? 'is-checked' : ''}" type="button" data-action="toggle-milestone" data-goal-id="${esc(goal.id)}" data-milestone-id="${esc(milestone.id)}" aria-label="${tr('Complete milestone')}" aria-pressed="${milestone.isCompleted ? 'true' : 'false'}"><i class="ph ${milestone.isCompleted ? 'ph-check' : 'ph-circle'}"></i></button><span><strong>${esc(milestone.title)}</strong><small>${milestone.date ? esc(relativeDateLabel(milestone.date)) : tr('No date')}</small></span><button class="btn-icon" type="button" data-action="edit-milestone" data-goal-id="${esc(goal.id)}" data-milestone-id="${esc(milestone.id)}" aria-label="${tr('Edit milestone')}"><i class="ph ph-pencil-simple"></i></button><button class="btn-icon" type="button" data-action="delete-milestone" data-goal-id="${esc(goal.id)}" data-milestone-id="${esc(milestone.id)}" aria-label="${tr('Delete milestone')}"><i class="ph ph-trash"></i></button></div>`).join('')}</div>` : `<p class="area-empty-copy">${tr('No milestones yet.')}</p>`}</section>`;
    html += `<section class="section"><div class="section-header"><h2 class="section-label">${tr('Reminders')}</h2><button class="btn btn-ghost" type="button" data-action="edit-goal-reminders" data-goal-id="${esc(goal.id)}">${tr('Edit reminders')}</button></div><p class="area-empty-copy">${Core.goalReminderMoments(goal).length ? trn(Core.goalReminderMoments(goal).length, '{count} reminder point at {time}', '{count} reminder points at {time}', { time: esc(goal.reminders.time) }) : tr('No reminders enabled.')}</p></section>`;
    html += `<section class="section"><div class="section-header"><h2 class="section-label">${tr('History')}</h2><button class="btn btn-ghost" type="button" data-action="open-goal-history" data-goal-id="${esc(goal.id)}">${tr('View history')}</button></div><p class="area-empty-copy">${tr('Significant Goal changes are kept here.')}</p></section>`;
    return html;
  }

  function renderGoalProperty(ctx, goal, field, label) {
    const { state, esc, getArea } = ctx;
    const editor = ctx.goalPropertyEditor?.goal === goal && ctx.goalPropertyEditor.field === field ? ctx.goalPropertyEditor : null;
    const value = field === 'horizon' ? tr(HORIZONS[normalizeHorizon(goal.horizon)]) : field === 'areaId' ? getArea(goal.areaId)?.name || tr('No area') : goal[field] ?? '';
    if (!editor) return `<div class="goal-property"><span class="field-label">${tr(label)}</span><button class="btn btn-ghost" type="button" data-goal-property="${field}" data-goal-id="${esc(goal.id)}">${esc(value || (field === 'targetDate' ? tr('No date') : tr('Not set')))}</button></div>`;
    const id = 'goal-detail-' + field;
    const input = field === 'horizon' ? `<select id="${id}" class="input">${horizonOptions(editor.value)}</select>` : field === 'areaId' ? `<select id="${id}" class="input"><option value="">${tr('No area')}</option>${state.areas.filter(a => a.status === 'active' || a.id === goal.areaId).map(a => `<option value="${esc(a.id)}" ${a.id === editor.value ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : `<input id="${id}" class="input" type="${field === 'targetValue' ? 'number' : field === 'targetDate' ? 'date' : 'text'}" ${field === 'targetValue' ? 'step="any"' : field === 'title' ? 'maxlength="120"' : field === 'unit' ? 'maxlength="40"' : ''} value="${esc(editor.value)}" ${editor.error ? 'aria-invalid="true" aria-describedby="goal-property-error"' : ''} />`;
    return `<div class="goal-property-editor"><label class="field-label" for="${id}">${tr(label)}</label>${input}${editor.error ? `<p id="goal-property-error" class="validation" role="alert">${esc(editor.error)}</p>` : ''}<div class="goal-detail-actions"><button class="btn btn-secondary" type="button" data-action="save-goal-property">${tr({ title: msg('Save title'), areaId: msg('Save area'), horizon: msg('Save horizon'), targetValue: msg('Save target value'), unit: msg('Save unit'), targetDate: msg('Save target date') }[field])}</button><button class="btn btn-ghost" type="button" data-action="cancel-goal-property">${tr('Cancel')}</button></div></div>`;
  }

  function openGoalProperty(ctx, element) {
    const { $, getGoal, render, goalFocusTarget } = ctx;
    const goal = getGoal(element.dataset.goalId); if (!goal) return;
    ctx.goalPropertyEditor = { goal, field: element.dataset.goalProperty, value: goal[element.dataset.goalProperty] ?? '', returnFocus: goalFocusTarget(element) };
    render(); requestAnimationFrame(() => $('#goal-detail-' + ctx.goalPropertyEditor?.field)?.focus());
  }

  function cancelGoalProperty(ctx) {
    const { render, restoreGoalFocus } = ctx;
    const target = ctx.goalPropertyEditor?.returnFocus; ctx.goalPropertyEditor = null; render(); restoreGoalFocus(target);
  }

  function saveGoalProperty(ctx) {
    const { $, getGoal, render, restoreGoalFocus, captureGoalProgress, evaluateGoalProgressChanges, nowIso, putGoalHistory, saveState } = ctx;
    const editor = ctx.goalPropertyEditor;
    if (!editor || getGoal(editor.goal.id) !== editor.goal) { cancelGoalProperty(ctx); return; }
    const { goal, field } = editor; editor.value = $('#goal-detail-' + field)?.value ?? editor.value;
    const value = field === 'horizon' ? normalizeHorizon(editor.value) : field === 'targetValue' ? Number(editor.value) : field === 'areaId' || field === 'targetDate' ? editor.value || null : String(editor.value).trim();
    const error = field === 'title' && !value ? tr('Goal needs a title.') : field === 'targetValue' && (!Number.isFinite(value) || value <= 0) ? tr('Enter a target above zero.') : '';
    if (error) { editor.error = error; render(); requestAnimationFrame(() => $('#goal-detail-' + field)?.focus()); return; }
    const before = captureGoalProgress([goal.id]); const old = goal[field];
    if (old !== value) { goal[field] = value; goal.updatedAt = nowIso(); if (field === 'targetDate') putGoalHistory(goal.id, 'targetDateChanged', { from: old, to: value }); saveState(); }
    const target = editor.returnFocus; ctx.goalPropertyEditor = null; render(); restoreGoalFocus(target); evaluateGoalProgressChanges(before);
  }

  function openGoalSourceModal(ctx, goalId) {
    const { getGoal, renderModal, goalFocusTarget, goalDraft } = ctx;
    const goal = getGoal(goalId); if (!goal) return;
    ctx.setModalState({ type: 'goal-source', goalId, source: goal, draft: goalDraft(goal), returnFocus: goalFocusTarget(), error: '' }); renderModal();
  }

  function saveGoalSource(ctx) {
    const { getGoal, render, renderModal, captureGoalProgress, evaluateGoalProgressChanges, nowIso, saveState, closeModal } = ctx;
    if (ctx.modalState?.type !== 'goal-source') return;
    const goal = getGoal(ctx.modalState.goalId); if (!goal || goal !== ctx.modalState.source) { closeModal(); return; }
    readGoalDraft(ctx); const d = ctx.modalState.draft;
    if (d.progressMode === 'manual' && d.progressType === 'numeric' && !(Number.isFinite(d.targetValue) && d.targetValue > 0)) { ctx.modalState.error = tr('Numeric goals need a target above zero.'); renderModal(); return; }
    const before = captureGoalProgress([goal.id]);
    goal.progressMode = d.progressMode; goal.progressType = d.progressType; goal.updatedAt = nowIso(); saveState(); closeModal(); render(); evaluateGoalProgressChanges(before);
  }

  function openGoalStatusMenu(ctx, anchor, goalId) {
    const { esc, getGoal, goalFocusTarget, openPopover } = ctx;
    const goal = getGoal(goalId); if (!goal) return;
    const choices = [['active','resume-goal',msg('Active')],['paused','pause-goal',msg('Paused')],['completed','complete-goal',msg('Completed')],['archived','archive-goal',msg('Archived')]];
    openPopover(anchor, choices.map(([status,action,label]) => `<button class="popover-option" type="button" data-pop-action="${action}" data-goal-id="${esc(goalId)}" ${goal.status === status ? 'disabled' : ''}>${tr(label)}</button>`).join(''), { type: 'goal-status' });
    ctx.popoverEl.goalReturnFocus = goalFocusTarget(anchor); ctx.popoverEl.querySelector('button:not([disabled])')?.focus();
  }

  function openMilestoneModal(ctx, goalId, milestoneId = null) {
    const { $, getGoal, renderModal, goalFocusTarget } = ctx;
    const previous = ctx.modalState?.type === 'goal' ? ctx.modalState : null;
    if (previous) readGoalDraft(ctx);
    const milestone = milestoneId ? (previous?.draft || getGoal(goalId))?.milestones.find(item => item.id === milestoneId) : null;
    ctx.setModalState({ type: 'milestone', goalId, milestoneId, previous, returnFocus: goalFocusTarget(), draft: { title: milestone?.title || '', date: milestone?.date || '' }, error: '' });
    renderModal(); requestAnimationFrame(() => $('#milestone-title')?.focus());
  }

  function openGoalLinksModal(ctx, goalId) {
    const { getGoal, renderModal, goalFocusTarget, copyTemplate } = ctx;
    const previous = ctx.modalState?.type === 'goal' ? ctx.modalState : null;
    if (previous) readGoalDraft(ctx);
    const goal = previous?.draft || getGoal(goalId); if (!goal) return;
    ctx.setModalState({ type: 'goal-links', goalId, previous, returnFocus: goalFocusTarget(), draft: { taskIds: [...(goal.taskIds || [])], projectLinks: copyTemplate(goal.projectLinks || []), habitLinks: copyTemplate(goal.habitLinks || []) } });
    renderModal();
  }

  function openGoalRemindersModal(ctx, goalId) {
    const { getGoal, renderModal, goalFocusTarget } = ctx;
    const previous = ctx.modalState?.type === 'goal' ? ctx.modalState : null;
    if (previous) readGoalDraft(ctx);
    const goal = previous?.draft || getGoal(goalId); if (!goal) return;
    ctx.setModalState({ type: 'goal-reminders', goalId, previous, returnFocus: goalFocusTarget(), draft: { ...goal.reminders } });
    renderModal();
  }

  function renderGoalModal(ctx) {
    const { state, esc, modalFrame } = ctx;
    const d = ctx.modalState.draft; const editing = Boolean(ctx.modalState.goalId);
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${editing ? tr('Edit goal') : tr('New goal')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label">${tr('Title')}<input id="goal-title" class="input" maxlength="120" value="${esc(d.title)}" placeholder="${tr('What do you want to achieve?')}" /></label><label class="field-label">${tr('Area')}<select id="goal-area" class="input"><option value="">${tr('No area')}</option>${state.areas.filter(area => area.status === 'active' || area.id === d.areaId).map(area => `<option value="${esc(area.id)}" ${area.id === d.areaId ? 'selected' : ''}>${esc(area.name)}</option>`).join('')}</select></label><label class="field-label">${tr('Horizon')}<select id="goal-horizon" class="input">${horizonOptions(d.horizon)}</select></label>${goalSourceFields(ctx, d)}<label class="field-label">${tr('Target date')}<input id="goal-target-date" class="input" type="date" value="${esc(d.targetDate)}" /></label><button class="btn btn-ghost" type="button" data-action="toggle-goal-more" aria-expanded="${Boolean(d.moreOpen)}" aria-controls="goal-more">${tr('More')}</button>${d.moreOpen ? `<div id="goal-more" class="form-stack"><div class="section-header"><h3 class="section-label">${tr('Milestones')}</h3><button class="btn btn-ghost" type="button" data-action="draft-goal-milestone">${tr('Add milestone')}</button></div>${d.milestones.map(m => `<div class="milestone-row goal-draft-milestone"><span><strong>${esc(m.title)}</strong><small>${esc(m.date || tr('No date'))}</small></span><button class="btn-icon" type="button" data-action="draft-goal-milestone" data-milestone-id="${esc(m.id)}" aria-label="${tr('Edit milestone')}"><i class="ph ph-pencil-simple"></i></button><button class="btn-icon" type="button" data-action="delete-draft-goal-milestone" data-milestone-id="${esc(m.id)}" aria-label="${tr('Delete milestone')}"><i class="ph ph-trash"></i></button></div>`).join('')}<button class="btn btn-secondary" type="button" data-action="draft-goal-reminders">${tr('Reminders')}</button><button class="btn btn-secondary" type="button" data-action="draft-goal-links">${d.progressMode === 'linkedTasks' ? tr('Linked Projects / Tasks') : d.progressMode === 'linkedHabits' ? tr('Linked Projects / Habits') : tr('Linked Projects')}</button><p class="area-empty-copy">${trn(d.projectLinks.length, '{count} project link', '{count} project links')} · ${trn(d.taskIds.length, '{count} task link', '{count} task links')} · ${trn(d.habitLinks.length, '{count} habit link', '{count} habit links')}</p></div>` : ''}${ctx.modalState.error ? `<p class="validation" role="alert">${esc(ctx.modalState.error)}</p>` : ''}</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Cancel')}</button><button class="btn btn-primary" type="button" data-action="save-goal">${editing ? tr('Save changes') : tr('Create goal')}</button></div></div></div>`, 'quick');
  }

  function goalSourceFields(ctx, d, includeValues = true) {
    const { esc } = ctx;
    return `<label class="field-label">${tr('Progress source')}<select id="goal-progress-mode" class="input">${[['manual',msg('Manual')],['linkedTasks',msg('Linked tasks')],['linkedHabits',msg('Linked habits')]].map(([v,l]) => `<option value="${v}" ${d.progressMode === v ? 'selected' : ''}>${tr(l)}</option>`).join('')}</select></label><div class="goal-modal-manual ${d.progressMode === 'manual' ? '' : 'is-hidden'}"><label class="field-label">${tr('Type')}<select id="goal-progress-type" class="input"><option value="percentage" ${d.progressType === 'percentage' ? 'selected' : ''}>${tr('Percentage')}</option><option value="numeric" ${d.progressType === 'numeric' ? 'selected' : ''}>${tr('Numeric target')}</option></select></label>${includeValues ? `<div class="goal-form-grid"><label class="field-label">${tr('Current')}<input id="goal-current" class="input" type="number" step="any" value="${esc(d.currentValue)}" /></label><label class="field-label">${tr('Target')}<input id="goal-target" class="input" type="number" step="any" value="${esc(d.targetValue)}" /></label></div><label class="field-label">${tr('Unit')}<input id="goal-unit" class="input" maxlength="40" value="${esc(d.unit)}" /></label>` : ''}</div>`;
  }

  function renderGoalSourceModal(ctx) {
    const { esc, modalFrame } = ctx;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${tr('Goal progress source')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><div class="form-stack">${goalSourceFields(ctx, ctx.modalState.draft, false)}<p class="area-empty-copy">${tr('Only the selected source contributes. Existing links and manual values are retained.')}</p>${ctx.modalState.error ? `<p class="validation" role="alert">${esc(ctx.modalState.error)}</p>` : ''}</div><div class="modal-footer"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Cancel')}</button><button class="btn btn-primary" type="button" data-action="save-goal-source">${tr('Save source')}</button></div></div>`, 'small-modal');
  }

  function renderMilestoneModal(ctx) {
    const { esc, modalFrame } = ctx;
    const d = ctx.modalState.draft;
    const editing = Boolean(ctx.modalState.milestoneId);
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${editing ? tr('Edit milestone') : tr('New milestone')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label">${tr('Title')}<input id="milestone-title" class="input" maxlength="120" value="${esc(d.title)}" /></label><label class="field-label">${tr('Date')}<input id="milestone-date" class="input" type="date" value="${esc(d.date)}" /></label>${ctx.modalState.error ? `<p class="validation" role="alert">${esc(ctx.modalState.error)}</p>` : ''}</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Cancel')}</button><button class="btn btn-primary" type="button" data-action="save-milestone">${editing ? tr('Save milestone') : tr('Add milestone')}</button></div></div></div>`, 'small-modal');
  }

  function renderGoalLinksModal(ctx) {
    const { state, esc, modalFrame } = ctx;
    const d = ctx.modalState.draft;
    const projectIds = new Set(d.projectLinks.map(link => link.projectId));
    const taskIds = new Set(d.taskIds);
    const habitIds = new Set(d.habitLinks.map(link => link.habitId));
    const projects = state.projects.map(project => {
      const link = d.projectLinks.find(item => item.projectId === project.id) || d.projectDrafts?.[project.id];
      const mode = d.projectModes?.[project.id] || link?.contributionMode || 'allTasks';
      const selected = new Set(link?.selectedTaskIds || []);
      const projectTasks = state.tasks.filter(task => task.projectId === project.id);
      const picker = mode === 'selectedTasks' ? `<div class="project-task-picker" data-project-task-picker="${esc(project.id)}">${projectTasks.length ? projectTasks.map(task => `<label><input type="checkbox" data-goal-project-task="${esc(project.id)}:${esc(task.id)}" ${selected.has(task.id) ? 'checked' : ''}> ${esc(task.title)}</label>`).join('') : `<small>${tr('No tasks in this Project.')}</small>`}</div>` : '';
      return `<div class="goal-project-link"><label><input type="checkbox" data-goal-link-project="${esc(project.id)}" ${projectIds.has(project.id) ? 'checked' : ''}> ${esc(project.name)} <select data-goal-project-mode="${esc(project.id)}"><option value="allTasks" ${mode === 'allTasks' ? 'selected' : ''}>${tr('All tasks')}</option><option value="selectedTasks" ${mode === 'selectedTasks' ? 'selected' : ''}>${tr('Selected tasks')}</option></select></label>${picker}</div>`;
    }).join('') || `<p>${tr('No projects yet.')}</p>`;
    const source = ctx.modalState.previous?.draft.progressMode;
    const tasks = !source || source === 'linkedTasks' ? `<h3>${tr('Tasks')}</h3>${state.tasks.map(task => `<label><input type="checkbox" data-goal-link-task="${esc(task.id)}" ${taskIds.has(task.id) ? 'checked' : ''}> ${esc(task.title)}</label>`).join('') || `<p>${tr('No tasks yet.')}</p>`}` : '';
    const habits = !source || source === 'linkedHabits' ? `<h3>${tr('Habits')}</h3>${state.habits.map(habit => { const link = d.habitLinks.find(item => item.habitId === habit.id) || d.habitDrafts?.[habit.id]; return `<label><input type="checkbox" data-goal-link-habit="${esc(habit.id)}" ${habitIds.has(habit.id) ? 'checked' : ''}> ${esc(habit.name || habit.title)} <select aria-label="${tr('{name} metric', { name: esc(habit.name) })}" data-goal-habit-metric="${esc(habit.id)}"><option value="totalCheckins" ${(link?.metric || 'totalCheckins') === 'totalCheckins' ? 'selected' : ''}>${tr('Check-ins')}</option><option value="streak" ${link?.metric === 'streak' ? 'selected' : ''}>${tr('Streak')}</option><option value="successfulPeriods" ${link?.metric === 'successfulPeriods' ? 'selected' : ''}>${tr('Periods')}</option></select><input aria-label="${tr('{name} target', { name: esc(habit.name) })}" type="number" min="0" step="any" value="${esc(link?.target ?? 1)}" data-goal-habit-target="${esc(habit.id)}"></label>`; }).join('') || `<p>${tr('Habits will be available after you create them.')}</p>`}` : '';
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${tr('Goal links')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><div class="link-picker"><h3>${tr('Projects')}</h3>${projects}${tasks}${habits}</div>${ctx.modalState.error ? `<p class="validation" role="alert">${esc(ctx.modalState.error)}</p>` : ''}<div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Cancel')}</button><button class="btn btn-primary" type="button" data-action="save-goal-links">${tr('Save links')}</button></div></div></div>`, 'quick');
  }

  function renderGoalRemindersModal(ctx) {
    const { esc, modalFrame } = ctx;
    const d = ctx.modalState.draft;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${tr('Goal reminders')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close dialog')}"><i class="ph ph-x"></i></button></div><div class="link-picker"><label><input id="goal-reminder-7" type="checkbox" ${d.sevenDaysBefore ? 'checked' : ''}> ${tr('7 days before')}</label><label><input id="goal-reminder-3" type="checkbox" ${d.threeDaysBefore ? 'checked' : ''}> ${tr('3 days before')}</label><label><input id="goal-reminder-1" type="checkbox" ${d.oneDayBefore ? 'checked' : ''}> ${tr('1 day before')}</label><label><input id="goal-reminder-date" type="checkbox" ${d.onTargetDate ? 'checked' : ''}> ${tr('On target date')}</label><label class="field-label">${tr('Shared reminder time')}<input id="goal-reminder-time" class="input" type="time" value="${esc(d.time || '09:00')}" /></label></div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Cancel')}</button><button class="btn btn-primary" type="button" data-action="save-goal-reminders">${tr('Save reminders')}</button></div></div></div>`, 'small-modal');
  }

  function renderGoalReachedModal(ctx) {
    const { esc, modalFrame } = ctx;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${tr('Goal reached')}</h2><button class="btn-icon" type="button" data-action="keep-goal-active" aria-label="${tr('Close dialog')}"><i class="ph ph-x"></i></button></div><p class="dialog-copy">${tr('This goal has reached 100%. Keep tracking it or mark it as completed.')}</p><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="keep-goal-active">${tr('Keep active')}</button><button class="btn btn-primary" type="button" data-action="complete-goal" data-goal-id="${esc(ctx.modalState.goalId)}">${tr('Mark completed')}</button></div></div></div>`, 'small-modal');
  }

  function goalHistoryEventLabel(type) {
    return tr({ created: msg('Goal created'), progressChanged: msg('Progress changed'), manualProgress: msg('Manual progress updated'), statusChanged: msg('Status changed'), targetDateChanged: msg('Target date changed'), projectLinked: msg('Project linked'), projectUnlinked: msg('Project unlinked') }[type] || msg('Goal updated'));
  }

  function goalHistoryDate(ctx, value) {
    if (!value) return tr('No date');
    return ctx.Core.parseDateOnly(value)?.toLocaleDateString(I18n.locale(), { dateStyle: 'medium' }) || String(value);
  }

  function goalHistoryValue(value, suffix = '') {
    if (value === null || value === undefined || value === '') return tr('Not set');
    return `${value}${suffix}`;
  }

  function goalHistorySummary(ctx, event) {
    const data = event?.data && typeof event.data === 'object' ? event.data : {};
    if (['progressChanged', 'manualProgress'].includes(event.type)) return `${goalHistoryValue(data.from, '%')} → ${goalHistoryValue(data.to, '%')}`;
    if (event.type === 'statusChanged') {
      const statuses = { active: msg('Active'), paused: msg('Paused'), completed: msg('Completed'), archived: msg('Archived') };
      const status = value => (typeof value === 'string' && Object.hasOwn(statuses, value) ? tr(statuses[value]) : value);
      return `${goalHistoryValue(status(data.from))} → ${goalHistoryValue(status(data.to))}`;
    }
    if (event.type === 'targetDateChanged') return `${goalHistoryDate(ctx, data.from)} → ${goalHistoryDate(ctx, data.to)}`;
    if (['projectLinked', 'projectUnlinked'].includes(event.type)) return ctx.getProject(data.projectId)?.name || data.projectId || tr('Project');
    const entries = Object.entries(data);
    return entries.length ? entries.map(([key, value]) => `${key}: ${goalHistoryValue(value)}`).join(' · ') : tr('No additional details');
  }

  function goalHistoryTimestamp(event) {
    const timestamp = Date.parse(event?.createdAt);
    return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString(I18n.locale(), { dateStyle: 'medium', timeStyle: 'short' }) : tr('Unknown time');
  }

  function goalHistoryRange(ctx, value) {
    const end = ctx.Core.dateOnly();
    return value === 'month' ? { start: `${end.slice(0, 7)}-01`, end } : { start: ctx.Core.addDays(end, -6), end };
  }

  function renderGoalHistoryModal(ctx) {
    const { esc, getGoal, modalFrame, modalState } = ctx;
    const goal = getGoal(modalState.goalId);
    const events = Array.isArray(modalState.events) ? [...modalState.events].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) : null;
    const range = modalState.historyRange === 'month' ? 'month' : 'week';
    const snapshots = goal && events ? ctx.Core.goalProgressHistory(goal, { goalHistory: events }, goalHistoryRange(ctx, range)) : [];
    const snapshotCards = snapshots.length ? `<div class="goal-history-cards">${snapshots.map(snapshot => `<article><strong>${esc(Math.round(snapshot.percent))}%</strong><small>${esc(goalHistoryDate(ctx, snapshot.date))}</small></article>`).join('')}</div>` : `<p class="area-empty-copy" data-goal-history-empty>${range === 'month' ? tr('No progress snapshots in this month.') : tr('No progress snapshots in this week.')}</p>`;
    const rangeControl = `<label class="field-label" for="goal-history-range">${tr('History range')}<select id="goal-history-range" class="input" data-goal-history-range><option value="week" ${range === 'week' ? 'selected' : ''}>${tr('Week')}</option><option value="month" ${range === 'month' ? 'selected' : ''}>${tr('Month')}</option></select></label>`;
    const body = !goal ? `<p class="area-empty-copy">${tr('This Goal is no longer available.')}</p>` : modalState.error ? `<p class="validation" role="alert">${esc(modalState.error)}</p>` : !events ? `<p class="area-empty-copy">${tr('Loading history…')}</p>` : !events.length ? `<p class="area-empty-copy">${tr('No significant changes have been recorded yet.')}</p>` : `${snapshotCards}<div class="form-stack">${events.map(event => `<article class="goal-property"><span class="field-label">${esc(goalHistoryEventLabel(event.type))}</span><strong>${esc(goalHistorySummary(ctx, event))}</strong><small>${esc(goalHistoryTimestamp(event))}</small></article>`).join('')}</div>`;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${tr('Goal history')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div>${rangeControl}${body}<div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">${tr('Close')}</button></div></div></div>`, 'quick');
  }

  function openGoalMenu(ctx, anchor, goalId) {
    const { esc, getGoal, openPopover, templateMenuEntry } = ctx;
    const goal = getGoal(goalId); if (!goal) return;
    const lifecycle = goal.status === 'archived' ? '<button class="popover-option" type="button" data-pop-action="restore-goal" data-goal-id="' + esc(goalId) + '"><i class="ph ph-arrow-counter-clockwise"></i>' + tr('Restore goal') + '</button>' : `<button class="popover-option" type="button" data-pop-action="${goal.status === 'paused' ? 'resume-goal' : 'pause-goal'}" data-goal-id="${esc(goalId)}"><i class="ph ph-pause"></i>${goal.status === 'paused' ? tr('Resume goal') : tr('Pause goal')}</button>`;
    const html = `<button class="popover-option" type="button" data-pop-action="edit-goal" data-goal-id="${esc(goalId)}"><i class="ph ph-pencil-simple"></i>${tr('Edit goal')}</button>${lifecycle}${goal.status !== 'completed' && goal.status !== 'archived' ? `<button class="popover-option" type="button" data-pop-action="complete-goal" data-goal-id="${esc(goalId)}"><i class="ph ph-check-circle"></i>${tr('Mark completed')}</button>` : ''}${goal.status !== 'archived' ? `<button class="popover-option" type="button" data-pop-action="archive-goal" data-goal-id="${esc(goalId)}"><i class="ph ph-archive"></i>${tr('Archive goal')}</button>` : ''}<div class="popover-separator"></div><button class="popover-option" type="button" data-pop-action="delete-goal" data-goal-id="${esc(goalId)}" style="color:var(--danger)"><i class="ph ph-trash"></i>${tr('Delete goal')}</button>`;
    openPopover(anchor, templateMenuEntry('goal',goalId)+html, { type: 'goal-menu', goalId });
  }

  function readGoalDraft(ctx) {
    const { $ } = ctx;
    const d = ctx.modalState.draft;
    for (const [field, id] of Object.entries({title:'goal-title',areaId:'goal-area',horizon:'goal-horizon',progressMode:'goal-progress-mode',progressType:'goal-progress-type',currentValue:'goal-current',targetValue:'goal-target',unit:'goal-unit',targetDate:'goal-target-date'})) {
      const input = $('#' + id); if (!input) continue;
      d[field] = field === 'horizon' ? normalizeHorizon(input.value) : ['currentValue','targetValue'].includes(field) ? Number(input.value) : ['areaId','targetDate'].includes(field) ? input.value || null : input.value;
    }
    return d;
  }

  function saveGoalModal(ctx) {
    const { state, Core, getGoal, render, renderModal, nowIso, putGoalHistory, saveState, closeModal, syncGoalLinks, uid, navigate, maybePromptGoalReached } = ctx;
    if (ctx.modalState?.type !== 'goal') return;
    const d = readGoalDraft(ctx);
    if (!String(d.title).trim()) { ctx.modalState.error = tr('Goal needs a title.'); renderModal(); return; }
    if (d.progressMode === 'manual' && d.progressType === 'numeric' && !(Number.isFinite(d.targetValue) && d.targetValue > 0)) { ctx.modalState.error = tr('Numeric goals need a target above zero.'); renderModal(); return; }
    const { moreOpen, ...fields } = d;
    fields.horizon = normalizeHorizon(d.horizon);
    if (ctx.modalState.goalId) {
      const goal = getGoal(ctx.modalState.goalId); if (!goal) return;
      const oldProgress = Core.computeGoalProgress(goal, state, state.habitMetrics || {}).percent;
      const oldDate = goal.targetDate;
      const oldProjects = new Set(goal.projectLinks.map(link => link.projectId));
      syncGoalLinks(goal, d.projectLinks, d.taskIds, d.habitLinks);
      Object.assign(goal, { ...fields, title: d.title.trim(), updatedAt: nowIso() });
      d.projectLinks.forEach(link => { if (!oldProjects.has(link.projectId)) putGoalHistory(goal.id, 'projectLinked', { projectId: link.projectId }); });
      oldProjects.forEach(projectId => { if (!d.projectLinks.some(link => link.projectId === projectId)) putGoalHistory(goal.id, 'projectUnlinked', { projectId }); });
      const nextProgress = Core.computeGoalProgress(goal, state, state.habitMetrics || {}).percent;
      if (nextProgress !== oldProgress) putGoalHistory(goal.id, 'progressChanged', { from: oldProgress, to: nextProgress });
      if (oldDate !== goal.targetDate) putGoalHistory(goal.id, 'targetDateChanged', { from: oldDate, to: goal.targetDate });
      ctx.modalState.savedGoalSource = goal;
      saveState(); closeModal(); render(); maybePromptGoalReached(goal, oldProgress);
    } else {
      const goal = { ...(ctx.modalState.templateInstance?.goal || {}), id: uid('goal'), ...fields, title: d.title.trim(), isInbox: Boolean(ctx.modalState.templateContext?.inbox), createdAt: nowIso(), updatedAt: nowIso(), completedAt: null };
      ctx.modalState.savedGoalSource = goal;
      state.goals.push(goal); syncGoalLinks(goal, d.projectLinks, d.taskIds, d.habitLinks); putGoalHistory(goal.id, 'created'); saveState(); closeModal(); ctx.setCreatedGoalFocusId(goal.id); navigate(`goal/${goal.id}`);
    }
  }

  function saveGoalProgress(ctx, goalId) {
    const { state, Core, $, getGoal, render, nowIso, putGoalHistory, saveState, maybePromptGoalReached } = ctx;
    const goal = getGoal(goalId); if (!goal || goal.progressMode !== 'manual') return;
    const before = Core.computeGoalProgress(goal, state, state.habitMetrics || {}).percent;
    goal.currentValue = Number($('#goal-current-value')?.value || 0); goal.updatedAt = nowIso();
    const after = Core.computeGoalProgress(goal, state, state.habitMetrics || {}).percent;
    if (after !== before) putGoalHistory(goalId, 'progressChanged', { from: before, to: after });
    saveState(); render(); maybePromptGoalReached(goal, before);
  }

  function saveMilestoneModal(ctx) {
    const { $, getGoal, render, renderModal, nowIso, saveState, closeModal, uid } = ctx;
    if (ctx.modalState?.type !== 'milestone') return;
    const goal = ctx.modalState.previous?.draft || getGoal(ctx.modalState.goalId); if (!goal) return;
    ctx.modalState.draft = { title: $('#milestone-title')?.value || '', date: $('#milestone-date')?.value || '' };
    const title = String(ctx.modalState.draft.title).trim(); if (!title) { ctx.modalState.error = tr('Milestone needs a title.'); renderModal(); return; }
    const existing = ctx.modalState.milestoneId ? goal.milestones.find(item => item.id === ctx.modalState.milestoneId) : null;
    if (existing) Object.assign(existing, { title, date: $('#milestone-date')?.value || null });
    else goal.milestones.push({ id: uid('milestone'), title, date: $('#milestone-date')?.value || null, isCompleted: false, completedAt: null, order: goal.milestones.length });
    if (ctx.modalState.previous) { closeModal(); return; }
    goal.updatedAt = nowIso();
    saveState(); closeModal(); render();
  }

  function toggleMilestone(ctx, goalId, milestoneId) {
    const { getGoal, render, renderModal, nowIso, saveState } = ctx;
    const goal = getGoal(goalId); const milestone = goal?.milestones.find(item => item.id === milestoneId); if (!milestone) return;
    milestone.isCompleted = !milestone.isCompleted; milestone.completedAt = milestone.isCompleted ? nowIso() : null; goal.updatedAt = nowIso(); saveState(); render(); if (ctx.modalState?.type === 'calendar-day') renderModal();
  }

  function readGoalLinkDraft(ctx) {
    const { $, $$ } = ctx;
    const d = ctx.modalState.draft;
    const projects = $$('[data-goal-link-project]');
    d.projectModes ||= {}; d.projectDrafts ||= {};
    $$('[data-goal-project-mode]').forEach(input => { d.projectModes[input.dataset.goalProjectMode] = input.value; });
    projects.forEach(input => {
      const projectId = input.dataset.goalLinkProject;
      const old = d.projectLinks.find(link => link.projectId === projectId) || d.projectDrafts[projectId];
      const picker = $(`[data-project-task-picker="${CSS.escape(projectId)}"]`);
      const selectedTaskIds = picker ? $$('[data-goal-project-task]', picker).filter(i => i.checked).map(i => i.dataset.goalProjectTask.slice(projectId.length + 1)) : [...(old?.selectedTaskIds || [])];
      d.projectDrafts[projectId] = { ...old, projectId, contributionMode: d.projectModes[projectId] || 'allTasks', selectedTaskIds };
    });
    if (projects.length) d.projectLinks = projects.filter(input => input.checked).map(input => d.projectDrafts[input.dataset.goalLinkProject]);
    const tasks = $$('[data-goal-link-task]');
    if (tasks.length) d.taskIds = tasks.filter(input => input.checked).map(input => input.dataset.goalLinkTask);
    const habits = $$('[data-goal-link-habit]');
    d.habitDrafts ||= {};
    habits.forEach(input => {
      const id = input.dataset.goalLinkHabit; const old = d.habitLinks.find(link => link.habitId === id) || d.habitDrafts[id];
      d.habitDrafts[id] = { ...old, habitId: id, metric: $(`[data-goal-habit-metric="${CSS.escape(id)}"]`)?.value || 'totalCheckins', target: Number($(`[data-goal-habit-target="${CSS.escape(id)}"]`)?.value ?? old?.target ?? 1) };
    });
    if (habits.length) d.habitLinks = habits.filter(input => input.checked).map(input => d.habitDrafts[input.dataset.goalLinkHabit]);
    return d;
  }

  function saveGoalLinks(ctx) {
    const { getGoal, render, renderModal, captureGoalProgress, evaluateGoalProgressChanges, nowIso, putGoalHistory, saveState, closeModal, syncGoalLinks } = ctx;
    if (ctx.modalState?.type !== 'goal-links') return;
    const d = readGoalLinkDraft(ctx);
    if (d.habitLinks.some(link => !Number.isFinite(link.target) || link.target <= 0)) { ctx.modalState.error = tr('Enter a Habit target above zero.'); renderModal(); return; }
    if (ctx.modalState.previous) { Object.assign(ctx.modalState.previous.draft, { projectLinks: d.projectLinks, taskIds: d.taskIds, habitLinks: d.habitLinks }); closeModal(); return; }
    const goal = getGoal(ctx.modalState.goalId); if (!goal) return;
    const progressBefore = captureGoalProgress();
    const oldProjects = new Set((goal.projectLinks || []).map(link => link.projectId));
    const { projectLinks, taskIds, habitLinks } = d;
    syncGoalLinks(goal, projectLinks, taskIds, habitLinks); goal.updatedAt = nowIso();
    projectLinks.forEach(link => { if (!oldProjects.has(link.projectId)) putGoalHistory(goal.id, 'projectLinked', { projectId: link.projectId }); });
    oldProjects.forEach(projectId => { if (!projectLinks.some(link => link.projectId === projectId)) putGoalHistory(goal.id, 'projectUnlinked', { projectId }); });
    saveState(); closeModal(); render(); evaluateGoalProgressChanges(progressBefore);
  }

  function saveGoalReminders(ctx) {
    const { Core, $, getGoal, render, nowIso, saveState, closeModal } = ctx;
    if (ctx.modalState?.type !== 'goal-reminders') return;
    const goal = ctx.modalState.previous?.draft || getGoal(ctx.modalState.goalId); if (!goal) return;
    goal.reminders = { ...ctx.modalState.draft, sevenDaysBefore: Boolean($('#goal-reminder-7')?.checked), threeDaysBefore: Boolean($('#goal-reminder-3')?.checked), oneDayBefore: Boolean($('#goal-reminder-1')?.checked), onTargetDate: Boolean($('#goal-reminder-date')?.checked), time: Core.normalizeTime($('#goal-reminder-time')?.value) || '09:00' };
    if (ctx.modalState.previous) { closeModal(); return; }
    goal.updatedAt = nowIso(); saveState(); closeModal(); render();
  }

  function handleAction(action, event, ctx) {
    const { $, closeModal, render, renderModal, updateGoalStatus, saveAndRender } = ctx;
    if (action === 'read-goal-draft') { readGoalDraft(ctx); return true; }
    if (action === 'goal-property') { openGoalProperty(ctx, event.target.closest('[data-goal-property]')); return true; }
    const el = event?.target.closest('[data-action], [data-pop-action]');
    if (!el) return false;
    if (action === 'goals-group') { ctx.state.ui.goalGroup = el.dataset.view === 'date' ? 'date' : 'horizon'; saveAndRender(); }
    else if (action === 'goals-fold') { const key = { done: 'goalsDoneOpen', paused: 'goalsPausedOpen', archived: 'goalsArchivedOpen' }[el.dataset.fold]; if (key) { ctx.state.ui[key] = !ctx.state.ui[key]; saveAndRender(); } }
    else if (action === 'calendar-new-goal') ctx.openGoalModal(null, { targetDate: el.dataset.date });
    else if (action === 'new-goal') ctx.openGoalModal(null, { inbox: Boolean(event?.target?.closest?.('#mobile-quick-add-menu')) });
    else if (action === 'toggle-goal-more') { readGoalDraft(ctx); ctx.modalState.draft.moreOpen = !ctx.modalState.draft.moreOpen; renderModal(); requestAnimationFrame(() => $('[data-action="toggle-goal-more"]')?.focus()); }
    else if (action === 'draft-goal-links') openGoalLinksModal(ctx);
    else if (action === 'draft-goal-reminders') openGoalRemindersModal(ctx);
    else if (action === 'draft-goal-milestone') openMilestoneModal(ctx, null, el.dataset.milestoneId);
    else if (action === 'edit-goal-source') openGoalSourceModal(ctx, el.dataset.goalId);
    else if (action === 'save-goal-source') saveGoalSource(ctx);
    else if (action === 'save-goal-property') saveGoalProperty(ctx);
    else if (action === 'cancel-goal-property') cancelGoalProperty(ctx);
    else if (action === 'goal-status-menu') openGoalStatusMenu(ctx, el, el.dataset.goalId);
    else if (action === 'edit-goal') { if (el.dataset.popAction) ctx.closePopover(); ctx.openGoalModal(el.dataset.goalId); }
    else if (action === 'goal-menu') openGoalMenu(ctx, el, el.dataset.goalId);
    else if (action === 'save-goal') saveGoalModal(ctx);
    else if (action === 'save-goal-progress') saveGoalProgress(ctx, el.dataset.goalId);
    else if (action === 'pause-goal') updateGoalStatus(el.dataset.goalId, 'paused');
    else if (action === 'resume-goal' || action === 'restore-goal') updateGoalStatus(el.dataset.goalId, 'active');
    else if (action === 'complete-goal') updateGoalStatus(el.dataset.goalId, 'completed');
    else if (action === 'archive-goal') updateGoalStatus(el.dataset.goalId, 'archived');
    else if (action === 'keep-goal-active') { closeModal(); render(); }
    else if (action === 'open-goal-history') ctx.openGoalHistory(el.dataset.goalId, el);
    else if (action === 'edit-goal-links') openGoalLinksModal(ctx, el.dataset.goalId);
    else if (action === 'save-goal-links') saveGoalLinks(ctx);
    else if (action === 'new-milestone') openMilestoneModal(ctx, el.dataset.goalId);
    else if (action === 'edit-milestone') openMilestoneModal(ctx, el.dataset.goalId, el.dataset.milestoneId);
    else if (action === 'save-milestone') saveMilestoneModal(ctx);
    else if (action === 'toggle-milestone') toggleMilestone(ctx, el.dataset.goalId, el.dataset.milestoneId);
    else if (action === 'edit-goal-reminders') openGoalRemindersModal(ctx, el.dataset.goalId);
    else if (action === 'save-goal-reminders') saveGoalReminders(ctx);
    else if (action === 'area-new-goal') ctx.openGoalModal(null, { areaId: el.dataset.areaId });
    else return false;
    return true;
  }

  function handleInput(event, ctx) {
    const { $, renderModal } = ctx;
    const target = event.target;
    if (event.type === 'keydown') {
      const typing = target && (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]') || target.isContentEditable);
      if (ctx.goalPropertyEditor && !ctx.modalState && !ctx.popoverEl && (event.key === 'Escape' || (event.key === 'Enter' && typing && !event.isComposing))) {
        event.preventDefault();
        if (event.key === 'Escape') cancelGoalProperty(ctx); else saveGoalProperty(ctx);
        return true;
      }
      return false;
    }
    if (!['input', 'change'].includes(event.type)) return false;
    if (event.type === 'change' && ctx.modalState?.type === 'goal-history' && target.id === 'goal-history-range') {
      ctx.modalState.historyRange = target.value === 'month' ? 'month' : 'week';
      renderModal(); return true;
    }
    if (ctx.goalPropertyEditor && target.id === 'goal-detail-' + ctx.goalPropertyEditor.field) {
      ctx.goalPropertyEditor.value = target.value; return true;
    }
    if (['goal', 'goal-source'].includes(ctx.modalState?.type) && target.id.startsWith('goal-')) {
      readGoalDraft(ctx);
      if (event.type === 'change' && ['goal-progress-mode','goal-progress-type'].includes(target.id)) {
        const id = target.id; renderModal(); requestAnimationFrame(() => $('#' + id)?.focus());
      }
      return true;
    }
    if (event.type === 'change' && ctx.modalState?.type === 'goal-links' && target.matches('[data-goal-project-mode]')) {
      const projectId = target.dataset.goalProjectMode; readGoalLinkDraft(ctx); renderModal();
      requestAnimationFrame(() => $(`[data-goal-project-mode="${CSS.escape(projectId)}"]`)?.focus());
      return true;
    }
    return false;
  }

  window.TodoDomainModules.register({
    name: 'goals',
    renderRoute(route, ctx) {
      if (route.type === 'goals') return renderGoals(ctx);
      if (route.type === 'goal') return renderGoal(ctx, route.id);
      if (route.type === 'goal-row') return renderGoalRow(ctx, route.goal);
      if (route.type !== 'modal') return false;
      const renderers = { goal: renderGoalModal, 'goal-source': renderGoalSourceModal, milestone: renderMilestoneModal, 'goal-links': renderGoalLinksModal, 'goal-reminders': renderGoalRemindersModal, 'goal-reached': renderGoalReachedModal, 'goal-history': renderGoalHistoryModal };
      return renderers[route.modalType]?.(ctx);
    },
    handleAction,
    handleInput
  });
})();
