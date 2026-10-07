(function () {
  'use strict';

  const knowledgeLabel = type => type === 'note' ? 'Note' : 'Resource';
  const knowledgeIcon = type => type === 'note' ? 'ph-note' : 'ph-link';
  const RESOURCE_TYPES = { book: 'Book', video: 'Video', article: 'Article', course: 'Course', document: 'Document', other: 'Other' };
  const RESOURCE_STATUSES = { unread: 'Unread', reading: 'Reading', completed: 'Completed' };

  function favoriteButton(context, type, item) {
    return `<button class="btn-icon knowledge-favorite ${item.favorite ? 'is-favorite' : ''}" type="button" data-action="toggle-knowledge-favorite" data-owner-type="${type}" data-owner-id="${context.esc(item.id)}" aria-label="${item.favorite ? 'Remove from favorites' : 'Add to favorites'}" aria-pressed="${Boolean(item.favorite)}"><i class="${item.favorite ? 'ph-fill ph-star' : 'ph ph-star'}"></i></button>`;
  }

  function selectOptions(context, options, value) {
    return Object.entries(options).map(([key, label]) => `<option value="${context.esc(key)}" ${value === key ? 'selected' : ''}>${context.esc(label)}</option>`).join('');
  }

  function renderAreaKnowledge(context, areaId) {
    const { state, knowledgeCollection, esc } = context;
    let html = '';
    for (const type of ['note', 'resource']) {
      const items = state[knowledgeCollection(type)].filter(item => item.areaId === areaId);
      html += `<section class="section area-detail-section"><div class="section-header"><h2 class="section-label">${knowledgeCollection(type) === 'notes' ? 'Notes' : 'Resources'}</h2><span class="section-count">${items.length}</span></div>${items.length ? items.map(item => renderKnowledgeRow(context, type, item)).join('') : `<p class="area-empty-copy">No ${knowledgeCollection(type)} in this Area.</p>`}<button class="inline-add" type="button" data-action="new-knowledge" data-owner-type="${type}" data-area-id="${esc(areaId)}"><i class="ph ph-plus"></i> New ${type}</button></section>`;
    }
    return html;
  }

  function renderKnowledgeRow(context, type, item) {
    const { esc, getArea, state } = context;
    const areaName = getArea(item.areaId)?.name || 'No area';
    const tags = (item.tagIds || []).map(id => state.tags.find(tag => tag.id === id)).filter(Boolean);
    const metadata = type === 'resource' ? `<span>${esc(RESOURCE_TYPES[item.type] || 'Article')} · ${esc(RESOURCE_STATUSES[item.status] || 'Unread')}</span>${item.author ? `<span>${esc(item.author)}</span>` : ''}` : '';
    return `<article class="goal-row knowledge-row"><button class="goal-open knowledge-open" type="button" data-route="${type}/${esc(item.id)}"><span class="knowledge-row-title"><i class="ph ${knowledgeIcon(type)}"></i><strong>${esc(item.title)}</strong></span><span class="knowledge-row-meta">${metadata}<span><i class="ph ph-map-pin"></i>${esc(areaName)}</span><span><i class="ph ph-link"></i>${item.linkUrls.length} ${item.linkUrls.length === 1 ? 'link' : 'links'}</span><span><i class="ph ph-paperclip"></i>${item.attachmentIds.length} ${item.attachmentIds.length === 1 ? 'file' : 'files'}</span>${tags.length ? `<span class="knowledge-row-tags">${tags.map(tag => `<em style="--tag-color:${esc(tag.color)}">${esc(tag.name)}</em>`).join('')}</span>` : ''}</span></button>${favoriteButton(context, type, item)}<button class="btn-icon" type="button" data-action="edit-knowledge" data-owner-type="${type}" data-owner-id="${esc(item.id)}" aria-label="Edit ${type}"><i class="ph ph-pencil-simple"></i></button></article>`;
  }

  function renderKnowledgeList(context, type) {
    const { state, knowledgeCollection, pageHeader } = context;
    const filters = state.ui.knowledgeFilters?.[type] || {};
    const collection = state[knowledgeCollection(type)];
    const items = collection.filter(item => (!filters.type || item.type === filters.type)
      && (!filters.status || item.status === filters.status)
      && (filters.favorite !== 'true' || item.favorite === true)
      && (!filters.areaId || (filters.areaId === '__none' ? !item.areaId : item.areaId === filters.areaId))
      && (!filters.tagId || (item.tagIds || []).includes(filters.tagId)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const label = type === 'note' ? 'Notes' : 'Resources';
    const filter = (field, label, options) => `<label class="field-label">${label}<select class="input" data-knowledge-filter="${field}" data-owner-type="${type}">${selectOptions(context, options, filters[field] || '')}</select></label>`;
    const controls = `<div class="knowledge-filters v17-mobile-filter" aria-label="${label} filters">${type === 'resource' ? filter('type', 'Type', { '': 'All types', ...RESOURCE_TYPES }) + filter('status', 'Reading status', { '': 'All statuses', ...RESOURCE_STATUSES }) : ''}${filter('favorite', 'Favorites', { '': 'All items', true: 'Favorites only' })}${filter('areaId', 'Area', { '': 'All areas', __none: 'No area', ...Object.fromEntries(state.areas.map(area => [area.id, area.name])) })}${filter('tagId', 'Tag', { '': 'All tags', ...Object.fromEntries(state.tags.map(tag => [tag.id, tag.name])) })}<button class="btn btn-ghost" type="button" data-action="clear-knowledge-filters" data-owner-type="${type}">Clear filters</button></div>`;
    return pageHeader(label, `${items.length} of ${collection.length} ${knowledgeCollection(type)}`, { add: false, actionHtml: `<button class="btn btn-primary" type="button" data-action="new-knowledge" data-owner-type="${type}"><i class="ph ph-plus"></i> New ${type}</button>` }) + controls + `<section class="section knowledge-list v17-knowledge-list">${items.length ? items.map(item => renderKnowledgeRow(context, type, item)).join('') : `<p class="area-empty-copy knowledge-empty v17-empty-state">${collection.length ? 'No items match these filters.' : `No ${label.toLowerCase()} yet. Create one to keep its links, files, and Area context together.`}</p>`}</section>`;
  }

  function knowledgeLinks(context, urls) {
    const { esc } = context;
    return urls.map(url => {
      let safe = false;
      try { safe = ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol); } catch (_) {}
      return safe ? `<a class="area-object knowledge-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><i class="ph ph-arrow-square-out"></i><span>${esc(url)}</span></a>` : `<span class="area-object knowledge-link"><i class="ph ph-link"></i><span>${esc(url)}</span></span>`;
    }).join('');
  }

  function renderKnowledgeDetail(context, type, id) {
    const { state, attachmentOwner, knowledgeAttachmentCache, readOwnerAttachments, currentRoute, renderMain, pageHeader, getArea, esc, renderAttachmentRow } = context;
    const owner = attachmentOwner({ ownerType: type, ownerId: id });
    if (!owner) return renderKnowledgeList(context, type);
    const item = owner.item, key = type + ':' + id, signature = JSON.stringify(item.attachmentIds);
    let cached = knowledgeAttachmentCache.get(key);
    if (!cached || cached.item !== item || cached.signature !== signature) {
      cached = { item, signature, records: [], attachmentState: item.attachmentIds.length ? 'loading' : 'empty' };
      knowledgeAttachmentCache.set(key, cached);
      readOwnerAttachments(owner).then(records => { cached.records = records; cached.attachmentState = records.length ? 'ready' : 'empty'; }).catch(error => { console.error(error); cached.attachmentState = 'error'; }).finally(() => {
        if (knowledgeAttachmentCache.get(key) === cached && context.state && currentRoute().type === type && currentRoute().id === id) renderMain();
      });
    }
    const areaName = getArea(item.areaId)?.name || 'No area';
    const attachmentMessage = cached.attachmentState === 'loading' ? 'Loading attachments…' : cached.attachmentState === 'error' ? 'Attachments are unavailable in this browser.' : cached.attachmentState === 'empty' ? 'No files attached yet.' : '';
    let html = pageHeader(item.title, `${knowledgeLabel(type)} · ${areaName}`, { add: false, actionHtml: `<button class="btn btn-secondary" type="button" data-action="edit-knowledge" data-owner-type="${type}" data-owner-id="${esc(id)}"><i class="ph ph-pencil-simple"></i> Edit</button>` });
    html += `<div class="knowledge-detail-metadata">${favoriteButton(context, type, item)}${type === 'resource' ? `<span>${esc(RESOURCE_TYPES[item.type] || 'Article')}</span><span>${esc(RESOURCE_STATUSES[item.status] || 'Unread')}</span><span>${item.author ? `By ${esc(item.author)}` : 'No author'}</span><span>${item.reviewedAt ? `Last reviewed ${esc(item.reviewedAt)}` : 'Not reviewed yet'}</span>` : ''}</div>`;
    if (item.clip) html += `<section class="section knowledge-clip"><h2 class="section-label">Clipped text</h2><blockquote>${esc(item.clip)}</blockquote></section>`;
    html += `<section class="section knowledge-summary"><div class="knowledge-context"><i class="ph ph-map-pin"></i><span>Area</span><strong>${esc(areaName)}</strong></div><div class="knowledge-body">${esc(type === 'note' ? item.body : item.description) || '<span class="area-empty-copy">No text yet.</span>'}</div></section><section class="section knowledge-links-section"><div class="section-header"><h2 class="section-label">Linked URLs</h2><span class="section-count">${item.linkUrls.length}</span></div><div class="area-object-list">${knowledgeLinks(context, item.linkUrls) || '<p class="area-empty-copy">No links added yet.</p>'}</div></section>`;
    if (type === 'resource') for (const [field, label, collection, route] of [['relatedTaskIds', 'Tasks', 'tasks', null], ['relatedProjectIds', 'Projects', 'projects', 'project'], ['relatedGoalIds', 'Goals', 'goals', 'goal'], ['relatedHabitIds', 'Habits', 'habits', 'habit']]) {
      const related = state[collection].filter(candidate => item[field].includes(candidate.id));
      html += `<section class="section knowledge-relations-section"><div class="section-header"><h2 class="section-label">Related ${label}</h2><span class="section-count">${related.length}</span></div><div class="area-object-list">${related.map(candidate => `<button class="area-object" type="button" ${route ? `data-route="${route}/${esc(candidate.id)}"` : `data-action="open-task" data-task-id="${esc(candidate.id)}"`}>${esc(candidate.title || candidate.name)}</button>`).join('') || `<p class="area-empty-copy">No related ${label.toLowerCase()}.</p>`}</div></section>`;
    }
    return html + `<section class="section knowledge-attachments-section"><div class="section-header"><h2 class="section-label">Attached files</h2><span class="section-count">${item.attachmentIds.length}</span></div>${attachmentMessage ? `<p class="attachment-message knowledge-attachment-message is-${cached.attachmentState}" role="status">${esc(attachmentMessage)}</p>` : ''}<div class="attachment-list">${cached.records.map(record => renderAttachmentRow(record, { ownerType: type, ownerId: id })).join('')}</div></section><button class="danger-link" type="button" data-action="delete-knowledge" data-owner-type="${type}" data-owner-id="${esc(id)}"><i class="ph ph-trash"></i> Delete ${type}</button>`;
  }

  function openKnowledgeModal(context, type, id = null, areaId = null, options = {}) {
    const { attachmentOwner, closePopover, flushTextSave, goalFocusTarget, renderModal, $, loadOwnerAttachments } = context;
    if (!['note', 'resource'].includes(type)) return;
    const owner = id && attachmentOwner({ ownerType: type, ownerId: id });
    if (id && !owner) return;
    closePopover(); flushTextSave();
    const item = owner?.item;
    context.setModalState({ type: 'knowledge', ownerType: type, ownerId: id, source: item || null, inbox: Boolean(options.inbox), returnFocus: goalFocusTarget(), error: '', attachmentRecords: [], attachmentMessage: '', pendingFiles: [],
      draft: { title: item?.title || '', text: (type === 'note' ? item?.body : item?.description) || '', areaId: item?.areaId || areaId || null, linkUrls: [...(item?.linkUrls || [])], linkDraft: '',
        tagIds: [...(item?.tagIds || [])],
        favorite: item?.favorite === true, clip: item?.clip || '',
        resourceType: item?.type || 'article', resourceStatus: item?.status || 'unread', author: item?.author || '', reviewedAt: item?.reviewedAt || '',
        relatedTaskIds: [...(item?.relatedTaskIds || [])], relatedProjectIds: [...(item?.relatedProjectIds || [])], relatedGoalIds: [...(item?.relatedGoalIds || [])], relatedHabitIds: [...(item?.relatedHabitIds || [])] } });
    renderModal(); requestAnimationFrame(() => $('#knowledge-title')?.focus());
    if (id) loadOwnerAttachments({ ownerType: type, ownerId: id });
  }

  function readKnowledgeDraft(context) {
    const { modalState, $, $$ } = context;
    if (modalState?.type !== 'knowledge') return;
    const d = modalState.draft;
    d.title = $('#knowledge-title')?.value ?? d.title;
    d.text = $('#knowledge-text')?.value ?? d.text;
    d.clip = $('#knowledge-clip')?.value ?? d.clip;
    d.favorite = $('#knowledge-favorite')?.checked ?? d.favorite;
    if (modalState.ownerType === 'resource') {
      d.resourceType = $('#knowledge-resource-type')?.value ?? d.resourceType;
      d.resourceStatus = $('#knowledge-resource-status')?.value ?? d.resourceStatus;
      d.author = $('#knowledge-author')?.value ?? d.author;
      d.reviewedAt = $('#knowledge-reviewed-at')?.value ?? d.reviewedAt;
    }
    d.areaId = $('#knowledge-area')?.value || null;
    d.linkDraft = $('#knowledge-link')?.value ?? d.linkDraft;
    d.tagIds = $$('[data-knowledge-tag]:checked').map(input => input.value);
    if (modalState.ownerType === 'resource') for (const field of ['relatedTaskIds', 'relatedProjectIds', 'relatedGoalIds', 'relatedHabitIds'])
      d[field] = $$(`[data-knowledge-relation="${field}"]:checked`).map(input => input.value);
  }

  function addKnowledgeLink(context) {
    const { modalState, renderModal, $ } = context;
    readKnowledgeDraft(context);
    const d = modalState.draft, value = d.linkDraft.trim();
    if (!value) { modalState.error = 'Enter a link before adding it.'; renderModal(); requestAnimationFrame(() => $('#knowledge-link')?.focus()); return false; }
    const checked = context.Core.validateKnowledgeRecord({ type: modalState.ownerType, title: 'Link', linkUrls: [value], attachmentIds: ['pending-link'] });
    const url = checked.normalized.linkUrls[0];
    if (!url || d.linkUrls.includes(url)) { modalState.error = url ? 'This link has already been added.' : 'Use a valid web or email link.'; renderModal(); requestAnimationFrame(() => $('#knowledge-link')?.focus()); return false; }
    d.linkUrls.push(url); d.linkDraft = ''; modalState.error = '';
    renderModal(); requestAnimationFrame(() => $('#knowledge-link')?.focus()); return true;
  }

  async function saveKnowledge(context) {
    const { state, undoHold, modalState, renderModal, getArea, attachmentOwner, nowIso, uid, copyTemplate, knowledgeCollection, saveState, addAttachments, closeModal, navigate, setToastMessage } = context;
    if (!state || undoHold || modalState?.type !== 'knowledge' || modalState.busy) return;
    readKnowledgeDraft(context);
    const dialog = modalState, type = dialog.ownerType, d = dialog.draft;
    if (d.linkDraft.trim() && !addKnowledgeLink(context)) return;
    const existingAttachmentIds = dialog.ownerId ? (attachmentOwner({ ownerType: type, ownerId: dialog.ownerId })?.item.attachmentIds || []) : [];
    const checked = context.Core.validateKnowledgeRecord({ type, title: d.title, linkUrls: d.linkUrls, attachmentIds: [...existingAttachmentIds, ...dialog.pendingFiles.map((_, index) => `pending-${index}`)] });
    if (!checked.valid) {
      dialog.error = checked.errors.includes('title') ? `${knowledgeLabel(type)} needs a Name.`
        : checked.errors.includes('linkUrls') ? 'Use valid web or email links.'
          : `${knowledgeLabel(type)} needs at least one URL, image, or attached file.`;
      renderModal(); return;
    }
    if (d.areaId && !getArea(d.areaId)) { dialog.error = 'The selected Area no longer exists.'; renderModal(); return; }
    if (dialog.ownerId && attachmentOwner({ ownerType: type, ownerId: dialog.ownerId })?.item !== dialog.source) { dialog.error = 'The item changed. Reopen it before saving.'; renderModal(); return; }
    if (type === 'resource' && (!Object.hasOwn(RESOURCE_TYPES, d.resourceType) || !Object.hasOwn(RESOURCE_STATUSES, d.resourceStatus)
      || d.reviewedAt && (!context.Core.parseDateOnly(d.reviewedAt) || context.Core.dateOnly(context.Core.parseDateOnly(d.reviewedAt)) !== d.reviewedAt))) {
      dialog.error = 'Choose a valid type, reading status and review date.'; renderModal(); return;
    }
    const isNew = !dialog.source;
    const ts = nowIso(), item = dialog.source || { id: uid(type), createdAt: ts, attachmentIds: [] }, previous = copyTemplate(item);
    Object.assign(item, { title: checked.normalized.title, areaId: d.areaId, tagIds: [...new Set(d.tagIds || [])], linkUrls: checked.normalized.linkUrls, updatedAt: ts, [type === 'note' ? 'body' : 'description']: d.text });
    if (isNew) item.isInbox = Boolean(dialog.inbox);
    Object.assign(item, { favorite: Boolean(d.favorite), clip: d.clip || '' });
    if (type === 'resource') Object.assign(item, { type: d.resourceType, status: d.resourceStatus, author: d.author.trim(), reviewedAt: d.reviewedAt || null });
    if (type === 'resource') for (const [field, collection] of [['relatedTaskIds', 'tasks'], ['relatedProjectIds', 'projects'], ['relatedGoalIds', 'goals'], ['relatedHabitIds', 'habits']]) {
      if (d[field].some(id => !state[collection].some(candidate => candidate.id === id))) { Object.assign(item, previous); dialog.error = 'A related item changed. Reopen this Resource before saving.'; renderModal(); return; }
      item[field] = [...d[field]];
    }
    const deferInitialSave = Boolean(isNew && !checked.normalized.linkUrls.length && dialog.pendingFiles.length);
    if (isNew) state[knowledgeCollection(type)].push(item);
    if (!deferInitialSave && !saveState()) {
      if (dialog.source) Object.assign(item, previous); else state[knowledgeCollection(type)].splice(state[knowledgeCollection(type)].indexOf(item), 1);
      dialog.error = 'Changes could not be saved locally. Try again.'; renderModal(); return;
    }
    dialog.busy = true;
    dialog.ownerId = item.id; dialog.source = item;
    const attachmentResult = dialog.pendingFiles.length ? await addAttachments({ ownerType: type, ownerId: item.id, deferSave: deferInitialSave }, dialog.pendingFiles) : null;
    const fileMessage = typeof attachmentResult === 'string' ? attachmentResult : attachmentResult?.message || '';
    if (isNew && !checked.normalized.linkUrls.length && dialog.pendingFiles.length && !attachmentResult?.added && !item.attachmentIds.length) {
      state[knowledgeCollection(type)].splice(state[knowledgeCollection(type)].indexOf(item), 1);
      dialog.ownerId = null; dialog.source = null; dialog.busy = false;
      dialog.error = `Attachment upload failed. This ${knowledgeLabel(type)} could not be stored because it needs a URL, image, or attached file.`;
      renderModal(); return;
    }
    if (deferInitialSave && !saveState()) {
      state[knowledgeCollection(type)].splice(state[knowledgeCollection(type)].indexOf(item), 1);
      dialog.ownerId = null; dialog.source = null; dialog.busy = false;
      dialog.error = `This ${knowledgeLabel(type)} could not be stored locally. Try again.`;
      renderModal(); return;
    }
    if (context.modalState === dialog) { closeModal(); navigate(type + '/' + item.id); }
    if (fileMessage) setToastMessage(fileMessage);
  }

  function renderKnowledgeMetadataFields(context, type, draft) {
    const { esc } = context;
    const resourceFields = type === 'resource' ? `<div class="knowledge-metadata-grid"><label class="field-label">Type<select id="knowledge-resource-type" class="input">${selectOptions(context, RESOURCE_TYPES, draft.resourceType)}</select></label><label class="field-label">Reading status<select id="knowledge-resource-status" class="input">${selectOptions(context, RESOURCE_STATUSES, draft.resourceStatus)}</select></label><label class="field-label">Author<input id="knowledge-author" class="input" maxlength="200" value="${esc(draft.author)}"></label><label class="field-label">Last reviewed<input id="knowledge-reviewed-at" class="input" type="date" value="${esc(draft.reviewedAt)}"></label></div>` : '';
    return `${resourceFields}<label class="knowledge-favorite-field"><input id="knowledge-favorite" type="checkbox" ${draft.favorite ? 'checked' : ''}> Favorite</label><label class="field-label">Clipped text<textarea id="knowledge-clip" class="input" rows="4" placeholder="Paste an excerpt to keep with this ${type}…">${esc(draft.clip)}</textarea></label>`;
  }

  function renderKnowledgeModal(context) {
    const { state, modalState, esc, modalFrame, renderAttachmentsSection } = context;
    const type = modalState.ownerType, d = modalState.draft;
    const relations = type === 'resource' ? [['relatedTaskIds', 'Tasks', 'tasks'], ['relatedProjectIds', 'Projects', 'projects'], ['relatedGoalIds', 'Goals', 'goals'], ['relatedHabitIds', 'Habits', 'habits']].map(([field, label, collection]) => `<details><summary class="field-label">Related ${label} · ${d[field].length}</summary><div class="form-stack">${state[collection].map(item => `<label><input type="checkbox" data-knowledge-relation="${field}" value="${esc(item.id)}" ${d[field].includes(item.id) ? 'checked' : ''}> ${esc(item.title || item.name)}</label>`).join('') || '<p class="area-empty-copy">No items.</p>'}</div></details>`).join('') : '';
    const tagPicker = renderKnowledgeMetadataFields(context, type, d) + `<details><summary class="field-label">Tags · ${d.tagIds.length}</summary><div class="knowledge-tag-picker">${state.tags.length ? state.tags.map(tag => `<label><input type="checkbox" data-knowledge-tag value="${esc(tag.id)}" ${d.tagIds.includes(tag.id) ? 'checked' : ''}><span class="tag-dot" style="--tag-color:${esc(tag.color)}"></span>${esc(tag.name)}</label>`).join('') : '<p class="area-empty-copy">No tags yet. Create tags from the Tags section.</p>'}</div></details>`;
    return modalFrame(`<div class="modal-inner"><div class="modal-header"><h2 class="modal-title">${modalState.ownerId ? 'Edit' : 'New'} ${type}</h2><button class="btn-icon" type="button" data-action="close-modal" aria-label="Close"><i class="ph ph-x"></i></button></div><div class="form-stack"><label class="field-label">Name<input id="knowledge-title" class="input" maxlength="120" value="${esc(d.title)}"></label><label class="field-label">Area<select id="knowledge-area" class="input"><option value="">No area</option>${state.areas.filter(area => area.status === 'active' || area.id === d.areaId).map(area => `<option value="${esc(area.id)}" ${area.id === d.areaId ? 'selected' : ''}>${esc(area.name)}</option>`).join('')}</select></label><label class="field-label">${type === 'note' ? 'Body' : 'Description'}<textarea id="knowledge-text" class="input" rows="6">${esc(d.text)}</textarea></label>${tagPicker}<p class="form-hint">${knowledgeLabel(type)}s need a Name and at least one URL, image, or attached file.</p><div class="field-label">Links</div>${d.linkUrls.map((url, index) => `<div class="attachment-row"><span class="attachment-main knowledge-link">${esc(url)}</span><button class="btn-icon" type="button" data-action="remove-knowledge-link" data-link-index="${index}" aria-label="Remove link"><i class="ph ph-x"></i></button></div>`).join('')}<label class="field-label" for="knowledge-link">Add link</label><input id="knowledge-link" class="input" type="text" value="${esc(d.linkDraft)}" placeholder="https://…"><button class="btn btn-secondary" type="button" data-action="add-knowledge-link">Add link</button>${relations}${renderAttachmentsSection({ ownerType: type, ownerId: modalState.ownerId })}${!modalState.ownerId && modalState.pendingFiles.length ? `<p class="area-empty-copy">${modalState.pendingFiles.map(file => esc(file.name)).join(' · ')} · files are added when you save.</p>` : ''}${modalState.error ? `<p class="validation" role="alert">${esc(modalState.error)}</p>` : ''}</div><div class="modal-footer"><span></span><div class="modal-footer-actions"><button class="btn btn-ghost" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="button" data-action="save-knowledge" ${modalState.busy ? 'disabled' : ''}>${modalState.ownerId ? 'Save changes' : 'Create ' + type}</button></div></div></div>`, 'quick');
  }

  window.TodoDomainModules?.register({
    name: 'knowledge',
    renderRoute(route, context) {
      if (route.type === 'notes' || route.type === 'resources') return renderKnowledgeList(context, route.type === 'notes' ? 'note' : 'resource');
      if (route.type === 'note' || route.type === 'resource') return renderKnowledgeDetail(context, route.type, route.id);
      // Internal render requests keep Area composition and overlay ownership in app.js.
      if (route.type === 'area-knowledge') return renderAreaKnowledge(context, route.id);
      if (route.type === 'modal' && route.modalType === 'knowledge') return renderKnowledgeModal(context);
    },
    handleAction(action, event, context) {
      // Attachment selection/drop must capture the draft before app.js rerenders.
      if (action === 'read-knowledge-draft') { readKnowledgeDraft(context); return true; }
      const el = event?.target.closest('[data-action]');
      if (!el) return false;
      if (action === 'new-knowledge') openKnowledgeModal(context, el.dataset.ownerType, null, el.dataset.areaId, { inbox: Boolean(el.closest?.('#mobile-quick-add-menu')) });
      else if (action === 'edit-knowledge') openKnowledgeModal(context, el.dataset.ownerType, el.dataset.ownerId);
      else if (action === 'save-knowledge') saveKnowledge(context);
      else if (action === 'toggle-knowledge-favorite') {
        const owner = context.attachmentOwner({ ownerType: el.dataset.ownerType, ownerId: el.dataset.ownerId });
        if (!owner || !['note', 'resource'].includes(el.dataset.ownerType)) return true;
        const previous = { favorite: owner.item.favorite, updatedAt: owner.item.updatedAt };
        owner.item.favorite = !owner.item.favorite; owner.item.updatedAt = context.nowIso();
        if (!context.saveState()) { Object.assign(owner.item, previous); context.setToastMessage('Favorite could not be saved locally. Try again.'); }
        context.render();
      }
      else if (action === 'clear-knowledge-filters') {
        if (!['note', 'resource'].includes(el.dataset.ownerType)) return true;
        if (context.state.ui.knowledgeFilters) delete context.state.ui.knowledgeFilters[el.dataset.ownerType];
        context.saveAndRender();
      }
      else if (action === 'add-knowledge-link') addKnowledgeLink(context);
      else if (action === 'remove-knowledge-link') { readKnowledgeDraft(context); context.modalState.draft.linkUrls.splice(Number(el.dataset.linkIndex), 1); context.modalState.error = ''; context.renderModal(); }
      else if (action === 'delete-knowledge') context.requestDeleteEntity(el.dataset.ownerType, el.dataset.ownerId);
      else return false;
      return true;
    },
    handleInput(event, context) {
      if (event.type === 'change' && event.target.dataset.knowledgeFilter) {
        const { ownerType, knowledgeFilter } = event.target.dataset;
        if (!['note', 'resource'].includes(ownerType) || !['type', 'status', 'favorite', 'areaId', 'tagId'].includes(knowledgeFilter)) return false;
        const filters = context.state.ui.knowledgeFilters ||= {};
        filters[ownerType] ||= {};
        filters[ownerType][knowledgeFilter] = event.target.value;
        context.saveAndRender();
        requestAnimationFrame(() => context.$(`[data-knowledge-filter="${knowledgeFilter}"][data-owner-type="${ownerType}"]`)?.focus());
        return true;
      }
      if (context.modalState?.type !== 'knowledge') return false;
      if (event.type === 'keydown') {
        if (event.target?.id !== 'knowledge-link' || event.key !== 'Enter') return false;
        event.preventDefault(); addKnowledgeLink(context); return true;
      }
      if ((event.type === 'input' || event.type === 'change') && (event.target.id.startsWith('knowledge-') || event.target.dataset.knowledgeRelation || event.target.dataset.knowledgeTag)) {
        readKnowledgeDraft(context); return true;
      }
      return false;
    }
  });
})();
