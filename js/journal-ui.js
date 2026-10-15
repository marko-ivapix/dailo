(function () {
  'use strict';
  const { tr, trn, msg } = window.TodoI18n;

  // Redesign R12b (J1–J3, J5, J7, J9): Dnevnik — one entry per day with an optional mood and free text. The entry
  // is created by its first word or face; global Search does not include it, the screen has its own search.
  const MOODS = [['😞', msg('Bad')], ['🙁', msg('Poor')], ['😐', msg('Okay')], ['🙂', msg('Good')], ['😄', msg('Great')]];
  const WEEKDAYS = [msg('Sun'), msg('Mon'), msg('Tue'), msg('Wed'), msg('Thu'), msg('Fri'), msg('Sat')];
  let query = '';

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
    // R102: the same fold as every search (Cyrillic, diacritics, "đ"/"dj").
    const q = ctx.Core.searchFold(query.trim());
    const items = (ctx.state.journal || []).filter(item => item.text || item.mood).filter(item => !q || ctx.Core.searchFold(item.text).includes(q)).sort((a, b) => b.date.localeCompare(a.date));
    if (!items.length) return q ? `<div class="empty-state"><h3>${tr('No entries with those words')}</h3><p>${tr('The search looks only at the journal text.')}</p></div>` : `<div class="empty-state"><h3>${tr('The journal is empty')}</h3><p>${tr('A tap on a day or “+” opens that day’s entry.')}</p></div>`;
    return `<div class="today-card journal-list">${items.map(item => {
      const mood = moodOf(item);
      return `<button class="journal-row" type="button" data-action="open-journal" data-date="${esc(item.date)}"><span class="journal-row-head"><strong>${esc(formatDate(item.date, 'full'))}</strong>${mood ? `<span class="journal-row-mood" role="img" aria-label="${tr(mood[1])}">${mood[0]}</span>` : ''}</span><span class="journal-row-text">${item.text ? esc(item.text) : `<i>${tr('No text')}</i>`}</span></button>`;
    }).join('')}</div>`;
  }

  // R22a: the strip opens on today (it starts at the 1st otherwise) and keeps its place when the screen redraws.
  function placeStrip(month) {
    if (!globalThis.document || typeof requestAnimationFrame !== 'function') return;
    const old = document.querySelector('#main .journal-strip');
    const keep = old && old.dataset.month === month ? old.scrollLeft : null;
    requestAnimationFrame(() => {
      const strip = document.querySelector('#main .journal-strip');
      if (!strip) return;
      if (keep !== null) { strip.scrollLeft = keep; return; }
      const day = strip.querySelector('.journal-day.is-today');
      if (day) strip.scrollLeft = Math.max(0, day.offsetLeft - strip.offsetLeft - (strip.clientWidth - day.offsetWidth) / 2);
    });
  }

  // R26 (I): while the journal is locked, the screen shows only the lock.
  const isLocked = ctx => Boolean(ctx.journalLock?.enabled() && !ctx.journalLock.unlocked());
  const menuButton = () => `<button class="btn-icon" type="button" data-action="journal-screen-menu" aria-label="${tr('Journal actions')}"><i class="ph ph-dots-three"></i></button>`;

  // R26 (G): "Na današnji dan" — the same day of earlier months and years, for the current month.
  function onThisDay(ctx, today) {
    const { esc, formatDate } = ctx;
    const found = ctx.Core.journalOnThisDay(ctx.state, today);
    if (!found.length) return '';
    const ago = months => (months % 12 === 0 ? trn(months / 12, '{count} year ago', '{count} years ago') : trn(months, '{count} month ago', '{count} months ago'));
    const rows = found.map(({ entry, months }) => {
      const mood = moodOf(entry);
      return `<button class="journal-row" type="button" data-action="open-journal" data-date="${esc(entry.date)}"><span class="journal-row-head"><strong>${esc(`${formatDate(entry.date, 'full')} · ${ago(months)}`)}</strong>${mood ? `<span class="journal-row-mood" role="img" aria-label="${tr(mood[1])}">${mood[0]}</span>` : ''}</span><span class="journal-row-text">${entry.text ? esc(entry.text) : `<i>${tr('No text')}</i>`}</span></button>`;
    }).join('');
    return `<h2 class="review-card-title journal-on-this-day-title">${tr('On this day')}</h2><div class="today-card journal-list journal-on-this-day">${rows}</div>`;
  }

  // R26 (H): the whole journal as Markdown, newest first, through the share sheet (app) or a download (web).
  async function exportJournal(ctx) {
    if (isLocked(ctx) && !(await ctx.journalLock.unlock())) return;
    const items = (ctx.state.journal || []).filter(item => item.text?.trim() || item.mood).sort((a, b) => b.date.localeCompare(a.date));
    if (!items.length) { ctx.setToastMessage(tr('The journal is empty')); return; }
    const text = `# ${tr('Journal')}\n` + items.map(item => {
      const mood = moodOf(item);
      return `\n## ${ctx.formatDate(item.date, 'full')}${mood ? ` · ${mood[0]} ${tr(mood[1])}` : ''}\n${item.text?.trim() ? `\n${item.text.trim()}\n` : ''}`;
    }).join('');
    await ctx.saveTextFile(text, `dailo-dnevnik-${ctx.Core.dateOnly()}.md`, 'text/markdown;charset=utf-8');
  }

  // R26: the screen's ⋯ — export, and the lock where the phone can unlock with a fingerprint, face or PIN.
  async function openScreenMenu(ctx, anchor) {
    const lock = await ctx.journalLock?.available?.();
    const option = (action, icon, label) => `<button class="popover-option" type="button" data-pop-action="${action}"><i class="ph ${icon}"></i>${label}</button>`;
    const lockOption = !lock ? '' : ctx.journalLock.enabled() ? option('journal-lock-off', 'ph-lock-simple-open', tr('Turn the journal lock off')) : option('journal-lock-on', 'ph-lock-simple', tr('Lock the journal'));
    ctx.openPopover(anchor, ctx.menuSheet(tr('Journal'), `${option('journal-export', 'ph-export', tr('Export as text'))}${lockOption}`), { type: 'journal-screen-menu' });
  }

  async function setLock(ctx, on) {
    ctx.closePopover();
    if (!(await ctx.journalLock.unlock({ force: true }))) return;
    ctx.journalLock.set(on);
    ctx.render();
    ctx.setToastMessage(on ? tr('The journal is locked. It opens with your fingerprint, face or PIN.') : tr('The journal lock is off'));
  }

  function renderList(ctx) {
    const { state, esc, Core, pageHeader, formatDate } = ctx;
    if (isLocked(ctx)) {
      return pageHeader(tr('Journal'), '', { add: false }) + `<div class="empty-state journal-locked"><i class="ph ph-lock-simple" aria-hidden="true"></i><h3>${tr('The journal is locked')}</h3><p>${tr('Unlock with your fingerprint, face or phone PIN.')}</p><button class="btn btn-primary" type="button" data-action="journal-unlock">${tr('Unlock')}</button></div>`;
    }
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
    placeStrip(month);
    // R51: encryption is on but this device has no journal password yet, so its journal does not sync.
    const cipherNote = ctx.journalCipherStatus() === 'locked' ? `<div class="today-card journal-cipher-note"><p>${tr('The journal is encrypted on another device. Enter the journal password in Nalog to sync it here.')}</p><button class="btn btn-secondary" type="button" data-route="account">${tr('Account')}</button></div>` : '';
    return pageHeader(tr('Journal'), trn(total, '{count} entry', '{count} entries'), { add: false, actionHtml: menuButton() }) + cipherNote
      + `<div class="journal-month"><strong class="journal-month-title">${esc(title)}</strong><span class="journal-month-arrows"><button class="btn-icon" type="button" data-action="journal-month" data-step="-1" aria-label="${tr('Previous month')}"><i class="ph ph-caret-left"></i></button><button class="btn-icon" type="button" data-action="journal-month" data-step="1"${month >= current ? ' disabled' : ''} aria-label="${tr('Next month')}"><i class="ph ph-caret-right"></i></button></span></div>`
      + `<div class="journal-strip" data-month="${month}">${days}</div>`
      + `<label class="sheet-search journal-search"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><input id="journal-query" class="input" type="search" autocomplete="off" placeholder="${tr('Search the journal')}" value="${esc(query)}" aria-label="${tr('Search the journal')}"></label>`
      + (month === current && !query.trim() ? onThisDay(ctx, today) : '')
      + (month === current && !query.trim() ? moodInsight(ctx, today) : '')
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
    // R98: what was completed that day, and one question about the day (not a task) to write about.
    const done = ctx.Core.completedOn(ctx.state, date);
    const doneHtml = done.length ? `<h3 class="sheet-group-title">${tr('Completed that day')}</h3><ul class="journal-done">${done.slice(0, 8).map(task => `<li>${esc(task.title)}</li>`).join('')}${done.length > 8 ? `<li>+${done.length - 8}</li>` : ''}</ul>` : '';
    const question = tr(ctx.Core.journalQuestion(date, ctx.modalState.questionOffset || 0));
    const questionHtml = `<div class="journal-question"><p class="journal-question-text">${esc(question)}</p><div class="journal-question-actions"><button class="quick-chip" type="button" data-action="journal-question-insert">${tr('Write it in')}</button><button class="quick-chip" type="button" data-action="journal-question-next">${tr('Another question')}</button></div></div>`;
    return modalFrame(`<div class="modal-inner quick-sheet journal-window"><div class="modal-header task-window-header"><span class="task-window-kind">${tr('Journal')}</span><div class="task-window-actions"><button class="btn-icon" type="button" data-action="journal-menu" aria-label="${tr('Entry actions')}"><i class="ph ph-dots-three"></i></button><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div></div><h2 class="journal-date">${esc(formatDate(date, 'full'))}</h2><p class="journal-summary">${esc(summaryText(ctx, date))}</p>${doneHtml}<h3 class="sheet-group-title">${tr('Mood')}</h3><div class="journal-moods" role="group" aria-label="${tr('Mood')}">${moods}</div>${questionHtml}<textarea id="journal-text" class="input journal-text" data-autogrow rows="10" placeholder="${tr('How did the day go? What was good? What tomorrow?')}" aria-label="${tr('Entry')}">${esc(item?.text || '')}</textarea><button class="quick-chip journal-task" type="button" data-action="journal-task-tomorrow">+ ${tr('Task for tomorrow')}</button><p class="sheet-note">${tr('Selected text or a “Tomorrow: …” line becomes the task title. It saves while you type. The journal is not in Search, only in its own search on the Journal screen.')}</p></div>`, 'quick');
  }

  async function openEntry(ctx, date) {
    if (isLocked(ctx) && !(await ctx.journalLock.unlock())) return;
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

  // R98: the question goes into the text on its own line, and the answer follows it; it saves like typing.
  function insertQuestion(ctx) {
    const field = ctx.$('#journal-text');
    if (!field) return;
    const question = tr(ctx.Core.journalQuestion(ctx.modalState.date, ctx.modalState.questionOffset || 0));
    const before = field.value.replace(/\s+$/, '');
    field.value = `${before}${before ? '\n\n' : ''}${question}\n`;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus();
    field.setSelectionRange?.(field.value.length, field.value.length);
  }

  // R98: how the mood goes with the habits, over the last 90 days (only when the difference says something).
  function moodInsight(ctx, today) {
    const found = ctx.Core.moodInsights(ctx.state, Object.values(ctx.state.habitLogCache || {}).flat(), today);
    if (!found.length) return '';
    const one = value => value.toLocaleString(window.TodoI18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const rows = found.map(item => `<p class="journal-insight-line">${ctx.esc(tr('Days with “{habit}”: {with} · other days: {without}', { habit: item.name, with: one(item.with), without: one(item.without) }))}</p>`).join('');
    return `<h2 class="review-card-title">${tr('Mood and habits')}</h2><div class="today-card journal-insight">${rows}<p class="task-meta">${tr('The average mood (1–5) over the last 90 days.')}</p></div>`;
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

  // Redesign R12c (J4): the evening notice on Today, from the reminder time while today has no entry. "Ne danas"
  // hides it until tomorrow on this device only (device-local key, outside state, backups and sync).
  const LATER_KEY = 'dailoJournalLater';
  function noticeHtml(ctx) {
    const { Core, state } = ctx;
    const time = Core.journalReminderTime(state.settings), today = Core.dateOnly(), now = new Date(ctx.nowIso());
    if (!time || Core.dateOnly(now) !== today) return '';
    const [hours, minutes] = time.split(':').map(Number);
    if (now.getHours() * 60 + now.getMinutes() < hours * 60 + minutes) return '';
    const item = entryFor(ctx, today);
    if (item && (item.text.trim() || item.mood)) return '';
    try { if (localStorage.getItem(LATER_KEY) === today) return ''; } catch (_) { /* shown when storage is unavailable */ }
    return `<section class="weekly-review-notice journal-notice" data-journal-notice role="status" aria-label="${tr('Journal')}"><i class="ph ph-book-open weekly-review-notice-icon" aria-hidden="true"></i><div class="backup-reminder-copy"><strong>${tr('Write down how the day went')}</strong><span>${ctx.esc(summaryText(ctx, today))}.</span></div><div class="backup-reminder-actions"><button class="btn btn-primary" type="button" data-action="open-journal">${tr('Write')}</button><button class="btn btn-ghost" type="button" data-action="journal-not-today">${tr('Not today')}</button></div></section>`;
  }

  window.TodoDomainModules?.register({
    name: 'journal',
    renderRoute(route, ctx) {
      if (route.type === 'journal') return renderList(ctx);
      if (route.type === 'journal-notice') return noticeHtml(ctx);
      if (route.type === 'modal' && route.modalType === 'journal') return renderEntry(ctx);
    },
    handleAction(action, event, ctx) {
      if (action === 'journal-closing') { closing(ctx); return true; }
      if (action === 'journal-question-next') { ctx.modalState.questionOffset = (ctx.modalState.questionOffset || 0) + 1; ctx.renderModal(); return true; }
      if (action === 'journal-question-insert') { insertQuestion(ctx); return true; }
      if (action === 'journal-not-today') {
        try { localStorage.setItem(LATER_KEY, ctx.Core.dateOnly()); } catch (_) { /* shown again next time */ }
        ctx.render();
        ctx.setToastMessage(tr('The reminder comes back tomorrow evening'));
        return true;
      }
      const el = event?.target?.closest?.('[data-action], [data-pop-action]');
      if (action === 'open-journal') return openEntry(ctx, el?.dataset?.date).then(() => true);
      if (action === 'journal-unlock') return ctx.journalLock.unlock().then(() => { ctx.render(); return true; });
      if (action === 'journal-screen-menu') return openScreenMenu(ctx, el).then(() => true);
      if (action === 'journal-export') { ctx.closePopover(); return exportJournal(ctx).then(() => true); }
      if (action === 'journal-lock-on' || action === 'journal-lock-off') return setLock(ctx, action === 'journal-lock-on').then(() => true);
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
      } else if (action === 'journal-menu') ctx.openPopover(el, ctx.menuSheet(ctx.formatDate(date, 'full'), `<button class="popover-option is-danger" type="button" data-pop-action="journal-delete"><i class="ph ph-trash"></i>${tr('Delete entry')}</button>`), { type: 'journal-menu' }); // R33: the usual ⋯ sheet
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
