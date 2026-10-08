(function () {
  'use strict';

  // Weekly review page (V1.11, route #review): one guided pass over everything that drifts during a week.
  const I18n = window.TodoI18n;
  const { tr, trn, msg } = I18n;

  const HEALTH_LABELS = { 'on-track': msg('On track'), 'at-risk': msg('At risk'), overdue: msg('Overdue'), complete: msg('Achieved') };

  function section(number, title, count, body) {
    const countHtml = count === null ? '' : `<span class="section-count">${count}</span>`;
    return `<section class="section" data-weekly-review-step="${number}"><div class="section-header"><h2 class="section-label"><span class="weekly-review-number">${number}</span>${title}</h2>${countHtml}</div>${body}</section>`;
  }

  const empty = text => `<p class="area-empty-copy">${text}</p>`;
  const link = (ctx, route, title, meta) => `<button class="area-object weekly-review-link" type="button" data-route="${ctx.esc(route)}"><strong>${ctx.esc(title)}</strong><span>${meta}</span></button>`;

  function renderReview(ctx) {
    const { state, Core, esc } = ctx;
    const today = Core.dateOnly();
    const weekStartsOn = state.settings?.weekStartsOn;
    const review = Core.deriveWeeklyReview(state, today, weekStartsOn);
    const log = Core.weeklyReviewLog(state.settings);
    const doneThisWeek = log.find(entry => entry.weekStart === review.weekStart);
    const completedDate = entry => ctx.formatDate(Core.dateOnly(new Date(entry.completedAt)));
    let html = ctx.pageHeader(tr('Weekly review'), tr('Week of {date}', { date: ctx.formatDate(review.weekStart) }), { add: false });
    html += '<div class="weekly-review">';

    html += section(1, tr('Empty the Inbox'), review.inbox.length, review.inbox.length
      ? `<div class="task-list">${review.inbox.map(task => ctx.reviewTaskRow(task, 'inbox', { inbox: true })).join('')}</div>`
      : empty(tr('The Inbox is empty.')));

    const late = [...review.overdue, ...review.missedPlans];
    html += section(2, tr('Overdue and missed plans'), late.length, late.length
      ? `<div class="task-list">${late.map(task => ctx.reviewTaskRow(task, 'today', { overdue: true })).join('')}</div>`
      : empty(tr('Nothing overdue or missed.')));

    const busy = review.nextDays.some(day => day.planned || day.due);
    const days = review.nextDays.map(day => `<li class="weekly-review-day"><span>${esc(ctx.relativeDateLabel(day.date))}</span><span>${esc(trn(day.planned, '{count} planned', '{count} planned'))} · ${esc(trn(day.due, '{count} due', '{count} due'))}</span></li>`).join('');
    html += section(3, tr('Next 7 days'), null, `${busy ? `<ul class="weekly-review-days">${days}</ul>` : empty(tr('Nothing planned in the next 7 days.'))}<button class="btn btn-secondary" type="button" data-route="upcoming">${tr('Open Upcoming')}</button>`);

    html += section(4, tr('Goals'), review.goals.length, review.goals.length
      ? `<div class="area-object-list">${review.goals.map(({ goal, health }) => link(ctx, `goal/${goal.id}`, goal.title || tr('Untitled'), `${esc(ctx.goalProgressLabel(goal))} · ${esc(tr(HEALTH_LABELS[health] || HEALTH_LABELS['on-track']))}`)).join('')}</div>`
      : empty(tr('No active goals.')));

    html += section(5, tr('Habits'), review.habits.length, review.habits.length
      ? `<div class="area-object-list">${review.habits.map(habit => {
        const metrics = ctx.habitMetrics(habit) || {};
        return link(ctx, `habit/${habit.id}`, habit.name || tr('Untitled'), `${esc(tr('Streak'))}: ${esc(Number(metrics.currentStreak) || 0)} · ${esc(Math.round(Number(metrics.completionRate) || 0))}%`);
      }).join('')}</div>`
      : empty(tr('No active habits.')));

    html += section(6, tr('Areas'), review.areas.length, review.areas.length
      ? `<div class="area-object-list">${review.areas.map(({ area, open }) => link(ctx, `area/${area.id}`, area.name || tr('Untitled'), esc(trn(open, '{count} open task', '{count} open tasks')))).join('')}</div>`
      : empty(tr('No Areas yet.')));

    const history = log.filter(entry => entry !== doneThisWeek).slice(0, 4);
    const historyHtml = history.length ? `<p class="weekly-review-history">${tr('Recent reviews:')} ${history.map(entry => esc(completedDate(entry))).join(', ')}</p>` : '';
    html += doneThisWeek
      ? `<section class="weekly-review-finish" data-weekly-review-done><i class="ph ph-check-circle" aria-hidden="true"></i><p>${esc(tr("This week's review was completed {date}.", { date: completedDate(doneThisWeek) }))}</p>${historyHtml}</section>`
      : `<section class="weekly-review-finish"><button class="btn btn-primary" type="button" data-action="complete-weekly-review"><i class="ph ph-check"></i> ${tr('Finish weekly review')}</button>${historyHtml}</section>`;
    return `${html}</div>`;
  }

  window.TodoDomainModules?.register({
    name: 'review',
    renderRoute(route, ctx) {
      return route?.type === 'review' ? renderReview(ctx) : undefined;
    },
  });
})();
