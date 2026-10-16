(function () {
  'use strict';
  const I18n = window.TodoI18n;
  const { tr, trn, msg } = I18n;

  // Quick Add, a module since R111 (plan part 2): the sheet (the title, the preview of what it sets, the suggestions,
  // the place and date selectors, the template chip and a pasted list), its actions and typing, dictation and
  // "Dodaj zadatak". app.js opens it through 'quick-open' and keeps routeQuickAddContext for the "+" button; the shared
  // pickers (date, project, tags, priority, reminder) stay in app.js and fill the sheet's draft.
  // The app's helpers come from the domain context the module first receives; the live data and the open window are
  // read through it each time (app.state, app.modalState, app.setModalState), since a sync or a reload replaces them.
  let app = null;
  let Core, $, esc, captureModalReturnFocus, closeModal, closePopover, copyTemplate, durationLabel, getArea, getProject, getTag, lowerFirst, modalFrame, newTaskRecord, nextOrder, nowIso, openPopover, openTaskDetail, openProjectPicker, openPlanPicker, priorityLabel, recurrenceLabel, relativeDateLabel, render, renderModal, saveState, setToastMessage, setUndo, syncTemplateEntityGoalLinks, uid;
  function use(ctx) {
    if (app) return;
    app = ctx;
    ({ Core, $, esc, captureModalReturnFocus, closeModal, closePopover, copyTemplate, durationLabel, getArea, getProject, getTag, lowerFirst, modalFrame, newTaskRecord, nextOrder, nowIso, openPopover, openTaskDetail, openProjectPicker, openPlanPicker, priorityLabel, recurrenceLabel, relativeDateLabel, render, renderModal, saveState, setToastMessage, setUndo, syncTemplateEntityGoalLinks, uid } = ctx);
  }

  // R53: voice input in Quick Add where the browser recognizes speech (Chrome, Edge, Safari). The phone apps keep the
  // keyboard's own dictation key, since their WebViews have no speech recognition.
  const SpeechRecognitionImpl = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
  const DICTATION_ERRORS = { 'not-allowed': msg('The microphone is not allowed. Allow it in the browser settings.'), 'service-not-allowed': msg('The microphone is not allowed. Allow it in the browser settings.'), 'no-speech': msg('Nothing was heard. Try again.'), 'audio-capture': msg('No microphone was found.'), network: msg('Speech recognition is not available right now.') };
  let dictation = null;

  // A tap listens once; the words join the title live (Cyrillic becomes Latin) and the preview of dates and tags
  // follows. A second tap stops.
  function toggleDictation() {
    if (dictation) { dictation.stop(); return; }
    const field = $('#quick-title');
    if (!SpeechRecognitionImpl || !field) return;
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = I18n.locale().startsWith('sr') ? 'sr-RS' : I18n.locale();
    recognition.interimResults = true;
    recognition.continuous = false;
    const base = field.value.trim();
    recognition.onresult = event => {
      const heard = Core.cyrillicToLatin(Array.from(event.results, result => result[0]?.transcript || '').join('')).replace(/\s+/g, ' ').trim();
      field.value = [base, heard].filter(Boolean).join(' ');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    };
    recognition.onerror = event => { if (DICTATION_ERRORS[event.error]) setToastMessage(tr(DICTATION_ERRORS[event.error])); };
    recognition.onend = () => { dictation = null; setDictationState(false); $('#quick-title')?.focus(); };
    dictation = recognition;
    setDictationState(true);
    try { recognition.start(); } catch (_) { dictation = null; setDictationState(false); }
  }

  function setDictationState(on) {
    const button = $('#quick-dictation');
    if (!button) return;
    button.classList.toggle('is-listening', on);
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? tr('Stop dictation') : tr('Dictate the task'));
  }

  function stopDictation() {
    dictation?.abort();
    dictation = null;
  }

  function openQuickAdd(context = {}) {
    captureModalReturnFocus();
    closePopover();
    const defaults = {
      projectId: context.projectId || null,
      areaId: context.areaId || null,
      plannedDate: context.plannedDate || context.day || (context.today ? Core.dateOnly() : null),
      explicitPlan: Boolean(context.plannedDate),
      processed: Boolean(context.anytime),
    };
    app.setModalState({
      type: 'quick',
      templateContext: context,
      defaults,
      draft: {
        title: context.title || '', notes: context.notes || '', projectId: defaults.projectId, areaId: defaults.areaId, plannedDate: defaults.plannedDate, parsedPlanDate: null, explicitPlan: defaults.explicitPlan,
        dueDate: null, plannedTime: null, dueTime: null, explicitPlannedTime: false, reminderAt: null, reminderFiredAt: null, recurrence: null, tagIds: [...(context.tagIds || [])], priority: 'none', subtasks: [],
      },
      error: '',
    });
    // R12b (J9): "+ Zadatak za sutra" comes back to the journal entry when Quick Add closes.
    if (context.returnTo) app.modalState.returnTo = context.returnTo;
    renderModal();
    requestAnimationFrame(() => $('#quick-title')?.focus());
  }

  // What the title will set, shown under it while typing (V1.10). Empty when nothing is recognized.
  // R90: each part is a button: a tap keeps its words in the title (`quick-keep`); the day and the time are separate.
  function quickParsePreview(parsed) {
    const item = (slot, icon, text) => `<button class="quick-parse-item" type="button" data-action="quick-keep" data-slot="${esc(slot)}" aria-label="${esc(tr('Keep “{words}” in the title', { words: parsed.sources?.[slot] || text }))}"><i class="ph ${icon}" aria-hidden="true"></i>${esc(text)}</button>`;
    const items = [];
    // R105: a day set by a repeat ("utorkom") has no words of its own; a tap keeps the repeat's words.
    if (parsed.plannedDate) items.push(item(parsed.sources && !parsed.sources.plannedDate && parsed.sources.recurrence ? 'recurrence' : 'plannedDate', 'ph-calendar-check', relativeDateLabel(parsed.plannedDate)));
    if (parsed.plannedTime) items.push(item('plannedTime', 'ph-clock', parsed.plannedTime));
    // R33 (finding 32): an hourglass is the due date and a flag the priority, as in the task window.
    if (parsed.dueDate) items.push(item('dueDate', 'ph-hourglass-medium', tr('Due {date}', { date: relativeDateLabel(parsed.dueDate) })));
    if (parsed.durationMinutes) items.push(item('durationMinutes', 'ph-timer', durationLabel(parsed.durationMinutes)));
    // R89: a repeat written in the title ("utorkom", "svakog drugog utorka").
    if (parsed.recurrence) items.push(item('recurrence', 'ph-arrows-clockwise', recurrenceLabel(parsed.recurrence)));
    const project = parsed.projectId && getProject(parsed.projectId);
    if (project) items.push(item('projectId', 'ph-folder-simple', project.name));
    const area = !project && parsed.areaId && getArea(parsed.areaId);
    if (area) items.push(item('areaId', 'ph-squares-four', area.name));
    for (const tag of (parsed.tagIds || []).map(getTag).filter(Boolean)) items.push(item(`tag:${tag.id}`, 'ph-hash', tag.name));
    if (parsed.priority) items.push(item('priority', 'ph-flag', priorityLabel(parsed.priority)));
    return items.length ? `<div class="quick-parse-preview" data-quick-preview role="group" aria-label="${tr('Recognized in title')}">${items.join('')}<span class="quick-parse-hint">${tr('Tap a part to keep it in the title.')}</span></div>` : '';
  }

  // R90: while a #tag, +project or @area is typed at the end of the title, the existing names to complete it with.
  function quickSuggestHtml(title) {
    const items = Core.quickSuggestions(title, { tags: app.state.tags || [], projects: app.state.projects || [], areas: app.state.areas || [] }) || [];
    return items.length ? `<div class="quick-suggest" role="group" aria-label="${tr('Suggestions')}">${items.map(item => `<button class="quick-chip" type="button" data-action="quick-suggest" data-insert="${esc(item.insert)}">${esc(item.insert.charAt(0) + item.label)}</button>`).join('')}</div>` : '';
  }

  // Redesign R4 (Q1, Q2, S7): Quick Add as a bottom sheet. The title, the Smart Quick Add preview, the date and
  // place selectors, the template chip, "Više opcija" (saves and opens the task window) and "Dodaj zadatak".
  function renderQuickModal() {
    const d = app.modalState.draft;
    const parsed = parseQuickAddTitle(d.title, !d.explicitPlan, d.keepInTitle);
    // R90: a pasted list waits for a choice: that many tasks, or one.
    const lines = app.modalState.pasteLines || [];
    const paste = lines.length ? `<div class="quick-paste" role="group" aria-label="${tr('Pasted list')}"><p><strong>${esc(trn(lines.length, 'A list of {count} line', 'A list of {count} lines'))}</strong></p><ul class="quick-paste-lines">${lines.slice(0, 5).map(line => `<li>${esc(line)}</li>`).join('')}${lines.length > 5 ? `<li>${esc(tr('… and {count} more', { count: lines.length - 5 }))}</li>` : ''}</ul><div class="quick-paste-actions"><button class="btn btn-primary" type="button" data-action="quick-paste-tasks">${esc(trn(lines.length, 'Make {count} task', 'Make {count} tasks'))}</button><button class="btn btn-ghost" type="button" data-action="quick-paste-one">${tr('As one task')}</button></div></div>` : '';
    const plan = d.explicitPlan ? d.plannedDate : (parsed.plannedDate || d.plannedDate);
    const time = d.explicitPlannedTime ? d.plannedTime : (d.plannedTime || parsed.plannedTime);
    const titleInput = `<input id="quick-title" class="quick-title-input${app.modalState.error ? ' is-error' : ''}" type="text" maxlength="500" autocomplete="off" placeholder="${tr('What needs to be done?')}" value="${esc(d.title)}" aria-label="${tr('Task title')}" />`;
    // R53: the microphone, where the browser recognizes speech.
    const dictate = SpeechRecognitionImpl ? `<button id="quick-dictation" class="btn-icon quick-dictation" type="button" data-action="quick-dictate" aria-pressed="false" aria-label="${tr('Dictate the task')}"><i class="ph ph-microphone" aria-hidden="true"></i></button>` : '';
    return modalFrame(`<div class="modal-inner quick-sheet">
      <div class="modal-header"><h2 class="modal-title">${tr('New task')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div>
      ${dictate ? `<div class="quick-title-row">${titleInput}${dictate}</div>` : titleInput}
      ${app.modalState.error ? `<div class="validation">${esc(app.modalState.error)}</div>` : ''}
      ${app.modalState.draft.notes ? `<p class="quick-shared-note"><i class="ph ph-link" aria-hidden="true"></i><span>${esc(app.modalState.draft.notes)}</span></p>` : ''}
      ${paste}
      <div class="quick-suggest-slot" data-quick-suggest-slot>${quickSuggestHtml(d.title)}</div>
      <div class="quick-parse-slot" data-quick-preview-slot aria-live="polite">${quickParsePreview(parsed)}</div>
      <div class="quick-selectors"><button class="quick-selector" type="button" data-action="quick-plan-picker"><i class="ph ph-calendar-check" aria-hidden="true"></i><span data-quick-plan-label>${esc(quickPlanLabel(plan, time))}</span><i class="ph ph-caret-right" aria-hidden="true"></i></button><button class="quick-selector" type="button" data-action="quick-project-picker"><i class="ph ph-folder-simple" aria-hidden="true"></i><span data-quick-place-label>${esc(quickPlace(d, parsed).label)}</span><i class="ph ph-caret-right" aria-hidden="true"></i></button></div>
      ${quickTemplateRow()}
      <button class="quick-more-options" type="button" data-action="quick-more-options"><span>${tr('More options')}</span><span class="quick-more-meta">${tr('Due date, reminder, tags')}</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>
      <div class="quick-sheet-footer"><span class="shortcut-hint">${tr('↵ Add · ⇧↵ Add another')}</span><button class="btn btn-secondary quick-add-continue" type="button" data-action="create-task-continue">${tr('Add and continue')}</button><button class="btn btn-primary quick-add-button" type="button" data-action="create-task">${tr('Add task')}</button></div>
    </div>`, 'quick');
  }

  function quickPlanLabel(plan, time) {
    return plan ? `${relativeDateLabel(plan)}${time ? ` · ${time}` : ''}` : tr('No date');
  }

  // Where a Quick Add task goes: its project, "Bez projekta" (it skips Inbox) or Inbox. A picked place wins over a
  // parsed +project; a task with a date and no project is never in Inbox.
  function quickPlace(d, parsed = parseQuickAddTitle(d.title, !d.explicitPlan, d.keepInTitle)) {
    const projectId = d.placePicked ? (d.projectId || null) : (d.projectId || parsed.projectId || null);
    const plan = d.explicitPlan ? d.plannedDate : (parsed.plannedDate || d.plannedDate);
    const processed = d.processed ?? Boolean(app.modalState?.defaults?.processed);
    const isInbox = !projectId && !processed && !plan;
    return { projectId, isInbox, label: projectId ? (getProject(projectId)?.name || tr('No project')) : isInbox ? tr('Inbox') : tr('No project') };
  }

  // S7: the "Iz šablona" chip, shown only when task templates exist.
  function quickTemplateRow() {
    const templates = (app.state.templates || []).filter(template => template.type === 'task');
    if (!templates.length) return '';
    const chosen = app.modalState.quickTemplate && templates.find(template => template.id === app.modalState.quickTemplate.id);
    if (!chosen) return `<div class="quick-template-row"><button class="quick-chip" type="button" data-action="quick-template"><i class="ph ph-copy" aria-hidden="true"></i>${tr('From template')}</button></div>`;
    return `<div class="quick-template-row"><button class="quick-chip is-selected" type="button" data-action="quick-template"><i class="ph ph-copy" aria-hidden="true"></i>${esc(tr('Template: {name}', { name: chosen.name }))}</button><button class="quick-chip" type="button" data-action="quick-template-clear" aria-label="${tr('Remove template')}"><i class="ph ph-x" aria-hidden="true"></i></button></div><p class="quick-template-summary">${esc(quickTemplateSummary(chosen))}</p>`;
  }

  function quickTemplateSummary(template) {
    const item = Core.instantiateTemplate(template, Core.dateOnly(), { state: app.state, makeId: () => 'preview', nowIso: nowIso() }).task;
    return [item.plannedDate && relativeDateLabel(item.plannedDate), item.dueDate && tr('Due {date}', { date: relativeDateLabel(item.dueDate) }), item.subtasks.length && trn(item.subtasks.length, '{count} subtask', '{count} subtasks'), ...(item.tagIds || []).map(getTag).filter(Boolean).map(tag => `#${tag.name}`)].filter(Boolean).join(' · ') || item.title || template.name;
  }

  function openQuickTemplatePicker(anchor) {
    const templates = (app.state.templates || []).filter(template => template.type === 'task');
    const current = app.modalState?.quickTemplate?.id;
    const html = `<div class="popover-title">${tr('Task template')}</div><div class="sheet-card">${templates.map(template => `<button class="popover-option sheet-option${template.id === current ? ' is-selected' : ''}" type="button" data-pop-action="quick-template-pick" data-template-id="${esc(template.id)}"><i class="ph ph-copy" aria-hidden="true"></i><span class="sheet-option-label">${esc(template.name)}<small>${esc(quickTemplateSummary(template))}</small></span><span class="sheet-radio${template.id === current ? ' is-on' : ''}" aria-hidden="true"></span></button>`).join('')}</div>`;
    openPopover(anchor, html, { type: 'quick-template' });
  }

  // S7: a template fills what the draft does not have yet. A typed title, a picked date and a picked place win;
  // the due date moves with the plan. ✕ restores what the template replaced.
  const QUICK_TEMPLATE_FIELDS = ['plannedDate', 'plannedTime', 'dueDate', 'dueTime', 'subtasks', 'tagIds', 'priority', 'notes', 'durationMinutes', 'reminderAt', 'recurrence', 'goalIds', 'projectId', 'areaId'];
  function applyQuickTemplate(id) {
    const template = (app.state.templates || []).find(item => item.id === id && item.type === 'task');
    if (!template || app.modalState?.type !== 'quick') return;
    syncQuickDraftFromDom();
    if (app.modalState.quickTemplate) clearQuickTemplate();
    const d = app.modalState.draft;
    const offset = Number.isInteger(template.data?.plannedOffsetDays) ? template.data.plannedOffsetDays : 0;
    const context = d.explicitPlan && d.plannedDate ? Core.addDays(d.plannedDate, -offset) : (app.modalState.templateContext?.plannedDate || Core.dateOnly());
    const out = Core.instantiateTemplate(template, context, { state: app.state, makeId: uid, nowIso: nowIso() });
    const item = out.task;
    const before = copyTemplate(Object.fromEntries([...QUICK_TEMPLATE_FIELDS, 'title'].map(key => [key, d[key] ?? null])));
    if (!String(d.title || '').trim()) d.title = item.title || '';
    if (!d.explicitPlan && item.plannedDate) { d.plannedDate = item.plannedDate; if (!d.plannedTime) d.plannedTime = item.plannedTime || null; }
    if (!d.dueDate) { d.dueDate = item.dueDate || null; d.dueTime = d.dueTime || item.dueTime || null; }
    if (!d.subtasks?.length) d.subtasks = item.subtasks || [];
    d.tagIds = [...new Set([...(d.tagIds || []), ...(item.tagIds || [])])];
    if (!d.priority || d.priority === 'none') d.priority = item.priority || 'none';
    for (const key of ['notes', 'durationMinutes', 'reminderAt', 'recurrence']) if (!d[key]) d[key] = item[key] ?? d[key] ?? null;
    d.goalIds = [...new Set([...(d.goalIds || []), ...(item.goalIds || [])])];
    if (!d.placePicked && !d.projectId && item.projectId) { d.projectId = item.projectId; d.areaId = null; }
    else if (!d.projectId && !d.areaId && item.areaId) d.areaId = item.areaId;
    app.modalState.quickTemplate = { id, title: item.title || '', before };
    app.modalState.templateInstance = out;
  }
  function clearQuickTemplate() {
    const applied = app.modalState?.quickTemplate;
    if (!applied) return;
    syncQuickDraftFromDom();
    const d = app.modalState.draft;
    const title = d.title === applied.title ? applied.before.title : d.title;
    for (const key of QUICK_TEMPLATE_FIELDS) {
      if ((key === 'plannedDate' || key === 'plannedTime') && d.explicitPlan) continue;
      if ((key === 'projectId' || key === 'areaId') && d.placePicked) continue;
      d[key] = applied.before[key];
    }
    d.title = title || '';
    app.modalState.quickTemplate = null;
    app.modalState.templateInstance = null;
  }

  function createTask(keepOpen = false, openWindow = false) {
    if (!app.modalState || app.modalState.type !== 'quick') return;
    syncQuickDraftFromDom();
    const d = app.modalState.draft;
    const parsed = parseQuickAddTitle(d.title, !d.explicitPlan, d.keepInTitle);
    const title = String(parsed.title || '').trim();
    const resolvedPlan = d.explicitPlan ? d.plannedDate : (parsed.plannedDate || d.plannedDate);
    if (!title) {
      app.modalState.error = tr('Task needs a title.');
      renderModal(); requestAnimationFrame(() => $('#quick-title')?.focus()); return;
    }
    // Picker values win over parsed ones; a project wins over an Area; a picked place wins over +project (R4).
    const { projectId, isInbox } = quickPlace(d, parsed);
    const task = {
      id: uid('task'), title, notes: d.notes || '', projectId, areaId: projectId ? null : (d.areaId || parsed.areaId || null), goalIds: [...(d.goalIds || [])], plannedTime: d.explicitPlannedTime ? d.plannedTime : (d.plannedTime || parsed.plannedTime || null), dueTime: d.dueTime || null, durationMinutes: d.durationMinutes || parsed.durationMinutes || null,
      plannedDate: resolvedPlan || null, dueDate: d.dueDate || parsed.dueDate || null,
      reminderAt: d.reminderAt || null, reminderFiredAt: null, recurrence: d.recurrence || parsed.recurrence || null, tagIds: [...new Set([...(d.tagIds || []), ...parsed.tagIds])], priority: parsed.priority || d.priority || 'none', attachmentIds: [], isInbox,
      isImportant: false, isUrgent: false, isCompleted: false, completedAt: null,
      subtasks: d.subtasks.map((s, i) => ({ ...s, order: i })),
      todayOrder: resolvedPlan === Core.dateOnly() ? nextOrder('today') : null,
      projectOrder: projectId ? nextOrder(`project:${projectId}`) : null,
      inboxOrder: isInbox ? nextOrder('inbox', true) : null,
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    if(task.recurrence)task.recurrence={...Core.normalizeRecurrenceV3(task.recurrence),seriesId:task.id};
    app.state.tasks.push(task);
    if(app.modalState.templateInstance)syncTemplateEntityGoalLinks('task',task);
    saveState();
    // R36 (C): the toast says where the task went; "Otvori" opens it.
    if (!openWindow) setToastMessage(addedMessage(task), { label: msg('Open it'), taskId: task.id });
    if (keepOpen) {
      const defaults = app.modalState.defaults;
      app.setModalState({ type: 'quick', templateContext: app.modalState.templateContext, defaults, draft: { title: '', notes: '', projectId: defaults.projectId, areaId: defaults.areaId, plannedDate: defaults.plannedDate, parsedPlanDate: null, explicitPlan: Boolean(defaults.explicitPlan), dueDate: null, plannedTime: null, dueTime: null, explicitPlannedTime: false, reminderAt: null, reminderFiredAt: null, recurrence: null, tagIds: [], priority: 'none', subtasks: [] }, error: '' });
      render(); renderModal(); requestAnimationFrame(() => $('#quick-title')?.focus());
    } else {
      closeModal(); render();
      if (openWindow) openTaskDetail(task.id);
    }
  }

  // R36 (C): where a new task went: Inbox, Danas, a date, its project or Kad stignem.
  function addedMessage(task) {
    if (task.isInbox) return tr('Added to Inbox');
    if (task.plannedDate === Core.dateOnly()) return tr('Added to Today');
    if (task.plannedDate) return tr('Added for {date}', { date: lowerFirst(relativeDateLabel(task.plannedDate)) });
    const project = task.projectId && getProject(task.projectId);
    if (project) return tr('Added to {place}', { place: project.name });
    return tr('Added to Anytime');
  }

  function syncQuickDraftFromDom() {
    if (app.modalState?.type !== 'quick') return;
    const title = $('#quick-title'); if (title) app.modalState.draft.title = title.value;
  }

  // R90: `keep` holds the parts the person kept in the title; `sources` says which words set each part.
  function parseQuickAddTitle(rawTitle, parsePlan = true, keep = []) {
    return Core.parseQuickAdd(rawTitle, { today: Core.dateOnly(), tags: app.state.tags || [], projects: app.state.projects || [], areas: app.state.areas || [], parsePlan, keep, sources: true });
  }

  // R90: a tapped part of the preview stays in the title; its words are not read again while they stay the same.
  function keepInQuickTitle(slot) {
    if (app.modalState?.type !== 'quick') return;
    syncQuickDraftFromDom();
    const d = app.modalState.draft;
    const text = parseQuickAddTitle(d.title, !d.explicitPlan, d.keepInTitle).sources?.[slot];
    if (!text) return;
    d.keepInTitle = [...(d.keepInTitle || []), { slot, text }];
    renderModal();
    focusQuickTitleEnd();
  }
  // R90: a suggestion completes the #tag, +project or @area being typed.
  function applyQuickSuggestion(insert) {
    if (app.modalState?.type !== 'quick' || !insert) return;
    syncQuickDraftFromDom();
    const d = app.modalState.draft;
    d.title = `${d.title.replace(/(^|\s)[#+@]\S*$/, '$1')}${insert} `;
    renderModal();
    focusQuickTitleEnd();
  }
  function focusQuickTitleEnd() {
    const input = $('#quick-title');
    if (!input) return;
    input.focus();
    input.setSelectionRange?.(input.value.length, input.value.length);
  }
  // R90: a pasted list (two lines or more) is offered as that many tasks, after a confirmation in the sheet.
  function handlePaste(event) {
    if (app.modalState?.type !== 'quick' || event.target?.id !== 'quick-title') return;
    const lines = Core.splitPastedList(event.clipboardData?.getData('text') || '');
    if (lines.length < 2) return;
    event.preventDefault();
    syncQuickDraftFromDom();
    app.modalState.pasteLines = lines;
    renderModal();
  }
  // R90 (AGENTS.md exception, the user's choice): each line becomes a task the way a title would (its day, time,
  // repeat, project and tags), in the sheet's place and day; one Poništi removes them all.
  function createPastedTasks() {
    if (app.modalState?.type !== 'quick' || !app.modalState.pasteLines?.length) return;
    syncQuickDraftFromDom();
    const d = app.modalState.draft, created = [];
    // R105: the +project, @area, #tags and !priority typed before the paste apply to every line; a line's own win. (The
    // sheet's day chip already applies to all of them.)
    const typed = parseQuickAddTitle(d.title || '', !d.explicitPlan, d.keepInTitle);
    for (const line of app.modalState.pasteLines) {
      const own = parseQuickAddTitle(line, !d.explicitPlan);
      const parsed = { ...own, ...(own.projectId || own.areaId ? {} : { projectId: typed.projectId, areaId: typed.areaId }), tagIds: [...new Set([...typed.tagIds, ...own.tagIds])], priority: own.priority || typed.priority };
      const title = String(parsed.title || '').trim();
      if (!title) continue;
      const plannedDate = (d.explicitPlan ? d.plannedDate : (parsed.plannedDate || d.plannedDate)) || null;
      const { projectId, isInbox } = quickPlace(d, parsed);
      const task = newTaskRecord({ title, projectId, areaId: projectId ? null : (d.areaId || parsed.areaId || null), plannedDate, plannedTime: parsed.plannedTime || null, dueDate: parsed.dueDate || null, durationMinutes: parsed.durationMinutes || null, tagIds: [...new Set([...(d.tagIds || []), ...parsed.tagIds])], priority: parsed.priority || 'none', isInbox,
        todayOrder: plannedDate === Core.dateOnly() ? nextOrder('today') : null, projectOrder: projectId ? nextOrder(`project:${projectId}`) : null, inboxOrder: isInbox ? nextOrder('inbox') : null });
      if (parsed.recurrence) task.recurrence = { ...Core.normalizeRecurrenceV3(parsed.recurrence), seriesId: task.id };
      app.state.tasks.push(task);
      created.push(task.id);
    }
    if (!created.length) return;
    saveState(); closeModal(); render();
    setUndo(trn(created.length, '{count} task added', '{count} tasks added'), () => { const ids = new Set(created); app.state.tasks = app.state.tasks.filter(task => !ids.has(task.id)); saveState(); render(); });
  }
  // R90: "Kao jedan zadatak" puts the pasted lines into the title, one after another.
  function joinPastedLines() {
    if (app.modalState?.type !== 'quick' || !app.modalState.pasteLines?.length) return;
    syncQuickDraftFromDom();
    const d = app.modalState.draft;
    d.title = [d.title.trim(), ...modalState.pasteLines].filter(Boolean).join(' ').slice(0, 500);
    app.modalState.pasteLines = null;
    renderModal();
    focusQuickTitleEnd();
  }

  function attach(ctx) {
    use(ctx);
    // R90: a list pasted into Quick Add.
    document.addEventListener('paste', handlePaste);
  }

  function renderRoute(route, ctx) {
    use(ctx);
    if (route?.type === 'modal' && route.modalType === 'quick') return renderQuickModal();
    return undefined;
  }

  function handleAction(action, event, ctx) {
    use(ctx);
    // What app.js asks for: the sheet opened with a context, dictation stopped when a window closes, a task template
    // filled in from Šabloni, and the typed title read before another window takes over.
    if (action === 'quick-open') { openQuickAdd(event || {}); return true; }
    if (action === 'quick-stop-dictation') { stopDictation(); return true; }
    if (action === 'quick-template-apply') { applyQuickTemplate(event.templateId); return true; }
    if (action === 'quick-sync-draft') { syncQuickDraftFromDom(); return true; }
    // The place and template sheets.
    const button = event?.target?.closest?.('[data-pop-action]');
    if (action === 'quick-place' && app.modalState?.type === 'quick') { const inbox = button.dataset.place === 'inbox'; Object.assign(app.modalState.draft, { projectId: null, processed: !inbox, placePicked: true }); closePopover(); renderModal(); return true; }
    if (action === 'quick-template-pick') { const id = button.dataset.templateId; closePopover(); applyQuickTemplate(id); renderModal(); requestAnimationFrame(() => $('#quick-title')?.focus()); return true; }
    // The sheet's own buttons.
    const el = event?.target?.closest?.('[data-action]');
    if (action === 'quick-project-picker') openProjectPicker(el, { type: 'quick' });
    else if (action === 'quick-plan-picker') openPlanPicker(el, { type: 'quick' });
    else if (action === 'quick-template') openQuickTemplatePicker(el);
    else if (action === 'quick-template-clear') { clearQuickTemplate(); renderModal(); requestAnimationFrame(() => $('[data-action="quick-template"]')?.focus()); }
    else if (action === 'quick-more-options') createTask(false, true);
    else if (action === 'quick-keep') keepInQuickTitle(el.dataset.slot);
    else if (action === 'quick-suggest') applyQuickSuggestion(el.dataset.insert);
    else if (action === 'quick-paste-tasks') createPastedTasks();
    else if (action === 'quick-paste-one') joinPastedLines();
    else if (action === 'create-task') createTask(false);
    else if (action === 'create-task-continue') createTask(true);
    else if (action === 'quick-dictate') toggleDictation();
    else return undefined;
    return true;
  }

  // app.js passes typing (input), changes and keys here; the sheet reads only its title.
  function handleInput(event, ctx) {
    use(ctx);
    if (event.type === 'keydown') {
      if (app.modalState?.type === 'quick' && event.target?.id === 'quick-title' && event.key === 'Enter') {
        event.preventDefault(); createTask(event.shiftKey); return true;
      }
      return undefined;
    }
    if (event.type !== 'input' || app.modalState?.type !== 'quick' || event.target.id !== 'quick-title') return undefined;
    const d = app.modalState.draft; d.title = event.target.value; app.modalState.error = '';
    const parsed = parseQuickAddTitle(event.target.value, !d.explicitPlan, d.keepInTitle);
    const slot = document.querySelector('[data-quick-preview-slot]'); if (slot) slot.innerHTML = quickParsePreview(parsed);
    const suggest = document.querySelector('[data-quick-suggest-slot]'); if (suggest) suggest.innerHTML = quickSuggestHtml(event.target.value);
    if (!d.explicitPlan) d.parsedPlanDate = parsed.plannedDate;
    // Redesign R4: the selectors follow the title without redrawing the field.
    const planLabel = document.querySelector('[data-quick-plan-label]'); if (planLabel) planLabel.textContent = quickPlanLabel(d.explicitPlan ? d.plannedDate : (parsed.plannedDate || d.plannedDate), d.explicitPlannedTime ? d.plannedTime : (d.plannedTime || parsed.plannedTime));
    const placeLabel = document.querySelector('[data-quick-place-label]'); if (placeLabel) placeLabel.textContent = quickPlace(app.modalState.draft, parsed).label;
    return true;
  }

  window.TodoDomainModules?.register({
    name: 'quick-add',
    attach,
    renderRoute,
    handleAction,
    handleInput,
  });
})();
