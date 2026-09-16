(function () {
  'use strict';

  const TYPES = ['tasks', 'goals', 'habits'];
  const FILTER_KEYS = {
    tasks: ['areaId', 'projectId', 'tagId', 'priority', 'plannedDate', 'dueDate', 'completion'],
    goals: ['areaId', 'status', 'targetDate'],
    habits: ['areaId', 'status', 'trackingType', 'frequencyType']
  };

  const label = value => value[0].toUpperCase() + value.slice(1);

  function actions(context, view) {
    const { esc } = context;
    return `<div class="modal-footer-actions">${[['edit-saved-view', 'ph-pencil-simple', 'Edit view'], ['duplicate-saved-view', 'ph-copy', 'Duplicate view'], ['pin-saved-view', 'ph-push-pin', view.isPinned ? 'Unpin view' : 'Pin view'], ['delete-saved-view', 'ph-trash', 'Delete view']].map(([action, icon, text]) => `<button class="btn-icon" type="button" data-action="${action}" data-saved-view-id="${esc(view.id)}" aria-label="${text}" title="${text}"><i class="ph ${icon}"></i></button>`).join('')}</div>`;
  }

  function renderList(context) {
    const { state, pageHeader, esc } = context;
    return pageHeader('Saved Views', 'Reusable filters for one object type.', { add: false, actionHtml: '<button class="btn btn-primary" data-action="new-saved-view"><i class="ph ph-plus"></i> New saved view</button>' }) + `<section class="section">${state.savedViews.length ? state.savedViews.map(view => `<article class="goal-row" data-saved-view-row="${esc(view.id)}"><button class="goal-open" type="button" data-route="saved-view/${esc(view.id)}"><strong>${esc(view.name)}</strong><small>${esc(label(view.type))}${view.isPinned ? ' · Pinned' : ''}</small></button>${actions(context, view)}</article>`).join('') : '<p class="area-empty-copy">No saved views yet. Create a filter you can return to.</p>'}</section>`;
  }

  function renderDetail(context, id) {
    const { state, Core, pageHeader, esc, renderSavedViewItem } = context;
    const view = state.savedViews.find(item => item.id === id);
    if (!view) return pageHeader('Saved View not found', 'This view may have been deleted.', { add: false });
    const today = Core.dateOnly(), rows = Core.applySavedView(view, state, today);
    return pageHeader(view.name, `${rows.length} ${view.type}`, { add: false, actionHtml: actions(context, view) }) + `<section class="section" data-saved-results="${esc(id)}">${rows.length ? rows.map(item => renderSavedViewItem(view, item, today)).join('') : '<p class="area-empty-copy">No matching items. Adjust this view’s filters to change the results.</p>'}</section>`;
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
      priority: ['none', 'low', 'medium', 'high'].map(value => [value, label(value)]),
      completion: [['open', 'Open'], ['completed', 'Completed']],
      status: (draft.type === 'goals' ? ['active', 'paused', 'completed', 'archived'] : ['active', 'paused', 'archived']).map(value => [value, label(value)]),
      trackingType: [['checkbox', 'Checkbox'], ['numeric', 'Numeric']],
      frequencyType: [['daily', 'Daily'], ['weekdays', 'Selected weekdays'], ['timesPerWeek', 'X times per week'], ['everyNDays', 'Every N days']]
    };
    const labels = { areaId: 'Area', projectId: 'Project', tagId: 'Tag', priority: 'Priority', completion: 'Completion', plannedDate: 'Planned date (exact day)', dueDate: 'Due date (exact day)', targetDate: 'Target date (exact day)', status: 'Status', trackingType: 'Tracking', frequencyType: 'Frequency' };
    const fields = FILTER_KEYS[draft.type].map(key => {
      let options = choices[key]; const value = draft.filters[key] || '';
      if (options && value && !options.some(([option]) => option === value)) options = [...options, [value, 'Missing reference']];
      return `<label class="field-label">${labels[key]}${options ? `<select class="input" data-saved-filter="${key}"><option value="">Any</option>${options.map(([option, text]) => `<option value="${esc(option)}" ${option === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>` : `<input class="input" type="date" data-saved-filter="${key}" value="${esc(value)}" />`}</label>`;
    }).join('');
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${modalState.savedViewId ? 'Edit' : 'New'} saved view</h2><button class="btn-icon" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><label class="field-label" for="saved-view-name">Name</label><input class="input" id="saved-view-name" value="${esc(draft.name)}" /><label class="field-label" for="saved-view-type">Object type</label><select class="input" id="saved-view-type">${TYPES.map(value => `<option value="${value}" ${value === draft.type ? 'selected' : ''}>${label(value)}</option>`).join('')}</select><div class="template-fields">${fields}</div><label class="field-label"><input id="saved-view-pinned" type="checkbox" ${draft.isPinned ? 'checked' : ''} /> Pin to sidebar</label>${error ? `<p class="validation" role="alert">${esc(error)}</p>` : ''}<div class="modal-footer"><button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-saved-view">Save view</button></div></div>`, 'quick');
  }

  function save(context) {
    const { modalState, renderModal, saveSavedViewDraft } = context;
    readDraft(context);
    if (!modalState.draft.name.trim()) { modalState.error = 'Give this view a name.'; renderModal(); return; }
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
