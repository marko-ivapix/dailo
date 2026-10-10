(function () {
  'use strict';
  const { tr, trn, msg } = window.TodoI18n;

  const knowledgeIcon = type => type === 'note' ? 'ph-note' : 'ph-link';
  const RESOURCE_TYPES = { book: msg('Book'), video: msg('Video'), article: msg('Article'), course: msg('Course'), document: msg('Document'), other: msg('Other') };
  const RESOURCE_STATUSES = { unread: msg('Unread'), reading: msg('Reading'), completed: msg('Completed') };
  const RELATIONS = [['relatedTaskIds', msg('Related Tasks'), 'tasks'], ['relatedProjectIds', msg('Related Projects'), 'projects'], ['relatedGoalIds', msg('Related Goals'), 'goals'], ['relatedHabitIds', msg('Related Habits'), 'habits']];
  const FILTER_FIELDS = { note: ['areaId', 'tagId'], resource: ['type', 'status', 'areaId', 'tagId'] };

  function favoriteButton(context, type, item) {
    return `<button class="btn-icon knowledge-favorite ${item.favorite ? 'is-favorite' : ''}" type="button" data-action="toggle-knowledge-favorite" data-owner-type="${type}" data-owner-id="${context.esc(item.id)}" aria-label="${item.favorite ? tr('Remove from favorites') : tr('Add to favorites')}" aria-pressed="${Boolean(item.favorite)}"><i class="${item.favorite ? 'ph-fill ph-star' : 'ph ph-star'}"></i></button>`;
  }

  // Redesign R10b (S3): one list per screen, newest first, with filter chips that open choice sheets.
  function renderKnowledgeRow(context, type, item) {
    const { esc, getArea, state } = context;
    const area = getArea(item.areaId)?.name;
    const meta = type === 'resource'
      ? [`${tr(RESOURCE_TYPES[item.type] || 'Article')} · ${tr(RESOURCE_STATUSES[item.status] || 'Unread')}`, area]
      : [area || tr('No area'), item.linkUrls.length ? trn(item.linkUrls.length, '{count} link', '{count} links') : '', item.attachmentIds.length ? trn(item.attachmentIds.length, '{count} file', '{count} files') : ''];
    const dots = (item.tagIds || []).map(id => state.tags.find(tag => tag.id === id)).filter(Boolean).map(tag => `<span class="knowledge-tag-dot" style="--tag-color:${esc(tag.color)}" title="${esc(tag.name)}"></span>`).join('');
    return `<div class="today-row knowledge-row"><i class="ph ${knowledgeIcon(type)} knowledge-row-icon" aria-hidden="true"></i><button class="today-row-main" type="button" data-route="${type}/${esc(item.id)}"><span class="task-title">${esc(item.title)}</span><span class="task-meta">${esc(meta.filter(Boolean).join(' · '))}${dots}</span></button>${favoriteButton(context, type, item)}</div>`;
  }

  function filterOptions(context, field) {
    const { state } = context;
    if (field === 'areaId') return [['', tr('All areas')], ['__none', tr('No area')], ...state.areas.map(area => [area.id, area.name])];
    if (field === 'tagId') return [['', tr('All tags')], ...state.tags.map(tag => [tag.id, tag.name])];
    if (field === 'type') return [['', tr('All types')], ...Object.entries(RESOURCE_TYPES).map(([key, label]) => [key, tr(label)])];
    return [['', tr('All statuses')], ...Object.entries(RESOURCE_STATUSES).map(([key, label]) => [key, tr(label)])];
  }
  const FILTER_TITLES = { areaId: msg('Area'), tagId: msg('Tag'), type: msg('Type'), status: msg('Status') };

  function renderKnowledgeList(context, type) {
    const { state, knowledgeCollection, pageHeader, esc, emptyState } = context;
    const filters = state.ui.knowledgeFilters?.[type] || {};
    const collection = state[knowledgeCollection(type)];
    const items = collection.filter(item => (!filters.type || item.type === filters.type)
      && (!filters.status || item.status === filters.status)
      && (filters.favorite !== 'true' || item.favorite === true)
      && (!filters.areaId || (filters.areaId === '__none' ? !item.areaId : item.areaId === filters.areaId))
      && (!filters.tagId || (item.tagIds || []).includes(filters.tagId)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const any = filters.favorite === 'true' || FILTER_FIELDS[type].some(field => filters[field]);
    const summary = any
      ? (type === 'note' ? trn(collection.length, '{shown} of {count} note', '{shown} of {count} notes', { shown: items.length }) : trn(collection.length, '{shown} of {count} resource', '{shown} of {count} resources', { shown: items.length }))
      : (type === 'note' ? trn(collection.length, '{count} note', '{count} notes') : trn(collection.length, '{count} resource', '{count} resources'));
    const favorite = filters.favorite === 'true';
    const chip = field => {
      const value = filters[field] || '';
      const label = value ? filterOptions(context, field).find(([key]) => key === value)?.[1] || tr(FILTER_TITLES[field]) : tr(FILTER_TITLES[field]);
      return `<button class="quick-chip${value ? ' is-selected' : ''}" type="button" data-action="knowledge-filter" data-owner-type="${type}" data-field="${field}">${esc(label)} <i class="ph ph-caret-down" aria-hidden="true"></i></button>`;
    };
    const chips = `<div class="sheet-chips knowledge-chips"><button class="quick-chip${favorite ? ' is-selected' : ''}" type="button" data-action="knowledge-favorite-filter" data-owner-type="${type}" aria-pressed="${favorite}"><i class="${favorite ? 'ph-fill' : 'ph'} ph-star" aria-hidden="true"></i> ${tr('Favorites')}</button>${FILTER_FIELDS[type].map(chip).join('')}${any ? `<button class="quick-chip knowledge-clear" type="button" data-action="clear-knowledge-filters" data-owner-type="${type}">${tr('Clear filters')}</button>` : ''}</div>`;
    const body = items.length ? `<div class="today-card knowledge-list">${items.map(item => renderKnowledgeRow(context, type, item)).join('')}</div>`
      : collection.length ? `<p class="today-empty knowledge-empty">${tr('No items match these filters.')}</p>`
        : emptyState(type === 'note' ? tr('No notes yet') : tr('No resources yet'), tr('“+” at the bottom right adds a new one.'));
    return pageHeader(type === 'note' ? tr('Notes') : tr('Resources'), summary, { add: false }) + chips + body;
  }

  function openFilterSheet(context, anchor, type, field) {
    if (!FILTER_FIELDS[type]?.includes(field)) return;
    const { esc } = context;
    const current = context.state.ui.knowledgeFilters?.[type]?.[field] || '';
    const title = tr(FILTER_TITLES[field]);
    context.openPopover(anchor, `<div class="popover-title">${title}</div><div class="sheet-card" role="radiogroup" aria-label="${title}">${filterOptions(context, field).map(([value, label]) => `<button class="popover-option sheet-option${current === value ? ' is-selected' : ''}" type="button" role="radio" aria-checked="${current === value}" data-pop-action="knowledge-set-filter" data-owner-type="${type}" data-field="${field}" data-value="${esc(value)}"><span class="sheet-option-label">${esc(label)}</span><span class="sheet-radio${current === value ? ' is-on' : ''}" aria-hidden="true"></span></button>`).join('')}</div>`, { type: 'knowledge-filter' });
  }

  function setFilter(context, type, field, value) {
    if (!['note', 'resource'].includes(type) || !(field === 'favorite' || FILTER_FIELDS[type].includes(field))) return;
    const filters = context.state.ui.knowledgeFilters ||= {};
    filters[type] ||= {};
    if (value) filters[type][field] = value; else delete filters[type][field];
    context.closePopover(); context.saveAndRender();
  }

  // The window: a note or resource opens like the task window. An existing item saves at once; a new one waits for
  // "Napravi belešku" / "Napravi resurs" and then stays open on the saved item.
  function draftFrom(type, item, areaId = null) {
    return { title: item?.title || '', text: (type === 'note' ? item?.body : item?.description) || '', areaId: item?.areaId || areaId || null, linkUrls: [...(item?.linkUrls || [])], linkDraft: '',
      tagIds: [...(item?.tagIds || [])],
      favorite: item?.favorite === true, clip: item?.clip || '',
      resourceType: item?.type || 'article', resourceStatus: item?.status || 'unread', author: item?.author || '', reviewedAt: item?.reviewedAt || '',
      relatedTaskIds: [...(item?.relatedTaskIds || [])], relatedProjectIds: [...(item?.relatedProjectIds || [])], relatedGoalIds: [...(item?.relatedGoalIds || [])], relatedHabitIds: [...(item?.relatedHabitIds || [])] };
  }

  function openKnowledgeModal(context, type, id = null, areaId = null, options = {}) {
    const { attachmentOwner, closePopover, flushTextSave, goalFocusTarget, renderModal, $, loadOwnerAttachments } = context;
    if (!['note', 'resource'].includes(type)) return;
    const owner = id && attachmentOwner({ ownerType: type, ownerId: id });
    if (id && !owner) return;
    closePopover(); flushTextSave();
    const item = owner?.item;
    sheet = null;
    context.setModalState({ type: 'knowledge', ownerType: type, ownerId: id, source: item || null, inbox: Boolean(options.inbox), returnFocus: goalFocusTarget(), error: '', attachmentRecords: [], attachmentMessage: '', pendingFiles: [], draft: draftFrom(type, item, areaId) });
    renderModal();
    if (!id) requestAnimationFrame(() => $('#knowledge-title')?.focus());
    if (id) loadOwnerAttachments({ ownerType: type, ownerId: id });
  }

  function readKnowledgeDraft(context) {
    const { modalState, $ } = context;
    if (modalState?.type !== 'knowledge') return;
    const d = modalState.draft;
    d.title = $('#knowledge-title')?.value ?? d.title;
    d.text = $('#knowledge-text')?.value ?? d.text;
    d.linkDraft = $('#knowledge-link')?.value ?? d.linkDraft;
  }

  // The checks shared by saving a new item and by every change to an existing one.
  function checkDraft(context, type, d, attachmentIds) {
    const { state, getArea, Core } = context;
    const checked = Core.validateKnowledgeRecord({ type, title: d.title, linkUrls: d.linkUrls, attachmentIds });
    if (!checked.valid) {
      return { field: checked.errors.includes('title') ? 'title' : '', error: checked.errors.includes('title') ? (type === 'note' ? tr('Note needs a Name.') : tr('Resource needs a Name.'))
        : checked.errors.includes('linkUrls') ? tr('Use valid web or email links.')
          : tr('Resource needs at least one URL, image, or attached file.') };
    }
    if (d.areaId && !getArea(d.areaId)) return { error: tr('The selected Area no longer exists.') };
    if (type === 'resource' && (!Object.hasOwn(RESOURCE_TYPES, d.resourceType) || !Object.hasOwn(RESOURCE_STATUSES, d.resourceStatus)
      || d.reviewedAt && (!Core.parseDateOnly(d.reviewedAt) || Core.dateOnly(Core.parseDateOnly(d.reviewedAt)) !== d.reviewedAt))) {
      return { error: tr('Choose a valid type, reading status and review date.') };
    }
    if (type === 'resource' && RELATIONS.some(([field, , collection]) => d[field].some(id => !state[collection].some(candidate => candidate.id === id)))) {
      return { error: tr('A related item changed. Reopen this Resource before saving.') };
    }
    return { checked };
  }

  function assignDraft(item, type, d, checked, ts) {
    Object.assign(item, { title: checked.normalized.title, areaId: d.areaId, tagIds: [...new Set(d.tagIds || [])], linkUrls: checked.normalized.linkUrls, updatedAt: ts, [type === 'note' ? 'body' : 'description']: d.text });
    Object.assign(item, { favorite: Boolean(d.favorite), clip: d.clip || '' });
    if (type === 'resource') {
      Object.assign(item, { type: d.resourceType, status: d.resourceStatus, author: d.author.trim(), reviewedAt: d.reviewedAt || null });
      for (const [field] of RELATIONS) item[field] = [...d[field]];
    }
  }

  // An existing item saves each change at once; a refused change leaves the item and the window as they were.
  function commitKnowledge(context) {
    const { modalState: dialog, attachmentOwner, copyTemplate, saveState, nowIso } = context;
    if (dialog?.type !== 'knowledge') return false;
    dialog.error = ''; dialog.errorField = '';
    if (!dialog.ownerId) { context.renderModal(); return true; }
    const type = dialog.ownerType, d = dialog.draft;
    const owner = attachmentOwner({ ownerType: type, ownerId: dialog.ownerId });
    if (!owner || owner.item !== dialog.source) { dialog.error = tr('The item changed. Reopen it before saving.'); context.renderModal(); return false; }
    const item = owner.item;
    const refuse = (error, field = '') => { dialog.draft = { ...draftFrom(type, item), linkDraft: d.linkDraft }; dialog.error = error; dialog.errorField = field; context.renderModal(); return false; };
    const result = checkDraft(context, type, d, item.attachmentIds);
    if (result.error) return refuse(result.error, result.field);
    const previous = copyTemplate(item);
    assignDraft(item, type, d, result.checked, nowIso());
    if (!saveState()) { Object.assign(item, previous); return refuse(tr('Changes could not be saved locally. Try again.')); }
    dialog.draft = { ...draftFrom(type, item), linkDraft: d.linkDraft };
    context.render(); context.renderModal(); return true;
  }

  function addKnowledgeLink(context) {
    const { modalState, renderModal, $ } = context;
    readKnowledgeDraft(context);
    const d = modalState.draft, value = d.linkDraft.trim();
    if (!value) { modalState.error = tr('Enter a link before adding it.'); renderModal(); requestAnimationFrame(() => $('#knowledge-link')?.focus()); return false; }
    const checked = context.Core.validateKnowledgeRecord({ type: modalState.ownerType, title: 'Link', linkUrls: [value], attachmentIds: ['pending-link'] });
    const url = checked.normalized.linkUrls[0];
    if (!url || d.linkUrls.includes(url)) { modalState.error = url ? tr('This link has already been added.') : tr('Use a valid web or email link.'); renderModal(); requestAnimationFrame(() => $('#knowledge-link')?.focus()); return false; }
    d.linkUrls.push(url); d.linkDraft = '';
    const saved = commitKnowledge(context);
    requestAnimationFrame(() => $('#knowledge-link')?.focus());
    return saved;
  }

  async function saveKnowledge(context) {
    const { state, undoHold, modalState, renderModal, attachmentOwner, nowIso, uid, knowledgeCollection, saveState, addAttachments, render, setToastMessage } = context;
    if (!state || undoHold || modalState?.type !== 'knowledge' || modalState.busy || modalState.ownerId) return;
    readKnowledgeDraft(context);
    const dialog = modalState, type = dialog.ownerType, d = dialog.draft;
    if (d.linkDraft.trim()) {
      const before = d.linkUrls.length;
      if (!addKnowledgeLink(context) || d.linkUrls.length === before) return;
    }
    const result = checkDraft(context, type, d, dialog.pendingFiles.map((_, index) => `pending-${index}`));
    if (result.error) { dialog.error = result.error; dialog.errorField = result.field || ''; renderModal(); return; }
    const { checked } = result;
    const ts = nowIso(), item = { id: uid(type), createdAt: ts, attachmentIds: [] };
    assignDraft(item, type, d, checked, ts);
    item.isInbox = Boolean(dialog.inbox); // made from the "+" menu, it waits in Inbox
    // A resource whose only source is a file waits for the upload; a note needs only a name (R10b).
    const deferInitialSave = Boolean(type === 'resource' && !checked.normalized.linkUrls.length && dialog.pendingFiles.length);
    state[knowledgeCollection(type)].push(item);
    if (!deferInitialSave && !saveState()) {
      state[knowledgeCollection(type)].splice(state[knowledgeCollection(type)].indexOf(item), 1);
      dialog.error = tr('Changes could not be saved locally. Try again.'); renderModal(); return;
    }
    dialog.busy = true;
    dialog.ownerId = item.id; dialog.source = item;
    const attachmentResult = dialog.pendingFiles.length ? await addAttachments({ ownerType: type, ownerId: item.id, deferSave: deferInitialSave }, dialog.pendingFiles) : null;
    const fileMessage = typeof attachmentResult === 'string' ? attachmentResult : attachmentResult?.message || '';
    if (deferInitialSave && !attachmentResult?.added && !item.attachmentIds.length) {
      state[knowledgeCollection(type)].splice(state[knowledgeCollection(type)].indexOf(item), 1);
      dialog.ownerId = null; dialog.source = null; dialog.busy = false;
      dialog.error = tr('Attachment upload failed. This Resource could not be stored because it needs a URL, image, or attached file.');
      renderModal(); return;
    }
    if (deferInitialSave && !saveState()) {
      state[knowledgeCollection(type)].splice(state[knowledgeCollection(type)].indexOf(item), 1);
      dialog.ownerId = null; dialog.source = null; dialog.busy = false;
      dialog.error = tr('This Resource could not be stored locally. Try again.');
      renderModal(); return;
    }
    dialog.busy = false; dialog.pendingFiles = []; dialog.error = '';
    dialog.draft = draftFrom(type, item);
    render();
    if (context.modalState === dialog) renderModal();
    setToastMessage([type === 'note' ? tr('Note created') : tr('Resource created'), fileMessage].filter(Boolean).join('. '));
    if (attachmentOwner({ ownerType: type, ownerId: item.id })) context.loadOwnerAttachments?.({ ownerType: type, ownerId: item.id });
  }

  function windowRow(context, action, icon, label, value, empty = tr('Not set'), extra = '') {
    return `<button class="task-window-row" type="button" data-action="${action}"${extra}><i class="ph ${icon}" aria-hidden="true"></i><span class="task-window-row-label">${label}</span><span class="task-window-row-value${value ? ' is-set' : ''}">${context.esc(value || empty)}</span><i class="ph ph-caret-right task-window-row-caret" aria-hidden="true"></i></button>`;
  }
  function linkHtml(context, url) {
    const { esc } = context;
    let safe = false;
    try { safe = ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol); } catch (_) {}
    return safe ? `<a class="knowledge-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>` : `<span class="knowledge-link">${esc(url)}</span>`;
  }
  const names = (context, collection, ids) => context.state[collection].filter(item => ids.includes(item.id)).map(item => item.title || item.name).join(', ');

  function renderKnowledgeModal(context) {
    const { modalState, esc, modalFrame, renderAttachmentsSection, getArea } = context;
    const type = modalState.ownerType, d = modalState.draft, isNew = !modalState.ownerId, resource = type === 'resource';
    const star = `<button class="btn-icon knowledge-favorite${d.favorite ? ' is-favorite' : ''}" type="button" data-action="knowledge-window-favorite" aria-pressed="${d.favorite}" aria-label="${d.favorite ? tr('Remove from favorites') : tr('Add to favorites')}"><i class="${d.favorite ? 'ph-fill ph-star' : 'ph ph-star'}"></i></button>`;
    const menu = isNew ? '' : `<button class="btn-icon" type="button" data-action="knowledge-menu" aria-label="${resource ? tr('Resource actions') : tr('Note actions')}"><i class="ph ph-dots-three"></i></button>`;
    let html = `<div class="modal-header task-window-header"><span class="task-window-kind">${resource ? tr('Resource') : tr('Note')}</span><div class="task-window-actions">${star}${menu}<button class="btn-icon" type="button" data-action="close-modal" aria-label="${tr('Close')}"><i class="ph ph-x"></i></button></div></div>`;
    const titleError = modalState.errorField === 'title';
    html += `<input id="knowledge-title" class="quick-title-input${titleError ? ' is-error' : ''}" type="text" maxlength="120" autocomplete="off" placeholder="${resource ? tr('Resource name') : tr('Note name')}" value="${esc(d.title)}" aria-label="${tr('Name')}">`;
    html += `<button class="goal-details-area" type="button" data-action="knowledge-area"><i class="ph ph-squares-four" aria-hidden="true"></i>${esc(getArea(d.areaId)?.name || tr('No area'))}</button>`;
    if (resource) html += `<div class="habit-window-card">${windowRow(context, 'knowledge-type', 'ph-books', tr('Type'), tr(RESOURCE_TYPES[d.resourceType] || 'Article'))}${windowRow(context, 'knowledge-status', 'ph-book-open', tr('Reading status'), tr(RESOURCE_STATUSES[d.resourceStatus] || 'Unread'))}${windowRow(context, 'knowledge-author', 'ph-user', tr('Author'), d.author, tr('No author'))}${windowRow(context, 'knowledge-reviewed', 'ph-calendar-check', tr('Last reviewed'), d.reviewedAt ? context.formatDate(d.reviewedAt) : '', tr('Not reviewed yet'))}</div>`;
    html += `<h3 class="goal-details-label">${resource ? tr('Description') : tr('Text')}</h3><textarea id="knowledge-text" class="input knowledge-text" rows="5" placeholder="${resource ? tr('Description') : tr('Note text')}">${esc(d.text)}</textarea>`;
    if (d.clip) html += `<h3 class="goal-details-label">${tr('Clipped text')}</h3><blockquote class="knowledge-clip-quote">${esc(d.clip)}</blockquote>`;
    html += `<h3 class="goal-details-label">${tr('Links')} · ${d.linkUrls.length}</h3><div class="habit-window-card knowledge-links">${d.linkUrls.map((url, index) => `<div class="knowledge-link-row">${linkHtml(context, url)}<button class="btn-icon" type="button" data-action="remove-knowledge-link" data-link-index="${index}" aria-label="${tr('Remove link')}"><i class="ph ph-x"></i></button></div>`).join('')}<div class="knowledge-link-add"><input id="knowledge-link" class="input" type="url" inputmode="url" autocomplete="off" placeholder="https://…" value="${esc(d.linkDraft)}" aria-label="${tr('New link')}"><button class="btn btn-secondary" type="button" data-action="add-knowledge-link">${tr('Add')}</button></div></div>`;
    const tags = context.state.tags.filter(tag => d.tagIds.includes(tag.id)).map(tag => tag.name).join(', ');
    const relations = resource ? RELATIONS.map(([field, label, collection]) => windowRow(context, 'knowledge-relations', 'ph-link-simple', tr(label), names(context, collection, d[field]), tr('None'), ` data-field="${field}"`)).join('') : '';
    html += `<h3 class="goal-details-label">${tr('Organization')}</h3><div class="habit-window-card">${windowRow(context, 'knowledge-tags', 'ph-tag', tr('Tags'), tags, tr('None'))}${relations}${windowRow(context, 'knowledge-clip', 'ph-quotes', tr('Clipped text'), d.clip ? tr('Added') : '', tr('None'))}</div>`;
    html += renderAttachmentsSection({ ownerType: type, ownerId: modalState.ownerId });
    if (isNew && modalState.pendingFiles.length) html += `<p class="sheet-note">${modalState.pendingFiles.map(file => esc(file.name)).join(' · ')} · ${tr('files are added when you save.')}</p>`;
    if (modalState.error) html += `<p class="validation" role="alert">${esc(modalState.error)}</p>`;
    if (isNew) html += `<div class="quick-sheet-footer"><span></span><button class="btn btn-primary habit-window-save" type="button" data-action="save-knowledge"${modalState.busy ? ' disabled' : ''}>${resource ? tr('Create resource') : tr('Create note')}</button></div>`;
    return modalFrame(`<div class="modal-inner quick-sheet knowledge-window">${html}</div>`, 'quick');
  }

  // The window's sheets. Each applies to the draft and, for a saved item, saves at once.
  let sheet = null;
  const sheetHead = (context, title) => `<div class="popover-title">${title}</div><p class="sheet-subtitle">${context.esc(context.modalState.draft.title.trim() || (context.modalState.ownerType === 'note' ? tr('New note') : tr('New resource')))}</p>`;
  const applyFooter = (action, left = '<span></span>') => `<div class="sheet-footer">${left}<button class="btn btn-primary" type="button" data-pop-action="${action}">${tr('Apply')}</button></div>`;
  function choiceSheet(context, title, action, options, current, attr = 'value') {
    const { esc } = context;
    return `${sheetHead(context, title)}<div class="sheet-card" role="radiogroup" aria-label="${title}">${options.map(([value, label]) => `<button class="popover-option sheet-option${current === value ? ' is-selected' : ''}" type="button" role="radio" aria-checked="${current === value}" data-pop-action="${action}" data-${attr === 'value' ? 'value' : 'area-id'}="${esc(value)}"><span class="sheet-option-label">${esc(label)}</span><span class="sheet-radio${current === value ? ' is-on' : ''}" aria-hidden="true"></span></button>`).join('')}</div>`;
  }
  function multiSheetHtml(context) {
    const { esc, state } = context;
    if (sheet.kind === 'tags') {
      return `${sheetHead(context, tr('Tags'))}<div class="sheet-card">${state.tags.map(tag => `<button class="popover-option sheet-option" type="button" data-pop-action="knowledge-tag-toggle" data-tag-id="${esc(tag.id)}" aria-pressed="${sheet.ids.includes(tag.id)}"><span class="tag-dot" style="--tag-color:${esc(tag.color)}" aria-hidden="true"></span><span class="sheet-option-label">${esc(tag.name)}</span><span class="sheet-check${sheet.ids.includes(tag.id) ? ' is-on' : ''}" aria-hidden="true"></span></button>`).join('') || `<p class="sheet-note">${tr('No tags yet. Create tags from the Tags section.')}</p>`}</div>${applyFooter('knowledge-tags-apply')}`;
    }
    const [, label, collection] = RELATIONS.find(([field]) => field === sheet.field);
    return `${sheetHead(context, tr(label))}<div class="sheet-card">${state[collection].map(item => `<button class="popover-option sheet-option" type="button" data-pop-action="knowledge-relation-toggle" data-id="${esc(item.id)}" aria-pressed="${sheet.ids.includes(item.id)}"><span class="sheet-option-label">${esc(item.title || item.name)}</span><span class="sheet-check${sheet.ids.includes(item.id) ? ' is-on' : ''}" aria-hidden="true"></span></button>`).join('') || `<p class="sheet-note">${tr('No items.')}</p>`}</div>${applyFooter('knowledge-relations-apply')}`;
  }
  const WINDOW_ACTIONS = new Set(['knowledge-window-favorite', 'knowledge-menu', 'knowledge-area', 'knowledge-set-area', 'knowledge-type', 'knowledge-set-type', 'knowledge-status', 'knowledge-set-status', 'knowledge-author', 'knowledge-author-apply', 'knowledge-reviewed', 'knowledge-reviewed-apply', 'knowledge-reviewed-clear', 'knowledge-tags', 'knowledge-tag-toggle', 'knowledge-tags-apply', 'knowledge-relations', 'knowledge-relation-toggle', 'knowledge-relations-apply', 'knowledge-clip', 'knowledge-clip-apply']);
  function handleWindowAction(action, el, context) {
    if (!WINDOW_ACTIONS.has(action) || context.modalState?.type !== 'knowledge') return false;
    const { esc } = context;
    readKnowledgeDraft(context);
    const dialog = context.modalState, d = dialog.draft, type = dialog.ownerType;
    const apply = mutate => { mutate(); sheet = null; commitKnowledge(context); context.closePopover(); return true; };
    if (action === 'knowledge-window-favorite') { d.favorite = !d.favorite; commitKnowledge(context); return true; }
    if (action === 'knowledge-menu') {
      if (dialog.ownerId) context.openPopover(el, `<button class="popover-option" type="button" style="color:var(--danger)" data-pop-action="delete-knowledge" data-owner-type="${type}" data-owner-id="${esc(dialog.ownerId)}"><i class="ph ph-trash"></i>${type === 'note' ? tr('Delete note') : tr('Delete resource')}</button>`, { type: 'knowledge-menu' });
      return true;
    }
    if (action === 'knowledge-area') {
      const areas = context.state.areas.filter(area => area.status === 'active' || area.id === d.areaId);
      context.openPopover(el, choiceSheet(context, tr('Area'), 'knowledge-set-area', [['', tr('No area')], ...areas.map(area => [area.id, area.name])], d.areaId || '', 'area'), { type: 'knowledge-area' });
      return true;
    }
    if (action === 'knowledge-set-area') return apply(() => { d.areaId = el.dataset.areaId || null; });
    if (action === 'knowledge-type') { context.openPopover(el, choiceSheet(context, tr('Type'), 'knowledge-set-type', Object.entries(RESOURCE_TYPES).map(([key, label]) => [key, tr(label)]), d.resourceType), { type: 'knowledge-type' }); return true; }
    if (action === 'knowledge-set-type') return apply(() => { d.resourceType = el.dataset.value; });
    if (action === 'knowledge-status') { context.openPopover(el, choiceSheet(context, tr('Reading status'), 'knowledge-set-status', Object.entries(RESOURCE_STATUSES).map(([key, label]) => [key, tr(label)]), d.resourceStatus), { type: 'knowledge-status' }); return true; }
    if (action === 'knowledge-set-status') return apply(() => { d.resourceStatus = el.dataset.value; });
    if (action === 'knowledge-author') { context.openPopover(el, `${sheetHead(context, tr('Author'))}<label class="sheet-field"><span>${tr('Author')}</span><input id="knowledge-author-value" class="input" maxlength="200" value="${esc(d.author)}" data-sheet-focus></label>${applyFooter('knowledge-author-apply')}`, { type: 'knowledge-author' }); return true; }
    if (action === 'knowledge-author-apply') return apply(() => { d.author = String(context.$('#knowledge-author-value')?.value ?? d.author).trim(); });
    if (action === 'knowledge-reviewed') { context.openPopover(el, `${sheetHead(context, tr('Last reviewed'))}<div class="sheet-chips"><button class="quick-chip" type="button" data-pop-action="knowledge-reviewed-apply" data-date="${context.Core.dateOnly()}">${tr('Today')}</button></div><label class="sheet-field"><i class="ph ph-calendar-blank" aria-hidden="true"></i><span>${tr('Date')}</span><input id="knowledge-reviewed-value" class="input" type="date" value="${esc(d.reviewedAt)}"></label>${applyFooter('knowledge-reviewed-apply', `<button class="btn btn-ghost" type="button" data-pop-action="knowledge-reviewed-clear">${tr('Clear')}</button>`)}`, { type: 'knowledge-reviewed' }); return true; }
    if (action === 'knowledge-reviewed-apply') return apply(() => { d.reviewedAt = el.dataset.date || String(context.$('#knowledge-reviewed-value')?.value || ''); });
    if (action === 'knowledge-reviewed-clear') return apply(() => { d.reviewedAt = ''; });
    if (action === 'knowledge-tags') { sheet = { kind: 'tags', ids: [...d.tagIds] }; context.openPopover(el, multiSheetHtml(context), { type: 'knowledge-tags' }); return true; }
    if (action === 'knowledge-relations') {
      if (type !== 'resource' || !RELATIONS.some(([field]) => field === el.dataset.field)) return true;
      sheet = { kind: 'relations', field: el.dataset.field, ids: [...d[el.dataset.field]] }; context.openPopover(el, multiSheetHtml(context), { type: 'knowledge-relations' }); return true;
    }
    if ((action === 'knowledge-tag-toggle' || action === 'knowledge-relation-toggle') && sheet) {
      const id = action === 'knowledge-tag-toggle' ? el.dataset.tagId : el.dataset.id;
      sheet.ids = sheet.ids.includes(id) ? sheet.ids.filter(item => item !== id) : [...sheet.ids, id];
      context.refreshSheet(multiSheetHtml(context)); return true;
    }
    if (action === 'knowledge-tags-apply' && sheet?.kind === 'tags') { const ids = sheet.ids; return apply(() => { d.tagIds = ids; }); }
    if (action === 'knowledge-relations-apply' && sheet?.kind === 'relations') { const { field, ids } = sheet; return apply(() => { d[field] = ids; }); }
    if (action === 'knowledge-clip') { context.openPopover(el, `${sheetHead(context, tr('Clipped text'))}<label class="sheet-field sheet-field-stack"><span>${tr('Clipped text')}</span><textarea id="knowledge-clip-value" class="input" rows="5" placeholder="${type === 'note' ? tr('Paste an excerpt to keep with this note…') : tr('Paste an excerpt to keep with this resource…')}" data-sheet-focus>${esc(d.clip)}</textarea></label>${applyFooter('knowledge-clip-apply')}`, { type: 'knowledge-clip' }); return true; }
    if (action === 'knowledge-clip-apply') return apply(() => { d.clip = String(context.$('#knowledge-clip-value')?.value ?? d.clip); });
    return true;
  }

  window.TodoDomainModules?.register({
    name: 'knowledge',
    renderRoute(route, context) {
      if (route.type === 'notes' || route.type === 'resources') return renderKnowledgeList(context, route.type === 'notes' ? 'note' : 'resource');
      // R10b: app.js opens the window on top of the list.
      if (route.type === 'note' || route.type === 'resource') return renderKnowledgeList(context, route.type);
      if (route.type === 'modal' && route.modalType === 'knowledge') return renderKnowledgeModal(context);
    },
    handleAction(action, event, context) {
      // Attachment selection/drop must capture the draft before app.js rerenders.
      if (action === 'read-knowledge-draft') { readKnowledgeDraft(context); return true; }
      if (action === 'open-knowledge') { openKnowledgeModal(context, event?.ownerType, event?.ownerId || null); return true; }
      const el = event?.target.closest('[data-action], [data-pop-action]');
      if (!el) return false;
      if (handleWindowAction(action, el, context)) return true;
      if (action === 'new-knowledge') openKnowledgeModal(context, el.dataset.ownerType, null, el.dataset.areaId, { inbox: Boolean(el.closest?.('#mobile-quick-add-menu')) });
      else if (action === 'save-knowledge') saveKnowledge(context);
      else if (action === 'toggle-knowledge-favorite') {
        const owner = context.attachmentOwner({ ownerType: el.dataset.ownerType, ownerId: el.dataset.ownerId });
        if (!owner || !['note', 'resource'].includes(el.dataset.ownerType)) return true;
        const previous = { favorite: owner.item.favorite, updatedAt: owner.item.updatedAt };
        owner.item.favorite = !owner.item.favorite; owner.item.updatedAt = context.nowIso();
        if (!context.saveState()) { Object.assign(owner.item, previous); context.setToastMessage(tr('Favorite could not be saved locally. Try again.')); }
        context.render();
      }
      else if (action === 'knowledge-favorite-filter') setFilter(context, el.dataset.ownerType, 'favorite', context.state.ui.knowledgeFilters?.[el.dataset.ownerType]?.favorite === 'true' ? '' : 'true');
      else if (action === 'knowledge-filter') openFilterSheet(context, el, el.dataset.ownerType, el.dataset.field);
      else if (action === 'knowledge-set-filter') setFilter(context, el.dataset.ownerType, el.dataset.field, el.dataset.value);
      else if (action === 'clear-knowledge-filters') {
        if (!['note', 'resource'].includes(el.dataset.ownerType)) return true;
        if (context.state.ui.knowledgeFilters) delete context.state.ui.knowledgeFilters[el.dataset.ownerType];
        context.saveAndRender();
      }
      else if (action === 'add-knowledge-link') addKnowledgeLink(context);
      else if (action === 'remove-knowledge-link' && context.modalState?.type === 'knowledge') { readKnowledgeDraft(context); context.modalState.draft.linkUrls.splice(Number(el.dataset.linkIndex), 1); commitKnowledge(context); }
      else if (action === 'delete-knowledge') { context.closePopover(); context.requestDeleteEntity(el.dataset.ownerType, el.dataset.ownerId); }
      else return false;
      return true;
    },
    handleInput(event, context) {
      const dialog = context.modalState;
      if (dialog?.type !== 'knowledge') return false;
      const id = event.target?.id;
      if (event.type === 'keydown') {
        if (id !== 'knowledge-link' || event.key !== 'Enter') return false;
        event.preventDefault(); addKnowledgeLink(context); return true;
      }
      if (!['input', 'change'].includes(event.type)) return false;
      const d = dialog.draft;
      if (id === 'knowledge-link') { d.linkDraft = event.target.value; return true; }
      if (id !== 'knowledge-title' && id !== 'knowledge-text') return false;
      if (id === 'knowledge-title') d.title = event.target.value; else d.text = event.target.value;
      const item = dialog.ownerId ? context.attachmentOwner({ ownerType: dialog.ownerType, ownerId: dialog.ownerId })?.item : null;
      if (!item || item !== dialog.source) return true;
      // A saved item takes the name and the text as they are typed and saves after a short pause.
      if (id === 'knowledge-title') {
        const title = d.title.trim();
        if (title) {
          item.title = title; item.updatedAt = context.nowIso(); context.scheduleTextSave();
          if (dialog.errorField === 'title') { dialog.error = ''; dialog.errorField = ''; context.$('#modal-root .knowledge-window .validation')?.remove?.(); event.target.classList?.remove('is-error'); }
        } else if (event.type === 'change') { dialog.error = dialog.ownerType === 'note' ? tr('Note needs a Name.') : tr('Resource needs a Name.'); dialog.errorField = 'title'; context.renderModal(); }
      } else {
        item[dialog.ownerType === 'note' ? 'body' : 'description'] = d.text; item.updatedAt = context.nowIso(); context.scheduleTextSave();
      }
      if (event.type === 'change') context.render();
      return true;
    }
  });
})();
