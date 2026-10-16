(function () {
  'use strict';

  // Weekly review page (V1.11, route #review): one guided pass over everything that drifts during a week.
  // Redesign R13 (S5, J8): "Poslednjih 7 dana" and "Dnevnik ove nedelje" on top, the six steps in cards, and the
  // first two steps fold into "· gotovo" when they are empty.
  const I18n = window.TodoI18n;
  const { tr, trn, msg } = I18n;
  const WEEKDAYS = [msg('Sun'), msg('Mon'), msg('Tue'), msg('Wed'), msg('Thu'), msg('Fri'), msg('Sat')];
  const MOODS = [['😞', msg('Bad')], ['🙁', msg('Poor')], ['😐', msg('Okay')], ['🙂', msg('Good')], ['😄', msg('Great')]];
  let selectedDay = null;

  // R96: a step can be skipped for this week (`skips` holds this week's keys): it folds with "· preskočeno" and "Prikaži".
  const REVIEW_STEPS = ['inbox', 'late', 'days', 'projects', 'overview', 'priorities'];
  function step(number, title, count, body, done = false, key = '', skips = []) {
    const skipped = !done && Boolean(key) && skips.includes(key);
    const mark = done ? '<i class="ph ph-check"></i>' : number;
    const countHtml = done || skipped || count === null ? '' : `<span class="section-count">${count}</span>`;
    const note = done ? `<span class="review-step-done"> · ${tr('done')}</span>` : skipped ? `<span class="review-step-done"> · ${tr('skipped')}</span>` : '';
    const show = skipped ? `<button class="btn btn-ghost review-unskip" type="button" data-action="review-unskip" data-step="${key}">${tr('Show')}</button>` : '';
    const skip = key && !done && !skipped ? `<button class="btn btn-ghost review-skip" type="button" data-action="review-skip" data-step="${key}">${tr('Skip this step')}</button>` : '';
    return `<section class="section review-step${done ? ' is-done' : ''}${skipped ? ' is-skipped' : ''}" data-weekly-review-step="${number}"><div class="section-header"><h2 class="section-label"><span class="weekly-review-number" aria-hidden="true">${mark}</span>${title}${note}</h2>${show}${countHtml}</div>${done || skipped ? '' : body + skip}</section>`;
  }
  const empty = text => `<p class="area-empty-copy">${text}</p>`;
  const card = rows => `<div class="today-card">${rows}</div>`;
  const row = (ctx, route, title, meta) => `<button class="review-row" type="button" data-route="${ctx.esc(route)}"><span>${ctx.esc(title)}</span><span class="review-row-meta">${ctx.esc(meta)}</span></button>`;

  function lastSevenDays(ctx) {
    const { state, Core, esc, formatDate } = ctx;
    const today = Core.dateOnly();
    const stats = Core.weeklyReviewStats(state, Object.values(state.habitLogCache || {}).flat(), today, state.settings?.weekStartsOn);
    const selected = stats.days.some(day => day.date === selectedDay) ? selectedDay : today;
    const max = Math.max(1, ...stats.days.map(day => day.completed));
    const completedLabel = count => trn(count, '{count} completed', '{count} completed');
    const columns = stats.days.map(day => {
      const on = day.date === selected;
      return `<button class="review-column${on ? ' is-selected' : ''}" type="button" data-action="review-day-bar" data-date="${day.date}" aria-pressed="${on}" aria-label="${esc(`${formatDate(day.date, 'full')}: ${completedLabel(day.completed)}`)}"><span class="review-column-value">${on ? day.completed : ''}</span><span class="review-column-fill" style="height:${Math.round(day.completed / max * 100)}%"></span><span class="review-column-day">${tr(WEEKDAYS[Core.parseDateOnly(day.date).getDay()])}</span></button>`;
    }).join('');
    const count = stats.days.find(day => day.date === selected).completed;
    const diff = stats.total - stats.previousTotal;
    const change = diff > 0 ? tr('▲ {count} against the previous 7', { count: diff }) : diff < 0 ? tr('▼ {count} against the previous 7', { count: -diff }) : tr('the same as the previous 7');
    const tile = (value, label, note) => `<div class="review-tile"><strong>${esc(value)}</strong><span>${label}</span><small>${note}</small></div>`;
    return `<h2 class="review-card-title">${tr('Last 7 days')}</h2><div class="today-card review-chart-card"><div class="review-chart" role="group" aria-label="${tr('Completed tasks per day')}"><p class="review-chart-title">${tr('Completed tasks per day')}</p><div class="review-columns">${columns}</div></div><p class="review-chart-caption">${esc(`${formatDate(selected, 'full')} · ${completedLabel(count)}`)}</p><div class="review-tiles">${tile(stats.total, tr('Completed'), esc(change))}${tile(stats.added, tr('Arrived'), tr('new tasks'))}${tile(stats.habitsPercent === null ? '–' : `${stats.habitsPercent}%`, tr('Habits'), tr('done this week'))}</div></div>`;
  }

  // J8: the week's journal — a face for a mood, ✎ for an entry without one, · for none; a tap opens the day.
  function weekJournal(ctx, weekStart) {
    // R26: a locked journal keeps its week out of the review until it is opened.
    if (ctx.journalLock?.enabled() && !ctx.journalLock.unlocked()) return '';
    const { Core, esc, formatDate } = ctx;
    const today = Core.dateOnly();
    const days = Array.from({ length: 7 }, (_, index) => Core.addDays(weekStart, index)).map(date => {
      const item = Core.journalEntryFor(ctx.state, date), mood = item?.mood ? MOODS[item.mood - 1] : null;
      const mark = mood ? mood[0] : item && (item.text || '').trim() ? '✎' : '·';
      const label = mood ? tr(mood[1]).toLocaleLowerCase() : mark === '✎' ? tr('an entry without a mood') : tr('no entry');
      return `<button class="review-journal-day" type="button" data-action="open-journal" data-date="${date}"${date > today ? ' disabled' : ''} aria-label="${esc(`${formatDate(date, 'full')}: ${label}`)}"><span class="review-journal-mark" aria-hidden="true">${mark}</span><small>${tr(WEEKDAYS[Core.parseDateOnly(date).getDay()])}</small></button>`;
    }).join('');
    return `<h2 class="review-card-title">${tr("This week's journal")}</h2><div class="today-card review-journal">${days}</div>`;
  }

  // R96: the review starts with what went well in the last 7 days: tasks completed, goals reached, week-long streaks.
  function wins(ctx) {
    const { state, Core, esc } = ctx;
    const found = Core.weeklyWins(state, Core.dateOnly());
    const lines = [];
    if (found.tasks.length) {
      const titles = found.tasks.slice(0, 3).map(task => task.title || tr('Untitled')).join(', ') + (found.tasks.length > 3 ? ` +${found.tasks.length - 3}` : '');
      lines.push(['ph-check-circle', trn(found.tasks.length, '{count} task completed in the last 7 days: {titles}', '{count} tasks completed in the last 7 days: {titles}', { titles })]);
    }
    for (const goal of found.goals) lines.push(['ph-target', tr('Goal reached: {goal}', { goal: goal.title || tr('Untitled') })]);
    for (const habit of (state.habits || []).filter(item => item && item.status === 'active' && item.frequencyType !== 'timesPerWeek')) {
      const streak = Number(ctx.habitMetrics(habit)?.currentStreak) || 0;
      if (streak >= 7) lines.push(['ph-flame', `${habit.name}: ${trn(streak, 'streak {count} day', 'streak {count} days')}`]);
    }
    const body = lines.length ? lines.map(([icon, text]) => `<p class="review-win"><i class="ph ${icon}" aria-hidden="true"></i>${esc(text)}</p>`).join('') : `<p class="review-win">${tr('Nothing completed in the last 7 days yet.')}</p>`;
    return `<h2 class="review-card-title">${tr('Wins')}</h2><div class="today-card review-wins">${body}</div>`;
  }

  function renderReview(ctx) {
    const { state, Core, esc } = ctx;
    const today = Core.dateOnly();
    const weekStartsOn = state.settings?.weekStartsOn;
    const review = Core.deriveWeeklyReview(state, today, weekStartsOn);
    const log = Core.weeklyReviewLog(state.settings);
    const doneThisWeek = log.find(entry => entry.weekStart === review.weekStart);
    const completedDate = entry => ctx.formatDate(Core.dateOnly(new Date(entry.completedAt)));
    // R96: how long it takes; then the wins before the first step.
    let html = ctx.pageHeader(tr('Weekly review'), `${tr('Week of {date}', { date: ctx.formatDate(review.weekStart) })} · ${tr('about 10 minutes')}`, { add: false });
    html += `<div class="weekly-review">${lastSevenDays(ctx)}${weekJournal(ctx, review.weekStart)}${wins(ctx)}`;
    const ui = state.ui || {};
    const skips = ui.reviewSkipped?.week === review.weekStart && Array.isArray(ui.reviewSkipped.steps) ? ui.reviewSkipped.steps : [];

    html += step(1, tr('Empty the Inbox'), review.inbox.length, card(review.inbox.map(task => ctx.reviewTaskRow(task, 'inbox', { today: true, inbox: true })).join('')), !review.inbox.length, 'inbox', skips);
    const late = [...review.overdue, ...review.missedPlans];
    html += step(2, tr('Overdue and missed plans'), late.length, card(late.map(task => ctx.reviewTaskRow(task, 'today', { today: true, addToday: true })).join('')), !late.length, 'late', skips);

    // Step 3 shows only what is on a day; a row opens that day in the Calendar (Predstojeće moved there, C9).
    const days = review.nextDays.map(day => {
      const parts = [day.planned ? trn(day.planned, '{count} planned', '{count} planned') : '', day.due ? trn(day.due, '{count} due', '{count} due') : ''].filter(Boolean);
      return `<button class="review-day-row" type="button" data-action="review-open-day" data-date="${day.date}"><span>${esc(ctx.formatDate(day.date, 'full'))}</span>${parts.length ? `<span class="review-day-busy">${esc(parts.join(' · '))}</span>` : `<span class="review-day-free">${tr('Free')}</span>`}</button>`;
    }).join('');
    html += step(3, tr('Next 7 days'), null, card(days), false, 'days', skips);

    // R94: each active project needs a next step; those on hold and for someday get a look too.
    const missing = review.projects.missingNext;
    const resting = review.projects.onHold.length + review.projects.someday.length;
    const restingText = [review.projects.onHold.length ? tr('On hold: {count}', { count: review.projects.onHold.length }) : '', review.projects.someday.length ? tr('Someday: {count}', { count: review.projects.someday.length }) : ''].filter(Boolean).join(' · ');
    const restingLine = resting ? `<p class="review-projects-line">${esc(restingText)}<button class="btn btn-ghost" type="button" data-action="review-projects">${tr('Look through them')}</button></p>` : '';
    html += step(4, tr('Projects'), missing.length, `${missing.length ? card(missing.map(item => row(ctx, `project/${item.id}`, item.name || tr('Untitled'), tr('No next step'))).join('')) : empty(tr('Every active project has a next step.'))}${restingLine}`, !missing.length && !resting, 'projects', skips);

    // R96: goals, habits and areas are one look, so the review has six steps.
    const sub = (title, body) => `<h3 class="review-subtitle">${title}</h3>${body}`;
    const goals = review.goals.length ? card(review.goals.map(({ goal }) => ctx.renderGoalListRow(goal)).join('')) : empty(tr('No active goals.'));
    const habits = review.habits.length ? card(review.habits.map(habit => {
      const metrics = ctx.habitMetrics(habit) || {};
      return row(ctx, `habit/${habit.id}`, habit.name || tr('Untitled'), tr('streak {count} · {percent}%', { count: Number(metrics.currentStreak) || 0, percent: Math.round(Number(metrics.completionRate) || 0) }));
    }).join('')) : empty(tr('No active habits.'));
    const areas = review.areas.length ? card(review.areas.map(({ area, open }) => row(ctx, `area/${area.id}`, area.name || tr('Untitled'), trn(open, '{count} open task', '{count} open tasks'))).join('')) : empty(tr('No Areas yet.'));
    html += step(5, tr('Goals, habits and areas'), null, sub(tr('Goals'), goals) + sub(tr('Habits'), habits) + sub(tr('Areas'), areas), false, 'overview', skips);

    // R96: up to three priorities for the coming week (settings.focusTaskIds); they lead Danas and Fokus starts with them.
    const chosenIds = Core.selectFocusTasks(state.tasks, state.settings?.focusTaskIds);
    const chosen = chosenIds.map(id => ctx.getTask(id)).filter(Boolean);
    const candidates = chosen.length < 3 ? Core.priorityCandidates(state, today, chosenIds) : [];
    const placeOf = item => (state.projects || []).find(project => project.id === item.projectId)?.name || '';
    const priorityRow = (item, chip) => `<div class="review-priority"><button class="review-row" type="button" data-action="open-task" data-task-id="${esc(item.id)}"><span>${esc(item.title || tr('Untitled'))}</span>${placeOf(item) ? `<span class="review-row-meta">${esc(placeOf(item))}</span>` : ''}</button>${chip}</div>`;
    const removeChip = item => `<button class="quick-chip" type="button" data-action="review-priority-remove" data-task-id="${esc(item.id)}" aria-label="${esc(tr('Remove from priorities: {task}', { task: item.title || tr('Untitled') }))}">✕</button>`;
    const addChip = item => `<button class="quick-chip" type="button" data-action="review-priority-add" data-task-id="${esc(item.id)}" aria-label="${esc(tr('Add to priorities: {task}', { task: item.title || tr('Untitled') }))}">+</button>`;
    const prioritiesBody = `<p class="tasks-note">${tr('Pick up to three tasks for next week. They stay at the top of Today and Focus starts with them.')}</p>${chosen.length ? card(chosen.map(item => priorityRow(item, removeChip(item))).join('')) : ''}${candidates.length ? sub(tr('Suggestions'), card(candidates.map(item => priorityRow(item, addChip(item))).join(''))) : ''}`;
    html += step(6, tr('Priorities for next week'), `${chosen.length}/3`, prioritiesBody, false, 'priorities', skips);

    const history = log.filter(entry => entry !== doneThisWeek).slice(0, 4);
    const historyHtml = history.length ? `<p class="weekly-review-history">${tr('Recent reviews:')} ${history.map(entry => esc(completedDate(entry))).join(', ')}</p>` : '';
    html += doneThisWeek
      ? `<section class="weekly-review-finish" data-weekly-review-done><i class="ph ph-check-circle" aria-hidden="true"></i><p>${esc(tr("This week's review was completed {date}.", { date: completedDate(doneThisWeek) }))}</p>${historyHtml}</section>`
      : `<section class="weekly-review-finish"><button class="btn btn-primary habit-window-save" type="button" data-action="complete-weekly-review"><i class="ph ph-check"></i> ${tr('Finish weekly review')}</button>${historyHtml}</section>`;
    return `${html}</div>`;
  }

  window.TodoDomainModules?.register({
    name: 'review',
    renderRoute(route, ctx) {
      return route?.type === 'review' ? renderReview(ctx) : undefined;
    },
    handleAction(action, event, ctx) {
      const el = event?.target?.closest?.('[data-action]');
      if (action === 'review-day-bar') { selectedDay = el?.dataset?.date || null; ctx.render(); return true; }
      if (action === 'review-projects') { ctx.state.ui.tasksView = 'projects'; ctx.saveState(); ctx.navigate('tasks'); return true; }
      // R96: this week's skipped steps live in ui (this device); a new week starts with none.
      if (action === 'review-skip' || action === 'review-unskip') {
        const key = String(el?.dataset?.step || '');
        if (!REVIEW_STEPS.includes(key)) return true;
        const ui = ctx.state.ui || (ctx.state.ui = {});
        const week = ctx.Core.weekStartFor(ctx.Core.dateOnly(), ctx.state.settings?.weekStartsOn);
        const current = ui.reviewSkipped?.week === week && Array.isArray(ui.reviewSkipped.steps) ? ui.reviewSkipped.steps : [];
        ui.reviewSkipped = { week, steps: action === 'review-skip' ? [...new Set([...current, key])] : current.filter(item => item !== key) };
        ctx.saveState(); ctx.render(); return true;
      }
      // R96: the priorities are settings.focusTaskIds, three open tasks at most.
      if (action === 'review-priority-add' || action === 'review-priority-remove') {
        const settings = ctx.state.settings || (ctx.state.settings = {});
        const ids = ctx.Core.selectFocusTasks(ctx.state.tasks, settings.focusTaskIds);
        const id = el?.dataset?.taskId;
        settings.focusTaskIds = action === 'review-priority-add' ? (id && ids.length < 3 && !ids.includes(id) ? [...ids, id] : ids) : ids.filter(item => item !== id);
        ctx.saveState(); ctx.render(); return true;
      }
      if (action === 'review-open-day') {
        const date = el?.dataset?.date;
        if (!ctx.Core.parseDateOnly(date)) return true;
        Object.assign(ctx.state.ui || (ctx.state.ui = {}), { calendarDate: date, calendarView: 'week' });
        ctx.saveState(); ctx.navigate('calendar');
        return true;
      }
      return false;
    },
  });
})();
