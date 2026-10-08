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

  function actions(context, view) {
    const { esc } = context;
    return `<div class="modal-footer-actions">${[['edit-saved-view', 'ph-pencil-simple', tr('Edit view')], ['duplicate-saved-view', 'ph-copy', tr('Duplicate view')], ['pin-saved-view', 'ph-push-pin', view.isPinned ? tr('Unpin view') : tr('Pin view')], ['delete-saved-view', 'ph-trash', tr('Delete view')]].map(([action, icon, text]) => `<button class="btn-icon" type="button" data-action="${action}" data-saved-view-id="${esc(view.id)}" aria-label="${text}" title="${text}"><i class="ph ${icon}"></i></button>`).join('')}</div>`;
  }

  function filterSummary(context, view) {
    const { state, esc, formatDate } = context;
    const filters = view.filters || {};
    const names = { areaId: state.areas, projectId: state.projects, tagId: state.tags };
    const parts = Object.entries(filters).filter(([, value]) => value).map(([key, value]) => {
      let text = value;
      if (names[key]) text = names[key].find(item => item.id === value)?.name || tr('Missing reference');
      else if (['plannedDate', 'dueDate', 'targetDate'].includes(key)) text = formatDate ? formatDate(value) : value;
      else text = valueLabel(value);
      return `${FILTER_LABELS[key] ? tr(FILTER_LABELS[key]) : label(key)}: ${text}`;
    });
    const summary = parts.length ? parts.join(' · ') : ALL_LABELS[view.type] ? tr(ALL_LABELS[view.type]) : `All ${label(view.type).toLowerCase()}`;
    return `<span class="goal-row-meta"><small>${esc(summary)}</small></span>`;
  }

  function renderList(context) {
    const { state, pageHeader, esc } = context;
    return pageHeader(tr('Saved Views'), tr('Reusable filters for one object type.'), { add: false, actionHtml: `<button class="btn btn-primary" data-action="new-saved-view"><i class="ph ph-plus"></i> ${tr('New saved view')}</button>` }) + `<section class="section">${state.savedViews.length ? state.savedViews.map(view => `<article class="goal-row" data-saved-view-row="${esc(view.id)}"><button class="goal-open" type="button" data-route="saved-view/${esc(view.id)}"><span class="goal-row-top"><strong>${esc(view.name)}</strong><small>${esc(typeLabel(view.type))}${view.isPinned ? ` · ${tr('Pinned')}` : ''}</small></span>${filterSummary(context, view)}</button>${actions(context, view)}</article>`).join('') : `<p class="area-empty-copy">${tr('No saved views yet. Create a filter you can return to.')}</p>`}</section>`;
  }

  function renderDetail(context, id) {
    const { state, Core, pageHeader, esc, renderSavedViewItem } = context;
    const view = state.savedViews.find(item => item.id === id);
    if (!view) return pageHeader(tr('Saved View not found'), tr('This view may have been deleted.'), { add: false });
    const today = Core.dateOnly(), rows = Core.applySavedView(view, state, today);
    const count = view.type === 'goals' ? trn(rows.length, '{count} goal', '{count} goals') : view.type === 'habits' ? trn(rows.length, '{count} habit', '{count} habits') : view.type === 'tasks' ? trn(rows.length, '{count} task', '{count} tasks') : `${rows.length} ${view.type}`;
    return pageHeader(view.name, count, { add: false, actionHtml: actions(context, view) }) + `<section class="section" data-saved-results="${esc(id)}">${rows.length ? rows.map(item => renderSavedViewItem(view, item, today)).join('') : `<p class="area-empty-copy">${tr('No matching items. Adjust this view’s filters to change the results.')}</p>`}</section>`;
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
    const { modalState, $, $$ } = context;
    const draft = modalState.draft;
    draft.name = $('#saved-view-name').value;
    draft.isPinned = $('#saved-view-pinned').checked;
    draft.filters = Object.fromEntries($$('[data-saved-filter]').filter(element => element.value).map(element => [element.dataset.savedFilter, element.value]));
  }

  function renderModal(context) {
    const { state, modalState, esc, modalFrame } = context;
    const { draft, error } = modalState;
    const choices = {
      areaId: state.areas.map(area => [area.id, area.name]),
      projectId: state.projects.map(project => [project.id, project.name]),
      tagId: state.tags.map(tag => [tag.id, tag.name]),
      priority: ['none', 'low', 'medium', 'high'].map(value => [value, valueLabel(value)]),
      completion: [['open', tr('Open')], ['completed', tr('Completed')]],
      status: (draft.type === 'goals' ? ['active', 'paused', 'completed', 'archived'] : ['active', 'paused', 'archived']).map(value => [value, valueLabel(value)]),
      trackingType: [['checkbox', tr('Checkbox')], ['numeric', tr('Numeric')]],
      frequencyType: [['daily', tr('Daily')], ['weekdays', tr('Selected weekdays')], ['timesPerWeek', tr('X times per week')], ['everyNDays', tr('Every N days')]]
    };
    const labels = { areaId: tr('Area'), projectId: tr('Project'), tagId: tr('Tag'), priority: tr('Priority'), completion: tr('Completion'), plannedDate: tr('Planned date (exact day)'), dueDate: tr('Due date (exact day)'), targetDate: tr('Target date (exact day)'), status: tr('Status'), trackingType: tr('Tracking'), frequencyType: tr('Frequency') };
    const fields = FILTER_KEYS[draft.type].map(key => {
      let options = choices[key]; const value = draft.filters[key] || '';
      if (options && value && !options.some(([option]) => option === value)) options = [...options, [value, tr('Missing reference')]];
      return `<label class="field-label">${labels[key]}${options ? `<select class="input" data-saved-filter="${key}"><option value="">${tr('Any')}</option>${options.map(([option, text]) => `<option value="${esc(option)}" ${option === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>` : `<input class="input" type="date" data-saved-filter="${key}" value="${esc(value)}" />`}</label>`;
    }).join('');
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${modalState.savedViewId ? tr('Edit saved view') : tr('New saved view')}</h2><button class="btn-icon" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div><label class="field-label" for="saved-view-name">${tr('Name')}</label><input class="input" id="saved-view-name" value="${esc(draft.name)}" /><label class="field-label" for="saved-view-type">${tr('Object type')}</label><select class="input" id="saved-view-type">${TYPES.map(value => `<option value="${value}" ${value === draft.type ? 'selected' : ''}>${typeLabel(value)}</option>`).join('')}</select><div class="template-fields">${fields}</div><label class="field-label"><input id="saved-view-pinned" type="checkbox" ${draft.isPinned ? 'checked' : ''} /> ${tr('Pin to sidebar')}</label>${error ? `<p class="validation" role="alert">${esc(error)}</p>` : ''}<div class="modal-footer"><button class="btn btn-ghost" data-action="close-modal">${tr('Cancel')}</button><button class="btn btn-primary" data-action="save-saved-view">${tr('Save view')}</button></div></div>`, 'quick');
  }

  function save(context) {
    const { modalState, renderModal, saveSavedViewDraft } = context;
    readDraft(context);
    if (!modalState.draft.name.trim()) { modalState.error = tr('Give this view a name.'); renderModal(); return; }
    saveSavedViewDraft(modalState.savedViewId, modalState.draft);
  }

  function changeType(context, event) {
    readDraft(context);
    const draft = context.modalState.draft;
    draft.type = event.target.value;
    draft.filters = Object.fromEntries(Object.entries(draft.filters).filter(([key]) => FILTER_KEYS[draft.type].includes(key)));
    const statuses = draft.type === 'goals' ? ['active', 'paused', 'completed', 'archived'] : ['active', 'paused', 'archived'];
    if (draft.filters.status && !statuses.includes(draft.filters.status)) delete draft.filters.status;
    context.modalState.error = '';
    context.renderModal();
    context.$('#saved-view-type')?.focus();
  }

  window.TodoDomainModules?.register({
    name: 'saved-views',
    renderRoute(route, context) {
      if (route.type === 'saved-views') return renderList(context);
      if (route.type === 'saved-view') return renderDetail(context, route.id);
      if (route.type === 'modal' && route.modalType === 'saved-view') return renderModal(context);
    },
    handleAction(action, event, context) {
      const element = event?.target.closest('[data-action]');
      if (!element) return false;
      if (action === 'new-saved-view') openModal(context);
      else if (action === 'edit-saved-view') openModal(context, element.dataset.savedViewId);
      else if (action === 'save-saved-view') save(context);
      else if (action === 'delete-saved-view') context.requestDeleteEntity('saved-view', element.dataset.savedViewId);
      else if (action === 'duplicate-saved-view') context.duplicateSavedView(element.dataset.savedViewId);
      else if (action === 'pin-saved-view') context.toggleSavedViewPin(element.dataset.savedViewId);
      else return false;
      return true;
    },
    handleInput(event, context) {
      if (context.modalState?.type !== 'saved-view' || event.type !== 'change' || event.target.id !== 'saved-view-type') return false;
      changeType(context, event);
      return true;
    }
  });
})();
