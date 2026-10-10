(function () {
  'use strict';
  const I18n = window.TodoI18n;
  const { tr, trn, msg } = I18n;

  const TYPES = ['tasks', 'goals', 'habits'];
  const FILTER_KEYS = {
    tasks: ['areaId', 'projectId', 'tagId', 'priority', 'plannedDate', 'dueDate', 'completion'],
    goals: ['areaId', 'status', 'targetDate'],
    habits: ['areaId', 'status', 'trackingType', 'frequencyType']
  };

  const label = value => value[0].toUpperCase() + value.slice(1);
  // Display labels only; object types, filter keys and filter values stay persisted English ids.
  const TYPE_LABELS = { tasks: msg('Tasks'), goals: msg('Goals'), habits: msg('Habits') };
  const ALL_LABELS = { tasks: msg('All tasks'), goals: msg('All goals'), habits: msg('All habits') };
  const typeLabel = type => (TYPE_LABELS[type] ? tr(TYPE_LABELS[type]) : label(type));
  const FILTER_LABELS = { areaId: msg('Area'), projectId: msg('Project'), tagId: msg('Tag'), priority: msg('Priority'), completion: msg('Completion'), plannedDate: msg('Planned'), dueDate: msg('Due'), targetDate: msg('Target date'), status: msg('Status'), trackingType: msg('Tracking'), frequencyType: msg('Frequency') };
  const VALUE_LABELS = { none: msg('None'), low: msg('Low'), medium: msg('Medium'), high: msg('High'), open: msg('Open'), completed: msg('Completed'), active: msg('Active'), paused: msg('Paused'), archived: msg('Archived'), checkbox: msg('Checkbox'), numeric: msg('Numeric'), daily: msg('Daily'), weekdays: msg('Selected weekdays'), timesPerWeek: msg('X times per week'), everyNDays: msg('Every N days') };
  const valueLabel = value => (VALUE_LABELS[value] ? tr(VALUE_LABELS[value]) : label(String(value)));

  // Redesign R10d (S8): one card of views with their counts, a result screen with a menu, and an edit window whose filters
  // open sheets.
  const FILTER_ICONS = { areaId: 'ph-squares-four', projectId: 'ph-folder', tagId: 'ph-tag', priority: 'ph-flag', plannedDate: 'ph-calendar-blank', dueDate: 'ph-calendar-x', targetDate: 'ph-calendar-check', completion: 'ph-check-circle', status: 'ph-circle-half', trackingType: 'ph-check-square', frequencyType: 'ph-repeat' };
  const EDIT_LABELS = { areaId: msg('Area'), projectId: msg('Project'), tagId: msg('Tag'), priority: msg('Priority'), completion: msg('Completion'), plannedDate: msg('Planned date (exact day)'), dueDate: msg('Due date (exact day)'), targetDate: msg('Target date (exact day)'), status: msg('Status'), trackingType: msg('Tracking'), frequencyType: msg('Frequency') };
  const DATE_KEYS = ['plannedDate', 'dueDate', 'targetDate'];

  function filterText(context, key, value) {
    const { state, formatDate } = context;
    const names = { areaId: state.areas, projectId: state.projects, tagId: state.tags };
    if (names[key]) return names[key].find(item => item.id === value)?.name || tr('Missing reference');
    if (DATE_KEYS.includes(key)) return formatDate ? formatDate(value) : value;
    return valueLabel(value);
  }

  function summaryText(context, view) {
    const parts = Object.entries(view.filters || {}).filter(([, value]) => value).map(([key, value]) => `${FILTER_LABELS[key] ? tr(FILTER_LABELS[key]) : label(key)}: ${filterText(context, key, value)}`);
    return parts.length ? parts.join(' · ') : ALL_LABELS[view.type] ? tr(ALL_LABELS[view.type]) : `All ${label(view.type).toLowerCase()}`;
  }

  const results = (context, view) => context.Core.applySavedView(view, context.state, context.Core.dateOnly());

  function renderList(context) {
    const { state, pageHeader, esc } = context;
    const rows = state.savedViews.map(view => {
      const meta = [typeLabel(view.type), view.isPinned ? tr('pinned to “More”') : '', summaryText(context, view)].filter(Boolean).join(' · ');
      return `<button class="view-list-row" type="button" data-route="saved-view/${esc(view.id)}"><i class="ph ph-funnel view-list-icon" aria-hidden="true"></i><span class="view-list-main"><span class="task-title">${esc(view.name)}</span><span class="task-meta">${esc(meta)}</span></span><span class="view-list-count">${results(context, view).length}</span></button>`;
    }).join('');
    return pageHeader(tr('Saved Views'), tr('Saved filters for one kind of item.'), { add: false }) + `<div class="today-card views-list">${rows || `<p class="today-empty">${tr('No saved views yet. “+” saves the filters you use often.')}</p>`}<button class="inline-add" type="button" data-action="new-saved-view"><i class="ph ph-plus" aria-hidden="true"></i> ${tr('New saved view')}</button></div>`;
  }

  function renderDetail(context, id) {
    const { state, Core, pageHeader, esc, renderSavedViewItem, emptyState } = context;
    const view = state.savedViews.find(item => item.id === id);
    if (!view) return pageHeader(tr('Saved View not found'), tr('This view may have been deleted.'), { add: false });
    const today = Core.dateOnly(), rows = Core.applySavedView(view, state, today);
    const header = pageHeader(view.name, `${summaryText(context, view)} · ${rows.length}`, { add: false, actionHtml: `<button class="btn-icon" type="button" data-action="saved-view-menu" data-saved-view-id="${esc(view.id)}" aria-label="${tr('View actions')}"><i class="ph ph-dots-three"></i></button>` });
    if (!rows.length) return header + emptyState(tr('No matching items'), tr('Change this view’s filters for different results.'));
    const container = view.type === 'tasks' ? 'task-list today-card' : view.type === 'goals' ? 'today-card goals-list' : 'today-card';
    return `${header}<div class="${container}">${rows.map(item => renderSavedViewItem(view, item, today)).join('')}</div>`;
  }

  function openMenu(context, anchor, id) {
    const { state, esc } = context;
    const view = state.savedViews.find(item => item.id === id); if (!view) return;
    const option = (action, icon, text, danger = false) => `<button class="popover-option" type="button"${danger ? ' style="color:var(--danger)"' : ''} data-pop-action="${action}" data-saved-view-id="${esc(view.id)}"><i class="ph ${icon}"></i>${text}</button>`;
    context.openPopover(anchor, `${option('edit-saved-view', 'ph-pencil-simple', tr('Edit view'))}${option('duplicate-saved-view', 'ph-copy', tr('Duplicate view'))}${option('pin-saved-view', view.isPinned ? 'ph-push-pin-slash' : 'ph-push-pin', view.isPinned ? tr('Unpin from “More”') : tr('Pin to “More”'))}<div class="popover-separator"></div>${option('delete-saved-view', 'ph-trash', tr('Delete view'), true)}`, { type: 'saved-view-menu', savedViewId: id });
  }

  function openModal(context, id = null) {
    const { state, closePopover, copyTemplate, captureModalReturnFocus, setModalState, renderModal, $ } = context;
    captureModalReturnFocus();
    closePopover();
    const view = state.savedViews.find(item => item.id === id);
    setModalState({ type: 'saved-view', savedViewId: id, draft: view ? copyTemplate(view) : { name: '', type: 'tasks', filters: {}, isPinned: false }, error: '' });
    renderModal();
    requestAnimationFrame(() => $('#saved-view-name')?.focus());
  }

  function readDraft(context) {
    const input = context.$('#saved-view-name');
    if (input) context.modalState.draft.name = input.value;
  }

  function choices(context, key, type) {
    const { state } = context;
    return {
      areaId: state.areas.map(area => [area.id, area.name]),
      projectId: state.projects.map(project => [project.id, project.name]),
      tagId: state.tags.map(tag => [tag.id, tag.name]),
      priority: ['none', 'low', 'medium', 'high'].map(value => [value, valueLabel(value)]),
      completion: [['open', tr('Open')], ['completed', tr('Completed')]],
      status: (type === 'goals' ? ['active', 'paused', 'completed', 'archived'] : ['active', 'paused', 'archived']).map(value => [value, valueLabel(value)]),
      trackingType: [['checkbox', tr('Checkbox')], ['numeric', tr('Numeric')]],
      frequencyType: [['daily', tr('Daily')], ['weekdays', tr('Selected weekdays')], ['timesPerWeek', tr('X times per week')], ['everyNDays', tr('Every N days')]]
    }[key];
  }

  function renderModal(context) {
    const { modalState, esc, modalFrame } = context;
    const { draft, error } = modalState;
    const segment = `<div class="view-tabs habit-window-seg" role="group" aria-label="${tr('Object type')}">${TYPES.map(value => `<button class="btn${value === draft.type ? ' is-selected' : ''}" type="button" data-action="saved-view-type" data-value="${value}" aria-pressed="${value === draft.type}">${typeLabel(value)}</button>`).join('')}</div>`;
    const rows = FILTER_KEYS[draft.type].map(key => {
      const value = draft.filters[key] || '';
      return `<button class="task-window-row" type="button" data-action="saved-view-filter" data-field="${key}"><i class="ph ${FILTER_ICONS[key]}" aria-hidden="true"></i><span class="task-window-row-label">${tr(EDIT_LABELS[key])}</span><span class="task-window-row-value${value ? ' is-set' : ''}">${esc(value ? filterText(context, key, value) : tr('Any'))}</span><i class="ph ph-caret-right task-window-row-caret" aria-hidden="true"></i></button>`;
    }).join('');
    const now = results(context, draft).length;
    return modalFrame(`<div class="modal-inner quick-sheet view-window"><div class="modal-header"><h2 class="modal-title">${modalState.savedViewId ? tr('Edit saved view') : tr('New saved view')}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><input id="saved-view-name" class="quick-title-input${error ? ' is-error' : ''}" type="text" maxlength="80" autocomplete="off" placeholder="${tr('View name')}" value="${esc(draft.name)}" aria-label="${tr('View name')}">${error ? `<div class="validation" role="alert">${esc(error)}</div>` : ''}<h3 class="goal-details-label">${tr('Object type')}</h3>${segment}<h3 class="goal-details-label">${tr('Filters')}</h3><div class="habit-window-card">${rows}</div><button class="view-pin-toggle" type="button" data-action="saved-view-draft-pin" aria-pressed="${Boolean(draft.isPinned)}"><span class="sheet-check${draft.isPinned ? ' is-on' : ''}" aria-hidden="true"></span>${tr('Pin to “More”')}</button><p class="sheet-note">${tr('Results now: {count}', { count: now })}</p><div class="quick-sheet-footer"><span></span><button class="btn btn-primary habit-window-save" type="button" data-action="save-saved-view">${tr('Save view')}</button></div></div>`, 'quick');
  }

  let dateField = null;
  function openFilterSheet(context, anchor, key) {
    const { modalState, esc } = context;
    const draft = modalState.draft;
    if (!FILTER_KEYS[draft.type].includes(key)) return;
    const title = tr(EDIT_LABELS[key]);
    const current = draft.filters[key] || '';
    if (DATE_KEYS.includes(key)) {
      dateField = key;
      context.openPopover(anchor, `<div class="popover-title">${title}</div><label class="sheet-field"><i class="ph ph-calendar-blank" aria-hidden="true"></i><span>${tr('Date')}</span><input id="saved-view-date" class="input" type="date" value="${esc(current)}"></label><div class="sheet-footer"><button class="btn btn-ghost" type="button" data-pop-action="saved-view-date-clear">${tr('Clear')}</button><button class="btn btn-primary" type="button" data-pop-action="saved-view-date-apply">${tr('Apply')}</button></div>`, { type: 'saved-view-date' });
      return;
    }
    let options = choices(context, key, draft.type);
    if (current && !options.some(([option]) => option === current)) options = [...options, [current, tr('Missing reference')]];
    context.openPopover(anchor, `<div class="popover-title">${title}</div><div class="sheet-card" role="radiogroup" aria-label="${title}">${[['', tr('Any')], ...options].map(([value, text]) => `<button class="popover-option sheet-option${current === value ? ' is-selected' : ''}" type="button" role="radio" aria-checked="${current === value}" data-pop-action="saved-view-set-filter" data-field="${key}" data-value="${esc(value)}"><span class="sheet-option-label">${esc(text)}</span><span class="sheet-radio${current === value ? ' is-on' : ''}" aria-hidden="true"></span></button>`).join('')}</div>`, { type: 'saved-view-filter' });
  }

  function setFilter(context, key, value) {
    const draft = context.modalState.draft;
    if (!FILTER_KEYS[draft.type].includes(key)) return;
    if (value) draft.filters[key] = value; else delete draft.filters[key];
    context.closePopover(); context.renderModal();
  }

  function save(context) {
    const { modalState, renderModal, saveSavedViewDraft } = context;
    readDraft(context);
    if (!modalState.draft.name.trim()) { modalState.error = tr('Give this view a name.'); renderModal(); return; }
    saveSavedViewDraft(modalState.savedViewId, modalState.draft);
  }

  function changeType(context, type) {
    if (!TYPES.includes(type)) return;
    readDraft(context);
    const draft = context.modalState.draft;
    draft.type = type;
    draft.filters = Object.fromEntries(Object.entries(draft.filters).filter(([key]) => FILTER_KEYS[draft.type].includes(key)));
    const statuses = draft.type === 'goals' ? ['active', 'paused', 'completed', 'archived'] : ['active', 'paused', 'archived'];
    if (draft.filters.status && !statuses.includes(draft.filters.status)) delete draft.filters.status;
    context.modalState.error = '';
    context.renderModal();
  }

  window.TodoDomainModules?.register({
    name: 'saved-views',
    renderRoute(route, context) {
      if (route.type === 'saved-views') return renderList(context);
      if (route.type === 'saved-view') return renderDetail(context, route.id);
      if (route.type === 'modal' && route.modalType === 'saved-view') return renderModal(context);
    },
    handleAction(action, event, context) {
      const element = event?.target.closest('[data-action], [data-pop-action]');
      if (!element) return false;
      const id = element.dataset.savedViewId;
      const fromMenu = Boolean(element.dataset.popAction);
      if (action === 'new-saved-view') openModal(context);
      else if (action === 'saved-view-menu') openMenu(context, element, id);
      else if (action === 'edit-saved-view') openModal(context, id);
      else if (action === 'save-saved-view') save(context);
      else if (action === 'delete-saved-view') { if (fromMenu) context.closePopover(); context.requestDeleteEntity('saved-view', id); }
      else if (action === 'duplicate-saved-view') { if (fromMenu) context.closePopover(); context.duplicateSavedView(id); }
      else if (action === 'pin-saved-view') { if (fromMenu) context.closePopover(); context.toggleSavedViewPin(id); }
      else if (context.modalState?.type !== 'saved-view') return false;
      else if (action === 'saved-view-type') changeType(context, element.dataset.value);
      else if (action === 'saved-view-draft-pin') { readDraft(context); context.modalState.draft.isPinned = !context.modalState.draft.isPinned; context.renderModal(); }
      else if (action === 'saved-view-filter') { readDraft(context); openFilterSheet(context, element, element.dataset.field); }
      else if (action === 'saved-view-set-filter') setFilter(context, element.dataset.field, element.dataset.value);
      else if (action === 'saved-view-date-apply' && dateField) { const value = String(context.$('#saved-view-date')?.value || ''); setFilter(context, dateField, context.Core.parseDateOnly(value) ? value : ''); }
      else if (action === 'saved-view-date-clear' && dateField) setFilter(context, dateField, '');
      else return false;
      return true;
    }
  });
})();
