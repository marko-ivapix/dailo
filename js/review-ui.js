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

  function step(number, title, count, body, done = false) {
    const mark = done ? '<i class="ph ph-check"></i>' : number;
    const countHtml = done || count === null ? '' : `<span class="section-count">${count}</span>`;
    return `<section class="section review-step${done ? ' is-done' : ''}" data-weekly-review-step="${number}"><div class="section-header"><h2 class="section-label"><span class="weekly-review-number" aria-hidden="true">${mark}</span>${title}${done ? `<span class="review-step-done"> · ${tr('done')}</span>` : ''}</h2>${countHtml}</div>${done ? '' : body}</section>`;
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

  function renderReview(ctx) {
    const { state, Core, esc } = ctx;
    const today = Core.dateOnly();
    const weekStartsOn = state.settings?.weekStartsOn;
    const review = Core.deriveWeeklyReview(state, today, weekStartsOn);
    const log = Core.weeklyReviewLog(state.settings);
    const doneThisWeek = log.find(entry => entry.weekStart === review.weekStart);
    const completedDate = entry => ctx.formatDate(Core.dateOnly(new Date(entry.completedAt)));
    let html = ctx.pageHeader(tr('Weekly review'), tr('Week of {date}', { date: ctx.formatDate(review.weekStart) }), { add: false });
    html += `<div class="weekly-review">${lastSevenDays(ctx)}${weekJournal(ctx, review.weekStart)}`;

    html += step(1, tr('Empty the Inbox'), review.inbox.length, card(review.inbox.map(task => ctx.reviewTaskRow(task, 'inbox', { inbox: true })).join('')), !review.inbox.length);
    const late = [...review.overdue, ...review.missedPlans];
    html += step(2, tr('Overdue and missed plans'), late.length, card(late.map(task => ctx.reviewTaskRow(task, 'today', { overdue: true })).join('')), !late.length);

    // Step 3 shows only what is on a day; a row opens that day in the Calendar (Predstojeće moved there, C9).
    const days = review.nextDays.map(day => {
      const parts = [day.planned ? trn(day.planned, '{count} planned', '{count} planned') : '', day.due ? trn(day.due, '{count} due', '{count} due') : ''].filter(Boolean);
      return `<button class="review-day-row" type="button" data-action="review-open-day" data-date="${day.date}"><span>${esc(ctx.formatDate(day.date, 'full'))}</span>${parts.length ? `<span class="review-day-busy">${esc(parts.join(' · '))}</span>` : `<span class="review-day-free">${tr('Free')}</span>`}</button>`;
    }).join('');
    html += step(3, tr('Next 7 days'), null, card(days));

    html += step(4, tr('Goals'), review.goals.length, review.goals.length ? card(review.goals.map(({ goal }) => ctx.renderGoalListRow(goal)).join('')) : empty(tr('No active goals.')));
    html += step(5, tr('Habits'), review.habits.length, review.habits.length ? card(review.habits.map(habit => {
      const metrics = ctx.habitMetrics(habit) || {};
      return row(ctx, `habit/${habit.id}`, habit.name || tr('Untitled'), tr('streak {count} · {percent}%', { count: Number(metrics.currentStreak) || 0, percent: Math.round(Number(metrics.completionRate) || 0) }));
    }).join('')) : empty(tr('No active habits.')));
    html += step(6, tr('Areas'), review.areas.length, review.areas.length ? card(review.areas.map(({ area, open }) => row(ctx, `area/${area.id}`, area.name || tr('Untitled'), trn(open, '{count} open task', '{count} open tasks'))).join('')) : empty(tr('No Areas yet.')));

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
