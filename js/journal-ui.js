(function () {
  'use strict';
  const { tr, trn, msg } = window.TodoI18n;

  // Redesign R12b (J1–J3, J5, J7, J9): Dnevnik — one entry per day with an optional mood and free text. The entry
  // is created by its first word or face; global Search does not include it, the screen has its own search.
  const MOODS = [['😞', msg('Bad')], ['🙁', msg('Poor')], ['😐', msg('Okay')], ['🙂', msg('Good')], ['😄', msg('Great')]];
  const WEEKDAYS = [msg('Sun'), msg('Mon'), msg('Tue'), msg('Wed'), msg('Thu'), msg('Fri'), msg('Sat')];
  let query = '';

  const plainText = value => String(value || '').toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  const cap = text => text.charAt(0).toLocaleUpperCase() + text.slice(1);
  const entryFor = (ctx, date) => ctx.Core.journalEntryFor(ctx.state, date);
  const moodOf = item => (item?.mood ? MOODS[item.mood - 1] : null);

  function ensureEntry(ctx, date) {
    let item = entryFor(ctx, date);
    if (!item) {
      const now = ctx.nowIso();
      item = { id: ctx.Core.journalEntryId(date), date, text: '', mood: null, createdAt: now, updatedAt: now };
      (ctx.state.journal ||= []).push(item);
    }
    return item;
  }

  function listHtml(ctx) {
    const { esc, formatDate } = ctx;
    const q = plainText(query.trim());
    const items = (ctx.state.journal || []).filter(item => item.text || item.mood).filter(item => !q || plainText(item.text).includes(q)).sort((a, b) => b.date.localeCompare(a.date));
    if (!items.length) return q ? `<div class="empty-state"><h3>${tr('No entries with those words')}</h3><p>${tr('The search looks only at the journal text.')}</p></div>` : `<div class="empty-state"><h3>${tr('The journal is empty')}</h3><p>${tr('A tap on a day or “+” opens that day’s entry.')}</p></div>`;
    return `<div class="today-card journal-list">${items.map(item => {
      const mood = moodOf(item);
      return `<button class="journal-row" type="button" data-action="open-journal" data-date="${esc(item.date)}"><span class="journal-row-head"><strong>${esc(formatDate(item.date, 'full'))}</strong>${mood ? `<span class="journal-row-mood" role="img" aria-label="${tr(mood[1])}">${mood[0]}</span>` : ''}</span><span class="journal-row-text">${item.text ? esc(item.text) : `<i>${tr('No text')}</i>`}</span></button>`;
    }).join('')}</div>`;
  }

  function renderList(ctx) {
    const { state, esc, Core, pageHeader, formatDate } = ctx;
    const today = Core.dateOnly(), current = today.slice(0, 7);
    const ui = state.ui || (state.ui = {});
    const month = /^\d{4}-\d{2}$/.test(ui.journalMonth || '') && ui.journalMonth <= current ? ui.journalMonth : current;
    const [year, monthNumber] = month.split('-').map(Number);
    const title = cap(new Intl.DateTimeFormat(window.TodoI18n.locale(), { month: 'long', year: 'numeric' }).format(new Date(year, monthNumber - 1, 1, 12)));
    const count = new Date(year, monthNumber, 0).getDate();
    const days = Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`).map(date => {
      const item = entryFor(ctx, date), mood = moodOf(item), future = date > today;
      const label = `${formatDate(date, 'full')}${item ? `, ${tr('has an entry')}${mood ? `, ${tr(mood[1]).toLocaleLowerCase()}` : ''}` : ''}`;
      const mark = item ? (mood ? `<span class="journal-day-mood" aria-hidden="true">${mood[0]}</span>` : '<span class="journal-day-dot" aria-hidden="true"></span>') : '';
      return `<button class="journal-day${date === today ? ' is-today' : ''}${item ? ' has-entry' : ''}" type="button" data-action="open-journal" data-date="${date}"${future ? ' disabled' : ''} aria-label="${esc(label)}"><span class="journal-day-name">${tr(WEEKDAYS[Core.parseDateOnly(date).getDay()])}</span><strong>${Number(date.slice(8))}</strong>${mark}</button>`;
    }).join('');
    const total = (state.journal || []).length;
    return pageHeader(tr('Journal'), trn(total, '{count} entry', '{count} entries'), { add: false })
      + `<div class="journal-month"><strong class="journal-month-title">${esc(title)}</strong><span class="journal-month-arrows"><button class="btn-icon" type="button" data-action="journal-month" data-step="-1" aria-label="${tr('Previous month')}"><i class="ph ph-caret-left"></i></button><button class="btn-icon" type="button" data-action="journal-month" data-step="1"${month >= current ? ' disabled' : ''} aria-label="${tr('Next month')}"><i class="ph ph-caret-right"></i></button></span></div>`
      + `<div class="journal-strip">${days}</div>`
      + `<label class="search-box journal-search"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><input id="journal-query" class="search-input" type="search" autocomplete="off" placeholder="${tr('Search the journal')}" value="${esc(query)}" aria-label="${tr('Search the journal')}"></label>`
      + `<div id="journal-list">${listHtml(ctx)}</div>`;
  }

  function summaryText(ctx, date) {
    const summary = ctx.Core.journalDaySummary(ctx.state, Object.values(ctx.state.habitLogCache || {}).flat(), date);
    const parts = [trn(summary.completed, 'Completed {count} task', 'Completed {count} tasks')];
    if (summary.habitsDue) parts.push(tr('habits {done}/{due}', { done: summary.habitsDone, due: summary.habitsDue }));
    return parts.join(' · ');
  }

  function renderEntry(ctx) {
    const { esc, formatDate, modalFrame, modalState } = ctx;
    const date = modalState.date, item = entryFor(ctx, date);
    const moods = MOODS.map(([face, name], index) => { const on = item?.mood === index + 1; return `<button class="journal-mood${on ? ' is-selected' : ''}" type="button" data-action="journal-mood" data-value="${index + 1}" aria-pressed="${on}"><span aria-hidden="true">${face}</span><small>${tr(name)}</small></button>`; }).join('');
    return modalFrame(`<div class="modal-inner quick-sheet journal-window"><div class="modal-header task-window-header"><span class="task-window-kind">${tr('Journal')}</span><div class="task-window-actions"><button class="btn-icon" type="button" data-action="journal-menu" aria-label="${tr('Entry actions')}"><i class="ph ph-dots-three"></i></button><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div></div><h2 class="journal-date">${esc(formatDate(date, 'full'))}</h2><p class="journal-summary">${esc(summaryText(ctx, date))}</p><h3 class="sheet-group-title">${tr('Mood')}</h3><div class="journal-moods" role="group" aria-label="${tr('Mood')}">${moods}</div><textarea id="journal-text" class="input journal-text" rows="10" placeholder="${tr('How did the day go? What was good? What tomorrow?')}" aria-label="${tr('Entry')}">${esc(item?.text || '')}</textarea><button class="quick-chip journal-task" type="button" data-action="journal-task-tomorrow">+ ${tr('Task for tomorrow')}</button><p class="sheet-note">${tr('Selected text or a “Tomorrow: …” line becomes the task title. It saves while you type. The journal is not in Search, only in its own search on the Journal screen.')}</p></div>`, 'quick');
  }

  function openEntry(ctx, date) {
    ctx.setModalState({ type: 'journal', date: date || ctx.Core.dateOnly() });
    ctx.renderModal();
    requestAnimationFrame(() => ctx.$('#journal-text')?.focus());
  }

  // An entry emptied of text and mood leaves when the window closes; the screen behind shows the changes.
  function closing(ctx) {
    const item = ctx.modalState?.type === 'journal' ? entryFor(ctx, ctx.modalState.date) : null;
    if (item && !item.text.trim() && !item.mood) {
      ctx.state.journal.splice(ctx.state.journal.indexOf(item), 1);
      ctx.saveState();
    }
    ctx.render();
  }

  function deleteEntry(ctx) {
    const date = ctx.modalState?.date, item = date ? entryFor(ctx, date) : null;
    ctx.closePopover();
    if (!item) return;
    const back = () => { ctx.setModalState({ type: 'journal', date }); ctx.renderModal(); };
    ctx.openConfirm({ title: msg('Delete this entry?'), message: msg('The entry and its mood are removed.'), confirmLabel: msg('Delete entry'), onCancel: back, onConfirm: () => {
      const index = ctx.state.journal.indexOf(item);
      if (index >= 0) ctx.state.journal.splice(index, 1);
      ctx.saveState(); ctx.setModalState(null); ctx.renderModal(); ctx.render();
      ctx.setUndo(msg('Entry deleted'), () => {
        if (entryFor(ctx, date)) return;
        ctx.state.journal.splice(Math.min(index, ctx.state.journal.length), 0, item);
        ctx.saveState(); ctx.render();
      });
    } });
  }

  // J9: Quick Add for the day after the entry (never before today), titled from the selection or a "Sutra:" line.
  function taskForTomorrow(ctx) {
    const date = ctx.modalState.date, field = ctx.$('#journal-text');
    const text = field ? field.value : entryFor(ctx, date)?.text || '';
    const selected = field ? text.slice(field.selectionStart, field.selectionEnd).trim() : '';
    const line = text.split('\n').find(row => /^\s*(sutra|tomorrow)\s*:/i.test(row));
    const title = selected || (line ? line.replace(/^\s*(sutra|tomorrow)\s*:\s*/i, '').trim() : '');
    const next = ctx.Core.addDays(date, 1), today = ctx.Core.dateOnly();
    ctx.openQuickAdd({ plannedDate: next < today ? today : next, title, returnTo: { type: 'journal', date } });
  }

  window.TodoDomainModules?.register({
    name: 'journal',
    renderRoute(route, ctx) {
      if (route.type === 'journal') return renderList(ctx);
      if (route.type === 'modal' && route.modalType === 'journal') return renderEntry(ctx);
    },
    handleAction(action, event, ctx) {
      if (action === 'journal-closing') { closing(ctx); return true; }
      const el = event?.target?.closest?.('[data-action], [data-pop-action]');
      if (action === 'open-journal') { openEntry(ctx, el?.dataset?.date); return true; }
      if (action === 'journal-month') {
        const today = ctx.Core.dateOnly(), ui = ctx.state.ui || (ctx.state.ui = {});
        const [year, month] = (/^\d{4}-\d{2}$/.test(ui.journalMonth || '') ? ui.journalMonth : today.slice(0, 7)).split('-').map(Number);
        const moved = new Date(year, month - 1 + Number(el?.dataset?.step || 0), 1, 12);
        const key = `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, '0')}`;
        ui.journalMonth = key > today.slice(0, 7) ? today.slice(0, 7) : key;
        ctx.saveAndRender();
        return true;
      }
      if (ctx.modalState?.type !== 'journal') return false;
      const date = ctx.modalState.date;
      if (action === 'journal-mood') {
        const item = ensureEntry(ctx, date), value = Number(el?.dataset?.value);
        item.mood = item.mood === value ? null : value;
        item.updatedAt = ctx.nowIso();
        ctx.saveState(); ctx.renderModal();
        requestAnimationFrame(() => ctx.$(`[data-action="journal-mood"][data-value="${value}"]`)?.focus());
      } else if (action === 'journal-menu') ctx.openPopover(el, `<div class="popover-title">${ctx.esc(ctx.formatDate(date, 'full'))}</div><div class="sheet-card"><button class="popover-option sheet-option is-danger" type="button" data-pop-action="journal-delete"><span class="sheet-option-label">${tr('Delete entry')}</span></button></div>`, { type: 'journal-menu' });
      else if (action === 'journal-delete') deleteEntry(ctx);
      else if (action === 'journal-task-tomorrow') taskForTomorrow(ctx);
      else return false;
      return true;
    },
    handleInput(event, ctx) {
      if (event.target.id === 'journal-query') {
        query = event.target.value || '';
        const list = ctx.$('#journal-list');
        if (list) list.innerHTML = listHtml(ctx);
        return true;
      }
      if (event.target.id !== 'journal-text' || ctx.modalState?.type !== 'journal') return false;
      const item = ensureEntry(ctx, ctx.modalState.date);
      item.text = event.target.value;
      item.updatedAt = ctx.nowIso();
      ctx.scheduleTextSave();
      return true;
    },
  });
})();
